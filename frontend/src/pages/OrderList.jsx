import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Badge, Button, Card, Checkbox, Col, Collapse, DatePicker, Descriptions, Divider, Empty,
  Form, Input, InputNumber, Modal, Progress, Row, Select, Space, Statistic,
  Table, Tabs, Tag, Typography, message,
} from 'antd';
import { DeleteOutlined, EyeOutlined, PlusOutlined, ToolOutlined } from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { orderAPI, productionPlanAPI, productionWorkflowAPI } from '../services/api';
import AssignmentWorkCalendar from '../components/AssignmentWorkCalendar';

const { Text } = Typography;
const orderStatus = {
  NOT_STARTED: ['Chưa sản xuất', 'default'], IN_PRODUCTION: ['Đang sản xuất', 'processing'],
  COMPLETED: ['Hoàn thành', 'success'], CANCELLED: ['Đã hủy', 'error'],
};
const productionStatus = {
  PLANNED: ['Kế hoạch', 'default'], IN_PROGRESS: ['Đang sản xuất', 'processing'],
  READY_FOR_DELIVERY: ['Sẵn sàng giao', 'success'], COMPLETED: ['Hoàn tất', 'success'], CANCELLED: ['Đã hủy', 'error'],
};
const stageStatus = {
  PLANNED: ['Kế hoạch', 'default'], IN_PROGRESS: ['Đang thực hiện', 'processing'],
  COMPLETED: ['Hoàn thành', 'success'], BLOCKED: ['Bị chặn', 'error'], SKIPPED: ['Bỏ qua', 'default'],
};
const timeModes = [
  { value: 'PROJECT', label: 'Toàn thời gian Dự án' },
  { value: 'PHASE', label: 'Theo giai đoạn' },
  { value: 'CUSTOM', label: 'Tùy chỉnh từng công đoạn' },
];
const assignmentTimeModes = [
  { value: 'PROJECT', label: 'Toàn thời gian Dự án' },
  { value: 'PLAN', label: 'Theo thời gian Kế hoạch' },
  { value: 'CUSTOM', label: 'Ngày làm việc cụ thể' },
];
const money = value => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(value || 0));
const dateValue = value => value ? dayjs(value) : null;
const formatDate = value => value ? dayjs(value).format('DD/MM/YYYY') : '-';
const sectionHeaderStyle = status => {
  const backgrounds = {
    NOT_STARTED: '#ffffff', PLANNED: '#ffffff',
    IN_PRODUCTION: '#e6f4ff', IN_PROGRESS: '#e6f4ff',
    COMPLETED: '#f6ffed', READY_FOR_DELIVERY: '#f6ffed',
    CANCELLED: '#f5f5f5',
    PAUSED: '#fffbe6', BLOCKED: '#fffbe6',
  };
  return { background: backgrounds[status] || '#ffffff', borderRadius: 6 };
};

export default function OrderList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [orderForm] = Form.useForm();
  const [planForm] = Form.useForm();
  const [directOrderForm] = Form.useForm();
  const [outputForm] = Form.useForm();
  const [startForm] = Form.useForm();
  const [productionActionForm] = Form.useForm();
  const [stageForm] = Form.useForm();
  const [adjustmentForm] = Form.useForm();
  const [productionEditForm] = Form.useForm();
  const [meta, setMeta] = useState({ projects: [], units: [] });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [orderModal, setOrderModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);
  const [startModal, setStartModal] = useState(false);
  const [productionAction, setProductionAction] = useState(null);
  const [planModal, setPlanModal] = useState(false);
  const [directOrderModal, setDirectOrderModal] = useState(false);
  const [context, setContext] = useState(null);
  const [groupProcesses, setGroupProcesses] = useState({});
  const [planDetail, setPlanDetail] = useState(null);
  const [productionPlanTarget, setProductionPlanTarget] = useState(null);
  const [productionDetail, setProductionDetail] = useState(null);
  const [productionRows, setProductionRows] = useState([]);
  const [productionLoading, setProductionLoading] = useState(false);
  const [planRows, setPlanRows] = useState([]);
  const [planLoading, setPlanLoading] = useState(false);
  const [outputTarget, setOutputTarget] = useState(null);
  const [editingStage, setEditingStage] = useState(null);
  const [detailTab, setDetailTab] = useState('order');
  const [adjustment, setAdjustment] = useState(null);
  const [editingProduction, setEditingProduction] = useState(null);
  const [orderDetails, setOrderDetails] = useState({});
  const [planDetails, setPlanDetails] = useState({});
  const [expandedOrderKeys, setExpandedOrderKeys] = useState([]);
  const [expandedPlanKeys, setExpandedPlanKeys] = useState([]);
  const workspaceTab = ['orders', 'plans'].includes(searchParams.get('tab')) ? searchParams.get('tab') : 'orders';
  const projectFilter = searchParams.get('project_id') || '';
  const linkedOrderId = searchParams.get('order_id') || '';
  const linkedProductionId = searchParams.get('production_id') || '';
  const productionStatusFilter = searchParams.get('production_status') || '';
  const productionFromDate = searchParams.get('from_date') || '';
  const productionToDate = searchParams.get('to_date') || '';
  const productionSortBy = searchParams.get('sort_by') || 'start_date';
  const productionSortDir = searchParams.get('sort_dir') || 'asc';
  const startProjectId = Form.useWatch('project_id', startForm);
  const productionActionProjectId = Form.useWatch('project_id', productionActionForm);
  const planTimeMode = Form.useWatch('time_mode', planForm);

  const load = async () => {
    setLoading(true);
    try {
      const [metadata, list] = await Promise.all([
        orderAPI.getMeta(), orderAPI.getAll(projectFilter ? { project_id: projectFilter } : {}),
      ]);
      setMeta(metadata.data || {});
      setRows(list.data || []);
    } catch (error) { message.error(error.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [projectFilter]);
  const updateWorkspaceQuery = changes => {
    const next = new URLSearchParams(searchParams);
    Object.entries(changes).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') next.delete(key);
      else next.set(key, String(value));
    });
    setSearchParams(next);
  };
  const loadProductionOrders = async () => {
    setProductionLoading(true);
    try {
      const response = await productionWorkflowAPI.getOrders({
        project_id: projectFilter || undefined,
        order_id: linkedOrderId || undefined,
        status: productionStatusFilter || undefined,
        from_date: productionFromDate || undefined,
        to_date: productionToDate || undefined,
        sort_by: productionSortBy,
        sort_dir: productionSortDir,
      });
      setProductionRows(response.data || []);
    } catch (error) { message.error(error.message); }
    finally { setProductionLoading(false); }
  };
  useEffect(() => {
    if (workspaceTab === 'production') loadProductionOrders();
  }, [workspaceTab, projectFilter, linkedOrderId, productionStatusFilter, productionFromDate, productionToDate, productionSortBy, productionSortDir]);
  useEffect(() => {
    if (!['plans', 'production'].includes(workspaceTab)) return;
    setPlanLoading(true);
    productionPlanAPI.getAll({ project_id: projectFilter || undefined, order_id: linkedOrderId || undefined })
      .then(response => setPlanRows(response.data || []))
      .catch(error => message.error(error.message))
      .finally(() => setPlanLoading(false));
  }, [workspaceTab, projectFilter, linkedOrderId]);
  useEffect(() => {
    if (workspaceTab !== 'production') { setProductionDetail(null); return; }
    if (!linkedProductionId) { setProductionDetail(null); return; }
    productionWorkflowAPI.getOrder(linkedProductionId).then(response => setProductionDetail(response.data)).catch(error => message.error(error.message));
  }, [workspaceTab, linkedProductionId]);

  const openNew = () => {
    setEditing(null);
    orderForm.resetFields();
    orderForm.setFieldsValue({ project_id: projectFilter ? Number(projectFilter) : undefined, order_date: dayjs(), items: [{ unit: 'Cái', quantity: 1, unit_price: 0 }] });
    setOrderModal(true);
  };
  const openEdit = async row => {
    try {
      const response = await orderAPI.getById(row.id);
      setEditing(response.data);
      orderForm.setFieldsValue({ ...response.data, order_date: dateValue(response.data.order_date), expected_delivery_date: dateValue(response.data.expected_delivery_date), items: response.data.items });
      setOrderModal(true);
    } catch (error) { message.error(error.message); }
  };
  const saveOrder = async values => {
    try {
      const payload = { ...values, order_date: values.order_date?.format('YYYY-MM-DD'), expected_delivery_date: values.expected_delivery_date?.format('YYYY-MM-DD') || null };
      const response = editing ? await orderAPI.update(editing.id, payload) : await orderAPI.create(payload);
      message.success(response.message); setOrderModal(false); await load();
    } catch (error) { message.error(error.message); }
  };
  const openDetail = async (id, tab = 'order') => {
    try { const response = await orderAPI.getById(id); setDetail(response.data); setDetailTab(tab); }
    catch (error) { message.error(error.message); }
  };
  const loadOrderDetail = async id => {
    if (orderDetails[id]) return orderDetails[id];
    try {
      const response = await orderAPI.getById(id);
      setOrderDetails(current => ({ ...current, [id]: response.data }));
      return response.data;
    } catch (error) { message.error(error.message); return null; }
  };
  const loadPlanDetail = async id => {
    if (planDetails[id]) return planDetails[id];
    try {
      const response = await productionPlanAPI.getById(id);
      setPlanDetails(current => ({ ...current, [id]: response.data }));
      if (response.data?.order_id) await loadOrderDetail(response.data.order_id);
      return response.data;
    } catch (error) { message.error(error.message); return null; }
  };
  useEffect(() => {
    if (workspaceTab !== 'orders' || !linkedOrderId) return;
    setExpandedOrderKeys([String(linkedOrderId)]);
    loadOrderDetail(linkedOrderId);
  }, [workspaceTab, linkedOrderId]);
  useEffect(() => {
    if (workspaceTab !== 'plans' || !linkedOrderId || !planRows.length) return;
    const matchingPlanKeys = planRows
      .filter(plan => Number(plan.order_id) === Number(linkedOrderId))
      .map(plan => String(plan.id));
    setExpandedPlanKeys(matchingPlanKeys);
    matchingPlanKeys.forEach(loadPlanDetail);
  }, [workspaceTab, linkedOrderId, planRows]);
  const openAddItem = () => {
    adjustmentForm.resetFields(); adjustmentForm.setFieldsValue({ unit: 'Cái', quantity: 1, unit_price: 0 });
    setAdjustment({ type: 'ADD' });
  };
  const openQuantityAdjustment = item => {
    adjustmentForm.resetFields(); adjustmentForm.setFieldsValue({ quantity: Number(item.quantity) });
    setAdjustment({ type: 'QUANTITY', item });
  };
  const saveAdjustment = async values => {
    try {
      const response = adjustment.type === 'ADD'
        ? await orderAPI.addItem(detail.id, values)
        : await orderAPI.updateItemQuantity(detail.id, adjustment.item.id, values);
      message.success(response.message); setAdjustment(null); setDetail(response.data); await load();
    } catch (error) { message.error(error.message); }
  };
  const openProductionEdit = production => {
    productionEditForm.resetFields();
    productionEditForm.setFieldsValue({
      group_name: production.group_name,
      items: (production.items || []).map(item => ({ ...item, planned_quantity: Number(item.planned_quantity) })),
    });
    setEditingProduction(production);
  };
  const saveProductionEdit = async values => {
    try {
      const response=await productionPlanAPI.updateGroup(editingProduction.id,values);
      message.success(response.message);setEditingProduction(null);
      if(Number(linkedProductionId)===Number(editingProduction.id))await showProduction(editingProduction.id);
      await Promise.all([load(),loadProductionOrders()]);
    }catch(error){message.error(error.message);}
  };
  const cancelOrder = row => Modal.confirm({
    title: `Hủy đơn hàng ${row.order_code}?`,
    content: 'Toàn bộ Kế hoạch, Công đoạn và Công việc thuộc đơn hàng sẽ bị hủy. Đơn hàng vẫn được giữ lại để tra cứu lịch sử.',
    okText: 'Hủy đơn hàng', cancelText: 'Không', okButtonProps: { danger: true },
    onOk: async () => {
      try {
        const response = await orderAPI.cancel(row.id, 'Hủy Đơn hàng từ màn hình Đơn hàng');
        message.success(response.message); setDetail(null); setPlanDetail(null); setProductionDetail(null); setOrderDetails({}); setPlanDetails({}); await load();
      } catch (error) { message.error(error.message); throw error; }
    },
  });
  const deleteOrder = row => Modal.confirm({
    title: `Xóa vĩnh viễn đơn hàng ${row.order_code}?`,
    content: 'Đơn hàng, Kế hoạch sản xuất, Công đoạn và tất cả Công việc thuộc đơn này sẽ bị xóa. Thao tác này không thể hoàn tác.',
    okText: 'Xóa đơn hàng và Công việc', cancelText: 'Không', okButtonProps: { danger: true },
    onOk: async () => {
      try {
        const response = await orderAPI.delete(row.id);
        message.success(response.message); setDetail(null); setPlanDetail(null); setProductionDetail(null); setOrderDetails({}); setPlanDetails({}); await load();
      } catch (error) { message.error(error.message); throw error; }
    },
  });

  const blankGroup = orderItems => ({
    group_name: '', process_id: undefined,
    items: (orderItems || []).filter(item => Number(item.remaining_quantity) > 0).map(item => ({
      order_item_id: item.id, selected: false, planned_quantity: Number(item.remaining_quantity),
    })),
    stages: [],
  });
  const openStart = () => {
    startForm.resetFields();
    startForm.setFieldsValue({ project_id: projectFilter ? Number(projectFilter) : undefined });
    setStartModal(true);
  };
  const continueStart = async values => {
    const order = rows.find(row => Number(row.id) === Number(values.order_id));
    if (!order) return message.error('Không tìm thấy đơn hàng đã chọn');
    setStartModal(false); await openPlan(order);
  };
  const openProductionAction = type => {
    const linkedOrder = rows.find(row => Number(row.id) === Number(linkedOrderId));
    if (linkedOrder) {
      if (type === 'DIRECT') return openDirectOrder(linkedOrder);
      return openPlan(linkedOrder);
    }
    productionActionForm.resetFields();
    productionActionForm.setFieldsValue({ project_id: projectFilter ? Number(projectFilter) : undefined });
    setProductionAction(type);
  };
  const continueProductionAction = async values => {
    const order = rows.find(row => Number(row.id) === Number(values.order_id));
    if (!order) return message.error('Không tìm thấy đơn hàng đã chọn');
    const type = productionAction;
    setProductionAction(null);
    if (type === 'DIRECT') await openDirectOrder(order);
    else await openPlan(order);
  };
  const openPlan = async order => {
    if(order.has_remaining_quantity===false)return message.warning('Đơn hàng đã được lập Kế hoạch đủ toàn bộ số lượng');
    try {
      const response = await productionWorkflowAPI.getContext(order.id);
      const data = response.data;
      setContext(data); setGroupProcesses({}); setProductionPlanTarget({ id:data.order.production_workspace_id, plan_code:data.order.production_workspace_code }); planForm.resetFields();
      const projectHasDates = data.order.project_start_date && data.order.project_end_date;
      planForm.setFieldsValue({
        order_id: order.id,
        time_mode: projectHasDates ? 'PROJECT' : 'PHASE',
        planned_start_date: dateValue(order.order_date) || dayjs(),
        planned_end_date: dateValue(order.expected_delivery_date) || dateValue(data.order.project_end_date),
        global_assignments: [], groups: [blankGroup(data.order.items)],
      });
      setPlanModal(true);
    } catch (error) { message.error(error.message); }
  };
  const openProductionOrder = async plan => {
    try {
      const response = await productionWorkflowAPI.getContext(plan.order_id);
      const data = response.data;
      setContext(data); setGroupProcesses({});
      setProductionPlanTarget(plan);
      planForm.resetFields();
      planForm.setFieldsValue({ order_id: data.id, time_mode: 'PHASE', planned_start_date: dateValue(plan.planned_start_date), planned_end_date: dateValue(plan.planned_end_date), global_assignments: [], groups: [blankGroup(data.items)] });
      setPlanModal(true);
    } catch (error) { message.error(error.message); }
  };
  const selectedGroupItems = groupIndex => (planForm.getFieldValue(['groups', groupIndex, 'items']) || [])
    .filter(item => item?.selected && Number(item.planned_quantity) > 0)
    .map(item => ({ order_item_id: item.order_item_id, planned_quantity: Number(item.planned_quantity) }));
  const buildStages = (process, groupIndex) => {
    const items = selectedGroupItems(groupIndex);
    const existing = planForm.getFieldValue(['groups', groupIndex, 'stages']) || [];
    return (process.stages || []).map(stage => {
      const current = existing.find(value => Number(value.source_stage_id) === Number(stage.id));
      return { source_stage_id: stage.id, start_date: current?.start_date, end_date: current?.end_date };
    });
  };
  const changeGroupProcess = async (groupIndex, id) => {
    try {
      const response = await productionWorkflowAPI.getProcess(id);
      setGroupProcesses(current => ({ ...current, [groupIndex]: response.data }));
      planForm.setFieldValue(['groups', groupIndex, 'stages'], buildStages(response.data, groupIndex));
    } catch (error) { message.error(error.message); }
  };
  const selectAllGroup = (groupIndex, selected) => {
    const items = planForm.getFieldValue(['groups', groupIndex, 'items']) || [];
    planForm.setFieldValue(['groups', groupIndex, 'items'], items.map(item => ({ ...item, selected })));
  };
  const removeProductionGroup = (removeGroup, groupIndex) => {
    removeGroup(groupIndex);
    setGroupProcesses(current => Object.fromEntries(Object.entries(current).flatMap(([key, value]) => {
      const index = Number(key);
      if (index === groupIndex) return [];
      return [[index > groupIndex ? index - 1 : index, value]];
    })));
  };
  const serializeAssignments = assignments => (assignments || []).filter(row => row?.employee_id).map(row => ({
    ...row,
    start_date: row.start_date?.format?.('YYYY-MM-DD') || row.start_date || null,
    end_date: row.end_date?.format?.('YYYY-MM-DD') || row.end_date || null,
    work_dates: (row.work_dates || []).map(value => value?.format?.('YYYY-MM-DD') || value),
  }));
  const createPlan = async values => {
    setSavingPlan(true);
    try {
      const groups = (values.groups || []).map((group, index) => ({
        ...group,
        time_mode: values.time_mode,
        planned_start_date: group.planned_start_date?.format?.('YYYY-MM-DD') || null,
        planned_end_date: group.planned_end_date?.format?.('YYYY-MM-DD') || null,
        items: (group.items || []).filter(item => item?.selected && Number(item.planned_quantity) > 0).map(({ order_item_id, planned_quantity }) => ({ order_item_id, planned_quantity })),
        stages: (group.stages || []).map(stage => ({
          ...stage,
          start_date: stage.start_date?.format?.('YYYY-MM-DD') || null,
          end_date: stage.end_date?.format?.('YYYY-MM-DD') || null,
        })),
            group_name: group.group_name || `Lệnh sản xuất ${index + 1}`,
      }));
      if (groups.some(group => !group.items.length)) throw new Error('Lệnh sản xuất cần chọn ít nhất một hạng mục');
      const payload = {
        ...values, groups,
        planned_start_date: values.planned_start_date?.format('YYYY-MM-DD') || null,
        planned_end_date: values.planned_end_date?.format('YYYY-MM-DD') || null,
        global_assignments: serializeAssignments(values.global_assignments),
      };
      const response = productionPlanTarget
        ? await productionWorkflowAPI.createOrder({ order_id: context.order.id, production_plan_id: productionPlanTarget.id, process_id: groups[0].process_id, items: groups[0].items, stages: groups[0].stages, global_assignments: payload.global_assignments, planned_start_date: payload.planned_start_date, planned_end_date: payload.planned_end_date, notes: values.notes })
        : await productionPlanAPI.create(payload);
      const firstProduction=response.data?.groups?.[0];
      message.success(response.message);setPlanModal(false);setDetail(null);setProductionPlanTarget(null);setOrderDetails({});setPlanDetails({});await load();
      const firstStageId = firstProduction?.stages?.[0]?.id || response.data?.stages?.[0]?.id;
      if (firstStageId) window.location.assign(`/tasks?project_id=${context?.order?.project_id}&stage_id=${firstStageId}`);
      else updateWorkspaceQuery({tab:'plans',project_id:context?.order?.project_id,order_id:context?.order?.id});
    } catch (error) { message.error(error.message); }
    finally { setSavingPlan(false); }
  };
  const openDirectOrder = async order => {
    try {
      const response=await productionWorkflowAPI.getContext(order.id);
      setContext(response.data);
      directOrderForm.resetFields();
      directOrderForm.setFieldsValue({ order_id:order.id, name:'Lệnh sản xuất trực tiếp', planned_start_date:dayjs(), planned_end_date:dateValue(order.expected_delivery_date) });
      setDirectOrderModal(true);
    } catch (error) { message.error(error.message); }
  };
  const createDirectOrder = async values => {
    try {
      const response=await productionWorkflowAPI.createDirectOrder({
        ...values,
        planned_start_date:values.planned_start_date?.format('YYYY-MM-DD') || null,
        planned_end_date:values.planned_end_date?.format('YYYY-MM-DD') || null,
      });
      message.success(response.message);
      setDirectOrderModal(false);
      setOrderDetails({});setPlanDetails({});
      await load();
      window.location.assign(`/tasks?project_id=${response.data.project_id}&stage_id=${response.data.direct_stage_id}`);
    } catch (error) { message.error(error.message); }
  };
  const showPlan = async id => {
    try { const response = await productionPlanAPI.getById(id); setPlanDetail(response.data); }
    catch (error) { message.error(error.message); }
  };
  const showProduction = async id => {
    try {
      const response = await productionWorkflowAPI.getOrder(id);
      setProductionDetail(response.data);
      updateWorkspaceQuery({tab:'production',project_id:response.data.project_id,order_id:response.data.order_id,production_id:id});
    }
    catch (error) { message.error(error.message); }
  };
  const openProductionList = row => {
    setDetail(null);
    updateWorkspaceQuery({tab:'production',project_id:row.project_id,order_id:row.id,production_id:''});
  };
  const openStageEdit = stage => {
    setEditingStage(stage);
    stageForm.setFieldsValue({ stage_name: stage.stage_name, planned_start_date: dateValue(stage.planned_start_date), planned_end_date: dateValue(stage.planned_end_date) });
  };
  const saveStage = async values => {
    try {
      const response = await productionPlanAPI.updateStage(editingStage.id, { stage_name: values.stage_name, planned_start_date: values.planned_start_date?.format('YYYY-MM-DD'), planned_end_date: values.planned_end_date?.format('YYYY-MM-DD') });
      message.success(response.message); setEditingStage(null); await showPlan(planDetail.id);
    } catch (error) { message.error(error.message); }
  };
  const cancelGroup = group => Modal.confirm({
    title: `Hủy Lệnh sản xuất ${group.group_name}?`,
    content: 'Các Công việc thuộc Công đoạn sẽ được hủy và toàn bộ số lượng của Nhóm sẽ trả về Đơn hàng. Không xóa lịch sử sản lượng.',
    okText: 'Hủy Lệnh và trả số lượng', okButtonProps: { danger: true },
    onOk: async () => {
      const response=await productionPlanAPI.cancelGroup(group.id,'Hủy Nhóm sản xuất từ màn hình Đơn hàng');message.success(response.message);
      if(planDetail?.id)await showPlan(planDetail.id);
      if(Number(linkedProductionId)===Number(group.id)){setProductionDetail(null);updateWorkspaceQuery({production_id:''});}
      await Promise.all([load(),loadProductionOrders()]);
    },
  });
  const purgeCancelledGroup = group => Modal.confirm({
    title: `Dọn Lệnh đã hủy ${group.production_code}?`,
    content: 'Lệnh SX đã hủy sẽ được xóa khỏi danh sách vận hành. Snapshot và ghi chú vẫn nằm trong Lịch sử thực hiện đơn hàng.',
    okText: 'Dọn khỏi danh sách', okButtonProps: { danger: true },
    onOk: async () => {
      const response=await productionPlanAPI.purgeCancelledGroup(group.id,'Dọn Lệnh SX đã hủy khỏi danh sách vận hành');message.success(response.message);
      if(Number(linkedProductionId)===Number(group.id)){setProductionDetail(null);updateWorkspaceQuery({production_id:''});}
      if(planDetail?.id)await showPlan(planDetail.id);
      if(detail?.id)await openDetail(detail.id,'execution');
      await Promise.all([load(),loadProductionOrders()]);
    },
  });
  const cancelPlan = plan => Modal.confirm({
    title: `Hủy toàn bộ Kế hoạch ${plan.plan_code}?`,
    content: 'Tất cả Nhóm và Công việc bên trong sẽ được hủy; số lượng được trả về Đơn hàng để lập kế hoạch lại.',
    okText: 'Hủy toàn bộ Kế hoạch', okButtonProps: { danger: true },
    onOk: async () => { const response = await productionPlanAPI.cancel(plan.id, 'Hủy toàn bộ Kế hoạch từ màn hình Đơn hàng'); message.success(response.message); setPlanDetail(null); await load(); },
  });
  const purgeCancelledPlan = plan => Modal.confirm({
    title: `Dọn Kế hoạch đã hủy ${plan.plan_code}?`,
    content: 'Tất cả Lệnh SX đã hủy bên trong Kế hoạch sẽ được dọn khỏi danh sách vận hành. Lịch sử thực hiện và snapshot vẫn được giữ trong Đơn hàng.',
    okText: 'Dọn Kế hoạch đã hủy', okButtonProps: { danger: true },
    onOk: async () => {
      const response = await productionPlanAPI.purgeCancelledPlan(plan.id, 'Dọn Kế hoạch đã hủy khỏi danh sách vận hành');
      message.success(response.message);
      setPlanDetail(null);setProductionDetail(null);updateWorkspaceQuery({production_id:''});
      await Promise.all([load(),loadProductionOrders()]);
      if(response.data?.order_id)await openDetail(response.data.order_id,'execution');
    },
  });
  const completeProduction = async id => {
    try { const response = await productionWorkflowAPI.updateStatus(id, 'COMPLETED'); message.success(response.message); await showProduction(id); await Promise.all([load(),loadProductionOrders()]); }
    catch (error) { message.error(error.message); }
  };
  const recordOutput = async values => {
    try {
      const response = await productionWorkflowAPI.recordOutput(outputTarget.id, { ...values, output_date: values.output_date?.format('YYYY-MM-DD') });
      message.success(response.message);setOutputTarget(null);outputForm.resetFields();setProductionDetail(response.data);await Promise.all([load(),loadProductionOrders()]);
    } catch (error) { message.error(error.message); }
  };

  const employeeOptions = (context?.employees || []).map(item => ({ value: item.id, label: `${item.full_name} — ${item.project_role || item.position || item.department || ''}` }));
  const roleOptions = (context?.roles || []).map(item => ({ value: item.name, label: item.name }));
  const supervisorRole = (context?.roles || []).find(item => /giám sát|quản lý/i.test(item.name))?.name || (context?.roles || []).find(item => item.is_default)?.name || (context?.roles || [])[0]?.name;
  const stats = useMemo(() => ({ total: rows.length, notStarted: rows.filter(x => x.status === 'NOT_STARTED').length, production: rows.filter(x => x.status === 'IN_PRODUCTION').length, value: rows.reduce((sum, x) => sum + Number(x.total_amount || 0), 0) }), [rows]);
  const eligibleOrders = rows.filter(row => ['NOT_STARTED', 'IN_PRODUCTION'].includes(row.status) && row.has_remaining_quantity !== false);
  const directEligibleOrders = rows.filter(row => ['NOT_STARTED', 'IN_PRODUCTION'].includes(row.status));
  const startOrders = eligibleOrders.filter(row => !startProjectId || Number(row.project_id) === Number(startProjectId));
  const actionOrders = (productionAction === 'DIRECT' ? directEligibleOrders : eligibleOrders)
    .filter(row => !productionActionProjectId || Number(row.project_id) === Number(productionActionProjectId));
  const actionProjectIds = new Set((productionAction === 'DIRECT' ? directEligibleOrders : eligibleOrders).map(row => Number(row.project_id)));
  const canCreatePlan = linkedOrderId ? eligibleOrders.some(row => Number(row.id) === Number(linkedOrderId)) : eligibleOrders.length > 0;
  const eligibleProjectIds = new Set(eligibleOrders.map(row => Number(row.project_id)));
  const columns = [
    { title: 'Đơn hàng', key: 'order', render: (_, row) => <Space direction="vertical" size={0}><a onClick={() => openDetail(row.id)}><strong>{row.order_code}</strong></a><Text type="secondary">{formatDate(row.order_date)}</Text></Space> },
    { title: 'Dự án / Khách hàng', key: 'project', render: (_, row) => <Space direction="vertical" size={0}><Text strong>{row.project_name}</Text><Text type="secondary">{row.company_name || '-'}</Text></Space> },
    { title: 'Hạng mục', dataIndex: 'item_count', width: 100 },
    { title: 'Giá trị', dataIndex: 'total_amount', align: 'right', render: money },
    { title: 'Lệnh SX', dataIndex: 'production_order_count', width: 90, render: value => <Badge count={value} showZero color="#1677ff" /> },
    { title: 'Giao/Lắp', dataIndex: 'fulfillment_task_count', width: 90, render: value => <Badge count={value} showZero color="#13c2c2" /> },
    { title: 'Trạng thái', dataIndex: 'status', render: value => <Tag color={orderStatus[value]?.[1]}>{orderStatus[value]?.[0] || value}</Tag> },
    { title: 'Thao tác', width: 380, render: (_, row) => <Space wrap><Button icon={<EyeOutlined />} onClick={() => openDetail(row.id, 'production-plan')}>Mở</Button><Button onClick={() => openProductionList(row)}>Danh sách Lệnh</Button>{row.status !== 'CANCELLED' && <Button danger onClick={() => cancelOrder(row)}>Hủy</Button>}<Button danger icon={<DeleteOutlined />} onClick={() => deleteOrder(row)}>Xóa</Button></Space> },
  ];
  const productionColumns = [
    {title:'Mã lệnh',key:'production',width:150,render:(_,row)=><a href={`/tasks?project_id=${row.project_id}&stage_id=${row.primary_stage_id}`}><strong>{row.production_code}</strong></a>},
    {title:'Loại',dataIndex:'order_type',width:150,render:value=><Tag color={value==='DIRECT'?'purple':'blue'}>{value==='DIRECT'?'Trực tiếp':'Theo quy trình'}</Tag>},
    {title:'Ngày tạo',dataIndex:'created_at',width:120,render:formatDate},
    {title:'Hạn hoàn thành',dataIndex:'planned_end_date',width:140,render:formatDate},
    {title:'Trạng thái',dataIndex:'status',width:145,render:value=><Tag color={productionStatus[value]?.[1]}>{productionStatus[value]?.[0]||value}</Tag>},
    {title:'Nhân viên đang thực hiện',dataIndex:'active_employees',render:value=>(value||[]).length?(value||[]).join(', '):<Text type="secondary">Chưa giao nhiệm vụ</Text>},
    {title:'Tiến độ',dataIndex:'progress',width:140,render:value=><Progress percent={Math.round(Number(value||0))} size="small"/>},
    {title:'',width:110,fixed:'right',render:(_,row)=><Button size="small" href={`/tasks?project_id=${row.project_id}&stage_id=${row.primary_stage_id}`}>Nhiệm vụ</Button>},
  ];
  const planColumns = [
    { title: 'Kế hoạch sản xuất', key: 'plan', render: (_, row) => <Space direction="vertical" size={0}><a onClick={() => showPlan(row.id)}><strong>{row.plan_code}</strong></a><Text type="secondary">{formatDate(row.planned_start_date)} – {formatDate(row.planned_end_date)}</Text></Space> },
    { title: 'Dự án / Đơn hàng', key: 'source', render: (_, row) => <Space direction="vertical" size={0}><Text strong>{row.project_name}</Text><Text type="secondary">{row.project_code} · {row.order_code}</Text></Space> },
    { title: 'Số Lệnh sản xuất', dataIndex: 'group_count', width: 150, render: value => <Badge count={value} showZero color="#1677ff" /> },
    { title: 'Trạng thái', dataIndex: 'status', width: 150, render: value => <Tag color={productionStatus[value]?.[1]}>{productionStatus[value]?.[0] || value}</Tag> },
    { title: 'Thao tác', width: 240, render: (_, row) => <Space wrap><Button size="small" type="primary" onClick={() => showPlan(row.id)}>Mở Kế hoạch</Button>{row.status === 'CANCELLED' && <Button size="small" danger onClick={() => purgeCancelledPlan(row)}>Dọn Kế hoạch</Button>}</Space> },
  ];
  const executionColumns = [
    {title:'Thời gian',dataIndex:'event_at',width:160,render:value=>value?dayjs(value).format('DD/MM/YYYY HH:mm'):'-'},
    {title:'Sự kiện',dataIndex:'event_summary',render:value=><Text strong>{value}</Text>},
    {title:'Hệ thống',dataIndex:'system_note',render:value=>value||'-'},
    {title:'Người thực hiện',dataIndex:'performed_by_name',width:160,render:value=>value||'Hệ thống'},
  ];

  const orderWorkspace = <>
    <Row gutter={16} style={{ marginBottom: 18 }}>
      <Col xs={12} md={6}><Card><Statistic title="Tổng đơn" value={stats.total} /></Card></Col>
      <Col xs={12} md={6}><Card><Statistic title="Chưa sản xuất" value={stats.notStarted} /></Card></Col>
      <Col xs={12} md={6}><Card><Statistic title="Đang sản xuất" value={stats.production} /></Card></Col>
      <Col xs={12} md={6}><Card><Statistic title="Tổng giá trị" value={stats.value} formatter={money} /></Card></Col>
    </Row>
    <Collapse
      bordered={false}
      activeKey={expandedOrderKeys}
      onChange={keys => {
        const nextKeys = Array.isArray(keys) ? keys : [keys];
        setExpandedOrderKeys(nextKeys);
        nextKeys.forEach(loadOrderDetail);
      }}
      items={rows.map(order => {
        const orderDetail = orderDetails[order.id];
        return {
          key: String(order.id),
          label: <Space wrap><strong>{order.order_code}</strong><Text type="secondary">{order.project_name} · {order.company_name || 'Chưa có khách hàng'}</Text><Tag color={orderStatus[order.status]?.[1]}>{orderStatus[order.status]?.[0] || order.status}</Tag></Space>,
          extra: <Space onClick={event => event.stopPropagation()}><Text type="secondary">{money(order.total_amount)}</Text></Space>,
          styles: { header: sectionHeaderStyle(order.status) },
          children: orderDetail ? <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Descriptions bordered size="small" column={{ xs: 1, md: 3 }}>
              <Descriptions.Item label="Dự án">{orderDetail.project_name}</Descriptions.Item><Descriptions.Item label="Khách hàng">{orderDetail.company_name || '-'}</Descriptions.Item><Descriptions.Item label="Trạng thái"><Tag color={orderStatus[orderDetail.status]?.[1]}>{orderStatus[orderDetail.status]?.[0] || orderDetail.status}</Tag></Descriptions.Item>
              <Descriptions.Item label="Ngày đơn">{formatDate(orderDetail.order_date)}</Descriptions.Item><Descriptions.Item label="Dự kiến giao">{formatDate(orderDetail.expected_delivery_date)}</Descriptions.Item><Descriptions.Item label="Tổng giá trị">{money(orderDetail.total_amount)}</Descriptions.Item>
            </Descriptions>
            <Table rowKey="id" size="small" pagination={false} dataSource={orderDetail.items || []} columns={[
              { title: 'Mã', dataIndex: 'item_code', width: 110 }, { title: 'Tên hạng mục', dataIndex: 'item_name' }, { title: 'ĐVT', dataIndex: 'unit', width: 90 },
              { title: 'Số lượng', dataIndex: 'quantity', align: 'right', width: 120 }, { title: 'Đơn giá', dataIndex: 'unit_price', align: 'right', render: money, width: 150 },
              { title: 'Thành tiền', align: 'right', width: 160, render: (_, item) => money(Number(item.quantity) * Number(item.unit_price)) },
            ]} />
            <Space wrap>
              <a onClick={() => updateWorkspaceQuery({ tab: 'plans', project_id: order.project_id, order_id: order.id, production_id: '' })}>Kế hoạch sản xuất</a>
              {order.status !== 'CANCELLED' && <Button danger onClick={() => cancelOrder(order)}>Hủy Đơn hàng</Button>}
              <Button danger icon={<DeleteOutlined />} onClick={() => deleteOrder(order)}>Xóa Đơn hàng</Button>
            </Space>
          </Space> : <Text type="secondary">Đang tải thông tin Đơn hàng…</Text>,
        };
      })}
    />
  </>;

  const planWorkspace = <Space direction="vertical" size={16} style={{ width: '100%' }}>
    <Alert showIcon type="info" message="Hồ Sơ Sản Xuất" description="Màn hình trung tâm theo dõi Kế hoạch, Lệnh sản xuất, nhiệm vụ và lịch sử thực hiện của từng Đơn hàng." />
    <Collapse
      bordered={false}
      activeKey={expandedPlanKeys}
      onChange={keys => {
        const nextKeys = Array.isArray(keys) ? keys : [keys];
        setExpandedPlanKeys(nextKeys);
        nextKeys.forEach(loadPlanDetail);
      }}
      items={planRows.map(plan => {
        const planDetail = planDetails[plan.id];
        const orderDetail = orderDetails[plan.order_id];
        const productionGroups = planDetail?.groups || [];
        return {
          key: String(plan.id),
          label: <Space wrap><strong>{plan.plan_code}</strong><Text type="secondary">{plan.project_name} · {plan.order_code}</Text><Tag color={productionStatus[plan.status]?.[1]}>{productionStatus[plan.status]?.[0] || plan.status}</Tag></Space>,
          extra: <Badge count={plan.group_count || productionGroups.length} showZero color="#1677ff" />,
          styles: { header: sectionHeaderStyle(plan.status) },
          children: planDetail ? <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Descriptions bordered size="small" column={{ xs: 1, md: 3 }}>
              <Descriptions.Item label="Dự án">{planDetail.project_name}</Descriptions.Item><Descriptions.Item label="Đơn hàng">{planDetail.order_code}</Descriptions.Item><Descriptions.Item label="Trạng thái"><Tag color={productionStatus[planDetail.status]?.[1]}>{productionStatus[planDetail.status]?.[0] || planDetail.status}</Tag></Descriptions.Item>
              <Descriptions.Item label="Cách lập lịch">{timeModes.find(value => value.value === planDetail.time_mode)?.label || planDetail.time_mode}</Descriptions.Item><Descriptions.Item label="Từ ngày">{formatDate(planDetail.planned_start_date)}</Descriptions.Item><Descriptions.Item label="Đến ngày">{formatDate(planDetail.planned_end_date)}</Descriptions.Item>
            </Descriptions>
            <Space wrap>
              <Button type="primary" onClick={() => openDirectOrder(orderDetail || { id: planDetail.order_id, expected_delivery_date: planDetail.planned_end_date })}>Tạo Lệnh sản xuất trực tiếp</Button>
              <Button onClick={() => openPlan(orderDetail || { id: planDetail.order_id })}>Tạo Lệnh sản xuất theo quy trình</Button>
            </Space>
            <Collapse size="small" items={[
              {
                key: 'production-orders', label: `Danh sách Lệnh sản xuất (${productionGroups.length})`,
                children: productionGroups.length ? <Collapse size="small" items={productionGroups.map(group => ({
                  key: String(group.id),
                  label: <Space wrap><strong>{group.production_code}</strong><Text>{group.group_name}</Text><Tag color={group.order_type === 'DIRECT' ? 'purple' : 'blue'}>{group.order_type === 'DIRECT' ? 'Trực tiếp' : 'Theo quy trình'}</Tag><Tag color={productionStatus[group.status]?.[1]}>{productionStatus[group.status]?.[0] || group.status}</Tag></Space>,
                  children: <Space direction="vertical" size={12} style={{ width: '100%' }}>
                    <Table rowKey="id" size="small" pagination={false} dataSource={group.items || []} columns={[{ title: 'Hạng mục', dataIndex: 'item_name' }, { title: 'Số lượng', render: (_, item) => `${Number(item.planned_quantity)} ${item.unit}` }]} />
                    <Table rowKey="id" size="small" pagination={false} dataSource={group.stages || []} columns={[
                      { title: 'Công đoạn', render: (_, stage) => <Space direction="vertical" size={0}><Text strong>{stage.sequence_no}. {stage.stage_name}</Text><Text type="secondary">{formatDate(stage.planned_start_date)} – {formatDate(stage.planned_end_date)}</Text></Space> },
                      { title: 'Công việc', render: (_, stage) => stage.works?.length ? <Space wrap>{stage.works.map(work => <a key={work.id} href={`/tasks/${work.id}`}>{work.task_name}</a>)}</Space> : <Text type="secondary">Chưa có nhiệm vụ</Text> },
                      { title: '', width: 160, render: (_, stage) => <Button size="small" type="primary" href={`/tasks?project_id=${planDetail.project_id}&stage_id=${stage.id}`}>Mở Nhiệm vụ</Button> },
                    ]} />
                  </Space>,
                }))} /> : <Empty description="Chưa có Lệnh sản xuất" />,
              },
              {
                key: 'order-history', label: `Lịch sử Đơn hàng (${orderDetail?.execution_logs?.length || 0})`,
                children: orderDetail?.execution_logs?.length ? <Table rowKey="id" size="small" pagination={{ pageSize: 8 }} dataSource={orderDetail.execution_logs} columns={executionColumns} /> : <Empty description="Chưa có lịch sử thực hiện" />,
              },
            ]} />
          </Space> : <Text type="secondary">Đang tải Hồ sơ Sản Xuất…</Text>,
        };
      })}
    />
  </Space>;

  const AssignmentFields = ({ field, global = false }) => <>
    <Row gutter={8}>
      <Col span={global ? 8 : 10}><Form.Item {...field} name={[field.name, 'employee_id']} rules={[{ required: true, message: 'Chọn nhân viên' }]}><Select showSearch optionFilterProp="label" placeholder="Nhân viên" options={employeeOptions} /></Form.Item></Col>
      <Col span={global ? 6 : 8}><Form.Item {...field} name={[field.name, 'role']} rules={[{ required: true, message: 'Chọn vai trò' }]}><Select placeholder="Vai trò" options={roleOptions} /></Form.Item></Col>
      {global && <Col span={10}><Form.Item {...field} name={[field.name, 'time_mode']} rules={[{ required: true }]}><Select options={assignmentTimeModes.filter(option => !(planTimeMode === 'CUSTOM' && option.value === 'PLAN'))} /></Form.Item></Col>}
    </Row>
    {global && <Form.Item noStyle shouldUpdate={(before, after) => before.global_assignments?.[field.name]?.time_mode !== after.global_assignments?.[field.name]?.time_mode}>{({ getFieldValue }) => getFieldValue(['global_assignments', field.name, 'time_mode']) === 'CUSTOM' ? <Form.Item {...field} name={[field.name, 'work_dates']} label="Ngày tham gia cụ thể"><AssignmentWorkCalendar /></Form.Item> : null}</Form.Item>}
  </>;

  return <div>
    <div className="page-header">
      <div><h1 style={{ marginBottom: 4 }}>Đơn hàng &amp; Sản xuất</h1><Text type="secondary">2.6.0-K — Thực hiện Đơn hàng bằng Lệnh sản xuất trực tiếp hoặc theo Quy trình</Text></div>
      <Space><Button type="primary" icon={<PlusOutlined />} onClick={openNew}>Tạo đơn hàng</Button></Space>
    </div>
    <Tabs size="large" activeKey={workspaceTab} onChange={key=>updateWorkspaceQuery({tab:key,order_id:'',production_id:''})} items={[
      {key:'orders',label:`Đơn hàng (${rows.length})`,children:orderWorkspace},
      {key:'plans',label:<Space>Hồ Sơ Sản Xuất<Badge count={planRows.length} showZero color="#722ed1"/></Space>,children:planWorkspace},
    ]}/>

    <Modal title={editing ? 'Sửa đơn hàng chưa sản xuất' : 'Tạo đơn hàng'} open={orderModal} onCancel={() => setOrderModal(false)} footer={null} width={1000} destroyOnClose>
      <Form form={orderForm} layout="vertical" onFinish={saveOrder}>
        <Row gutter={16}>
          <Col span={10}><Form.Item name="project_id" label="Dự án" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={(meta.projects || []).map(p => ({ value: p.id, label: `${p.project_code} — ${p.project_name}` }))} /></Form.Item></Col>
          <Col span={7}><Form.Item name="order_date" label="Ngày đơn hàng" rules={[{ required: true }]}><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item></Col>
          <Col span={7}><Form.Item name="expected_delivery_date" label="Ngày dự kiến giao"><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item></Col>
        </Row>
        <Divider orientation="left">Hạng mục đơn hàng</Divider>
        <Form.List name="items">{(fields, { add, remove: removeItem }) => <Space direction="vertical" style={{ width: '100%' }}>{fields.map(field => <Card size="small" key={field.key}><Row gutter={8}>
          <Col span={3}><Form.Item {...field} name={[field.name, 'item_code']} label="Mã"><Input /></Form.Item></Col>
          <Col span={7}><Form.Item {...field} name={[field.name, 'item_name']} label="Tên hạng mục" rules={[{ required: true }]}><Input /></Form.Item></Col>
          <Col span={4}><Form.Item {...field} name={[field.name, 'unit']} label="Đơn vị" rules={[{ required: true }]}><Select showSearch options={(meta.units || []).map(value => ({ value, label: value }))} /></Form.Item></Col>
          <Col span={4}><Form.Item {...field} name={[field.name, 'quantity']} label="Số lượng" rules={[{ required: true }]}><InputNumber min={0.001} style={{ width: '100%' }} /></Form.Item></Col>
          <Col span={5}><Form.Item {...field} name={[field.name, 'unit_price']} label="Đơn giá"><InputNumber min={0} step={1000} style={{ width: '100%' }} /></Form.Item></Col>
          <Col span={1}><Button danger type="text" icon={<DeleteOutlined />} style={{ marginTop: 30 }} onClick={() => removeItem(field.name)} /></Col>
        </Row></Card>)}<Button block type="dashed" icon={<PlusOutlined />} onClick={() => add({ unit: 'Cái', quantity: 1, unit_price: 0 })}>Thêm hạng mục</Button></Space>}</Form.List>
        <Form.Item name="notes" label="Ghi chú" style={{ marginTop: 12 }}><Input.TextArea rows={2} /></Form.Item><Button type="primary" htmlType="submit">Lưu đơn hàng</Button>
      </Form>
    </Modal>

    <Modal title={detail?.order_code || 'Chi tiết đơn hàng'} open={!!detail} onCancel={() => setDetail(null)} footer={null} width={1250}>
      {detail && <>
        <Descriptions bordered size="small" column={3}>
          <Descriptions.Item label="Dự án">{detail.project_name}</Descriptions.Item><Descriptions.Item label="Khách hàng">{detail.company_name || '-'}</Descriptions.Item><Descriptions.Item label="Trạng thái"><Tag color={orderStatus[detail.status]?.[1]}>{orderStatus[detail.status]?.[0]}</Tag></Descriptions.Item>
          <Descriptions.Item label="Ngày đơn">{formatDate(detail.order_date)}</Descriptions.Item><Descriptions.Item label="Dự kiến giao">{formatDate(detail.expected_delivery_date)}</Descriptions.Item><Descriptions.Item label="Tổng giá trị">{money(detail.total_amount)}</Descriptions.Item>
        </Descriptions>
        <Tabs activeKey={detailTab} onChange={setDetailTab} style={{marginTop:16}} items={[
          {key:'order',label:'Thông tin Đơn hàng',children:<>
            <Alert showIcon type="info" message="Đơn hàng gốc" description="Hạng mục và số lượng thương mại được giữ nguyên làm dữ liệu chuẩn. Mọi điều chỉnh đều được ghi Nhật ký." style={{marginBottom:12}}/>
            <Table rowKey="id" pagination={false} dataSource={detail.items} columns={[
              {title:'Mã',dataIndex:'item_code',width:110},{title:'Tên hạng mục',dataIndex:'item_name'},
              {title:'ĐVT',dataIndex:'unit',width:90},{title:'Số lượng gốc',dataIndex:'quantity',align:'right',width:130},
              {title:'Giao hàng',width:150,render:(_,row)=><Text>{Number(row.delivery_completed_quantity||0)}/{Number(row.delivery_planned_quantity||0)} {row.unit}</Text>},
              {title:'Lắp đặt',width:150,render:(_,row)=><Text>{Number(row.installation_completed_quantity||0)}/{Number(row.installation_planned_quantity||0)} {row.unit}</Text>},
              {title:'Đơn giá',dataIndex:'unit_price',align:'right',render:money,width:150},
              {title:'Thành tiền',align:'right',render:(_,row)=>money(Number(row.quantity)*Number(row.unit_price)),width:160},
              {title:'',width:130,render:(_,row)=><Button size="small" disabled={['COMPLETED','CANCELLED'].includes(detail.status)} onClick={()=>openQuantityAdjustment(row)}>Điều chỉnh SL</Button>},
            ]}/>
            {!['COMPLETED','CANCELLED'].includes(detail.status)&&<Button type="dashed" icon={<PlusOutlined/>} style={{marginTop:12}} onClick={openAddItem}>Thêm hạng mục</Button>}
          </>},
          {key:'production-plan',label:`Kế hoạch sản xuất (${detail.production_orders?.length||0})`,children:<>
            <Alert showIcon type="info" message="Không gian thực hiện Đơn hàng" description={`Kế hoạch ${detail.production_workspace?.plan_code||'tự động'} được hệ thống lưu làm nhật ký/tổng hợp. Không cần tạo Kế hoạch thủ công.`} style={{marginBottom:12}}/>
            <Descriptions bordered size="small" column={3} style={{marginBottom:12}}><Descriptions.Item label="Dự án">{detail.project_name}</Descriptions.Item><Descriptions.Item label="Đơn hàng">{detail.order_code}</Descriptions.Item><Descriptions.Item label="Hạn giao">{formatDate(detail.expected_delivery_date)}</Descriptions.Item></Descriptions>
            <Space wrap style={{marginBottom:12}}><Button type="primary" onClick={()=>openDirectOrder(detail)}>Tạo Lệnh sản xuất trực tiếp</Button><Button onClick={()=>openPlan(detail)}>Tạo Lệnh sản xuất theo quy trình</Button></Space>
            <Table rowKey="id" size="small" pagination={false} dataSource={detail.production_orders||[]} columns={productionColumns}/>
            <Divider orientation="left">Hoạt động sản xuất</Divider>
            {detail.execution_logs?.length?<Table rowKey="id" size="small" pagination={{pageSize:6}} dataSource={detail.execution_logs} columns={executionColumns}/>:<Empty description="Chưa có hoạt động sản xuất"/>}
          </>},
          {key:'history',label:`Lịch sử thay đổi (${detail.change_logs?.length||0})`,children:detail.change_logs?.length?<Table rowKey="id" size="small" pagination={false} dataSource={detail.change_logs} columns={[
            {title:'Thời gian',dataIndex:'created_at',render:value=>value?dayjs(value).format('HH:mm DD/MM/YYYY'):'-',width:165},
            {title:'Loại thay đổi',dataIndex:'change_type',render:value=>({ADD_ITEM:'Thêm hạng mục',QUANTITY_CHANGE:'Điều chỉnh số lượng',PRODUCTION_ORDER_CHANGE:'Điều chỉnh Lệnh SX'}[value]||value),width:180},
            {title:'Hạng mục',dataIndex:'item_name',render:value=>value||'Lệnh sản xuất'},
            {title:'Lý do',dataIndex:'reason'},
            {title:'Người thực hiện',dataIndex:'changed_by_name',render:value=>value||'Hệ thống',width:160},
          ]}/>:<Empty description="Chưa có thay đổi sau khi tạo Đơn hàng"/>},
          {key:'execution',label:`Lịch sử thực hiện (${detail.execution_logs?.length||0})`,children:detail.execution_logs?.length?<Table rowKey="id" size="small" pagination={{pageSize:8}} dataSource={detail.execution_logs} columns={executionColumns}/>:<Empty description="Chưa có lịch sử sản xuất, giao/lắp hoặc dọn Lệnh SX"/>},
        ]}/>
        <Space wrap style={{marginTop:16}}><Button type="primary" onClick={()=>openProductionList(detail)}>Danh sách Lệnh sản xuất</Button>{detail.status!=='CANCELLED'&&<Button danger onClick={()=>cancelOrder(detail)}>Hủy đơn hàng</Button>}<Button danger icon={<DeleteOutlined/>} onClick={()=>deleteOrder(detail)}>Xóa đơn hàng và Công việc</Button></Space>
      </>}
    </Modal>

    <Modal title={adjustment?.type==='ADD'?'Thêm hạng mục Đơn hàng':`Điều chỉnh số lượng — ${adjustment?.item?.item_name||''}`} open={!!adjustment} onCancel={()=>setAdjustment(null)} footer={null} destroyOnClose>
      <Form form={adjustmentForm} layout="vertical" onFinish={saveAdjustment}>
        {adjustment?.type==='ADD'&&<><Row gutter={12}><Col span={8}><Form.Item name="item_code" label="Mã hạng mục"><Input/></Form.Item></Col><Col span={16}><Form.Item name="item_name" label="Tên hạng mục" rules={[{required:true}]}><Input/></Form.Item></Col></Row><Row gutter={12}><Col span={8}><Form.Item name="unit" label="Đơn vị" rules={[{required:true}]}><Select showSearch options={(meta.units||[]).map(value=>({value,label:value}))}/></Form.Item></Col><Col span={8}><Form.Item name="quantity" label="Số lượng" rules={[{required:true}]}><InputNumber min={0.001} style={{width:'100%'}}/></Form.Item></Col><Col span={8}><Form.Item name="unit_price" label="Đơn giá"><InputNumber min={0} style={{width:'100%'}}/></Form.Item></Col></Row></>}
        {adjustment?.type==='QUANTITY'&&<><Alert showIcon type="warning" message={`Đã cấp Lệnh SX: ${Number(adjustment.item.allocated_quantity)} ${adjustment.item.unit}`} description="Muốn giảm thấp hơn số lượng này, phải sửa hoặc hủy Lệnh SX chưa hoàn thành trước." style={{marginBottom:12}}/><Form.Item name="quantity" label="Số lượng mới" rules={[{required:true}]}><InputNumber min={0.001} style={{width:'100%'}}/></Form.Item></>}
        <Form.Item name="reason" label="Lý do điều chỉnh" rules={[{required:true,min:3,message:'Nhập lý do để ghi Nhật ký'}]}><Input.TextArea rows={3}/></Form.Item>
        <Button type="primary" htmlType="submit">Lưu và ghi Nhật ký</Button>
      </Form>
    </Modal>

    <Modal title={`Sửa Lệnh SX ${editingProduction?.production_code||''}`} open={!!editingProduction} onCancel={()=>setEditingProduction(null)} footer={null} destroyOnClose width={760}>
      <Form form={productionEditForm} layout="vertical" onFinish={saveProductionEdit}>
        <Form.Item name="group_name" label="Tên Lệnh / Nhóm sản xuất" rules={[{required:true}]}><Input/></Form.Item>
        <Form.List name="items">{fields=><Space direction="vertical" style={{width:'100%'}}>{fields.map(field=>{const item=productionEditForm.getFieldValue(['items',field.name]);return <Card key={field.key} size="small"><Form.Item {...field} name={[field.name,'order_item_id']} hidden><Input/></Form.Item><Row gutter={12} align="middle"><Col span={14}><Text strong>{item?.item_name}</Text><br/><Text type="secondary">{item?.unit}</Text></Col><Col span={10}><Form.Item {...field} name={[field.name,'planned_quantity']} label="Số lượng Lệnh SX" rules={[{required:true}]} style={{marginBottom:0}}><InputNumber min={0.001} style={{width:'100%'}}/></Form.Item></Col></Row></Card>})}</Space>}</Form.List>
        <Alert showIcon type="info" message="Chỉ Lệnh chưa hoàn thành mới được sửa" description="Tổng số lượng của mọi Lệnh không được vượt Đơn hàng gốc và không thể giảm dưới sản lượng đã ghi." style={{marginTop:12,marginBottom:12}}/>
        <Form.Item name="reason" label="Lý do điều chỉnh" rules={[{required:true,min:3}]}><Input.TextArea rows={3}/></Form.Item>
        <Button type="primary" htmlType="submit">Cập nhật Lệnh SX</Button>
      </Form>
    </Modal>

    <Modal title={productionAction === 'DIRECT' ? 'Chọn Đơn hàng cho Lệnh sản xuất trực tiếp' : 'Chọn Đơn hàng cho Lệnh sản xuất theo quy trình'} open={!!productionAction} onCancel={() => setProductionAction(null)} footer={null} destroyOnClose>
      <Form form={productionActionForm} layout="vertical" onFinish={continueProductionAction}>
        <Form.Item name="project_id" label="Dự án" rules={[{ required: true, message: 'Chọn Dự án' }]}>
          <Select showSearch optionFilterProp="label" options={(meta.projects || []).filter(project => actionProjectIds.has(Number(project.id))).map(project => ({ value: project.id, label: `${project.project_code} — ${project.project_name}` }))} onChange={() => productionActionForm.setFieldValue('order_id', undefined)} />
        </Form.Item>
        <Form.Item name="order_id" label={productionAction === 'DIRECT' ? 'Đơn hàng' : 'Đơn hàng còn số lượng chưa sản xuất'} rules={[{ required: true, message: 'Chọn Đơn hàng' }]}>
          <Select showSearch optionFilterProp="label" disabled={!productionActionProjectId} placeholder={productionActionProjectId ? 'Chọn Đơn hàng' : 'Chọn Dự án trước'} options={actionOrders.map(order => ({ value: order.id, label: `${order.order_code} — ${orderStatus[order.status]?.[0]} · ${order.item_count} hạng mục` }))} />
        </Form.Item>
        <Button type="primary" htmlType="submit">Tiếp tục</Button>
      </Form>
    </Modal>

    <Modal title="Tạo Lệnh sản xuất trực tiếp" open={directOrderModal} onCancel={() => setDirectOrderModal(false)} footer={null} destroyOnClose>
      <Form form={directOrderForm} layout="vertical" onFinish={createDirectOrder}>
        <Form.Item name="order_id" hidden><Input/></Form.Item>
        <Alert showIcon type="info" message="Lệnh trực tiếp không dùng Quy trình mẫu" description="Sau khi tạo, mở trang Nhiệm vụ để tự thêm và giao các nhiệm vụ cho nhân viên." style={{marginBottom:12}}/>
        <Form.Item name="name" label="Tên Lệnh sản xuất" rules={[{required:true,message:'Nhập tên Lệnh sản xuất'}]}><Input placeholder="Ví dụ: Hoàn thiện và đóng gói"/></Form.Item>
        <Row gutter={12}><Col span={12}><Form.Item name="planned_start_date" label="Ngày bắt đầu"><DatePicker format="DD/MM/YYYY" style={{width:'100%'}}/></Form.Item></Col><Col span={12}><Form.Item name="planned_end_date" label="Hạn hoàn thành"><DatePicker format="DD/MM/YYYY" style={{width:'100%'}}/></Form.Item></Col></Row>
        <Form.Item name="notes" label="Ghi chú"><Input.TextArea rows={3}/></Form.Item>
        <Button type="primary" htmlType="submit">Tạo Lệnh sản xuất trực tiếp</Button>
      </Form>
    </Modal>

    <Modal title="Tạo Kế hoạch sản xuất" open={startModal} onCancel={() => setStartModal(false)} footer={null} width={640} destroyOnClose>
      <Form form={startForm} layout="vertical" onFinish={continueStart}>
        <Form.Item name="project_id" label="Dự án" rules={[{ required: true, message: 'Chọn Dự án' }]}><Select showSearch optionFilterProp="label" options={(meta.projects || []).filter(project=>eligibleProjectIds.has(Number(project.id))).map(project => ({ value: project.id, label: `${project.project_code} — ${project.project_name}` }))} onChange={() => startForm.setFieldValue('order_id', undefined)} /></Form.Item>
        <Form.Item name="order_id" label="Đơn hàng còn số lượng chưa sản xuất" rules={[{ required: true, message: 'Chọn Đơn hàng' }]}><Select showSearch optionFilterProp="label" disabled={!startProjectId} placeholder={startProjectId ? 'Chọn Đơn hàng' : 'Chọn Dự án trước'} options={startOrders.map(order => ({ value: order.id, label: `${order.order_code} — ${orderStatus[order.status]?.[0]} · ${order.item_count} hạng mục` }))} /></Form.Item>
        <Button type="primary" htmlType="submit">Tiếp tục</Button>
      </Form>
    </Modal>

    <Modal title={`Tạo Lệnh sản xuất theo quy trình${context?.order?.order_code ? ` — ${context.order.order_code}` : ''}`} open={planModal} onCancel={() => { setPlanModal(false); setProductionPlanTarget(null); }} footer={null} width={1180} destroyOnClose>
      <Form form={planForm} layout="vertical" onFinish={createPlan}>
        <Form.Item name="order_id" hidden><Input /></Form.Item>
        {context && <Descriptions bordered size="small" column={3} style={{marginBottom:8}}><Descriptions.Item label="Dự án">{context.order.project_name}</Descriptions.Item><Descriptions.Item label="Đơn hàng">{context.order.order_code}</Descriptions.Item><Descriptions.Item label="Khách hàng">{context.order.company_name||'-'}</Descriptions.Item></Descriptions>}
        <Divider orientation="left">1. Phạm vi thời gian</Divider>
        <Row gutter={12} align="middle">
          <Col span={10}><Form.Item name="time_mode" label="Cách lập lịch" rules={[{ required: true }]}><Select options={timeModes} /></Form.Item></Col>
          {planTimeMode === 'PROJECT' && <Col span={14}><Text strong>Theo Dự án: {formatDate(context?.order?.project_start_date)} – {formatDate(context?.order?.project_end_date)}</Text></Col>}
          {planTimeMode === 'PHASE' && <><Col span={7}><Form.Item name="planned_start_date" label="Từ ngày" rules={[{ required: true }]}><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item></Col><Col span={7}><Form.Item name="planned_end_date" label="Đến ngày" rules={[{ required: true }]}><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item></Col></>}
          {planTimeMode === 'CUSTOM' && <Col span={14}><Text type="secondary">Chọn ngày riêng cho từng Công đoạn.</Text></Col>}
        </Row>

        <Divider orientation="left">Lệnh sản xuất — chọn hạng mục và Quy trình</Divider>
        <Form.List name="groups">{(groupFields, { add, remove: removeGroup }) => <Space direction="vertical" style={{ width: '100%' }} size="middle">
          {groupFields.map((groupField, groupIndex) => {
            const process = groupProcesses[groupIndex];
            return <Card key={groupField.key} title={`Lệnh sản xuất ${groupIndex + 1}`} extra={groupFields.length > 1 && <Button danger type="text" onClick={() => removeProductionGroup(removeGroup, groupIndex)}>Xóa Lệnh</Button>}>
              <Row gutter={12}>
                <Col span={9}><Form.Item {...groupField} name={[groupField.name, 'group_name']} label="Tên Lệnh SX"><Input placeholder={`Ví dụ: Kệ lớn — Đợt 1`} /></Form.Item></Col>
                <Col span={15}><Form.Item {...groupField} name={[groupField.name, 'process_id']} label="Quy trình sản xuất" rules={[{ required: true, message: 'Chọn Quy trình' }]}><Select placeholder="Chọn sau khi đã chọn hạng mục" options={(context?.processes || []).map(value => ({ value: value.id, label: `${value.name} — v${value.version} · ${value.stage_count} công đoạn` }))} onChange={id => changeGroupProcess(groupIndex, id)} /></Form.Item></Col>
              </Row>
              <Space style={{ marginBottom: 8 }}><Button size="small" onClick={() => selectAllGroup(groupIndex, true)}>Chọn tất cả</Button><Button size="small" onClick={() => selectAllGroup(groupIndex, false)}>Bỏ chọn tất cả</Button></Space>
              <Form.List name={[groupField.name, 'items']}>{itemFields => <Table rowKey="key" size="small" pagination={false} dataSource={itemFields} columns={[
                { title: 'Chọn', width: 70, render: (_, itemField) => <Form.Item {...itemField} name={[itemField.name, 'selected']} valuePropName="checked" style={{ margin: 0 }}><Checkbox /></Form.Item> },
                { title: 'Hạng mục', render: (_, itemField) => { const id = planForm.getFieldValue(['groups', groupIndex, 'items', itemField.name, 'order_item_id']); const item = context?.order?.items?.find(value => Number(value.id) === Number(id)); return <><Form.Item {...itemField} name={[itemField.name, 'order_item_id']} hidden><Input /></Form.Item><Text strong>{item?.item_name}</Text><br /><Text type="secondary">Còn {Number(item?.remaining_quantity || 0)} {item?.unit}</Text></>; } },
                { title: 'Số lượng Nhóm này', width: 230, render: (_, itemField) => <Form.Item {...itemField} name={[itemField.name, 'planned_quantity']} style={{ margin: 0 }}><InputNumber min={0.001} style={{ width: '100%' }} /></Form.Item> },
              ]} />}</Form.List>
              {process && <div style={{marginTop:10}}><Text strong>{process.name} · {process.stages?.length||0} Công đoạn: </Text><Space wrap size={[4,4]}>{(process.stages||[]).map((stage,index)=><Tag color="blue" key={stage.id}>{index+1}. {stage.name}</Tag>)}</Space></div>}
              <Form.List name={[groupField.name, 'stages']}>{stageFields => planTimeMode==='CUSTOM'?<Space direction="vertical" style={{width:'100%',marginTop:10}}>{stageFields.map((stageField,stageIndex)=>{const stage=process?.stages?.[stageIndex];return <Card key={stageField.key} size="small"><Form.Item {...stageField} name={[stageField.name,'source_stage_id']} hidden><Input/></Form.Item><Row gutter={12} align="middle"><Col span={8}><Text strong>{stageIndex+1}. {stage?.name||'Công đoạn'}</Text></Col><Col span={8}><Form.Item {...stageField} name={[stageField.name,'start_date']} label="Từ ngày" rules={[{required:true}]} style={{marginBottom:0}}><DatePicker format="DD/MM/YYYY" style={{width:'100%'}}/></Form.Item></Col><Col span={8}><Form.Item {...stageField} name={[stageField.name,'end_date']} label="Đến ngày" rules={[{required:true}]} style={{marginBottom:0}}><DatePicker format="DD/MM/YYYY" style={{width:'100%'}}/></Form.Item></Col></Row></Card>;})}</Space>:<>{stageFields.map(stageField=><Form.Item key={stageField.key} {...stageField} name={[stageField.name,'source_stage_id']} hidden><Input/></Form.Item>)}</>}</Form.List>
            </Card>;
          })}
          {!productionPlanTarget && <Button block type="dashed" icon={<PlusOutlined />} onClick={() => add(blankGroup(context?.order?.items))}>Thêm Lệnh sản xuất / Quy trình khác</Button>}
        </Space>}</Form.List>

        <Divider orientation="left">3. Giám sát / nhân sự tham gia {productionPlanTarget ? 'Lệnh sản xuất' : 'toàn Kế hoạch'}</Divider>
        <Text type="secondary">Phân công này áp dụng {productionPlanTarget ? 'cho Lệnh sản xuất này.' : 'một lần cho toàn Kế hoạch.'}</Text>
        <Form.List name="global_assignments">{(fields, { add, remove: removeAssignment }) => <>{fields.map(field => <Card key={field.key} size="small"><AssignmentFields field={field} global /><Button danger type="link" onClick={() => removeAssignment(field.name)}>Xóa</Button></Card>)}<Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ role: supervisorRole, time_mode: 'PROJECT' })}>Thêm Giám sát / nhân sự toàn Kế hoạch</Button></>}</Form.List>
        <Form.Item name="notes" label="Ghi chú" style={{ marginTop: 12 }}><Input.TextArea rows={2} /></Form.Item>
        <Button type="primary" htmlType="submit" loading={savingPlan}>Tạo Lệnh sản xuất theo quy trình</Button>
      </Form>
    </Modal>

    <Modal title={`Ghi sản lượng — ${outputTarget?.item_name || ''}`} open={!!outputTarget} onCancel={() => setOutputTarget(null)} footer={null}><Form form={outputForm} layout="vertical" onFinish={recordOutput}><Form.Item name="output_date" label="Ngày ghi nhận" rules={[{ required: true }]}><DatePicker format="DD/MM/YYYY" /></Form.Item><Row gutter={12}><Col span={8}><Form.Item name="good_quantity" label="Số lượng đạt" rules={[{ required: true }]}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col><Col span={8}><Form.Item name="defect_quantity" label="Số lượng lỗi"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col><Col span={8}><Form.Item name="rework_quantity" label="Làm lại"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col></Row><Form.Item name="notes" label="Ghi chú"><Input.TextArea rows={2} /></Form.Item><Button type="primary" htmlType="submit">Ghi nhận</Button></Form></Modal>
    <Modal title="Sửa Công đoạn" open={!!editingStage} onCancel={() => setEditingStage(null)} footer={null}><Form form={stageForm} layout="vertical" onFinish={saveStage}><Form.Item name="stage_name" label="Tên Công đoạn" rules={[{ required: true }]}><Input /></Form.Item><Row gutter={12}><Col span={12}><Form.Item name="planned_start_date" label="Từ ngày" rules={[{ required: true }]}><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item></Col><Col span={12}><Form.Item name="planned_end_date" label="Đến ngày" rules={[{ required: true }]}><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item></Col></Row><Alert type="info" showIcon message="Công việc và nhân sự được quản lý trong trang Nhiệm vụ." style={{ marginBottom: 12 }} /><Button type="primary" htmlType="submit">Lưu Công đoạn</Button></Form></Modal>
  </div>;
}
