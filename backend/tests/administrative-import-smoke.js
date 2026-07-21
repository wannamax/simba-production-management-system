const assert = require('node:assert/strict');
const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:8080';

async function request(path, options={}) {
  const response = await fetch(`${baseUrl}/api${path}`, options);
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

(async()=>{
  const meta = await request('/settings/administrative/meta');
  assert.equal(meta.response.status, 200);
  assert.equal(meta.body.data?.province_count, 34);
  assert.equal(meta.body.data?.commune_count, 3321);

  const provinces = await request('/settings/administrative/provinces');
  assert.equal(provinces.response.status, 200);
  assert.equal(provinces.body.data?.length, 34);

  const expectedCities = new Map([
    ['04', 'Hải Phòng'],
    ['21', 'Đà Nẵng'],
    ['29', 'Hồ Chí Minh'],
    ['33', 'Cần Thơ'],
  ]);
  for (const [code, name] of expectedCities) {
    const item = provinces.body.data.find(row => row.code === code);
    assert.ok(item, `Missing province ${code}`);
    assert.equal(item.unit_type, 'Thành phố');
    assert.equal(item.name, name);
  }

  const hanoi = await request('/settings/administrative/communes?province_code=01');
  assert.equal(hanoi.response.status, 200);
  assert.ok(hanoi.body.data?.length > 0);
  assert.ok(hanoi.body.data.every(item => /^\d{8}$/.test(item.code)));

  const empty = new FormData();
  const missing = await request('/settings/administrative/import', { method:'POST', body:empty });
  assert.equal(missing.response.status, 400);

  console.log('Administrative current-data smoke test passed');
})().catch(error=>{ console.error(error); process.exit(1); });
