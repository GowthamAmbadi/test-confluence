/* ============================================================
   CONFLUENCE 2026 — toast.js
   ============================================================ */

(function () {
  // Inject styles once
  if (!document.getElementById('toast-styles')) {
    const style = document.createElement('style');
    style.id = 'toast-styles';
    style.textContent = `
      #toast-container {
        position: fixed; bottom: 2rem; right: 2rem;
        z-index: 9999;
        display: flex; flex-direction: column; gap: 0.75rem;
        pointer-events: none;
      }
      .toast {
        display: flex; align-items: flex-start; gap: 0.75rem;
        background: rgba(26,21,16,0.92);
        backdrop-filter: blur(24px) saturate(180%);
        border: 1px solid rgba(255,255,255,0.09);
        border-radius: 12px;
        padding: 1rem 1.25rem;
        min-width: 280px; max-width: 360px;
        box-shadow: 0 12px 40px rgba(0,0,0,0.3);
        pointer-events: auto;
        animation: toastIn 0.4s cubic-bezier(0.16,1,0.3,1) forwards;
      }
      .toast.out { animation: toastOut 0.3s ease forwards; }
      .toast-icon {
        width: 20px; height: 20px; flex-shrink: 0;
        border-radius: 50%; display: flex; align-items: center; justify-content: center;
        font-size: 0.7rem; margin-top: 1px;
      }
      .toast-icon.success { background: rgba(34,142,80,0.2); color: #4ade80; }
      .toast-icon.error { background: rgba(212,85,42,0.2); color: #E8784A; }
      .toast-icon.info { background: rgba(201,168,76,0.2); color: #E2C577; }
      .toast-body { flex: 1; }
      .toast-title { font-size: 0.82rem; font-weight: 500; color: rgba(255,255,255,0.9); margin-bottom: 0.2rem; font-family: 'Outfit', sans-serif; }
      .toast-msg { font-size: 0.76rem; color: rgba(255,255,255,0.5); font-family: 'Outfit', sans-serif; line-height: 1.45; }
      .toast-close { background: none; border: none; cursor: pointer; color: rgba(255,255,255,0.3); font-size: 1rem; padding: 0; line-height: 1; transition: color 0.15s; flex-shrink: 0; }
      .toast-close:hover { color: rgba(255,255,255,0.7); }
      @keyframes toastIn { from { opacity:0; transform: translateX(20px) scale(0.95); } to { opacity:1; transform: none; } }
      @keyframes toastOut { to { opacity:0; transform: translateX(20px) scale(0.95); } }
      @media (max-width: 600px) {
        #toast-container { bottom: 1rem; right: 1rem; left: 1rem; }
        .toast { min-width: unset; max-width: 100%; }
      }
    `;
    document.head.appendChild(style);
  }

  // Container
  function getContainer() {
    let c = document.getElementById('toast-container');
    if (!c) { c = document.createElement('div'); c.id = 'toast-container'; document.body.appendChild(c); }
    return c;
  }

  const ICONS = {
    success: '✓',
    error: '✕',
    info: '◆'
  };

  window.toast = function (msg, type = 'info', title = '') {
    const c = getContainer();
    const el = document.createElement('div');
    el.className = 'toast';

    const titles = { success: 'Done', error: 'Notice', info: 'Info' };
    const displayTitle = title || titles[type] || 'Notice';

    el.innerHTML = `
      <div class="toast-icon ${type}">${ICONS[type] || '◆'}</div>
      <div class="toast-body">
        <div class="toast-title">${displayTitle}</div>
        ${msg ? `<div class="toast-msg">${msg}</div>` : ''}
      </div>
      <button class="toast-close" onclick="this.closest('.toast').remove()">×</button>
    `;

    c.appendChild(el);

    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 300);
    }, 4000);
  };

  window.toast.success = (msg, title) => window.toast(msg, 'success', title);
  window.toast.error = (msg, title) => window.toast(msg, 'error', title);
  window.toast.info = (msg, title) => window.toast(msg, 'info', title);
})();
