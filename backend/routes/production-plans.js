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
async function generateCode(db,table,column,prefix){
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`${table}.${column}.${prefix}`]);
  const result=await db.query(`SELECT COALESCE(MAX(CASE WHEN substring(${column} FROM char_length($1)+1) ~ '^[0-9]+$'
    THEN substring(${column} FROM char_length($1)+1)::int END),0)+1 next_number FROM ${table} WHERE ${column} LIKE $2`,[prefix,`${prefix}%`]);
  return `${prefix}${String(result.rows[0].next_number).padStart(4,'0')}`;
}
async function ensureRole(db,role){
  const value=String(role||'').trim();if(!value)throw fail('Cần chọn vai trò');
  const result=await db.query(`SELECT 1 FROM system_catalogs WHERE catalog_type='PROJECT_ROLE' AND name=$1 AND is_active=true`,[value]);
  if(!result.rowCount)throw fail(`Vai trò “${value}” không hợp lệ hoặc đã ngừng sử dụng`);return value;
}
async function ensureEmployees(db,ids){
  const unique=[...new Set(ids.map(Number).filter(Number.isInteger))];if(!unique.length)return;
  const result=await db.query(`SELECT id FROM employees WHERE id=ANY($1::int[]) AND status='Hoạt động'`,[unique]);
  if(result.rowCount!==unique.length)throw fail('Danh sách có nhân viên không tồn tại hoặc đã ngừng hoạt động');
}
async function syncProjectMember(db,projectId,employeeId,role){
  const current=await db.query(`SELECT id FROM project_assignments WHERE project_id=$1 AND employee_id=$2 ORDER BY id LIMIT 1`,[projectId,employeeId]);
  if(!current.rowCount)await db.query(`INSERT INTO project_assignments(project_id,employee_id,role,notes) VALUES($1,$2,$3,$4)`,[projectId,employeeId,role,'Tự động thêm từ Kế hoạch sản xuất']);
}
function resolvePlanDates(mode,project,payload){
  if(mode==='PROJECT'){
    if(!project.start_date||!project.end_date)throw fail('Dự án chưa có đủ ngày bắt đầu và kết thúc');
    return {start:iso(project.start_date),end:iso(project.end_date)};
  }
  const start=iso(payload.planned_start_date),end=iso(payload.planned_end_date);
  if(mode==='PHASE'&&(!start||!end))throw fail('Chế độ Theo giai đoạn cần chọn Từ ngày và Đến ngày');
  if(start&&end&&start>end)throw fail('Thời gian Kế hoạch sản xuất không hợp lệ');
  return {start,end};
}
function resolveStageDates(mode,project,planDates,group,stage){
  if(mode==='PROJECT')return {start:iso(project.start_date),end:iso(project.end_date)};
  if(mode==='PHASE')return planDates;
  const start=iso(stage.start_date||group.planned_start_date),end=iso(stage.end_date||group.planned_end_date);
  if(!start||!end)throw fail(`Công đoạn tùy chỉnh cần có đủ Từ ngày và Đến ngày`);
  if(start>end)throw fail('Thời gian công đoạn không hợp lệ');return {start,end};
}
async function getPlan(db,id){
  const plan=await db.query(`SELECT plan.*,project.project_code,project.project_name,project.project_type,customer.company_name,orders.order_code
    FROM production_plans plan JOIN projects project ON project.id=plan.project_id
    JOIN project_orders orders ON orders.id=plan.order_id LEFT JOIN customers customer ON customer.id=project.customer_id
    WHERE plan.id=$1`,[id]);
  if(!plan.rowCount)throw fail('Không tìm thấy Kế hoạch sản xuất',404);
  const assignments=await db.query(`SELECT assignment.*,employee.employee_code,employee.full_name
    FROM production_plan_assignments assignment JOIN employees employee ON employee.id=assignment.employee_id
    WHERE assignment.production_plan_id=$1 ORDER BY employee.full_name`,[id]);
  const groups=await db.query(`SELECT production.*,COUNT(DISTINCT item.id)::int item_count,COUNT(DISTINCT stage.id)::int stage_count
    FROM production_orders production LEFT JOIN production_order_items item ON item.production_order_id=production.id
    LEFT JOIN production_stage_instances stage ON stage.production_order_id=production.id
    WHERE production.production_plan_id=$1 GROUP BY production.id ORDER BY production.id`,[id]);
  const detailed=[];
  for(const group of groups.rows){
    const [items,stages]=await Promise.all([
      db.query(`SELECT item.*,source.item_code,source.item_name,source.unit FROM production_order_items item
        JOIN project_order_items source ON source.id=item.order_item_id WHERE item.production_order_id=$1 ORDER BY item.id`,[group.id]),
      db.query(`SELECT stage.*,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('id',stage_item.id,'item_name',source.item_name,'unit',source.unit,
          'planned_quantity',stage_item.planned_quantity,'good_quantity',stage_item.good_quantity,'defect_quantity',stage_item.defect_quantity,
          'rework_quantity',stage_item.rework_quantity) ORDER BY source.id)
          FROM production_stage_items stage_item
          JOIN production_order_items production_item ON production_item.id=stage_item.production_order_item_id
          JOIN project_order_items source ON source.id=production_item.order_item_id
          WHERE stage_item.stage_instance_id=stage.id),'[]'::jsonb) items,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('id',work.id,'task_code',work.task_code,'task_name',work.task_name,
          'status',work.status,'progress',work.progress,'start_date',work.start_date,'end_date',work.end_date) ORDER BY work.created_at)
          FROM tasks work WHERE work.production_stage_instance_id=stage.id AND work.deleted_at IS NULL),'[]'::jsonb) works
        FROM production_stage_instances stage WHERE stage.production_order_id=$1 ORDER BY stage.sequence_no`,[group.id]),
    ]);
    detailed.push({...group,items:items.rows,stages:stages.rows});
  }
  return {...plan.rows[0],assignments:assignments.rows,groups:detailed};
}

router.get('/',async(req,res,next)=>{try{
  const params=[];let where='WHERE 1=1';
  if(req.query.order_id){params.push(req.query.order_id);where+=` AND plan.order_id=$${params.length}`;}
  if(req.query.project_id){params.push(req.query.project_id);where+=` AND plan.project_id=$${params.length}`;}
  const result=await pool.query(`SELECT plan.*,project.project_code,project.project_name,orders.order_code,
    COUNT(production.id)::int group_count FROM production_plans plan JOIN projects project ON project.id=plan.project_id
    JOIN project_orders orders ON orders.id=plan.order_id LEFT JOIN production_orders production ON production.production_plan_id=plan.id
    ${where} GROUP BY plan.id,project.project_code,project.project_name,orders.order_code ORDER BY plan.created_at DESC`,params);
  res.json({success:true,data:result.rows});
}catch(error){next(error);}});

router.get('/:id',async(req,res,next)=>{try{res.json({success:true,data:await getPlan(pool,req.params.id)});}catch(error){if(error.status)return res.status(error.status).json({success:false,message:error.message});next(error);}});

async function refreshOrderAfterCancellation(db,orderId){
  const active=await db.query(`SELECT COUNT(*)::int count FROM production_orders WHERE order_id=$1 AND status<>'CANCELLED'`,[orderId]);
  await db.query(`UPDATE project_orders SET status=$1 WHERE id=$2`,[active.rows[0].count?'IN_PRODUCTION':'NOT_STARTED',orderId]);
}
async function cancelProductionGroups(db,groupIds,reason,userId){
  const groups=await db.query(`SELECT id,order_id,production_plan_id,status FROM production_orders WHERE id=ANY($1::bigint[]) FOR UPDATE`,[groupIds]);
  if(groups.rowCount!==groupIds.length)throw fail('Có Nhóm sản xuất không tồn tại',404);
  if(groups.rows.some(group=>group.status==='COMPLETED'))throw fail('Không thể hủy Nhóm sản xuất đã hoàn tất',409);
  const recorded=await db.query(`SELECT DISTINCT stage.production_order_id
    FROM production_stage_instances stage
    JOIN production_stage_items item ON item.stage_instance_id=stage.id
    WHERE stage.production_order_id=ANY($1::bigint[])
      AND (item.good_quantity>0 OR item.defect_quantity>0 OR item.rework_quantity>0
        OR EXISTS(SELECT 1 FROM production_output_logs output WHERE output.stage_item_id=item.id))`,[groupIds]);
  if(recorded.rowCount)throw fail('Không thể hủy Lệnh SX đã ghi nhận sản lượng. Hãy điều chỉnh số lượng Lệnh không thấp hơn sản lượng đã ghi và hoàn tất Lệnh.',409);
  const stageIds=(await db.query(`SELECT id FROM production_stage_instances WHERE production_order_id=ANY($1::bigint[])`,[groupIds])).rows.map(row=>row.id);
  if(stageIds.length)await db.query(`UPDATE tasks SET deleted_at=COALESCE(deleted_at,NOW()),deleted_by=$1,status='Hủy',updated_at=NOW()
    WHERE production_stage_instance_id=ANY($2::bigint[]) AND deleted_at IS NULL`,[userId,stageIds]);
  await db.query(`UPDATE production_orders SET status='CANCELLED',cancelled_at=NOW(),cancelled_by=$1,cancellation_reason=$2 WHERE id=ANY($3::bigint[])`,[userId,reason,groupIds]);
  for(const planId of [...new Set(groups.rows.map(group=>group.production_plan_id).filter(Boolean))]){
    await db.query(`UPDATE production_plans plan SET status=CASE
      WHEN NOT EXISTS(SELECT 1 FROM production_orders child WHERE child.production_plan_id=plan.id AND child.status<>'CANCELLED') THEN 'CANCELLED'
      ELSE 'IN_PROGRESS' END,
      cancelled_at=CASE WHEN NOT EXISTS(SELECT 1 FROM production_orders child WHERE child.production_plan_id=plan.id AND child.status<>'CANCELLED') THEN NOW() ELSE NULL END,
      cancelled_by=CASE WHEN NOT EXISTS(SELECT 1 FROM production_orders child WHERE child.production_plan_id=plan.id AND child.status<>'CANCELLED') THEN $1::integer ELSE NULL END,
      cancellation_reason=CASE WHEN NOT EXISTS(SELECT 1 FROM production_orders child WHERE child.production_plan_id=plan.id AND child.status<>'CANCELLED') THEN $2::text ELSE NULL END
      WHERE plan.id=$3`,[userId,reason,planId]);
  }
  for(const orderId of [...new Set(groups.rows.map(group=>group.order_id))])await refreshOrderAfterCancellation(db,orderId);
  return groups.rows;
}

router.patch('/stages/:id',async(req,res,next)=>{const db=await pool.connect();try{
  await db.query('BEGIN');
  const current=await db.query(`SELECT stage.*,production.status production_status FROM production_stage_instances stage
    JOIN production_orders production ON production.id=stage.production_order_id WHERE stage.id=$1 FOR UPDATE OF stage`,[req.params.id]);
  if(!current.rowCount)throw fail('Không tìm thấy Công đoạn',404);
  if(['COMPLETED','CANCELLED'].includes(current.rows[0].production_status))throw fail('Không thể sửa Công đoạn thuộc Nhóm đã hoàn tất hoặc đã hủy',409);
  const start=iso(req.body.planned_start_date||current.rows[0].planned_start_date),end=iso(req.body.planned_end_date||current.rows[0].planned_end_date);
  if(start&&end&&start>end)throw fail('Thời gian Công đoạn không hợp lệ');
  const result=await db.query(`UPDATE production_stage_instances SET stage_name=$1,planned_start_date=$2,planned_end_date=$3 WHERE id=$4 RETURNING *`,
    [String(req.body.stage_name||current.rows[0].stage_name).trim(),start,end,req.params.id]);
  await db.query('COMMIT');res.json({success:true,message:'Đã cập nhật Công đoạn',data:result.rows[0]});
}catch(error){await db.query('ROLLBACK');if(error.status)return res.status(error.status).json({success:false,message:error.message});next(error);}finally{db.release();}});

router.patch('/groups/:id',async(req,res,next)=>{const db=await pool.connect();try{
  await db.query('BEGIN');
  const current=await db.query(`SELECT * FROM production_orders WHERE id=$1 FOR UPDATE`,[req.params.id]);
  if(!current.rowCount)throw fail('Không tìm thấy Lệnh sản xuất',404);
  const production=current.rows[0];
  if(['COMPLETED','CANCELLED'].includes(production.status))throw fail('Không thể sửa Lệnh sản xuất đã hoàn thành hoặc đã hủy',409);
  const requested=(Array.isArray(req.body.items)?req.body.items:[]).map(item=>({order_item_id:Number(item.order_item_id),planned_quantity:Number(item.planned_quantity)}));
  if(!requested.length||requested.some(item=>!Number.isInteger(item.order_item_id)||!(item.planned_quantity>0)))throw fail('Lệnh sản xuất cần ít nhất một hạng mục và số lượng hợp lệ');
  if(new Set(requested.map(item=>item.order_item_id)).size!==requested.length)throw fail('Hạng mục trong Lệnh sản xuất bị trùng');
  const sources=await db.query(`SELECT * FROM project_order_items WHERE order_id=$1 AND id=ANY($2::bigint[]) FOR UPDATE`,[production.order_id,requested.map(item=>item.order_item_id)]);
  if(sources.rowCount!==requested.length)throw fail('Có hạng mục không thuộc Đơn hàng gốc');
  const existing=await db.query(`SELECT item.*,
    COALESCE((SELECT MAX(stage_item.good_quantity) FROM production_stage_items stage_item WHERE stage_item.production_order_item_id=item.id),0) recorded_quantity,
    EXISTS(SELECT 1 FROM production_output_logs output JOIN production_stage_items stage_item ON stage_item.id=output.stage_item_id WHERE stage_item.production_order_item_id=item.id) has_output
    FROM production_order_items item WHERE item.production_order_id=$1 FOR UPDATE`,[req.params.id]);
  for(const selected of requested){
    const source=sources.rows.find(item=>Number(item.id)===selected.order_item_id);
    const other=await db.query(`SELECT COALESCE(SUM(item.planned_quantity),0) quantity FROM production_order_items item
      JOIN production_orders child ON child.id=item.production_order_id
      WHERE item.order_item_id=$1 AND child.id<>$2 AND child.status<>'CANCELLED'`,[selected.order_item_id,req.params.id]);
    if(Number(other.rows[0].quantity)+selected.planned_quantity>Number(source.quantity))throw fail(`Số lượng “${source.item_name}” vượt phần còn lại của Đơn hàng`,409);
    const old=existing.rows.find(item=>Number(item.order_item_id)===selected.order_item_id);
    if(old&&selected.planned_quantity<Number(old.recorded_quantity))throw fail(`Không thể giảm “${source.item_name}” dưới sản lượng đã ghi ${Number(old.recorded_quantity)} ${source.unit}`,409);
  }
  for(const old of existing.rows.filter(item=>!requested.some(selected=>selected.order_item_id===Number(item.order_item_id)))){
    if(old.has_output||Number(old.recorded_quantity)>0)throw fail('Không thể bỏ hạng mục đã ghi nhận sản lượng khỏi Lệnh SX',409);
    await db.query(`DELETE FROM production_order_items WHERE id=$1`,[old.id]);
  }
  const stages=(await db.query(`SELECT id FROM production_stage_instances WHERE production_order_id=$1 ORDER BY sequence_no`,[req.params.id])).rows;
  for(const selected of requested){
    const old=existing.rows.find(item=>Number(item.order_item_id)===selected.order_item_id);
    if(old){
      await db.query(`UPDATE production_order_items SET planned_quantity=$1 WHERE id=$2`,[selected.planned_quantity,old.id]);
      await db.query(`UPDATE production_stage_items SET planned_quantity=$1 WHERE production_order_item_id=$2`,[selected.planned_quantity,old.id]);
    }else{
      const inserted=await db.query(`INSERT INTO production_order_items(production_order_id,order_item_id,planned_quantity) VALUES($1,$2,$3) RETURNING id`,[req.params.id,selected.order_item_id,selected.planned_quantity]);
      for(const stage of stages)await db.query(`INSERT INTO production_stage_items(stage_instance_id,production_order_item_id,planned_quantity) VALUES($1,$2,$3)`,[stage.id,inserted.rows[0].id,selected.planned_quantity]);
    }
  }
  const groupName=String(req.body.group_name||production.group_name||production.process_name).trim();
  await db.query(`UPDATE production_orders SET group_name=$1 WHERE id=$2`,[groupName,req.params.id]);
  const after=await db.query(`SELECT order_item_id,planned_quantity FROM production_order_items WHERE production_order_id=$1 ORDER BY order_item_id`,[req.params.id]);
  const reason=String(req.body.reason||'Điều chỉnh Lệnh sản xuất').trim();if(reason.length<3)throw fail('Cần nhập lý do điều chỉnh Lệnh SX');
  await db.query(`INSERT INTO order_item_change_logs(order_id,change_type,reason,before_data,after_data,changed_by)
    VALUES($1,'PRODUCTION_ORDER_CHANGE',$2,$3,$4,$5)`,[production.order_id,reason,JSON.stringify({production_order_id:production.id,production_code:production.production_code,group_name:production.group_name,items:existing.rows.map(item=>({order_item_id:item.order_item_id,planned_quantity:item.planned_quantity}))}),JSON.stringify({production_order_id:production.id,production_code:production.production_code,group_name:groupName,items:after.rows}),req.user?.id||1]);
  await db.query('COMMIT');res.json({success:true,message:'Đã cập nhật Lệnh sản xuất và ghi Nhật ký Đơn hàng',data:await getPlan(pool,production.production_plan_id)});
}catch(error){await db.query('ROLLBACK');if(error.status)return res.status(error.status).json({success:false,message:error.message});next(error);}finally{db.release();}});

router.delete('/groups/:id',async(req,res,next)=>{const db=await pool.connect();try{
  await db.query('BEGIN');const reason=String(req.body?.reason||'Hủy Nhóm sản xuất từ Đơn hàng').trim();
  const groups=await cancelProductionGroups(db,[Number(req.params.id)],reason,req.user?.id||1);
  await db.query('COMMIT');res.json({success:true,message:'Đã hủy Nhóm sản xuất; số lượng đã được trả về phần còn lại của Đơn hàng',data:groups[0]});
}catch(error){await db.query('ROLLBACK');if(error.status)return res.status(error.status).json({success:false,message:error.message});next(error);}finally{db.release();}});

router.delete('/:id',async(req,res,next)=>{const db=await pool.connect();try{
  await db.query('BEGIN');const plan=await db.query(`SELECT * FROM production_plans WHERE id=$1 FOR UPDATE`,[req.params.id]);
  if(!plan.rowCount)throw fail('Không tìm thấy Kế hoạch sản xuất',404);
  if(plan.rows[0].status==='COMPLETED')throw fail('Không thể hủy Kế hoạch đã hoàn tất',409);
  const groups=(await db.query(`SELECT id FROM production_orders WHERE production_plan_id=$1 AND status<>'CANCELLED'`,[req.params.id])).rows.map(row=>Number(row.id));
  const reason=String(req.body?.reason||'Hủy toàn bộ Kế hoạch sản xuất').trim();
  if(groups.length)await cancelProductionGroups(db,groups,reason,req.user?.id||1);
  else await db.query(`UPDATE production_plans SET status='CANCELLED',cancelled_at=NOW(),cancelled_by=$1,cancellation_reason=$2 WHERE id=$3`,[req.user?.id||1,reason,req.params.id]);
  await refreshOrderAfterCancellation(db,plan.rows[0].order_id);
  await db.query('COMMIT');res.json({success:true,message:'Đã hủy toàn bộ Kế hoạch; số lượng đã được trả về Đơn hàng'});
}catch(error){await db.query('ROLLBACK');if(error.status)return res.status(error.status).json({success:false,message:error.message});next(error);}finally{db.release();}});

router.post('/',async(req,res,next)=>{const db=await pool.connect();try{
  await db.query('BEGIN');
  const orderResult=await db.query(`SELECT orders.*,project.project_type,project.start_date project_start_date,project.end_date project_end_date
    FROM project_orders orders JOIN projects project ON project.id=orders.project_id
    WHERE orders.id=$1 AND orders.status IN ('NOT_STARTED','IN_PRODUCTION') AND project.deleted_at IS NULL FOR UPDATE OF orders`,[req.body.order_id]);
  if(!orderResult.rowCount)throw fail('Đơn hàng không ở trạng thái có thể lập Kế hoạch sản xuất',409);
  const order=orderResult.rows[0],project={start_date:order.project_start_date,end_date:order.project_end_date};
  const timeMode=String(req.body.time_mode||'PHASE');if(!['PROJECT','PHASE','CUSTOM'].includes(timeMode))throw fail('Chế độ thời gian không hợp lệ');
  const planDates=resolvePlanDates(timeMode,project,req.body);
  const groups=Array.isArray(req.body.groups)?req.body.groups:[];if(!groups.length)throw fail('Kế hoạch cần ít nhất một Nhóm sản xuất');
  const globalAssignments=Array.isArray(req.body.global_assignments)?req.body.global_assignments:[];
  await ensureEmployees(db,globalAssignments.map(item=>item.employee_id));

  const selectedRows=groups.flatMap((group,groupIndex)=>(group.items||[]).filter(item=>Number(item.planned_quantity)>0).map(item=>({...item,groupIndex})));
  if(!selectedRows.length)throw fail('Cần chọn ít nhất một hạng mục và số lượng sản xuất');
  const itemIds=[...new Set(selectedRows.map(item=>Number(item.order_item_id)))];
  const orderItems=await db.query(`SELECT * FROM project_order_items WHERE order_id=$1 AND id=ANY($2::bigint[]) FOR UPDATE`,[order.id,itemIds]);
  if(orderItems.rowCount!==itemIds.length)throw fail('Có hạng mục không thuộc Đơn hàng đã chọn');
  for(const itemId of itemIds){
    const source=orderItems.rows.find(item=>Number(item.id)===itemId);
    const requested=selectedRows.filter(item=>Number(item.order_item_id)===itemId).reduce((sum,item)=>sum+Number(item.planned_quantity),0);
    const allocated=await db.query(`SELECT COALESCE(SUM(item.planned_quantity),0) quantity FROM production_order_items item
      JOIN production_orders production ON production.id=item.production_order_id WHERE item.order_item_id=$1 AND production.status<>'CANCELLED'`,[itemId]);
    if(!(requested>0)||requested+Number(allocated.rows[0].quantity)>Number(source.quantity))throw fail(`Tổng số lượng hạng mục “${source.item_name}” vượt phần còn lại ${Number(source.quantity)-Number(allocated.rows[0].quantity)} ${source.unit}`,409);
  }

  const year=new Date().getFullYear();const planCode=await generateCode(db,'production_plans','plan_code',`MPL-${year}`);
  const insertedPlan=await db.query(`INSERT INTO production_plans(plan_code,project_id,order_id,time_mode,planned_start_date,planned_end_date,project_schedule_snapshot,status,notes,created_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,'PLANNED',$8,$9) RETURNING *`,[planCode,order.project_id,order.id,timeMode,planDates.start,planDates.end,JSON.stringify({start_date:iso(project.start_date),end_date:iso(project.end_date)}),req.body.notes||null,req.user?.id||1]);

  const globalKeys=globalAssignments.map(item=>`${Number(item.employee_id)}::${item.role||''}`);if(new Set(globalKeys).size!==globalKeys.length)throw fail('Nhân sự toàn Kế hoạch bị trùng vai trò');
  for(const assignment of globalAssignments){
    const role=await ensureRole(db,assignment.role);await syncProjectMember(db,order.project_id,assignment.employee_id,role);
    const assignmentMode=String(assignment.time_mode||'PLAN');if(!['PROJECT','PLAN','CUSTOM'].includes(assignmentMode))throw fail('Phạm vi thời gian Giám sát không hợp lệ');
    let start,end,workDates=[];
    if(assignmentMode==='PROJECT'){start=iso(project.start_date);end=iso(project.end_date);}
    else if(assignmentMode==='PLAN'){start=planDates.start;end=planDates.end;}
    else{workDates=(assignment.work_dates||[]).map(iso);start=workDates[0]||iso(assignment.start_date);end=workDates[workDates.length-1]||iso(assignment.end_date);}
    if(!start||!end)throw fail(`Nhân sự toàn Kế hoạch “${role}” chưa có phạm vi thời gian hợp lệ`);
    await db.query(`INSERT INTO production_plan_assignments(production_plan_id,employee_id,role,time_mode,start_date,end_date,work_dates,notes)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[insertedPlan.rows[0].id,assignment.employee_id,role,assignmentMode,start,end,workDates,assignment.notes||null]);
  }

  for(let groupIndex=0;groupIndex<groups.length;groupIndex+=1){
    const group=groups[groupIndex],groupItems=(group.items||[]).filter(item=>Number(item.planned_quantity)>0);
    if(!groupItems.length)throw fail(`Nhóm sản xuất ${groupIndex+1} chưa chọn hạng mục`);
    const duplicateIds=groupItems.map(item=>Number(item.order_item_id));if(new Set(duplicateIds).size!==duplicateIds.length)throw fail(`Nhóm sản xuất ${groupIndex+1} có hạng mục bị trùng`);
    const processResult=await db.query(`SELECT * FROM production_processes WHERE id=$1 AND is_active=true`,[group.process_id]);
    if(!processResult.rowCount)throw fail(`Nhóm sản xuất ${groupIndex+1} chưa có Quy trình hợp lệ`);
    const process=processResult.rows[0];if(process.project_types.length&&!process.project_types.includes(order.project_type))throw fail(`Quy trình “${process.name}” không phù hợp Loại dự án`);
    const templateStages=(await db.query(`SELECT stage.*,work_item.name work_item_name,work_group.name work_group_name
      FROM production_process_stages stage LEFT JOIN work_items work_item ON work_item.id=stage.work_item_id
      LEFT JOIN work_groups work_group ON work_group.id=work_item.group_id WHERE stage.process_id=$1 ORDER BY stage.sequence_no`,[process.id])).rows;
    if(!templateStages.length)throw fail(`Quy trình “${process.name}” chưa có công đoạn`);
    const groupMode=String(group.time_mode||timeMode);if(!['PROJECT','PHASE','CUSTOM'].includes(groupMode))throw fail('Chế độ thời gian Nhóm sản xuất không hợp lệ');
    const groupDates=groupMode==='PROJECT'?{start:iso(project.start_date),end:iso(project.end_date)}:groupMode==='PHASE'?planDates:{start:iso(group.planned_start_date),end:iso(group.planned_end_date)};
    const productionCode=await generateCode(db,'production_orders','production_code',`MO-${year}`);
    const snapshot={id:process.id,code:process.code,name:process.name,version:process.version,stages:templateStages};
    const production=await db.query(`INSERT INTO production_orders(production_code,project_id,order_id,process_id,process_name,process_version,process_snapshot,status,planned_start_date,planned_end_date,notes,created_by,production_plan_id,group_name,time_mode)
      VALUES($1,$2,$3,$4,$5,$6,$7,'PLANNED',$8,$9,$10,$11,$12,$13,$14) RETURNING *`,[productionCode,order.project_id,order.id,process.id,process.name,process.version,JSON.stringify(snapshot),groupDates.start,groupDates.end,group.notes||null,req.user?.id||1,insertedPlan.rows[0].id,group.group_name||`Nhóm sản xuất ${groupIndex+1}`,groupMode]);
    const productionItems=[];
    for(const item of groupItems){const inserted=await db.query(`INSERT INTO production_order_items(production_order_id,order_item_id,planned_quantity) VALUES($1,$2,$3) RETURNING *`,[production.rows[0].id,item.order_item_id,item.planned_quantity]);productionItems.push(inserted.rows[0]);}

    const stagePlans=Array.isArray(group.stages)?group.stages:[];
    for(const stage of templateStages){
      const plan=stagePlans.find(item=>Number(item.source_stage_id)===Number(stage.id))||{};
      const stageDates=resolveStageDates(groupMode,project,planDates,group,plan);
      const instance=await db.query(`INSERT INTO production_stage_instances(production_order_id,source_stage_id,sequence_no,stage_code,stage_name,work_item_id,task_id,is_required,tracks_quantity,allow_parallel,planned_start_date,planned_end_date)
        VALUES($1,$2,$3,$4,$5,$6,NULL,$7,$8,$9,$10,$11) RETURNING *`,[production.rows[0].id,stage.id,stage.sequence_no,stage.code,stage.name,stage.work_item_id,stage.is_required,stage.tracks_quantity,stage.allow_parallel,stageDates.start,stageDates.end]);
      const stageItems=Array.isArray(plan.items)&&plan.items.length?plan.items:groupItems;
      for(const selected of stageItems){
        const productionItem=productionItems.find(item=>Number(item.order_item_id)===Number(selected.order_item_id));const quantity=Number(selected.planned_quantity);
        if(!productionItem||!(quantity>0)||quantity>Number(productionItem.planned_quantity))throw fail(`Công đoạn “${stage.name}” có số lượng hạng mục không hợp lệ`);
        await db.query(`INSERT INTO production_stage_items(stage_instance_id,production_order_item_id,planned_quantity) VALUES($1,$2,$3)`,[instance.rows[0].id,productionItem.id,quantity]);
      }
    }
  }
  await db.query(`UPDATE project_orders SET status='IN_PRODUCTION' WHERE id=$1`,[order.id]);
  await db.query('COMMIT');res.status(201).json({success:true,message:`Đã tạo ${planCode} với ${groups.length} Nhóm sản xuất`,data:await getPlan(pool,insertedPlan.rows[0].id)});
}catch(error){await db.query('ROLLBACK');if(error.status)return res.status(error.status).json({success:false,message:error.message});next(error);}finally{db.release();}});

module.exports=router;
