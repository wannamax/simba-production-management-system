
/**
 * Validate location CSV data
 */
class CSVValidator {
  /**
   * Validate single location row
   */
  static validateLocationRow(row, rowIndex) {
    const errors = [];

    // Required fields
    if (!row.location_name || row.location_name.trim() === '') {
      errors.push({
        row: rowIndex,
        field: 'location_name',
        message: 'Tên địa điểm không được trống'
      });
    }

    if (!row.location_address || row.location_address.trim() === '') {
      errors.push({
        row: rowIndex,
        field: 'location_address',
        message: 'Địa chỉ không được trống'
      });
    }

    // Validate phone format (optional)
    if (row.contact_phone && row.contact_phone.trim() !== '') {
      const phoneRegex = /^[0-9]{10,11}$/;
      if (!phoneRegex.test(row.contact_phone.replace(/[\s-]/g, ''))) {
        errors.push({
          row: rowIndex,
          field: 'contact_phone',
          message: 'Số điện thoại không hợp lệ (phải là 10-11 số)'
        });
      }
    }

    // Validate email format (optional)
    if (row.contact_email && row.contact_email.trim() !== '') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(row.contact_email)) {
        errors.push({
          row: rowIndex,
          field: 'contact_email',
          message: 'Email không hợp lệ'
        });
      }
    }

    // Validate date format (optional)
    if (row.installation_date && row.installation_date.trim() !== '') {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(row.installation_date)) {
        errors.push({
          row: rowIndex,
          field: 'installation_date',
          message: 'Ngày không hợp lệ (phải theo format YYYY-MM-DD, VD: 2024-02-01)'
        });
      } else {
        // Check if date is valid
        const date = new Date(row.installation_date);
        if (isNaN(date.getTime())) {
          errors.push({
            row: rowIndex,
            field: 'installation_date',
            message: 'Ngày không tồn tại'
          });
        }
      }
    }

    // Validate time format (optional)
    if (row.installation_time_start && row.installation_time_start.trim() !== '') {
      const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(row.installation_time_start)) {
        errors.push({
          row: rowIndex,
          field: 'installation_time_start',
          message: 'Giờ bắt đầu không hợp lệ (phải theo format HH:mm, VD: 08:00)'
        });
      }
    }

    if (row.installation_time_end && row.installation_time_end.trim() !== '') {
      const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(row.installation_time_end)) {
        errors.push({
          row: rowIndex,
          field: 'installation_time_end',
          message: 'Giờ kết thúc không hợp lệ (phải theo format HH:mm, VD: 17:00)'
        });
      }
    }

    // Validate estimated_hours (optional)
    if (row.estimated_hours && row.estimated_hours.trim() !== '') {
      const hours = parseFloat(row.estimated_hours);
      if (isNaN(hours) || hours < 0 || hours > 24) {
        errors.push({
          row: rowIndex,
          field: 'estimated_hours',
          message: 'Số giờ dự kiến không hợp lệ (phải là số từ 0-24)'
        });
      }
    }

    return errors;
  }

  /**
   * Validate entire CSV data
   */
  static validateLocations(rows) {
    const allErrors = [];
    const validRows = [];

    rows.forEach((row, index) => {
      const rowErrors = this.validateLocationRow(row, index + 2); // +2 because Excel starts at 1 and has header
      
      if (rowErrors.length > 0) {
        allErrors.push(...rowErrors);
      } else {
        validRows.push(row);
      }
    });

    return {
      isValid: allErrors.length === 0,
      errors: allErrors,
      validRows,
      totalRows: rows.length,
      validRowsCount: validRows.length,
      errorRowsCount: allErrors.length
    };
  }

  /**
   * Generate error report
   */
  static generateErrorReport(errors) {
    if (errors.length === 0) return '';

    let report = 'CÁC LỖI TRONG FILE CSV:\n\n';
    
    errors.forEach((error, index) => {
      report += `${index + 1}. Dòng ${error.row}, Cột "${error.field}": ${error.message}\n`;
    });

    return report;
  }
}

module.exports = CSVValidator;