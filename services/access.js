/* ---------------------------------------------------------------------------
   Regras de acesso de admin (fonte única da verdade).

   - Super-admin: vem do .env (ADMIN_EMAIL ou ADMIN_PHONES). É protegido —
     não pode ser rebaixado, banido ou removido pela interface.
   - Admin: super-admin OU promovido pela UI (users.is_admin = 1).

   Recebem a LINHA do usuário (do banco), não o objeto da sessão.
   --------------------------------------------------------------------------- */
const config = require('../config/whatsapp');

function isSuperAdmin(row) {
  if (!row) return false;
  const byEmail = config.adminEmail && String(row.email || '').toLowerCase() === config.adminEmail;
  const byPhone = row.phone_e164 && config.adminPhones.includes(row.phone_e164);
  return Boolean(byEmail || byPhone);
}

function isAdmin(row) {
  if (!row) return false;
  return isSuperAdmin(row) || Number(row.is_admin) === 1;
}

module.exports = { isAdmin, isSuperAdmin };
