const assert = require('node:assert/strict');
const base = process.env.TEST_BASE_URL || 'http://web';
async function api(path, options={}) {
  const response = await fetch(`${base}/api${path}`, {headers:{'Content-Type':'application/json',...(options.headers||{})},...options});
  const body = await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(`${options.method||'GET'} ${path}: ${response.status} ${body.message||''}`);
  return body;
}
(async()=>{
  const types=await api('/settings/catalogs/types');
  assert.ok(types.data.some(x=>x.code==='TASK_TYPE'));
  const suffix=Date.now();
  const created=await api('/settings/catalogs',{method:'POST',body:JSON.stringify({catalog_type:'TASK_TYPE',code:`SMOKE_${suffix}`,name:`Kiểm thử ${suffix}`,sort_order:999})});
  assert.equal(created.data.name,`Kiểm thử ${suffix}`);
  const list=await api('/settings/catalogs?type=TASK_TYPE&include_inactive=true');
  assert.ok(list.data.some(x=>x.id===created.data.id));
  const updated=await api(`/settings/catalogs/${created.data.id}`,{method:'PUT',body:JSON.stringify({...created.data,name:`Kiểm thử cập nhật ${suffix}`,is_active:false})});
  assert.equal(updated.data.is_active,false);
  await api(`/settings/catalogs/${created.data.id}`,{method:'DELETE'});
  console.log('Custom catalogs smoke test passed');
})().catch(error=>{console.error(error);process.exit(1)});
