/* ==== HOME.JS ==== */
let movementChart = null;
let currentPeriod = 7;
let realtimeChannel = null;

/* ── Helpers ── */
function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(' ').filter(Boolean);
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatCurrency(val) {
    if (val >= 1_000_000) return '$' + (val / 1_000_000).toFixed(1) + 'M';
    if (val >= 1_000) return '$' + (val / 1_000).toFixed(1) + 'K';
    return '$' + val.toLocaleString();
}

function timeAgo(dateStr) {
    const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    return Math.floor(diff / 86400) + 'd ago';
}

function getGreeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
}

/* ── Populate topbar & greeting ── */
function populateUserUI() {
    const user = window.currentUser;
    if (!user) return;

    const initials = getInitials(user.full_name || user.username);
    document.getElementById('topbar-avatar').textContent = initials;
    document.getElementById('topbar-username').textContent = '' + user.username;
    document.getElementById('greeting').textContent = getGreeting() + ', ' + (user.full_name?.split(' ')[0] || user.username) + ' 👋';

    /* Date */
    document.getElementById('topbar-date').textContent = new Date().toLocaleDateString('en-GB', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    /* Restrict stock value card for staff */
    const role = user.role;
    if (role === 'staff') {
        const card = document.getElementById('card-value');
        card.style.display = 'block';
        card.classList.add('stat-card--restricted');
        document.getElementById('val-stock-value').textContent = '••••';
        document.getElementById('val-stock-value-trend').textContent = '';
        document.getElementById('val-stock-value-sub').textContent = '';
    }
}

/* ── Fetch all dashboard data ── */
async function loadDashboard() {
    try {
        const user = window.currentUser;

        /* ── 1. Products stats ── */
        const role = window.currentUser.role;
        const selectFields = (role === 'staff')
            ? 'id, quantity, reorder_level, is_active'
            : 'id, quantity, reorder_level, is_active';

        const { data: products } = await db
            .from('products')
            .select(selectFields)
            .eq('is_active', true);

        const totalProducts = products?.length || 0;
        const lowStock = products?.filter(p => p.quantity > 0 && p.quantity <= p.reorder_level).length || 0;
        const outOfStock = products?.filter(p => p.quantity <= 0).length || 0;

        let stockValue = 0;
        if (user.role !== 'staff') {
            stockValue = products?.reduce((sum, p) => sum + ((p.quantity || 0) * (p.unit_cost || 0)), 0) || 0;
        }

        document.getElementById('val-products').textContent = totalProducts.toLocaleString();
        document.getElementById('val-low-stock').textContent = lowStock.toLocaleString();
        document.getElementById('val-out-stock').textContent = outOfStock.toLocaleString();
        document.getElementById('val-stock-value').textContent = formatCurrency(stockValue);

        if (lowStock > 0) document.getElementById('val-low-trend').textContent = lowStock + ' items ';
        if (outOfStock > 0) document.getElementById('val-out-trend').textContent = outOfStock + ' items ';

        /* ── 2. Pending POs ── */
        const { count: pendingPOs } = await db
            .from('purchase_orders')
            .select('id', { count: 'exact', head: true })
            .in('status', ['pending', 'submitted']);

        document.getElementById('val-pending-po').textContent = (pendingPOs || 0).toLocaleString();

        /* ── 3. Movements today ── */
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const { count: movementsToday } = await db
            .from('stock_movements')
            .select('id', { count: 'exact', head: true })
            .gte('created_at', todayStart.toISOString());

        document.getElementById('val-movements-today').textContent = (movementsToday || 0).toLocaleString();

        /* ── 4. Recent movements (last 8) ── */
        const { data: recentMovements } = await db
            .from('stock_movements')
            .select('id, type, quantity, created_at, products(name)')
            .order('created_at', { ascending: false })
            .limit(8);

        renderRecentMovements(recentMovements || []);

        /* ── 5. Top 5 moving products (last 30 days) ── */
        const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
        const { data: topMovements } = await db
            .from('stock_movements')
            .select('product_id, quantity, products(name, categories(name))')
            .eq('type', 'out')
            .gte('created_at', thirtyDaysAgo);

        renderTopProducts(topMovements || []);

        /* ── 6. Low stock alert list ── */
        const { data: lowItems } = await db
            .from('products')
            .select('id, name, quantity, reorder_level')
            .eq('is_active', true)
            .order('quantity', { ascending: true })
            .limit(20);

        const filteredLow = (lowItems || []).filter(p => p.quantity <= p.reorder_level).slice(0, 6);
        renderLowStockAlerts(filteredLow);

        /* ── 7. Chart data ── */
        await loadChartData(currentPeriod);

        /* ── Show real UI ── */
        document.getElementById('skeleton-ui').style.display = 'none';
        document.getElementById('real-ui').style.display = 'block';

        /* ── 8. Start realtime ── */
        startRealtime();

    } catch (err) {
        console.error('Dashboard load error:', err);
        showToast('Failed to load dashboard data.', 'error');
        document.getElementById('skeleton-ui').style.display = 'none';
        document.getElementById('real-ui').style.display = 'block';
    }
}

/* ── Render recent movements ── */
function renderRecentMovements(movements) {
    const el = document.getElementById('recent-movements-list');
    if (!movements.length) {
        el.innerHTML = '<div class="panel-empty"><i class="fa-solid fa-clock-rotate-left"></i>No movements yet</div>';
        return;
    }
    el.innerHTML = movements.map(m => {
        const typeMap = {
            in: { cls: 'in', icon: 'fa-arrow-down', sign: '+' },
            out: { cls: 'out', icon: 'fa-arrow-up', sign: '-' },
            adjustment: { cls: 'adj', icon: 'fa-sliders', sign: '~' },
            receive: { cls: 'in', icon: 'fa-truck-ramp-box', sign: '+' }
        };
        const t = typeMap[m.type] || typeMap['out'];
        return `
            <div class="movement-row">
                <div class="movement-type ${t.cls}">
                    <i class="fa-solid ${t.icon}"></i>
                </div>
                <div class="movement-info">
                    <div class="movement-product">${m.products?.name || 'Unknown product'}</div>
                    <div class="movement-meta">${timeAgo(m.created_at)}</div>
                </div>
                <div class="movement-qty ${t.cls}">${t.sign}${m.quantity}</div>
            </div>
        `;
    }).join('');
}

/* ── Render top products ── */
function renderTopProducts(movements) {
    const el = document.getElementById('top-products-list');
    if (!movements.length) {
        el.innerHTML = '<div class="panel-empty"><i class="fa-solid fa-chart-bar"></i>No movement data yet</div>';
        return;
    }

    /* Aggregate by product */
    const totals = {};
    movements.forEach(m => {
        const id = m.product_id;
        const name = m.products?.name || 'Unknown';
        const cat = m.products?.categories?.name || '';
        if (!totals[id]) totals[id] = { name, cat, qty: 0 };
        totals[id].qty += m.quantity;
    });

    const sorted = Object.values(totals).sort((a, b) => b.qty - a.qty).slice(0, 5);
    const max = sorted[0]?.qty || 1;

    el.innerHTML = sorted.map((p, i) => `
        <div class="product-row">
            <div class="product-rank">${i + 1}</div>
            <div class="product-name-wrap">
                <div class="product-name">${p.name}</div>
                <div class="product-category">${p.cat}</div>
            </div>
            <div class="product-bar-wrap">
                <div class="product-bar-fill" style="width:${Math.round((p.qty / max) * 100)}%"></div>
            </div>
            <div class="product-count">${p.qty}</div>
        </div>
    `).join('');
}

/* ── Render low stock alerts ── */
function renderLowStockAlerts(items) {
    const el = document.getElementById('low-stock-list');
    if (!items.length) {
        el.innerHTML = '<div class="panel-empty"><i class="fa-solid fa-circle-check"></i>All stock levels are healthy</div>';
        return;
    }
    el.innerHTML = items.map(p => {
        const isCritical = p.quantity === 0;
        return `
            <div class="alert-row">
                <div class="alert-info">
                    <div class="alert-name">${p.name}</div>
                    <div class="alert-stock">Qty: ${p.quantity} / Reorder: ${p.reorder_level}</div>
                </div>
                <span class="stock-badge ${isCritical ? 'critical' : 'low'}">
                    ${isCritical ? 'Out' : 'Low'}
                </span>
            </div>
        `;
    }).join('');
}

/* ── Load & render chart ── */
async function loadChartData(days) {
    const since = new Date(Date.now() - days * 86400000).toISOString();

    const { data: movements } = await db
        .from('stock_movements')
        .select('type, quantity, created_at')
        .gte('created_at', since)
        .in('type', ['receive', 'in', 'out']);

    /* Build day buckets */
    const labels = [];
    const inData = [];
    const outData = [];

    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000);
        labels.push(d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }));

        const dayStr = d.toISOString().split('T')[0];
        const dayMovements = (movements || []).filter(m => m.created_at.startsWith(dayStr));
        inData.push(dayMovements.filter(m => m.type === 'receive' || m.type === 'in').reduce((s, m) => s + m.quantity, 0));
        outData.push(dayMovements.filter(m => m.type === 'out').reduce((s, m) => s + m.quantity, 0));
    }

    renderChart(labels, inData, outData);
    document.getElementById('chart-period-label').textContent = `Last ${days} days`;
}

/* ── Render Chart.js bar chart ── */
function renderChart(labels, inData, outData) {
    const ctx = document.getElementById('movement-chart').getContext('2d');

    if (movementChart) movementChart.destroy();

    movementChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Stock In',
                    data: inData,
                    backgroundColor: '#1d4ed8',
                    borderRadius: 6,
                    borderSkipped: false,
                    barPercentage: 0.55,
                    categoryPercentage: 0.7
                },
                {
                    label: 'Stock Out',
                    data: outData,
                    backgroundColor: '#e2e8f0',
                    borderRadius: 6,
                    borderSkipped: false,
                    barPercentage: 0.55,
                    categoryPercentage: 0.7
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#0f172a',
                    titleColor: '#f1f5f9',
                    bodyColor: '#94a3b8',
                    padding: 10,
                    cornerRadius: 8,
                    callbacks: {
                        label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y} units`
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    border: { display: false },
                    ticks: {
                        color: '#94a3b8',
                        font: { family: 'Poppins', size: 11 },
                        maxRotation: 0,
                        /* Show fewer labels for 30d */
                        maxTicksLimit: currentPeriod === 7 ? 7 : 10
                    }
                },
                y: {
                    grid: { color: '#f1f5f9', drawBorder: false },
                    border: { display: false, dash: [4, 4] },
                    ticks: {
                        color: '#94a3b8',
                        font: { family: 'Poppins', size: 11 },
                        precision: 0
                    }
                }
            }
        }
    });
}

/* ── Period toggle ── */
window.setPeriod = async function (days, btn) {
    if (days === currentPeriod) return;
    currentPeriod = days;
    document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    await loadChartData(days);
};

/* ── Realtime subscriptions ── */
function startRealtime() {
    /* Unsubscribe any existing channel */
    if (realtimeChannel) db.removeChannel(realtimeChannel);

    realtimeChannel = db
        .channel('dashboard-realtime')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'stock_movements'
        }, () => {
            /* Reload dashboard silently on any stock movement change */
            loadDashboard();
        })
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'products'
        }, () => {
            loadDashboard();
        })
        .subscribe();
}

/* ── Init ── */
(async function init() {
    /* Wait for auth-guard to set window.currentUser */
    let waited = 0;
    while (!window.currentUser && waited < 5000) {
        await new Promise(r => setTimeout(r, 50));
        waited += 50;
    }
    if (!window.currentUser) {
        window.location.href = '../index.html?denied=true';
        return;
    }

    populateUserUI();
    renderSidebar('home', window.currentUser.role);
    await loadDashboard();
})();

/* ── Redraw chart on resize ── */
let resizeTimer;
window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        if (movementChart) movementChart.resize();
    }, 150);
});


/* ── Theme toggle ── */
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const icon = document.getElementById('theme-icon');
    if (icon) {
        icon.className = theme === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
    }
    localStorage.setItem('inno-theme', theme);
}

window.toggleTheme = function () {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark');
};

const savedTheme = localStorage.getItem('inno-theme') || 'light';
applyTheme(savedTheme);