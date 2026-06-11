const express = require('express');
const db = require('../models/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const CATEGORIES = [
  'tecnologia', 'educacao', 'saude', 'juridico',
  'financeiro', 'marketing', 'administrativo', 'design',
  'idiomas', 'carreira', 'empreendedorismo', 'bem-estar',
  'moradia', 'transporte', 'alimentacao', 'outro'
];

router.get('/needs', requireAuth, async (req, res) => {
  const filter = req.query.category || '';
  const search = req.query.search || '';
  let needs;
  if (search) {
    needs = await db.searchNeeds(search);
  } else if (filter) {
    needs = (await db.getOpenNeeds()).filter(n => n.category === filter);
  } else {
    needs = await db.getOpenNeeds();
  }
  res.render('needs', { needs, categories: CATEGORIES, filter, search });
});

router.get('/needs/new', requireAuth, (req, res) => {
  res.render('new-need', { categories: CATEGORIES });
});

router.post('/needs', requireAuth, async (req, res) => {
  const { title, description, category, requester_name, requester_phone } = req.body;

  if (!title) {
    req.session.error = 'Título é obrigatório.';
    return res.redirect('/needs/new');
  }

  await db.createNeed(
    title,
    description || '',
    category || 'outro',
    requester_name || req.session.user.name,
    requester_phone || '',
    req.session.user.id
  );

  req.session.success = 'Necessidade cadastrada! Já estamos buscando matching.';
  res.redirect('/needs');
});

router.get('/needs/:id', requireAuth, async (req, res) => {
  const need = await db.getNeedById(req.params.id);
  if (!need) {
    req.session.error = 'Necessidade não encontrada.';
    return res.redirect('/needs');
  }
  const helpers = await db.getPotentialHelpers(need.category, need.requester_id);
  const alreadyMatched = (await db.getMatchesByHelperId(req.session.user.id))
    .some(m => m.need_id === need.id);
  res.render('need-detail', {
    need,
    helpers,
    alreadyMatched,
    userIsRequester: need.requester_id === req.session.user.id
  });
});

router.post('/needs/:id/close', requireAuth, async (req, res) => {
  const need = await db.getNeedById(req.params.id);
  if (!need || (need.requester_id !== req.session.user.id)) {
    req.session.error = 'Você não pode fechar esta necessidade.';
    return res.redirect('/needs');
  }
  await db.updateNeed(need.id, { status: 'closed' });
  req.session.success = 'Necessidade fechada.';
  res.redirect('/needs');
});

module.exports = router;
