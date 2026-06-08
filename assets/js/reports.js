/* ==== REPORTS.JS ==== */

let allProducts = [];
let allCategories = [];
let currentReport = null;
let currentData = [];
let currentCols = [];
let userRole = null;

/* ── Helpers ── */
function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(' ').filter(Boolean);
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatCurrency(val) {
    if (!val && val !== 0) return '$0.00';
    return '$' + Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(str) {
    if (!str) return '—';
    return new Date(str).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function monthStart() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
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

/* ── Populate category dropdowns ── */
async function loadMeta() {
    const [{ data: cats }, { data: prods }] = await Promise.all([
        db.from('categories').select('id, name').order('name'),
        db.from('products').select('id, name, sku, quantity, reorder_level, unit_cost, is_active, category_id, categories(name)').eq('is_active', true).order('name')
    ]);

    allCategories = cats || [];
    allProducts = prods || [];

    const catOptions = '<option value="">All Categories</option>' +
        allCategories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

    ['stock-cat', 'val-cat', 'low-cat'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = catOptions;
    });

    /* Default date ranges to current month */
    ['move-from', 'po-from'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = monthStart();
    });
    ['move-to', 'po-to'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = todayISO();
    });
}

/* ═════ GENERATE REPORTS ═════ */

window.generateReport = async function (key) {
    /* Highlight active card */
    document.querySelectorAll('.report-card').forEach(c => c.classList.remove('active'));
    document.getElementById(`card-${key}`).classList.add('active');

    /* Set button loading state */
    const btn = document.querySelector(`#card-${key} .btn-generate`);
    btn.disabled = true;
    btn.innerHTML = '<div class="btn-spinner"></div><span>Generating...</span>';

    currentReport = key;
    currentData = [];
    currentCols = [];

    try {
        switch (key) {
            case 'stock': await genStock(); break;
            case 'movement': await genMovement(); break;
            case 'po': await genPO(); break;
            case 'supplier': await genSupplier(); break;
            case 'valuation': await genValuation(); break;
            case 'lowstock': await genLowStock(); break;
        }
    } catch (err) {
        showToast('Failed to generate report. Try again.', 'error');
        console.error(err);
    }

    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-chart-bar"></i> Generate Report';

    /* Scroll to preview */
    document.getElementById('report-preview').scrollIntoView({ behavior: 'smooth', block: 'start' });
};

/* ── 1. Stock Report ── */
async function genStock() {
    const cat = document.getElementById('stock-cat').value;
    const status = document.getElementById('stock-status').value;

    let data = allProducts.filter(p => {
        const matchCat = !cat || p.category_id === cat;
        const matchSt = !status ||
            (status === 'in' && p.quantity > p.reorder_level) ||
            (status === 'low' && p.quantity > 0 && p.quantity <= p.reorder_level) ||
            (status === 'out' && p.quantity <= 0);
        return matchCat && matchSt;
    });

    currentData = data;
    currentCols = ['Product', 'SKU', 'Category', 'Unit', 'Qty', 'Reorder Level', 'Status'];

    const rows = data.map(p => {
        const st = p.quantity <= 0 ? 'Out of Stock' : p.quantity <= p.reorder_level ? 'Low Stock' : 'In Stock';
        const stClass = p.quantity <= 0 ? 'badge badge-danger' : p.quantity <= p.reorder_level ? 'badge badge-warning' : 'badge badge-success';
        return `<tr>
            <td style="font-weight:600;">${p.name}</td>
            <td style="color:var(--text-muted);font-size:12px;">${p.sku || '—'}</td>
            <td>${p.categories?.name || '—'}</td>
            <td style="color:var(--text-muted);">${p.unit || '—'}</td>
            <td style="font-weight:700;">${p.quantity.toLocaleString()}</td>
            <td style="color:var(--text-muted);">${p.reorder_level}</td>
            <td><span class="${stClass}"><span class="badge-dot"></span>${st}</span></td>
        </tr>`;
    }).join('');

    showPreview(
        'Stock Report',
        `${data.length} products · Generated ${formatDate(new Date())}`,
        ['Product', 'SKU', 'Category', 'Unit', 'Qty', 'Reorder Level', 'Status'],
        rows,
        !rows
    );
}

/* ── 2. Stock Movement Report ── */
async function genMovement() {
    const type = document.getElementById('move-type').value;
    const fromVal = document.getElementById('move-from').value;
    const toVal = document.getElementById('move-to').value;

    if (!fromVal || !toVal) { showToast('Please select a date range.', 'error'); return; }

    let query = db
        .from('stock_movements')
        .select('id, type, quantity, reason, reference, created_at, created_by_username, products(name, sku), suppliers(name)')
        .gte('created_at', fromVal + 'T00:00:00')
        .lte('created_at', toVal + 'T23:59:59')
        .order('created_at', { ascending: false });

    if (type) query = query.eq('type', type);

    const { data, error } = await query;
    if (error) { showToast('Failed to fetch movements.', 'error'); return; }

    currentData = data || [];
    currentCols = ['Product', 'SKU', 'Type', 'Quantity', 'Reference', 'Date', 'Signed By'];

    const typeLabel = { receive: 'Receive', adjustment: 'Adjustment', out: 'Purchase Order' };
    const typeBadge = {
        receive: 'badge badge-receive',
        adjustment: 'badge badge-adjustment',
        out: 'badge badge-po'
    };

    const rows = currentData.map(m => {
        const isIn = m.type === 'receive' || (m.type === 'adjustment' && m.quantity > 0);
        const qSign = isIn ? `<span class="qty-signed in">+${Math.abs(m.quantity)}</span>` : `<span class="qty-signed out">−${Math.abs(m.quantity)}</span>`;
        const ref = m.suppliers?.name || m.reference || m.reason || '—';
        return `<tr>
            <td style="font-weight:600;">${m.products?.name || '—'}</td>
            <td style="color:var(--text-muted);font-size:12px;">${m.products?.sku || '—'}</td>
            <td><span class="${typeBadge[m.type] || 'badge badge-neutral'}">${typeLabel[m.type] || m.type}</span></td>
            <td>${qSign}</td>
            <td style="font-size:12.5px;color:var(--text-secondary);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${ref}</td>
            <td style="font-size:12px;color:var(--text-muted);white-space:nowrap;">${formatDate(m.created_at)}</td>
            <td>
                <div class="sig-cell">
                    <div class="sig-avatar">${getInitials(m.created_by_username || '')}</div>
                    <span class="sig-name">@${m.created_by_username || '—'}</span>
                </div>
            </td>
        </tr>`;
    }).join('');

    showPreview(
        'Stock Movement Report',
        `${currentData.length} movements · ${formatDate(fromVal)} — ${formatDate(toVal)}`,
        currentCols, rows
    );
}

/* ── 3. Purchase Order Report ── */
async function genPO() {
    const status = document.getElementById('po-status').value;
    const fromVal = document.getElementById('po-from').value;
    const toVal = document.getElementById('po-to').value;

    if (!fromVal || !toVal) { showToast('Please select a date range.', 'error'); return; }

    let query = db
        .from('purchase_orders')
        .select('id, po_number, client_name, status, created_at, created_by_username, approved_by_username, approved_at, purchase_order_items(quantity, unit_cost)')
        .gte('created_at', fromVal + 'T00:00:00')
        .lte('created_at', toVal + 'T23:59:59')
        .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) { showToast('Failed to fetch purchase orders.', 'error'); return; }

    currentData = data || [];
    currentCols = ['PO Number', 'Client', 'Items', 'Total Value', 'Status', 'Created By', 'Approved By', 'Date'];

    const statusBadge = {
        draft: 'badge badge-neutral',
        submitted: 'badge badge-warning',
        approved: 'badge badge-success',
        rejected: 'badge badge-danger',
        cancelled: 'badge badge-neutral'
    };

    const rows = currentData.map(po => {
        const total = (po.purchase_order_items || []).reduce((s, i) => s + (i.quantity * i.unit_cost), 0);
        return `<tr>
            <td style="font-weight:700;color:var(--primary);">${po.po_number}</td>
            <td style="font-weight:600;">${po.client_name || '—'}</td>
            <td style="color:var(--text-muted);">${(po.purchase_order_items || []).length} items</td>
            <td style="font-weight:600;">${formatCurrency(total)}</td>
            <td><span class="${statusBadge[po.status] || 'badge badge-neutral'}">${po.status}</span></td>
            <td style="font-size:12.5px;">@${po.created_by_username || '—'}</td>
            <td style="font-size:12.5px;color:var(--success);">${po.approved_by_username ? '@' + po.approved_by_username : '—'}</td>
            <td style="font-size:12px;color:var(--text-muted);white-space:nowrap;">${formatDate(po.created_at)}</td>
        </tr>`;
    }).join('');

    const totalVal = currentData.reduce((s, po) => s + (po.purchase_order_items || []).reduce((ss, i) => ss + (i.quantity * i.unit_cost), 0), 0);

    showPreview(
        'Purchase Order Report',
        `${currentData.length} orders · Total value: ${formatCurrency(totalVal)} · ${formatDate(fromVal)} — ${formatDate(toVal)}`,
        currentCols, rows
    );
}

/* ── 4. Supplier Report ── */
async function genSupplier() {
    const statusF = document.getElementById('sup-status').value;

    const [{ data: suppliers }, { data: movements }] = await Promise.all([
        db.from('suppliers').select('id, name, contact_person, phone, email, payment_terms, is_active').order('name'),
        db.from('stock_movements').select('supplier_id, quantity, unit_cost').eq('type', 'receive')
    ]);

    let data = suppliers || [];
    if (statusF === 'active') data = data.filter(s => s.is_active);
    if (statusF === 'inactive') data = data.filter(s => !s.is_active);

    /* Aggregate receive data */
    const countMap = {};
    const valueMap = {};
    (movements || []).forEach(m => {
        if (!m.supplier_id) return;
        countMap[m.supplier_id] = (countMap[m.supplier_id] || 0) + 1;
        valueMap[m.supplier_id] = (valueMap[m.supplier_id] || 0) + ((m.quantity || 0) * (m.unit_cost || 0));
    });

    currentData = data;
    currentCols = ['Supplier', 'Contact Person', 'Phone', 'Email', 'Payment Terms', 'Status', 'Total Receives', 'Total Value'];

    const rows = data.map(s => `
        <tr>
            <td style="font-weight:600;">${s.name}</td>
            <td style="color:var(--text-muted);">${s.contact_person || '—'}</td>
            <td style="color:var(--text-muted);font-size:12px;">${s.phone || '—'}</td>
            <td style="color:var(--text-muted);font-size:12px;">${s.email || '—'}</td>
            <td style="color:var(--text-muted);">${s.payment_terms || '—'}</td>
            <td><span class="badge ${s.is_active ? 'badge-success' : 'badge-neutral'}">${s.is_active ? 'Active' : 'Inactive'}</span></td>
            <td style="font-weight:600;">${(countMap[s.id] || 0).toLocaleString()}</td>
            <td style="font-weight:600;">${formatCurrency(valueMap[s.id] || 0)}</td>
        </tr>`).join('');

    showPreview(
        'Supplier Report',
        `${data.length} suppliers · Generated ${formatDate(new Date())}`,
        currentCols, rows
    );
}

/* ── 5. Inventory Valuation ── */
async function genValuation() {
    const cat = document.getElementById('val-cat').value;

    let data = allProducts.filter(p => !cat || p.category_id === cat);

    /* Group by category */
    const groups = {};
    data.forEach(p => {
        const catName = p.categories?.name || 'Uncategorised';
        if (!groups[catName]) groups[catName] = [];
        groups[catName].push(p);
    });

    currentData = data;
    currentCols = ['Product', 'SKU', 'Category', 'Qty', 'Unit Cost', 'Total Value'];

    let rows = '';
    let grandTotal = 0;

    Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0])).forEach(([catName, items]) => {
        const catTotal = items.reduce((s, p) => s + (p.quantity * (p.unit_cost || 0)), 0);
        grandTotal += catTotal;

        rows += `<tr>
            <td colspan="6" style="font-size:11px;font-weight:700;color:var(--text-muted);
                text-transform:uppercase;letter-spacing:0.6px;background:var(--bg);
                padding:8px 16px;">${catName}</td>
        </tr>`;

        items.forEach(p => {
            const val = p.quantity * (p.unit_cost || 0);
            rows += `<tr>
                <td style="font-weight:600;padding-left:28px;">${p.name}</td>
                <td style="color:var(--text-muted);font-size:12px;">${p.sku || '—'}</td>
                <td style="color:var(--text-muted);">${catName}</td>
                <td style="font-weight:700;">${p.quantity.toLocaleString()}</td>
                <td>${formatCurrency(p.unit_cost || 0)}</td>
                <td style="font-weight:700;">${formatCurrency(val)}</td>
            </tr>`;
        });

        rows += `<tr>
            <td colspan="5" style="font-size:12px;font-weight:600;color:var(--text-secondary);
                text-align:right;padding-right:8px;background:var(--bg);">${catName} subtotal</td>
            <td style="font-weight:800;background:var(--bg);">${formatCurrency(catTotal)}</td>
        </tr>`;
    });

    /* Grand total row */
    rows += `<tr class="summary-row">
        <td colspan="5" style="text-align:right;padding-right:8px;">Grand Total</td>
        <td>${formatCurrency(grandTotal)}</td>
    </tr>`;

    showPreview(
        'Inventory Valuation Report',
        `${data.length} products · Total value: ${formatCurrency(grandTotal)} · Generated ${formatDate(new Date())}`,
        currentCols, rows
    );
}

/* ── 6. Low Stock Report ── */
async function genLowStock() {
    const cat = document.getElementById('low-cat').value;

    let data = allProducts
        .filter(p => p.quantity <= p.reorder_level && (!cat || p.category_id === cat))
        .sort((a, b) => a.quantity - b.quantity); /* Out of stock first */

    currentData = data;
    currentCols = ['Product', 'SKU', 'Category', 'Unit', 'Current Qty', 'Reorder Level', 'Urgency'];

    const rows = data.map(p => {
        const isOut = p.quantity <= 0;
        const urgency = isOut
            ? '<span class="urgency-out"><i class="fa-solid fa-circle-xmark"></i> Out of Stock</span>'
            : '<span class="urgency-low"><i class="fa-solid fa-triangle-exclamation"></i> Low Stock</span>';
        return `<tr>
            <td style="font-weight:600;">${p.name}</td>
            <td style="color:var(--text-muted);font-size:12px;">${p.sku || '—'}</td>
            <td>${p.categories?.name || '—'}</td>
            <td style="color:var(--text-muted);">${p.unit || '—'}</td>
            <td style="font-weight:800;color:${isOut ? 'var(--danger)' : '#ea580c'};">${p.quantity.toLocaleString()}</td>
            <td style="color:var(--text-muted);">${p.reorder_level}</td>
            <td>${urgency}</td>
        </tr>`;
    }).join('');

    showPreview(
        'Low Stock Report',
        `${data.length} items need attention · Generated ${formatDate(new Date())}`,
        currentCols, rows,
        !rows,
        data.length === 0
            ? '<div class="preview-empty"><i class="fa-solid fa-circle-check"></i><p>All stock levels are healthy — no items below reorder level.</p></div>'
            : null
    );
}

/* ── Render preview ── */
function showPreview(title, meta, cols, rows, isEmpty = false, emptyHTML = null) {
    document.getElementById('preview-title').textContent = title;
    document.getElementById('preview-meta').textContent = meta;

    const preview = document.getElementById('report-preview');
    preview.classList.add('show');

    if (isEmpty && emptyHTML) {
        document.getElementById('preview-content').innerHTML = emptyHTML;
        return;
    }

    if (!rows) {
        document.getElementById('preview-content').innerHTML =
            '<div class="preview-empty"><i class="fa-solid fa-table"></i><p>No data found for the selected filters.</p></div>';
        return;
    }

    const headers = cols.map(c => `<th>${c}</th>`).join('');
    document.getElementById('preview-content').innerHTML = `
        <div class="table-card">
            <div class="table-wrap">
                <table>
                    <thead><tr>${headers}</tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </div>`;
}

/* ── Export ── */
window.exportReport = function (format) {
    if (!currentData.length) { showToast('Generate a report first.', 'error'); return; }

    const reportNames = {
        stock: 'stock-report',
        movement: 'stock-movement-report',
        po: 'purchase-order-report',
        supplier: 'supplier-report',
        valuation: 'inventory-valuation',
        lowstock: 'low-stock-report'
    };

    const filename = `${reportNames[currentReport]}-${todayISO()}`;

    /* Build flat rows for export */
    let exportRows = [];

    switch (currentReport) {
        case 'stock':
            exportRows = currentData.map(p => [
                p.name, p.sku || '', p.categories?.name || '', p.unit || '',
                p.quantity, p.reorder_level,
                p.quantity <= 0 ? 'Out of Stock' : p.quantity <= p.reorder_level ? 'Low Stock' : 'In Stock'
            ]); break;

        case 'movement':
            exportRows = currentData.map(m => [
                m.products?.name || '', m.products?.sku || '', m.type,
                m.quantity, m.suppliers?.name || m.reference || m.reason || '',
                formatDate(m.created_at), m.created_by_username || ''
            ]); break;

        case 'po':
            exportRows = currentData.map(po => {
                const total = (po.purchase_order_items || []).reduce((s, i) => s + (i.quantity * i.unit_cost), 0);
                return [po.po_number, po.client_name || '', (po.purchase_order_items || []).length,
                total.toFixed(2), po.status, po.created_by_username || '',
                po.approved_by_username || '', formatDate(po.created_at)];
            }); break;

        case 'supplier':
            exportRows = currentData.map(s => [
                s.name, s.contact_person || '', s.phone || '', s.email || '',
                s.payment_terms || '', s.is_active ? 'Active' : 'Inactive'
            ]); break;

        case 'valuation':
            exportRows = currentData.map(p => [
                p.name, p.sku || '', p.categories?.name || '',
                p.quantity, p.unit_cost || 0,
                (p.quantity * (p.unit_cost || 0)).toFixed(2)
            ]); break;

        case 'lowstock':
            exportRows = currentData.map(p => [
                p.name, p.sku || '', p.categories?.name || '', p.unit || '',
                p.quantity, p.reorder_level,
                p.quantity <= 0 ? 'Out of Stock' : 'Low Stock'
            ]); break;
    }

    const csv = [currentCols, ...exportRows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Report exported successfully.', 'success');
};

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

    userRole = window.currentUser.role;

    const initials = getInitials(window.currentUser.full_name || window.currentUser.username);
    document.getElementById('topbar-avatar').textContent = initials;
    document.getElementById('topbar-username').textContent = '' + window.currentUser.username;

    applyTheme(localStorage.getItem('inno-theme') || 'light');
    renderSidebar('reports', userRole);
    await loadMeta();
})();