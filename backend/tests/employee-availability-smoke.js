const assert = require('node:assert/strict');

const baseUrl = process.env.TEST_BASE_URL || 'http://web';

async function request(path) {
  const response = await fetch(`${baseUrl}${path}`);
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`${path} returned non-JSON (${response.status}): ${text.slice(0, 200)}`);
  }
  return { response, body };
}

(async () => {
  const today = new Date().toISOString().slice(0, 10);

  const all = await request(`/api/employees/availability?start_date=${today}&end_date=${today}`);
  assert.equal(all.response.status, 200);
  assert.equal(all.body.success, true);
  assert.ok(Array.isArray(all.body.data));
  assert.equal(all.body.meta.start_date, today);
  assert.equal(all.body.meta.end_date, today);

  for (const employee of all.body.data) {
    assert.ok(Number.isInteger(employee.id));
    assert.ok(Array.isArray(employee.busy_projects));
    assert.ok(Array.isArray(employee.upcoming_tasks));
    assert.ok(Number.isFinite(Number(employee.available_hours)));
    assert.ok(Number.isFinite(Number(employee.total_assigned_hours)));
    assert.ok(Number.isFinite(Number(employee.workload_percentage)));
  }

  if (all.body.data.length > 0) {
    const employeeId = all.body.data[0].id;
    const filtered = await request(
      `/api/employees/availability?start_date=${today}&end_date=${today}&employee_ids=${employeeId}`,
    );
    assert.equal(filtered.response.status, 200);
    assert.ok(filtered.body.data.every((employee) => employee.id === employeeId));
  }

  const invalidRange = await request(
    '/api/employees/availability?start_date=2026-12-31&end_date=2026-01-01',
  );
  assert.equal(invalidRange.response.status, 400);
  assert.equal(invalidRange.body.success, false);

  const invalidIds = await request(
    `/api/employees/availability?start_date=${today}&end_date=${today}&employee_ids=abc`,
  );
  assert.equal(invalidIds.response.status, 400);
  assert.equal(invalidIds.body.success, false);

  console.log('Employee availability smoke test passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
