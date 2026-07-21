const assert = require('assert');

const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:8080';
const api = `${baseUrl.replace(/\/$/, '')}/api`;

async function request(path, options = {}) {
  const response = await fetch(`${api}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) }
  });
  let body = null;
  try { body = await response.json(); } catch (_) { body = {}; }
  return { response, body };
}

(async () => {
  let projectId;
  let materialId;
  try {
    const meta = await request('/materials/meta');
    assert.equal(meta.response.status, 200, JSON.stringify(meta.body));
    const unit = meta.body.data.units.find(item => item.is_active);
    assert(unit, 'Cần ít nhất một đơn vị tính đang hoạt động');

    const material = await request('/materials', {
      method: 'POST',
      body: JSON.stringify({
        name: `Smoke planning ${Date.now()}`,
        base_unit_id: unit.id,
        standard_cost: 12500,
        tracking_type: 'NONE',
        is_active: true
      })
    });
    assert.equal(material.response.status, 201, JSON.stringify(material.body));
    materialId = material.body.data.id;

    const project = await request('/projects', {
      method: 'POST',
      body: JSON.stringify({
        project_name: `Smoke material planning ${Date.now()}`,
        project_type: 'Sản xuất',
        start_date: new Date().toISOString().slice(0, 10),
        end_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
        budget: 1000000,
        priority: 'Trung bình'
      })
    });
    assert.equal(project.response.status, 201, JSON.stringify(project.body));
    projectId = project.body.data.id;

    const created = await request(`/material-planning/projects/${projectId}/requirements`, {
      method: 'POST',
      body: JSON.stringify({ material_id: materialId, planned_quantity: 10, estimated_unit_cost: 12500, priority: 'HIGH', status: 'DRAFT' })
    });
    assert.equal(created.response.status, 201, JSON.stringify(created.body));
    const requirementId = created.body.data.id;

    const updated = await request(`/material-planning/requirements/${requirementId}`, {
      method: 'PUT',
      body: JSON.stringify({ planned_quantity: 12, estimated_unit_cost: 12500, priority: 'HIGH', status: 'APPROVED', revision_reason: 'Smoke update' })
    });
    assert.equal(updated.response.status, 200, JSON.stringify(updated.body));

    const revisions = await request(`/material-planning/requirements/${requirementId}/revisions`);
    assert.equal(revisions.response.status, 200, JSON.stringify(revisions.body));
    assert(revisions.body.data.length >= 2, 'Phải có lịch sử phiên bản ban đầu và cập nhật');

    const planning = await request(`/material-planning/projects/${projectId}`);
    assert.equal(planning.response.status, 200, JSON.stringify(planning.body));
    assert.equal(planning.body.data.requirements.length, 1);
    assert.equal(Number(planning.body.data.requirements[0].shortage_quantity), 12);
    assert.equal(planning.body.data.summary.shortage_items, 1);

    const warehouse = planning.body.data.warehouses[0];
    assert(warehouse, 'Cần ít nhất một kho đang hoạt động');
    const reserve = await request(`/material-planning/requirements/${requirementId}/reserve`, {
      method: 'POST', body: JSON.stringify({ warehouse_id: warehouse.id, quantity: 1 })
    });
    assert.equal(reserve.response.status, 409, 'Không có tồn kho thì phải từ chối giữ vật tư');

    const cancelled = await request(`/material-planning/requirements/${requirementId}`, { method: 'DELETE' });
    assert.equal(cancelled.response.status, 200, JSON.stringify(cancelled.body));

    const shortages = await request('/material-planning/shortages');
    assert.equal(shortages.response.status, 200, JSON.stringify(shortages.body));

    console.log('Material planning and reservations smoke test passed');
  } finally {
    if (projectId) await request(`/projects/${projectId}`, { method: 'DELETE' }).catch(() => {});
    if (materialId) await request(`/materials/${materialId}`, { method: 'DELETE' }).catch(() => {});
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
