const express = require('express');
const pool = require('../config/database');

const router = express.Router();

const SYSTEM_WORK_ITEM_CODES = new Set(['SUPERVISION', 'DELIVERY', 'ON_SITE_INSTALLATION']);

const clean = value => value === undefined || value === null ? null : String(value).trim() || null;
const normalizeCode = value => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toUpperCase().replace(/Đ/g, 'D').replace(/[^A-Z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '').slice(0, 80);

async function replaceProjectTypes(client, workItemId, projectTypes) {
  const values = [...new Set((projectTypes || []).map(clean).filter(Boolean))];
  if (values.length) {
    const valid = await client.query(
      `SELECT name FROM system_catalogs
       WHERE catalog_type='PROJECT_TYPE' AND is_active=true AND name=ANY($1::text[])`,
      [values]
    );
    if (valid.rowCount !== values.length) {
      const error = new Error('Danh sách Loại dự án có giá trị không hợp lệ');
      error.status = 400;
      throw error;
    }
  }
  await client.query('DELETE FROM work_item_project_types WHERE work_item_id=$1', [workItemId]);
  for (const projectType of values) {
    await client.query(
      'INSERT INTO work_item_project_types(work_item_id,project_type) VALUES($1,$2)',
      [workItemId, projectType]
    );
  }
}

router.get('/project-types', async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id,code,name,description,sort_order,is_default,is_active
       FROM system_catalogs WHERE catalog_type='PROJECT_TYPE' AND is_active=true
       ORDER BY sort_order,name`
    );
    res.json({ success: true, data: result.rows });
  } catch (error) { next(error); }
});

router.get('/groups', async (req, res, next) => {
  try {
    const includeInactive = String(req.query.include_inactive || '') === 'true';
    const result = await pool.query(
      `SELECT g.*,(SELECT count(*)::int FROM work_items wi WHERE wi.group_id=g.id) item_count
       FROM work_groups g WHERE ($1::boolean OR g.is_active=true)
       ORDER BY g.sort_order,g.name`,
      [includeInactive]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) { next(error); }
});

router.post('/groups', async (req, res, next) => {
  try {
    const name = clean(req.body?.name);
    const code = normalizeCode(req.body?.code || name);
    if (!name || !code) return res.status(400).json({ success: false, message: 'Tên nhóm công việc không hợp lệ' });
    const result = await pool.query(
      `INSERT INTO work_groups(code,name,description,color,sort_order,is_active)
       VALUES($1,$2,$3,$4,$5,COALESCE($6,true)) RETURNING *`,
      [code,name,clean(req.body?.description),clean(req.body?.color),Number(req.body?.sort_order)||0,req.body?.is_active]
    );
    res.status(201).json({ success: true, data: result.rows[0], message: 'Đã thêm nhóm công việc' });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ success:false, message:'Mã hoặc tên nhóm đã tồn tại' });
    next(error);
  }
});

router.put('/groups/:id', async (req, res, next) => {
  try {
    const name = clean(req.body?.name);
    if (!name) return res.status(400).json({ success:false, message:'Tên nhóm công việc không được trống' });
    const result = await pool.query(
      `UPDATE work_groups SET name=$1,description=$2,color=$3,sort_order=$4,is_active=$5
       WHERE id=$6 RETURNING *`,
      [name,clean(req.body?.description),clean(req.body?.color),Number(req.body?.sort_order)||0,req.body?.is_active!==false,req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ success:false, message:'Không tìm thấy nhóm công việc' });
    res.json({ success:true, data:result.rows[0], message:'Đã cập nhật nhóm công việc' });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ success:false, message:'Tên nhóm đã tồn tại' });
    next(error);
  }
});

router.delete('/groups/:id', async (req, res, next) => {
  try {
    const used = await pool.query('SELECT count(*)::int count FROM work_items WHERE group_id=$1', [req.params.id]);
    if (used.rows[0].count) return res.status(409).json({ success:false, message:'Nhóm đang có công việc. Hãy chuyển nhóm sang Không hoạt động.' });
    const result = await pool.query('DELETE FROM work_groups WHERE id=$1 RETURNING id', [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ success:false, message:'Không tìm thấy nhóm công việc' });
    res.json({ success:true, message:'Đã xóa nhóm công việc' });
  } catch (error) { next(error); }
});

router.get('/items', async (req, res, next) => {
  try {
    const includeInactive = String(req.query.include_inactive || '') === 'true';
    const projectType = clean(req.query.project_type);
    const params = [includeInactive];
    let filter = '';
    if (projectType) {
      params.push(projectType);
      filter = ` AND (
        NOT EXISTS(SELECT 1 FROM work_item_project_types all_types WHERE all_types.work_item_id=wi.id)
        OR EXISTS(SELECT 1 FROM work_item_project_types f WHERE f.work_item_id=wi.id AND f.project_type=$${params.length})
      )`;
    }
    const result = await pool.query(
      `SELECT wi.*,g.code group_code,g.name group_name,g.color group_color,
        COALESCE(jsonb_agg(m.project_type ORDER BY m.project_type) FILTER(WHERE m.project_type IS NOT NULL),'[]'::jsonb) project_types,
        (SELECT count(*)::int FROM tasks t WHERE t.work_item_id=wi.id AND t.deleted_at IS NULL) usage_count
       FROM work_items wi JOIN work_groups g ON g.id=wi.group_id
       LEFT JOIN work_item_project_types m ON m.work_item_id=wi.id
       WHERE ($1::boolean OR (wi.is_active=true AND g.is_active=true))${filter}
       GROUP BY wi.id,g.id ORDER BY g.sort_order,g.name,wi.sort_order,wi.name`,
      params
    );
    res.json({ success:true, data:result.rows });
  } catch (error) { next(error); }
});

router.post('/items', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const name = clean(req.body?.name);
    const code = normalizeCode(req.body?.code || name);
    const groupId = Number(req.body?.group_id);
    const executionType = clean(req.body?.execution_type);
    if (SYSTEM_WORK_ITEM_CODES.has(code)) return res.status(409).json({ success:false, message:'Mã này thuộc Công việc hệ thống và không thể tạo thủ công' });
    if (executionType && !['DELIVERY','INSTALLATION'].includes(executionType)) return res.status(400).json({ success:false, message:'Loại thực thi không hợp lệ' });
    if (!name || !code || !Number.isInteger(groupId)) return res.status(400).json({ success:false, message:'Nhóm và tên công việc là bắt buộc' });
    await client.query('BEGIN');
    const group = await client.query('SELECT 1 FROM work_groups WHERE id=$1 AND is_active=true', [groupId]);
    if (!group.rowCount) throw Object.assign(new Error('Nhóm công việc không hợp lệ hoặc đã ngừng sử dụng'), { status:400 });
    const result = await client.query(
      `INSERT INTO work_items(group_id,code,name,description,default_estimated_hours,execution_type,sort_order,is_active)
       VALUES($1,$2,$3,$4,NULL,$5,$6,COALESCE($7,true)) RETURNING *`,
      [groupId,code,name,clean(req.body?.description),executionType,Number(req.body?.sort_order)||0,req.body?.is_active]
    );
    await replaceProjectTypes(client,result.rows[0].id,req.body?.project_types);
    await client.query('COMMIT');
    res.status(201).json({ success:true, data:result.rows[0], message:'Đã thêm công việc' });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') return res.status(409).json({ success:false, message:'Mã hoặc tên công việc đã tồn tại trong nhóm' });
    if (error.status) return res.status(error.status).json({ success:false, message:error.message });
    next(error);
  } finally { client.release(); }
});

router.put('/items/:id', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const current = await client.query('SELECT code,is_system FROM work_items WHERE id=$1', [req.params.id]);
    if (!current.rowCount) return res.status(404).json({ success:false, message:'Không tìm thấy công việc' });
    if (current.rows[0].is_system || SYSTEM_WORK_ITEM_CODES.has(current.rows[0].code)) {
      return res.status(409).json({ success:false, message:'Công việc hệ thống được ghi cứng và không thể chỉnh sửa' });
    }
    const name = clean(req.body?.name);
    const groupId = Number(req.body?.group_id);
    const executionType = clean(req.body?.execution_type);
    if (executionType && !['DELIVERY','INSTALLATION'].includes(executionType)) return res.status(400).json({ success:false, message:'Loại thực thi không hợp lệ' });
    if (!name || !Number.isInteger(groupId)) return res.status(400).json({ success:false, message:'Nhóm và tên công việc là bắt buộc' });
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE work_items SET group_id=$1,name=$2,description=$3,default_estimated_hours=NULL,execution_type=$4,sort_order=$5,is_active=$6
       WHERE id=$7 RETURNING *`,
      [groupId,name,clean(req.body?.description),executionType,Number(req.body?.sort_order)||0,req.body?.is_active!==false,req.params.id]
    );
    if (!result.rowCount) throw Object.assign(new Error('Không tìm thấy công việc'), { status:404 });
    await replaceProjectTypes(client,result.rows[0].id,req.body?.project_types);
    await client.query('COMMIT');
    res.json({ success:true, data:result.rows[0], message:'Đã cập nhật công việc' });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') return res.status(409).json({ success:false, message:'Tên công việc đã tồn tại trong nhóm' });
    if (error.status) return res.status(error.status).json({ success:false, message:error.message });
    next(error);
  } finally { client.release(); }
});

router.delete('/items/:id', async (req, res, next) => {
  try {
    const current = await pool.query('SELECT code,is_system FROM work_items WHERE id=$1', [req.params.id]);
    if (!current.rowCount) return res.status(404).json({ success:false, message:'Không tìm thấy công việc' });
    if (current.rows[0].is_system || SYSTEM_WORK_ITEM_CODES.has(current.rows[0].code)) {
      return res.status(409).json({ success:false, message:'Công việc hệ thống được ghi cứng và không thể xóa' });
    }
    const used = await pool.query('SELECT count(*)::int count FROM tasks WHERE work_item_id=$1', [req.params.id]);
    if (used.rows[0].count) return res.status(409).json({ success:false, message:'Công việc đã được dùng trong Task. Hãy chuyển sang Không hoạt động.' });
    const result = await pool.query('DELETE FROM work_items WHERE id=$1 RETURNING id', [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ success:false, message:'Không tìm thấy công việc' });
    res.json({ success:true, message:'Đã xóa công việc' });
  } catch (error) { next(error); }
});

router.get('/roles', async (req, res, next) => {
  try {
    const includeInactive = String(req.query.include_inactive || '') === 'true';
    const result = await pool.query(
      `SELECT sc.*,
        (SELECT count(*)::int FROM project_assignments pa WHERE pa.role=sc.name) project_usage_count,
        (SELECT count(*)::int FROM task_assignments ta WHERE ta.role_in_task=sc.name) task_usage_count
       FROM system_catalogs sc
       WHERE sc.catalog_type='PROJECT_ROLE' AND ($1::boolean OR sc.is_active=true)
       ORDER BY sc.sort_order,sc.name`,
      [includeInactive]
    );
    res.json({ success:true, data:result.rows });
  } catch (error) { next(error); }
});

router.post('/roles', async (req, res, next) => {
  try {
    const name = clean(req.body?.name);
    const code = normalizeCode(req.body?.code || name);
    if (!name || !code) return res.status(400).json({ success:false, message:'Tên vai trò không hợp lệ' });
    const result = await pool.query(
      `INSERT INTO system_catalogs(catalog_type,code,name,description,color,sort_order,is_default,is_active)
       VALUES('PROJECT_ROLE',$1,$2,$3,$4,$5,$6,COALESCE($7,true)) RETURNING *`,
      [code,name,clean(req.body?.description),clean(req.body?.color),Number(req.body?.sort_order)||0,Boolean(req.body?.is_default),req.body?.is_active]
    );
    if (req.body?.is_default) {
      await pool.query(`UPDATE system_catalogs SET is_default=false WHERE catalog_type='PROJECT_ROLE' AND id<>$1`, [result.rows[0].id]);
    }
    res.status(201).json({ success:true, data:result.rows[0], message:'Đã thêm vai trò' });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ success:false, message:'Mã hoặc tên vai trò đã tồn tại' });
    next(error);
  }
});

router.put('/roles/:id', async (req, res, next) => {
  try {
    const current = await pool.query(`SELECT * FROM system_catalogs WHERE id=$1 AND catalog_type='PROJECT_ROLE'`, [req.params.id]);
    if (!current.rowCount) return res.status(404).json({ success:false, message:'Không tìm thấy vai trò' });
    const name = clean(req.body?.name);
    if (!name) return res.status(400).json({ success:false, message:'Tên vai trò không được trống' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (current.rows[0].name !== name) {
        await client.query('UPDATE project_assignments SET role=$1 WHERE role=$2', [name,current.rows[0].name]);
        await client.query('UPDATE task_assignments SET role_in_task=$1 WHERE role_in_task=$2', [name,current.rows[0].name]);
      }
      const result = await client.query(
        `UPDATE system_catalogs SET name=$1,description=$2,color=$3,sort_order=$4,is_default=$5,is_active=$6,updated_at=now()
         WHERE id=$7 RETURNING *`,
        [name,clean(req.body?.description),clean(req.body?.color),Number(req.body?.sort_order)||0,Boolean(req.body?.is_default),req.body?.is_active!==false,req.params.id]
      );
      if (req.body?.is_default) {
        await client.query(`UPDATE system_catalogs SET is_default=false WHERE catalog_type='PROJECT_ROLE' AND id<>$1`, [req.params.id]);
      }
      await client.query('COMMIT');
      res.json({ success:true, data:result.rows[0], message:'Đã cập nhật vai trò' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ success:false, message:'Tên vai trò đã tồn tại' });
    next(error);
  }
});

router.delete('/roles/:id', async (req, res, next) => {
  try {
    const role = await pool.query(`SELECT * FROM system_catalogs WHERE id=$1 AND catalog_type='PROJECT_ROLE'`, [req.params.id]);
    if (!role.rowCount) return res.status(404).json({ success:false, message:'Không tìm thấy vai trò' });
    const used = await pool.query(
      `SELECT
        (SELECT count(*)::int FROM project_assignments WHERE role=$1) project_count,
        (SELECT count(*)::int FROM task_assignments WHERE role_in_task=$1) task_count`,
      [role.rows[0].name]
    );
    if (used.rows[0].project_count || used.rows[0].task_count) {
      return res.status(409).json({ success:false, message:'Vai trò đang được sử dụng. Hãy chuyển sang Ngừng dùng.' });
    }
    await pool.query('DELETE FROM system_catalogs WHERE id=$1', [req.params.id]);
    res.json({ success:true, message:'Đã xóa vai trò' });
  } catch (error) { next(error); }
});

router.get('/project-context/:projectId', async (req, res, next) => {
  try {
    const project = await pool.query(
      `SELECT p.id,p.project_code,p.project_name,p.project_type,p.start_date,p.end_date,p.status,p.priority,
        c.company_name,c.contact_person,c.phone customer_phone
       FROM projects p LEFT JOIN customers c ON c.id=p.customer_id
       WHERE p.id=$1 AND p.deleted_at IS NULL`,
      [req.params.projectId]
    );
    if (!project.rowCount) return res.status(404).json({ success:false, message:'Không tìm thấy dự án' });
    const [items,employees,roles,productionStages,orders] = await Promise.all([
      pool.query(
        `SELECT wi.id,wi.code,wi.name,wi.description,wi.execution_type,
          g.id group_id,g.name group_name,g.color group_color
         FROM work_items wi JOIN work_groups g ON g.id=wi.group_id
         WHERE wi.is_active=true AND g.is_active=true
           AND (
             NOT EXISTS(SELECT 1 FROM work_item_project_types all_types WHERE all_types.work_item_id=wi.id)
             OR EXISTS(SELECT 1 FROM work_item_project_types matching_type
               WHERE matching_type.work_item_id=wi.id AND matching_type.project_type=$1)
           )
         ORDER BY g.sort_order,g.name,wi.sort_order,wi.name`,
        [project.rows[0].project_type]
      ),
      pool.query(
        `SELECT e.id,e.employee_code,e.full_name,e.position,e.department,
          pa.role project_role,(pa.id IS NOT NULL) is_project_member
         FROM employees e
         LEFT JOIN LATERAL (
           SELECT id,role FROM project_assignments
           WHERE project_id=$1 AND employee_id=e.id
           ORDER BY assigned_date,id LIMIT 1
         ) pa ON true
         WHERE e.status='Hoạt động'
         ORDER BY (pa.id IS NOT NULL) DESC,e.full_name`,
        [req.params.projectId]
      ),
      pool.query(
        `SELECT id,code,name,description,color,sort_order,is_default
         FROM system_catalogs WHERE catalog_type='PROJECT_ROLE' AND is_active=true
         ORDER BY sort_order,name`
      ),
      pool.query(
        `SELECT stage.id,stage.sequence_no,stage.stage_code,stage.stage_name,
          stage.planned_start_date,stage.planned_end_date,stage.status,
          production.id production_order_id,production.production_code,production.group_name,
          production.process_name,plan.id production_plan_id,plan.plan_code,
          COUNT(work.id) FILTER(WHERE work.deleted_at IS NULL)::int work_count
         FROM production_stage_instances stage
         JOIN production_orders production ON production.id=stage.production_order_id
         LEFT JOIN production_plans plan ON plan.id=production.production_plan_id
         LEFT JOIN tasks work ON work.production_stage_instance_id=stage.id
         WHERE production.project_id=$1 AND production.status<>'CANCELLED'
           AND COALESCE(plan.status,'PLANNED')<>'CANCELLED'
         GROUP BY stage.id,production.id,plan.id
         ORDER BY production.created_at DESC,stage.sequence_no`,
        [req.params.projectId]
      ),
      pool.query(
        `SELECT orders.id,orders.order_code,orders.order_date,orders.expected_delivery_date,orders.status,
          COALESCE(jsonb_agg(jsonb_build_object(
            'id',item.id,'item_code',item.item_code,'item_name',item.item_name,'unit',item.unit,'quantity',item.quantity,
            'delivery_allocated_quantity',COALESCE((
              SELECT SUM(link.planned_quantity) FROM task_order_fulfillment_items link
              JOIN tasks task ON task.id=link.task_id
              WHERE link.order_item_id=item.id AND link.execution_type='DELIVERY'
                AND task.deleted_at IS NULL AND task.status NOT IN ('Hủy','Lưu trữ')
            ),0),
            'delivery_completed_quantity',COALESCE((
              SELECT SUM(link.completed_quantity) FROM task_order_fulfillment_items link
              JOIN tasks task ON task.id=link.task_id
              WHERE link.order_item_id=item.id AND link.execution_type='DELIVERY'
                AND task.deleted_at IS NULL AND task.status NOT IN ('Hủy','Lưu trữ')
            ),0),
            'installation_allocated_quantity',COALESCE((
              SELECT SUM(link.planned_quantity) FROM task_order_fulfillment_items link
              JOIN tasks task ON task.id=link.task_id
              WHERE link.order_item_id=item.id AND link.execution_type='INSTALLATION'
                AND task.deleted_at IS NULL AND task.status NOT IN ('Hủy','Lưu trữ')
            ),0),
            'installation_completed_quantity',COALESCE((
              SELECT SUM(link.completed_quantity) FROM task_order_fulfillment_items link
              JOIN tasks task ON task.id=link.task_id
              WHERE link.order_item_id=item.id AND link.execution_type='INSTALLATION'
                AND task.deleted_at IS NULL AND task.status NOT IN ('Hủy','Lưu trữ')
            ),0)
          ) ORDER BY item.id) FILTER(WHERE item.id IS NOT NULL),'[]'::jsonb) items
         FROM project_orders orders
         LEFT JOIN project_order_items item ON item.order_id=orders.id
         WHERE orders.project_id=$1 AND orders.status<>'CANCELLED'
         GROUP BY orders.id ORDER BY orders.created_at DESC`,
        [req.params.projectId]
      ),
    ]);
    res.json({ success:true, data:{ project:project.rows[0], work_items:items.rows, employees:employees.rows,
      roles:roles.rows, production_stages:productionStages.rows, orders:orders.rows } });
  } catch (error) { next(error); }
});

module.exports = router;
