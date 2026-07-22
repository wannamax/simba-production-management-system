import React, { useEffect, useState } from 'react';
import { Button, Card, Descriptions, Empty, Modal, Table, Tag, Typography, message } from 'antd';
import dayjs from 'dayjs';
import { shopfloorWorkBoardAPI } from '../services/api';

const { Text } = Typography;

export default function ProjectDailyLogsPanel({ projectId }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const response = await shopfloorWorkBoardAPI.getProjectLogs({ project_id: projectId });
      setLogs(response.data || []);
    } catch (error) { message.error(error.message); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [projectId]);

  const columns = [
    { title: 'Ngày', dataIndex: 'log_date', width: 110, render: value => dayjs(value).format('DD/MM/YYYY') },
    { title: 'Ca/Xưởng', width: 190, render: (_, row) => <><b>{row.shift_name}</b><br/><Text type="secondary">{row.workshop}</Text></> },
    { title: 'Công việc', dataIndex: 'item_count', width: 95 },
    { title: 'Nhân sự', dataIndex: 'employee_count', width: 90 },
    { title: 'Hoàn thành', width: 115, render: (_, row) => <Tag color="green">{row.completed_count}/{row.item_count}</Tag> },
    { title: 'Giờ kế hoạch', dataIndex: 'planned_hours', width: 120 },
    { title: 'Giờ thực tế', dataIndex: 'actual_hours', width: 110 },
    { title: 'Tổng kết', dataIndex: 'summary', ellipsis: true, render: value => value || '-' },
    { title: '', width: 85, render: (_, row) => <Button size="small" onClick={() => setSelected(row)}>Chi tiết</Button> },
  ];

  const itemColumns = [
    { title: 'Giờ', width: 110, render: (_, row) => `${(row.start_time || '--:--').slice(0, 5)}–${(row.end_time || '--:--').slice(0, 5)}` },
    { title: 'Nhân viên/Tổ', width: 170, render: (_, row) => row.assignments?.map(x => x.full_name || x.team_name).join(', ') || '-' },
    { title: 'Task', dataIndex: 'task_code', width: 110, render: value => value || '-' },
    { title: 'Công việc trong ngày', dataIndex: 'title' },
    { title: 'Khu vực', dataIndex: 'work_area', width: 120, render: value => value || '-' },
    { title: 'Trạng thái', dataIndex: 'status', width: 130 },
    { title: 'Giờ thực tế', dataIndex: 'actual_hours', width: 105, render: value => value ?? '-' },
  ];

  return <Card title="Nhật ký Dự án từ Bảng điều hành xưởng" extra={<Button onClick={load}>Làm mới</Button>}>
    <Table rowKey="id" loading={loading} dataSource={logs} columns={columns} pagination={{ pageSize: 10 }} scroll={{ x: 1100 }} locale={{ emptyText: <Empty description="Chưa có ngày làm việc nào được chốt" /> }} />
    <Modal width={1050} title={`Nhật ký ngày ${selected ? dayjs(selected.log_date).format('DD/MM/YYYY') : ''}`} open={Boolean(selected)} footer={null} onCancel={() => setSelected(null)}>
      {selected && <>
        <Descriptions bordered size="small" column={3} style={{ marginBottom: 16 }}>
          <Descriptions.Item label="Ca">{selected.shift_name}</Descriptions.Item>
          <Descriptions.Item label="Xưởng">{selected.workshop}</Descriptions.Item>
          <Descriptions.Item label="Chốt lúc">{dayjs(selected.closed_at).format('HH:mm DD/MM/YYYY')}</Descriptions.Item>
          <Descriptions.Item label="Nhân sự">{selected.employee_count}</Descriptions.Item>
          <Descriptions.Item label="Giờ kế hoạch">{selected.planned_hours}</Descriptions.Item>
          <Descriptions.Item label="Giờ thực tế">{selected.actual_hours}</Descriptions.Item>
          <Descriptions.Item label="Tổng kết" span={3}>{selected.summary || '-'}</Descriptions.Item>
        </Descriptions>
        <Table rowKey="id" dataSource={selected.snapshot_data?.items || []} columns={itemColumns} pagination={false} scroll={{ x: 1000 }} />
      </>}
    </Modal>
  </Card>;
}
