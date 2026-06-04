/* ============================================================
   assets/js/suppliers.js
   Suppliers page — root_admin and manager only for CUD
   accountant can view only
   ============================================================ */

let allSuppliers = [];
let filteredSuppliers = [];
let receiveCountMap = {};
let receiveTotalMap = {};
let currentPage = 1;
const PAGE_SIZE = 15;
let deleteTargetId = null;
let userRole = null;
let canEdit = false;

/* ── Helpers ── */
function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(' ').filter(Boolean);
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatCurrency(val) {
    if (!val && val !== 0) return '—';
    if (val >= 1_000_000) return '$' + (val / 1_000_000).toFixed(1) + 'M';
    if (val >= 1_000) return '$' + (val / 1_000).toFixed(1) + 'K';
    return '$' + Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

/* ── Load suppliers ── */
async function loadSuppliers() {
    const { data, error } = await db
        .from('suppliers')
        .select('id, name, contact_person, phone, email, address, payment_terms, notes, is_active, created_at')
        .order('name', { ascending: true });

    if (error) { showToast('Failed to load suppliers.', 'error'); return; }
    allSuppliers = data || [];

    /* Load receive counts and totals per supplier */
    const { data: movements } = await db
        .from('stock_movements')
        .select('supplier_id, quantity, unit_cost')
        .eq('type', 'receive');

    receiveCountMap = {};
    receiveTotalMap = {};

    (movements || []).forEach(m => {
        if (!m.supplier_id) return;
        receiveCountMap[m.supplier_id] = (receiveCountMap[m.supplier_id] || 0) + 1;
        receiveTotalMap[m.supplier_id] = (receiveTotalMap[m.supplier_id] || 0) + ((m.quantity || 0) * (m.unit_cost || 0));
    });

    updateStats();
    filterSuppliers();
}

/* ── Stats ── */
function updateStats() {
    const total = allSuppliers.length;
    const active = allSuppliers.filter(s => s.is_active).length;
    const totalValue = Object.values(receiveTotalMap).reduce((s, v) => s + v, 0);

    document.getElementById('stat-total').textContent = total.toLocaleString();
    document.getElementById('stat-active').textContent = active.toLocaleString();
    document.getElementById('stat-value').textContent = formatCurrency(totalValue);
}

/* ── Filter ── */
window.filterSuppliers = function () {
    const search = document.getElementById('sup-search').value.toLowerCase();
    const status = document.getElementById('filter-status').value;

    filteredSuppliers = allSuppliers.filter(s => {
        const matchSearch = !search ||
            s.name.toLowerCase().includes(search) ||
            (s.contact_person || '').toLowerCase().includes(search) ||
            (s.email || '').toLowerCase().includes(search) ||
            (s.phone || '').toLowerCase().includes(search);
        const matchStatus = !status ||
            (status === 'active' && s.is_active) ||
            (status === 'inactive' && !s.is_active);
        return matchSearch && matchStatus;
    });

    currentPage = 1;
    renderTable();
};

/* ── Render table ── */
function renderTable() {
    const tbody = document.getElementById('sup-tbody');
    const footer = document.getElementById('sup-footer');

    if (!filteredSuppliers.length) {
        tbody.innerHTML = `
            <tr><td colspan="6">
                <div class="empty-state">
                    <div class="empty-state-icon"><i class="fa-solid fa-handshake"></i></div>
                    <h3>No suppliers found</h3>
                    <p>Add suppliers so they appear on the Receive Stock page</p>
                    ${canEdit ? '<button class="btn btn-primary btn-sm" onclick="openDrawer()"><i class="fa-solid fa-plus"></i> Add Supplier</button>' : ''}
                </div>
            </td></tr>`;
        footer.style.display = 'none';
        return;
    }

    const total = filteredSuppliers.length;
    const pages = Math.ceil(total / PAGE_SIZE);
    const start = (currentPage - 1) * PAGE_SIZE;
    const paged = filteredSuppliers.slice(start, start + PAGE_SIZE);

    tbody.innerHTML = paged.map((s, i) => {
        const initials = getInitials(s.name);
        const receiveCount = receiveCountMap[s.id] || 0;
        const statusBadge = s.is_active
            ? '<span class="badge badge-success"><span class="badge-dot"></span>Active</span>'
            : '<span class="badge badge-neutral">Inactive</span>';

        const actions = canEdit ? `
            <div class="action-btns">
                <button class="action-btn" onclick="openDrawer('${s.id}')" title="Edit">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button class="action-btn ${s.is_active ? '' : 'approve'}"
                    onclick="toggleActive('${s.id}', ${!s.is_active})"
                    title="${s.is_active ? 'Deactivate' : 'Reactivate'}">
                    <i class="fa-solid ${s.is_active ? 'fa-toggle-on' : 'fa-toggle-off'}"></i>
                </button>
                ${userRole === 'root_admin' ? `
                <button class="action-btn delete" onclick="openDeleteModal('${s.id}','${s.name.replace(/'/g, "\\'")}')" title="Delete">
                    <i class="fa-solid fa-trash"></i>
                </button>` : ''}
            </div>` : '';

        return `
            <tr class="fade-in" style="animation-delay:${i * 0.03}s">
                <td>
                    <div style="display:flex;align-items:center;gap:10px;">
                        <div class="supplier-avatar">${initials}</div>
                        <div>
                            <div style="font-weight:600;font-size:13px;">${s.name}</div>
                            ${s.address ? `<div style="font-size:11px;color:var(--text-muted);margin-top:1px;">${s.address.split('\n')[0]}</div>` : ''}
                        </div>
                    </div>
                </td>
                <td>
                    <div class="contact-cell">
                        ${s.contact_person ? `<span style="font-size:13px;font-weight:500;color:var(--text-primary);">${s.contact_person}</span>` : ''}
                        ${s.phone ? `<span><i class="fa-solid fa-phone"></i>${s.phone}</span>` : ''}
                        ${s.email ? `<span><i class="fa-regular fa-envelope"></i>${s.email}</span>` : ''}
                    </div>
                </td>
                <td style="font-size:12.5px;color:var(--text-secondary);">${s.payment_terms || '—'}</td>
                <td>
                    <span style="font-weight:600;font-size:13px;">${receiveCount.toLocaleString()}</span>
                    <span style="font-size:11px;color:var(--text-muted);"> receive${receiveCount !== 1 ? 's' : ''}</span>
                </td>
                <td>${statusBadge}</td>
                <td>${actions}</td>
            </tr>`;
    }).join('');

    footer.style.display = 'flex';
    document.getElementById('sup-info').textContent =
        `Showing ${start + 1}–${Math.min(start + PAGE_SIZE, total)} of ${total} suppliers`;

    const pag = document.getElementById('sup-pagination');
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
    const pages = Math.ceil(filteredSuppliers.length / PAGE_SIZE);
    if (page < 1 || page > pages) return;
    currentPage = page;
    renderTable();
};

/* ── Drawer ── */
window.openDrawer = function (supplierId = null) {
    document.getElementById('edit-id').value = supplierId || '';
    document.getElementById('drawer-title').textContent = supplierId ? 'Edit Supplier' : 'Add Supplier';
    document.getElementById('save-label').textContent = supplierId ? 'Update Supplier' : 'Save Supplier';
    document.getElementById('active-toggle-wrap').style.display = supplierId ? 'block' : 'none';

    if (supplierId) {
        const s = allSuppliers.find(s => s.id === supplierId);
        if (s) {
            document.getElementById('f-name').value = s.name || '';
            document.getElementById('f-contact').value = s.contact_person || '';
            document.getElementById('f-phone').value = s.phone || '';
            document.getElementById('f-email').value = s.email || '';
            document.getElementById('f-terms').value = s.payment_terms || '';
            document.getElementById('f-address').value = s.address || '';
            document.getElementById('f-notes').value = s.notes || '';
            document.getElementById('f-active').value = String(s.is_active);
        }
    } else {
        ['f-name', 'f-contact', 'f-phone', 'f-email', 'f-terms', 'f-address', 'f-notes']
            .forEach(id => { document.getElementById(id).value = ''; });
    }

    document.getElementById('drawer-backdrop').classList.add('show');
    document.getElementById('sup-drawer').classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.getElementById('f-name').focus(), 300);
};

window.closeDrawer = function () {
    document.getElementById('drawer-backdrop').classList.remove('show');
    document.getElementById('sup-drawer').classList.remove('open');
    document.body.style.overflow = '';
};

window.saveSupplier = async function () {
    const id = document.getElementById('edit-id').value;
    const name = document.getElementById('f-name').value.trim();
    const contact = document.getElementById('f-contact').value.trim();
    const phone = document.getElementById('f-phone').value.trim();
    const email = document.getElementById('f-email').value.trim();
    const terms = document.getElementById('f-terms').value.trim();
    const address = document.getElementById('f-address').value.trim();
    const notes = document.getElementById('f-notes').value.trim();
    const active = document.getElementById('f-active').value === 'true';
    const btn = document.getElementById('save-btn');

    if (!name) { showToast('Supplier name is required.', 'error'); return; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showToast('Please enter a valid email address.', 'error'); return;
    }

    btn.disabled = true;
    btn.innerHTML = '<div class="btn-spinner"></div><span>Saving...</span>';

    const payload = {
        name,
        contact_person: contact || null,
        phone: phone || null,
        email: email || null,
        payment_terms: terms || null,
        address: address || null,
        notes: notes || null,
        updated_at: new Date().toISOString()
    };

    if (id) payload.is_active = active;
    else {
        payload.is_active = true;
        payload.created_by = window.currentUser.id;
    }

    let error;
    if (id) {
        ({ error } = await db.from('suppliers').update(payload).eq('id', id));
    } else {
        ({ error } = await db.from('suppliers').insert(payload));
    }

    if (error) {
        showToast(error.message || 'Failed to save supplier.', 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-check"></i><span id="save-label">Save Supplier</span>';
        return;
    }

    showToast(id ? 'Supplier updated.' : 'Supplier added.', 'success');
    closeDrawer();
    await loadSuppliers();
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-check"></i><span id="save-label">Save Supplier</span>';
};

/* ── Toggle active ── */
window.toggleActive = async function (id, newState) {
    const supplier = allSuppliers.find(s => s.id === id);
    const action = newState ? 'Reactivate' : 'Deactivate';

    const { error } = await db
        .from('suppliers')
        .update({ is_active: newState, updated_at: new Date().toISOString() })
        .eq('id', id);

    if (error) { showToast(`Failed to ${action.toLowerCase()} supplier.`, 'error'); return; }
    showToast(`${supplier?.name} ${newState ? 'reactivated' : 'deactivated'}.`, 'success');
    await loadSuppliers();
};

/* ── Delete modal ── */
window.openDeleteModal = function (id, name) {
    deleteTargetId = id;
    const receiveCount = receiveCountMap[id] || 0;

    if (receiveCount > 0) {
        document.getElementById('delete-title').textContent = 'Cannot Delete Supplier';
        document.getElementById('delete-body').textContent =
            `"${name}" has ${receiveCount} receive entr${receiveCount !== 1 ? 'ies' : 'y'} linked to it. Deactivate instead to hide from dropdowns while preserving history.`;
        document.getElementById('delete-confirm-btn').style.display = 'none';
    } else {
        document.getElementById('delete-title').textContent = `Delete "${name}"?`;
        document.getElementById('delete-body').textContent = 'This supplier has no history and will be permanently removed.';
        document.getElementById('delete-confirm-btn').style.display = 'flex';
    }

    document.getElementById('delete-modal').classList.add('show');
};

window.closeDeleteModal = function () {
    document.getElementById('delete-modal').classList.remove('show');
    deleteTargetId = null;
};

window.confirmDelete = async function () {
    const btn = document.getElementById('delete-confirm-btn');
    btn.disabled = true;
    btn.innerHTML = '<div class="btn-spinner"></div><span>Deleting...</span>';

    const { error } = await db.from('suppliers').delete().eq('id', deleteTargetId);

    if (error) {
        showToast(error.message || 'Failed to delete supplier.', 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-trash"></i> Delete';
        return;
    }

    showToast('Supplier deleted.', 'success');
    closeDeleteModal();
    await loadSuppliers();
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-trash"></i> Delete';
};

/* ── Export ── */
window.exportSuppliers = function () {
    if (!filteredSuppliers.length) { showToast('No suppliers to export.', 'error'); return; }

    const headers = ['Name', 'Contact Person', 'Phone', 'Email', 'Payment Terms', 'Address', 'Status', 'Total Receives'];
    const rows = filteredSuppliers.map(s => [
        s.name, s.contact_person || '', s.phone || '', s.email || '',
        s.payment_terms || '', s.address || '',
        s.is_active ? 'Active' : 'Inactive',
        receiveCountMap[s.id] || 0
    ]);

    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `suppliers-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Suppliers exported.', 'success');
};

/* ── Close on backdrop/keyboard ── */
document.getElementById('delete-modal').addEventListener('click', function (e) {
    if (e.target === this) closeDeleteModal();
});
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeDrawer(); closeDeleteModal(); }
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
        window.location.href = '../index.html?denied=true';
        return;
    }

    userRole = window.currentUser.role;
    canEdit = ['root_admin', 'manager'].includes(userRole);

    /* Topbar */
    const initials = getInitials(window.currentUser.full_name || window.currentUser.username);
    document.getElementById('topbar-avatar').textContent = initials;
    document.getElementById('topbar-username').textContent = '@' + window.currentUser.username;

    /* Hide add button for accountant */
    if (!canEdit) document.getElementById('add-supplier-btn').style.display = 'none';

    applyTheme(localStorage.getItem('inno-theme') || 'light');
    renderSidebar('suppliers', userRole);
    await loadSuppliers();
})();
