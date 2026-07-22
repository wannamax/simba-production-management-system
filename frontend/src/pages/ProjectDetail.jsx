import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Descriptions,
  Tag,
  Button,
  Tabs,
  Table,
  Space,
  Progress,
  Spin,
  Empty,
  message,
  Modal,
  Form,
  Input,
  Select,
  DatePicker,
  InputNumber,
  Popconfirm,
  Row,
  Col,
  Alert
} from 'antd';
import {
  ArrowLeftOutlined,
  EditOutlined,
  CalendarOutlined,
  TeamOutlined,
  FileTextOutlined,
  InboxOutlined,
  PlusOutlined,
  ToolOutlined,
  AuditOutlined,
  DeleteOutlined,
  CheckCircleOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import axios from 'axios';
import ProjectMaterialsPanel from '../components/ProjectMaterialsPanel';
import ProjectCloseoutPanel from '../components/ProjectCloseoutPanel';
import ProjectDailyLogsPanel from '../components/ProjectDailyLogsPanel';
import ProjectExecutionPanel from '../components/ProjectExecutionPanel';
import { workCatalogAPI } from '../services/api';

const { TabPane } = Tabs;
const { Option } = Select;

const API_URL = import.meta.env.VITE_API_URL || '/api';

const PROJECT_STATUS_COLORS = {
  'Mới tạo': 'blue',
  'Đang thiết kế': 'cyan',
  'Đang sản xuất': 'orange',
  'Đang lắp đặt': 'purple',
  'Hoàn thành': 'green',
  'Hủy': 'red'
};

const formatCurrency = (value) => {
  if (!value) return '0 ₫';
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND'
  }).format(value);
};

const totalActualCost = project => Number(project?.actual_cost || 0) + Number(project?.actual_material_cost || 0);

const ProjectDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState(''); // 'employee', 'product', 'task'
  const [form] = Form.useForm();
  const [basicForm] = Form.useForm();
  const [employees, setEmployees] = useState([]);
  const [roles, setRoles] = useState([]);
  const [editingAssignment, setEditingAssignment] = useState(null);
  const [editingProduct, setEditingProduct] = useState(null);
  const [basicModalVisible, setBasicModalVisible] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [projectTypes, setProjectTypes] = useState([]);

  useEffect(() => {
    loadProject();
    loadEmployees();
    workCatalogAPI.getRoles().then(response=>setRoles(response.data||[])).catch(()=>{});
  }, [id]);

  const loadProject = async () => {
    try {
      const response = await axios.get(`${API_URL}/projects/${id}`);
      setProject(response.data.data);
    } catch (error) {
      message.error('Không thể tải thông tin dự án');
      navigate('/projects');
    } finally {
      setLoading(false);
    }
  };

  const loadEmployees = async () => {
    try {
      const response = await axios.get(`${API_URL}/employees`);
      setEmployees(response.data.data);
    } catch (error) {
      console.error('Error loading employees:', error);
    }
  };

  const handleAddEmployee = () => {
    setEditingAssignment(null);
    setModalType('employee');
    form.resetFields();
    setModalVisible(true);
  };

  const handleAddProduct = () => {
    setEditingProduct(null);
    setModalType('product');
    form.resetFields();
    setModalVisible(true);
  };

  const handleEditEmployee = record => {
    setEditingAssignment(record);
    setModalType('employee');
    form.setFieldsValue({employee_id:record.employee_id,role:record.role,notes:record.notes});
    setModalVisible(true);
  };

  const handleRemoveEmployee = async record => {
    try{
      await axios.delete(`${API_URL}/projects/${id}/assignments/${record.id}`);
      message.success('Đã loại nhân viên khỏi dự án');
      loadProject();
    }catch(error){message.error(error.response?.data?.message||'Không thể loại nhân viên');}
  };

  const handleEditProduct = record => {
    setEditingProduct(record);
    setModalType('product');
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleRemoveProduct = async record => {
    try{
      await axios.delete(`${API_URL}/projects/${id}/products/${record.id}`);
      message.success('Đã xóa sản phẩm');
      loadProject();
    }catch(error){message.error(error.response?.data?.message||'Không thể xóa sản phẩm');}
  };

  const openBasicEdit = async () => {
    try{
      const [customerResponse,typeResponse]=await Promise.all([
        axios.get(`${API_URL}/customers`,{params:{limit:1000}}),
        workCatalogAPI.getProjectTypes(),
      ]);
      setCustomers(customerResponse.data.data||[]);
      setProjectTypes(typeResponse.data||[]);
      basicForm.setFieldsValue({...project,start_date:project.start_date?dayjs(project.start_date):null,end_date:project.end_date?dayjs(project.end_date):null});
      setBasicModalVisible(true);
    }catch(error){message.error('Không thể mở thông tin chỉnh sửa');}
  };

  const saveBasicProject = async values => {
    try{
      await axios.put(`${API_URL}/projects/${id}`,{...values,start_date:values.start_date?.format('YYYY-MM-DD')||null,end_date:values.end_date?.format('YYYY-MM-DD')||null});
      message.success('Đã cập nhật thông tin cơ bản');
      setBasicModalVisible(false);
      loadProject();
    }catch(error){message.error(error.response?.data?.message||'Không thể cập nhật dự án');}
  };

  const handleModalSubmit = async (values) => {
    try {
      if (modalType === 'employee') {
        if(editingAssignment) await axios.put(`${API_URL}/projects/${id}/assignments/${editingAssignment.id}`,values);
        else await axios.post(`${API_URL}/projects/${id}/assignments`, values);
        message.success(editingAssignment?'Đã cập nhật vai trò':'Phân công nhân viên thành công');
      } else if (modalType === 'product') {
        const payload={
          ...values,
          total_price: values.quantity * values.unit_price
        };
        if(editingProduct) await axios.put(`${API_URL}/projects/${id}/products/${editingProduct.id}`,payload);
        else await axios.post(`${API_URL}/projects/${id}/products`,payload);
        message.success(editingProduct?'Đã cập nhật sản phẩm':'Thêm sản phẩm thành công');
      }
      setModalVisible(false);
      form.resetFields();
      loadProject();
    } catch (error) {
      message.error('Có lỗi xảy ra');
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!project) {
    return <Empty description="Không tìm thấy dự án" />;
  }

  const scheduleColumns = [
    {
      title: 'Loại',
      dataIndex: 'schedule_type',
      key: 'schedule_type',
      width: 120
    },
    {
      title: 'Tiêu đề',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true
    },
    {
      title: 'Địa điểm',
      dataIndex: 'location',
      key: 'location',
      ellipsis: true
    },
    {
      title: 'Thời gian',
      key: 'time',
      width: 180,
      render: (_, record) => (
        <div>
          {record.start_datetime ? dayjs(record.start_datetime).format('DD/MM/YYYY HH:mm') : '-'}
        </div>
      )
    },
    {
      title: 'Tiến độ',
      dataIndex: 'progress',
      key: 'progress',
      width: 150,
      render: (progress) => <Progress percent={progress || 0} size="small" />
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status) => <Tag>{status}</Tag>
    }
  ];

  const employeeColumns = [
    {
      title: 'Họ tên',
      dataIndex: 'full_name',
      key: 'full_name'
    },
    {
      title: 'Vai trò',
      dataIndex: 'role',
      key: 'role'
    },
    {
      title: 'Phòng ban',
      dataIndex: 'department',
      key: 'department'
    },
    {
      title: 'Chức vụ',
      dataIndex: 'position',
      key: 'position'
    },
    {
      title: 'SĐT',
      dataIndex: 'phone',
      key: 'phone'
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 120,
      render: (_,record) => <Space>
        <Button size="small" icon={<EditOutlined/>} onClick={()=>handleEditEmployee(record)}/>
        <Popconfirm title="Loại nhân viên khỏi dự án?" description="Hệ thống sẽ chặn nếu nhân viên còn Task hoặc lịch đang hoạt động." onConfirm={()=>handleRemoveEmployee(record)}><Button size="small" danger icon={<DeleteOutlined/>}/></Popconfirm>
      </Space>
    }
  ];

  const productColumns = [
    {
      title: 'Tên sản phẩm',
      dataIndex: 'product_name',
      key: 'product_name',
      ellipsis: true
    },
    {
      title: 'Loại',
      dataIndex: 'product_type',
      key: 'product_type',
      width: 150
    },
    {
      title: 'Số lượng',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 100,
      align: 'center'
    },
    {
      title: 'Đơn vị',
      dataIndex: 'unit',
      key: 'unit',
      width: 80
    },
    {
      title: 'Đơn giá',
      dataIndex: 'unit_price',
      key: 'unit_price',
      width: 150,
      align: 'right',
      render: (value) => formatCurrency(value)
    },
    {
      title: 'Thành tiền',
      dataIndex: 'total_price',
      key: 'total_price',
      width: 150,
      align: 'right',
      render: (value) => formatCurrency(value)
    },
    {
      title: 'Trạng thái SX',
      dataIndex: 'production_status',
      key: 'production_status',
      width: 130,
      render: (status) => <Tag>{status}</Tag>
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 120,
      render: (_,record) => <Space>
        <Button size="small" icon={<EditOutlined/>} onClick={()=>handleEditProduct(record)}/>
        <Popconfirm title="Xóa sản phẩm này?" onConfirm={()=>handleRemoveProduct(record)}><Button size="small" danger icon={<DeleteOutlined/>}/></Popconfirm>
      </Space>
    }
  ];

  return (
    <div>
      <div className="page-header">
        <Space>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/projects')}
          >
            Quay lại
          </Button>
          <h1>{project.project_name}</h1>
        </Space>
        <Button type="primary" icon={<EditOutlined />} onClick={openBasicEdit}>
          Sửa thông tin cơ bản
        </Button>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Descriptions column={{ xs: 1, sm: 2, md: 3 }}>
          <Descriptions.Item label="Mã dự án">
            {project.project_code}
          </Descriptions.Item>
          <Descriptions.Item label="Loại dự án">
            {project.project_type}
          </Descriptions.Item>
          <Descriptions.Item label="Trạng thái">
            <Tag color={PROJECT_STATUS_COLORS[project.status]}>
              {project.status}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Khách hàng">
            {project.company_name}
          </Descriptions.Item>
          <Descriptions.Item label="Người liên hệ">
            {project.contact_person || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="SĐT">
            {project.customer_phone || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="Ngày bắt đầu">
            {project.start_date ? dayjs(project.start_date).format('DD/MM/YYYY') : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="Ngày kết thúc">
            {project.end_date ? dayjs(project.end_date).format('DD/MM/YYYY') : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="Ưu tiên">
            <Tag>{project.priority || 'Trung bình'}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Ngân sách">
            {formatCurrency(project.budget)}
          </Descriptions.Item>
          <Descriptions.Item label="Chi phí thực tế">
            {formatCurrency(totalActualCost(project))}
          </Descriptions.Item>
          <Descriptions.Item label="Còn lại">
            {formatCurrency(Number(project.budget || 0) - totalActualCost(project))}
          </Descriptions.Item>
          <Descriptions.Item label="Trong đó: vật tư thực tế">
            {formatCurrency(project.actual_material_cost)}
          </Descriptions.Item>
          {project.description && (
            <Descriptions.Item label="Mô tả" span={3}>
              {project.description}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      <Tabs defaultActiveKey="schedules">
        <TabPane
          tab={
            <span>
              <CheckCircleOutlined />
              Công việc
            </span>
          }
          key="execution"
        >
          <ProjectExecutionPanel projectId={Number(id)} onOpenTasks={() => navigate(`/tasks?project_id=${id}`)} />
        </TabPane>
        <TabPane
          tab={
            <span>
              <FileTextOutlined />
              Nhật ký Dự án
            </span>
          }
          key="daily-logs"
        >
          <ProjectDailyLogsPanel projectId={Number(id)} />
        </TabPane>

        <TabPane
          tab={
            <span>
              <AuditOutlined />
              Đóng dự án
            </span>
          }
          key="closeout"
        >
          <ProjectCloseoutPanel projectId={Number(id)} onClosed={loadProject} />
        </TabPane>

        <TabPane
          tab={
            <span>
              <CalendarOutlined />
              Lịch trình ({project.schedules?.length || 0})
            </span>
          }
          key="schedules"
        >
          <Card
            extra={
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => navigate(`/schedules?project_id=${id}`)}
              >
                Thêm lịch trình
              </Button>
            }
          >
            <Table
              dataSource={project.schedules || []}
              columns={scheduleColumns}
              rowKey="id"
              pagination={false}
              scroll={{ x: 'max-content' }}
              locale={{ emptyText: 'Chưa có lịch trình' }}
            />
          </Card>
        </TabPane>

        <TabPane
          tab={
            <span>
              <TeamOutlined />
              Nhân sự ({project.employees?.length || 0})
            </span>
          }
          key="employees"
        >
          <Card
            extra={
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleAddEmployee}
              >
                Phân công nhân viên
              </Button>
            }
          >
            <Table
              dataSource={project.employees || []}
              columns={employeeColumns}
              rowKey="id"
              pagination={false}
              locale={{ emptyText: 'Chưa phân công nhân viên' }}
            />
          </Card>
        </TabPane>

        <TabPane
          tab={
            <span>
              <ToolOutlined />
              Vật tư
            </span>
          }
          key="materials"
        >
          <ProjectMaterialsPanel projectId={Number(id)} />
        </TabPane>

        <TabPane
          tab={
            <span>
              <InboxOutlined />
              Sản phẩm ({project.products?.length || 0})
            </span>
          }
          key="products"
        >
          <Card
            extra={
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleAddProduct}
              >
                Thêm sản phẩm
              </Button>
            }
          >
            <Table
              dataSource={project.products || []}
              columns={productColumns}
              rowKey="id"
              pagination={false}
              scroll={{ x: 'max-content' }}
              locale={{ emptyText: 'Chưa có sản phẩm' }}
              summary={(pageData) => {
                const total = pageData.reduce((sum, item) => sum + (item.total_price || 0), 0);
                return (
                  <Table.Summary fixed>
                    <Table.Summary.Row>
                      <Table.Summary.Cell index={0} colSpan={5} align="right">
                        <strong>Tổng cộng:</strong>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={5} align="right">
                        <strong>{formatCurrency(total)}</strong>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={6} />
                    </Table.Summary.Row>
                  </Table.Summary>
                );
              }}
            />
          </Card>
        </TabPane>
      </Tabs>

      {/* Modal for adding employee or product */}
      <Modal
        title={modalType === 'employee' ? (editingAssignment?'Cập nhật vai trò nhân viên':'Phân công nhân viên') : (editingProduct?'Cập nhật sản phẩm':'Thêm sản phẩm')}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleModalSubmit}>
          {modalType === 'employee' ? (
            <>
              <Form.Item
                name="employee_id"
                label="Nhân viên"
                rules={[{ required: true, message: 'Vui lòng chọn nhân viên' }]}
              >
                <Select
                  placeholder="Chọn nhân viên"
                  showSearch
                  optionFilterProp="children"
                  disabled={Boolean(editingAssignment)}
                >
                  {employees.map((emp) => (
                    <Option key={emp.id} value={emp.id}>
                      {emp.full_name} - {emp.position}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item
                name="role"
                label="Vai trò trong dự án"
                rules={[{ required: true, message: 'Vui lòng nhập vai trò' }]}
              >
                <Select placeholder="Chọn vai trò" options={roles.map(role=>({value:role.name,label:role.name}))}/>
              </Form.Item>
              <Form.Item name="notes" label="Ghi chú">
                <Input.TextArea rows={3} />
              </Form.Item>
            </>
          ) : (
            <>
              <Form.Item
                name="product_name"
                label="Tên sản phẩm"
                rules={[{ required: true, message: 'Vui lòng nhập tên sản phẩm' }]}
              >
                <Input placeholder="VD: Bảng hiệu LED 3x2m" />
              </Form.Item>
              <Form.Item
                name="product_type"
                label="Loại sản phẩm"
                rules={[{ required: true }]}
              >
                <Select placeholder="Chọn loại">
                  <Option value="Bảng hiệu">Bảng hiệu</Option>
                  <Option value="Kệ trưng bày">Kệ trưng bày</Option>
                  <Option value="Booth">Booth</Option>
                  <Option value="Standee">Standee</Option>
                </Select>
              </Form.Item>
              <Form.Item name="specifications" label="Thông số kỹ thuật">
                <Input.TextArea rows={2} placeholder="VD: 3m x 2m, chất liệu Inox gương" />
              </Form.Item>
              <Form.Item
                name="quantity"
                label="Số lượng"
                rules={[{ required: true }]}
                initialValue={1}
              >
                <InputNumber style={{ width: '100%' }} min={1} />
              </Form.Item>
              <Form.Item name="unit" label="Đơn vị" initialValue="Cái">
                <Input placeholder="Cái, Bộ, m2..." />
              </Form.Item>
              <Form.Item
                name="unit_price"
                label="Đơn giá"
                rules={[{ required: true }]}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  parser={(value) => value.replace(/\$\s?|(,*)/g, '')}
                  addonAfter="VNĐ"
                />
              </Form.Item>
              <Form.Item name="production_status" label="Trạng thái sản xuất" initialValue="Chưa sản xuất">
                <Select options={['Chưa sản xuất','Đang sản xuất','Hoàn thành','Tạm dừng'].map(value=>({value,label:value}))}/>
              </Form.Item>
            </>
          )}
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                {modalType === 'employee' ? (editingAssignment?'Cập nhật':'Phân công') : (editingProduct?'Cập nhật':'Thêm')}
              </Button>
              <Button onClick={() => setModalVisible(false)}>Hủy</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="Sửa thông tin cơ bản Dự án" open={basicModalVisible} onCancel={()=>setBasicModalVisible(false)} footer={null} width={760} destroyOnClose>
        <Alert showIcon type="info" message="Nhân sự, Vật tư, Sản phẩm và Lịch trình được quản lý trực tiếp trong các tab bên dưới." style={{marginBottom:16}}/>
        <Form form={basicForm} layout="vertical" onFinish={saveBasicProject}>
          <Row gutter={16}><Col span={12}><Form.Item name="project_name" label="Tên dự án" rules={[{required:true}]}><Input/></Form.Item></Col><Col span={12}><Form.Item name="project_type" label="Loại dự án" rules={[{required:true}]}><Select options={projectTypes.map(type=>({value:type.name,label:type.name}))}/></Form.Item></Col></Row>
          <Form.Item name="customer_id" label="Khách hàng" rules={[{required:true}]}><Select showSearch optionFilterProp="label" options={customers.map(customer=>({value:customer.id,label:customer.company_name}))}/></Form.Item>
          <Row gutter={16}><Col span={8}><Form.Item name="start_date" label="Ngày bắt đầu"><DatePicker format="DD/MM/YYYY" style={{width:'100%'}}/></Form.Item></Col><Col span={8}><Form.Item name="end_date" label="Ngày kết thúc"><DatePicker format="DD/MM/YYYY" style={{width:'100%'}}/></Form.Item></Col><Col span={8}><Form.Item name="priority" label="Ưu tiên"><Select options={['Thấp','Trung bình','Cao','Khẩn cấp'].map(value=>({value,label:value}))}/></Form.Item></Col></Row>
          <Row gutter={16}><Col span={12}><Form.Item name="status" label="Trạng thái"><Select options={['Mới tạo','Đang thiết kế','Đang sản xuất','Đang lắp đặt','Hoàn thành','Hủy'].map(value=>({value,label:value}))}/></Form.Item></Col><Col span={12}><Form.Item name="budget" label="Ngân sách"><InputNumber min={0} style={{width:'100%'}}/></Form.Item></Col></Row>
          <Form.Item name="description" label="Mô tả"><Input.TextArea rows={3}/></Form.Item>
          <Space><Button type="primary" htmlType="submit">Lưu thông tin</Button><Button onClick={()=>setBasicModalVisible(false)}>Hủy</Button></Space>
        </Form>
      </Modal>
    </div>
  );
};

export default ProjectDetail;
