const assert=require('node:assert/strict');

const base=process.env.BASE_URL||'http://localhost:8080/api';
async function request(path,options={}){
  const response=await fetch(`${base}${path}`,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
  const body=await response.json().catch(()=>({}));return {status:response.status,body};
}

(async()=>{
  const stamp=Date.now();let projectId,processId;
  try{
    const health=await request('/health');assert.equal(health.status,200);assert.equal(health.body.version,'2.6.0-K');
    const meta=await request('/production-workflows/meta');const projectType=meta.body.data.project_types[0],workItem=meta.body.data.work_items[0];assert.ok(projectType&&workItem);
    const project=await request('/projects',{method:'POST',body:JSON.stringify({project_name:`Order Workspace I ${stamp}`,project_type:projectType,start_date:'2026-07-22',end_date:'2026-08-22',priority:'Trung bình'})});
    assert.equal(project.status,201,JSON.stringify(project.body));projectId=project.body.data.id;
    const process=await request('/production-workflows/processes',{method:'POST',body:JSON.stringify({code:`I_ORDER_${stamp}`,name:`Quy trình I ${stamp}`,project_types:[projectType],stages:[{code:'MAKE',name:'Sản xuất',work_item_id:workItem.id,is_required:true,tracks_quantity:true}]})});
    assert.equal(process.status,201,JSON.stringify(process.body));processId=process.body.data.id;
    const order=await request('/orders',{method:'POST',body:JSON.stringify({project_id:projectId,order_date:'2026-07-22',items:[{item_code:'I01',item_name:'Hạng mục được lập Lệnh',unit:'Cái',quantity:10,unit_price:1000},{item_code:'I02',item_name:'Hạng mục còn lại',unit:'Cái',quantity:20,unit_price:2000}]})});
    assert.equal(order.status,201,JSON.stringify(order.body));const orderId=order.body.data.id,itemId=order.body.data.items[0].id;
    const plan=await request('/production-plans',{method:'POST',body:JSON.stringify({order_id:orderId,time_mode:'PROJECT',groups:[{group_name:'Lệnh I đợt 1',process_id:processId,items:[{order_item_id:itemId,planned_quantity:6}],stages:[]}],global_assignments:[]})});
    assert.equal(plan.status,201,JSON.stringify(plan.body));const production=plan.body.data.groups[0];

    const productionList=await request(`/production-workflows/orders?project_id=${projectId}&order_id=${orderId}&status=PLANNED&from_date=2026-07-01&to_date=2026-08-31&sort_by=project&sort_dir=asc`);
    assert.equal(productionList.status,200,JSON.stringify(productionList.body));assert.equal(productionList.body.data.length,1);
    assert.equal(Number(productionList.body.data[0].id),Number(production.id));assert.equal(productionList.body.data[0].items.length,1);
    assert.equal(Number(productionList.body.data[0].items[0].order_item_id),Number(itemId));
    const partialOrderList=await request(`/orders?project_id=${projectId}`);assert.equal(partialOrderList.status,200);
    assert.equal(partialOrderList.body.data.find(row=>Number(row.id)===Number(orderId)).has_remaining_quantity,true);

    const direct=await request('/production-workflows/orders/direct',{method:'POST',body:JSON.stringify({order_id:orderId,name:'Hoàn thiện trực tiếp',planned_start_date:'2026-07-22',planned_end_date:'2026-07-24',notes:'Không dùng quy trình mẫu'})});
    assert.equal(direct.status,201,JSON.stringify(direct.body));assert.equal(direct.body.data.order_type,'DIRECT');
    assert.equal(direct.body.data.process_id,null);assert.equal(direct.body.data.stages.length,1);
    const directStageId=direct.body.data.direct_stage_id;assert.equal(Number(direct.body.data.stages[0].id),Number(directStageId));
    const directContext=await request(`/production-workflows/context/${orderId}`);assert.equal(directContext.status,200);
    const employeeResponse=await request('/employees?limit=1000');const employee=employeeResponse.body.data.find(row=>row.status==='Hoạt động');assert.ok(employee);
    const role=directContext.body.data.roles[0].name;
    const directTask=await request('/tasks/batch',{method:'POST',body:JSON.stringify({project_id:projectId,task_source_type:'PRODUCTION_STAGE',production_stage_instance_id:directStageId,work_item_ids:[workItem.id],assignments:[{employee_id:employee.id,role_in_task:role,work_dates:['2026-07-22']}]} )});
    assert.equal(directTask.status,201,JSON.stringify(directTask.body));
    const directDetail=await request(`/production-workflows/orders/${direct.body.data.id}`);assert.equal(directDetail.status,200);assert.equal(directDetail.body.data.stages[0].works.length,1);
    assert.equal(Number(directDetail.body.data.stages[0].works[0].id),Number(directTask.body.data[0].id));

    const workspace=await request(`/orders/${orderId}`);assert.equal(workspace.status,200);assert.equal(workspace.body.data.items.length,2);
    assert.equal(workspace.body.data.production_orders.length,1);assert.equal(workspace.body.data.production_orders[0].items.length,1);
    assert.equal(Number(workspace.body.data.production_orders[0].items[0].order_item_id),Number(itemId));
    assert.equal(Number(workspace.body.data.items[0].allocated_quantity),6);assert.equal(Number(workspace.body.data.items[1].allocated_quantity),0);

    const blocked=await request(`/orders/${orderId}/items/${itemId}/quantity`,{method:'PATCH',body:JSON.stringify({quantity:5,reason:'Thử giảm dưới Lệnh SX'})});
    assert.equal(blocked.status,409);assert.match(blocked.body.message,/sửa hoặc hủy Lệnh/i);
    const editedProduction=await request(`/production-plans/groups/${production.id}`,{method:'PATCH',body:JSON.stringify({group_name:'Lệnh I điều chỉnh',items:[{order_item_id:itemId,planned_quantity:4}],reason:'Giảm phạm vi Lệnh trước khi điều chỉnh Đơn hàng'})});
    assert.equal(editedProduction.status,200,JSON.stringify(editedProduction.body));
    const adjusted=await request(`/orders/${orderId}/items/${itemId}/quantity`,{method:'PATCH',body:JSON.stringify({quantity:5,reason:'Khách hàng giảm số lượng đặt'})});
    assert.equal(adjusted.status,200,JSON.stringify(adjusted.body));
    const added=await request(`/orders/${orderId}/items`,{method:'POST',body:JSON.stringify({item_code:'I03',item_name:'Hạng mục bổ sung',unit:'Cái',quantity:3,unit_price:3000,reason:'Khách hàng bổ sung hạng mục'})});
    assert.equal(added.status,201,JSON.stringify(added.body));
    const finalWorkspace=added.body.data;assert.equal(finalWorkspace.items.length,3);assert.equal(Number(finalWorkspace.items[0].quantity),5);assert.equal(Number(finalWorkspace.items[0].allocated_quantity),4);
    assert.ok(finalWorkspace.change_logs.some(log=>log.change_type==='ADD_ITEM'));
    assert.ok(finalWorkspace.change_logs.some(log=>log.change_type==='QUANTITY_CHANGE'));
    assert.ok(finalWorkspace.change_logs.some(log=>log.change_type==='PRODUCTION_ORDER_CHANGE'));
    const productionDetail=await request(`/production-workflows/orders/${production.id}`);const stageItem=productionDetail.body.data.stages[0].items[0];
    assert.equal(Number(stageItem.planned_quantity),4);
    const output=await request(`/production-workflows/stage-items/${stageItem.id}/output`,{method:'POST',body:JSON.stringify({output_date:'2026-07-23',good_quantity:1,defect_quantity:0,rework_quantity:0})});assert.equal(output.status,200,JSON.stringify(output.body));
    const blockedCancel=await request(`/production-plans/groups/${production.id}`,{method:'DELETE',body:JSON.stringify({reason:'Không được trả lại sản lượng đã ghi'})});assert.equal(blockedCancel.status,409);assert.match(blockedCancel.body.message,/đã ghi nhận sản lượng/i);
    const hierarchy=await request(`/tasks?project_id=${projectId}`);assert.equal(hierarchy.status,200);assert.ok(hierarchy.body.production_stages.length);assert.equal(hierarchy.body.production_stages[0].production_items.length,1);
    console.log(`Order Workspace & Production Order Control 2.6.0-K smoke test passed (${order.body.data.order_code})`);
  }finally{
    if(projectId)await request(`/projects/${projectId}`,{method:'DELETE'}).catch(()=>{});
    if(processId)await request(`/production-workflows/processes/${processId}`,{method:'DELETE'}).catch(()=>{});
  }
})().catch(error=>{console.error(error);process.exit(1);});
