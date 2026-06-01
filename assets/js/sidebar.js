/* ==== SIDEBAR.JS ==== */


const SIDEBAR_NAV = [
    {
        section: 'MENU',
        items: [
            {
                key: 'home',
                label: 'Home',
                icon: 'fa-solid fa-house',
                href: 'dashboard/home.html',
                roles: ['root_admin', 'manager', 'staff', 'accountant']
            }
        ]
    },
    {
        section: 'INVENTORY',
        items: [
            {
                key: 'products',
                label: 'Products',
                icon: 'fa-solid fa-boxes-stacked',
                href: 'dashboard/inventory/products.html',
                roles: ['root_admin', 'manager', 'staff', 'accountant']
            }
        ]
    },
    {
        section: 'STOCK',
        items: [
            {
                key: 'receive',
                label: 'Receive Stock',
                icon: 'fa-solid fa-truck-ramp-box',
                href: 'dashboard/stock/receive.html',
                roles: ['root_admin', 'manager', 'staff']
            },
            {
                key: 'adjustments',
                label: 'Adjustments',
                icon: 'fa-solid fa-sliders',
                href: 'dashboard/stock/adjustments.html',
                roles: ['root_admin', 'manager']
            },
            {
                key: 'history',
                label: 'Stock History',
                icon: 'fa-solid fa-clock-rotate-left',
                href: 'dashboard/stock/history.html',
                roles: ['root_admin', 'manager', 'staff', 'accountant']
            }
        ]
    },
    {
        section: 'GENERAL',
        items: [
            {
                key: 'purchase-orders',
                label: 'Purchase Orders',
                icon: 'fa-solid fa-file-invoice',
                href: 'dashboard/purchase-orders.html',
                roles: ['root_admin', 'manager', 'staff', 'accountant']
            },
            {
                key: 'suppliers',
                label: 'Suppliers',
                icon: 'fa-solid fa-handshake',
                href: 'dashboard/suppliers.html',
                roles: ['root_admin', 'manager']
            },
            {
                key: 'reports',
                label: 'Reports',
                icon: 'fa-solid fa-chart-bar',
                href: 'dashboard/reports.html',
                roles: ['root_admin', 'manager', 'accountant']
            }
        ]
    },
    {
        section: 'ADMIN',
        items: [
            {
                key: 'users',
                label: 'Users',
                icon: 'fa-solid fa-users',
                href: 'dashboard/users.html',
                roles: ['root_admin']
            },
            {
                key: 'settings',
                label: 'Settings',
                icon: 'fa-solid fa-gear',
                href: 'dashboard/settings.html',
                roles: ['root_admin']
            }
        ]
    }
];


const ROLE_LABELS = {
    root_admin: 'Root Admin',
    manager: 'Manager',
    staff: 'Staff',
    accountant: 'Accountant',
    guest: 'Guest'
};


function _resolveHref(href) {
    const parts = window.location.pathname.split('/').filter(Boolean);
    const depth = parts.length;
    const prefix = depth > 0 ? '../'.repeat(depth) : '';
    return prefix + href;
}


function _initials(fullName) {
    if (!fullName) return '?';
    const parts = fullName.trim().split(' ').filter(Boolean);
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}


function _buildNavItem(item, activePage, userRole) {
    const isActive = item.key === activePage;
    const hasAccess = item.roles.includes(userRole);
    const href = hasAccess ? _resolveHref(item.href) : '#';

    const activeClass = isActive ? ' sidebar-nav-item--active' : '';
    const lockedClass = !hasAccess ? ' sidebar-nav-item--locked' : '';
    const clickHandler = !hasAccess ? ' onclick="return false;"' : '';
    const ariaLabel = !hasAccess ? ` aria-label="${item.label} — access restricted"` : '';

    return `
        <a href="${href}"
           class="sidebar-nav-item${activeClass}${lockedClass}"
           ${clickHandler}
           ${ariaLabel}>
            <span class="sidebar-nav-icon">
                <i class="${item.icon}" aria-hidden="true"></i>
            </span>
            <span class="sidebar-nav-label">${item.label}</span>
            ${!hasAccess ? '<span class="sidebar-nav-lock"><i class="fa-solid fa-lock" aria-hidden="true"></i></span>' : ''}
        </a>
    `;
}


window.renderSidebar = function (activePage, userRole) {

    /* ── Inject sidebar CSS ── */
    if (!document.getElementById('sidebar-styles')) {
        const style = document.createElement('style');
        style.id = 'sidebar-styles';
        style.textContent = `
            /* ── Sidebar shell ── */
            .sidebar {
                width: 240px;
                flex-shrink: 0;
                background: #0f172a;
                display: flex;
                flex-direction: column;
                height: 100vh;
                position: sticky;
                top: 0;
                overflow-y: auto;
                overflow-x: hidden;
                scrollbar-width: none;
                z-index: 200;
                transition: transform 0.3s cubic-bezier(0.4,0,0.2,1);
            }
            .sidebar::-webkit-scrollbar { display: none; }

            /* ── Brand ── */
            .sidebar-brand {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 24px 20px 20px;
                flex-shrink: 0;
            }
            .sidebar-brand-logo {
                width: 38px; height: 38px;
                background: #1d4ed8;
                border-radius: 10px;
                display: flex; align-items: center; justify-content: center;
                font-size: 18px; font-weight: 800; color: white;
                flex-shrink: 0;
                letter-spacing: -0.5px;
            }
            .sidebar-brand-name {
                font-size: 17px;
                font-weight: 700;
                color: #f1f5f9;
                line-height: 1.2;
            }
            .sidebar-brand-sub {
                font-size: 10px;
                color: rgba(255,255,255,0.35);
                text-transform: uppercase;
                letter-spacing: 0.8px;
                margin-top: 1px;
            }

            /* ── Nav container ── */
            .sidebar-nav {
                flex: 1;
                padding: 8px 12px;
                overflow-y: auto;
                scrollbar-width: none;
            }
            .sidebar-nav::-webkit-scrollbar { display: none; }

            /* ── Section label ── */
            .sidebar-section-label {
                font-size: 10px;
                font-weight: 600;
                color: rgba(255,255,255,0.25);
                text-transform: uppercase;
                letter-spacing: 1px;
                padding: 16px 8px 6px;
            }
            .sidebar-section-label:first-child { padding-top: 4px; }

            /* ── Nav item ── */
            .sidebar-nav-item {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 9px 12px;
                border-radius: 8px;
                color: rgba(255,255,255,0.55);
                text-decoration: none;
                font-size: 13.5px;
                font-weight: 500;
                margin-bottom: 2px;
                transition: all 0.18s ease;
                position: relative;
                cursor: pointer;
            }
            .sidebar-nav-item:hover:not(.sidebar-nav-item--locked):not(.sidebar-nav-item--active) {
                background: rgba(255,255,255,0.06);
                color: rgba(255,255,255,0.85);
            }
            .sidebar-nav-item--active {
                background: #1d4ed8;
                color: white;
                font-weight: 600;
            }
            .sidebar-nav-item--active .sidebar-nav-icon { color: white; }
            .sidebar-nav-item--locked {
                opacity: 0.35;
                cursor: not-allowed;
            }

            /* ── Nav icon ── */
            .sidebar-nav-icon {
                width: 18px;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
                font-size: 13.5px;
                color: rgba(255,255,255,0.45);
            }
            .sidebar-nav-item--active .sidebar-nav-icon,
            .sidebar-nav-item:hover:not(.sidebar-nav-item--locked) .sidebar-nav-icon {
                color: inherit;
            }

            /* ── Nav label ── */
            .sidebar-nav-label { flex: 1; }

            /* ── Lock icon ── */
            .sidebar-nav-lock {
                font-size: 10px;
                color: rgba(255,255,255,0.3);
                flex-shrink: 0;
            }

            /* ── Divider ── */
            .sidebar-divider {
                height: 1px;
                background: rgba(255,255,255,0.06);
                margin: 8px 12px;
            }

            /* ── User card ── */
            .sidebar-user {
                padding: 12px;
                margin: 8px;
                background: rgba(255,255,255,0.05);
                border: 1px solid rgba(255,255,255,0.08);
                border-radius: 10px;
                flex-shrink: 0;
            }
            .sidebar-user-inner {
                display: flex;
                align-items: center;
                gap: 10px;
                margin-bottom: 10px;
            }
            .sidebar-user-avatar {
                width: 36px; height: 36px;
                background: #1d4ed8;
                border-radius: 9px;
                display: flex; align-items: center; justify-content: center;
                font-size: 13px; font-weight: 700; color: white;
                flex-shrink: 0;
                letter-spacing: 0.3px;
            }
            .sidebar-user-name {
                font-size: 13px;
                font-weight: 600;
                color: #f1f5f9;
                line-height: 1.3;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                max-width: 130px;
            }
            .sidebar-user-role {
                font-size: 10.5px;
                color: rgba(255,255,255,0.4);
                margin-top: 1px;
            }
            .sidebar-logout-btn {
                width: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 7px;
                padding: 7px 12px;
                background: rgba(220,38,38,0.12);
                border: 1px solid rgba(220,38,38,0.2);
                border-radius: 7px;
                color: #f87171;
                font-size: 12.5px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.18s ease;
                font-family: 'Poppins', sans-serif;
            }
            .sidebar-logout-btn:hover {
                background: rgba(220,38,38,0.22);
                border-color: rgba(220,38,38,0.35);
                color: #fca5a5;
            }
            .sidebar-logout-btn i { font-size: 12px; }

            /* ── Mobile overlay backdrop ── */
            .sidebar-backdrop {
                display: none;
                position: fixed;
                inset: 0;
                background: rgba(0,0,0,0.5);
                z-index: 199;
                backdrop-filter: blur(2px);
                -webkit-backdrop-filter: blur(2px);
            }
            .sidebar-backdrop.show { display: block; }

            /* ── Mobile styles ── */
            @media (max-width: 768px) {
                .sidebar {
                    position: fixed;
                    top: 0; left: 0;
                    height: 100vh;
                    transform: translateX(-100%);
                    z-index: 200;
                    box-shadow: 4px 0 24px rgba(0,0,0,0.3);
                }
                .sidebar.open { transform: translateX(0); }
            }
        `;
        document.head.appendChild(style);
    }

    /* ── Nav HTML ── */
    let navHTML = '';
    SIDEBAR_NAV.forEach(group => {
        navHTML += `<div class="sidebar-section-label">${group.section}</div>`;
        group.items.forEach(item => {
            navHTML += _buildNavItem(item, activePage, userRole);
        });
    });

    /* ── Full sidebar HTML ── */
    const user = window.currentUser || {};
    const initials = _initials(user.full_name || user.username || '');
    const roleLabel = ROLE_LABELS[userRole] || userRole;

    const sidebarHTML = `
        <!-- Mobile backdrop -->
        <div class="sidebar-backdrop" id="sidebar-backdrop" onclick="closeSidebar()"></div>

        <aside class="sidebar" id="sidebar" role="navigation" aria-label="Main navigation">

            <!-- Brand -->
            <div class="sidebar-brand">
                <div class="sidebar-brand-logo">I</div>
                <div>
                    <div class="sidebar-brand-name">Inno</div>
                    <div class="sidebar-brand-sub">Inventory</div>
                </div>
            </div>

            <!-- Nav items -->
            <nav class="sidebar-nav" aria-label="Navigation links">
                ${navHTML}
            </nav>

            <div class="sidebar-divider"></div>

            <!-- User card -->
            <div class="sidebar-user">
                <div class="sidebar-user-inner">
                    <div class="sidebar-user-avatar" aria-hidden="true">${initials}</div>
                    <div>
                        <div class="sidebar-user-name" title="${user.full_name || ''}">
                            ${user.full_name || user.username || 'User'}
                        </div>
                        <div class="sidebar-user-role">${roleLabel}</div>
                    </div>
                </div>
                <button class="sidebar-logout-btn" onclick="handleLogout()" aria-label="Sign out">
                    <i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i>
                    Sign Out
                </button>
            </div>

        </aside>
    `;

    /* ── Inject into DOM ── */
    const container = document.getElementById('sidebar-container');
    if (!container) {
        console.error('sidebar.js: No #sidebar-container element found on this page.');
        return;
    }
    container.innerHTML = sidebarHTML;
};


window.openSidebar = function () {
    document.getElementById('sidebar')?.classList.add('open');
    document.getElementById('sidebar-backdrop')?.classList.add('show');
    document.body.style.overflow = 'hidden';
};


window.closeSidebar = function () {
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebar-backdrop')?.classList.remove('show');
    document.body.style.overflow = '';
};


window.toggleSidebar = function () {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
};


window.handleLogout = async function () {
    const btn = document.querySelector('.sidebar-logout-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Signing out...';
    }

    await db.auth.signOut();

    const depth = window.location.pathname.split('/').filter(Boolean).length;
    const prefix = depth > 0 ? '../'.repeat(depth) : '';
    window.location.href = `${prefix}index.html`;
};


document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeSidebar();
});


window.addEventListener('resize', function () {
    if (window.innerWidth > 768) closeSidebar();
});
