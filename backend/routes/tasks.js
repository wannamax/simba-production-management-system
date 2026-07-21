const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const CodeGenerator = require('../utils/codeGenerator');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const ExcelJS = require('exceljs');

// Configure multer for CSV upload
const upload = multer({
  dest: 'uploads/csv/',
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /\.(csv|xlsx)$/i.test(file.originalname);
    cb(allowed ? null : new Error('Chỉ hỗ trợ file .csv hoặc .xlsx'), allowed);
  },
});


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

const validateTask = [
  body('project_id').isInt().withMessage('Dự án không hợp lệ'),
  body('task_type').notEmpty().withMessage('Loại nhiệm vụ không được trống'),
  body('task_name').notEmpty().withMessage('Tên nhiệm vụ không được trống'),
];

// ==================== TASKS CRUD ====================

// GET all tasks with filters
// GET all tasks with filters (FIXED)
router.get('/', async (req, res, next) => {
  try {
    const {
      project_id,
      task_type,
      status,
      is_overdue,
      is_archived,
      employee_id,
    } = req.query;

    let query = `
      SELECT t.*, p.project_name, p.project_code, c.company_name
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      LEFT JOIN customers c ON p.customer_id = c.id
      WHERE t.deleted_at IS NULL  
        AND p.deleted_at IS NULL
    `;
    
    const params = [];
    let paramIndex = 1;

    if (project_id) {
      query += ` AND t.project_id = $${paramIndex}`;
      params.push(project_id);
      paramIndex++;
    }

    if (task_type) {
      query += ` AND t.task_type = $${paramIndex}`;
      params.push(task_type);
      paramIndex++;
    }

    if (status) {
      query += ` AND t.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (is_overdue === 'true') {
      query += ` AND t.is_overdue = TRUE`;
    }

    if (is_archived === 'true') {
      query += ` AND t.is_archived = TRUE`;
    } else {
      query += ` AND (t.is_archived = FALSE OR t.is_archived IS NULL)`;
    }

    if (employee_id) {
      query += ` AND EXISTS (
        SELECT 1 FROM task_assignments ta 
        WHERE ta.task_id = t.id 
          AND ta.employee_id = $${paramIndex} 
          AND ta.is_active = TRUE
      )`;
      params.push(employee_id);
      paramIndex++;
    }

    query += ' ORDER BY t.created_at DESC';

    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Error in GET /tasks:', error);
    next(error);
  }
});

// GET single task with full details
router.get('/:id', async (req, res, next) => {
  try {
    // Task basic info
    const taskResult = await pool.query(
      `SELECT t.*, p.project_name, p.project_code, c.company_name
       FROM tasks t
       JOIN projects p ON t.project_id = p.id
       LEFT JOIN customers c ON p.customer_id = c.id
       WHERE t.id = $1`,
      [req.params.id]
    );

    if (taskResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy nhiệm vụ',
      });
    }

    const task = taskResult.rows[0];

    // Get locations
    const locations = await pool.query(
      'SELECT * FROM task_locations WHERE task_id = $1 ORDER BY display_order, installation_date',
      [req.params.id]
    );

    // Get assigned employees
    const assignments = await pool.query(
      `SELECT ta.*, e.full_name, e.phone, e.position, e.department
       FROM task_assignments ta
       JOIN employees e ON ta.employee_id = e.id
       WHERE ta.task_id = $1 AND ta.is_active = TRUE`,
      [req.params.id]
    );

    // Get reports
    const reports = await pool.query(
      `SELECT tr.*, e.full_name as employee_name, tl.location_name
       FROM task_reports tr
       JOIN employees e ON tr.employee_id = e.id
       LEFT JOIN task_locations tl ON tr.task_location_id = tl.id
       WHERE tr.task_id = $1
       ORDER BY tr.report_date DESC
       LIMIT 20`,
      [req.params.id]
    );

    res.json({
      success: true,
      data: {
        ...task,
        locations: locations.rows,
        assignments: assignments.rows,
        reports: reports.rows,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST create new task
router.post('/', validateTask, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array(),
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const {
      project_id,
      task_type,
      task_name,
      description,
      start_date,
      end_date,
      estimated_duration,
      estimated_hours,
      priority,
      notify_before_days,
      notes,
    } = req.body;

    await ensureActiveCatalog('TASK_TYPE', task_type);
    // Generate task code
    const taskCode = await CodeGenerator.generateTaskCode(task_type);

    const result = await client.query(
      `INSERT INTO tasks (
        task_code, project_id, task_type, task_name, description,
        start_date, end_date, estimated_duration, estimated_hours,
        priority, notify_before_days, notes, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        taskCode,
        project_id,
        task_type,
        task_name,
        description,
        start_date,
        end_date,
        estimated_duration,
        estimated_hours,
        priority || 'Trung bình',
        notify_before_days || 1,
        notes,
        req.user?.id || 1,
      ]
    );

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Tạo nhiệm vụ thành công',
      data: result.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// PUT update task
router.put('/:id', validateTask, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array(),
    });
  }

  try {
    const {
      project_id,
      task_type,
      task_name,
      description,
      start_date,
      end_date,
      estimated_duration,
      estimated_hours,
      status,
      progress,
      priority,
      notify_before_days,
      notes,
    } = req.body;

    await ensureActiveCatalog('TASK_TYPE', task_type);
    const result = await pool.query(
      `UPDATE tasks SET
        project_id = $1,
        task_type = $2,
        task_name = $3,
        description = $4,
        start_date = $5,
        end_date = $6,
        estimated_duration = $7,
        estimated_hours = $8,
        status = $9,
        progress = $10,
        priority = $11,
        notify_before_days = $12,
        notes = $13,
        updated_at = NOW()
      WHERE id = $14
      RETURNING *`,
      [
        project_id,
        task_type,
        task_name,
        description,
        start_date,
        end_date,
        estimated_duration,
        estimated_hours,
        status,
        progress,
        priority,
        notify_before_days,
        notes,
        req.params.id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy nhiệm vụ',
      });
    }

    res.json({
      success: true,
      message: 'Cập nhật nhiệm vụ thành công',
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
});

// PATCH complete task
router.patch('/:id/complete', async (req, res, next) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE tasks SET
        status = 'Hoàn thành',
        progress = 100,
        is_completed = TRUE,
        completed_at = NOW(),
        completed_by = $1,
        actual_end_date = CURRENT_DATE,
        updated_at = NOW()
      WHERE id = $2
      RETURNING *`,
      [req.user?.id || 1, req.params.id]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy nhiệm vụ',
      });
    }

    // Create notification
    await client.query(
      `INSERT INTO task_notifications (
        task_id, notification_type, title, message, priority
      ) VALUES ($1, $2, $3, $4, $5)`,
      [
        req.params.id,
        'Hoàn thành',
        'Nhiệm vụ đã hoàn thành',
        `Nhiệm vụ "${result.rows[0].task_name}" đã được đánh dấu hoàn thành`,
        'Normal',
      ]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Đánh dấu hoàn thành thành công',
      data: result.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// PATCH archive task
router.patch('/:id/archive', async (req, res, next) => {
  try {
    const result = await pool.query(
      `UPDATE tasks SET
        is_archived = TRUE,
        archived_at = NOW(),
        archived_by = $1,
        updated_at = NOW()
      WHERE id = $2
      RETURNING *`,
      [req.user?.id || 1, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy nhiệm vụ',
      });
    }

    res.json({
      success: true,
      message: 'Lưu trữ nhiệm vụ thành công',
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
});

// DELETE task
// DELETE task (Soft Delete)
router.delete('/:id', async (req, res, next) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const taskId = req.params.id;
    const userId = req.user?.id || 1;
    
    // Check if task exists and not deleted
    const checkResult = await client.query(
      'SELECT id, task_name, task_code, status, deleted_at FROM tasks WHERE id = $1',
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
    
    if (task.deleted_at) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Nhiệm vụ đã được xóa trước đó'
      });
    }
    
    // Soft delete task
    const result = await client.query(
      `UPDATE tasks 
       SET deleted_at = NOW(), 
           deleted_by = $1,
           status = 'Hủy',
           updated_at = NOW()
       WHERE id = $2 
       RETURNING *`,
      [userId, taskId]
    );
    
    // Count deactivated assignments (trigger sẽ tự động làm)
    const countResult = await client.query(
      `SELECT COUNT(*) as count 
       FROM task_assignments 
       WHERE task_id = $1 AND is_active = FALSE`,
      [taskId]
    );
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: `Xóa nhiệm vụ "${task.task_name}" thành công. Đã giải phóng ${countResult.rows[0].count} nhân viên.`,
      data: {
        task: result.rows[0],
        freed_employees_count: parseInt(countResult.rows[0].count)
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// ==================== TASK LOCATIONS ====================

// POST add location manually
router.post('/:id/locations', async (req, res, next) => {
  try {
    const {
      location_name,
      location_address,
      location_city,
      location_district,
      contact_person,
      contact_phone,
      installation_date,
      installation_time_start,
      installation_time_end,
      estimated_hours,
      product_info,
      work_description,
      notes,
    } = req.body;

    const result = await pool.query(
      `INSERT INTO task_locations (
        task_id, location_name, location_address, location_city, location_district,
        contact_person, contact_phone, installation_date,
        installation_time_start, installation_time_end, estimated_hours,
        product_info, work_description, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        req.params.id,
        location_name,
        location_address,
        location_city,
        location_district,
        contact_person,
        contact_phone,
        installation_date,
        installation_time_start,
        installation_time_end,
        estimated_hours,
        product_info,
        work_description,
        notes,
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Thêm địa điểm thành công',
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
});

// POST import locations from CSV
router.post('/:id/locations/import', upload.single('file'), async (req, res, next) => {
  const client = await pool.connect();

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng upload file CSV',
      });
    }

    await client.query('BEGIN');

    const locations = [];
    const errors = [];

    // Read CSV file
    await new Promise((resolve, reject) => {
      fs.createReadStream(req.file.path)
        .pipe(csv())
        .on('data', (row) => {
          // Validate required fields
          if (!row.location_name || !row.location_address) {
            errors.push({
              row,
              message: 'Thiếu tên hoặc địa chỉ địa điểm',
            });
            return;
          }

          locations.push({
            location_name: row.location_name,
            location_address: row.location_address,
            location_city: row.location_city || '',
            location_district: row.location_district || '',
            contact_person: row.contact_person || '',
            contact_phone: row.contact_phone || '',
            installation_date: row.installation_date || null,
            installation_time_start: row.installation_time_start || null,
            installation_time_end: row.installation_time_end || null,
            estimated_hours: parseFloat(row.estimated_hours) || 0,
            product_info: row.product_info || '',
            work_description: row.work_description || '',
            notes: row.notes || '',
          });
        })
        .on('end', resolve)
        .on('error', reject);
    });

    // Delete uploaded file
    fs.unlinkSync(req.file.path);

    if (locations.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'File CSV không có dữ liệu hợp lệ',
        errors,
      });
    }

    // Insert locations
    const insertedLocations = [];
    for (const loc of locations) {
      const result = await client.query(
        `INSERT INTO task_locations (
          task_id, location_name, location_address, location_city, location_district,
          contact_person, contact_phone, installation_date,
          installation_time_start, installation_time_end, estimated_hours,
          product_info, work_description, notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *`,
        [
          req.params.id,
          loc.location_name,
          loc.location_address,
          loc.location_city,
          loc.location_district,
          loc.contact_person,
          loc.contact_phone,
          loc.installation_date,
          loc.installation_time_start,
          loc.installation_time_end,
          loc.estimated_hours,
          loc.product_info,
          loc.work_description,
          loc.notes,
        ]
      );
      insertedLocations.push(result.rows[0]);
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `Import thành công ${insertedLocations.length} địa điểm`,
      data: insertedLocations,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    // Clean up file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    next(error);
  } finally {
    client.release();
  }
});



// POST import locations from Excel (.xlsx)
router.post('/:id/locations/import-excel', upload.single('file'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Vui lòng upload file Excel .xlsx' });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(req.file.path);
    const sheet = workbook.worksheets[0];
    if (!sheet) return res.status(400).json({ success: false, message: 'File Excel không có worksheet' });
    const headers = {};
    sheet.getRow(1).eachCell((cell, col) => { headers[String(cell.value || '').trim()] = col; });
    const required = ['location_name', 'location_address'];
    for (const h of required) if (!headers[h]) return res.status(400).json({ success: false, message: `Thiếu cột ${h}` });
    const fields = ['location_name','location_address','location_city','location_district','contact_person','contact_phone','installation_date','installation_time_start','installation_time_end','estimated_hours','product_info','work_description','notes'];
    const rows = [];
    sheet.eachRow((row, n) => {
      if (n === 1) return;
      const item = {};
      for (const f of fields) item[f] = headers[f] ? row.getCell(headers[f]).value : null;
      if (item.location_name && item.location_address) rows.push(item);
    });
    if (!rows.length) return res.status(400).json({ success: false, message: 'File Excel không có dữ liệu hợp lệ' });
    await client.query('BEGIN');
    const inserted = [];
    for (const loc of rows) {
      const result = await client.query(`INSERT INTO task_locations (
        task_id, location_name, location_address, location_city, location_district,
        contact_person, contact_phone, installation_date, installation_time_start,
        installation_time_end, estimated_hours, product_info, work_description, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`, [
        req.params.id, loc.location_name, loc.location_address, loc.location_city || '', loc.location_district || '',
        loc.contact_person || '', loc.contact_phone || '', loc.installation_date || null,
        loc.installation_time_start || null, loc.installation_time_end || null,
        Number(loc.estimated_hours) || 0, loc.product_info || '', loc.work_description || '', loc.notes || ''
      ]);
      inserted.push(result.rows[0]);
    }
    await client.query('COMMIT');
    res.json({ success: true, message: `Import thành công ${inserted.length} địa điểm từ Excel`, data: inserted });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    next(error);
  } finally {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    client.release();
  }
});

// GET export locations to Excel (.xlsx)
router.get('/:id/locations-export.xlsx', async (req, res, next) => {
  try {
    const result = await pool.query(`SELECT location_name, location_address, location_city, location_district,
      contact_person, contact_phone, installation_date, installation_time_start, installation_time_end,
      estimated_hours, actual_hours, status, progress, product_info, work_description, notes
      FROM task_locations WHERE task_id = $1 ORDER BY display_order, installation_date, id`, [req.params.id]);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Dia diem');
    sheet.columns = [
      'location_name','location_address','location_city','location_district','contact_person','contact_phone',
      'installation_date','installation_time_start','installation_time_end','estimated_hours','actual_hours',
      'status','progress','product_info','work_description','notes'
    ].map(key => ({ header: key, key, width: 20 }));
    result.rows.forEach(row => sheet.addRow(row));
    sheet.getRow(1).font = { bold: true };
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="task-${req.params.id}-locations.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) { next(error); }
});

// PUT update location
router.put('/:taskId/locations/:locationId', async (req, res, next) => {
  try {
    const {
      location_name,
      location_address,
      location_city,
      location_district,
      contact_person,
      contact_phone,
      installation_date,
      installation_time_start,
      installation_time_end,
      estimated_hours,
      actual_hours,
      status,
      progress,
      product_info,
      work_description,
      notes,
      issues,
    } = req.body;

    const result = await pool.query(
      `UPDATE task_locations SET
        location_name = $1,
        location_address = $2,
        location_city = $3,
        location_district = $4,
        contact_person = $5,
        contact_phone = $6,
        installation_date = $7,
        installation_time_start = $8,
        installation_time_end = $9,
        estimated_hours = $10,
        actual_hours = $11,
        status = $12,
        progress = $13,
        product_info = $14,
        work_description = $15,
        notes = $16,
        issues = $17,
        updated_at = NOW()
      WHERE id = $18 AND task_id = $19
      RETURNING *`,
      [
        location_name,
        location_address,
        location_city,
        location_district,
        contact_person,
        contact_phone,
        installation_date,
        installation_time_start,
        installation_time_end,
        estimated_hours,
        actual_hours,
        status,
        progress,
        product_info,
        work_description,
        notes,
        issues,
        req.params.locationId,
        req.params.taskId,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy địa điểm',
      });
    }

    res.json({
      success: true,
      message: 'Cập nhật địa điểm thành công',
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
});

// PATCH complete location
router.patch('/:taskId/locations/:locationId/complete', async (req, res, next) => {
  try {
    const result = await pool.query(
      `UPDATE task_locations SET
        status = 'Hoàn thành',
        progress = 100,
        is_completed = TRUE,
        completed_at = NOW(),
        updated_at = NOW()
      WHERE id = $1 AND task_id = $2
      RETURNING *`,
      [req.params.locationId, req.params.taskId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy địa điểm',
      });
    }

    res.json({
      success: true,
      message: 'Đánh dấu hoàn thành địa điểm',
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
});

// DELETE location
router.delete('/:taskId/locations/:locationId', async (req, res, next) => {
  try {
    const result = await pool.query(
      'DELETE FROM task_locations WHERE id = $1 AND task_id = $2 RETURNING *',
      [req.params.locationId, req.params.taskId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy địa điểm',
      });
    }

    res.json({
      success: true,
      message: 'Xóa địa điểm thành công',
    });
  } catch (error) {
    next(error);
  }
});

// ==================== TASK ASSIGNMENTS ====================

// POST assign employee to task
router.post('/:id/assignments', async (req, res, next) => {
  try {
    const { employee_id, role_in_task, start_date, end_date, notes } = req.body;

    // Check if employee is in project team
    const checkResult = await pool.query(
      `SELECT 1 FROM project_assignments pa
       JOIN tasks t ON pa.project_id = t.project_id
       WHERE t.id = $1 AND pa.employee_id = $2`,
      [req.params.id, employee_id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Nhân viên không thuộc đội ngũ dự án này',
      });
    }

    const result = await pool.query(
      `INSERT INTO task_assignments (
        task_id, employee_id, role_in_task, start_date, end_date, notes, assigned_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (task_id, employee_id)
      DO UPDATE SET
        role_in_task = EXCLUDED.role_in_task,
        start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        notes = EXCLUDED.notes,
        is_active = TRUE
      RETURNING *`,
      [
        req.params.id,
        employee_id,
        role_in_task,
        start_date,
        end_date,
        notes,
        req.user?.id || 1,
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Phân công nhân viên thành công',
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
});

// DELETE remove employee from task
router.delete('/:taskId/assignments/:assignmentId', async (req, res, next) => {
  try {
    const result = await pool.query(
      `UPDATE task_assignments SET is_active = FALSE
       WHERE id = $1 AND task_id = $2
       RETURNING *`,
      [req.params.assignmentId, req.params.taskId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy phân công',
      });
    }

    res.json({
      success: true,
      message: 'Xóa phân công thành công',
    });
  } catch (error) {
    next(error);
  }
});

// ==================== TASK NOTIFICATIONS ====================

// GET unread notifications
router.get('/notifications/unread', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT tn.*, t.task_name, t.task_code, p.project_name
       FROM task_notifications tn
       JOIN tasks t ON tn.task_id = t.id
       JOIN projects p ON t.project_id = p.id
       WHERE tn.is_read = FALSE
       ORDER BY tn.created_at DESC
       LIMIT 50`
    );

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    next(error);
  }
});

// PATCH mark notification as read
router.patch('/notifications/:id/read', async (req, res, next) => {
  try {
    const result = await pool.query(
      `UPDATE task_notifications SET
        is_read = TRUE,
        read_at = NOW()
      WHERE id = $1
      RETURNING *`,
      [req.params.id]
    );

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
});
// ==================== TASK REPORT STATISTICS ====================

// GET task report statistics (for chart)
router.get('/:id/report-statistics', async (req, res, next) => {
  try {
    const { from_date, to_date, status } = req.query;
    const taskId = req.params.id;

    // Build query for daily statistics
    let query = `
      WITH date_series AS (
        SELECT generate_series(
          COALESCE($2::date, (SELECT start_date FROM tasks WHERE id = $1)),
          COALESCE($3::date, (SELECT end_date FROM tasks WHERE id = $1)),
          '1 day'::interval
        )::date AS report_date
      ),
      location_stats AS (
        SELECT 
          DATE(installation_date) as report_date,
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'Hoàn thành') as completed,
          COUNT(*) FILTER (WHERE status = 'Đang lắp đặt') as in_progress,
          COUNT(*) FILTER (WHERE status = 'Chưa bắt đầu') as not_started
        FROM task_locations
        WHERE task_id = $1
          AND installation_date IS NOT NULL
        GROUP BY DATE(installation_date)
      )
      SELECT 
        ds.report_date,
        COALESCE(ls.total, 0) as total,
        COALESCE(ls.completed, 0) as completed,
        COALESCE(ls.in_progress, 0) as in_progress,
        COALESCE(ls.not_started, 0) as not_started
      FROM date_series ds
      LEFT JOIN location_stats ls ON ds.report_date = ls.report_date
      ORDER BY ds.report_date
    `;

    const params = [taskId, from_date, to_date];
    const result = await pool.query(query, params);

    // Get summary statistics
    const summaryQuery = `
      SELECT 
        COUNT(*) as total_locations,
        COUNT(*) FILTER (WHERE is_completed = true) as completed_locations,
        COUNT(*) FILTER (WHERE status = 'Đang lắp đặt') as in_progress_locations,
        COUNT(*) FILTER (WHERE status = 'Chưa bắt đầu') as not_started_locations,
        SUM(estimated_hours) as total_estimated_hours,
        SUM(actual_hours) as total_actual_hours
      FROM task_locations
      WHERE task_id = $1
    `;

    const summaryResult = await pool.query(summaryQuery, [taskId]);

    res.json({
      success: true,
      data: {
        daily_stats: result.rows,
        summary: summaryResult.rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET task locations report (for table and CSV export)
router.get('/:id/locations-report', async (req, res, next) => {
  try {
    const { from_date, to_date, status, sort_by = 'installation_date', sort_order = 'ASC' } = req.query;
    const taskId = req.params.id;

    let query = `
      SELECT 
        tl.id,
        tl.location_name,
        tl.location_address,
        tl.location_city,
        tl.location_district,
        tl.location_ward,
        tl.contact_person,
        tl.contact_phone,
        tl.installation_date,
        tl.installation_time_start,
        tl.installation_time_end,
        tl.estimated_hours,
        tl.actual_hours,
        tl.status,
        tl.progress,
        tl.product_info,
        tl.work_description,
        tl.notes,
        tl.issues,
        tl.is_completed,
        tl.completed_at,
        array_agg(
          DISTINCT jsonb_build_object(
            'employee_id', e.id,
            'employee_name', e.full_name,
            'role', tla.role
          )
        ) FILTER (WHERE e.id IS NOT NULL) as assigned_employees
      FROM task_locations tl
      LEFT JOIN task_location_assignments tla ON tl.id = tla.task_location_id
      LEFT JOIN employees e ON tla.employee_id = e.id
      WHERE tl.task_id = $1
    `;

    const params = [taskId];
    let paramIndex = 2;

    // Filter by date range
    if (from_date) {
      query += ` AND tl.installation_date >= $${paramIndex}`;
      params.push(from_date);
      paramIndex++;
    }

    if (to_date) {
      query += ` AND tl.installation_date <= $${paramIndex}`;
      params.push(to_date);
      paramIndex++;
    }

    // Filter by status
    if (status && status !== 'all') {
      query += ` AND tl.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    query += `
      GROUP BY tl.id
    `;

    // Sorting
    const allowedSortFields = ['installation_date', 'status', 'progress', 'location_name'];
    const sortField = allowedSortFields.includes(sort_by) ? sort_by : 'installation_date';
    const sortDirection = sort_order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    
    query += ` ORDER BY tl.${sortField} ${sortDirection}`;

    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    next(error);
  }
});
// ==================== TASK PAUSE/RESUME/CANCEL ====================

// PATCH pause task
router.patch('/:id/pause', async (req, res, next) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { pause_reason } = req.body;
    const taskId = req.params.id;
    const userId = req.user?.id || 1;
    
    // Check if task can be paused
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
        message: 'Không thể tạm dừng nhiệm vụ đã hoàn thành'
      });
    }
    
    if (task.status === 'Tạm dừng') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Nhiệm vụ đã được tạm dừng'
      });
    }
    
    // Pause task
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
    
    // Deactivate all assignments (will be done by trigger)
    // But we'll do it explicitly for clarity
    await client.query(
      `UPDATE task_assignments 
       SET is_active = FALSE 
       WHERE task_id = $1`,
      [taskId]
    );
    
    // Create notification
    await client.query(
      `INSERT INTO task_notifications (
        task_id, notification_type, title, message, priority
      ) VALUES ($1, $2, $3, $4, $5)`,
      [
        taskId,
        'Tạm dừng',
        'Nhiệm vụ đã tạm dừng',
        `Nhiệm vụ "${task.task_name}" đã được tạm dừng. Lý do: ${pause_reason || 'Không có'}`,
        'High'
      ]
    );
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: 'Tạm dừng nhiệm vụ thành công. Nhân viên đã được giải phóng.',
      data: result.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// PATCH resume task
router.patch('/:id/resume', async (req, res, next) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const taskId = req.params.id;
    
    // Check if task is paused
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
    
    if (!task.is_paused || task.status !== 'Tạm dừng') {
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
    
    // Reactivate all assignments
    await client.query(
      `UPDATE task_assignments 
       SET is_active = TRUE 
       WHERE task_id = $1`,
      [taskId]
    );
    
    // Create notification
    await client.query(
      `INSERT INTO task_notifications (
        task_id, notification_type, title, message, priority
      ) VALUES ($1, $2, $3, $4, $5)`,
      [
        taskId,
        'Tiếp tục',
        'Nhiệm vụ đã tiếp tục',
        `Nhiệm vụ "${task.task_name}" đã được tiếp tục`,
        'Normal'
      ]
    );
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: 'Tiếp tục nhiệm vụ thành công. Nhân viên đã được gán lại.',
      data: result.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// PATCH cancel task
router.patch('/:id/cancel', async (req, res, next) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { cancel_reason } = req.body;
    const taskId = req.params.id;
    const userId = req.user?.id || 1;
    
    // Check if task can be cancelled
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
    
    // Deactivate all assignments
    await client.query(
      `UPDATE task_assignments 
       SET is_active = FALSE 
       WHERE task_id = $1`,
      [taskId]
    );
    
    // Cancel all pending locations
    await client.query(
      `UPDATE task_locations 
       SET status = 'Hủy',
           notes = CONCAT(COALESCE(notes, ''), ' [Hủy: ', $1, ']')
       WHERE task_id = $2 
         AND status IN ('Chưa bắt đầu', 'Đang lắp đặt')`,
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

// GET employee availability (updated to exclude paused/cancelled tasks)
router.get('/employees/availability', async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT * FROM v_employee_active_workload
      ORDER BY full_name
    `);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
