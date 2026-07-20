const ExcelJS = require('exceljs');
const fs = require('fs');
const base = process.env.TEST_BASE_URL || 'http://web';

async function request(path, options = {}) {
  const response = await fetch(base + path, options);
  const text = await response.text();
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path}: ${response.status} ${text}`);
  return { response, data: text ? JSON.parse(text) : null };
}

async function json(path, options = {}) { return (await request(path, options)).data; }

async function createImportFile() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Khach_hang');
  sheet.addRow(['Tên công ty', 'Người liên hệ', 'Điện thoại', 'Email', 'Địa chỉ', 'Mã số thuế']);
  sheet.addRow([`CI IMPORT ${Date.now()}`, 'CI User', '0900000000', 'ci@example.com', 'CI address', '']);
  const file = '/tmp/customers-import.xlsx';
  await workbook.xlsx.writeFile(file);
  return file;
}

(async () => {
  const health = await json('/api/health');
  if (health.status !== 'OK') throw new Error('API health failed');

  const before = await json('/api/customers');
  if (!before.success) throw new Error('customers endpoint failed');

  const template = await fetch(`${base}/api/data-transfer/customers/template`);
  if (!template.ok || !(template.headers.get('content-type') || '').includes('spreadsheetml')) {
    throw new Error('Customer template download failed');
  }

  const file = await createImportFile();
  const dryForm = new FormData();
  dryForm.append('file', new Blob([fs.readFileSync(file)]), 'customers-import.xlsx');
  const dry = await json('/api/data-transfer/customers/import?dry_run=true', { method: 'POST', body: dryForm });
  if (!dry.success || dry.total !== 1 || !dry.dryRun) throw new Error('Import preview failed');

  const importForm = new FormData();
  importForm.append('file', new Blob([fs.readFileSync(file)]), 'customers-import.xlsx');
  const imported = await json('/api/data-transfer/customers/import?dry_run=false', { method: 'POST', body: importForm });
  if (!imported.success || imported.imported !== 1) throw new Error('Customer import failed');

  const after = await json('/api/customers');
  if (after.data.length !== before.data.length + 1) throw new Error('Imported customer not persisted');

  const exported = await fetch(`${base}/api/data-transfer/customers/export`);
  if (!exported.ok || !(exported.headers.get('content-type') || '').includes('spreadsheetml')) {
    throw new Error('Customer export failed');
  }
  const exportBuffer = Buffer.from(await exported.arrayBuffer());
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(exportBuffer);
  if (workbook.worksheets[0].rowCount < 2) throw new Error('Export workbook has no data');

  console.log('Integration smoke passed: health, preview, import, persistence and export');
})().catch((error) => { console.error(error); process.exit(1); });
