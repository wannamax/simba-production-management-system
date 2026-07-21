import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, DatePicker, Form, Input, Modal, Popconfirm, Progress, Select, Space, Table, Tag, message } from 'antd';
import { CalendarOutlined, DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { scheduleAPI, projectAPI, employeeAPI, settingsAPI } from '../services/api';
import { SCHEDULE_STATUS_COLORS, PRIORITY_COLORS } from '../utils/constants';

const { Option } = Select;
const { RangePicker } = DatePicker;

const ScheduleList = () => {
  const [schedules, setSchedules] = useState([]);
  const [projects, setProjects] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filters, setFilters] = useState({});
  const [form] = Form.useForm();
  const [scheduleTypes, setScheduleTypes] = useState([]);

  const loadSchedules = async (next = filters) => {
    setLoading(true);
    try {
      const response = await scheduleAPI.getAll(next);
      setSchedules(response.data || []);
    } catch (error) { message.error(error.message || 'Không thể tải lịch trình'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    Promise.all([
      projectAPI.getAll({ limit: 1000 }),
      employeeAPI.getAll({ status: 'Hoạt động', limit: 1000 }),
      settingsAPI.getCatalogs({ type: 'SCHEDULE_TYPE' }),
    ]).then(([p, e, types]) => {
      setProjects(p.data || []);
      setEmployees(e.data || []);
      setScheduleTypes(types.data || []);
    }).catch(() => message.warning('Không thể tải đầy đủ dữ liệu bộ lọc'));
    loadSchedules({});
  }, []);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ priority: 'Trung bình', status: 'Chưa bắt đầu', progress: 0 });
    setModalOpen(true);
  };

  const openEdit = (record) => {
    setEditing(record);
    form.setFieldsValue({
      ...record,
      datetime: [dayjs(record.start_datetime), dayjs(record.end_datetime)],
      employee_ids: (record.employees || []).map((item) => item.employee_id),
    });
    setModalOpen(true);
  };

  const submit = async (values) => {
    const payload = {
      ...values,
      start_datetime: values.datetime[0].toISOString(),
      end_datetime: values.datetime[1].toISOString(),
    };
    delete payload.datetime;
    try {
      if (editing) await scheduleAPI.update(editing.id, payload);
      else await scheduleAPI.create(payload);
      message.success(editing ? 'Đã cập nhật lịch trình' : 'Đã tạo lịch trình');
      setModalOpen(false);
      await loadSchedules();
    } catch (error) { message.error(error.message || 'Không thể lưu lịch trình'); }
  };

  const remove = async (id) => {
    try {
      await scheduleAPI.delete(id);
      message.success('Đã xóa lịch trình');
      await loadSchedules();
    } catch (error) { message.error(error.message || 'Không thể xóa lịch trình'); }
  };

  const applyFilters = (values) => {
    const next = {
      ...values,
      from_date: values.date_range?.[0]?.format('YYYY-MM-DD'),
      to_date: values.date_range?.[1]?.format('YYYY-MM-DD'),
    };
    delete next.date_range;
    Object.keys(next).forEach((key) => !next[key] && delete next[key]);
    setFilters(next);
    loadSchedules(next);
  };

  const columns = useMemo(() => [
    { title: 'Lịch trình', dataIndex: 'title', key: 'title', render: (value, record) => <><div style={{ fontWeight: 600 }}>{value}</div><small>{record.project_code} - {record.project_name}</small></> },
    { title: 'Loại', dataIndex: 'schedule_type', key: 'schedule_type', render: (v) => <Tag>{v}</Tag> },
    { title: 'Thời gian', key: 'time', render: (_, r) => <>{dayjs(r.start_datetime).format('DD/MM/YYYY HH:mm')}<br/><small>đến {dayjs(r.end_datetime).format('DD/MM/YYYY HH:mm')}</small></> },
    { title: 'Nhân viên', key: 'employees', render: (_, r) => (r.employees || []).length ? (r.employees || []).map(e => <Tag key={e.employee_id}>{e.full_name}</Tag>) : <span>Chưa phân công</span> },
    { title: 'Trạng thái', dataIndex: 'status', key: 'status', render: (v) => <Tag color={SCHEDULE_STATUS_COLORS[v]}>{v}</Tag> },
    { title: 'Ưu tiên', dataIndex: 'priority', key: 'priority', render: (v) => <Tag color={PRIORITY_COLORS[v]}>{v}</Tag> },
    { title: 'Tiến độ', dataIndex: 'progress', key: 'progress', render: (v) => <Progress percent={Number(v || 0)} size="small" /> },
    { title: 'Thao tác', key: 'actions', fixed: 'right', render: (_, r) => <Space><Button icon={<EditOutlined />} onClick={() => openEdit(r)}>Sửa</Button><Popconfirm title="Xóa lịch trình này?" onConfirm={() => remove(r.id)}><Button danger icon={<DeleteOutlined />}>Xóa</Button></Popconfirm></Space> },
  ], [schedules]);

  return <div>
    <div className="page-header"><h1>Quản lý Lịch trình</h1><Space><Button icon={<ReloadOutlined />} onClick={() => loadSchedules()}>Làm mới</Button><Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Tạo lịch trình</Button></Space></div>
    <Card style={{ marginBottom: 16 }}>
      <Form layout="inline" onFinish={applyFilters}>
        <Form.Item name="search"><Input allowClear prefix={<SearchOutlined />} placeholder="Tiêu đề hoặc địa điểm" /></Form.Item>
        <Form.Item name="project_id"><Select allowClear placeholder="Dự án" style={{ width: 210 }}>{projects.map(p => <Option key={p.id} value={p.id}>{p.project_code} - {p.project_name}</Option>)}</Select></Form.Item>
        <Form.Item name="employee_id"><Select allowClear showSearch optionFilterProp="children" placeholder="Nhân viên" style={{ width: 190 }}>{employees.map(e => <Option key={e.id} value={e.id}>{e.full_name}</Option>)}</Select></Form.Item>
        <Form.Item name="status"><Select allowClear placeholder="Trạng thái" style={{ width: 150 }}>{Object.keys(SCHEDULE_STATUS_COLORS).map(v => <Option key={v} value={v}>{v}</Option>)}</Select></Form.Item>
        <Form.Item name="date_range"><RangePicker format="DD/MM/YYYY" /></Form.Item>
        <Form.Item><Button type="primary" htmlType="submit">Lọc</Button></Form.Item>
      </Form>
    </Card>
    <Card><Table columns={columns} dataSource={schedules} rowKey="id" loading={loading} scroll={{ x: 1300 }} /></Card>
    <Modal title={editing ? 'Sửa lịch trình' : 'Tạo lịch trình'} open={modalOpen} onCancel={() => setModalOpen(false)} footer={null} width={760} destroyOnClose>
      <Form form={form} layout="vertical" onFinish={submit}>
        <Form.Item name="project_id" label="Dự án" rules={[{ required: true }]}><Select showSearch optionFilterProp="children">{projects.map(p => <Option key={p.id} value={p.id}>{p.project_code} - {p.project_name}</Option>)}</Select></Form.Item>
        <Space style={{ display: 'flex' }} align="start">
          <Form.Item name="schedule_type" label="Loại" rules={[{ required: true }]} style={{ flex: 1 }}><Select>{scheduleTypes.map(item => <Option key={item.id} value={item.name}>{item.name}</Option>)}</Select></Form.Item>
          <Form.Item name="status" label="Trạng thái" rules={[{ required: true }]} style={{ flex: 1 }}><Select>{Object.keys(SCHEDULE_STATUS_COLORS).map(v => <Option key={v} value={v}>{v}</Option>)}</Select></Form.Item>
          <Form.Item name="priority" label="Ưu tiên" style={{ flex: 1 }}><Select>{['Thấp','Trung bình','Cao','Khẩn cấp'].map(v => <Option key={v} value={v}>{v}</Option>)}</Select></Form.Item>
        </Space>
        <Form.Item name="title" label="Tiêu đề" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="description" label="Mô tả"><Input.TextArea rows={3} /></Form.Item>
        <Form.Item name="location" label="Địa điểm"><Input /></Form.Item>
        <Form.Item name="datetime" label="Thời gian" rules={[{ required: true }]}><RangePicker showTime format="DD/MM/YYYY HH:mm" style={{ width: '100%' }} /></Form.Item>
        <Form.Item name="employee_ids" label="Phân công nhân viên"><Select mode="multiple" showSearch optionFilterProp="children">{employees.map(e => <Option key={e.id} value={e.id}>{e.full_name} - {e.department || ''}</Option>)}</Select></Form.Item>
        <Form.Item name="progress" label="Tiến độ"><Select>{[0,25,50,75,100].map(v => <Option key={v} value={v}>{v}%</Option>)}</Select></Form.Item>
        <Space><Button type="primary" htmlType="submit">{editing ? 'Lưu thay đổi' : 'Tạo lịch trình'}</Button><Button onClick={() => setModalOpen(false)}>Hủy</Button></Space>
      </Form>
    </Modal>
  </div>;
};

export default ScheduleList;
