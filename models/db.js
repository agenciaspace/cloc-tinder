/* ---------------------------------------------------------------------------
   Camada de dados — Supabase (Postgres via @supabase/supabase-js).
   Acesso no servidor com a chave service_role (ignora RLS).
   Todas as funções são assíncronas.
   --------------------------------------------------------------------------- */
const { createClient } = require('@supabase/supabase-js');
const config = require('../config/whatsapp');
const phone = require('../services/phone');

const supabase = createClient(config.supabase.url, config.supabase.serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Lança em caso de erro do Supabase (deixa o handler tratar/registrar).
function ok(res) {
  if (res.error) throw new Error(`[supabase] ${res.error.message}`);
  return res;
}

// Verifica conectividade no boot (não derruba o app se falhar).
async function initDb() {
  const { error } = await supabase.from('users').select('id', { count: 'exact', head: true });
  if (error) console.error('[db] Supabase indisponível:', error.message);
  else console.log('[db] conectado ao Supabase');
}

/* ---------- Usuários ---------- */

async function createUser(name, email, password, phoneRaw, bio, skills, helpCategories) {
  const { data } = ok(await supabase.from('users').insert({
    name, email, password,
    phone: phoneRaw || '', bio: bio || '',
    skills: skills || [], help_categories: helpCategories || [],
    phone_e164: phone.canonical(phoneRaw) || '',
  }).select('id').single());
  return data.id;
}

async function findUserByEmail(email) {
  const { data } = ok(await supabase.from('users').select('*').eq('email', email).maybeSingle());
  return data || null;
}

async function findUserById(id) {
  const { data } = ok(await supabase.from('users').select('*').eq('id', Number(id)).maybeSingle());
  return data || null;
}

async function updateUser(id, fields) {
  const allowed = ['name', 'phone', 'bio', 'skills', 'help_categories', 'available', 'can_help', 'needs_help'];
  const obj = {};
  for (const key of allowed) if (fields[key] !== undefined) obj[key] = fields[key];
  if (Object.keys(obj).length === 0) return;
  ok(await supabase.from('users').update(obj).eq('id', Number(id)));
}

async function getProfileByUserId(id) {
  const user = await findUserById(id);
  if (!user) return null;
  return { ...user, password: undefined };
}

/* ---------- Necessidades ---------- */

async function createNeed(title, description, category, requesterName, requesterPhone, requesterId) {
  const { data } = ok(await supabase.from('needs').insert({
    title, description: description || '', category: category || 'outro',
    requester_name: requesterName || '', requester_phone: requesterPhone || '',
    requester_id: requesterId || null,
  }).select('id').single());
  return data.id;
}

async function getOpenNeeds() {
  const { data } = ok(await supabase.from('needs').select('*').eq('status', 'open').order('created_at', { ascending: false }));
  return data || [];
}

async function getNeedsByUserId(userId) {
  const { data } = ok(await supabase.from('needs').select('*').eq('requester_id', Number(userId)).order('created_at', { ascending: false }));
  return data || [];
}

async function getNeedById(id) {
  const { data } = ok(await supabase.from('needs').select('*').eq('id', Number(id)).maybeSingle());
  return data || null;
}

async function updateNeed(id, fields) {
  const allowed = ['title', 'description', 'category', 'status', 'helper_id'];
  const obj = {};
  for (const key of allowed) if (fields[key] !== undefined) obj[key] = fields[key];
  if (Object.keys(obj).length === 0) return;
  ok(await supabase.from('needs').update(obj).eq('id', Number(id)));
}

/* ---------- Matches ---------- */

async function createMatch(needId, helperId) {
  const { data } = ok(await supabase.from('matches').insert({
    need_id: Number(needId), helper_id: Number(helperId),
  }).select('id').single());
  return data.id;
}

async function getMatchesByHelperId(helperId) {
  const { data } = ok(await supabase.from('matches')
    .select('id,need_id,helper_id,status, needs(title,description,category,requester_name,status)')
    .eq('helper_id', Number(helperId))
    .order('created_at', { ascending: false }));
  return (data || []).map(r => ({
    id: r.id, need_id: r.need_id, helper_id: r.helper_id, status: r.status,
    need_title: r.needs?.title, need_description: r.needs?.description,
    need_category: r.needs?.category, requester_name: r.needs?.requester_name,
    need_status: r.needs?.status,
  }));
}

async function getMatchById(id) {
  const { data } = ok(await supabase.from('matches').select('*').eq('id', Number(id)).maybeSingle());
  return data || null;
}

async function updateMatch(id, status) {
  ok(await supabase.from('matches').update({ status }).eq('id', Number(id)));
}

async function getPotentialHelpers(needCategory, excludeUserId) {
  const { data } = ok(await supabase.from('users').select('*')
    .eq('available', 1).neq('id', Number(excludeUserId)));
  return (data || [])
    .filter(u => {
      const cats = u.help_categories || [];
      return cats.includes(needCategory) || cats.includes('*');
    })
    .map(u => ({ ...u, skills: u.skills || [], help_categories: u.help_categories || [] }));
}

/* ---------- Notificações ---------- */

async function createNotification(userId, message, type) {
  ok(await supabase.from('notifications').insert({ user_id: Number(userId), message, type: type || 'info' }));
}

async function getNotificationsByUserId(userId) {
  const { data } = ok(await supabase.from('notifications').select('*')
    .eq('user_id', Number(userId)).order('created_at', { ascending: false }).limit(20));
  return data || [];
}

async function markNotificationsRead(userId) {
  ok(await supabase.from('notifications').update({ read: 1 }).eq('user_id', Number(userId)));
}

async function getUnreadNotificationCount(userId) {
  const { count } = ok(await supabase.from('notifications')
    .select('id', { count: 'exact', head: true }).eq('user_id', Number(userId)).eq('read', 0));
  return count || 0;
}

async function searchNeeds(query) {
  const q = String(query || '').replace(/[,()]/g, ' ').trim();
  const like = `%${q}%`;
  const { data } = ok(await supabase.from('needs').select('*')
    .eq('status', 'open')
    .or(`title.ilike.${like},description.ilike.${like},category.ilike.${like}`)
    .order('created_at', { ascending: false }));
  return data || [];
}

/* ---------- Membros do grupo WhatsApp (cache) ---------- */

async function replaceGroupMembers(members) {
  ok(await supabase.from('group_members').delete().not('phone', 'is', null));
  const seen = new Set();
  const rows = (members || [])
    .filter(m => m.phone && !seen.has(m.phone) && seen.add(m.phone))
    .map(m => ({ phone: m.phone, jid: m.jid || '', is_admin: m.isAdmin ? 1 : 0 }));
  if (rows.length) ok(await supabase.from('group_members').upsert(rows, { onConflict: 'phone' }));
}

async function isPhoneAllowed(rawPhone) {
  const cands = phone.variants(rawPhone);
  if (cands.length === 0) return false;
  const { data } = ok(await supabase.from('group_members').select('phone').in('phone', cands).limit(1));
  return (data || []).length > 0;
}

async function isPhoneRegistered(rawPhone) {
  const cands = phone.variants(rawPhone);
  if (cands.length === 0) return false;
  const { data } = ok(await supabase.from('users').select('id').in('phone_e164', cands).limit(1));
  return (data || []).length > 0;
}

async function getMemberStats() {
  const { count } = ok(await supabase.from('group_members').select('phone', { count: 'exact', head: true }));
  const { data } = ok(await supabase.from('group_members').select('synced_at').order('synced_at', { ascending: false }).limit(1));
  return { count: count || 0, lastSyncedAt: data && data[0] ? data[0].synced_at : null };
}

/* ---------- Administração ---------- */

async function getAllUsers() {
  const { data } = ok(await supabase.from('users')
    .select('id,name,email,phone,phone_e164,is_admin,is_banned,created_at')
    .order('created_at', { ascending: false }));
  return data || [];
}

async function setUserAdmin(id, value) {
  ok(await supabase.from('users').update({ is_admin: value ? 1 : 0 }).eq('id', Number(id)));
}

async function setUserBanned(id, value) {
  ok(await supabase.from('users').update({ is_banned: value ? 1 : 0 }).eq('id', Number(id)));
}

// FKs com ON DELETE CASCADE removem necessidades, matches e notificações do usuário.
async function deleteUserCascade(id) {
  ok(await supabase.from('users').delete().eq('id', Number(id)));
}

async function getAllNeeds() {
  const { data } = ok(await supabase.from('needs')
    .select('*, matches(count)')
    .order('created_at', { ascending: false }));
  return (data || []).map(n => ({ ...n, offers: n.matches && n.matches[0] ? n.matches[0].count : 0 }));
}

async function getAllMatches() {
  const { data } = ok(await supabase.from('matches')
    .select('id,status,created_at, needs(title,category,status,requester_name), users(name)')
    .order('created_at', { ascending: false }));
  return (data || []).map(m => ({
    id: m.id, status: m.status, created_at: m.created_at,
    need_title: m.needs?.title, need_category: m.needs?.category, need_status: m.needs?.status,
    requester_name: m.needs?.requester_name, helper_name: m.users?.name,
  }));
}

// FK matches.need_id ON DELETE CASCADE remove os matches da necessidade.
async function deleteNeed(id) {
  ok(await supabase.from('needs').delete().eq('id', Number(id)));
}

async function getStats() {
  const cnt = async (table, filter) => {
    let query = supabase.from(table).select('id', { count: 'exact', head: true });
    if (filter) query = filter(query);
    const { count } = ok(await query);
    return count || 0;
  };
  return {
    users: await cnt('users'),
    admins: await cnt('users', q => q.eq('is_admin', 1)),
    banned: await cnt('users', q => q.eq('is_banned', 1)),
    needsTotal: await cnt('needs'),
    needsOpen: await cnt('needs', q => q.eq('status', 'open')),
    needsMatched: await cnt('needs', q => q.eq('status', 'matched')),
    matchesTotal: await cnt('matches'),
    matchesAccepted: await cnt('matches', q => q.eq('status', 'accepted')),
  };
}

module.exports = {
  initDb, createUser, findUserByEmail, findUserById,
  replaceGroupMembers, isPhoneAllowed, isPhoneRegistered, getMemberStats,
  getAllUsers, setUserAdmin, setUserBanned, deleteUserCascade,
  getAllNeeds, getAllMatches, deleteNeed, getStats,
  updateUser, getProfileByUserId,
  createNeed, getOpenNeeds, getNeedsByUserId, getNeedById, updateNeed,
  createMatch, getMatchesByHelperId, getMatchById, updateMatch, getPotentialHelpers,
  createNotification, getNotificationsByUserId, markNotificationsRead, getUnreadNotificationCount,
  searchNeeds,
};
