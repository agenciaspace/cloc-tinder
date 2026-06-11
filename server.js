const express = require('express');
const cookieSession = require('cookie-session');
const path = require('path');

const waConfig = require('./config/whatsapp');
const access = require('./services/access');
const db = require('./models/db');
const whatsapp = require('./services/whatsapp');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Sessão em cookie assinado (stateless — funciona em serverless).
app.use(cookieSession({
  name: 'cloc',
  secret: waConfig.sessionSecret,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Locals + status de admin (carrega a linha atual do usuário a cada request).
app.use(async (req, res, next) => {
  try {
    res.locals.success = req.session.success;
    res.locals.error = req.session.error;
    delete req.session.success;
    delete req.session.error;

    res.locals.wa = {
      groupName: waConfig.groupName,
      inviteLink: waConfig.inviteLink,
      isConfigured: waConfig.isConfigured,
    };

    let row = null;
    if (req.session.user) {
      row = await db.findUserById(req.session.user.id);
      if (row && Number(row.is_banned) === 1) {
        req.session = null;
        return res.redirect('/login?banned=1');
      }
    }

    res.locals.user = req.session.user || null;
    res.locals.isAdmin = access.isAdmin(row);
    res.locals.isSuperAdmin = access.isSuperAdmin(row);
    const viewAs = req.session.viewAs === 'user' ? 'user' : 'admin';
    res.locals.adminView = res.locals.isAdmin && viewAs === 'admin';
    next();
  } catch (err) {
    next(err);
  }
});

// Rotas
app.use(require('./routes/auth'));
app.use(require('./routes/profile'));
app.use(require('./routes/needs'));
app.use(require('./routes/matches'));
app.use(require('./routes/admin'));

app.get('/', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.render('index');
});

app.get('/dashboard', async (req, res, next) => {
  try {
    if (!req.session.user) return res.redirect('/login');
    const [profile, needs, myNeeds, matches] = await Promise.all([
      db.getProfileByUserId(req.session.user.id),
      db.getOpenNeeds(),
      db.getNeedsByUserId(req.session.user.id),
      db.getMatchesByHelperId(req.session.user.id),
    ]);
    res.render('dashboard', { user: req.session.user, profile, needs, myNeeds, matches });
  } catch (err) {
    next(err);
  }
});

// Endpoint de sincronização para o Vercel Cron (protegido por CRON_SECRET).
app.all('/api/cron/sync', async (req, res) => {
  const auth = req.headers.authorization || '';
  if (!waConfig.cronSecret || auth !== `Bearer ${waConfig.cronSecret}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const result = await whatsapp.syncGroupMembers();
  res.status(result.ok ? 200 : 500).json(result);
});

// Tratamento de erro (evita travar request em falha do banco).
app.use((err, req, res, next) => {
  console.error('[erro]', err.message);
  res.status(500).send('Erro interno. Tente novamente em instantes.');
});

// Só roda como processo local (na Vercel o app é importado por api/index.js).
if (require.main === module) {
  db.initDb();
  whatsapp.startScheduler();
  app.listen(PORT, () => console.log(`CLOC-Tinder rodando em http://localhost:${PORT}`));
}

module.exports = app;
