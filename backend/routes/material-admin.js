const express = require('express');
const pool = require('../config/database');

const router = express.Router();
const clean = value => typeof value === 'string' ? value.trim() : value;
const bool = (value, fallback = true) => value === undefined ? fallback : value === true || value === 'true';
const fail = (res, status, message) => res.status(status).json({ success: false, message });

const definitions = {
  categories: { table: 'material_categories', code: 'code', fields: ['code','name','parent_id','description','sort_order','is_active'], required: ['code','name'] },
  units: { table: 'material_units', code: 'code', fields: ['code','name','symbol','decimal_precision','is_active'], required: ['code','name','symbol'] },
  suppliers: { table: 'suppliers', code: 'supplier_code', fields: ['supplier_code','name','tax_code','contact_name','phone','email','address_line','province_code','commune_code','payment_terms','notes','is_active'], required: ['supplier_code','name'] },
  warehouses: { table: 'warehouses', code: 'warehouse_code', fields: ['warehouse_code','name','warehouse_type','location','manager_employee_id','description','is_default','is_active'], required: ['warehouse_code','name'] },
};

function numberValue(value, fallback = null) {
  if (value === '' || value === undefined || value === null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function normalizePayload(entity, body, editing = false) {
  const def = definitions[entity];
  const payload = { ...body };
  if (!editing) payload[def.code] = String(clean(payload[def.code]) || '').toUpperCase();
  if ('parent_id' in payload) payload.parent_id = numberValue(payload.parent_id);
  if ('sort_order' in payload) payload.sort_order = numberValue(payload.sort_order, 0);
  if ('decimal_precision' in payload) payload.decimal_precision = numberValue(payload.decimal_precision, 2);
  if ('manager_employee_id' in payload) payload.manager_employee_id = numberValue(payload.manager_employee_id);
  for (const field of ['is_active','is_default']) if (field in payload) payload[field] = bool(payload[field], field === 'is_active');
  return payload;
}

function validatePayload(entity, payload, editing = false) {
  const def = definitions[entity];
  for (const field of def.required) {
    if (editing && field === def.code) continue;
    if (!clean(payload[field])) return `Thiếu trường ${field}`;
  }
  if (entity === 'units' && (!Number.isInteger(payload.decimal_precision) || payload.decimal_precision < 0 || payload.decimal_precision > 6)) return 'Số chữ số thập phân phải từ 0 đến 6';
  if (entity === 'categories' && (!Number.isInteger(payload.sort_order) || payload.sort_order < 0)) return 'Thứ tự phải là số nguyên không âm';
  if (entity === 'suppliers' && payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) return 'Email nhà cung cấp không hợp lệ';
  return null;
}

async function validateReferences(client, entity, payload, currentId) {
  if (entity === 'categories' && payload.parent_id) {
    if (Number(payload.parent_id) === Number(currentId)) throw Object.assign(new Error('Nhóm vật tư không thể là nhóm cha của chính nó'), { status: 400 });
    const parent = await client.query('SELECT parent_id FROM material_categories WHERE id=$1 AND is_active=true', [payload.parent_id]);
    if (!parent.rowCount) throw Object.assign(new Error('Nhóm cha không hợp lệ'), { status: 400 });
    if (currentId && Number(parent.rows[0].parent_id) === Number(currentId)) throw Object.assign(new Error('Không thể tạo vòng lặp nhóm vật tư'), { status: 400 });
  }
  if (entity === 'warehouses' && payload.manager_employee_id) {
    const employee = await client.query('SELECT 1 FROM employees WHERE id=$1', [payload.manager_employee_id]);
    if (!employee.rowCount) throw Object.assign(new Error('Người quản lý kho không hợp lệ'), { status: 400 });
  }
  if (entity === 'suppliers' && payload.commune_code) {
    const commune = await client.query('SELECT 1 FROM administrative_communes WHERE code=$1 AND province_code=$2 AND is_active=true', [payload.commune_code, payload.province_code]);
    if (!commune.rowCount) throw Object.assign(new Error('Phường/Xã không thuộc Tỉnh/Thành đã chọn'), { status: 400 });
  }
}

router.get('/settings', async (_req, res, next) => {
  try { const result = await pool.query('SELECT * FROM inventory_settings WHERE id=1'); res.json({ success: true, data: result.rows[0] }); } catch (error) { next(error); }
});

router.put('/settings', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const defaultWarehouseId = numberValue(req.body.default_warehouse_id);
    const digits = numberValue(req.body.material_code_digits, 5);
    const nextNumber = numberValue(req.body.material_code_next_number, 1);
    const quantityPrecision = numberValue(req.body.quantity_decimal_precision, 3);
    const pricePrecision = numberValue(req.body.price_decimal_precision, 2);
    if (![digits, nextNumber, quantityPrecision, pricePrecision].every(Number.isFinite) || digits < 3 || digits > 12 || nextNumber < 1 || quantityPrecision < 0 || quantityPrecision > 6 || pricePrecision < 0 || pricePrecision > 6) return fail(res, 400, 'Giá trị cấu hình vật tư không hợp lệ');
    const prefix = String(clean(req.body.material_code_prefix) || 'VT').toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9_-]{0,19}$/.test(prefix)) return fail(res, 400, 'Tiền tố mã vật tư không hợp lệ');
    await client.query('BEGIN');
    if (defaultWarehouseId) {
      const warehouse = await client.query('SELECT 1 FROM warehouses WHERE id=$1 AND is_active=true FOR UPDATE', [defaultWarehouseId]);
      if (!warehouse.rowCount) throw Object.assign(new Error('Kho mặc định không hợp lệ'), { status: 400 });
    }
    const result = await client.query(`UPDATE inventory_settings SET default_warehouse_id=$1,allow_negative_stock=false,
      auto_generate_material_code=$2,material_code_prefix=$3,material_code_digits=$4,material_code_next_number=$5,
      inventory_cost_method='MOVING_AVERAGE',quantity_decimal_precision=$6,price_decimal_precision=$7,updated_at=NOW()
      WHERE id=1 RETURNING *`, [defaultWarehouseId, bool(req.body.auto_generate_material_code, true), prefix, digits, nextNumber, quantityPrecision, pricePrecision]);
    await client.query('UPDATE warehouses SET is_default=(id=$1 AND is_active=true),updated_at=NOW()', [defaultWarehouseId]);
    await client.query('COMMIT');
    res.json({ success: true, message: 'Đã lưu cấu hình vật tư', data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.status) return fail(res, error.status, error.message);
    if (error.code === '23514') return fail(res, 400, 'Giá trị cấu hình không hợp lệ');
    next(error);
  } finally { client.release(); }
});

router.get('/:entity', async (req, res, next) => {
  const def = definitions[req.params.entity];
  if (!def) return fail(res, 404, 'Danh mục không tồn tại');
  try {
    let sql = `SELECT * FROM ${def.table}`;
    if (req.params.entity === 'categories') sql = 'SELECT c.*,p.name AS parent_name FROM material_categories c LEFT JOIN material_categories p ON p.id=c.parent_id';
    if (req.params.entity === 'warehouses') sql = `SELECT w.*,e.full_name AS manager_name,COALESCE((SELECT json_agg(l ORDER BY l.location_code) FROM warehouse_locations l WHERE l.warehouse_id=w.id),'[]'::json) AS locations FROM warehouses w LEFT JOIN employees e ON e.id=w.manager_employee_id`;
    const result = await pool.query(`${sql} ORDER BY is_active DESC, ${req.params.entity === 'categories' ? 'sort_order,' : ''} name`);
    res.json({ success: true, data: result.rows });
  } catch (error) { next(error); }
});

router.post('/:entity', async (req, res, next) => {
  const entity = req.params.entity;
  const def = definitions[entity];
  if (!def) return fail(res, 404, 'Danh mục không tồn tại');
  const payload = normalizePayload(entity, req.body);
  const validationError = validatePayload(entity, payload);
  if (validationError) return fail(res, 400, validationError);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await validateReferences(client, entity, payload);
    if (entity === 'warehouses' && payload.is_default) await client.query('UPDATE warehouses SET is_default=false,updated_at=NOW()');
    const fields = def.fields.filter(field => payload[field] !== undefined);
    const values = fields.map(field => clean(payload[field]));
    const result = await client.query(`INSERT INTO ${def.table}(${fields.join(',')}) VALUES(${fields.map((_, index) => `$${index + 1}`).join(',')}) RETURNING *`, values);
    if (entity === 'warehouses' && payload.is_default) await client.query('UPDATE inventory_settings SET default_warehouse_id=$1,updated_at=NOW() WHERE id=1', [result.rows[0].id]);
    await client.query('COMMIT');
    res.status(201).json({ success: true, message: 'Đã thêm dữ liệu', data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.status) return fail(res, error.status, error.message);
    if (error.code === '23505') return fail(res, 409, 'Mã hoặc tên đã tồn tại');
    if (error.code === '23503') return fail(res, 400, 'Dữ liệu liên kết không hợp lệ');
    if (error.code === '23514') return fail(res, 400, 'Giá trị không hợp lệ');
    next(error);
  } finally { client.release(); }
});

router.put('/:entity/:id', async (req, res, next) => {
  const entity = req.params.entity;
  const def = definitions[entity];
  if (!def) return fail(res, 404, 'Danh mục không tồn tại');
  const payload = normalizePayload(entity, req.body, true);
  delete payload[def.code];
  const validationError = validatePayload(entity, payload, true);
  if (validationError) return fail(res, 400, validationError);
  const fields = def.fields.filter(field => field !== def.code && payload[field] !== undefined);
  if (!fields.length) return fail(res, 400, 'Không có dữ liệu cập nhật');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(`SELECT * FROM ${def.table} WHERE id=$1 FOR UPDATE`, [req.params.id]);
    if (!existing.rowCount) throw Object.assign(new Error('Không tìm thấy dữ liệu'), { status: 404 });
    await validateReferences(client, entity, payload, req.params.id);
    if (entity === 'warehouses' && payload.is_default) await client.query('UPDATE warehouses SET is_default=false,updated_at=NOW()');
    const values = fields.map(field => clean(payload[field]));
    values.push(req.params.id);
    const result = await client.query(`UPDATE ${def.table} SET ${fields.map((field, index) => `${field}=$${index + 1}`).join(',')},updated_at=NOW() WHERE id=$${values.length} RETURNING *`, values);
    if (entity === 'warehouses') {
      if (payload.is_default) await client.query('UPDATE inventory_settings SET default_warehouse_id=$1,updated_at=NOW() WHERE id=1', [req.params.id]);
      if (payload.is_active === false) await client.query('UPDATE inventory_settings SET default_warehouse_id=NULL,updated_at=NOW() WHERE id=1 AND default_warehouse_id=$1', [req.params.id]);
    }
    await client.query('COMMIT');
    res.json({ success: true, message: 'Đã cập nhật dữ liệu', data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.status) return fail(res, error.status, error.message);
    if (error.code === '23505') return fail(res, 409, 'Tên đã tồn tại');
    if (error.code === '23503') return fail(res, 400, 'Dữ liệu liên kết không hợp lệ');
    if (error.code === '23514') return fail(res, 400, 'Giá trị không hợp lệ');
    next(error);
  } finally { client.release(); }
});

router.delete('/:entity/:id', async (req, res, next) => {
  const entity = req.params.entity;
  const def = definitions[entity];
  if (!def) return fail(res, 404, 'Danh mục không tồn tại');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`UPDATE ${def.table} SET is_active=false${entity === 'warehouses' ? ',is_default=false' : ''},updated_at=NOW() WHERE id=$1 RETURNING id`, [req.params.id]);
    if (!result.rowCount) throw Object.assign(new Error('Không tìm thấy dữ liệu'), { status: 404 });
    if (entity === 'warehouses') await client.query('UPDATE inventory_settings SET default_warehouse_id=NULL,updated_at=NOW() WHERE id=1 AND default_warehouse_id=$1', [req.params.id]);
    await client.query('COMMIT');
    res.json({ success: true, message: 'Đã chuyển sang Không hoạt động' });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.status) return fail(res, error.status, error.message);
    next(error);
  } finally { client.release(); }
});

router.post('/warehouses/:warehouseId/locations', async (req, res, next) => {
  try {
    const code = String(clean(req.body.location_code) || '').toUpperCase();
    const name = clean(req.body.name);
    if (!code || !name) return fail(res, 400, 'Mã và tên vị trí là bắt buộc');
    const warehouse = await pool.query('SELECT 1 FROM warehouses WHERE id=$1 AND is_active=true', [req.params.warehouseId]);
    if (!warehouse.rowCount) return fail(res, 400, 'Kho không hợp lệ hoặc đã ngừng hoạt động');
    const result = await pool.query(`INSERT INTO warehouse_locations(warehouse_id,location_code,name,zone,rack,shelf,bin,is_active) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [req.params.warehouseId,code,name,clean(req.body.zone),clean(req.body.rack),clean(req.body.shelf),clean(req.body.bin),bool(req.body.is_active,true)]);
    res.status(201).json({ success: true, message: 'Đã thêm vị trí kho', data: result.rows[0] });
  } catch (error) { if (error.code === '23505') return fail(res, 409, 'Mã vị trí đã tồn tại trong kho'); next(error); }
});

router.put('/warehouses/:warehouseId/locations/:id', async (req, res, next) => {
  try {
    const name = clean(req.body.name);
    if (!name) return fail(res, 400, 'Tên vị trí là bắt buộc');
    const result = await pool.query(`UPDATE warehouse_locations SET name=$1,zone=$2,rack=$3,shelf=$4,bin=$5,is_active=$6,updated_at=NOW() WHERE id=$7 AND warehouse_id=$8 RETURNING *`, [name,clean(req.body.zone),clean(req.body.rack),clean(req.body.shelf),clean(req.body.bin),bool(req.body.is_active,true),req.params.id,req.params.warehouseId]);
    if (!result.rowCount) return fail(res, 404, 'Không tìm thấy vị trí');
    res.json({ success: true, message: 'Đã cập nhật vị trí', data: result.rows[0] });
  } catch (error) { next(error); }
});

router.delete('/warehouses/:warehouseId/locations/:id', async (req, res, next) => {
  try {
    const result = await pool.query('UPDATE warehouse_locations SET is_active=false,updated_at=NOW() WHERE id=$1 AND warehouse_id=$2 RETURNING id', [req.params.id,req.params.warehouseId]);
    if (!result.rowCount) return fail(res, 404, 'Không tìm thấy vị trí');
    res.json({ success: true, message: 'Đã ngừng sử dụng vị trí' });
  } catch (error) { next(error); }
});

module.exports = router;
