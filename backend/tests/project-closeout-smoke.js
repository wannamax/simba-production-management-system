const assert = require('assert');

const baseUrl = (process.env.TEST_BASE_URL || 'http://localhost:8080').replace(/\/$/, '');

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}/api${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return { response, body: await response.json() };
  }
  return { response, body: Buffer.from(await response.arrayBuffer()) };
}

(async () => {
  const health = await request('/health');
  assert.equal(health.response.status, 200);
    assert.equal(health.body.version, '2.6.0-K');

  const stamp = Date.now();
  const created = await request('/projects', {
    method: 'POST',
    body: JSON.stringify({
      project_name: `Closeout Smoke ${stamp}`,
      project_type: 'Sản xuất',
      start_date: new Date().toISOString().slice(0, 10),
      priority: 'Trung bình',
      budget: 1000000,
    }),
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.body));
  const projectId = created.body.data.id;

  let closeout = await request(`/project-closeout/projects/${projectId}`);
  assert.equal(closeout.response.status, 200, JSON.stringify(closeout.body));
  assert.equal(closeout.body.data.checklist.length, 7);
  assert.equal(closeout.body.data.can_close, false);

  for (const item of closeout.body.data.checklist) {
    const updated = await request(`/project-closeout/checklist/${item.id}`, {
      method: 'PUT',
      body: JSON.stringify({ is_completed: true, notes: 'Smoke test 2.5.0' }),
    });
    assert.equal(updated.response.status, 200, JSON.stringify(updated.body));
  }

  closeout = await request(`/project-closeout/projects/${projectId}`);
  assert.equal(closeout.body.data.can_close, true, JSON.stringify(closeout.body.data.blockers));

  const closed = await request(`/project-closeout/projects/${projectId}/close`, {
    method: 'POST',
    body: JSON.stringify({ closure_notes: 'Smoke test snapshot' }),
  });
  assert.equal(closed.response.status, 200, JSON.stringify(closed.body));

  closeout = await request(`/project-closeout/projects/${projectId}`);
  assert.equal(closeout.body.data.project.closeout_status, 'CLOSED');
  assert.equal(closeout.body.data.project.status, 'Hoàn thành');
  assert(closeout.body.data.snapshot, 'Snapshot đóng dự án phải được lưu');
  assert.equal(Number(closeout.body.data.snapshot.total_actual_cost), 0);
  assert.equal(closeout.body.data.snapshot.snapshot_data.project.status, 'Hoàn thành');
  assert.equal(closeout.body.data.snapshot.snapshot_data.project.closeout_status, 'CLOSED');

  const pdf = await request(`/project-closeout/projects/${projectId}/export.pdf`);
  assert.equal(pdf.response.status, 200);
  assert(pdf.body.length > 1000, 'PDF export không hợp lệ');
  assert.equal(pdf.body.subarray(0, 4).toString(), '%PDF');

  const excel = await request(`/project-closeout/projects/${projectId}/export.xlsx`);
  assert.equal(excel.response.status, 200);
  assert(excel.body.length > 1000, 'Excel export không hợp lệ');
  assert.equal(excel.body.subarray(0, 2).toString(), 'PK');

  console.log(`Project Closeout 2.5.0 smoke test passed (project ${projectId})`);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
