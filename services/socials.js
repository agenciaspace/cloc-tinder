/* ---------------------------------------------------------------------------
   Redes sociais: o usuário informa só o @handle. Guardamos o handle limpo e
   montamos a URL completa na exibição.
   --------------------------------------------------------------------------- */

const NETWORKS = ['linkedin', 'instagram', 'x', 'substack'];

// Extrai o handle "limpo" de um @handle, handle puro ou URL colada.
function cleanHandle(raw) {
  let s = String(raw || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      const seg = u.pathname.replace(/\/+$/, '').split('/').filter(Boolean).pop();
      s = seg || u.hostname.split('.')[0];
    } catch { /* mantém s */ }
  } else if (s.includes('/')) {
    // colou algo como "linkedin.com/in/maria" sem protocolo
    s = s.replace(/\/+$/, '').split('/').filter(Boolean).pop() || s;
  }
  s = s.replace(/^@+/, '').replace(/\s+/g, '');
  return s.slice(0, 80);
}

// Monta a URL pública a partir do handle.
function socialUrl(network, handle) {
  const h = String(handle || '').replace(/^@+/, '').trim();
  if (!h) return '';
  switch (network) {
    case 'linkedin': return 'https://www.linkedin.com/in/' + h;
    case 'instagram': return 'https://instagram.com/' + h;
    case 'x': return 'https://x.com/' + h;
    case 'substack': return 'https://substack.com/@' + h;
    default: return '';
  }
}

module.exports = { NETWORKS, cleanHandle, socialUrl };
