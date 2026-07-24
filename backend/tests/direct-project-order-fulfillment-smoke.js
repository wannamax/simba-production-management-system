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
  let projectId;
  let orderId;
  let directTaskId;
  let deliveryTaskId;
  let installationTaskId;
  try {
    const health = await request('/health');
    assert.equal(health.response.status, 200);
    assert.equal(health.body.version, '2.6.0-J');

    const [workflowMeta, employees] = await Promise.all([
      request('/production-workflows/meta'),
      request('/employees?status=Ho%E1%BA%A1t%20%C4%91%E1%BB%99ng&limit=1000'),
    ]);
    const projectType = workflowMeta.body.data.project_types[0];
    const employee = employees.body.data[0];
    assert(projectType, 'Cần ít nhất một Loại dự án');
    assert(employee, 'Cần ít nhất một nhân viên hoạt động');

    const project = await request('/projects', {
      method: 'POST',
      body: JSON.stringify({
        project_name: `Direct Task & Fulfillment ${stamp}`,
        project_type: projectType,
        start_date: '2026-08-03',
        end_date: '2026-08-15',
        priority: 'Trung bình',
      }),
    });
    assert.equal(project.response.status, 201, JSON.stringify(project.body));
    projectId = project.body.data.id;

    let context = await request(`/work-catalog/project-context/${projectId}`);
    assert.equal(context.response.status, 200, JSON.stringify(context.body));
    const supervision = context.body.data.work_items.find(item => item.code === 'SUPERVISION');
    const delivery = context.body.data.work_items.find(item => item.code === 'DELIVERY');
    const installation = context.body.data.work_items.find(item => item.code === 'ON_SITE_INSTALLATION');
    const role = context.body.data.roles[0]?.name;
    assert(supervision && delivery && installation && role, 'Thiếu Công việc hệ thống hoặc Vai trò');

    const direct = await request('/tasks/batch', {
      method: 'POST',
      body: JSON.stringify({
        project_id: projectId,
        task_source_type: 'PROJECT_DIRECT',
        work_item_ids: [supervision.id],
        priority: 'Trung bình',
        assignments: [{ employee_id: employee.id, role_in_task: role, work_dates: ['2026-08-03'] }],
      }),
    });
    assert.equal(direct.response.status, 201, JSON.stringify(direct.body));
    directTaskId = direct.body.data[0].id;
    assert.equal(direct.body.data[0].task_source_type, 'PROJECT_DIRECT');
    assert.equal(direct.body.data[0].production_stage_instance_id, null);

    const order = await request('/orders', {
      method: 'POST',
      body: JSON.stringify({
        project_id: projectId,
        order_date: '2026-08-03',
        items: [{ item_name: 'Sản phẩm tồn kho', unit: 'Cái', quantity: 10, unit_price: 100000 }],
      }),
    });
    assert.equal(order.response.status, 201, JSON.stringify(order.body));
    orderId = order.body.data.id;
    const orderItemId = order.body.data.items[0].id;

    const deliveryTask = await request('/tasks/batch', {
      method: 'POST',
      body: JSON.stringify({
        project_id: projectId,
        task_source_type: 'ORDER_FULFILLMENT',
        order_id: orderId,
        work_item_ids: [delivery.id],
        fulfillment_items: [{ order_item_id: orderItemId, planned_quantity: 6 }],
        priority: 'Cao',
        assignments: [{ employee_id: employee.id, role_in_task: role, work_dates: ['2026-08-04'] }],
      }),
    });
    assert.equal(deliveryTask.response.status, 201, JSON.stringify(deliveryTask.body));
    deliveryTaskId = deliveryTask.body.data[0].id;
    assert.equal(deliveryTask.body.data[0].task_source_type, 'ORDER_FULFILLMENT');
    assert.equal(Number(deliveryTask.body.data[0].order_id), Number(orderId));

    const overAllocated = await request('/tasks/batch', {
      method: 'POST',
      body: JSON.stringify({
        project_id: projectId,
        task_source_type: 'ORDER_FULFILLMENT',
        order_id: orderId,
        work_item_ids: [delivery.id],
        fulfillment_items: [{ order_item_id: orderItemId, planned_quantity: 5 }],
      }),
    });
    assert.equal(overAllocated.response.status, 409, JSON.stringify(overAllocated.body));

    const installationTask = await request('/tasks/batch', {
      method: 'POST',
      body: JSON.stringify({
        project_id: projectId,
        task_source_type: 'ORDER_FULFILLMENT',
        order_id: orderId,
        work_item_ids: [installation.id],
        fulfillment_items: [{ order_item_id: orderItemId, planned_quantity: 10 }],
      }),
    });
    assert.equal(installationTask.response.status, 201, JSON.stringify(installationTask.body));
    installationTaskId = installationTask.body.data[0].id;

    const tasks = await request(`/tasks?project_id=${projectId}`);
    assert.equal(tasks.response.status, 200, JSON.stringify(tasks.body));
    assert(tasks.body.data.some(task => Number(task.id) === Number(directTaskId) && task.task_source_type === 'PROJECT_DIRECT'));
    const linkedDelivery = tasks.body.data.find(task => Number(task.id) === Number(deliveryTaskId));
    assert.equal(linkedDelivery.order_code, order.body.data.order_code);
    assert.equal(Number(linkedDelivery.fulfillment_items[0].planned_quantity), 6);

    context = await request(`/work-catalog/project-context/${projectId}`);
    const contextItem = context.body.data.orders.find(row => Number(row.id) === Number(orderId)).items[0];
    assert.equal(Number(contextItem.delivery_allocated_quantity), 6);
    assert.equal(Number(contextItem.installation_allocated_quantity), 10);

    const orderDetail = await request(`/orders/${orderId}`);
    assert.equal(Number(orderDetail.body.data.items[0].delivery_planned_quantity), 6);
    assert.equal(Number(orderDetail.body.data.items[0].installation_planned_quantity), 10);

    const deletedOrder = await request(`/orders/${orderId}`, { method: 'DELETE' });
    assert.equal(deletedOrder.response.status, 200, JSON.stringify(deletedOrder.body));
    assert.equal(deletedOrder.body.data.deleted_task_count, 2);
    orderId = null;
    assert.equal((await request(`/tasks/${deliveryTaskId}`)).response.status, 404);
    assert.equal((await request(`/tasks/${installationTaskId}`)).response.status, 404);
    deliveryTaskId = null;
    installationTaskId = null;

    console.log('Direct Project Tasks & Order Fulfillment 2.6.0-J smoke test passed');
  } finally {
    if (deliveryTaskId) await request(`/tasks/${deliveryTaskId}`, { method: 'DELETE' }).catch(() => {});
    if (installationTaskId) await request(`/tasks/${installationTaskId}`, { method: 'DELETE' }).catch(() => {});
    if (orderId) await request(`/orders/${orderId}`, { method: 'DELETE' }).catch(() => {});
    if (directTaskId) await request(`/tasks/${directTaskId}`, { method: 'DELETE' }).catch(() => {});
    if (projectId) await request(`/projects/${projectId}`, { method: 'DELETE' }).catch(() => {});
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
