import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import viVN from 'antd/locale/vi_VN';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import './App.css';

// Layouts
import MainLayout from './layouts/MainLayout';

// Pages - All existing pages
import Dashboard from './pages/Dashboard';
import ProjectList from './pages/ProjectList';
import ProjectDetail from './pages/ProjectDetail';
import CustomerList from './pages/CustomerList';
import EmployeeList from './pages/EmployeeList';
import EmployeeAvailability from './pages/EmployeeAvailability'; // ? TH�M D�NG N�Y
import TaskList from './pages/TaskList';
import TaskDetail from './pages/TaskDetail';
import ScheduleList from './pages/ScheduleList';
import ScheduleCalendar from './pages/ScheduleCalendar';
import ReportDaily from './pages/ReportDaily';
import ReportWeekly from './pages/ReportWeekly';
import ReportMonthly from './pages/ReportMonthly';
import Notifications from './pages/Notifications';
import DataTransfer from './pages/DataTransfer';
import Settings from './pages/Settings';
import MaterialList from './pages/MaterialList';
import InventoryTransactions from './pages/InventoryTransactions';
import ShopfloorWorkBoard from './pages/ShopfloorWorkBoard';
import ShopfloorWorkBoardDisplay from './pages/ShopfloorWorkBoardDisplay';
import OrderList from './pages/OrderList';

dayjs.locale('vi');

function App() {
  return (
    <ConfigProvider
      locale={viVN}
      theme={{
        token: {
          colorPrimary: '#1890ff',
          borderRadius: 6,
          fontSize: 14,
        },
      }}
    >
      <BrowserRouter>
        <Routes>
          <Route path="/work-board/display/:token" element={<ShopfloorWorkBoardDisplay />} />
          <Route path="/" element={<MainLayout />}>
            {/* Dashboard */}
            <Route index element={<Dashboard />} />
            
            {/* Projects */}
            <Route path="projects" element={<ProjectList />} />
            <Route path="projects/:id" element={<ProjectDetail />} />
            <Route path="orders" element={<OrderList />} />
            
            {/* Tasks */}
            <Route path="tasks" element={<TaskList />} />
            <Route path="tasks/:id" element={<TaskDetail />} />
            
            {/* Customers */}
            <Route path="customers" element={<CustomerList />} />
            
            {/* Employees */}
            <Route path="employees" element={<EmployeeList />} />
            <Route path="employees/availability" element={<EmployeeAvailability />} /> {/* ? TH�M D�NG N�Y */}
            
            {/* Schedules */}
            <Route path="schedules" element={<ScheduleList />} />
            <Route path="schedules/calendar" element={<ScheduleCalendar />} />
            
            <Route path="notifications" element={<Notifications />} />

            {/* Reports */}
            <Route path="reports/daily" element={<ReportDaily />} />
            <Route path="reports/weekly" element={<ReportWeekly />} />
            <Route path="reports/monthly" element={<ReportMonthly />} />
            <Route path="materials" element={<MaterialList />} />
            <Route path="inventory" element={<InventoryTransactions />} />
            <Route path="work-board" element={<ShopfloorWorkBoard />} />
            <Route path="data-transfer" element={<DataTransfer />} />
            <Route path="settings" element={<Settings />} />
            
            {/* 404 */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
}

export default App;
