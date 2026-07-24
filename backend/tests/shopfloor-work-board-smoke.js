const assert = require('assert');

const baseUrl = (process.env.TEST_BASE_URL || 'http://localhost:8080').replace(/\/$/, '');
async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}/api${path}`, { ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  return { response, body };
}

(async () => {
  const health = await request('/health');
  assert.equal(health.response.status, 200);
  assert.equal(health.body.version, '2.6.0-J');

  const meta = await request('/shopfloor-work-board/meta');
  assert.equal(meta.response.status, 200, JSON.stringify(meta.body));
  assert(meta.body.data.projects.length, 'Cần ít nhất một dự án để kiểm tra Nhật ký Dự án');
  assert(meta.body.data.employees.length, 'Cần ít nhất một nhân viên để kiểm tra phân công theo người');
  const project = meta.body.data.projects[0];
  const employee = meta.body.data.employees[0];
  const stamp = Date.now();
  const boardDate = new Date().toISOString().slice(0, 10);

  const created = await request('/shopfloor-work-board/boards', {
    method: 'POST',
    body: JSON.stringify({
      board_date: boardDate,
      shift_code: `SMOKE_SYNC_${stamp}`,
      shift_name: 'Ca kiểm thử Task/Journal',
      shift_start: '07:30',
      shift_end: '16:30',
      workshop: `Xưởng Smoke Sync ${stamp}`,
      announcement: 'An toàn là trước hết',
    }),
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.body));
  const boardId = created.body.data.id;

  const synced = await request(`/shopfloor-work-board/boards/${boardId}/sync-tasks`, { method: 'POST' });
  assert.equal(synced.response.status, 200, JSON.stringify(synced.body));
  assert(Number.isInteger(synced.body.sync.source_count));
  assert(Number.isInteger(synced.body.sync.removed_count));

  const lateItem = await request(`/shopfloor-work-board/boards/${boardId}/items`, {
    method: 'POST',
    body: JSON.stringify({
      project_id: project.id,
      title: 'Đóng gói cuối ca',
      work_area: 'Khu B',
      start_time: '13:00',
      end_time: '15:30',
      priority: 'NORMAL',
      status: 'READY',
      progress: 0,
      actual_hours: 2.25,
      employee_ids: [employee.id],
      source_type: 'MANUAL',
    }),
  });
  assert.equal(lateItem.response.status, 201, JSON.stringify(lateItem.body));

  const earlyItem = await request(`/shopfloor-work-board/boards/${boardId}/items`, {
    method: 'POST',
    body: JSON.stringify({
      project_id: project.id,
      title: 'Chuẩn bị đầu ca',
      work_area: 'Khu A',
      start_time: '08:00',
      end_time: '10:30',
      priority: 'HIGH',
      status: 'IN_PROGRESS',
      progress: 45,
      actual_hours: 2.5,
      employee_ids: [employee.id],
      source_type: 'MANUAL',
    }),
  });
  assert.equal(earlyItem.response.status, 201, JSON.stringify(earlyItem.body));

  const absence = await request(`/shopfloor-work-board/boards/${boardId}/items`, {
    method: 'POST',
    body: JSON.stringify({
      title: 'Nghỉ phép',
      source_type: 'ABSENCE',
      absence_type: 'Nghỉ phép',
      absence_reason: 'Kiểm thử ghi nhận nghỉ trong ngày',
      status: 'ABSENT',
      employee_ids: [employee.id],
    }),
  });
  assert.equal(absence.response.status, 201, JSON.stringify(absence.body));

  let detail = await request(`/shopfloor-work-board/boards/${boardId}`);
  assert.equal(detail.response.status, 200);
  const earlyIndex = detail.body.data.items.findIndex(item => item.id === earlyItem.body.data.id);
  const lateIndex = detail.body.data.items.findIndex(item => item.id === lateItem.body.data.id);
  assert(earlyIndex >= 0 && lateIndex >= 0 && earlyIndex < lateIndex, 'Công việc phải được sắp theo giờ bắt đầu');
  assert.equal(detail.body.data.items.find(item => item.id === absence.body.data.id).status, 'ABSENT');

  const published = await request(`/shopfloor-work-board/boards/${boardId}/publish`, { method: 'POST' });
  assert.equal(published.response.status, 200, JSON.stringify(published.body));
  const publicBoard = await request(`/shopfloor-work-board/public/${detail.body.data.display_token}`);
  assert.equal(publicBoard.response.status, 200);
  assert(publicBoard.body.data.items.some(item => item.title === 'Chuẩn bị đầu ca'));

  const closed = await request(`/shopfloor-work-board/boards/${boardId}/close-day`, {
    method: 'POST',
    body: JSON.stringify({ summary: 'Hoàn tất kiểm thử bảng ngày và Nhật ký Dự án' }),
  });
  assert.equal(closed.response.status, 200, JSON.stringify(closed.body));
  assert.equal(closed.body.data.project_log_count, 1);

  detail = await request(`/shopfloor-work-board/boards/${boardId}`);
  assert.equal(detail.body.data.status, 'CLOSED');
  assert(detail.body.data.daily_log);
  const logs = await request(`/shopfloor-work-board/project-logs?project_id=${project.id}`);
  assert.equal(logs.response.status, 200);
  const projectLog = logs.body.data.find(log => Number(log.board_id) === Number(boardId));
  assert(projectLog, 'Nhật ký Dự án phải được tạo khi chốt ngày');
  assert(Number(projectLog.item_count) >= 2);
  assert(Number(projectLog.planned_hours) >= 5);
  assert.equal(Number(projectLog.actual_hours), 4.75);

  const rejected = await request(`/shopfloor-work-board/items/${earlyItem.body.data.id}`, {
    method: 'PUT',
    body: JSON.stringify({ title: 'Không được sửa sau chốt', status: 'COMPLETED', progress: 100 }),
  });
  assert.equal(rejected.response.status, 404);
  console.log(`Daily Shopfloor Work Board 2.6.0-J Task/Journal smoke test passed (board ${boardId})`);
})().catch(error => { console.error(error); process.exit(1); });
