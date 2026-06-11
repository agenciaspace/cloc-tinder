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

// Mapa telefone(canônico) -> { name, photo } a partir dos chats conhecidos
// (pushName/contato + foto de perfil). Cobertura cresce conforme a instância
// captura atividade do grupo. Best-effort: nunca derruba o sync.
async function fetchNamePhotoMap() {
  const map = new Map();
  try {
    const data = await call('/chat/find', { method: 'POST', body: { limit: 5000 } });
    const chats = data.chats || [];
    for (const ch of chats) {
      const cid = String(ch.wa_chatid || '');
      if (cid.includes('@g.us')) continue;
      const canon = phone.canonical(cid.split('@')[0]);
      if (!canon || map.has(canon)) continue;
      let name = (ch.wa_contactName || ch.wa_name || ch.name || '').trim();
      // descarta "nomes" que são só o próprio número
      if (name && phone.canonical(name) === canon) name = '';
      map.set(canon, { name, photo: ch.image || '' });
    }
  } catch (err) {
    console.warn('[whatsapp] enriquecimento de nomes indisponível:', err.message);
  }
  return map;
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
    const [members, nameMap] = await Promise.all([fetchGroupMembers(), fetchNamePhotoMap()]);
    for (const m of members) {
      const info = nameMap.get(m.phone);
      if (info) { m.name = info.name; m.photo = info.photo; }
    }
    await db.replaceGroupMembers(members);
    const named = members.filter(m => m.name).length;
    console.log(`[whatsapp] sync ok — ${members.length} membros (${named} com nome)`);
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
};
