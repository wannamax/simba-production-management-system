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

(async () => {
  const stamp = Date.now();
  let roleId;
  let projectId;
  let taskId;
  let assignmentId;
  let productId;
  try {
    const health = await request('/health');
    assert.equal(health.body.version,'2.6.0-I');

    const role = await request('/work-catalog/roles', {
      method:'POST',
      body:JSON.stringify({ code:`SMOKE_ROLE_${stamp}`,name:`Vai trò smoke ${stamp}`,sort_order:950 }),
    });
    assert.equal(role.response.status,201,JSON.stringify(role.body));
    roleId = role.body.data.id;
    const updatedRole = await request(`/work-catalog/roles/${roleId}`, {
      method:'PUT',
      body:JSON.stringify({ name:`Vai trò smoke updated ${stamp}`,sort_order:951,is_active:true }),
    });
    assert.equal(updatedRole.response.status,200,JSON.stringify(updatedRole.body));
    const deletedRole = await request(`/work-catalog/roles/${roleId}`, { method:'DELETE' });
    assert.equal(deletedRole.response.status,200,JSON.stringify(deletedRole.body));
    roleId = null;

    const [customers,employees] = await Promise.all([
      request('/customers?limit=1000'),
      request('/employees?status=Ho%E1%BA%A1t%20%C4%91%E1%BB%99ng'),
    ]);
    assert(customers.body.data?.length,'Cần ít nhất một khách hàng');
    assert(employees.body.data?.length,'Cần ít nhất một nhân viên');
    const employee = employees.body.data[0];

    const project = await request('/projects', {
      method:'POST',
      body:JSON.stringify({
        project_name:`Workspace Sync Smoke ${stamp}`,project_type:'Bảng hiệu',
        customer_id:customers.body.data[0].id,start_date:'2026-07-22',end_date:'2026-07-25',priority:'Trung bình',
      }),
    });
    assert.equal(project.response.status,201,JSON.stringify(project.body));
    projectId = project.body.data.id;

    const context = await request(`/work-catalog/project-context/${projectId}`);
    assert.equal(context.response.status,200,JSON.stringify(context.body));
    assert(context.body.data.roles.some(item=>item.name==='Thành viên'));
    const candidate = context.body.data.employees.find(item=>item.id===employee.id);
    assert(candidate && !candidate.is_project_member,'Nhân viên phải sẵn sàng dù chưa thuộc dự án');
    const workItem = context.body.data.work_items.find(item=>item.code==='DESIGN');
    assert(workItem,'Thiếu công việc Thiết kế');

    const task = await request('/tasks', {
      method:'POST',
      body:JSON.stringify({
        project_id:projectId,work_item_id:workItem.id,start_date:'2026-07-22',end_date:'2026-07-23',
        assignments:[{employee_id:employee.id,role_in_task:'Thành viên'}],
      }),
    });
    assert.equal(task.response.status,201,JSON.stringify(task.body));
    assert.deepEqual(task.body.synced_project_employees,[employee.full_name]);
    taskId = task.body.data.id;

    const projectAfterSync = await request(`/projects/${projectId}`);
    const syncedAssignment = projectAfterSync.body.data.employees.find(item=>item.employee_id===employee.id);
    assert(syncedAssignment,'Nhân viên phải được đồng bộ vào Dự án');
    assignmentId = syncedAssignment.id;
    const blockedRemoval = await request(`/projects/${projectId}/assignments/${assignmentId}`, { method:'DELETE' });
    assert.equal(blockedRemoval.response.status,409,JSON.stringify(blockedRemoval.body));

    const product = await request(`/projects/${projectId}/products`, {
      method:'POST',body:JSON.stringify({product_name:`Sản phẩm smoke ${stamp}`,product_type:'Bảng hiệu',quantity:2,unit_price:1000}),
    });
    assert.equal(product.response.status,201,JSON.stringify(product.body));
    productId = product.body.data.id;
    const productUpdate = await request(`/projects/${projectId}/products/${productId}`, {
      method:'PUT',body:JSON.stringify({...product.body.data,quantity:3,unit_price:2000,production_status:'Đang sản xuất'}),
    });
    assert.equal(productUpdate.response.status,200,JSON.stringify(productUpdate.body));
    assert.equal(Number(productUpdate.body.data.total_price),6000);
    const productDelete = await request(`/projects/${projectId}/products/${productId}`, { method:'DELETE' });
    assert.equal(productDelete.response.status,200,JSON.stringify(productDelete.body));
    productId = null;

    await request(`/tasks/${taskId}`, { method:'DELETE' });
    taskId = null;
    const removed = await request(`/projects/${projectId}/assignments/${assignmentId}`, { method:'DELETE' });
    assert.equal(removed.response.status,200,JSON.stringify(removed.body));
    assignmentId = null;

    console.log('Project Workspace & Assignment Sync 2.6.0-I smoke test passed');
  } finally {
    if (productId && projectId) await request(`/projects/${projectId}/products/${productId}`, { method:'DELETE' }).catch(()=>{});
    if (taskId) await request(`/tasks/${taskId}`, { method:'DELETE' }).catch(()=>{});
    if (assignmentId && projectId) await request(`/projects/${projectId}/assignments/${assignmentId}`, { method:'DELETE' }).catch(()=>{});
    if (projectId) await request(`/projects/${projectId}`, { method:'DELETE' }).catch(()=>{});
    if (roleId) await request(`/work-catalog/roles/${roleId}`, { method:'DELETE' }).catch(()=>{});
  }
})().catch(error=>{console.error(error);process.exit(1);});
