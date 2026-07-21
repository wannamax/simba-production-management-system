import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Form, Input, InputNumber, Modal, Popconfirm, Row, Select, Space, Switch, Table, Tag, Typography, message } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, SwapOutlined } from '@ant-design/icons';
import { materialAPI } from '../services/api';

const { Title, Text } = Typography;
const trackingOptions = [
  { value: 'NONE', label: 'Không theo dõi' },
  { value: 'BATCH', label: 'Theo lô (chuẩn bị schema)' },
  { value: 'SERIAL', label: 'Theo serial (chuẩn bị schema)' },
  { value: 'BATCH_EXPIRY', label: 'Theo lô và hạn sử dụng (chuẩn bị schema)' },
];

export default function MaterialList() {
  const [form] = Form.useForm();
  const [conversionForm] = Form.useForm();
  const [materials, setMaterials] = useState([]);
  const [meta, setMeta] = useState({ categories: [], units: [], suppliers: [], warehouses: [], settings: {}, catalogs: {} });
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [conversionOpen, setConversionOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [conversionMaterial, setConversionMaterial] = useState(null);
  const [filters, setFilters] = useState({ search: '', category_id: undefined, is_active: undefined });

  const load = async () => {
    setLoading(true);
    try {
      const [list, metadata] = await Promise.all([materialAPI.getAll(filters), materialAPI.getMeta()]);
      setMaterials(list.data || []);
      setMeta(metadata.data || {});
    } catch (error) { message.error(error.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const activeCategories = useMemo(() => (meta.categories || []).filter(x => x.is_active), [meta]);
  const activeUnits = useMemo(() => (meta.units || []).filter(x => x.is_active), [meta]);
  const activeSuppliers = useMemo(() => (meta.suppliers || []).filter(x => x.is_active), [meta]);
  const brands = meta.catalogs?.MATERIAL_BRAND || [];
  const storageConditions = meta.catalogs?.STORAGE_CONDITION || [];

  const openForm = item => {
    setEditing(item || null);
    form.resetFields();
    form.setFieldsValue(item ? {
      ...item,
      maximum_stock: item.maximum_stock == null ? null : Number(item.maximum_stock),
      minimum_stock: Number(item.minimum_stock || 0),
      reorder_point: Number(item.reorder_point || 0),
      standard_cost: Number(item.standard_cost || 0),
    } : { tracking_type: 'NONE', minimum_stock: 0, reorder_point: 0, standard_cost: 0, is_active: true });
    setModalOpen(true);
  };

  const save = async values => {
    try {
      if (editing) await materialAPI.update(editing.id, values);
      else await materialAPI.create(values);
      message.success(editing ? 'Đã cập nhật vật tư' : 'Đã tạo vật tư');
      setModalOpen(false);
      await load();
    } catch (error) { message.error(error.message); }
  };

  const remove = async id => {
    try { await materialAPI.delete(id); message.success('Đã xử lý vật tư'); await load(); }
    catch (error) { message.error(error.message); }
  };

  const openConversion = material => {
    setConversionMaterial(material);
    conversionForm.resetFields();
    conversionForm.setFieldsValue({ to_unit_id: material.base_unit_id, conversion_factor: 1, is_purchase_unit: true, is_issue_unit: false, is_active: true });
    setConversionOpen(true);
  };

  const saveConversion = async values => {
    try {
      await materialAPI.saveConversion(conversionMaterial.id, values);
      message.success('Đã lưu quy đổi đơn vị');
      conversionForm.resetFields();
      conversionForm.setFieldsValue({ to_unit_id: conversionMaterial.base_unit_id, conversion_factor: 1, is_purchase_unit: true, is_issue_unit: false, is_active: true });
      await load();
      const refreshed = (await materialAPI.getAll({ search: conversionMaterial.material_code })).data?.[0];
      if (refreshed) setConversionMaterial(refreshed);
    } catch (error) { message.error(error.message); }
  };

  const deleteConversion = async conversionId => {
    try {
      await materialAPI.deleteConversion(conversionMaterial.id, conversionId);
      message.success('Đã xóa quy đổi');
      await load();
      setConversionMaterial(prev => ({ ...prev, conversions: (prev.conversions || []).filter(x => x.id !== conversionId) }));
    } catch (error) { message.error(error.message); }
  };

  const columns = [
    { title: 'Mã', dataIndex: 'material_code', width: 130, fixed: 'left' },
    { title: 'Tên vật tư', dataIndex: 'name', width: 220 },
    { title: 'Nhóm', dataIndex: 'category_name', width: 150, render: v => v || '-' },
    { title: 'Đơn vị gốc', width: 130, render: (_, r) => r.unit_name ? `${r.unit_name} (${r.unit_symbol})` : '-' },
    { title: 'SKU / Barcode', width: 170, render: (_, r) => <><div>{r.sku || '-'}</div><Text type="secondary">{r.barcode || ''}</Text></> },
    { title: 'Tồn tối thiểu', dataIndex: 'minimum_stock', width: 120, align: 'right' },
    { title: 'Điểm đặt hàng', dataIndex: 'reorder_point', width: 130, align: 'right' },
    { title: 'Giá chuẩn', dataIndex: 'standard_cost', width: 130, align: 'right', render: v => Number(v || 0).toLocaleString('vi-VN') },
    { title: 'Nhà cung cấp', dataIndex: 'supplier_name', width: 170, render: v => v || '-' },
    { title: 'Theo dõi', dataIndex: 'tracking_type', width: 120, render: v => <Tag>{trackingOptions.find(x => x.value === v)?.label || v}</Tag> },
    { title: 'Trạng thái', dataIndex: 'is_active', width: 110, render: v => <Tag color={v ? 'green' : 'default'}>{v ? 'Hoạt động' : 'Ngừng dùng'}</Tag> },
    { title: 'Thao tác', width: 160, fixed: 'right', render: (_, r) => <Space>
      <Button icon={<EditOutlined />} onClick={() => openForm(r)} />
      <Button icon={<SwapOutlined />} onClick={() => openConversion(r)} title="Quy đổi đơn vị" />
      <Popconfirm title="Xóa hoặc ngừng sử dụng vật tư này?" onConfirm={() => remove(r.id)}><Button danger icon={<DeleteOutlined />} /></Popconfirm>
    </Space> },
  ];

  return <div>
    <div className="page-header"><Title level={2}>Quản lý Vật tư</Title><Button type="primary" icon={<PlusOutlined />} onClick={() => openForm()}>Thêm vật tư</Button></div>
    <Alert type="info" showIcon style={{ marginBottom: 16 }} message="Material Master Data 2.4.0-A" description="Quản lý hồ sơ vật tư, nhiều kho, nhà cung cấp, đơn vị tính và quy đổi. Nhập/xuất/tồn kho sẽ được triển khai ở 2.4.0-B." />
    <Card>
      <Space wrap style={{ marginBottom: 16 }}>
        <Input.Search allowClear placeholder="Mã, tên, SKU, barcode" style={{ width: 280 }} onSearch={search => setFilters(v => ({ ...v, search }))} />
        <Select allowClear placeholder="Nhóm vật tư" style={{ width: 220 }} options={activeCategories.map(x => ({ value: x.id, label: x.name }))} onChange={category_id => setFilters(v => ({ ...v, category_id }))} />
        <Select allowClear placeholder="Trạng thái" style={{ width: 150 }} options={[{ value: true, label: 'Hoạt động' }, { value: false, label: 'Ngừng dùng' }]} onChange={is_active => setFilters(v => ({ ...v, is_active }))} />
        <Button icon={<ReloadOutlined />} onClick={load}>Áp dụng / Tải lại</Button>
      </Space>
      <Table rowKey="id" loading={loading} dataSource={materials} columns={columns} scroll={{ x: 1700 }} pagination={{ pageSize: 20 }} />
    </Card>

    <Modal title={editing ? 'Sửa vật tư' : 'Thêm vật tư'} open={modalOpen} onCancel={() => setModalOpen(false)} footer={null} width={900} destroyOnClose>
      <Form form={form} layout="vertical" onFinish={save}>
        <Row gutter={16}>
          <Col xs={24} md={8}><Form.Item name="material_code" label="Mã vật tư" rules={editing ? [] : [{ pattern: /^[A-Z0-9][A-Z0-9._-]{1,49}$/, message: 'Dùng chữ in hoa, số, dấu chấm, gạch ngang hoặc gạch dưới' }]}><Input disabled={!!editing} placeholder={meta.settings?.auto_generate_material_code ? 'Để trống để tự sinh' : 'Bắt buộc nhập'} /></Form.Item></Col>
          <Col xs={24} md={16}><Form.Item name="name" label="Tên vật tư" rules={[{ required: true }]}><Input /></Form.Item></Col>
          <Col xs={24} md={8}><Form.Item name="category_id" label="Nhóm vật tư"><Select allowClear options={activeCategories.map(x => ({ value: x.id, label: x.name }))} /></Form.Item></Col>
          <Col xs={24} md={8}><Form.Item name="base_unit_id" label="Đơn vị tính gốc" rules={[{ required: true }]}><Select options={activeUnits.map(x => ({ value: x.id, label: `${x.name} (${x.symbol})` }))} /></Form.Item></Col>
          <Col xs={24} md={8}><Form.Item name="default_supplier_id" label="Nhà cung cấp mặc định"><Select allowClear showSearch optionFilterProp="label" options={activeSuppliers.map(x => ({ value: x.id, label: x.name }))} /></Form.Item></Col>
          <Col xs={24} md={8}><Form.Item name="brand" label="Thương hiệu"><Select allowClear showSearch optionFilterProp="label" options={brands.map(x => ({ value: x.name, label: x.name }))} /></Form.Item></Col>
          <Col xs={24} md={8}><Form.Item name="sku" label="SKU"><Input /></Form.Item></Col>
          <Col xs={24} md={8}><Form.Item name="barcode" label="Barcode"><Input /></Form.Item></Col>
          <Col span={24}><Form.Item name="specification" label="Quy cách kỹ thuật"><Input.TextArea rows={2} /></Form.Item></Col>
          <Col span={24}><Form.Item name="description" label="Mô tả"><Input.TextArea rows={2} /></Form.Item></Col>
          <Col xs={24} md={6}><Form.Item name="minimum_stock" label="Tồn tối thiểu"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
          <Col xs={24} md={6}><Form.Item name="reorder_point" label="Điểm đặt hàng"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
          <Col xs={24} md={6}><Form.Item name="maximum_stock" label="Tồn tối đa"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
          <Col xs={24} md={6}><Form.Item name="standard_cost" label="Giá chuẩn"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
          <Col xs={24} md={8}><Form.Item name="tracking_type" label="Loại theo dõi"><Select options={trackingOptions} /></Form.Item></Col>
          <Col xs={24} md={10}><Form.Item name="storage_condition" label="Điều kiện lưu trữ"><Select allowClear showSearch optionFilterProp="label" options={storageConditions.map(x => ({ value: x.name, label: x.name }))} /></Form.Item></Col>
          <Col xs={24} md={6}><Form.Item name="is_active" label="Hoạt động" valuePropName="checked"><Switch /></Form.Item></Col>
        </Row>
        <Button type="primary" htmlType="submit">Lưu vật tư</Button>
      </Form>
    </Modal>

    <Modal title={`Quy đổi đơn vị — ${conversionMaterial?.material_code || ''}`} open={conversionOpen} onCancel={() => setConversionOpen(false)} footer={null} width={820}>
      <Alert type="info" showIcon message={`Mọi quy đổi phải quy về đơn vị gốc: ${conversionMaterial?.unit_name || ''} (${conversionMaterial?.unit_symbol || ''})`} style={{ marginBottom: 16 }} />
      <Form form={conversionForm} layout="inline" onFinish={saveConversion} style={{ marginBottom: 20 }}>
        <Form.Item name="from_unit_id" label="Từ đơn vị" rules={[{ required: true }]}><Select style={{ width: 180 }} options={activeUnits.filter(x => x.id !== conversionMaterial?.base_unit_id).map(x => ({ value: x.id, label: `${x.name} (${x.symbol})` }))} /></Form.Item>
        <Form.Item name="conversion_factor" label="Hệ số" rules={[{ required: true }]}><InputNumber min={0.00000001} style={{ width: 130 }} /></Form.Item>
        <Form.Item name="to_unit_id" hidden><Input /></Form.Item>
        <Form.Item name="is_purchase_unit" label="Đơn vị mua" valuePropName="checked"><Switch /></Form.Item>
        <Form.Item name="is_issue_unit" label="Đơn vị xuất" valuePropName="checked"><Switch /></Form.Item>
        <Button type="primary" htmlType="submit">Lưu quy đổi</Button>
      </Form>
      <Table rowKey="id" pagination={false} dataSource={conversionMaterial?.conversions || []} columns={[
        { title: 'Từ đơn vị', render: (_, r) => `${r.from_unit_name || r.from_unit_id} ${r.from_symbol || ''}` },
        { title: 'Hệ số', dataIndex: 'conversion_factor' },
        { title: 'Sang đơn vị gốc', render: (_, r) => `${r.to_unit_name || r.to_unit_id} ${r.to_symbol || ''}` },
        { title: 'Dùng khi', render: (_, r) => <Space>{r.is_purchase_unit && <Tag color="blue">Mua</Tag>}{r.is_issue_unit && <Tag color="green">Xuất</Tag>}</Space> },
        { title: '', width: 70, render: (_, r) => <Popconfirm title="Xóa quy đổi này?" onConfirm={() => deleteConversion(r.id)}><Button danger icon={<DeleteOutlined />} /></Popconfirm> },
      ]} />
      <Text type="secondary">Ví dụ: 1 Cuộn = 100 Mét → đơn vị từ: Cuộn, hệ số: 100, đơn vị gốc: Mét.</Text>
    </Modal>
  </div>;
}
