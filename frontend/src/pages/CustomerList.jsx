import React, { useEffect, useState, useCallback } from 'react';
import {
  Table,
  Button,
  Space,
  Input,
  Modal,
  Form,
  message,
  Popconfirm,
  Card,
  Row,
  Col,
  Statistic,
  Tag,
  Select
} from 'antd';
import {
  PlusOutlined,
  EyeOutlined,
  EditOutlined,
  DeleteOutlined,
  TeamOutlined,
  PhoneOutlined,
  MailOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { customerAPI, settingsAPI } from '../services/api';

const { Search } = Input;

const CustomerList = () => {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [provinces, setProvinces] = useState([]);
  const [communes, setCommunes] = useState([]);
  const [form] = Form.useForm();
  const selectedProvince = Form.useWatch('province_code', form);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0,
  });
  const [searchText, setSearchText] = useState('');

  // Sử dụng useCallback để tránh warning
  const loadCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await customerAPI.getAll({
        search: searchText,
        page: pagination.current,
        limit: pagination.pageSize,
      });
      setCustomers(response.data);
      setPagination((prev) => ({
        ...prev,
        total: response.pagination?.total || response.data.length,
      }));
    } catch (error) {
      message.error('Không thể tải danh sách khách hàng');
      console.error('Error loading customers:', error);
    } finally {
      setLoading(false);
    }
  }, [searchText, pagination.current, pagination.pageSize]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  useEffect(() => {
    settingsAPI.getProvinces().then(response => setProvinces(response.data || []))
      .catch(error => message.warning(error.message || 'Không thể tải danh mục Tỉnh/Thành'));
  }, []);

  const loadCommunes = async (provinceCode) => {
    if (!provinceCode) { setCommunes([]); return; }
    try {
      const response = await settingsAPI.getCommunes(provinceCode);
      setCommunes(response.data || []);
    } catch (error) { message.warning(error.message || 'Không thể tải danh mục Phường/Xã'); }
  };

  const handleCreate = () => {
    setEditingCustomer(null);
    form.resetFields();
    setCommunes([]);
    setModalVisible(true);
  };

  const handleEdit = (record) => {
    setEditingCustomer(record);
    form.setFieldsValue(record);
    loadCommunes(record.province_code);
    setModalVisible(true);
  };

  const handleDelete = async (id) => {
    try {
      await customerAPI.delete(id);
      message.success('Xóa khách hàng thành công');
      loadCustomers();
    } catch (error) {
      message.error(error.message || 'Không thể xóa khách hàng');
    }
  };

  const handleSubmit = async (values) => {
    try {
      if (editingCustomer) {
        await customerAPI.update(editingCustomer.id, values);
        message.success('Cập nhật khách hàng thành công');
      } else {
        await customerAPI.create(values);
        message.success('Tạo khách hàng thành công');
      }

      setModalVisible(false);
      form.resetFields();
      loadCustomers();
    } catch (error) {
      message.error(
        error.message ||
          (editingCustomer
            ? 'Không thể cập nhật khách hàng'
            : 'Không thể tạo khách hàng')
      );
    }
  };

  const handleSearch = (value) => {
    setSearchText(value);
    setPagination((prev) => ({ ...prev, current: 1 }));
  };

  const handleViewDetail = (record) => {
    navigate(`/customers/${record.id}`);
  };

  const columns = [
    {
      title: 'Mã KH',
      dataIndex: 'customer_code',
      key: 'customer_code',
      width: 120,
      fixed: 'left',
    },
    {
      title: 'Tên công ty',
      dataIndex: 'company_name',
      key: 'company_name',
      width: 250,
      ellipsis: true,
      render: (text, record) => (
        <a onClick={() => handleViewDetail(record)}>{text}</a>
      ),
    },
    {
      title: 'Người liên hệ',
      dataIndex: 'contact_person',
      key: 'contact_person',
      width: 150,
      ellipsis: true,
    },
    {
      title: 'Số điện thoại',
      dataIndex: 'phone',
      key: 'phone',
      width: 130,
      render: (phone) => (
        <span>
          <PhoneOutlined /> {phone || '-'}
        </span>
      ),
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      width: 200,
      ellipsis: true,
      render: (email) => (
        <span>
          <MailOutlined /> {email || '-'}
        </span>
      ),
    },
    {
      title: 'Địa chỉ',
      key: 'address',
      width: 250,
      ellipsis: true,
      render: (_, record) => [record.address, record.commune_name && `${record.commune_type} ${record.commune_name}`, record.province_name && `${record.province_type} ${record.province_name}`].filter(Boolean).join(', ') || '-',
    },
    {
      title: 'Mã số thuế',
      dataIndex: 'tax_code',
      key: 'tax_code',
      width: 130,
    },
    {
      title: 'Hành động',
      key: 'action',
      width: 150,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={() => handleViewDetail(record)}
            size="small"
          >
            Xem
          </Button>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
            size="small"
          />
          <Popconfirm
            title="Bạn có chắc muốn xóa khách hàng này?"
            onConfirm={() => handleDelete(record.id)}
            okText="Xóa"
            cancelText="Hủy"
            okButtonProps={{ danger: true }}
          >
            <Button type="link" danger icon={<DeleteOutlined />} size="small" />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // Statistics
  const stats = {
    total: pagination.total,
    active: customers.length,
  };

  return (
    <div>
      <div className="page-header">
        <h1>Quản lý Khách hàng</h1>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          Thêm khách hàng
        </Button>
      </div>

      {/* Statistics */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={8}>
          <Card>
            <Statistic
              title="Tổng số khách hàng"
              value={stats.total}
              prefix={<TeamOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card>
            <Statistic
              title="Đang hiển thị"
              value={stats.active}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card>
            <Statistic
              title="Trạng thái"
              value="Hoạt động"
              valueStyle={{ color: '#52c41a' }}
              prefix={<Tag color="success">●</Tag>}
            />
          </Card>
        </Col>
      </Row>

      {/* Search */}
      <Card style={{ marginBottom: 16 }}>
        <Search
          placeholder="Tìm kiếm theo tên công ty, mã KH, người liên hệ..."
          onSearch={handleSearch}
          onChange={(e) => {
            if (e.target.value === '') {
              setSearchText('');
              setPagination((prev) => ({ ...prev, current: 1 }));
            }
          }}
          style={{ width: '100%', maxWidth: 400 }}
          allowClear
          enterButton
        />
      </Card>

      {/* Table */}
      <Card>
        <Table
          columns={columns}
          dataSource={customers}
          rowKey="id"
          loading={loading}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            showTotal: (total) => `Tổng ${total} khách hàng`,
            onChange: (page, pageSize) => {
              setPagination((prev) => ({
                ...prev,
                current: page,
                pageSize: pageSize,
              }));
            },
          }}
          scroll={{ x: 1400 }}
        />
      </Card>

      {/* Modal */}
      <Modal
        title={
          editingCustomer ? 'Cập nhật khách hàng' : 'Thêm khách hàng mới'
        }
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          form.resetFields();
        }}
        footer={null}
        width={800}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item
                name="company_name"
                label="Tên công ty"
                rules={[
                  { required: true, message: 'Vui lòng nhập tên công ty' },
                ]}
              >
                <Input placeholder="Nhập tên công ty" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="contact_person"
                label="Người liên hệ"
                rules={[
                  {
                    required: true,
                    message: 'Vui lòng nhập tên người liên hệ',
                  },
                ]}
              >
                <Input placeholder="Nhập tên người liên hệ" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="phone"
                label="Số điện thoại"
                rules={[
                  { required: true, message: 'Vui lòng nhập số điện thoại' },
                  {
                    pattern: /^[0-9]{10,11}$/,
                    message: 'Số điện thoại không hợp lệ',
                  },
                ]}
              >
                <Input placeholder="Nhập số điện thoại" maxLength={11} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="email"
                label="Email"
                rules={[
                  { type: 'email', message: 'Email không hợp lệ' },
                ]}
              >
                <Input placeholder="Nhập email" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="tax_code" label="Mã số thuế">
                <Input placeholder="Nhập mã số thuế" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={24}>
              <Form.Item name="address" label="Địa chỉ">
                <Input.TextArea
                  rows={2}
                  placeholder="Nhập địa chỉ đầy đủ"
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="province_code" label="Tỉnh/Thành phố">
                <Select showSearch allowClear optionFilterProp="label" placeholder="Chọn Tỉnh/Thành" options={provinces.map(item => ({ value: item.code, label: `${item.unit_type} ${item.name}` }))} onChange={value => { form.setFieldValue('commune_code', null); loadCommunes(value); }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="commune_code" label="Phường/Xã/Đặc khu">
                <Select showSearch allowClear optionFilterProp="label" disabled={!selectedProvince} placeholder="Chọn Phường/Xã" options={communes.map(item => ({ value: item.code, label: `${item.unit_type} ${item.name}` }))} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="notes" label="Ghi chú">
            <Input.TextArea rows={3} placeholder="Nhập ghi chú" />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                {editingCustomer ? 'Cập nhật' : 'Tạo mới'}
              </Button>
              <Button
                onClick={() => {
                  setModalVisible(false);
                  form.resetFields();
                }}
              >
                Hủy
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default CustomerList;
