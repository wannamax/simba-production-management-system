const assert = require('node:assert/strict');

const base = process.env.BASE_URL || process.env.TEST_BASE_URL || 'http://localhost:8080/api';
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
    assert.equal(health.body.version, '2.6.0-J');

    const meta = await request('/production-workflows/meta');
    const projectType = meta.body.data.project_types[0];
    const workItem = meta.body.data.work_items[0];
    assert.ok(projectType && workItem);

    const project = await request('/projects', {
      method: 'POST',
      body: JSON.stringify({
        project_name: `Order History ${stamp}`,
        project_type: projectType,
        start_date: '2026-07-23',
        end_date: '2026-08-23',
        priority: 'Trung bình',
      }),
    });
    assert.equal(project.status, 201, JSON.stringify(project.body));
    projectId = project.body.data.id;

    const process = await request('/production-workflows/processes', {
      method: 'POST',
      body: JSON.stringify({
        code: `HISTORY_${stamp}`,
        name: `Quy trình History ${stamp}`,
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
        order_date: '2026-07-23',
        items: [{ item_code: 'H01', item_name: 'Hộp trưng bày', unit: 'Cái', quantity: 50, unit_price: 1000 }],
      }),
    });
    assert.equal(order.status, 201, JSON.stringify(order.body));
    const orderId = order.body.data.id;
    const itemId = order.body.data.items[0].id;

    const plan = await request('/production-plans', {
      method: 'POST',
      body: JSON.stringify({
        order_id: orderId,
        time_mode: 'PROJECT',
        groups: [{ group_name: 'Lệnh test lịch sử', process_id: processId, items: [{ order_item_id: itemId, planned_quantity: 50 }], stages: [] }],
        global_assignments: [],
      }),
    });
    assert.equal(plan.status, 201, JSON.stringify(plan.body));
    const planId = plan.body.data.id;
    const productionId = plan.body.data.groups[0].id;
    const productionCode = plan.body.data.groups[0].production_code;

    const cancelled = await request(`/production-plans/groups/${productionId}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason: 'Test hủy trả số lượng về đơn' }),
    });
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));

    const afterCancel = await request(`/orders/${orderId}`);
    assert.equal(afterCancel.status, 200);
    assert.equal(Number(afterCancel.body.data.items[0].allocated_quantity), 0);
    assert.ok(afterCancel.body.data.execution_logs.some(log => log.event_type === 'PRODUCTION_CANCELLED' && log.production_order_snapshot?.production_code === productionCode));

    const purged = await request(`/production-plans/${planId}/purge-cancelled`, {
      method: 'DELETE',
      body: JSON.stringify({ reason: 'Test dọn Kế hoạch đã hủy khỏi danh sách' }),
    });
    assert.equal(purged.status, 200, JSON.stringify(purged.body));

    const list = await request(`/production-workflows/orders?order_id=${orderId}`);
    assert.equal(list.status, 200);
    assert.equal(list.body.data.some(row => Number(row.id) === Number(productionId)), false);

    const finalOrder = await request(`/orders/${orderId}`);
    assert.ok(finalOrder.body.data.execution_logs.some(log => log.event_type === 'PRODUCTION_PURGED' && log.production_order_snapshot?.production_code === productionCode));
    assert.equal(Number(finalOrder.body.data.items[0].allocated_quantity), 0);
    console.log(`Order Execution History 2.6.0-J smoke test passed (${productionCode})`);
  } finally {
    if (projectId) await request(`/projects/${projectId}`, { method: 'DELETE' }).catch(() => {});
    if (processId) await request(`/production-workflows/processes/${processId}`, { method: 'DELETE' }).catch(() => {});
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
