const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const appVersion = require('../config/version');

// GET dashboard summary
router.get('/summary', async (req, res) => {
  try {
    const projectStats = await pool.query(`
      SELECT status, COUNT(*) as count FROM projects GROUP BY status
    `);
    
    const scheduleStats = await pool.query(`
      SELECT schedule_type, status, COUNT(*) as count
      FROM schedules
      WHERE start_datetime >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY schedule_type, status
    `);
    
    const employeeStats = await pool.query(`
      SELECT department, COUNT(*) as count
      FROM employees WHERE status = 'Hoạt động'
      GROUP BY department
    `);
    
    const recentReports = await pool.query(`
      SELECT wr.*, e.full_name as employee_name, p.project_name, s.title as schedule_title
      FROM work_reports wr
      JOIN employees e ON wr.employee_id = e.id
      JOIN projects p ON wr.project_id = p.id
      LEFT JOIN schedules s ON wr.schedule_id = s.id
      WHERE wr.report_date >= CURRENT_DATE - INTERVAL '7 days'
      ORDER BY wr.created_at DESC
      LIMIT 10
    `);
    
    const upcomingSchedules = await pool.query(`
      SELECT s.*, p.project_name, p.project_code
      FROM schedules s
      JOIN projects p ON s.project_id = p.id
      WHERE s.start_datetime BETWEEN NOW() AND NOW() + INTERVAL '7 days'
      AND s.status = 'Chưa bắt đầu'
      ORDER BY s.start_datetime ASC
      LIMIT 10
    `);
    
    const overdueSchedules = await pool.query(`
      SELECT s.*, p.project_name
      FROM schedules s
      JOIN projects p ON s.project_id = p.id
      WHERE s.end_datetime < NOW()
      AND s.status NOT IN ('Hoàn thành', 'Hủy')
      ORDER BY s.end_datetime DESC
      LIMIT 10
    `);
    
    const topEmployees = await pool.query(`
      SELECT e.id, e.full_name, e.department, e.position,
        COUNT(DISTINCT wr.id) as report_count,
        SUM(wr.work_hours) as total_hours
      FROM employees e
      JOIN work_reports wr ON e.id = wr.employee_id
      WHERE EXTRACT(MONTH FROM wr.report_date) = EXTRACT(MONTH FROM CURRENT_DATE)
      AND EXTRACT(YEAR FROM wr.report_date) = EXTRACT(YEAR FROM CURRENT_DATE)
      GROUP BY e.id
      ORDER BY total_hours DESC
      LIMIT 10
    `);
    
    res.json({
      success: true,
      data: {
        version: appVersion.version,
        display_version: appVersion.display,
        projects: projectStats.rows,
        schedules: scheduleStats.rows,
        employees: employeeStats.rows,
        recentReports: recentReports.rows,
        upcomingSchedules: upcomingSchedules.rows,
        overdueSchedules: overdueSchedules.rows,
        topEmployees: topEmployees.rows
      }
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
