/* ===== ADJUSTMENTS.JS ===== */

/* ── State ── */
let allProducts = [];
let allAdjustments = [];
let filteredAdjustments = [];
let currentPage = 1;
const PAGE_SIZE = 15;
let deleteTargetId = null;
let selectedType = '';
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

function todayISO() {
    return new Date().toISOString().split('T')[0];
}

function formatNum(n) {
    return Number(n || 0).toLocaleString();
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

/* ── Adjustment type selector ── */
window.selectType = function (type) {
    selectedType = type;
    document.getElementById('f-type').value = type;

    const addEl = document.getElementById('type-add');
    const removeEl = document.getElementById('type-remove');

    addEl.className = 'type-option' + (type === 'add' ? ' selected-add' : '');
    removeEl.className = 'type-option' + (type === 'remove' ? ' selected-remove' : '');

    updateNewStock();
};

/* ── Load products ── */
async function loadProducts() {
    const { data, error } = await db
        .from('products')
        .select('id, name, sku, quantity, reorder_level, unit, categories(name)')
        .eq('is_active', true)
        .order('name', { ascending: true });

    if (error) { showToast('Failed to load products.', 'error'); return; }

    allProducts = data || [];

    const select = document.getElementById('f-product');
    select.innerHTML = '<option value="">— Select product —</option>' +
        allProducts.map(p =>
            `<option value="${p.id}">${p.name}${p.sku ? ' (' + p.sku + ')' : ''}</option>`
        ).join('');
}

/* ── Load adjustments ── */
async function loadAdjustments() {
    const { data, error } = await db
        .from('stock_movements')
        .select(`
            id, quantity, reason, notes, created_at, created_by_username,
            adj_type:notes,
            products(id, name, sku)
        `)
        .eq('type', 'adjustment')
        .order('created_at', { ascending: false });

    if (error) { showToast('Failed to load adjustments.', 'error'); return; }

    allAdjustments = data || [];
    updateStats();
    filterAdjustments();
}

/* ── Update stats ── */
function updateStats() {
    document.querySelectorAll('#stats-row .skeleton').forEach(el => el.classList.remove('skeleton', 'skeleton-val', 'skeleton-lbl'));
    const total = allAdjustments.length;
    const added = allAdjustments.filter(a => a.quantity > 0).reduce((s, a) => s + a.quantity, 0);
    const removed = allAdjustments.filter(a => a.quantity < 0).reduce((s, a) => s + Math.abs(a.quantity), 0);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const thisMonth = allAdjustments.filter(a => a.created_at >= monthStart).length;

    document.getElementById('stat-total').textContent = formatNum(total);
    document.getElementById('stat-added').textContent = formatNum(added);
    document.getElementById('stat-removed').textContent = formatNum(removed);
    document.getElementById('stat-month').textContent = formatNum(thisMonth);
}

/* ── Filter ── */
window.filterAdjustments = function () {
    const search = document.getElementById('adj-search').value.toLowerCase();
    const type = document.getElementById('filter-type').value;
    const reason = document.getElementById('filter-reason').value;
    const date = document.getElementById('filter-date').value;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const week = new Date(today); week.setDate(today.getDate() - today.getDay());
    const month = new Date(now.getFullYear(), now.getMonth(), 1);

    filteredAdjustments = allAdjustments.filter(a => {
        const matchSearch = !search ||
            (a.products?.name || '').toLowerCase().includes(search) ||
            (a.reason || '').toLowerCase().includes(search) ||
            (a.created_by_username || '').toLowerCase().includes(search);

        const matchType = !type ||
            (type === 'add' && a.quantity > 0) ||
            (type === 'remove' && a.quantity < 0);

        const matchReason = !reason || a.reason === reason;

        const entryDate = new Date(a.created_at);
        const matchDate = !date ||
            (date === 'today' && entryDate >= today) ||
            (date === 'week' && entryDate >= week) ||
            (date === 'month' && entryDate >= month);

        return matchSearch && matchType && matchReason && matchDate;
    });

    currentPage = 1;
    renderTable();
};

/* ── Render table ── */
function renderTable() {
    const tbody = document.getElementById('adj-tbody');
    const footer = document.getElementById('adj-footer');

    if (!filteredAdjustments.length) {
        tbody.innerHTML = `
            <tr><td colspan="8">
                <div class="empty-state">
                    <div class="empty-state-icon"><i class="fa-solid fa-sliders"></i></div>
                    <h3>No adjustments found</h3>
                    <p>Use the button above to record a stock adjustment</p>
                </div>
            </td></tr>`;
        footer.style.display = 'none';
        return;
    }

    const total = filteredAdjustments.length;
    const pages = Math.ceil(total / PAGE_SIZE);
    const start = (currentPage - 1) * PAGE_SIZE;
    const paged = filteredAdjustments.slice(start, start + PAGE_SIZE);

    tbody.innerHTML = paged.map((a, i) => {
        const isAdd = a.quantity > 0;
        const absQty = Math.abs(a.quantity);
        const initials = getInitials(a.created_by_username || '');
        const typeBadge = isAdd
            ? `<span class="badge badge-add">Added</span>`
            : `<span class="badge badge-remove">Removed</span>`;
        const qtyDisplay = isAdd
            ? `<span style="color:var(--success);font-weight:700;">+${formatNum(absQty)}</span>`
            : `<span style="color:var(--danger);font-weight:700;">−${formatNum(absQty)}</span>`;

        return `
            <tr class="fade-in" style="animation-delay:${i * 0.03}s">
                <td>
                    <div style="font-weight:600;">${a.products?.name || '—'}</div>
                    <div style="font-size:11px;color:var(--text-muted);">${a.products?.sku || 'No Item Number'}</div>
                </td>
                <td>${typeBadge}</td>
                <td>${qtyDisplay}</td>
                <td style="font-size:12.5px;color:var(--text-secondary);">${a.reason || '—'}</td>
                <td style="font-size:12px;color:var(--text-muted);white-space:nowrap;">${formatDate(a.created_at)}</td>
                <td style="font-size:12px;color:var(--text-muted);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${a.notes || ''}">${a.notes || '—'}</td>
                <td>
                    <div class="sig-cell">
                        <div class="sig-avatar">${initials}</div>
                        <span style="font-size:12.5px;font-weight:500;">@${a.created_by_username || '—'}</span>
                    </div>
                </td>
                <td>
                    <div class="action-btns">
                        <button class="action-btn" onclick="editAdjustment('${a.id}')" title="Edit">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
    }).join('');

    footer.style.display = 'flex';
    document.getElementById('adj-info').textContent =
        `Showing ${start + 1}–${Math.min(start + PAGE_SIZE, total)} of ${total} adjustments`;

    const pag = document.getElementById('adj-pagination');
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
    const pages = Math.ceil(filteredAdjustments.length / PAGE_SIZE);
    if (page < 1 || page > pages) return;
    currentPage = page;
    renderTable();
};

/* ── Product change handler ── */
window.onProductChange = function () {
    const productId = document.getElementById('f-product').value;
    const preview = document.getElementById('product-preview');

    if (!productId) {
        preview.classList.remove('show');
        updateNewStock();
        return;
    }

    const product = allProducts.find(p => p.id === productId);
    if (!product) return;

    const initials = (product.name || '').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    document.getElementById('preview-avatar').textContent = initials;
    document.getElementById('preview-name').textContent = product.name;
    document.getElementById('preview-meta').textContent =
        `${product.categories?.name || 'Uncategorised'} · ${product.unit || '—'}`;

    const qtyEl = document.getElementById('preview-qty');
    qtyEl.textContent = formatNum(product.quantity);
    qtyEl.className = 'preview-qty';
    if (product.quantity <= 0) qtyEl.classList.add('danger');
    else if (product.quantity <= product.reorder_level) qtyEl.classList.add('low');

    preview.classList.add('show');
    updateNewStock();
};

/* ── New stock preview ── */
window.updateNewStock = function () {
    const productId = document.getElementById('f-product').value;
    const qty = parseInt(document.getElementById('f-qty').value) || 0;
    const type = document.getElementById('f-type').value;
    const preview = document.getElementById('new-stock-preview');
    const label = document.getElementById('nsp-label');
    const val = document.getElementById('nsp-val');

    if (!productId || !qty || !type) { preview.classList.remove('show', 'add', 'remove'); return; }

    const product = allProducts.find(p => p.id === productId);
    if (!product) return;

    const newQty = type === 'add' ? product.quantity + qty : product.quantity - qty;
    preview.className = `new-stock-preview show ${type}`;
    label.className = `nsp-label ${type}`;
    val.className = `nsp-val ${type}`;
    label.textContent = type === 'add' ? 'New stock will be' : 'Stock will become';
    val.textContent = newQty < 0 ? 'Would go negative!' : formatNum(newQty) + ' units';

    if (newQty < 0) {
        val.style.color = 'var(--danger)';
    } else {
        val.style.color = '';
    }
};

/* ── Drawer ── */
window.openDrawer = function (editId = null) {
    document.getElementById('edit-id').value = editId || '';
    document.getElementById('drawer-title').textContent = editId ? 'Edit Adjustment' : 'New Adjustment';
    document.getElementById('save-label').textContent = editId ? 'Update Adjustment' : 'Save Adjustment';

    if (!editId) {
        /* Reset form */
        selectedType = '';
        document.getElementById('f-type').value = '';
        document.getElementById('f-product').value = '';
        document.getElementById('f-qty').value = '';
        document.getElementById('f-reason').value = '';
        document.getElementById('f-date').value = todayISO();
        document.getElementById('f-notes').value = '';
        document.getElementById('product-preview').classList.remove('show');
        document.getElementById('new-stock-preview').classList.remove('show', 'add', 'remove');
        document.getElementById('type-add').className = 'type-option';
        document.getElementById('type-remove').className = 'type-option';
    }

    document.getElementById('drawer-backdrop').classList.add('show');
    document.getElementById('adj-drawer').classList.add('open');
    document.body.style.overflow = 'hidden';
};

window.closeDrawer = function () {
    document.getElementById('drawer-backdrop').classList.remove('show');
    document.getElementById('adj-drawer').classList.remove('open');
    document.body.style.overflow = '';
};

/* ── Edit adjustment ── */
window.editAdjustment = function (id) {
    const entry = allAdjustments.find(a => a.id === id);
    if (!entry) return;

    openDrawer(id);

    const type = entry.quantity > 0 ? 'add' : 'remove';
    selectType(type);

    document.getElementById('f-product').value = entry.products?.id || '';
    document.getElementById('f-qty').value = Math.abs(entry.quantity);
    document.getElementById('f-reason').value = entry.reason || '';
    document.getElementById('f-date').value = entry.created_at?.split('T')[0] || todayISO();
    document.getElementById('f-notes').value = entry.notes || '';

    onProductChange();
    updateNewStock();
};

/* ── Save adjustment ── */
window.saveAdjustment = async function () {
    const editId = document.getElementById('edit-id').value;
    const type = document.getElementById('f-type').value;
    const productId = document.getElementById('f-product').value;
    const qty = parseInt(document.getElementById('f-qty').value) || 0;
    const reason = document.getElementById('f-reason').value;
    const dateVal = document.getElementById('f-date').value;
    const notes = document.getElementById('f-notes').value.trim();
    const btn = document.getElementById('save-btn');

    /* Validate */
    if (!type) { showToast('Please select an adjustment type.', 'error'); return; }
    if (!productId) { showToast('Please select a product.', 'error'); return; }
    if (qty <= 0) { showToast('Quantity must be greater than zero.', 'error'); return; }
    if (!reason) { showToast('Please select a reason.', 'error'); return; }
    if (!dateVal) { showToast('Please enter a date.', 'error'); return; }

    /* Check stock won't go negative for remove */
    if (type === 'remove') {
        const product = allProducts.find(p => p.id === productId);
        if (product && product.quantity - qty < 0) {
            showToast(`Cannot remove ${qty} units — only ${product.quantity} in stock.`, 'error');
            return;
        }
    }

    btn.disabled = true;
    btn.innerHTML = '<div class="btn-spinner"></div><span>Saving...</span>';

    /* Signed quantity — negative for remove */
    const signedQty = type === 'add' ? qty : -qty;
    const user = window.currentUser;
    const dateISO = new Date(dateVal).toISOString();

    let error;

    if (editId) {
        /* ── Edit: reverse old, apply new atomically ── */
        const old = allAdjustments.find(a => a.id === editId);
        const oldQty = old?.quantity || 0;
        const diff = signedQty - oldQty;

        /* Update movement record */
        const { error: moveErr } = await db
            .from('stock_movements')
            .update({
                quantity: signedQty,
                reason,
                notes: notes || null,
                created_at: dateISO,
                created_by_username: user.username
            })
            .eq('id', editId);

        if (moveErr) { error = moveErr; }
        else {
            /* Atomically adjust product quantity by the diff */
            const { error: prodErr } = await db
                .from('products')
                .update({
                    quantity: db.rpc ? undefined : undefined,
                    updated_at: new Date().toISOString()
                })
                .eq('id', productId);

            /* Use raw SQL increment via rpc */
            const { error: rpcErr } = await db.rpc('adjust_stock_quantity', {
                p_product_id: productId,
                p_diff: diff
            });

            error = rpcErr;
        }
    } else {
        /* ── New adjustment ── */
        /* Insert movement */
        const { error: moveErr } = await db
            .from('stock_movements')
            .insert({
                product_id: productId,
                type: 'adjustment',
                quantity: signedQty,
                reason,
                notes: notes || null,
                created_by: user.id,
                created_by_username: user.username,
                created_at: dateISO
            });

        if (moveErr) { error = moveErr; }
        else {
            /* Atomically update product quantity */
            const { error: rpcErr } = await db.rpc('adjust_stock_quantity', {
                p_product_id: productId,
                p_diff: signedQty
            });
            error = rpcErr;
        }
    }

    if (error) {
        showToast(error.message || 'Failed to save adjustment. Try again.', 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-check"></i><span id="save-label">Save Adjustment</span>';
        return;
    }

    showToast(editId ? 'Adjustment updated.' : 'Adjustment recorded successfully.', 'success');
    closeDrawer();
    await Promise.all([loadProducts(), loadAdjustments()]);
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-check"></i><span id="save-label">Save Adjustment</span>';
};

/* ── Delete modal ── */
window.openDeleteModal = function (id) {
    const entry = allAdjustments.find(a => a.id === id);
    if (!entry) return;
    deleteTargetId = id;
    const absQty = Math.abs(entry.quantity);
    const type = entry.quantity > 0 ? 'add' : 'remove';
    document.getElementById('delete-modal-body').textContent =
        `This will ${type === 'add' ? 'deduct' : 'restore'} ${absQty} units of "${entry.products?.name}" and permanently remove this record.`;
    document.getElementById('delete-modal').classList.add('show');
};

window.closeDeleteModal = function () {
    document.getElementById('delete-modal').classList.remove('show');
    deleteTargetId = null;
};

window.confirmDelete = async function () {
    if (!deleteTargetId) return;
    const btn = document.getElementById('delete-confirm-btn');
    btn.disabled = true;
    btn.innerHTML = '<div class="btn-spinner"></div><span>Undoing...</span>';

    const entry = allAdjustments.find(a => a.id === deleteTargetId);
    if (!entry) { closeDeleteModal(); return; }

    /* Reverse the quantity change */
    const { error: rpcErr } = await db.rpc('adjust_stock_quantity', {
        p_product_id: entry.products?.id,
        p_diff: -entry.quantity
    });

    if (rpcErr) {
        showToast(rpcErr.message || 'Failed to reverse adjustment.', 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-rotate-left"></i> Undo Adjustment';
        return;
    }

    /* Delete the movement record */
    const { error: delErr } = await db
        .from('stock_movements')
        .delete()
        .eq('id', deleteTargetId);

    if (delErr) {
        showToast('Reversed quantity but failed to remove record. Contact admin.', 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-rotate-left"></i> Undo Adjustment';
        return;
    }

    showToast('Adjustment undone successfully.', 'success');
    closeDeleteModal();
    await Promise.all([loadProducts(), loadAdjustments()]);
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-rotate-left"></i> Undo Adjustment';
};

/* ── Export ── */
window.exportAdjustments = function () {
    if (!filteredAdjustments.length) { showToast('No adjustments to export.', 'error'); return; }

    const headers = ['Product', 'SKU', 'Type', 'Quantity', 'Reason', 'Date', 'Notes', 'Signed By'];
    const rows = filteredAdjustments.map(a => [
        a.products?.name || '',
        a.products?.sku || '',
        a.quantity > 0 ? 'Add' : 'Remove',
        Math.abs(a.quantity),
        a.reason || '',
        formatDate(a.created_at),
        a.notes || '',
        a.created_by_username || ''
    ]);

    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `adjustments-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Adjustments exported.', 'success');
};

/* ── Close on backdrop/keyboard ── */
document.getElementById('delete-modal').addEventListener('click', function (e) {
    if (e.target === this) closeDeleteModal();
});
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeDrawer(); closeDeleteModal(); }
});

/* ═══════ INIT ════════ */
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

    /* Signature */
    document.getElementById('sig-display').textContent =
        `${window.currentUser.full_name || window.currentUser.username} (@${window.currentUser.username})`;

    /* Theme */
    applyTheme(localStorage.getItem('inno-theme') || 'light');

    /* Sidebar */
    renderSidebar('adjustments', userRole);

    /* Default date */
    document.getElementById('f-date').value = todayISO();

    /* Load */
    await Promise.all([loadProducts(), loadAdjustments()]);
})();