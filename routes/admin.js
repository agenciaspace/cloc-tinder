const express = require('express');
const db = require('../models/db');
const access = require('../services/access');
const whatsapp = require('../services/whatsapp');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Tudo aqui exige admin.
router.use(requireAdmin);

/* ---------- Alternar visão (admin <-> usuário comum) ---------- */
router.get('/admin/view/:mode', (req, res) => {
  req.session.viewAs = req.params.mode === 'user' ? 'user' : 'admin';
  const back = req.get('referer');
  res.redirect(back && !back.includes('/admin/view/') ? back : '/dashboard');
});

/* ---------- Visão geral ---------- */
router.get('/admin', async (req, res) => {
  const stats = await db.getStats();
  const taxa = stats.needsTotal ? Math.round((stats.needsMatched / stats.needsTotal) * 100) : 0;
  res.render('admin/overview', {
    stats,
    taxaAtendimento: taxa,
    memberStats: await db.getMemberStats(),
  });
});

router.post('/admin/sync-whatsapp', async (req, res) => {
  const result = await whatsapp.syncGroupMembers();
  if (result.ok) req.session.success = `Lista do grupo atualizada: ${result.count} membros.`;
  else req.session.error = `Falha ao sincronizar: ${result.error}`;
  res.redirect('/admin');
});

/* ---------- Participantes ---------- */
router.get('/admin/participants', async (req, res) => {
  const users = (await db.getAllUsers()).map(u => ({ ...u, isSuper: access.isSuperAdmin(u) }));
  res.render('admin/participants', { users });
});

// Helper: carrega o alvo e aplica proteções comuns. Retorna o row ou null (já redirecionou).
async function loadTarget(req, res, { blockSelf = false, blockSuper = false } = {}) {
  const target = await db.findUserById(req.params.id);
  if (!target) {
    req.session.error = 'Usuário não encontrado.';
    res.redirect('/admin/participants');
    return null;
  }
  if (blockSelf && target.id === req.session.user.id) {
    req.session.error = 'Você não pode fazer isso com a sua própria conta.';
    res.redirect('/admin/participants');
    return null;
  }
  if (blockSuper && access.isSuperAdmin(target)) {
    req.session.error = 'Este é um super-admin definido no servidor e não pode ser alterado aqui.';
    res.redirect('/admin/participants');
    return null;
  }
  return target;
}

router.post('/admin/participants/:id/promote', async (req, res) => {
  const t = await loadTarget(req, res);
  if (!t) return;
  await db.setUserAdmin(t.id, 1);
  req.session.success = `${t.name} agora é admin.`;
  res.redirect('/admin/participants');
});

router.post('/admin/participants/:id/demote', async (req, res) => {
  const t = await loadTarget(req, res, { blockSuper: true });
  if (!t) return;
  await db.setUserAdmin(t.id, 0);
  req.session.success = `${t.name} não é mais admin.`;
  res.redirect('/admin/participants');
});

router.post('/admin/participants/:id/ban', async (req, res) => {
  const t = await loadTarget(req, res, { blockSelf: true, blockSuper: true });
  if (!t) return;
  await db.setUserBanned(t.id, 1);
  req.session.success = `${t.name} foi banido(a).`;
  res.redirect('/admin/participants');
});

router.post('/admin/participants/:id/unban', async (req, res) => {
  const t = await loadTarget(req, res);
  if (!t) return;
  await db.setUserBanned(t.id, 0);
  req.session.success = `${t.name} foi desbanido(a).`;
  res.redirect('/admin/participants');
});

router.post('/admin/participants/:id/delete', async (req, res) => {
  const t = await loadTarget(req, res, { blockSelf: true, blockSuper: true });
  if (!t) return;
  await db.deleteUserCascade(t.id);
  req.session.success = `${t.name} e todo o conteúdo associado foram removidos.`;
  res.redirect('/admin/participants');
});

/* ---------- Necessidades & matches ---------- */
router.get('/admin/needs', async (req, res) => {
  res.render('admin/needs', {
    needs: await db.getAllNeeds(),
    matches: await db.getAllMatches(),
  });
});

router.post('/admin/needs/:id/close', async (req, res) => {
  const need = await db.getNeedById(req.params.id);
  if (!need) { req.session.error = 'Necessidade não encontrada.'; return res.redirect('/admin/needs'); }
  await db.updateNeed(need.id, { status: 'closed' });
  req.session.success = 'Necessidade fechada.';
  res.redirect('/admin/needs');
});

router.post('/admin/needs/:id/delete', async (req, res) => {
  const need = await db.getNeedById(req.params.id);
  if (!need) { req.session.error = 'Necessidade não encontrada.'; return res.redirect('/admin/needs'); }
  await db.deleteNeed(need.id);
  req.session.success = 'Necessidade removida.';
  res.redirect('/admin/needs');
});

module.exports = router;
