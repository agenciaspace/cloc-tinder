function requireAuth(req, res, next) {
  if (!req.session.user) {
    req.session.error = 'Você precisa estar logado para acessar esta página.';
    return res.redirect('/login');
  }
  next();
}

// Exige que o usuário seja admin. Usa res.locals.isAdmin, calculado no
// middleware de locals (server.js) a partir da linha atual do banco.
function requireAdmin(req, res, next) {
  if (!req.session.user) {
    req.session.error = 'Você precisa estar logado para acessar esta página.';
    return res.redirect('/login');
  }
  if (!res.locals.isAdmin) {
    req.session.error = 'Acesso restrito a administradores.';
    return res.redirect('/dashboard');
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
