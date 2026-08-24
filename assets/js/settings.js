/* ==== SETTINGS.JS ===== */

let settingsId = null;

function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(' ').filter(Boolean);
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const icon = document.getElementById('theme-icon');
    if (icon) icon.className = theme === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
    localStorage.setItem('inno-theme', theme);
}

window.toggleTheme = function () {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark');
};

let originalValues = {};

async function loadSettings() {
    const { data, error } = await db.from('settings').select('*').single();
    if (error) { showToast('Failed to load settings.', 'error'); return; }

    settingsId = data.id;
    window.appSettings = Object.freeze({ ...data });

    document.getElementById('s-currency-code').value = data.currency_code || 'USD';
    document.getElementById('s-currency-position').value = data.currency_position || 'before';

    originalValues = {
        currency_code: data.currency_code || 'USD',
        currency_position: data.currency_position || 'before'
    };

    document.getElementById('skeleton-card').style.display = 'none';
    document.getElementById('real-settings').style.display = 'flex';
}

window.saveSection = async function (section) {
    if (!settingsId || section !== 'inventory') return;

    const btn = document.querySelector('#inventory-saved')?.closest('.settings-card-footer')?.querySelector('.btn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<div class="btn-spinner"></div><span>Saving...</span>';
    }

    const newValues = {
        currency_code: document.getElementById('s-currency-code').value,
        currency_position: document.getElementById('s-currency-position').value
    };

    const payload = { ...newValues, updated_at: new Date().toISOString(), updated_by: window.currentUser.id };

    const { error } = await db.from('settings').update(payload).eq('id', settingsId);

    if (error) {
        showToast(error.message || 'Failed to save settings.', 'error');
        resetBtn(btn);
        return;
    }

    const { data: fresh } = await db.from('settings').select('*').single();
    if (fresh) window.appSettings = Object.freeze({ ...fresh });

    const changes = [];
    if (originalValues.currency_code !== newValues.currency_code) changes.push(`Currency: ${originalValues.currency_code} → ${newValues.currency_code}`);
    if (originalValues.currency_position !== newValues.currency_position) changes.push(`Currency position: ${originalValues.currency_position} → ${newValues.currency_position}`);

    await logActivity('edit', 'settings', settingsId, 'System Settings', changes.length ? changes.join(' · ') : 'No changes detected');

    originalValues = newValues;
    showSavedIndicator('inventory');
    showToast('Settings saved.', 'success');

    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-check"></i> Save Changes'; }
};

function resetBtn(btn) {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-check"></i> Save Changes'; }
}

function showSavedIndicator(section) {
    const el = document.getElementById('inventory-saved');
    if (!el) return;
    el.className = 'save-indicator saved';
    el.innerHTML = '<i class="fa-solid fa-circle-check"></i> Saved';
    setTimeout(() => { el.className = 'save-indicator'; el.innerHTML = ''; }, 3000);
}

/* ── Clear logs modal (unchanged) ── */
window.openClearLogsModal = function () {
    document.getElementById('clear-confirm-input').value = '';
    document.getElementById('clear-confirm-btn').disabled = true;
    document.getElementById('clear-logs-modal').classList.add('show');
};
window.closeClearLogsModal = function () {
    document.getElementById('clear-logs-modal').classList.remove('show');
};
window.onClearInput = function () {
    const val = document.getElementById('clear-confirm-input').value;
    document.getElementById('clear-confirm-btn').disabled = val !== 'CLEAR LOGS';
};
window.confirmClearLogs = async function () {
    const btn = document.getElementById('clear-confirm-btn');
    btn.disabled = true;
    btn.innerHTML = '<div class="btn-spinner"></div><span>Clearing...</span>';

    const { error } = await db.from('activity_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    if (error) {
        showToast(error.message || 'Failed to clear logs.', 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-trash"></i> Clear All Logs';
        return;
    }

    await logActivity('delete', 'activity_logs', null, 'All Activity Logs', 'Manually cleared by admin');
    showToast('Activity logs cleared.', 'success');
    closeClearLogsModal();
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-trash"></i> Clear All Logs';
};

document.getElementById('clear-logs-modal').addEventListener('click', function (e) {
    if (e.target === this) closeClearLogsModal();
});
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeClearLogsModal();
});

/* ═════ INIT ═════ */
(async function init() {
    await new Promise(resolve => {
        if (window.currentUser) { resolve(); return; }
        window.addEventListener('inno-auth-ready', resolve, { once: true });
    });

    const initials = getInitials(window.currentUser.full_name || window.currentUser.username);
    document.getElementById('topbar-avatar').textContent = initials;
    document.getElementById('topbar-username').textContent = '@' + window.currentUser.username;

    applyTheme(localStorage.getItem('inno-theme') || 'light');
    renderSidebar('settings', window.currentUser.role);
    await loadSettings();
})();