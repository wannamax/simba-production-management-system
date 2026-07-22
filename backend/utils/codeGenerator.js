const pool = require('../config/database');

/**
 * Generate unique code for entities
 */
class CodeGenerator {
  /**
   * Generate Project Code: PRJ-YYYY####
   */
  static async generateProjectCode(db = pool) {
    const year = new Date().getFullYear();
    const prefix = `PRJ-${year}`;
    
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`projects.project_code.${prefix}`]);
    const result = await db.query(
      `SELECT COALESCE(MAX(CASE
         WHEN substring(project_code FROM char_length($1) + 1) ~ '^[0-9]+$'
         THEN substring(project_code FROM char_length($1) + 1)::integer END),0) + 1 next_number
       FROM projects WHERE project_code LIKE $2`,
      [prefix,`${prefix}%`]
    );
    return `${prefix}${String(result.rows[0].next_number).padStart(4, '0')}`;
  }

  /**
   * Generate Customer Code: KH#####
   */
  static async generateCustomerCode(db = pool) {
    await db.query("SELECT pg_advisory_xact_lock(hashtext('customers.customer_code'))");
    const result = await db.query(
      "SELECT COALESCE(MAX(SUBSTRING(customer_code FROM 3)::integer), 0) + 1 AS next_number FROM customers WHERE customer_code ~ '^KH[0-9]+$'"
    );
    return `KH${String(result.rows[0].next_number).padStart(5, '0')}`;
  }

  /**
   * Generate Employee Code: NV#####
   */
  static async generateEmployeeCode(db = pool) {
    await db.query("SELECT pg_advisory_xact_lock(hashtext('employees.employee_code'))");
    const result = await db.query(
      "SELECT COALESCE(MAX(SUBSTRING(employee_code FROM 3)::integer), 0) + 1 AS next_number FROM employees WHERE employee_code ~ '^NV[0-9]+$'"
    );
    return `NV${String(result.rows[0].next_number).padStart(5, '0')}`;
  }

  /**
   * Generate Material Code: VT#####
   */
  static async generateMaterialCode() {
    const result = await pool.query("SELECT COUNT(*) as count FROM materials");
    const count = parseInt(result.rows[0].count) + 1;
    return `VT${String(count).padStart(5, '0')}`;
  }

  /**
   * Generate Task Code: TASK-TYPE-YYYY####
   * @param {string} taskType - 'Sản xuất', 'Giao hàng', 'Lắp đặt'
   */
  static async generateTaskCode(taskType, db = pool) {
    const year = new Date().getFullYear();
    
    // Map task type to prefix
    const typeMap = {
      'Sản xuất': 'PRD',
      'Giao hàng': 'DLV',
      'Lắp đặt': 'INS',
      'Văn phòng': 'OFF',
      'Thi công': 'CON'
    };
    
    const typePrefix = typeMap[taskType] || 'TSK';
    const prefix = `${typePrefix}-${year}`;
    
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`tasks.task_code.${prefix}`]);
    const result = await db.query(
      `SELECT COALESCE(MAX(CASE
         WHEN substring(task_code FROM char_length($1) + 1) ~ '^[0-9]+$'
         THEN substring(task_code FROM char_length($1) + 1)::integer END),0) + 1 next_number
       FROM tasks WHERE task_code LIKE $2`,
      [prefix,`${prefix}%`]
    );
    return `${prefix}${String(result.rows[0].next_number).padStart(4, '0')}`;
  }

  /**
   * Generate Schedule Code: SCH-YYYYMMDD-###
   */
  static async generateScheduleCode() {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `SCH-${dateStr}`;
    
    const result = await pool.query(
      "SELECT COUNT(*) as count FROM schedules WHERE schedule_code LIKE $1",
      [`${prefix}%`]
    );
    
    const count = parseInt(result.rows[0].count) + 1;
    return `${prefix}-${String(count).padStart(3, '0')}`;
  }

  /**
   * Generate Report Code: RPT-YYYYMMDD-###
   */
  static async generateReportCode() {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `RPT-${dateStr}`;
    
    const result = await pool.query(
      "SELECT COUNT(*) as count FROM work_reports WHERE report_code LIKE $1",
      [`${prefix}%`]
    );
    
    const count = parseInt(result.rows[0].count) + 1;
    return `${prefix}-${String(count).padStart(3, '0')}`;
  }
}

module.exports = CodeGenerator;
