const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const CodeGenerator = require('../utils/codeGenerator');
const { body, validationResult } = require('express-validator');

const validateEmployee = [
  body('full_name').notEmpty().withMessage('Họ tên không được trống'),
  body('position').notEmpty().withMessage('Vị trí không được trống'),
  body('department').notEmpty().withMessage('Phòng ban không được trống')
];

// GET all employees
router.get('/', async (req, res, next) => {
  try {
    const { department, status = 'Hoạt động', search, position } = req.query;
    
    let query = 'SELECT * FROM employees WHERE 1=1';
    const params = [];
    let paramIndex = 1;
    
    // Only add status filter if it's a valid status value
    if (status && status !== 'all' && status !== 'availability') {
      query += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    
    if (department && department !== 'all') {
      query += ` AND department = $${paramIndex}`;
      params.push(department);
      paramIndex++;
    }

    if (position && position !== 'all') {
      query += ` AND position = $${paramIndex}`;
      params.push(position);
      paramIndex++;
    }
    
    if (search) {
      query += ` AND (full_name ILIKE $${paramIndex} OR employee_code ILIKE $${paramIndex} OR phone ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    query += ' ORDER BY full_name';
    
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    next(error);
  }
});

// GET single employee
router.get('/:id', async (req, res, next) => {
  try {
    // Validate ID is a number
    const employeeId = parseInt(req.params.id);
    if (isNaN(employeeId)) {
      return res.status(400).json({
        success: false,
        message: 'ID nhân viên không hợp lệ'
      });
    }

    const result = await pool.query('SELECT * FROM employees WHERE id = $1', [employeeId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Không tìm thấy nhân viên' 
      });
    }
    
    // Get assigned projects
    const projects = await pool.query(`
      SELECT pa.*, p.project_name, p.project_code, p.status
      FROM project_assignments pa
      JOIN projects p ON pa.project_id = p.id
      WHERE pa.employee_id = $1
      ORDER BY pa.assigned_date DESC
    `, [employeeId]);
    
    // Get work reports
    const reports = await pool.query(`
      SELECT wr.*, p.project_name, s.title as schedule_title
      FROM work_reports wr
      JOIN projects p ON wr.project_id = p.id
      LEFT JOIN schedules s ON wr.schedule_id = s.id
      WHERE wr.employee_id = $1
      ORDER BY wr.report_date DESC
      LIMIT 10
    `, [employeeId]);
    
    // Get task assignments
    const tasks = await pool.query(`
      SELECT ta.*, t.task_name, t.task_code, t.task_type, t.status as task_status
      FROM task_assignments ta
      JOIN tasks t ON ta.task_id = t.id
      WHERE ta.employee_id = $1 AND ta.is_active = TRUE
      ORDER BY ta.assigned_at DESC
    `, [employeeId]);
    
    res.json({
      success: true,
      data: {
        ...result.rows[0],
        projects: projects.rows,
        recentReports: reports.rows,
        tasks: tasks.rows
      }
    });
  } catch (error) {
    next(error);
  }
});

// POST create employee
router.post('/', validateEmployee, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false, 
      errors: errors.array() 
    });
  }
  
  try {
    const { 
      full_name, 
      phone, 
      email, 
      position, 
      department,
      salary,
      hire_date,
      address,
      id_number,
      notes
    } = req.body;
    
    const employeeCode = await CodeGenerator.generateEmployeeCode();
    
    const result = await pool.query(
      `INSERT INTO employees (
        employee_code, full_name, phone, email, position, 
        department, salary, hire_date, address, id_number, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [
        employeeCode, full_name, phone, email, position,
        department, salary, hire_date, address, id_number, notes
      ]
    );
    
    res.status(201).json({
      success: true,
      message: 'Tạo nhân viên thành công',
      data: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

// PUT update employee
router.put('/:id', validateEmployee, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false, 
      errors: errors.array() 
    });
  }
  
  try {
    const employeeId = parseInt(req.params.id);
    if (isNaN(employeeId)) {
      return res.status(400).json({
        success: false,
        message: 'ID nhân viên không hợp lệ'
      });
    }

    const { 
      full_name, 
      phone, 
      email, 
      position, 
      department,
      salary,
      hire_date,
      status,
      address,
      id_number,
      notes
    } = req.body;
    
    const result = await pool.query(
      `UPDATE employees SET 
        full_name = $1,
        phone = $2,
        email = $3,
        position = $4,
        department = $5,
        salary = $6,
        hire_date = $7,
        status = $8,
        address = $9,
        id_number = $10,
        notes = $11,
        updated_at = NOW()
      WHERE id = $12 RETURNING *`,
      [full_name, phone, email, position, department, salary, hire_date, status, address, id_number, notes, employeeId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Không tìm thấy nhân viên' 
      });
    }
    
    res.json({
      success: true,
      message: 'Cập nhật nhân viên thành công',
      data: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

// PATCH update employee status
router.patch('/:id/status', async (req, res, next) => {
  try {
    const employeeId = parseInt(req.params.id);
    if (isNaN(employeeId)) {
      return res.status(400).json({
        success: false,
        message: 'ID nhân viên không hợp lệ'
      });
    }

    const { status } = req.body;
    
    const result = await pool.query(
      `UPDATE employees SET status = $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [status, employeeId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy nhân viên'
      });
    }
    
    res.json({
      success: true,
      message: 'Cập nhật trạng thái thành công',
      data: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

// DELETE employee (soft delete)
router.delete('/:id', async (req, res, next) => {
  try {
    const employeeId = parseInt(req.params.id);
    if (isNaN(employeeId)) {
      return res.status(400).json({
        success: false,
        message: 'ID nhân viên không hợp lệ'
      });
    }

    // Check if employee has active assignments
    const checkAssignments = await pool.query(
      `SELECT COUNT(*) as count FROM project_assignments WHERE employee_id = $1`,
      [employeeId]
    );
    
    if (parseInt(checkAssignments.rows[0].count) > 0) {
      // Soft delete - set status to inactive
      const result = await pool.query(
        `UPDATE employees SET status = 'Nghỉ việc', updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [employeeId]
      );
      
      return res.json({
        success: true,
        message: 'Nhân viên đã được đánh dấu nghỉ việc (do có phân công dự án)',
        data: result.rows[0]
      });
    }
    
    // Hard delete if no assignments
    const result = await pool.query(
      'DELETE FROM employees WHERE id = $1 RETURNING *',
      [employeeId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy nhân viên'
      });
    }
    
    res.json({
      success: true,
      message: 'Xóa nhân viên thành công'
    });
  } catch (error) {
    next(error);
  }
});

// GET employee statistics
router.get('/:id/statistics', async (req, res, next) => {
  try {
    const employeeId = parseInt(req.params.id);
    if (isNaN(employeeId)) {
      return res.status(400).json({
        success: false,
        message: 'ID nhân viên không hợp lệ'
      });
    }

    const stats = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM project_assignments WHERE employee_id = $1) as total_projects,
        (SELECT COUNT(*) FROM work_reports WHERE employee_id = $1) as total_reports,
        (SELECT SUM(work_hours) FROM work_reports WHERE employee_id = $1) as total_work_hours,
        (SELECT COUNT(*) FROM schedule_assignments WHERE employee_id = $1) as total_schedules,
        (SELECT COUNT(*) FROM task_assignments WHERE employee_id = $1 AND is_active = TRUE) as total_active_tasks
    `, [employeeId]);
    
    res.json({
      success: true,
      data: stats.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

// GET available employees for task
router.get('/available/for-task', async (req, res, next) => {
  try {
    const { project_id, department, position } = req.query;
    
    let query = `
      SELECT DISTINCT e.* 
      FROM employees e
      WHERE e.status = 'Hoạt động'
    `;
    const params = [];
    let paramIndex = 1;
    
    if (project_id) {
      // Get employees assigned to this project
      query += ` AND e.id IN (
        SELECT employee_id FROM project_assignments 
        WHERE project_id = $${paramIndex}
      )`;
      params.push(parseInt(project_id));
      paramIndex++;
    }
    
    if (department) {
      query += ` AND e.department = $${paramIndex}`;
      params.push(department);
      paramIndex++;
    }
    
    if (position) {
      query += ` AND e.position = $${paramIndex}`;
      params.push(position);
      paramIndex++;
    }
    
    query += ' ORDER BY e.full_name';
    
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    next(error);
  }
});

// GET employee availability with filters (UPDATED - exclude paused/cancelled tasks)
// GET employee availability (FIXED - exclude deleted projects)
router.get('/availability', async (req, res, next) => {
  try {
    const {
      employee_ids,
      project_ids,
      start_date,
      end_date,
    } = req.query;

    // Use the view we created
    let query = `
      SELECT 
        vew.*,
        160 as available_hours,
        ROUND((vew.total_busy_hours / 160.0) * 100, 2) as workload_percentage,
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'project_id', p.id,
                'project_name', p.project_name,
                'project_code', p.project_code,
                'role', pa.role,
                'task_count', (
                  SELECT COUNT(*) 
                  FROM tasks t2 
                  INNER JOIN task_assignments ta2 ON t2.id = ta2.task_id
                  WHERE t2.project_id = p.id 
                    AND ta2.employee_id = vew.employee_id
                    AND ta2.is_active = TRUE
                    AND t2.status NOT IN ('Tạm dừng', 'Hủy', 'Hoàn thành', 'Lưu trữ')
                ),
                'start_date', p.start_date,
                'end_date', p.end_date,
                'is_overdue', CASE 
                  WHEN p.end_date < CURRENT_DATE AND p.status NOT IN ('Hoàn thành', 'Hủy') 
                  THEN true 
                  ELSE false 
                END
              )
            )
            FROM (
              SELECT DISTINCT p.id, p.project_name, p.project_code, p.start_date, p.end_date, p.status, pa.role
              FROM projects p
              INNER JOIN tasks t ON p.id = t.project_id
              INNER JOIN task_assignments ta ON t.id = ta.task_id
              LEFT JOIN project_assignments pa ON p.id = pa.project_id AND pa.employee_id = ta.employee_id
              WHERE ta.employee_id = vew.employee_id
                AND ta.is_active = TRUE
                AND t.status NOT IN ('Tạm dừng', 'Hủy', 'Hoàn thành', 'Lưu trữ')
                AND p.deleted_at IS NULL
            ) p
          ),
          '[]'::json
        ) as busy_projects
      FROM v_employee_real_workload vew
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (employee_ids) {
      query += ` AND vew.employee_id = ANY($${paramIndex}::int[])`;
      params.push(`{${employee_ids}}`);
      paramIndex++;
    }

    query += ' ORDER BY vew.full_name';

    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Error in GET /employees/availability:', error);
    next(error);
  }
});
module.exports = router;