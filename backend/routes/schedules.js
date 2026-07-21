const express = require('express');
const router = express.Router();
const pool = require('../config/database');


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

const ALLOWED_STATUS = ['Chưa bắt đầu', 'Đang thực hiện', 'Tạm dừng', 'Hoàn thành', 'Hủy'];
const ALLOWED_PRIORITY = ['Thấp', 'Trung bình', 'Cao', 'Khẩn cấp'];

function validateSchedule(body, partial = false) {
  const errors = [];
  const required = ['project_id', 'schedule_type', 'title', 'start_datetime', 'end_datetime'];
  if (!partial) {
    required.forEach((field) => {
      if (body[field] === undefined || body[field] === null || body[field] === '') errors.push(`Thiếu trường ${field}`);
    });
  }
  if (body.start_datetime && body.end_datetime && new Date(body.end_datetime) <= new Date(body.start_datetime)) {
    errors.push('Thời gian kết thúc phải sau thời gian bắt đầu');
  }
  if (body.status && !ALLOWED_STATUS.includes(body.status)) errors.push('Trạng thái không hợp lệ');
  if (body.priority && !ALLOWED_PRIORITY.includes(body.priority)) errors.push('Mức ưu tiên không hợp lệ');
  if (body.progress !== undefined && (Number(body.progress) < 0 || Number(body.progress) > 100)) {
    errors.push('Tiến độ phải từ 0 đến 100');
  }
  return errors;
}

async function createNotification(client, { type, title, message, priority = 'Normal', scheduleId, link }) {
  await client.query(
    `INSERT INTO system_notifications
       (notification_type, title, message, priority, schedule_id, link)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [type, title, message, priority, scheduleId, link]
  );
}

async function replaceAssignments(client, scheduleId, employeeIds = []) {
  await client.query('DELETE FROM schedule_assignments WHERE schedule_id = $1', [scheduleId]);
  const uniqueIds = [...new Set((employeeIds || []).map(Number).filter(Number.isInteger))];
  for (const employeeId of uniqueIds) {
    await client.query(
      `INSERT INTO schedule_assignments (schedule_id, employee_id)
       VALUES ($1, $2)
       ON CONFLICT (schedule_id, employee_id) DO NOTHING`,
      [scheduleId, employeeId]
    );
  }
}

router.get('/calendar/view', async (req, res, next) => {
  req.url = '/';
  return router.handle(req, res, next);
});

router.get('/', async (req, res, next) => {
  try {
    const { project_id, employee_id, schedule_type, status, from_date, to_date, search } = req.query;
    let query = `
      SELECT s.*, p.project_name, p.project_code,
        COALESCE(
          json_agg(
            json_build_object(
              'assignment_id', sa.id,
              'employee_id', e.id,
              'full_name', e.full_name,
              'employee_code', e.employee_code,
              'department', e.department
            ) ORDER BY e.full_name
          ) FILTER (WHERE e.id IS NOT NULL), '[]'::json
        ) AS employees
      FROM schedules s
      JOIN projects p ON p.id = s.project_id
      LEFT JOIN schedule_assignments sa ON sa.schedule_id = s.id
      LEFT JOIN employees e ON e.id = sa.employee_id
      WHERE 1=1`;
    const params = [];
    const add = (value) => { params.push(value); return `$${params.length}`; };

    if (project_id) query += ` AND s.project_id = ${add(project_id)}`;
    if (employee_id) query += ` AND EXISTS (SELECT 1 FROM schedule_assignments sx WHERE sx.schedule_id=s.id AND sx.employee_id=${add(employee_id)})`;
    if (schedule_type) query += ` AND s.schedule_type = ${add(schedule_type)}`;
    if (status) query += ` AND s.status = ${add(status)}`;
    if (from_date) query += ` AND s.end_datetime >= ${add(from_date)}::date`;
    if (to_date) query += ` AND s.start_datetime < (${add(to_date)}::date + INTERVAL '1 day')`;
    if (search) query += ` AND (s.title ILIKE ${add(`%${search}%`)} OR COALESCE(s.location,'') ILIKE $${params.length})`;

    query += ` GROUP BY s.id, p.project_name, p.project_code ORDER BY s.start_datetime DESC`;
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT s.*, p.project_name, p.project_code,
        COALESCE(json_agg(json_build_object(
          'assignment_id', sa.id, 'employee_id', e.id, 'full_name', e.full_name,
          'employee_code', e.employee_code, 'department', e.department
        )) FILTER (WHERE e.id IS NOT NULL), '[]'::json) AS employees
       FROM schedules s
       JOIN projects p ON p.id=s.project_id
       LEFT JOIN schedule_assignments sa ON sa.schedule_id=s.id
       LEFT JOIN employees e ON e.id=sa.employee_id
       WHERE s.id=$1
       GROUP BY s.id,p.project_name,p.project_code`,
      [req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ success: false, message: 'Không tìm thấy lịch trình' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

router.post('/', async (req, res, next) => {
  const errors = validateSchedule(req.body);
  if (errors.length) return res.status(400).json({ success: false, message: errors.join('. ') });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const b = req.body;
    await ensureActiveCatalog('SCHEDULE_TYPE', b.schedule_type);
    const result = await client.query(
      `INSERT INTO schedules
       (project_id,schedule_type,title,description,location,location_address,location_contact,location_phone,
        start_datetime,end_datetime,status,priority,progress,estimated_hours,actual_hours,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [b.project_id,b.schedule_type,b.title,b.description||null,b.location||null,b.location_address||null,
       b.location_contact||null,b.location_phone||null,b.start_datetime,b.end_datetime,b.status||'Chưa bắt đầu',
       b.priority||'Trung bình',Number(b.progress||0),b.estimated_hours||null,b.actual_hours||null,b.notes||null]
    );
    await replaceAssignments(client, result.rows[0].id, b.employee_ids);
    await createNotification(client, {
      type: 'schedule_created', title: 'Lịch trình mới',
      message: `Đã tạo lịch trình “${b.title}”`, priority: b.priority === 'Khẩn cấp' ? 'High' : 'Normal',
      scheduleId: result.rows[0].id, link: `/schedules?highlight=${result.rows[0].id}`,
    });
    await client.query('COMMIT');
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK'); next(error);
  } finally { client.release(); }
});

router.put('/:id', async (req, res, next) => {
  const errors = validateSchedule(req.body);
  if (errors.length) return res.status(400).json({ success: false, message: errors.join('. ') });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const b = req.body;
    await ensureActiveCatalog('SCHEDULE_TYPE', b.schedule_type);
    const result = await client.query(
      `UPDATE schedules SET
       project_id=$1,schedule_type=$2,title=$3,description=$4,location=$5,location_address=$6,
       location_contact=$7,location_phone=$8,start_datetime=$9,end_datetime=$10,status=$11,priority=$12,
       progress=$13,estimated_hours=$14,actual_hours=$15,notes=$16,updated_at=NOW()
       WHERE id=$17 RETURNING *`,
      [b.project_id,b.schedule_type,b.title,b.description||null,b.location||null,b.location_address||null,
       b.location_contact||null,b.location_phone||null,b.start_datetime,b.end_datetime,b.status||'Chưa bắt đầu',
       b.priority||'Trung bình',Number(b.progress||0),b.estimated_hours||null,b.actual_hours||null,b.notes||null,req.params.id]
    );
    if (!result.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ success:false,message:'Không tìm thấy lịch trình' }); }
    await replaceAssignments(client, req.params.id, b.employee_ids);
    await createNotification(client, {
      type:'schedule_updated', title:'Lịch trình được cập nhật', message:`Đã cập nhật lịch trình “${b.title}”`,
      priority:b.priority === 'Khẩn cấp' ? 'High':'Normal', scheduleId:Number(req.params.id), link:`/schedules?highlight=${req.params.id}`,
    });
    await client.query('COMMIT');
    res.json({ success:true,data:result.rows[0] });
  } catch(error) { await client.query('ROLLBACK'); next(error); }
  finally { client.release(); }
});

router.patch('/:id/progress', async (req,res,next) => {
  const { progress, status } = req.body;
  const errors = validateSchedule({ progress, status }, true);
  if (errors.length) return res.status(400).json({success:false,message:errors.join('. ')});
  try {
    const result = await pool.query(
      `UPDATE schedules SET progress=COALESCE($1,progress),status=COALESCE($2,status),updated_at=NOW() WHERE id=$3 RETURNING *`,
      [progress ?? null,status ?? null,req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({success:false,message:'Không tìm thấy lịch trình'});
    res.json({success:true,data:result.rows[0]});
  } catch(error) { next(error); }
});

router.delete('/:id', async (req,res,next) => {
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const existing=await client.query('SELECT id,title FROM schedules WHERE id=$1',[req.params.id]);
    if (!existing.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({success:false,message:'Không tìm thấy lịch trình'}); }
    await createNotification(client, {
      type:'schedule_deleted', title:'Lịch trình đã xóa', message:`Đã xóa lịch trình “${existing.rows[0].title}”`,
      priority:'Normal', scheduleId:null, link:'/schedules',
    });
    await client.query('DELETE FROM schedules WHERE id=$1',[req.params.id]);
    await client.query('COMMIT');
    res.json({success:true,message:'Xóa lịch trình thành công'});
  } catch(error) { await client.query('ROLLBACK'); next(error); }
  finally { client.release(); }
});

router.post('/:id/assignments', async (req,res,next) => {
  try {
    const result=await pool.query(
      `INSERT INTO schedule_assignments(schedule_id,employee_id,role_in_schedule)
       VALUES($1,$2,$3) ON CONFLICT(schedule_id,employee_id) DO UPDATE SET role_in_schedule=EXCLUDED.role_in_schedule RETURNING *`,
      [req.params.id,req.body.employee_id,req.body.role_in_schedule||null]
    );
    res.status(201).json({success:true,data:result.rows[0]});
  } catch(error) { next(error); }
});

router.delete('/:id/assignments/:assignmentId', async (req,res,next) => {
  try {
    const result=await pool.query('DELETE FROM schedule_assignments WHERE id=$1 AND schedule_id=$2 RETURNING id',[req.params.assignmentId,req.params.id]);
    if (!result.rowCount) return res.status(404).json({success:false,message:'Không tìm thấy phân công'});
    res.json({success:true});
  } catch(error) { next(error); }
});

router.post('/:id/check-in', async (req,res,next) => {
  try {
    const result=await pool.query(
      `UPDATE schedule_assignments SET check_in_time=NOW() WHERE schedule_id=$1 AND employee_id=$2 RETURNING *`,
      [req.params.id,req.body.employee_id]
    );
    if (!result.rowCount) return res.status(404).json({success:false,message:'Không tìm thấy phân công'});
    res.json({success:true,data:result.rows[0]});
  } catch(error) { next(error); }
});

router.post('/:id/check-out', async (req,res,next) => {
  try {
    const result=await pool.query(
      `UPDATE schedule_assignments SET check_out_time=NOW() WHERE schedule_id=$1 AND employee_id=$2 RETURNING *`,
      [req.params.id,req.body.employee_id]
    );
    if (!result.rowCount) return res.status(404).json({success:false,message:'Không tìm thấy phân công'});
    res.json({success:true,data:result.rows[0]});
  } catch(error) { next(error); }
});

module.exports=router;
