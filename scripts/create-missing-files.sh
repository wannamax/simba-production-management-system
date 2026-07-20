#!/bin/bash

echo "Creating missing frontend files..."

# Create utils directory
mkdir -p frontend/src/utils
mkdir -p frontend/src/pages

# Create constants.js
cat > frontend/src/utils/constants.js << 'EOF'
// Project Status
export const PROJECT_STATUS_COLORS = {
  'Mới tạo': 'blue',
  'Đang thiết kế': 'cyan',
  'Đang sản xuất': 'orange',
  'Đang lắp đặt': 'purple',
  'Hoàn thành': 'green',
  'Hủy': 'red'
};

export const SCHEDULE_STATUS_COLORS = {
  'Chưa bắt đầu': 'default',
  'Đang thực hiện': 'processing',
  'Hoàn thành': 'success',
  'Trì hoãn': 'warning',
  'Hủy': 'error'
};

export const PRIORITY_COLORS = {
  'Thấp': 'default',
  'Trung bình': 'blue',
  'Cao': 'orange',
  'Khẩn cấp': 'red'
};

export const PROJECT_TYPES = [
  'Bảng hiệu',
  'Kệ trưng bày',
  'Booth',
  'Standee',
  'Backdrop',
  'Hộp đèn',
  'Khác'
];

export const formatCurrency = (value) => {
  if (!value && value !== 0) return '0 ₫';
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND'
  }).format(value);
};
EOF

# Create placeholder pages
PAGES=("CustomerList" "CustomerDetail" "EmployeeList" "EmployeeDetail" "ScheduleList" "ScheduleCalendar" "ReportDaily" "ReportWeekly" "ReportMonthly" "MaterialList" "Settings")

for PAGE in "${PAGES[@]}"; do
  cat > "frontend/src/pages/${PAGE}.js" << EOF
import React from 'react';
import { Card } from 'antd';

const ${PAGE} = () => {
  return (
    <div>
      <h1>${PAGE}</h1>
      <Card>
        <p>Trang này đang được phát triển...</p>
      </Card>
    </div>
  );
};

export default ${PAGE};
EOF
done

echo "✅ All files created successfully!"