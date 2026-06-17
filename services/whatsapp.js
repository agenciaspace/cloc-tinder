/* ---------------------------------------------------------------------------
   Integração com o uazapi:
     - buscar membros do grupo  (POST /group/info)
     - enviar código de verificação (POST /send/text)
     - sincronizar a lista de membros para o cache no banco
     - agendar a sincronização (boot + intervalo)
   --------------------------------------------------------------------------- */
const config = require('../config/whatsapp');
const phone = require('./phone');
const db = require('../models/db');

const TIMEOUT_MS = 15000;

// Datas (America/Sao_Paulo, YYYY-MM-DD) em que NÃO postamos o digest automático
// — usado quando já houve um comunicado manual no grupo naquele dia, pra não
// duplicar. Auto-expira: passada a data, a verificação simplesmente não casa.
// Pode-se acrescentar datas via env DIGEST_SKIP_DATES (lista separada por vírgula).
const DIGEST_SKIP_DATES = new Set([
  '2026-06-17', // comunicado manual de novidades/boas-vindas enviado neste dia
  ...(process.env.DIGEST_SKIP_DATES || '').split(',').map((s) => s.trim()).filter(Boolean),
]);

// Data de hoje no fuso de Brasília, no formato YYYY-MM-DD.
function todayInBRT() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

// Chamada REST genérica ao uazapi, já com o header de token.
async function call(pathname, { method = 'POST', body } = {}) {
  if (!config.baseUrl || !config.token) {
    throw new Error('Integração WhatsApp não configurada (faltam UAZAPI_BASE_URL / UAZAPI_TOKEN).');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(config.baseUrl + pathname, {
      method,
      headers: { 'Content-Type': 'application/json', token: config.token },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!res.ok) {
      const msg = (data && (data.error || data.message)) || `HTTP ${res.status}`;
      throw new Error(`uazapi ${pathname}: ${msg}`);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

// Lista de grupos (para o script de descoberta do JID).
async function listGroups() {
  const data = await call('/group/list', { method: 'POST', body: { force: true } });
  return data.groups || data || [];
}

// Busca nome (pushName) e foto de um número via /chat/details (consulta ao vivo,
// funciona mesmo para quem não é contato salvo). Best-effort.
async function chatDetails(number) {
  try {
    const d = await call('/chat/details', { method: 'POST', body: { number, preview: true } });
    let name = (d.name || d.wa_name || d.wa_contactName || '').trim();
    if (name && phone.canonical(name) === phone.canonical(number)) name = ''; // nome == número
    return { name, photo: d.imagePreview || d.image || '' };
  } catch {
    return null;
  }
}

// Enriquece a lista com nome+foto via /chat/details, em lotes.
// A 1ª chamada a um número desconhecido pode voltar vazia (dispara busca ao
// vivo no WhatsApp); por isso re-tentamos os vazios em passes adicionais.
async function enrichMembers(members, passes = 1) {
  const CHUNK = 20;
  async function runPass(list) {
    for (let i = 0; i < list.length; i += CHUNK) {
      const slice = list.slice(i, i + CHUNK);
      await Promise.all(slice.map(async (m) => {
        const d = await chatDetails(m.phone);
        if (d) { if (d.name) m.name = d.name; if (d.photo) m.photo = d.photo; }
      }));
    }
  }
  let pending = members;
  for (let p = 0; p < passes && pending.length; p++) {
    if (p > 0) await new Promise((r) => setTimeout(r, 1500));
    await runPass(pending);
    pending = pending.filter((m) => !m.name);
  }
}

// Membros do grupo configurado -> [{ phone (canônico), jid, isAdmin }]
async function fetchGroupMembers() {
  const data = await call('/group/info', { method: 'POST', body: { groupjid: config.groupJid } });
  const participants = data.Participants || data.participants || [];
  const members = [];
  for (const p of participants) {
    // Em grupos com AddressingMode "lid", o JID é um ID interno (@lid) e o
    // telefone real vem em PhoneNumber. Priorizamos o campo com o número.
    const source = p.PhoneNumber || p.phoneNumber || p.JID || p.jid || p.id || '';
    const digits = String(source).split('@')[0].split(':')[0]; // 5511...@s.whatsapp.net
    const canon = phone.canonical(digits);
    if (canon) {
      members.push({
        phone: canon,
        jid: p.PhoneNumber || p.JID || '',
        isAdmin: !!(p.IsAdmin || p.isAdmin || p.admin || p.IsSuperAdmin),
      });
    }
  }
  return members;
}

// Envia o código de verificação por WhatsApp.
async function sendCode(rawNumber, code) {
  const number = phone.canonical(rawNumber) || phone.digitsOnly(rawNumber);
  const text =
    `Seu código de verificação CLOC-Tinder é: ${code}\n` +
    `Ele expira em ${config.otp.ttlMinutos} minutos. Se você não pediu, ignore esta mensagem.`;
  return call('/send/text', { method: 'POST', body: { number, text } });
}

// Posta uma mensagem no grupo configurado.
async function sendGroupMessage(text) {
  return call('/send/text', { method: 'POST', body: { number: config.groupJid, text } });
}

// Monta o texto do digest (sem identificar quem pediu). Retorna '' se não há nada a postar.
function buildDigest(needs) {
  if (!needs || !needs.length) return '';
  const cap = (s) => String(s || 'outro').charAt(0).toUpperCase() + String(s || 'outro').slice(1);
  const top = needs.slice(0, 10);
  const lines = top.map((n, i) => `${i + 1}. [${cap(n.category)}] ${n.title}`);
  const extra = needs.length > top.length ? `\n…e mais ${needs.length - top.length}.` : '';
  return `☀️ *Necessidades abertas no CLOC-Tinder*\n\n${lines.join('\n')}${extra}\n\n` +
    `Pode ajudar em alguma? Entre e ofereça ajuda 👉 ${config.appUrl}`;
}

// Compila e posta o digest das necessidades abertas. Não posta se não houver nenhuma.
async function sendDigest() {
  const today = todayInBRT();
  if (DIGEST_SKIP_DATES.has(today)) {
    console.log(`[digest] ${today} está na lista de skip — comunicado manual já enviado, nada postado.`);
    return { ok: true, posted: false, skipped: today, count: 0 };
  }
  const needs = await db.getOpenNeeds();
  const text = buildDigest(needs);
  if (!text) {
    console.log('[digest] sem necessidades abertas — nada postado.');
    return { ok: true, posted: false, count: 0 };
  }
  await sendGroupMessage(text);
  console.log(`[digest] postado — ${Math.min(needs.length, 10)} de ${needs.length} necessidades.`);
  return { ok: true, posted: true, count: Math.min(needs.length, 10), total: needs.length };
}

// Gera um código numérico de N dígitos (sem zeros à esquerda perdidos).
function generateCode() {
  const n = config.otp.length;
  const min = 10 ** (n - 1);
  const max = 10 ** n - 1;
  return String(Math.floor(min + Math.random() * (max - min + 1)));
}

// Sincroniza a lista de membros para o cache no banco. Retorna { ok, count, error }.
async function syncGroupMembers() {
  try {
    const members = await fetchGroupMembers();
    // Preserva nome/foto já obtidos; só consulta os que ainda faltam.
    const existing = await db.getGroupMemberInfoMap();
    const missing = [];
    for (const m of members) {
      const e = existing.get(m.phone);
      if (e && e.name) { m.name = e.name; if (e.photo) m.photo = e.photo; }
      else missing.push(m);
    }
    await enrichMembers(missing);
    await db.replaceGroupMembers(members);
    const named = members.filter(m => m.name).length;
    console.log(`[whatsapp] sync ok — ${members.length} membros (${named} com nome, ${missing.length} consultados)`);
    return { ok: true, count: members.length, named };
  } catch (err) {
    console.error('[whatsapp] sync falhou:', err.message);
    return { ok: false, error: err.message };
  }
}

// Agenda o sync: roda no boot e depois a cada N horas.
function startScheduler() {
  if (!config.isConfigured) {
    console.warn('[whatsapp] integração não configurada — gate de grupo/OTP inativo. Veja .env.example.');
    return;
  }
  syncGroupMembers();
  const ms = Math.max(1, config.syncIntervalHoras) * 60 * 60 * 1000;
  const timer = setInterval(syncGroupMembers, ms);
  timer.unref?.();
  console.log(`[whatsapp] sync agendado a cada ${config.syncIntervalHoras}h`);
}

module.exports = {
  listGroups, fetchGroupMembers, sendCode, generateCode,
  syncGroupMembers, startScheduler,
  sendGroupMessage, buildDigest, sendDigest,
};
