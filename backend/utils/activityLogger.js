const { query } = require('../config/db');

/**
 * Fire-and-forget activity log writer.
 * Catches its own errors — NEVER throws to the calling controller.
 */
async function logActivity({
  req,
  actorId,
  actorName,
  actorRole,
  action,
  entityType,
  entityId,
  entityLabel,
  description,
  metadata = {},
}) {
  try {
    const actor = req?.user || {};
    const id   = actorId   ?? actor.id   ?? null;
    const name = actorName ?? (actor.first_name && actor.last_name
      ? `${actor.first_name} ${actor.last_name}`
      : actor.email ?? null);
    const role = actorRole ?? actor.role ?? null;

    // Prefer X-Forwarded-For (behind proxy) then req.ip
    const ip = req
      ? (req.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null)
      : null;

    await query(
      `INSERT INTO activity_logs
         (actor_id, actor_name, actor_role, action, entity_type,
          entity_id, entity_label, description, metadata, ip_address)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)`,
      [
        id,
        name,
        role,
        action,
        entityType  || null,
        entityId    != null ? String(entityId) : null,
        entityLabel || null,
        description || null,
        JSON.stringify(metadata),
        ip,
      ]
    );
  } catch (err) {
    console.error('[activity-log] write failed:', err.message);
  }
}

module.exports = { logActivity };
