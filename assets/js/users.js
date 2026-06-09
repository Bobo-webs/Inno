/* ==== USERS.JS ==== */

/* ── State ── */
let allUsers = [];
let allActivity = [];
let filteredUsers = [];
let filteredActivity = [];
let usersPage = 1;
let activityPage = 1;
const PAGE_SIZE = 10;
const STORAGE_KEY = 'inno_users_page_state';

/* ── Role definitions ── */
const ROLES = [
    {
        key: 'root_admin',
        label: 'Root Admin',
        desc: 'Full system access — users, settings, everything',
        icon: 'fa-solid fa-crown',
        color: '#7c3aed', bg: '#f5f3ff'
    },
    {
        key: 'manager',
        label: 'Manager',
        desc: 'Full operational access — inventory, POs, approvals',
        icon: 'fa-solid fa-briefcase',
        color: 'var(--primary)', bg: 'var(--primary-soft)'
    },
    {
        key: 'accountant',
        label: 'Accountant',
        desc: 'Create POs, receive stock, approve, view financials',
        icon: 'fa-solid fa-calculator',
        color: '#0d9488', bg: '#f0fdfa'
    },
    {
        key: 'staff',
        label: 'Staff',
        desc: 'Create POs and receive stock — own records only',
        icon: 'fa-solid fa-user',
        color: 'var(--success)', bg: 'var(--success-soft)'
    },
    {
        key: 'guest',
        label: 'Guest',
        desc: 'Pending role assignment — no dashboard access',
        icon: 'fa-solid fa-clock',
        color: 'var(--text-muted)', bg: 'var(--bg)'
    }
];

/* ── Action type config ── */
const ACTION_TYPES = {
    create: { label: 'Created', class: 'action-create', icon: 'fa-plus' },
    edit: { label: 'Edited', class: 'action-edit', icon: 'fa-pen' },
    delete: { label: 'Deleted', class: 'action-delete', icon: 'fa-trash' },
    approve: { label: 'Approved', class: 'action-approve', icon: 'fa-check' },
    reject: { label: 'Rejected', class: 'action-reject', icon: 'fa-xmark' },
    receive: { label: 'Received Stock', class: 'action-receive', icon: 'fa-truck-ramp-box' },
    adjust: { label: 'Adjusted', class: 'action-adjust', icon: 'fa-sliders' },
    auth: { label: 'Auth', class: 'action-auth', icon: 'fa-key' }
};

/* ── Helpers ── */
function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(' ').filter(Boolean);
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatDate(str) {
    if (!str) return '—';
    return new Date(str).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(str) {
    if (!str) return '—';
    return new Date(str).toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
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

/* ── Save / restore page state ── */
function saveState() {
    const tab = document.getElementById('tab-users').classList.contains('active') ? 'users' : 'activity';
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tab, usersPage, activityPage }));
}

function restoreState() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        if (saved.usersPage) usersPage = saved.usersPage;
        if (saved.activityPage) activityPage = saved.activityPage;
        if (saved.tab) switchTab(saved.tab, false);
    } catch (_) { }
}

/* ── Tab switcher ── */
window.switchTab = function (tab, persist = true) {
    document.getElementById('panel-users').style.display = tab === 'users' ? 'block' : 'none';
    document.getElementById('panel-activity').style.display = tab === 'activity' ? 'block' : 'none';
    document.getElementById('tab-users').classList.toggle('active', tab === 'users');
    document.getElementById('tab-activity').classList.toggle('active', tab === 'activity');
    if (persist) saveState();
};

/* ═════ USERS TAB ═════ */

async function loadUsers() {
    const { data, error } = await db
        .from('users')
        .select('id, full_name, username, email, role, is_active, created_at')
        .order('created_at', { ascending: false });

    if (error) { showToast('Failed to load users.', 'error'); return; }

    allUsers = data || [];

    /* Stats */
    document.getElementById('stat-total').textContent = allUsers.length;
    document.getElementById('stat-active').textContent = allUsers.filter(u => u.is_active).length;
    document.getElementById('stat-pending').textContent = allUsers.filter(u => u.role === 'guest').length;
    document.getElementById('users-count').textContent = allUsers.length;

    /* Populate activity user filter */
    const userFilter = document.getElementById('act-user-filter');
    userFilter.innerHTML = '<option value="">All Users</option>' +
        allUsers.map(u => `<option value="${u.username}">@${u.username}</option>`).join('');

    filterUsers();
}

window.filterUsers = function () {
    const search = document.getElementById('user-search').value.toLowerCase();
    const role = document.getElementById('filter-role').value;
    const active = document.getElementById('filter-active').value;

    filteredUsers = allUsers.filter(u => {
        const matchSearch = !search ||
            (u.full_name || '').toLowerCase().includes(search) ||
            (u.username || '').toLowerCase().includes(search) ||
            (u.email || '').toLowerCase().includes(search);
        const matchRole = !role || u.role === role;
        const matchActive = !active ||
            (active === 'active' && u.is_active) ||
            (active === 'inactive' && !u.is_active);
        return matchSearch && matchRole && matchActive;
    });

    usersPage = 1;
    renderUsersTable();
    saveState();
};

function renderUsersTable() {
    const tbody = document.getElementById('users-tbody');
    const footer = document.getElementById('users-footer');

    if (!filteredUsers.length) {
        tbody.innerHTML = `
            <tr><td colspan="6">
                <div class="empty-state">
                    <div class="empty-state-icon"><i class="fa-solid fa-users"></i></div>
                    <h3>No users found</h3>
                    <p>Try adjusting your search or filters</p>
                </div>
            </td></tr>`;
        footer.style.display = 'none';
        return;
    }

    const total = filteredUsers.length;
    const pages = Math.ceil(total / PAGE_SIZE);
    const start = (usersPage - 1) * PAGE_SIZE;
    const paged = filteredUsers.slice(start, start + PAGE_SIZE);

    tbody.innerHTML = paged.map((u, i) => {
        const initials = getInitials(u.full_name || u.username);
        const isOwnAcct = u.id === window.currentUser.id;
        const roleCfg = ROLES.find(r => r.key === u.role) || ROLES[4];

        const statusBadge = u.is_active
            ? '<span class="badge badge-success"><span class="badge-dot"></span>Active</span>'
            : '<span class="badge badge-danger"><span class="badge-dot"></span>Inactive</span>';

        const editBtn = !isOwnAcct
            ? `<button class="action-btn" onclick="openDrawer('${u.id}')" title="Edit User">
                <i class="fa-solid fa-pen"></i></button>`
            : `<button class="action-btn" disabled title="Cannot edit your own account" style="opacity:0.3;cursor:not-allowed;">
                <i class="fa-solid fa-pen"></i></button>`;

        return `
            <tr class="fade-in" style="animation-delay:${i * 0.03}s">
                <td>
                    <div class="user-cell">
                        <div class="user-avatar">${initials}</div>
                        <div>
                            <div class="user-name">${u.full_name || '—'} ${isOwnAcct ? '<span style="font-size:10px;color:var(--primary);font-weight:600;">(you)</span>' : ''}</div>
                            <div class="user-uname">@${u.username}</div>
                        </div>
                    </div>
                </td>
                <td style="font-size:12.5px;color:var(--text-secondary);">${u.email}</td>
                <td>
                    <span class="role-badge role-${u.role}">
                        <i class="${roleCfg.icon}" style="font-size:10px;"></i>
                        ${roleCfg.label}
                    </span>
                </td>
                <td>${statusBadge}</td>
                <td style="font-size:12px;color:var(--text-muted);white-space:nowrap;">${formatDate(u.created_at)}</td>
                <td><div class="action-btns">${editBtn}</div></td>
            </tr>`;
    }).join('');

    footer.style.display = 'flex';
    document.getElementById('users-info').textContent =
        `Showing ${start + 1}–${Math.min(start + PAGE_SIZE, total)} of ${total} users`;

    renderPagination('users-pagination', pages, usersPage, (p) => {
        usersPage = p;
        renderUsersTable();
        saveState();
    });
}

/* ── Drawer ── */
window.openDrawer = function (userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;

    const isOwnAcct = userId === window.currentUser.id;

    document.getElementById('edit-user-id').value = userId;
    document.getElementById('drawer-avatar').textContent = getInitials(user.full_name || user.username);
    document.getElementById('drawer-name').textContent = user.full_name || user.username;
    document.getElementById('drawer-email').textContent = user.email;
    document.getElementById('f-active').value = String(user.is_active);
    document.getElementById('own-notice').style.display = isOwnAcct ? 'flex' : 'none';

    /* Build role options */
    const container = document.getElementById('role-options');
    container.innerHTML = ROLES.map(r => `
        <label class="role-option ${user.role === r.key ? 'selected' : ''}"
               onclick="selectRole('${r.key}')">
            <input type="radio" name="role" value="${r.key}" ${user.role === r.key ? 'checked' : ''}>
            <div class="role-option-icon" style="background:${r.bg};color:${r.color};">
                <i class="${r.icon}"></i>
            </div>
            <div>
                <div class="role-option-name">${r.label}</div>
                <div class="role-option-desc">${r.desc}</div>
            </div>
        </label>`).join('');

    /* Disable everything if own account */
    const saveBtn = document.getElementById('save-user-btn');
    saveBtn.disabled = isOwnAcct;
    container.style.opacity = isOwnAcct ? '0.4' : '1';
    container.style.pointerEvents = isOwnAcct ? 'none' : 'auto';
    document.getElementById('f-active').disabled = isOwnAcct;

    document.getElementById('drawer-backdrop').classList.add('show');
    document.getElementById('user-drawer').classList.add('open');
    document.body.style.overflow = 'hidden';
};

window.closeDrawer = function () {
    document.getElementById('drawer-backdrop').classList.remove('show');
    document.getElementById('user-drawer').classList.remove('open');
    document.body.style.overflow = '';
};

window.selectRole = function (roleKey) {
    document.querySelectorAll('.role-option').forEach(el => {
        el.classList.toggle('selected', el.querySelector('input').value === roleKey);
    });
    const radio = document.querySelector(`input[name="role"][value="${roleKey}"]`);
    if (radio) radio.checked = true;
};

window.saveUser = async function () {
    const userId = document.getElementById('edit-user-id').value;
    const selected = document.querySelector('input[name="role"]:checked');
    const newRole = selected?.value;
    const isActive = document.getElementById('f-active').value === 'true';
    const btn = document.getElementById('save-user-btn');

    if (!newRole) { showToast('Please select a role.', 'error'); return; }

    btn.disabled = true;
    btn.innerHTML = '<div class="btn-spinner"></div><span>Saving...</span>';

    const { error } = await db
        .from('users')
        .update({ role: newRole, is_active: isActive })
        .eq('id', userId);

    if (error) {
        showToast(error.message || 'Failed to update user.', 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-check"></i><span>Save Changes</span>';
        return;
    }

    /* Log the activity */
    const targetUser = allUsers.find(u => u.id === userId);
    const oldRole = targetUser?.role;
    if (oldRole !== newRole) {
        await logActivity(
            'edit', 'user', userId,
            targetUser?.username,
            `Role changed: ${oldRole} → ${newRole}`
        );
    }

    showToast('User updated successfully.', 'success');
    closeDrawer();
    await loadUsers();
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-check"></i><span>Save Changes</span>';
};

/* ══════ ACTIVITY TAB ══════ */

async function loadActivity() {
    const { data, error } = await db
        .from('activity_logs')
        .select('id, username, action, entity_type, entity_name, details, created_at')
        .order('created_at', { ascending: false })
        .limit(500);

    if (error) { showToast('Failed to load activity log.', 'error'); return; }

    allActivity = data || [];
    document.getElementById('activity-count').textContent = allActivity.length;

    /* Stats */
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const todayCount = allActivity.filter(a => a.created_at >= todayStart).length;
    const monthCount = allActivity.filter(a => a.created_at >= monthStart).length;

    /* Most active user this month */
    const monthActivity = allActivity.filter(a => a.created_at >= monthStart);
    const userCounts = {};
    monthActivity.forEach(a => {
        if (a.username) userCounts[a.username] = (userCounts[a.username] || 0) + 1;
    });
    const topUser = Object.entries(userCounts).sort((a, b) => b[1] - a[1])[0];

    document.getElementById('act-today').textContent = todayCount.toLocaleString();
    document.getElementById('act-month').textContent = monthCount.toLocaleString();
    document.getElementById('act-top-user').textContent = topUser ? `@${topUser[0]}` : '—';

    filterActivity();
}

window.filterActivity = function () {
    const search = document.getElementById('act-search').value.toLowerCase();
    const userF = document.getElementById('act-user-filter').value;
    const typeF = document.getElementById('act-type-filter').value;
    const dateF = document.getElementById('act-date-filter').value;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const week = new Date(today); week.setDate(today.getDate() - today.getDay());
    const month = new Date(now.getFullYear(), now.getMonth(), 1);

    filteredActivity = allActivity.filter(a => {
        const matchSearch = !search ||
            (a.username || '').toLowerCase().includes(search) ||
            (a.action || '').toLowerCase().includes(search) ||
            (a.entity_name || '').toLowerCase().includes(search);
        const matchUser = !userF || a.username === userF;
        const matchType = !typeF || a.action === typeF;
        const d = new Date(a.created_at);
        const matchDate = !dateF ||
            (dateF === 'today' && d >= today) ||
            (dateF === 'week' && d >= week) ||
            (dateF === 'month' && d >= month);
        return matchSearch && matchUser && matchType && matchDate;
    });

    activityPage = 1;
    renderActivityTable();
    saveState();
};

function renderActivityTable() {
    const tbody = document.getElementById('activity-tbody');
    const footer = document.getElementById('activity-footer');

    if (!filteredActivity.length) {
        tbody.innerHTML = `
            <tr><td colspan="5">
                <div class="empty-state">
                    <div class="empty-state-icon"><i class="fa-solid fa-clock-rotate-left"></i></div>
                    <h3>No activity found</h3>
                    <p>Actions will appear here as users interact with the system</p>
                </div>
            </td></tr>`;
        footer.style.display = 'none';
        return;
    }

    const total = filteredActivity.length;
    const pages = Math.ceil(total / PAGE_SIZE);
    const start = (activityPage - 1) * PAGE_SIZE;
    const paged = filteredActivity.slice(start, start + PAGE_SIZE);

    tbody.innerHTML = paged.map((a, i) => {
        const initials = getInitials(a.username || '');
        const actionCfg = ACTION_TYPES[a.action] || { label: a.action, class: 'action-auth', icon: 'fa-circle' };

        return `
            <tr class="fade-in" style="animation-delay:${i * 0.03}s">
                <td>
                    <div class="sig-cell">
                        <div class="sig-avatar">${initials}</div>
                        <span style="font-size:12.5px;font-weight:500;">@${a.username || '—'}</span>
                    </div>
                </td>
                <td>
                    <span class="action-type ${actionCfg.class}">
                        <i class="fa-solid ${actionCfg.icon}" style="font-size:9px;"></i>
                        ${actionCfg.label}
                    </span>
                </td>
                <td>
                    ${a.entity_type
                ? `<span class="entity-chip">${a.entity_type}</span>`
                : '<span style="color:var(--text-muted);font-size:12px;">—</span>'}
                </td>
                <td>
                    <div class="details-cell" title="${a.details || ''}">
                        ${a.entity_name ? `<span style="font-weight:600;color:var(--text-primary);">${a.entity_name}</span>` : ''}
                        ${a.details ? `<span style="color:var(--text-muted);"> · ${a.details}</span>` : ''}
                        ${!a.entity_name && !a.details ? '—' : ''}
                    </div>
                </td>
                <td class="time-cell">${formatDateTime(a.created_at)}</td>
            </tr>`;
    }).join('');

    footer.style.display = 'flex';
    document.getElementById('activity-info').textContent =
        `Showing ${start + 1}–${Math.min(start + PAGE_SIZE, total)} of ${total} entries`;

    renderPagination('activity-pagination', pages, activityPage, (p) => {
        activityPage = p;
        renderActivityTable();
        saveState();
    });
}

/* ── Export activity ── */
window.exportActivity = function () {
    if (!filteredActivity.length) { showToast('No activity to export.', 'error'); return; }

    const headers = ['User', 'Action', 'Entity Type', 'Entity Name', 'Details', 'Timestamp'];
    const rows = filteredActivity.map(a => [
        a.username || '', a.action || '', a.entity_type || '',
        a.entity_name || '', a.details || '', formatDateTime(a.created_at)
    ]);

    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity-log-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Activity log exported.', 'success');
};

/* ── Reusable pagination renderer ── */
function renderPagination(containerId, pages, currentPage, onPageClick) {
    const pag = document.getElementById(containerId);
    if (pages <= 1) { pag.innerHTML = ''; return; }

    let html = `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''}
        onclick="(${onPageClick.toString()})(${currentPage - 1})">
        <i class="fa-solid fa-chevron-left"></i></button>`;

    for (let i = 1; i <= pages; i++) {
        if (i === 1 || i === pages || Math.abs(i - currentPage) <= 1) {
            html += `<button class="page-btn ${i === currentPage ? 'active' : ''}"
                onclick="(${onPageClick.toString()})(${i})">${i}</button>`;
        } else if (Math.abs(i - currentPage) === 2) {
            html += `<button class="page-btn" disabled>…</button>`;
        }
    }

    html += `<button class="page-btn" ${currentPage === pages ? 'disabled' : ''}
        onclick="(${onPageClick.toString()})(${currentPage + 1})">
        <i class="fa-solid fa-chevron-right"></i></button>`;

    pag.innerHTML = html;
}

/* ── logActivity utility ── */
window.logActivity = async function (action, entityType, entityId, entityName, details) {
    try {
        const user = window.currentUser;
        if (!user) return;
        await db.from('activity_logs').insert({
            user_id: user.id,
            username: user.username,
            action,
            entity_type: entityType || null,
            entity_id: String(entityId || ''),
            entity_name: entityName || null,
            details: details || null,
            created_at: new Date().toISOString()
        });
    } catch (_) { }
};

/* ── Close on backdrop/keyboard ── */
document.getElementById('drawer-backdrop').addEventListener('click', function (e) {
    if (e.target === this) closeDrawer();
});
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeDrawer();
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
    document.getElementById('topbar-username').textContent = '' + window.currentUser.username;

    applyTheme(localStorage.getItem('inno-theme') || 'light');
    renderSidebar('users', window.currentUser.role);

    /* Load both in parallel */
    await Promise.all([loadUsers(), loadActivity()]);

    /* Restore saved tab + page after data loads */
    restoreState();
})();