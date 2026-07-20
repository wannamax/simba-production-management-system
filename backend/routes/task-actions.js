const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// ==================== TASK PAUSE/RESUME/CANCEL ====================

// PATCH /:id/pause - Tạm dừng nhiệm vụ
router.patch('/:id/pause', async (req, res, next) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { pause_reason } = req.body;
    const taskId = req.params.id;
    const userId = req.user?.id || 1;
    
    // Check task exists and can be paused
    const checkResult = await client.query(
      `SELECT id, task_name, status, is_paused FROM tasks WHERE id = $1`,
      [taskId]
    );
    
    if (checkResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy nhiệm vụ'
      });
    }
    
    const task = checkResult.rows[0];
    
    if (task.status === 'Hoàn thành') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Không thể tạm dừng nhiệm vụ đã hoàn thành'
      });
    }
    
    if (task.is_paused) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Nhiệm vụ đã được tạm dừng'
      });
    }
    
    // Update task to paused
    const result = await client.query(
      `UPDATE tasks 
       SET status = 'Tạm dừng',
           is_paused = TRUE,
           paused_at = NOW(),
           paused_by = $1,
           pause_reason = $2,
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [userId, pause_reason, taskId]
    );
    
    // Count deactivated assignments
    const assignmentCount = await client.query(
      `SELECT COUNT(*) as count FROM task_assignments WHERE task_id = $1 AND is_active = TRUE`,
      [taskId]
    );
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: `Tạm dừng nhiệm vụ thành công. Đã giải phóng ${assignmentCount.rows[0].count} nhân viên.`,
      data: result.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// PATCH /:id/resume - Tiếp tục nhiệm vụ
router.patch('/:id/resume', async (req, res, next) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const taskId = req.params.id;
    
    const checkResult = await client.query(
      `SELECT id, task_name, status, is_paused FROM tasks WHERE id = $1`,
      [taskId]
    );
    
    if (checkResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy nhiệm vụ'
      });
    }
    
    const task = checkResult.rows[0];
    
    if (!task.is_paused) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Nhiệm vụ không ở trạng thái tạm dừng'
      });
    }
    
    // Resume task
    const result = await client.query(
      `UPDATE tasks 
       SET status = 'Đang thực hiện',
           is_paused = FALSE,
           paused_at = NULL,
           paused_by = NULL,
           pause_reason = NULL,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [taskId]
    );
    
    // Count reactivated assignments
    const assignmentCount = await client.query(
      `SELECT COUNT(*) as count FROM task_assignments WHERE task_id = $1`,
      [taskId]
    );
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: `Tiếp tục nhiệm vụ thành công. Đã gán lại ${assignmentCount.rows[0].count} nhân viên.`,
      data: result.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// PATCH /:id/cancel - Hủy nhiệm vụ
router.patch('/:id/cancel', async (req, res, next) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { cancel_reason } = req.body;
    const taskId = req.params.id;
    const userId = req.user?.id || 1;
    
    const checkResult = await client.query(
      `SELECT id, task_name, status FROM tasks WHERE id = $1`,
      [taskId]
    );
    
    if (checkResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy nhiệm vụ'
      });
    }
    
    const task = checkResult.rows[0];
    
    if (task.status === 'Hoàn thành') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Không thể hủy nhiệm vụ đã hoàn thành'
      });
    }
    
    if (task.status === 'Hủy') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Nhiệm vụ đã được hủy'
      });
    }
    
    // Cancel task
    const result = await client.query(
      `UPDATE tasks 
       SET status = 'Hủy',
           cancelled_at = NOW(),
           cancelled_by = $1,
           cancel_reason = $2,
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [userId, cancel_reason, taskId]
    );
    
    // Cancel pending locations
    await client.query(
      `UPDATE task_locations 
       SET status = 'Hủy',
           notes = CONCAT(COALESCE(notes, ''), ' [Hủy: ', $1, ']')
       WHERE task_id = $2 
         AND status NOT IN ('Hoàn thành')`,
      [cancel_reason || 'Nhiệm vụ bị hủy', taskId]
    );
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: 'Hủy nhiệm vụ thành công. Nhân viên đã được giải phóng.',
      data: result.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

module.exports = router;