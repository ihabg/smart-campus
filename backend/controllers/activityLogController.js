const { query } = require('../config/db');

async function getActivityLogs(req, res, next) {
  try {
    const {
      search,
      action,
      entity_type,
      actor_id,
      date_from,
      date_to,
      page  = 1,
      limit = 20,
    } = req.query;

    const pageNum  = Math.max(parseInt(page,  10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const offset   = (pageNum - 1) * limitNum;

    const params = [];
    let   idx    = 1;

    let sql = `
      SELECT id, actor_id, actor_name, actor_role, action,
             entity_type, entity_id, entity_label, description,
             metadata, ip_address, created_at
      FROM activity_logs
      WHERE 1=1
    `;

    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (actor_name ILIKE $${idx} OR entity_label ILIKE $${idx} OR description ILIKE $${idx})`;
      idx++;
    }
    if (action) {
      params.push(action);
      sql += ` AND action = $${idx++}`;
    }
    if (entity_type) {
      params.push(entity_type);
      sql += ` AND entity_type = $${idx++}`;
    }
    if (actor_id) {
      params.push(actor_id);
      sql += ` AND actor_id = $${idx++}::uuid`;
    }
    if (date_from) {
      params.push(date_from);
      sql += ` AND created_at >= $${idx++}`;
    }
    if (date_to) {
      params.push(date_to);
      sql += ` AND created_at <= $${idx++}`;
    }

    const [countResult, summaryResult] = await Promise.all([
      query(`SELECT COUNT(*) FROM (${sql}) t`, params),
      query(`
        SELECT
          COUNT(*)::int                                                                                                    AS total,
          COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)::int                                                         AS total_today,
          COUNT(*) FILTER (WHERE entity_type = 'user')::int                                                               AS user_changes,
          COUNT(*) FILTER (WHERE entity_type IN ('course','study_plan','enrollment','prerequisite','semester'))::int       AS academic_changes,
          COUNT(*) FILTER (WHERE entity_type = 'event')::int                                                              AS event_changes
        FROM activity_logs
      `),
    ]);

    const total   = parseInt(countResult.rows[0].count, 10) || 0;
    const summary = summaryResult.rows[0] || {};

    sql += ` ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limitNum, offset);

    const result = await query(sql, params);

    res.json({
      success: true,
      data: {
        logs: result.rows,
        pagination: {
          total,
          page:       pageNum,
          limit:      limitNum,
          totalPages: Math.ceil(total / limitNum),
        },
        summary: {
          total:            parseInt(summary.total,            10) || 0,
          total_today:      parseInt(summary.total_today,      10) || 0,
          user_changes:     parseInt(summary.user_changes,     10) || 0,
          academic_changes: parseInt(summary.academic_changes, 10) || 0,
          event_changes:    parseInt(summary.event_changes,    10) || 0,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { getActivityLogs };
