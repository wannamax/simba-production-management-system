const assert = require('node:assert/strict');

const baseUrl = (process.env.TEST_BASE_URL || 'http://localhost:8080').replace(/\/$/, '');
async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}/api${path}`, {
    ...options,
    headers: { 'content-type':'application/json', ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}
const localDate = value => new Intl.DateTimeFormat('en-CA', {
  timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit',
}).format(new Date(value));

(async () => {
  const stamp = Date.now();
  let projectId;
  let taskId;
  try {
    const health = await request('/health');
    assert.equal(health.body.version,'2.6.0-I');

    const [customers,employees] = await Promise.all([
      request('/customers?limit=1000'),
      request('/employees?status=Ho%E1%BA%A1t%20%C4%91%E1%BB%99ng'),
    ]);
    assert(customers.body.data?.length,'Cần ít nhất một khách hàng');
    assert(employees.body.data?.length >= 2,'Cần ít nhất hai nhân viên');

    const project = await request('/projects', {
      method:'POST',
      body:JSON.stringify({
        project_name:`Assignment Calendar Smoke ${stamp}`,project_type:'Bảng hiệu',
        customer_id:customers.body.data[0].id,start_date:'2026-07-20',end_date:'2026-08-05',priority:'Trung bình',
      }),
    });
    assert.equal(project.response.status,201,JSON.stringify(project.body));
    projectId = project.body.data.id;

    const context = await request(`/work-catalog/project-context/${projectId}`);
    const workItem = context.body.data.work_items[0];
    const role = context.body.data.roles.find(item=>item.is_default)?.name || context.body.data.roles[0].name;
    assert(workItem,'Thiếu công việc phù hợp');

    const firstDates = ['2026-07-27','2026-07-28','2026-07-29'];
    const secondDates = ['2026-07-27','2026-07-28','2026-07-29','2026-07-30'];
    const task = await request('/tasks', {
      method:'POST',
      body:JSON.stringify({
        project_id:projectId,work_item_id:workItem.id,priority:'Trung bình',
        assignments:[
          {employee_id:employees.body.data[0].id,role_in_task:role,work_dates:firstDates},
          {employee_id:employees.body.data[1].id,role_in_task:role,work_dates:secondDates},
        ],
      }),
    });
    assert.equal(task.response.status,201,JSON.stringify(task.body));
    taskId = task.body.data.id;
    assert.equal(localDate(task.body.data.start_date),'2026-07-27');
    assert.equal(localDate(task.body.data.end_date),'2026-07-30');
    assert.equal(Number(task.body.data.estimated_duration),4);
    assert.equal(Number(task.body.data.estimated_hours),56);

    const detail = await request(`/tasks/${taskId}`);
    assert.equal(detail.response.status,200,JSON.stringify(detail.body));
    assert.deepEqual(detail.body.data.assignments.find(item=>item.employee_id===employees.body.data[0].id).work_dates,firstDates);
    assert.equal(Number(detail.body.data.assignments.find(item=>item.employee_id===employees.body.data[1].id).planned_hours),32);

    const editedAssignment = await request(`/tasks/${taskId}/assignments`, {
      method:'POST',body:JSON.stringify({employee_id:employees.body.data[0].id,role_in_task:role,work_dates:firstDates.slice(0,2)}),
    });
    assert.equal(editedAssignment.response.status,201,JSON.stringify(editedAssignment.body));
    assert.equal(Number(editedAssignment.body.task_plan.estimated_hours),48);
    const restoredAssignment = await request(`/tasks/${taskId}/assignments`, {
      method:'POST',body:JSON.stringify({employee_id:employees.body.data[0].id,role_in_task:role,work_dates:firstDates}),
    });
    assert.equal(restoredAssignment.response.status,201,JSON.stringify(restoredAssignment.body));
    assert.equal(Number(restoredAssignment.body.task_plan.estimated_hours),56);

    const onLastDay = await request(`/tasks?from_date=2026-07-30&to_date=2026-07-30`);
    assert(onLastDay.body.data.some(item=>item.id===taskId),'Task phải xuất hiện trong lọc ngày 30/07');
    const afterPlan = await request(`/tasks?from_date=2026-07-31&to_date=2026-07-31`);
    assert(!afterPlan.body.data.some(item=>item.id===taskId),'Task không được xuất hiện ngoài lịch đã chọn');

    const availability = await request(`/employees/availability?employee_ids=${employees.body.data[0].id}&start_date=2026-07-27&end_date=2026-07-30`);
    assert.equal(Number(availability.body.data[0].total_assigned_hours),24);

    console.log('Assignment Calendar & Task Views 2.6.0-I smoke test passed');
  } finally {
    if (taskId) await request(`/tasks/${taskId}`, { method:'DELETE' }).catch(()=>{});
    if (projectId) await request(`/projects/${projectId}`, { method:'DELETE' }).catch(()=>{});
  }
})().catch(error=>{console.error(error);process.exit(1);});
