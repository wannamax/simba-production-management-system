
// Project Status
export const PROJECT_STATUS = {
  NEW: 'Mới tạo',
  DESIGNING: 'Đang thiết kế',
  PRODUCING: 'Đang sản xuất',
  INSTALLING: 'Đang lắp đặt',
  COMPLETED: 'Hoàn thành',
  CANCELLED: 'Hủy'
};

export const PROJECT_STATUS_COLORS = {
  'Mới tạo': 'blue',
  'Đang thiết kế': 'cyan',
  'Đang sản xuất': 'orange',
  'Đang lắp đặt': 'purple',
  'Hoàn thành': 'green',
  'Hủy': 'red'
};

// Schedule Status
export const SCHEDULE_STATUS = {
  NOT_STARTED: 'Chưa bắt đầu',
  IN_PROGRESS: 'Đang thực hiện',
  COMPLETED: 'Hoàn thành',
  DELAYED: 'Trì hoãn',
  CANCELLED: 'Hủy'
};

export const SCHEDULE_STATUS_COLORS = {
  'Chưa bắt đầu': 'default',
  'Đang thực hiện': 'processing',
  'Hoàn thành': 'success',
  'Trì hoãn': 'warning',
  'Hủy': 'error'
};

// Schedule Types
export const SCHEDULE_TYPES = {
  SURVEY: 'Khảo sát',
  DESIGN: 'Thiết kế',
  PRODUCTION: 'Sản xuất',
  INSTALLATION: 'Lắp đặt',
  MAINTENANCE: 'Bảo trì',
  MEETING: 'Họp'
};

export const SCHEDULE_TYPE_COLORS = {
  'Khảo sát': '#1890ff',
  'Thiết kế': '#722ed1',
  'Sản xuất': '#fa8c16',
  'Lắp đặt': '#52c41a',
  'Bảo trì': '#13c2c2',
  'Họp': '#eb2f96'
};

// Priority Levels
export const PRIORITY = {
  LOW: 'Thấp',
  MEDIUM: 'Trung bình',
  HIGH: 'Cao',
  URGENT: 'Khẩn cấp'
};

export const PRIORITY_COLORS = {
  'Thấp': 'default',
  'Trung bình': 'blue',
  'Cao': 'orange',
  'Khẩn cấp': 'red'
};

// Departments
export const DEPARTMENTS = [
  'Sản xuất',
  'Lắp đặt',
  'Thiết kế',
  'Hành chính',
  'Kế toán'
];

// Positions
export const POSITIONS = [
  'Quản lý',
  'Trưởng phòng',
  'Trưởng nhóm',
  'Thợ sản xuất',
  'Thợ lắp đặt',
  'Thiết kế',
  'Kế toán',
  'Thợ phụ'
];

// Project Types
export const PROJECT_TYPES = [
  'Bảng hiệu',
  'Kệ trưng bày',
  'Booth',
  'Standee',
  'Backdrop',
  'Hộp đèn',
  'Khác'
];

// Material Categories
export const MATERIAL_CATEGORIES = [
  'Alu',
  'Mica',
  'Inox',
  'Gỗ',
  'Nhựa',
  'Sơn',
  'Điện',
  'Phụ kiện',
  'Khác'
];

// Payment Status
export const PAYMENT_STATUS = {
  UNPAID: 'Chưa thanh toán',
  DEPOSIT: 'Đã đặt cọc',
  PAID: 'Đã thanh toán'
};

export const PAYMENT_STATUS_COLORS = {
  'Chưa thanh toán': 'default',
  'Đã đặt cọc': 'processing',
  'Đã thanh toán': 'success'
};

// Report Types
export const REPORT_TYPES = ['Ngày', 'Tuần', 'Tháng'];

// Date Format
export const DATE_FORMAT = 'DD/MM/YYYY';
export const DATETIME_FORMAT = 'DD/MM/YYYY HH:mm';
export const TIME_FORMAT = 'HH:mm';

// Currency Format
export const formatCurrency = (value) => {
  if (!value && value !== 0) return '0 ₫';
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND'
  }).format(value);
};

// Number Format
export const formatNumber = (value) => {
  if (!value && value !== 0) return '0';
  return new Intl.NumberFormat('vi-VN').format(value);
};

// Percentage Format
export const formatPercent = (value) => {
  if (!value && value !== 0) return '0%';
  return `${Math.round(value)}%`;
};