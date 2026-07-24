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

(async () => {
  const stamp = Date.now();
  let projectId;
  let processId;
  try {
    const health = await request('/health');
    assert.equal(health.status, 200);
    assert.equal(health.body.version, '2.6.0-K');

    const meta = await request('/production-workflows/meta');
    const projectType = meta.body.data.project_types[0];
    const workItem = meta.body.data.work_items[0];
    const employees = await request('/employees?limit=1000');
    const employee = employees.body.data.find(row => row.status === 'Hoạt động') || employees.body.data[0];
    assert.ok(projectType && workItem && employee);

    const project = await request('/projects', {
      method: 'POST',
      body: JSON.stringify({
        project_name: `Order cancel/delete H ${stamp}`,
        project_type: projectType,
        start_date: '2026-07-22',
        end_date: '2026-08-15',
        priority: 'Trung bình',
      }),
    });
    assert.equal(project.status, 201, JSON.stringify(project.body));
    projectId = project.body.data.id;

    const process = await request('/production-workflows/processes', {
      method: 'POST',
      body: JSON.stringify({
        code: `H_ORDER_DELETE_${stamp}`,
        name: `Quy trình xóa đơn H ${stamp}`,
        project_types: [projectType],
        stages: [{ code: 'MAKE', name: 'Sản xuất', work_item_id: workItem.id, is_required: true, tracks_quantity: true }],
      }),
    });
    assert.equal(process.status, 201, JSON.stringify(process.body));
    processId = process.body.data.id;

    const order = await request('/orders', {
      method: 'POST',
      body: JSON.stringify({
        project_id: projectId,
        order_date: '2026-07-22',
        items: [{ item_name: 'Hạng mục xóa đơn', unit: 'Cái', quantity: 5, unit_price: 1000 }],
      }),
    });
    assert.equal(order.status, 201, JSON.stringify(order.body));
    const orderId = order.body.data.id;
    const itemId = order.body.data.items[0].id;
    const context = await request(`/production-workflows/context/${orderId}`);
    const role = context.body.data.roles[0].name;

    const plan = await request('/production-plans', {
      method: 'POST',
      body: JSON.stringify({
        order_id: orderId,
        time_mode: 'PHASE',
        planned_start_date: '2026-07-22',
        planned_end_date: '2026-07-25',
        groups: [{ group_name: 'Nhóm đang sản xuất', process_id: processId, items: [{ order_item_id: itemId, planned_quantity: 5 }], stages: [] }],
      }),
    });
    assert.equal(plan.status, 201, JSON.stringify(plan.body));
    const stage = plan.body.data.groups[0].stages[0];
    const fullyPlannedOrders = await request(`/orders?project_id=${projectId}`);
    assert.equal(fullyPlannedOrders.status, 200, JSON.stringify(fullyPlannedOrders.body));
    assert.equal(fullyPlannedOrders.body.data.find(row => Number(row.id) === Number(orderId)).has_remaining_quantity, false);

    const work = await request('/tasks', {
      method: 'POST',
      body: JSON.stringify({
        project_id: projectId,
        production_stage_instance_id: stage.id,
        work_item_id: workItem.id,
        priority: 'Trung bình',
        assignments: [{ employee_id: employee.id, role_in_task: role, work_dates: ['2026-07-23'] }],
      }),
    });
    assert.equal(work.status, 201, JSON.stringify(work.body));

    const cancelled = await request(`/orders/${orderId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'Kiểm thử hủy đơn hàng đang sản xuất' }),
    });
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
    assert.equal(cancelled.body.data.cancelled_task_count, 1);
    const cancelledOrder = await request(`/orders/${orderId}`);
    assert.equal(cancelledOrder.body.data.status, 'CANCELLED');
    assert.ok(cancelledOrder.body.data.production_orders.every(row => row.status === 'CANCELLED'));

    const deleted = await request(`/orders/${orderId}`, { method: 'DELETE' });
    assert.equal(deleted.status, 200, JSON.stringify(deleted.body));
    assert.equal(deleted.body.data.deleted_task_count, 1);
    assert.equal((await request(`/orders/${orderId}`)).status, 404);
    assert.equal((await request(`/tasks/${work.body.data.id}`)).status, 404);

    console.log(`Order cancel/delete 2.6.0-K smoke test passed (${order.body.data.order_code})`);
  } finally {
    if (projectId) await request(`/projects/${projectId}`, { method: 'DELETE' }).catch(() => {});
    if (processId) await request(`/production-workflows/processes/${processId}`, { method: 'DELETE' }).catch(() => {});
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
