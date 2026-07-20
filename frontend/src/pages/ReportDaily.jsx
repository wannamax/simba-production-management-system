import React, { useState } from 'react';
import { Card, DatePicker, Button, Table, Tag, Empty, Space } from 'antd';
import { FileTextOutlined, SearchOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

const ReportDaily = () => {
  const [selectedDate, setSelectedDate] = useState(dayjs());
  const [reports, setReports] = useState([]);

  const columns = [
    {
      title: 'Nhân viên',
      dataIndex: 'employee_name',
      key: 'employee_name',
    },
    {
      title: 'Dự án',
      dataIndex: 'project_name',
      key: 'project_name',
    },
    {
      title: 'Công việc',
      dataIndex: 'work_done',
      key: 'work_done',
      ellipsis: true,
    },
    {
      title: 'Giờ làm',
      dataIndex: 'work_hours',
      key: 'work_hours',
      render: (hours) => `${hours}h`,
    },
    {
      title: 'Tiến độ',
      dataIndex: 'progress_update',
      key: 'progress_update',
      render: (progress) => <Tag color="blue">{progress}%</Tag>,
    },
  ];

  return (
    <div>
      <div className="page-header">
        <h1>
          <FileTextOutlined /> Báo cáo Ngày
        </h1>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Space>
          <DatePicker
            value={selectedDate}
            onChange={setSelectedDate}
            format="DD/MM/YYYY"
          />
          <Button type="primary" icon={<SearchOutlined />}>
            Xem báo cáo
          </Button>
        </Space>
      </Card>

      <Card>
        {reports.length > 0 ? (
          <Table
            columns={columns}
            dataSource={reports}
            rowKey="id"
            pagination={false}
          />
        ) : (
          <Empty description="Chưa có báo cáo trong ngày này" />
        )}
      </Card>
    </div>
  );
};

export default ReportDaily;