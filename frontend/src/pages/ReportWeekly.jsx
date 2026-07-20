import React, { useState } from 'react';
import { Card, DatePicker, Button, Table, Empty, Space } from 'antd';
import { BarChartOutlined, SearchOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

const ReportWeekly = () => {
  const [dateRange, setDateRange] = useState([
    dayjs().startOf('week'),
    dayjs().endOf('week'),
  ]);
  const [reports, setReports] = useState([]);

  const columns = [
    {
      title: 'Dự án',
      dataIndex: 'project_name',
      key: 'project_name',
    },
    {
      title: 'Loại công việc',
      dataIndex: 'schedule_type',
      key: 'schedule_type',
    },
    {
      title: 'Tổng báo cáo',
      dataIndex: 'total_reports',
      key: 'total_reports',
    },
    {
      title: 'Tổng giờ',
      dataIndex: 'total_hours',
      key: 'total_hours',
      render: (hours) => `${hours}h`,
    },
    {
      title: 'Tiến độ TB',
      dataIndex: 'avg_progress',
      key: 'avg_progress',
      render: (progress) => `${Math.round(progress)}%`,
    },
  ];

  return (
    <div>
      <div className="page-header">
        <h1>
          <BarChartOutlined /> Báo cáo Tuần
        </h1>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Space>
          <RangePicker
            value={dateRange}
            onChange={setDateRange}
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
            rowKey="project_name"
            pagination={false}
          />
        ) : (
          <Empty description="Chưa có báo cáo trong tuần này" />
        )}
      </Card>
    </div>
  );
};

export default ReportWeekly;