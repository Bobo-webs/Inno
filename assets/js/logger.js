/* ==== LOGGER.JS ==== */
window.logActivity = async function (action, entityType, entityId, entityName, details) {
    try {
        const user = window.currentUser;
        if (!user) return;
        await db.from('activity_logs').insert({
            user_id:     user.id,
            username:    user.username,
            action,
            entity_type: entityType  || null,
            entity_id:   entityId    || null,
            entity_name: entityName  || null,
            details:     details     || null,
            created_at:  new Date().toISOString()
        });
    } catch (_) { }
};