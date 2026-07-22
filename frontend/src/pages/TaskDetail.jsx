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
  Modal,
  Form,
  Input,
  DatePicker,
  TimePicker,
  Select,
  Upload,
  message,
  InputNumber,
  Tooltip,
  Badge,
  Popconfirm,
  Empty,
  Row,
  Col
} from 'antd';
import {
  ArrowLeftOutlined,
  EditOutlined,
  PlusOutlined,
  UploadOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  EnvironmentOutlined,
  UserAddOutlined,
  FileTextOutlined,
  DownloadOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import axios from 'axios';
import Papa from 'papaparse';
import TaskReportTab from '../components/TaskReportTab';
import EditableLocationTable from '../components/EditableLocationTable';
import AssignmentWorkCalendar, { enumerateWorkDates } from '../components/AssignmentWorkCalendar';
import ProjectExecutionPanel from '../components/ProjectExecutionPanel';
import { workCatalogAPI } from '../services/api';
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  CloseCircleOutlined
} from '@ant-design/icons';
const { Option } = Select;
const { TextArea } = Input;

const API_URL = import.meta.env.VITE_API_URL || '/api';

const TaskDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [locationModalVisible, setLocationModalVisible] = useState(false);
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState(null);
  const [csvModalVisible, setCsvModalVisible] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [projectEmployees, setProjectEmployees] = useState([]);
  const [projectRoles, setProjectRoles] = useState([]);
  const [locationForm] = Form.useForm();
  const [assignForm] = Form.useForm();
const [actionModalVisible, setActionModalVisible] = useState(false);
const [actionType, setActionType] = useState(''); // 'pause', 'resume', 'cancel'
const [actionForm] = Form.useForm();
  useEffect(() => {
    loadTask();
    loadEmployees();
  }, [id]);
const handlePauseTask = async () => {
  try {
    const values = await actionForm.validateFields();
    await axios.patch(`${API_URL}/tasks/${id}/pause`, {
      pause_reason: values.reason
    });
    message.success('Đã tạm dừng nhiệm vụ. Nhân viên đã được giải phóng.');
    setActionModalVisible(false);
    actionForm.resetFields();
    loadTask();
  } catch (error) {
    message.error('Không thể tạm dừng nhiệm vụ');
  }
};

const handleResumeTask = async () => {
  try {
    await axios.patch(`${API_URL}/tasks/${id}/resume`);
    message.success('Đã tiếp tục nhiệm vụ. Nhân viên đã được gán lại.');
    loadTask();
  } catch (error) {
    message.error('Không thể tiếp tục nhiệm vụ');
  }
};

const handleCancelTask = async () => {
  try {
    const values = await actionForm.validateFields();
    await axios.patch(`${API_URL}/tasks/${id}/cancel`, {
      cancel_reason: values.reason
    });
    message.success('Đã hủy nhiệm vụ. Nhân viên đã được giải phóng.');
    setActionModalVisible(false);
    actionForm.resetFields();
    navigate('/tasks');
  } catch (error) {
    message.error('Không thể hủy nhiệm vụ');
  }
};

const openActionModal = (type) => {
  setActionType(type);
  setActionModalVisible(true);
};
  const loadTask = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/tasks/${id}`);
      setTask(response.data.data);
      
      if (response.data.data.project_id) {
        loadProjectEmployees(response.data.data.project_id);
      }
    } catch (error) {
      message.error('Không thể tải thông tin nhiệm vụ');
      navigate('/tasks');
    } finally {
      setLoading(false);
    }
  };

  const loadEmployees = async () => {
    try {
      const response = await axios.get(`${API_URL}/employees`);
      setEmployees(response.data.data || response.data);
    } catch (error) {
      console.error('Error loading employees:', error);
    }
  };

  const loadProjectEmployees = async (projectId) => {
    try {
      const response = await workCatalogAPI.getProjectContext(projectId);
      setProjectEmployees(response.data.employees || []);
      setProjectRoles(response.data.roles || []);
    } catch (error) {
      console.error('Error loading project employees:', error);
    }
  };

  const handleAddLocation = async (values) => {
    try {
      await axios.post(`${API_URL}/tasks/${id}/locations`, {
        ...values,
        installation_date: values.installation_date?.format('YYYY-MM-DD'),
        installation_time_start: values.installation_time_start?.format('HH:mm'),
        installation_time_end: values.installation_time_end?.format('HH:mm'),
      });
      message.success('Thêm địa điểm thành công');
      setLocationModalVisible(false);
      locationForm.resetFields();
      loadTask();
    } catch (error) {
      message.error('Không thể thêm địa điểm');
    }
  };

  const handleImportCSV = (file) => {
    Papa.parse(file, {
      header: true,
      complete: async (results) => {
        try {
          const formData = new FormData();
          formData.append('file', file);
          
          await axios.post(`${API_URL}/tasks/${id}/locations/import`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          });
          
          message.success(`Import thành công ${results.data.length} địa điểm`);
          setCsvModalVisible(false);
          loadTask();
        } catch (error) {
          message.error('Không thể import dữ liệu');
        }
      },
      error: (error) => {
        message.error('File CSV không hợp lệ');
      }
    });
    return false;
  };

  const handleAssignEmployee = async (values) => {
    try {
      const response=await axios.post(`${API_URL}/tasks/${id}/assignments`, {
        ...values,
      });
      message.success(editingAssignment?'Đã cập nhật lịch phân công':response.data.synced_to_project?'Phân công thành công và đã thêm nhân viên vào dự án':'Phân công nhân viên thành công');
      if(response.data.warnings?.length)Modal.warning({title:'Cảnh báo lịch trùng',content:<ul>{response.data.warnings.map(item=><li key={item}>{item}</li>)}</ul>});
      setAssignModalVisible(false);
      setEditingAssignment(null);
      assignForm.resetFields();
      loadTask();
    } catch (error) {
      message.error(error.response?.data?.message || 'Không thể phân công nhân viên');
    }
  };

  const openAssignmentModal = (assignment = null) => {
    setEditingAssignment(assignment);
    assignForm.resetFields();
    assignForm.setFieldsValue(assignment ? {
      employee_id:assignment.employee_id,
      role_in_task:assignment.role_in_task,
      work_dates:assignment.work_dates || enumerateWorkDates(assignment.start_date,assignment.end_date),
      notes:assignment.notes,
    } : { work_dates: enumerateWorkDates(task?.start_date,task?.end_date) });
    setAssignModalVisible(true);
  };

  const handleRemoveAssignment = async (assignmentId) => {
    try {
      await axios.delete(`${API_URL}/tasks/${id}/assignments/${assignmentId}`);
      message.success('Xóa phân công thành công');
      loadTask();
    } catch (error) {
      message.error('Không thể xóa phân công');
    }
  };

  const downloadCSVTemplate = () => {
    const template = `location_name,location_address,location_city,location_district,contact_person,contact_phone,installation_date,installation_time_start,installation_time_end,estimated_hours,product_info,work_description,notes
Chi nhánh Quận 1,123 Nguyễn Huệ Q1,TP.HCM,Quận 1,Nguyễn Văn A,0901234567,2024-01-15,08:00,12:00,4,Bảng hiệu LED 3x2m,Lắp đặt bảng hiệu tại tầng 1,Cần thang nâng
Chi nhánh Quận 3,456 Lê Văn Sỹ Q3,TP.HCM,Quận 3,Trần Thị B,0912345678,2024-01-16,13:00,17:00,4,Kệ trưng bày 2m,Lắp đặt kệ tại showroom,`;

    const blob = new Blob(['\uFEFF' + template], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'template_dia_diem_lap_dat.csv';
    link.click();
  };

  if (loading || !task) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <span>Đang tải...</span>
      </div>
    );
  }

  const assignmentColumns = [
    {
      title: 'Nhân viên',
      dataIndex: 'full_name',
      key: 'full_name',
    },
    {
      title: 'Vai trò',
      dataIndex: 'role_in_task',
      key: 'role_in_task',
    },
    {
      title: 'Phòng ban',
      dataIndex: 'department',
      key: 'department',
    },
    {
      title: 'SĐT',
      dataIndex: 'phone',
      key: 'phone',
    },
    {
      title: 'Lịch dự kiến',
      key: 'plan',
      render: (_,record) => <Space direction="vertical" size={0}><span>{record.start_date?dayjs(record.start_date).format('DD/MM/YYYY'):'-'} → {record.end_date?dayjs(record.end_date).format('DD/MM/YYYY'):'-'}</span><span style={{color:'#64748b'}}>{record.planned_days||0} ngày · {Number(record.planned_hours||0)}h</span></Space>,
    },
    {
      title: 'Hành động',
      key: 'action',
      render: (_, record) => (
        <Space>
          <Button type="link" icon={<EditOutlined />} size="small" onClick={()=>openAssignmentModal(record)}>Sửa lịch</Button>
          <Popconfirm title="Xác nhận xóa phân công?" onConfirm={() => handleRemoveAssignment(record.id)}>
            <Button type="link" danger icon={<DeleteOutlined />} size="small">Xóa</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const tabItems = [
    {
      key: 'locations',
      label: (
        <span>
          <EnvironmentOutlined />
          Địa điểm lắp đặt ({task.total_locations || 0})
        </span>
      ),
      children: task.execution_type ? (
        <ProjectExecutionPanel
          projectId={Number(task.project_id)}
          taskId={Number(id)}
          onOpenTasks={() => navigate('/tasks')}
        />
      ) : (
        <Card
          title="Danh sách địa điểm"
          extra={
            <Space>
              <Button
                icon={<DownloadOutlined />}
                onClick={downloadCSVTemplate}
              >
                Tải template CSV
              </Button>
              <Button
                icon={<UploadOutlined />}
                onClick={() => setCsvModalVisible(true)}
              >
                Import CSV
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setLocationModalVisible(true)}
              >
                Thêm địa điểm
              </Button>
            </Space>
          }
        >
          <EditableLocationTable 
            taskId={id}
            locations={task.locations || []}
            onReload={loadTask}
          />
        </Card>
      ),
    },
    {
      key: 'assignments',
      label: (
        <span>
          <UserAddOutlined />
          Nhân sự ({task.total_assigned_employees || 0})
        </span>
      ),
      children: (
        <Card
          title="Phân công nhân sự"
          extra={
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={()=>openAssignmentModal()}
            >
              Phân công
            </Button>
          }
        >
          <Table
            columns={assignmentColumns}
            dataSource={task.assignments || []}
            rowKey="id"
            pagination={false}
            locale={{ emptyText: 'Chưa phân công nhân viên' }}
          />
        </Card>
      ),
    },
    {
      key: 'reports',
      label: (
        <span>
          <FileTextOutlined />
          Báo cáo
        </span>
      ),
      children: (
        <TaskReportTab 
          taskId={id}
          taskCode={task.task_code}
          startDate={task.start_date}
          endDate={task.end_date}
        />
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
  <Space>
    <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/tasks')}>
      Quay lại
    </Button>
    <h1>{task.task_name}</h1>
    <Tag color={task.task_type === 'Lắp đặt' ? 'green' : task.task_type === 'Sản xuất' ? 'orange' : 'blue'}>
      {task.task_type}
    </Tag>
    {task.is_overdue && <Tag color="error">Quá hạn</Tag>}
    {task.is_paused && <Tag color="warning">Đang tạm dừng</Tag>}
  </Space>
  <Space>
    <Button icon={<EditOutlined />}>Chỉnh sửa</Button>
    
    {/* Show different buttons based on status */}
    {task.status === 'Tạm dừng' ? (
      <Button
        type="primary"
        icon={<PlayCircleOutlined />}
        onClick={handleResumeTask}
      >
        Tiếp tục
      </Button>
    ) : !task.is_completed && task.status !== 'Hủy' && (
      <>
        <Button
          icon={<PauseCircleOutlined />}
          onClick={() => openActionModal('pause')}
        >
          Tạm dừng
        </Button>
        <Button
          type="primary"
          icon={<CheckCircleOutlined />}
          onClick={async () => {
            try {
              await axios.patch(`${API_URL}/tasks/${id}/complete`);
              message.success('Đã hoàn thành nhiệm vụ');
              navigate('/tasks');
            } catch (error) {
              message.error('Không thể hoàn thành');
            }
          }}
        >
          Hoàn thành
        </Button>
      </>
    )}
    
    {!task.is_completed && task.status !== 'Hủy' && (
      <Button
        danger
        icon={<CloseCircleOutlined />}
        onClick={() => openActionModal('cancel')}
      >
        Hủy nhiệm vụ
      </Button>
    )}
  </Space>
</div>

      <Card style={{ marginBottom: 16 }}>
        <Descriptions column={{ xs: 1, sm: 2, md: 3 }}>
          <Descriptions.Item label="Mã nhiệm vụ">{task.task_code}</Descriptions.Item>
          <Descriptions.Item label="Dự án">{task.project_name}</Descriptions.Item>
          <Descriptions.Item label="Khách hàng">{task.company_name}</Descriptions.Item>
          {task.production_stage_instance_id&&<Descriptions.Item label="Công đoạn sản xuất">
            <Space direction="vertical" size={0}><Tag color="purple">{task.stage_sequence_no}. {task.stage_name}</Tag><span style={{color:'#8c8c8c'}}>{task.production_group_name} · {task.production_code}</span></Space>
          </Descriptions.Item>}
          <Descriptions.Item label="Trạng thái">
            <Tag color={task.is_completed ? 'success' : 'processing'}>{task.status}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Ưu tiên">
            <Tag>{task.priority}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Tiến độ">
            <Progress percent={task.progress || 0} />
          </Descriptions.Item>
          <Descriptions.Item label="Ngày bắt đầu">
            {task.start_date ? dayjs(task.start_date).format('DD/MM/YYYY') : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="Ngày kết thúc">
            {task.end_date ? dayjs(task.end_date).format('DD/MM/YYYY') : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="Thời gian dự kiến">
            {task.estimated_duration ? `${task.estimated_duration} ngày` : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="Tổng giờ dự kiến">
            {Number(task.estimated_hours || 0)} giờ
          </Descriptions.Item>
          <Descriptions.Item label="Địa điểm" span={3}>
            <Space>
              <Badge count={task.completed_locations || 0} showZero>
                <Tag>Hoàn thành</Tag>
              </Badge>
              <span>/</span>
              <Badge count={task.total_locations || 0} showZero>
                <Tag>Tổng số</Tag>
              </Badge>
            </Space>
          </Descriptions.Item>
          {task.description && (
            <Descriptions.Item label="Mô tả" span={3}>
              {task.description}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      <Tabs defaultActiveKey="locations" items={tabItems} />

      {/* Add Location Modal */}
      <Modal
        title="Thêm địa điểm lắp đặt"
        open={locationModalVisible}
        onCancel={() => setLocationModalVisible(false)}
        footer={null}
        width={700}
      >
        <Form form={locationForm} layout="vertical" onFinish={handleAddLocation}>
          <Form.Item
            name="location_name"
            label="Tên địa điểm"
            rules={[{ required: true, message: 'Vui lòng nhập tên địa điểm' }]}
          >
            <Input placeholder="VD: Chi nhánh Quận 1" />
          </Form.Item>

          <Form.Item
            name="location_address"
            label="Địa chỉ"
            rules={[{ required: true, message: 'Vui lòng nhập địa chỉ' }]}
          >
            <Input placeholder="Số nhà, đường, phường..." />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="location_city" label="Thành phố">
                <Input placeholder="TP.HCM, Hà Nội..." />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="location_district" label="Quận/Huyện">
                <Input placeholder="Quận 1, Quận 2..." />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="contact_person" label="Người liên hệ">
                <Input placeholder="Tên người liên hệ" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="contact_phone" label="Số điện thoại">
                <Input placeholder="0901234567" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="installation_date" label="Ngày lắp đặt">
                <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="installation_time_start" label="Giờ bắt đầu">
                <TimePicker format="HH:mm" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="installation_time_end" label="Giờ kết thúc">
                <TimePicker format="HH:mm" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="estimated_hours" label="Số giờ dự kiến">
            <InputNumber style={{ width: '100%' }} min={0} step={0.5} />
          </Form.Item>

          <Form.Item name="product_info" label="Thông tin sản phẩm">
            <TextArea rows={2} placeholder="Mô tả sản phẩm cần lắp đặt" />
          </Form.Item>

          <Form.Item name="work_description" label="Mô tả công việc">
            <TextArea rows={2} placeholder="Chi tiết công việc cần làm" />
          </Form.Item>

          <Form.Item name="notes" label="Ghi chú">
            <TextArea rows={2} placeholder="Ghi chú thêm" />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                Thêm địa điểm
              </Button>
              <Button onClick={() => setLocationModalVisible(false)}>Hủy</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* CSV Import Modal */}
      <Modal
        title="Import địa điểm từ CSV"
        open={csvModalVisible}
        onCancel={() => setCsvModalVisible(false)}
        footer={null}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <div>
            <p>1. Tải file template CSV:</p>
            <Button icon={<DownloadOutlined />} onClick={downloadCSVTemplate}>
              Tải template
            </Button>
          </div>

          <div>
            <p>2. Điền thông tin vào file CSV</p>
            <p style={{ fontSize: 12, color: '#999' }}>
              - Mở file bằng Excel hoặc Google Sheets<br />
              - Điền đầy đủ thông tin địa điểm<br />
              - Lưu lại định dạng CSV
            </p>
          </div>

          <div>
            <p>3. Upload file CSV:</p>
            <Upload
              beforeUpload={handleImportCSV}
              accept=".csv"
              maxCount={1}
            >
              <Button icon={<UploadOutlined />}>Chọn file CSV</Button>
            </Upload>
          </div>
        </Space>
      </Modal>

      {/* Assign Employee Modal */}
      <Modal
        title={editingAssignment?'Cập nhật lịch phân công':'Phân công nhân viên'}
        open={assignModalVisible}
        onCancel={() => {setAssignModalVisible(false);setEditingAssignment(null);}}
        footer={null}
        width={880}
      >
        <Form form={assignForm} layout="vertical" onFinish={handleAssignEmployee}>
          <Form.Item
            name="employee_id"
            label="Nhân viên"
            rules={[{ required: true, message: 'Vui lòng chọn nhân viên' }]}
          >
            <Select placeholder="Chọn nhân viên" showSearch optionFilterProp="label" disabled={Boolean(editingAssignment)}
              options={[
                {label:'Nhân sự dự án',options:projectEmployees.filter(emp=>emp.is_project_member).map(emp=>({value:emp.id,label:`${emp.full_name} — ${emp.project_role||emp.position||''}`}))},
                {label:'Nhân viên khác — sẽ thêm vào dự án',options:projectEmployees.filter(emp=>!emp.is_project_member).map(emp=>({value:emp.id,label:`${emp.full_name} — ${emp.position||emp.department||''}`}))},
              ]}
              onChange={employeeId=>{const emp=projectEmployees.find(item=>item.id===employeeId);assignForm.setFieldValue('role_in_task',emp?.project_role||projectRoles.find(role=>role.is_default)?.name||projectRoles[0]?.name);}}/>
          </Form.Item>

          <Form.Item
            name="role_in_task"
            label="Vai trò"
            rules={[{ required: true, message: 'Vui lòng chọn vai trò' }]}
          >
            <Select placeholder="Chọn vai trò" options={projectRoles.map(role=>({value:role.name,label:role.name}))}/>
          </Form.Item>

          <Form.Item name="work_dates" label="Đánh dấu ngày làm việc" rules={[{validator:(_,value)=>Array.isArray(value)&&value.length?Promise.resolve():Promise.reject(new Error('Chọn ít nhất một ngày làm việc'))}]}>
            <AssignmentWorkCalendar compact />
          </Form.Item>

          <Form.Item name="notes" label="Ghi chú">
            <TextArea rows={2} placeholder="Ghi chú về phân công" />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                {editingAssignment?'Cập nhật lịch':'Phân công'}
              </Button>
              <Button onClick={() => {setAssignModalVisible(false);setEditingAssignment(null);}}>Hủy</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
{/* Action Modal (Pause/Cancel) */}
<Modal
  title={
    actionType === 'pause' ? 'Tạm dừng nhiệm vụ' : 
    actionType === 'cancel' ? 'Hủy nhiệm vụ' : 'Xác nhận'
  }
  open={actionModalVisible}
  onCancel={() => {
    setActionModalVisible(false);
    actionForm.resetFields();
  }}
  footer={null}
>
  <Form 
    form={actionForm} 
    layout="vertical" 
    onFinish={actionType === 'pause' ? handlePauseTask : handleCancelTask}
  >
    <p>
      {actionType === 'pause' ? (
        <>
          ⚠️ Tạm dừng nhiệm vụ sẽ:<br/>
          • Đánh dấu nhiệm vụ là "Tạm dừng"<br/>
          • <strong>Giải phóng tất cả nhân viên</strong> → Họ có thể nhận việc mới<br/>
          • Địa điểm chưa làm sẽ không tính vào khối lượng công việc<br/>
          • Có thể tiếp tục sau
        </>
      ) : (
        <>
          ⛔ Hủy nhiệm vụ sẽ:<br/>
          • Đánh dấu nhiệm vụ là "Hủy"<br/>
          • <strong>Giải phóng tất cả nhân viên</strong><br/>
          • Hủy tất cả địa điểm chưa làm<br/>
          • <strong>Không thể hoàn tác!</strong>
        </>
      )}
    </p>

    <Form.Item
      name="reason"
      label={actionType === 'pause' ? 'Lý do tạm dừng' : 'Lý do hủy'}
      rules={[{ required: true, message: 'Vui lòng nhập lý do' }]}
    >
      <TextArea 
        rows={3} 
        placeholder={
          actionType === 'pause' 
            ? 'VD: Khách hàng yêu cầu tạm dừng, đợi duyệt thiết kế mới...'
            : 'VD: Khách hàng hủy hợp đồng, thay đổi kế hoạch...'
        }
      />
    </Form.Item>

    <Form.Item>
      <Space>
        <Button 
          type={actionType === 'cancel' ? 'primary' : 'default'}
          danger={actionType === 'cancel'}
          htmlType="submit"
        >
          {actionType === 'pause' ? 'Tạm dừng' : 'Hủy nhiệm vụ'}
        </Button>
        <Button onClick={() => {
          setActionModalVisible(false);
          actionForm.resetFields();
        }}>
          Đóng
        </Button>
      </Space>
    </Form.Item>
  </Form>
</Modal>
    </div>
  );
};

export default TaskDetail;
