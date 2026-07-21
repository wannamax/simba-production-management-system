const assert=require('node:assert/strict');
const base=process.env.TEST_BASE_URL||'http://web';
async function request(path,options={}){const r=await fetch(`${base}/api${path}`,{headers:{'content-type':'application/json',...(options.headers||{})},...options});const body=await r.json().catch(()=>({}));if(!r.ok)throw new Error(`${r.status} ${path}: ${body.message||JSON.stringify(body)}`);return body;}
(async()=>{
 const provinces=await request('/settings/administrative/provinces'); assert.equal(provinces.success,true); assert.ok(provinces.data.length>=34);
 const marker=`SIMBA UAT ${Date.now()}`; await request('/settings/company',{method:'PUT',body:JSON.stringify({company_name:marker,province_code:'79',timezone:'Asia/Ho_Chi_Minh',date_format:'DD/MM/YYYY'})});
 const company=await request('/settings/company'); assert.equal(company.data.company_name,marker); assert.equal(company.data.province_code,'79');
 const meta=await request('/settings/administrative/meta'); assert.ok(meta.data.province_count>=34);
 console.log('Company profile and administrative divisions smoke test passed');
})().catch(e=>{console.error(e);process.exit(1)});
