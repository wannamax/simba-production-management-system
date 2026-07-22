import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Button, Card, Col, DatePicker, Descriptions, Form, Input, InputNumber, Modal,
  Popconfirm, Progress, Row, Select, Space, Statistic, Table, Tag, TimePicker, Typography, message,
} from 'antd';
import {
  CheckCircleOutlined, DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined,
  SendOutlined, SyncOutlined, UserDeleteOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { shopfloorWorkBoardAPI } from '../services/api';

const { Title, Text } = Typography;
const statusMap = {
  NOT_STARTED: ['Chưa bắt đầu', 'default'], READY: ['Sẵn sàng', 'blue'], IN_PROGRESS: ['Đang thực hiện', 'green'],
  WAITING_MATERIAL: ['Chờ vật tư', 'orange'], ISSUE: ['Có sự cố', 'red'], PAUSED: ['Tạm dừng', 'purple'],
  COMPLETED: ['Hoàn thành', 'cyan'], ABSENT: ['Nghỉ/Vắng', 'red'],
};
const priorityMap = { LOW: ['Thấp', 'default'], NORMAL: ['Bình thường', 'blue'], HIGH: ['Cao', 'orange'], URGENT: ['Khẩn', 'red'] };
const sourceMap = {
  TASK_ASSIGNMENT: ['Tự động từ Task', 'geekblue'], MANUAL: ['Việc phát sinh', 'gold'], ABSENCE: ['Nghỉ/Vắng', 'red'],
};
const boardStatusMap = {
  DRAFT: ['Đang lập', 'default'], PUBLISHED: ['Đã công bố', 'green'], LOCKED: ['Đã khóa', 'purple'], CLOSED: ['Đã chốt ngày', 'cyan'],
};
const timeValue = value => value ? dayjs(value, 'HH:mm:ss') : null;
const editableBoard = value => value && !['LOCKED', 'CLOSED'].includes(value.status);

export default function ShopfloorWorkBoard() {
  const [date, setDate] = useState(dayjs());
  const [boards, setBoards] = useState([]);
  const [board, setBoard] = useState(null);
  const [meta, setMeta] = useState({ projects: [], tasks: [], employees: [] });
  const [loading, setLoading] = useState(false);
  const [boardModal, setBoardModal] = useState(false);
  const [itemModal, setItemModal] = useState(false);
  const [closeModal, setCloseModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [entryMode, setEntryMode] = useState('MANUAL');
  const [boardForm] = Form.useForm();
  const [itemForm] = Form.useForm();
  const [closeForm] = Form.useForm();
  const selectedProjectId = Form.useWatch('project_id', itemForm);
  const selectedStatus = Form.useWatch('status', itemForm);

  const taskOptions = useMemo(
    () => meta.tasks.filter(task => !selectedProjectId || Number(task.project_id) === Number(selectedProjectId)),
    [meta.tasks, selectedProjectId],
  );

  const loadBoards = async selectedDate => {
    const activeDate = selectedDate || date;
    const response = await shopfloorWorkBoardAPI.getBoards({ date: activeDate.format('YYYY-MM-DD') });
    setBoards(response.data || []);
  };

  const openDate = async selectedDate => {
    setLoading(true);
    try {
      const response = await shopfloorWorkBoardAPI.openDay({ board_date: selectedDate.format('YYYY-MM-DD') });
      setBoard(response.data);
      await loadBoards(selectedDate);
    } catch (error) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadBoard = async id => {
    setLoading(true);
    try {
      const response = await shopfloorWorkBoardAPI.getBoard(id);
      setBoard(response.data);
    } catch (error) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    shopfloorWorkBoardAPI.getMeta().then(response => setMeta(response.data)).catch(error => message.error(error.message));
    openDate(dayjs());
  }, []);

  const createBoard = async values => {
    try {
      const payload = {
        ...values,
        board_date: values.board_date.format('YYYY-MM-DD'),
        shift_start: values.shift_start.format('HH:mm'),
        shift_end: values.shift_end.format('HH:mm'),
      };
      const response = await shopfloorWorkBoardAPI.createBoard(payload);
      message.success('Đã tạo ca và tự động lấy phân công từ Task');
      setBoardModal(false);
      setBoard(response.data);
      await loadBoards(values.board_date);
    } catch (error) { message.error(error.message); }
  };

  const openItem = (item, mode = 'MANUAL') => {
    setEditing(item || null);
    setEntryMode(item?.source_type || mode);
    itemForm.resetFields();
    if (item) {
      itemForm.setFieldsValue({
        ...item,
        start_time: timeValue(item.start_time),
        end_time: timeValue(item.end_time),
        employee_id: item.assignments.find(x => x.employee_id)?.employee_id,
        team_name: item.assignments.find(x => x.team_name)?.team_name,
      });
    } else if (mode === 'ABSENCE') {
      itemForm.setFieldsValue({ absence_type: 'Nghỉ phép', title: 'Nghỉ phép', status: 'ABSENT', priority: 'NORMAL', progress: 0 });
    } else {
      itemForm.setFieldsValue({ status: 'READY', priority: 'NORMAL', progress: 0 });
    }
    setItemModal(true);
  };

  const saveItem = async values => {
    try {
      const sourceType = editing?.source_type || entryMode;
      const employeeId = values.employee_id || editing?.assignments.find(item => item.employee_id)?.employee_id;
      const payload = {
        ...values,
        title: sourceType === 'ABSENCE' ? (values.absence_type || 'Nghỉ/Vắng') : values.title,
        source_type: sourceType,
        status: sourceType === 'ABSENCE' ? 'ABSENT' : values.status,
        start_time: values.start_time?.format('HH:mm') || null,
        end_time: values.end_time?.format('HH:mm') || null,
        employee_ids: employeeId ? [employeeId] : [],
      };
      if (editing) await shopfloorWorkBoardAPI.updateItem(editing.id, payload);
      else await shopfloorWorkBoardAPI.addItem(board.id, payload);
      message.success(sourceType === 'ABSENCE' ? 'Đã ghi nhận nghỉ/vắng' : 'Đã lưu chi tiết công việc trong ngày');
      setItemModal(false);
      await loadBoard(board.id);
      await loadBoards(date);
    } catch (error) { message.error(error.message); }
  };

  const syncTasks = async () => {
    setLoading(true);
    try {
      const response = await shopfloorWorkBoardAPI.syncTasks(board.id);
      setBoard(response.data);
      message.success(response.message);
      await loadBoards(date);
    } catch (error) { message.error(error.message); } finally { setLoading(false); }
  };

  const publish = async () => {
    try {
      await shopfloorWorkBoardAPI.publish(board.id);
      message.success('Đã công bố phiên bản mới lên màn hình xưởng');
      await loadBoard(board.id);
      await loadBoards(date);
    } catch (error) { message.error(error.message); }
  };

  const closeDay = async values => {
    try {
      const response = await shopfloorWorkBoardAPI.closeDay(board.id, values);
      message.success(response.message);
      setCloseModal(false);
      closeForm.resetFields();
      await loadBoard(board.id);
      await loadBoards(date);
    } catch (error) { message.error(error.message); }
  };

  const removeItem = async id => {
    try {
      await shopfloorWorkBoardAPI.deleteItem(id);
      await loadBoard(board.id);
      await loadBoards(date);
    } catch (error) { message.error(error.message); }
  };

  const updateAnnouncement = async () => {
    try {
      await shopfloorWorkBoardAPI.updateBoard(board.id, { announcement: board.announcement });
      message.success('Đã lưu thông báo');
    } catch (error) { message.error(error.message); }
  };

  const selectTask = taskId => {
    const task = meta.tasks.find(x => Number(x.id) === Number(taskId));
    if (task) itemForm.setFieldsValue({ project_id: task.project_id, title: task.task_name });
  };

  const columns = [
    { title: 'Thời gian', width: 112, render: (_, x) => `${(x.start_time || '--:--').slice(0, 5)}–${(x.end_time || '--:--').slice(0, 5)}` },
    { title: 'Nhân viên/Tổ', width: 175, render: (_, x) => x.assignments.map(a => a.full_name || a.team_name).join(', ') || '-' },
    { title: 'Nguồn', width: 130, render: (_, x) => <Tag color={sourceMap[x.source_type]?.[1]}>{sourceMap[x.source_type]?.[0]}</Tag> },
    { title: 'Dự án · Task', width: 210, render: (_, x) => x.project_code ? <><b>{x.project_code}</b><br/><Text type="secondary">{x.task_code || '-'}</Text></> : '-' },
    { title: 'Công việc trong ngày', dataIndex: 'title', width: 240, render: (value, x) => <><b>{value}</b>{x.source_task_name && x.source_task_name !== value && <><br/><Text type="secondary">Task gốc: {x.source_task_name}</Text></>}{x.absence_reason && <><br/><Text type="danger">{x.absence_reason}</Text></>}</> },
    { title: 'Khu vực/máy', dataIndex: 'work_area', width: 135 },
    { title: 'Ưu tiên', width: 100, render: (_, x) => <Tag color={priorityMap[x.priority]?.[1]}>{priorityMap[x.priority]?.[0]}</Tag> },
    { title: 'Tiến độ', width: 120, render: (_, x) => <Progress percent={x.progress} size="small" /> },
    { title: 'Trạng thái', width: 135, render: (_, x) => <Tag color={statusMap[x.status]?.[1]}>{statusMap[x.status]?.[0]}</Tag> },
    {
      title: '', width: 88, fixed: 'right', render: (_, x) => <Space>
        <Button size="small" icon={<EditOutlined />} disabled={!editableBoard(board)} onClick={() => openItem(x)} />
        {x.source_type !== 'TASK_ASSIGNMENT' && <Popconfirm title="Xóa dòng này?" onConfirm={() => removeItem(x.id)}><Button danger size="small" icon={<DeleteOutlined />} disabled={!editableBoard(board)} /></Popconfirm>}
      </Space>,
    },
  ];

  const autoCount = board?.items.filter(x => x.source_type === 'TASK_ASSIGNMENT').length || 0;
  const absenceCount = board?.items.filter(x => x.status === 'ABSENT').length || 0;
  const unscheduledCount = board?.items.filter(x => !x.start_time && x.status !== 'ABSENT').length || 0;

  return <div>
    <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 18 }} wrap>
      <div><Title level={2} style={{ margin: 0 }}>Bảng điều hành xưởng</Title><Text type="secondary">2.6.0-I — Tự động từ Công việc · Theo người và giờ · Nhật ký Dự án</Text></div>
      <Space>
        <DatePicker allowClear={false} value={date} format="DD/MM/YYYY" onChange={value => { setDate(value); setBoard(null); openDate(value); }} />
        <Button icon={<PlusOutlined />} onClick={() => { boardForm.setFieldsValue({ board_date: date, shift_code: 'SHIFT_2', shift_name: 'Ca bổ sung', shift_start: dayjs('16:30', 'HH:mm'), shift_end: dayjs('22:00', 'HH:mm'), workshop: 'Xưởng chính' }); setBoardModal(true); }}>Thêm ca</Button>
      </Space>
    </Space>

    <Alert style={{ marginBottom: 16 }} type="info" showIcon message="Phân công được lấy tự động từ Task" description="Mỗi Task được mở rộng thành từng dòng theo nhân viên. Điều hành chỉ bổ sung giờ, khu vực, chi tiết thực hiện hoặc ghi nhận nghỉ/vắng; Task gốc không bị thay đổi." />

    <Row gutter={16}>
      <Col xs={24} lg={6}>
        <Card title={`Các ca ngày ${date.format('DD/MM/YYYY')}`} loading={loading}>
          {boards.map(x => <Card.Grid key={x.id} style={{ width: '100%', cursor: 'pointer', background: board?.id === x.id ? '#e6f4ff' : undefined }} onClick={() => loadBoard(x.id)}>
            <Space direction="vertical" size={2}>
              <Space><b>{x.shift_name}</b><Tag color={boardStatusMap[x.status]?.[1]}>{boardStatusMap[x.status]?.[0] || x.status}</Tag></Space>
              <Text>{x.workshop} · {x.shift_start.slice(0, 5)}–{x.shift_end.slice(0, 5)}</Text>
              <Text type="secondary">{x.task_item_count} từ Task · {x.absence_count} nghỉ/vắng</Text>
            </Space>
          </Card.Grid>)}
        </Card>
      </Col>
      <Col xs={24} lg={18}>
        {board ? <Space direction="vertical" style={{ width: '100%' }} size="middle">
          {board.status === 'CLOSED' && <Alert type="success" showIcon message="Ngày làm việc đã được chốt" description={`Snapshot đã lưu thành Nhật ký Dự án lúc ${dayjs(board.closed_at).format('HH:mm DD/MM/YYYY')}. Dữ liệu không còn chỉnh sửa được.`} />}
          <Card>
            <Descriptions column={{ xs: 1, md: 4 }}>
              <Descriptions.Item label="Ca">{board.shift_name}</Descriptions.Item>
              <Descriptions.Item label="Xưởng">{board.workshop}</Descriptions.Item>
              <Descriptions.Item label="Trạng thái"><Tag color={boardStatusMap[board.status]?.[1]}>{boardStatusMap[board.status]?.[0]}</Tag></Descriptions.Item>
              <Descriptions.Item label="Phiên bản LCD">{board.published_version || 0}</Descriptions.Item>
            </Descriptions>
            <Row gutter={12} style={{ marginBottom: 14 }}>
              <Col span={8}><Statistic title="Tự động từ Task" value={autoCount} /></Col>
              <Col span={8}><Statistic title="Chưa xếp giờ" value={unscheduledCount} /></Col>
              <Col span={8}><Statistic title="Nghỉ/Vắng" value={absenceCount} /></Col>
            </Row>
            <Input.TextArea rows={2} value={board.announcement || ''} disabled={!editableBoard(board)} onChange={event => setBoard({ ...board, announcement: event.target.value })} placeholder="Thông báo đầu ca, an toàn, chất lượng..." />
            <Space style={{ marginTop: 10 }} wrap>
              <Button onClick={updateAnnouncement} disabled={!editableBoard(board)}>Lưu thông báo</Button>
              <Button icon={<SyncOutlined />} onClick={syncTasks} disabled={!editableBoard(board)}>Đồng bộ Task</Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => openItem(null, 'MANUAL')} disabled={!editableBoard(board)}>Thêm việc phát sinh</Button>
              <Button danger icon={<UserDeleteOutlined />} onClick={() => openItem(null, 'ABSENCE')} disabled={!editableBoard(board)}>Ghi nhận nghỉ/vắng</Button>
              <Button icon={<SendOutlined />} onClick={publish} disabled={!editableBoard(board) || !board.items.length}>Công bố LCD</Button>
              {board.published_version > 0 && <Button icon={<EyeOutlined />} onClick={() => window.open(board.display_url, '_blank')}>Mở LCD</Button>}
              <Button type="primary" ghost icon={<CheckCircleOutlined />} onClick={() => setCloseModal(true)} disabled={!editableBoard(board) || !board.items.length}>Chốt cuối ngày</Button>
            </Space>
          </Card>
          <Card><Table rowKey="id" loading={loading} dataSource={board.items} columns={columns} pagination={false} scroll={{ x: 1450 }} rowClassName={record => record.status === 'ABSENT' ? 'shopfloor-absence-row' : ''} /></Card>
        </Space> : <Card loading={loading}><Text type="secondary">Đang mở bảng làm việc theo ngày...</Text></Card>}
      </Col>
    </Row>

    <Modal title="Tạo ca bổ sung" open={boardModal} footer={null} onCancel={() => setBoardModal(false)}>
      <Form form={boardForm} layout="vertical" onFinish={createBoard}>
        <Form.Item name="board_date" label="Ngày" rules={[{ required: true }]}><DatePicker allowClear={false} style={{ width: '100%' }} /></Form.Item>
        <Row gutter={12}><Col span={12}><Form.Item name="shift_code" label="Mã ca" rules={[{ required: true }]}><Input /></Form.Item></Col><Col span={12}><Form.Item name="shift_name" label="Tên ca" rules={[{ required: true }]}><Input /></Form.Item></Col></Row>
        <Row gutter={12}><Col span={12}><Form.Item name="shift_start" label="Bắt đầu" rules={[{ required: true }]}><TimePicker format="HH:mm" style={{ width: '100%' }} /></Form.Item></Col><Col span={12}><Form.Item name="shift_end" label="Kết thúc" rules={[{ required: true }]}><TimePicker format="HH:mm" style={{ width: '100%' }} /></Form.Item></Col></Row>
        <Form.Item name="workshop" label="Xưởng/khu vực" rules={[{ required: true }]}><Input /></Form.Item>
        <Button block type="primary" htmlType="submit">Tạo ca và lấy Task</Button>
      </Form>
    </Modal>

    <Modal width={820} title={entryMode === 'ABSENCE' ? 'Ghi nhận nghỉ/vắng trong ngày' : editing ? 'Cập nhật chi tiết công việc trong ngày' : 'Thêm việc phát sinh'} open={itemModal} footer={null} onCancel={() => setItemModal(false)}>
      <Form form={itemForm} layout="vertical" onFinish={saveItem}>
        {entryMode === 'ABSENCE' ? <>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="employee_id" label="Nhân viên" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={meta.employees.map(x => ({ value: x.id, label: `${x.employee_code} - ${x.full_name}` }))} /></Form.Item></Col>
            <Col span={12}><Form.Item name="absence_type" label="Loại nghỉ/vắng" rules={[{ required: true }]}><Select options={['Nghỉ phép', 'Nghỉ bệnh', 'Nghỉ không lương', 'Vắng mặt', 'Đi công tác', 'Đào tạo'].map(value => ({ value, label: value }))} /></Form.Item></Col>
          </Row>
          <Form.Item name="absence_reason" label="Lý do/Ghi chú"><Input.TextArea rows={2} /></Form.Item>
        </> : <>
          <Form.Item name="title" label="Công việc cụ thể trong ngày" rules={[{ required: true }]}><Input placeholder="Có thể chi tiết hơn nội dung Task gốc" /></Form.Item>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="project_id" label="Dự án"><Select allowClear disabled={editing?.source_type === 'TASK_ASSIGNMENT'} showSearch optionFilterProp="label" options={meta.projects.map(x => ({ value: x.id, label: `${x.project_code} - ${x.project_name}` }))} /></Form.Item></Col>
            <Col span={12}><Form.Item name="task_id" label="Task gốc"><Select allowClear disabled={editing?.source_type === 'TASK_ASSIGNMENT'} showSearch optionFilterProp="label" onChange={selectTask} options={taskOptions.map(x => ({ value: x.id, label: `${x.task_code} - ${x.task_name}` }))} /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="employee_id" label="Nhân viên"><Select disabled={editing?.source_type === 'TASK_ASSIGNMENT'} allowClear showSearch optionFilterProp="label" options={meta.employees.map(x => ({ value: x.id, label: `${x.employee_code} - ${x.full_name}` }))} /></Form.Item></Col>
            <Col span={12}><Form.Item name="team_name" label="Hoặc tổ/nhóm"><Input disabled={editing?.source_type === 'TASK_ASSIGNMENT'} /></Form.Item></Col>
          </Row>
        </>}
        <Row gutter={12}>
          <Col span={8}><Form.Item name="work_area" label="Khu vực/máy"><Input /></Form.Item></Col>
          <Col span={8}><Form.Item name="start_time" label="Bắt đầu"><TimePicker format="HH:mm" style={{ width: '100%' }} /></Form.Item></Col>
          <Col span={8}><Form.Item name="end_time" label="Kết thúc"><TimePicker format="HH:mm" style={{ width: '100%' }} /></Form.Item></Col>
        </Row>
        {entryMode !== 'ABSENCE' && <>
          <Row gutter={12}>
            <Col span={8}><Form.Item name="priority" label="Ưu tiên"><Select options={Object.entries(priorityMap).map(([value, item]) => ({ value, label: item[0] }))} /></Form.Item></Col>
            <Col span={8}><Form.Item name="status" label="Trạng thái"><Select options={Object.entries(statusMap).map(([value, item]) => ({ value, label: item[0] }))} /></Form.Item></Col>
            <Col span={8}><Form.Item name="progress" label="Tiến độ (%)"><InputNumber min={0} max={100} style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
          {selectedStatus === 'ABSENT' && <Row gutter={12}><Col span={10}><Form.Item name="absence_type" label="Loại nghỉ/vắng"><Select options={['Nghỉ phép', 'Nghỉ bệnh', 'Vắng mặt'].map(value => ({ value, label: value }))} /></Form.Item></Col><Col span={14}><Form.Item name="absence_reason" label="Lý do"><Input /></Form.Item></Col></Row>}
          <Row gutter={12}><Col span={8}><Form.Item name="actual_hours" label="Giờ công thực tế"><InputNumber min={0} max={24} step={0.25} style={{ width: '100%' }} /></Form.Item></Col><Col span={16}><Form.Item name="notes" label="Ghi chú thực hiện"><Input /></Form.Item></Col></Row>
        </>}
        <Button block type="primary" htmlType="submit">Lưu vào bảng trong ngày</Button>
      </Form>
    </Modal>

    <Modal title="Chốt cuối ngày và tạo Nhật ký Dự án" open={closeModal} footer={null} onCancel={() => setCloseModal(false)}>
      <Alert type="warning" showIcon style={{ marginBottom: 16 }} message="Sau khi chốt, bảng không thể chỉnh sửa" description="Hệ thống sẽ công bố snapshot cuối cùng, khóa bảng và tạo Nhật ký Dự án cho từng dự án có công việc trong ngày." />
      <Form form={closeForm} layout="vertical" onFinish={closeDay}>
        <Form.Item name="summary" label="Tổng kết cuối ngày"><Input.TextArea rows={4} placeholder="Kết quả, sự cố, nội dung chuyển tiếp sang ngày mai..." /></Form.Item>
        <Button block type="primary" htmlType="submit" icon={<CheckCircleOutlined />}>Xác nhận chốt cuối ngày</Button>
      </Form>
    </Modal>
  </div>;
}
