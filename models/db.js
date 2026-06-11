/* ---------------------------------------------------------------------------
   Camada de dados — Supabase (Postgres via REST, cliente service_role).
   Todas as funções são assíncronas. As tabelas são criadas pelo schema.sql.
   --------------------------------------------------------------------------- */
const { createClient } = require('@supabase/supabase-js');
const config = require('../config/whatsapp');
const phone = require('../services/phone');

const sb = createClient(
  config.supabase.url,
  config.supabase.serviceKey,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// Desempacota uma resposta do supabase, lançando erro legível.
function unwrap({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

// Verifica conectividade no boot (não cria schema — isso é feito por schema.sql).
async function initDb() {
  if (!config.supabase.url || !config.supabase.serviceKey) {
    console.warn('[db] Supabase não configurado (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).');
    return;
  }
  const { error } = await sb.from('group_members').select('phone', { head: true, count: 'exact' });
  if (error) console.warn('[db] aviso ao conectar no Supabase:', error.message, '(rodou o schema.sql?)');
}

/* ---------- Usuários ---------- */

async function createUser(name, email, password, phoneRaw, bio, skills, helpCategories, extra = {}) {
  const e164 = phone.canonical(phoneRaw) || '';
  const data = unwrap(await sb.from('users').insert({
    name, email, password,
    phone: phoneRaw || '', bio: bio || '',
    skills: skills || [], help_categories: helpCategories || [],
    phone_e164: e164,
    linkedin: extra.linkedin || '',
    instagram: extra.instagram || '',
    x: extra.x || '',
    substack: extra.substack || '',
    photo_url: extra.photoUrl || '',
  }).select('id').single());
  return data.id;
}

async function findUserByEmail(email) {
  return unwrap(await sb.from('users').select('*').eq('email', email).maybeSingle());
}

async function findUserById(id) {
  return unwrap(await sb.from('users').select('*').eq('id', Number(id)).maybeSingle());
}

async function updateUser(id, fields) {
  const allowed = ['name', 'phone', 'bio', 'skills', 'help_categories', 'available', 'can_help', 'needs_help', 'linkedin', 'instagram', 'x', 'substack', 'photo_url'];
  const upd = {};
  for (const key of allowed) if (fields[key] !== undefined) upd[key] = fields[key];
  if (Object.keys(upd).length === 0) return;
  unwrap(await sb.from('users').update(upd).eq('id', Number(id)));
}

async function getProfileByUserId(id) {
  const user = await findUserById(id);
  if (!user) return null;
  return { ...user, skills: user.skills || [], help_categories: user.help_categories || [], password: undefined };
}

/* ---------- Necessidades ---------- */

async function createNeed(title, description, category, requesterName, requesterPhone, requesterId) {
  const data = unwrap(await sb.from('needs').insert({
    title, description: description || '', category: category || 'outro',
    requester_name: requesterName || '', requester_phone: requesterPhone || '',
    requester_id: requesterId,
  }).select('id').single());
  return data.id;
}

async function getOpenNeeds() {
  return unwrap(await sb.from('needs').select('*').eq('status', 'open').order('created_at', { ascending: false }));
}

async function getNeedsByUserId(userId) {
  return unwrap(await sb.from('needs').select('*').eq('requester_id', Number(userId)).order('created_at', { ascending: false }));
}

async function getNeedById(id) {
  return unwrap(await sb.from('needs').select('*').eq('id', Number(id)).maybeSingle());
}

async function updateNeed(id, fields) {
  const allowed = ['title', 'description', 'category', 'status', 'helper_id'];
  const upd = {};
  for (const key of allowed) if (fields[key] !== undefined) upd[key] = fields[key];
  if (Object.keys(upd).length === 0) return;
  unwrap(await sb.from('needs').update(upd).eq('id', Number(id)));
}

/* ---------- Matches ---------- */

async function createMatch(needId, helperId) {
  const data = unwrap(await sb.from('matches').insert({
    need_id: Number(needId), helper_id: Number(helperId),
  }).select('id').single());
  return data.id;
}

async function getMatchesByHelperId(helperId) {
  const rows = unwrap(await sb.from('matches')
    .select('id, need_id, helper_id, status, needs(title, description, category, requester_name, status)')
    .eq('helper_id', Number(helperId))
    .order('created_at', { ascending: false }));
  return rows.map(r => ({
    id: r.id, need_id: r.need_id, helper_id: r.helper_id, status: r.status,
    need_title: r.needs?.title, need_description: r.needs?.description,
    need_category: r.needs?.category, requester_name: r.needs?.requester_name,
    need_status: r.needs?.status,
  }));
}

async function getMatchById(id) {
  return unwrap(await sb.from('matches').select('*').eq('id', Number(id)).maybeSingle());
}

async function updateMatch(id, status) {
  unwrap(await sb.from('matches').update({ status }).eq('id', Number(id)));
}

async function getPotentialHelpers(needCategory, excludeUserId) {
  const all = unwrap(await sb.from('users').select('*').eq('available', 1).neq('id', Number(excludeUserId)));
  return all
    .filter(u => {
      const cats = u.help_categories || [];
      return cats.includes(needCategory) || cats.includes('*');
    })
    .map(u => ({ ...u, skills: u.skills || [], help_categories: u.help_categories || [] }));
}

/* ---------- Notificações ---------- */

async function createNotification(userId, message, type) {
  unwrap(await sb.from('notifications').insert({ user_id: Number(userId), message, type: type || 'info' }));
}

async function getNotificationsByUserId(userId) {
  return unwrap(await sb.from('notifications').select('*').eq('user_id', Number(userId)).order('created_at', { ascending: false }).limit(20));
}

async function markNotificationsRead(userId) {
  unwrap(await sb.from('notifications').update({ read: 1 }).eq('user_id', Number(userId)));
}

async function getUnreadNotificationCount(userId) {
  const { count, error } = await sb.from('notifications').select('*', { count: 'exact', head: true })
    .eq('user_id', Number(userId)).eq('read', 0);
  if (error) throw new Error(error.message);
  return count || 0;
}

async function searchNeeds(query) {
  const q = String(query || '').replace(/[,()]/g, ' ');
  return unwrap(await sb.from('needs').select('*').eq('status', 'open')
    .or(`title.ilike.%${q}%,description.ilike.%${q}%,category.ilike.%${q}%`)
    .order('created_at', { ascending: false }));
}

/* ---------- Membros do grupo WhatsApp (cache de autorização) ---------- */

async function replaceGroupMembers(members) {
  const rows = members.filter(m => m.phone).map(m => ({
    phone: m.phone, jid: m.jid || '', name: m.name || '', photo: m.photo || '', is_admin: m.isAdmin ? 1 : 0,
  }));
  if (!rows.length) return;
  // Upsert primeiro (a tabela nunca fica vazia), depois remove quem saiu do grupo.
  unwrap(await sb.from('group_members').upsert(rows));
  const keep = rows.map(r => r.phone);
  unwrap(await sb.from('group_members').delete().not('phone', 'in', `(${keep.map(p => `"${p}"`).join(',')})`));
}

// Mapa phone -> { name, photo } do que já está salvo (para preservar entre syncs).
async function getGroupMemberInfoMap() {
  const rows = unwrap(await sb.from('group_members').select('phone, name, photo'));
  return new Map(rows.map(r => [r.phone, { name: r.name || '', photo: r.photo || '' }]));
}

async function isPhoneAllowed(rawPhone) {
  const cands = phone.variants(rawPhone);
  if (cands.length === 0) return false;
  const data = unwrap(await sb.from('group_members').select('phone').in('phone', cands).limit(1));
  return data.length > 0;
}

async function isPhoneRegistered(rawPhone) {
  const cands = phone.variants(rawPhone);
  if (cands.length === 0) return false;
  const data = unwrap(await sb.from('users').select('id').in('phone_e164', cands).limit(1));
  return data.length > 0;
}

// Todos os membros do grupo, indicando quem já se registrou (casa pelo telefone canônico).
async function getGroupMembersWithStatus() {
  const [members, users] = await Promise.all([
    unwrap(await sb.from('group_members').select('phone, jid, name, photo, is_admin')),
    unwrap(await sb.from('users').select('name, email, phone_e164, photo_url, is_admin, is_banned')),
  ]);
  const byPhone = new Map(users.filter(u => u.phone_e164).map(u => [u.phone_e164, u]));
  const list = members.map(m => {
    const u = byPhone.get(m.phone) || null;
    // Nome/foto: conta registrada tem prioridade; senão usa o do WhatsApp.
    return {
      phone: m.phone,
      groupAdmin: Number(m.is_admin) === 1,
      registered: !!u,
      name: u ? u.name : (m.name || null),
      email: u ? u.email : null,
      photo_url: u ? (u.photo_url || m.photo || null) : (m.photo || null),
      is_banned: u ? Number(u.is_banned) === 1 : false,
    };
  });
  // registrados primeiro, depois por telefone
  list.sort((a, b) => (b.registered - a.registered) || a.phone.localeCompare(b.phone));
  const registered = list.filter(m => m.registered).length;
  return { list, total: list.length, registered, pending: list.length - registered };
}

async function getMemberStats() {
  const { count, error } = await sb.from('group_members').select('*', { count: 'exact', head: true });
  if (error) throw new Error(error.message);
  const last = unwrap(await sb.from('group_members').select('synced_at').order('synced_at', { ascending: false }).limit(1));
  return { count: count || 0, lastSyncedAt: last[0]?.synced_at || null };
}

/* ---------- Administração ---------- */

async function getAllUsers() {
  return unwrap(await sb.from('users')
    .select('id, name, email, phone, phone_e164, linkedin, photo_url, is_admin, is_banned, created_at')
    .order('created_at', { ascending: false }));
}

async function setUserAdmin(id, value) {
  unwrap(await sb.from('users').update({ is_admin: value ? 1 : 0 }).eq('id', Number(id)));
}

async function setUserBanned(id, value) {
  unwrap(await sb.from('users').update({ is_banned: value ? 1 : 0 }).eq('id', Number(id)));
}

async function deleteUserCascade(id) {
  const uid = Number(id);
  // needs do solicitante (cascata remove os matches dessas needs)
  unwrap(await sb.from('needs').delete().eq('requester_id', uid));
  unwrap(await sb.from('notifications').delete().eq('user_id', uid));
  // remover o usuário cascateia os matches em que ele era voluntário (FK on delete cascade)
  unwrap(await sb.from('users').delete().eq('id', uid));
}

async function getAllNeeds() {
  const data = unwrap(await sb.from('needs').select('*, matches(count)').order('created_at', { ascending: false }));
  return data.map(n => ({ ...n, offers: n.matches?.[0]?.count ?? 0 }));
}

async function getAllMatches() {
  const rows = unwrap(await sb.from('matches')
    .select('id, status, created_at, needs(title, category, status, requester_name), helper:users(name)')
    .order('created_at', { ascending: false }));
  return rows.map(r => ({
    id: r.id, status: r.status, created_at: r.created_at,
    need_title: r.needs?.title, need_category: r.needs?.category, need_status: r.needs?.status,
    requester_name: r.needs?.requester_name, helper_name: r.helper?.name,
  }));
}

async function deleteNeed(id) {
  unwrap(await sb.from('needs').delete().eq('id', Number(id)));
}

/* ---------- Push subscriptions ---------- */

async function savePushSubscription(userId, sub) {
  unwrap(await sb.from('push_subscriptions').upsert(
    { user_id: Number(userId), endpoint: sub.endpoint, keys: sub.keys },
    { onConflict: 'endpoint' }
  ));
}

async function getPushSubscriptionsByUser(userId) {
  return unwrap(await sb.from('push_subscriptions').select('endpoint, keys').eq('user_id', Number(userId)));
}

async function deletePushSubscription(endpoint) {
  unwrap(await sb.from('push_subscriptions').delete().eq('endpoint', endpoint));
}

async function getStats() {
  const count = async (table, apply) => {
    let qb = sb.from(table).select('*', { count: 'exact', head: true });
    if (apply) qb = apply(qb);
    const { count: c, error } = await qb;
    if (error) throw new Error(error.message);
    return c || 0;
  };
  const [users, admins, banned, needsTotal, needsOpen, needsMatched, matchesTotal, matchesAccepted] = await Promise.all([
    count('users'),
    count('users', q => q.eq('is_admin', 1)),
    count('users', q => q.eq('is_banned', 1)),
    count('needs'),
    count('needs', q => q.eq('status', 'open')),
    count('needs', q => q.eq('status', 'matched')),
    count('matches'),
    count('matches', q => q.eq('status', 'accepted')),
  ]);
  return { users, admins, banned, needsTotal, needsOpen, needsMatched, matchesTotal, matchesAccepted };
}

module.exports = {
  initDb, createUser, findUserByEmail, findUserById,
  updateUser, getProfileByUserId,
  replaceGroupMembers, isPhoneAllowed, isPhoneRegistered, getMemberStats, getGroupMembersWithStatus,
  getGroupMemberInfoMap,
  getAllUsers, setUserAdmin, setUserBanned, deleteUserCascade,
  getAllNeeds, getAllMatches, deleteNeed, getStats,
  savePushSubscription, getPushSubscriptionsByUser, deletePushSubscription,
  createNeed, getOpenNeeds, getNeedsByUserId, getNeedById, updateNeed,
  createMatch, getMatchesByHelperId, getMatchById, updateMatch, getPotentialHelpers,
  createNotification, getNotificationsByUserId, markNotificationsRead, getUnreadNotificationCount,
  searchNeeds,
};
