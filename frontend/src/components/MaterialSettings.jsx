import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Form, Input, InputNumber, Modal, Popconfirm, Row, Select, Space, Switch, Table, Tabs, Tag, message } from 'antd';
import { DeleteOutlined, EditOutlined, EnvironmentOutlined, PlusOutlined, ReloadOutlined, SaveOutlined } from '@ant-design/icons';
import { employeeAPI, materialAdminAPI, settingsAPI } from '../services/api';

const entities = {
  categories: { label: 'Nhóm vật tư', code: 'code', fields: ['code','name','description','sort_order','parent_id'] },
  units: { label: 'Đơn vị tính', code: 'code', fields: ['code','name','symbol','decimal_precision'] },
  warehouses: { label: 'Kho', code: 'warehouse_code', fields: ['warehouse_code','name','warehouse_type','location','manager_employee_id','description','is_default'] },
  suppliers: { label: 'Nhà cung cấp', code: 'supplier_code', fields: ['supplier_code','name','tax_code','contact_name','phone','email','address_line','province_code','commune_code','payment_terms','notes'] },
};

export default function MaterialSettings() {
  const [form] = Form.useForm();
  const [settingsForm] = Form.useForm();
  const [locationForm] = Form.useForm();
  const [entity, setEntity] = useState('categories');
  const [data, setData] = useState([]);
  const [allData, setAllData] = useState({ categories: [], units: [], warehouses: [], suppliers: [] });
  const [employees, setEmployees] = useState([]);
  const [provinces, setProvinces] = useState([]);
  const [communes, setCommunes] = useState([]);
  const [warehouseTypes, setWarehouseTypes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [locationModal, setLocationModal] = useState(false);
  const [selectedWarehouse, setSelectedWarehouse] = useState(null);

  const loadEntity = async target => {
    setLoading(true);
    try { const r = await materialAdminAPI.getAll(target); setData(r.data || []); setAllData(v => ({ ...v, [target]: r.data || [] })); }
    catch (e) { message.error(e.message); }
    finally { setLoading(false); }
  };

  const loadBase = async () => {
    try {
      const [settings, emp, province, warehouseTypeResult] = await Promise.all([materialAdminAPI.getSettings(), employeeAPI.getAll({ limit: 500 }), settingsAPI.getProvinces(), settingsAPI.getCatalogs({ type: 'WAREHOUSE_TYPE' })]);
      settingsForm.setFieldsValue(settings.data || {});
      setEmployees(emp.data || []);
      setProvinces(province.data || []);
      setWarehouseTypes(warehouseTypeResult.data || []);
      await Promise.all(Object.keys(entities).map(loadEntity));
      await loadEntity(entity);
    } catch (e) { message.error(e.message); }
  };
  useEffect(() => { loadBase(); }, []);
  useEffect(() => { loadEntity(entity); }, [entity]);

  const open = item => {
    setEditing(item || null); form.resetFields();
    form.setFieldsValue(item || { is_active: true, sort_order: 0, decimal_precision: 2, warehouse_type: 'Kho chính', is_default: false });
    if (item?.province_code) loadCommunes(item.province_code);
    setModal(true);
  };
  const loadCommunes = async code => { if (!code) return setCommunes([]); try { const r=await settingsAPI.getCommunes(code); setCommunes(r.data || []); } catch(e){message.error(e.message);} };
  const save = async values => {
    try { if (editing) await materialAdminAPI.update(entity, editing.id, values); else await materialAdminAPI.create(entity, values); message.success('Đã lưu dữ liệu'); setModal(false); await loadEntity(entity); }
    catch (e) { message.error(e.message); }
  };
  const remove = async id => { try { await materialAdminAPI.delete(entity, id); message.success('Đã chuyển sang Không hoạt động'); await loadEntity(entity); } catch(e){message.error(e.message);} };

  const openLocations = warehouse => { setSelectedWarehouse(warehouse); locationForm.resetFields(); locationForm.setFieldsValue({ is_active: true }); setLocationModal(true); };
  const saveLocation = async values => { try { await materialAdminAPI.createLocation(selectedWarehouse.id, values); message.success('Đã thêm vị trí kho'); const refreshed=(await materialAdminAPI.getAll('warehouses')).data||[]; setAllData(v=>({...v,warehouses:refreshed})); setSelectedWarehouse(refreshed.find(x=>x.id===selectedWarehouse.id)); locationForm.resetFields(); locationForm.setFieldsValue({is_active:true}); } catch(e){message.error(e.message);} };
  const removeLocation = async id => { try { await materialAdminAPI.deleteLocation(selectedWarehouse.id,id); message.success('Đã ngừng sử dụng vị trí'); const refreshed=(await materialAdminAPI.getAll('warehouses')).data||[]; setAllData(v=>({...v,warehouses:refreshed})); setSelectedWarehouse(refreshed.find(x=>x.id===selectedWarehouse.id)); } catch(e){message.error(e.message);} };

  const saveSettings = async values => { try { await materialAdminAPI.updateSettings(values); message.success('Đã lưu cấu hình vật tư'); await loadBase(); } catch(e){message.error(e.message);} };

  const columns = useMemo(() => {
    const def=entities[entity];
    const cols=[{title:'Mã',dataIndex:def.code,width:140},{title:'Tên',dataIndex:'name'}];
    if(entity==='units') cols.push({title:'Ký hiệu',dataIndex:'symbol',width:100},{title:'Số lẻ',dataIndex:'decimal_precision',width:90});
    if(entity==='categories') cols.push({title:'Nhóm cha',dataIndex:'parent_name',width:150},{title:'Thứ tự',dataIndex:'sort_order',width:90});
    if(entity==='warehouses') cols.push({title:'Loại kho',dataIndex:'warehouse_type',width:140},{title:'Quản lý',dataIndex:'manager_name',width:160},{title:'Mặc định',dataIndex:'is_default',width:90,render:v=>v?<Tag color="blue">Có</Tag>:'-'});
    if(entity==='suppliers') cols.push({title:'Liên hệ',render:(_,r)=><>{r.contact_name||'-'}<br/>{r.phone||''}</>,width:180},{title:'MST',dataIndex:'tax_code',width:140});
    cols.push({title:'Trạng thái',dataIndex:'is_active',width:110,render:v=><Tag color={v?'green':'default'}>{v?'Hoạt động':'Ngừng dùng'}</Tag>},{title:'Thao tác',width:entity==='warehouses'?170:120,render:(_,r)=><Space>{entity==='warehouses'&&<Button icon={<EnvironmentOutlined/>} onClick={()=>openLocations(r)} title="Vị trí kho"/>}<Button icon={<EditOutlined/>} onClick={()=>open(r)}/><Popconfirm title="Ngừng sử dụng mục này?" onConfirm={()=>remove(r.id)}><Button danger icon={<DeleteOutlined/>}/></Popconfirm></Space>});
    return cols;
  },[entity]);

  return <div>
    <Alert showIcon type="info" message="Cấu hình Material Master Data" description="Tồn âm luôn bị khóa ở 2.4.0-A. Phương pháp giá được chuẩn bị ở Bình quân gia quyền di động. Giao dịch kho được triển khai ở 2.4.0-B." style={{marginBottom:16}}/>
    <Tabs items={[
      {key:'config',label:'Cấu hình chung',children:<Card><Form form={settingsForm} layout="vertical" onFinish={saveSettings}><Row gutter={16}>
        <Col xs={24} md={8}><Form.Item name="default_warehouse_id" label="Kho mặc định"><Select allowClear options={(allData.warehouses||[]).filter(x=>x.is_active).map(x=>({value:x.id,label:x.name}))}/></Form.Item></Col>
        <Col xs={24} md={8}><Form.Item name="auto_generate_material_code" label="Tự sinh mã vật tư" valuePropName="checked"><Switch/></Form.Item></Col>
        <Col xs={24} md={8}><Form.Item label="Cho phép tồn âm"><Switch checked={false} disabled/> <span style={{marginLeft:8}}>Không cho phép</span></Form.Item></Col>
        <Col xs={24} md={6}><Form.Item name="material_code_prefix" label="Tiền tố mã"><Input/></Form.Item></Col>
        <Col xs={24} md={6}><Form.Item name="material_code_digits" label="Số chữ số"><InputNumber min={3} max={12} style={{width:'100%'}}/></Form.Item></Col>
        <Col xs={24} md={6}><Form.Item name="material_code_next_number" label="Số tiếp theo"><InputNumber min={1} style={{width:'100%'}}/></Form.Item></Col>
        <Col xs={24} md={6}><Form.Item label="Phương pháp tính giá"><Input value="Bình quân gia quyền di động" disabled/></Form.Item></Col>
        <Col xs={24} md={8}><Form.Item name="quantity_decimal_precision" label="Số lẻ số lượng"><InputNumber min={0} max={6} style={{width:'100%'}}/></Form.Item></Col>
        <Col xs={24} md={8}><Form.Item name="price_decimal_precision" label="Số lẻ đơn giá"><InputNumber min={0} max={6} style={{width:'100%'}}/></Form.Item></Col>
      </Row><Button type="primary" htmlType="submit" icon={<SaveOutlined/>}>Lưu cấu hình</Button></Form></Card>},
      {key:'masters',label:'Danh mục vật tư',children:<Card><Space wrap style={{marginBottom:16}}><Select value={entity} style={{width:220}} options={Object.entries(entities).map(([value,v])=>({value,label:v.label}))} onChange={setEntity}/><Button type="primary" icon={<PlusOutlined/>} onClick={()=>open()}>Thêm {entities[entity].label}</Button><Button icon={<ReloadOutlined/>} onClick={()=>loadEntity(entity)}>Tải lại</Button></Space><Table rowKey="id" loading={loading} dataSource={data} columns={columns} pagination={{pageSize:15}}/></Card>}
    ]}/>
    <Modal title={`${editing?'Sửa':'Thêm'} ${entities[entity].label}`} open={modal} onCancel={()=>setModal(false)} footer={null} width={760} destroyOnClose>
      <Form form={form} layout="vertical" onFinish={save}><Row gutter={16}>
        <Col xs={24} md={8}><Form.Item name={entities[entity].code} label="Mã" rules={[{required:true}]}><Input disabled={!!editing}/></Form.Item></Col>
        <Col xs={24} md={16}><Form.Item name="name" label="Tên" rules={[{required:true}]}><Input/></Form.Item></Col>
        {entity==='categories'&&<><Col xs={24} md={12}><Form.Item name="parent_id" label="Nhóm cha"><Select allowClear options={(allData.categories||[]).filter(x=>x.id!==editing?.id&&x.is_active).map(x=>({value:x.id,label:x.name}))}/></Form.Item></Col><Col xs={24} md={12}><Form.Item name="sort_order" label="Thứ tự"><InputNumber style={{width:'100%'}}/></Form.Item></Col><Col span={24}><Form.Item name="description" label="Mô tả"><Input.TextArea/></Form.Item></Col></>}
        {entity==='units'&&<><Col xs={24} md={12}><Form.Item name="symbol" label="Ký hiệu" rules={[{required:true}]}><Input/></Form.Item></Col><Col xs={24} md={12}><Form.Item name="decimal_precision" label="Số chữ số thập phân"><InputNumber min={0} max={6} style={{width:'100%'}}/></Form.Item></Col></>}
        {entity==='warehouses'&&<><Col xs={24} md={12}><Form.Item name="warehouse_type" label="Loại kho" rules={[{required:true}]}><Select showSearch optionFilterProp="label" options={warehouseTypes.map(x=>({value:x.name,label:x.name}))}/></Form.Item></Col><Col xs={24} md={12}><Form.Item name="manager_employee_id" label="Người quản lý"><Select allowClear showSearch optionFilterProp="label" options={employees.map(x=>({value:x.id,label:`${x.employee_code} — ${x.full_name}`}))}/></Form.Item></Col><Col span={24}><Form.Item name="location" label="Địa điểm"><Input/></Form.Item></Col><Col span={24}><Form.Item name="description" label="Mô tả"><Input.TextArea/></Form.Item></Col><Col span={12}><Form.Item name="is_default" label="Kho mặc định" valuePropName="checked"><Switch/></Form.Item></Col></>}
        {entity==='suppliers'&&<><Col xs={24} md={12}><Form.Item name="tax_code" label="Mã số thuế"><Input/></Form.Item></Col><Col xs={24} md={12}><Form.Item name="contact_name" label="Người liên hệ"><Input/></Form.Item></Col><Col xs={24} md={12}><Form.Item name="phone" label="Điện thoại"><Input/></Form.Item></Col><Col xs={24} md={12}><Form.Item name="email" label="Email"><Input/></Form.Item></Col><Col span={24}><Form.Item name="address_line" label="Địa chỉ"><Input/></Form.Item></Col><Col xs={24} md={12}><Form.Item name="province_code" label="Tỉnh/Thành"><Select allowClear showSearch optionFilterProp="label" options={provinces.map(x=>({value:x.code,label:`${x.unit_type} ${x.name}`}))} onChange={v=>{form.setFieldValue('commune_code',null);loadCommunes(v);}}/></Form.Item></Col><Col xs={24} md={12}><Form.Item name="commune_code" label="Phường/Xã"><Select allowClear showSearch optionFilterProp="label" options={communes.map(x=>({value:x.code,label:`${x.unit_type} ${x.name}`}))}/></Form.Item></Col><Col span={24}><Form.Item name="payment_terms" label="Điều khoản thanh toán"><Input/></Form.Item></Col><Col span={24}><Form.Item name="notes" label="Ghi chú"><Input.TextArea/></Form.Item></Col></>}
        <Col span={24}><Form.Item name="is_active" label="Hoạt động" valuePropName="checked"><Switch/></Form.Item></Col>
      </Row><Button type="primary" htmlType="submit">Lưu</Button></Form>

    </Modal>
    <Modal title={`Vị trí trong ${selectedWarehouse?.name||''}`} open={locationModal} onCancel={()=>setLocationModal(false)} footer={null} width={820}>
      <Form form={locationForm} layout="inline" onFinish={saveLocation} style={{marginBottom:16}}>
        <Form.Item name="location_code" label="Mã" rules={[{required:true}]}><Input style={{width:110}} placeholder="A-01-01"/></Form.Item>
        <Form.Item name="name" label="Tên" rules={[{required:true}]}><Input style={{width:180}}/></Form.Item>
        <Form.Item name="zone" label="Khu"><Input style={{width:90}}/></Form.Item>
        <Form.Item name="rack" label="Kệ"><Input style={{width:90}}/></Form.Item>
        <Button type="primary" htmlType="submit">Thêm vị trí</Button>
      </Form>
      <Table rowKey="id" pagination={false} dataSource={selectedWarehouse?.locations||[]} columns={[
        {title:'Mã',dataIndex:'location_code',width:120},{title:'Tên',dataIndex:'name'},{title:'Khu',dataIndex:'zone',width:90},{title:'Kệ',dataIndex:'rack',width:90},{title:'Tầng',dataIndex:'shelf',width:90},{title:'Ô',dataIndex:'bin',width:90},{title:'Trạng thái',dataIndex:'is_active',width:110,render:v=><Tag color={v?'green':'default'}>{v?'Hoạt động':'Ngừng dùng'}</Tag>},{title:'',width:60,render:(_,r)=><Popconfirm title="Ngừng sử dụng vị trí này?" onConfirm={()=>removeLocation(r.id)}><Button danger icon={<DeleteOutlined/>}/></Popconfirm>}
      ]}/>
    </Modal>
  </div>;
}
