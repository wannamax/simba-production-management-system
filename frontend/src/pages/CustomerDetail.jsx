import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Descriptions,
  Button,
  Space,
  Table,
  Tag,
  Spin,
  Empty,
  message,
  Row,
  Col,
  Statistic
} from 'antd';
import {
  ArrowLeftOutlined,
  EditOutlined,
  PhoneOutlined,
  MailOutlined,
  EnvironmentOutlined,
  ProjectOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { customerAPI } from '../services/api';
import { PROJECT_STATUS_COLORS, formatCurrency } from '../utils/constants';

const CustomerDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCustomer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadCustomer = async () => {
    try {
      const response = await customerAPI.getById(id);
      setCustomer(response.data);
    } catch (error) {
      message.error('Không thể tải thông tin khách hàng');
      navigate('/customers');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <Spin size="large" tip="Đang tải..." />
      </div>
    );
  }

  if (!customer) {
    return <Empty description="Không tìm thấy khách hàng" />;
  }

  const projectColumns = [
    {
      title: 'Mã dự án',
      dataIndex: 'project_code',
      key: 'project_code',
      width: 130,
    },
    {
      title: 'Tên dự án',
      dataIndex: 'project_name',
      key: 'project_name',
    },
    {
      title: 'Loại',
      dataIndex: 'project_type',
      key: 'project_type',
      width: 120,
    },
    {
      title: 'Ngày bắt đầu',
      dataIndex: 'start_date',
      key: 'start_date',
      width: 120,
      render: (date) => (date ? dayjs(date).format('DD/MM/YYYY') : '-'),
    },
    {
      title: 'Ngân sách',
      dataIndex: 'budget',
      key: 'budget',
      width: 130,
      align: 'right',
      render: (value) => formatCurrency(value),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status) => (
        <Tag color={PROJECT_STATUS_COLORS[status]}>{status}</Tag>
      ),
    },
    {
      title: 'Hành động',
      key: 'action',
      width: 100,
      render: (_, record) => (
        <Button
          type="link"
          onClick={() => navigate(`/projects/${record.id}`)}
        >
          Chi tiết
        </Button>
      ),
    },
  ];

  const projects = customer.projects || [];
  const totalBudget = projects.reduce(
    (sum, p) => sum + (parseFloat(p.budget) || 0),
    0
  );

  return (
    <div>
      <div className="page-header">
        <Space>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/customers')}
          >
            Quay lại
          </Button>
          <h1>{customer.company_name}</h1>
        </Space>
        <Button
          type="primary"
          icon={<EditOutlined />}
          onClick={() => navigate(`/customers/${id}/edit`)}
        >
          Chỉnh sửa
        </Button>
      </div>

      {/* Statistics */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Tổng dự án"
              value={projects.length}
              prefix={<ProjectOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Đang thực hiện"
              value={
                projects.filter(
                  (p) =>
                    p.status === 'Đang sản xuất' ||
                    p.status === 'Đang lắp đặt'
                ).length
              }
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Tổng giá trị"
              value={totalBudget}
              formatter={(value) => formatCurrency(value)}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Customer Info */}
      <Card title="Thông tin khách hàng" style={{ marginBottom: 16 }}>
        <Descriptions column={{ xs: 1, sm: 2, md: 3 }}>
          <Descriptions.Item label="Mã khách hàng">
            <Tag color="blue">{customer.customer_code}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Người liên hệ">
            {customer.contact_person}
          </Descriptions.Item>
          <Descriptions.Item label="Số điện thoại">
            <PhoneOutlined /> {customer.phone || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="Email">
            <MailOutlined /> {customer.email || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="Mã số thuế">
            {customer.tax_code || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="Thành phố">
            {customer.city || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="Địa chỉ" span={3}>
            <EnvironmentOutlined /> {customer.address || '-'}
          </Descriptions.Item>
          {customer.notes && (
            <Descriptions.Item label="Ghi chú" span={3}>
              {customer.notes}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      {/* Projects */}
      <Card title={`Dự án (${projects.length})`}>
        <Table
          dataSource={projects}
          columns={projectColumns}
          rowKey="id"
          pagination={projects.length > 10}
          locale={{ emptyText: 'Chưa có dự án nào' }}
          scroll={{ x: 'max-content' }}
        />
      </Card>
    </div>
  );
};

export default CustomerDetail;