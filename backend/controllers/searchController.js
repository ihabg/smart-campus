const { query } = require('../config/db');

// ─── Global search ────────────────────────────────────────────

async function globalSearch(req, res, next) {
  try {
    const { q, type, building_id, floor_id, limit = 20 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({ success: false, message: 'Query must be at least 2 characters.' });
    }

    const term   = q.trim();
    const results = {};

    // ── Search Rooms ────────────────────────────────────────
    if (!type || type === 'room') {
      let sql = `
        SELECT
          r.id, r.room_number, r.name, r.type, r.department,
          r.capacity, r.coord_x, r.coord_y, r.is_accessible,
          f.id AS floor_id, f.floor_label, f.floor_number, f.map_image_url,
          b.id AS building_id, b.code AS building_code, b.name AS building_name,
          ts_rank(
            to_tsvector('english', r.name || ' ' || r.room_number || ' ' || COALESCE(r.department,'')),
            plainto_tsquery('english', $1)
          ) AS rank
        FROM rooms r
        JOIN floors    f ON f.id = r.floor_id
        JOIN buildings b ON b.id = f.building_id
        WHERE r.is_active = TRUE
          AND f.is_active = TRUE
          AND (
            to_tsvector('english', r.name || ' ' || r.room_number || ' ' || COALESCE(r.department,''))
              @@ plainto_tsquery('english', $1)
            OR r.room_number ILIKE $2
            OR r.name        ILIKE $2
            OR r.department  ILIKE $2
          )
      `;
      const params = [term, `%${term}%`];
      let idx = 3;

      if (building_id) { params.push(building_id); sql += ` AND b.id = $${idx++}`; }
      if (floor_id)    { params.push(floor_id);    sql += ` AND f.id = $${idx++}`; }

      sql += ` ORDER BY rank DESC, r.room_number LIMIT $${idx}`;
      params.push(parseInt(limit));

      const roomResult = await query(sql, params);
      results.rooms = roomResult.rows;
    }

    // ── Search Courses ───────────────────────────────────────
    if (!type || type === 'course') {
      const courseResult = await query(
        `SELECT id, code, name, department, credit_hours
         FROM courses
         WHERE is_active = TRUE
           AND (code ILIKE $1 OR name ILIKE $1 OR department ILIKE $1)
         ORDER BY code
         LIMIT $2`,
        [`%${term}%`, parseInt(limit)]
      );
      results.courses = courseResult.rows;
    }

    // ── Search Instructors ───────────────────────────────────
    if (!type || type === 'instructor') {
      const instrResult = await query(
        `SELECT i.id, i.title, i.first_name, i.last_name, i.department,
                r.room_number AS office_room_number, r.name AS office_room_name,
                f.floor_label AS office_floor
         FROM instructors i
         LEFT JOIN rooms  r ON r.id = i.office_room_id
         LEFT JOIN floors f ON f.id = r.floor_id
         WHERE i.is_active = TRUE
           AND (i.first_name ILIKE $1 OR i.last_name ILIKE $1
                OR i.department ILIKE $1 OR i.email ILIKE $1)
         ORDER BY i.last_name, i.first_name
         LIMIT $2`,
        [`%${term}%`, parseInt(limit)]
      );
      results.instructors = instrResult.rows;
    }

    // ── Search Announcements ─────────────────────────────────
    if (!type || type === 'announcement') {
      const annResult = await query(
        `SELECT id, title, content, published_at
         FROM announcements
         WHERE is_published = TRUE
           AND (title ILIKE $1 OR content ILIKE $1)
         ORDER BY published_at DESC
         LIMIT $2`,
        [`%${term}%`, Math.min(parseInt(limit), 10)]
      );
      results.announcements = annResult.rows;
    }

    const total = Object.values(results).reduce((sum, arr) => sum + arr.length, 0);

    res.json({
      success: true,
      data: {
        query: term,
        total,
        results,
      },
    });
  } catch (error) {
    next(error);
  }
}

// ─── Room quick-search (for map highlight) ───────────────────

async function quickSearchRooms(req, res, next) {
  try {
    const { q, floor_id, limit = 10 } = req.query;
    if (!q || q.trim().length < 1) {
      return res.json({ success: true, data: { rooms: [] } });
    }

    const term = q.trim();
    let sql = `
      SELECT r.id, r.room_number, r.name, r.type, r.coord_x, r.coord_y,
             f.floor_label, b.code AS building_code
      FROM rooms r
      JOIN floors    f ON f.id = r.floor_id
      JOIN buildings b ON b.id = f.building_id
      WHERE r.is_active = TRUE
        AND (r.room_number ILIKE $1 OR r.name ILIKE $1)
    `;
    const params = [`%${term}%`];
    let idx = 2;

    if (floor_id) { params.push(floor_id); sql += ` AND r.floor_id = $${idx++}`; }

    sql += ` ORDER BY r.room_number LIMIT $${idx}`;
    params.push(parseInt(limit));

    const result = await query(sql, params);
    res.json({ success: true, data: { rooms: result.rows } });
  } catch (error) {
    next(error);
  }
}

// ─── Pathfinding — load graph from DB ────────────────────────

async function getGraph(req, res, next) {
  try {
    const { floor_id } = req.query;

    let sql = `
      SELECT
        ra.room_a_id, ra.room_b_id, ra.weight,
        r_a.room_number AS room_a_number, r_a.coord_x AS a_x, r_a.coord_y AS a_y,
        r_b.room_number AS room_b_number, r_b.coord_x AS b_x, r_b.coord_y AS b_y
      FROM room_adjacency ra
      JOIN rooms r_a ON r_a.id = ra.room_a_id
      JOIN rooms r_b ON r_b.id = ra.room_b_id
      WHERE ra.is_active = TRUE
    `;
    const params = [];

    if (floor_id) {
      sql += ' AND r_a.floor_id = $1 AND r_b.floor_id = $1';
      params.push(floor_id);
    }

    const result = await query(sql, params);

    // Build adjacency map: { roomId: [{id, weight}] }
    const graph = {};
    for (const row of result.rows) {
      if (!graph[row.room_a_id]) graph[row.room_a_id] = [];
      graph[row.room_a_id].push({ id: row.room_b_id, weight: parseFloat(row.weight) });
    }

    // Also get node positions
    let roomsSql = `
      SELECT r.id, r.room_number, r.name, r.coord_x, r.coord_y, r.type
      FROM rooms r
      WHERE r.is_active = TRUE
    `;
    const roomParams = [];
    if (floor_id) { roomsSql += ' AND r.floor_id = $1'; roomParams.push(floor_id); }

    const roomsResult = await query(roomsSql, roomParams);
    const nodes = {};
    for (const r of roomsResult.rows) {
      nodes[r.id] = { id: r.id, number: r.room_number, name: r.name, x: r.coord_x, y: r.coord_y, type: r.type };
    }

    res.json({ success: true, data: { graph, nodes } });
  } catch (error) {
    next(error);
  }
}

module.exports = { globalSearch, quickSearchRooms, getGraph };
