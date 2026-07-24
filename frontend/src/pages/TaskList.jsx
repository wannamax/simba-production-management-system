import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Badge, Button, Card, Checkbox, Col, Collapse, DatePicker, Descriptions, Divider, Empty, Form,
  Input, InputNumber, Modal, Progress, Radio, Row, Segmented, Select, Space, Statistic, Table,
  Tag, Tooltip, Typography, message,
} from 'antd';
import {
  CheckCircleOutlined, DeleteOutlined, EditOutlined, EyeOutlined, InboxOutlined,
  PlusOutlined, ProjectOutlined, TeamOutlined, WarningOutlined,
} from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { projectAPI, taskAPI, workCatalogAPI } from '../services/api';
import AssignmentWorkCalendar from '../components/AssignmentWorkCalendar';

const { Text } = Typography;
const productionStatusLabel={PLANNED:'Kế hoạch',IN_PROGRESS:'Đang sản xuất',READY_FOR_DELIVERY:'Sẵn sàng giao',COMPLETED:'Hoàn tất',CANCELLED:'Đã hủy'};
const sectionHeaderStyle=status=>{
  const backgrounds={
    'Chưa bắt đầu':'#ffffff',PLANNED:'#ffffff',NOT_STARTED:'#ffffff',
    'Đang thực hiện':'#e6f4ff',IN_PROGRESS:'#e6f4ff',IN_PRODUCTION:'#e6f4ff',
    'Hoàn thành':'#f6ffed',COMPLETED:'#f6ffed',READY_FOR_DELIVERY:'#f6ffed',
    'Hủy':'#f5f5f5',CANCELLED:'#f5f5f5',
    'Tạm dừng':'#fffbe6',PAUSED:'#fffbe6',BLOCKED:'#fffbe6',
  };
  return {background:backgrounds[status]||'#ffffff',borderRadius:6};
};

export default function TaskList() {
  const navigate=useNavigate();
  const [searchParams]=useSearchParams();
  const [form]=Form.useForm();
  const [tasks,setTasks]=useState([]);
  const [productionStages,setProductionStages]=useState([]);
  const [projects,setProjects]=useState([]);
  const [context,setContext]=useState(null);
  const [loading,setLoading]=useState(false);
  const [contextLoading,setContextLoading]=useState(false);
  const [modalVisible,setModalVisible]=useState(false);
  const [editingTask,setEditingTask]=useState(null);
  const [activeKeys,setActiveKeys]=useState([]);
  const linkedProjectId=Number(searchParams.get('project_id'))||'';
  const linkedStageId=Number(searchParams.get('stage_id'))||undefined;
  const linkedCreateMode=searchParams.get('create');
  const linkedOrderId=Number(searchParams.get('order_id'))||undefined;
  const [filters,setFilters]=useState({project_id:linkedProjectId,status:'',is_overdue:false,is_archived:false});
  const [deepLinkHandled,setDeepLinkHandled]=useState(false);
  const [search,setSearch]=useState('');
  const [viewMode,setViewMode]=useState('project');
  const taskSourceType=Form.useWatch('task_source_type',form);
  const selectedOrderId=Form.useWatch('order_id',form);
  const selectedWorkItemIds=Form.useWatch('work_item_ids',form);
  const loadProjects=async()=>{
    try{
      const response=await projectAPI.getAll({page:1,limit:1000});
      const rows=response.data||[]; setProjects(rows);
    }catch(error){message.error(`Không thể tải dự án: ${error.message}`);}
  };
  const loadTasks=async()=>{
    setLoading(true);
    try{const response=await taskAPI.getAll(filters);setTasks(response.data||[]);setProductionStages(response.production_stages||[]);}
    catch(error){message.error(`Không thể tải nhiệm vụ: ${error.message}`);}finally{setLoading(false);}
  };
  useEffect(()=>{loadProjects();},[]);
  useEffect(()=>{loadTasks();},[filters]);

  const loadContext=async projectId=>{
    if(!projectId){setContext(null);return null;}
    setContextLoading(true);
    try{const response=await workCatalogAPI.getProjectContext(projectId);setContext(response.data);return response.data;}
    catch(error){setContext(null);message.error(error.message);return null;}finally{setContextLoading(false);}
  };
  const openCreate=async (projectId,stageId,sourceType,orderId)=>{
    setEditingTask(null); form.resetFields(); setModalVisible(true);
    form.setFieldsValue({
      project_id:projectId||undefined,priority:'Trung bình',notify_before_days:1,
      production_stage_instance_id:stageId||undefined,
      task_source_type:sourceType||(stageId?'PRODUCTION_STAGE':'PROJECT_DIRECT'),
      work_item_ids:[],
      assignments:[{}],
    });
    if(projectId){
      const data=await loadContext(projectId);
      if(orderId&&data){
        const order=(data.orders||[]).find(item=>Number(item.id)===Number(orderId));
        form.setFieldsValue({
          order_id:order?.id,
          fulfillment_items:(order?.items||[]).map(item=>({
            order_item_id:item.id,selected:false,planned_quantity:undefined,
          })),
        });
      }
    }else setContext(null);
  };
  useEffect(()=>{
    if(deepLinkHandled||!linkedProjectId)return;
    if(linkedStageId){setDeepLinkHandled(true);openCreate(linkedProjectId,linkedStageId,'PRODUCTION_STAGE');}
    else if(linkedCreateMode==='fulfillment'){setDeepLinkHandled(true);openCreate(linkedProjectId,null,'ORDER_FULFILLMENT',linkedOrderId);}
  },[deepLinkHandled,linkedProjectId,linkedStageId,linkedCreateMode,linkedOrderId]);
  const openEdit=async record=>{
    setEditingTask(record); setModalVisible(true); await loadContext(record.project_id);
    form.setFieldsValue({
      ...record,
    });
  };
  const changeProject=async projectId=>{
    const data=await loadContext(projectId);
    form.setFieldsValue({
      work_item_id:undefined,
      work_item_ids:[],
      production_stage_instance_id:undefined,
      order_id:undefined,
      fulfillment_items:[],
      assignments:[{}],
    });
  };
  const changeEmployee=(index,employeeId)=>{
    const employee=context?.employees?.find(item=>item.id===employeeId);
    const fallback=context?.roles?.find(item=>item.is_default)?.name||context?.roles?.[0]?.name;
    const assignments=form.getFieldValue('assignments')||[];
    assignments[index]={...assignments[index],employee_id:employeeId,role_in_task:employee?.project_role||fallback};
    form.setFieldValue('assignments',assignments);
  };
  const submit=async values=>{
    const serializeDate=value=>value?.format?.('YYYY-MM-DD')||value||null;
    const selectedFulfillmentItems=(values.fulfillment_items||[]).filter(row=>row?.selected);
    if(values.task_source_type==='ORDER_FULFILLMENT'&&!selectedFulfillmentItems.length){
      message.error('Chọn ít nhất một hạng mục và nhập số lượng Giao hàng/Lắp đặt');
      return;
    }
    const payload={
      ...values,
      fulfillment_items:values.task_source_type==='ORDER_FULFILLMENT'
        ?selectedFulfillmentItems.map(row=>({
          order_item_id:row.order_item_id,planned_quantity:row.planned_quantity,
        })) :[],
      assignments:editingTask?undefined:(values.assignments||[]).filter(row=>row?.employee_id).map(row=>({
        ...row,work_dates:(row.work_dates||[]).map(serializeDate),
      })),
    };
    try{
      const response=editingTask?await taskAPI.update(editingTask.id,payload):await taskAPI.createBatch(payload);
      const synced=response.synced_project_employees||[];
      message.success(editingTask?'Đã cập nhật Công việc':response.message||(synced.length?`Đã tạo Công việc và thêm ${synced.length} nhân viên vào dự án`:'Đã tạo và phân công Công việc'));
      if(response.warnings?.length) Modal.warning({title:'Cảnh báo lịch trùng',content:<ul>{response.warnings.map(item=><li key={item}>{item}</li>)}</ul>});
      setModalVisible(false);form.resetFields();await loadTasks();
    }catch(error){message.error(error.message);}
  };
  const complete=async id=>{try{await taskAPI.complete(id);message.success('Đã hoàn thành nhiệm vụ');await loadTasks();}catch(error){message.error(error.message);}};
  const archive=async id=>{try{await taskAPI.archive(id);message.success('Đã lưu trữ nhiệm vụ');await loadTasks();}catch(error){message.error(error.message);}};
  const remove=async id=>{try{await taskAPI.delete(id);message.success('Đã xóa nhiệm vụ');await loadTasks();}catch(error){message.error(error.message);}};

  const statusColor=status=>({'Chưa bắt đầu':'default','Đang thực hiện':'processing','Chờ xử lý':'warning','Hoàn thành':'success','Tạm dừng':'orange','Hủy':'error'}[status]||'default');
  const columns=[
    {title:'Công việc',key:'task',width:230,render:(_,record)=><Space direction="vertical" size={0}><a onClick={()=>navigate(`/tasks/${record.id}`)}><strong>{record.task_name}</strong></a><Text type="secondary">{record.task_code}</Text>{record.is_overdue&&<Tag icon={<WarningOutlined/>} color="error">Quá hạn</Tag>}</Space>},
    {title:'Nguồn công việc',key:'stage',width:230,render:(_,record)=>record.task_source_type==='PRODUCTION_STAGE'||record.production_stage_instance_id
      ?<Space direction="vertical" size={0}><Tag color="purple">{record.stage_sequence_no}. {record.stage_name}</Tag><Text type="secondary">{record.production_group_name} · {record.production_code}</Text></Space>
      :record.task_source_type==='ORDER_FULFILLMENT'
        ?<Space direction="vertical" size={0}><Tag color="cyan">Thực thi Đơn hàng</Tag><Text type="secondary">{record.order_code}</Text></Space>
        :<Tag color="blue">Trực tiếp theo Dự án</Tag>},
    {title:'Nhóm công việc',dataIndex:'work_group_name',width:140,render:(value,record)=><Tag color={record.work_group_color||'blue'}>{value||record.task_type}</Tag>},
    {title:'Nhân viên',dataIndex:'assignments',width:250,render:rows=>rows?.length?<Space direction="vertical" size={4}>{rows.map(row=><span key={row.id}><TeamOutlined/> {row.full_name} <Text type="secondary">· {Number(row.planned_hours||0)}h</Text></span>)}</Space>:<Text type="secondary">Chưa phân công</Text>},
    {title:'Kế hoạch tự động',key:'dates',width:210,render:(_,record)=><Space direction="vertical" size={0}><span>{record.start_date?dayjs(record.start_date).format('DD/MM/YYYY'):'-'} → {record.end_date?dayjs(record.end_date).format('DD/MM/YYYY'):'-'}</span><Text type="secondary">{record.estimated_duration||0} ngày · {Number(record.estimated_hours||0)} giờ</Text></Space>},
    {title:'Tiến độ',dataIndex:'progress',width:130,render:value=><Progress percent={value||0} size="small"/>},
    {title:'Trạng thái',dataIndex:'status',width:130,render:value=><Tag color={statusColor(value)}>{value}</Tag>},
    {title:'Thao tác',key:'actions',width:170,render:(_,record)=><Space size="small">
      <Tooltip title="Chi tiết"><Button type="link" icon={<EyeOutlined/>} onClick={()=>navigate(`/tasks/${record.id}`)}/></Tooltip>
      {!record.is_completed&&<><Tooltip title="Sửa"><Button type="link" icon={<EditOutlined/>} onClick={()=>openEdit(record)}/></Tooltip><Tooltip title="Hoàn thành"><Button type="link" style={{color:'#52c41a'}} icon={<CheckCircleOutlined/>} onClick={()=>complete(record.id)}/></Tooltip></>}
      {record.is_completed&&!record.is_archived&&<Tooltip title="Lưu trữ"><Button type="link" icon={<InboxOutlined/>} onClick={()=>archive(record.id)}/></Tooltip>}
      <Tooltip title="Xóa Công việc"><Button type="link" danger icon={<DeleteOutlined/>} onClick={()=>Modal.confirm({title:'Xóa Công việc?',content:record.production_stage_instance_id?'Công đoạn và số lượng Đơn hàng vẫn được giữ nguyên.':record.task_name,onOk:()=>remove(record.id)})}/></Tooltip>
    </Space>},
  ];

  const stats={total:tasks.length,pending:tasks.filter(x=>x.status==='Chưa bắt đầu').length,active:tasks.filter(x=>x.status==='Đang thực hiện').length,completed:tasks.filter(x=>x.status==='Hoàn thành').length};
  const visibleProjects=useMemo(()=>projects.filter(project=>{
    if(filters.project_id&&project.id!==filters.project_id)return false;
    const needle=search.trim().toLowerCase();
    return !needle||`${project.project_code} ${project.project_name} ${project.company_name||''}`.toLowerCase().includes(needle);
  }),[projects,filters.project_id,search]);
  const visibleTasks=useMemo(()=>{
    const needle=search.trim().toLowerCase();
    return tasks.filter(task=>!needle||`${task.task_code} ${task.task_name} ${task.project_name} ${task.company_name||''} ${task.work_group_name||task.task_type||''} ${task.order_code||''}`.toLowerCase().includes(needle));
  },[tasks,search]);
  const workGroups=useMemo(()=>{
    const map=new Map();
    for(const item of context?.work_items||[]){if(!map.has(item.group_name))map.set(item.group_name,[]);map.get(item.group_name).push(item);}
    return [...map.entries()];
  },[context]);
  const selectableWorkGroups=useMemo(()=>{
    if(taskSourceType!=='ORDER_FULFILLMENT')return workGroups;
    return workGroups.map(([groupName,items])=>[groupName,items.filter(item=>['DELIVERY','INSTALLATION'].includes(item.execution_type))])
      .filter(([,items])=>items.length);
  },[workGroups,taskSourceType]);
  const selectedOrder=useMemo(()=>(context?.orders||[]).find(order=>Number(order.id)===Number(selectedOrderId)),[context,selectedOrderId]);
  const selectedExecutionType=useMemo(()=>{
    const selectedId=Array.isArray(selectedWorkItemIds)?selectedWorkItemIds[0]:null;
    return (context?.work_items||[]).find(item=>Number(item.id)===Number(selectedId))?.execution_type||null;
  },[context,selectedWorkItemIds]);
  const changeOrder=orderId=>{
    const order=(context?.orders||[]).find(item=>Number(item.id)===Number(orderId));
    form.setFieldValue('fulfillment_items',(order?.items||[]).map(item=>({
      order_item_id:item.id,selected:false,planned_quantity:undefined,
    })));
  };
  const projectMembers=useMemo(()=>(context?.employees||[]).filter(item=>item.is_project_member),[context]);
  const availableEmployees=useMemo(()=>(context?.employees||[]).filter(item=>!item.is_project_member),[context]);
  const employeeOptions=useMemo(()=>[
    {label:`Nhân sự dự án (${projectMembers.length})`,options:projectMembers.map(item=>({value:item.id,label:`${item.full_name} — ${item.project_role||item.position||''}`}))},
    {label:`Nhân viên khác (${availableEmployees.length})`,options:availableEmployees.map(item=>({value:item.id,label:`${item.full_name} — ${item.position||item.department||''}`}))},
  ].filter(group=>group.options.length),[projectMembers,availableEmployees]);
  const stageTaskColumns=[columns[0],...columns.slice(2)];
  const quantity=value=>Number(value||0).toLocaleString('vi-VN',{maximumFractionDigits:3});
  const productionItemColumns=[
    {title:'Mặt hàng thi công',dataIndex:'item_name',render:(value,row)=><Space direction="vertical" size={0}><Text strong>{value}</Text>{row.item_code&&<Text type="secondary">{row.item_code}</Text>}</Space>},
    {title:'Số lượng Lệnh SX',key:'planned',width:170,align:'right',render:(_,row)=>`${quantity(row.planned_quantity)} ${row.unit}`},
    {title:'Đã hoàn thành',key:'completed',width:190,align:'right',render:(_,row)=><Text strong>{quantity(row.completed_quantity)} / {quantity(row.planned_quantity)} {row.unit}</Text>},
  ];
  const collapseItems=visibleProjects.map(project=>{
    const projectTasks=visibleTasks.filter(task=>task.project_id===project.id);
    const directTasks=projectTasks.filter(task=>task.task_source_type==='PROJECT_DIRECT'||(!task.production_stage_instance_id&&!task.order_id));
    const fulfillmentTasks=projectTasks.filter(task=>task.task_source_type==='ORDER_FULFILLMENT');
    const stages=productionStages.filter(stage=>stage.project_id===project.id);
    const productionOrders=new Map();
    for(const stage of stages){
      if(!productionOrders.has(stage.production_order_id))productionOrders.set(stage.production_order_id,{...stage,stages:[]});
      productionOrders.get(stage.production_order_id).stages.push(stage);
    }
    const productionItems=[...productionOrders.values()].map(production=>({
      key:String(production.production_order_id),
      label:<Space wrap><Tag color="geekblue">{production.production_code}</Tag><strong>{production.group_name||production.process_name}</strong><Text type="secondary">Đơn {production.order_code}</Text><Tag>{productionStatusLabel[production.production_status]||production.production_status}</Tag></Space>,
      styles:{header:sectionHeaderStyle(production.production_status)},
      children:<Space direction="vertical" size={12} style={{width:'100%'}}>
        <Table rowKey="order_item_id" size="small" pagination={false} dataSource={production.production_items||[]} columns={productionItemColumns}/>
        <Collapse size="small" items={production.stages.map(stage=>{
          const stageTasks=projectTasks.filter(task=>task.production_stage_instance_id===stage.id);
          return {key:String(stage.id),label:<Space wrap><Tag color="purple">{stage.sequence_no}</Tag><strong>{stage.stage_name}</strong><Text type="secondary">{stage.planned_start_date?dayjs(stage.planned_start_date).format('DD/MM/YYYY'):'-'} → {stage.planned_end_date?dayjs(stage.planned_end_date).format('DD/MM/YYYY'):'-'}</Text><Badge count={stageTasks.length} showZero color="#722ed1"/></Space>,extra:<Button size="small" type="primary" icon={<PlusOutlined/>} onClick={event=>{event.stopPropagation();openCreate(project.id,stage.id);}}>Thêm Công việc</Button>,children:stageTasks.length?<Table rowKey="id" columns={stageTaskColumns} dataSource={stageTasks} loading={loading} pagination={false} scroll={{x:1000}}/>:<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Công đoạn chưa có Công việc"/>};
        })}/>
      </Space>,
    }));
    return {
      key:String(project.id),
      label:<Space wrap><ProjectOutlined/><strong>{project.project_name}</strong><Tag>{project.project_type||'Chưa phân loại'}</Tag>{project.company_name&&<Text type="secondary">KH: {project.company_name}</Text>}<Badge count={projectTasks.length} showZero color="#1677ff"/></Space>,
      styles:{header:sectionHeaderStyle(project.status)},
      children:<Space direction="vertical" style={{width:'100%'}} size={16}>
        <Collapse size="small" items={[
          {key:'direct',label:<Space><Tag color="blue">Trực tiếp theo Dự án</Tag><Badge count={directTasks.length} showZero color="#1677ff"/></Space>,children:directTasks.length?<Table rowKey="id" columns={columns} dataSource={directTasks} loading={loading} pagination={false} scroll={{x:1400}}/>:<Text type="secondary">Chưa có nhiệm vụ trực tiếp</Text>},
          {key:'fulfillment',label:<Space><Tag color="cyan">Thực thi Đơn hàng</Tag><Badge count={fulfillmentTasks.length} showZero color="#13c2c2"/></Space>,children:fulfillmentTasks.length?<Table rowKey="id" columns={columns} dataSource={fulfillmentTasks} loading={loading} pagination={false} scroll={{x:1400}}/>:<Text type="secondary">Chưa có nhiệm vụ Giao hàng/Lắp đặt theo Đơn hàng</Text>},
        ]}/>
        {productionItems.length?<Collapse size="small" items={productionItems}/>:<Alert type="info" showIcon message="Dự án chưa có Lệnh sản xuất" description="Tạo Lệnh tại Hồ sơ sản xuất, sau đó quay lại đây để tạo và giao Công việc theo Công đoạn." action={<Button type="link" onClick={()=>navigate(`/orders?tab=plans&project_id=${project.id}`)}>Hồ sơ sản xuất</Button>}/>}
      </Space>,
    };
  });

  const crossViewColumns=[
    columns[0],
    {title:'Dự án',dataIndex:'project_name',width:210,render:(value,record)=><Space direction="vertical" size={0}><Text strong>{value}</Text><Text type="secondary">{record.project_code}</Text></Space>},
    ...columns.slice(1),
  ];
  const groupItems=useMemo(()=>{
    const grouped=new Map();
    for(const task of visibleTasks){
      const key=task.work_group_name||task.task_type||'Chưa phân nhóm';
      if(!grouped.has(key))grouped.set(key,[]);
      grouped.get(key).push(task);
    }
    return [...grouped.entries()].map(([groupName,rows])=>({
      key:groupName,label:<Space><Tag color={rows[0]?.work_group_color||'blue'}>{groupName}</Tag><Badge count={rows.length} showZero color="#1677ff"/></Space>,
      children:<Table rowKey="id" columns={crossViewColumns} dataSource={rows} loading={loading} pagination={false} scroll={{x:1400}}/>,
    }));
  },[visibleTasks,loading]);
  const employeeItems=useMemo(()=>{
    const grouped=new Map();
    for(const task of visibleTasks){
      for(const assignment of task.assignments||[]){
        if(!grouped.has(assignment.employee_id))grouped.set(assignment.employee_id,{employee:assignment,rows:[]});
        grouped.get(assignment.employee_id).rows.push({...task,assignment_key:`${task.id}-${assignment.id}`,focus_assignment:assignment});
      }
    }
    const employeeColumns=[
      {title:'Công việc',key:'task',width:230,render:(_,record)=><Space direction="vertical" size={0}><a onClick={()=>navigate(`/tasks/${record.id}`)}><strong>{record.task_name}</strong></a><Text type="secondary">{record.task_code}</Text></Space>},
      {title:'Dự án',dataIndex:'project_name',width:220},
      {title:'Nhóm',key:'group',width:130,render:(_,record)=><Tag color={record.work_group_color||'blue'}>{record.work_group_name||record.task_type}</Tag>},
      {title:'Vai trò',key:'role',width:150,render:(_,record)=>record.focus_assignment.role_in_task||'-'},
      {title:'Ngày được giao',key:'work_dates',width:220,render:(_,record)=>{const assignment=record.focus_assignment;return <Space direction="vertical" size={0}><span>{assignment.start_date?dayjs(assignment.start_date).format('DD/MM/YYYY'):'-'} → {assignment.end_date?dayjs(assignment.end_date).format('DD/MM/YYYY'):'-'}</span><Text type="secondary">{assignment.planned_days||0} ngày · {Number(assignment.planned_hours||0)} giờ</Text></Space>;}},
      {title:'Trạng thái',dataIndex:'status',width:130,render:value=><Tag color={statusColor(value)}>{value}</Tag>},
    ];
    return [...grouped.values()].sort((a,b)=>a.employee.full_name.localeCompare(b.employee.full_name,'vi')).map(({employee,rows})=>({
      key:String(employee.employee_id),label:<Space><TeamOutlined/><strong>{employee.full_name}</strong><Badge count={rows.length} showZero color="#722ed1"/></Space>,
      children:<Table rowKey="assignment_key" columns={employeeColumns} dataSource={rows} pagination={false} scroll={{x:1100}}/>,
    }));
  },[visibleTasks]);

  const taskContent=viewMode==='project'
    ? (collapseItems.length?<Collapse activeKey={activeKeys} onChange={keys=>setActiveKeys(keys)} items={collapseItems}/>:<Card><Empty description="Chưa có dự án phù hợp"/></Card>)
    : viewMode==='group'
      ? (groupItems.length?<Collapse defaultActiveKey={groupItems.slice(0,3).map(item=>item.key)} items={groupItems}/>:<Card><Empty description="Chưa có nhóm công việc phù hợp"/></Card>)
      : (employeeItems.length?<Collapse defaultActiveKey={employeeItems.slice(0,3).map(item=>item.key)} items={employeeItems}/>:<Card><Empty description="Chưa có nhân viên được phân công"/></Card>);

  return <div>
    <div className="page-header"><div><h1 style={{marginBottom:4}}>Nhiệm vụ &amp; Phân công</h1><Text type="secondary">2.6.0-K — Tạo Lệnh tại Hồ sơ sản xuất, sau đó tạo và giao việc theo Công đoạn tại đây</Text></div><Button onClick={()=>navigate('/orders?tab=plans')}>Hồ sơ sản xuất</Button></div>
    <Row gutter={16} style={{marginBottom:20}}><Col xs={12} md={6}><Card><Statistic title="Tổng công việc" value={stats.total}/></Card></Col><Col xs={12} md={6}><Card><Statistic title="Chưa bắt đầu" value={stats.pending}/></Card></Col><Col xs={12} md={6}><Card><Statistic title="Đang thực hiện" value={stats.active} valueStyle={{color:'#1677ff'}}/></Card></Col><Col xs={12} md={6}><Card><Statistic title="Hoàn thành" value={stats.completed} valueStyle={{color:'#52c41a'}}/></Card></Col></Row>
    <Card style={{marginBottom:16}}><Space direction="vertical" size={12} style={{width:'100%'}}>
      <Space wrap><Segmented value={viewMode} onChange={setViewMode} options={[{value:'project',label:'Theo Dự án',icon:<ProjectOutlined/>},{value:'group',label:'Theo Nhóm công việc'},{value:'employee',label:'Theo Nhân viên',icon:<TeamOutlined/>}]}/>{viewMode==='employee'&&<Button onClick={()=>navigate('/employees/availability')}>Mở Tình trạng nhân viên</Button>}</Space>
      <Space wrap><Input.Search allowClear placeholder="Tìm dự án hoặc khách hàng" style={{width:280}} onSearch={setSearch} onChange={event=>!event.target.value&&setSearch('')}/><Select allowClear placeholder="Lọc dự án" style={{width:240}} options={projects.map(x=>({value:x.id,label:x.project_name}))} onChange={value=>setFilters(previous=>({...previous,project_id:value||''}))}/><Select allowClear placeholder="Trạng thái công việc" style={{width:180}} options={['Chưa bắt đầu','Đang thực hiện','Tạm dừng','Chờ xử lý','Hoàn thành'].map(value=>({value,label:value}))} onChange={value=>setFilters(previous=>({...previous,status:value||''}))}/><DatePicker.RangePicker format="DD/MM/YYYY" placeholder={['Từ ngày','Đến ngày']} onChange={dates=>setFilters(previous=>({...previous,from_date:dates?.[0]?.format('YYYY-MM-DD')||'',to_date:dates?.[1]?.format('YYYY-MM-DD')||''}))}/><Button danger={filters.is_overdue} type={filters.is_overdue?'primary':'default'} icon={<WarningOutlined/>} onClick={()=>setFilters(previous=>({...previous,is_overdue:!previous.is_overdue}))}>Chỉ quá hạn</Button></Space>
    </Space></Card>
    {taskContent}

    <Modal title={editingTask?'Cập nhật Công việc':`Tạo và phân công Công việc${context?.project?.project_name?` — ${context.project.project_name}`:''}`} open={modalVisible} onCancel={()=>setModalVisible(false)} footer={null} width={1080} destroyOnClose>
      <Form form={form} layout="vertical" onFinish={submit}>
        <Form.Item name="project_id" hidden rules={[{required:true,message:'Chọn dự án'}]}><Input/></Form.Item>
        <Form.Item name="task_source_type" hidden={Boolean(editingTask)||taskSourceType==='PRODUCTION_STAGE'} label="Loại nhiệm vụ">
          <Radio.Group buttonStyle="solid" onChange={event=>{
            form.setFieldsValue({work_item_ids:[],order_id:undefined,fulfillment_items:[],production_stage_instance_id:undefined});
            if(event.target.value==='ORDER_FULFILLMENT'&&context?.orders?.length===1){
              form.setFieldValue('order_id',context.orders[0].id);changeOrder(context.orders[0].id);
            }
          }}>
            <Radio.Button value="PROJECT_DIRECT">Trực tiếp theo Dự án</Radio.Button>
            <Radio.Button value="ORDER_FULFILLMENT">Giao hàng/Lắp đặt theo Đơn hàng</Radio.Button>
          </Radio.Group>
        </Form.Item>
        {!context&&<Form.Item label="Chọn dự án để phân công" required><Select showSearch optionFilterProp="label" loading={contextLoading} options={projects.map(x=>({value:x.id,label:`${x.project_code} — ${x.project_name}`}))} onChange={projectId=>{form.setFieldValue('project_id',projectId);changeProject(projectId);}}/></Form.Item>}
        {context&&<Card size="small" title="Thông tin dự án" extra={<Button type="link" onClick={()=>navigate(`/projects/${context.project.id}`)}>Mở dự án để chỉnh sửa</Button>} style={{marginBottom:16}}>
          <Descriptions size="small" column={3}>
            <Descriptions.Item label="Mã">{context.project.project_code}</Descriptions.Item>
            <Descriptions.Item label="Dự án">{context.project.project_name}</Descriptions.Item>
            <Descriptions.Item label="Khách hàng">{context.project.company_name||'-'}</Descriptions.Item>
            <Descriptions.Item label="Loại">{context.project.project_type||'-'}</Descriptions.Item>
            <Descriptions.Item label="Thời gian">{context.project.start_date?dayjs(context.project.start_date).format('DD/MM/YYYY'):'-'} → {context.project.end_date?dayjs(context.project.end_date).format('DD/MM/YYYY'):'-'}</Descriptions.Item>
            <Descriptions.Item label="Trạng thái"><Tag>{context.project.status}</Tag></Descriptions.Item>
          </Descriptions>
        </Card>}
        {(taskSourceType==='PRODUCTION_STAGE'||editingTask?.task_source_type==='PRODUCTION_STAGE')&&context?.production_stages?.length>0&&<Form.Item name="production_stage_instance_id" label="Công đoạn sản xuất" rules={[{required:true,message:'Chọn Công đoạn'}]}><Select showSearch optionFilterProp="label" disabled={Boolean(editingTask)} placeholder="Chọn Công đoạn thuộc Kế hoạch sản xuất" options={context.production_stages.map(stage=>({value:stage.id,label:`${stage.production_code} · ${stage.sequence_no}. ${stage.stage_name} — ${stage.group_name}`}))}/></Form.Item>}
        {editingTask?<Form.Item name="work_item_id" label="Công việc thực hiện" rules={!editingTask.work_item_id?[]:[{required:true,message:'Chọn Công việc'}]}><Select showSearch optionFilterProp="label" disabled={!context} loading={contextLoading} onOpenChange={open=>{if(open&&context?.project?.id)loadContext(context.project.id);}} options={workGroups.map(([label,items])=>({label,options:items.map(item=>({value:item.id,label:item.name}))}))} placeholder="Chọn Công việc phù hợp"/></Form.Item>:<Form.Item name="work_item_ids" label={taskSourceType==='ORDER_FULFILLMENT'?'Công việc thực thi':'Các Công việc thực hiện'} rules={[{required:true,type:'array',min:1,message:'Chọn ít nhất một Công việc'}]} extra={taskSourceType==='ORDER_FULFILLMENT'?'Chọn Giao hàng hoặc Lắp đặt. Hai loại được lập thành hai nhiệm vụ độc lập.':'Có thể chọn đồng thời Giám sát, Thiết kế hoặc nhiều Công việc khác; mỗi lựa chọn tạo một Công việc độc lập với cùng nhân viên và lịch đã đánh dấu.'}><Select mode="multiple" maxCount={taskSourceType==='ORDER_FULFILLMENT'?1:10} maxTagCount="responsive" showSearch optionFilterProp="label" disabled={!context} loading={contextLoading} onOpenChange={open=>{if(open&&context?.project?.id)loadContext(context.project.id);}} options={selectableWorkGroups.map(([label,items])=>({label,options:items.map(item=>({value:item.id,label:item.name}))}))} placeholder={context?.work_items?.length?'Chọn một hoặc nhiều Công việc':'Chưa cấu hình Công việc cho Loại dự án'}/></Form.Item>}
        {!editingTask&&taskSourceType==='ORDER_FULFILLMENT'&&<Card size="small" title="Hạng mục cần Giao hàng/Lắp đặt" style={{marginBottom:16}}>
          <Form.Item name="order_id" label="Đơn hàng" rules={[{required:true,message:'Chọn Đơn hàng'}]}>
            <Select showSearch optionFilterProp="label" placeholder="Chọn Đơn hàng có sản phẩm tồn hoặc đã sẵn sàng" options={(context?.orders||[]).map(order=>({value:order.id,label:`${order.order_code} · ${order.items?.length||0} hạng mục`}))} onChange={changeOrder}/>
          </Form.Item>
          {!context?.orders?.length&&<Alert type="warning" showIcon message="Dự án chưa có Đơn hàng" description="Hãy tạo Đơn hàng trước khi lập nhiệm vụ Giao hàng/Lắp đặt theo hạng mục."/>}
          {selectedOrder&&<Form.List name="fulfillment_items">{fields=><Space direction="vertical" style={{width:'100%'}} size={8}>
            {fields.map((field,index)=>{
              const item=selectedOrder.items?.[index];
              const allocated=Number(selectedExecutionType==='INSTALLATION'?item?.installation_allocated_quantity:item?.delivery_allocated_quantity)||0;
              const remaining=Math.max(0,Number(item?.quantity||0)-allocated);
              return <Card key={field.key} size="small">
                <Form.Item {...field} name={[field.name,'order_item_id']} hidden><Input/></Form.Item>
                <Row gutter={12} align="middle">
                  <Col span={14}><Form.Item {...field} name={[field.name,'selected']} valuePropName="checked" style={{margin:0}}><Checkbox disabled={!selectedExecutionType||remaining<=0}><strong>{item?.item_name}</strong> · {Number(item?.quantity||0).toLocaleString('vi-VN')} {item?.unit}<br/><Text type="secondary">Đã lập {allocated.toLocaleString('vi-VN')} · Còn {remaining.toLocaleString('vi-VN')} {item?.unit}</Text></Checkbox></Form.Item></Col>
                  <Col span={10}><Form.Item {...field} name={[field.name,'planned_quantity']} label="Số lượng thực thi" dependencies={[[field.name,'selected']]} rules={[{validator:(_,value)=>{
                    const selected=form.getFieldValue(['fulfillment_items',field.name,'selected']);
                    if(!selected)return Promise.resolve();
                    return Number(value)>0&&Number(value)<=remaining?Promise.resolve():Promise.reject(new Error(`Nhập từ 0 đến ${remaining}`));
                  }}]}><InputNumber min={0.001} max={remaining} precision={3} style={{width:'100%'}} addonAfter={item?.unit}/></Form.Item></Col>
                </Row>
              </Card>;
            })}
          </Space>}</Form.List>}
        </Card>}
        {editingTask&&!editingTask.work_item_id&&<><Alert type="warning" showIcon message="Task cũ chưa liên kết Danh mục công việc" style={{marginBottom:12}}/><Row gutter={16}><Col span={12}><Form.Item name="task_type" label="Nhóm cũ" rules={[{required:true}]}><Input/></Form.Item></Col><Col span={12}><Form.Item name="task_name" label="Tên công việc cũ" rules={[{required:true}]}><Input/></Form.Item></Col></Row></>}
        <Form.Item name="description" label="Mô tả"><Input.TextArea rows={2}/></Form.Item>
        <Row gutter={16}><Col span={8}><Form.Item name="priority" label="Ưu tiên"><Select options={['Thấp','Trung bình','Cao','Khẩn cấp'].map(value=>({value,label:value}))}/></Form.Item></Col><Col span={8}><Form.Item name="notify_before_days" label="Nhắc trước (ngày)"><Select options={[0,1,2,3,5,7].map(value=>({value,label:`${value} ngày`}))}/></Form.Item></Col></Row>
        {!editingTask&&<><Divider orientation="left">Nhân viên và lịch làm việc</Divider><Form.List name="assignments">{(fields,{add,remove})=><Space direction="vertical" style={{width:'100%'}} size={12}>{fields.map(field=>{
          const employeeId=form.getFieldValue(['assignments',field.name,'employee_id']);
          const employee=context?.employees?.find(item=>item.id===employeeId);
          return <Card size="small" key={field.key} title={`Phân công ${field.name+1}`} extra={<Button danger type="text" icon={<DeleteOutlined/>} onClick={()=>remove(field.name)}>Xóa</Button>}><Row gutter={12}><Col span={12}><Form.Item {...field} name={[field.name,'employee_id']} label="Nhân viên" rules={[{required:true,message:'Chọn nhân viên'}]}><Select showSearch optionFilterProp="label" options={employeeOptions} onChange={value=>changeEmployee(field.name,value)}/></Form.Item>{employee&&!employee.is_project_member&&<Tag color="gold" style={{marginBottom:12}}>Sẽ thêm vào dự án</Tag>}</Col><Col span={12}><Form.Item {...field} name={[field.name,'role_in_task']} label="Vai trò" rules={[{required:true,message:'Chọn vai trò'}]}><Select options={(context?.roles||[]).map(role=>({value:role.name,label:role.name}))}/></Form.Item></Col></Row><Form.Item {...field} name={[field.name,'work_dates']} label="Đánh dấu ngày làm việc" rules={[{validator:(_,value)=>Array.isArray(value)&&value.length?Promise.resolve():Promise.reject(new Error('Chọn ít nhất một ngày làm việc'))}]}><AssignmentWorkCalendar/></Form.Item></Card>})}<Button block type="dashed" icon={<PlusOutlined/>} onClick={()=>add({})}>Thêm nhân viên</Button></Space>}</Form.List></>}
        {editingTask&&<Alert type="info" showIcon message="Phân công nhân viên được quản lý trong trang Chi tiết Task để không làm mất lịch hiện có." style={{marginTop:12}}/>}
        <Form.Item name="notes" label="Ghi chú" style={{marginTop:16}}><Input.TextArea rows={2}/></Form.Item>
        <Space><Button type="primary" htmlType="submit" disabled={!editingTask&&!context?.work_items?.length}>{editingTask?'Cập nhật Công việc':'Tạo và phân công Công việc'}</Button><Button onClick={()=>setModalVisible(false)}>Hủy</Button></Space>
      </Form>
    </Modal>
  </div>;
}
