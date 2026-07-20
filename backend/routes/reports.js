const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// GET all reports
router.get('/', async (req, res) => {
  try {
    const { project_id, employee_id, report_type } = req.query;
    
    let query = `
      SELECT wr.*, e.full_name as employee_name, p.project_name
      FROM work_reports wr
      JOIN employees e ON wr.employee_id = e.id
      JOIN projects p ON wr.project_id = p.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;
    
    if (project_id) {
      query += ` AND wr.project_id = $${paramIndex}`;
      params.push(project_id);
      paramIndex++;
    }
    
    if (employee_id) {
      query += ` AND wr.employee_id = $${paramIndex}`;
      params.push(employee_id);
      paramIndex++;
    }
    
    if (report_type) {
      query += ` AND wr.report_type = $${paramIndex}`;
      params.push(report_type);
      paramIndex++;
    }
    
    query += ' ORDER BY wr.report_date DESC';
    const result = await pool.query(query, params);
    
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST create report
router.post('/', async (req, res) => {
  try {
    const { project_id, employee_id, report_date, report_type, work_done, work_hours } = req.body;
    
    const result = await pool.query(
      `INSERT INTO work_reports (project_id, employee_id, report_date, report_type, work_done, work_hours)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [project_id, employee_id, report_date, report_type, work_done, work_hours]
    );
    
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;