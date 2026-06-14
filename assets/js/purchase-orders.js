/* ==== PURCHASE ORDERS.JS ==== */

/* ── State ── */
let allPOs = [];
let allProducts = [];
let filteredPOs = [];
let currentPage = 1;
const PAGE_SIZE = 10;
let lineItemCount = 0;
let confirmAction = null;
let confirmTargetId = null;
let userRole = null;
let canApprove = false;
let showValue = false;

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
    return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
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

function statusBadge(status) {
    const map = {
        draft: '<span class="badge badge-draft">Draft</span>',
        submitted: '<span class="badge badge-submitted"><span class="badge-dot"></span>Submitted</span>',
        approved: '<span class="badge badge-approved"><span class="badge-dot"></span>Approved</span>',
        rejected: '<span class="badge badge-rejected"><span class="badge-dot"></span>Rejected</span>',
        cancelled: '<span class="badge badge-cancelled">Cancelled</span>'
    };
    return map[status] || `<span class="badge badge-draft">${status}</span>`;
}

/* ── Load products ── */
async function loadProducts() {
    const { data, error } = await db
        .from('products')
        .select('id, name, sku, quantity, reorder_level, unit, unit_cost, categories(name)')
        .eq('is_active', true)
        .order('name', { ascending: true });

    if (error) { showToast('Failed to load products.', 'error'); return; }
    allProducts = data || [];
}

/* ── Load POs ── */
async function loadPOs() {
    let query = db
        .from('purchase_orders')
        .select(`
            id, po_number, client_name, client_contact, status, notes,
            expected_date, created_at, updated_at,
            created_by, created_by_username,
            approved_by_username, approved_at,
            rejection_reason,
            purchase_order_items (
                id, quantity, unit_cost,
                products ( id, name, sku )
            )
        `)
        .order('created_at', { ascending: false });

    if (userRole === 'staff') {
        query = query.eq('created_by', window.currentUser.id);
    }

    const { data, error } = await query;
    if (error) { showToast('Failed to load purchase orders.', 'error'); return; }

    allPOs = data || [];
    updateStats();
    filterPOs();
}

/* ── Update stats ── */
function updateStats() {
    document.querySelectorAll('#stats-row .skeleton').forEach(el => el.classList.remove('skeleton', 'skeleton-val', 'skeleton-lbl'));
    const total = allPOs.length;
    const pending = allPOs.filter(p => p.status === 'submitted').length;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const approved = allPOs.filter(p => p.status === 'approved' && p.approved_at >= monthStart).length;

    document.getElementById('stat-total').textContent = total.toLocaleString();
    document.getElementById('stat-pending').textContent = pending.toLocaleString();
    document.getElementById('stat-approved').textContent = approved.toLocaleString();

    if (showValue) {
        const totalValue = allPOs
            .filter(p => p.status === 'approved')
            .reduce((sum, po) => {
                const poTotal = (po.purchase_order_items || []).reduce((s, item) => s + (item.quantity * item.unit_cost), 0);
                return sum + poTotal;
            }, 0);
        document.getElementById('stat-value').textContent = formatCurrency(totalValue);
    }
}

/* ── Filter ── */
window.filterPOs = function () {
    const search = document.getElementById('po-search').value.toLowerCase();
    const status = document.getElementById('filter-status').value;
    const date = document.getElementById('filter-date').value;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const week = new Date(today); week.setDate(today.getDate() - today.getDay());
    const month = new Date(now.getFullYear(), now.getMonth(), 1);

    filteredPOs = allPOs.filter(po => {
        const matchSearch = !search ||
            (po.po_number || '').toLowerCase().includes(search) ||
            (po.client_name || '').toLowerCase().includes(search);
        const matchStatus = !status || po.status === status;
        const entryDate = new Date(po.created_at);
        const matchDate = !date ||
            (date === 'today' && entryDate >= today) ||
            (date === 'week' && entryDate >= week) ||
            (date === 'month' && entryDate >= month);
        return matchSearch && matchStatus && matchDate;
    });

    currentPage = 1;
    renderTable();
};

/* ── Render table ── */
function renderTable() {
    const tbody = document.getElementById('po-tbody');
    const footer = document.getElementById('po-footer');

    if (!filteredPOs.length) {
        tbody.innerHTML = `
            <tr><td colspan="9">
                <div class="empty-state">
                    <div class="empty-state-icon"><i class="fa-solid fa-file-invoice"></i></div>
                    <h3>No purchase orders found</h3>
                    <p>Create a PO when a client wants to buy stock</p>
                    <button class="btn btn-primary btn-sm" onclick="openDrawer()">
                        <i class="fa-solid fa-plus"></i> Create PO
                    </button>
                </div>
            </td></tr>`;
        footer.style.display = 'none';
        return;
    }

    const total = filteredPOs.length;
    const pages = Math.ceil(total / PAGE_SIZE);
    const start = (currentPage - 1) * PAGE_SIZE;
    const paged = filteredPOs.slice(start, start + PAGE_SIZE);

    tbody.innerHTML = paged.map((po, i) => {
        const itemCount = (po.purchase_order_items || []).length;
        const poTotal = (po.purchase_order_items || []).reduce((s, item) => s + (item.quantity * item.unit_cost), 0);
        const createdInit = getInitials(po.created_by_username || '');
        const approvedInit = getInitials(po.approved_by_username || '');

        const createdSig = `
            <div class="sig-cell">
                <div class="sig-avatar">${createdInit}</div>
                <span class="sig-name">@${po.created_by_username || '—'}</span>
            </div>`;

        const approvedSig = po.approved_by_username
            ? `<div class="sig-cell">
                <div class="sig-avatar" style="background:var(--success-soft);color:var(--success);">${approvedInit}</div>
                <span class="sig-name">@${po.approved_by_username}</span>
               </div>`
            : `<span style="color:var(--text-muted);font-size:12px;">—</span>`;

        /* Build action buttons based on role and status */
        const actions = buildActionButtons(po);

        return `
            <tr class="fade-in" style="animation-delay:${i * 0.03}s">
                <td>
                    <div style="font-weight:700;font-size:13px;color:var(--primary);">${po.po_number}</div>
                </td>
                <td>
                    <div style="font-weight:600;font-size:13px;">${po.client_name || '—'}</div>
                    <div style="font-size:11px;color:var(--text-muted);">${po.client_contact || ''}</div>
                </td>
                <td>
                    <span style="font-size:12.5px;font-weight:600;">${itemCount}</span>
                    <span style="font-size:11px;color:var(--text-muted);"> item${itemCount !== 1 ? 's' : ''}</span>
                </td>
                ${showValue ? `<td style="font-weight:600;">${formatCurrency(poTotal)}</td>` : ''}
                <td>${statusBadge(po.status)}</td>
                <td>${createdSig}</td>
                <td>${approvedSig}</td>
                <td style="font-size:12px;color:var(--text-muted);white-space:nowrap;">${formatDate(po.created_at)}</td>
                <td><div class="action-btns">${actions}</div></td>
            </tr>`;
    }).join('');

    footer.style.display = 'flex';
    document.getElementById('po-info').textContent =
        `Showing ${start + 1}–${Math.min(start + PAGE_SIZE, total)} of ${total} purchase orders`;

    const pag = document.getElementById('po-pagination');
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

/* ── Build action buttons ── */
function buildActionButtons(po) {
    const btns = [];
    const isOwner = po.created_by === window.currentUser.id;
    const isAdmin = userRole === 'root_admin';
    const isMgr = userRole === 'manager';
    const isAcct = userRole === 'accountant';
    const canManage = isAdmin || isMgr || isAcct;

    /* View — always */
    btns.push(`<button class="action-btn" onclick="viewPO('${po.id}')" title="View Details">
        <i class="fa-solid fa-eye"></i></button>`);

    /* Edit — owner on draft, managers on draft/submitted */
    if (po.status === 'draft' && (isOwner || canManage)) {
        btns.push(`<button class="action-btn" onclick="openDrawer('${po.id}')" title="Edit">
            <i class="fa-solid fa-pen"></i></button>`);
    }

    /* Submit — owner on draft */
    if (po.status === 'draft' && isOwner) {
        btns.push(`<button class="action-btn" onclick="submitPO('${po.id}')" title="Submit for Approval"
            style="color:#ea580c;border-color:rgba(234,88,12,0.3);">
            <i class="fa-solid fa-paper-plane"></i></button>`);
    }

    /* Approve / Reject — canManage on submitted */
    if (po.status === 'submitted' && canManage) {
        btns.push(`<button class="action-btn approve" onclick="openConfirm('approve','${po.id}')" title="Approve">
            <i class="fa-solid fa-check"></i></button>`);
        btns.push(`<button class="action-btn reject" onclick="openConfirm('reject','${po.id}')" title="Reject">
            <i class="fa-solid fa-xmark"></i></button>`);
    }

    /* Cancel — admin/manager on approved */
    if (po.status === 'approved' && (isAdmin || isMgr)) {
        btns.push(`<button class="action-btn cancel" onclick="openConfirm('cancel','${po.id}')" title="Cancel PO">
            <i class="fa-solid fa-ban"></i></button>`);
    }

    /* Delete — admin only on draft or rejected */
    if (isAdmin && ['draft', 'rejected'].includes(po.status)) {
        btns.push(`<button class="action-btn delete" onclick="openConfirm('delete','${po.id}')" title="Delete">
            <i class="fa-solid fa-trash"></i></button>`);
    }

    return btns.join('');
}

window.goPage = function (page) {
    const pages = Math.ceil(filteredPOs.length / PAGE_SIZE);
    if (page < 1 || page > pages) return;
    currentPage = page;
    renderTable();
};

/* ══════ DRAWER ══════ */

window.openDrawer = function (poId = null) {
    lineItemCount = 0;
    document.getElementById('edit-po-id').value = poId || '';
    document.getElementById('drawer-title').textContent = poId ? 'Edit Purchase Order' : 'Create Purchase Order';
    document.getElementById('line-items-container').innerHTML = '';
    document.getElementById('po-total').textContent = '$0.00';

    if (poId) {
        const po = allPOs.find(p => p.id === poId);
        if (po) {
            document.getElementById('f-po-number').value = po.po_number || '';
            document.getElementById('f-client-name').value = po.client_name || '';
            document.getElementById('f-client-contact').value = po.client_contact || '';
            document.getElementById('f-expected-date').value = po.expected_date || '';
            document.getElementById('f-notes').value = po.notes || '';

            /* Re-add line items */
            (po.purchase_order_items || []).forEach(item => {
                addLineItem(item.products?.id, item.products?.sku, item.quantity, item.unit_cost);
            });
        }
    } else {
        document.getElementById('f-po-number').value = '';
        document.getElementById('f-client-name').value = '';
        document.getElementById('f-client-contact').value = '';
        document.getElementById('f-expected-date').value = '';
        document.getElementById('f-notes').value = '';
        addLineItem();
    }

    document.getElementById('drawer-backdrop').classList.add('show');
    document.getElementById('po-drawer').classList.add('open');
    document.body.style.overflow = 'hidden';
};

window.closeDrawer = function () {
    document.getElementById('drawer-backdrop').classList.remove('show');
    document.getElementById('po-drawer').classList.remove('open');
    document.body.style.overflow = '';
};

/* ── Add line item row ── */
window.addLineItem = function (productId = '', sku = '', qty = '', cost = '') {
    lineItemCount++;
    const id = `li-${lineItemCount}`;
    const row = document.createElement('div');
    row.className = 'line-item-row';
    row.id = id;

    const productOptions = allProducts.map(p =>
        `<option value="${p.id}" data-sku="${p.sku || ''}" data-cost="${p.unit_cost || 0}" data-stock="${p.quantity}" ${p.id === productId ? 'selected' : ''}>${p.name}</option>`
    ).join('');

    row.innerHTML = `
        <div>
            <select class="form-control li-product" onchange="onLineProductChange('${id}')">
                <option value="">— Select product —</option>
                ${productOptions}
            </select>
            <div class="li-stock-hint" id="${id}-hint"></div>
        </div>
        <div>
            <input type="text" class="form-control li-sku" id="${id}-sku"
                   placeholder="ITEM NO." value="${sku}" disabled>
        </div>
        <div>
            <input type="number" class="form-control li-qty" id="${id}-qty"
                   placeholder="0" min="1" value="${qty}"
                   oninput="onLineQtyChange('${id}')">
        </div>
        <div>
            <input type="number" class="form-control li-cost" id="${id}-cost"
                   placeholder="0.00" min="0" step="0.01" value="${cost}"
                   oninput="updatePOTotal()">
        </div>
        <button class="li-remove" onclick="removeLineItem('${id}')" title="Remove">
            <i class="fa-solid fa-xmark"></i>
        </button>
    `;

    document.getElementById('line-items-container').appendChild(row);

    /* If pre-filled, trigger product change to show stock hint */
    if (productId) {
        setTimeout(() => onLineProductChange(id), 50);
    }

    updatePOTotal();
};

/* ── Product change in line item ── */
window.onLineProductChange = function (rowId) {
    const row = document.getElementById(rowId);
    const select = row.querySelector('.li-product');
    const skuEl = document.getElementById(`${rowId}-sku`);
    const hintEl = document.getElementById(`${rowId}-hint`);
    const costEl = document.getElementById(`${rowId}-cost`);

    const selected = select.options[select.selectedIndex];
    if (!selected || !selected.value) {
        skuEl.value = '';
        hintEl.textContent = '';
        hintEl.className = 'li-stock-hint';
        return;
    }

    const sku = selected.dataset.sku || '';
    const cost = selected.dataset.cost || 0;
    const stock = parseInt(selected.dataset.stock) || 0;

    skuEl.value = sku;
    if (!costEl.value) costEl.value = cost;

    hintEl.className = 'li-stock-hint' + (stock <= 0 ? ' danger' : stock <= 10 ? ' low' : '');
    hintEl.textContent = stock <= 0 ? 'Out of stock' : `${stock.toLocaleString()} in stock`;

    updatePOTotal();
};

/* ── SKU input change — find matching product ── */
window.onLineSkuChange = function (rowId) {
    const row = document.getElementById(rowId);
    const skuEl = document.getElementById(`${rowId}-sku`);
    const select = row.querySelector('.li-product');
    const sku = skuEl.value.trim().toLowerCase();

    if (!sku) return;
    const product = allProducts.find(p => (p.sku || '').toLowerCase() === sku);
    if (product) {
        select.value = product.id;
        onLineProductChange(rowId);
    }
};

/* ── Qty change — validate against stock ── */
window.onLineQtyChange = function (rowId) {
    const row = document.getElementById(rowId);
    const select = row.querySelector('.li-product');
    const qtyEl = document.getElementById(`${rowId}-qty`);
    const hintEl = document.getElementById(`${rowId}-hint`);

    const selected = select.options[select.selectedIndex];
    if (!selected || !selected.value) { updatePOTotal(); return; }

    const stock = parseInt(selected.dataset.stock) || 0;
    const qty = parseInt(qtyEl.value) || 0;

    if (qty > stock) {
        hintEl.className = 'li-stock-hint danger';
        hintEl.textContent = `Only ${stock.toLocaleString()} in stock — cannot exceed available`;
        qtyEl.style.borderColor = 'var(--danger)';
    } else {
        hintEl.className = 'li-stock-hint' + (stock <= 10 ? ' low' : '');
        hintEl.textContent = `${stock.toLocaleString()} in stock`;
        qtyEl.style.borderColor = '';
    }

    updatePOTotal();
};

/* ── Remove line item ── */
window.removeLineItem = function (rowId) {
    const row = document.getElementById(rowId);
    if (row) row.remove();
    updatePOTotal();
};

/* ── Update PO total ── */
window.updatePOTotal = function () {
    let total = 0;
    document.querySelectorAll('.line-item-row').forEach(row => {
        const qty = parseFloat(row.querySelector('.li-qty')?.value) || 0;
        const cost = parseFloat(row.querySelector('.li-cost')?.value) || 0;
        total += qty * cost;
    });
    document.getElementById('po-total').textContent = formatCurrency(total);
};

/* ── Save PO ── */
window.savePO = async function (status) {
    const editId = document.getElementById('edit-po-id').value;
    const poNumber = document.getElementById('f-po-number').value.trim();
    const clientName = document.getElementById('f-client-name').value.trim();
    const clientContact = document.getElementById('f-client-contact').value.trim();
    const expectedDate = document.getElementById('f-expected-date').value;
    const notes = document.getElementById('f-notes').value.trim();
    const btn = status === 'draft'
        ? document.getElementById('save-draft-btn')
        : document.getElementById('submit-btn');

    /* Validate */
    if (!poNumber) { showToast('PO number is required.', 'error'); return; }
    if (!clientName) { showToast('Client name is required.', 'error'); return; }

    /* Collect line items */
    const lineItems = [];
    let hasError = false;

    document.querySelectorAll('.line-item-row').forEach(row => {
        const productId = row.querySelector('.li-product')?.value;
        const qty = parseInt(row.querySelector('.li-qty')?.value) || 0;
        const cost = parseFloat(row.querySelector('.li-cost')?.value) || 0;
        const selected = row.querySelector('.li-product')?.options[row.querySelector('.li-product').selectedIndex];
        const stock = parseInt(selected?.dataset.stock) || 0;

        if (!productId || qty <= 0) { hasError = true; return; }

        if (qty > stock && status === 'submitted') {
            const productName = selected?.text || 'A product';
            showToast(`${productName}: requested ${qty} but only ${stock} in stock.`, 'error');
            hasError = true;
        }

        lineItems.push({ product_id: productId, quantity: qty, unit_cost: cost });
    });

    if (hasError) return;
    if (!lineItems.length) { showToast('Add at least one line item.', 'error'); return; }

    /* Check PO number uniqueness */
    if (!editId) {
        const { data: existing } = await db
            .from('purchase_orders')
            .select('id')
            .eq('po_number', poNumber)
            .maybeSingle();
        if (existing) { showToast('PO number already exists. Use a unique number.', 'error'); return; }
    }

    btn.disabled = true;
    btn.innerHTML = '<div class="btn-spinner"></div><span>Saving...</span>';

    const user = window.currentUser;

    let poId = editId;
    let error;

    if (editId) {
        /* Update PO */
        const { error: updErr } = await db
            .from('purchase_orders')
            .update({
                po_number: poNumber,
                client_name: clientName,
                client_contact: clientContact || null,
                expected_date: expectedDate || null,
                notes: notes || null,
                status,
                updated_at: new Date().toISOString()
            })
            .eq('id', editId);
        error = updErr;

        if (!error) {
            /* Delete old items and re-insert */
            await db.from('purchase_order_items').delete().eq('po_id', editId);
        }
    } else {
        /* Insert PO */
        const { data: newPO, error: insErr } = await db
            .from('purchase_orders')
            .insert({
                po_number: poNumber,
                client_name: clientName,
                client_contact: clientContact || null,
                expected_date: expectedDate || null,
                notes: notes || null,
                status,
                created_by: user.id,
                created_by_username: user.username
            })
            .select('id')
            .single();

        error = insErr;
        if (newPO) poId = newPO.id;
    }

    if (error) {
        showToast(error.message || 'Failed to save PO.', 'error');
        btn.disabled = false;
        btn.innerHTML = status === 'draft'
            ? '<i class="fa-solid fa-floppy-disk"></i> Save Draft'
            : '<i class="fa-solid fa-paper-plane"></i> Submit for Approval';
        return;
    }

    /* Insert line items */
    const itemsPayload = lineItems.map(item => ({ ...item, po_id: poId }));
    const { error: itemErr } = await db.from('purchase_order_items').insert(itemsPayload);

    if (itemErr) {
        showToast('PO saved but failed to save line items. Edit the PO to fix.', 'error');
    } else {
        showToast(
            status === 'draft'
                ? 'PO saved as draft.'
                : 'PO submitted for approval.',
            'success'
        );
    }

    closeDrawer();
    await loadPOs();
    btn.disabled = false;
    btn.innerHTML = status === 'draft'
        ? '<i class="fa-solid fa-floppy-disk"></i> Save Draft'
        : '<i class="fa-solid fa-paper-plane"></i> Submit for Approval';
};

/* ── Submit PO ── */
window.submitPO = async function (poId) {
    const { error } = await db
        .from('purchase_orders')
        .update({ status: 'submitted', updated_at: new Date().toISOString() })
        .eq('id', poId);

    if (error) { showToast('Failed to submit PO.', 'error'); return; }
    showToast('PO submitted for approval.', 'success');
    await loadPOs();
};

/* ══════ VIEW MODAL ══════ */

window.viewPO = function (poId) {
    const po = allPOs.find(p => p.id === poId);
    if (!po) return;

    document.getElementById('view-po-number').textContent = po.po_number;
    document.getElementById('view-po-date').textContent = `Created ${formatDate(po.created_at)}`;

    const poTotal = (po.purchase_order_items || []).reduce((s, i) => s + (i.quantity * i.unit_cost), 0);

    const itemsRows = (po.purchase_order_items || []).map(item => `
        <tr>
            <td>${item.products?.name || '—'}</td>
            <td style="color:var(--text-muted);">${item.products?.sku || '—'}</td>
            <td style="font-weight:600;">${item.quantity.toLocaleString()}</td>
            <td>${formatCurrency(item.unit_cost)}</td>
            <td style="font-weight:700;">${formatCurrency(item.quantity * item.unit_cost)}</td>
        </tr>`).join('');

    const rejectionRow = po.rejection_reason
        ? `<div class="detail-row">
            <span class="detail-label">Rejection Reason</span>
            <span class="detail-val" style="color:var(--danger);">${po.rejection_reason}</span>
           </div>` : '';

    document.getElementById('view-modal-body').innerHTML = `
        <div style="margin-bottom:20px;">
            <div class="detail-row">
                <span class="detail-label">Status</span>
                <span class="detail-val">${statusBadge(po.status)}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Client</span>
                <span class="detail-val">${po.client_name || '—'}</span>
            </div>
            ${po.client_contact ? `<div class="detail-row">
                <span class="detail-label">Contact</span>
                <span class="detail-val">${po.client_contact}</span>
            </div>` : ''}
            ${po.expected_date ? `<div class="detail-row">
                <span class="detail-label">Expected Date</span>
                <span class="detail-val">${formatDate(po.expected_date)}</span>
            </div>` : ''}
            <div class="detail-row">
                <span class="detail-label">Created By</span>
                <span class="detail-val">@${po.created_by_username || '—'}</span>
            </div>
            ${po.approved_by_username ? `<div class="detail-row">
                <span class="detail-label">Approved By</span>
                <span class="detail-val" style="color:var(--success);">@${po.approved_by_username} · ${formatDate(po.approved_at)}</span>
            </div>` : ''}
            ${rejectionRow}
            ${po.notes ? `<div class="detail-row">
                <span class="detail-label">Notes</span>
                <span class="detail-val" style="max-width:280px;text-align:right;">${po.notes}</span>
            </div>` : ''}
        </div>

        <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:10px;">
            Line Items
        </div>
        <div style="border:1px solid var(--border);border-radius:9px;overflow:hidden;margin-bottom:16px;">
            <table class="items-table">
                <thead>
                    <tr>
                        <th>Product</th>
                        <th>SKU</th>
                        <th>Qty</th>
                        <th>Unit Price</th>
                        <th>Total</th>
                    </tr>
                </thead>
                <tbody>${itemsRows}</tbody>
            </table>
        </div>

        ${showValue ? `<div class="po-total-wrap">
            <span class="po-total-label">Order Total</span>
            <span class="po-total-val">${formatCurrency(poTotal)}</span>
        </div>` : ''}
    `;

    document.getElementById('view-modal').classList.add('show');
};

window.closeViewModal = function () {
    document.getElementById('view-modal').classList.remove('show');
};

/* ══════ CONFIRM MODAL ══════ */

window.openConfirm = function (action, poId) {
    confirmAction = action;
    confirmTargetId = poId;
    const po = allPOs.find(p => p.id === poId);

    const iconEl = document.getElementById('confirm-icon');
    const iconI = document.getElementById('confirm-icon-i');
    const titleEl = document.getElementById('confirm-title');
    const bodyEl = document.getElementById('confirm-body');
    const actionBtn = document.getElementById('confirm-action-btn');
    const rejectEl = document.getElementById('reject-reason');

    rejectEl.style.display = 'none';
    rejectEl.value = '';

    const configs = {
        approve: {
            icon: 'success', iconClass: 'fa-solid fa-check',
            title: 'Approve Purchase Order?',
            body: `Approving "${po?.po_number}" will deduct stock for all line items immediately. This cannot be undone without cancelling the PO.`,
            btnClass: 'btn-success', btnText: '<i class="fa-solid fa-check"></i> Approve'
        },
        reject: {
            icon: 'danger', iconClass: 'fa-solid fa-xmark',
            title: 'Reject Purchase Order?',
            body: `Rejecting "${po?.po_number}" will notify the creator. Please provide a reason.`,
            btnClass: 'btn-danger', btnText: '<i class="fa-solid fa-xmark"></i> Reject',
            showReason: true
        },
        cancel: {
            icon: 'warning', iconClass: 'fa-solid fa-ban',
            title: 'Cancel Purchase Order?',
            body: `Cancelling "${po?.po_number}" will reverse the stock deduction and restore all quantities.`,
            btnClass: 'btn-warning', btnText: '<i class="fa-solid fa-ban"></i> Cancel PO'
        },
        delete: {
            icon: 'danger', iconClass: 'fa-solid fa-trash',
            title: 'Delete Purchase Order?',
            body: `"${po?.po_number}" will be permanently deleted. This cannot be undone.`,
            btnClass: 'btn-danger', btnText: '<i class="fa-solid fa-trash"></i> Delete'
        }
    };

    const cfg = configs[action];
    iconEl.className = `confirm-icon ${cfg.icon}`;
    iconI.className = cfg.iconClass;
    titleEl.textContent = cfg.title;
    bodyEl.textContent = cfg.body;
    actionBtn.className = `btn ${cfg.btnClass}`;
    actionBtn.innerHTML = cfg.btnText;

    if (cfg.showReason) rejectEl.style.display = 'block';

    document.getElementById('confirm-modal').classList.add('show');
};

window.closeConfirmModal = function () {
    document.getElementById('confirm-modal').classList.remove('show');
    confirmAction = null;
    confirmTargetId = null;
};

window.executeConfirmAction = async function () {
    const btn = document.getElementById('confirm-action-btn');
    btn.disabled = true;
    btn.innerHTML = '<div class="btn-spinner"></div><span>Processing...</span>';

    const user = window.currentUser;
    let error;

    if (confirmAction === 'approve') {
        const { data, error: rpcErr } = await db.rpc('approve_purchase_order', {
            p_po_id: confirmTargetId,
            p_approved_by: user.id,
            p_approved_by_username: user.username
        });
        if (rpcErr) { error = rpcErr; }
        else if (data?.error) {
            const items = data.items ? '\n\n' + data.items.join('\n') : '';
            showToast(data.error + items, 'error');
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-check"></i> Approve';
            return;
        }

    } else if (confirmAction === 'reject') {
        const reason = document.getElementById('reject-reason').value.trim();
        if (!reason) { showToast('Please enter a rejection reason.', 'error'); btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-xmark"></i> Reject'; return; }

        const { error: updErr } = await db
            .from('purchase_orders')
            .update({
                status: 'rejected',
                rejection_reason: reason,
                updated_at: new Date().toISOString()
            })
            .eq('id', confirmTargetId);
        error = updErr;

    } else if (confirmAction === 'cancel') {
        const { data, error: rpcErr } = await db.rpc('cancel_purchase_order', {
            p_po_id: confirmTargetId,
            p_cancelled_by: user.id,
            p_cancelled_by_username: user.username
        });
        if (rpcErr) { error = rpcErr; }
        else if (data?.error) {
            showToast(data.error, 'error');
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-ban"></i> Cancel PO';
            return;
        }

    } else if (confirmAction === 'delete') {
        await db.from('purchase_order_items').delete().eq('po_id', confirmTargetId);
        const { error: delErr } = await db.from('purchase_orders').delete().eq('id', confirmTargetId);
        error = delErr;
    }

    if (error) {
        showToast(error.message || 'Action failed. Try again.', 'error');
        btn.disabled = false;
        btn.innerHTML = 'Retry';
        return;
    }

    const messages = {
        approve: 'PO approved and stock deducted.',
        reject: 'PO rejected.',
        cancel: 'PO cancelled and stock restored.',
        delete: 'PO deleted.'
    };

    showToast(messages[confirmAction], 'success');
    closeConfirmModal();
    await loadPOs();
};

/* ── Export ── */
window.exportPOs = function () {
    if (!filteredPOs.length) { showToast('No POs to export.', 'error'); return; }

    const headers = ['PO Number', 'Client', 'Items', 'Status', 'Created By', 'Approved By', 'Date'];
    if (showValue) headers.splice(3, 0, 'Total Value');

    const rows = filteredPOs.map(po => {
        const total = (po.purchase_order_items || []).reduce((s, i) => s + (i.quantity * i.unit_cost), 0);
        const row = [
            po.po_number, po.client_name || '', (po.purchase_order_items || []).length,
            po.status, po.created_by_username || '', po.approved_by_username || '',
            formatDate(po.created_at)
        ];
        if (showValue) row.splice(3, 0, total.toFixed(2));
        return row;
    });

    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `purchase-orders-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Purchase orders exported.', 'success');
};

/* ── Close modals ── */
document.getElementById('view-modal').addEventListener('click', function (e) {
    if (e.target === this) closeViewModal();
});
document.getElementById('confirm-modal').addEventListener('click', function (e) {
    if (e.target === this) closeConfirmModal();
});
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeDrawer(); closeViewModal(); closeConfirmModal(); }
});

/* ══════ INIT ══════ */
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

    userRole = window.currentUser.role;
    canApprove = ['root_admin', 'manager', 'accountant'].includes(userRole);
    showValue = userRole !== 'staff';

    /* Topbar */
    const initials = getInitials(window.currentUser.full_name || window.currentUser.username);
    document.getElementById('topbar-avatar').textContent = initials;
    document.getElementById('topbar-username').textContent = '' + window.currentUser.username;

    document.getElementById('sig-display').textContent =
        `${window.currentUser.full_name || window.currentUser.username} (@${window.currentUser.username})`;

    if (!showValue) {
        document.getElementById('th-value').style.display = 'none';
        document.getElementById('stat-value-card').style.display = 'none';
    }

    applyTheme(localStorage.getItem('inno-theme') || 'light');

    renderSidebar('purchase-orders', userRole);
    await Promise.all([loadProducts(), loadPOs()]);
})();