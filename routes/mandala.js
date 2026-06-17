const express = require('express');
const db = require('../models/db');
const { requireAuth } = require('../middleware/auth');
const { COMPETENCIES, suggestKeys } = require('../config/mandala');

const router = express.Router();
const VALID = new Set(COMPETENCIES.map((c) => c.key));

// Form da mandala: a pessoa conta o que faz e o que curte, e se posiciona nas
// competências da CLOC (pré-sugeridas a partir do texto, confirmadas por ela).
router.get('/mandala', requireAuth, async (req, res, next) => {
  try {
    const profile = await db.getProfileByUserId(req.session.user.id);
    res.render('mandala', { profile, competencies: COMPETENCIES });
  } catch (err) { next(err); }
});

router.post('/mandala', requireAuth, async (req, res, next) => {
  try {
    const work = (req.body.work || '').trim();
    const interests = (req.body.interests || '').trim();

    const raw = req.body.competencies || [];
    let selected = (Array.isArray(raw) ? raw : [raw]).filter((k) => VALID.has(k));
    // Rede de segurança: se nada foi marcado mas há texto, sugere pelo texto.
    if (!selected.length && (work || interests)) {
      selected = suggestKeys(`${work} ${interests}`).slice(0, 5);
    }
    if (!selected.length) {
      req.session.error = 'Escolha pelo menos uma competência da mandala em que você se encaixa.';
      return res.redirect('/mandala');
    }

    await db.updateUser(req.session.user.id, { work, interests, cloc_competencies: selected });
    req.session.success = 'Sua mandala da CLOC foi salva! 🧭';
    res.redirect('/dashboard');
  } catch (err) { next(err); }
});

module.exports = router;
