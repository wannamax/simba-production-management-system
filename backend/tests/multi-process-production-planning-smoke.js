const assert = require('node:assert/strict');

const base = process.env.BASE_URL || 'http://localhost:8080/api';
async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}
function localDate(value) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}

(async () => {
  const stamp = Date.now();
  let projectId;
  const processIds = [];
  try {
    const health = await request('/health');
    assert.equal(health.status, 200);
    assert.equal(health.body.version, '2.6.0-K');

    const meta = await request('/production-workflows/meta');
    assert.equal(meta.status, 200);
    const projectType = meta.body.data.project_types[0];
    const workItem = meta.body.data.work_items[0];
    assert.ok(projectType && workItem, 'Cần Loại dự án và Công việc để kiểm thử');
    const employees = await request('/employees?limit=1000');
    const employee = employees.body.data.find(row => row.status === 'Hoạt động') || employees.body.data[0];
    assert.ok(employee, 'Cần ít nhất một nhân viên hoạt động');

    const project = await request('/projects', {
      method: 'POST',
      body: JSON.stringify({ project_name: `Multi Process Smoke ${stamp}`, project_type: projectType, start_date: '2026-07-22', end_date: '2026-08-15', priority: 'Trung bình' }),
    });
    assert.equal(project.status, 201, JSON.stringify(project.body));
    projectId = project.body.data.id;

    for (const definition of [
      { suffix: 'LARGE', name: 'Quy trình Kệ lớn', stage: 'Gia công Kệ lớn' },
      { suffix: 'SMALL', name: 'Quy trình Kệ nhỏ', stage: 'Gia công Kệ nhỏ' },
    ]) {
      const created = await request('/production-workflows/processes', {
        method: 'POST',
        body: JSON.stringify({
          code: `MPS_${definition.suffix}_${stamp}`,
          name: `${definition.name} ${stamp}`,
          project_types: [projectType],
          stages: [{ code: `STAGE_${definition.suffix}`, name: definition.stage, work_item_id: workItem.id, is_required: true, tracks_quantity: true, default_hours: 8 }],
        }),
      });
      assert.equal(created.status, 201, JSON.stringify(created.body));
      processIds.push(created.body.data.id);
    }

    const order = await request('/orders', {
      method: 'POST',
      body: JSON.stringify({
        project_id: projectId, order_date: '2026-07-22', expected_delivery_date: '2026-08-15',
        items: [
          { item_code: 'LARGE', item_name: 'Kệ trưng bày lớn', unit: 'Cái', quantity: 100, unit_price: 200000 },
          { item_code: 'SMALL', item_name: 'Kệ trưng bày nhỏ', unit: 'Cái', quantity: 200, unit_price: 50000 },
        ],
      }),
    });
    assert.equal(order.status, 201, JSON.stringify(order.body));
    const orderId = order.body.data.id;
    const context = await request(`/production-workflows/context/${orderId}`);
    assert.equal(context.status, 200, JSON.stringify(context.body));
    assert.equal(localDate(context.body.data.order.project_start_date), '2026-07-22');
    const role = context.body.data.roles.find(row => /giám sát|quản lý/i.test(row.name))?.name || context.body.data.roles[0].name;
    const [largeItem, smallItem] = context.body.data.order.items;

    const plan = await request('/production-plans', {
      method: 'POST',
      body: JSON.stringify({
        order_id: orderId,
        time_mode: 'PROJECT',
        global_assignments: [{ employee_id: employee.id, role, time_mode: 'PROJECT' }],
        groups: [
          { group_name: 'Kệ lớn — Đợt 1', process_id: processIds[0], items: [{ order_item_id: largeItem.id, planned_quantity: 60 }], stages: [] },
          { group_name: 'Kệ nhỏ — Đợt 1', process_id: processIds[1], items: [{ order_item_id: smallItem.id, planned_quantity: 120 }], stages: [] },
        ],
      }),
    });
    assert.equal(plan.status, 201, JSON.stringify(plan.body));
    assert.equal(plan.body.data.groups.length, 2);
    assert.notEqual(plan.body.data.groups[0].process_id, plan.body.data.groups[1].process_id);
    assert.equal(plan.body.data.assignments.length, 1);
    assert.equal(plan.body.data.assignments[0].time_mode, 'PROJECT');
    assert.equal(localDate(plan.body.data.assignments[0].start_date), '2026-07-22');
    assert.ok(plan.body.data.groups.every(group => group.stages.length === 1 && !group.stages[0].task_id && group.stages[0].works.length === 0));
    assert.ok(plan.body.data.groups.every(group => localDate(group.stages[0].planned_start_date) === '2026-07-22'));

    const fetched = await request(`/production-plans/${plan.body.data.id}`);
    assert.equal(fetched.status, 200);
    assert.equal(fetched.body.data.plan_code, plan.body.data.plan_code);

    const overAllocation = await request('/production-plans', {
      method: 'POST',
      body: JSON.stringify({ order_id: orderId, time_mode: 'PHASE', planned_start_date: '2026-07-25', planned_end_date: '2026-07-30', groups: [{ process_id: processIds[0], items: [{ order_item_id: largeItem.id, planned_quantity: 41 }] }] }),
    });
    assert.equal(overAllocation.status, 409, JSON.stringify(overAllocation.body));

    for (const group of plan.body.data.groups) {
      for (const stage of group.stages) {
        for (const item of stage.items) {
          const output = await request(`/production-workflows/stage-items/${item.id}/output`, {
            method: 'POST', body: JSON.stringify({ output_date: '2026-07-30', good_quantity: Number(item.planned_quantity), defect_quantity: 0, rework_quantity: 0 }),
          });
          assert.equal(output.status, 200, JSON.stringify(output.body));
        }
      }
    }
    const readyPlan = await request(`/production-plans/${plan.body.data.id}`);
    assert.equal(readyPlan.body.data.status, 'READY_FOR_DELIVERY');
    for (const group of readyPlan.body.data.groups) {
      const completed = await request(`/production-workflows/orders/${group.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'COMPLETED' }) });
      assert.equal(completed.status, 200, JSON.stringify(completed.body));
    }
    const completedPlan = await request(`/production-plans/${plan.body.data.id}`);
    assert.equal(completedPlan.body.data.status, 'COMPLETED');

    const phasePlan = await request('/production-plans', {
      method: 'POST',
      body: JSON.stringify({
        order_id: orderId, time_mode: 'PHASE', planned_start_date: '2026-08-01', planned_end_date: '2026-08-05',
        groups: [{ group_name: 'Phần còn lại', process_id: processIds[0], items: [{ order_item_id: largeItem.id, planned_quantity: 40 }, { order_item_id: smallItem.id, planned_quantity: 80 }], stages: [] }],
      }),
    });
    assert.equal(phasePlan.status, 201, JSON.stringify(phasePlan.body));
    assert.equal(localDate(phasePlan.body.data.groups[0].stages[0].planned_start_date), '2026-08-01');
    assert.equal(localDate(phasePlan.body.data.groups[0].stages[0].planned_end_date), '2026-08-05');

    console.log(`Multi-Process Production Planning 2.6.0-K smoke test passed (${plan.body.data.plan_code})`);
  } finally {
    if (projectId) await request(`/projects/${projectId}`, { method: 'DELETE' }).catch(() => {});
    for (const processId of processIds) await request(`/production-workflows/processes/${processId}`, { method: 'DELETE' }).catch(() => {});
  }
})().catch(error => { console.error(error); process.exit(1); });
