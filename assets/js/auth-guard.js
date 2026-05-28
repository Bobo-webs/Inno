/* ==== auth-guard.js ===== */
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

    window.currentUser = Object.freeze({
        id: profile.id,
        username: profile.username,
        full_name: profile.full_name,
        role: profile.role,
        is_active: profile.is_active
    });

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