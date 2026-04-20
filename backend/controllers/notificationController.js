const { query, withTransaction } = require('../config/db');
const { sendToMultiple, sendToTopic } = require('../config/firebase');

// ─── Get notifications for current user ──────────────────────

async function getMyNotifications(req, res, next) {
  try {
    const { page = 1, limit = 20, unread_only = 'false' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let sql = `
      SELECT
        n.id, n.title, n.body, n.type, n.data,
        n.created_at, n.published_at,
        nr.is_read, nr.read_at,
        u.first_name AS sender_first, u.last_name AS sender_last
      FROM notifications n
      JOIN notification_receipts nr ON nr.notification_id = n.id
      LEFT JOIN users u ON u.id = n.sender_id
      WHERE nr.user_id = $1
        AND n.is_published = TRUE
    `;
    const params = [req.user.id];
    let idx = 2;

    if (unread_only === 'true') {
      sql += ` AND nr.is_read = FALSE`;
    }

    const countResult = await query(
      `SELECT COUNT(*) FROM (${sql}) t`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    const unreadResult = await query(
      `SELECT COUNT(*) FROM notification_receipts
       WHERE user_id = $1 AND is_read = FALSE`,
      [req.user.id]
    );

    sql += ` ORDER BY n.published_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit), offset);

    const result = await query(sql, params);

    res.json({
      success: true,
      data: {
        notifications: result.rows,
        unread_count: parseInt(unreadResult.rows[0].count),
        pagination: {
          total,
          page:       parseInt(page),
          limit:      parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

// ─── Mark notification as read ────────────────────────────────

async function markAsRead(req, res, next) {
  try {
    const { id } = req.params;
    await query(
      `UPDATE notification_receipts
       SET is_read = TRUE, read_at = NOW()
       WHERE notification_id = $1 AND user_id = $2`,
      [id, req.user.id]
    );
    res.json({ success: true, message: 'Marked as read.' });
  } catch (error) {
    next(error);
  }
}

// ─── Mark all as read ────────────────────────────────────────

async function markAllAsRead(req, res, next) {
  try {
    await query(
      `UPDATE notification_receipts
       SET is_read = TRUE, read_at = NOW()
       WHERE user_id = $1 AND is_read = FALSE`,
      [req.user.id]
    );
    res.json({ success: true, message: 'All notifications marked as read.' });
  } catch (error) {
    next(error);
  }
}

// ─── Create & publish notification (admin) ───────────────────

async function createNotification(req, res, next) {
  try {
    const {
      title, body, type = 'announcement', target_role,
      target_dept, related_room_id, data, send_push = true,
    } = req.body;

    const notifResult = await query(
      `INSERT INTO notifications
         (title, body, type, sender_id, target_role, target_dept,
          related_room_id, data, is_published, published_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, TRUE, NOW())
       RETURNING *`,
      [
        title, body, type, req.user.id,
        target_role || null, target_dept || null,
        related_room_id || null,
        data ? JSON.stringify(data) : null,
      ]
    );

    const notif = notifResult.rows[0];

    // Find target users
    let userSql = `SELECT id, fcm_token FROM users WHERE status = 'active'`;
    const userParams = [];
    let uidx = 1;
    if (target_role) { userParams.push(target_role); userSql += ` AND role = $${uidx++}`; }
    if (target_dept) { userParams.push(target_dept); userSql += ` AND department = $${uidx++}`; }

    const usersResult = await query(userSql, userParams);
    const users       = usersResult.rows;

    // Create receipts in bulk
    if (users.length) {
      const receiptValues = users.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(',');
      const receiptParams = users.flatMap(u => [notif.id, u.id]);
      await query(
        `INSERT INTO notification_receipts (notification_id, user_id) VALUES ${receiptValues}
         ON CONFLICT DO NOTHING`,
        receiptParams
      );
    }

    // Send push via Firebase
    if (send_push) {
      const tokens = users.map(u => u.fcm_token).filter(Boolean);
      if (tokens.length > 0) {
        await sendToMultiple(tokens, title, body, { notification_id: notif.id, type });
      }
    }

    res.status(201).json({
      success: true,
      message: `Notification sent to ${users.length} user(s).`,
      data: { notification: notif, recipients: users.length },
    });
  } catch (error) {
    next(error);
  }
}

// ─── Get all notifications (admin) ───────────────────────────

async function getAllNotifications(req, res, next) {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const countResult = await query('SELECT COUNT(*) FROM notifications');
    const total       = parseInt(countResult.rows[0].count);

    const result = await query(
      `SELECT n.*,
              u.first_name || ' ' || u.last_name AS sender_name,
              (SELECT COUNT(*) FROM notification_receipts nr WHERE nr.notification_id = n.id) AS receipt_count,
              (SELECT COUNT(*) FROM notification_receipts nr WHERE nr.notification_id = n.id AND nr.is_read = TRUE) AS read_count
       FROM notifications n
       LEFT JOIN users u ON u.id = n.sender_id
       ORDER BY n.created_at DESC
       LIMIT $1 OFFSET $2`,
      [parseInt(limit), offset]
    );

    res.json({
      success: true,
      data: {
        notifications: result.rows,
        pagination: {
          total, page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

// ─── Delete notification (admin) ─────────────────────────────

async function deleteNotification(req, res, next) {
  try {
    const { id } = req.params;
    const result = await query('DELETE FROM notifications WHERE id = $1 RETURNING id', [id]);
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Notification not found.' });
    }
    res.json({ success: true, message: 'Notification deleted.' });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getMyNotifications, markAsRead, markAllAsRead,
  createNotification, getAllNotifications, deleteNotification,
};
