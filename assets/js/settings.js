/* ==== SETTINGS.JS ===== */

let settingsId = null;
let selectedTheme = 'light';

/* ── Helpers ── */
function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(' ').filter(Boolean);
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function applyTheme(theme) {
    let resolved = theme;
    if (theme === 'system') {
        resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', resolved);
    const icon = document.getElementById('theme-icon');
    if (icon) icon.className = resolved === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
    localStorage.setItem('inno-theme', resolved);
}

window.toggleTheme = function () {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark');
};

/* ── Load settings ── */
async function loadSettings() {
    const { data, error } = await db
        .from('settings')
        .select('*')
        .single();

    if (error) {
        showToast('Failed to load settings.', 'error');
        return;
    }

    settingsId = data.id;

    /* Expose globally so other pages can use currency/date format */
    window.appSettings = Object.freeze({ ...data });

    /* Populate form fields */
    document.getElementById('s-company-name').value = data.company_name || '';
    document.getElementById('s-currency-symbol').value = data.currency_symbol || '$';
    document.getElementById('s-currency-position').value = data.currency_position || 'before';
    document.getElementById('s-date-format').value = data.date_format || 'DD/MM/YYYY';
    document.getElementById('s-company-address').value = data.company_address || '';
    document.getElementById('s-low-stock-default').value = data.low_stock_default ?? 10;
    document.getElementById('s-allow-negative').checked = data.allow_negative_stock || false;
    document.getElementById('s-require-adj-notes').checked = data.require_adjustment_notes || false;

    /* Theme */
    selectedTheme = data.theme || 'light';
    selectTheme(selectedTheme, false); /* apply without saving */

    /* Show real content */
    document.getElementById('skeleton-card').style.display = 'none';
    document.getElementById('real-settings').style.display = 'flex';
}

/* ── Theme selector ── */
window.selectTheme = function (theme, updatePreview = true) {
    selectedTheme = theme;
    ['light', 'dark', 'system'].forEach(t => {
        document.getElementById(`theme-${t}`)?.classList.toggle('selected', t === theme);
    });
    if (updatePreview) applyTheme(theme);
};

/* ── Save section ── */
window.saveSection = async function (section) {
    if (!settingsId) return;

    const btn = document.querySelector(`#${section === 'profile' ? 'profile' : section === 'inventory' ? 'inventory' : 'appearance'}-saved`)
        ?.closest('.settings-card-footer')
        ?.querySelector('.btn');

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<div class="btn-spinner"></div><span>Saving...</span>';
    }

    let payload = { updated_at: new Date().toISOString(), updated_by: window.currentUser.id };

    if (section === 'profile') {
        const name = document.getElementById('s-company-name').value.trim();
        if (!name) { showToast('Company name is required.', 'error'); resetBtn(btn, 'profile'); return; }
        payload = {
            ...payload,
            company_name: name,
            currency_symbol: document.getElementById('s-currency-symbol').value.trim() || '$',
            currency_position: document.getElementById('s-currency-position').value,
            date_format: document.getElementById('s-date-format').value,
            company_address: document.getElementById('s-company-address').value.trim() || null
        };
    } else if (section === 'inventory') {
        const lowStock = parseInt(document.getElementById('s-low-stock-default').value) || 0;
        payload = {
            ...payload,
            low_stock_default: lowStock,
            allow_negative_stock: document.getElementById('s-allow-negative').checked,
            require_adjustment_notes: document.getElementById('s-require-adj-notes').checked
        };
    } else if (section === 'appearance') {
        payload = { ...payload, theme: selectedTheme };
        applyTheme(selectedTheme);
    }

    const { error } = await db.from('settings').update(payload).eq('id', settingsId);

    if (error) {
        showToast(error.message || 'Failed to save settings.', 'error');
        resetBtn(btn, section);
        return;
    }

    /* Update global appSettings */
    const { data: fresh } = await db.from('settings').select('*').single();
    if (fresh) window.appSettings = Object.freeze({ ...fresh });

    await logActivity('edit', 'settings', settingsId, 'System Settings', `Updated ${section} settings`);

    showSavedIndicator(section);
    showToast('Settings saved.', 'success');

    if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Save Changes';
    }
};

function resetBtn(btn, section) {
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Save Changes';
    }
}

function showSavedIndicator(section) {
    const map = { profile: 'profile-saved', inventory: 'inventory-saved', appearance: 'appearance-saved' };
    const el = document.getElementById(map[section]);
    if (!el) return;
    el.className = 'save-indicator saved';
    el.innerHTML = '<i class="fa-solid fa-circle-check"></i> Saved';
    setTimeout(() => { el.className = 'save-indicator'; el.innerHTML = ''; }, 3000);
}

/* ── Clear logs modal ── */
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

    /* Delete all activity logs */
    const { error } = await db
        .from('activity_logs')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); /* delete all rows */

    if (error) {
        showToast(error.message || 'Failed to clear logs.', 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-trash"></i> Clear All Logs';
        return;
    }

    /* Log the clear action itself — ironic but important */
    await logActivity('delete', 'activity_logs', null, 'All Activity Logs', 'Manually cleared by admin');

    showToast('Activity logs cleared.', 'success');
    closeClearLogsModal();
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-trash"></i> Clear All Logs';
};

/* ── Close modal on backdrop ── */
document.getElementById('clear-logs-modal').addEventListener('click', function (e) {
    if (e.target === this) closeClearLogsModal();
});
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeClearLogsModal();
});

/* ═════ INIT ═════ */
(async function init() {
    let waited = 0;
    while (!window.currentUser && waited < 5000) {
        await new Promise(r => setTimeout(r, 50));
        waited += 50;
    }
    if (!window.currentUser) {
        window.location.href = '../index.html?denied=true';
        return;
    }

    const initials = getInitials(window.currentUser.full_name || window.currentUser.username);
    document.getElementById('topbar-avatar').textContent = initials;
    document.getElementById('topbar-username').textContent = '@' + window.currentUser.username;

    applyTheme(localStorage.getItem('inno-theme') || 'light');
    renderSidebar('settings', window.currentUser.role);
    await loadSettings();
})();
