const assert = require('node:assert/strict');
const fs = require('node:fs');
const ExcelJS = require('exceljs');

const baseUrl = (process.env.TEST_BASE_URL || 'http://localhost:8080').replace(/\/$/, '');

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}/api${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function download(path) {
  const response = await fetch(`${baseUrl}/api${path}`);
  return { response, buffer: Buffer.from(await response.arrayBuffer()) };
}

(async () => {
  const stamp = Date.now();
  let projectId;
  let taskId;
  try {
    const health = await request('/health');
    assert.equal(health.body.version, '2.6.0-I');

    const [customers, employees, provinces] = await Promise.all([
      request('/customers?limit=1000'),
      request('/employees?status=Ho%E1%BA%A1t%20%C4%91%E1%BB%99ng&limit=1000'),
      request('/settings/administrative/provinces'),
    ]);
    assert(customers.body.data?.length, 'Cần ít nhất một khách hàng');
    assert(employees.body.data?.length, 'Cần ít nhất một nhân viên');
    assert(provinces.body.data?.length, 'Cần danh mục Tỉnh/Thành phố');

    const project = await request('/projects', {
      method: 'POST',
      body: JSON.stringify({
        project_name: `Delivery Execution Smoke ${stamp}`,
        project_type: 'Bảng hiệu',
        customer_id: customers.body.data[0].id,
        start_date: '2026-07-22',
        end_date: '2026-07-31',
        priority: 'Trung bình',
      }),
    });
    assert.equal(project.response.status, 201, JSON.stringify(project.body));
    projectId = project.body.data.id;

    const context = await request(`/work-catalog/project-context/${projectId}`);
    const workItem = context.body.data.work_items.find(item => item.execution_type === 'DELIVERY')
      || context.body.data.work_items.find(item => item.execution_type === 'INSTALLATION');
    assert(workItem, 'Thiếu công việc có quy trình Giao hàng/Lắp đặt');

    const task = await request('/tasks', {
      method: 'POST',
      body: JSON.stringify({ project_id: projectId, work_item_id: workItem.id, priority: 'Cao' }),
    });
    assert.equal(task.response.status, 201, JSON.stringify(task.body));
    taskId = task.body.data.id;
    assert(['DELIVERY', 'INSTALLATION'].includes(task.body.data.execution_type));

    const province = provinces.body.data[0];
    const communes = await request(`/settings/administrative/communes?province_code=${province.code}`);
    assert(communes.body.data?.length, 'Cần danh mục Phường/Xã');
    const commune = communes.body.data[0];
    const employee = employees.body.data[0];

    const created = await request(`/task-execution/tasks/${taskId}/locations`, {
      method: 'POST',
      body: JSON.stringify({
        location_name: 'Cửa hàng Smoke A',
        location_address: '01 Đường kiểm thử',
        province_code: province.code,
        commune_code: commune.code,
        planned_date: '2026-07-25',
        assigned_employee_id: employee.id,
        status: 'Đã xếp lịch',
      }),
    });
    assert.equal(created.response.status, 201, JSON.stringify(created.body));
    const firstLocationId = created.body.data.id;

    const blockedCompletion = await request(`/tasks/${taskId}/complete`, { method: 'PATCH' });
    assert.equal(blockedCompletion.response.status, 409, JSON.stringify(blockedCompletion.body));

    const template = await download(`/task-execution/tasks/${taskId}/template.xlsx`);
    assert.equal(template.response.status, 200);
    assert(template.buffer.length > 5000, 'File mẫu Excel không hợp lệ');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(template.buffer);
    assert.deepEqual(workbook.worksheets.map(sheet => sheet.name), ['DanhSach', 'TinhThanh', 'PhuongXa', 'NhanVien', 'HuongDan']);
    const sheet = workbook.getWorksheet('DanhSach');
    sheet.getCell('A5').value = 1;
    sheet.getCell('B5').value = 'Cửa hàng Smoke B';
    sheet.getCell('C5').value = '02 Đường import';
    sheet.getCell('D5').value = `${province.unit_type || ''} ${province.name}`.trim();
    sheet.getCell('E5').value = `${commune.unit_type || ''} ${commune.name}`.trim();
    sheet.getCell('F5').value = new Date('2026-07-26T00:00:00');
    sheet.getCell('G5').value = employee.full_name;
    assert.equal(sheet.getCell('K4').value, 'Trạng thái');
    assert.equal(sheet.getCell('L4').value, 'Ngày hoàn thành');
    assert(sheet.getCell('K5').dataValidation.formulae[0].includes('Hoàn thành'));
    assert.equal(sheet.getCell('L5').numFmt, 'dd/mm/yyyy');
    sheet.getCell('K5').value = 'Hoàn thành';
    sheet.getCell('N5').value = province.code;
    sheet.getCell('O5').value = commune.code;
    sheet.getCell('P5').value = employee.employee_code;
    const importBuffer = await workbook.xlsx.writeBuffer();
    const formData = new FormData();
    formData.append('file', new Blob([importBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'delivery-import.xlsx');
    const previewResponse = await fetch(`${baseUrl}/api/task-execution/tasks/${taskId}/import-preview`, { method: 'POST', body: formData });
    const preview = await previewResponse.json();
    assert.equal(previewResponse.status, 200, JSON.stringify(preview));
    assert.equal(preview.data.error_rows, 0, JSON.stringify(preview));
    assert.equal(preview.data.valid_rows, 1);

    const applied = await request(`/task-execution/imports/${preview.data.id}/apply`, { method: 'POST' });
    assert.equal(applied.response.status, 200, JSON.stringify(applied.body));
    const imported = applied.body.data.locations.find(item => item.location_name === 'Cửa hàng Smoke B');
    assert(imported?.is_completed, 'Dòng Hoàn thành từ Excel phải được ghi nhận');
    assert(imported.actual_completion_date, 'Ngày hoàn thành phải tự động ghi nhận');

    const completedLocation = await request(`/task-execution/tasks/${taskId}/locations/${firstLocationId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'Hoàn thành', completion_note: 'Smoke test' }),
    });
    assert.equal(completedLocation.response.status, 200, JSON.stringify(completedLocation.body));
    assert.equal(completedLocation.body.summary.ready_for_task_completion, true);

    const approvedTask = await request(`/tasks/${taskId}/complete`, { method: 'PATCH' });
    assert.equal(approvedTask.response.status, 200, JSON.stringify(approvedTask.body));

    const exported = await download(`/task-execution/tasks/${taskId}/export.xlsx`);
    assert.equal(exported.response.status, 200);
    if (process.env.TEST_OUTPUT_FILE) fs.writeFileSync(process.env.TEST_OUTPUT_FILE, exported.buffer);
    const exportedWorkbook = new ExcelJS.Workbook();
    await exportedWorkbook.xlsx.load(exported.buffer);
    const exportedSheet = exportedWorkbook.getWorksheet('DanhSach');
    assert.equal(exportedSheet.getCell('B5').value, 'Cửa hàng Smoke A');
    assert.equal(exportedSheet.getCell('B6').value, 'Cửa hàng Smoke B');
    assert.equal(exportedSheet.getCell('B5').fill.fgColor.argb, 'FFFFFFFF');
    assert.equal(exportedSheet.getCell('B6').fill.fgColor.argb, 'FFF3F6F9');
    assert.equal(exportedSheet.getCell('F5').value.toISOString().slice(0, 10), '2026-07-25');
    assert.equal(exportedSheet.getCell('F6').value.toISOString().slice(0, 10), '2026-07-26');
    for (const edge of ['top', 'left', 'bottom', 'right']) {
      assert.equal(exportedSheet.getCell('B5').border[edge].style, 'thin');
      assert.equal(exportedSheet.getCell('B6').border[edge].style, 'thin');
    }

    const projectExecution = await request(`/task-execution/projects/${projectId}`);
    assert.equal(projectExecution.response.status, 200);
    assert.equal(projectExecution.body.data[0].ready_for_task_completion, true);
    console.log('Delivery & Installation Execution 2.6.0-I smoke test passed');
  } finally {
    if (taskId) await request(`/tasks/${taskId}`, { method: 'DELETE' }).catch(() => {});
    if (projectId) await request(`/projects/${projectId}`, { method: 'DELETE' }).catch(() => {});
  }
})().catch(error => { console.error(error); process.exit(1); });
