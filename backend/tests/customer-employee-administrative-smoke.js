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
  let customerId;
  let employeeId;

  try {
    const customer = await request('/customers', {
      method: 'POST',
      body: JSON.stringify({
        company_name: `Administrative Smoke ${stamp}`,
        address: '1 Tràng Tiền',
        province_code: '01',
        commune_code: '10105001',
      }),
    });
    assert.equal(customer.response.status, 201, JSON.stringify(customer.body));
    assert.equal(customer.body.data.commune_code, '10105001');
    customerId = customer.body.data.id;

    const employee = await request('/employees', {
      method: 'POST',
      body: JSON.stringify({
        full_name: `Administrative Smoke ${stamp}`,
        position: 'Công nhân',
        department: 'Sản xuất',
        address: '1 Tràng Tiền',
        province_code: '01',
        commune_code: '10105001',
      }),
    });
    assert.equal(employee.response.status, 201, JSON.stringify(employee.body));
    assert.equal(employee.body.data.commune_code, '10105001');
    employeeId = employee.body.data.id;

    console.log('Customer and employee administrative address smoke test passed');
  } finally {
    if (employeeId) await request(`/employees/${employeeId}`, { method: 'DELETE' });
    if (customerId) await request(`/customers/${customerId}`, { method: 'DELETE' });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
