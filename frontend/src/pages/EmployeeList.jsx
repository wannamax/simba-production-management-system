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
  Popconfirm,
  Card,
  Row,
  Col,
  Statistic,
  Avatar,
  Tooltip
} from 'antd';
import {
  PlusOutlined,
  EyeOutlined,
  EditOutlined,
  DeleteOutlined,
  UserOutlined,
  TeamOutlined,
  PhoneOutlined,
  MailOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { employeeAPI, settingsAPI } from '../services/api';

const { Search } = Input;
const { Option } = Select;

const EmployeeList = () => {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [form] = Form.useForm();
  const [departments, setDepartments] = useState([]);
  const [positions, setPositions] = useState([]);
  const [filters, setFilters] = useState({
    department: '',
    status: 'Hoạt động',
    search: '',
  });

  useEffect(() => { loadEmployees(); }, [filters]);
  useEffect(() => {
    Promise.all([
      settingsAPI.getCatalogs({ type: 'DEPARTMENT' }),
      settingsAPI.getCatalogs({ type: 'EMPLOYEE_POSITION' }),
    ]).then(([d,p]) => { setDepartments(d.data || []); setPositions(p.data || []); })
      .catch(e => message.warning(e.message || 'Không thể tải danh mục nhân sự'));
  }, []);

  const loadEmployees = async () => {
    setLoading(true);
    try {
      const response = await employeeAPI.getAll(filters);
      setEmployees(response.data);
    } catch (error) {
      message.error('Không thể tải danh sách nhân viên');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingEmployee(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record) => {
    setEditingEmployee(record);
    form.setFieldsValue({
      ...record,
      hire_date: record.hire_date ? dayjs(record.hire_date) : null,
    });
    setModalVisible(true);
  };

  const handleDelete = async (id) => {
    try {
      await employeeAPI.delete(id);
      message.success('Xóa nhân viên thành công');
      loadEmployees();
    } catch (error) {
      message.error('Không thể xóa nhân viên');
    }
  };

  const handleSubmit = async (values) => {
    try {
      const data = {
        ...values,
        hire_date: values.hire_date?.format('YYYY-MM-DD'),
      };

      if (editingEmployee) {
        await employeeAPI.update(editingEmployee.id, data);
        message.success('Cập nhật nhân viên thành công');
      } else {
        await employeeAPI.create(data);
        message.success('Tạo nhân viên thành công');
      }

      setModalVisible(false);
      form.resetFields();
      loadEmployees();
    } catch (error) {
      message.error(
        editingEmployee ? 'Không thể cập nhật nhân viên' : 'Không thể tạo nhân viên'
      );
    }
  };

  const columns = [
    {
      title: 'Mã NV',
      dataIndex: 'employee_code',
      key: 'employee_code',
      width: 100,
      fixed: 'left',
    },
    {
      title: 'Nhân viên',
      key: 'employee',
      width: 200,
      fixed: 'left',
      render: (_, record) => (
        <Space>
          <Avatar
            size={40}
            icon={<UserOutlined />}
            src={record.avatar_url}
            style={{ backgroundColor: '#1890ff' }}
          />
          <div>
            <div style={{ fontWeight: 500 }}>{record.full_name}</div>
            <div style={{ fontSize: 12, color: '#999' }}>
              {record.employee_code}
            </div>
          </div>
        </Space>
      ),
    },
    {
      title: 'Vị trí',
      dataIndex: 'position',
      key: 'position',
      width: 150,
    },
    {
      title: 'Phòng ban',
      dataIndex: 'department',
      key: 'department',
      width: 130,
      render: (dept) => <Tag color="blue">{dept}</Tag>,
    },
    {
      title: 'Liên hệ',
      key: 'contact',
      width: 180,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          {record.phone && (
            <div>
              <PhoneOutlined style={{ marginRight: 8, color: '#1890ff' }} />
              {record.phone}
            </div>
          )}
          {record.email && (
            <div>
              <MailOutlined style={{ marginRight: 8, color: '#1890ff' }} />
              {record.email}
            </div>
          )}
        </Space>
      ),
    },
    {
      title: 'Lương',
      dataIndex: 'salary',
      key: 'salary',
      width: 130,
      align: 'right',
      render: (salary) => {
        if (!salary) return '-';
        return new Intl.NumberFormat('vi-VN', {
          style: 'currency',
          currency: 'VND',
        }).format(salary);
      },
    },
    {
      title: 'Ngày vào',
      dataIndex: 'hire_date',
      key: 'hire_date',
      width: 120,
      render: (date) => (date ? dayjs(date).format('DD/MM/YYYY') : '-'),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status) => {
        const color = status === 'Hoạt động' ? 'success' : 'default';
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: 'Hành động',
      key: 'action',
      width: 150,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="Xem chi tiết">
            <Button
              type="link"
              icon={<EyeOutlined />}
              onClick={() => navigate(`/employees/${record.id}`)}
              size="small"
            />
          </Tooltip>
          <Tooltip title="Chỉnh sửa">
            <Button
              type="link"
              icon={<EditOutlined />}
              onClick={() => handleEdit(record)}
              size="small"
            />
          </Tooltip>
          <Tooltip title="Xóa">
            <Popconfirm
              title="Bạn có chắc muốn xóa nhân viên này?"
              onConfirm={() => handleDelete(record.id)}
              okText="Xóa"
              cancelText="Hủy"
            >
              <Button type="link" danger icon={<DeleteOutlined />} size="small" />
            </Popconfirm>
          </Tooltip>
        </Space>
      ),
    },
  ];

  // Calculate statistics
  const stats = {
    total: employees.length,
    sanxuat: employees.filter((e) => e.department === 'Sản xuất').length,
    lapdat: employees.filter((e) => e.department === 'Lắp đặt').length,
    thietke: employees.filter((e) => e.department === 'Thiết kế').length,
    hanhchinh: employees.filter((e) => e.department === 'Hành chính').length,
  };

  return (
    <div>
      <div className="page-header">
        <h1>Quản lý Nhân viên</h1>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          Thêm nhân viên
        </Button>
      </div>

      {/* Statistics */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={8} lg={4}>
          <Card>
            <Statistic
              title="Tổng số"
              value={stats.total}
              prefix={<TeamOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8} lg={5}>
          <Card>
            <Statistic
              title="Sản xuất"
              value={stats.sanxuat}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8} lg={5}>
          <Card>
            <Statistic
              title="Lắp đặt"
              value={stats.lapdat}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8} lg={5}>
          <Card>
            <Statistic
              title="Thiết kế"
              value={stats.thietke}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8} lg={5}>
          <Card>
            <Statistic
              title="Hành chính"
              value={stats.hanhchinh}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Filters */}
      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Search
            placeholder="Tìm kiếm nhân viên..."
            onSearch={(value) => setFilters({ ...filters, search: value })}
            style={{ width: 300 }}
            allowClear
          />
          <Select
            placeholder="Phòng ban"
            style={{ width: 150 }}
            allowClear
            value={filters.department || undefined}
            onChange={(value) =>
              setFilters({ ...filters, department: value || '' })
            }
          >
            {departments.map((item) => (
              <Option key={item.id} value={item.name}>
                {item.name}
              </Option>
            ))}
          </Select>
          <Select
            placeholder="Trạng thái"
            style={{ width: 150 }}
            value={filters.status}
            onChange={(value) => setFilters({ ...filters, status: value })}
          >
            <Option value="">Tất cả</Option>
            <Option value="Hoạt động">Hoạt động</Option>
            <Option value="Nghỉ việc">Nghỉ việc</Option>
            <Option value="Tạm nghỉ">Tạm nghỉ</Option>
          </Select>
        </Space>
      </Card>

      {/* Table */}
      <Card>
        <Table
          columns={columns}
          dataSource={employees}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1200 }}
          pagination={{
            showSizeChanger: true,
            showTotal: (total) => `Tổng ${total} nhân viên`,
          }}
        />
      </Card>

      {/* Create/Edit Modal */}
      <Modal
        title={editingEmployee ? 'Cập nhật nhân viên' : 'Thêm nhân viên mới'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width={800}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="full_name"
                label="Họ và tên"
                rules={[
                  { required: true, message: 'Vui lòng nhập họ tên' },
                ]}
              >
                <Input placeholder="Nguyễn Văn A" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="phone"
                label="Số điện thoại"
                rules={[
                  { pattern: /^[0-9]{10}$/, message: 'Số điện thoại không hợp lệ' }
                ]}
              >
                <Input placeholder="0901234567" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="email"
                label="Email"
                rules={[
                  { type: 'email', message: 'Email không hợp lệ' }
                ]}
              >
                <Input placeholder="email@example.com" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="id_number" label="CMND/CCCD">
                <Input placeholder="123456789" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="position"
                label="Vị trí"
                rules={[
                  { required: true, message: 'Vui lòng chọn vị trí' },
                ]}
              >
                <Select placeholder="Chọn vị trí">
                  {positions.map((pos) => (
                    <Option key={pos.id} value={pos.name}>{pos.name}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="department"
                label="Phòng ban"
                rules={[
                  { required: true, message: 'Vui lòng chọn phòng ban' },
                ]}
              >
                <Select placeholder="Chọn phòng ban">
                  {departments.map((dept) => (
                    <Option key={dept.id} value={dept.name}>{dept.name}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="salary" label="Lương (VNĐ)">
                <InputNumber
                  style={{ width: '100%' }}
                  formatter={(value) =>
                    `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                  }
                  parser={(value) => value.replace(/\$\s?|(,*)/g, '')}
                  placeholder="10000000"
                  min={0}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="hire_date" label="Ngày vào làm">
                <DatePicker
                  format="DD/MM/YYYY"
                  style={{ width: '100%' }}
                  placeholder="Chọn ngày"
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="address" label="Địa chỉ">
            <Input.TextArea rows={2} placeholder="Địa chỉ thường trú" />
          </Form.Item>

          <Form.Item name="notes" label="Ghi chú">
            <Input.TextArea rows={2} placeholder="Ghi chú thêm" />
          </Form.Item>

          {editingEmployee && (
            <Form.Item name="status" label="Trạng thái">
              <Select>
                <Option value="Hoạt động">Hoạt động</Option>
                <Option value="Tạm nghỉ">Tạm nghỉ</Option>
                <Option value="Nghỉ việc">Nghỉ việc</Option>
              </Select>
            </Form.Item>
          )}

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                {editingEmployee ? 'Cập nhật' : 'Thêm mới'}
              </Button>
              <Button onClick={() => setModalVisible(false)}>Hủy</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default EmployeeList;
