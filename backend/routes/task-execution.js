const express = require('express');
const multer = require('multer');
const ExcelJS = require('exceljs');
const pool = require('../config/database');

const router = express.Router();
const upload = multer({ storage:multer.memoryStorage(), limits:{ fileSize:10 * 1024 * 1024 } });

const STATUSES = ['Chưa xếp lịch','Đã xếp lịch','Đang thực hiện','Hoàn thành','Không thực hiện được','Dời lịch','Hủy','Cần xử lý lại'];
const EXECUTION_LABELS = { DELIVERY:'Giao hàng', INSTALLATION:'Lắp đặt' };
const clean = value => value === undefined || value === null ? null : String(value).trim() || null;
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').trim().toLowerCase();
const isoDate = value => {
  if (!value) return null;
  if (value instanceof Date) {
    const year=value.getFullYear(); const month=String(value.getMonth()+1).padStart(2,'0'); const day=String(value.getDate()).padStart(2,'0');
    return `${year}-${month}-${day}`;
  }
  if (typeof value === 'number') return isoDate(new Date(Math.round((value - 25569) * 86400 * 1000)));
  const text=String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0,10);
  const match=text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  return match ? `${match[3]}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}` : null;
};
const excelValue = cell => {
  const value=cell?.value;
  if (value && typeof value === 'object' && !(value instanceof Date)) return value.result ?? value.text ?? value.richText?.map(item=>item.text).join('') ?? null;
  return value;
};
const fileDate = value => value ? new Date(`${isoDate(value)}T12:00:00Z`) : null;

async function getExecutionTask(db, taskId) {
  const result=await db.query(`SELECT t.*,p.project_name,p.project_code,wi.execution_type item_execution_type
    FROM tasks t JOIN projects p ON p.id=t.project_id LEFT JOIN work_items wi ON wi.id=t.work_item_id
    WHERE t.id=$1 AND t.deleted_at IS NULL`,[taskId]);
  if(!result.rowCount) throw Object.assign(new Error('Không tìm thấy Task'),{status:404});
  const task=result.rows[0];
  task.execution_type=task.execution_type||task.item_execution_type;
  if(!EXECUTION_LABELS[task.execution_type]) throw Object.assign(new Error('Task này không phải Công việc Giao hàng hoặc Lắp đặt'),{status:400});
  return task;
}

async function loadLookups(db) {
  const provinces=await db.query(`SELECT code,name,unit_type FROM administrative_provinces WHERE is_active=true ORDER BY code`);
  const communes=await db.query(`SELECT code,province_code,name,unit_type FROM administrative_communes WHERE is_active=true ORDER BY province_code,name`);
  const employees=await db.query(`SELECT id,employee_code,full_name,position,department FROM employees WHERE status='Hoạt động' ORDER BY full_name`);
  return {provinces:provinces.rows,communes:communes.rows,employees:employees.rows};
}

function resolveByName(rows, name, extraFilter=()=>true) {
  if(!clean(name)) return {item:null,error:null};
  const key=normalize(name);
  const matches=rows.filter(item=>extraFilter(item) && [item.name,`${item.unit_type||''} ${item.name}`].some(value=>normalize(value)===key));
  if(matches.length===1) return {item:matches[0],error:null};
  return {item:null,error:matches.length?'Tên bị trùng, vui lòng dùng mã':'Không tìm thấy trong danh mục'};
}

function prepareRow(raw,rowNumber,task,lookups,existingById,existingByCode) {
  const errors=[];
  const locationName=clean(raw.location_name);
  const address=clean(raw.location_address);
  if(!locationName) errors.push('Thiếu Tên địa điểm');
  if(!address) errors.push('Thiếu Địa chỉ');

  let province=clean(raw.province_code) ? lookups.provinces.find(item=>item.code===clean(raw.province_code)) : null;
  if(clean(raw.province_code)&&!province) errors.push('Mã Tỉnh/TP không hợp lệ');
  if(!province&&clean(raw.province_name)){
    const resolved=resolveByName(lookups.provinces,raw.province_name); province=resolved.item;
    if(resolved.error) errors.push(`Tỉnh/TP: ${resolved.error}`);
  }

  let commune=clean(raw.commune_code) ? lookups.communes.find(item=>item.code===clean(raw.commune_code)) : null;
  if(clean(raw.commune_code)&&!commune) errors.push('Mã Phường/Xã không hợp lệ');
  if(!commune&&clean(raw.commune_name)){
    const resolved=resolveByName(lookups.communes,raw.commune_name,item=>!province||item.province_code===province.code); commune=resolved.item;
    if(resolved.error) errors.push(`Phường/Xã: ${resolved.error}`);
  }
  if(commune&&!province) province=lookups.provinces.find(item=>item.code===commune.province_code);
  if(commune&&province&&commune.province_code!==province.code) errors.push('Phường/Xã không thuộc Tỉnh/TP đã chọn');

  let employee=null;
  if(clean(raw.employee_code)) employee=lookups.employees.find(item=>item.employee_code===clean(raw.employee_code));
  if(clean(raw.employee_code)&&!employee) errors.push('Mã nhân viên không hợp lệ');
  if(!employee&&clean(raw.employee_name)){
    const matches=lookups.employees.filter(item=>normalize(item.full_name)===normalize(raw.employee_name));
    if(matches.length===1) employee=matches[0]; else errors.push(matches.length?'Tên nhân viên bị trùng, vui lòng dùng mã':'Nhân viên không tồn tại');
  }

  const status=clean(raw.status)||'Chưa xếp lịch';
  if(!STATUSES.includes(status)) errors.push('Trạng thái không hợp lệ');
  const plannedDate=(clean(raw.planned_date)||raw.planned_date instanceof Date) ? isoDate(raw.planned_date) : null;
  const completedDate=(clean(raw.actual_completion_date)||raw.actual_completion_date instanceof Date) ? isoDate(raw.actual_completion_date) : null;
  if(raw.planned_date&&!plannedDate) errors.push('Ngày dự kiến không hợp lệ');
  if(raw.actual_completion_date&&!completedDate) errors.push('Ngày hoàn thành không hợp lệ');

  const systemId=Number(raw.location_id)||null;
  const locationCode=clean(raw.location_code);
  const existing=systemId?existingById.get(systemId):(locationCode?existingByCode.get(locationCode):null);
  if(systemId&&!existing) errors.push('Mã hệ thống không thuộc Task này');
  const rowVersion=Number(raw.row_version)||null;
  if(existing&&rowVersion&&Number(existing.row_version)!==rowVersion) errors.push('Dòng đã thay đổi trên hệ thống sau khi file được xuất');

  return {row_number:rowNumber,action:existing?'UPDATE':'INSERT',valid:errors.length===0,errors,data:{
    id:existing?.id||null,location_code:locationCode||existing?.location_code||null,row_version:rowVersion||existing?.row_version||null,
    execution_type:task.execution_type,location_name:locationName,location_address:address,
    province_code:province?.code||null,province_name:province?.name||null,commune_code:commune?.code||null,commune_name:commune?.name||null,
    planned_date:plannedDate,assigned_employee_id:employee?.id||null,employee_code:employee?.employee_code||null,employee_name:employee?.full_name||null,
    status,actual_completion_date:completedDate,contact_person:clean(raw.contact_person),contact_phone:clean(raw.contact_phone),notes:clean(raw.notes),
  }};
}

function locationSummary(rows) {
  const total=rows.length; const completed=rows.filter(item=>item.is_completed||item.status==='Hoàn thành').length;
  return {total,completed,pending:total-completed,progress:total?Math.round(completed/total*100):0,ready_for_task_completion:total>0&&completed===total};
}

async function taskDetail(db,taskId) {
  const task=await getExecutionTask(db,taskId);
  const [locations,batches]=await Promise.all([
    db.query(`SELECT location.*,province.name province_name,province.unit_type province_unit_type,
      commune.name commune_name,commune.unit_type commune_unit_type,employee.employee_code,employee.full_name employee_name
      FROM task_locations location
      LEFT JOIN administrative_provinces province ON province.code=location.province_code
      LEFT JOIN administrative_communes commune ON commune.code=location.commune_code
      LEFT JOIN employees employee ON employee.id=location.assigned_employee_id
      WHERE location.task_id=$1 ORDER BY COALESCE(location.planned_date,'9999-12-31'),location.sequence_no,location.id`,[taskId]),
    db.query(`SELECT id,original_filename,status,total_rows,valid_rows,error_rows,applied_rows,created_at,applied_at
      FROM task_location_import_batches WHERE task_id=$1 ORDER BY created_at DESC LIMIT 10`,[taskId]),
  ]);
  return {task:{...task,execution_label:EXECUTION_LABELS[task.execution_type]},locations:locations.rows,summary:locationSummary(locations.rows),import_batches:batches.rows};
}

async function audit(db,taskId,locationId,action,previous,current,userId){
  await db.query(`INSERT INTO task_location_audit_logs(task_id,location_id,action,previous_data,current_data,created_by)
    VALUES($1,$2,$3,$4,$5,$6)`,[taskId,locationId,action,previous?JSON.stringify(previous):null,current?JSON.stringify(current):null,userId]);
}

async function nextLocationIdentity(db,taskId){
  const result=await db.query(`SELECT COALESCE(MAX(COALESCE(sequence_no,0)),0)+1 sequence FROM task_locations WHERE task_id=$1`,[taskId]);
  const sequence=Number(result.rows[0].sequence); return {sequence,code:`LOC-${taskId}-${String(sequence).padStart(4,'0')}`};
}

function parseWorkbookRows(workbook) {
  const sheet=workbook.getWorksheet('DanhSach')||workbook.worksheets[0];
  if(!sheet) throw Object.assign(new Error('File Excel không có worksheet'),{status:400});
  let headerRow=0; const headers={};
  for(let rowNumber=1;rowNumber<=Math.min(sheet.rowCount,12);rowNumber+=1){
    sheet.getRow(rowNumber).eachCell((cell,column)=>{const text=clean(excelValue(cell));if(text)headers[normalize(text)]=column;});
    if(headers[normalize('Tên địa điểm')]||headers.location_name){headerRow=rowNumber;break;}
    Object.keys(headers).forEach(key=>delete headers[key]);
  }
  if(!headerRow) throw Object.assign(new Error('Không tìm thấy dòng tiêu đề Danh sách'),{status:400});
  const aliases={
    location_name:['Tên địa điểm','location_name'],location_address:['Địa chỉ','location_address'],province_name:['Tỉnh/Thành phố'],commune_name:['Phường/Xã'],
    planned_date:['Ngày dự kiến'],employee_name:['Nhân viên phụ trách'],status:['Trạng thái'],actual_completion_date:['Ngày hoàn thành'],
    contact_person:['Người liên hệ'],contact_phone:['Số điện thoại'],notes:['Ghi chú'],location_code:['Mã địa điểm'],
    province_code:['Mã Tỉnh/TP'],commune_code:['Mã Phường/Xã'],employee_code:['Mã nhân viên'],location_id:['Mã hệ thống'],row_version:['Phiên bản dòng'],
  };
  const columnFor=field=>aliases[field].map(alias=>headers[normalize(alias)]).find(Boolean);
  if(!columnFor('location_name')||!columnFor('location_address')) throw Object.assign(new Error('Thiếu cột Tên địa điểm hoặc Địa chỉ'),{status:400});
  const rows=[];
  for(let number=headerRow+1;number<=sheet.rowCount;number+=1){
    const row=sheet.getRow(number); const raw={};
    for(const field of Object.keys(aliases)){const column=columnFor(field);raw[field]=column?excelValue(row.getCell(column)):null;}
    if(Object.values(raw).some(value=>clean(value))) rows.push({number,raw});
  }
  return rows;
}

async function buildWorkbook(task,rows,lookups) {
  const workbook=new ExcelJS.Workbook(); workbook.creator='Simba PMS'; workbook.created=new Date();
  const sheet=workbook.addWorksheet('DanhSach',{views:[{state:'frozen',ySplit:4,showGridLines:false}]});
  const headers=['STT','Tên địa điểm','Địa chỉ','Tỉnh/Thành phố','Phường/Xã','Ngày dự kiến','Nhân viên phụ trách','Người liên hệ','Số điện thoại','Ghi chú','Trạng thái','Ngày hoàn thành','Mã địa điểm','Mã Tỉnh/TP','Mã Phường/Xã','Mã nhân viên','Mã hệ thống','Phiên bản dòng'];
  sheet.mergeCells('A1:R1'); sheet.getCell('A1').value=`DANH SÁCH ${EXECUTION_LABELS[task.execution_type].toUpperCase()} — ${task.project_code} / ${task.task_name}`;
  sheet.getCell('A1').font={bold:true,size:16,color:{argb:'FFFFFFFF'}}; sheet.getCell('A1').fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF0F4C81'}}; sheet.getCell('A1').alignment={horizontal:'center'}; sheet.getRow(1).height=28;
  sheet.mergeCells('A2:R2'); sheet.getCell('A2').value='Nhập Tên, Địa chỉ; chọn danh mục và Trạng thái. Không thay đổi các cột kỹ thuật đang ẩn.'; sheet.getCell('A2').font={italic:true,color:{argb:'FF475569'}};
  sheet.getRow(4).values=headers; sheet.getRow(4).font={bold:true,color:{argb:'FFFFFFFF'}}; sheet.getRow(4).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF1677FF'}}; sheet.getRow(4).alignment={vertical:'middle',horizontal:'center',wrapText:true}; sheet.getRow(4).height=32;
  sheet.getRow(4).eachCell(cell=>{cell.border={top:{style:'thin',color:{argb:'FFB8C5D1'}},left:{style:'thin',color:{argb:'FFB8C5D1'}},bottom:{style:'thin',color:{argb:'FFB8C5D1'}},right:{style:'thin',color:{argb:'FFB8C5D1'}}};});
  const widths=[7,28,38,22,24,16,24,20,16,30,22,18,16,14,18,16,14,14]; widths.forEach((width,index)=>sheet.getColumn(index+1).width=width);
  for(let column=13;column<=18;column+=1) sheet.getColumn(column).hidden=true;

  rows.forEach((item,index)=>{
    const row=sheet.getRow(5+index); row.values=[index+1,item.location_name,item.location_address,item.province_name,item.commune_name,fileDate(item.planned_date),item.employee_name,item.contact_person,item.contact_phone,item.notes,item.status,fileDate(item.actual_completion_date),item.location_code,item.province_code,item.commune_code,item.employee_code,item.id,item.row_version];
  });
  const visibleDataEnd=Math.max(5,4+rows.length);
  for(let rowNumber=5;rowNumber<=visibleDataEnd;rowNumber+=1){
    const row=sheet.getRow(rowNumber); const fillColor=rowNumber%2===0?'FFF3F6F9':'FFFFFFFF'; row.height=24;
    for(let column=1;column<=12;column+=1){
      const cell=row.getCell(column);
      cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:fillColor}};
      cell.border={top:{style:'thin',color:{argb:'FFD8E0E8'}},left:{style:'thin',color:{argb:'FFD8E0E8'}},bottom:{style:'thin',color:{argb:'FFD8E0E8'}},right:{style:'thin',color:{argb:'FFD8E0E8'}}};
      cell.alignment={vertical:'middle',wrapText:true};
    }
  }
  const lastDataRow=Math.max(204,4+rows.length);
  for(let rowNumber=5;rowNumber<=lastDataRow;rowNumber+=1){
    const row=sheet.getRow(rowNumber); row.getCell(6).numFmt='dd/mm/yyyy'; row.getCell(12).numFmt='dd/mm/yyyy';
    row.getCell(4).dataValidation={type:'list',allowBlank:true,formulae:[`'TinhThanh'!$B$2:$B$${Math.max(2,lookups.provinces.length+1)}`]};
    row.getCell(5).dataValidation={type:'list',allowBlank:true,formulae:[`'PhuongXa'!$C$2:$C$${Math.max(2,lookups.communes.length+1)}`]};
    row.getCell(7).dataValidation={type:'list',allowBlank:true,formulae:[`'NhanVien'!$B$2:$B$${Math.max(2,lookups.employees.length+1)}`]};
    row.getCell(11).dataValidation={type:'list',allowBlank:true,formulae:[`"${STATUSES.join(',')}"`]};
  }
  sheet.autoFilter={from:'A4',to:`L${lastDataRow}`};
  sheet.getRows(5,Math.max(rows.length,1)).forEach(row=>{row.alignment={vertical:'top',wrapText:true};});

  const provinceSheet=workbook.addWorksheet('TinhThanh',{views:[{state:'frozen',ySplit:1,showGridLines:false}]}); provinceSheet.columns=[{header:'Mã',key:'code',width:12},{header:'Tỉnh/Thành phố',key:'name',width:30}]; lookups.provinces.forEach(item=>provinceSheet.addRow({code:item.code,name:`${item.unit_type||''} ${item.name}`.trim()}));
  const communeSheet=workbook.addWorksheet('PhuongXa',{views:[{state:'frozen',ySplit:1,showGridLines:false}]}); communeSheet.columns=[{header:'Mã',key:'code',width:14},{header:'Mã Tỉnh/TP',key:'province_code',width:14},{header:'Phường/Xã',key:'name',width:34}]; lookups.communes.forEach(item=>communeSheet.addRow({code:item.code,province_code:item.province_code,name:`${item.unit_type||''} ${item.name}`.trim()}));
  const employeeSheet=workbook.addWorksheet('NhanVien',{views:[{state:'frozen',ySplit:1,showGridLines:false}]}); employeeSheet.columns=[{header:'Mã nhân viên',key:'code',width:18},{header:'Họ tên',key:'name',width:30},{header:'Vị trí',key:'position',width:24}]; lookups.employees.forEach(item=>employeeSheet.addRow({code:item.employee_code,name:item.full_name,position:item.position||item.department||''}));
  workbook.definedNames.add(`'TinhThanh'!$B$2:$B$${Math.max(2,provinceSheet.rowCount)}`,'DanhSachTinhThanh');
  workbook.definedNames.add(`'PhuongXa'!$C$2:$C$${Math.max(2,communeSheet.rowCount)}`,'DanhSachPhuongXa');
  workbook.definedNames.add(`'NhanVien'!$B$2:$B$${Math.max(2,employeeSheet.rowCount)}`,'DanhSachNhanVien');
  for(let rowNumber=5;rowNumber<=lastDataRow;rowNumber+=1){
    sheet.getCell(`D${rowNumber}`).dataValidation={type:'list',allowBlank:true,formulae:['DanhSachTinhThanh']};
    sheet.getCell(`E${rowNumber}`).dataValidation={type:'list',allowBlank:true,formulae:['DanhSachPhuongXa']};
    sheet.getCell(`G${rowNumber}`).dataValidation={type:'list',allowBlank:true,formulae:['DanhSachNhanVien']};
  }
  const guide=workbook.addWorksheet('HuongDan',{views:[{showGridLines:false}]}); guide.columns=[{width:4},{width:32},{width:90}]; guide.mergeCells('B2:C2'); guide.getCell('B2').value='HƯỚNG DẪN IMPORT SIMBA PMS'; guide.getCell('B2').font={bold:true,size:16,color:{argb:'FF0F4C81'}};
  [['B4','Bước 1','Nhập Tên địa điểm và Địa chỉ.'],['B5','Bước 2','Chọn Tỉnh/Thành phố, Phường/Xã, Nhân viên và Trạng thái từ danh sách.'],['B6','Bước 3','Upload file và xem trước lỗi. Chỉ file không có lỗi mới được áp dụng.'],['B7','Hoàn thành','Nếu Trạng thái là Hoàn thành mà chưa có ngày, hệ thống tự ghi ngày xác nhận import.']].forEach(([cell,label,note])=>{guide.getCell(cell).value=label;guide.getCell(cell).font={bold:true};guide.getCell(cell.replace('B','C')).value=note;guide.getCell(cell.replace('B','C')).alignment={wrapText:true};});
  for(const ref of [provinceSheet,communeSheet,employeeSheet]){ref.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};ref.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF1677FF'}};ref.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,ref.rowCount),column:ref.columnCount}};}
  return workbook;
}

router.get('/projects/:projectId',async(req,res,next)=>{try{
  const tasks=await pool.query(`SELECT t.id,t.task_code,t.task_name,t.task_type,t.execution_type,t.status,t.progress,t.start_date,t.end_date,
    COUNT(location.id)::int total_locations,COUNT(location.id) FILTER(WHERE location.is_completed=true)::int completed_locations,
    MIN(location.planned_date) first_planned_date,MAX(location.planned_date) last_planned_date
    FROM tasks t LEFT JOIN task_locations location ON location.task_id=t.id
    WHERE t.project_id=$1 AND t.deleted_at IS NULL AND t.execution_type IN ('DELIVERY','INSTALLATION')
    GROUP BY t.id ORDER BY t.created_at`,[req.params.projectId]);
  res.json({success:true,data:tasks.rows.map(task=>({...task,execution_label:EXECUTION_LABELS[task.execution_type],ready_for_task_completion:Number(task.total_locations)>0&&Number(task.total_locations)===Number(task.completed_locations)}))});
}catch(error){next(error);}});

router.get('/tasks/:taskId',async(req,res,next)=>{try{res.json({success:true,data:await taskDetail(pool,req.params.taskId)});}catch(error){if(error.status)return res.status(error.status).json({success:false,message:error.message});next(error);}});

router.post('/tasks/:taskId/locations',async(req,res,next)=>{const client=await pool.connect();try{
  await client.query('BEGIN'); const task=await getExecutionTask(client,req.params.taskId); const lookups=await loadLookups(client);
  const existing=await client.query('SELECT * FROM task_locations WHERE task_id=$1',[task.id]);
  const prepared=prepareRow(req.body,1,task,lookups,new Map(existing.rows.map(item=>[Number(item.id),item])),new Map(existing.rows.map(item=>[item.location_code,item])));
  if(!prepared.valid) throw Object.assign(new Error(prepared.errors.join('; ')),{status:400});
  const identity=await nextLocationIdentity(client,task.id); const data=prepared.data;
  const inserted=await client.query(`INSERT INTO task_locations(task_id,execution_type,location_code,sequence_no,location_name,location_address,
    province_code,commune_code,location_city,location_ward,planned_date,installation_date,assigned_employee_id,status,is_completed,
    actual_completion_date,completed_at,completed_by,completion_source,contact_person,contact_phone,notes,display_order)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$4) RETURNING *`,[
    task.id,task.execution_type,identity.code,identity.sequence,data.location_name,data.location_address,data.province_code,data.commune_code,
    data.province_name,data.commune_name,data.planned_date,data.assigned_employee_id,data.status,data.status==='Hoàn thành',
    data.status==='Hoàn thành'?(data.actual_completion_date||isoDate(new Date())):null,data.status==='Hoàn thành'?new Date():null,
    data.status==='Hoàn thành'?(req.user?.id||1):null,'APP',data.contact_person,data.contact_phone,data.notes]);
  await audit(client,task.id,inserted.rows[0].id,'CREATE',null,inserted.rows[0],req.user?.id||1); await client.query('COMMIT');
  res.status(201).json({success:true,message:'Đã thêm địa điểm',data:inserted.rows[0]});
}catch(error){await client.query('ROLLBACK');if(error.status)return res.status(error.status).json({success:false,message:error.message});next(error);}finally{client.release();}});

router.put('/tasks/:taskId/locations/:locationId',async(req,res,next)=>{const client=await pool.connect();try{
  await client.query('BEGIN'); const task=await getExecutionTask(client,req.params.taskId); const current=await client.query('SELECT * FROM task_locations WHERE id=$1 AND task_id=$2 FOR UPDATE',[req.params.locationId,task.id]);
  if(!current.rowCount) throw Object.assign(new Error('Không tìm thấy địa điểm'),{status:404});
  const lookups=await loadLookups(client); const merged={...current.rows[0],...req.body};
  const prepared=prepareRow(merged,1,task,lookups,new Map([[Number(current.rows[0].id),current.rows[0]]]),new Map([[current.rows[0].location_code,current.rows[0]]]));
  if(!prepared.valid) throw Object.assign(new Error(prepared.errors.join('; ')),{status:400}); const data=prepared.data;
  const completed=data.status==='Hoàn thành';
  const updated=await client.query(`UPDATE task_locations SET location_name=$1,location_address=$2,province_code=$3,commune_code=$4,
    location_city=$5,location_ward=$6,planned_date=$7,installation_date=$7,assigned_employee_id=$8,status=$9,is_completed=$10,
    progress=$11,actual_completion_date=$12,completed_at=CASE WHEN $10 THEN COALESCE(completed_at,NOW()) ELSE NULL END,
    completed_by=CASE WHEN $10 THEN $13::integer ELSE NULL END,completion_source='APP',contact_person=$14,contact_phone=$15,notes=$16
    WHERE id=$17 AND task_id=$18 RETURNING *`,[data.location_name,data.location_address,data.province_code,data.commune_code,data.province_name,data.commune_name,
    data.planned_date,data.assigned_employee_id,data.status,completed,completed?100:0,completed?(data.actual_completion_date||isoDate(new Date())):null,
    req.user?.id||1,data.contact_person,data.contact_phone,data.notes,current.rows[0].id,task.id]);
  await audit(client,task.id,updated.rows[0].id,'UPDATE',current.rows[0],updated.rows[0],req.user?.id||1); await client.query('COMMIT');
  res.json({success:true,message:'Đã cập nhật địa điểm',data:updated.rows[0]});
}catch(error){await client.query('ROLLBACK');if(error.status)return res.status(error.status).json({success:false,message:error.message});next(error);}finally{client.release();}});

router.patch('/tasks/:taskId/locations/:locationId/status',async(req,res,next)=>{const client=await pool.connect();try{
  const status=clean(req.body.status); if(!STATUSES.includes(status))return res.status(400).json({success:false,message:'Trạng thái không hợp lệ'});
  await client.query('BEGIN'); await getExecutionTask(client,req.params.taskId); const current=await client.query('SELECT * FROM task_locations WHERE id=$1 AND task_id=$2 FOR UPDATE',[req.params.locationId,req.params.taskId]);
  if(!current.rowCount)throw Object.assign(new Error('Không tìm thấy địa điểm'),{status:404}); const completed=status==='Hoàn thành';
  const updated=await client.query(`UPDATE task_locations SET status=$1,is_completed=$2,progress=CASE WHEN $2 THEN 100 WHEN progress=100 THEN 0 ELSE progress END,
    actual_completion_date=CASE WHEN $2 THEN COALESCE($3::date,CURRENT_DATE) ELSE NULL END,completed_at=CASE WHEN $2 THEN COALESCE(completed_at,NOW()) ELSE NULL END,
    completed_by=CASE WHEN $2 THEN $4::integer ELSE NULL END,completion_source='APP',completion_note=$5 WHERE id=$6 RETURNING *`,
    [status,completed,isoDate(req.body.actual_completion_date),req.user?.id||1,clean(req.body.completion_note),current.rows[0].id]);
  await audit(client,req.params.taskId,updated.rows[0].id,'STATUS',current.rows[0],updated.rows[0],req.user?.id||1); await client.query('COMMIT');
  const detail=await taskDetail(pool,req.params.taskId); res.json({success:true,message:completed?'Đã ghi nhận hoàn thành địa điểm':'Đã cập nhật trạng thái',data:updated.rows[0],summary:detail.summary});
}catch(error){await client.query('ROLLBACK');if(error.status)return res.status(error.status).json({success:false,message:error.message});next(error);}finally{client.release();}});

router.delete('/tasks/:taskId/locations/:locationId',async(req,res,next)=>{const client=await pool.connect();try{
  await client.query('BEGIN'); const current=await client.query('SELECT * FROM task_locations WHERE id=$1 AND task_id=$2 FOR UPDATE',[req.params.locationId,req.params.taskId]);
  if(!current.rowCount)throw Object.assign(new Error('Không tìm thấy địa điểm'),{status:404}); if(current.rows[0].is_completed)throw Object.assign(new Error('Địa điểm đã hoàn thành không thể xóa; hãy chuyển trạng thái trước'),{status:409});
  await audit(client,req.params.taskId,current.rows[0].id,'DELETE',current.rows[0],null,req.user?.id||1); await client.query('DELETE FROM task_locations WHERE id=$1',[current.rows[0].id]); await client.query('COMMIT');
  res.json({success:true,message:'Đã xóa địa điểm'});
}catch(error){await client.query('ROLLBACK');if(error.status)return res.status(error.status).json({success:false,message:error.message});next(error);}finally{client.release();}});

router.get('/tasks/:taskId/template.xlsx',async(req,res,next)=>{try{const task=await getExecutionTask(pool,req.params.taskId);const lookups=await loadLookups(pool);const workbook=await buildWorkbook(task,[],lookups);res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.setHeader('Content-Disposition',`attachment; filename="${task.task_code}-${task.execution_type.toLowerCase()}-template.xlsx"`);await workbook.xlsx.write(res);res.end();}catch(error){if(error.status)return res.status(error.status).json({success:false,message:error.message});next(error);}});

router.get('/tasks/:taskId/export.xlsx',async(req,res,next)=>{try{const detail=await taskDetail(pool,req.params.taskId);const lookups=await loadLookups(pool);const workbook=await buildWorkbook(detail.task,detail.locations,lookups);res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.setHeader('Content-Disposition',`attachment; filename="${detail.task.task_code}-${detail.task.execution_type.toLowerCase()}-locations.xlsx"`);await workbook.xlsx.write(res);res.end();}catch(error){if(error.status)return res.status(error.status).json({success:false,message:error.message});next(error);}});

router.post('/tasks/:taskId/import-preview',upload.single('file'),async(req,res,next)=>{const client=await pool.connect();try{
  if(!req.file)return res.status(400).json({success:false,message:'Vui lòng chọn file Excel .xlsx'}); const task=await getExecutionTask(client,req.params.taskId);
  const workbook=new ExcelJS.Workbook(); await workbook.xlsx.load(req.file.buffer); const rawRows=parseWorkbookRows(workbook); if(!rawRows.length)throw Object.assign(new Error('File Excel không có dữ liệu'),{status:400});
  const [lookups,existing]=await Promise.all([loadLookups(client),client.query('SELECT * FROM task_locations WHERE task_id=$1',[task.id])]);
  const byId=new Map(existing.rows.map(item=>[Number(item.id),item])); const byCode=new Map(existing.rows.filter(item=>item.location_code).map(item=>[item.location_code,item]));
  const preview=rawRows.map(({number,raw})=>prepareRow(raw,number,task,lookups,byId,byCode));
  const duplicateKeys=new Map(); for(const row of preview){const key=row.data.location_code||`${normalize(row.data.location_name)}|${normalize(row.data.location_address)}`;if(duplicateKeys.has(key)){row.valid=false;row.errors.push(`Trùng với dòng ${duplicateKeys.get(key)}`);}else duplicateKeys.set(key,row.row_number);}
  const errors=preview.filter(row=>!row.valid).map(row=>({row_number:row.row_number,errors:row.errors})); const validRows=preview.filter(row=>row.valid).length;
  const batch=await client.query(`INSERT INTO task_location_import_batches(task_id,original_filename,total_rows,valid_rows,error_rows,preview_rows,errors,created_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,status,created_at`,[task.id,req.file.originalname,preview.length,validRows,errors.length,JSON.stringify(preview),JSON.stringify(errors),req.user?.id||1]);
  res.json({success:true,message:errors.length?'File có lỗi, vui lòng kiểm tra trước khi áp dụng':'File hợp lệ, sẵn sàng áp dụng',data:{...batch.rows[0],total_rows:preview.length,valid_rows:validRows,error_rows:errors.length,rows:preview}});
}catch(error){if(error.status)return res.status(error.status).json({success:false,message:error.message});next(error);}finally{client.release();}});

router.post('/imports/:batchId/apply',async(req,res,next)=>{const client=await pool.connect();try{
  await client.query('BEGIN'); const batchResult=await client.query('SELECT * FROM task_location_import_batches WHERE id=$1 FOR UPDATE',[req.params.batchId]);
  if(!batchResult.rowCount)throw Object.assign(new Error('Không tìm thấy phiên import'),{status:404}); const batch=batchResult.rows[0];
  if(batch.status!=='PREVIEW')throw Object.assign(new Error('Phiên import đã được xử lý'),{status:409}); if(batch.error_rows>0)throw Object.assign(new Error('File còn dòng lỗi, không thể áp dụng'),{status:409});
  const task=await getExecutionTask(client,batch.task_id); let applied=0;
  for(const row of batch.preview_rows){const data=row.data;const completed=data.status==='Hoàn thành';
    if(row.action==='UPDATE'){
      const current=await client.query('SELECT * FROM task_locations WHERE id=$1 AND task_id=$2 FOR UPDATE',[data.id,task.id]);
      if(!current.rowCount||Number(current.rows[0].row_version)!==Number(data.row_version))throw Object.assign(new Error(`Dòng ${row.row_number} đã thay đổi, hãy export file mới`),{status:409});
      const updated=await client.query(`UPDATE task_locations SET location_name=$1,location_address=$2,province_code=$3,commune_code=$4,location_city=$5,location_ward=$6,
        planned_date=$7,installation_date=$7,assigned_employee_id=$8,status=$9,is_completed=$10,progress=CASE WHEN $10 THEN 100 ELSE 0 END,
        actual_completion_date=CASE WHEN $10 THEN COALESCE($11::date,CURRENT_DATE) ELSE NULL END,completed_at=CASE WHEN $10 THEN COALESCE(completed_at,NOW()) ELSE NULL END,
        completed_by=CASE WHEN $10 THEN $12::integer ELSE NULL END,completion_source='EXCEL',contact_person=$13,contact_phone=$14,notes=$15,import_batch_id=$16
        WHERE id=$17 RETURNING *`,[data.location_name,data.location_address,data.province_code,data.commune_code,data.province_name,data.commune_name,data.planned_date,
        data.assigned_employee_id,data.status,completed,data.actual_completion_date,req.user?.id||1,data.contact_person,data.contact_phone,data.notes,batch.id,data.id]);
      await audit(client,task.id,data.id,'IMPORT_UPDATE',current.rows[0],updated.rows[0],req.user?.id||1);
    }else{
      const identity=await nextLocationIdentity(client,task.id); const inserted=await client.query(`INSERT INTO task_locations(task_id,execution_type,location_code,sequence_no,
        location_name,location_address,province_code,commune_code,location_city,location_ward,planned_date,installation_date,assigned_employee_id,status,is_completed,progress,
        actual_completion_date,completed_at,completed_by,completion_source,contact_person,contact_phone,notes,display_order,import_batch_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,$12,$13,$14,$15,$16,$17,$18,'EXCEL',$19,$20,$21,$4,$22) RETURNING *`,[
        task.id,task.execution_type,identity.code,identity.sequence,data.location_name,data.location_address,data.province_code,data.commune_code,data.province_name,data.commune_name,
        data.planned_date,data.assigned_employee_id,data.status,completed,completed?100:0,completed?(data.actual_completion_date||isoDate(new Date())):null,completed?new Date():null,
        completed?(req.user?.id||1):null,data.contact_person,data.contact_phone,data.notes,batch.id]);
      await audit(client,task.id,inserted.rows[0].id,'IMPORT_CREATE',null,inserted.rows[0],req.user?.id||1);
    } applied+=1;
  }
  await client.query(`UPDATE task_location_import_batches SET status='APPLIED',applied_rows=$1,applied_at=NOW() WHERE id=$2`,[applied,batch.id]); await client.query('COMMIT');
  res.json({success:true,message:`Đã áp dụng ${applied} dòng từ Excel`,data:await taskDetail(pool,task.id)});
}catch(error){await client.query('ROLLBACK');if(error.status)return res.status(error.status).json({success:false,message:error.message});next(error);}finally{client.release();}});

module.exports=router;
