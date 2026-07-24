const express = require('express');
const pool = require('../config/database');

const router = express.Router();
const fail = (res, status, message) => res.status(status).json({ success: false, message });
const isEditable = status => !['LOCKED', 'CLOSED'].includes(status);
const isDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));

function timeHours(start, end) {
  if (!start || !end) return 0;
  const [startHour, startMinute] = String(start).slice(0, 5).split(':').map(Number);
  const [endHour, endMinute] = String(end).slice(0, 5).split(':').map(Number);
  let minutes = endHour * 60 + endMinute - startHour * 60 - startMinute;
  if (minutes < 0) minutes += 24 * 60;
  return Math.round((minutes / 60) * 100) / 100;
}

async function boardDetail(client, boardId) {
  const boardResult = await client.query('SELECT * FROM shopfloor_work_boards WHERE id=$1', [boardId]);
  if (!boardResult.rowCount) return null;
  const [items, dailyLog] = await Promise.all([
    client.query(`SELECT i.*,p.project_code,p.project_name,t.task_code,t.task_name source_task_name,
      COALESCE(json_agg(json_build_object('id',a.id,'employee_id',a.employee_id,'employee_code',e.employee_code,'full_name',e.full_name,'team_name',a.team_name)
        ORDER BY e.employee_code,a.team_name) FILTER (WHERE a.id IS NOT NULL),'[]') assignments
      FROM shopfloor_work_board_items i
      LEFT JOIN projects p ON p.id=i.project_id LEFT JOIN tasks t ON t.id=i.task_id
      LEFT JOIN shopfloor_work_board_assignments a ON a.item_id=i.id LEFT JOIN employees e ON e.id=a.employee_id
      WHERE i.board_id=$1 AND (
        i.source_type<>'TASK_ASSIGNMENT'
        OR EXISTS(
          SELECT 1 FROM task_assignments live_assignment
          JOIN tasks live_task ON live_task.id=live_assignment.task_id
          JOIN projects live_project ON live_project.id=live_task.project_id
          JOIN shopfloor_work_boards live_board ON live_board.id=i.board_id
          WHERE live_assignment.id=i.source_task_assignment_id AND live_assignment.is_active=true
            AND live_task.deleted_at IS NULL AND COALESCE(live_task.is_archived,false)=false
            AND live_task.status NOT IN ('Hủy','Lưu trữ')
            AND live_project.deleted_at IS NULL AND live_project.status NOT IN ('Hủy','Lưu trữ')
            AND (
              EXISTS(SELECT 1 FROM task_assignment_work_days live_day
                WHERE live_day.task_assignment_id=live_assignment.id AND live_day.work_date=live_board.board_date)
              OR (
                NOT EXISTS(SELECT 1 FROM task_assignment_work_days any_live_day
                  WHERE any_live_day.task_assignment_id=live_assignment.id)
                AND COALESCE(live_assignment.start_date,live_task.start_date,live_project.start_date,live_board.board_date)<=live_board.board_date
                AND COALESCE(live_assignment.end_date,live_task.end_date,live_project.end_date,live_board.board_date)>=live_board.board_date
              )
            )
        )
      ) GROUP BY i.id,p.project_code,p.project_name,t.task_code,t.task_name
      ORDER BY i.start_time NULLS LAST,i.sort_order,i.id`, [boardId]),
    client.query(`SELECT id,log_date,summary,item_count,employee_count,absence_count,project_count,closed_at
      FROM shopfloor_work_board_daily_logs WHERE board_id=$1`, [boardId]),
  ]);
  const board = boardResult.rows[0];
  return { ...board, items: items.rows, daily_log: dailyLog.rows[0] || null, display_url: `/work-board/display/${board.display_token}` };
}

async function syncTaskAssignments(client, board) {
  if (!isEditable(board.status)) return { source_count: 0, item_count: 0, skipped: true };
  const removed = await client.query(`DELETE FROM shopfloor_work_board_items stale
    WHERE stale.board_id=$1 AND stale.source_type='TASK_ASSIGNMENT'
      AND NOT EXISTS(
        SELECT 1 FROM task_assignments ta
        JOIN tasks t ON t.id=ta.task_id JOIN projects p ON p.id=t.project_id
        WHERE ta.id=stale.source_task_assignment_id AND ta.is_active=true
          AND t.deleted_at IS NULL AND COALESCE(t.is_archived,false)=false
          AND t.status NOT IN ('Hủy','Lưu trữ')
          AND p.deleted_at IS NULL AND p.status NOT IN ('Hủy','Lưu trữ')
          AND (
            EXISTS(SELECT 1 FROM task_assignment_work_days work_day
              WHERE work_day.task_assignment_id=ta.id AND work_day.work_date=$2::date)
            OR (
              NOT EXISTS(SELECT 1 FROM task_assignment_work_days any_work_day
                WHERE any_work_day.task_assignment_id=ta.id)
              AND COALESCE(ta.start_date,t.start_date,p.start_date,$2::date)<=$2::date
              AND COALESCE(ta.end_date,t.end_date,p.end_date,$2::date)>=$2::date
            )
          )
      ) RETURNING stale.id`,[board.id,board.board_date]);
  const result = await client.query(`WITH source AS (
      SELECT ta.id task_assignment_id,ta.employee_id,t.id task_id,t.project_id,t.task_name,t.task_code,t.progress,
        CASE WHEN t.priority IN ('Khẩn','Khẩn cấp') THEN 'URGENT' WHEN t.priority='Cao' THEN 'HIGH'
             WHEN t.priority='Thấp' THEN 'LOW' ELSE 'NORMAL' END priority,
        CASE WHEN t.status='Hoàn thành' THEN 'COMPLETED' WHEN t.status='Đang thực hiện' THEN 'IN_PROGRESS'
             WHEN t.status='Tạm dừng' THEN 'PAUSED' ELSE 'READY' END status
      FROM task_assignments ta
      JOIN tasks t ON t.id=ta.task_id
      JOIN projects p ON p.id=t.project_id
      WHERE ta.is_active=TRUE AND COALESCE(t.is_archived,FALSE)=FALSE
        AND t.status NOT IN ('Hủy','Lưu trữ') AND p.deleted_at IS NULL
        AND p.status NOT IN ('Hủy','Lưu trữ')
        AND (
          EXISTS(SELECT 1 FROM task_assignment_work_days work_day
            WHERE work_day.task_assignment_id=ta.id AND work_day.work_date=$2::date)
          OR (
            NOT EXISTS(SELECT 1 FROM task_assignment_work_days any_work_day
              WHERE any_work_day.task_assignment_id=ta.id)
            AND COALESCE(ta.start_date,t.start_date,p.start_date,$2::date) <= $2::date
            AND COALESCE(ta.end_date,t.end_date,p.end_date,$2::date) >= $2::date
          )
        )
    ), upserted AS (
      INSERT INTO shopfloor_work_board_items
        (board_id,project_id,task_id,title,priority,status,progress,sort_order,source_type,source_task_assignment_id)
      SELECT $1,project_id,task_id,task_name,priority,status,COALESCE(progress,0),
        1000 + ROW_NUMBER() OVER (ORDER BY task_code,employee_id) * 10,'TASK_ASSIGNMENT',task_assignment_id
      FROM source
      ON CONFLICT (board_id,source_task_assignment_id) WHERE source_task_assignment_id IS NOT NULL
      DO UPDATE SET project_id=EXCLUDED.project_id,task_id=EXCLUDED.task_id,priority=EXCLUDED.priority,updated_at=NOW()
      RETURNING id,source_task_assignment_id
    ), assigned AS (
      INSERT INTO shopfloor_work_board_assignments(item_id,employee_id)
      SELECT u.id,s.employee_id FROM upserted u JOIN source s ON s.task_assignment_id=u.source_task_assignment_id
      ON CONFLICT (item_id,employee_id) DO NOTHING RETURNING id
    )
    SELECT (SELECT COUNT(*) FROM source)::integer source_count,(SELECT COUNT(*) FROM upserted)::integer item_count`, [board.id, board.board_date]);
  return { ...result.rows[0], removed_count: removed.rowCount };
}

async function replaceAssignments(client, itemId, employeeIds = [], teamName = null) {
  await client.query('DELETE FROM shopfloor_work_board_assignments WHERE item_id=$1', [itemId]);
  for (const employeeId of [...new Set(employeeIds || [])]) {
    await client.query('INSERT INTO shopfloor_work_board_assignments(item_id,employee_id) VALUES($1,$2)', [itemId, employeeId]);
  }
  if (teamName && teamName.trim()) {
    await client.query('INSERT INTO shopfloor_work_board_assignments(item_id,team_name) VALUES($1,$2)', [itemId, teamName.trim()]);
  }
}

async function publishSnapshot(client, boardId, targetStatus = 'PUBLISHED', summary = null) {
  const locked = await client.query('SELECT * FROM shopfloor_work_boards WHERE id=$1 FOR UPDATE', [boardId]);
  if (!locked.rowCount) throw Object.assign(new Error('Không tìm thấy bảng phân công'), { status: 404 });
  if (!isEditable(locked.rows[0].status)) throw Object.assign(new Error('Bảng phân công đã khóa hoặc đã chốt ngày'), { status: 409 });
  const data = await boardDetail(client, boardId);
  const version = Number(locked.rows[0].published_version || 0) + 1;
  const now = new Date().toISOString();
  data.status = targetStatus;
  data.published_version = version;
  data.published_at = now;
  if (targetStatus === 'CLOSED') {
    data.closed_at = now;
    data.closeout_summary = summary || null;
  }
  await client.query('INSERT INTO shopfloor_work_board_publications(board_id,version,snapshot_data) VALUES($1,$2,$3)', [boardId, version, JSON.stringify(data)]);
  await client.query(`UPDATE shopfloor_work_boards SET status=$1::varchar,published_version=$2,published_at=NOW(),
    closed_at=CASE WHEN $1::varchar='CLOSED' THEN NOW() ELSE closed_at END,
    closeout_summary=CASE WHEN $1::varchar='CLOSED' THEN $3 ELSE closeout_summary END,updated_at=NOW() WHERE id=$4`,
  [targetStatus, version, summary || null, boardId]);
  return { data, version };
}

router.get('/meta', async (req, res, next) => {
  try {
    const [projects, tasks, employees] = await Promise.all([
      pool.query("SELECT id,project_code,project_name,status FROM projects WHERE deleted_at IS NULL AND status NOT IN ('Hủy','Lưu trữ') AND COALESCE(closeout_status,'OPEN')<>'CLOSED' ORDER BY project_code"),
      pool.query(`SELECT t.id,t.project_id,t.task_code,t.task_name,t.status,t.start_date,t.end_date FROM tasks t
        JOIN projects p ON p.id=t.project_id WHERE t.deleted_at IS NULL AND p.deleted_at IS NULL
        AND COALESCE(t.is_archived,false)=false AND t.status NOT IN ('Hủy','Lưu trữ')
        AND p.status NOT IN ('Hủy','Lưu trữ') ORDER BY COALESCE(t.start_date,p.start_date),t.task_code`),
      pool.query("SELECT id,employee_code,full_name,department,position FROM employees WHERE status='Hoạt động' ORDER BY employee_code"),
    ]);
    res.json({ success: true, data: { projects: projects.rows, tasks: tasks.rows, employees: employees.rows } });
  } catch (error) { next(error); }
});

router.get('/boards', async (req, res, next) => {
  try {
    const params = [];
    let where = '';
    if (req.query.date) { params.push(req.query.date); where = 'WHERE b.board_date=$1'; }
    const result = await pool.query(`SELECT b.*,COUNT(i.id)::integer item_count,
      COUNT(i.id) FILTER (WHERE i.status='COMPLETED')::integer completed_count,
      COUNT(i.id) FILTER (WHERE i.status='ABSENT')::integer absence_count,
      COUNT(i.id) FILTER (WHERE i.source_type='TASK_ASSIGNMENT')::integer task_item_count
      FROM shopfloor_work_boards b LEFT JOIN shopfloor_work_board_items i ON i.board_id=b.id
      ${where} GROUP BY b.id ORDER BY b.board_date DESC,b.shift_start,b.workshop`, params);
    res.json({ success: true, data: result.rows });
  } catch (error) { next(error); }
});

router.post('/daily/open', async (req, res, next) => {
  const boardDate = req.body.board_date;
  if (!isDate(boardDate)) return fail(res, 400, 'Ngày làm việc không hợp lệ');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let board = await client.query("SELECT * FROM shopfloor_work_boards WHERE board_date=$1 AND shift_code='DAY_AUTO' AND workshop='Xưởng chính' FOR UPDATE", [boardDate]);
    if (!board.rowCount) {
      board = await client.query(`INSERT INTO shopfloor_work_boards(board_date,shift_code,shift_name,shift_start,shift_end,workshop,announcement)
        VALUES($1,'DAY_AUTO','Ca ngày','07:30','16:30','Xưởng chính','An toàn - Chất lượng - Tiến độ') RETURNING *`, [boardDate]);
    }
    const sync = await syncTaskAssignments(client, board.rows[0]);
    const data = await boardDetail(client, board.rows[0].id);
    await client.query('COMMIT');
    res.json({ success: true, data, sync });
  } catch (error) { await client.query('ROLLBACK'); next(error); } finally { client.release(); }
});

router.post('/boards', async (req, res, next) => {
  const b = req.body;
  if (!b.board_date || !b.shift_code || !b.shift_name || !b.shift_start || !b.shift_end) return fail(res, 400, 'Thiếu thông tin ngày hoặc ca làm việc');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`INSERT INTO shopfloor_work_boards(board_date,shift_code,shift_name,shift_start,shift_end,workshop,announcement)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [b.board_date, b.shift_code, b.shift_name, b.shift_start, b.shift_end, b.workshop || 'Xưởng chính', b.announcement || null]);
    await syncTaskAssignments(client, result.rows[0]);
    const data = await boardDetail(client, result.rows[0].id);
    await client.query('COMMIT');
    res.status(201).json({ success: true, data });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') return fail(res, 409, 'Bảng phân công của ngày, ca và xưởng này đã tồn tại');
    next(error);
  } finally { client.release(); }
});

router.get('/project-logs', async (req, res, next) => {
  if (!req.query.project_id) return fail(res, 400, 'Thiếu dự án cần xem nhật ký');
  try {
    const params = [req.query.project_id];
    let where = 'WHERE l.project_id=$1';
    if (req.query.from_date) { params.push(req.query.from_date); where += ` AND l.log_date >= $${params.length}`; }
    if (req.query.to_date) { params.push(req.query.to_date); where += ` AND l.log_date <= $${params.length}`; }
    const result = await pool.query(`SELECT l.*,p.project_code,p.project_name FROM shopfloor_project_daily_logs l
      JOIN projects p ON p.id=l.project_id ${where} ORDER BY l.log_date DESC,l.closed_at DESC`, params);
    res.json({ success: true, data: result.rows });
  } catch (error) { next(error); }
});

router.get('/daily-logs/:id', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM shopfloor_work_board_daily_logs WHERE id=$1', [req.params.id]);
    if (!result.rowCount) return fail(res, 404, 'Không tìm thấy nhật ký ngày');
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

router.get('/boards/:id', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const data = await boardDetail(client, req.params.id);
    if (!data) return fail(res, 404, 'Không tìm thấy bảng phân công');
    res.json({ success: true, data });
  } catch (error) { next(error); } finally { client.release(); }
});

router.post('/boards/:id/sync-tasks', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query('SELECT * FROM shopfloor_work_boards WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!result.rowCount) throw Object.assign(new Error('Không tìm thấy bảng phân công'), { status: 404 });
    if (!isEditable(result.rows[0].status)) throw Object.assign(new Error('Không thể đồng bộ bảng đã khóa hoặc đã chốt'), { status: 409 });
    const sync = await syncTaskAssignments(client, result.rows[0]);
    const data = await boardDetail(client, req.params.id);
    await client.query('COMMIT');
    res.json({ success: true, message: `Đã đồng bộ ${sync.source_count} phân công từ Task`, data, sync });
  } catch (error) { await client.query('ROLLBACK'); if (error.status) return fail(res, error.status, error.message); next(error); } finally { client.release(); }
});

router.put('/boards/:id', async (req, res, next) => {
  const b = req.body;
  try {
    const result = await pool.query(`UPDATE shopfloor_work_boards SET shift_name=COALESCE($1,shift_name),shift_start=COALESCE($2,shift_start),
      shift_end=COALESCE($3,shift_end),workshop=COALESCE($4,workshop),announcement=$5,updated_at=NOW()
      WHERE id=$6 AND status NOT IN ('LOCKED','CLOSED') RETURNING *`, [b.shift_name || null, b.shift_start || null, b.shift_end || null, b.workshop || null, b.announcement ?? null, req.params.id]);
    if (!result.rowCount) return fail(res, 404, 'Không tìm thấy bảng hoặc bảng đã khóa/chốt');
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

router.post('/boards/:id/items', async (req, res, next) => {
  const client = await pool.connect(); const b = req.body;
  if (!b.title) return fail(res, 400, 'Thiếu nội dung công việc');
  if (b.source_type === 'ABSENCE' && !(b.employee_ids || []).length) return fail(res, 400, 'Cần chọn nhân viên nghỉ/vắng');
  try {
    await client.query('BEGIN');
    const board = await client.query("SELECT id FROM shopfloor_work_boards WHERE id=$1 AND status NOT IN ('LOCKED','CLOSED') FOR UPDATE", [req.params.id]);
    if (!board.rowCount) throw Object.assign(new Error('Không tìm thấy bảng hoặc bảng đã khóa/chốt'), { status: 404 });
    const sourceType = b.source_type === 'ABSENCE' ? 'ABSENCE' : 'MANUAL';
    const status = sourceType === 'ABSENCE' ? 'ABSENT' : (b.status || 'READY');
    if (sourceType === 'ABSENCE' && !b.start_time && !b.end_time && (b.employee_ids || []).length) {
      const affected = await client.query(`UPDATE shopfloor_work_board_items i SET status='ABSENT',absence_type=$1,absence_reason=$2,updated_at=NOW()
        WHERE i.board_id=$3 AND i.source_type='TASK_ASSIGNMENT'
          AND EXISTS(SELECT 1 FROM shopfloor_work_board_assignments a WHERE a.item_id=i.id AND a.employee_id=ANY($4::int[]))
        RETURNING i.*`, [b.absence_type || 'Nghỉ/Vắng', b.absence_reason || null, req.params.id, b.employee_ids]);
      if (affected.rowCount) {
        await client.query('COMMIT');
        return res.status(201).json({ success: true, data: affected.rows[0], affected_count: affected.rowCount, message: `Đã đánh dấu nghỉ/vắng trên ${affected.rowCount} công việc đã phân công` });
      }
    }
    const result = await client.query(`INSERT INTO shopfloor_work_board_items
      (board_id,project_id,task_id,title,work_area,start_time,end_time,priority,status,progress,notes,sort_order,source_type,absence_type,absence_reason,actual_hours)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,COALESCE($12,(SELECT COALESCE(MAX(sort_order),0)+10 FROM shopfloor_work_board_items WHERE board_id=$1)),$13,$14,$15,$16) RETURNING *`,
    [req.params.id, b.project_id || null, b.task_id || null, b.title, b.work_area || null, b.start_time || null, b.end_time || null,
      b.priority || 'NORMAL', status, Number(b.progress || 0), b.notes || null, b.sort_order || null, sourceType,
      b.absence_type || null, b.absence_reason || null, b.actual_hours ?? null]);
    await replaceAssignments(client, result.rows[0].id, b.employee_ids, b.team_name);
    await client.query('COMMIT'); res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { await client.query('ROLLBACK'); if (error.status) return fail(res, error.status, error.message); next(error); } finally { client.release(); }
});

router.put('/items/:id', async (req, res, next) => {
  const client = await pool.connect(); const b = req.body;
  try {
    await client.query('BEGIN');
    const result = await client.query(`UPDATE shopfloor_work_board_items SET project_id=$1,task_id=$2,title=$3,work_area=$4,start_time=$5,end_time=$6,
      priority=$7,status=$8,progress=$9,notes=$10,sort_order=COALESCE($11,sort_order),absence_type=$12,absence_reason=$13,actual_hours=$14,updated_at=NOW()
      WHERE id=$15 AND EXISTS(SELECT 1 FROM shopfloor_work_boards x WHERE x.id=board_id AND x.status NOT IN ('LOCKED','CLOSED')) RETURNING *`,
    [b.project_id || null, b.task_id || null, b.title, b.work_area || null, b.start_time || null, b.end_time || null,
      b.priority || 'NORMAL', b.status || 'READY', Number(b.progress || 0), b.notes || null, b.sort_order || null,
      b.absence_type || null, b.absence_reason || null, b.actual_hours ?? null, req.params.id]);
    if (!result.rowCount) throw Object.assign(new Error('Không tìm thấy công việc hoặc bảng đã khóa/chốt'), { status: 404 });
    if (Array.isArray(b.employee_ids) || Object.prototype.hasOwnProperty.call(b, 'team_name')) {
      await replaceAssignments(client, req.params.id, b.employee_ids || [], b.team_name);
    }
    await client.query('COMMIT'); res.json({ success: true, data: result.rows[0] });
  } catch (error) { await client.query('ROLLBACK'); if (error.status) return fail(res, error.status, error.message); next(error); } finally { client.release(); }
});

router.delete('/items/:id', async (req, res, next) => {
  try {
    const result = await pool.query(`DELETE FROM shopfloor_work_board_items i WHERE i.id=$1 AND i.source_type<>'TASK_ASSIGNMENT'
      AND EXISTS(SELECT 1 FROM shopfloor_work_boards b WHERE b.id=i.board_id AND b.status NOT IN ('LOCKED','CLOSED')) RETURNING id`, [req.params.id]);
    if (!result.rowCount) return fail(res, 404, 'Chỉ có thể xóa việc phát sinh/nghỉ vắng trên bảng chưa chốt');
    res.json({ success: true, message: 'Đã xóa dòng khỏi bảng' });
  } catch (error) { next(error); }
});

router.post('/boards/:id/publish', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const published = await publishSnapshot(client, req.params.id);
    await client.query('COMMIT');
    res.json({ success: true, message: `Đã công bố phiên bản ${published.version}`, data: { version: published.version, display_url: published.data.display_url } });
  } catch (error) { await client.query('ROLLBACK'); if (error.status) return fail(res, error.status, error.message); next(error); } finally { client.release(); }
});

router.post('/boards/:id/close-day', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const boardResult = await client.query('SELECT * FROM shopfloor_work_boards WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!boardResult.rowCount) throw Object.assign(new Error('Không tìm thấy bảng phân công'), { status: 404 });
    if (!isEditable(boardResult.rows[0].status)) throw Object.assign(new Error('Bảng đã khóa hoặc đã chốt cuối ngày'), { status: 409 });
    await syncTaskAssignments(client, boardResult.rows[0]);
    const published = await publishSnapshot(client, req.params.id, 'CLOSED', req.body.summary || null);
    const data = published.data;
    const employeeIds = new Set(data.items.flatMap(item => item.assignments.filter(x => x.employee_id).map(x => x.employee_id)));
    const projectIds = [...new Set(data.items.filter(item => item.project_id).map(item => item.project_id))];
    const dailyLog = await client.query(`INSERT INTO shopfloor_work_board_daily_logs
      (board_id,log_date,shift_code,shift_name,workshop,summary,item_count,employee_count,absence_count,project_count,snapshot_data)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`, [data.id, data.board_date, data.shift_code, data.shift_name,
      data.workshop, req.body.summary || null, data.items.length, employeeIds.size, data.items.filter(x => x.status === 'ABSENT').length,
      projectIds.length, JSON.stringify(data)]);
    for (const projectId of projectIds) {
      const items = data.items.filter(item => Number(item.project_id) === Number(projectId));
      const projectEmployees = new Set(items.flatMap(item => item.assignments.filter(x => x.employee_id).map(x => x.employee_id)));
      const plannedHours = items.reduce((sum, item) => sum + timeHours(item.start_time, item.end_time), 0);
      const actualHours = items.reduce((sum, item) => sum + Number(item.actual_hours || 0), 0);
      const project = { id: projectId, project_code: items[0]?.project_code, project_name: items[0]?.project_name };
      await client.query(`INSERT INTO shopfloor_project_daily_logs
        (daily_log_id,board_id,project_id,log_date,shift_name,workshop,summary,item_count,employee_count,completed_count,planned_hours,actual_hours,snapshot_data)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [dailyLog.rows[0].id, data.id, projectId, data.board_date,
        data.shift_name, data.workshop, req.body.summary || null, items.length, projectEmployees.size,
        items.filter(x => x.status === 'COMPLETED').length, plannedHours, actualHours,
        JSON.stringify({ project, board: { id: data.id, board_date: data.board_date, shift_name: data.shift_name, workshop: data.workshop }, items })]);
    }
    await client.query('COMMIT');
    res.json({ success: true, message: `Đã chốt ngày và tạo ${projectIds.length} Nhật ký Dự án`, data: { daily_log: dailyLog.rows[0], project_log_count: projectIds.length, version: published.version } });
  } catch (error) { await client.query('ROLLBACK'); if (error.status) return fail(res, error.status, error.message); if (error.code === '23505') return fail(res, 409, 'Bảng này đã có nhật ký cuối ngày'); next(error); } finally { client.release(); }
});

router.post('/boards/:id/lock', async (req, res, next) => {
  try {
    const result = await pool.query("UPDATE shopfloor_work_boards SET status='LOCKED',updated_at=NOW() WHERE id=$1 AND status='PUBLISHED' RETURNING *", [req.params.id]);
    if (!result.rowCount) return fail(res, 409, 'Bảng phải được công bố trước khi khóa');
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

router.get('/public/:token', async (req, res, next) => {
  try {
    const board = await pool.query('SELECT id,status FROM shopfloor_work_boards WHERE display_token=$1', [req.params.token]);
    if (!board.rowCount || board.rows[0].status === 'DRAFT') return fail(res, 404, 'Bảng phân công chưa được công bố');
    const published = await pool.query('SELECT snapshot_data FROM shopfloor_work_board_publications WHERE board_id=$1 ORDER BY version DESC LIMIT 1', [board.rows[0].id]);
    if (!published.rowCount) return fail(res, 404, 'Chưa có phiên bản công bố');
    res.setHeader('Cache-Control', 'no-store');
    const data=board.rows[0].status==='PUBLISHED'
      ? await boardDetail(pool,board.rows[0].id)
      : published.rows[0].snapshot_data;
    res.json({ success: true, data, server_time: new Date().toISOString() });
  } catch (error) { next(error); }
});

module.exports = router;
