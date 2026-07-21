const assert = require('assert');

const baseUrl=(process.env.TEST_BASE_URL||'http://localhost:8080').replace(/\/$/,'');
async function request(path,options={}){
  const response=await fetch(`${baseUrl}/api${path}`,{...options,headers:{'content-type':'application/json',...(options.headers||{})}});
  const text=await response.text(); let body={}; try{body=text?JSON.parse(text):{};}catch{body={raw:text};}
  return {response,body};
}
async function createAndPost(payload){
  const created=await request('/inventory/documents',{method:'POST',body:JSON.stringify(payload)});
  assert.equal(created.response.status,201,JSON.stringify(created.body));
  const posted=await request(`/inventory/documents/${created.body.data.id}/post`,{method:'POST'});
  assert.equal(posted.response.status,200,JSON.stringify(posted.body));
  return created.body.data;
}

(async()=>{
  const health=await request('/health'); assert.equal(health.body.version,'2.4.0-D');
  const meta=await request('/inventory/meta'); assert.equal(meta.response.status,200,JSON.stringify(meta.body));
  const warehouse=meta.body.data.warehouses[0]; const unit=meta.body.data.units.find(x=>x.code==='PIECE')||meta.body.data.units[0];
  assert(warehouse&&unit,'Cần kho và đơn vị tính');
  const stamp=Date.now();
  const material=await request('/materials',{method:'POST',body:JSON.stringify({name:`PMI ${stamp}`,base_unit_id:unit.id,standard_cost:100,is_active:true})});
  assert.equal(material.response.status,201,JSON.stringify(material.body));
  const project=await request('/projects',{method:'POST',body:JSON.stringify({project_name:`PMI ${stamp}`,project_type:'Sản xuất',start_date:new Date().toISOString().slice(0,10),priority:'Trung bình'})});
  assert.equal(project.response.status,201,JSON.stringify(project.body));
  const materialId=material.body.data.id; const projectId=project.body.data.id;
  await createAndPost({document_type:'OPENING_BALANCE',warehouse_id:warehouse.id,reason_code:'OPENING_BALANCE',lines:[{material_id:materialId,input_unit_id:unit.id,input_quantity:10,input_unit_cost:100}]});
  const requirement=await request(`/material-planning/projects/${projectId}/requirements`,{method:'POST',body:JSON.stringify({material_id:materialId,planned_quantity:5,estimated_unit_cost:110,status:'APPROVED'})});
  assert.equal(requirement.response.status,201,JSON.stringify(requirement.body)); const requirementId=requirement.body.data.id;
  const reserved=await request(`/material-planning/requirements/${requirementId}/reserve`,{method:'POST',body:JSON.stringify({warehouse_id:warehouse.id,quantity:5})});
  assert.equal(reserved.response.status,201,JSON.stringify(reserved.body)); const reservationId=reserved.body.data.id;
  await createAndPost({document_type:'ISSUE',warehouse_id:warehouse.id,project_id:projectId,lines:[{material_id:materialId,input_unit_id:unit.id,input_quantity:4,requirement_id:requirementId,reservation_id:reservationId}]});
  let planning=await request(`/material-planning/projects/${projectId}`); assert.equal(planning.response.status,200,JSON.stringify(planning.body));
  let row=planning.body.data.requirements[0]; assert.equal(Number(row.net_issued_quantity),4); assert.equal(Number(row.actual_cost),400); assert.equal(row.status,'PARTIALLY_ISSUED');
  await createAndPost({document_type:'RETURN_IN',warehouse_id:warehouse.id,project_id:projectId,lines:[{material_id:materialId,input_unit_id:unit.id,input_quantity:1,input_unit_cost:100,requirement_id:requirementId,reservation_id:reservationId}]});
  planning=await request(`/material-planning/projects/${projectId}`); row=planning.body.data.requirements[0];
  assert.equal(Number(row.net_issued_quantity),3); assert.equal(Number(row.actual_cost),300);
  const context=await request(`/inventory/project-context/${projectId}`); assert.equal(context.response.status,200,JSON.stringify(context.body));
  assert.equal(Number(context.body.data.requirements[0].reservations[0].returnable_quantity),3);
  console.log('Project Material Integration 2.4.0-D smoke test passed');
})().catch(error=>{console.error(error);process.exit(1);});
