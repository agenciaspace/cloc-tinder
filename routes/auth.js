const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const db = require('../models/db');
const config = require('../config/whatsapp');
const whatsapp = require('../services/whatsapp');
const phone = require('../services/phone');
const storage = require('../services/storage');
const socials = require('../services/socials');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// Wrapper que trata erros do multer com mensagem amigável.
function uploadPhoto(req, res, next) {
  upload.single('photo')(req, res, (err) => {
    if (err) {
      req.session.error = 'A foto deve ter no máximo 5MB e ser uma imagem.';
      return res.redirect('/register');
    }
    next();
  });
}

// Mascara o número, mostrando só os 4 últimos dígitos.
function maskPhone(raw) {
  const d = phone.digitsOnly(raw);
  if (d.length < 4) return raw;
  return '•••• •••' + d.slice(-4);
}


router.get('/register', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.render('register');
});

router.post('/register', uploadPhoto, async (req, res) => {
  const { name, email, password, confirmPassword, phone: phoneRaw } = req.body;

  if (!name || !email || !password || !phoneRaw) {
    req.session.error = 'Nome, email, WhatsApp e senha são obrigatórios.';
    return res.redirect('/register');
  }
  if (password !== confirmPassword) {
    req.session.error = 'Senhas não conferem.';
    return res.redirect('/register');
  }

  // LinkedIn é obrigatório (handle, ex: @seu-usuario).
  const linkedin = socials.cleanHandle(req.body.linkedin);
  if (!linkedin) {
    req.session.error = 'Informe seu usuário do LinkedIn (ex: @seu-usuario).';
    return res.redirect('/register');
  }
  const instagram = socials.cleanHandle(req.body.instagram);
  const x = socials.cleanHandle(req.body.x);
  const substack = socials.cleanHandle(req.body.substack);

  if (await db.findUserByEmail(email)) {
    req.session.error = 'Este email já está cadastrado.';
    return res.redirect('/register');
  }

  // A integração precisa estar ativa para validar grupo + enviar o código.
  if (!config.isConfigured) {
    req.session.error = 'O cadastro está temporariamente indisponível. Avise o administrador.';
    return res.redirect('/register');
  }

  // Número precisa ser válido (BR) para conseguirmos normalizar e enviar o código.
  if (!phone.canonical(phoneRaw)) {
    req.session.error = 'Informe um número de WhatsApp válido com DDD. Ex: (11) 99999-9999.';
    return res.redirect('/register');
  }

  // 1 conta por número (reforça a identidade).
  if (await db.isPhoneRegistered(phoneRaw)) {
    req.session.error = 'Já existe uma conta com este número de WhatsApp.';
    return res.redirect('/register');
  }

  // Gate: o número precisa estar no grupo.
  if (!(await db.isPhoneAllowed(phoneRaw))) {
    req.session.error =
      `Seu número não está no grupo ${config.groupName}. Entre no grupo e tente novamente.` +
      (config.inviteLink ? ` Convite: ${config.inviteLink}` : '');
    return res.redirect('/register');
  }

  // Foto (opcional) — sobe para o Storage e guardamos só a URL.
  let photoUrl = '';
  if (req.file) {
    try {
      photoUrl = await storage.uploadAvatar(req.file);
    } catch (err) {
      console.error('[register] falha no upload da foto:', err.message);
      req.session.error = err.message || 'Não conseguimos enviar a foto. Tente outra imagem.';
      return res.redirect('/register');
    }
  }

  // Gera e envia o código de verificação.
  const code = whatsapp.generateCode();
  try {
    await whatsapp.sendCode(phoneRaw, code);
  } catch (err) {
    console.error('[register] falha ao enviar código:', err.message);
    req.session.error = 'Não conseguimos enviar o código pelo WhatsApp agora. Tente novamente em instantes.';
    return res.redirect('/register');
  }

  // Guarda o cadastro pendente na sessão (senha já com hash; código com hash).
  req.session.pendingReg = {
    name,
    email,
    phoneRaw,
    linkedin,
    instagram,
    x,
    substack,
    photoUrl,
    passwordHash: bcrypt.hashSync(password, 10),
    codeHash: bcrypt.hashSync(code, 8),
    expiresAt: Date.now() + config.otp.ttlMinutos * 60 * 1000,
    attempts: 0,
    lastSentAt: Date.now(),
  };

  req.session.success = `Enviamos um código para o seu WhatsApp ${maskPhone(phoneRaw)}.`;
  res.redirect('/register/verify');
});

router.get('/register/verify', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  const pending = req.session.pendingReg;
  if (!pending) return res.redirect('/register');
  res.render('verify-code', {
    maskedPhone: maskPhone(pending.phoneRaw),
    codeLength: config.otp.length,
    cooldown: config.otp.reenvioCooldownSeg,
  });
});

router.post('/register/verify', async (req, res) => {
  const pending = req.session.pendingReg;
  if (!pending) return res.redirect('/register');

  const code = String(req.body.code || '').trim();

  if (Date.now() > pending.expiresAt) {
    delete req.session.pendingReg;
    req.session.error = 'O código expirou. Faça o cadastro novamente.';
    return res.redirect('/register');
  }

  if (!bcrypt.compareSync(code, pending.codeHash)) {
    pending.attempts += 1;
    if (pending.attempts >= config.otp.maxTentativas) {
      delete req.session.pendingReg;
      req.session.error = 'Muitas tentativas incorretas. Faça o cadastro novamente.';
      return res.redirect('/register');
    }
    const restantes = config.otp.maxTentativas - pending.attempts;
    req.session.error = `Código incorreto. Você tem mais ${restantes} tentativa(s).`;
    return res.redirect('/register/verify');
  }

  // Código correto — cria a conta de verdade e loga.
  const userId = await db.createUser(
    pending.name, pending.email, pending.passwordHash, pending.phoneRaw, '', [], [],
    {
      linkedin: pending.linkedin, instagram: pending.instagram, x: pending.x,
      substack: pending.substack, photoUrl: pending.photoUrl,
    }
  );
  req.session.user = { id: userId, name: pending.name, email: pending.email };
  delete req.session.pendingReg;
  req.session.success = 'Número verificado! Cadastro concluído. Complete seu perfil.';
  res.redirect('/profile');
});

router.post('/register/resend', async (req, res) => {
  const pending = req.session.pendingReg;
  if (!pending) return res.redirect('/register');

  const elapsed = (Date.now() - pending.lastSentAt) / 1000;
  if (elapsed < config.otp.reenvioCooldownSeg) {
    req.session.error = `Aguarde ${Math.ceil(config.otp.reenvioCooldownSeg - elapsed)}s para reenviar.`;
    return res.redirect('/register/verify');
  }

  const code = whatsapp.generateCode();
  try {
    await whatsapp.sendCode(pending.phoneRaw, code);
  } catch (err) {
    console.error('[register] falha ao reenviar código:', err.message);
    req.session.error = 'Não conseguimos reenviar o código agora. Tente novamente.';
    return res.redirect('/register/verify');
  }
  pending.codeHash = bcrypt.hashSync(code, 8);
  pending.expiresAt = Date.now() + config.otp.ttlMinutos * 60 * 1000;
  pending.lastSentAt = Date.now();
  req.session.success = 'Enviamos um novo código para o seu WhatsApp.';
  res.redirect('/register/verify');
});

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.render('login', {
    error: req.query.banned ? 'Sua conta foi banida. Fale com um administrador.' : res.locals.error,
  });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    req.session.error = 'Email e senha são obrigatórios.';
    return res.redirect('/login');
  }

  const user = await db.findUserByEmail(email);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    req.session.error = 'Email ou senha incorretos.';
    return res.redirect('/login');
  }
  if (Number(user.is_banned) === 1) {
    return res.redirect('/login?banned=1');
  }

  req.session.user = { id: user.id, name: user.name, email: user.email };
  req.session.success = `Bem-vindo de volta, ${user.name}!`;
  res.redirect('/dashboard');
});

router.get('/logout', (req, res) => {
  req.session = null;
  res.redirect('/');
});

module.exports = router;
