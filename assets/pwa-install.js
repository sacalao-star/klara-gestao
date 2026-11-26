(function () {
  if (typeof window === 'undefined') return;

  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
    });
  }

  if (isStandalone) return;

  const path = window.location.pathname;
  const appMeta = path.startsWith('/apontamento')
    ? { name: 'Klara Apontamento', desc: 'Bata o ponto com 1 toque direto da tela inicial', icon: '/assets/icons/klara-apontamento-192.png' }
    : path.startsWith('/colaborador') || path.startsWith('/painel')
    ? { name: 'Klara Colaborador', desc: 'Acompanhe espelho, comprovantes e chamados', icon: '/assets/icons/klara-colaborador-192.png' }
    : { name: 'Klara Pessoas (RH)', desc: 'Gestão completa de RH em modo aplicativo', icon: '/assets/icons/klara-rh-192.png' };

  let deferredPrompt = null;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

  function createBanner() {
    if (document.getElementById('klaraPwaBanner')) return;
    if (sessionStorage.getItem('klaraPwaDismissed') === '1') return;

    const wrap = document.createElement('div');
    wrap.id = 'klaraPwaBanner';
    wrap.setAttribute('role', 'region');
    wrap.setAttribute('aria-label', 'Instalar aplicativo');
    wrap.style.cssText = [
      'position:fixed',
      'left:50%',
      'bottom:16px',
      'transform:translateX(-50%)',
      'width:min(calc(100% - 24px), 440px)',
      'background:linear-gradient(135deg,#162044,#253775)',
      'color:#ffffff',
      'border:1px solid rgba(245,196,81,0.38)',
      'border-radius:16px',
      'padding:12px 14px',
      'box-shadow:0 18px 44px rgba(13,20,48,0.34)',
      'display:flex',
      'align-items:center',
      'gap:12px',
      'z-index:9999',
      'font-family:Inter,system-ui,-apple-system,sans-serif'
    ].join(';');

    wrap.innerHTML = `
      <img src="${appMeta.icon}" alt="${appMeta.name}" style="width:42px;height:42px;border-radius:11px;flex-shrink:0;border:1px solid rgba(255,255,255,0.2)">
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:800;letter-spacing:-.2px;display:flex;align-items:center;gap:6px">
          <span>${appMeta.name}</span>
          <span style="font-size:9px;background:rgba(16,185,129,0.2);color:#34d399;padding:2px 6px;border-radius:99px;font-weight:700">APP</span>
        </div>
        <div style="font-size:10px;color:#cbd5e1;margin-top:2px;line-height:1.35">${isIOS ? 'No Safari: toque em Compartilhar e "Adicionar à Tela de Início".' : appMeta.desc}</div>
      </div>
      ${isIOS ? '' : '<button id="klaraPwaInstallBtn" style="background:linear-gradient(135deg,#0ea5a4,#10b981);color:#fff;border:0;border-radius:10px;padding:8px 12px;font-size:11px;font-weight:800;cursor:pointer;white-space:nowrap;box-shadow:0 4px 12px rgba(16,185,129,0.35)">Instalar</button>'}
      <button id="klaraPwaCloseBtn" aria-label="Fechar" style="background:rgba(255,255,255,0.1);color:#cbd5e1;border:0;border-radius:8px;width:26px;height:26px;font-size:14px;cursor:pointer;flex-shrink:0">×</button>
    `;

    document.body.appendChild(wrap);

    const closeBtn = document.getElementById('klaraPwaCloseBtn');
    closeBtn?.addEventListener('click', () => {
      sessionStorage.setItem('klaraPwaDismissed', '1');
      wrap.remove();
    });

    const installBtn = document.getElementById('klaraPwaInstallBtn');
    installBtn?.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice.catch(() => ({ outcome: 'dismissed' }));
      deferredPrompt = null;
      if (choice.outcome === 'accepted') {
        wrap.remove();
      }
    });
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    createBanner();
  });

  if (isIOS) {
    window.addEventListener('load', () => setTimeout(createBanner, 1200));
  }

  window.addEventListener('appinstalled', () => {
    const b = document.getElementById('klaraPwaBanner');
    if (b) b.remove();
    deferredPrompt = null;
  });
})();
