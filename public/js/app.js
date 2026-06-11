/* PWA: registra o service worker e gerencia inscrição de push. */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => console.error('SW falhou:', e));
  });
}

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function clocEnablePush(btn) {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert('Seu navegador não suporta notificações. No iPhone, adicione o app à Tela de Início primeiro.');
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { alert('Permissão de notificação negada.'); return; }

    const reg = await navigator.serviceWorker.ready;
    const res = await fetch('/push/public-key');
    const { key } = await res.json();
    if (!key) { alert('Notificações ainda não configuradas no servidor.'); return; }

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
    }
    await fetch('/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub),
    });
    if (btn) { btn.textContent = '🔔 Notificações ativadas'; btn.disabled = true; }
  } catch (e) {
    console.error('push:', e);
    alert('Não foi possível ativar as notificações.');
  }
}
