const express = require('express');
const ExcelJS = require('exceljs');
const pool = require('../config/database');

const router = express.Router();
const TYPES = new Set(['OPENING_BALANCE','RECEIPT','ISSUE','RETURN_IN','ADJUSTMENT_IN','ADJUSTMENT_OUT']);
const INBOUND = new Set(['OPENING_BALANCE','RECEIPT','RETURN_IN','ADJUSTMENT_IN']);
const TYPE_PREFIX = { OPENING_BALANCE:'SD', RECEIPT:'NK', ISSUE:'XK', RETURN_IN:'TK', ADJUSTMENT_IN:'DCT', ADJUSTMENT_OUT:'DCG', REVERSAL:'DA' };
const clean = value => typeof value === 'string' ? value.trim() : value;
const number = (value, fallback = null) => value === '' || value === null || value === undefined ? fallback : Number(value);
const fail = (res, status, message, details) => res.status(status).json({ success:false, message, ...(details ? { details } : {}) });

async function nextDocumentCode(client, type, date) {
  const year = new Date(date || Date.now()).getFullYear();
  await client.query(`INSERT INTO inventory_document_sequences(document_type,sequence_year,next_number)
    VALUES($1,$2,1) ON CONFLICT DO NOTHING`, [type, year]);
  const sequence = await client.query(`SELECT next_number FROM inventory_document_sequences
    WHERE document_type=$1 AND sequence_year=$2 FOR UPDATE`, [type, year]);
  const settings = await client.query('SELECT document_number_digits FROM inventory_settings WHERE id=1');
  const next = Number(sequence.rows[0].next_number);
  await client.query(`UPDATE inventory_document_sequences SET next_number=next_number+1
    WHERE document_type=$1 AND sequence_year=$2`, [type, year]);
  return `${TYPE_PREFIX[type]}-${year}-${String(next).padStart(Number(settings.rows[0]?.document_number_digits || 6),'0')}`;
}

function directionForType(type) {
  return INBOUND.has(type) ? 1 : -1;
}

async function refreshProjectRequirement(client, requirementId) {
  if (!requirementId) return;
  const requirement=await client.query('SELECT status,planned_quantity FROM project_material_requirements WHERE id=$1 FOR UPDATE',[requirementId]);
  if(!requirement.rowCount || requirement.rows[0].status==='CANCELLED')return;
  const totals=await client.query(`SELECT
    COALESCE(SUM(mr.reserved_quantity-mr.released_quantity),0) reserved_quantity,
    COALESCE(SUM(mr.issued_quantity-mr.returned_quantity),0) net_issued_quantity
    FROM material_reservations mr WHERE mr.requirement_id=$1`,[requirementId]);
  const row=requirement.rows[0]; const planned=Number(row.planned_quantity); const reserved=Number(totals.rows[0].reserved_quantity); const issued=Number(totals.rows[0].net_issued_quantity);
  const status=issued+1e-9>=planned?'COMPLETED':issued>0?'PARTIALLY_ISSUED':reserved+1e-9>=planned?'FULLY_RESERVED':reserved>0?'PARTIALLY_RESERVED':row.status==='DRAFT'?'DRAFT':'APPROVED';
  await client.query('UPDATE project_material_requirements SET status=$1,updated_at=NOW() WHERE id=$2',[status,requirementId]);
}

async function normalizeLines(client, warehouseId, type, lines, forcedDirection = null, projectId = null) {
  if (!Array.isArray(lines) || !lines.length) throw Object.assign(new Error('Phiếu phải có ít nhất một dòng vật tư'), { status:400 });
  const normalized = [];
  for (let index = 0; index < lines.length; index += 1) {
    const input = lines[index] || {};
    const materialId = number(input.material_id);
    const locationId = number(input.location_id);
    const inputUnitId = number(input.input_unit_id);
    const inputQuantity = number(input.input_quantity);
    const inputUnitCost = number(input.input_unit_cost, 0);
    const requirementId = number(input.requirement_id);
    const reservationId = number(input.reservation_id);
    if (!materialId || !inputUnitId || !Number.isFinite(inputQuantity) || inputQuantity <= 0) throw Object.assign(new Error(`Dòng ${index + 1}: vật tư, đơn vị và số lượng là bắt buộc`), { status:400 });
    if (!Number.isFinite(inputUnitCost) || inputUnitCost < 0) throw Object.assign(new Error(`Dòng ${index + 1}: đơn giá không hợp lệ`), { status:400 });
    const material = await client.query(`SELECT id,base_unit_id,material_code,COALESCE(name,material_name) AS material_name,tracking_type
      FROM materials WHERE id=$1 AND deleted_at IS NULL AND is_active=true`, [materialId]);
    if (!material.rowCount || !material.rows[0].base_unit_id) throw Object.assign(new Error(`Dòng ${index + 1}: vật tư không hợp lệ hoặc chưa có đơn vị gốc`), { status:400 });
    const unit = await client.query('SELECT id FROM material_units WHERE id=$1 AND is_active=true', [inputUnitId]);
    if (!unit.rowCount) throw Object.assign(new Error(`Dòng ${index + 1}: đơn vị tính không hợp lệ`), { status:400 });
    let factor = 1;
    if (inputUnitId !== material.rows[0].base_unit_id) {
      const conversion = await client.query(`SELECT conversion_factor FROM material_unit_conversions
        WHERE material_id=$1 AND from_unit_id=$2 AND to_unit_id=$3 AND is_active=true`, [materialId,inputUnitId,material.rows[0].base_unit_id]);
      if (!conversion.rowCount) throw Object.assign(new Error(`Dòng ${index + 1}: chưa cấu hình quy đổi về đơn vị gốc`), { status:400 });
      factor = Number(conversion.rows[0].conversion_factor);
    }
    if (locationId) {
      const location = await client.query('SELECT 1 FROM warehouse_locations WHERE id=$1 AND warehouse_id=$2 AND is_active=true', [locationId,warehouseId]);
      if (!location.rowCount) throw Object.assign(new Error(`Dòng ${index + 1}: vị trí không thuộc kho đã chọn`), { status:400 });
    }
    const baseQuantity = inputQuantity * factor;
    const baseUnitCost = inputUnitCost / factor;
    if (projectId && ['ISSUE','RETURN_IN'].includes(type)) {
      if (!requirementId || !reservationId) throw Object.assign(new Error(`Dòng ${index + 1}: phải chọn dự trù và phiếu giữ vật tư của dự án`), { status:400 });
      const linkage = await client.query(`SELECT r.project_id,r.task_id,r.material_id,mr.warehouse_id,mr.location_id,
        mr.reserved_quantity,mr.issued_quantity,mr.returned_quantity,mr.released_quantity,mr.status
        FROM project_material_requirements r JOIN material_reservations mr ON mr.requirement_id=r.id
        WHERE r.id=$1 AND mr.id=$2 FOR UPDATE OF mr`, [requirementId,reservationId]);
      if (!linkage.rowCount || Number(linkage.rows[0].project_id)!==projectId || Number(linkage.rows[0].material_id)!==materialId)
        throw Object.assign(new Error(`Dòng ${index + 1}: dự trù/phiếu giữ không thuộc vật tư và dự án đã chọn`), { status:400 });
      const linked=linkage.rows[0];
      if (Number(linked.warehouse_id)!==warehouseId || (linked.location_id !== null && Number(linked.location_id)!==locationId))
        throw Object.assign(new Error(`Dòng ${index + 1}: kho hoặc vị trí không khớp phiếu giữ vật tư`), { status:400 });
      const issuable=Number(linked.reserved_quantity)-Number(linked.issued_quantity)-Number(linked.released_quantity);
      const returnable=Number(linked.issued_quantity)-Number(linked.returned_quantity);
      if (type==='ISSUE' && (linked.status==='RELEASED' || linked.status==='CANCELLED' || baseQuantity>issuable+1e-9))
        throw Object.assign(new Error(`Dòng ${index + 1}: số lượng xuất vượt lượng còn có thể xuất (${issuable})`), { status:409 });
      if (type==='RETURN_IN' && baseQuantity>returnable+1e-9)
        throw Object.assign(new Error(`Dòng ${index + 1}: số lượng trả vượt lượng đã xuất chưa trả (${returnable})`), { status:409 });
    } else if (requirementId || reservationId) {
      throw Object.assign(new Error(`Dòng ${index + 1}: chỉ phiếu Xuất kho/Trả kho gắn dự án mới được liên kết dự trù`), { status:400 });
    }
    normalized.push({
      line_number:index + 1, material_id:materialId, location_id:locationId, input_unit_id:inputUnitId,
      input_quantity:inputQuantity, conversion_factor:factor, base_quantity:baseQuantity,
      input_unit_cost:inputUnitCost, base_unit_cost:baseUnitCost, total_cost:inputQuantity * inputUnitCost,
      stock_direction:forcedDirection ?? directionForType(type), batch_number:clean(input.batch_number) || null,
      serial_number:clean(input.serial_number) || null, manufactured_date:input.manufactured_date || null,
      expiry_date:input.expiry_date || null, note:clean(input.note) || null, requirement_id:requirementId, reservation_id:reservationId,
    });
  }
  return normalized;
}

async function replaceLines(client, documentId, lines) {
  await client.query('DELETE FROM inventory_document_lines WHERE document_id=$1', [documentId]);
  for (const line of lines) {
    await client.query(`INSERT INTO inventory_document_lines(document_id,line_number,material_id,location_id,input_unit_id,
      input_quantity,conversion_factor,base_quantity,input_unit_cost,base_unit_cost,total_cost,stock_direction,
      batch_number,serial_number,manufactured_date,expiry_date,note,requirement_id,reservation_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`, [documentId,line.line_number,line.material_id,line.location_id,line.input_unit_id,
      line.input_quantity,line.conversion_factor,line.base_quantity,line.input_unit_cost,line.base_unit_cost,line.total_cost,line.stock_direction,
      line.batch_number,line.serial_number,line.manufactured_date,line.expiry_date,line.note,line.requirement_id,line.reservation_id]);
  }
  const totals = lines.reduce((sum,line) => ({ quantity:sum.quantity + line.base_quantity, amount:sum.amount + line.total_cost }), { quantity:0, amount:0 });
  await client.query('UPDATE inventory_documents SET total_quantity=$1,total_amount=$2,updated_at=NOW() WHERE id=$3', [totals.quantity,totals.amount,documentId]);
}

async function postDocument(client, documentId) {
  const document = await client.query('SELECT * FROM inventory_documents WHERE id=$1 FOR UPDATE', [documentId]);
  if (!document.rowCount) throw Object.assign(new Error('Không tìm thấy phiếu kho'), { status:404 });
  const header = document.rows[0];
  if (header.status !== 'DRAFT') throw Object.assign(new Error('Chỉ phiếu Nháp mới được ghi sổ'), { status:409 });
  const lines = await client.query('SELECT * FROM inventory_document_lines WHERE document_id=$1 ORDER BY line_number FOR UPDATE', [documentId]);
  if (!lines.rowCount) throw Object.assign(new Error('Phiếu chưa có dòng vật tư'), { status:400 });
  let totalAmount = 0;
  let sourceType=header.document_type;
  if(header.document_type==='REVERSAL'){
    const source=await client.query('SELECT document_type FROM inventory_documents WHERE id=$1',[header.reversal_of_document_id]);
    sourceType=source.rows[0]?.document_type || 'REVERSAL';
  }
  for (const line of lines.rows) {
    await client.query(`INSERT INTO inventory_balances(material_id,warehouse_id,location_id)
      VALUES($1,$2,$3) ON CONFLICT DO NOTHING`, [line.material_id,header.warehouse_id,line.location_id]);
    const balanceResult = await client.query(`SELECT * FROM inventory_balances
      WHERE material_id=$1 AND warehouse_id=$2 AND location_id IS NOT DISTINCT FROM $3 FOR UPDATE`, [line.material_id,header.warehouse_id,line.location_id]);
    const balance = balanceResult.rows[0];
    const oldQuantity = Number(balance.quantity_on_hand || 0);
    const reserved = Number(balance.quantity_reserved || 0);
    const oldAverage = Number(balance.average_cost || 0);
    const quantity = Number(line.base_quantity);
    const direction = Number(line.stock_direction);
    let reservedAllocation=0;
    let linkedReservation=null;
    if(line.reservation_id){
      const reservation=await client.query('SELECT * FROM material_reservations WHERE id=$1 FOR UPDATE',[line.reservation_id]);
      if(!reservation.rowCount)throw Object.assign(new Error('Không tìm thấy phiếu giữ vật tư liên kết'),{status:409});
      linkedReservation=reservation.rows[0];
      if(sourceType==='ISSUE' && header.document_type!=='REVERSAL'){
        const issuable=Number(linkedReservation.reserved_quantity)-Number(linkedReservation.issued_quantity)-Number(linkedReservation.released_quantity);
        if(quantity>issuable+1e-9)throw Object.assign(new Error(`Lượng giữ còn có thể xuất chỉ còn ${issuable}`),{status:409});
        reservedAllocation=quantity;
      }
      if(sourceType==='RETURN_IN' && header.document_type!=='REVERSAL'){
        const returnable=Number(linkedReservation.issued_quantity)-Number(linkedReservation.returned_quantity);
        if(quantity>returnable+1e-9)throw Object.assign(new Error(`Lượng đã xuất chưa trả chỉ còn ${returnable}`),{status:409});
      }
      if(sourceType==='ISSUE' && header.document_type==='REVERSAL' && Number(linkedReservation.issued_quantity)-quantity<Number(linkedReservation.returned_quantity)-1e-9)
        throw Object.assign(new Error('Không thể đảo phiếu xuất vì vật tư đã có nghiệp vụ trả kho liên quan'),{status:409});
    }
    let unitCost;
    let newQuantity;
    let newAverage;
    if (direction > 0) {
      unitCost = Number(line.base_unit_cost || 0);
      if ((header.document_type === 'RETURN_IN' || header.document_type === 'REVERSAL') && unitCost <= 0) unitCost = oldAverage;
      newQuantity = oldQuantity + quantity;
      newAverage = newQuantity > 0 ? ((oldQuantity * oldAverage) + (quantity * unitCost)) / newQuantity : 0;
    } else {
      const available = oldQuantity - reserved + reservedAllocation;
      if (quantity > available + 0.0000001) throw Object.assign(new Error(`Không đủ tồn khả dụng cho vật tư #${line.material_id}. Khả dụng ${available}, yêu cầu ${quantity}`), { status:409, details:{ material_id:line.material_id,available_quantity:available,requested_quantity:quantity } });
      newQuantity = oldQuantity - quantity;
      if (header.document_type === 'REVERSAL' && Number(line.base_unit_cost || 0) > 0) {
        unitCost = Number(line.base_unit_cost);
        const remainingValue = (oldQuantity * oldAverage) - (quantity * unitCost);
        if (remainingValue < -0.01) throw Object.assign(new Error('Không thể đảo phiếu vì giá trị tồn kho hiện tại không đủ'), { status:409 });
        newAverage = newQuantity > 0 ? Math.max(remainingValue,0) / newQuantity : 0;
      } else {
        unitCost = oldAverage;
        newAverage = oldAverage;
      }
    }
    const lineTotal = quantity * unitCost;
    totalAmount += lineTotal;
    await client.query(`UPDATE inventory_balances SET quantity_on_hand=$1,average_cost=$2,last_transaction_at=NOW(),updated_at=NOW()
      WHERE id=$3`, [newQuantity,newAverage,balance.id]);
    if(linkedReservation && sourceType==='ISSUE' && header.document_type!=='REVERSAL'){
      await client.query('UPDATE inventory_balances SET quantity_reserved=GREATEST(quantity_reserved-$1,0),updated_at=NOW() WHERE id=$2',[quantity,balance.id]);
      await client.query(`UPDATE material_reservations SET issued_quantity=issued_quantity+$1,status=CASE WHEN issued_quantity+$1+released_quantity>=reserved_quantity THEN 'COMPLETED' ELSE 'PARTIALLY_ISSUED' END,updated_at=NOW() WHERE id=$2`,[quantity,linkedReservation.id]);
    } else if(linkedReservation && sourceType==='RETURN_IN' && header.document_type!=='REVERSAL'){
      await client.query('UPDATE material_reservations SET returned_quantity=returned_quantity+$1,updated_at=NOW() WHERE id=$2',[quantity,linkedReservation.id]);
    } else if(linkedReservation && sourceType==='ISSUE' && header.document_type==='REVERSAL'){
      await client.query('UPDATE inventory_balances SET quantity_reserved=quantity_reserved+$1,updated_at=NOW() WHERE id=$2',[quantity,balance.id]);
      await client.query(`UPDATE material_reservations SET issued_quantity=issued_quantity-$1,status=CASE WHEN issued_quantity-$1<=0 THEN 'CONFIRMED' ELSE 'PARTIALLY_ISSUED' END,updated_at=NOW() WHERE id=$2`,[quantity,linkedReservation.id]);
    } else if(linkedReservation && sourceType==='RETURN_IN' && header.document_type==='REVERSAL'){
      await client.query('UPDATE material_reservations SET returned_quantity=returned_quantity-$1,updated_at=NOW() WHERE id=$2',[quantity,linkedReservation.id]);
    }
    await client.query(`UPDATE inventory_document_lines SET base_unit_cost=$1,total_cost=$2 WHERE id=$3`, [unitCost,lineTotal,line.id]);
    await client.query(`INSERT INTO inventory_transactions(document_id,document_line_id,transaction_type,material_id,warehouse_id,
      location_id,stock_direction,base_quantity,unit_cost,total_cost,balance_quantity_after,average_cost_after,project_id,task_id,requirement_id,reservation_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`, [documentId,line.id,header.document_type,line.material_id,header.warehouse_id,
      line.location_id,direction,quantity,unitCost,lineTotal,newQuantity,newAverage,header.project_id,header.task_id,line.requirement_id,line.reservation_id]);
    await refreshProjectRequirement(client,line.requirement_id);
  }
  const posted = await client.query(`UPDATE inventory_documents SET status='POSTED',total_amount=$1,posted_at=NOW(),updated_at=NOW()
    WHERE id=$2 RETURNING *`, [totalAmount,documentId]);
  return posted.rows[0];
}

router.get('/meta', async (_req,res,next) => {
  try {
    const [materials,warehouses,units,suppliers,reasons,projects] = await Promise.all([
      pool.query(`SELECT id,material_code,COALESCE(name,material_name) AS name,base_unit_id,tracking_type
        FROM materials WHERE deleted_at IS NULL AND is_active=true ORDER BY material_code`),
      pool.query(`SELECT w.id,w.warehouse_code,w.name,w.is_default,
        COALESCE((SELECT json_agg(l ORDER BY l.location_code) FROM warehouse_locations l WHERE l.warehouse_id=w.id AND l.is_active=true),'[]'::json) locations
        FROM warehouses w WHERE w.is_active=true ORDER BY w.is_default DESC,w.name`),
      pool.query('SELECT id,code,name,symbol FROM material_units WHERE is_active=true ORDER BY name'),
      pool.query('SELECT id,supplier_code,name FROM suppliers WHERE is_active=true ORDER BY name'),
      pool.query("SELECT code,name FROM system_catalogs WHERE catalog_type='STOCK_ADJUSTMENT_REASON' AND is_active=true ORDER BY sort_order,name"),
      pool.query("SELECT id,project_code,project_name,status FROM projects WHERE status<>'Hủy' ORDER BY project_code")
    ]);
    res.json({ success:true, data:{ materials:materials.rows,warehouses:warehouses.rows,units:units.rows,suppliers:suppliers.rows,reasons:reasons.rows,projects:projects.rows } });
  } catch (error) { next(error); }
});

router.get('/project-context/:projectId', async (req,res,next) => {
  try{
    const projectId=Number(req.params.projectId);
    const project=await pool.query('SELECT id,project_code,project_name FROM projects WHERE id=$1',[projectId]);
    if(!project.rowCount)return fail(res,404,'Không tìm thấy dự án');
    const requirements=await pool.query(`SELECT r.id,r.task_id,r.material_id,r.planned_quantity,r.status,m.material_code,
      COALESCE(m.name,m.material_name) material_name,u.symbol unit_symbol,t.task_name,
      COALESCE((SELECT json_agg(json_build_object('id',mr.id,'warehouse_id',mr.warehouse_id,'location_id',mr.location_id,
        'warehouse_name',w.name,'reserved_quantity',mr.reserved_quantity,'issued_quantity',mr.issued_quantity,
        'returned_quantity',mr.returned_quantity,'released_quantity',mr.released_quantity,
        'issuable_quantity',mr.reserved_quantity-mr.issued_quantity-mr.released_quantity,
        'returnable_quantity',mr.issued_quantity-mr.returned_quantity,'status',mr.status) ORDER BY mr.id)
        FROM material_reservations mr JOIN warehouses w ON w.id=mr.warehouse_id WHERE mr.requirement_id=r.id),'[]'::json) reservations
      FROM project_material_requirements r JOIN materials m ON m.id=r.material_id JOIN material_units u ON u.id=r.base_unit_id
      LEFT JOIN tasks t ON t.id=r.task_id WHERE r.project_id=$1 AND r.status<>'CANCELLED' ORDER BY m.material_code`,[projectId]);
    res.json({success:true,data:{project:project.rows[0],requirements:requirements.rows}});
  }catch(error){next(error);}
});

router.get('/balances', async (req,res,next) => {
  try {
    const values=[]; const where=['m.deleted_at IS NULL'];
    if (req.query.warehouse_id) { values.push(Number(req.query.warehouse_id)); where.push(`b.warehouse_id=$${values.length}`); }
    if (req.query.material_id) { values.push(Number(req.query.material_id)); where.push(`b.material_id=$${values.length}`); }
    if (req.query.search) { values.push(`%${clean(req.query.search)}%`); where.push(`(m.material_code ILIKE $${values.length} OR COALESCE(m.name,m.material_name) ILIKE $${values.length})`); }
    const result=await pool.query(`SELECT b.*,m.material_code,COALESCE(m.name,m.material_name) material_name,u.symbol unit_symbol,
      w.warehouse_code,w.name warehouse_name,l.location_code,l.name location_name,
      (b.quantity_on_hand-b.quantity_reserved)::numeric(18,6) quantity_available,
      (b.quantity_on_hand*b.average_cost)::numeric(18,4) stock_value
      FROM inventory_balances b JOIN materials m ON m.id=b.material_id LEFT JOIN material_units u ON u.id=m.base_unit_id
      JOIN warehouses w ON w.id=b.warehouse_id LEFT JOIN warehouse_locations l ON l.id=b.location_id
      WHERE ${where.join(' AND ')} ORDER BY m.material_code,w.name,l.location_code NULLS FIRST`,values);
    const summary=result.rows.reduce((acc,row)=>{acc.quantity_on_hand+=Number(row.quantity_on_hand);acc.quantity_reserved+=Number(row.quantity_reserved);acc.quantity_available+=Number(row.quantity_available);acc.stock_value+=Number(row.stock_value);return acc;},{quantity_on_hand:0,quantity_reserved:0,quantity_available:0,stock_value:0});
    res.json({success:true,data:result.rows,summary});
  } catch(error){next(error);}
});

router.get('/transactions', async (req,res,next) => {
  try {
    const values=[]; const where=['1=1'];
    if(req.query.material_id){values.push(Number(req.query.material_id));where.push(`t.material_id=$${values.length}`);}
    if(req.query.warehouse_id){values.push(Number(req.query.warehouse_id));where.push(`t.warehouse_id=$${values.length}`);}
    if(req.query.date_from){values.push(req.query.date_from);where.push(`t.transaction_date::date >= $${values.length}`);}
    if(req.query.date_to){values.push(req.query.date_to);where.push(`t.transaction_date::date <= $${values.length}`);}
    const result=await pool.query(`SELECT t.*,d.document_code,d.document_date,m.material_code,COALESCE(m.name,m.material_name) material_name,
      u.symbol unit_symbol,w.name warehouse_name,l.location_code
      FROM inventory_transactions t JOIN inventory_documents d ON d.id=t.document_id JOIN materials m ON m.id=t.material_id
      LEFT JOIN material_units u ON u.id=m.base_unit_id JOIN warehouses w ON w.id=t.warehouse_id LEFT JOIN warehouse_locations l ON l.id=t.location_id
      WHERE ${where.join(' AND ')} ORDER BY t.transaction_date DESC,t.id DESC LIMIT 1000`,values);
    res.json({success:true,data:result.rows});
  }catch(error){next(error);}
});

router.get('/documents', async (req,res,next) => {
  try {
    const values=[]; const where=['1=1'];
    if(req.query.status){values.push(req.query.status);where.push(`d.status=$${values.length}`);}
    if(req.query.document_type){values.push(req.query.document_type);where.push(`d.document_type=$${values.length}`);}
    if(req.query.warehouse_id){values.push(Number(req.query.warehouse_id));where.push(`d.warehouse_id=$${values.length}`);}
    if(req.query.date_from){values.push(req.query.date_from);where.push(`d.document_date >= $${values.length}`);}
    if(req.query.date_to){values.push(req.query.date_to);where.push(`d.document_date <= $${values.length}`);}
    const result=await pool.query(`SELECT d.*,w.name warehouse_name,s.name supplier_name,p.project_code,p.project_name,
      (SELECT count(*)::int FROM inventory_document_lines dl WHERE dl.document_id=d.id) line_count,
      rd.document_code reversal_document_code
      FROM inventory_documents d JOIN warehouses w ON w.id=d.warehouse_id LEFT JOIN suppliers s ON s.id=d.supplier_id LEFT JOIN projects p ON p.id=d.project_id
      LEFT JOIN inventory_documents rd ON rd.reversal_of_document_id=d.id
      WHERE ${where.join(' AND ')} ORDER BY d.document_date DESC,d.id DESC LIMIT 500`,values);
    res.json({success:true,data:result.rows});
  }catch(error){next(error);}
});

router.get('/documents/:id/export.xlsx', async (req,res,next) => {
  try {
    const header=await pool.query(`SELECT d.*,w.name warehouse_name,s.name supplier_name FROM inventory_documents d
      JOIN warehouses w ON w.id=d.warehouse_id LEFT JOIN suppliers s ON s.id=d.supplier_id WHERE d.id=$1`,[req.params.id]);
    if(!header.rowCount)return fail(res,404,'Không tìm thấy phiếu kho');
    const lines=await pool.query(`SELECT dl.*,m.material_code,COALESCE(m.name,m.material_name) material_name,u.name unit_name,u.symbol
      FROM inventory_document_lines dl JOIN materials m ON m.id=dl.material_id JOIN material_units u ON u.id=dl.input_unit_id
      WHERE dl.document_id=$1 ORDER BY dl.line_number`,[req.params.id]);
    const workbook=new ExcelJS.Workbook(); const sheet=workbook.addWorksheet('Phiếu kho'); const doc=header.rows[0];
    sheet.addRow(['SIMBA PMS — PHIẾU CHỨNG TỪ KHO']); sheet.mergeCells('A1:H1'); sheet.getCell('A1').font={bold:true,size:16};
    sheet.addRow(['Số phiếu',doc.document_code,'Loại',doc.document_type,'Ngày',doc.document_date,'Trạng thái',doc.status]);
    sheet.addRow(['Kho',doc.warehouse_name,'Nhà cung cấp',doc.supplier_name||'','Tham chiếu',doc.reference_number||'','Lý do',doc.reason_code||'']);
    sheet.addRow([]); sheet.addRow(['STT','Mã vật tư','Tên vật tư','Đơn vị nhập','Số lượng nhập','Số lượng gốc','Đơn giá','Thành tiền']);
    lines.rows.forEach(line=>sheet.addRow([line.line_number,line.material_code,line.material_name,`${line.unit_name} (${line.symbol})`,Number(line.input_quantity),Number(line.base_quantity),Number(line.input_unit_cost),Number(line.total_cost)]));
    sheet.addRow(['','','','','','Tổng',Number(doc.total_quantity),Number(doc.total_amount)]);
    sheet.columns=[{width:8},{width:18},{width:32},{width:18},{width:16},{width:16},{width:18},{width:20}];
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition',`attachment; filename="${doc.document_code}.xlsx"`);
    await workbook.xlsx.write(res); res.end();
  }catch(error){next(error);}
});

router.get('/documents/:id', async (req,res,next) => {
  try {
    const document=await pool.query(`SELECT d.*,w.name warehouse_name,s.name supplier_name,p.project_code,p.project_name FROM inventory_documents d
      JOIN warehouses w ON w.id=d.warehouse_id LEFT JOIN suppliers s ON s.id=d.supplier_id LEFT JOIN projects p ON p.id=d.project_id WHERE d.id=$1`,[req.params.id]);
    if(!document.rowCount)return fail(res,404,'Không tìm thấy phiếu kho');
    const lines=await pool.query(`SELECT dl.*,m.material_code,COALESCE(m.name,m.material_name) material_name,bu.name base_unit_name,bu.symbol base_unit_symbol,
      iu.name input_unit_name,iu.symbol input_unit_symbol,l.location_code,l.name location_name,r.status requirement_status
      FROM inventory_document_lines dl JOIN materials m ON m.id=dl.material_id LEFT JOIN material_units bu ON bu.id=m.base_unit_id
      JOIN material_units iu ON iu.id=dl.input_unit_id LEFT JOIN warehouse_locations l ON l.id=dl.location_id LEFT JOIN project_material_requirements r ON r.id=dl.requirement_id
      WHERE dl.document_id=$1 ORDER BY dl.line_number`,[req.params.id]);
    res.json({success:true,data:{...document.rows[0],lines:lines.rows}});
  }catch(error){next(error);}
});

router.post('/documents', async (req,res,next) => {
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const type=clean(req.body.document_type||'').toUpperCase();
    if(!TYPES.has(type))throw Object.assign(new Error('Loại phiếu kho không hợp lệ'),{status:400});
    const warehouseId=number(req.body.warehouse_id); if(!warehouseId)throw Object.assign(new Error('Kho là bắt buộc'),{status:400});
    const warehouse=await client.query('SELECT 1 FROM warehouses WHERE id=$1 AND is_active=true',[warehouseId]); if(!warehouse.rowCount)throw Object.assign(new Error('Kho không hợp lệ'),{status:400});
    if(type.startsWith('ADJUSTMENT')&&!clean(req.body.reason_code))throw Object.assign(new Error('Phiếu điều chỉnh bắt buộc chọn lý do'),{status:400});
    const projectId=number(req.body.project_id); const taskId=number(req.body.task_id);
    if(projectId){const project=await client.query('SELECT id FROM projects WHERE id=$1',[projectId]);if(!project.rowCount)throw Object.assign(new Error('Dự án không hợp lệ'),{status:400});}
    if(taskId){const task=await client.query('SELECT id FROM tasks WHERE id=$1 AND project_id=$2',[taskId,projectId]);if(!task.rowCount)throw Object.assign(new Error('Nhiệm vụ không thuộc dự án'),{status:400});}
    const date=req.body.document_date||new Date().toISOString().slice(0,10); const lines=await normalizeLines(client,warehouseId,type,req.body.lines,null,projectId);
    const code=await nextDocumentCode(client,type,date);
    const result=await client.query(`INSERT INTO inventory_documents(document_code,document_type,document_date,warehouse_id,supplier_id,reference_number,reason_code,notes,idempotency_key,project_id,task_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[code,type,date,warehouseId,number(req.body.supplier_id),clean(req.body.reference_number)||null,clean(req.body.reason_code)||null,clean(req.body.notes)||null,clean(req.body.idempotency_key)||null,projectId,taskId]);
    await replaceLines(client,result.rows[0].id,lines); await client.query('COMMIT');
    res.status(201).json({success:true,message:'Đã tạo phiếu kho ở trạng thái Nháp',data:result.rows[0]});
  }catch(error){await client.query('ROLLBACK');if(error.code==='23505')return fail(res,409,'Yêu cầu hoặc mã phiếu đã tồn tại');if(error.status)return fail(res,error.status,error.message,error.details);next(error);}finally{client.release();}
});

router.put('/documents/:id', async (req,res,next) => {
  const client=await pool.connect();
  try{
    await client.query('BEGIN'); const current=await client.query('SELECT * FROM inventory_documents WHERE id=$1 FOR UPDATE',[req.params.id]);
    if(!current.rowCount)throw Object.assign(new Error('Không tìm thấy phiếu kho'),{status:404}); if(current.rows[0].status!=='DRAFT')throw Object.assign(new Error('Chỉ phiếu Nháp mới được chỉnh sửa'),{status:409});
    const type=current.rows[0].document_type; const warehouseId=number(req.body.warehouse_id)||current.rows[0].warehouse_id;
    if(type.startsWith('ADJUSTMENT')&&!clean(req.body.reason_code))throw Object.assign(new Error('Phiếu điều chỉnh bắt buộc chọn lý do'),{status:400});
    const projectId=number(req.body.project_id)??current.rows[0].project_id; const taskId=number(req.body.task_id)??current.rows[0].task_id;
    const lines=await normalizeLines(client,warehouseId,type,req.body.lines,null,Number(projectId));
    await client.query(`UPDATE inventory_documents SET document_date=$1,warehouse_id=$2,supplier_id=$3,reference_number=$4,reason_code=$5,notes=$6,project_id=$7,task_id=$8,updated_at=NOW() WHERE id=$9`,
      [req.body.document_date||current.rows[0].document_date,warehouseId,number(req.body.supplier_id),clean(req.body.reference_number)||null,clean(req.body.reason_code)||null,clean(req.body.notes)||null,projectId,taskId,req.params.id]);
    await replaceLines(client,req.params.id,lines); await client.query('COMMIT'); res.json({success:true,message:'Đã cập nhật phiếu Nháp'});
  }catch(error){await client.query('ROLLBACK');if(error.status)return fail(res,error.status,error.message,error.details);next(error);}finally{client.release();}
});

router.post('/documents/:id/post', async (req,res,next) => {
  const client=await pool.connect();
  try{await client.query('BEGIN');const result=await postDocument(client,Number(req.params.id));await client.query('COMMIT');res.json({success:true,message:'Đã ghi sổ phiếu kho',data:result});}
  catch(error){await client.query('ROLLBACK');if(error.status)return fail(res,error.status,error.message,error.details);next(error);}finally{client.release();}
});

router.post('/documents/:id/reverse', async (req,res,next) => {
  const client=await pool.connect();
  try{
    await client.query('BEGIN'); const original=await client.query('SELECT * FROM inventory_documents WHERE id=$1 FOR UPDATE',[req.params.id]);
    if(!original.rowCount)throw Object.assign(new Error('Không tìm thấy phiếu kho'),{status:404}); if(original.rows[0].status!=='POSTED')throw Object.assign(new Error('Chỉ phiếu Đã ghi sổ mới được đảo'),{status:409});
    const existed=await client.query('SELECT 1 FROM inventory_documents WHERE reversal_of_document_id=$1',[req.params.id]); if(existed.rowCount)throw Object.assign(new Error('Phiếu này đã có phiếu đảo'),{status:409});
    const originalLines=await client.query('SELECT * FROM inventory_document_lines WHERE document_id=$1 ORDER BY line_number',[req.params.id]);
    const date=new Date().toISOString().slice(0,10); const code=await nextDocumentCode(client,'REVERSAL',date);
    const reversed=await client.query(`INSERT INTO inventory_documents(document_code,document_type,document_date,warehouse_id,reference_number,reason_code,notes,reversal_of_document_id,project_id,task_id)
      VALUES($1,'REVERSAL',$2,$3,$4,'REVERSAL',$5,$6,$7,$8) RETURNING *`,[code,date,original.rows[0].warehouse_id,original.rows[0].document_code,clean(req.body.notes)||`Đảo phiếu ${original.rows[0].document_code}`,original.rows[0].id,original.rows[0].project_id,original.rows[0].task_id]);
    const copied=originalLines.rows.map((line,index)=>({...line,line_number:index+1,stock_direction:-Number(line.stock_direction)}));
    await replaceLines(client,reversed.rows[0].id,copied); await postDocument(client,reversed.rows[0].id);
    await client.query("UPDATE inventory_documents SET status='REVERSED',reversed_at=NOW(),updated_at=NOW() WHERE id=$1",[original.rows[0].id]);
    await client.query('COMMIT'); res.json({success:true,message:'Đã tạo và ghi sổ phiếu đảo',data:reversed.rows[0]});
  }catch(error){await client.query('ROLLBACK');if(error.status)return fail(res,error.status,error.message,error.details);next(error);}finally{client.release();}
});

router.delete('/documents/:id', async (req,res,next) => {
  try{const result=await pool.query("UPDATE inventory_documents SET status='CANCELLED',updated_at=NOW() WHERE id=$1 AND status='DRAFT' RETURNING id",[req.params.id]);if(!result.rowCount)return fail(res,409,'Chỉ phiếu Nháp mới được hủy');res.json({success:true,message:'Đã hủy phiếu Nháp'});}catch(error){next(error);}
});

module.exports=router;
