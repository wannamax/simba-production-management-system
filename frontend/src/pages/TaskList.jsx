import React, { useEffect, useState } from 'react';
import {
  Table,
  Button,
  Space,
  Tag,
  Input,
  Select,
  Modal,
  Form,
  DatePicker,
  InputNumber,
  message,
  Card,
  Row,
  Col,
  Statistic,
  Tooltip,
  Badge,
  Progress
} from 'antd';
import {
  PlusOutlined,
  EyeOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  WarningOutlined,
  InboxOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import axios from 'axios';

const { Search } = Input;
const { Option } = Select;

const API_URL = import.meta.env.VITE_API_URL || '/api';

const TaskList = () => {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [form] = Form.useForm();
  const [taskTypes, setTaskTypes] = useState([]);
  const [filters, setFilters] = useState({
    project_id: '',
    task_type: '',
    status: '',
    is_overdue: false,
    is_archived: false
  });

  useEffect(() => {
    settingsAPI.getCatalogs({ type: 'TASK_TYPE' }).then(r => setTaskTypes(r.data || [])).catch(e => message.warning(e.message));
    loadTasks();
    loadProjects();
  }, [filters]);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/tasks`, { params: filters });
      setTasks(response.data.data);
    } catch (error) {
      message.error('Không thể tải danh sách nhiệm vụ');
    } finally {
      setLoading(false);
    }
  };

  const loadProjects = async () => {
    try {
      const response = await axios.get(`${API_URL}/projects`);
      setProjects(response.data.data);
    } catch (error) {
      console.error('Error loading projects:', error);
    }
  };

  const handleCreate = () => {
    setEditingTask(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record) => {
    setEditingTask(record);
    form.setFieldsValue({
      ...record,
      start_date: record.start_date ? dayjs(record.start_date) : null,
      end_date: record.end_date ? dayjs(record.end_date) : null,
    });
    setModalVisible(true);
  };

  const handleComplete = async (id) => {
    try {
      await axios.patch(`${API_URL}/tasks/${id}/complete`);
      message.success('Đã đánh dấu hoàn thành');
      loadTasks();
    } catch (error) {
      message.error('Không thể hoàn thành nhiệm vụ');
    }
  };

  const handleArchive = async (id) => {
    try {
      await axios.patch(`${API_URL}/tasks/${id}/archive`);
      message.success('Đã lưu trữ nhiệm vụ');
      loadTasks();
    } catch (error) {
      message.error('Không thể lưu trữ nhiệm vụ');
    }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API_URL}/tasks/${id}`);
      message.success('Xóa nhiệm vụ thành công');
      loadTasks();
    } catch (error) {
      message.error('Không thể xóa nhiệm vụ');
    }
  };

  const handleSubmit = async (values) => {
    try {
      const data = {
        ...values,
        start_date: values.start_date?.format('YYYY-MM-DD'),
        end_date: values.end_date?.format('YYYY-MM-DD'),
      };

      if (editingTask) {
        await axios.put(`${API_URL}/tasks/${editingTask.id}`, data);
        message.success('Cập nhật nhiệm vụ thành công');
      } else {
        await axios.post(`${API_URL}/tasks`, data);
        message.success('Tạo nhiệm vụ thành công');
      }

      setModalVisible(false);
      form.resetFields();
      loadTasks();
    } catch (error) {
      message.error(editingTask ? 'Không thể cập nhật nhiệm vụ' : 'Không thể tạo nhiệm vụ');
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      'Chưa bắt đầu': 'default',
      'Đang thực hiện': 'processing',
      'Chờ xử lý': 'warning',
      'Hoàn thành': 'success',
      'Lưu trữ': 'default',
      'Hủy': 'error'
    };
    return colors[status] || 'default';
  };

  const getTaskTypeColor = (type) => {
    const colors = {
      'Sản xuất': 'orange',
      'Giao hàng': 'blue',
      'Lắp đặt': 'green'
    };
    return colors[type] || 'default';
  };

  const columns = [
    {
      title: 'Mã nhiệm vụ',
      dataIndex: 'task_code',
      key: 'task_code',
      width: 140,
      fixed: 'left',
      render: (text, record) => (
        <Space direction="vertical" size={0}>
          <a onClick={() => navigate(`/tasks/${record.id}`)}>{text}</a>
          {record.is_overdue && (
            <Tag icon={<WarningOutlined />} color="error" style={{ margin: 0 }}>
              Quá hạn
            </Tag>
          )}
        </Space>
      ),
    },
    {
      title: 'Tên nhiệm vụ',
      dataIndex: 'task_name',
      key: 'task_name',
      width: 250,
      ellipsis: true,
    },
    {
      title: 'Loại',
      dataIndex: 'task_type',
      key: 'task_type',
      width: 120,
      render: (type) => <Tag color={getTaskTypeColor(type)}>{type}</Tag>,
    },
    {
      title: 'Dự án',
      dataIndex: 'project_name',
      key: 'project_name',
      width: 200,
      ellipsis: true,
    },
    {
      title: 'Thời gian',
      key: 'dates',
      width: 200,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <div>
            Bắt đầu: {record.start_date ? dayjs(record.start_date).format('DD/MM/YYYY') : '-'}
          </div>
          <div>
            Kết thúc: {record.end_date ? dayjs(record.end_date).format('DD/MM/YYYY') : '-'}
          </div>
        </Space>
      ),
    },
    {
      title: 'Địa điểm',
      key: 'locations',
      width: 120,
      align: 'center',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <div style={{ fontSize: 18, fontWeight: 'bold' }}>
            {record.completed_locations || 0}/{record.total_locations || 0}
          </div>
          <Progress
            percent={
              record.total_locations > 0
                ? Math.round((record.completed_locations / record.total_locations) * 100)
                : 0
            }
            size="small"
            showInfo={false}
          />
        </Space>
      ),
    },
    {
      title: 'Nhân sự',
      dataIndex: 'total_assigned_employees',
      key: 'employees',
      width: 80,
      align: 'center',
      render: (count) => <Badge count={count} showZero />,
    },
    {
      title: 'Tiến độ',
      dataIndex: 'progress',
      key: 'progress',
      width: 120,
      render: (progress) => <Progress percent={progress || 0} size="small" />,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status) => <Tag color={getStatusColor(status)}>{status}</Tag>,
    },
    {
      title: 'Hành động',
      key: 'action',
      width: 180,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small" wrap>
          <Tooltip title="Xem chi tiết">
            <Button
              type="link"
              icon={<EyeOutlined />}
              onClick={() => navigate(`/tasks/${record.id}`)}
              size="small"
            />
          </Tooltip>
          {!record.is_completed && (
            <>
              <Tooltip title="Chỉnh sửa">
                <Button
                  type="link"
                  icon={<EditOutlined />}
                  onClick={() => handleEdit(record)}
                  size="small"
                />
              </Tooltip>
              <Tooltip title="Hoàn thành">
                <Button
                  type="link"
                  icon={<CheckCircleOutlined />}
                  onClick={() => handleComplete(record.id)}
                  size="small"
                  style={{ color: '#52c41a' }}
                />
              </Tooltip>
            </>
          )}
          {record.is_completed && !record.is_archived && (
            <Tooltip title="Lưu trữ">
              <Button
                type="link"
                icon={<InboxOutlined />}
                onClick={() => handleArchive(record.id)}
                size="small"
              />
            </Tooltip>
          )}
          <Tooltip title="Xóa">
            <Button
              type="link"
              danger
              icon={<DeleteOutlined />}
              onClick={() => {
                Modal.confirm({
                  title: 'Xác nhận xóa',
                  content: 'Bạn có chắc muốn xóa nhiệm vụ này?',
                  onOk: () => handleDelete(record.id),
                });
              }}
              size="small"
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  // Calculate statistics
  const stats = {
    total: tasks.length,
    notStarted: tasks.filter((t) => t.status === 'Chưa bắt đầu').length,
    inProgress: tasks.filter((t) => t.status === 'Đang thực hiện').length,
    waiting: tasks.filter((t) => t.status === 'Chờ xử lý').length,
    completed: tasks.filter((t) => t.status === 'Hoàn thành').length,
    overdue: tasks.filter((t) => t.is_overdue).length,
  };

  return (
    <div>
      <div className="page-header">
        <h1>Quản lý Nhiệm vụ</h1>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          Tạo nhiệm vụ mới
        </Button>
      </div>

      {/* Statistics */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={8} lg={4}>
          <Card>
            <Statistic title="Tổng số" value={stats.total} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8} lg={4}>
          <Card>
            <Statistic
              title="Chưa bắt đầu"
              value={stats.notStarted}
              valueStyle={{ color: '#999' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8} lg={4}>
          <Card>
            <Statistic
              title="Đang thực hiện"
              value={stats.inProgress}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8} lg={4}>
          <Card>
            <Statistic
              title="Chờ xử lý"
              value={stats.waiting}
              valueStyle={{ color: '#fa8c16' }}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8} lg={4}>
          <Card>
            <Statistic
              title="Hoàn thành"
              value={stats.completed}
              valueStyle={{ color: '#52c41a' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8} lg={4}>
          <Card>
            <Statistic
              title="Quá hạn"
              value={stats.overdue}
              valueStyle={{ color: '#ff4d4f' }}
              prefix={<WarningOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* Filters */}
      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select
            placeholder="Chọn dự án"
            style={{ width: 200 }}
            allowClear
            onChange={(value) => setFilters({ ...filters, project_id: value || '' })}
            showSearch
            optionFilterProp="children"
          >
            {projects.map((p) => (
              <Option key={p.id} value={p.id}>
                {p.project_name}
              </Option>
            ))}
          </Select>
          <Select
            placeholder="Loại nhiệm vụ"
            style={{ width: 150 }}
            allowClear
            onChange={(value) => setFilters({ ...filters, task_type: value || '' })}
          >
            <Option value="Sản xuất">Sản xuất</Option>
            <Option value="Giao hàng">Giao hàng</Option>
            <Option value="Lắp đặt">Lắp đặt</Option>
          </Select>
          <Select
            placeholder="Trạng thái"
            style={{ width: 150 }}
            allowClear
            onChange={(value) => setFilters({ ...filters, status: value || '' })}
          >
            <Option value="Chưa bắt đầu">Chưa bắt đầu</Option>
            <Option value="Đang thực hiện">Đang thực hiện</Option>
            <Option value="Chờ xử lý">Chờ xử lý</Option>
            <Option value="Hoàn thành">Hoàn thành</Option>
          </Select>
          <Button
            type={filters.is_overdue ? 'primary' : 'default'}
            danger={filters.is_overdue}
            icon={<WarningOutlined />}
            onClick={() => setFilters({ ...filters, is_overdue: !filters.is_overdue })}
          >
            Chỉ quá hạn
          </Button>
          <Button
            type={filters.is_archived ? 'primary' : 'default'}
            icon={<InboxOutlined />}
            onClick={() => setFilters({ ...filters, is_archived: !filters.is_archived })}
          >
            {filters.is_archived ? 'Đang xem lưu trữ' : 'Xem lưu trữ'}
          </Button>
        </Space>
      </Card>

      {/* Table */}
      <Card>
        <Table
          columns={columns}
          dataSource={tasks}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1600 }}
          pagination={{
            showSizeChanger: true,
            showTotal: (total) => `Tổng ${total} nhiệm vụ`,
          }}
        />
      </Card>

      {/* Create/Edit Modal */}
      <Modal
        title={editingTask ? 'Cập nhật nhiệm vụ' : 'Tạo nhiệm vụ mới'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width={800}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="project_id"
                label="Dự án"
                rules={[{ required: true, message: 'Vui lòng chọn dự án' }]}
              >
                <Select
                  placeholder="Chọn dự án"
                  showSearch
                  optionFilterProp="children"
                >
                  {projects.map((p) => (
                    <Option key={p.id} value={p.id}>
                      {p.project_name}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="task_type"
                label="Loại nhiệm vụ"
                rules={[{ required: true, message: 'Vui lòng chọn loại nhiệm vụ' }]}
              >
                <Select placeholder="Chọn loại" showSearch optionFilterProp="children">
                  {taskTypes.map(item => <Option key={item.id} value={item.name}>{item.name}</Option>)}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="task_name"
            label="Tên nhiệm vụ"
            rules={[{ required: true, message: 'Vui lòng nhập tên nhiệm vụ' }]}
          >
            <Input placeholder="Nhập tên nhiệm vụ" />
          </Form.Item>

          <Form.Item name="description" label="Mô tả">
            <Input.TextArea rows={3} placeholder="Nhập mô tả chi tiết" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="start_date" label="Ngày bắt đầu">
                <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="end_date" label="Ngày kết thúc">
                <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="priority" label="Ưu tiên">
                <Select placeholder="Chọn mức độ">
                  <Option value="Thấp">Thấp</Option>
                  <Option value="Trung bình">Trung bình</Option>
                  <Option value="Cao">Cao</Option>
                  <Option value="Khẩn cấp">Khẩn cấp</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="estimated_duration" label="Thời gian dự kiến (ngày)">
                <InputNumber
                  style={{ width: '100%' }}
                  min={1}
                  placeholder="Số ngày"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="estimated_hours" label="Số giờ dự kiến">
                <InputNumber
                  style={{ width: '100%' }}
                  min={0}
                  step={0.5}
                  placeholder="Tổng số giờ"
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="notify_before_days" label="Thông báo trước (ngày)" initialValue={1}>
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>

          <Form.Item name="notes" label="Ghi chú">
            <Input.TextArea rows={2} placeholder="Ghi chú thêm" />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                {editingTask ? 'Cập nhật' : 'Tạo mới'}
              </Button>
              <Button onClick={() => setModalVisible(false)}>Hủy</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default TaskList;