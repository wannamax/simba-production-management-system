const pool = require('../config/database');

/**
 * Generate unique code for entities
 */
class CodeGenerator {
  /**
   * Generate Project Code: PRJ-YYYY####
   */
  static async generateProjectCode() {
    const year = new Date().getFullYear();
    const prefix = `PRJ-${year}`;
    
    const result = await pool.query(
      "SELECT COUNT(*) as count FROM projects WHERE project_code LIKE $1",
      [`${prefix}%`]
    );
    
    const count = parseInt(result.rows[0].count) + 1;
    return `${prefix}${String(count).padStart(4, '0')}`;
  }

  /**
   * Generate Customer Code: KH#####
   */
  static async generateCustomerCode() {
    const result = await pool.query("SELECT COUNT(*) as count FROM customers");
    const count = parseInt(result.rows[0].count) + 1;
    return `KH${String(count).padStart(5, '0')}`;
  }

  /**
   * Generate Employee Code: NV#####
   */
  static async generateEmployeeCode() {
    const result = await pool.query("SELECT COUNT(*) as count FROM employees");
    const count = parseInt(result.rows[0].count) + 1;
    return `NV${String(count).padStart(5, '0')}`;
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
  static async generateTaskCode(taskType) {
    const year = new Date().getFullYear();
    
    // Map task type to prefix
    const typeMap = {
      'Sản xuất': 'PRD',
      'Giao hàng': 'DLV',
      'Lắp đặt': 'INS'
    };
    
    const typePrefix = typeMap[taskType] || 'TSK';
    const prefix = `${typePrefix}-${year}`;
    
    const result = await pool.query(
      "SELECT COUNT(*) as count FROM tasks WHERE task_code LIKE $1",
      [`${prefix}%`]
    );
    
    const count = parseInt(result.rows[0].count) + 1;
    return `${prefix}${String(count).padStart(4, '0')}`;
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