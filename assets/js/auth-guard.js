/* ── Session check ── */
(async function () {
    const { data: { session } } = await db.auth.getSession();
    if (!session) return;
    const { data: profile } = await db
        .from('users').select('role').eq('id', session.user.id).single();
    if (profile && profile.role !== 'guest') {
        window.location.href = '/dashboard/home.html';
    }
})();