/* ==== TOAST.JS ==== */
window.showToast = function (message, type = 'error') {
    let color, icon, hasSpinner = false;
    if (type === 'success') {
        color = '#16a34a';
        icon = '<circle cx="12" cy="12" r="10"></circle><polyline points="20 6 9 17 4 12"></polyline>';
    } else if (type === 'info') {
        color = '#f97316'; hasSpinner = true;
    } else {
        color = '#dc2626';
        icon = '<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>';
    }
    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:99999;pointer-events:none;font-family:Poppins,sans-serif;';
    const inner = document.createElement('div');
    inner.style.cssText = `background:${color};color:white;padding:8px 14px;border-radius:10px;font-weight:600;font-size:14px;box-shadow:0 12px 32px rgba(0,0,0,0.3);display:flex;align-items:center;gap:8px;width:fit-content;max-width:90vw;min-width:280px;opacity:0;transform:translateY(-30px);transition:all 0.5s ease;border:1px solid rgba(255,255,255,0.1);`;
    inner.innerHTML = hasSpinner
        ? '<div style="width:24px;height:24px;border:4px solid #ffffff40;border-top:4px solid white;border-radius:50%;animation:toastSpin 1s linear infinite;"></div>'
        : `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>`;
    inner.innerHTML += `<span>${message}</span>`;
    toast.appendChild(inner);
    document.body.appendChild(toast);
    requestAnimationFrame(() => { inner.style.opacity = '1'; inner.style.transform = 'translateY(0)'; });
    setTimeout(() => { inner.style.opacity = '0'; inner.style.transform = 'translateY(-30px)'; setTimeout(() => toast.remove(), 600); }, 4000);
};
if (!document.getElementById('toast-spin-style')) {
    const s = document.createElement('style');
    s.id = 'toast-spin-style';
    s.textContent = '@keyframes toastSpin { to { transform: rotate(360deg); } }';
    document.head.appendChild(s);
}