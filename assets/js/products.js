/* ============================================================
   assets/js/products.js
   Handles Products + Categories page logic
   Roles: root_admin, manager, accountant — full CRUD
          staff — read-only
   ============================================================ */

/* ── State ── */
let allProducts    = [];
let allCategories  = [];
let filteredProducts   = [];
let filteredCategories = [];
let currentTab     = 'products';
let currentPage    = 1;
const PAGE_SIZE    = 15;
let deleteTarget   = { type: null, id: null, name: null };
let userRole       = null;
let canEdit        = false;

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

function getStatusBadge(product) {
    if (product.quantity <= 0) {
        return '<span class="badge badge-danger"><span class="badge-dot"></span>Out of Stock</span>';
    }
    if (product.quantity <= product.reorder_level) {
        return '<span class="badge badge-warning"><span class="badge-dot"></span>Low Stock</span>';
    }
    return '<span class="badge badge-success"><span class="badge-dot"></span>In Stock</span>';
}

function getQtyClass(product) {
    if (product.quantity <= 0) return 'danger';
    if (product.quantity <= product.reorder_level) return 'warning';
    return 'normal';
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

/* ── Tab switcher ── */
window.switchTab = function (tab) {
    currentTab = tab;
    document.getElementById('panel-products').style.display   = tab === 'products'   ? 'block' : 'none';
    document.getElementById('panel-categories').style.display = tab === 'categories' ? 'block' : 'none';
    document.getElementById('tab-products').classList.toggle('active',   tab === 'products');
    document.getElementById('tab-categories').classList.toggle('active', tab === 'categories');
    updateHeaderActions();

    /* Auto-filter on URL param */
    if (tab === 'products') {
        const filter = new URLSearchParams(window.location.search).get('filter');
        if (filter) {
            document.getElementById('products-status-filter').value = filter;
            filterProducts();
        }
    }
};

/* ── Header actions (Add buttons) ── */
function updateHeaderActions() {
    const el = document.getElementById('header-actions');
    if (!canEdit) { el.innerHTML = ''; return; }

    if (currentTab === 'products') {
        el.innerHTML = `
            <button class="btn btn-primary" onclick="openProductDrawer()">
                <i class="fa-solid fa-plus"></i> Add Product
            </button>`;
    } else {
        el.innerHTML = `
            <button class="btn btn-primary" onclick="openCatModal()">
                <i class="fa-solid fa-plus"></i> Add Category
            </button>`;
    }
}

/* ════════════════════════════════════════
   PRODUCTS
════════════════════════════════════════ */

/* ── Fetch products ── */
async function loadProducts() {
    const selectFields = (userRole === 'staff')
        ? 'id, name, sku, quantity, reorder_level, is_active, category_id, unit, categories(name)'
        : 'id, name, sku, quantity, reorder_level, unit_cost, is_active, category_id, unit, categories(name)';

    const { data, error } = await db
        .from('products')
        .select(selectFields)
        .eq('is_active', true)
        .order('name', { ascending: true });

    if (error) {
        showToast('Failed to load products.', 'error');
        return;
    }

    allProducts = data || [];
    document.getElementById('products-count').textContent = allProducts.length;

    /* Populate category filter */
    const cats = [...new Set(allProducts.map(p => p.categories?.name).filter(Boolean))].sort();
    const catFilter = document.getElementById('products-cat-filter');
    catFilter.innerHTML = '<option value="">All Categories</option>' +
        cats.map(c => `<option value="${c}">${c}</option>`).join('');

    filterProducts();
}

/* ── Filter products ── */
window.filterProducts = function () {
    const search = document.getElementById('products-search').value.toLowerCase();
    const cat    = document.getElementById('products-cat-filter').value;
    const status = document.getElementById('products-status-filter').value;

    filteredProducts = allProducts.filter(p => {
        const matchSearch = !search ||
            p.name.toLowerCase().includes(search) ||
            (p.sku || '').toLowerCase().includes(search);
        const matchCat = !cat || p.categories?.name === cat;
        const matchStatus =
            !status ||
            (status === 'in'  && p.quantity > p.reorder_level) ||
            (status === 'low' && p.quantity > 0 && p.quantity <= p.reorder_level) ||
            (status === 'out' && p.quantity <= 0);
        return matchSearch && matchCat && matchStatus;
    });

    currentPage = 1;
    renderProductsTable();
};

/* ── Render products table ── */
function renderProductsTable() {
    const tbody  = document.getElementById('products-tbody');
    const footer = document.getElementById('products-footer');

    if (!filteredProducts.length) {
        tbody.innerHTML = `
            <tr><td colspan="8">
                <div class="empty-state">
                    <div class="empty-state-icon"><i class="fa-solid fa-boxes-stacked"></i></div>
                    <h3>No products found</h3>
                    <p>Try adjusting your search or filters</p>
                    ${canEdit ? '<button class="btn btn-primary" onclick="openProductDrawer()"><i class="fa-solid fa-plus"></i> Add Product</button>' : ''}
                </div>
            </td></tr>`;
        footer.style.display = 'none';
        return;
    }

    const total  = filteredProducts.length;
    const pages  = Math.ceil(total / PAGE_SIZE);
    const start  = (currentPage - 1) * PAGE_SIZE;
    const paged  = filteredProducts.slice(start, start + PAGE_SIZE);

    const showCost = userRole !== 'staff';

    tbody.innerHTML = paged.map((p, i) => {
        const initials = (p.name || '').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
        const catName  = p.categories?.name || '—';
        const actions  = canEdit ? `
            <div class="action-btns">
                <button class="action-btn" onclick="openProductDrawer('${p.id}')" title="Edit">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button class="action-btn delete" onclick="openDeleteModal('product','${p.id}','${p.name.replace(/'/g, "\\'")}')" title="Delete">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>` : '';

        return `
            <tr class="fade-in" style="animation-delay:${i * 0.03}s">
                <td>
                    <div class="product-name-cell">
                        <div class="product-avatar">${initials}</div>
                        <div>
                            <div class="product-name">${p.name}</div>
                            <div class="product-sku">${p.sku || 'No SKU'}</div>
                        </div>
                    </div>
                </td>
                <td><span class="cat-pill"><span class="cat-dot"></span>${catName}</span></td>
                <td style="color:var(--text-secondary);font-size:12.5px;">${p.unit || '—'}</td>
                <td><span class="qty-cell ${getQtyClass(p)}">${p.quantity.toLocaleString()}</span></td>
                <td style="color:var(--text-muted);font-size:12.5px;">${p.reorder_level}</td>
                ${showCost ? `<td style="font-weight:600;font-size:13px;">${formatCurrency(p.unit_cost)}</td>` : ''}
                <td>${getStatusBadge(p)}</td>
                <td>${actions}</td>
            </tr>`;
    }).join('');

    /* Footer */
    footer.style.display = 'flex';
    document.getElementById('products-info').textContent =
        `Showing ${start + 1}–${Math.min(start + PAGE_SIZE, total)} of ${total} products`;

    /* Pagination */
    const pag = document.getElementById('products-pagination');
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
    const pages = Math.ceil(filteredProducts.length / PAGE_SIZE);
    if (page < 1 || page > pages) return;
    currentPage = page;
    renderProductsTable();
    document.querySelector('.table-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
};

/* ── Product Drawer ── */
window.openProductDrawer = async function (productId = null) {
    document.getElementById('product-id').value        = productId || '';
    document.getElementById('product-drawer-title').textContent = productId ? 'Edit Product' : 'Add Product';
    document.getElementById('product-drawer-sub').textContent   = productId ? 'Update product details' : 'Fill in the product details below';

    /* Populate category dropdown */
    const catSelect = document.getElementById('product-category');
    catSelect.innerHTML = '<option value="">Select category</option>' +
        allCategories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

    if (productId) {
        const product = allProducts.find(p => p.id === productId);
        if (product) {
            document.getElementById('product-name').value    = product.name || '';
            document.getElementById('product-sku').value     = product.sku || '';
            document.getElementById('product-desc').value    = product.description || '';
            document.getElementById('product-category').value = product.category_id || '';
            document.getElementById('product-unit').value    = product.unit || '';
            document.getElementById('product-qty').value     = product.quantity || 0;
            document.getElementById('product-reorder').value = product.reorder_level || 0;
            document.getElementById('product-cost').value    = product.unit_cost || 0;
        }
    } else {
        /* Clear form */
        ['product-name','product-sku','product-desc','product-category',
         'product-unit','product-qty','product-reorder','product-cost']
            .forEach(id => { document.getElementById(id).value = ''; });
    }

    document.getElementById('product-drawer-backdrop').classList.add('show');
    document.getElementById('product-drawer').classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.getElementById('product-name').focus(), 300);
};

window.closeProductDrawer = function () {
    document.getElementById('product-drawer-backdrop').classList.remove('show');
    document.getElementById('product-drawer').classList.remove('open');
    document.body.style.overflow = '';
};

window.saveProduct = async function () {
    const id       = document.getElementById('product-id').value;
    const name     = document.getElementById('product-name').value.trim();
    const sku      = document.getElementById('product-sku').value.trim();
    const desc     = document.getElementById('product-desc').value.trim();
    const catId    = document.getElementById('product-category').value;
    const unit     = document.getElementById('product-unit').value;
    const qty      = parseInt(document.getElementById('product-qty').value) || 0;
    const reorder  = parseInt(document.getElementById('product-reorder').value) || 0;
    const cost     = parseFloat(document.getElementById('product-cost').value) || 0;
    const btn      = document.getElementById('product-save-btn');

    if (!name)  { showToast('Product name is required.', 'error'); return; }
    if (!catId) { showToast('Please select a category.', 'error'); return; }
    if (!unit)  { showToast('Please select a unit of measurement.', 'error'); return; }
    if (qty < 0){ showToast('Quantity cannot be negative.', 'error'); return; }

    btn.disabled  = true;
    btn.innerHTML = '<div class="btn-spinner"></div><span>Saving...</span>';

    const payload = {
        name, sku: sku || null, description: desc || null,
        category_id: catId, unit, reorder_level: reorder,
        unit_cost: cost, updated_at: new Date().toISOString()
    };

    let error;

    if (id) {
        /* Update */
        ({ error } = await db.from('products').update(payload).eq('id', id));
    } else {
        /* Insert */
        payload.quantity   = qty;
        payload.is_active  = true;
        payload.created_by = window.currentUser.id;
        ({ error } = await db.from('products').insert(payload));
    }

    if (error) {
        showToast(error.message || 'Failed to save product.', 'error');
        btn.disabled  = false;
        btn.innerHTML = '<i class="fa-solid fa-check"></i><span>Save Product</span>';
        return;
    }

    showToast(id ? 'Product updated successfully.' : 'Product added successfully.', 'success');
    closeProductDrawer();
    await loadProducts();
    btn.disabled  = false;
    btn.innerHTML = '<i class="fa-solid fa-check"></i><span>Save Product</span>';
};

/* ── Export products ── */
window.exportProducts = function () {
    if (!filteredProducts.length) { showToast('No products to export.', 'error'); return; }

    const showCost = userRole !== 'staff';
    const headers  = ['Name', 'SKU', 'Category', 'Unit', 'Quantity', 'Reorder Level', ...(showCost ? ['Unit Cost'] : []), 'Status'];
    const rows     = filteredProducts.map(p => [
        p.name, p.sku || '', p.categories?.name || '', p.unit || '',
        p.quantity, p.reorder_level,
        ...(showCost ? [p.unit_cost || 0] : []),
        p.quantity <= 0 ? 'Out of Stock' : p.quantity <= p.reorder_level ? 'Low Stock' : 'In Stock'
    ]);

    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `products-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Products exported successfully.', 'success');
};

/* ════════════════════════════════════════
   CATEGORIES
════════════════════════════════════════ */

async function loadCategories() {
    const { data, error } = await db
        .from('categories')
        .select('id, name, description, created_at')
        .order('name', { ascending: true });

    if (error) { showToast('Failed to load categories.', 'error'); return; }

    allCategories = data || [];
    document.getElementById('categories-count').textContent = allCategories.length;
    filterCategories();
}

window.filterCategories = function () {
    const search = document.getElementById('categories-search').value.toLowerCase();
    filteredCategories = !search
        ? [...allCategories]
        : allCategories.filter(c => c.name.toLowerCase().includes(search) ||
            (c.description || '').toLowerCase().includes(search));
    renderCategoriesTable();
};

function renderCategoriesTable() {
    const tbody  = document.getElementById('categories-tbody');
    const footer = document.getElementById('categories-footer');

    if (!filteredCategories.length) {
        tbody.innerHTML = `
            <tr><td colspan="4">
                <div class="empty-state">
                    <div class="empty-state-icon"><i class="fa-solid fa-tag"></i></div>
                    <h3>No categories found</h3>
                    <p>Create categories to organise your products</p>
                    ${canEdit ? '<button class="btn btn-primary" onclick="openCatModal()"><i class="fa-solid fa-plus"></i> Add Category</button>' : ''}
                </div>
            </td></tr>`;
        footer.style.display = 'none';
        return;
    }

    tbody.innerHTML = filteredCategories.map((c, i) => {
        const productCount = allProducts.filter(p => p.category_id === c.id).length;
        const actions = canEdit ? `
            <div class="action-btns">
                <button class="action-btn" onclick="openCatModal('${c.id}')" title="Edit">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button class="action-btn delete" onclick="openDeleteModal('category','${c.id}','${c.name.replace(/'/g, "\\'")}')" title="Delete">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>` : '';

        return `
            <tr class="fade-in" style="animation-delay:${i * 0.04}s">
                <td style="font-weight:600;">${c.name}</td>
                <td style="color:var(--text-muted);font-size:12.5px;">${c.description || '—'}</td>
                <td>
                    <span class="badge badge-neutral">${productCount} product${productCount !== 1 ? 's' : ''}</span>
                </td>
                <td>${actions}</td>
            </tr>`;
    }).join('');

    footer.style.display = 'flex';
    document.getElementById('categories-info').textContent =
        `${filteredCategories.length} categor${filteredCategories.length !== 1 ? 'ies' : 'y'}`;
}

/* ── Category Modal ── */
window.openCatModal = function (catId = null) {
    document.getElementById('cat-id').value    = catId || '';
    document.getElementById('cat-modal-title').textContent = catId ? 'Edit Category' : 'Add Category';

    if (catId) {
        const cat = allCategories.find(c => c.id === catId);
        if (cat) {
            document.getElementById('cat-name').value = cat.name || '';
            document.getElementById('cat-desc').value = cat.description || '';
        }
    } else {
        document.getElementById('cat-name').value = '';
        document.getElementById('cat-desc').value = '';
    }

    document.getElementById('cat-modal-backdrop').classList.add('show');
    setTimeout(() => document.getElementById('cat-name').focus(), 100);
};

window.closeCatModal = function () {
    document.getElementById('cat-modal-backdrop').classList.remove('show');
};

window.saveCategory = async function () {
    const id   = document.getElementById('cat-id').value;
    const name = document.getElementById('cat-name').value.trim();
    const desc = document.getElementById('cat-desc').value.trim();
    const btn  = document.getElementById('cat-save-btn');

    if (!name) { showToast('Category name is required.', 'error'); return; }

    btn.disabled  = true;
    btn.innerHTML = '<div class="btn-spinner"></div><span>Saving...</span>';

    const payload = { name, description: desc || null };
    let error;

    if (id) {
        ({ error } = await db.from('categories').update(payload).eq('id', id));
    } else {
        payload.created_by = window.currentUser.id;
        ({ error } = await db.from('categories').insert(payload));
    }

    if (error) {
        if (error.code === '23505') {
            showToast('A category with this name already exists.', 'error');
        } else {
            showToast(error.message || 'Failed to save category.', 'error');
        }
        btn.disabled  = false;
        btn.innerHTML = '<i class="fa-solid fa-check"></i><span>Save Category</span>';
        return;
    }

    showToast(id ? 'Category updated.' : 'Category added.', 'success');
    closeCatModal();
    await loadCategories();
    await loadProducts(); /* Refresh products to update category names */
    btn.disabled  = false;
    btn.innerHTML = '<i class="fa-solid fa-check"></i><span>Save Category</span>';
};

/* ════════════════════════════════════════
   DELETE
════════════════════════════════════════ */

window.openDeleteModal = function (type, id, name) {
    deleteTarget = { type, id, name };
    document.getElementById('delete-modal-title').textContent =
        `Delete ${type === 'product' ? 'Product' : 'Category'}?`;
    document.getElementById('delete-modal-body').textContent =
        type === 'product'
            ? `"${name}" will be permanently removed. Stock history will be preserved.`
            : `"${name}" will be deleted. Products in this category will become uncategorised.`;
    document.getElementById('delete-modal-backdrop').classList.add('show');
};

window.closeDeleteModal = function () {
    document.getElementById('delete-modal-backdrop').classList.remove('show');
    deleteTarget = { type: null, id: null, name: null };
};

window.confirmDelete = async function () {
    const btn = document.getElementById('delete-confirm-btn');
    btn.disabled  = true;
    btn.innerHTML = '<div class="btn-spinner"></div><span>Deleting...</span>';

    let error;

    if (deleteTarget.type === 'product') {
        /* Soft delete — set is_active false */
        ({ error } = await db
            .from('products')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('id', deleteTarget.id));
    } else {
        ({ error } = await db
            .from('categories')
            .delete()
            .eq('id', deleteTarget.id));
    }

    if (error) {
        showToast(error.message || 'Failed to delete. Try again.', 'error');
        btn.disabled  = false;
        btn.innerHTML = '<i class="fa-solid fa-trash"></i><span>Delete</span>';
        return;
    }

    showToast(`${deleteTarget.name} deleted successfully.`, 'success');
    closeDeleteModal();

    if (deleteTarget.type === 'product') {
        await loadProducts();
    } else {
        await loadCategories();
        await loadProducts();
    }

    btn.disabled  = false;
    btn.innerHTML = '<i class="fa-solid fa-trash"></i><span>Delete</span>';
};

/* ── Close modals on backdrop click ── */
document.getElementById('cat-modal-backdrop').addEventListener('click', function (e) {
    if (e.target === this) closeCatModal();
});
document.getElementById('delete-modal-backdrop').addEventListener('click', function (e) {
    if (e.target === this) closeDeleteModal();
});

/* ── Keyboard shortcuts ── */
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        closeProductDrawer();
        closeCatModal();
        closeDeleteModal();
    }
});

/* ════════════════════════════════════════
   INIT
════════════════════════════════════════ */
(async function init() {
    /* Wait for auth-guard */
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
    canEdit  = ['root_admin', 'manager', 'accountant'].includes(userRole);

    /* Topbar */
    const initials = getInitials(window.currentUser.full_name || window.currentUser.username);
    document.getElementById('topbar-avatar').textContent   = initials;
    document.getElementById('topbar-username').textContent = '@' + window.currentUser.username;

    /* Theme */
    applyTheme(localStorage.getItem('inno-theme') || 'light');

    /* Sidebar */
    renderSidebar('products', userRole);

    /* Role UI adjustments */
    if (!canEdit) {
        document.getElementById('products-readonly-notice').style.display   = 'flex';
        document.getElementById('categories-readonly-notice').style.display = 'flex';
        document.getElementById('products-actions-col').style.display       = 'none';
        document.getElementById('categories-actions-col').style.display     = 'none';
    }

    /* Hide cost column for staff */
    if (userRole === 'staff') {
        document.getElementById('cost-col-header').style.display = 'none';
    }

    /* Load data */
    await Promise.all([loadCategories(), loadProducts()]);

    /* Update header */
    updateHeaderActions();

    /* Check URL filter param */
    const filter = new URLSearchParams(window.location.search).get('filter');
    if (filter) {
        document.getElementById('products-status-filter').value = filter;
        filterProducts();
    }
})();
