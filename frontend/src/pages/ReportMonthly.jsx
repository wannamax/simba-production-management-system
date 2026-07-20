
import React, { useState } from 'react';
import { Card, DatePicker, Button, Table, Empty, Space, Statistic, Row, Col } from 'antd';
import { BarChartOutlined, SearchOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

const ReportMonthly = () => {
  const [selectedMonth, setSelectedMonth] = useState(dayjs());
  const [reports, setReports] = useState([]);

  const columns = [
    {
      title: 'Dự án',
      dataIndex: 'project_name',
      key: 'project_name',
    },
    {
      title: 'Trạng thái',
      dataIndex: 'project_status',
      key: 'project_status',
    },
    {
      title: 'Tổng lịch trình',
      dataIndex: 'total_schedules',
      key: 'total_schedules',
    },
    {
      title: 'Hoàn thành',
      dataIndex: 'completed_schedules',
      key: 'completed_schedules',
    },
    {
      title: 'Tổng giờ',
      dataIndex: 'total_hours',
      key: 'total_hours',
      render: (hours) => hours ? `${hours}h` : '0h',
    },
    {
      title: 'Tiến độ TB',
      dataIndex: 'avg_progress',
      key: 'avg_progress',
      render: (progress) => progress ? `${Math.round(progress)}%` : '0%',
    },
  ];

  return (
    <div>
      <div className="page-header">
        <h1>
          <BarChartOutlined /> Báo cáo Tháng
        </h1>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Space>
          <DatePicker
            picker="month"
            value={selectedMonth}
            onChange={setSelectedMonth}
            format="MM/YYYY"
          />
          <Button type="primary" icon={<SearchOutlined />}>
            Xem báo cáo
          </Button>
        </Space>
      </Card>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card>
            <Statistic title="Tổng dự án" value={0} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="Tổng báo cáo" value={0} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="Tổng giờ làm" value={0} suffix="h" />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="Nhân viên" value={0} />
          </Card>
        </Col>
      </Row>

      <Card>
        {reports.length > 0 ? (
          <Table
            columns={columns}
            dataSource={reports}
            rowKey="project_id"
            pagination={false}
          />
        ) : (
          <Empty description="Chưa có báo cáo trong tháng này" />
        )}
      </Card>
    </div>
  );
};

export default ReportMonthly;