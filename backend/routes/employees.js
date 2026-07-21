const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const CodeGenerator = require('../utils/codeGenerator');
const { body, validationResult } = require('express-validator');


async function ensureActiveCatalog(catalogType, name) {
  const result = await pool.query(
    'SELECT 1 FROM system_catalogs WHERE catalog_type=$1 AND name=$2 AND is_active=true',
    [catalogType, name]
  );
  if (!result.rowCount) {
    const error = new Error(`Giá trị “${name}” không tồn tại hoặc đã ngừng sử dụng trong danh mục ${catalogType}`);
    error.status = 400;
    throw error;
  }
}

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

// GET employee availability with real filters
// IMPORTANT: this route must be declared before /:id.
router.get('/availability', async (req, res, next) => {
  try {
    const parseIdList = (value, fieldName) => {
      if (!value) return null;
      const ids = String(value)
        .split(',')
        .map((item) => Number.parseInt(item.trim(), 10));

      if (ids.length === 0 || ids.some((id) => !Number.isInteger(id) || id <= 0)) {
        const error = new Error(`${fieldName} không hợp lệ`);
        error.status = 400;
        throw error;
      }
      return [...new Set(ids)];
    };

    const employeeIds = parseIdList(req.query.employee_ids, 'Danh sách nhân viên');
    const projectIds = parseIdList(req.query.project_ids, 'Danh sách dự án');
    const startDate = req.query.start_date || new Date().toISOString().slice(0, 10);
    const endDate = req.query.end_date || startDate;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return res.status(400).json({
        success: false,
        message: 'Ngày bắt đầu hoặc ngày kết thúc không hợp lệ',
      });
    }

    if (startDate > endDate) {
      return res.status(400).json({
        success: false,
        message: 'Ngày bắt đầu không được lớn hơn ngày kết thúc',
      });
    }

    const query = `
      WITH date_capacity AS (
        SELECT (COUNT(*) FILTER (WHERE EXTRACT(ISODOW FROM day) <= 5) * 8)::numeric AS available_hours
        FROM generate_series($1::date, $2::date, interval '1 day') AS day
      ),
      workload_rows AS (
        SELECT
          ta.employee_id,
          t.id AS task_id,
          t.task_name,
          t.task_type,
          t.start_date,
          t.end_date,
          t.status AS task_status,
          p.id AS project_id,
          p.project_name,
          p.project_code,
          p.status AS project_status,
          p.start_date AS project_start_date,
          p.end_date AS project_end_date,
          COALESCE(pa.role, ta.role_in_task, 'Thành viên') AS role,
          CASE
            WHEN COALESCE(ta.total_hours, 0) > 0 THEN ta.total_hours
            WHEN COALESCE(t.estimated_hours, 0) > 0 THEN
              t.estimated_hours / GREATEST((
                SELECT COUNT(*)
                FROM task_assignments active_ta
                WHERE active_ta.task_id = t.id AND active_ta.is_active = TRUE
              ), 1)
            ELSE 0
          END::numeric AS assigned_hours
        FROM task_assignments ta
        JOIN tasks t ON t.id = ta.task_id
        JOIN projects p ON p.id = t.project_id
        LEFT JOIN project_assignments pa
          ON pa.project_id = p.id AND pa.employee_id = ta.employee_id
        WHERE ta.is_active = TRUE
          AND COALESCE(t.is_archived, FALSE) = FALSE
          AND t.status NOT IN ('Tạm dừng', 'Hủy', 'Hoàn thành', 'Lưu trữ')
          AND p.deleted_at IS NULL
          AND p.status NOT IN ('Hoàn thành', 'Hủy', 'Lưu trữ')
          AND COALESCE(ta.start_date, t.start_date, p.start_date, $1::date) <= $2::date
          AND COALESCE(ta.end_date, t.end_date, p.end_date, $2::date) >= $1::date
          AND ($4::int[] IS NULL OR p.id = ANY($4::int[]))
      ),
      employee_totals AS (
        SELECT
          employee_id,
          COUNT(DISTINCT task_id)::int AS total_tasks,
          COUNT(DISTINCT project_id)::int AS total_projects,
          COALESCE(SUM(assigned_hours), 0)::numeric AS total_assigned_hours
        FROM workload_rows
        GROUP BY employee_id
      ),
      project_totals AS (
        SELECT
          employee_id,
          project_id,
          project_name,
          project_code,
          project_status,
          role,
          MIN(project_start_date) AS start_date,
          MAX(project_end_date) AS end_date,
          COUNT(DISTINCT task_id)::int AS task_count,
          COALESCE(SUM(assigned_hours), 0)::numeric AS assigned_hours
        FROM workload_rows
        GROUP BY employee_id, project_id, project_name, project_code, project_status, role
      )
      SELECT
        e.id,
        e.id AS employee_id,
        e.employee_code,
        e.full_name,
        e.department,
        e.position,
        e.phone,
        e.email,
        e.status,
        dc.available_hours,
        COALESCE(et.total_assigned_hours, 0) AS total_assigned_hours,
        CASE
          WHEN dc.available_hours > 0
            THEN ROUND((COALESCE(et.total_assigned_hours, 0) / dc.available_hours) * 100, 2)
          ELSE 0
        END AS workload_percentage,
        COALESCE(et.total_tasks, 0) AS total_tasks,
        COALESCE(et.total_projects, 0) AS total_projects,
        COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'project_id', pt.project_id,
              'project_name', pt.project_name,
              'project_code', pt.project_code,
              'project_status', pt.project_status,
              'role', pt.role,
              'task_count', pt.task_count,
              'assigned_hours', pt.assigned_hours,
              'start_date', pt.start_date,
              'end_date', pt.end_date,
              'is_overdue', CASE
                WHEN pt.end_date < CURRENT_DATE
                  AND pt.project_status NOT IN ('Hoàn thành', 'Hủy') THEN TRUE
                ELSE FALSE
              END
            ) ORDER BY pt.project_name
          )
          FROM project_totals pt
          WHERE pt.employee_id = e.id
        ), '[]'::jsonb) AS busy_projects,
        COALESCE((
          SELECT jsonb_agg(task_item ORDER BY task_item->>'start_date')
          FROM (
            SELECT DISTINCT jsonb_build_object(
              'task_id', wr.task_id,
              'task_name', wr.task_name,
              'task_type', wr.task_type,
              'project_id', wr.project_id,
              'project_name', wr.project_name,
              'start_date', wr.start_date,
              'end_date', wr.end_date,
              'status', wr.task_status
            ) AS task_item
            FROM workload_rows wr
            WHERE wr.employee_id = e.id
              AND COALESCE(wr.start_date, $1::date) >= CURRENT_DATE
            LIMIT 10
          ) upcoming
        ), '[]'::jsonb) AS upcoming_tasks
      FROM employees e
      CROSS JOIN date_capacity dc
      LEFT JOIN employee_totals et ON et.employee_id = e.id
      WHERE e.status = 'Hoạt động'
        AND ($3::int[] IS NULL OR e.id = ANY($3::int[]))
        AND ($4::int[] IS NULL OR EXISTS (
          SELECT 1 FROM workload_rows filtered_workload
          WHERE filtered_workload.employee_id = e.id
        ))
      ORDER BY e.full_name;
    `;

    const result = await pool.query(query, [startDate, endDate, employeeIds, projectIds]);

    res.json({
      success: true,
      data: result.rows,
      meta: {
        start_date: startDate,
        end_date: endDate,
        employee_ids: employeeIds || [],
        project_ids: projectIds || [],
        total: result.rows.length,
      },
    });
  } catch (error) {
    console.error('Error in GET /employees/availability:', error);
    if (error.status === 400) {
      return res.status(400).json({ success: false, message: error.message });
    }
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
    
    await ensureActiveCatalog('EMPLOYEE_POSITION', position);
    await ensureActiveCatalog('DEPARTMENT', department);
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
    
    await ensureActiveCatalog('EMPLOYEE_POSITION', position);
    await ensureActiveCatalog('DEPARTMENT', department);
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

module.exports = router;