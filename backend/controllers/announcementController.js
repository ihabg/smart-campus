const { query } = require('../config/db');

async function getAnnouncements(req, res, next) {
  try {
    const { page = 1, limit = 10, pinned_only = 'false' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let sql = `
      SELECT a.*, u.first_name || ' ' || u.last_name AS author_name
      FROM announcements a
      LEFT JOIN users u ON u.id = a.author_id
      WHERE a.is_published = TRUE
        AND (a.expires_at IS NULL OR a.expires_at > NOW())
    `;
    if (pinned_only === 'true') sql += ' AND a.is_pinned = TRUE';

    const countResult = await query(`SELECT COUNT(*) FROM (${sql}) t`, []);
    const total = parseInt(countResult.rows[0].count);

    sql += ' ORDER BY a.is_pinned DESC, a.published_at DESC LIMIT $1 OFFSET $2';
    const result = await query(sql, [parseInt(limit), offset]);

    res.json({
      success: true,
      data: {
        announcements: result.rows,
        pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) },
      },
    });
  } catch (error) { next(error); }
}

async function getAnnouncementById(req, res, next) {
  try {
    const result = await query(
      `SELECT a.*, u.first_name || ' ' || u.last_name AS author_name
       FROM announcements a LEFT JOIN users u ON u.id = a.author_id
       WHERE a.id = $1 AND a.is_published = TRUE`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Not found.' });
    res.json({ success: true, data: { announcement: result.rows[0] } });
  } catch (error) { next(error); }
}

async function createAnnouncement(req, res, next) {
  try {
    const { title, content, is_pinned = false, is_published = false, expires_at } = req.body;
    const image_url = req.file ? `/uploads/announcements/${req.file.filename}` : null;

    const result = await query(
      `INSERT INTO announcements
         (title, content, image_url, author_id, is_pinned, is_published, published_at, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6, CASE WHEN $6 THEN NOW() ELSE NULL END, $7)
       RETURNING *`,
      [title, content, image_url, req.user.id, is_pinned, is_published, expires_at || null]
    );
    res.status(201).json({ success: true, data: { announcement: result.rows[0] } });
  } catch (error) { next(error); }
}

async function updateAnnouncement(req, res, next) {
  try {
    const { id } = req.params;
    const { title, content, is_pinned, is_published, expires_at } = req.body;
    const fields = [], values = [];
    let idx = 1;

    if (title       !== undefined) { fields.push(`title=$${idx++}`);       values.push(title); }
    if (content     !== undefined) { fields.push(`content=$${idx++}`);     values.push(content); }
    if (is_pinned   !== undefined) { fields.push(`is_pinned=$${idx++}`);   values.push(is_pinned); }
    if (expires_at  !== undefined) { fields.push(`expires_at=$${idx++}`);  values.push(expires_at); }
    if (is_published !== undefined) {
      fields.push(`is_published=$${idx++}`);
      values.push(is_published);
      fields.push(`published_at=CASE WHEN $${idx++} AND published_at IS NULL THEN NOW() ELSE published_at END`);
      values.push(is_published);
    }
    if (req.file) { fields.push(`image_url=$${idx++}`); values.push(`/uploads/announcements/${req.file.filename}`); }

    if (!fields.length) return res.status(400).json({ success: false, message: 'No fields to update.' });

    values.push(id);
    const result = await query(`UPDATE announcements SET ${fields.join(',')} WHERE id = $${idx} RETURNING *`, values);
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Not found.' });
    res.json({ success: true, data: { announcement: result.rows[0] } });
  } catch (error) { next(error); }
}

async function deleteAnnouncement(req, res, next) {
  try {
    const result = await query('DELETE FROM announcements WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Not found.' });
    res.json({ success: true, message: 'Deleted.' });
  } catch (error) { next(error); }
}

module.exports = { getAnnouncements, getAnnouncementById, createAnnouncement, updateAnnouncement, deleteAnnouncement };
