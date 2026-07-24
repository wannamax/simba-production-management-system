import React, { useEffect, useState } from 'react';
import { Row, Col, Card, Statistic, Table, Tag, Progress, Empty, Spin } from 'antd';
import {
  ProjectOutlined,
  TeamOutlined,
  CalendarOutlined,
  FileTextOutlined,
  ArrowUpOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  WarningOutlined
} from '@ant-design/icons';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';
import { Bar, Pie } from 'react-chartjs-2';
import { dashboardAPI } from '../services/api';
import { PROJECT_STATUS_COLORS, SCHEDULE_STATUS_COLORS } from '../utils/constants';
import dayjs from 'dayjs';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

const Dashboard = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const response = await dashboardAPI.getSummary();
      setData(response.data);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <Spin size="large" tip="Đang tải dữ liệu..." />
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ padding: 24 }}>
        <Empty description="Không có dữ liệu" />
      </div>
    );
  }

  // Calculate totals
  const totalProjects = data.projects?.reduce((sum, p) => sum + parseInt(p.count || 0), 0) || 0;
  const totalEmployees = data.employees?.reduce((sum, e) => sum + parseInt(e.count || 0), 0) || 0;
  const totalSchedules = data.schedules?.reduce((sum, s) => sum + parseInt(s.count || 0), 0) || 0;
  const totalReports = data.recentReports?.length || 0;

  // Chart data for projects
  const projectChartData = {
    labels: data.projects?.map(p => p.status) || [],
    datasets: [
      {
        label: 'Số lượng dự án',
        data: data.projects?.map(p => parseInt(p.count)) || [],
        backgroundColor: [
          'rgba(54, 162, 235, 0.8)',
          'rgba(255, 206, 86, 0.8)',
          'rgba(255, 99, 132, 0.8)',
          'rgba(75, 192, 192, 0.8)',
          'rgba(153, 102, 255, 0.8)',
        ],
      },
    ],
  };

  // Chart data for schedules
  const scheduleTypes = [...new Set(data.schedules?.map(s => s.schedule_type) || [])];
  const scheduleChartData = {
    labels: scheduleTypes,
    datasets: [
      {
        label: 'Số lượng công việc',
        data: scheduleTypes.map(type => {
          return (data.schedules || [])
            .filter(s => s.schedule_type === type)
            .reduce((sum, s) => sum + parseInt(s.count), 0);
        }),
        backgroundColor: 'rgba(54, 162, 235, 0.8)',
      },
    ],
  };

  const recentReportsColumns = [
    {
      title: 'Ngày',
      dataIndex: 'report_date',
      key: 'report_date',
      render: (date) => dayjs(date).format('DD/MM/YYYY'),
      width: 100,
    },
    {
      title: 'Dự án',
      dataIndex: 'project_name',
      key: 'project_name',
      ellipsis: true,
    },
    {
      title: 'Công việc',
      dataIndex: 'schedule_title',
      key: 'schedule_title',
      ellipsis: true,
    },
    {
      title: 'Nhân viên',
      dataIndex: 'employee_name',
      key: 'employee_name',
    },
    {
      title: 'Giờ làm',
      dataIndex: 'work_hours',
      key: 'work_hours',
      width: 80,
      render: (hours) => hours ? `${hours}h` : '-',
    },
  ];

  const upcomingSchedulesColumns = [
    {
      title: 'Dự án',
      dataIndex: 'project_name',
      key: 'project_name',
      ellipsis: true,
    },
    {
      title: 'Công việc',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
    },
    {
      title: 'Thời gian',
      dataIndex: 'start_datetime',
      key: 'start_datetime',
      render: (date) => dayjs(date).format('DD/MM HH:mm'),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag color={SCHEDULE_STATUS_COLORS[status] || 'default'}>{status}</Tag>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 style={{ marginBottom: 0 }}>Tổng quan</h1>
          <Tag color="blue">{data.display_version || `Simba PMS - Version: ${data.version || '2.6.0-K'}`}</Tag>
        </div>
      </div>

      {/* Statistics Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable>
            <Statistic
              title="Tổng dự án"
              value={totalProjects}
              prefix={<ProjectOutlined />}
              valueStyle={{ color: '#1890ff' }}
              suffix={
                <span style={{ fontSize: 14, color: '#52c41a' }}>
                  <ArrowUpOutlined /> 12%
                </span>
              }
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable>
            <Statistic
              title="Nhân viên"
              value={totalEmployees}
              prefix={<TeamOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable>
            <Statistic
              title="Lịch trình (30 ngày)"
              value={totalSchedules}
              prefix={<CalendarOutlined />}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable>
            <Statistic
              title="Báo cáo (7 ngày)"
              value={totalReports}
              prefix={<FileTextOutlined />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Charts */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={12}>
          <Card title="Trạng thái Dự án" bordered={false}>
            {data.projects && data.projects.length > 0 ? (
              <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Pie
                  data={projectChartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                      legend: {
                        position: 'bottom',
                      },
                    },
                  }}
                />
              </div>
            ) : (
              <Empty description="Chưa có dữ liệu" />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Công việc theo Loại (30 ngày)" bordered={false}>
            {data.schedules && data.schedules.length > 0 ? (
              <div style={{ height: 300 }}>
                <Bar
                  data={scheduleChartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        display: false,
                      },
                    },
                    scales: {
                      y: {
                        beginAtZero: true,
                        ticks: {
                          stepSize: 1,
                        },
                      },
                    },
                  }}
                />
              </div>
            ) : (
              <Empty description="Chưa có dữ liệu" />
            )}
          </Card>
        </Col>
      </Row>

      {/* Tables */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={12}>
          <Card
            title={
              <span>
                <ClockCircleOutlined /> Lịch trình sắp tới
              </span>
            }
            bordered={false}
          >
            <Table
              dataSource={data.upcomingSchedules || []}
              columns={upcomingSchedulesColumns}
              rowKey="id"
              pagination={false}
              scroll={{ x: 'max-content' }}
              locale={{ emptyText: 'Không có lịch trình sắp tới' }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card
            title={
              <span>
                <FileTextOutlined /> Báo cáo gần đây
              </span>
            }
            bordered={false}
          >
            <Table
              dataSource={data.recentReports || []}
              columns={recentReportsColumns}
              rowKey="id"
              pagination={false}
              scroll={{ x: 'max-content' }}
              locale={{ emptyText: 'Chưa có báo cáo' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Top Employees */}
      {data.topEmployees && data.topEmployees.length > 0 && (
        <Row gutter={[16, 16]}>
          <Col span={24}>
            <Card
              title={
                <span>
                  <CheckCircleOutlined /> Nhân viên xuất sắc tháng này
                </span>
              }
              bordered={false}
            >
              <Row gutter={[16, 16]}>
                {data.topEmployees.slice(0, 5).map((emp, index) => (
                  <Col xs={24} sm={12} lg={8} xl={4} key={emp.id}>
                    <Card size="small" hoverable>
                      <div style={{ textAlign: 'center' }}>
                        <div
                          style={{
                            width: 50,
                            height: 50,
                            borderRadius: '50%',
                            background: index === 0 ? '#ffd700' : index === 1 ? '#c0c0c0' : index === 2 ? '#cd7f32' : '#1890ff',
                            color: 'white',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 12px',
                            fontSize: 20,
                            fontWeight: 'bold',
                          }}
                        >
                          {index + 1}
                        </div>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>
                          {emp.full_name}
                        </div>
                        <div style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>
                          {emp.department}
                        </div>
                        <div style={{ fontSize: 20, fontWeight: 'bold', color: '#1890ff' }}>
                          {emp.total_hours}h
                        </div>
                        <div style={{ fontSize: 12, color: '#666' }}>
                          {emp.report_count} báo cáo
                        </div>
                      </div>
                    </Card>
                  </Col>
                ))}
              </Row>
            </Card>
          </Col>
        </Row>
      )}

      {/* Overdue Schedules Warning */}
      {data.overdueSchedules && data.overdueSchedules.length > 0 && (
        <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
          <Col span={24}>
            <Card
              title={
                <span style={{ color: '#ff4d4f' }}>
                  <WarningOutlined /> Lịch trình quá hạn ({data.overdueSchedules.length})
                </span>
              }
              bordered={false}
            >
              <Table
                dataSource={data.overdueSchedules}
                columns={[
                  {
                    title: 'Dự án',
                    dataIndex: 'project_name',
                    key: 'project_name',
                  },
                  {
                    title: 'Công việc',
                    dataIndex: 'title',
                    key: 'title',
                  },
                  {
                    title: 'Hạn chót',
                    dataIndex: 'end_datetime',
                    key: 'end_datetime',
                    render: (date) => (
                      <span style={{ color: '#ff4d4f' }}>
                        {dayjs(date).format('DD/MM/YYYY HH:mm')}
                      </span>
                    ),
                  },
                  {
                    title: 'Quá hạn',
                    dataIndex: 'end_datetime',
                    key: 'overdue',
                    render: (date) => {
                      const days = dayjs().diff(dayjs(date), 'day');
                      return <span style={{ color: '#ff4d4f' }}>{days} ngày</span>;
                    },
                  },
                  {
                    title: 'Tiến độ',
                    dataIndex: 'progress',
                    key: 'progress',
                    render: (progress) => (
                      <Progress percent={progress || 0} size="small" />
                    ),
                  },
                ]}
                rowKey="id"
                pagination={false}
                scroll={{ x: 'max-content' }}
              />
            </Card>
          </Col>
        </Row>
      )}
    </div>
  );
};

export default Dashboard;
