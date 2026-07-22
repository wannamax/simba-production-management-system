import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Button, Card, Checkbox, Col, Descriptions, Empty, Input, List, Modal,
  Progress, Row, Space, Spin, Statistic, Table, Tabs, Tag, Typography, message,
} from 'antd';
import {
  CheckCircleOutlined, DownloadOutlined, FileExcelOutlined, FilePdfOutlined,
  LockOutlined, ReloadOutlined, TeamOutlined, ToolOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { projectCloseoutAPI } from '../services/api';

const { Text, Title } = Typography;

const currency = value => new Intl.NumberFormat('vi-VN', {
  style: 'currency', currency: 'VND', maximumFractionDigits: 0,
}).format(Number(value || 0));

const blockerLabels = {
  open_tasks: 'nhiệm vụ chưa hoàn tất',
  open_schedules: 'lịch trình chưa hoàn tất',
  open_reservations: 'giữ chỗ vật tư chưa xử lý',
  draft_inventory_documents: 'chứng từ kho nháp',
  incomplete_required_checklist: 'mục checklist bắt buộc chưa xong',
};

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const ProjectCloseoutPanel = ({ projectId, onClosed }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [closeModal, setCloseModal] = useState(false);
  const [closureNotes, setClosureNotes] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const response = await projectCloseoutAPI.get(projectId);
      setData(response.data);
    } catch (error) {
      message.error(error.message || 'Không thể tải dữ liệu đóng dự án');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [projectId]);

  const completed = data?.checklist?.filter(item => item.is_completed).length || 0;
  const checklistTotal = data?.checklist?.length || 0;
  const progress = checklistTotal ? Math.round((completed / checklistTotal) * 100) : 0;
  const activeBlockers = useMemo(() => Object.entries(data?.blockers || {})
    .filter(([, value]) => Number(value) > 0), [data]);
  const isClosed = data?.project?.closeout_status === 'CLOSED';

  const updateChecklist = async (item, checked) => {
    setBusy(true);
    try {
      await projectCloseoutAPI.updateChecklist(item.id, {
        is_completed: checked,
        notes: item.notes || null,
      });
      await load();
    } catch (error) {
      message.error(error.message || 'Không thể cập nhật checklist');
    } finally {
      setBusy(false);
    }
  };

  const closeProject = async () => {
    setBusy(true);
    try {
      await projectCloseoutAPI.close(projectId, { closure_notes: closureNotes || null });
      message.success('Đã đóng dự án và lưu snapshot báo cáo');
      setCloseModal(false);
      await load();
      onClosed?.();
    } catch (error) {
      message.error(error.message || 'Chưa thể đóng dự án');
    } finally {
      setBusy(false);
    }
  };

  const exportReport = async type => {
    setBusy(true);
    try {
      const response = type === 'pdf'
        ? await projectCloseoutAPI.exportPdf(projectId)
        : await projectCloseoutAPI.exportExcel(projectId);
      const extension = type === 'pdf' ? 'pdf' : 'xlsx';
      downloadBlob(response, `${data.project.project_code}-closeout.${extension}`);
      message.success(`Đã xuất báo cáo ${type.toUpperCase()}`);
    } catch (error) {
      message.error(error.message || 'Không thể xuất báo cáo');
    } finally {
      setBusy(false);
    }
  };

  if (loading && !data) return <Card><Spin tip="Đang tổng hợp dữ liệu đóng dự án..." /></Card>;
  if (!data) return <Card><Empty description="Không có dữ liệu đóng dự án" /></Card>;

  const employeeColumns = [
    { title: 'Mã NV', dataIndex: 'employee_code', width: 110 },
    { title: 'Họ tên', dataIndex: 'full_name' },
    { title: 'Phòng ban', dataIndex: 'department' },
    { title: 'Vai trò', dataIndex: 'roles' },
    { title: 'Giờ công', dataIndex: 'total_work_hours', width: 100, align: 'right' },
  ];
  const hourColumns = [
    { title: 'Ngày', dataIndex: 'report_date', width: 110, render: value => value ? dayjs(value).format('DD/MM/YYYY') : '-' },
    { title: 'Nguồn', dataIndex: 'source', width: 150 },
    { title: 'Nhân viên', dataIndex: 'employee_name', width: 180 },
    { title: 'Nội dung', dataIndex: 'work_done' },
    { title: 'Giờ', dataIndex: 'work_hours', width: 80, align: 'right' },
  ];
  const materialColumns = [
    { title: 'Mã', dataIndex: 'material_code', width: 120 },
    { title: 'Vật tư', dataIndex: 'material_name' },
    { title: 'Dự trù', render: (_, row) => `${Number(row.planned_quantity || 0)} ${row.unit_symbol}` },
    { title: 'Thực xuất', render: (_, row) => `${Number(row.net_issued_quantity || 0)} ${row.unit_symbol}` },
    { title: 'Chi phí thực tế', dataIndex: 'actual_cost', align: 'right', render: currency },
  ];

  return <Space direction="vertical" size="middle" style={{ width: '100%' }}>
    {isClosed ? <Alert type="success" showIcon icon={<CheckCircleOutlined />} message="Dự án đã đóng"
      description={`Snapshot báo cáo phiên bản ${data.snapshot?.snapshot_version || 1} đã được khóa và lưu trữ.`} />
      : activeBlockers.length > 0 && <Alert type="warning" showIcon message="Chưa thể đóng dự án"
        description={activeBlockers.map(([key, value]) => `${value} ${blockerLabels[key] || key}`).join('; ')} />}

    <Row gutter={[16, 16]}>
      <Col xs={24} sm={12} xl={6}><Card><Statistic title="Tiến độ checklist" value={progress} suffix="%" /><Progress percent={progress} showInfo={false} /></Card></Col>
      <Col xs={24} sm={12} xl={6}><Card><Statistic title="Nhân sự" value={data.summary.total_employees} prefix={<TeamOutlined />} /></Card></Col>
      <Col xs={24} sm={12} xl={6}><Card><Statistic title="Tổng giờ công" value={data.summary.total_work_hours} suffix="giờ" /></Card></Col>
      <Col xs={24} sm={12} xl={6}><Card><Statistic title="Tổng chi phí thực tế" value={data.summary.total_actual_cost} formatter={currency} /></Card></Col>
    </Row>

    <Card title="Checklist đóng dự án" extra={<Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Làm mới</Button>}>
      <List dataSource={data.checklist} renderItem={item => <List.Item>
        <Checkbox disabled={isClosed || busy} checked={item.is_completed} onChange={event => updateChecklist(item, event.target.checked)}>
          <Text delete={item.is_completed}>{item.label}</Text>{item.is_required && <Tag color="blue" style={{ marginLeft: 8 }}>Bắt buộc</Tag>}
        </Checkbox>
      </List.Item>} />
    </Card>

    <Tabs items={[
      { key: 'employees', label: 'Tổng hợp nhân sự', children: <Table rowKey="id" dataSource={data.employees} columns={employeeColumns} pagination={false} scroll={{ x: 700 }} /> },
      { key: 'hours', label: 'Tổng hợp giờ công', children: <Table rowKey={(row, index) => `${row.source}-${row.report_date}-${row.employee_id}-${index}`} dataSource={data.hours} columns={hourColumns} pagination={{ pageSize: 10 }} scroll={{ x: 760 }} /> },
      { key: 'materials', label: 'Tổng hợp vật tư', children: <Table rowKey="requirement_id" dataSource={data.materials} columns={materialColumns} pagination={false} scroll={{ x: 760 }} /> },
      { key: 'costs', label: 'Tổng hợp chi phí', children: <Descriptions bordered column={{ xs: 1, sm: 2 }}>
        <Descriptions.Item label="Chi phí ngoài vật tư">{currency(data.summary.base_actual_cost)}</Descriptions.Item>
        <Descriptions.Item label="Chi phí vật tư">{currency(data.summary.total_material_cost)}</Descriptions.Item>
        <Descriptions.Item label="Tổng chi phí thực tế">{currency(data.summary.total_actual_cost)}</Descriptions.Item>
        <Descriptions.Item label="Ngân sách">{currency(data.summary.budget)}</Descriptions.Item>
        <Descriptions.Item label="Chênh lệch ngân sách" span={2}><Text type={data.summary.budget_variance < 0 ? 'danger' : 'success'}>{currency(data.summary.budget_variance)}</Text></Descriptions.Item>
      </Descriptions> },
    ]} />

    <Card>
      <Space wrap>
        <Button icon={<FilePdfOutlined />} loading={busy} onClick={() => exportReport('pdf')}>Xuất PDF</Button>
        <Button icon={<FileExcelOutlined />} loading={busy} onClick={() => exportReport('excel')}>Xuất Excel</Button>
        {!isClosed && <Button type="primary" danger icon={<LockOutlined />} disabled={!data.can_close} onClick={() => setCloseModal(true)}>Chốt và đóng dự án</Button>}
        {!isClosed && <Text type="secondary"><DownloadOutlined /> Có thể xuất bản nháp trước khi đóng.</Text>}
      </Space>
    </Card>

    <Modal title="Xác nhận đóng dự án" open={closeModal} confirmLoading={busy}
      okText="Tạo snapshot và đóng" cancelText="Hủy" onOk={closeProject} onCancel={() => setCloseModal(false)}>
      <Alert type="warning" showIcon message="Sau khi đóng, snapshot báo cáo sẽ được khóa để lưu trữ." style={{ marginBottom: 16 }} />
      <Title level={5}>Ghi chú đóng dự án</Title>
      <Input.TextArea rows={4} value={closureNotes} onChange={event => setClosureNotes(event.target.value)} placeholder="Biên bản, bàn giao, ghi chú quyết toán..." />
    </Modal>
  </Space>;
};

export default ProjectCloseoutPanel;
