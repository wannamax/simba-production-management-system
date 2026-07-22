const express=require('express');
const router=express.Router();
const pool=require('../config/database');

function fail(message,status=400){return Object.assign(new Error(message),{status});}
function iso(value){
  if(!value)return null;
  if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}/.test(value))return value.slice(0,10);
  const date=value instanceof Date?value:new Date(value);
  if(Number.isNaN(date.getTime()))throw fail('Giá trị ngày không hợp lệ');
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function datesBetween(start,end){
  if(!start||!end)return [];
  if(start>end)throw fail('Ngày bắt đầu không được sau ngày kết thúc');
  const rows=[];const cursor=new Date(`${start}T00:00:00Z`);const last=new Date(`${end}T00:00:00Z`);
  while(cursor<=last){rows.push(cursor.toISOString().slice(0,10));cursor.setUTCDate(cursor.getUTCDate()+1);}
  return rows;
}
function normalizeStages(stages){
  if(!Array.isArray(stages)||!stages.length)throw fail('Quy trình cần ít nhất một công đoạn');
  return stages.map((stage,index)=>({
    sequence_no:index+1,
    code:String(stage.code||`STAGE_${index+1}`).trim().toUpperCase().replace(/[^A-Z0-9_-]+/g,'_'),
    name:String(stage.name||'').trim(),
    work_item_id:stage.work_item_id||null,
    is_required:stage.is_required!==false,
    tracks_quantity:stage.tracks_quantity!==false,
    allow_parallel:stage.allow_parallel===true,
  })).map((stage,index)=>{if(!stage.name)throw fail(`Công đoạn ${index+1}: chưa có tên`);return stage;});
}
async function replaceProcessStages(db,processId,stages){
  await db.query('DELETE FROM production_process_stages WHERE process_id=$1',[processId]);
  for(const stage of stages)await db.query(
    `INSERT INTO production_process_stages(process_id,sequence_no,code,name,work_item_id,is_required,tracks_quantity,allow_parallel,default_hours)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,NULL)`,
    [processId,stage.sequence_no,stage.code,stage.name,stage.work_item_id,stage.is_required,stage.tracks_quantity,stage.allow_parallel]
  );
}
async function getProcess(db,id){
  const process=await db.query('SELECT * FROM production_processes WHERE id=$1',[id]);
  if(!process.rowCount)throw fail('Không tìm thấy quy trình sản xuất',404);
  const stages=await db.query(`SELECT s.*,wi.name work_item_name,wg.name work_group_name FROM production_process_stages s
    LEFT JOIN work_items wi ON wi.id=s.work_item_id LEFT JOIN work_groups wg ON wg.id=wi.group_id
    WHERE s.process_id=$1 ORDER BY s.sequence_no`,[id]);
  return {...process.rows[0],stages:stages.rows};
}
async function generateProductionCode(db){
  const year=new Date().getFullYear(),prefix=`MO-${year}`;
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`production_orders.production_code.${prefix}`]);
  const result=await db.query(`SELECT COALESCE(MAX(CASE WHEN substring(production_code FROM char_length($1)+1) ~ '^[0-9]+$'
    THEN substring(production_code FROM char_length($1)+1)::int END),0)+1 next_number FROM production_orders WHERE production_code LIKE $2`,[prefix,`${prefix}%`]);
  return `${prefix}${String(result.rows[0].next_number).padStart(4,'0')}`;
}
async function ensureEmployees(db,ids){
  const unique=[...new Set(ids.map(Number).filter(Number.isInteger))];
  if(!unique.length)return;
  const result=await db.query(`SELECT id FROM employees WHERE id=ANY($1::int[]) AND status='Hoạt động'`,[unique]);
  if(result.rowCount!==unique.length)throw fail('Danh sách phân công có nhân viên không tồn tại hoặc đã ngừng hoạt động');
}
async function ensureRole(db,role){
  const result=await db.query(`SELECT 1 FROM system_catalogs WHERE catalog_type='PROJECT_ROLE' AND name=$1 AND is_active=true`,[role]);
  if(!result.rowCount)throw fail(`Vai trò “${role}” không hợp lệ hoặc đã ngừng sử dụng`);
}
async function syncProjectMember(db,projectId,employeeId,role){
  const existing=await db.query(`SELECT id FROM project_assignments WHERE project_id=$1 AND employee_id=$2 ORDER BY id LIMIT 1`,[projectId,employeeId]);
  if(!existing.rowCount)await db.query(`INSERT INTO project_assignments(project_id,employee_id,role,notes) VALUES($1,$2,$3,$4)`,
    [projectId,employeeId,role,'Tự động thêm từ Lệnh sản xuất']);
}
async function getProductionOrder(db,id){
  const order=await db.query(`SELECT po.*,o.order_code,p.project_code,p.project_name,p.project_type,c.company_name
    FROM production_orders po JOIN project_orders o ON o.id=po.order_id JOIN projects p ON p.id=po.project_id
    LEFT JOIN customers c ON c.id=p.customer_id WHERE po.id=$1`,[id]);
  if(!order.rowCount)throw fail('Không tìm thấy lệnh sản xuất',404);
  const [items,stages,globals]=await Promise.all([
    db.query(`SELECT poi.*,oi.item_code,oi.item_name,oi.unit,oi.quantity order_quantity
      FROM production_order_items poi JOIN project_order_items oi ON oi.id=poi.order_item_id
      WHERE poi.production_order_id=$1 ORDER BY poi.id`,[id]),
    db.query(`SELECT si.*,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',psi.id,'production_order_item_id',psi.production_order_item_id,
        'item_name',oi.item_name,'unit',oi.unit,'planned_quantity',psi.planned_quantity,'good_quantity',psi.good_quantity,
        'defect_quantity',psi.defect_quantity,'rework_quantity',psi.rework_quantity) ORDER BY poi.id)
        FROM production_stage_items psi JOIN production_order_items poi ON poi.id=psi.production_order_item_id
        JOIN project_order_items oi ON oi.id=poi.order_item_id WHERE psi.stage_instance_id=si.id),'[]'::jsonb) items,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',work.id,'task_code',work.task_code,'task_name',work.task_name,
        'status',work.status,'progress',work.progress) ORDER BY work.created_at)
        FROM tasks work WHERE work.production_stage_instance_id=si.id AND work.deleted_at IS NULL),'[]'::jsonb) works
      FROM production_stage_instances si WHERE si.production_order_id=$1 ORDER BY si.sequence_no`,[id]),
    db.query(`SELECT a.*,e.full_name,e.employee_code FROM production_global_assignments a JOIN employees e ON e.id=a.employee_id
      WHERE a.production_order_id=$1 ORDER BY e.full_name`,[id]),
  ]);
  return {...order.rows[0],items:items.rows,stages:stages.rows,global_assignments:globals.rows};
}

router.get('/meta',async(req,res,next)=>{try{
  const [projectTypes,workItems]=await Promise.all([
    pool.query(`SELECT name FROM system_catalogs WHERE catalog_type='PROJECT_TYPE' AND is_active=true ORDER BY sort_order,name`),
    pool.query(`SELECT wi.id,wi.code,wi.name,wg.name group_name FROM work_items wi JOIN work_groups wg ON wg.id=wi.group_id WHERE wi.is_active=true AND wg.is_active=true ORDER BY wg.sort_order,wi.sort_order,wi.name`),
  ]);
  res.json({success:true,data:{project_types:projectTypes.rows.map(r=>r.name),work_items:workItems.rows}});
}catch(error){next(error);}});

router.get('/processes',async(req,res,next)=>{try{
  const result=await pool.query(`SELECT p.*,COUNT(s.id)::int stage_count FROM production_processes p
    LEFT JOIN production_process_stages s ON s.process_id=p.id
    ${req.query.include_inactive==='true'?'':'WHERE p.is_active=true'} GROUP BY p.id ORDER BY p.name`);
  res.json({success:true,data:result.rows});
}catch(error){next(error);}});
router.get('/processes/:id',async(req,res,next)=>{try{res.json({success:true,data:await getProcess(pool,req.params.id)});}catch(error){if(error.status)return res.status(error.status).json({success:false,message:error.message});next(error);}});
router.post('/processes',async(req,res,next)=>{const db=await pool.connect();try{
  await db.query('BEGIN');const stages=normalizeStages(req.body.stages);const code=String(req.body.code||req.body.name||'').trim().toUpperCase().replace(/[^A-Z0-9_-]+/g,'_');
  if(!code||!String(req.body.name||'').trim())throw fail('Cần nhập mã và tên quy trình');
  const result=await db.query(`INSERT INTO production_processes(code,name,description,project_types,is_active) VALUES($1,$2,$3,$4,$5) RETURNING *`,
    [code,String(req.body.name).trim(),req.body.description||null,req.body.project_types||[],req.body.is_active!==false]);
  await replaceProcessStages(db,result.rows[0].id,stages);await db.query('COMMIT');
  res.status(201).json({success:true,message:'Đã tạo quy trình sản xuất',data:await getProcess(pool,result.rows[0].id)});
}catch(error){await db.query('ROLLBACK');if(error.status)return res.status(error.status).json({success:false,message:error.message});next(error);}finally{db.release();}});
router.put('/processes/:id',async(req,res,next)=>{const db=await pool.connect();try{
  await db.query('BEGIN');const stages=normalizeStages(req.body.stages);const result=await db.query(`UPDATE production_processes
    SET name=$1,description=$2,project_types=$3,is_active=$4,version=version+1 WHERE id=$5 RETURNING *`,
    [String(req.body.name||'').trim(),req.body.description||null,req.body.project_types||[],req.body.is_active!==false,req.params.id]);
  if(!result.rowCount)throw fail('Không tìm thấy quy trình sản xuất',404);await replaceProcessStages(db,req.params.id,stages);await db.query('COMMIT');
  res.json({success:true,message:'Đã cập nhật quy trình; các lệnh cũ vẫn giữ snapshot phiên bản trước',data:await getProcess(pool,req.params.id)});
}catch(error){await db.query('ROLLBACK');if(error.status)return res.status(error.status).json({success:false,message:error.message});next(error);}finally{db.release();}});
router.delete('/processes/:id',async(req,res,next)=>{try{
  const used=await pool.query('SELECT 1 FROM production_orders WHERE process_id=$1 LIMIT 1',[req.params.id]);
  if(used.rowCount){await pool.query('UPDATE production_processes SET is_active=false WHERE id=$1',[req.params.id]);return res.json({success:true,message:'Quy trình đã được sử dụng nên được chuyển sang Không hoạt động'});}
  const result=await pool.query('DELETE FROM production_processes WHERE id=$1 RETURNING id',[req.params.id]);
  if(!result.rowCount)return res.status(404).json({success:false,message:'Không tìm thấy quy trình'});res.json({success:true,message:'Đã xóa quy trình'});
}catch(error){next(error);}});

router.get('/context/:orderId',async(req,res,next)=>{try{
  const order=await pool.query(`SELECT o.*,p.project_code,p.project_name,p.project_type,
    p.start_date project_start_date,p.end_date project_end_date,c.company_name
    FROM project_orders o JOIN projects p ON p.id=o.project_id LEFT JOIN customers c ON c.id=p.customer_id WHERE o.id=$1 AND p.deleted_at IS NULL`,[req.params.orderId]);
  if(!order.rowCount)return res.status(404).json({success:false,message:'Không tìm thấy đơn hàng'});
  const [items,processes,employees,roles]=await Promise.all([
    pool.query(`SELECT i.*,i.quantity-COALESCE(SUM(pi.planned_quantity) FILTER(WHERE po.status<>'CANCELLED'),0) remaining_quantity
      FROM project_order_items i LEFT JOIN production_order_items pi ON pi.order_item_id=i.id
      LEFT JOIN production_orders po ON po.id=pi.production_order_id WHERE i.order_id=$1 GROUP BY i.id ORDER BY i.id`,[req.params.orderId]),
    pool.query(`SELECT p.*,COUNT(s.id)::int stage_count FROM production_processes p LEFT JOIN production_process_stages s ON s.process_id=p.id
      WHERE p.is_active=true AND (cardinality(p.project_types)=0 OR $1=ANY(p.project_types)) GROUP BY p.id ORDER BY p.name`,[order.rows[0].project_type]),
    pool.query(`SELECT e.id,e.employee_code,e.full_name,e.position,e.department,pa.role project_role,(pa.id IS NOT NULL) is_project_member
      FROM employees e LEFT JOIN LATERAL(SELECT * FROM project_assignments x WHERE x.project_id=$1 AND x.employee_id=e.id ORDER BY x.id LIMIT 1) pa ON true
      WHERE e.status='Hoạt động' ORDER BY (pa.id IS NOT NULL) DESC,e.full_name`,[order.rows[0].project_id]),
    pool.query(`SELECT name,is_default FROM system_catalogs WHERE catalog_type='PROJECT_ROLE' AND is_active=true ORDER BY is_default DESC,sort_order,name`),
  ]);
  res.json({success:true,data:{order:{...order.rows[0],items:items.rows},processes:processes.rows,employees:employees.rows,roles:roles.rows}});
}catch(error){next(error);}});

router.post('/orders',async(req,res,next)=>{const db=await pool.connect();try{
  await db.query('BEGIN');
  const order=await db.query(`SELECT o.*,p.project_type FROM project_orders o JOIN projects p ON p.id=o.project_id
    WHERE o.id=$1 AND o.status IN ('NOT_STARTED','IN_PRODUCTION') FOR UPDATE OF o`,[req.body.order_id]);
  if(!order.rowCount)throw fail('Đơn hàng không ở trạng thái có thể lập Lệnh sản xuất',409);
  const process=await db.query('SELECT * FROM production_processes WHERE id=$1 AND is_active=true',[req.body.process_id]);
  if(!process.rowCount)throw fail('Quy trình sản xuất không tồn tại hoặc đã ngừng sử dụng');
  if(process.rows[0].project_types.length&&!process.rows[0].project_types.includes(order.rows[0].project_type))throw fail('Quy trình không phù hợp với Loại dự án');
  const templateStages=(await db.query(`SELECT s.*,wi.name work_item_name,wg.name work_group_name FROM production_process_stages s
    LEFT JOIN work_items wi ON wi.id=s.work_item_id LEFT JOIN work_groups wg ON wg.id=wi.group_id WHERE s.process_id=$1 ORDER BY s.sequence_no`,[req.body.process_id])).rows;
  if(!templateStages.length)throw fail('Quy trình chưa có công đoạn');
  const selected=Array.isArray(req.body.items)?req.body.items:[];
  if(!selected.length)throw fail('Cần chọn ít nhất một hạng mục và số lượng sản xuất');
  const itemIds=selected.map(x=>Number(x.order_item_id));
  if(new Set(itemIds).size!==itemIds.length)throw fail('Hạng mục sản xuất bị trùng');
  const orderItems=await db.query(`SELECT * FROM project_order_items WHERE order_id=$1 AND id=ANY($2::bigint[]) FOR UPDATE`,[req.body.order_id,itemIds]);
  if(orderItems.rowCount!==itemIds.length)throw fail('Có hạng mục không thuộc đơn hàng đã chọn');
  for(const selectedItem of selected){
    const quantity=Number(selectedItem.planned_quantity);if(!(quantity>0))throw fail('Số lượng đưa vào sản xuất phải lớn hơn 0');
    const allocated=await db.query(`SELECT COALESCE(SUM(pi.planned_quantity),0) quantity FROM production_order_items pi
      JOIN production_orders po ON po.id=pi.production_order_id WHERE pi.order_item_id=$1 AND po.status<>'CANCELLED'`,[selectedItem.order_item_id]);
    const source=orderItems.rows.find(x=>Number(x.id)===Number(selectedItem.order_item_id));
    if(Number(allocated.rows[0].quantity)+quantity>Number(source.quantity))throw fail(`Hạng mục “${source.item_name}” chỉ còn ${Number(source.quantity)-Number(allocated.rows[0].quantity)} ${source.unit}`,409);
  }
  const stagePlans=Array.isArray(req.body.stages)?req.body.stages:[];
  const globalAssignments=Array.isArray(req.body.global_assignments)?req.body.global_assignments:[];
  const globalKeys=globalAssignments.map(x=>`${Number(x.employee_id)}::${x.role||x.role_in_task||''}`);
  if(new Set(globalKeys).size!==globalKeys.length)throw fail('Nhân sự toàn quy trình bị phân công trùng vai trò');
  await ensureEmployees(db,globalAssignments.map(x=>x.employee_id));
  const snapshot={id:process.rows[0].id,code:process.rows[0].code,name:process.rows[0].name,version:process.rows[0].version,stages:templateStages};
  const code=await generateProductionCode(db);
  const production=await db.query(`INSERT INTO production_orders(production_code,project_id,order_id,process_id,process_name,process_version,process_snapshot,planned_start_date,planned_end_date,notes,created_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[code,order.rows[0].project_id,req.body.order_id,process.rows[0].id,process.rows[0].name,process.rows[0].version,JSON.stringify(snapshot),req.body.planned_start_date||null,req.body.planned_end_date||null,req.body.notes||null,req.user?.id||1]);
  const productionItems=[];
  for(const item of selected){const inserted=await db.query(`INSERT INTO production_order_items(production_order_id,order_item_id,planned_quantity) VALUES($1,$2,$3) RETURNING *`,[production.rows[0].id,item.order_item_id,item.planned_quantity]);productionItems.push(inserted.rows[0]);}
  for(const assignment of globalAssignments){
    const role=assignment.role||assignment.role_in_task;await ensureRole(db,role);await syncProjectMember(db,order.rows[0].project_id,assignment.employee_id,role);
    await db.query(`INSERT INTO production_global_assignments(production_order_id,employee_id,role,start_date,end_date,notes) VALUES($1,$2,$3,$4,$5,$6)`,[production.rows[0].id,assignment.employee_id,role,assignment.start_date||req.body.planned_start_date||null,assignment.end_date||req.body.planned_end_date||null,assignment.notes||null]);
  }
  for(const stage of templateStages){
    const plan=stagePlans.find(x=>Number(x.source_stage_id)===Number(stage.id))||{};
    const start=iso(plan.start_date||req.body.planned_start_date),end=iso(plan.end_date||req.body.planned_end_date);
    const instance=await db.query(`INSERT INTO production_stage_instances(production_order_id,source_stage_id,sequence_no,stage_code,stage_name,work_item_id,task_id,is_required,tracks_quantity,allow_parallel,planned_start_date,planned_end_date)
      VALUES($1,$2,$3,$4,$5,$6,NULL,$7,$8,$9,$10,$11) RETURNING *`,[production.rows[0].id,stage.id,stage.sequence_no,stage.code,stage.name,stage.work_item_id,stage.is_required,stage.tracks_quantity,stage.allow_parallel,start,end]);
    const stageSelections=Array.isArray(plan.items)&&plan.items.length
      ? plan.items
      : productionItems.map(item=>({order_item_id:item.order_item_id,planned_quantity:item.planned_quantity}));
    if(stage.is_required&&stage.tracks_quantity&&!stageSelections.length)throw fail(`Công đoạn “${stage.name}” cần ít nhất một hạng mục và số lượng`);
    const stageItemIds=stageSelections.map(item=>Number(item.order_item_id));
    if(new Set(stageItemIds).size!==stageItemIds.length)throw fail(`Công đoạn “${stage.name}” có hạng mục bị trùng`);
    for(const selection of stageSelections){
      const productionItem=productionItems.find(item=>Number(item.order_item_id)===Number(selection.order_item_id));
      const stageQuantity=Number(selection.planned_quantity);
      if(!productionItem)throw fail(`Công đoạn “${stage.name}” có hạng mục không thuộc Lệnh sản xuất`);
      if(!(stageQuantity>0)||stageQuantity>Number(productionItem.planned_quantity))throw fail(`Công đoạn “${stage.name}”: số lượng phải lớn hơn 0 và không vượt số lượng của Lệnh sản xuất`);
      await db.query(`INSERT INTO production_stage_items(stage_instance_id,production_order_item_id,planned_quantity) VALUES($1,$2,$3)`,[instance.rows[0].id,productionItem.id,stageQuantity]);
    }
  }
  await db.query(`UPDATE project_orders SET status='IN_PRODUCTION' WHERE id=$1`,[req.body.order_id]);
  await db.query('COMMIT');res.status(201).json({success:true,message:`Đã tạo ${code} với ${templateStages.length} Công đoạn; hãy gán Công việc trong trang Nhiệm vụ`,data:await getProductionOrder(pool,production.rows[0].id)});
}catch(error){await db.query('ROLLBACK');if(error.status)return res.status(error.status).json({success:false,message:error.message});next(error);}finally{db.release();}});

router.get('/orders',async(req,res,next)=>{try{
  const params=[];let where='WHERE project.deleted_at IS NULL';
  if(req.query.project_id){params.push(req.query.project_id);where+=` AND production.project_id=$${params.length}`;}
  if(req.query.order_id){params.push(req.query.order_id);where+=` AND production.order_id=$${params.length}`;}
  if(req.query.status){params.push(req.query.status);where+=` AND production.status=$${params.length}`;}
  if(req.query.from_date){params.push(req.query.from_date);where+=` AND COALESCE(production.planned_end_date,production.planned_start_date,production.created_at::date)>=$${params.length}::date`;}
  if(req.query.to_date){params.push(req.query.to_date);where+=` AND COALESCE(production.planned_start_date,production.planned_end_date,production.created_at::date)<=$${params.length}::date`;}
  if(req.query.search){params.push(`%${String(req.query.search).trim()}%`);where+=` AND (production.production_code ILIKE $${params.length} OR production.group_name ILIKE $${params.length} OR orders.order_code ILIKE $${params.length} OR project.project_code ILIKE $${params.length} OR project.project_name ILIKE $${params.length})`;}
  const sortColumns={
    project:'project.project_name',start_date:'production.planned_start_date',status:'production.status',
    created_at:'production.created_at',production_code:'production.production_code',
  };
  const sortColumn=sortColumns[req.query.sort_by]||sortColumns.start_date;
  const sortDirection=String(req.query.sort_dir||'asc').toLowerCase()==='desc'?'DESC':'ASC';
  const result=await pool.query(`SELECT production.*,plan.plan_code,orders.order_code,orders.order_date,
      project.project_code,project.project_name,project.project_type,customer.company_name,
      (SELECT COUNT(*)::int FROM production_stage_instances stage WHERE stage.production_order_id=production.id) stage_count,
      (SELECT COUNT(*)::int FROM tasks work JOIN production_stage_instances stage ON stage.id=work.production_stage_instance_id
        WHERE stage.production_order_id=production.id AND work.deleted_at IS NULL) task_count,
      COALESCE((SELECT AVG(CASE WHEN stage.tracks_quantity THEN 100*stage_item.good_quantity/NULLIF(stage_item.planned_quantity,0) ELSE 0 END)
        FROM production_stage_instances stage JOIN production_stage_items stage_item ON stage_item.stage_instance_id=stage.id
        WHERE stage.production_order_id=production.id),0) progress,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',production_item.id,'order_item_id',source.id,
        'item_code',source.item_code,'item_name',source.item_name,'unit',source.unit,
        'planned_quantity',production_item.planned_quantity,'completed_quantity',COALESCE((SELECT stage_item.good_quantity
          FROM production_stage_items stage_item JOIN production_stage_instances stage ON stage.id=stage_item.stage_instance_id
          WHERE stage_item.production_order_item_id=production_item.id AND stage.tracks_quantity=true
          ORDER BY stage.sequence_no DESC,stage_item.id DESC LIMIT 1),0)) ORDER BY source.id)
        FROM production_order_items production_item JOIN project_order_items source ON source.id=production_item.order_item_id
        WHERE production_item.production_order_id=production.id),'[]'::jsonb) items
    FROM production_orders production
    JOIN project_orders orders ON orders.id=production.order_id
    JOIN projects project ON project.id=production.project_id
    LEFT JOIN customers customer ON customer.id=project.customer_id
    LEFT JOIN production_plans plan ON plan.id=production.production_plan_id
    ${where} ORDER BY ${sortColumn} ${sortDirection} NULLS LAST,production.created_at DESC`,params);
  res.json({success:true,data:result.rows});
}catch(error){next(error);}});

router.get('/orders/:id',async(req,res,next)=>{try{res.json({success:true,data:await getProductionOrder(pool,req.params.id)});}catch(error){if(error.status)return res.status(error.status).json({success:false,message:error.message});next(error);}});

router.post('/stage-items/:id/output',async(req,res,next)=>{const db=await pool.connect();try{
  await db.query('BEGIN');const item=await db.query(`SELECT psi.*,si.id stage_id,si.production_order_id FROM production_stage_items psi
    JOIN production_stage_instances si ON si.id=psi.stage_instance_id WHERE psi.id=$1 FOR UPDATE`,[req.params.id]);
  if(!item.rowCount)throw fail('Không tìm thấy hạng mục công đoạn',404);
  const good=Number(req.body.good_quantity||0),defect=Number(req.body.defect_quantity||0),rework=Number(req.body.rework_quantity||0);
  if(good<0||defect<0||rework<0||good+defect+rework<=0)throw fail('Số lượng ghi nhận không hợp lệ');
  if(Number(item.rows[0].good_quantity)+good>Number(item.rows[0].planned_quantity))throw fail('Số lượng đạt vượt số lượng kế hoạch của công đoạn',409);
  await db.query(`INSERT INTO production_output_logs(stage_item_id,output_date,good_quantity,defect_quantity,rework_quantity,notes,recorded_by) VALUES($1,COALESCE($2,CURRENT_DATE),$3,$4,$5,$6,$7)`,[req.params.id,req.body.output_date||null,good,defect,rework,req.body.notes||null,req.user?.id||1]);
  await db.query(`UPDATE production_stage_items SET good_quantity=good_quantity+$1,defect_quantity=defect_quantity+$2,rework_quantity=rework_quantity+$3 WHERE id=$4`,[good,defect,rework,req.params.id]);
  const summary=await db.query(`SELECT SUM(good_quantity) good,SUM(planned_quantity) planned FROM production_stage_items WHERE stage_instance_id=$1`,[item.rows[0].stage_id]);
  const progress=Math.min(100,Math.round(100*Number(summary.rows[0].good)/Number(summary.rows[0].planned)));
  const stageStatus=progress>=100?'COMPLETED':'IN_PROGRESS';
  await db.query('UPDATE production_stage_instances SET status=$1 WHERE id=$2',[stageStatus,item.rows[0].stage_id]);
  const required=await db.query(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE status='COMPLETED')::int completed FROM production_stage_instances WHERE production_order_id=$1 AND is_required=true`,[item.rows[0].production_order_id]);
  const productionStatus=required.rows[0].total===required.rows[0].completed?'READY_FOR_DELIVERY':'IN_PROGRESS';
  await db.query('UPDATE production_orders SET status=$1 WHERE id=$2',[productionStatus,item.rows[0].production_order_id]);
  await db.query(`UPDATE production_plans plan SET status=CASE
      WHEN NOT EXISTS(SELECT 1 FROM production_orders child WHERE child.production_plan_id=plan.id AND child.status<>'READY_FOR_DELIVERY') THEN 'READY_FOR_DELIVERY'
      ELSE 'IN_PROGRESS' END
    WHERE plan.id=(SELECT production_plan_id FROM production_orders WHERE id=$1)`,[item.rows[0].production_order_id]);
  await db.query('COMMIT');res.json({success:true,message:'Đã ghi nhận sản lượng công đoạn',data:await getProductionOrder(pool,item.rows[0].production_order_id)});
}catch(error){await db.query('ROLLBACK');if(error.status)return res.status(error.status).json({success:false,message:error.message});next(error);}finally{db.release();}});

router.patch('/orders/:id/status',async(req,res,next)=>{const db=await pool.connect();try{
  await db.query('BEGIN');
  const status=String(req.body.status||'');if(!['COMPLETED','CANCELLED'].includes(status))throw fail('Trạng thái không hợp lệ');
  const current=await db.query(`SELECT * FROM production_orders WHERE id=$1 FOR UPDATE`,[req.params.id]);
  if(!current.rowCount)throw fail('Không tìm thấy lệnh sản xuất',404);
  if(status==='COMPLETED'&&current.rows[0].status!=='READY_FOR_DELIVERY')throw fail('Chỉ hoàn tất lệnh khi mọi công đoạn bắt buộc đã đạt đủ số lượng',409);
  const result=await db.query('UPDATE production_orders SET status=$1 WHERE id=$2 RETURNING *',[status,req.params.id]);
  if(current.rows[0].production_plan_id){
    await db.query(`UPDATE production_plans plan SET status=CASE
        WHEN NOT EXISTS(SELECT 1 FROM production_orders child WHERE child.production_plan_id=plan.id AND child.status<>'CANCELLED') THEN 'CANCELLED'
        WHEN NOT EXISTS(SELECT 1 FROM production_orders child WHERE child.production_plan_id=plan.id AND child.status NOT IN ('COMPLETED','CANCELLED')) THEN 'COMPLETED'
        WHEN NOT EXISTS(SELECT 1 FROM production_orders child WHERE child.production_plan_id=plan.id AND child.status NOT IN ('READY_FOR_DELIVERY','COMPLETED','CANCELLED')) THEN 'READY_FOR_DELIVERY'
        ELSE 'IN_PROGRESS' END WHERE plan.id=$1`,[current.rows[0].production_plan_id]);
  }
  if(status==='COMPLETED'){
    const completion=await db.query(`SELECT
      NOT EXISTS(
        SELECT 1 FROM project_order_items item
        WHERE item.order_id=$1 AND item.quantity>COALESCE((
          SELECT SUM(production_item.planned_quantity) FROM production_order_items production_item
          JOIN production_orders production ON production.id=production_item.production_order_id
          WHERE production_item.order_item_id=item.id AND production.status<>'CANCELLED'
        ),0)
      ) quantities_fully_planned,
      NOT EXISTS(
        SELECT 1 FROM production_orders production
        WHERE production.order_id=$1 AND production.status NOT IN ('COMPLETED','CANCELLED')
      ) all_runs_completed`,[current.rows[0].order_id]);
    if(completion.rows[0].quantities_fully_planned&&completion.rows[0].all_runs_completed){
      await db.query(`UPDATE project_orders SET status='COMPLETED' WHERE id=$1`,[current.rows[0].order_id]);
    }
  }else{
    const active=await db.query(`SELECT COUNT(*)::int count FROM production_orders WHERE order_id=$1 AND status<>'CANCELLED'`,[current.rows[0].order_id]);
    if(active.rows[0].count===0)await db.query(`UPDATE project_orders SET status='NOT_STARTED' WHERE id=$1`,[current.rows[0].order_id]);
  }
  await db.query('COMMIT');
  res.json({success:true,message:status==='COMPLETED'?'Đã hoàn tất lệnh sản xuất':'Đã hủy lệnh sản xuất',data:result.rows[0]});
}catch(error){await db.query('ROLLBACK');if(error.status)return res.status(error.status).json({success:false,message:error.message});next(error);}finally{db.release();}});

module.exports=router;
