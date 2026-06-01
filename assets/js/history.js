/* ============================================================
   assets/js/history.js
   Stock History page — read-only audit trail
   Roles: root_admin, manager, accountant — see all
          staff — sees only their own entries
   ============================================================ */

/* ── State ── */
let allMovements = [];
let allProducts = [];
let filteredMovements = [];
let currentPage = 1;
const PAGE_SIZE = 20;
let userRole = null;

/* ── Helpers ── */
function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(' ').filter(Boolean);
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric'
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

/* ── Type config ── */
const TYPE_CONFIG = {
    receive: {
        label: 'Receive',
        badgeClass: 'badge-receive',
        icon: 'fa-arrow-down',
        sign: 'in'
    },
    adjustment_add: {
        label: 'Adjustment +',
        badgeClass: 'badge-adj-add',
        icon: 'fa-plus',
        sign: 'in'
    },
    adjustment_remove: {
        label: 'Adjustment −',
        badgeClass: 'badge-adj-remove',
        icon: 'fa-minus',
        sign: 'out'
    },
    purchase_order: {
        label: 'Purchase Order',
        badgeClass: 'badge-po',
        icon: 'fa-file-invoice',
        sign: 'out'
    },
    adjustment: {
        label: 'Adjustment',
        badgeClass: 'badge-adjustment',
        icon: 'fa-sliders',
        sign: 'in'
    }
};

function getTypeConfig(type, quantity) {
    if (type === 'adjustment') {
        return quantity >= 0 ? TYPE_CONFIG.adjustment_add : TYPE_CONFIG.adjustment_remove;
    }
    return TYPE_CONFIG[type] || {
        label: type || '—', badgeClass: 'badge-adjustment', icon: 'fa-circle', sign: 'in'
    };
}

/* ── Load all movements ── */
async function loadMovements() {
    let query = db
        .from('stock_movements')
        .select(`
            id, type, quantity, unit_cost, notes, reference, created_at,
            created_by, created_by_username,
            products(id, name, sku),
            suppliers(id, name)
        `)
        .order('created_at', { ascending: false });

    if (userRole === 'staff') {
        query = query.eq('created_by', window.currentUser.id);
    }

    const { data, error } = await query;
    if (error) { showToast('Failed to load stock history.', 'error'); return; }

    allMovements = data || [];
    updateStats();
    populateProductFilter();
    filterHistory();
}

/* ── Stats ── */
function updateStats() {
    const total = allMovements.length;
    const unitsIn = allMovements
        .filter(m => ['receive', 'adjustment_add'].includes(m.type) ||
            (m.type === 'adjustment' && m.quantity >= 0))
        .reduce((s, m) => s + Math.abs(m.quantity || 0), 0);
    const unitsOut = allMovements
        .filter(m => ['purchase_order', 'adjustment_remove'].includes(m.type) ||
            (m.type === 'adjustment' && m.quantity < 0))
        .reduce((s, m) => s + Math.abs(m.quantity || 0), 0);
    const net = unitsIn - unitsOut;

    document.getElementById('stats-row').innerHTML = `
        <div class="stat-card">
            <div class="stat-icon neutral"><i class="fa-solid fa-clock-rotate-left"></i></div>
            <div class="stat-body">
                <div class="stat-value">${total.toLocaleString()}</div>
                <div class="stat-label">Total Movements</div>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-icon blue"><i class="fa-solid fa-arrow-down"></i></div>
            <div class="stat-body">
                <div class="stat-value">${unitsIn.toLocaleString()}</div>
                <div class="stat-label">Total Units In</div>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-icon danger"><i class="fa-solid fa-arrow-up"></i></div>
            <div class="stat-body">
                <div class="stat-value">${unitsOut.toLocaleString()}</div>
                <div class="stat-label">Total Units Out</div>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-icon ${net >= 0 ? 'success' : 'danger'}"><i class="fa-solid fa-scale-balanced"></i></div>
            <div class="stat-body">
                <div class="stat-value ${net >= 0 ? 'positive' : 'negative'}">${net >= 0 ? '+' : ''}${net.toLocaleString()}</div>
                <div class="stat-label">Net Movement</div>
            </div>
        </div>`;
}

/* ── Populate product filter ── */
function populateProductFilter() {
    const seen = new Map();
    allMovements.forEach(m => {
        if (m.products?.id) seen.set(m.products.id, m.products.name);
    });
    const select = document.getElementById('product-filter');
    select.innerHTML = '<option value="">All Products</option>' +
        [...seen.entries()]
            .sort((a, b) => a[1].localeCompare(b[1]))
            .map(([id, name]) => `<option value="${id}">${name}</option>`)
            .join('');
}

/* ── Date filter change ── */
window.onDateFilterChange = function () {
    const val = document.getElementById('date-filter').value;
    const row = document.getElementById('custom-date-row');
    row.classList.toggle('show', val === 'custom');
    filterHistory();
};

/* ── Filter ── */
window.filterHistory = function () {
    const search = document.getElementById('history-search').value.toLowerCase();
    const typeVal = document.getElementById('type-filter').value;
    const productId = document.getElementById('product-filter').value;
    const dateRange = document.getElementById('date-filter').value;
    const dateFrom = document.getElementById('date-from').value;
    const dateTo = document.getElementById('date-to').value;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(today); weekStart.setDate(today.getDate() - today.getDay());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    filteredMovements = allMovements.filter(m => {
        /* Search */
        const matchSearch = !search ||
            (m.products?.name || '').toLowerCase().includes(search) ||
            (m.products?.sku || '').toLowerCase().includes(search);

        /* Type */
        let matchType = true;
        if (typeVal) {
            if (typeVal === 'adjustment_add') {
                matchType = m.type === 'adjustment_add' ||
                    (m.type === 'adjustment' && m.quantity >= 0);
            } else if (typeVal === 'adjustment_remove') {
                matchType = m.type === 'adjustment_remove' ||
                    (m.type === 'adjustment' && m.quantity < 0);
            } else {
                matchType = m.type === typeVal;
            }
        }

        /* Product */
        const matchProduct = !productId || m.products?.id === productId;

        /* Date */
        let matchDate = true;
        if (dateRange && dateRange !== 'custom') {
            const d = new Date(m.created_at);
            if (dateRange === 'today') matchDate = d >= today;
            if (dateRange === 'week') matchDate = d >= weekStart;
            if (dateRange === 'month') matchDate = d >= monthStart;
        }
        if (dateRange === 'custom') {
            const d = new Date(m.created_at);
            if (dateFrom) matchDate = matchDate && d >= new Date(dateFrom);
            if (dateTo) matchDate = matchDate && d <= new Date(dateTo + 'T23:59:59');
        }

        return matchSearch && matchType && matchProduct && matchDate;
    });

    currentPage = 1;
    renderTable();
};

/* ── Build reference string ── */
function buildReference(m) {
    if (m.type === 'receive') return m.suppliers?.name || m.notes || '—';
    if (m.type === 'purchase_order') return m.reference ? `PO #${m.reference}` : (m.notes || '—');
    if (m.type === 'adjustment' || m.type === 'adjustment_add' || m.type === 'adjustment_remove') {
        return m.notes || m.reference || '—';
    }
    return m.reference || m.notes || '—';
}

/* ── Render table ── */
function renderTable() {
    const tbody = document.getElementById('history-tbody');
    const footer = document.getElementById('history-footer');

    if (!filteredMovements.length) {
        tbody.innerHTML = `
            <tr><td colspan="6">
                <div class="empty-state">
                    <div class="empty-state-icon"><i class="fa-solid fa-clock-rotate-left"></i></div>
                    <h3>No movements found</h3>
                    <p>Try adjusting your filters or search term</p>
                </div>
            </td></tr>`;
        footer.style.display = 'none';
        return;
    }

    const total = filteredMovements.length;
    const pages = Math.ceil(total / PAGE_SIZE);
    const start = (currentPage - 1) * PAGE_SIZE;
    const paged = filteredMovements.slice(start, start + PAGE_SIZE);

    tbody.innerHTML = paged.map((m, i) => {
        const cfg = getTypeConfig(m.type, m.quantity);
        const isIn = cfg.sign === 'in';
        const qtyAbs = Math.abs(m.quantity || 0);
        const initials = getInitials(m.created_by_username || '');
        const ref = buildReference(m);

        return `
            <tr class="fade-in" style="animation-delay:${i * 0.02}s">
                <td>
                    <div class="product-name-cell">
                        <div class="product-avatar">
                            ${(m.products?.name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                        </div>
                        <div>
                            <div class="product-name">${m.products?.name || '—'}</div>
                            <div class="product-sku">${m.products?.sku || 'No SKU'}</div>
                        </div>
                    </div>
                </td>
                <td>
                    <span class="badge ${cfg.badgeClass}">
                        <i class="fa-solid ${cfg.icon}" style="font-size:9px;"></i>
                        ${cfg.label}
                    </span>
                </td>
                <td>
                    <span class="qty-signed ${isIn ? 'in' : 'out'}">
                        ${isIn ? '+' : '−'}${qtyAbs.toLocaleString()}
                    </span>
                </td>
                <td>
                    <span class="ref-cell" title="${ref}">${ref}</span>
                </td>
                <td style="font-size:12px;color:var(--text-muted);white-space:nowrap;">
                    ${formatDate(m.created_at)}
                </td>
                <td>
                    <div class="sig-cell">
                        <div class="sig-avatar">${initials}</div>
                        <span class="sig-name">@${m.created_by_username || '—'}</span>
                    </div>
                </td>
            </tr>`;
    }).join('');

    footer.style.display = 'flex';
    document.getElementById('history-info').textContent =
        `Showing ${start + 1}–${Math.min(start + PAGE_SIZE, total)} of ${total} movements`;

    const pag = document.getElementById('history-pagination');
    if (pages <= 1) { pag.innerHTML = ''; return; }

    let pagHTML = `<button class="page-btn" onclick="goPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>
        <i class="fa-solid fa-chevron-left"></i></button>`;
    for (let i = 1; i <= pages; i++) {
        if (i === 1 || i === pages || Math.abs(i - currentPage) <= 1) {
            pagHTML += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="goPage(${i})">${i}</button>`;
        } else if (Math.abs(i - currentPage) === 2) {
            pagHTML += `<button class="page-btn" disabled>…</button>`;
        }
    }
    pagHTML += `<button class="page-btn" onclick="goPage(${currentPage + 1})" ${currentPage === pages ? 'disabled' : ''}>
        <i class="fa-solid fa-chevron-right"></i></button>`;
    pag.innerHTML = pagHTML;
}

window.goPage = function (page) {
    const pages = Math.ceil(filteredMovements.length / PAGE_SIZE);
    if (page < 1 || page > pages) return;
    currentPage = page;
    renderTable();
    document.querySelector('.table-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
};

/* ── Export ── */
window.exportHistory = function () {
    if (!filteredMovements.length) { showToast('No movements to export.', 'error'); return; }

    const headers = ['Product', 'SKU', 'Type', 'Quantity', 'Reference', 'Date', 'Signed By'];
    const rows = filteredMovements.map(m => {
        const cfg = getTypeConfig(m.type, m.quantity);
        const isIn = cfg.sign === 'in';
        return [
            m.products?.name || '',
            m.products?.sku || '',
            cfg.label,
            `${isIn ? '+' : '-'}${Math.abs(m.quantity || 0)}`,
            buildReference(m),
            formatDate(m.created_at),
            m.created_by_username || ''
        ];
    });

    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stock-history-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('History exported.', 'success');
};

/* ════════════════════════════════════════
   INIT
════════════════════════════════════════ */
(async function init() {
    let waited = 0;
    while (!window.currentUser && waited < 5000) {
        await new Promise(r => setTimeout(r, 50));
        waited += 50;
    }
    if (!window.currentUser) {
        window.location.href = '../../index.html?denied=true';
        return;
    }

    userRole = window.currentUser.role;

    /* Topbar */
    const initials = getInitials(window.currentUser.full_name || window.currentUser.username);
    document.getElementById('topbar-avatar').textContent = initials;
    document.getElementById('topbar-username').textContent = '' + window.currentUser.username;

    /* Theme */
    applyTheme(localStorage.getItem('inno-theme') || 'light');

    /* Sidebar */
    renderSidebar('history', userRole);

    /* Load */
    await loadMovements();

    /* Reveal header actions */
    document.getElementById('page-header-actions').style.visibility = 'visible';
})();