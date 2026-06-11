/* PWA: registra o service worker e gerencia inscrição de push. */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => console.error('SW falhou:', e));
  });
}

/* Prompt de instalação (Android/desktop). */
let clocDeferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  clocDeferredPrompt = e;
  if (document.getElementById('clocInstall')) return;
  const b = document.createElement('button');
  b.id = 'clocInstall';
  b.className = 'install-fab';
  b.textContent = '📲 Instalar app';
  b.onclick = async () => {
    if (!clocDeferredPrompt) return;
    clocDeferredPrompt.prompt();
    await clocDeferredPrompt.userChoice;
    clocDeferredPrompt = null;
    b.remove();
  };
  document.body.appendChild(b);
});
window.addEventListener('appinstalled', () => {
  const b = document.getElementById('clocInstall');
  if (b) b.remove();
});

/* Dica de instalação no iOS (sem beforeinstallprompt). */
(function iosInstallHint() {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (!isIOS || standalone) return;
  try { if (localStorage.getItem('iosHintDismissed')) return; } catch (_) {}
  window.addEventListener('load', () => {
    const d = document.createElement('div');
    d.className = 'ios-hint';
    d.innerHTML = '📲 Instale o app: toque em <b>Compartilhar</b> e depois <b>Adicionar à Tela de Início</b>. <span class="ios-x" role="button">✕</span>';
    d.querySelector('.ios-x').onclick = () => { d.remove(); try { localStorage.setItem('iosHintDismissed', '1'); } catch (_) {} };
    document.body.appendChild(d);
  });
})();

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
