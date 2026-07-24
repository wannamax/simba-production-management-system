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
    const meta=await request('/production-workflows/meta');const projectType=meta.body.data.project_types[0],workItem=meta.body.data.work_items[0];
    assert.ok(projectType&&workItem);
    const employees=await request('/employees?limit=1000');const employee=employees.body.data.find(row=>row.status==='Hoạt động')||employees.body.data[0];assert.ok(employee);
    const project=await request('/projects',{method:'POST',body:JSON.stringify({project_name:`Stage Work H ${stamp}`,project_type:projectType,start_date:'2026-07-22',end_date:'2026-08-15',priority:'Trung bình'})});
    assert.equal(project.status,201,JSON.stringify(project.body));projectId=project.body.data.id;
    const process=await request('/production-workflows/processes',{method:'POST',body:JSON.stringify({code:`H_STAGE_${stamp}`,name:`Quy trình H ${stamp}`,project_types:[projectType],stages:[{code:'PREPARE',name:'Chuẩn bị sản xuất',work_item_id:workItem.id,is_required:true,tracks_quantity:true}]})});
    assert.equal(process.status,201,JSON.stringify(process.body));processId=process.body.data.id;
    const order=await request('/orders',{method:'POST',body:JSON.stringify({project_id:projectId,order_date:'2026-07-22',items:[{item_code:'H01',item_name:'Hạng mục được sản xuất H',unit:'Cái',quantity:10,unit_price:1000},{item_code:'H02',item_name:'Hạng mục chưa sản xuất H',unit:'Cái',quantity:20,unit_price:2000}]})});
    assert.equal(order.status,201,JSON.stringify(order.body));const orderId=order.body.data.id,itemId=order.body.data.items[0].id,unplannedItemId=order.body.data.items[1].id;
    const context=await request(`/production-workflows/context/${orderId}`);const role=context.body.data.roles[0].name;
    const plan=await request('/production-plans',{method:'POST',body:JSON.stringify({order_id:orderId,time_mode:'PHASE',planned_start_date:'2026-07-22',planned_end_date:'2026-07-25',global_assignments:[{employee_id:employee.id,role,time_mode:'PLAN'}],groups:[{group_name:'Nhóm H',process_id:processId,items:[{order_item_id:itemId,planned_quantity:10}],stages:[]}]})});
    assert.equal(plan.status,201,JSON.stringify(plan.body));assert.equal(plan.body.data.status,'PLANNED');
    const group=plan.body.data.groups[0],stage=group.stages[0];assert.equal(stage.task_id,null);assert.deepEqual(stage.works,[]);

    const catalogContext=await request(`/work-catalog/project-context/${projectId}`);assert.equal(catalogContext.status,200);assert.ok(catalogContext.body.data.production_stages.some(row=>Number(row.id)===Number(stage.id)));
    const edited=await request(`/production-plans/stages/${stage.id}`,{method:'PATCH',body:JSON.stringify({stage_name:'Chuẩn bị & kiểm tra',planned_start_date:'2026-07-23',planned_end_date:'2026-07-25'})});
    assert.equal(edited.status,200,JSON.stringify(edited.body));assert.equal(edited.body.data.stage_name,'Chuẩn bị & kiểm tra');

    const supervisorWork=catalogContext.body.data.work_items.find(row=>/giám sát/i.test(row.name));
    const secondWork=catalogContext.body.data.work_items.find(row=>Number(row.id)!==Number(supervisorWork?.id));
    assert.ok(supervisorWork&&secondWork,'Cần Công việc Giám sát và ít nhất một Công việc khác để kiểm thử phân công đồng thời');
    const batch=await request('/tasks/batch',{method:'POST',body:JSON.stringify({project_id:projectId,production_stage_instance_id:stage.id,work_item_ids:[supervisorWork.id,secondWork.id],priority:'Trung bình',assignments:[{employee_id:employee.id,role_in_task:role,work_dates:['2026-07-23']}],notes:'Giám sát và Công việc chuyên môn cùng thời gian'})});
    assert.equal(batch.status,201,JSON.stringify(batch.body));assert.equal(batch.body.data.length,2);assert.ok(batch.body.warnings.length,'Trùng lịch phải chỉ cảnh báo và vẫn tạo đủ Công việc');
    const [firstTask,secondTask]=batch.body.data;
    const withWorks=await request(`/production-plans/${plan.body.data.id}`);assert.equal(withWorks.body.data.groups[0].stages[0].works.length,2);
    const hierarchy=await request(`/tasks?project_id=${projectId}`);assert.ok(hierarchy.body.production_stages.some(row=>Number(row.id)===Number(stage.id)));assert.equal(hierarchy.body.data.length,2);
    const hierarchyStage=hierarchy.body.production_stages.find(row=>Number(row.id)===Number(stage.id));
    assert.equal(hierarchyStage.production_items.length,1);assert.equal(Number(hierarchyStage.production_items[0].order_item_id),Number(itemId));
    assert.equal(Number(hierarchyStage.production_items[0].completed_quantity),0);
    assert.equal(hierarchy.body.order_items.length,2);
    const plannedSummary=hierarchy.body.order_items.find(row=>Number(row.order_item_id)===Number(itemId));
    const unplannedSummary=hierarchy.body.order_items.find(row=>Number(row.order_item_id)===Number(unplannedItemId));
    assert.equal(Number(plannedSummary.allocated_quantity),10);assert.equal(Number(plannedSummary.completed_quantity),0);
    assert.equal(Number(unplannedSummary.allocated_quantity),0);assert.equal(Number(unplannedSummary.order_quantity),20);

    const deletedFirst=await request(`/tasks/${firstTask.id}`,{method:'DELETE'});assert.equal(deletedFirst.status,200);assert.match(deletedFirst.body.message,/Công đoạn.*giữ nguyên/);
    const deletedSecond=await request(`/tasks/${secondTask.id}`,{method:'DELETE'});assert.equal(deletedSecond.status,200);
    const afterWorkDelete=await request(`/production-plans/${plan.body.data.id}`);assert.equal(afterWorkDelete.body.data.groups[0].stages.length,1);assert.equal(afterWorkDelete.body.data.groups[0].stages[0].works.length,0);
    const stillAllocated=await request(`/orders/${orderId}`);assert.equal(Number(stillAllocated.body.data.items[0].allocated_quantity),10);

    const cancelled=await request(`/production-plans/groups/${group.id}`,{method:'DELETE',body:JSON.stringify({reason:'Smoke H trả số lượng'})});
    assert.equal(cancelled.status,200,JSON.stringify(cancelled.body));
    const restored=await request(`/orders/${orderId}`);assert.equal(restored.body.data.status,'NOT_STARTED');assert.equal(Number(restored.body.data.items[0].allocated_quantity),0);
    const cancelledPlan=await request(`/production-plans/${plan.body.data.id}`);assert.equal(cancelledPlan.body.data.status,'CANCELLED');
    console.log(`Production Stage & Work Separation 2.6.0-K smoke test passed (${plan.body.data.plan_code})`);
  }finally{
    if(projectId)await request(`/projects/${projectId}`,{method:'DELETE'}).catch(()=>{});
    if(processId)await request(`/production-workflows/processes/${processId}`,{method:'DELETE'}).catch(()=>{});
  }
})().catch(error=>{console.error(error);process.exit(1);});
