const express = require('express');
const db = require('../models/db');
const config = require('../config/whatsapp');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Chave pública VAPID (o cliente precisa para se inscrever).
router.get('/push/public-key', (req, res) => {
  res.json({ key: config.vapid.publicKey });
});

// Salva uma inscrição de push do usuário logado.
router.post('/push/subscribe', requireAuth, async (req, res, next) => {
  try {
    const sub = req.body;
    if (!sub || !sub.endpoint || !sub.keys) {
      return res.status(400).json({ error: 'inscrição inválida' });
    }
    await db.savePushSubscription(req.session.user.id, sub);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Remove uma inscrição (ao desativar notificações).
router.post('/push/unsubscribe', requireAuth, async (req, res, next) => {
  try {
    if (req.body && req.body.endpoint) await db.deletePushSubscription(req.body.endpoint);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
