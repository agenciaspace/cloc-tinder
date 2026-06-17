/* ---------------------------------------------------------------------------
   Configuração da integração WhatsApp (uazapi).
   Lê de variáveis de ambiente, com um loader mínimo de .env (sem dependências).
   --------------------------------------------------------------------------- */
const fs = require('fs');
const path = require('path');
const phone = require('../services/phone');

// Loader de .env simples — preenche process.env sem sobrescrever o que já existe.
(function loadDotEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
})();

const env = process.env;
const num = (v, d) => (v !== undefined && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : d);

const config = {
  // uazapi
  baseUrl: (env.UAZAPI_BASE_URL || '').replace(/\/+$/, ''),
  token: env.UAZAPI_TOKEN || '',
  groupJid: env.UAZAPI_GROUP_JID || '',

  // sincronização da lista de membros
  syncIntervalHoras: num(env.WA_SYNC_INTERVAL_HORAS, 6),

  // verificação por código (OTP)
  otp: {
    length: num(env.OTP_LENGTH, 6),
    ttlMinutos: num(env.OTP_TTL_MINUTOS, 10),
    maxTentativas: num(env.OTP_MAX_TENTATIVAS, 5),
    reenvioCooldownSeg: num(env.OTP_REENVIO_COOLDOWN_SEG, 60),
  },

  // UX / admin
  appUrl: (env.APP_URL || 'https://cloc-tinder.vercel.app').replace(/\/+$/, ''),
  groupName: env.WA_GROUP_NAME || 'CLOC bate-papo',
  inviteLink: env.WA_GROUP_INVITE_LINK || '',
  adminEmail: (env.ADMIN_EMAIL || '').toLowerCase(),
  // Super-admins por telefone (lista separada por vírgula), normalizados.
  adminPhones: (env.ADMIN_PHONES || '')
    .split(',')
    .map(p => phone.canonical(p))
    .filter(Boolean),

  // Supabase (banco via REST). O servidor usa a service_role.
  supabase: {
    url: (env.SUPABASE_URL || '').replace(/\/+$/, ''),
    serviceKey: env.SUPABASE_SERVICE_ROLE_KEY || '',
    anonKey: env.SUPABASE_ANON_KEY || '',
  },

  // Sessão (cookie assinado) e proteção do endpoint de cron.
  sessionSecret: env.SESSION_SECRET || 'cloc-tinder-dev-secret-troque-em-producao',
  cronSecret: env.CRON_SECRET || '',

  // Web Push (VAPID).
  vapid: {
    publicKey: env.VAPID_PUBLIC_KEY || '',
    privateKey: env.VAPID_PRIVATE_KEY || '',
    subject: env.VAPID_SUBJECT || 'mailto:admin@example.com',
  },
};

// A integração só está "ativa" quando temos os dados mínimos do uazapi.
config.isConfigured = Boolean(config.baseUrl && config.token && config.groupJid);

module.exports = config;
