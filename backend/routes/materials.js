const express = require('express');
const pool = require('../config/database');

const router = express.Router();
const TRACKING_TYPES = new Set(['NONE', 'BATCH', 'SERIAL', 'BATCH_EXPIRY']);
const codePattern = /^[A-Z0-9][A-Z0-9._-]{1,49}$/;

const clean = value => typeof value === 'string' ? value.trim() : value;
const toBool = (value, fallback = true) => value === undefined ? fallback : Boolean(value);
const toNumber = (value, fallback = null) => value === '' || value === undefined || value === null ? fallback : Number(value);

function sendError(res, status, message, details) {
  return res.status(status).json({ success: false, message, ...(details ? { details } : {}) });
}

function validateNumbers(body) {
  const values = {
    minimumStock: toNumber(body.minimum_stock, 0),
    reorderPoint: toNumber(body.reorder_point, 0),
    maximumStock: toNumber(body.maximum_stock),
    standardCost: toNumber(body.standard_cost, 0),
  };
  if (![values.minimumStock, values.reorderPoint, values.standardCost].every(Number.isFinite)
      || (values.maximumStock !== null && !Number.isFinite(values.maximumStock))) {
    throw Object.assign(new Error('Số lượng hoặc đơn giá không hợp lệ'), { status: 400 });
  }
  if (values.minimumStock < 0 || values.reorderPoint < 0 || values.standardCost < 0
      || (values.maximumStock !== null && values.maximumStock < values.minimumStock)) {
    throw Object.assign(new Error('Tồn tối thiểu, điểm đặt hàng và giá phải không âm; tồn tối đa phải lớn hơn hoặc bằng tồn tối thiểu'), { status: 400 });
  }
  return values;
}

async function generateMaterialCode(client) {
  const settings = await client.query('SELECT * FROM inventory_settings WHERE id=1 FOR UPDATE');
  const row = settings.rows[0];
  const prefix = String(row.material_code_prefix || 'VT').trim().toUpperCase();
  const digits = Number(row.material_code_digits || 5);
  let next = Number(row.material_code_next_number || 1);
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const candidate = `${prefix}-${String(next).padStart(digits, '0')}`;
    const exists = await client.query('SELECT 1 FROM materials WHERE material_code=$1', [candidate]);
    next += 1;
    if (!exists.rowCount) {
      await client.query('UPDATE inventory_settings SET material_code_next_number=$1, updated_at=NOW() WHERE id=1', [next]);
      return candidate;
    }
  }
  throw new Error('Không thể tự sinh mã vật tư duy nhất');
}

async function validateMaterialReferences(client, body) {
  const categoryId = toNumber(body.category_id);
  const baseUnitId = toNumber(body.base_unit_id);
  const supplierId = toNumber(body.default_supplier_id);
  if (!baseUnitId) throw Object.assign(new Error('Đơn vị tính gốc là bắt buộc'), { status: 400 });
  const unit = await client.query('SELECT 1 FROM material_units WHERE id=$1 AND is_active=true', [baseUnitId]);
  if (!unit.rowCount) throw Object.assign(new Error('Đơn vị tính không hợp lệ hoặc đã ngừng hoạt động'), { status: 400 });
  if (categoryId) {
    const category = await client.query('SELECT 1 FROM material_categories WHERE id=$1 AND is_active=true', [categoryId]);
    if (!category.rowCount) throw Object.assign(new Error('Nhóm vật tư không hợp lệ hoặc đã ngừng hoạt động'), { status: 400 });
  }
  if (supplierId) {
    const supplier = await client.query('SELECT 1 FROM suppliers WHERE id=$1 AND is_active=true', [supplierId]);
    if (!supplier.rowCount) throw Object.assign(new Error('Nhà cung cấp không hợp lệ hoặc đã ngừng hoạt động'), { status: 400 });
  }
  return { categoryId, baseUnitId, supplierId };
}

router.get('/meta', async (_req, res, next) => {
  try {
    const [categories, units, suppliers, warehouses, settings, catalogs] = await Promise.all([
      pool.query('SELECT * FROM material_categories ORDER BY sort_order,name'),
      pool.query('SELECT * FROM material_units ORDER BY name'),
      pool.query('SELECT * FROM suppliers ORDER BY name'),
      pool.query(`SELECT w.*, e.full_name AS manager_name,
        COALESCE((SELECT json_agg(l ORDER BY l.location_code) FROM warehouse_locations l WHERE l.warehouse_id=w.id), '[]'::json) AS locations
        FROM warehouses w LEFT JOIN employees e ON e.id=w.manager_employee_id ORDER BY w.is_default DESC,w.name`),
      pool.query('SELECT * FROM inventory_settings WHERE id=1'),
      pool.query(`SELECT catalog_type,code,name,color,sort_order FROM system_catalogs
        WHERE catalog_type=ANY($1::text[]) AND is_active=true ORDER BY catalog_type,sort_order,name`,
        [['MATERIAL_BRAND','STORAGE_CONDITION','WAREHOUSE_TYPE','STOCK_ADJUSTMENT_REASON']])
    ]);
    const catalogMap = catalogs.rows.reduce((result, row) => {
      (result[row.catalog_type] ||= []).push(row);
      return result;
    }, {});
    res.json({ success: true, data: { categories: categories.rows, units: units.rows, suppliers: suppliers.rows, warehouses: warehouses.rows, settings: settings.rows[0], catalogs: catalogMap } });
  } catch (error) { next(error); }
});

router.get('/', async (req, res, next) => {
  try {
    const values = [];
    const where = ['m.deleted_at IS NULL'];
    if (req.query.search) { values.push(`%${clean(req.query.search)}%`); where.push(`(m.material_code ILIKE $${values.length} OR COALESCE(m.name,m.material_name) ILIKE $${values.length} OR m.sku ILIKE $${values.length} OR m.barcode ILIKE $${values.length})`); }
    if (req.query.category_id) { values.push(Number(req.query.category_id)); where.push(`m.category_id=$${values.length}`); }
    if (req.query.is_active !== undefined) { values.push(req.query.is_active === 'true'); where.push(`m.is_active=$${values.length}`); }
    const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 500);
    values.push(limit);
    const result = await pool.query(`SELECT m.id,m.material_code,COALESCE(m.name,m.material_name) AS name,m.description,m.category_id,c.name AS category_name,
      m.base_unit_id,u.name AS unit_name,u.symbol AS unit_symbol,m.brand,m.specification,m.sku,m.barcode,m.minimum_stock,m.reorder_point,m.maximum_stock,
      m.standard_cost,m.default_supplier_id,s.name AS supplier_name,m.tracking_type,m.storage_condition,m.is_active,m.created_at,m.updated_at,
      COALESCE((SELECT json_agg(json_build_object('id',uc.id,'from_unit_id',uc.from_unit_id,'from_unit_name',fu.name,'from_symbol',fu.symbol,'to_unit_id',uc.to_unit_id,'to_unit_name',tu.name,'to_symbol',tu.symbol,'conversion_factor',uc.conversion_factor,'is_purchase_unit',uc.is_purchase_unit,'is_issue_unit',uc.is_issue_unit,'is_active',uc.is_active) ORDER BY uc.id) FROM material_unit_conversions uc JOIN material_units fu ON fu.id=uc.from_unit_id JOIN material_units tu ON tu.id=uc.to_unit_id WHERE uc.material_id=m.id), '[]'::json) AS conversions
      FROM materials m LEFT JOIN material_categories c ON c.id=m.category_id LEFT JOIN material_units u ON u.id=m.base_unit_id LEFT JOIN suppliers s ON s.id=m.default_supplier_id
      WHERE ${where.join(' AND ')} ORDER BY m.is_active DESC,m.material_code LIMIT $${values.length}`, values);
    res.json({ success: true, data: result.rows });
  } catch (error) { next(error); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(`SELECT m.*,COALESCE(m.name,m.material_name) AS display_name,c.name AS category_name,u.name AS unit_name,u.symbol AS unit_symbol,s.name AS supplier_name,
      COALESCE((SELECT json_agg(uc ORDER BY uc.id) FROM material_unit_conversions uc WHERE uc.material_id=m.id), '[]'::json) AS conversions
      FROM materials m LEFT JOIN material_categories c ON c.id=m.category_id LEFT JOIN material_units u ON u.id=m.base_unit_id LEFT JOIN suppliers s ON s.id=m.default_supplier_id
      WHERE m.id=$1 AND m.deleted_at IS NULL`, [req.params.id]);
    if (!result.rowCount) return sendError(res, 404, 'Không tìm thấy vật tư');
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

router.post('/', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const name = clean(req.body.name || req.body.material_name);
    if (!name) throw Object.assign(new Error('Tên vật tư là bắt buộc'), { status: 400 });
    const refs = await validateMaterialReferences(client, req.body);
    let materialCode = clean(req.body.material_code)?.toUpperCase();
    if (!materialCode) {
      const settings = await client.query('SELECT auto_generate_material_code FROM inventory_settings WHERE id=1');
      if (!settings.rows[0]?.auto_generate_material_code) throw Object.assign(new Error('Mã vật tư là bắt buộc khi tắt tự sinh mã'), { status: 400 });
      materialCode = await generateMaterialCode(client);
    }
    if (!codePattern.test(materialCode)) throw Object.assign(new Error('Mã vật tư chỉ gồm chữ in hoa, số, dấu chấm, gạch ngang hoặc gạch dưới'), { status: 400 });
    const trackingType = clean(req.body.tracking_type || 'NONE').toUpperCase();
    if (!TRACKING_TYPES.has(trackingType)) throw Object.assign(new Error('Loại theo dõi không hợp lệ'), { status: 400 });
    const numbers = validateNumbers(req.body);
    const result = await client.query(`INSERT INTO materials(material_code,material_name,name,description,category_id,base_unit_id,brand,specification,sku,barcode,minimum_stock,reorder_point,maximum_stock,standard_cost,default_supplier_id,tracking_type,storage_condition,is_active,notes,unit,min_stock_level,unit_price)
      VALUES($1,$2,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$3,(SELECT symbol FROM material_units WHERE id=$5),$10,$13) RETURNING *`, [
      materialCode, name, clean(req.body.description), refs.categoryId, refs.baseUnitId, clean(req.body.brand), clean(req.body.specification), clean(req.body.sku) || null,
      clean(req.body.barcode) || null, numbers.minimumStock, numbers.reorderPoint, numbers.maximumStock, numbers.standardCost,
      refs.supplierId, trackingType, clean(req.body.storage_condition), toBool(req.body.is_active, true)
    ]);
    await client.query('COMMIT');
    res.status(201).json({ success: true, message: 'Đã tạo vật tư', data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') return sendError(res, 409, 'Mã vật tư, SKU hoặc barcode đã tồn tại');
    if (error.code === '23514') return sendError(res, 400, 'Dữ liệu tồn kho hoặc giá không hợp lệ');
    if (error.status) return sendError(res, error.status, error.message);
    next(error);
  } finally { client.release(); }
});

router.put('/:id', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query('SELECT * FROM materials WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', [req.params.id]);
    if (!existing.rowCount) throw Object.assign(new Error('Không tìm thấy vật tư'), { status: 404 });
    const name = clean(req.body.name || req.body.material_name);
    if (!name) throw Object.assign(new Error('Tên vật tư là bắt buộc'), { status: 400 });
    const refs = await validateMaterialReferences(client, req.body);
    const trackingType = clean(req.body.tracking_type || 'NONE').toUpperCase();
    if (!TRACKING_TYPES.has(trackingType)) throw Object.assign(new Error('Loại theo dõi không hợp lệ'), { status: 400 });
    const numbers = validateNumbers(req.body);
    const result = await client.query(`UPDATE materials SET material_name=$1,name=$1,description=$2,category_id=$3,base_unit_id=$4,brand=$5,specification=$6,sku=$7,barcode=$8,minimum_stock=$9,reorder_point=$10,maximum_stock=$11,standard_cost=$12,default_supplier_id=$13,tracking_type=$14,storage_condition=$15,is_active=$16,notes=$2,unit=(SELECT symbol FROM material_units WHERE id=$4),min_stock_level=$9,unit_price=$12,updated_at=NOW() WHERE id=$17 RETURNING *`, [
      name, clean(req.body.description), refs.categoryId, refs.baseUnitId, clean(req.body.brand), clean(req.body.specification), clean(req.body.sku) || null,
      clean(req.body.barcode) || null, numbers.minimumStock, numbers.reorderPoint, numbers.maximumStock, numbers.standardCost, refs.supplierId,
      trackingType, clean(req.body.storage_condition), toBool(req.body.is_active, true), req.params.id
    ]);
    await client.query('COMMIT');
    res.json({ success: true, message: 'Đã cập nhật vật tư', data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') return sendError(res, 409, 'SKU hoặc barcode đã tồn tại');
    if (error.status) return sendError(res, error.status, error.message);
    next(error);
  } finally { client.release(); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const used = await pool.query(`SELECT
      EXISTS(SELECT 1 FROM material_unit_conversions WHERE material_id=$1)
      OR EXISTS(SELECT 1 FROM inventory_batches WHERE material_id=$1)
      OR EXISTS(SELECT 1 FROM project_material_requirements WHERE material_id=$1)
      OR EXISTS(SELECT 1 FROM material_reservations WHERE material_id=$1) AS used`, [req.params.id]);
    const result = await pool.query(`UPDATE materials SET is_active=false,
      deleted_at=CASE WHEN $2::boolean THEN NULL ELSE NOW() END,updated_at=NOW()
      WHERE id=$1 AND deleted_at IS NULL RETURNING id`, [req.params.id, used.rows[0].used]);
    if (!result.rowCount) return sendError(res, 404, 'Không tìm thấy vật tư');
    res.json({ success: true, message: used.rows[0].used ? 'Vật tư đã được sử dụng nên chỉ chuyển sang Không hoạt động' : 'Đã xóa vật tư' });
  } catch (error) { next(error); }
});

router.post('/:id/conversions', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const materialId = Number(req.params.id), fromUnitId = Number(req.body.from_unit_id), toUnitId = Number(req.body.to_unit_id), factor = Number(req.body.conversion_factor);
    if (!fromUnitId || !toUnitId || fromUnitId === toUnitId || !Number.isFinite(factor) || factor <= 0) throw Object.assign(new Error('Quy đổi đơn vị không hợp lệ'), { status: 400 });
    const material = await client.query('SELECT base_unit_id FROM materials WHERE id=$1 AND deleted_at IS NULL AND is_active=true FOR UPDATE', [materialId]);
    if (!material.rowCount) throw Object.assign(new Error('Không tìm thấy vật tư đang hoạt động'), { status: 404 });
    if (toUnitId !== material.rows[0].base_unit_id) throw Object.assign(new Error('Đơn vị đích phải là đơn vị tính gốc của vật tư'), { status: 400 });
    const units = await client.query('SELECT id FROM material_units WHERE id=ANY($1::int[]) AND is_active=true', [[fromUnitId, toUnitId]]);
    if (units.rowCount !== 2) throw Object.assign(new Error('Đơn vị quy đổi không hợp lệ hoặc đã ngừng hoạt động'), { status: 400 });
    const result = await client.query(`INSERT INTO material_unit_conversions(material_id,from_unit_id,to_unit_id,conversion_factor,is_purchase_unit,is_issue_unit,is_active)
      VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(material_id,from_unit_id,to_unit_id) DO UPDATE SET conversion_factor=EXCLUDED.conversion_factor,is_purchase_unit=EXCLUDED.is_purchase_unit,is_issue_unit=EXCLUDED.is_issue_unit,is_active=EXCLUDED.is_active,updated_at=NOW() RETURNING *`, [materialId, fromUnitId, toUnitId, factor, Boolean(req.body.is_purchase_unit), Boolean(req.body.is_issue_unit), toBool(req.body.is_active, true)]);
    await client.query('COMMIT');
    res.status(201).json({ success: true, message: 'Đã lưu quy đổi đơn vị', data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.status) return sendError(res, error.status, error.message);
    if (error.code === '23505') return sendError(res, 409, 'Quy đổi đơn vị đã tồn tại');
    next(error);
  } finally { client.release(); }
});

router.delete('/:id/conversions/:conversionId', async (req, res, next) => {
  try {
    const result = await pool.query('DELETE FROM material_unit_conversions WHERE id=$1 AND material_id=$2 RETURNING id', [req.params.conversionId, req.params.id]);
    if (!result.rowCount) return sendError(res, 404, 'Không tìm thấy quy đổi');
    res.json({ success: true, message: 'Đã xóa quy đổi đơn vị' });
  } catch (error) { next(error); }
});

module.exports = router;
