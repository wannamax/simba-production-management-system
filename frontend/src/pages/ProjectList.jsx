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
  Transfer,
  Divider,
  Typography,
  Spin
} from 'antd';
import {
  PlusOutlined,
  EyeOutlined,
  EditOutlined,
  DeleteOutlined,
  ProjectOutlined,
  TeamOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import axios from 'axios';
import {
  PROJECT_STATUS_COLORS,
  PROJECT_TYPES,
  PRIORITY_COLORS,
  formatCurrency
} from '../utils/constants';

const { Search } = Input;
const { Option } = Select;
const { Text } = Typography;

const API_URL = import.meta.env.VITE_API_URL || '/api';

const ProjectList = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [form] = Form.useForm();
  
  // For employee transfer
  const [selectedEmployees, setSelectedEmployees] = useState([]);
  const [employeeAssignments, setEmployeeAssignments] = useState({});
  
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0,
  });
  const [filters, setFilters] = useState({
    status: '',
    search: '',
    project_type: '',
  });

  useEffect(() => {
    loadProjects();
    loadCustomers();
  }, [filters, pagination.current]);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/projects`, {
        params: {
          ...filters,
          page: pagination.current,
          limit: pagination.pageSize,
        }
      });
      setProjects(response.data.data);
      setPagination((prev) => ({
        ...prev,
        total: response.data.pagination.total,
      }));
    } catch (error) {
      message.error('Không thể tải danh sách dự án');
      console.error('Load projects error:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCustomers = async () => {
    try {
      const response = await axios.get(`${API_URL}/customers`);
      setCustomers(response.data.data || response.data);
    } catch (error) {
      console.error('Error loading customers:', error);
    }
  };

  const loadEmployees = async () => {
    setEmployeesLoading(true);
    try {
      const response = await axios.get(`${API_URL}/employees`, {
        params: { status: 'Hoạt động' }
      });
      setEmployees(response.data.data || response.data);
    } catch (error) {
      console.error('Error loading employees:', error);
      message.error('Không thể tải danh sách nhân viên');
    } finally {
      setEmployeesLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingProject(null);
    setSelectedEmployees([]);
    setEmployeeAssignments({});
    form.resetFields();
    setModalVisible(true);
    
    // Load employees when modal opens
    if (employees.length === 0) {
      loadEmployees();
    }
  };

  const handleEdit = async (record) => {
    setEditingProject(record);
    setModalVisible(true);
    
    // Load employees if not loaded
    if (employees.length === 0) {
      loadEmployees();
    }
    
    // Load assigned employees for this project
    try {
      const response = await axios.get(`${API_URL}/projects/${record.id}`);
      const projectData = response.data.data;
      
      form.setFieldsValue({
        ...projectData,
        start_date: projectData.start_date ? dayjs(projectData.start_date) : null,
        end_date: projectData.end_date ? dayjs(projectData.end_date) : null,
      });
      
      // Set selected employees
      if (projectData.employees && projectData.employees.length > 0) {
        const employeeIds = projectData.employees.map(emp => emp.employee_id || emp.id);
        setSelectedEmployees(employeeIds);
        
        // Set employee roles
        const assignments = {};
        projectData.employees.forEach(emp => {
          const empId = emp.employee_id || emp.id;
          assignments[empId] = emp.role || 'Thành viên';
        });
        setEmployeeAssignments(assignments);
      } else {
        setSelectedEmployees([]);
        setEmployeeAssignments({});
      }
    } catch (error) {
      message.error('Không thể tải thông tin dự án');
      console.error('Load project error:', error);
    }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API_URL}/projects/${id}`);
      message.success('Xóa dự án thành công');
      loadProjects();
    } catch (error) {
      message.error('Không thể xóa dự án');
    }
  };

  const handleSubmit = async (values) => {
    try {
      const data = {
        ...values,
        start_date: values.start_date?.format('YYYY-MM-DD'),
        end_date: values.end_date?.format('YYYY-MM-DD'),
      };

      let projectId;

      if (editingProject) {
        await axios.put(`${API_URL}/projects/${editingProject.id}`, data);
        projectId = editingProject.id;
        message.success('Cập nhật dự án thành công');
      } else {
        const response = await axios.post(`${API_URL}/projects`, data);
        projectId = response.data.data.id;
        message.success('Tạo dự án thành công');
      }

      // Update employee assignments
      if (selectedEmployees.length > 0) {
        await updateEmployeeAssignments(projectId);
      } else if (editingProject) {
        // Remove all assignments if no employees selected
        await removeAllAssignments(projectId);
      }

      setModalVisible(false);
      form.resetFields();
      setSelectedEmployees([]);
      setEmployeeAssignments({});
      loadProjects();
    } catch (error) {
      message.error(
        editingProject ? 'Không thể cập nhật dự án' : 'Không thể tạo dự án'
      );
      console.error('Submit error:', error);
    }
  };

  const updateEmployeeAssignments = async (projectId) => {
    try {
      // First, get current assignments if editing
      let currentAssignments = [];
      if (editingProject) {
        try {
          const response = await axios.get(`${API_URL}/projects/${projectId}/assignments`);
          currentAssignments = response.data.data || [];
        } catch (error) {
          console.log('No current assignments or error:', error);
        }
      }

      // Remove employees that are no longer selected
      for (const emp of currentAssignments) {
        const empId = emp.employee_id || emp.id;
        if (!selectedEmployees.includes(empId)) {
          try {
            await axios.delete(`${API_URL}/projects/${projectId}/assignments/${emp.id}`);
          } catch (error) {
            console.error('Error removing assignment:', error);
          }
        }
      }

      // Add or update selected employees
      for (const employeeId of selectedEmployees) {
        const role = employeeAssignments[employeeId] || 'Thành viên';
        
        const existing = currentAssignments.find(e => {
          const eId = e.employee_id || e.id;
          return eId === employeeId;
        });
        
        if (existing) {
          // Update role if changed
          if (existing.role !== role) {
            try {
              await axios.put(`${API_URL}/projects/${projectId}/assignments/${existing.id}`, {
                role: role,
                notes: ''
              });
            } catch (error) {
              console.error('Error updating assignment:', error);
            }
          }
        } else {
          // Add new assignment
          try {
            await axios.post(`${API_URL}/projects/${projectId}/assignments`, {
              employee_id: employeeId,
              role: role,
              notes: ''
            });
          } catch (error) {
            console.error('Error adding assignment:', error);
          }
        }
      }
    } catch (error) {
      console.error('Error updating assignments:', error);
      message.warning('Có lỗi khi cập nhật phân công nhân sự');
    }
  };

  const removeAllAssignments = async (projectId) => {
    try {
      const response = await axios.get(`${API_URL}/projects/${projectId}/assignments`);
      const assignments = response.data.data || [];
      
      for (const assignment of assignments) {
        await axios.delete(`${API_URL}/projects/${projectId}/assignments/${assignment.id}`);
      }
    } catch (error) {
      console.error('Error removing all assignments:', error);
    }
  };

  const handleEmployeeChange = (targetKeys) => {
    setSelectedEmployees(targetKeys);
    
    // Initialize role for new employees
    const newAssignments = { ...employeeAssignments };
    targetKeys.forEach(key => {
      if (!newAssignments[key]) {
        newAssignments[key] = 'Thành viên';
      }
    });
    setEmployeeAssignments(newAssignments);
  };

  const handleRoleChange = (employeeId, role) => {
    setEmployeeAssignments(prev => ({
      ...prev,
      [employeeId]: role
    }));
  };

  const columns = [
    {
      title: 'Mã dự án',
      dataIndex: 'project_code',
      key: 'project_code',
      width: 130,
      fixed: 'left',
    },
    {
      title: 'Tên dự án',
      dataIndex: 'project_name',
      key: 'project_name',
      width: 250,
      ellipsis: true,
    },
    {
      title: 'Loại',
      dataIndex: 'project_type',
      key: 'project_type',
      width: 120,
    },
    {
      title: 'Khách hàng',
      dataIndex: 'company_name',
      key: 'company_name',
      width: 200,
      ellipsis: true,
    },
    {
      title: 'Ngày bắt đầu',
      dataIndex: 'start_date',
      key: 'start_date',
      width: 120,
      render: (date) => (date ? dayjs(date).format('DD/MM/YYYY') : '-'),
    },
    {
      title: 'Ngân sách',
      dataIndex: 'budget',
      key: 'budget',
      width: 130,
      align: 'right',
      render: (value) => formatCurrency(value),
    },
    {
      title: 'Ưu tiên',
      dataIndex: 'priority',
      key: 'priority',
      width: 110,
      render: (priority) => (
        <Tag color={PRIORITY_COLORS[priority]}>{priority}</Tag>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (status) => (
        <Tag color={PROJECT_STATUS_COLORS[status]}>{status}</Tag>
      ),
    },
    {
      title: 'Hành động',
      key: 'action',
      width: 150,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/projects/${record.id}`)}
            size="small"
          >
            Xem
          </Button>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
            size="small"
          />
          <Popconfirm
            title="Bạn có chắc muốn xóa dự án này?"
            onConfirm={() => handleDelete(record.id)}
            okText="Xóa"
            cancelText="Hủy"
          >
            <Button type="link" danger icon={<DeleteOutlined />} size="small" />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // Calculate statistics
  const stats = {
    total: pagination.total,
    new: projects.filter((p) => p.status === 'Mới tạo').length,
    inProgress: projects.filter(
      (p) => p.status === 'Đang sản xuất' || p.status === 'Đang lắp đặt'
    ).length,
    completed: projects.filter((p) => p.status === 'Hoàn thành').length,
  };

  // Prepare data for Transfer component
  const employeeDataSource = employees.map(emp => ({
    key: emp.id,
    title: `${emp.full_name} - ${emp.position}`,
    description: `${emp.department} | ${emp.phone || 'N/A'}`,
    department: emp.department,
  }));

  return (
    <div>
      <div className="page-header">
        <h1>Quản lý Dự án</h1>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          Tạo dự án mới
        </Button>
      </div>

      {/* Statistics */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Tổng số dự án"
              value={stats.total}
              prefix={<ProjectOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Mới tạo"
              value={stats.new}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Đang thực hiện"
              value={stats.inProgress}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Hoàn thành"
              value={stats.completed}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Filters */}
      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Search
            placeholder="Tìm kiếm dự án..."
            onSearch={(value) => {
              setFilters({ ...filters, search: value });
              setPagination({ ...pagination, current: 1 });
            }}
            style={{ width: 300 }}
            allowClear
          />
          <Select
            placeholder="Loại dự án"
            style={{ width: 150 }}
            allowClear
            onChange={(value) => {
              setFilters({ ...filters, project_type: value || '' });
              setPagination({ ...pagination, current: 1 });
            }}
          >
            {PROJECT_TYPES.map((type) => (
              <Option key={type} value={type}>
                {type}
              </Option>
            ))}
          </Select>
          <Select
            placeholder="Trạng thái"
            style={{ width: 150 }}
            allowClear
            onChange={(value) => {
              setFilters({ ...filters, status: value || '' });
              setPagination({ ...pagination, current: 1 });
            }}
          >
            <Option value="Mới tạo">Mới tạo</Option>
            <Option value="Đang thiết kế">Đang thiết kế</Option>
            <Option value="Đang sản xuất">Đang sản xuất</Option>
            <Option value="Đang lắp đặt">Đang lắp đặt</Option>
            <Option value="Hoàn thành">Hoàn thành</Option>
            <Option value="Hủy">Hủy</Option>
          </Select>
        </Space>
      </Card>

      {/* Table */}
      <Card>
        <Table
          columns={columns}
          dataSource={projects}
          rowKey="id"
          loading={loading}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            showTotal: (total) => `Tổng ${total} dự án`,
            onChange: (page, pageSize) => {
              setPagination({ ...pagination, current: page, pageSize });
            }
          }}
          scroll={{ x: 1400 }}
        />
      </Card>

      {/* Create/Edit Modal */}
      <Modal
        title={editingProject ? 'Cập nhật dự án' : 'Tạo dự án mới'}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          setSelectedEmployees([]);
          setEmployeeAssignments({});
        }}
        footer={null}
        width={1000}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Divider orientation="left">
            <ProjectOutlined /> Thông tin dự án
          </Divider>
          
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="project_name"
                label="Tên dự án"
                rules={[
                  { required: true, message: 'Vui lòng nhập tên dự án' },
                ]}
              >
                <Input placeholder="Nhập tên dự án" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="project_type"
                label="Loại dự án"
                rules={[
                  { required: true, message: 'Vui lòng chọn loại dự án' },
                ]}
              >
                <Select placeholder="Chọn loại dự án">
                  {PROJECT_TYPES.map((type) => (
                    <Option key={type} value={type}>
                      {type}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="customer_id"
            label="Khách hàng"
            rules={[{ required: true, message: 'Vui lòng chọn khách hàng' }]}
          >
            <Select
              placeholder="Chọn khách hàng"
              showSearch
              optionFilterProp="children"
              filterOption={(input, option) =>
                option.children.toLowerCase().includes(input.toLowerCase())
              }
            >
              {customers.map((c) => (
                <Option key={c.id} value={c.id}>
                  {c.company_name}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="start_date" label="Ngày bắt đầu">
                <DatePicker
                  format="DD/MM/YYYY"
                  style={{ width: '100%' }}
                  placeholder="Chọn ngày"
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="end_date" label="Ngày kết thúc">
                <DatePicker
                  format="DD/MM/YYYY"
                  style={{ width: '100%' }}
                  placeholder="Chọn ngày"
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="priority" label="Ưu tiên" initialValue="Trung bình">
                <Select placeholder="Chọn mức độ ưu tiên">
                  <Option value="Thấp">Thấp</Option>
                  <Option value="Trung bình">Trung bình</Option>
                  <Option value="Cao">Cao</Option>
                  <Option value="Khẩn cấp">Khẩn cấp</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="budget" label="Ngân sách (VNĐ)">
            <InputNumber
              style={{ width: '100%' }}
              formatter={(value) =>
                `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
              }
              parser={(value) => value.replace(/\$\s?|(,*)/g, '')}
              placeholder="Nhập ngân sách"
              min={0}
            />
          </Form.Item>

          <Form.Item name="description" label="Mô tả">
            <Input.TextArea rows={4} placeholder="Nhập mô tả dự án" />
          </Form.Item>

          <Divider orientation="left">
            <TeamOutlined /> Phân công nhân sự ({selectedEmployees.length} người)
          </Divider>

          {employeesLoading ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <Spin tip="Đang tải danh sách nhân viên..." />
            </div>
          ) : (
            <>
              <Transfer
                dataSource={employeeDataSource}
                titles={['Danh sách nhân viên', 'Nhân sự dự án']}
                targetKeys={selectedEmployees}
                onChange={handleEmployeeChange}
                render={item => item.title}
                showSearch
                filterOption={(inputValue, item) =>
                  item.title.toLowerCase().indexOf(inputValue.toLowerCase()) !== -1 ||
                  item.description.toLowerCase().indexOf(inputValue.toLowerCase()) !== -1
                }
                listStyle={{
                  width: 450,
                  height: 400,
                }}
                locale={{
                  itemUnit: 'người',
                  itemsUnit: 'người',
                  searchPlaceholder: 'Tìm kiếm nhân viên...',
                  notFoundContent: 'Không tìm thấy'
                }}
              />

              {selectedEmployees.length > 0 && (
                <Card 
                  size="small" 
                  title="Vai trò nhân sự" 
                  style={{ marginTop: 16 }}
                >
                  {selectedEmployees.map(empId => {
                    const emp = employees.find(e => e.id === empId);
                    return emp ? (
                      <Row key={empId} style={{ marginBottom: 8 }} gutter={16} align="middle">
                        <Col span={12}>
                          <Text strong>{emp.full_name}</Text>
                          <br />
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {emp.position} - {emp.department}
                          </Text>
                        </Col>
                        <Col span={12}>
                          <Select
                            style={{ width: '100%' }}
                            value={employeeAssignments[empId] || 'Thành viên'}
                            onChange={(value) => handleRoleChange(empId, value)}
                            placeholder="Chọn vai trò"
                          >
                            <Option value="Quản lý dự án">Quản lý dự án</Option>
                            <Option value="Trưởng nhóm sản xuất">Trưởng nhóm sản xuất</Option>
                            <Option value="Trưởng nhóm lắp đặt">Trưởng nhóm lắp đặt</Option>
                            <Option value="Thiết kế">Thiết kế</Option>
                            <Option value="Thợ sản xuất">Thợ sản xuất</Option>
                            <Option value="Thợ lắp đặt">Thợ lắp đặt</Option>
                            <Option value="Thành viên">Thành viên</Option>
                          </Select>
                        </Col>
                      </Row>
                    ) : null;
                  })}
                </Card>
              )}
            </>
          )}

          <Divider />

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={loading}>
                {editingProject ? 'Cập nhật' : 'Tạo mới'}
              </Button>
              <Button onClick={() => {
                setModalVisible(false);
                setSelectedEmployees([]);
                setEmployeeAssignments({});
              }}>
                Hủy
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ProjectList;