import React, { useEffect, useState } from 'react';
import {
  Card,
  Row,
  Col,
  Select,
  DatePicker,
  Button,
  Table,
  Tag,
  Space,
  Badge,
  Tooltip,
  Empty,
  Spin,
  Timeline,
  Modal,
  Divider,
  Progress,
  Statistic,
  Descriptions,
  message,
  Alert
} from 'antd';
import {
  FilterOutlined,
  TeamOutlined,
  CalendarOutlined,
  ProjectOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  CloseCircleOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../services/api';

const { RangePicker } = DatePicker;
const { Option } = Select;

const EmployeeAvailability = () => {
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [projects, setProjects] = useState([]);
  const [availabilityData, setAvailabilityData] = useState([]);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

  // Filters
  const [filters, setFilters] = useState({
    employee_ids: [],
    date_range: [dayjs().startOf('week'), dayjs().endOf('week')],
    project_ids: [],
  });

  useEffect(() => {
    loadEmployees();
    loadProjects();
    loadAvailability();
  }, []);

  const loadEmployees = async () => {
    try {
      const response = await api.get('/employees', {
        params: { status: 'Hoạt động' }
      });
      const data = response.data || response;
      setEmployees(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading employees:', error);
      message.error('Không thể tải danh sách nhân viên');
    }
  };

  const loadProjects = async () => {
    try {
      const response = await api.get('/projects');
      const data = response.data || response;
      setProjects(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading projects:', error);
      message.error('Không thể tải danh sách dự án');
    }
  };

  const loadAvailability = async (nextFilters = filters) => {
    setLoading(true);
    setLoadError('');

    try {
      const dateRange = nextFilters.date_range;
      if (!dateRange?.[0] || !dateRange?.[1]) {
        throw new Error('Vui lòng chọn khoảng thời gian');
      }

      const response = await api.get('/employees/availability', {
        params: {
          employee_ids: nextFilters.employee_ids.length > 0
            ? nextFilters.employee_ids.join(',')
            : undefined,
          project_ids: nextFilters.project_ids.length > 0
            ? nextFilters.project_ids.join(',')
            : undefined,
          start_date: dateRange[0].format('YYYY-MM-DD'),
          end_date: dateRange[1].format('YYYY-MM-DD'),
        },
      });

      const data = response.data || response;
      setAvailabilityData(Array.isArray(data) ? data : []);
      setLastUpdatedAt(dayjs());
    } catch (error) {
      console.error('Error loading availability:', error);
      setAvailabilityData([]);
      setLoadError(error.message || 'Không thể tải tình trạng nhân viên');
      message.error(error.message || 'Không thể tải tình trạng nhân viên');
    } finally {
      setLoading(false);
    }
  };

  const handleFilter = () => loadAvailability(filters);

  const handleResetFilters = () => {
    const resetFilters = {
      employee_ids: [],
      date_range: [dayjs().startOf('week'), dayjs().endOf('week')],
      project_ids: [],
    };
    setFilters(resetFilters);
    loadAvailability(resetFilters);
  };

  const showEmployeeDetail = (employee) => {
    setSelectedEmployee(employee);
    setDetailModalVisible(true);
  };

  const getStatusInfo = (record) => {
    if (!record.busy_projects || record.busy_projects.length === 0) {
      return { 
        status: 'Rảnh', 
        icon: <CheckCircleOutlined />, 
        color: 'success' 
      };
    }
    if (record.workload_percentage >= 100) {
      return { 
        status: 'Bận', 
        icon: <CloseCircleOutlined />, 
        color: 'error' 
      };
    }
    if (record.workload_percentage > 0) {
      return { 
        status: 'Bận một phần', 
        icon: <WarningOutlined />, 
        color: 'warning' 
      };
    }
    return { 
      status: 'Rảnh', 
      icon: <CheckCircleOutlined />, 
      color: 'success' 
    };
  };

  const columns = [
    {
      title: 'Nhân viên',
      key: 'employee',
      width: 200,
      fixed: 'left',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <a onClick={() => showEmployeeDetail(record)}>
            <strong>{record.full_name}</strong>
          </a>
          <span style={{ fontSize: 12, color: '#999' }}>
            {record.employee_code}
          </span>
        </Space>
      ),
    },
    {
      title: 'Phòng ban',
      dataIndex: 'department',
      key: 'department',
      width: 120,
    },
    {
      title: 'Vị trí',
      dataIndex: 'position',
      key: 'position',
      width: 150,
      ellipsis: true,
    },
    {
      title: 'Trạng thái',
      key: 'status',
      width: 130,
      render: (_, record) => {
        const { status, icon, color } = getStatusInfo(record);
        return (
          <Tag icon={icon} color={color}>
            {status}
          </Tag>
        );
      },
    },
    {
      title: 'Mức độ bận',
      key: 'workload',
      width: 180,
      render: (_, record) => (
        <Space direction="vertical" size={2} style={{ width: '100%' }}>
          <Progress
            percent={Math.min(Math.round(record.workload_percentage || 0), 100)}
            size="small"
            status={record.workload_percentage >= 100 ? 'exception' : 'active'}
            strokeColor={
              record.workload_percentage >= 100 ? '#ff4d4f' : 
              record.workload_percentage >= 80 ? '#fa8c16' : '#52c41a'
            }
          />
          <span style={{ fontSize: 12, color: '#666' }}>
            {record.total_assigned_hours || 0}h / {record.available_hours || 160}h
          </span>
        </Space>
      ),
    },
    {
      title: 'Dự án tham gia',
      key: 'projects',
      width: 300,
      render: (_, record) => {
        if (!record.busy_projects || record.busy_projects.length === 0) {
          return <Tag color="success">Không có dự án</Tag>;
        }
        
        return (
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            {record.busy_projects.slice(0, 2).map((project, index) => (
              <Tooltip key={index} title={`${project.task_count} nhiệm vụ`}>
                <Tag 
                  color={project.is_overdue ? 'error' : 'blue'}
                  style={{ width: '100%', marginRight: 0 }}
                >
                  {project.project_name} ({project.role})
                </Tag>
              </Tooltip>
            ))}
            {record.busy_projects.length > 2 && (
              <a onClick={() => showEmployeeDetail(record)}>
                <small>+{record.busy_projects.length - 2} dự án khác</small>
              </a>
            )}
          </Space>
        );
      },
    },
    {
      title: 'Nhiệm vụ',
      key: 'tasks',
      width: 100,
      align: 'center',
      render: (_, record) => (
        <Badge
          count={record.total_tasks || 0}
          showZero
          style={{ backgroundColor: '#1890ff' }}
        />
      ),
    },
    {
      title: 'SĐT',
      dataIndex: 'phone',
      key: 'phone',
      width: 120,
    },
  ];

  // Calculate statistics
  const stats = {
    total: availabilityData.length,
    free: availabilityData.filter(e => !e.busy_projects || e.busy_projects.length === 0).length,
    partiallyBusy: availabilityData.filter(e => e.workload_percentage > 0 && e.workload_percentage < 100).length,
    busy: availabilityData.filter(e => e.workload_percentage >= 100).length,
  };

  return (
    <div>
      <div className="page-header">
        <Space>
          <TeamOutlined style={{ fontSize: 24 }} />
          <h1 style={{ margin: 0 }}>Tình trạng Nhân sự</h1>
        </Space>
        <Button 
          icon={<ReloadOutlined />}
          onClick={handleFilter}
          loading={loading}
        >
          Làm mới
        </Button>
      </div>


      {loadError && (
        <Alert
          type="error"
          showIcon
          closable
          message="Không tải được dữ liệu tình trạng nhân viên"
          description={loadError}
          style={{ marginBottom: 16 }}
          onClose={() => setLoadError('')}
        />
      )}

      {lastUpdatedAt && !loadError && (
        <Alert
          type="info"
          showIcon
          message={`Dữ liệu thật từ hệ thống · cập nhật ${lastUpdatedAt.format('HH:mm:ss DD/MM/YYYY')}`}
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Filter Section */}
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={6}>
            <div style={{ marginBottom: 8 }}>
              <TeamOutlined /> <strong>Nhân viên</strong>
            </div>
            <Select
              mode="multiple"
              placeholder="Tất cả nhân viên"
              style={{ width: '100%' }}
              value={filters.employee_ids}
              onChange={(value) => setFilters({ ...filters, employee_ids: value })}
              showSearch
              optionFilterProp="children"
              maxTagCount="responsive"
              allowClear
            >
              {employees.map((emp) => (
                <Option key={emp.id} value={emp.id}>
                  {emp.full_name} - {emp.department}
                </Option>
              ))}
            </Select>
          </Col>

          <Col xs={24} sm={12} lg={6}>
            <div style={{ marginBottom: 8 }}>
              <CalendarOutlined /> <strong>Khoảng thời gian</strong>
            </div>
            <RangePicker
              style={{ width: '100%' }}
              format="DD/MM/YYYY"
              value={filters.date_range}
              allowClear={false}
              onChange={(dates) => setFilters({ ...filters, date_range: dates })}
              presets={[
                { label: 'Hôm nay', value: [dayjs().startOf('day'), dayjs().endOf('day')] },
                { label: 'Tuần này', value: [dayjs().startOf('week'), dayjs().endOf('week')] },
                { label: 'Tháng này', value: [dayjs().startOf('month'), dayjs().endOf('month')] },
                { label: '7 ngày tới', value: [dayjs(), dayjs().add(7, 'day')] },
                { label: '30 ngày tới', value: [dayjs(), dayjs().add(30, 'day')] },
              ]}
            />
          </Col>

          <Col xs={24} sm={12} lg={8}>
            <div style={{ marginBottom: 8 }}>
              <ProjectOutlined /> <strong>Dự án</strong>
            </div>
            <Select
              mode="multiple"
              placeholder="Tất cả dự án"
              style={{ width: '100%' }}
              value={filters.project_ids}
              onChange={(value) => setFilters({ ...filters, project_ids: value })}
              showSearch
              optionFilterProp="children"
              maxTagCount="responsive"
              allowClear
            >
              {projects.map((proj) => (
                <Option key={proj.id} value={proj.id}>
                  {proj.project_name}
                </Option>
              ))}
            </Select>
          </Col>

          <Col xs={24} sm={12} lg={4}>
            <div style={{ marginBottom: 8 }}>&nbsp;</div>
            <Space.Compact block>
              <Button
                type="primary"
                icon={<FilterOutlined />}
                onClick={handleFilter}
                loading={loading}
                size="large"
                style={{ flex: 1 }}
              >
                Lọc
              </Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={handleResetFilters}
                disabled={loading}
                size="large"
              >
                Đặt lại
              </Button>
            </Space.Compact>
          </Col>
        </Row>

        {/* Quick Stats */}
        {availabilityData.length > 0 && (
          <Row gutter={16} style={{ marginTop: 24 }}>
            <Col xs={12} sm={6}>
              <Card size="small" hoverable>
                <Statistic
                  title="Tổng nhân viên"
                  value={stats.total}
                  prefix={<TeamOutlined />}
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small" hoverable>
                <Statistic
                  title="Rảnh"
                  value={stats.free}
                  valueStyle={{ color: '#52c41a' }}
                  prefix={<CheckCircleOutlined />}
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small" hoverable>
                <Statistic
                  title="Bận một phần"
                  value={stats.partiallyBusy}
                  valueStyle={{ color: '#fa8c16' }}
                  prefix={<WarningOutlined />}
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small" hoverable>
                <Statistic
                  title="Bận"
                  value={stats.busy}
                  valueStyle={{ color: '#ff4d4f' }}
                  prefix={<CloseCircleOutlined />}
                />
              </Card>
            </Col>
          </Row>
        )}
      </Card>

      {/* Results Table */}
      <Card>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '50px 0' }}>
            <Spin size="large" tip="Đang tải dữ liệu..." />
          </div>
        ) : availabilityData.length > 0 ? (
          <Table
            columns={columns}
            dataSource={availabilityData}
            rowKey="id"
            scroll={{ x: 1300 }}
            pagination={{
              showSizeChanger: true,
              showTotal: (total) => `Tổng ${total} nhân viên`,
              defaultPageSize: 20,
            }}
            bordered
          />
        ) : (
          <Empty
            description={
              <Space direction="vertical" size={12}>
                <span>Chưa có dữ liệu</span>
                <span style={{ color: '#999', fontSize: 12 }}>
                  Vui lòng click "Lọc danh sách" để xem kết quả
                </span>
              </Space>
            }
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          >
            <Button type="primary" icon={<FilterOutlined />} onClick={handleFilter}>
              Lọc danh sách
            </Button>
          </Empty>
        )}
      </Card>

      {/* Employee Detail Modal */}
      <Modal
        title={
          <Space>
            <TeamOutlined />
            Chi tiết: {selectedEmployee?.full_name}
          </Space>
        }
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setDetailModalVisible(false)}>
            Đóng
          </Button>
        ]}
        width={800}
      >
        {selectedEmployee && (
          <div>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="Mã NV">
                {selectedEmployee.employee_code}
              </Descriptions.Item>
              <Descriptions.Item label="Phòng ban">
                {selectedEmployee.department}
              </Descriptions.Item>
              <Descriptions.Item label="Vị trí">
                {selectedEmployee.position}
              </Descriptions.Item>
              <Descriptions.Item label="SĐT">
                {selectedEmployee.phone || 'N/A'}
              </Descriptions.Item>
              <Descriptions.Item label="Tổng giờ được gán">
                <strong>{selectedEmployee.total_assigned_hours || 0}h</strong>
              </Descriptions.Item>
              <Descriptions.Item label="Giờ khả dụng">
                <strong>{selectedEmployee.available_hours || 160}h</strong>
              </Descriptions.Item>
              <Descriptions.Item label="Mức độ bận" span={2}>
                <Progress
                  percent={Math.min(Math.round(selectedEmployee.workload_percentage || 0), 100)}
                  status={selectedEmployee.workload_percentage >= 100 ? 'exception' : 'active'}
                />
              </Descriptions.Item>
            </Descriptions>

            <Divider orientation="left">
              <ProjectOutlined /> Dự án đang tham gia ({selectedEmployee.busy_projects?.length || 0})
            </Divider>

            {selectedEmployee.busy_projects && selectedEmployee.busy_projects.length > 0 ? (
              <Timeline>
                {selectedEmployee.busy_projects.map((project, index) => (
                  <Timeline.Item 
                    key={index} 
                    color={project.is_overdue ? 'red' : 'blue'}
                  >
                    <Space direction="vertical" size={4}>
                      <strong>{project.project_name}</strong>
                      <Space wrap>
                        <Tag color="blue">{project.role}</Tag>
                        {project.task_count > 0 && (
                          <Tag color="orange">{project.task_count} nhiệm vụ</Tag>
                        )}
                        {project.is_overdue && (
                          <Tag color="error">Quá hạn</Tag>
                        )}
                      </Space>
                      <span style={{ fontSize: 12, color: '#999' }}>
                        {project.start_date ? dayjs(project.start_date).format('DD/MM/YYYY') : 'N/A'} - {project.end_date ? dayjs(project.end_date).format('DD/MM/YYYY') : 'N/A'}
                      </span>
                    </Space>
                  </Timeline.Item>
                ))}
              </Timeline>
            ) : (
              <Empty description="Không có dự án nào" />
            )}

            {selectedEmployee.upcoming_tasks && selectedEmployee.upcoming_tasks.length > 0 && (
              <>
                <Divider orientation="left">
                  <ClockCircleOutlined /> Nhiệm vụ sắp tới
                </Divider>
                <Timeline>
                  {selectedEmployee.upcoming_tasks.map((task, index) => (
                    <Timeline.Item key={index} color="green">
                      <Space direction="vertical" size={4}>
                        <strong>{task.task_name}</strong>
                        <Space>
                          <Tag color="green">{task.task_type}</Tag>
                          <span style={{ fontSize: 12, color: '#999' }}>
                            {task.start_date ? dayjs(task.start_date).format('DD/MM/YYYY') : 'N/A'}
                          </span>
                        </Space>
                      </Space>
                    </Timeline.Item>
                  ))}
                </Timeline>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default EmployeeAvailability;