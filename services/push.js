/* ---------------------------------------------------------------------------
   Web Push (VAPID). Envia notificações para todas as inscrições de um usuário.
   Inscrições inválidas (410/404) são removidas automaticamente.
   --------------------------------------------------------------------------- */
const webpush = require('web-push');
const config = require('../config/whatsapp');
const db = require('../models/db');

const enabled = Boolean(config.vapid.publicKey && config.vapid.privateKey);
if (enabled) {
  webpush.setVapidDetails(config.vapid.subject, config.vapid.publicKey, config.vapid.privateKey);
}

// Envia uma notificação para o usuário (em todos os dispositivos inscritos).
async function sendToUser(userId, payload) {
  if (!enabled) return;
  let subs;
  try {
    subs = await db.getPushSubscriptionsByUser(userId);
  } catch (err) {
    console.error('[push] erro ao buscar inscrições:', err.message);
    return;
  }
  const body = JSON.stringify(payload);
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, body);
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        await db.deletePushSubscription(s.endpoint).catch(() => {});
      } else {
        console.error('[push] falha ao enviar:', err.statusCode || err.message);
      }
    }
  }));
}

module.exports = { sendToUser, enabled };
