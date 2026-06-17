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

router.get('/needs', requireAuth, async (req, res, next) => {
  try {
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
  } catch (err) { next(err); }
});

router.get('/needs/new', requireAuth, (req, res) => {
  res.render('new-need', { categories: CATEGORIES });
});

router.post('/needs', requireAuth, async (req, res, next) => {
  try {
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
  } catch (err) { next(err); }
});

router.get('/needs/:id', requireAuth, async (req, res, next) => {
  try {
    const need = await db.getNeedById(req.params.id);
    if (!need) {
      req.session.error = 'Necessidade não encontrada.';
      return res.redirect('/needs');
    }
    const userIsRequester = need.requester_id === req.session.user.id;
    const [helpers, myMatches, offers] = await Promise.all([
      db.getPotentialHelpers(need.category, need.requester_id),
      db.getMatchesByHelperId(req.session.user.id),
      userIsRequester ? db.getMatchesByNeedId(need.id) : Promise.resolve([]),
    ]);
    const myMatch = myMatches.find(m => m.need_id === need.id) || null;
    res.render('need-detail', {
      need,
      helpers,
      offers,
      myMatch,
      alreadyMatched: !!myMatch,
      userIsRequester,
      isAdmin: res.locals.isAdmin,
    });
  } catch (err) { next(err); }
});

router.post('/needs/:id/close', requireAuth, async (req, res, next) => {
  try {
    const need = await db.getNeedById(req.params.id);
    if (!need || (need.requester_id !== req.session.user.id)) {
      req.session.error = 'Você não pode fechar esta necessidade.';
      return res.redirect('/needs');
    }
    await db.updateNeed(need.id, { status: 'closed' });
    req.session.success = 'Necessidade fechada.';
    res.redirect('/needs');
  } catch (err) { next(err); }
});

module.exports = router;
