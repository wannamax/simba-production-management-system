const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// GET all schedules
router.get('/', async (req, res) => {
  try {
    const { project_id, schedule_type, status } = req.query;
    
    let query = `
      SELECT s.*, p.project_name, p.project_code
      FROM schedules s
      JOIN projects p ON s.project_id = p.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;
    
    if (project_id) {
      query += ` AND s.project_id = $${paramIndex}`;
      params.push(project_id);
      paramIndex++;
    }
    
    if (schedule_type) {
      query += ` AND s.schedule_type = $${paramIndex}`;
      params.push(schedule_type);
      paramIndex++;
    }
    
    if (status) {
      query += ` AND s.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    
    query += ' ORDER BY s.start_datetime DESC';
    const result = await pool.query(query, params);
    
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST create schedule
router.post('/', async (req, res) => {
  try {
    const { project_id, schedule_type, title, description, location, start_datetime, end_datetime, priority } = req.body;
    
    const result = await pool.query(
      `INSERT INTO schedules (project_id, schedule_type, title, description, location, start_datetime, end_datetime, priority)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [project_id, schedule_type, title, description, location, start_datetime, end_datetime, priority || 'Trung bình']
    );
    
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;