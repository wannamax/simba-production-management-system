// JavaScript Documentimport Papa from 'papaparse';

/**
 * Parse CSV file
 */
export const parseCSV = (file) => {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
      complete: (results) => {
        if (results.errors.length > 0) {
          reject(new Error('File CSV có lỗi: ' + results.errors[0].message));
        } else {
          resolve(results.data);
        }
      },
      error: (error) => {
        reject(error);
      }
    });
  });
};

/**
 * Generate CSV template
 */
export const generateCSVTemplate = () => {
  const headers = [
    'location_name',
    'location_address',
    'location_city',
    'location_district',
    'location_ward',
    'contact_person',
    'contact_phone',
    'contact_email',
    'installation_date',
    'installation_time_start',
    'installation_time_end',
    'estimated_hours',
    'product_info',
    'work_description',
    'notes'
  ];

  const sampleData = [
    {
      location_name: 'Chi nhánh Quận 1',
      location_address: '123 Nguyễn Huệ',
      location_city: 'TP.HCM',
      location_district: 'Quận 1',
      location_ward: 'Phường Bến Nghé',
      contact_person: 'Nguyễn Văn A',
      contact_phone: '0901234567',
      contact_email: 'nguyenvana@email.com',
      installation_date: '2024-01-15',
      installation_time_start: '08:00',
      installation_time_end: '12:00',
      estimated_hours: '4',
      product_info: 'Bảng hiệu LED 3x2m',
      work_description: 'Lắp đặt bảng hiệu tại tầng 1',
      notes: 'Cần thang nâng'
    },
    {
      location_name: 'Chi nhánh Quận 3',
      location_address: '456 Lê Văn Sỹ',
      location_city: 'TP.HCM',
      location_district: 'Quận 3',
      location_ward: 'Phường 1',
      contact_person: 'Trần Thị B',
      contact_phone: '0912345678',
      contact_email: 'tranthib@email.com',
      installation_date: '2024-01-16',
      installation_time_start: '13:00',
      installation_time_end: '17:00',
      estimated_hours: '4',
      product_info: 'Kệ trưng bày 2m',
      work_description: 'Lắp đặt kệ tại showroom',
      notes: ''
    }
  ];

  const csv = Papa.unparse({
    fields: headers,
    data: sampleData
  });

  return csv;
};

/**
 * Download CSV file
 */
export const downloadCSV = (csvContent, filename) => {
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * Validate location data
 */
export const validateLocationData = (data) => {
  const errors = [];
  const requiredFields = ['location_name', 'location_address'];

  data.forEach((row, index) => {
    const rowErrors = [];

    // Check required fields
    requiredFields.forEach(field => {
      if (!row[field] || row[field].trim() === '') {
        rowErrors.push(`Thiếu ${field}`);
      }
    });

    // Validate phone number
    if (row.contact_phone && !/^[0-9]{10,11}$/.test(row.contact_phone.replace(/\s/g, ''))) {
      rowErrors.push('Số điện thoại không hợp lệ');
    }

    // Validate email
    if (row.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.contact_email)) {
      rowErrors.push('Email không hợp lệ');
    }

    // Validate date
    if (row.installation_date && !/^\d{4}-\d{2}-\d{2}$/.test(row.installation_date)) {
      rowErrors.push('Định dạng ngày không hợp lệ (YYYY-MM-DD)');
    }

    // Validate time
    if (row.installation_time_start && !/^\d{2}:\d{2}$/.test(row.installation_time_start)) {
      rowErrors.push('Định dạng giờ bắt đầu không hợp lệ (HH:mm)');
    }

    if (row.installation_time_end && !/^\d{2}:\d{2}$/.test(row.installation_time_end)) {
      rowErrors.push('Định dạng giờ kết thúc không hợp lệ (HH:mm)');
    }

    if (rowErrors.length > 0) {
      errors.push({
        row: index + 2, // +2 because index starts at 0 and header is row 1
        data: row,
        errors: rowErrors
      });
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    validCount: data.length - errors.length
  };
};