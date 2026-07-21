import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, Col, DatePicker, Form, Input, InputNumber, Modal, Popconfirm, Row, Select, Space, Statistic, Table, Tabs, Tag, Typography, message } from 'antd';
import { CheckOutlined, DeleteOutlined, DownloadOutlined, EditOutlined, PlusOutlined, ReloadOutlined, RollbackOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useSearchParams } from 'react-router-dom';
import { inventoryAPI } from '../services/api';

const { Title, Text } = Typography;
const typeOptions = [
  { value:'OPENING_BALANCE', label:'Số dư đầu kỳ' },
  { value:'RECEIPT', label:'Nhập kho' },
  { value:'ISSUE', label:'Xuất kho' },
  { value:'RETURN_IN', label:'Trả kho' },
  { value:'ADJUSTMENT_IN', label:'Điều chỉnh tăng' },
  { value:'ADJUSTMENT_OUT', label:'Điều chỉnh giảm' },
];
const typeNames = Object.fromEntries([...typeOptions,{value:'REVERSAL',label:'Phiếu đảo'}].map(x=>[x.value,x.label]));
const statusMap = { DRAFT:['Nháp','default'], POSTED:['Đã ghi sổ','green'], REVERSED:['Đã đảo','orange'], CANCELLED:['Đã hủy','red'] };
const inboundTypes = new Set(['OPENING_BALANCE','RECEIPT','RETURN_IN','ADJUSTMENT_IN']);

export default function InventoryTransactions() {
  const [searchParams] = useSearchParams();
  const [form] = Form.useForm();
  const [documents,setDocuments] = useState([]);
  const [balances,setBalances] = useState([]);
  const [balanceSummary,setBalanceSummary] = useState({});
  const [transactions,setTransactions] = useState([]);
  const [meta,setMeta] = useState({materials:[],warehouses:[],units:[],suppliers:[],reasons:[],projects:[]});
  const [projectContext,setProjectContext] = useState({requirements:[]});
  const [selectedProject,setSelectedProject] = useState(null);
  const openedFromProject = useRef(false);
  const [loading,setLoading] = useState(false);
  const [modalOpen,setModalOpen] = useState(false);
  const [editing,setEditing] = useState(null);
  const [selectedType,setSelectedType] = useState('RECEIPT');
  const [selectedWarehouse,setSelectedWarehouse] = useState(null);
  const [docFilters,setDocFilters] = useState({});
  const [balanceFilters,setBalanceFilters] = useState({});

  const loadAll = async () => {
    setLoading(true);
    try {
      const [metadata,docs,stock,ledger] = await Promise.all([
        inventoryAPI.getMeta(), inventoryAPI.getDocuments(docFilters), inventoryAPI.getBalances(balanceFilters), inventoryAPI.getTransactions({}),
      ]);
      setMeta(metadata.data||{}); setDocuments(docs.data||[]); setBalances(stock.data||[]); setBalanceSummary(stock.summary||{}); setTransactions(ledger.data||[]);
    } catch(error){ message.error(error.message); }
    finally{ setLoading(false); }
  };
  useEffect(()=>{ loadAll(); },[]);

  const loadProjectContext = async projectId => {
    setSelectedProject(projectId||null); setProjectContext({requirements:[]});
    if(!projectId)return;
    try{const response=await inventoryAPI.getProjectContext(projectId);setProjectContext(response.data||{requirements:[]});}
    catch(error){message.error(error.message);}
  };

  const warehouse = useMemo(()=>meta.warehouses?.find(x=>x.id===selectedWarehouse),[meta,selectedWarehouse]);
  const locations = warehouse?.locations || [];
  const requiresInputCost = inboundTypes.has(selectedType);

  const openCreate = (initial={}) => {
    const defaultWarehouse=meta.warehouses?.find(x=>x.is_default)||meta.warehouses?.[0];
    const documentType=initial.document_type||'RECEIPT'; const projectId=initial.project_id||null;
    setEditing(null); setSelectedType(documentType); setSelectedWarehouse(defaultWarehouse?.id); form.resetFields();
    form.setFieldsValue({document_type:documentType,document_date:dayjs(),warehouse_id:defaultWarehouse?.id,project_id:projectId||undefined,lines:[{input_quantity:1,input_unit_cost:0}]});
    loadProjectContext(projectId); setModalOpen(true);
  };
  const openEdit = async row => {
    try{
      const response=await inventoryAPI.getDocument(row.id); const doc=response.data;
      setEditing(doc); setSelectedType(doc.document_type); setSelectedWarehouse(doc.warehouse_id); loadProjectContext(doc.project_id); form.resetFields();
      form.setFieldsValue({...doc,document_date:dayjs(doc.document_date),lines:(doc.lines||[]).map(line=>({...line,input_quantity:Number(line.input_quantity),input_unit_cost:Number(line.input_unit_cost)}))}); setModalOpen(true);
    }catch(error){message.error(error.message);}
  };

  useEffect(()=>{
    if(openedFromProject.current || !meta.projects?.length)return;
    const projectId=Number(searchParams.get('project_id')); const documentType=searchParams.get('type');
    if(projectId && ['ISSUE','RETURN_IN'].includes(documentType)){
      openedFromProject.current=true; openCreate({project_id:projectId,document_type:documentType});
    }
  },[meta.projects]);
  const save = async values => {
    try{
      const payload={...values,document_date:values.document_date.format('YYYY-MM-DD')};
      if(editing) await inventoryAPI.updateDocument(editing.id,payload); else await inventoryAPI.createDocument(payload);
      message.success(editing?'Đã cập nhật phiếu Nháp':'Đã tạo phiếu Nháp'); setModalOpen(false); await loadAll();
    }catch(error){message.error(error.message);}
  };
  const post = async id => { try{await inventoryAPI.postDocument(id);message.success('Đã ghi sổ và cập nhật tồn kho');await loadAll();}catch(error){message.error(error.message);} };
  const reverse = async id => { try{await inventoryAPI.reverseDocument(id,{notes:'Đảo phiếu từ giao diện'});message.success('Đã tạo và ghi sổ phiếu đảo');await loadAll();}catch(error){message.error(error.message);} };
  const cancel = async id => { try{await inventoryAPI.cancelDocument(id);message.success('Đã hủy phiếu Nháp');await loadAll();}catch(error){message.error(error.message);} };
  const download = async row => {
    try{const blob=await inventoryAPI.exportDocument(row.id);const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`${row.document_code}.xlsx`;link.click();URL.revokeObjectURL(url);}catch(error){message.error(error.message);}
  };

  const documentColumns=[
    {title:'Số phiếu',dataIndex:'document_code',width:155,fixed:'left'},
    {title:'Ngày',dataIndex:'document_date',width:110,render:v=>dayjs(v).format('DD/MM/YYYY')},
    {title:'Loại phiếu',dataIndex:'document_type',width:150,render:v=>typeNames[v]||v},
    {title:'Kho',dataIndex:'warehouse_name',width:180},{title:'Dự án',dataIndex:'project_name',width:200,render:(v,r)=>v?`${r.project_code} — ${v}`:'-'},
    {title:'Số dòng',dataIndex:'line_count',width:90,align:'right'},
    {title:'Tổng SL gốc',dataIndex:'total_quantity',width:130,align:'right',render:v=>Number(v).toLocaleString('vi-VN')},
    {title:'Giá trị',dataIndex:'total_amount',width:150,align:'right',render:v=>Number(v).toLocaleString('vi-VN')},
    {title:'Trạng thái',dataIndex:'status',width:120,render:v=><Tag color={statusMap[v]?.[1]}>{statusMap[v]?.[0]||v}</Tag>},
    {title:'Thao tác',width:220,fixed:'right',render:(_,row)=><Space>
      {row.status==='DRAFT'&&<Button icon={<EditOutlined/>} onClick={()=>openEdit(row)} title="Sửa"/>}
      {row.status==='DRAFT'&&<Popconfirm title="Ghi sổ phiếu này? Tồn kho sẽ được cập nhật." onConfirm={()=>post(row.id)}><Button type="primary" icon={<CheckOutlined/>}>Ghi sổ</Button></Popconfirm>}
      {row.status==='DRAFT'&&<Popconfirm title="Hủy phiếu Nháp?" onConfirm={()=>cancel(row.id)}><Button danger icon={<DeleteOutlined/>}/></Popconfirm>}
      {row.status==='POSTED'&&<Popconfirm title="Tạo phiếu đảo và cập nhật ngược tồn kho?" onConfirm={()=>reverse(row.id)}><Button icon={<RollbackOutlined/>}>Đảo phiếu</Button></Popconfirm>}
      <Button icon={<DownloadOutlined/>} onClick={()=>download(row)} title="Xuất Excel"/>
    </Space>},
  ];
  const balanceColumns=[
    {title:'Mã vật tư',dataIndex:'material_code',width:140},{title:'Tên vật tư',dataIndex:'material_name',width:230},
    {title:'Kho',dataIndex:'warehouse_name',width:180},{title:'Vị trí',render:(_,r)=>r.location_code?`${r.location_code} — ${r.location_name}`:'Kho chung',width:170},
    {title:'Tồn thực tế',dataIndex:'quantity_on_hand',align:'right',render:(v,r)=>`${Number(v).toLocaleString('vi-VN')} ${r.unit_symbol||''}`},
    {title:'Đã giữ',dataIndex:'quantity_reserved',align:'right',render:v=>Number(v).toLocaleString('vi-VN')},
    {title:'Khả dụng',dataIndex:'quantity_available',align:'right',render:v=><Text type={Number(v)<=0?'danger':undefined}>{Number(v).toLocaleString('vi-VN')}</Text>},
    {title:'Giá bình quân',dataIndex:'average_cost',align:'right',render:v=>Number(v).toLocaleString('vi-VN')},
    {title:'Giá trị tồn',dataIndex:'stock_value',align:'right',render:v=>Number(v).toLocaleString('vi-VN')},
  ];
  const transactionColumns=[
    {title:'Thời gian',dataIndex:'transaction_date',width:160,render:v=>dayjs(v).format('DD/MM/YYYY HH:mm')},
    {title:'Số phiếu',dataIndex:'document_code',width:155},{title:'Loại',dataIndex:'transaction_type',width:140,render:v=>typeNames[v]||v},
    {title:'Vật tư',render:(_,r)=><><b>{r.material_code}</b><br/><Text type="secondary">{r.material_name}</Text></>,width:230},
    {title:'Kho',dataIndex:'warehouse_name',width:160},
    {title:'Nhập/Xuất',align:'right',render:(_,r)=><Text type={r.stock_direction>0?'success':'danger'}>{r.stock_direction>0?'+':'-'}{Number(r.base_quantity).toLocaleString('vi-VN')} {r.unit_symbol||''}</Text>},
    {title:'Đơn giá',dataIndex:'unit_cost',align:'right',render:v=>Number(v).toLocaleString('vi-VN')},
    {title:'Tồn sau GD',dataIndex:'balance_quantity_after',align:'right',render:v=>Number(v).toLocaleString('vi-VN')},
    {title:'Giá BQ sau GD',dataIndex:'average_cost_after',align:'right',render:v=>Number(v).toLocaleString('vi-VN')},
  ];

  return <div>
    <div className="page-header"><div><Title level={2} style={{marginBottom:0}}>Giao dịch kho</Title><Text type="secondary">Phiếu chứng từ, tồn kho và sổ giao dịch bất biến</Text></div><Button type="primary" icon={<PlusOutlined/>} onClick={openCreate}>Tạo phiếu kho</Button></div>
    <Alert type="info" showIcon style={{marginBottom:16}} message="Simba PMS — Project Material Integration 2.4.0-D" description="Phiếu xuất/trả vật tư dự án liên kết trực tiếp với dự trù và phiếu giữ. Khi ghi sổ, tồn kho, lượng đã xuất và chi phí thực tế của dự án được cập nhật trong cùng giao dịch."/>
    <Tabs items={[
      {key:'documents',label:'Phiếu chứng từ',children:<Card>
        <Space wrap style={{marginBottom:16}}>
          <Select allowClear placeholder="Loại phiếu" style={{width:180}} options={typeOptions} onChange={document_type=>setDocFilters(v=>({...v,document_type}))}/>
          <Select allowClear placeholder="Trạng thái" style={{width:150}} options={Object.entries(statusMap).map(([value,item])=>({value,label:item[0]}))} onChange={status=>setDocFilters(v=>({...v,status}))}/>
          <Select allowClear placeholder="Kho" style={{width:200}} options={(meta.warehouses||[]).map(x=>({value:x.id,label:x.name}))} onChange={warehouse_id=>setDocFilters(v=>({...v,warehouse_id}))}/>
          <Button icon={<ReloadOutlined/>} onClick={loadAll}>Áp dụng / Tải lại</Button>
        </Space><Table rowKey="id" loading={loading} dataSource={documents} columns={documentColumns} scroll={{x:1450}} pagination={{pageSize:20}}/>
      </Card>},
      {key:'balances',label:'Tồn kho',children:<><Row gutter={16} style={{marginBottom:16}}>
        <Col xs={12} lg={6}><Card><Statistic title="Tồn thực tế" value={balanceSummary.quantity_on_hand||0} precision={2}/></Card></Col>
        <Col xs={12} lg={6}><Card><Statistic title="Đã giữ" value={balanceSummary.quantity_reserved||0} precision={2}/></Card></Col>
        <Col xs={12} lg={6}><Card><Statistic title="Khả dụng" value={balanceSummary.quantity_available||0} precision={2}/></Card></Col>
        <Col xs={12} lg={6}><Card><Statistic title="Giá trị tồn" value={balanceSummary.stock_value||0} precision={0}/></Card></Col>
      </Row><Card><Space wrap style={{marginBottom:16}}><Input.Search allowClear placeholder="Mã hoặc tên vật tư" style={{width:260}} onSearch={search=>setBalanceFilters(v=>({...v,search}))}/><Select allowClear placeholder="Kho" style={{width:200}} options={(meta.warehouses||[]).map(x=>({value:x.id,label:x.name}))} onChange={warehouse_id=>setBalanceFilters(v=>({...v,warehouse_id}))}/><Button icon={<ReloadOutlined/>} onClick={loadAll}>Áp dụng / Tải lại</Button></Space><Table rowKey="id" loading={loading} dataSource={balances} columns={balanceColumns} scroll={{x:1400}} pagination={{pageSize:25}}/></Card></>},
      {key:'ledger',label:'Sổ giao dịch',children:<Card><Button icon={<ReloadOutlined/>} onClick={loadAll} style={{marginBottom:16}}>Tải lại</Button><Table rowKey="id" loading={loading} dataSource={transactions} columns={transactionColumns} scroll={{x:1450}} pagination={{pageSize:30}}/></Card>},
    ]}/>

    <Modal title={editing?`Sửa phiếu ${editing.document_code}`:'Tạo phiếu kho'} open={modalOpen} onCancel={()=>setModalOpen(false)} footer={null} width={1100} destroyOnClose>
      <Form form={form} layout="vertical" onFinish={save}>
        <Row gutter={16}>
          <Col xs={24} md={6}><Form.Item name="document_type" label="Loại phiếu" rules={[{required:true}]}><Select disabled={!!editing} options={typeOptions} onChange={value=>{setSelectedType(value);if(!['ISSUE','RETURN_IN'].includes(value)){form.setFieldValue('project_id',undefined);loadProjectContext(null);}}}/></Form.Item></Col>
          <Col xs={24} md={6}><Form.Item name="document_date" label="Ngày chứng từ" rules={[{required:true}]}><DatePicker format="DD/MM/YYYY" style={{width:'100%'}}/></Form.Item></Col>
          <Col xs={24} md={6}><Form.Item name="warehouse_id" label="Kho" rules={[{required:true}]}><Select options={(meta.warehouses||[]).map(x=>({value:x.id,label:x.name}))} onChange={value=>{setSelectedWarehouse(value);form.setFieldsValue({lines:(form.getFieldValue('lines')||[]).map(x=>({...x,location_id:null}))});}}/></Form.Item></Col>
          <Col xs={24} md={6}><Form.Item name="supplier_id" label="Nhà cung cấp"><Select allowClear showSearch optionFilterProp="label" options={(meta.suppliers||[]).map(x=>({value:x.id,label:x.name}))}/></Form.Item></Col>
          {['ISSUE','RETURN_IN'].includes(selectedType)&&<Col xs={24} md={12}><Form.Item name="project_id" label="Dự án (chọn khi xuất/trả cho dự án)"><Select allowClear showSearch optionFilterProp="label" options={(meta.projects||[]).map(x=>({value:x.id,label:`${x.project_code} — ${x.project_name}`}))} onChange={value=>{loadProjectContext(value);form.setFieldsValue({lines:[{input_quantity:1,input_unit_cost:0}]});}}/></Form.Item></Col>}
          <Col xs={24} md={8}><Form.Item name="reference_number" label="Số tham chiếu"><Input/></Form.Item></Col>
          <Col xs={24} md={8}><Form.Item name="reason_code" label="Lý do" rules={selectedType.startsWith('ADJUSTMENT')?[{required:true}]:[]}><Select allowClear options={(meta.reasons||[]).map(x=>({value:x.code,label:x.name}))}/></Form.Item></Col>
          <Col xs={24} md={8}><Form.Item name="notes" label="Ghi chú"><Input/></Form.Item></Col>
        </Row>
        <Form.List name="lines">
          {(fields,{add,remove})=><>
            <Table pagination={false} rowKey="key" dataSource={fields} columns={[
              ...(['ISSUE','RETURN_IN'].includes(selectedType)&&selectedProject?[{title:'Dự trù / Phiếu giữ',width:310,render:(_,field)=><Form.Item name={[field.name,'reservation_id']} rules={[{required:true}]} style={{margin:0}}><Select showSearch optionFilterProp="label" options={(projectContext.requirements||[]).flatMap(requirement=>(requirement.reservations||[]).filter(reservation=>Number(selectedType==='ISSUE'?reservation.issuable_quantity:reservation.returnable_quantity)>0).map(reservation=>({value:reservation.id,label:`${requirement.material_code} — ${requirement.material_name} | ${reservation.warehouse_name} | ${selectedType==='ISSUE'?'còn xuất':'còn trả'} ${Number(selectedType==='ISSUE'?reservation.issuable_quantity:reservation.returnable_quantity).toLocaleString('vi-VN')}`,requirement,reservation}))) } onChange={(_,option)=>{const lines=form.getFieldValue('lines')||[];lines[field.name]={...lines[field.name],reservation_id:option.value,requirement_id:option.requirement.id,material_id:option.requirement.material_id,input_unit_id:meta.materials.find(x=>x.id===option.requirement.material_id)?.base_unit_id,location_id:option.reservation.location_id,input_quantity:1,input_unit_cost:0};form.setFieldsValue({warehouse_id:option.reservation.warehouse_id,lines});setSelectedWarehouse(option.reservation.warehouse_id);}}/></Form.Item>}]:[]),
              {title:'Vật tư',width:260,render:(_,field)=><Form.Item name={[field.name,'material_id']} rules={[{required:true}]} style={{margin:0}}><Select showSearch optionFilterProp="label" options={(meta.materials||[]).map(x=>({value:x.id,label:`${x.material_code} — ${x.name}`}))} onChange={materialId=>{const material=meta.materials.find(x=>x.id===materialId);const lines=form.getFieldValue('lines')||[];lines[field.name]={...lines[field.name],input_unit_id:material?.base_unit_id};form.setFieldsValue({lines});}}/></Form.Item>},
              {title:'Vị trí',width:170,render:(_,field)=><Form.Item name={[field.name,'location_id']} style={{margin:0}}><Select allowClear options={locations.map(x=>({value:x.id,label:`${x.location_code} — ${x.name}`}))}/></Form.Item>},
              {title:'Đơn vị nhập',width:170,render:(_,field)=><Form.Item name={[field.name,'input_unit_id']} rules={[{required:true}]} style={{margin:0}}><Select options={(meta.units||[]).map(x=>({value:x.id,label:`${x.name} (${x.symbol})`}))}/></Form.Item>},
              {title:'Số lượng',width:130,render:(_,field)=><Form.Item name={[field.name,'input_quantity']} rules={[{required:true}]} style={{margin:0}}><InputNumber min={0.000001} style={{width:'100%'}}/></Form.Item>},
              {title:'Đơn giá theo ĐV nhập',width:170,render:(_,field)=><Form.Item name={[field.name,'input_unit_cost']} style={{margin:0}}><InputNumber min={0} disabled={!requiresInputCost} style={{width:'100%'}}/></Form.Item>},
              {title:'Lô/Serial (chuẩn bị)',width:170,render:(_,field)=><Space direction="vertical"><Form.Item name={[field.name,'batch_number']} style={{margin:0}}><Input placeholder="Số lô"/></Form.Item><Form.Item name={[field.name,'serial_number']} style={{margin:0}}><Input placeholder="Serial"/></Form.Item></Space>},
              {title:'',width:50,render:(_,field)=><Button danger icon={<DeleteOutlined/>} onClick={()=>remove(field.name)}/>},
            ]}/>
            <Button type="dashed" icon={<PlusOutlined/>} onClick={()=>add({input_quantity:1,input_unit_cost:0})} style={{marginTop:12}}>Thêm dòng vật tư</Button>
          </>}
        </Form.List>
        <div style={{marginTop:20,textAlign:'right'}}><Space><Button onClick={()=>setModalOpen(false)}>Đóng</Button><Button type="primary" htmlType="submit">Lưu phiếu Nháp</Button></Space></div>
      </Form>
    </Modal>
  </div>;
}
