/* ==== RECEIVE.JS ===== */

/* ── State ── */
let allProducts     = [];
let allSuppliers    = [];
let allHistory      = [];
let filteredHistory = [];
let currentPage     = 1;
const PAGE_SIZE     = 15;
let deleteTargetId  = null;
let isEditMode      = false;
let userRole        = null;

/* ── Helpers ── */
function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(' ').filter(Boolean);
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatCurrency(val) {
    if (!val && val !== 0) return '—';
    return '$' + Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric'
    });
}

function todayISO() {
    return new Date().toISOString().split('T')[0];
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

/* ── Load products dropdown ── */
async function loadProducts() {
    const { data, error } = await db
        .from('products')
        .select('id, name, sku, quantity, reorder_level, unit, categories(name)')
        .eq('is_active', true)
        .order('name', { ascending: true });

    if (error) { showToast('Failed to load products.', 'error'); return; }

    allProducts = data || [];
    const select = document.getElementById('product-select');
    select.innerHTML = '<option value="">— Select product —</option>' +
        allProducts.map(p =>
            `<option value="${p.id}">${p.name}${p.sku ? ' (' + p.sku + ')' : ''}</option>`
        ).join('');
}

/* ── Load suppliers dropdown ── */
async function loadSuppliers() {
    const { data, error } = await db
        .from('suppliers')
        .select('id, name, contact_person')
        .eq('is_active', true)
        .order('name', { ascending: true });

    if (error) { showToast('Failed to load suppliers.', 'error'); return; }

    allSuppliers = data || [];

    const drawerSelect = document.getElementById('supplier-select');
    if (!allSuppliers.length) {
        drawerSelect.innerHTML = '<option value="">No suppliers found — add one on the Suppliers page</option>';
        drawerSelect.disabled = true;
    } else {
        drawerSelect.innerHTML = '<option value="">— Select supplier —</option>' +
            allSuppliers.map(s =>
                `<option value="${s.id}">${s.name}${s.contact_person ? ' — ' + s.contact_person : ''}</option>`
            ).join('');
    }

    /* Populate supplier filter in toolbar */
    const filterSelect = document.getElementById('supplier-filter');
    filterSelect.innerHTML = '<option value="">All Suppliers</option>' +
        allSuppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
}

/* ── Load receive history ── */
async function loadHistory() {
    let query = db
        .from('stock_movements')
        .select(`
            id, quantity, unit_cost, notes, created_at, created_by, created_by_username,
            products(id, name, sku),
            suppliers(id, name)
        `)
        .eq('type', 'receive')
        .order('created_at', { ascending: false });

    if (userRole === 'staff') {
        query = query.eq('created_by', window.currentUser.id);
    }

    const { data, error } = await query;
    if (error) { showToast('Failed to load history.', 'error'); return; }

    allHistory = data || [];
    updateSummaryChips();
    filterHistory();
}

/* ── Summary chips ── */
function updateSummaryChips() {
    if (!allHistory.length) {
        document.getElementById('summary-chips').style.display = 'none';
        return;
    }
    document.getElementById('summary-chips').style.display = 'flex';

    const totalQty   = allHistory.reduce((s, m) => s + (m.quantity || 0), 0);
    const totalValue = allHistory.reduce((s, m) => s + ((m.quantity || 0) * (m.unit_cost || 0)), 0);

    document.getElementById('chip-total').textContent = `${allHistory.length} entr${allHistory.length !== 1 ? 'ies' : 'y'}`;
    document.getElementById('chip-qty').textContent   = `${totalQty.toLocaleString()} units received`;
    document.getElementById('chip-value').textContent = `${formatCurrency(totalValue)} total value`;
}

/* ── Filter history ── */
window.filterHistory = function () {
    const search     = document.getElementById('history-search').value.toLowerCase();
    const supplierId = document.getElementById('supplier-filter').value;
    const dateRange  = document.getElementById('date-filter').value;

    const now   = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(today); weekStart.setDate(today.getDate() - today.getDay());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    filteredHistory = allHistory.filter(m => {
        const matchSearch = !search ||
            (m.products?.name || '').toLowerCase().includes(search) ||
            (m.suppliers?.name || '').toLowerCase().includes(search) ||
            (m.created_by_username || '').toLowerCase().includes(search);

        const matchSupplier = !supplierId || m.suppliers?.id === supplierId;

        let matchDate = true;
        if (dateRange) {
            const entryDate = new Date(m.created_at);
            if (dateRange === 'today')  matchDate = entryDate >= today;
            if (dateRange === 'week')   matchDate = entryDate >= weekStart;
            if (dateRange === 'month')  matchDate = entryDate >= monthStart;
        }

        return matchSearch && matchSupplier && matchDate;
    });

    currentPage = 1;
    renderHistoryTable();
};

/* ── Render history table ── */
function renderHistoryTable() {
    const tbody  = document.getElementById('history-tbody');
    const footer = document.getElementById('history-footer');

    if (!filteredHistory.length) {
        tbody.innerHTML = `
            <tr><td colspan="9">
                <div class="empty-state">
                    <div class="empty-state-icon"><i class="fa-solid fa-truck-ramp-box"></i></div>
                    <h3>No receive entries yet</h3>
                    <p>Use the button above to record your first stock delivery</p>
                    <button class="btn btn-primary" onclick="openReceiveDrawer()">
                        <i class="fa-solid fa-plus"></i> Receive Stock
                    </button>
                </div>
            </td></tr>`;
        footer.style.display = 'none';
        return;
    }

    const total = filteredHistory.length;
    const pages = Math.ceil(total / PAGE_SIZE);
    const start = (currentPage - 1) * PAGE_SIZE;
    const paged = filteredHistory.slice(start, start + PAGE_SIZE);

    tbody.innerHTML = paged.map((m, i) => {
        const totalVal  = (m.quantity || 0) * (m.unit_cost || 0);
        const initials  = getInitials(m.created_by_username || '');
        const canAction = userRole !== 'staff' || m.created_by === window.currentUser?.id;

        const actions = canAction ? `
            <div class="action-btns">
                <button class="action-btn" onclick="editEntry('${m.id}')" title="Edit">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button class="action-btn delete" onclick="openDeleteModal('${m.id}')" title="Reverse">
                    <i class="fa-solid fa-rotate-left"></i>
                </button>
            </div>` : '';

        return `
            <tr class="fade-in" style="animation-delay:${i * 0.03}s">
                <td>
                    <div class="product-name-cell">
                        <div class="product-avatar">${(m.products?.name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}</div>
                        <div>
                            <div class="product-name">${m.products?.name || '—'}</div>
                            <div class="product-sku">${m.products?.sku || 'No SKU'}</div>
                        </div>
                    </div>
                </td>
                <td style="font-size:12.5px;color:var(--text-secondary);">${m.suppliers?.name || '—'}</td>
                <td><span style="font-weight:700;color:var(--success);">+${(m.quantity || 0).toLocaleString()}</span></td>
                <td style="font-size:13px;">${formatCurrency(m.unit_cost)}</td>
                <td style="font-weight:600;font-size:13px;">${formatCurrency(totalVal)}</td>
                <td style="font-size:12px;color:var(--text-muted);white-space:nowrap;">${formatDate(m.created_at)}</td>
                <td>
                    <div class="sig-cell">
                        <div class="sig-avatar">${initials}</div>
                        <span class="sig-name">${m.created_by_username || '—'}</span>
                    </div>
                </td>
                <td style="font-size:12px;color:var(--text-muted);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${m.notes || ''}">${m.notes || '—'}</td>
                <td>${actions}</td>
            </tr>`;
    }).join('');

    footer.style.display = 'flex';
    document.getElementById('history-info').textContent =
        `Showing ${start + 1}–${Math.min(start + PAGE_SIZE, total)} of ${total} entries`;

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
    const pages = Math.ceil(filteredHistory.length / PAGE_SIZE);
    if (page < 1 || page > pages) return;
    currentPage = page;
    renderHistoryTable();
    document.querySelector('.table-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
};

/* ── Product select handler ── */
window.onProductSelect = function () {
    const productId = document.getElementById('product-select').value;
    const preview   = document.getElementById('product-preview');

    if (!productId) {
        preview.classList.remove('show');
        document.getElementById('sku-input').value = '';
        return;
    }

    const product = allProducts.find(p => p.id === productId);
    if (!product) return;

    document.getElementById('sku-input').value = product.sku || '';

    const initials = (product.name || '').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    document.getElementById('preview-avatar').textContent = initials;
    document.getElementById('preview-name').textContent   = product.name;
    document.getElementById('preview-meta').textContent   =
        `${product.categories?.name || 'Uncategorised'} · ${product.unit || '—'}`;

    const qtyEl = document.getElementById('preview-qty');
    qtyEl.textContent = product.quantity.toLocaleString();
    qtyEl.className   = 'preview-stock-num';
    if (product.quantity <= 0) qtyEl.classList.add('danger');
    else if (product.quantity <= product.reorder_level) qtyEl.classList.add('low');

    preview.classList.add('show');
    updateTotal();
};

/* ── Total value preview ── */
window.updateTotal = function () {
    const qty  = parseFloat(document.getElementById('qty-input').value)  || 0;
    const cost = parseFloat(document.getElementById('cost-input').value) || 0;
    const wrap = document.getElementById('total-preview-wrap');

    if (qty > 0 && cost > 0) {
        document.getElementById('total-value').textContent = formatCurrency(qty * cost);
        wrap.style.display = 'block';
    } else {
        wrap.style.display = 'none';
    }
};

/* ── Drawer open/close ── */
window.openReceiveDrawer = function () {
    resetForm();
    document.getElementById('drawer-title').textContent = 'Receive Stock';
    document.getElementById('drawer-sub').textContent   = 'Record an incoming delivery';
    document.getElementById('receive-drawer-backdrop').classList.add('show');
    document.getElementById('receive-drawer').classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.getElementById('product-select').focus(), 300);
};

window.closeReceiveDrawer = function () {
    document.getElementById('receive-drawer-backdrop').classList.remove('show');
    document.getElementById('receive-drawer').classList.remove('open');
    document.body.style.overflow = '';
    resetForm();
};

/* ── Submit receive ── */
window.submitReceive = async function () {
    const productId  = document.getElementById('product-select').value;
    const supplierId = document.getElementById('supplier-select').value;
    const qty        = parseInt(document.getElementById('qty-input').value)    || 0;
    const cost       = parseFloat(document.getElementById('cost-input').value) || 0;
    const dateVal    = document.getElementById('date-input').value;
    const notes      = document.getElementById('notes-input').value.trim();
    const btn        = document.getElementById('submit-btn');
    const movementId = document.getElementById('edit-movement-id').value;

    if (!productId)  { showToast('Please select a product.', 'error');  return; }
    if (!supplierId) { showToast('Please select a supplier.', 'error'); return; }
    if (qty <= 0)    { showToast('Quantity must be greater than zero.', 'error'); return; }
    if (cost < 0)    { showToast('Unit cost cannot be negative.', 'error'); return; }
    if (!dateVal)    { showToast('Please enter the delivery date.', 'error'); return; }

    const enteredDate = new Date(dateVal);
    const maxDate     = new Date();
    maxDate.setFullYear(maxDate.getFullYear() + 1);
    if (enteredDate > maxDate) {
        showToast('Delivery date seems too far in the future.', 'error'); return;
    }

    btn.disabled  = true;
    btn.innerHTML = '<div class="btn-spinner"></div><span>Saving...</span>';

    const user    = window.currentUser;
    const dateISO = new Date(dateVal).toISOString();
    let result;

    if (isEditMode && movementId) {
        const { data, error } = await db.rpc('update_receive_stock', {
            p_movement_id:         movementId,
            p_product_id:          productId,
            p_supplier_id:         supplierId,
            p_quantity:            qty,
            p_unit_cost:           cost,
            p_notes:               notes || null,
            p_date:                dateISO,
            p_updated_by:          user.id,
            p_updated_by_username: user.username
        });
        result = error ? { error: error.message } : data;
    } else {
        const { data, error } = await db.rpc('receive_stock', {
            p_product_id:          productId,
            p_supplier_id:         supplierId,
            p_quantity:            qty,
            p_unit_cost:           cost,
            p_notes:               notes || null,
            p_date:                dateISO,
            p_created_by:          user.id,
            p_created_by_username: user.username
        });
        result = error ? { error: error.message } : data;
    }

    if (result?.error) {
        showToast(result.error, 'error');
        btn.disabled  = false;
        btn.innerHTML = '<i class="fa-solid fa-truck-ramp-box"></i><span id="submit-label">Record Receive</span>';
        return;
    }

    showToast(
        isEditMode
            ? 'Receive entry updated successfully.'
            : `Stock received. New quantity: ${result.new_quantity?.toLocaleString()}`,
        'success'
    );

    closeReceiveDrawer();
    await Promise.all([loadProducts(), loadHistory()]);

    btn.disabled  = false;
    btn.innerHTML = '<i class="fa-solid fa-truck-ramp-box"></i><span id="submit-label">Record Receive</span>';
};

/* ── Edit entry ── */
window.editEntry = function (movementId) {
    const entry = allHistory.find(m => m.id === movementId);
    if (!entry) return;

    isEditMode = true;
    document.getElementById('edit-movement-id').value = movementId;
    document.getElementById('drawer-title').textContent = 'Edit Receive Entry';
    document.getElementById('drawer-sub').textContent   =
        `Editing: ${entry.products?.name} · ${formatDate(entry.created_at)}`;
    document.getElementById('submit-label').textContent = 'Update Entry';

    document.getElementById('product-select').value  = entry.products?.id || '';
    document.getElementById('supplier-select').value =
        allSuppliers.find(s => s.name === entry.suppliers?.name)?.id || '';
    document.getElementById('qty-input').value   = entry.quantity;
    document.getElementById('cost-input').value  = entry.unit_cost;
    document.getElementById('date-input').value  = entry.created_at?.split('T')[0] || '';
    document.getElementById('notes-input').value = entry.notes || '';

    onProductSelect();
    updateTotal();

    document.getElementById('receive-drawer-backdrop').classList.add('show');
    document.getElementById('receive-drawer').classList.add('open');
    document.body.style.overflow = 'hidden';
};

/* ── Reset form ── */
function resetForm() {
    isEditMode = false;
    document.getElementById('edit-movement-id').value  = '';
    document.getElementById('product-select').value    = '';
    document.getElementById('supplier-select').value   = '';
    document.getElementById('qty-input').value         = '';
    document.getElementById('cost-input').value        = '';
    document.getElementById('date-input').value        = todayISO();
    document.getElementById('sku-input').value         = '';
    document.getElementById('notes-input').value       = '';
    document.getElementById('product-preview').classList.remove('show');
    document.getElementById('total-preview-wrap').style.display = 'none';
    document.getElementById('drawer-title').textContent = 'Receive Stock';
    document.getElementById('drawer-sub').textContent   = 'Record an incoming delivery';
    document.getElementById('submit-label').textContent = 'Record Receive';
}

/* ── Delete modal ── */
window.openDeleteModal = function (movementId) {
    deleteTargetId = movementId;
    document.getElementById('delete-modal-backdrop').classList.add('show');
};

window.closeDeleteModal = function () {
    document.getElementById('delete-modal-backdrop').classList.remove('show');
    deleteTargetId = null;
};

window.confirmDelete = async function () {
    if (!deleteTargetId) return;
    const btn   = document.getElementById('delete-confirm-btn');
    btn.disabled  = true;
    btn.innerHTML = '<div class="btn-spinner"></div><span>Reversing...</span>';

    const entry = allHistory.find(m => m.id === deleteTargetId);
    if (!entry) { closeDeleteModal(); return; }

    const supplierId = allSuppliers.find(s => s.name === entry.suppliers?.name)?.id || null;

    const { data: deductResult } = await db.rpc('update_receive_stock', {
        p_movement_id:         deleteTargetId,
        p_product_id:          entry.products?.id,
        p_supplier_id:         supplierId,
        p_quantity:            0,
        p_unit_cost:           entry.unit_cost,
        p_notes:               entry.notes,
        p_date:                entry.created_at,
        p_updated_by:          window.currentUser.id,
        p_updated_by_username: window.currentUser.username
    });

    if (deductResult?.error) {
        showToast(deductResult.error, 'error');
        btn.disabled  = false;
        btn.innerHTML = '<i class="fa-solid fa-trash"></i><span>Reverse Entry</span>';
        return;
    }

    const { error: deleteError } = await db
        .from('stock_movements')
        .delete()
        .eq('id', deleteTargetId);

    if (deleteError) {
        showToast('Failed to remove entry. Try again.', 'error');
        btn.disabled  = false;
        btn.innerHTML = '<i class="fa-solid fa-trash"></i><span>Reverse Entry</span>';
        return;
    }

    showToast('Entry reversed and removed.', 'success');
    closeDeleteModal();
    await Promise.all([loadProducts(), loadHistory()]);
    btn.disabled  = false;
    btn.innerHTML = '<i class="fa-solid fa-trash"></i><span>Reverse Entry</span>';
};

/* ── Export ── */
window.exportReceives = function () {
    if (!filteredHistory.length) { showToast('No entries to export.', 'error'); return; }

    const headers = ['Product', 'SKU', 'Supplier', 'Quantity', 'Unit Cost', 'Total Value', 'Delivery Date', 'Received By', 'Notes'];
    const rows    = filteredHistory.map(m => [
        m.products?.name  || '',
        m.products?.sku   || '',
        m.suppliers?.name || '',
        m.quantity,
        m.unit_cost || 0,
        ((m.quantity || 0) * (m.unit_cost || 0)).toFixed(2),
        formatDate(m.created_at),
        m.created_by_username || '',
        m.notes || ''
    ]);

    const csv  = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `receive-history-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('History exported.', 'success');
};

/* ── Close modal on backdrop click ── */
document.getElementById('delete-modal-backdrop').addEventListener('click', function (e) {
    if (e.target === this) closeDeleteModal();
});

/* ── Keyboard ── */
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        closeReceiveDrawer();
        closeDeleteModal();
    }
});

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
    document.getElementById('topbar-avatar').textContent   = initials;
    document.getElementById('topbar-username').textContent = '' + window.currentUser.username;

    /* Signature strip */
    document.getElementById('sig-name').textContent =
        `${window.currentUser.full_name || window.currentUser.username} (${window.currentUser.username})`;

    /* Theme */
    applyTheme(localStorage.getItem('inno-theme') || 'light');

    /* Sidebar */
    renderSidebar('receive', userRole);

    /* Load data */
    await Promise.all([loadProducts(), loadSuppliers(), loadHistory()]);

    /* Reveal page */
    document.getElementById('page-body').style.visibility = 'visible';
})();
