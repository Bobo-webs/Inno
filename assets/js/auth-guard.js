/* ==== auth-guard.js ===== */

const PAGE_ACCESS = {
    'home': ['root_admin', 'manager', 'staff', 'accountant', 'warehouse_clerk'],
    'products': ['root_admin', 'manager', 'staff', 'accountant', 'warehouse_clerk'],
    'receive': ['root_admin', 'manager', 'staff', 'warehouse_clerk'],
    'adjustments': ['root_admin', 'manager'],
    'history': ['root_admin', 'manager', 'staff', 'accountant', 'warehouse_clerk'],
    'purchase-orders': ['root_admin', 'manager', 'staff', 'accountant'],
    'suppliers': ['root_admin', 'manager', 'warehouse_clerk'],
    'reports': ['root_admin', 'manager', 'accountant'],
    'users': ['root_admin'],
    'settings': ['root_admin']
};

(async function () {

    const { data: { session }, error: sessionError } = await db.auth.getSession();

    if (sessionError || !session) {
        _deny();
        return;
    }

    const { data: profile, error: profileError } = await db
        .from('users')
        .select('id, username, full_name, role, is_active')
        .eq('id', session.user.id)
        .single();

    if (profileError || !profile) {
        await db.auth.signOut();
        _deny();
        return;
    }

    if (profile.role === 'guest') {
        await db.auth.signOut();
        _deny();
        return;
    }

    if (!profile.is_active) {
        await db.auth.signOut();
        _deny();
        return;
    }

    const pageKey = document.body.dataset.page;
    if (pageKey && PAGE_ACCESS[pageKey] && !PAGE_ACCESS[pageKey].includes(profile.role)) {
        _deny();
        return;
    }

    window.currentUser = Object.freeze({
        id: profile.id,
        username: profile.username,
        full_name: profile.full_name,
        role: profile.role,
        is_active: profile.is_active
    });

    document.documentElement.classList.add('auth-ok');

    db.auth.onAuthStateChange((event, newSession) => {
        if (event === 'SIGNED_OUT' || !newSession) {
            _deny();
        }
    });

})();


function _deny() {
    const depth = window.location.pathname
        .split('/')
        .filter(Boolean)
        .length;

    const prefix = depth > 1 ? '../'.repeat(depth - 1) : '../';
    window.location.href = `${prefix}index.html?denied=true`;
}