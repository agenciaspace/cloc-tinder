/* ---------------------------------------------------------------------------
   Upload de avatar para o Supabase Storage (bucket público "avatars").
   --------------------------------------------------------------------------- */
const { createClient } = require('@supabase/supabase-js');
const config = require('../config/whatsapp');

const BUCKET = 'avatars';
const sb = createClient(config.supabase.url, config.supabase.serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

// Recebe o arquivo do multer (memória) e devolve a URL pública. Lança em erro.
async function uploadAvatar(file) {
  if (!file || !file.buffer) return '';
  const ext = EXT[file.mimetype];
  if (!ext) throw new Error('Formato de imagem inválido. Use PNG, JPG ou WEBP.');
  // nome único sem depender de Date.now()/random (indisponíveis): usa hash do conteúdo.
  const crypto = require('crypto');
  const hash = crypto.createHash('sha1').update(file.buffer).digest('hex').slice(0, 16);
  const pathname = `${hash}.${ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(pathname, file.buffer, {
    contentType: file.mimetype,
    upsert: true,
  });
  if (error) throw new Error('Falha ao enviar a foto: ' + error.message);
  const { data } = sb.storage.from(BUCKET).getPublicUrl(pathname);
  return data.publicUrl;
}

module.exports = { uploadAvatar };
