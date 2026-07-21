import React, { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Layout,
  Menu,
  Avatar,
  Dropdown,
  Badge,
  Space,
  Button,
  Drawer,
  Typography
} from 'antd';
import {
  DashboardOutlined,
  ProjectOutlined,
  TeamOutlined,
  UserOutlined,
  CalendarOutlined,
  FileTextOutlined,
  InboxOutlined,
  SettingOutlined,
  LogoutOutlined,
  BellOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  CheckSquareOutlined,
  BarChartOutlined,
  EnvironmentOutlined,
  ClockCircleOutlined,
  SwapOutlined
} from '@ant-design/icons';
import { notificationAPI } from '../services/api';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

const MainLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileDrawerVisible, setMobileDrawerVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Handle window resize
  React.useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const loadNotifications = async () => {
    try {
      const response = await notificationAPI.getUnread();
      setNotifications(response.data || []);
      setUnreadCount(response.unread_count || 0);
    } catch (error) {
      console.error('Không thể tải thông báo:', error);
    }
  };

  useEffect(() => {
    loadNotifications();
    const timer = window.setInterval(loadNotifications, 30000);
    return () => window.clearInterval(timer);
  }, []);

const menuItems = [
  {
    key: '/',
    icon: <DashboardOutlined />,
    label: 'Tổng quan',
  },
  {
    key: '/projects',
    icon: <ProjectOutlined />,
    label: 'Dự án',
  },
  {
    key: '/tasks',
    icon: <CheckSquareOutlined />,
    label: 'Nhiệm vụ',
  },
  {
    key: '/customers',
    icon: <TeamOutlined />,
    label: 'Khách hàng',
  },
  {
    key: '/employees',
    icon: <UserOutlined />,
    label: 'Nhân viên',
    children: [
      {
        key: '/employees',
        icon: <TeamOutlined />,
        label: 'Danh sách',
      },
      {
        key: '/employees/availability',
        icon: <ClockCircleOutlined />,
        label: 'Tình trạng làm việc',
      },
    ],
  },
  {
    key: '/schedules',
    icon: <CalendarOutlined />,
    label: 'Lịch trình',
    children: [
      {
        key: '/schedules',
        icon: <CalendarOutlined />,
        label: 'Danh sách',
      },
      {
        key: '/schedules/calendar',
        icon: <EnvironmentOutlined />,
        label: 'Lịch làm việc',
      },
    ],
  },
  {
    key: '/reports',
    icon: <FileTextOutlined />,
    label: 'Báo cáo',
    children: [
      {
        key: '/reports/daily',
        icon: <FileTextOutlined />,
        label: 'Báo cáo ngày',
      },
      {
        key: '/reports/weekly',
        icon: <BarChartOutlined />,
        label: 'Báo cáo tuần',
      },
      {
        key: '/reports/monthly',
        icon: <BarChartOutlined />,
        label: 'Báo cáo tháng',
      },
    ],
  },
  {
    key: '/data-transfer',
    icon: <SwapOutlined />,
    label: 'Import / Export',
  },
  {
    key: 'materials-module',
    icon: <InboxOutlined />,
    label: 'Vật tư',
    children: [
      { key: '/materials', icon: <InboxOutlined />, label: 'Danh mục vật tư' },
      { key: '/inventory', icon: <SwapOutlined />, label: 'Giao dịch kho' },
    ],
  },
  {
    key: '/settings',
    icon: <SettingOutlined />,
    label: 'Cài đặt',
  },
];

  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: 'Thông tin cá nhân',
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: 'Cài đặt',
    },
    {
      type: 'divider',
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Đăng xuất',
      danger: true,
    },
  ];

  const handleMenuClick = ({ key }) => {
    navigate(key);
    if (isMobile) {
      setMobileDrawerVisible(false);
    }
  };

  const handleUserMenuClick = ({ key }) => {
    if (key === 'logout') {
      // Handle logout
      console.log('Logout');
      // You can add your logout logic here
      // localStorage.removeItem('token');
      // navigate('/login');
    } else if (key === 'profile') {
      navigate('/profile');
    } else if (key === 'settings') {
      navigate('/settings');
    }
  };

 // Get current selected keys
const getSelectedKeys = () => {
  const path = location.pathname;
  
  // Exact match for root
  if (path === '/') return ['/'];
  
  // Check exact matches first
  const exactMatch = menuItems.find(item => {
    if (item.children) {
      return item.children.some(child => child.key === path);
    }
    return item.key === path;
  });

  if (exactMatch) {
    if (exactMatch.children) {
      const childMatch = exactMatch.children.find(child => child.key === path);
      return childMatch ? [childMatch.key] : [path];
    }
    return [exactMatch.key];
  }
  
  // Check for partial matches (for detail pages)
  for (const item of menuItems) {
    if (item.children) {
      for (const child of item.children) {
        if (path.startsWith(child.key + '/')) {
          return [child.key];
        }
      }
    } else if (path.startsWith(item.key + '/')) {
      return [item.key];
    }
  }
  
  return [path];
};

  // Get open keys for submenu
 // Get open keys for submenu
const getOpenKeys = () => {
  const path = location.pathname;
  const openKeys = [];

  menuItems.forEach((item) => {
    if (item.children) {
      const hasActiveChild = item.children.some(
        (child) => path === child.key || path.startsWith(child.key + '/')
      );
      if (hasActiveChild) {
        openKeys.push(item.key);
      }
    }
  });

  return openKeys;
};

  const [openKeys, setOpenKeys] = useState(getOpenKeys());

  const onOpenChange = (keys) => {
    setOpenKeys(keys);
  };

  const SidebarMenu = () => (
    <Menu
      theme="dark"
      mode="inline"
      selectedKeys={getSelectedKeys()}
      openKeys={openKeys}
      onOpenChange={onOpenChange}
      items={menuItems}
      onClick={handleMenuClick}
      style={{ borderRight: 0 }}
    />
  );

  const notificationMenuItems = notifications.length
    ? notifications.slice(0, 8).map((item) => ({
        key: `${item.source}:${item.id}`,
        label: (
          <div style={{ width: 320, whiteSpace: 'normal' }}>
            <Text strong>{item.title}</Text>
            <div style={{ fontSize: 12 }}>{item.message}</div>
          </div>
        ),
        onClick: async () => {
          try {
            await notificationAPI.markRead(item.source, item.id);
            if (item.link) navigate(item.link);
            await loadNotifications();
          } catch (error) {
            console.error(error);
          }
        },
      }))
    : [{ key: 'empty', disabled: true, label: 'Không có thông báo mới' }];

  notificationMenuItems.push({ type: 'divider' });
  notificationMenuItems.push({ key: 'all', label: 'Xem tất cả thông báo', onClick: () => navigate('/notifications') });

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* Desktop Sider */}
      {!isMobile && (
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          trigger={null}
          width={250}
          style={{
            overflow: 'auto',
            height: '100vh',
            position: 'fixed',
            left: 0,
            top: 0,
            bottom: 0,
            zIndex: 999,
          }}
          breakpoint="lg"
        >
          <div
            style={{
              height: 64,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: collapsed ? 16 : 18,
              fontWeight: 'bold',
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
              cursor: 'pointer',
            }}
            onClick={() => navigate('/')}
          >
            {collapsed ? (
              <ProjectOutlined style={{ fontSize: 24 }} />
            ) : (
              <>
                <ProjectOutlined style={{ marginRight: 8 }} />
                Production Mgmt
              </>
            )}
          </div>
          <SidebarMenu />
        </Sider>
      )}

      {/* Mobile Drawer */}
      {isMobile && (
        <Drawer
          title={
            <Space>
              <ProjectOutlined />
              <span>Production Management</span>
            </Space>
          }
          placement="left"
          onClose={() => setMobileDrawerVisible(false)}
          open={mobileDrawerVisible}
          bodyStyle={{ padding: 0 }}
          width={250}
        >
          <Menu
            mode="inline"
            selectedKeys={getSelectedKeys()}
            openKeys={openKeys}
            onOpenChange={onOpenChange}
            items={menuItems}
            onClick={handleMenuClick}
          />
        </Drawer>
      )}

      <Layout
        style={{
          marginLeft: isMobile ? 0 : collapsed ? 80 : 250,
          transition: 'all 0.2s',
        }}
      >
        <Header
          style={{
            padding: '0 24px',
            background: '#fff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: '0 1px 4px rgba(0,21,41,.08)',
            position: 'sticky',
            top: 0,
            zIndex: 998,
          }}
        >
          <Space>
            {isMobile ? (
              <Button
                type="text"
                icon={<MenuFoldOutlined />}
                onClick={() => setMobileDrawerVisible(true)}
                style={{ fontSize: 16 }}
              />
            ) : (
              <Button
                type="text"
                icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={() => setCollapsed(!collapsed)}
                style={{ fontSize: 16 }}
              />
            )}
            
            {/* Breadcrumb or Page Title can go here */}
            <Text strong style={{ fontSize: 16 }}>
              {getPageTitle()}
            </Text>
          </Space>

          <Space size="large">
            {/* Notifications */}
            <Dropdown menu={{ items: notificationMenuItems }} placement="bottomRight" trigger={['click']}>
              <Badge count={unreadCount} overflowCount={99} offset={[-5, 5]}>
                <Button type="text" icon={<BellOutlined style={{ fontSize: 18 }} />} />
              </Badge>
            </Dropdown>

            {/* User Menu */}
            <Dropdown
              menu={{
                items: userMenuItems,
                onClick: handleUserMenuClick,
              }}
              placement="bottomRight"
            >
              <Space style={{ cursor: 'pointer' }}>
                <Avatar
                  style={{ backgroundColor: '#1890ff' }}
                  icon={<UserOutlined />}
                />
                {!isMobile && (
                  <Space direction="vertical" size={0}>
                    <Text strong>Admin User</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Quản trị viên
                    </Text>
                  </Space>
                )}
              </Space>
            </Dropdown>
          </Space>
        </Header>

        <Content
          style={{
            margin: '24px',
            minHeight: 'calc(100vh - 112px)',
          }}
        >
          <Outlet />
        </Content>

        {/* Footer (Optional) */}
        <div
          style={{
            textAlign: 'center',
            padding: '16px',
            background: '#f0f2f5',
            borderTop: '1px solid #d9d9d9',
          }}
        >
          <Text type="secondary" style={{ fontSize: 12 }}>
            Simba PMS - Version: 2.4.0-D
          </Text>
        </div>
      </Layout>
    </Layout>
  );

  // Helper function to get page title based on current route
  function getPageTitle() {
    const path = location.pathname;
    
    const titleMap = {
      '/': 'Tổng quan',
      '/projects': 'Quản lý Dự án',
      '/tasks': 'Quản lý Nhiệm vụ',
      '/customers': 'Quản lý Khách hàng',
      '/employees': 'Danh sách Nhân viên',
      '/employees/availability': 'Tình trạng Nhân viên',
      '/schedules': 'Lịch trình Công việc',
      '/schedules/calendar': 'Lịch làm việc',
      '/reports/daily': 'Báo cáo Ngày',
      '/reports/weekly': 'Báo cáo Tuần',
      '/reports/monthly': 'Báo cáo Tháng',
      '/materials': 'Quản lý Vật tư',
      '/settings': 'Cài đặt Hệ thống',
    };

    // Check for detail pages
    if (path.match(/\/projects\/\d+$/)) return 'Chi tiết Dự án';
    if (path.match(/\/tasks\/\d+$/)) return 'Chi tiết Nhiệm vụ';
    if (path.match(/\/customers\/\d+$/)) return 'Chi tiết Khách hàng';
    if (path.match(/\/employees\/\d+$/)) return 'Chi tiết Nhân viên';

    return titleMap[path] || 'Production Management';
  }
};

export default MainLayout;
