const express = require('express');
const router = express.Router();
const pool = require('../config/database');

const NSO_ENDPOINT = 'https://danhmuchanhchinh.nso.gov.vn/DMDVHC.asmx';

function clean(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}
function xmlDecode(value='') {
  return value.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"')
    .replace(/&apos;/g,"'").replace(/&amp;/g,'&');
}
function tag(row, names) {
  for (const name of names) {
    const match = row.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
    if (match) return xmlDecode(match[1]).replace(/<[^>]+>/g,'').trim();
  }
  return '';
}
function normalizeUnitType(value, name='') {
  const raw = `${value} ${name}`.toLowerCase();
  if (raw.includes('đặc khu')) return 'Đặc khu';
  if (raw.includes('phường')) return 'Phường';
  return 'Xã';
}
function parseSoapRows(xml, provinceCode) {
  const decoded = xmlDecode(xml);
  const rowMatches = [...decoded.matchAll(/<(?:Table|NewDataSet|DanhMucPhuongXa)[^>]*>([\s\S]*?)<\/(?:Table|NewDataSet|DanhMucPhuongXa)>/gi)];
  const candidates = rowMatches.length ? rowMatches.map(m=>m[1]) : [decoded];
  const records=[];
  for (const row of candidates) {
    const code = tag(row,['MaXa','MaPX','Ma','Code','ma_xa']);
    const fullName = tag(row,['TenXa','TenPX','Ten','Name','ten_xa']);
    const typeRaw = tag(row,['Cap','Loai','UnitType','cap_xa']);
    const rowProvince = tag(row,['MaTinh','Tinh','ProvinceCode','ma_tinh']) || provinceCode;
    if (!/^\d{5}$/.test(code) || !fullName || rowProvince !== provinceCode) continue;
    const unitType=normalizeUnitType(typeRaw, fullName);
    const name=fullName.replace(/^(Phường|Xã|Đặc khu)\s+/i,'').trim();
    records.push({code,province_code:provinceCode,name,unit_type:unitType});
  }
  return [...new Map(records.map(item=>[item.code,item])).values()];
}
async function soapCall(operation, body) {
  const envelope=`<?xml version="1.0" encoding="utf-8"?>\n<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><${operation} xmlns="http://tempuri.org/">${body}</${operation}></soap:Body></soap:Envelope>`;
  const response=await fetch(NSO_ENDPOINT,{method:'POST',headers:{'Content-Type':'text/xml; charset=utf-8','SOAPAction':`http://tempuri.org/${operation}`},body:envelope,signal:AbortSignal.timeout(45000)});
  if(!response.ok) throw new Error(`Cục Thống kê trả HTTP ${response.status}`);
  return response.text();
}

router.get('/company', async (_req,res)=>{
  try {
    const result=await pool.query(`SELECT cp.*, p.name province_name, p.unit_type province_type,
      c.name commune_name, c.unit_type commune_type FROM company_profile cp
      LEFT JOIN administrative_provinces p ON p.code=cp.province_code
      LEFT JOIN administrative_communes c ON c.code=cp.commune_code WHERE cp.id=1`);
    res.json({success:true,data:result.rows[0]});
  } catch(error){res.status(500).json({success:false,message:error.message});}
});

router.put('/company', async (req,res)=>{
  const fields=req.body||{};
  try {
    if(fields.commune_code){
      const valid=await pool.query('SELECT 1 FROM administrative_communes WHERE code=$1 AND province_code=$2 AND is_active=true',[fields.commune_code,fields.province_code]);
      if(!valid.rowCount) return res.status(400).json({success:false,message:'Phường/Xã không thuộc Tỉnh/Thành đã chọn'});
    }
    const values=['company_name','short_name','tax_code','representative_name','phone','email','website','address_line','province_code','commune_code','postal_code','logo_url','timezone','date_format'].map(k=>clean(fields[k]));
    values[0]=values[0]||''; values[12]=values[12]||'Asia/Ho_Chi_Minh'; values[13]=values[13]||'DD/MM/YYYY';
    const result=await pool.query(`UPDATE company_profile SET company_name=$1,short_name=$2,tax_code=$3,representative_name=$4,
      phone=$5,email=$6,website=$7,address_line=$8,province_code=$9,commune_code=$10,postal_code=$11,logo_url=$12,
      timezone=$13,date_format=$14,updated_at=now() WHERE id=1 RETURNING *`,values);
    res.json({success:true,data:result.rows[0],message:'Đã lưu thông tin công ty'});
  } catch(error){res.status(500).json({success:false,message:error.message});}
});

router.get('/administrative/provinces', async (_req,res)=>{
  try { const r=await pool.query('SELECT code,name,unit_type FROM administrative_provinces WHERE is_active=true ORDER BY code'); res.json({success:true,data:r.rows}); }
  catch(error){res.status(500).json({success:false,message:error.message});}
});
router.get('/administrative/communes', async (req,res)=>{
  try {
    const code=clean(req.query.province_code); if(!code) return res.status(400).json({success:false,message:'Thiếu province_code'});
    const r=await pool.query('SELECT code,province_code,name,unit_type FROM administrative_communes WHERE province_code=$1 AND is_active=true ORDER BY unit_type,name',[code]);
    res.json({success:true,data:r.rows});
  } catch(error){res.status(500).json({success:false,message:error.message});}
});
router.get('/administrative/meta', async (_req,res)=>{
  try { const r=await pool.query('SELECT * FROM administrative_dataset_meta WHERE id=1'); res.json({success:true,data:r.rows[0]}); }
  catch(error){res.status(500).json({success:false,message:error.message});}
});

router.post('/administrative/sync', async (req,res)=>{
  const requested=Array.isArray(req.body?.province_codes)?req.body.province_codes.map(String):null;
  const client=await pool.connect();
  try {
    const provinces=(await client.query(`SELECT code,name FROM administrative_provinces WHERE is_active=true ${requested?.length?'AND code=ANY($1)':''} ORDER BY code`,requested?.length?[requested]:[])).rows;
    if(!provinces.length) return res.status(400).json({success:false,message:'Không có Tỉnh/Thành hợp lệ để đồng bộ'});
    let total=0; const details=[];
    for(const province of provinces){
      const xml=await soapCall('DanhMucPhuongXa',`<DenNgay>${new Date().toISOString().slice(0,10)}</DenNgay><Tinh>${province.code}</Tinh><TenTinh></TenTinh><QuanHuyen></QuanHuyen><TenQuanHuyen></TenQuanHuyen>`);
      const rows=parseSoapRows(xml,province.code);
      if(!rows.length) throw new Error(`Không đọc được dữ liệu cấp xã của ${province.name} (${province.code})`);
      await client.query('BEGIN');
      await client.query('UPDATE administrative_communes SET is_active=false WHERE province_code=$1',[province.code]);
      for(const item of rows){ await client.query(`INSERT INTO administrative_communes(code,province_code,name,unit_type,is_active,updated_at)
        VALUES($1,$2,$3,$4,true,now()) ON CONFLICT(code) DO UPDATE SET province_code=EXCLUDED.province_code,name=EXCLUDED.name,unit_type=EXCLUDED.unit_type,is_active=true,updated_at=now()`,[item.code,item.province_code,item.name,item.unit_type]); }
      await client.query('COMMIT'); total+=rows.length; details.push({province_code:province.code,count:rows.length});
    }
    const count=(await client.query('SELECT count(*)::int count FROM administrative_communes WHERE is_active=true')).rows[0].count;
    await client.query(`UPDATE administrative_dataset_meta SET last_synced_at=now(),province_count=(SELECT count(*) FROM administrative_provinces WHERE is_active=true),commune_count=$1,sync_status='success',sync_message=$2,updated_at=now() WHERE id=1`,[count,`Đồng bộ ${details.length} tỉnh/thành, nhận ${total} bản ghi`]);
    res.json({success:true,data:{synced:details,total_active:count},message:'Đồng bộ danh mục hành chính thành công'});
  } catch(error){
    try{await client.query('ROLLBACK')}catch{}
    await pool.query(`UPDATE administrative_dataset_meta SET sync_status='error',sync_message=$1,updated_at=now() WHERE id=1`,[error.message]).catch(()=>{});
    res.status(502).json({success:false,message:`Không thể đồng bộ từ Cục Thống kê: ${error.message}`});
  } finally {client.release();}
});


const CATALOG_TYPES = {
  TASK_TYPE: 'Loại nhiệm vụ',
  EMPLOYEE_POSITION: 'Vị trí nhân viên',
  DEPARTMENT: 'Phòng ban',
  SCHEDULE_TYPE: 'Loại lịch trình',
  WAREHOUSE_TYPE: 'Loại kho',
  MATERIAL_BRAND: 'Thương hiệu vật tư',
  STORAGE_CONDITION: 'Điều kiện lưu trữ',
  STOCK_ADJUSTMENT_REASON: 'Lý do điều chỉnh tồn kho',
};
const normalizeCatalogCode = (value) => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toUpperCase().replace(/Đ/g, 'D').replace(/[^A-Z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '').slice(0, 80);

router.get('/catalogs/types', (_req, res) => res.json({
  success: true,
  data: Object.entries(CATALOG_TYPES).map(([code, name]) => ({ code, name })),
}));

router.get('/catalogs', async (req, res) => {
  try {
    const type = clean(req.query.type);
    const includeInactive = String(req.query.include_inactive || '') === 'true';
    const params = [];
    let query = 'SELECT * FROM system_catalogs WHERE 1=1';
    if (type) { params.push(type); query += ` AND catalog_type=$${params.length}`; }
    if (!includeInactive) query += ' AND is_active=true';
    query += ' ORDER BY catalog_type, sort_order, name';
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.post('/catalogs', async (req, res) => {
  try {
    const type = clean(req.body?.catalog_type);
    const name = clean(req.body?.name);
    if (!CATALOG_TYPES[type]) return res.status(400).json({ success:false, message:'Loại danh mục không hợp lệ' });
    if (!name) return res.status(400).json({ success:false, message:'Tên danh mục không được trống' });
    const code = normalizeCatalogCode(req.body?.code || name);
    if (!code) return res.status(400).json({ success:false, message:'Mã danh mục không hợp lệ' });
    const result = await pool.query(`INSERT INTO system_catalogs
      (catalog_type,code,name,description,color,sort_order,is_default,is_active)
      VALUES($1,$2,$3,$4,$5,$6,$7,COALESCE($8,true)) RETURNING *`,
      [type,code,name,clean(req.body?.description),clean(req.body?.color),Number(req.body?.sort_order)||0,Boolean(req.body?.is_default),req.body?.is_active]);
    if (req.body?.is_default) await pool.query('UPDATE system_catalogs SET is_default=false WHERE catalog_type=$1 AND id<>$2',[type,result.rows[0].id]);
    res.status(201).json({success:true,data:result.rows[0],message:'Đã thêm danh mục'});
  } catch(error){
    if(error.code==='23505') return res.status(409).json({success:false,message:'Mã hoặc tên đã tồn tại trong danh mục'});
    res.status(500).json({success:false,message:error.message});
  }
});

router.put('/catalogs/:id', async (req, res) => {
  try {
    const existing = await pool.query('SELECT * FROM system_catalogs WHERE id=$1',[req.params.id]);
    if(!existing.rowCount) return res.status(404).json({success:false,message:'Không tìm thấy danh mục'});
    const name=clean(req.body?.name);
    if(!name) return res.status(400).json({success:false,message:'Tên danh mục không được trống'});
    const result=await pool.query(`UPDATE system_catalogs SET name=$1,description=$2,color=$3,sort_order=$4,
      is_default=$5,is_active=$6,updated_at=now() WHERE id=$7 RETURNING *`,
      [name,clean(req.body?.description),clean(req.body?.color),Number(req.body?.sort_order)||0,Boolean(req.body?.is_default),req.body?.is_active!==false,req.params.id]);
    if(req.body?.is_default) await pool.query('UPDATE system_catalogs SET is_default=false WHERE catalog_type=$1 AND id<>$2',[existing.rows[0].catalog_type,req.params.id]);
    res.json({success:true,data:result.rows[0],message:'Đã cập nhật danh mục'});
  } catch(error){
    if(error.code==='23505') return res.status(409).json({success:false,message:'Tên đã tồn tại trong danh mục'});
    res.status(500).json({success:false,message:error.message});
  }
});

router.delete('/catalogs/:id', async (req,res)=>{
  try{
    const item=(await pool.query('SELECT * FROM system_catalogs WHERE id=$1',[req.params.id])).rows[0];
    if(!item) return res.status(404).json({success:false,message:'Không tìm thấy danh mục'});
    const refs={
      DEPARTMENT:['employees','department'],EMPLOYEE_POSITION:['employees','position'],TASK_TYPE:['tasks','task_type'],SCHEDULE_TYPE:['schedules','schedule_type'],
      WAREHOUSE_TYPE:['warehouses','warehouse_type'],MATERIAL_BRAND:['materials','brand'],STORAGE_CONDITION:['materials','storage_condition']
    };
    const ref=refs[item.catalog_type];
    if(ref){
      const used=await pool.query(`SELECT count(*)::int count FROM ${ref[0]} WHERE ${ref[1]}=$1`,[item.name]);
      if(used.rows[0].count>0) return res.status(409).json({success:false,message:`Danh mục đang được sử dụng bởi ${used.rows[0].count} bản ghi. Hãy chuyển sang Không hoạt động thay vì xóa.`});
    }
    await pool.query('DELETE FROM system_catalogs WHERE id=$1',[req.params.id]);
    res.json({success:true,message:'Đã xóa danh mục'});
  }catch(error){res.status(500).json({success:false,message:error.message});}
});

module.exports=router;
