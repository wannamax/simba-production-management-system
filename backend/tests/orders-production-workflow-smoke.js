const assert=require('node:assert/strict');

const base=process.env.BASE_URL||'http://localhost:8080/api';
async function request(path,options={}){
  const response=await fetch(`${base}${path}`,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
  const body=await response.json().catch(()=>({}));return {status:response.status,body};
}

(async()=>{
  let projectId,processId;
  try{
    const health=await request('/health');assert.equal(health.status,200);assert.equal(health.body.version,'2.6.0-K');
    const processMeta=await request('/production-workflows/meta');assert.equal(processMeta.status,200);
    const projectType=processMeta.body.data.project_types[0];
    const workItem=processMeta.body.data.work_items[0];assert.ok(workItem);
    const employees=await request('/employees?limit=1000');assert.equal(employees.status,200);
    const employee=employees.body.data.find(row=>row.status==='Hoạt động')||employees.body.data[0];assert.ok(employee,'Cần ít nhất một nhân viên để chạy smoke test');

    const project=await request('/projects',{method:'POST',body:JSON.stringify({project_name:`Smoke Orders ${Date.now()}`,project_type:projectType,start_date:'2026-07-22',end_date:'2026-08-30',priority:'Trung bình'})});
    assert.equal(project.status,201,JSON.stringify(project.body));projectId=project.body.data.id;

    const process=await request('/production-workflows/processes',{method:'POST',body:JSON.stringify({code:`SMOKE_${Date.now()}`,name:'Quy trình smoke 2 công đoạn',project_types:[projectType],stages:[
      {code:'STAGE_1',name:'Gia công smoke',work_item_id:workItem.id,is_required:true,tracks_quantity:true,default_hours:8},
      {code:'STAGE_2',name:'Hoàn thiện smoke',work_item_id:workItem.id,is_required:true,tracks_quantity:true,default_hours:8},
    ]})});
    assert.equal(process.status,201,JSON.stringify(process.body));processId=process.body.data.id;
    assert.ok(process.body.data.stages.every(stage=>stage.default_hours===null),'Quy trình không được lưu giờ mặc định');

    const order=await request('/orders',{method:'POST',body:JSON.stringify({project_id:projectId,order_date:'2026-07-22',expected_delivery_date:'2026-08-30',items:[
      {item_code:'BIG',item_name:'Kệ lớn',unit:'Cái',quantity:100,unit_price:200000},
      {item_code:'SMALL',item_name:'Kệ nhỏ',unit:'Cái',quantity:200,unit_price:50000},
    ]})});
    assert.equal(order.status,201,JSON.stringify(order.body));const orderId=order.body.data.id;
    assert.equal(Number(order.body.data.total_amount),30000000);
    assert.equal(order.body.data.status,'NOT_STARTED');

    const context=await request(`/production-workflows/context/${orderId}`);assert.equal(context.status,200);
    const role=context.body.data.roles[0].name;const stages=process.body.data.stages;
    const selectedItems=context.body.data.order.items.map(item=>({order_item_id:item.id,planned_quantity:item.item_code==='BIG'?60:120}));
    const production=await request('/production-workflows/orders',{method:'POST',body:JSON.stringify({order_id:orderId,process_id:processId,planned_start_date:'2026-07-22',planned_end_date:'2026-07-24',items:selectedItems,global_assignments:[{employee_id:employee.id,role,start_date:'2026-07-22',end_date:'2026-07-24'}],stages:stages.map((stage,index)=>({source_stage_id:stage.id,start_date:'2026-07-22',end_date:'2026-07-24',items:selectedItems.map(item=>({...item,planned_quantity:index===0?item.planned_quantity:item.planned_quantity/2})),assignments:[{employee_id:employee.id,role,work_dates:['2026-07-22','2026-07-23','2026-07-24']}]}))})});
    assert.equal(production.status,201,JSON.stringify(production.body));
    assert.equal(production.body.data.stages.length,2);assert.ok(production.body.data.stages.every(stage=>!stage.task_id&&stage.works.length===0));
    assert.equal(production.body.data.global_assignments.length,1);
    assert.notEqual(Number(production.body.data.stages[0].items[0].planned_quantity),Number(production.body.data.stages[1].items[0].planned_quantity));

    const overAllocation=await request('/production-workflows/orders',{method:'POST',body:JSON.stringify({order_id:orderId,process_id:processId,items:[{order_item_id:context.body.data.order.items[0].id,planned_quantity:41}]})});
    assert.equal(overAllocation.status,409,JSON.stringify(overAllocation.body));

    let current=production.body.data;
    for(const stage of current.stages){
      for(const item of stage.items){
        const output=await request(`/production-workflows/stage-items/${item.id}/output`,{method:'POST',body:JSON.stringify({output_date:'2026-07-24',good_quantity:Number(item.planned_quantity),defect_quantity:0,rework_quantity:0})});
        assert.equal(output.status,200,JSON.stringify(output.body));current=output.body.data;
      }
    }
    assert.equal(current.status,'READY_FOR_DELIVERY');assert.ok(current.stages.every(stage=>stage.status==='COMPLETED'));
    const completed=await request(`/production-workflows/orders/${current.id}/status`,{method:'PATCH',body:JSON.stringify({status:'COMPLETED'})});assert.equal(completed.status,200);
    const orderAfter=await request(`/orders/${orderId}`);assert.equal(orderAfter.body.data.status,'IN_PRODUCTION');

    console.log(`Orders & Production Workflow 2.6.0-K smoke test passed (order ${orderId}, production ${current.id})`);
  }finally{
    if(projectId)await request(`/projects/${projectId}`,{method:'DELETE'}).catch(()=>{});
    if(processId)await request(`/production-workflows/processes/${processId}`,{method:'DELETE'}).catch(()=>{});
  }
})().catch(error=>{console.error(error);process.exit(1);});
