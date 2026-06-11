const express = require('express');
const multer = require('multer');
const db = require('../models/db');
const storage = require('../services/storage');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
function uploadPhoto(req, res, next) {
  upload.single('photo')(req, res, (err) => {
    if (err) { req.session.error = 'A foto deve ter no máximo 5MB e ser uma imagem.'; return res.redirect('/profile/edit'); }
    next();
  });
}
function normalizeLinkedin(raw) {
  let s = String(raw || '').trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try { const u = new URL(s); if (!/(^|\.)linkedin\.com$/i.test(u.hostname)) return null; return u.href; } catch { return null; }
}

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

router.post('/profile', requireAuth, uploadPhoto, async (req, res, next) => {
  try {
    const { name, phone, bio, skills, help_categories, can_help, needs_help } = req.body;

    const linkedin = normalizeLinkedin(req.body.linkedin);
    if (!linkedin) {
      req.session.error = 'Informe um link válido do seu LinkedIn (ex: linkedin.com/in/seu-perfil).';
      return res.redirect('/profile/edit');
    }

    const skillsList = skills ? skills.split(',').map(s => s.trim()).filter(Boolean) : [];
    const categoriesList = help_categories || [];

    const fields = {
      name,
      phone: phone || '',
      bio: bio || '',
      linkedin,
      skills: skillsList,
      help_categories: Array.isArray(categoriesList) ? categoriesList : [categoriesList],
      available: 1,
      can_help: can_help ? 1 : 0,
      needs_help: needs_help ? 1 : 0,
    };

    if (req.file) {
      try { fields.photo_url = await storage.uploadAvatar(req.file); }
      catch (err) {
        req.session.error = err.message || 'Não conseguimos enviar a foto.';
        return res.redirect('/profile/edit');
      }
    }

    await db.updateUser(req.session.user.id, fields);
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
