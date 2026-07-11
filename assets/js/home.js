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
            : 'id, quantity, reorder_level, is_active, avg_unit_cost';

        const { data: products } = await db
            .from('products')
            .select(selectFields)
            .eq('is_active', true);

        const totalProducts = products?.length || 0;
        const lowStock = products?.filter(p => p.quantity > 0 && p.quantity <= p.reorder_level).length || 0;
        const outOfStock = products?.filter(p => p.quantity <= 0).length || 0;

        let stockValue = 0;
        if (user.role !== 'staff') {
            stockValue = products?.reduce((sum, p) => {
                if (!p.quantity || p.quantity <= 0) return sum;
                return sum + (p.quantity * (p.avg_unit_cost || 0));
            }, 0) || 0;
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
            adjustment: { cls: 'adj', icon: 'fa-sliders', sign: m.quantity >= 0 ? '+' : '-' },
            receive: { cls: 'in', icon: 'fa-truck-ramp-box', sign: '+' }
        };
        const t = typeMap[m.type] || typeMap['out'];
        const qtyAbs = Math.abs(m.quantity);
        return `
        <div class="movement-row">
            <div class="movement-type ${t.cls}">
                <i class="fa-solid ${t.icon}"></i>
            </div>
            <div class="movement-info">
                <div class="movement-product">${m.products?.name || 'Unknown product'}</div>
                <div class="movement-meta">${timeAgo(m.created_at)}</div>
            </div>
            <div class="movement-qty ${t.cls}">${t.sign}${qtyAbs}</div>
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
    const to = new Date();
    const from = new Date(Date.now() - days * 86400000);

    const label = days === 1 ? 'Today' : `Last ${days} days`;
    document.getElementById('chart-period-label').textContent = label;

    await loadChartDataByRange(from.toISOString(), to.toISOString(), days);
}

async function loadChartDataByRange(fromISO, toISO, days = null) {
    const { data: movements } = await db
        .from('stock_movements')
        .select('type, quantity, created_at')
        .gte('created_at', fromISO)
        .lte('created_at', toISO)
        .in('type', ['receive', 'in', 'out', 'purchase_order']);

    /* Build day buckets between from and to */
    const from = new Date(fromISO);
    const to = new Date(toISO);
    const msDay = 86400000;
    const numDays = Math.max(1, Math.floor((to - from) / msDay) + 1);

    const labels = [];
    const inData = [];
    const outData = [];

    for (let i = 0; i < numDays; i++) {
        const d = new Date(from.getTime() + i * msDay);
        const dayStr = d.toISOString().split('T')[0];

        labels.push(d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }));

        const dayMoves = (movements || []).filter(m => m.created_at.startsWith(dayStr));
        inData.push(dayMoves
            .filter(m => m.type === 'receive' || m.type === 'in')
            .reduce((s, m) => s + (m.quantity || 0), 0));
        outData.push(dayMoves
            .filter(m => m.type === 'out' || m.type === 'purchase_order')
            .reduce((s, m) => s + (m.quantity || 0), 0));
    }

    renderChart(labels, inData, outData);
}

/* ── Render Chart.js line chart ── */
function renderChart(labels, inData, outData) {
    const ctx = document.getElementById('movement-chart').getContext('2d');
    if (movementChart) movementChart.destroy();

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const gridColor = isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9';
    const tickColor = isDark ? '#64748b' : '#94a3b8';

    movementChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Stock In',
                    data: inData,
                    borderColor: '#1d4ed8',
                    backgroundColor: 'rgba(29,78,216,0.08)',
                    pointBackgroundColor: '#1d4ed8',
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    borderWidth: 2.5,
                    tension: 0.4,
                    fill: true
                },
                {
                    label: 'Stock Out',
                    data: outData,
                    borderColor: '#f97316',
                    backgroundColor: 'rgba(249,115,22,0.07)',
                    pointBackgroundColor: '#f97316',
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    borderWidth: 2.5,
                    tension: 0.4,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#0f172a',
                    titleColor: '#f1f5f9',
                    bodyColor: '#94a3b8',
                    padding: 12,
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
                        color: tickColor,
                        font: { family: 'Poppins', size: 11 },
                        maxRotation: 0,
                        maxTicksLimit: 10
                    }
                },
                y: {
                    grid: { color: gridColor },
                    border: { display: false },
                    ticks: {
                        color: tickColor,
                        font: { family: 'Poppins', size: 11 },
                        precision: 0
                    },
                    beginAtZero: true
                }
            }
        }
    });
}

/* ── Period Change ── */
window.onPeriodChange = async function (select) {
    const val = select.value;
    const customRow = document.getElementById('chart-custom-range');

    if (val === 'custom') {
        customRow.classList.add('show');
        return;
    }

    customRow.classList.remove('show');
    currentPeriod = parseInt(val);
    await loadChartData(currentPeriod);
};

window.applyCustomRange = async function () {
    const from = document.getElementById('chart-date-from').value;
    const to = document.getElementById('chart-date-to').value;
    if (!from || !to) return;

    const fromDate = new Date(from);
    const toDate = new Date(to + 'T23:59:59');
    if (fromDate > toDate) {
        showToast('Start date must be before end date.', 'error');
        return;
    }

    await loadChartDataByRange(fromDate.toISOString(), toDate.toISOString());
    document.getElementById('chart-period-label').textContent =
        `${fromDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} — ${toDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
};

/* ── Realtime subscriptions ── */
function startRealtime() {
    if (realtimeChannel) db.removeChannel(realtimeChannel);

    realtimeChannel = db
        .channel('dashboard-realtime')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'stock_movements'
        }, () => {
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