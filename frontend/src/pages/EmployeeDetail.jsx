import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Descriptions, Button, Space, Spin, Empty, message, Tag } from 'antd';
import { ArrowLeftOutlined, EditOutlined } from '@ant-design/icons';
import { employeeAPI } from '../services/api';
import { formatCurrency } from '../utils/constants';
import dayjs from 'dayjs';

const EmployeeDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEmployee();
  }, [id]);

  const loadEmployee = async () => {
    try {
      const response = await employeeAPI.getById(id);
      setEmployee(response.data);
    } catch (error) {
      message.error('Không thể tải thông tin nhân viên');
      navigate('/employees');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!employee) {
    return <Empty description="Không tìm thấy nhân viên" />;
  }

  return (
    <div>
      <div className="page-header">
        <Space>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/employees')}
          >
            Quay lại
          </Button>
          <h1>{employee.full_name}</h1>
        </Space>
        <Button type="primary" icon={<EditOutlined />}>
          Chỉnh sửa
        </Button>
      </div>

      <Card>
        <Descriptions column={{ xs: 1, sm: 2 }}>
          <Descriptions.Item label="Mã nhân viên">
            {employee.employee_code}
          </Descriptions.Item>
          <Descriptions.Item label="Trạng thái">
            <Tag color={employee.status === 'Hoạt động' ? 'green' : 'red'}>
              {employee.status}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Họ tên">
            {employee.full_name}
          </Descriptions.Item>
          <Descriptions.Item label="Vị trí">
            {employee.position}
          </Descriptions.Item>
          <Descriptions.Item label="Phòng ban">
            {employee.department}
          </Descriptions.Item>
          <Descriptions.Item label="Số điện thoại">
            {employee.phone}
          </Descriptions.Item>
          <Descriptions.Item label="Email">
            {employee.email}
          </Descriptions.Item>
          <Descriptions.Item label="Lương">
            {employee.salary ? formatCurrency(employee.salary) : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="Ngày vào làm">
            {employee.hire_date ? dayjs(employee.hire_date).format('DD/MM/YYYY') : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="CMND/CCCD">
            {employee.id_number}
          </Descriptions.Item>
          <Descriptions.Item label="Địa chỉ" span={2}>
            {employee.address}
          </Descriptions.Item>
        </Descriptions>
      </Card>
    </div>
  );
};

export default EmployeeDetail;