import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, DatePicker, Form, Input, InputNumber, Modal, Popconfirm, Progress, Row, Select, Space, Statistic, Table, Tag, Tooltip, message } from 'antd';
import { CheckCircleOutlined, DeleteOutlined, EditOutlined, PlusOutlined, SafetyCertificateOutlined, UndoOutlined, WarningOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const PRIORITIES = [
  { value: 'LOW', label: 'Thấp', color: 'default' },
  { value: 'NORMAL', label: 'Bình thường', color: 'blue' },
  { value: 'HIGH', label: 'Cao', color: 'orange' },
  { value: 'URGENT', label: 'Khẩn cấp', color: 'red' }
];
const STATUS_LABELS = {
  DRAFT: 'Nháp', APPROVED: 'Đã duyệt', PARTIALLY_RESERVED: 'Giữ một phần', FULLY_RESERVED: 'Đã giữ đủ',
  PARTIALLY_ISSUED: 'Đã xuất một phần', COMPLETED: 'Hoàn tất', CANCELLED: 'Đã hủy'
};
const STATUS_COLORS = { DRAFT: 'default', APPROVED: 'blue', PARTIALLY_RESERVED: 'orange', FULLY_RESERVED: 'green', PARTIALLY_ISSUED: 'purple', COMPLETED: 'green', CANCELLED: 'red' };
const formatNumber = value => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }).format(Number(value || 0));
const formatCurrency = value => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(value || 0));

export default function ProjectMaterialsPanel({ projectId }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({ requirements: [], warehouses: [], summary: {} });
  const [materials, setMaterials] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [requirementModal, setRequirementModal] = useState(false);
  const [reserveModal, setReserveModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [reserving, setReserving] = useState(null);
  const [form] = Form.useForm();
  const [reserveForm] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const [planning, materialResponse, taskResponse] = await Promise.all([
        axios.get(`${API_URL}/material-planning/projects/${projectId}`),
        axios.get(`${API_URL}/materials`, { params: { is_active: true, limit: 500 } }),
        axios.get(`${API_URL}/tasks`, { params: { project_id: projectId } })
      ]);
      setData(planning.data.data);
      setMaterials(materialResponse.data.data || []);
      setTasks(taskResponse.data.data || []);
    } catch (error) {
      message.error(error.response?.data?.message || 'Không thể tải kế hoạch vật tư');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [projectId]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ priority: 'NORMAL', status: 'DRAFT', planned_quantity: 1, required_date: data.project?.start_date ? dayjs(data.project.start_date) : null });
    setRequirementModal(true);
  };

  const openEdit = record => {
    setEditing(record);
    form.setFieldsValue({
      material_id: record.material_id,
      task_id: record.task_id || undefined,
      planned_quantity: Number(record.planned_quantity),
      estimated_unit_cost: Number(record.estimated_unit_cost),
      required_date: record.required_date ? dayjs(record.required_date) : null,
      priority: record.priority,
      status: record.status === 'DRAFT' ? 'DRAFT' : 'APPROVED',
      note: record.note,
      revision_reason: ''
    });
    setRequirementModal(true);
  };

  const saveRequirement = async values => {
    const payload = { ...values, required_date: values.required_date?.format('YYYY-MM-DD') || null };
    try {
      if (editing) await axios.put(`${API_URL}/material-planning/requirements/${editing.id}`, payload);
      else await axios.post(`${API_URL}/material-planning/projects/${projectId}/requirements`, payload);
      message.success(editing ? 'Đã cập nhật dự trù' : 'Đã thêm dự trù');
      setRequirementModal(false);
      load();
    } catch (error) { message.error(error.response?.data?.message || 'Không thể lưu dự trù'); }
  };

  const approve = async record => {
    try {
      await axios.put(`${API_URL}/material-planning/requirements/${record.id}`, {
        planned_quantity: Number(record.planned_quantity), estimated_unit_cost: Number(record.estimated_unit_cost),
        required_date: record.required_date, priority: record.priority, note: record.note, status: 'APPROVED', revision_reason: 'Duyệt dự trù'
      });
      message.success('Đã duyệt dự trù'); load();
    } catch (error) { message.error(error.response?.data?.message || 'Không thể duyệt dự trù'); }
  };

  const cancelRequirement = async id => {
    try { await axios.delete(`${API_URL}/material-planning/requirements/${id}`); message.success('Đã hủy dự trù'); load(); }
    catch (error) { message.error(error.response?.data?.message || 'Không thể hủy dự trù'); }
  };

  const openReserve = record => {
    setReserving(record);
    reserveForm.resetFields();
    reserveForm.setFieldsValue({ quantity: Number(record.shortage_quantity), warehouse_id: data.warehouses?.find(w => w.is_default)?.id });
    setReserveModal(true);
  };

  const reserve = async values => {
    try {
      await axios.post(`${API_URL}/material-planning/requirements/${reserving.id}/reserve`, values);
      message.success('Đã giữ vật tư'); setReserveModal(false); load();
    } catch (error) {
      const detail = error.response?.data?.details?.available_quantity;
      message.error(detail !== undefined ? `${error.response.data.message}. Tồn khả dụng: ${formatNumber(detail)}` : error.response?.data?.message || 'Không thể giữ vật tư');
    }
  };

  const release = async reservation => {
    try {
      await axios.post(`${API_URL}/material-planning/reservations/${reservation.id}/release`, {});
      message.success('Đã giải phóng vật tư'); load();
    } catch (error) { message.error(error.response?.data?.message || 'Không thể giải phóng vật tư'); }
  };

  const selectedMaterial = Form.useWatch('material_id', form);
  const material = useMemo(() => materials.find(item => item.id === selectedMaterial), [materials, selectedMaterial]);

  const columns = [
    { title: 'Vật tư', key: 'material', width: 220, render: (_, r) => <div><strong>{r.material_code}</strong><div>{r.material_name}</div><small>{r.category_name || 'Chưa phân nhóm'}</small></div> },
    { title: 'Nhiệm vụ', dataIndex: 'task_title', width: 180, render: value => value || <span style={{ color: '#999' }}>Cấp dự án</span> },
    { title: 'Ngày cần', dataIndex: 'required_date', width: 110, render: value => value ? dayjs(value).format('DD/MM/YYYY') : '-' },
    { title: 'Dự trù', width: 110, align: 'right', render: (_, r) => `${formatNumber(r.planned_quantity)} ${r.unit_symbol}` },
    { title: 'Đã giữ', width: 110, align: 'right', render: (_, r) => `${formatNumber(r.reserved_quantity)} ${r.unit_symbol}` },
    { title: 'Thiếu', width: 110, align: 'right', render: (_, r) => <span style={{ color: Number(r.shortage_quantity) > 0 ? '#cf1322' : '#389e0d', fontWeight: 600 }}>{formatNumber(r.shortage_quantity)} {r.unit_symbol}</span> },
    { title: 'Mức đáp ứng', width: 150, render: (_, r) => { const p = Math.min(100, Math.round(Number(r.reserved_quantity || 0) / Number(r.planned_quantity || 1) * 100)); return <Progress percent={p} size="small" status={p < 100 ? 'active' : 'success'} />; } },
    { title: 'Chi phí dự kiến', width: 145, align: 'right', render: (_, r) => formatCurrency(r.estimated_total_cost) },
    { title: 'Trạng thái', width: 130, render: (_, r) => <Tag color={STATUS_COLORS[r.status]}>{STATUS_LABELS[r.status] || r.status}</Tag> },
    { title: 'Thao tác', fixed: 'right', width: 190, render: (_, r) => <Space size="small">
      <Tooltip title="Sửa"><Button size="small" icon={<EditOutlined />} disabled={['CANCELLED','COMPLETED'].includes(r.status)} onClick={() => openEdit(r)} /></Tooltip>
      {r.status === 'DRAFT' && <Tooltip title="Duyệt"><Button size="small" type="primary" icon={<CheckCircleOutlined />} onClick={() => approve(r)} /></Tooltip>}
      {['APPROVED','PARTIALLY_RESERVED'].includes(r.status) && Number(r.shortage_quantity) > 0 && <Tooltip title="Giữ vật tư"><Button size="small" icon={<SafetyCertificateOutlined />} onClick={() => openReserve(r)} /></Tooltip>}
      {!['CANCELLED','COMPLETED'].includes(r.status) && <Popconfirm title="Hủy dự trù này?" onConfirm={() => cancelRequirement(r.id)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>}
    </Space> }
  ];

  return <div>
    <Row gutter={16} style={{ marginBottom: 16 }}>
      <Col xs={12} md={6}><Card><Statistic title="Dòng dự trù" value={data.summary?.requirement_count || 0} /></Card></Col>
      <Col xs={12} md={6}><Card><Statistic title="Vật tư còn thiếu" value={data.summary?.shortage_items || 0} valueStyle={{ color: data.summary?.shortage_items ? '#cf1322' : '#3f8600' }} prefix={data.summary?.shortage_items ? <WarningOutlined /> : <CheckCircleOutlined />} /></Card></Col>
      <Col xs={12} md={6}><Card><Statistic title="Tổng số lượng thiếu" value={data.summary?.shortage_quantity || 0} precision={2} /></Card></Col>
      <Col xs={12} md={6}><Card><Statistic title="Chi phí dự kiến" value={data.summary?.planned_cost || 0} formatter={formatCurrency} /></Card></Col>
    </Row>
    <Alert showIcon type="info" style={{ marginBottom: 16 }} message="Dự trù không làm giảm tồn kho. Chỉ khi dự trù được duyệt và giữ hàng, tồn khả dụng mới giảm. Phiên bản này chưa nhập/xuất kho; số lượng giữ phụ thuộc số dư kho hiện tại." />
    <Card title="Dự trù và giữ vật tư" extra={<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Thêm dự trù</Button>}>
      <Table loading={loading} dataSource={data.requirements || []} columns={columns} rowKey="id" scroll={{ x: 1500 }} pagination={{ pageSize: 20 }}
        expandable={{ expandedRowRender: record => <div><strong>Phiếu giữ:</strong>{record.reservations?.length ? record.reservations.map(item => <Tag key={item.id} style={{ margin: 6 }}>{item.warehouse_name}: {formatNumber(item.available_reserved_quantity)} <Button type="link" size="small" icon={<UndoOutlined />} onClick={() => release(item)}>Giải phóng</Button></Tag>) : <span style={{ marginLeft: 8, color: '#999' }}>Chưa giữ vật tư</span>}</div> }} />
    </Card>

    <Modal title={editing ? 'Cập nhật dự trù vật tư' : 'Thêm dự trù vật tư'} open={requirementModal} onCancel={() => setRequirementModal(false)} onOk={() => form.submit()} width={720} destroyOnClose>
      <Form form={form} layout="vertical" onFinish={saveRequirement}>
        <Row gutter={16}>
          <Col span={12}><Form.Item name="material_id" label="Vật tư" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" disabled={Boolean(editing)} options={materials.map(m => ({ value: m.id, label: `${m.material_code} — ${m.name}` }))} /></Form.Item></Col>
          <Col span={12}><Form.Item name="task_id" label="Nhiệm vụ (không bắt buộc)"><Select allowClear showSearch optionFilterProp="label" disabled={Boolean(editing)} options={tasks.map(t => ({ value: t.id, label: t.title }))} /></Form.Item></Col>
          <Col span={8}><Form.Item name="planned_quantity" label={`Số lượng dự trù${material ? ` (${material.unit_symbol})` : ''}`} rules={[{ required: true }]}><InputNumber min={0.000001} style={{ width: '100%' }} /></Form.Item></Col>
          <Col span={8}><Form.Item name="estimated_unit_cost" label="Đơn giá dự kiến"><InputNumber min={0} style={{ width: '100%' }} formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} /></Form.Item></Col>
          <Col span={8}><Form.Item name="required_date" label="Ngày cần vật tư"><DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" /></Form.Item></Col>
          <Col span={8}><Form.Item name="priority" label="Ưu tiên"><Select options={PRIORITIES.map(p => ({ value: p.value, label: p.label }))} /></Form.Item></Col>
          <Col span={8}><Form.Item name="status" label="Trạng thái"><Select options={[{ value: 'DRAFT', label: 'Nháp' }, { value: 'APPROVED', label: 'Đã duyệt' }]} /></Form.Item></Col>
          {editing && <Col span={8}><Form.Item name="revision_reason" label="Lý do điều chỉnh" rules={[{ required: true, message: 'Vui lòng nhập lý do' }]}><Input /></Form.Item></Col>}
          <Col span={24}><Form.Item name="note" label="Ghi chú"><Input.TextArea rows={3} /></Form.Item></Col>
        </Row>
      </Form>
    </Modal>

    <Modal title={`Giữ vật tư — ${reserving?.material_name || ''}`} open={reserveModal} onCancel={() => setReserveModal(false)} onOk={() => reserveForm.submit()}>
      <Form form={reserveForm} layout="vertical" onFinish={reserve}>
        <Alert style={{ marginBottom: 16 }} type="warning" showIcon message={`Còn thiếu theo dự trù: ${formatNumber(reserving?.shortage_quantity)} ${reserving?.unit_symbol || ''}`} />
        <Form.Item name="warehouse_id" label="Kho" rules={[{ required: true }]}><Select options={(data.warehouses || []).map(w => ({ value: w.id, label: `${w.warehouse_code} — ${w.name}${w.is_default ? ' (mặc định)' : ''}` }))} /></Form.Item>
        <Form.Item name="quantity" label="Số lượng giữ" rules={[{ required: true }]}><InputNumber min={0.000001} max={Number(reserving?.shortage_quantity || 0)} style={{ width: '100%' }} /></Form.Item>
        <Form.Item name="note" label="Ghi chú"><Input.TextArea rows={2} /></Form.Item>
      </Form>
    </Modal>
  </div>;
}
