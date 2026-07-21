const express = require('express');
const pool = require('../config/database');

const router = express.Router();
const priorities = new Set(['LOW', 'NORMAL', 'HIGH', 'URGENT']);
const statuses = new Set(['DRAFT', 'APPROVED', 'CANCELLED']);
const clean = value => typeof value === 'string' ? value.trim() : value;
const num = value => value === '' || value === null || value === undefined ? null : Number(value);
const fail = (res, status, message, details) => res.status(status).json({ success: false, message, ...(details ? { details } : {}) });

async function getRequirement(client, id, lock = false) {
  const result = await client.query(`SELECT r.*, m.material_code, COALESCE(m.name,m.material_name) AS material_name,
    m.base_unit_id AS material_base_unit_id, m.standard_cost, u.name AS unit_name, u.symbol AS unit_symbol,
    COALESCE((SELECT SUM(mr.reserved_quantity-mr.released_quantity) FROM material_reservations mr WHERE mr.requirement_id=r.id AND mr.status NOT IN ('RELEASED','CANCELLED')),0) AS reserved_quantity
    FROM project_material_requirements r
    JOIN materials m ON m.id=r.material_id
    JOIN material_units u ON u.id=r.base_unit_id
    WHERE r.id=$1 ${lock ? 'FOR UPDATE OF r' : ''}`, [id]);
  return result.rows[0];
}

async function refreshRequirementStatus(client, requirementId) {
  const row = await getRequirement(client, requirementId, true);
  if (!row || row.status === 'CANCELLED' || row.status === 'COMPLETED') return row;
  const reserved = Number(row.reserved_quantity || 0);
  const planned = Number(row.planned_quantity || 0);
  const status = reserved <= 0 ? (row.status === 'DRAFT' ? 'DRAFT' : 'APPROVED') : reserved + 1e-9 >= planned ? 'FULLY_RESERVED' : 'PARTIALLY_RESERVED';
  const result = await client.query('UPDATE project_material_requirements SET status=$1,updated_at=NOW() WHERE id=$2 RETURNING *', [status, requirementId]);
  return result.rows[0];
}

router.get('/projects/:projectId', async (req, res, next) => {
  try {
    const projectId = Number(req.params.projectId);
    const [project, requirements, warehouses] = await Promise.all([
      pool.query('SELECT id,project_code,project_name,start_date,end_date,status FROM projects WHERE id=$1', [projectId]),
      pool.query(`SELECT v.*,m.material_code,COALESCE(m.name,m.material_name) AS material_name,m.category_id,c.name AS category_name,
        u.name AS unit_name,u.symbol AS unit_symbol,t.task_name AS task_title,
        COALESCE((SELECT json_agg(json_build_object('id',mr.id,'warehouse_id',mr.warehouse_id,'warehouse_name',w.name,'reserved_quantity',mr.reserved_quantity,'released_quantity',mr.released_quantity,'available_reserved_quantity',mr.reserved_quantity-mr.released_quantity,'status',mr.status,'created_at',mr.created_at) ORDER BY mr.created_at DESC)
          FROM material_reservations mr JOIN warehouses w ON w.id=mr.warehouse_id WHERE mr.requirement_id=v.id),'[]'::json) AS reservations
        FROM v_project_material_planning v
        JOIN materials m ON m.id=v.material_id
        LEFT JOIN material_categories c ON c.id=m.category_id
        JOIN material_units u ON u.id=v.base_unit_id
        LEFT JOIN tasks t ON t.id=v.task_id
        WHERE v.project_id=$1 ORDER BY COALESCE(v.required_date,'9999-12-31'),m.material_code`, [projectId]),
      pool.query('SELECT id,warehouse_code,name,is_default FROM warehouses WHERE is_active=true ORDER BY is_default DESC,name')
    ]);
    if (!project.rowCount) return fail(res, 404, 'Không tìm thấy dự án');
    const rows = requirements.rows;
    const summary = rows.reduce((acc, row) => {
      acc.requirement_count += 1;
      acc.planned_cost += Number(row.estimated_total_cost || 0);
      acc.planned_quantity += Number(row.planned_quantity || 0);
      acc.reserved_quantity += Number(row.reserved_quantity || 0);
      acc.shortage_quantity += Number(row.shortage_quantity || 0);
      if (Number(row.shortage_quantity || 0) > 0) acc.shortage_items += 1;
      return acc;
    }, { requirement_count: 0, shortage_items: 0, planned_quantity: 0, reserved_quantity: 0, shortage_quantity: 0, planned_cost: 0 });
    res.json({ success: true, data: { project: project.rows[0], requirements: rows, warehouses: warehouses.rows, summary } });
  } catch (error) { next(error); }
});

router.post('/projects/:projectId/requirements', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const projectId = Number(req.params.projectId);
    const materialId = num(req.body.material_id);
    const taskId = num(req.body.task_id);
    const planned = num(req.body.planned_quantity);
    if (!materialId || !Number.isFinite(planned) || planned <= 0) throw Object.assign(new Error('Vật tư và số lượng dự trù là bắt buộc'), { status: 400 });
    const project = await client.query('SELECT id FROM projects WHERE id=$1', [projectId]);
    if (!project.rowCount) throw Object.assign(new Error('Không tìm thấy dự án'), { status: 404 });
    if (taskId) {
      const task = await client.query('SELECT id FROM tasks WHERE id=$1 AND project_id=$2', [taskId, projectId]);
      if (!task.rowCount) throw Object.assign(new Error('Nhiệm vụ không thuộc dự án này'), { status: 400 });
    }
    const material = await client.query('SELECT id,base_unit_id,standard_cost FROM materials WHERE id=$1 AND deleted_at IS NULL AND is_active=true', [materialId]);
    if (!material.rowCount || !material.rows[0].base_unit_id) throw Object.assign(new Error('Vật tư không hợp lệ hoặc chưa có đơn vị gốc'), { status: 400 });
    const priority = clean(req.body.priority || 'NORMAL').toUpperCase();
    if (!priorities.has(priority)) throw Object.assign(new Error('Mức ưu tiên không hợp lệ'), { status: 400 });
    const requestedStatus = clean(req.body.status || 'DRAFT').toUpperCase();
    if (!statuses.has(requestedStatus)) throw Object.assign(new Error('Trạng thái dự trù không hợp lệ'), { status: 400 });
    const unitCost = num(req.body.estimated_unit_cost) ?? Number(material.rows[0].standard_cost || 0);
    const result = await client.query(`INSERT INTO project_material_requirements(project_id,task_id,material_id,planned_quantity,base_unit_id,estimated_unit_cost,required_date,priority,source_type,status,note)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`, [projectId, taskId, materialId, planned, material.rows[0].base_unit_id, unitCost, req.body.required_date || null, priority, clean(req.body.source_type || 'MANUAL').toUpperCase(), requestedStatus, clean(req.body.note)]);
    await client.query(`INSERT INTO project_material_requirement_revisions(requirement_id,revision_number,old_quantity,new_quantity,new_required_date,reason)
      VALUES($1,1,NULL,$2,$3,$4)`, [result.rows[0].id, planned, req.body.required_date || null, 'Khởi tạo dự trù']);
    await client.query('COMMIT');
    res.status(201).json({ success: true, message: 'Đã thêm dự trù vật tư', data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.status) return fail(res, error.status, error.message);
    next(error);
  } finally { client.release(); }
});

router.put('/requirements/:id', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await getRequirement(client, Number(req.params.id), true);
    if (!current) throw Object.assign(new Error('Không tìm thấy dự trù'), { status: 404 });
    if (current.status === 'CANCELLED' || current.status === 'COMPLETED') throw Object.assign(new Error('Dự trù đã đóng, không thể chỉnh sửa'), { status: 409 });
    const planned = num(req.body.planned_quantity);
    if (!Number.isFinite(planned) || planned <= 0) throw Object.assign(new Error('Số lượng dự trù phải lớn hơn 0'), { status: 400 });
    if (planned + 1e-9 < Number(current.reserved_quantity || 0)) throw Object.assign(new Error('Số lượng mới không thể nhỏ hơn số lượng đã giữ'), { status: 409 });
    const priority = clean(req.body.priority || current.priority).toUpperCase();
    if (!priorities.has(priority)) throw Object.assign(new Error('Mức ưu tiên không hợp lệ'), { status: 400 });
    const revision = await client.query('SELECT COALESCE(MAX(revision_number),0)+1 AS next FROM project_material_requirement_revisions WHERE requirement_id=$1', [current.id]);
    await client.query(`INSERT INTO project_material_requirement_revisions(requirement_id,revision_number,old_quantity,new_quantity,old_required_date,new_required_date,reason)
      VALUES($1,$2,$3,$4,$5,$6,$7)`, [current.id, revision.rows[0].next, current.planned_quantity, planned, current.required_date, req.body.required_date || null, clean(req.body.revision_reason) || 'Cập nhật dự trù']);
    const result = await client.query(`UPDATE project_material_requirements SET planned_quantity=$1,estimated_unit_cost=$2,required_date=$3,priority=$4,note=$5,status=CASE WHEN status='DRAFT' THEN $6 ELSE status END,updated_at=NOW() WHERE id=$7 RETURNING *`, [planned, num(req.body.estimated_unit_cost) ?? current.estimated_unit_cost, req.body.required_date || null, priority, clean(req.body.note), clean(req.body.status || current.status).toUpperCase(), current.id]);
    await refreshRequirementStatus(client, current.id);
    await client.query('COMMIT');
    res.json({ success: true, message: 'Đã cập nhật dự trù và lưu lịch sử phiên bản', data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.status) return fail(res, error.status, error.message);
    next(error);
  } finally { client.release(); }
});

router.delete('/requirements/:id', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const row = await getRequirement(client, Number(req.params.id), true);
    if (!row) throw Object.assign(new Error('Không tìm thấy dự trù'), { status: 404 });
    if (Number(row.reserved_quantity || 0) > 0) throw Object.assign(new Error('Hãy giải phóng toàn bộ lượng đã giữ trước khi hủy dự trù'), { status: 409 });
    await client.query("UPDATE project_material_requirements SET status='CANCELLED',updated_at=NOW() WHERE id=$1", [row.id]);
    await client.query('COMMIT');
    res.json({ success: true, message: 'Đã hủy dự trù vật tư' });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.status) return fail(res, error.status, error.message);
    next(error);
  } finally { client.release(); }
});

router.get('/requirements/:id/revisions', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM project_material_requirement_revisions WHERE requirement_id=$1 ORDER BY revision_number DESC', [req.params.id]);
    res.json({ success: true, data: result.rows });
  } catch (error) { next(error); }
});

router.post('/requirements/:id/reserve', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const requirement = await getRequirement(client, Number(req.params.id), true);
    if (!requirement) throw Object.assign(new Error('Không tìm thấy dự trù'), { status: 404 });
    if (['DRAFT','CANCELLED','COMPLETED'].includes(requirement.status)) throw Object.assign(new Error('Dự trù phải được duyệt trước khi giữ vật tư'), { status: 409 });
    const warehouseId = num(req.body.warehouse_id);
    const locationId = num(req.body.location_id);
    const quantity = num(req.body.quantity);
    if (!warehouseId || !Number.isFinite(quantity) || quantity <= 0) throw Object.assign(new Error('Kho và số lượng giữ là bắt buộc'), { status: 400 });
    const remaining = Number(requirement.planned_quantity) - Number(requirement.reserved_quantity || 0);
    if (quantity > remaining + 1e-9) throw Object.assign(new Error(`Số lượng giữ vượt nhu cầu còn lại (${remaining})`), { status: 409 });
    const warehouse = await client.query('SELECT id FROM warehouses WHERE id=$1 AND is_active=true', [warehouseId]);
    if (!warehouse.rowCount) throw Object.assign(new Error('Kho không hợp lệ hoặc đã ngừng hoạt động'), { status: 400 });
    await client.query(`INSERT INTO inventory_balances(material_id,warehouse_id,location_id) VALUES($1,$2,$3)
      ON CONFLICT DO NOTHING`, [requirement.material_id, warehouseId, locationId]);
    const balance = await client.query(`SELECT * FROM inventory_balances WHERE material_id=$1 AND warehouse_id=$2 AND location_id IS NOT DISTINCT FROM $3 FOR UPDATE`, [requirement.material_id, warehouseId, locationId]);
    const available = Number(balance.rows[0]?.quantity_on_hand || 0) - Number(balance.rows[0]?.quantity_reserved || 0);
    if (quantity > available + 1e-9) throw Object.assign(new Error(`Không đủ tồn khả dụng. Có thể giữ tối đa ${available}`), { status: 409, details: { available_quantity: available, requested_quantity: quantity } });
    await client.query(`UPDATE inventory_balances SET quantity_reserved=quantity_reserved+$1,updated_at=NOW() WHERE material_id=$2 AND warehouse_id=$3 AND location_id IS NOT DISTINCT FROM $4`, [quantity, requirement.material_id, warehouseId, locationId]);
    const result = await client.query(`INSERT INTO material_reservations(requirement_id,project_id,task_id,material_id,warehouse_id,location_id,reserved_quantity,required_date,note)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [requirement.id, requirement.project_id, requirement.task_id, requirement.material_id, warehouseId, locationId, quantity, requirement.required_date, clean(req.body.note)]);
    await refreshRequirementStatus(client, requirement.id);
    await client.query('COMMIT');
    res.status(201).json({ success: true, message: 'Đã giữ vật tư trong kho', data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.status) return fail(res, error.status, error.message, error.details);
    next(error);
  } finally { client.release(); }
});

router.post('/reservations/:id/release', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const reservation = await client.query('SELECT * FROM material_reservations WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!reservation.rowCount) throw Object.assign(new Error('Không tìm thấy phiếu giữ vật tư'), { status: 404 });
    const row = reservation.rows[0];
    const releasable = Number(row.reserved_quantity) - Number(row.issued_quantity) - Number(row.released_quantity);
    const quantity = num(req.body.quantity) ?? releasable;
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > releasable + 1e-9) throw Object.assign(new Error(`Số lượng giải phóng phải từ 0 đến ${releasable}`), { status: 400 });
    const balance = await client.query(`SELECT * FROM inventory_balances WHERE material_id=$1 AND warehouse_id=$2 AND location_id IS NOT DISTINCT FROM $3 FOR UPDATE`, [row.material_id, row.warehouse_id, row.location_id]);
    if (!balance.rowCount) throw Object.assign(new Error('Không tìm thấy số dư kho tương ứng'), { status: 409 });
    await client.query(`UPDATE inventory_balances SET quantity_reserved=GREATEST(quantity_reserved-$1,0),updated_at=NOW() WHERE material_id=$2 AND warehouse_id=$3 AND location_id IS NOT DISTINCT FROM $4`, [quantity, row.material_id, row.warehouse_id, row.location_id]);
    const newReleased = Number(row.released_quantity) + quantity;
    const status = newReleased + Number(row.issued_quantity) + 1e-9 >= Number(row.reserved_quantity) ? 'RELEASED' : row.status;
    await client.query('UPDATE material_reservations SET released_quantity=$1,status=$2,note=COALESCE($3,note),updated_at=NOW() WHERE id=$4', [newReleased, status, clean(req.body.note), row.id]);
    await refreshRequirementStatus(client, row.requirement_id);
    await client.query('COMMIT');
    res.json({ success: true, message: 'Đã giải phóng lượng vật tư giữ' });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.status) return fail(res, error.status, error.message);
    next(error);
  } finally { client.release(); }
});

router.get('/shortages', async (req, res, next) => {
  try {
    const values = [];
    const where = ["v.status NOT IN ('CANCELLED','COMPLETED')", 'v.shortage_quantity > 0'];
    if (req.query.date_from) { values.push(req.query.date_from); where.push(`v.required_date >= $${values.length}`); }
    if (req.query.date_to) { values.push(req.query.date_to); where.push(`v.required_date <= $${values.length}`); }
    const result = await pool.query(`SELECT v.material_id,m.material_code,COALESCE(m.name,m.material_name) AS material_name,u.symbol AS unit_symbol,
      SUM(v.planned_quantity) AS planned_quantity,SUM(v.reserved_quantity) AS reserved_quantity,SUM(v.shortage_quantity) AS shortage_quantity,
      MIN(v.required_date) AS nearest_required_date,COUNT(DISTINCT v.project_id) AS project_count,
      json_agg(DISTINCT jsonb_build_object('project_id',p.id,'project_code',p.project_code,'project_name',p.project_name)) AS projects
      FROM v_project_material_planning v JOIN materials m ON m.id=v.material_id JOIN material_units u ON u.id=v.base_unit_id JOIN projects p ON p.id=v.project_id
      WHERE ${where.join(' AND ')} GROUP BY v.material_id,m.material_code,m.name,m.material_name,u.symbol ORDER BY nearest_required_date NULLS LAST,m.material_code`, values);
    res.json({ success: true, data: result.rows });
  } catch (error) { next(error); }
});

module.exports = router;
