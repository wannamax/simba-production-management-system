const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const CodeGenerator = require('../utils/codeGenerator');

async function ensureProjectRole(db, role) {
  const value = String(role || '').trim();
  if (!value) throw Object.assign(new Error('Vui lòng chọn vai trò trong dự án'), { status:400 });
  const result = await db.query(
    `SELECT 1 FROM system_catalogs WHERE catalog_type='PROJECT_ROLE' AND name=$1 AND is_active=true`,
    [value]
  );
  if (!result.rowCount) throw Object.assign(new Error('Vai trò không hợp lệ hoặc đã ngừng sử dụng'), { status:400 });
  return value;
}

// GET all projects
router.get('/', async (req, res) => {
  try {
    const { status, page = 1, limit = 20, search, project_type } = req.query;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT p.*, c.company_name, c.contact_person, c.phone as customer_phone,
        COALESCE((SELECT SUM(a.actual_cost) FROM v_project_material_actuals a WHERE a.project_id=p.id),0) AS actual_material_cost
      FROM projects p
      LEFT JOIN customers c ON p.customer_id = c.id
      WHERE p.deleted_at IS NULL
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
      `SELECT p.*, c.company_name, c.contact_person, c.phone as customer_phone,
        COALESCE((SELECT SUM(a.actual_cost) FROM v_project_material_actuals a WHERE a.project_id=p.id),0) AS actual_material_cost`,
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
      SELECT p.*, c.company_name, c.contact_person, c.phone as customer_phone,
        COALESCE((SELECT SUM(a.actual_cost) FROM v_project_material_actuals a WHERE a.project_id=p.id),0) AS actual_material_cost
      FROM projects p
      LEFT JOIN customers c ON p.customer_id = c.id
      WHERE p.id = $1
    `, [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy dự án' });
    }
    
    const employees = await pool.query(`
      SELECT pa.*, e.full_name, e.phone, e.position, e.department
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
    
    const projectCode = await CodeGenerator.generateProjectCode(client);
    
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
        start_date = $4, end_date = $5, status = COALESCE($6,status), priority = $7,
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
  const client = await pool.connect();
  try {
    const { employee_id, role, notes } = req.body;
    await client.query('BEGIN');
    const validRole = await ensureProjectRole(client, role);
    const employee = await client.query(`SELECT 1 FROM employees WHERE id=$1 AND status='Hoạt động'`, [employee_id]);
    if (!employee.rowCount) throw Object.assign(new Error('Nhân viên không hợp lệ hoặc đã ngừng hoạt động'), { status:400 });
    const existing = await client.query(
      'SELECT id FROM project_assignments WHERE project_id=$1 AND employee_id=$2 ORDER BY id LIMIT 1',
      [req.params.id,employee_id]
    );
    const result = existing.rowCount
      ? await client.query(
        'UPDATE project_assignments SET role=$1,notes=$2 WHERE id=$3 RETURNING *',
        [validRole,notes || null,existing.rows[0].id]
      )
      : await client.query(
        `INSERT INTO project_assignments(project_id,employee_id,role,notes)
         VALUES($1,$2,$3,$4) RETURNING *`,
        [req.params.id,employee_id,validRole,notes || null]
      );
    await client.query('COMMIT');
    res.status(existing.rowCount ? 200 : 201).json({
      success: true,
      message: existing.rowCount ? 'Đã cập nhật vai trò nhân viên' : 'Phân công nhân viên thành công',
      data: result.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.status) return res.status(error.status).json({ success:false, message:error.message });
    next(error);
  } finally { client.release(); }
});

// PUT update employee assignment
router.put('/:projectId/assignments/:assignmentId', async (req, res, next) => {
  try {
    const { role, notes } = req.body;
    const validRole = await ensureProjectRole(pool, role);
    const result = await pool.query(
      `UPDATE project_assignments 
       SET role = $1, notes = $2
       WHERE id = $3 AND project_id = $4
       RETURNING *`,
      [validRole, notes || null, req.params.assignmentId, req.params.projectId]
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
    const assignment = await pool.query(
      'SELECT employee_id FROM project_assignments WHERE id=$1 AND project_id=$2',
      [req.params.assignmentId,req.params.projectId]
    );
    if (!assignment.rowCount) return res.status(404).json({ success:false, message:'Không tìm thấy phân công' });
    const used = await pool.query(
      `SELECT
        (SELECT count(*)::int FROM task_assignments ta JOIN tasks t ON t.id=ta.task_id
         WHERE t.project_id=$1 AND ta.employee_id=$2 AND ta.is_active=true
           AND t.deleted_at IS NULL AND t.status NOT IN ('Hủy','Hoàn thành','Lưu trữ')) active_tasks,
        (SELECT count(*)::int FROM schedule_assignments sa JOIN schedules s ON s.id=sa.schedule_id
         WHERE s.project_id=$1 AND sa.employee_id=$2 AND s.status NOT IN ('Hoàn thành','Hủy')) active_schedules`,
      [req.params.projectId,assignment.rows[0].employee_id]
    );
    if (used.rows[0].active_tasks || used.rows[0].active_schedules) {
      return res.status(409).json({
        success:false,
        message:`Nhân viên còn ${used.rows[0].active_tasks} Task và ${used.rows[0].active_schedules} lịch trình đang hoạt động. Hãy gỡ hoặc chuyển phân công trước.`
      });
    }
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

router.post('/:id/products', async (req, res, next) => {
  try {
    const { product_type,product_name,specifications,quantity=1,unit='Cái',unit_price=0,production_status='Chưa sản xuất',notes } = req.body;
    if (!String(product_name || '').trim()) return res.status(400).json({ success:false, message:'Tên sản phẩm không được trống' });
    const result = await pool.query(
      `INSERT INTO project_products(project_id,product_type,product_name,specifications,quantity,unit,unit_price,total_price,production_status,notes)
       VALUES($1,$2,$3,$4,$5::integer,$6,$7::numeric,($5::integer)*($7::numeric),$8,$9) RETURNING *`,
      [req.params.id,product_type || null,String(product_name).trim(),specifications || null,Number(quantity)||1,unit || 'Cái',Number(unit_price)||0,production_status,notes || null]
    );
    res.status(201).json({ success:true, data:result.rows[0], message:'Đã thêm sản phẩm' });
  } catch (error) { next(error); }
});

router.put('/:projectId/products/:productId', async (req, res, next) => {
  try {
    const { product_type,product_name,specifications,quantity=1,unit='Cái',unit_price=0,production_status='Chưa sản xuất',notes } = req.body;
    if (!String(product_name || '').trim()) return res.status(400).json({ success:false, message:'Tên sản phẩm không được trống' });
    const result = await pool.query(
      `UPDATE project_products SET product_type=$1,product_name=$2,specifications=$3,quantity=$4,unit=$5,
        unit_price=$6::numeric,total_price=($4::integer)*($6::numeric),production_status=$7,notes=$8
       WHERE id=$9 AND project_id=$10 RETURNING *`,
      [product_type || null,String(product_name).trim(),specifications || null,Number(quantity)||1,unit || 'Cái',Number(unit_price)||0,production_status,notes || null,req.params.productId,req.params.projectId]
    );
    if (!result.rowCount) return res.status(404).json({ success:false, message:'Không tìm thấy sản phẩm' });
    res.json({ success:true, data:result.rows[0], message:'Đã cập nhật sản phẩm' });
  } catch (error) { next(error); }
});

router.delete('/:projectId/products/:productId', async (req, res, next) => {
  try {
    const result = await pool.query(
      'DELETE FROM project_products WHERE id=$1 AND project_id=$2 RETURNING id',
      [req.params.productId,req.params.projectId]
    );
    if (!result.rowCount) return res.status(404).json({ success:false, message:'Không tìm thấy sản phẩm' });
    res.json({ success:true, message:'Đã xóa sản phẩm' });
  } catch (error) { next(error); }
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
