const assert = require('assert');

const baseUrl = (process.env.TEST_BASE_URL || 'http://localhost:8080').replace(/\/$/,'');
const api = `${baseUrl}/api`;

async function request(path, options = {}) {
  const response = await fetch(`${api}${path}`, {
    ...options,
    headers:{ 'content-type':'application/json', ...(options.headers||{}) },
  });
  const text = await response.text();
  let body={}; try{body=text?JSON.parse(text):{};}catch{body={raw:text};}
  return {response,body};
}

async function createAndPost(type, warehouseId, materialId, unitId, quantity, unitCost = 0, reasonCode = null) {
  const created = await request('/inventory/documents', {method:'POST',body:JSON.stringify({
    document_type:type,document_date:new Date().toISOString().slice(0,10),warehouse_id:warehouseId,reason_code:reasonCode,
    lines:[{material_id:materialId,input_unit_id:unitId,input_quantity:quantity,input_unit_cost:unitCost}],
  })});
  assert.equal(created.response.status,201,JSON.stringify(created.body));
  const posted = await request(`/inventory/documents/${created.body.data.id}/post`,{method:'POST'});
  assert.equal(posted.response.status,200,JSON.stringify(posted.body));
  return created.body.data;
}

async function getBalance(materialId, warehouseId) {
  const result=await request(`/inventory/balances?material_id=${materialId}&warehouse_id=${warehouseId}`);
  assert.equal(result.response.status,200,JSON.stringify(result.body));
  assert.equal(result.body.data.length,1,'Expected one aggregate warehouse balance');
  return result.body.data[0];
}

(async()=>{
  const health=await request('/health');
  assert.equal(health.response.status,200,JSON.stringify(health.body));
  assert.equal(health.body.version,'2.6.0-I');

  const meta=await request('/inventory/meta');
  assert.equal(meta.response.status,200,JSON.stringify(meta.body));
  const warehouse=meta.body.data.warehouses[0];
  const unit=meta.body.data.units.find(item=>item.code==='PIECE')||meta.body.data.units[0];
  assert(warehouse&&unit,'Cần ít nhất một kho và đơn vị');

  const material=await request('/materials',{method:'POST',body:JSON.stringify({
    name:`Smoke inventory ${Date.now()}`,base_unit_id:unit.id,tracking_type:'NONE',is_active:true,
  })});
  assert.equal(material.response.status,201,JSON.stringify(material.body));
  const materialId=material.body.data.id;

  await createAndPost('OPENING_BALANCE',warehouse.id,materialId,unit.id,10,100,'OPENING_BALANCE');
  let balance=await getBalance(materialId,warehouse.id);
  assert.equal(Number(balance.quantity_on_hand),10); assert.equal(Number(balance.average_cost),100);

  await createAndPost('RECEIPT',warehouse.id,materialId,unit.id,10,200,'PURCHASE_RECEIPT');
  balance=await getBalance(materialId,warehouse.id);
  assert.equal(Number(balance.quantity_on_hand),20); assert.equal(Number(balance.average_cost),150);

  await createAndPost('ISSUE',warehouse.id,materialId,unit.id,5,0,'PRODUCTION_ISSUE');
  balance=await getBalance(materialId,warehouse.id);
  assert.equal(Number(balance.quantity_on_hand),15); assert.equal(Number(balance.average_cost),150);

  await createAndPost('RETURN_IN',warehouse.id,materialId,unit.id,2,150,'RETURN_UNUSED');
  await createAndPost('ADJUSTMENT_IN',warehouse.id,materialId,unit.id,3,170,'COUNT_SURPLUS');
  const adjustmentOut=await createAndPost('ADJUSTMENT_OUT',warehouse.id,materialId,unit.id,1,0,'COUNT_SHORTAGE');
  balance=await getBalance(materialId,warehouse.id);
  assert.equal(Number(balance.quantity_on_hand),19);
  assert(Math.abs(Number(balance.average_cost)-153)<0.0001,`Expected average 153, got ${balance.average_cost}`);

  const excessive=await request('/inventory/documents',{method:'POST',body:JSON.stringify({
    document_type:'ISSUE',warehouse_id:warehouse.id,lines:[{material_id:materialId,input_unit_id:unit.id,input_quantity:100}],
  })});
  assert.equal(excessive.response.status,201,JSON.stringify(excessive.body));
  const rejected=await request(`/inventory/documents/${excessive.body.data.id}/post`,{method:'POST'});
  assert.equal(rejected.response.status,409,'Xuất vượt tồn phải bị từ chối');
  const cancelled=await request(`/inventory/documents/${excessive.body.data.id}`,{method:'DELETE'});
  assert.equal(cancelled.response.status,200,JSON.stringify(cancelled.body));

  const reversed=await request(`/inventory/documents/${adjustmentOut.id}/reverse`,{method:'POST',body:JSON.stringify({notes:'Smoke reversal'})});
  assert.equal(reversed.response.status,200,JSON.stringify(reversed.body));
  balance=await getBalance(materialId,warehouse.id);
  assert.equal(Number(balance.quantity_on_hand),20);

  const ledger=await request(`/inventory/transactions?material_id=${materialId}`);
  assert.equal(ledger.response.status,200,JSON.stringify(ledger.body));
  assert(ledger.body.data.length>=7,'Sổ kho phải có đủ giao dịch và phiếu đảo');

  const documents=await request('/inventory/documents');
  assert.equal(documents.response.status,200,JSON.stringify(documents.body));
  const postedDocument=documents.body.data.find(item=>item.status==='POSTED');
  const exported=await fetch(`${api}/inventory/documents/${postedDocument.id}/export.xlsx`);
  assert.equal(exported.status,200); assert((exported.headers.get('content-type')||'').includes('spreadsheetml'));

  console.log('Inventory Transactions smoke test passed on 2.6.0-I');
})().catch(error=>{console.error(error);process.exit(1);});
