const ExcelJS = require('exceljs');
const fs = require('fs');
const base = process.env.TEST_BASE_URL || 'http://web';
async function json(path, options={}) {
  const r = await fetch(base + path, options);
  const text = await r.text();
  if (!r.ok) throw new Error(`${options.method||'GET'} ${path}: ${r.status} ${text}`);
  return text ? JSON.parse(text) : null;
}
(async () => {
  const health = await json('/api/health');
  if (health.status !== 'OK') throw new Error('API health failed');
  const customers = await json('/api/customers');
  if (!customers.success) throw new Error('customers endpoint failed');
  const projects = await json('/api/projects');
  const project = projects.data?.[0];
  if (!project) throw new Error('seed project missing');
  const task = await json('/api/tasks', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({project_id:project.id,task_type:'Sản xuất',task_name:'CI Excel Test'})});
  const taskId = task.data.id;
  const wb = new ExcelJS.Workbook(); const ws=wb.addWorksheet('Dia diem');
  ws.addRow(['location_name','location_address','location_city']); ws.addRow(['Điểm test','123 Test','HCM']);
  const file='/tmp/import.xlsx'; await wb.xlsx.writeFile(file);
  const form=new FormData(); form.append('file', new Blob([fs.readFileSync(file)]), 'import.xlsx');
  const imp=await fetch(`${base}/api/tasks/${taskId}/locations/import-excel`,{method:'POST',body:form});
  if(!imp.ok) throw new Error(`Excel import failed: ${imp.status} ${await imp.text()}`);
  const exp=await fetch(`${base}/api/tasks/${taskId}/locations-export.xlsx`);
  if(!exp.ok || !(exp.headers.get('content-type')||'').includes('spreadsheetml')) throw new Error('Excel export failed');
  console.log('Integration smoke passed');
})().catch(e=>{console.error(e);process.exit(1)});
