import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Button, Card, Col, DatePicker, Empty, Form, Input, Modal, Popconfirm,
  Progress, Row, Select, Space, Spin, Statistic, Table, Tag, Upload, message,
} from 'antd';
import {
  CheckCircleOutlined, DeleteOutlined, DownloadOutlined, EditOutlined,
  FileExcelOutlined, PlusOutlined, UploadOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { employeeAPI, settingsAPI, taskExecutionAPI } from '../services/api';

const STATUSES = ['Chưa xếp lịch', 'Đã xếp lịch', 'Đang thực hiện', 'Hoàn thành', 'Không thực hiện được', 'Dời lịch', 'Hủy', 'Cần xử lý lại'];
const STATUS_COLORS = {
  'Chưa xếp lịch': 'default', 'Đã xếp lịch': 'blue', 'Đang thực hiện': 'processing',
  'Hoàn thành': 'success', 'Không thực hiện được': 'error', 'Dời lịch': 'orange',
  'Hủy': 'red', 'Cần xử lý lại': 'warning',
};

const ProjectExecutionPanel = ({ projectId, taskId, onOpenTasks }) => {
  const [tasks, setTasks] = useState([]);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [provinces, setProvinces] = useState([]);
  const [communes, setCommunes] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [preview, setPreview] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [form] = Form.useForm();

  const loadTasks = async (preferredId) => {
    setLoading(true);
    try {
      const response = await taskExecutionAPI.getProject(projectId);
      const projectTasks = response.data || [];
      const list = taskId ? projectTasks.filter(item => Number(item.id) === Number(taskId)) : projectTasks;
      setTasks(list);
      const nextId = preferredId || taskId || selectedTaskId || list[0]?.id || null;
      setSelectedTaskId(list.some(item => Number(item.id) === Number(nextId)) ? Number(nextId) : (list[0]?.id || null));
      if (!list.length) setDetail(null);
    } catch (error) {
      message.error(error.message || 'Không thể tải công việc giao hàng/lắp đặt');
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async taskId => {
    if (!taskId) return;
    setDetailLoading(true);
    try {
      const response = await taskExecutionAPI.getTask(taskId);
      setDetail(response.data);
    } catch (error) {
      message.error(error.message || 'Không thể tải danh sách địa điểm');
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => { loadTasks(taskId); }, [projectId, taskId]);
  useEffect(() => { if (selectedTaskId) loadDetail(selectedTaskId); }, [selectedTaskId]);
  useEffect(() => {
    Promise.all([settingsAPI.getProvinces(), employeeAPI.getAll({ limit: 1000 })])
      .then(([provinceResponse, employeeResponse]) => {
        setProvinces(provinceResponse.data || []);
        setEmployees(employeeResponse.data || []);
      }).catch(() => message.warning('Không thể tải đầy đủ danh mục hành chính/nhân viên'));
  }, []);

  const task = detail?.task;
  const summary = detail?.summary || { total: 0, completed: 0, pending: 0, progress: 0 };

  const loadCommunes = async provinceCode => {
    form.setFieldValue('commune_code', undefined);
    setCommunes([]);
    if (!provinceCode) return;
    try {
      const response = await settingsAPI.getCommunes(provinceCode);
      setCommunes(response.data || []);
    } catch { message.error('Không thể tải Phường/Xã'); }
  };

  const openLocation = async record => {
    setEditing(record || null);
    form.resetFields();
    if (record?.province_code) {
      try {
        const response = await settingsAPI.getCommunes(record.province_code);
        setCommunes(response.data || []);
      } catch { setCommunes([]); }
    } else setCommunes([]);
    form.setFieldsValue(record ? {
      ...record,
      planned_date: record.planned_date ? dayjs(record.planned_date) : null,
      actual_completion_date: record.actual_completion_date ? dayjs(record.actual_completion_date) : null,
    } : { status: 'Chưa xếp lịch' });
    setModalOpen(true);
  };

  const saveLocation = async values => {
    setSaving(true);
    try {
      const payload = {
        ...values,
        planned_date: values.planned_date?.format('YYYY-MM-DD') || null,
        actual_completion_date: values.actual_completion_date?.format('YYYY-MM-DD') || null,
        row_version: editing?.row_version,
      };
      if (editing) await taskExecutionAPI.updateLocation(selectedTaskId, editing.id, payload);
      else await taskExecutionAPI.createLocation(selectedTaskId, payload);
      message.success(editing ? 'Đã cập nhật địa điểm' : 'Đã thêm địa điểm');
      setModalOpen(false);
      await Promise.all([loadDetail(selectedTaskId), loadTasks(selectedTaskId)]);
    } catch (error) { message.error(error.message || 'Không thể lưu địa điểm'); }
    finally { setSaving(false); }
  };

  const updateStatus = async (record, status) => {
    try {
      await taskExecutionAPI.updateLocationStatus(selectedTaskId, record.id, { status });
      message.success(status === 'Hoàn thành' ? 'Đã ghi nhận hoàn thành và ngày thực tế' : 'Đã cập nhật trạng thái');
      await Promise.all([loadDetail(selectedTaskId), loadTasks(selectedTaskId)]);
    } catch (error) { message.error(error.message || 'Không thể cập nhật trạng thái'); }
  };

  const removeLocation = async record => {
    try {
      await taskExecutionAPI.deleteLocation(selectedTaskId, record.id);
      message.success('Đã xóa địa điểm');
      await Promise.all([loadDetail(selectedTaskId), loadTasks(selectedTaskId)]);
    } catch (error) { message.error(error.message || 'Không thể xóa địa điểm'); }
  };

  const download = async (mode) => {
    try {
      const blob = mode === 'template'
        ? await taskExecutionAPI.downloadTemplate(selectedTaskId)
        : await taskExecutionAPI.exportExcel(selectedTaskId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${task?.task_code || 'task'}-${mode === 'template' ? 'mau' : 'dia-diem'}.xlsx`;
      document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    } catch (error) { message.error(error.message || 'Không thể tải file Excel'); }
  };

  const previewImport = async file => {
    setImporting(true);
    try {
      const response = await taskExecutionAPI.previewImport(selectedTaskId, file);
      setPreview(response.data);
      setPreviewOpen(true);
      if (response.data.error_rows) message.warning(`File có ${response.data.error_rows} dòng lỗi`);
      else message.success('File hợp lệ, sẵn sàng áp dụng');
    } catch (error) { message.error(error.message || 'Không thể đọc file Excel'); }
    finally { setImporting(false); }
    return false;
  };

  const applyImport = async () => {
    if (!preview || preview.error_rows) return;
    setImporting(true);
    try {
      await taskExecutionAPI.applyImport(preview.id);
      message.success('Đã áp dụng danh sách từ Excel');
      setPreviewOpen(false); setPreview(null);
      await Promise.all([loadDetail(selectedTaskId), loadTasks(selectedTaskId)]);
    } catch (error) { message.error(error.message || 'Không thể áp dụng file'); }
    finally { setImporting(false); }
  };

  const columns = useMemo(() => [
    { title: 'STT', dataIndex: 'sequence_no', width: 64, fixed: 'left' },
    { title: 'Địa điểm', key: 'location', width: 260, fixed: 'left', render: (_, row) => <><strong>{row.location_name}</strong><div style={{ color: '#64748b' }}>{row.location_address}</div><small>{row.location_code}</small></> },
    { title: 'Khu vực hành chính', key: 'admin', width: 220, render: (_, row) => [row.commune_unit_type, row.commune_name, row.province_unit_type, row.province_name].filter(Boolean).join(' ') || '-' },
    { title: 'Ngày dự kiến', dataIndex: 'planned_date', width: 125, render: value => value ? dayjs(value).format('DD/MM/YYYY') : '-' },
    { title: 'Nhân viên', key: 'employee', width: 180, render: (_, row) => row.employee_name ? <><div>{row.employee_name}</div><small>{row.employee_code}</small></> : '-' },
    { title: 'Trạng thái', dataIndex: 'status', width: 205, render: (value, row) => <Select value={value} style={{ width: 180 }} onChange={next => updateStatus(row, next)} options={STATUSES.map(status => ({ value: status, label: status }))} /> },
    { title: 'Ngày hoàn thành', dataIndex: 'actual_completion_date', width: 145, render: value => value ? dayjs(value).format('DD/MM/YYYY') : '-' },
    { title: 'Thao tác', key: 'actions', width: 105, fixed: 'right', render: (_, row) => <Space><Button type="text" icon={<EditOutlined />} onClick={() => openLocation(row)} /><Popconfirm title="Xóa địa điểm này?" description={row.is_completed ? 'Hãy chuyển trạng thái khỏi Hoàn thành trước.' : undefined} onConfirm={() => removeLocation(row)} disabled={row.is_completed}><Button type="text" danger disabled={row.is_completed} icon={<DeleteOutlined />} /></Popconfirm></Space> },
  ], [selectedTaskId]);

  if (loading) return <div style={{ textAlign: 'center', padding: 48 }}><Spin /></div>;
  if (!tasks.length) return <Card><Empty description="Dự án chưa có Task Giao hàng hoặc Lắp đặt"><Button type="primary" onClick={onOpenTasks}>Tạo/phân công bên Nhiệm vụ</Button></Empty></Card>;

  return <Space direction="vertical" size={16} style={{ width: '100%' }}>
    <Alert showIcon type="info" message="Danh sách thực thi theo Task" description="Chỉ các công việc được thiết lập quy trình Giao hàng hoặc Lắp đặt mới xuất hiện tại đây. Dữ liệu địa điểm thuộc Task và được tổng hợp trực tiếp vào Dự án." />
    <Row gutter={[12, 12]}>
      {tasks.map(item => <Col xs={24} md={12} xl={8} key={item.id}>
        <Card hoverable size="small" onClick={() => setSelectedTaskId(item.id)} style={{ borderColor: Number(item.id) === Number(selectedTaskId) ? '#1677ff' : undefined }}>
          <Space direction="vertical" style={{ width: '100%' }} size={6}>
            <Space wrap><Tag color={item.execution_type === 'DELIVERY' ? 'cyan' : 'purple'}>{item.execution_label}</Tag><strong>{item.task_name}</strong></Space>
            <small>{item.task_code} · {item.completed_locations}/{item.total_locations} địa điểm</small>
            <Progress percent={item.total_locations ? Math.round(item.completed_locations / item.total_locations * 100) : 0} size="small" status={item.ready_for_task_completion ? 'success' : 'active'} />
          </Space>
        </Card>
      </Col>)}
    </Row>

    <Card loading={detailLoading} title={<Space><Tag color={task?.execution_type === 'DELIVERY' ? 'cyan' : 'purple'}>{task?.execution_label}</Tag><span>{task?.task_name}</span></Space>} extra={<Space wrap>
      <Button icon={<DownloadOutlined />} onClick={() => download('template')}>File mẫu</Button>
      <Button icon={<FileExcelOutlined />} onClick={() => download('export')}>Export Excel</Button>
      <Upload accept=".xlsx" showUploadList={false} beforeUpload={previewImport}><Button loading={importing} icon={<UploadOutlined />}>Import Excel</Button></Upload>
      <Button type="primary" icon={<PlusOutlined />} onClick={() => openLocation(null)}>Thêm địa điểm</Button>
    </Space>}>
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}><Statistic title="Tổng địa điểm" value={summary.total} /></Col>
        <Col xs={12} md={6}><Statistic title="Đã hoàn thành" value={summary.completed} valueStyle={{ color: '#389e0d' }} /></Col>
        <Col xs={12} md={6}><Statistic title="Còn lại" value={summary.pending} /></Col>
        <Col xs={12} md={6}><Statistic title="Tiến độ" value={summary.progress} suffix="%" /></Col>
      </Row>
      {summary.ready_for_task_completion && <Alert style={{ marginBottom: 16 }} type="success" showIcon icon={<CheckCircleOutlined />} message="Tất cả địa điểm đã hoàn thành" description="Task đã sẵn sàng để quản lý kiểm tra và xác nhận Hoàn thành bên trang Nhiệm vụ." action={<Button onClick={onOpenTasks}>Mở Nhiệm vụ</Button>} />}
      <Table rowKey="id" dataSource={detail?.locations || []} columns={columns} pagination={{ pageSize: 20, showSizeChanger: true }} scroll={{ x: 1350 }} locale={{ emptyText: 'Chưa có địa điểm. Có thể thêm trực tiếp hoặc Import Excel.' }} />
    </Card>

    <Modal title={editing ? 'Cập nhật địa điểm' : `Thêm địa điểm ${task?.execution_label || ''}`} open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()} confirmLoading={saving} width={760} destroyOnClose>
      <Form form={form} layout="vertical" onFinish={saveLocation}>
        <Row gutter={16}>
          <Col xs={24} md={12}><Form.Item name="location_name" label="Tên địa điểm" rules={[{ required: true, message: 'Nhập tên địa điểm' }]}><Input placeholder="Tên quán, cửa hàng, cơ sở..." /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name="assigned_employee_id" label="Nhân viên phụ trách"><Select allowClear showSearch optionFilterProp="label" options={employees.map(item => ({ value: item.id, label: `${item.employee_code} — ${item.full_name}` }))} /></Form.Item></Col>
          <Col span={24}><Form.Item name="location_address" label="Địa chỉ chi tiết" rules={[{ required: true, message: 'Nhập địa chỉ' }]}><Input /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name="province_code" label="Tỉnh/Thành phố"><Select allowClear showSearch optionFilterProp="label" onChange={loadCommunes} options={provinces.map(item => ({ value: item.code, label: `${item.unit_type || ''} ${item.name}`.trim() }))} /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name="commune_code" label="Phường/Xã"><Select allowClear showSearch optionFilterProp="label" options={communes.map(item => ({ value: item.code, label: `${item.unit_type || ''} ${item.name}`.trim() }))} /></Form.Item></Col>
          <Col xs={24} md={8}><Form.Item name="planned_date" label="Ngày dự kiến"><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item></Col>
          <Col xs={24} md={8}><Form.Item name="status" label="Trạng thái" rules={[{ required: true }]}><Select options={STATUSES.map(value => ({ value, label: value }))} /></Form.Item></Col>
          <Col xs={24} md={8}><Form.Item name="actual_completion_date" label="Ngày hoàn thành"><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name="contact_person" label="Người liên hệ"><Input /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name="contact_phone" label="Số điện thoại"><Input /></Form.Item></Col>
          <Col span={24}><Form.Item name="notes" label="Ghi chú"><Input.TextArea rows={3} /></Form.Item></Col>
        </Row>
      </Form>
    </Modal>

    <Modal title="Xem trước Import Excel" open={previewOpen} onCancel={() => setPreviewOpen(false)} width={1000} footer={<Space><Button onClick={() => setPreviewOpen(false)}>Đóng</Button><Button type="primary" loading={importing} disabled={!preview || preview.error_rows > 0} onClick={applyImport}>Áp dụng {preview?.valid_rows || 0} dòng</Button></Space>}>
      {preview && <><Alert type={preview.error_rows ? 'error' : 'success'} showIcon message={`${preview.total_rows} dòng · ${preview.valid_rows} hợp lệ · ${preview.error_rows} lỗi`} style={{ marginBottom: 12 }} />
        <Table size="small" rowKey="row_number" pagination={{ pageSize: 10 }} dataSource={preview.rows || []} columns={[
          { title: 'Dòng', dataIndex: 'row_number', width: 70 },
          { title: 'Thao tác', dataIndex: 'action', width: 90, render: value => <Tag>{value}</Tag> },
          { title: 'Địa điểm', render: (_, row) => <><div>{row.data.location_name || '-'}</div><small>{row.data.location_address}</small></> },
          { title: 'Trạng thái', render: (_, row) => <Tag color={STATUS_COLORS[row.data.status]}>{row.data.status}</Tag>, width: 160 },
          { title: 'Kiểm tra', render: (_, row) => row.valid ? <Tag color="success">Hợp lệ</Tag> : <span style={{ color: '#cf1322' }}>{row.errors.join('; ')}</span> },
        ]} />
      </>}
    </Modal>
  </Space>;
};

export default ProjectExecutionPanel;
