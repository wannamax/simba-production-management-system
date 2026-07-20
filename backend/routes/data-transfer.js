const express = require('express');
const multer = require('multer');
const ExcelJS = require('exceljs');
const pool = require('../config/database');
const CodeGenerator = require('../utils/codeGenerator');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /\.(xlsx)$/i.test(file.originalname)),
});

const DEFINITIONS = {
  customers: {
    sheet: 'Khach_hang',
    columns: [
      ['company_name', 'Tên công ty', true], ['contact_person', 'Người liên hệ'],
      ['phone', 'Điện thoại'], ['email', 'Email'], ['address', 'Địa chỉ'], ['tax_code', 'Mã số thuế']
    ],
    async exportRows() {
      return (await pool.query(`SELECT company_name, contact_person, phone, email, address, tax_code
        FROM customers ORDER BY company_name`)).rows;
    },
    async importRow(client, row) {
      const count = await client.query('SELECT COUNT(*)::int AS count FROM customers');
      const code = `KH${String(count.rows[0].count + 1).padStart(5, '0')}`;
      await client.query(`INSERT INTO customers
        (customer_code, company_name, contact_person, phone, email, address, tax_code)
        VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [code, row.company_name, row.contact_person, row.phone, row.email, row.address, row.tax_code]);
    }
  },
  employees: {
    sheet: 'Nhan_vien',
    columns: [
      ['full_name', 'Họ tên', true], ['phone', 'Điện thoại'], ['email', 'Email'],
      ['position', 'Vị trí', true], ['department', 'Phòng ban', true], ['salary', 'Lương'],
      ['hire_date', 'Ngày vào làm'], ['status', 'Trạng thái'], ['address', 'Địa chỉ'],
      ['id_number', 'CCCD'], ['notes', 'Ghi chú']
    ],
    async exportRows() {
      return (await pool.query(`SELECT full_name, phone, email, position, department, salary,
        hire_date, status, address, id_number, notes FROM employees ORDER BY full_name`)).rows;
    },
    async importRow(client, row) {
      const code = await CodeGenerator.generateEmployeeCode(client);
      await client.query(`INSERT INTO employees
        (employee_code, full_name, phone, email, position, department, salary, hire_date, status, address, id_number, notes)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [code, row.full_name, row.phone, row.email, row.position, row.department,
        nullableNumber(row.salary), nullableDate(row.hire_date), row.status || 'Hoạt động', row.address, row.id_number, row.notes]);
    }
  },
  projects: {
    sheet: 'Du_an',
    columns: [
      ['project_name', 'Tên dự án', true], ['project_type', 'Loại dự án'],
      ['customer_code', 'Mã khách hàng'], ['start_date', 'Ngày bắt đầu'], ['end_date', 'Ngày kết thúc'],
      ['status', 'Trạng thái'], ['priority', 'Ưu tiên'], ['budget', 'Ngân sách'], ['description', 'Mô tả']
    ],
    async exportRows() {
      return (await pool.query(`SELECT p.project_name, p.project_type, c.customer_code, p.start_date,
        p.end_date, p.status, p.priority, p.budget, p.description FROM projects p
        LEFT JOIN customers c ON c.id=p.customer_id WHERE p.deleted_at IS NULL ORDER BY p.created_at DESC`)).rows;
    },
    async importRow(client, row) {
      let customerId = null;
      if (row.customer_code) {
        const customer = await client.query('SELECT id FROM customers WHERE customer_code=$1', [row.customer_code]);
        if (!customer.rowCount) throw new Error(`Không tìm thấy khách hàng ${row.customer_code}`);
        customerId = customer.rows[0].id;
      }
      const count = await client.query("SELECT COUNT(*)::int AS count FROM projects WHERE project_code LIKE $1", [`PRJ-${new Date().getFullYear()}%`]);
      const code = `PRJ-${new Date().getFullYear()}${String(count.rows[0].count + 1).padStart(4, '0')}`;
      await client.query(`INSERT INTO projects
        (project_code, project_name, project_type, customer_id, start_date, end_date, status, priority, budget, description)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [code, row.project_name, row.project_type, customerId, nullableDate(row.start_date), nullableDate(row.end_date),
        row.status || 'Mới tạo', row.priority || 'Trung bình', nullableNumber(row.budget), row.description]);
    }
  },
  tasks: {
    sheet: 'Cong_viec',
    columns: [
      ['project_code', 'Mã dự án', true], ['task_type', 'Loại công việc', true],
      ['task_name', 'Tên công việc', true], ['description', 'Mô tả'], ['start_date', 'Ngày bắt đầu'],
      ['end_date', 'Ngày kết thúc'], ['estimated_hours', 'Giờ dự kiến'], ['priority', 'Ưu tiên'], ['notes', 'Ghi chú']
    ],
    async exportRows() {
      return (await pool.query(`SELECT p.project_code, t.task_type, t.task_name, t.description,
        t.start_date, t.end_date, t.estimated_hours, t.priority, t.notes FROM tasks t
        JOIN projects p ON p.id=t.project_id WHERE t.deleted_at IS NULL AND p.deleted_at IS NULL
        ORDER BY t.created_at DESC`)).rows;
    },
    async importRow(client, row) {
      const project = await client.query('SELECT id FROM projects WHERE project_code=$1 AND deleted_at IS NULL', [row.project_code]);
      if (!project.rowCount) throw new Error(`Không tìm thấy dự án ${row.project_code}`);
      const code = await CodeGenerator.generateTaskCode(row.task_type, client);
      await client.query(`INSERT INTO tasks
        (task_code, project_id, task_type, task_name, description, start_date, end_date, estimated_hours, priority, notes, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [code, project.rows[0].id, row.task_type, row.task_name, row.description,
        nullableDate(row.start_date), nullableDate(row.end_date), nullableNumber(row.estimated_hours),
        row.priority || 'Trung bình', row.notes, 1]);
    }
  }
};

function nullableNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Giá trị số không hợp lệ: ${value}`);
  return number;
}

function nullableDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Ngày không hợp lệ: ${value}`);
  return date.toISOString().slice(0, 10);
}

function normalizeCell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && value.text) return value.text;
  if (typeof value === 'object' && value.result !== undefined) return value.result;
  return value;
}

function validateEntity(entity) {
  const definition = DEFINITIONS[entity];
  if (!definition) {
    const error = new Error('Loại dữ liệu không được hỗ trợ');
    error.status = 400;
    throw error;
  }
  return definition;
}

function configureSheet(sheet, definition) {
  sheet.columns = definition.columns.map(([key, header]) => ({ key, header, width: Math.max(16, header.length + 4) }));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: 'A1', to: `${sheet.getColumn(definition.columns.length).letter}1` };
}

router.get('/:entity/template', async (req, res, next) => {
  try {
    const definition = validateEntity(req.params.entity);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(definition.sheet);
    configureSheet(sheet, definition);
    const sample = {};
    definition.columns.forEach(([key, header, required]) => { sample[key] = required ? `[Bắt buộc] ${header}` : ''; });
    sheet.addRow(sample);
    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="simba-${req.params.entity}-template.xlsx"`);
    res.send(Buffer.from(buffer));
  } catch (error) { next(error); }
});

router.get('/:entity/export', async (req, res, next) => {
  try {
    const definition = validateEntity(req.params.entity);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Simba PMS';
    workbook.created = new Date();
    const sheet = workbook.addWorksheet(definition.sheet);
    configureSheet(sheet, definition);
    const rows = await definition.exportRows(req.query);
    rows.forEach((row) => sheet.addRow(row));
    const buffer = await workbook.xlsx.writeBuffer();
    const stamp = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="simba-${req.params.entity}-${stamp}.xlsx"`);
    res.send(Buffer.from(buffer));
  } catch (error) { next(error); }
});

router.post('/:entity/import', upload.single('file'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const definition = validateEntity(req.params.entity);
    if (!req.file) return res.status(400).json({ success: false, message: 'Vui lòng chọn file Excel' });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet || sheet.rowCount < 2) return res.status(400).json({ success: false, message: 'File không có dữ liệu' });

    const headerMap = new Map();
    sheet.getRow(1).eachCell((cell, columnNumber) => headerMap.set(String(normalizeCell(cell.value)).trim(), columnNumber));
    const missingHeaders = definition.columns.filter(([, header]) => !headerMap.has(header)).map(([, header]) => header);
    if (missingHeaders.length) return res.status(400).json({ success: false, message: `Thiếu cột: ${missingHeaders.join(', ')}` });

    const parsed = [];
    const errors = [];
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const excelRow = sheet.getRow(rowNumber);
      const row = {};
      let hasValue = false;
      for (const [key, header, required] of definition.columns) {
        const value = normalizeCell(excelRow.getCell(headerMap.get(header)).value);
        row[key] = typeof value === 'string' ? value.trim() : value;
        if (row[key] !== '') hasValue = true;
        if (required && (row[key] === '' || row[key] === null || row[key] === undefined)) {
          errors.push({ row: rowNumber, field: header, message: 'Không được để trống' });
        }
      }
      if (hasValue) parsed.push({ rowNumber, data: row });
    }
    if (!parsed.length) return res.status(400).json({ success: false, message: 'File không có dòng dữ liệu hợp lệ' });
    if (errors.length) return res.status(422).json({ success: false, message: 'Dữ liệu chưa hợp lệ', errors });

    if (req.query.dry_run === 'true') {
      return res.json({ success: true, dryRun: true, total: parsed.length, preview: parsed.slice(0, 20) });
    }

    await client.query('BEGIN');
    for (const item of parsed) {
      try {
        await definition.importRow(client, item.data);
      } catch (error) {
        error.message = `Dòng ${item.rowNumber}: ${error.message}`;
        throw error;
      }
    }
    await client.query('COMMIT');
    res.status(201).json({ success: true, imported: parsed.length, message: `Đã nhập ${parsed.length} dòng` });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    next(error);
  } finally { client.release(); }
});

module.exports = router;
