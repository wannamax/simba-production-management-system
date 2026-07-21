const express = require('express');
const router = express.Router();
const pool = require('../config/database');

function toBoolean(value) {
  return value === true || value === 'true' || value === '1';
}

router.get('/', async (req, res, next) => {
  try {
    const unreadOnly = toBoolean(req.query.unread_only);
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const params = [limit];
    const unreadSystem = unreadOnly ? 'WHERE sn.is_read = FALSE' : '';
    const unreadTask = unreadOnly ? 'WHERE tn.is_read = FALSE' : '';

    const result = await pool.query(
      `SELECT * FROM (
         SELECT
           'system'::text AS source,
           sn.id,
           sn.notification_type,
           sn.title,
           sn.message,
           sn.priority,
           sn.is_read,
           sn.read_at,
           sn.created_at,
           sn.link,
           sn.schedule_id,
           sn.task_id,
           s.title AS schedule_title,
           NULL::text AS task_name,
           p.project_name
         FROM system_notifications sn
         LEFT JOIN schedules s ON s.id = sn.schedule_id
         LEFT JOIN projects p ON p.id = s.project_id
         ${unreadSystem}

         UNION ALL

         SELECT
           'task'::text AS source,
           tn.id,
           tn.notification_type,
           tn.title,
           tn.message,
           tn.priority,
           tn.is_read,
           tn.read_at,
           tn.created_at,
           CASE WHEN tn.task_id IS NULL THEN NULL ELSE '/tasks/' || tn.task_id END AS link,
           NULL::integer AS schedule_id,
           tn.task_id,
           NULL::text AS schedule_title,
           t.task_name,
           p.project_name
         FROM task_notifications tn
         LEFT JOIN tasks t ON t.id = tn.task_id
         LEFT JOIN projects p ON p.id = t.project_id
         ${unreadTask}
       ) notifications
       ORDER BY created_at DESC
       LIMIT $1`,
      params
    );

    const countResult = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM system_notifications WHERE is_read = FALSE) +
         (SELECT COUNT(*) FROM task_notifications WHERE is_read = FALSE) AS unread_count`
    );

    res.json({
      success: true,
      data: result.rows,
      unread_count: Number(countResult.rows[0].unread_count || 0),
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/:source/:id/read', async (req, res, next) => {
  try {
    const { source, id } = req.params;
    const table = source === 'task' ? 'task_notifications' : source === 'system' ? 'system_notifications' : null;
    if (!table) {
      return res.status(400).json({ success: false, message: 'Nguồn thông báo không hợp lệ' });
    }

    const result = await pool.query(
      `UPDATE ${table}
       SET is_read = TRUE, read_at = COALESCE(read_at, NOW())
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy thông báo' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.patch('/read-all', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const system = await client.query(
      `UPDATE system_notifications SET is_read = TRUE, read_at = NOW() WHERE is_read = FALSE`
    );
    const task = await client.query(
      `UPDATE task_notifications SET is_read = TRUE, read_at = NOW() WHERE is_read = FALSE`
    );
    await client.query('COMMIT');
    res.json({ success: true, updated: system.rowCount + task.rowCount });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

module.exports = router;
