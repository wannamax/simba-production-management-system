import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

// Create axios instance
const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // Add auth token if exists
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response) {
      // Server responded with error
      const message = error.response.data.message || 'Đã xảy ra lỗi';
      console.error('API Error:', message);
      return Promise.reject(new Error(message));
    } else if (error.request) {
      // Request made but no response
      console.error('Network Error:', error.request);
      return Promise.reject(new Error('Không thể kết nối đến máy chủ'));
    } else {
      // Something else happened
      console.error('Error:', error.message);
      return Promise.reject(error);
    }
  }
);

// ==================== PROJECTS ====================
export const projectAPI = {
  getAll: (params) => api.get('/projects', { params }),
  getById: (id) => api.get(`/projects/${id}`),
  create: (data) => api.post('/projects', data),
  update: (id, data) => api.put(`/projects/${id}`, data),
  updateStatus: (id, status) => api.patch(`/projects/${id}/status`, { status }),
  delete: (id) => api.delete(`/projects/${id}`),
  addProduct: (id, data) => api.post(`/projects/${id}/products`, data),
  getStatistics: (id) => api.get(`/projects/${id}/statistics`),
  
  // Employee assignments
  addAssignment: (projectId, data) => api.post(`/projects/${projectId}/assignments`, data),
  updateAssignment: (projectId, assignmentId, data) => api.put(`/projects/${projectId}/assignments/${assignmentId}`, data),
  removeAssignment: (projectId, assignmentId) => api.delete(`/projects/${projectId}/assignments/${assignmentId}`),
  getAssignments: (projectId) => api.get(`/projects/${projectId}/assignments`),
};

// ==================== CUSTOMERS ====================
export const customerAPI = {
  getAll: (params) => api.get('/customers', { params }),
  getById: (id) => api.get(`/customers/${id}`),
  create: (data) => api.post('/customers', data),
  update: (id, data) => api.put(`/customers/${id}`, data),
  delete: (id) => api.delete(`/customers/${id}`),
};

// ==================== EMPLOYEES ====================
export const employeeAPI = {
  getAll: (params) => api.get('/employees', { params }),
  getById: (id) => api.get(`/employees/${id}`),
  create: (data) => api.post('/employees', data),
  update: (id, data) => api.put(`/employees/${id}`, data),
  getStatistics: (id) => api.get(`/employees/${id}/statistics`),
};

// ==================== SCHEDULES ====================
export const scheduleAPI = {
  getAll: (params) => api.get('/schedules', { params }),
  getById: (id) => api.get(`/schedules/${id}`),
  create: (data) => api.post('/schedules', data),
  update: (id, data) => api.put(`/schedules/${id}`, data),
  updateProgress: (id, data) => api.patch(`/schedules/${id}/progress`, data),
  assignEmployee: (id, data) => api.post(`/schedules/${id}/assignments`, data),
  removeEmployee: (id, assignmentId) => api.delete(`/schedules/${id}/assignments/${assignmentId}`),
  getCalendarView: (params) => api.get('/schedules/calendar/view', { params }),
  checkIn: (id, employeeId) => api.post(`/schedules/${id}/check-in`, { employee_id: employeeId }),
  checkOut: (id, employeeId) => api.post(`/schedules/${id}/check-out`, { employee_id: employeeId }),
};

// ==================== TASKS ====================
export const taskAPI = {
  getAll: (params) => api.get('/tasks', { params }),
  getById: (id) => api.get(`/tasks/${id}`),
  create: (data) => api.post('/tasks', data),
  update: (id, data) => api.put(`/tasks/${id}`, data),
  delete: (id) => api.delete(`/tasks/${id}`),
  complete: (id) => api.patch(`/tasks/${id}/complete`),
  archive: (id) => api.patch(`/tasks/${id}/archive`),
  
  // Locations
  addLocation: (taskId, data) => api.post(`/tasks/${taskId}/locations`, data),
  updateLocation: (taskId, locationId, data) => api.put(`/tasks/${taskId}/locations/${locationId}`, data),
  deleteLocation: (taskId, locationId) => api.delete(`/tasks/${taskId}/locations/${locationId}`),
  completeLocation: (taskId, locationId) => api.patch(`/tasks/${taskId}/locations/${locationId}/complete`),
  importLocations: (taskId, formData) => api.post(`/tasks/${taskId}/locations/import`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  
  // Assignments
  addAssignment: (taskId, data) => api.post(`/tasks/${taskId}/assignments`, data),
  removeAssignment: (taskId, assignmentId) => api.delete(`/tasks/${taskId}/assignments/${assignmentId}`),
  
  // Notifications
  getUnreadNotifications: () => api.get('/tasks/notifications/unread'),
  markNotificationRead: (id) => api.patch(`/tasks/notifications/${id}/read`),
};

// ==================== REPORTS ====================
export const reportAPI = {
  getAll: (params) => api.get('/reports', { params }),
  getById: (id) => api.get(`/reports/${id}`),
  create: (data) => api.post('/reports', data),
  update: (id, data) => api.put(`/reports/${id}`, data),
  delete: (id) => api.delete(`/reports/${id}`),
  getDaily: (date, params) => api.get(`/reports/daily/${date}`, { params }),
  getWeekly: (weekStart, weekEnd, params) => api.get(`/reports/weekly/${weekStart}/${weekEnd}`, { params }),
  getMonthly: (year, month, params) => api.get(`/reports/monthly/${year}/${month}`, { params }),
};

// ==================== DASHBOARD ====================
export const dashboardAPI = {
  getSummary: () => api.get('/dashboard/summary'),
  getProjectPerformance: (params) => api.get('/dashboard/project-performance', { params }),
  getEmployeePerformance: (params) => api.get('/dashboard/employee-performance', { params }),
  getRevenue: (params) => api.get('/dashboard/revenue', { params }),
  getMaterials: (params) => api.get('/dashboard/materials', { params }),
};

// ==================== DATA TRANSFER ====================
export const dataTransferAPI = {
  downloadTemplate: (entity) => api.get(`/data-transfer/${entity}/template`, { responseType: 'blob' }),
  exportExcel: (entity) => api.get(`/data-transfer/${entity}/export`, { responseType: 'blob' }),
  importExcel: (entity, file, dryRun = true) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/data-transfer/${entity}/import`, formData, {
      params: { dry_run: dryRun },
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

export default api;