const express = require('express');
const cookieSession = require('cookie-session');
const path = require('path');

const waConfig = require('./config/whatsapp');
const access = require('./services/access');
const db = require('./models/db');
const whatsapp = require('./services/whatsapp');

const app = express();
const PORT = process.env.PORT || 3001;
const isProd = process.env.NODE_ENV === 'production';

// Atrás do proxy da Vercel — necessário para cookies "secure" e IP correto.
app.set('trust proxy', 1);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Sessão em cookie assinado (stateless — funciona em serverless).
app.use(cookieSession({
  name: 'cloc.sess',
  secret: waConfig.sessionSecret,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  httpOnly: true,
  sameSite: 'lax',
  secure: isProd,
}));

app.use(async (req, res, next) => {
  res.locals.success = req.session.success;
  res.locals.error = req.session.error;
  delete req.session.success;
  delete req.session.error;

  res.locals.wa = {
    groupName: waConfig.groupName,
    inviteLink: waConfig.inviteLink,
    isConfigured: waConfig.isConfigured,
  };

  // Carrega a linha atual do usuário para computar admin/banido em tempo real.
  let row = null;
  if (req.session.user) {
    try {
      row = await db.findUserById(req.session.user.id);
    } catch (err) {
      console.error('[locals] falha ao carregar usuário:', err.message);
    }
    if (row && Number(row.is_banned) === 1) {
      req.session = null;
      return res.redirect('/login?banned=1');
    }
  }

  res.locals.user = req.session.user || null;
  res.locals.isAdmin = access.isAdmin(row);
  res.locals.isSuperAdmin = access.isSuperAdmin(row);
  // Admin pode alternar para "ver como usuário".
  const viewAs = req.session.viewAs === 'user' ? 'user' : 'admin';
  res.locals.adminView = res.locals.isAdmin && viewAs === 'admin';
  next();
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(require('./routes/auth'));
app.use(require('./routes/profile'));
app.use(require('./routes/needs'));
app.use(require('./routes/matches'));
app.use(require('./routes/push'));
app.use('/admin', require('./routes/admin'));

app.get('/', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.render('index');
});

app.get('/dashboard', async (req, res, next) => {
  if (!req.session.user) return res.redirect('/login');
  try {
    const [userProfile, needs, myNeeds, matches] = await Promise.all([
      db.getProfileByUserId(req.session.user.id),
      db.getOpenNeeds(),
      db.getNeedsByUserId(req.session.user.id),
      db.getMatchesByHelperId(req.session.user.id),
    ]);
    res.render('dashboard', { user: req.session.user, profile: userProfile, needs, myNeeds, matches });
  } catch (err) { next(err); }
});

// Endpoint de sincronização para o Vercel Cron (e gatilho manual).
// Vercel envia "Authorization: Bearer <CRON_SECRET>"; aceitamos também ?secret=.
app.get('/api/cron/sync', async (req, res) => {
  const auth = req.get('authorization') || '';
  const ok = waConfig.cronSecret &&
    (auth === `Bearer ${waConfig.cronSecret}` || req.query.secret === waConfig.cronSecret);
  if (!ok) return res.status(401).json({ error: 'unauthorized' });
  const result = await whatsapp.syncGroupMembers();
  res.status(result.ok ? 200 : 500).json(result);
});

// Tratador de erros — evita derrubar a função serverless.
app.use((err, req, res, next) => {
  console.error('[erro]', err);
  if (res.headersSent) return next(err);
  res.status(500).send('Erro interno. Tente novamente em instantes.');
});

module.exports = app;

// Execução local (não roda na Vercel, que importa o app acima).
if (require.main === module) {
  (async () => {
    await db.initDb();
    whatsapp.startScheduler();
    app.listen(PORT, () => console.log(`CLOC-Tinder rodando em http://localhost:${PORT}`));
  })();
}
