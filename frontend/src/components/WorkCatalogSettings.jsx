import React, { useEffect, useState } from 'react';
import {
  Alert, Button, Card, Col, Form, Input, InputNumber, Modal, Popconfirm,
  Row, Select, Space, Switch, Table, Tag, message,
} from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { workCatalogAPI } from '../services/api';

const ALL_PROJECT_TYPES='__ALL_PROJECT_TYPES__';

export default function WorkCatalogSettings() {
  const [groups,setGroups]=useState([]);
  const [items,setItems]=useState([]);
  const [projectTypes,setProjectTypes]=useState([]);
  const [roles,setRoles]=useState([]);
  const [loading,setLoading]=useState(false);
  const [groupModal,setGroupModal]=useState(false);
  const [itemModal,setItemModal]=useState(false);
  const [editingGroup,setEditingGroup]=useState(null);
  const [editingItem,setEditingItem]=useState(null);
  const [roleModal,setRoleModal]=useState(false);
  const [editingRole,setEditingRole]=useState(null);
  const [groupForm]=Form.useForm();
  const [itemForm]=Form.useForm();
  const [roleForm]=Form.useForm();

  const load=async()=>{
    setLoading(true);
    try{
      const [g,i,p,r]=await Promise.all([
        workCatalogAPI.getGroups({include_inactive:true}),
        workCatalogAPI.getItems({include_inactive:true}),
        workCatalogAPI.getProjectTypes(),
        workCatalogAPI.getRoles({include_inactive:true}),
      ]);
      setGroups(g.data||[]); setItems(i.data||[]); setProjectTypes(p.data||[]); setRoles(r.data||[]);
    }catch(error){message.error(error.message);}finally{setLoading(false);}
  };
  useEffect(()=>{load();},[]);

  const openGroup=(record=null)=>{
    setEditingGroup(record); groupForm.resetFields();
    groupForm.setFieldsValue(record||{sort_order:0,is_active:true}); setGroupModal(true);
  };
  const saveGroup=async values=>{
    try{
      if(editingGroup) await workCatalogAPI.updateGroup(editingGroup.id,values);
      else await workCatalogAPI.createGroup(values);
      message.success(editingGroup?'Đã cập nhật nhóm':'Đã thêm nhóm'); setGroupModal(false); await load();
    }catch(error){message.error(error.message);}
  };
  const removeGroup=async id=>{try{await workCatalogAPI.deleteGroup(id);message.success('Đã xóa nhóm');await load();}catch(error){message.error(error.message);}};

  const openItem=(record=null)=>{
    setEditingItem(record); itemForm.resetFields();
    itemForm.setFieldsValue(record
      ? {...record,project_types:record.project_types?.length?record.project_types:[ALL_PROJECT_TYPES]}
      : {sort_order:0,is_active:true,project_types:[ALL_PROJECT_TYPES]});
    setItemModal(true);
  };
  const saveItem=async values=>{
    try{
      const payload={...values,project_types:values.project_types?.includes(ALL_PROJECT_TYPES)?[]:values.project_types};
      if(editingItem) await workCatalogAPI.updateItem(editingItem.id,payload);
      else await workCatalogAPI.createItem(payload);
      message.success(editingItem?'Đã cập nhật công việc':'Đã thêm công việc'); setItemModal(false); await load();
    }catch(error){message.error(error.message);}
  };
  const changeProjectTypes=values=>{
    const next=values.includes(ALL_PROJECT_TYPES)&&values.length>1
      ? (values[values.length-1]===ALL_PROJECT_TYPES?[ALL_PROJECT_TYPES]:values.filter(value=>value!==ALL_PROJECT_TYPES))
      : values;
    itemForm.setFieldValue('project_types',next);
  };
  const removeItem=async id=>{try{await workCatalogAPI.deleteItem(id);message.success('Đã xóa công việc');await load();}catch(error){message.error(error.message);}};

  const openRole=(record=null)=>{
    setEditingRole(record); roleForm.resetFields();
    roleForm.setFieldsValue(record||{sort_order:0,is_active:true,is_default:false}); setRoleModal(true);
  };
  const saveRole=async values=>{
    try{
      if(editingRole) await workCatalogAPI.updateRole(editingRole.id,values);
      else await workCatalogAPI.createRole(values);
      message.success(editingRole?'Đã cập nhật vai trò':'Đã thêm vai trò'); setRoleModal(false); await load();
    }catch(error){message.error(error.message);}
  };
  const removeRole=async id=>{try{await workCatalogAPI.deleteRole(id);message.success('Đã xóa vai trò');await load();}catch(error){message.error(error.message);}};

  const actionButtons=(record,edit,remove)=><Space>
    <Button size="small" icon={<EditOutlined/>} onClick={()=>edit(record)}/>
    <Popconfirm title="Xóa mục này?" onConfirm={()=>remove(record.id)}><Button size="small" danger icon={<DeleteOutlined/>}/></Popconfirm>
  </Space>;
  const groupColumns=[
    {title:'Mã',dataIndex:'code',width:130},
    {title:'Nhóm công việc',dataIndex:'name'},
    {title:'Mô tả',dataIndex:'description'},
    {title:'Số công việc',dataIndex:'item_count',width:110,align:'center'},
    {title:'Trạng thái',dataIndex:'is_active',width:120,render:value=><Tag color={value?'green':'default'}>{value?'Hoạt động':'Ngừng dùng'}</Tag>},
    {title:'Thao tác',width:110,render:(_,record)=>actionButtons(record,openGroup,removeGroup)},
  ];
  const itemColumns=[
    {title:'Nhóm',dataIndex:'group_name',width:130,render:(value,record)=><Tag color={record.group_color||'blue'}>{value}</Tag>},
    {title:'Công việc',dataIndex:'name',width:180},
    {title:'Quy trình thực thi',dataIndex:'execution_type',width:150,render:value=>value?<Tag color={value==='DELIVERY'?'cyan':'purple'}>{value==='DELIVERY'?'Giao hàng':'Lắp đặt'}</Tag>:'-'},
    {title:'Loại dự án áp dụng',dataIndex:'project_types',render:values=>values?.length?<Space size={[0,4]} wrap>{values.map(value=><Tag key={value}>{value}</Tag>)}</Space>:<Tag color="blue">Tất cả</Tag>},
    {title:'Đã dùng',dataIndex:'usage_count',width:80,align:'center'},
    {title:'Trạng thái',dataIndex:'is_active',width:110,render:value=><Tag color={value?'green':'default'}>{value?'Hoạt động':'Ngừng dùng'}</Tag>},
    {title:'Thao tác',width:110,render:(_,record)=>actionButtons(record,openItem,removeItem)},
  ];
  const roleColumns=[
    {title:'Mã',dataIndex:'code',width:160},
    {title:'Vai trò',dataIndex:'name',width:220},
    {title:'Mô tả',dataIndex:'description'},
    {title:'Mặc định',dataIndex:'is_default',width:100,render:value=>value?<Tag color="blue">Có</Tag>:'-'},
    {title:'Đã dùng',width:100,align:'center',render:(_,record)=>Number(record.project_usage_count||0)+Number(record.task_usage_count||0)},
    {title:'Trạng thái',dataIndex:'is_active',width:110,render:value=><Tag color={value?'green':'default'}>{value?'Hoạt động':'Ngừng dùng'}</Tag>},
    {title:'Thao tác',width:110,render:(_,record)=>actionButtons(record,openRole,removeRole)},
  ];

  return <div>
    <Alert showIcon type="info" message="Loại dự án → Nhóm công việc → Công việc"
      description="Công việc phải thuộc một Nhóm và có thể áp dụng cho một số hoặc tất cả Loại dự án. Khi phân công, danh sách luôn được tải lại theo Loại dự án hiện tại." style={{marginBottom:16}}/>
    <Row gutter={[16,16]}>
      <Col xs={24} xl={10}><Card title="Nhóm công việc" extra={<Space><Button icon={<ReloadOutlined/>} onClick={load}/><Button type="primary" icon={<PlusOutlined/>} onClick={()=>openGroup()}>Thêm nhóm</Button></Space>}>
        <Table rowKey="id" loading={loading} dataSource={groups} columns={groupColumns} pagination={false} scroll={{x:700}}/>
      </Card></Col>
      <Col xs={24} xl={14}><Card title="Danh mục công việc" extra={<Button type="primary" icon={<PlusOutlined/>} onClick={()=>openItem()} disabled={!groups.some(x=>x.is_active)}>Thêm công việc</Button>}>
        <Table rowKey="id" loading={loading} dataSource={items} columns={itemColumns} pagination={{pageSize:10}} scroll={{x:900}}/>
      </Card></Col>
    </Row>
    <Card title="Danh mục vai trò" style={{marginTop:16}} extra={<Button type="primary" icon={<PlusOutlined/>} onClick={()=>openRole()}>Thêm vai trò</Button>}>
      <Alert showIcon type="info" message="Dùng chung cho Dự án và phân công Task"
        description="Vai trò dự án và vai trò trong công việc cùng lấy từ danh mục này. Vai trò đã phát sinh dữ liệu chỉ được chuyển sang Ngừng dùng." style={{marginBottom:16}}/>
      <Table rowKey="id" loading={loading} dataSource={roles} columns={roleColumns} pagination={false} scroll={{x:900}}/>
    </Card>

    <Modal title={editingGroup?'Sửa nhóm công việc':'Thêm nhóm công việc'} open={groupModal} onCancel={()=>setGroupModal(false)} footer={null}>
      <Form form={groupForm} layout="vertical" onFinish={saveGroup}>
        <Form.Item name="code" label="Mã nhóm"><Input disabled={!!editingGroup} placeholder="Tự tạo từ tên nếu để trống"/></Form.Item>
        <Form.Item name="name" label="Tên nhóm" rules={[{required:true,message:'Nhập tên nhóm'}]}><Input placeholder="Văn phòng, Sản xuất, Thi công..."/></Form.Item>
        <Form.Item name="description" label="Mô tả"><Input.TextArea rows={2}/></Form.Item>
        <Form.Item name="execution_type" label="Quy trình thực thi"><Select allowClear placeholder="Công việc thông thường" options={[{value:'DELIVERY',label:'Giao hàng — có danh sách địa điểm'},{value:'INSTALLATION',label:'Lắp đặt — có danh sách địa điểm'}]}/></Form.Item>
        <Row gutter={16}><Col span={12}><Form.Item name="sort_order" label="Thứ tự"><InputNumber min={0} style={{width:'100%'}}/></Form.Item></Col><Col span={12}><Form.Item name="color" label="Màu hiển thị"><Input placeholder="blue hoặc #1677ff"/></Form.Item></Col></Row>
        <Form.Item name="is_active" label="Đang sử dụng" valuePropName="checked"><Switch/></Form.Item>
        <Button type="primary" htmlType="submit">Lưu nhóm</Button>
      </Form>
    </Modal>

    <Modal title={editingItem?'Sửa công việc':'Thêm công việc'} open={itemModal} onCancel={()=>setItemModal(false)} footer={null} width={680}>
      <Form form={itemForm} layout="vertical" onFinish={saveItem}>
        <Row gutter={16}><Col span={12}><Form.Item name="group_id" label="Thuộc nhóm" rules={[{required:true,message:'Chọn nhóm công việc'}]}><Select options={groups.filter(x=>x.is_active||x.id===editingItem?.group_id).map(x=>({value:x.id,label:x.name}))}/></Form.Item></Col>
        <Col span={12}><Form.Item name="code" label="Mã công việc"><Input disabled={!!editingItem} placeholder="Tự tạo từ tên nếu để trống"/></Form.Item></Col></Row>
        <Form.Item name="name" label="Tên công việc" rules={[{required:true,message:'Nhập tên công việc'}]}><Input placeholder="Thiết kế, Khung hộp đèn, Sơn..."/></Form.Item>
        <Form.Item name="project_types" label="Áp dụng cho Loại dự án" rules={[{required:true,type:'array',min:1,message:'Chọn Loại dự án hoặc Tất cả'}]}><Select mode="multiple" showSearch optionFilterProp="label" onChange={changeProjectTypes} options={[{value:ALL_PROJECT_TYPES,label:'Tất cả loại dự án'},...projectTypes.map(x=>({value:x.name,label:x.name}))]}/></Form.Item>
        <Form.Item name="description" label="Mô tả"><Input.TextArea rows={2}/></Form.Item>
        <Form.Item name="sort_order" label="Thứ tự"><InputNumber min={0} style={{width:'100%'}}/></Form.Item>
        <Form.Item name="is_active" label="Đang sử dụng" valuePropName="checked"><Switch/></Form.Item>
        <Button type="primary" htmlType="submit">Lưu công việc</Button>
      </Form>
    </Modal>

    <Modal title={editingRole?'Sửa vai trò':'Thêm vai trò'} open={roleModal} onCancel={()=>setRoleModal(false)} footer={null}>
      <Form form={roleForm} layout="vertical" onFinish={saveRole}>
        <Form.Item name="code" label="Mã vai trò"><Input disabled={!!editingRole} placeholder="Tự tạo từ tên nếu để trống"/></Form.Item>
        <Form.Item name="name" label="Tên vai trò" rules={[{required:true,message:'Nhập tên vai trò'}]}><Input placeholder="Quản lý dự án, Thợ sản xuất..."/></Form.Item>
        <Form.Item name="description" label="Mô tả"><Input.TextArea rows={2}/></Form.Item>
        <Row gutter={16}><Col span={12}><Form.Item name="sort_order" label="Thứ tự"><InputNumber min={0} style={{width:'100%'}}/></Form.Item></Col><Col span={12}><Form.Item name="color" label="Màu hiển thị"><Input placeholder="blue hoặc #1677ff"/></Form.Item></Col></Row>
        <Space><Form.Item name="is_default" label="Mặc định" valuePropName="checked"><Switch/></Form.Item><Form.Item name="is_active" label="Đang sử dụng" valuePropName="checked"><Switch/></Form.Item></Space>
        <div><Button type="primary" htmlType="submit">Lưu vai trò</Button></div>
      </Form>
    </Modal>
  </div>;
}
