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

router.get('/profile', requireAuth, async (req, res, next) => {
  try {
    const profile = await db.getProfileByUserId(req.session.user.id);
    res.render('profile', { profile, categories: CATEGORIES, editing: false });
  } catch (err) { next(err); }
});

router.post('/profile', requireAuth, async (req, res, next) => {
  try {
    const { name, phone, bio, skills, help_categories, can_help, needs_help } = req.body;
    const skillsList = skills ? skills.split(',').map(s => s.trim()).filter(Boolean) : [];
    const categoriesList = help_categories || [];

    await db.updateUser(req.session.user.id, {
      name,
      phone: phone || '',
      bio: bio || '',
      skills: skillsList,
      help_categories: Array.isArray(categoriesList) ? categoriesList : [categoriesList],
      available: 1,
      can_help: can_help ? 1 : 0,
      needs_help: needs_help ? 1 : 0
    });

    req.session.user.name = name;
    req.session.success = 'Perfil atualizado com sucesso!';
    res.redirect('/dashboard');
  } catch (err) { next(err); }
});

router.get('/profile/edit', requireAuth, async (req, res, next) => {
  try {
    const profile = await db.getProfileByUserId(req.session.user.id);
    res.render('profile', { profile, categories: CATEGORIES, editing: true });
  } catch (err) { next(err); }
});

router.get('/user/:id', requireAuth, async (req, res, next) => {
  try {
    const profile = await db.getProfileByUserId(req.params.id);
    if (!profile) {
      req.session.error = 'Usuário não encontrado.';
      return res.redirect('/dashboard');
    }
    res.render('public-profile', { profile });
  } catch (err) { next(err); }
});

module.exports = router;
