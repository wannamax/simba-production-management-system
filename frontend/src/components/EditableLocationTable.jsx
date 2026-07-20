import React, { useState } from 'react';
import {
  Table,
  Input,
  InputNumber,
  DatePicker,
  TimePicker,
  Select,
  Button,
  Space,
  Tooltip,
  Popconfirm,
  message,
  Progress,
  Tag,
  Form
} from 'antd';
import {
  EditOutlined,
  SaveOutlined,
  CloseOutlined,
  DeleteOutlined,
  CheckCircleOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import axios from 'axios';

const { TextArea } = Input;
const { Option } = Select;

const API_URL = import.meta.env.VITE_API_URL || '/api';

const EditableLocationTable = ({ taskId, locations, onReload }) => {
  const [editingKey, setEditingKey] = useState('');
  const [form] = Form.useForm();

  const isEditing = (record) => record.id === editingKey;

  const edit = (record) => {
    form.setFieldsValue({
      location_name: record.location_name,
      location_address: record.location_address,
      location_city: record.location_city,
      location_district: record.location_district,
      contact_person: record.contact_person,
      contact_phone: record.contact_phone,
      installation_date: record.installation_date ? dayjs(record.installation_date) : null,
      installation_time_start: record.installation_time_start ? dayjs(record.installation_time_start, 'HH:mm') : null,
      installation_time_end: record.installation_time_end ? dayjs(record.installation_time_end, 'HH:mm') : null,
      estimated_hours: record.estimated_hours,
      status: record.status,
      progress: record.progress,
      product_info: record.product_info,
      work_description: record.work_description,
      notes: record.notes,
    });
    setEditingKey(record.id);
  };

  const cancel = () => {
    setEditingKey('');
  };

  const save = async (id) => {
    try {
      const row = await form.validateFields();
      
      const data = {
        ...row,
        installation_date: row.installation_date?.format('YYYY-MM-DD'),
        installation_time_start: row.installation_time_start?.format('HH:mm'),
        installation_time_end: row.installation_time_end?.format('HH:mm'),
      };

      await axios.put(`${API_URL}/tasks/${taskId}/locations/${id}`, data);
      
      message.success('Cập nhật địa điểm thành công');
      setEditingKey('');
      onReload();
    } catch (error) {
      console.error('Validate Failed:', error);
      message.error('Không thể cập nhật địa điểm');
    }
  };

  const handleComplete = async (locationId) => {
    try {
      await axios.patch(`${API_URL}/tasks/${taskId}/locations/${locationId}/complete`);
      message.success('Đánh dấu hoàn thành địa điểm');
      onReload();
    } catch (error) {
      message.error('Không thể hoàn thành địa điểm');
    }
  };

  const handleDelete = async (locationId) => {
    try {
      await axios.delete(`${API_URL}/tasks/${taskId}/locations/${locationId}`);
      message.success('Xóa địa điểm thành công');
      onReload();
    } catch (error) {
      message.error('Không thể xóa địa điểm');
    }
  };

  const EditableCell = ({
    editing,
    dataIndex,
    title,
    inputType,
    record,
    index,
    children,
    ...restProps
  }) => {
    let inputNode;

    switch (inputType) {
      case 'number':
        inputNode = <InputNumber min={0} step={0.5} style={{ width: '100%' }} />;
        break;
      case 'date':
        inputNode = <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />;
        break;
      case 'time':
        inputNode = <TimePicker format="HH:mm" style={{ width: '100%' }} />;
        break;
      case 'select-status':
        inputNode = (
          <Select style={{ width: '100%' }}>
            <Option value="Chưa bắt đầu">Chưa bắt đầu</Option>
            <Option value="Đang lắp đặt">Đang lắp đặt</Option>
            <Option value="Hoàn thành">Hoàn thành</Option>
            <Option value="Có vấn đề">Có vấn đề</Option>
          </Select>
        );
        break;
      case 'textarea':
        inputNode = <TextArea rows={2} />;
        break;
      default:
        inputNode = <Input />;
    }

    return (
      <td {...restProps}>
        {editing ? (
          <Form.Item
            name={dataIndex}
            style={{ margin: 0 }}
            rules={
              dataIndex === 'location_name' || dataIndex === 'location_address'
                ? [{ required: true, message: `Vui lòng nhập ${title}` }]
                : []
            }
          >
            {inputNode}
          </Form.Item>
        ) : (
          children
        )}
      </td>
    );
  };

  const columns = [
    {
      title: 'STT',
      key: 'index',
      width: 60,
      fixed: 'left',
      render: (_, __, index) => index + 1,
    },
    {
      title: 'Tên địa điểm',
      dataIndex: 'location_name',
      key: 'location_name',
      width: 200,
      editable: true,
      inputType: 'text',
    },
    {
      title: 'Địa chỉ',
      dataIndex: 'location_address',
      key: 'location_address',
      width: 250,
      ellipsis: true,
      editable: true,
      inputType: 'text',
    },
    {
      title: 'Quận/Huyện',
      dataIndex: 'location_district',
      key: 'location_district',
      width: 120,
      editable: true,
      inputType: 'text',
    },
    {
      title: 'Thành phố',
      dataIndex: 'location_city',
      key: 'location_city',
      width: 120,
      editable: true,
      inputType: 'text',
    },
    {
      title: 'Người liên hệ',
      dataIndex: 'contact_person',
      key: 'contact_person',
      width: 150,
      editable: true,
      inputType: 'text',
    },
    {
      title: 'SĐT',
      dataIndex: 'contact_phone',
      key: 'contact_phone',
      width: 120,
      editable: true,
      inputType: 'text',
    },
    {
      title: 'Ngày lắp đặt',
      dataIndex: 'installation_date',
      key: 'installation_date',
      width: 130,
      editable: true,
      inputType: 'date',
      render: (date) => date ? dayjs(date).format('DD/MM/YYYY') : '-',
    },
    {
      title: 'Giờ bắt đầu',
      dataIndex: 'installation_time_start',
      key: 'installation_time_start',
      width: 100,
      editable: true,
      inputType: 'time',
    },
    {
      title: 'Giờ kết thúc',
      dataIndex: 'installation_time_end',
      key: 'installation_time_end',
      width: 100,
      editable: true,
      inputType: 'time',
    },
    {
      title: 'Số giờ DK',
      dataIndex: 'estimated_hours',
      key: 'estimated_hours',
      width: 100,
      editable: true,
      inputType: 'number',
      render: (hours) => hours ? `${hours}h` : '-',
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      editable: true,
      inputType: 'select-status',
      render: (status, record) => {
        if (!isEditing(record)) {
          let color = 'default';
          if (record.is_completed) color = 'success';
          else if (status === 'Đang lắp đặt') color = 'processing';
          else if (status === 'Có vấn đề') color = 'error';
          return <Tag color={color}>{status}</Tag>;
        }
      },
    },
    {
      title: 'Tiến độ',
      dataIndex: 'progress',
      key: 'progress',
      width: 120,
      editable: true,
      inputType: 'number',
      render: (progress, record) => {
        if (!isEditing(record)) {
          return <Progress percent={progress || 0} size="small" />;
        }
      },
    },
    {
      title: 'Thông tin SP',
      dataIndex: 'product_info',
      key: 'product_info',
      width: 200,
      ellipsis: true,
      editable: true,
      inputType: 'textarea',
    },
    {
      title: 'Mô tả CV',
      dataIndex: 'work_description',
      key: 'work_description',
      width: 200,
      ellipsis: true,
      editable: true,
      inputType: 'textarea',
    },
    {
      title: 'Ghi chú',
      dataIndex: 'notes',
      key: 'notes',
      width: 200,
      ellipsis: true,
      editable: true,
      inputType: 'textarea',
    },
    {
      title: 'Hành động',
      key: 'action',
      width: 180,
      fixed: 'right',
      render: (_, record) => {
        const editable = isEditing(record);
        return editable ? (
          <Space size="small">
            <Tooltip title="Lưu">
              <Button
                type="link"
                icon={<SaveOutlined />}
                onClick={() => save(record.id)}
                size="small"
                style={{ color: '#52c41a' }}
              />
            </Tooltip>
            <Tooltip title="Hủy">
              <Button
                type="link"
                icon={<CloseOutlined />}
                onClick={cancel}
                size="small"
              />
            </Tooltip>
          </Space>
        ) : (
          <Space size="small">
            <Tooltip title="Sửa">
              <Button
                type="link"
                icon={<EditOutlined />}
                onClick={() => edit(record)}
                size="small"
                disabled={editingKey !== ''}
              />
            </Tooltip>
            {!record.is_completed && (
              <Tooltip title="Hoàn thành">
                <Button
                  type="link"
                  icon={<CheckCircleOutlined />}
                  onClick={() => handleComplete(record.id)}
                  size="small"
                  style={{ color: '#52c41a' }}
                  disabled={editingKey !== ''}
                />
              </Tooltip>
            )}
            <Tooltip title="Xóa">
              <Popconfirm
                title="Xác nhận xóa địa điểm?"
                onConfirm={() => handleDelete(record.id)}
                disabled={editingKey !== ''}
              >
                <Button
                  type="link"
                  danger
                  icon={<DeleteOutlined />}
                  size="small"
                  disabled={editingKey !== ''}
                />
              </Popconfirm>
            </Tooltip>
          </Space>
        );
      },
    },
  ];

  const mergedColumns = columns.map((col) => {
    if (!col.editable) {
      return col;
    }
    return {
      ...col,
      onCell: (record) => ({
        record,
        inputType: col.inputType,
        dataIndex: col.dataIndex,
        title: col.title,
        editing: isEditing(record),
      }),
    };
  });

  return (
    <Form form={form} component={false}>
      <Table
        components={{
          body: {
            cell: EditableCell,
          },
        }}
        bordered
        dataSource={locations}
        columns={mergedColumns}
        rowKey="id"
        pagination={false}
        scroll={{ x: 2500 }}
        locale={{ emptyText: 'Chưa có địa điểm nào' }}
      />
    </Form>
  );
};

export default EditableLocationTable;