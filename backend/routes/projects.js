const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// GET all projects
router.get('/', async (req, res) => {
  try {
    const { status, page = 1, limit = 20, search, project_type } = req.query;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT p.*, c.company_name, c.contact_person, c.phone as customer_phone
      FROM projects p
      LEFT JOIN customers c ON p.customer_id = c.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;
    
    if (status) {
      query += ` AND p.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    
    if (project_type) {
      query += ` AND p.project_type = $${paramIndex}`;
      params.push(project_type);
      paramIndex++;
    }
    
    if (search) {
      query += ` AND (p.project_name ILIKE $${paramIndex} OR p.project_code ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    const countQuery = query.replace(
      'SELECT p.*, c.company_name, c.contact_person, c.phone as customer_phone',
      'SELECT COUNT(*)'
    );
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);
    
    query += ` ORDER BY p.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      data: result.rows,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET single project
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, c.company_name, c.contact_person, c.phone as customer_phone
      FROM projects p
      LEFT JOIN customers c ON p.customer_id = c.id
      WHERE p.id = $1
    `, [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy dự án' });
    }
    
    const employees = await pool.query(`
      SELECT pa.*, e.full_name, e.phone, e.position
      FROM project_assignments pa
      JOIN employees e ON pa.employee_id = e.id
      WHERE pa.project_id = $1
    `, [req.params.id]);
    
    const schedules = await pool.query(
      'SELECT * FROM schedules WHERE project_id = $1 ORDER BY start_datetime',
      [req.params.id]
    );
    
    const products = await pool.query(
      'SELECT * FROM project_products WHERE project_id = $1',
      [req.params.id]
    );
    
    res.json({
      success: true,
      data: {
        ...result.rows[0],
        employees: employees.rows,
        schedules: schedules.rows,
        products: products.rows
      }
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST create project
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const { project_name, project_type, customer_id, start_date, end_date, budget, description, priority } = req.body;
    
    const codeResult = await client.query(
      "SELECT COUNT(*) as count FROM projects WHERE project_code LIKE $1",
      [`PRJ-${new Date().getFullYear()}%`]
    );
    const projectCode = `PRJ-${new Date().getFullYear()}${String(parseInt(codeResult.rows[0].count) + 1).padStart(4, '0')}`;
    
    const result = await client.query(
      `INSERT INTO projects (project_code, project_name, project_type, customer_id, start_date, end_date, budget, description, priority)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [projectCode, project_name, project_type, customer_id, start_date, end_date, budget, description, priority || 'Trung bình']
    );
    
    await client.query('COMMIT');
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    client.release();
  }
});

// PUT update project
router.put('/:id', async (req, res) => {
  try {
    const { project_name, project_type, customer_id, start_date, end_date, status, priority, budget, description } = req.body;
    
    const result = await pool.query(
      `UPDATE projects SET 
        project_name = $1, project_type = $2, customer_id = $3,
        start_date = $4, end_date = $5, status = $6, priority = $7,
        budget = $8, description = $9, updated_at = NOW()
       WHERE id = $10 RETURNING *`,
      [project_name, project_type, customer_id, start_date, end_date, status, priority, budget, description, req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy dự án' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE project
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM projects WHERE id = $1 RETURNING *', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy dự án' });
    }
    
    res.json({ success: true, message: 'Xóa dự án thành công' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});


// POST add employee assignment
router.post('/:id/assignments', async (req, res, next) => {
  try {
    const { employee_id, role, notes } = req.body;
    
    const result = await pool.query(
      `INSERT INTO project_assignments (project_id, employee_id, role, notes)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (project_id, employee_id, role) 
       DO UPDATE SET notes = EXCLUDED.notes
       RETURNING *`,
      [req.params.id, employee_id, role, notes]
    );
    
    res.status(201).json({
      success: true,
      message: 'Phân công nhân viên thành công',
      data: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

// PUT update employee assignment
router.put('/:projectId/assignments/:assignmentId', async (req, res, next) => {
  try {
    const { role, notes } = req.body;
    
    const result = await pool.query(
      `UPDATE project_assignments 
       SET role = $1, notes = $2
       WHERE id = $3 AND project_id = $4
       RETURNING *`,
      [role, notes, req.params.assignmentId, req.params.projectId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy phân công'
      });
    }
    
    res.json({
      success: true,
      message: 'Cập nhật phân công thành công',
      data: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

// DELETE remove employee assignment
router.delete('/:projectId/assignments/:assignmentId', async (req, res, next) => {
  try {
    const result = await pool.query(
      'DELETE FROM project_assignments WHERE id = $1 AND project_id = $2 RETURNING *',
      [req.params.assignmentId, req.params.projectId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy phân công'
      });
    }
    
    res.json({
      success: true,
      message: 'Xóa phân công thành công'
    });
  } catch (error) {
    next(error);
  }
});

// GET project assignments
router.get('/:id/assignments', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT pa.*, e.full_name, e.phone, e.position, e.department
       FROM project_assignments pa
       JOIN employees e ON pa.employee_id = e.id
       WHERE pa.project_id = $1
       ORDER BY pa.assigned_date DESC`,
      [req.params.id]
    );
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
