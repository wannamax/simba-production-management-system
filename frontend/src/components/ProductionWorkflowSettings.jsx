import React,{useEffect,useState} from 'react';
import {Alert,Button,Card,Col,Form,Input,Modal,Popconfirm,Row,Select,Space,Switch,Table,Tag,message} from 'antd';
import {DeleteOutlined,EditOutlined,PlusOutlined} from '@ant-design/icons';
import {productionWorkflowAPI} from '../services/api';

export default function ProductionWorkflowSettings(){
  const [form]=Form.useForm();
  const [rows,setRows]=useState([]);const [meta,setMeta]=useState({project_types:[],work_items:[]});
  const [loading,setLoading]=useState(false);const [open,setOpen]=useState(false);const [editing,setEditing]=useState(null);
  const load=async()=>{setLoading(true);try{const [list,metadata]=await Promise.all([productionWorkflowAPI.getProcesses({include_inactive:true}),productionWorkflowAPI.getMeta()]);setRows(list.data||[]);setMeta(metadata.data||{});}catch(error){message.error(error.message);}finally{setLoading(false);}};
  useEffect(()=>{load();},[]);
  const add=()=>{setEditing(null);form.resetFields();form.setFieldsValue({is_active:true,project_types:[],stages:[{work_item_ids:[],is_required:true,tracks_quantity:true,allow_parallel:false}]});setOpen(true);};
  const edit=async row=>{try{const response=await productionWorkflowAPI.getProcess(row.id);setEditing(response.data);form.resetFields();form.setFieldsValue(response.data);setOpen(true);}catch(error){message.error(error.message);}};
  const save=async values=>{try{if(editing)await productionWorkflowAPI.updateProcess(editing.id,values);else await productionWorkflowAPI.createProcess(values);message.success(editing?'Đã cập nhật và tăng phiên bản quy trình':'Đã tạo quy trình sản xuất');setOpen(false);await load();}catch(error){message.error(error.message);}};
  const remove=async id=>{try{const response=await productionWorkflowAPI.deleteProcess(id);message.success(response.message);await load();}catch(error){message.error(error.message);}};
  const columns=[
    {title:'Mã',dataIndex:'code',width:130},{title:'Quy trình',dataIndex:'name'},
    {title:'Phiên bản',dataIndex:'version',width:90,render:value=><Tag color="blue">v{value}</Tag>},
    {title:'Loại dự án',dataIndex:'project_types',render:value=>value?.length?<Space wrap>{value.map(x=><Tag key={x}>{x}</Tag>)}</Space>:<Tag>Tất cả</Tag>},
    {title:'Công đoạn',dataIndex:'stage_count',width:100},{title:'Trạng thái',dataIndex:'is_active',width:120,render:value=><Tag color={value?'green':'default'}>{value?'Hoạt động':'Ngừng dùng'}</Tag>},
    {title:'Thao tác',width:110,render:(_,row)=><Space><Button icon={<EditOutlined/>} onClick={()=>edit(row)}/><Popconfirm title="Xóa quy trình?" description="Quy trình đã dùng sẽ chỉ được ngừng hoạt động." onConfirm={()=>remove(row.id)}><Button danger icon={<DeleteOutlined/>}/></Popconfirm></Space>},
  ];
  return <div>
    <Alert showIcon type="info" message="Mẫu quy trình có phiên bản" description="Chọn các công đoạn theo thứ tự. Không thiết lập giờ tại đây vì lịch và số giờ phụ thuộc từng Dự án. Khi tạo lệnh sản xuất, hệ thống lưu snapshot nên việc sửa mẫu không làm đổi lệnh cũ." style={{marginBottom:16}}/>
    <Card extra={<Button type="primary" icon={<PlusOutlined/>} onClick={add}>Thêm quy trình</Button>}><Table rowKey="id" loading={loading} dataSource={rows} columns={columns} pagination={false}/></Card>
    <Modal title={editing?'Sửa quy trình sản xuất':'Thêm quy trình sản xuất'} open={open} onCancel={()=>setOpen(false)} footer={null} width={1050} destroyOnClose>
      <Form form={form} layout="vertical" onFinish={save}>
        <Row gutter={16}><Col span={8}><Form.Item name="code" label="Mã quy trình" rules={[{required:true}]}><Input disabled={!!editing} placeholder="KE_TRUNG_BAY"/></Form.Item></Col><Col span={16}><Form.Item name="name" label="Tên quy trình" rules={[{required:true}]}><Input placeholder="Sản xuất kệ trưng bày"/></Form.Item></Col></Row>
        <Form.Item name="project_types" label="Áp dụng cho Loại dự án"><Select mode="multiple" allowClear placeholder="Để trống = tất cả Loại dự án" options={(meta.project_types||[]).map(value=>({value,label:value}))}/></Form.Item>
        <Form.Item name="description" label="Mô tả"><Input.TextArea rows={2}/></Form.Item>
        <Form.Item name="is_active" label="Đang sử dụng" valuePropName="checked"><Switch/></Form.Item>
        <Form.List name="stages">{(fields,{add,remove})=><Space direction="vertical" style={{width:'100%'}} size={12}>
          {fields.map((field,index)=><Card key={field.key} size="small" title={`Công đoạn ${index+1}`} extra={fields.length>1?<Button danger type="text" icon={<DeleteOutlined/>} onClick={()=>remove(field.name)}>Xóa</Button>:null}>
            <Row gutter={12}><Col span={5}><Form.Item {...field} name={[field.name,'code']} label="Mã" rules={[{required:true}]}><Input placeholder="CAT"/></Form.Item></Col><Col span={7}><Form.Item {...field} name={[field.name,'name']} label="Tên công đoạn" rules={[{required:true}]}><Input placeholder="Cắt vật tư"/></Form.Item></Col><Col span={12}><Form.Item {...field} name={[field.name,'work_item_ids']} label="Liên kết Công việc (tùy chọn)" extra="Chọn một hoặc nhiều Công việc chuẩn liên quan. Để trống nếu quản lý sẽ tự chọn Nhiệm vụ khi giao việc."><Select mode="multiple" allowClear maxTagCount="responsive" showSearch optionFilterProp="label" options={(meta.work_items||[]).map(item=>({value:item.id,label:`${item.group_name} — ${item.name}`}))}/></Form.Item></Col></Row>
            <Space size="large"><Form.Item {...field} name={[field.name,'is_required']} valuePropName="checked" label="Bắt buộc"><Switch/></Form.Item><Form.Item {...field} name={[field.name,'tracks_quantity']} valuePropName="checked" label="Theo dõi số lượng"><Switch/></Form.Item><Form.Item {...field} name={[field.name,'allow_parallel']} valuePropName="checked" label="Cho phép song song"><Switch/></Form.Item></Space>
          </Card>)}
          <Button block type="dashed" icon={<PlusOutlined/>} onClick={()=>add({work_item_ids:[],is_required:true,tracks_quantity:true,allow_parallel:false})}>Thêm công đoạn tiếp theo</Button>
        </Space>}</Form.List>
        <Space style={{marginTop:18}}><Button type="primary" htmlType="submit">{editing?'Lưu phiên bản mới':'Tạo quy trình'}</Button><Button onClick={()=>setOpen(false)}>Hủy</Button></Space>
      </Form>
    </Modal>
  </div>;
}
