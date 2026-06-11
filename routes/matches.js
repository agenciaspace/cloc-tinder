const express = require('express');
const db = require('../models/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/matches/:needId/offer', requireAuth, async (req, res) => {
  const need = await db.getNeedById(req.params.needId);

  if (!need || need.status !== 'open') {
    req.session.error = 'Esta necessidade não está mais aberta.';
    return res.redirect('/needs');
  }

  if (need.requester_id === req.session.user.id) {
    req.session.error = 'Você não pode se oferecer para sua própria necessidade.';
    return res.redirect(`/needs/${need.id}`);
  }

  const existing = (await db.getMatchesByHelperId(req.session.user.id))
    .filter(m => m.need_id === Number(req.params.needId));
  if (existing.length > 0) {
    req.session.error = 'Você já se ofereceu para esta necessidade.';
    return res.redirect(`/needs/${need.id}`);
  }

  await db.createMatch(need.id, req.session.user.id);

  if (need.requester_id) {
    await db.createNotification(
      need.requester_id,
      `${req.session.user.name} se ofereceu para ajudar com: "${need.title}"`,
      'match'
    );
  }

  req.session.success = 'Match enviado! Você se ofereceu para ajudar.';
  res.redirect('/matches');
});

router.get('/matches', requireAuth, async (req, res) => {
  const myOffers = await db.getMatchesByHelperId(req.session.user.id);
  res.render('matches', { matches: myOffers });
});

router.post('/matches/:id/accept', requireAuth, async (req, res) => {
  const match = await db.getMatchById(req.params.id);
  if (!match) {
    req.session.error = 'Match não encontrado.';
    return res.redirect('/matches');
  }

  const need = await db.getNeedById(match.need_id);
  if (!need) {
    req.session.error = 'Necessidade não encontrada.';
    return res.redirect('/matches');
  }

  if (need.requester_id && need.requester_id !== req.session.user.id) {
    req.session.error = 'Apenas o solicitante pode aceitar um match.';
    return res.redirect('/matches');
  }

  await db.updateMatch(match.id, 'accepted');
  await db.updateNeed(need.id, { status: 'matched', helper_id: match.helper_id });

  const helper = await db.findUserById(match.helper_id);
  if (helper) {
    await db.createNotification(
      match.helper_id,
      `Seu match para "${need.title}" foi aceito! Entre em contato.`,
      'success'
    );
  }

  req.session.success = 'Match aceito! Entre em contato com o voluntário.';
  res.redirect('/matches');
});

router.post('/matches/:id/reject', requireAuth, async (req, res) => {
  const match = await db.getMatchById(req.params.id);
  if (!match) {
    req.session.error = 'Match não encontrado.';
    return res.redirect('/matches');
  }

  await db.updateMatch(match.id, 'rejected');

  const helper = await db.findUserById(match.helper_id);
  if (helper) {
    await db.createNotification(
      match.helper_id,
      `Seu match foi recusado. Não desanime, continue ajudando!`,
      'info'
    );
  }

  req.session.success = 'Match recusado.';
  res.redirect('/matches');
});

router.get('/api/matches/potential/:needId', requireAuth, async (req, res) => {
  const need = await db.getNeedById(req.params.needId);
  if (!need) return res.json([]);
  const helpers = await db.getPotentialHelpers(need.category, need.requester_id);
  res.json(helpers.map(h => ({
    id: h.id,
    name: h.name,
    bio: h.bio,
    skills: h.skills || [],
    help_categories: h.help_categories || []
  })));
});

module.exports = router;
