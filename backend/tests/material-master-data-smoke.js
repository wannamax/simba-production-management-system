const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const stamp = Date.now().toString().slice(-8);

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path} -> ${response.status}: ${body.message || text}`);
  return body;
}

async function expectStatus(path, status, options = {}) {
  const response = await fetch(`${BASE_URL}/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (response.status !== status) throw new Error(`${options.method || 'GET'} ${path}: expected ${status}, got ${response.status}: ${await response.text()}`);
}

(async () => {
  const settings = await request('/material-admin/settings');
  if (settings.data.allow_negative_stock !== false) throw new Error('allow_negative_stock must be false');
  await request('/material-admin/settings', { method: 'PUT', body: JSON.stringify({ ...settings.data, auto_generate_material_code: true }) });

  const unit = (await request('/material-admin/units', { method: 'POST', body: JSON.stringify({ code: `TESTBOX${stamp}`, name: `Thùng test ${stamp}`, symbol: 'thùng', decimal_precision: 0, is_active: true }) })).data;
  const category = (await request('/material-admin/categories', { method: 'POST', body: JSON.stringify({ code: `TESTCAT${stamp}`, name: `Nhóm test ${stamp}`, sort_order: 999, is_active: true }) })).data;
  const supplier = (await request('/material-admin/suppliers', { method: 'POST', body: JSON.stringify({ supplier_code: `NCC${stamp}`, name: `Nhà cung cấp test ${stamp}`, is_active: true }) })).data;
  const warehouse = (await request('/material-admin/warehouses', { method: 'POST', body: JSON.stringify({ warehouse_code: `KHO${stamp}`, name: `Kho test ${stamp}`, warehouse_type: 'Kho chính', is_active: true }) })).data;
  await request(`/material-admin/warehouses/${warehouse.id}/locations`, { method: 'POST', body: JSON.stringify({ location_code: 'A-01', name: 'Kệ A-01', is_active: true }) });

  const meta = await request('/materials/meta');
  if (!meta.data.warehouses.some(x => x.id === warehouse.id)) throw new Error('Warehouse not returned by material meta');
  if (!meta.data.catalogs?.WAREHOUSE_TYPE?.length) throw new Error('Material catalogs not returned by meta');

  const baseUnit = meta.data.units.find(x => x.code === 'METER') || meta.data.units[0];
  await expectStatus('/materials', 400, { method: 'POST', body: JSON.stringify({ name: `Vật tư âm ${stamp}`, base_unit_id: baseUnit.id, minimum_stock: -1 }) });
  const material = (await request('/materials', { method: 'POST', body: JSON.stringify({
    name: `Vật tư test ${stamp}`, category_id: category.id, base_unit_id: baseUnit.id,
    default_supplier_id: supplier.id, minimum_stock: 10, reorder_point: 20, maximum_stock: 100, standard_cost: 15000,
    tracking_type: 'NONE', is_active: true,
  }) })).data;
  if (!material.material_code) throw new Error('Automatic material code was not generated');

  await request(`/materials/${material.id}/conversions`, { method: 'POST', body: JSON.stringify({ from_unit_id: unit.id, to_unit_id: baseUnit.id, conversion_factor: 100, is_purchase_unit: true }) });
  const list = await request(`/materials?search=${encodeURIComponent(material.material_code)}`);
  const found = list.data.find(x => x.id === material.id);
  if (!found) throw new Error('Created material not found');
  if (!found.conversions?.length) throw new Error('Unit conversion not returned');

  await request(`/materials/${material.id}`, { method: 'PUT', body: JSON.stringify({ ...found, name: `${found.name} updated`, category_id: category.id, base_unit_id: baseUnit.id, default_supplier_id: supplier.id, tracking_type: 'BATCH', is_active: true }) });
  const detail = await request(`/materials/${material.id}`);
  if (detail.data.tracking_type !== 'BATCH') throw new Error('Material update failed');

  await request(`/materials/${material.id}`, { method: 'DELETE' });
  console.log('Material master data smoke test passed');
})().catch(error => { console.error(error); process.exit(1); });
