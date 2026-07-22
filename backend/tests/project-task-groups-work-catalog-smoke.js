const assert = require('node:assert/strict');

const baseUrl = (process.env.TEST_BASE_URL || 'http://localhost:8080').replace(/\/$/, '');
async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}/api${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

(async () => {
  const stamp = Date.now();
  let temporaryGroupId;
  let temporaryItemId;
  let projectId;
  const taskIds = [];
  try {
    const health = await request('/health');
    assert.equal(health.response.status, 200);
    assert.equal(health.body.version, '2.6.0-I');

    const group = await request('/work-catalog/groups', {
      method: 'POST', body: JSON.stringify({ code:`SMOKE_${stamp}`, name:`Nhóm kiểm thử ${stamp}` }),
    });
    assert.equal(group.response.status, 201, JSON.stringify(group.body));
    temporaryGroupId = group.body.data.id;
    const item = await request('/work-catalog/items', {
      method: 'POST', body: JSON.stringify({
        group_id:temporaryGroupId, code:`SMOKE_${stamp}`, name:`Công việc kiểm thử ${stamp}`,
        project_types:[], default_estimated_hours:2,
      }),
    });
    assert.equal(item.response.status, 201, JSON.stringify(item.body));
    assert.equal(item.body.data.default_estimated_hours, null);
    temporaryItemId = item.body.data.id;
    const filtered = await request('/work-catalog/items?project_type=B%E1%BA%A3ng%20hi%E1%BB%87u');
    assert(filtered.body.data.some(row => row.id === temporaryItemId));

    const customers = await request('/customers');
    const employees = await request('/employees?status=Ho%E1%BA%A1t%20%C4%91%E1%BB%99ng');
    assert(customers.body.data.length, 'Cần ít nhất một khách hàng để kiểm thử');
    assert(employees.body.data.length, 'Cần ít nhất một nhân viên để kiểm thử');
    const employee = employees.body.data[0];

    const project = await request('/projects', {
      method:'POST', body:JSON.stringify({
        project_name:`Task Group Smoke ${stamp}`, project_type:'Bảng hiệu',
        customer_id:customers.body.data[0].id, start_date:'2026-07-21', end_date:'2026-07-25', priority:'Trung bình',
      }),
    });
    assert.equal(project.response.status, 201, JSON.stringify(project.body));
    projectId = project.body.data.id;
    const assignment = await request(`/projects/${projectId}/assignments`, {
      method:'POST', body:JSON.stringify({ employee_id:employee.id, role:'Thành viên' }),
    });
    assert.equal(assignment.response.status, 201, JSON.stringify(assignment.body));

    const context = await request(`/work-catalog/project-context/${projectId}`);
    assert.equal(context.response.status, 200, JSON.stringify(context.body));
    assert.equal(context.body.data.project.project_type, 'Bảng hiệu');
    assert(context.body.data.employees.some(row => row.id === employee.id));
    assert(context.body.data.work_items.some(row => row.id === temporaryItemId), 'Công việc áp dụng Tất cả phải xuất hiện ngay trong dropdown phân công');
    const workItem = context.body.data.work_items.find(row => row.code === 'DESIGN');
    assert(workItem, 'Thiếu công việc Thiết kế cho Loại dự án Bảng hiệu');

    const createTask = async suffix => request('/tasks', {
      method:'POST', body:JSON.stringify({
        project_id:projectId, work_item_id:workItem.id, start_date:'2026-07-22', end_date:'2026-07-23',
        priority:'Trung bình', assignments:[{ employee_id:employee.id, start_date:'2026-07-22', end_date:'2026-07-23' }],
        notes:`Smoke ${suffix}`,
      }),
    });
    const first = await createTask('A');
    assert.equal(first.response.status, 201, JSON.stringify(first.body)); taskIds.push(first.body.data.id);
    assert.equal(first.body.data.task_name, 'Thiết kế');
    const second = await createTask('B');
    assert.equal(second.response.status, 201, JSON.stringify(second.body)); taskIds.push(second.body.data.id);
    assert(second.body.warnings?.length, 'Lịch trùng phải trả cảnh báo nhưng vẫn tạo Task');

    const tasks = await request(`/tasks?project_id=${projectId}`);
    assert.equal(tasks.body.data.length, 2);
    assert(tasks.body.data.every(row => row.work_group_name === 'Văn phòng'));
    assert(tasks.body.data.every(row => row.assignments.some(a => a.employee_id === employee.id)));

    console.log('Project Task Groups & Work Catalog 2.6.0-I smoke test passed');
  } finally {
    for (const id of taskIds) await request(`/tasks/${id}`, { method:'DELETE' }).catch(() => {});
    if (projectId) await request(`/projects/${projectId}`, { method:'DELETE' }).catch(() => {});
    if (temporaryItemId) await request(`/work-catalog/items/${temporaryItemId}`, { method:'DELETE' }).catch(() => {});
    if (temporaryGroupId) await request(`/work-catalog/groups/${temporaryGroupId}`, { method:'DELETE' }).catch(() => {});
  }
})().catch(error => { console.error(error); process.exit(1); });
