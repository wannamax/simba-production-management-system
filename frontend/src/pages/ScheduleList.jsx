import React, { useEffect, useState } from 'react';
import {
  Table,
  Button,
  Space,
  Tag,
  Card,
  Modal,
  Form,
  Input,
  Select,
  DatePicker,
  message,
  Progress
} from 'antd';
import { PlusOutlined, EyeOutlined, CalendarOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { scheduleAPI, projectAPI, employeeAPI } from '../services/api';
import {
  SCHEDULE_STATUS_COLORS,
  SCHEDULE_TYPES,
  SCHEDULE_TYPE_COLORS,
  PRIORITY_COLORS
} from '../utils/constants';

const { Option } = Select;
const { RangePicker } = DatePicker;

const ScheduleList = () => {
  const navigate = useNavigate();
  const [schedules, setSchedules] = useState([]);
  const [projects, setProjects] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    loadSchedules();
    loadProjects();
    loadEmployees();
  }, []);

  const loadSchedules = async () => {
    setLoading(true);
    try {
      const response = await scheduleAPI.getAll();
      setSchedules(response.data);
    } catch (error) {
      message.error('Không thể tải danh sách lịch trình');
    } finally {
      setLoading(false);
    }
  };

  const loadProjects = async () => {
    try {
      const response = await projectAPI.getAll({ limit: 1000 });
      setProjects(response.data);
    } catch (error) {
      console.error('Error loading projects:', error);
    }
  };

  const loadEmployees = async () => {
    try {
      const response = await employeeAPI.getAll({ status: 'Hoạt động' });
      setEmployees(response.data);
    } catch (error) {
      console.error('Error loading employees:', error);
    }
  };

  const handleCreate = () => {
    form.resetFields();
    setModalVisible(true);
  };

  const handleSubmit = async (values) => {
    try {
      const data = {
        ...values,
        start_datetime: values.datetime[0].toISOString(),
        end_datetime: values.datetime[1].toISOString(),
      };
      delete data.datetime;

      await scheduleAPI.create(data);
      message.success('Tạo lịch trình thành công');
      setModalVisible(false);
      form.resetFields();
      loadSchedules();
    } catch (error) {
      message.error('Không thể tạo lịch trình: ' + (error.message || 'Lỗi không xác định'));
      console.error('Create schedule error:', error);
    }
  };

  const columns = [
    {
      title: 'Dự án',
      dataIndex: 'project_name',
      key: 'project_name',
      width: 200,
      ellipsis: true,
    },
    {
      title: 'Loại',
      dataIndex: 'schedule_type',
      key: 'schedule_type',
      width: 120,
      render: (type) => (
        <Tag color={SCHEDULE_TYPE_COLORS[type]}>{type}</Tag>
      ),
    },
    {
      title: 'Tiêu đề',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
    },
    {
      title: 'Địa điểm',
      dataIndex: 'location',
      key: 'location',
      width: 150,
      ellipsis: true,
    },
    {
      title: 'Thời gian',
      dataIndex: 'start_datetime',
      key: 'start_datetime',
      width: 180,
      render: (date, record) => (
        <div>
          <div>{dayjs(date).format('DD/MM/YYYY HH:mm')}</div>
          <div style={{ fontSize: 12, color: '#999' }}>
            đến {dayjs(record.end_datetime).format('DD/MM HH:mm')}
          </div>
        </div>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (status) => (
        <Tag color={SCHEDULE_STATUS_COLORS[status]}>{status}</Tag>
      ),
    },
    {
      title: 'Tiến độ',
      dataIndex: 'progress',
      key: 'progress',
      width: 120,
      render: (progress) => <Progress percent={progress || 0} size="small" />,
    },
    {
      title: 'Hành động',
      key: 'action',
      width: 100,
      fixed: 'right',
      render: (_, record) => (
        <Button
          type="link"
          icon={<EyeOutlined />}
          onClick={() => navigate(`/schedules/${record.id}`)}
          size="small"
        >
          Xem
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <h1>Quản lý Lịch trình</h1>
        <Space>
          <Button
            icon={<CalendarOutlined />}
            onClick={() => navigate('/schedules/calendar')}
          >
            Xem lịch
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            Tạo lịch trình
          </Button>
        </Space>
      </div>

      <Card>
        <Table
          columns={columns}
          dataSource={schedules}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1200 }}
        />
      </Card>

      {/* Modal Tạo Lịch trình */}
      <Modal
        title="Tạo lịch trình mới"
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width={700}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
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
                  {p.project_code} - {p.project_name}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="schedule_type"
            label="Loại công việc"
            rules={[{ required: true, message: 'Vui lòng chọn loại công việc' }]}
          >
            <Select placeholder="Chọn loại công việc">
              {Object.values(SCHEDULE_TYPES).map((type) => (
                <Option key={type} value={type}>
                  {type}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="title"
            label="Tiêu đề"
            rules={[{ required: true, message: 'Vui lòng nhập tiêu đề' }]}
          >
            <Input placeholder="Nhập tiêu đề công việc" />
          </Form.Item>

          <Form.Item name="description" label="Mô tả">
            <Input.TextArea rows={3} placeholder="Mô tả chi tiết công việc" />
          </Form.Item>

          <Form.Item name="location" label="Địa điểm">
            <Input placeholder="Địa điểm thực hiện" />
          </Form.Item>

          <Form.Item
            name="datetime"
            label="Thời gian"
            rules={[{ required: true, message: 'Vui lòng chọn thời gian' }]}
          >
            <RangePicker
              showTime
              format="DD/MM/YYYY HH:mm"
              style={{ width: '100%' }}
              placeholder={['Bắt đầu', 'Kết thúc']}
            />
          </Form.Item>

          <Form.Item name="priority" label="Mức độ ưu tiên">
            <Select placeholder="Chọn mức độ">
              <Option value="Thấp">Thấp</Option>
              <Option value="Trung bình">Trung bình</Option>
              <Option value="Cao">Cao</Option>
              <Option value="Khẩn cấp">Khẩn cấp</Option>
            </Select>
          </Form.Item>

          <Form.Item name="employee_ids" label="Phân công nhân viên">
            <Select
              mode="multiple"
              placeholder="Chọn nhân viên"
              optionFilterProp="children"
            >
              {employees.map((e) => (
                <Option key={e.id} value={e.id}>
                  {e.full_name} - {e.department}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                Tạo lịch trình
              </Button>
              <Button onClick={() => setModalVisible(false)}>Hủy</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ScheduleList;