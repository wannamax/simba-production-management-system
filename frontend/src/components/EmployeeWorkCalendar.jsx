import React, { useEffect, useState } from 'react';
import { Calendar, Badge, Modal, List, Tag, Spin, Empty, Card, Space } from 'antd';
import { ClockCircleOutlined, EnvironmentOutlined, ProjectOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const EmployeeWorkCalendar = ({ employeeId, employeeName, visible, onClose }) => {
  const [schedules, setSchedules] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);

  useEffect(() => {
    if (visible && employeeId) {
      loadEmployeeWork();
    }
  }, [visible, employeeId]);

  const loadEmployeeWork = async () => {
    setLoading(true);
    try {
      // Load schedules
      const schedulesResponse = await axios.get(`${API_URL}/schedules`, {
        params: { employee_id: employeeId }
      });
      setSchedules(schedulesResponse.data.data || []);

      // Load tasks
      const tasksResponse = await axios.get(`${API_URL}/tasks`, {
        params: { employee_id: employeeId }
      });
      setTasks(tasksResponse.data.data || []);
    } catch (error) {
      console.error('Error loading employee work:', error);
    } finally {
      setLoading(false);
    }
  };

  const getListData = (value) => {
    const dateStr = value.format('YYYY-MM-DD');
    const list = [];

    // Add schedules
    schedules.forEach(schedule => {
      const startDate = dayjs(schedule.start_datetime).format('YYYY-MM-DD');
      const endDate = dayjs(schedule.end_datetime).format('YYYY-MM-DD');

      if (dateStr >= startDate && dateStr <= endDate) {
        list.push({
          type: 'schedule',
          title: schedule.title,
          status: schedule.status,
          schedule_type: schedule.schedule_type,
          project_name: schedule.project_name,
          time: dayjs(schedule.start_datetime).format('HH:mm'),
        });
      }
    });

    // Add tasks
    tasks.forEach(task => {
      const startDate = task.start_date ? dayjs(task.start_date).format('YYYY-MM-DD') : null;
      const endDate = task.end_date ? dayjs(task.end_date).format('YYYY-MM-DD') : null;

      if (startDate && endDate && dateStr >= startDate && dateStr <= endDate) {
        list.push({
          type: 'task',
          title: task.task_name,
          status: task.status,
          task_type: task.task_type,
          project_name: task.project_name,
        });
      }
    });

    return list;
  };

  const dateCellRender = (value) => {
    const listData = getListData(value);
    
    if (listData.length === 0) return null;

    return (
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {listData.slice(0, 2).map((item, index) => (
          <li key={index} style={{ marginBottom: 2 }}>
            <Badge
              status={
                item.status === 'Hoàn thành' ? 'success' :
                item.status === 'Đang thực hiện' ? 'processing' :
                item.status === 'Chờ xử lý' ? 'warning' : 'default'
              }
              text={
                <span style={{ fontSize: 12 }}>
                  {item.time && `${item.time} - `}
                  {item.title.substring(0, 15)}...
                </span>
              }
            />
          </li>
        ))}
        {listData.length > 2 && (
          <li style={{ fontSize: 12, color: '#999' }}>
            +{listData.length - 2} việc khác
          </li>
        )}
      </ul>
    );
  };

  const handleSelect = (value) => {
    setSelectedDate(value);
  };

  const getSelectedDateWork = () => {
    if (!selectedDate) return [];
    return getListData(selectedDate);
  };

  const getStatusColor = (status) => {
    const colors = {
      'Chưa bắt đầu': 'default',
      'Đang thực hiện': 'processing',
      'Chờ xử lý': 'warning',
      'Hoàn thành': 'success',
      'Hủy': 'error'
    };
    return colors[status] || 'default';
  };

  return (
    <Modal
      title={
        <Space>
          <ClockCircleOutlined />
          Lịch làm việc - {employeeName}
        </Space>
      }
      open={visible}
      onCancel={onClose}
      width={1000}
      footer={null}
      destroyOnClose
    >
      <Spin spinning={loading}>
        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <Calendar
              dateCellRender={dateCellRender}
              onSelect={handleSelect}
            />
          </div>
          
          {selectedDate && (
            <Card
              title={`Chi tiết ${selectedDate.format('DD/MM/YYYY')}`}
              style={{ width: 350 }}
              size="small"
            >
              {getSelectedDateWork().length > 0 ? (
                <List
                  size="small"
                  dataSource={getSelectedDateWork()}
                  renderItem={item => (
                    <List.Item>
                      <List.Item.Meta
                        title={
                          <Space direction="vertical" size={4}>
                            <div>
                              {item.type === 'schedule' ? (
                                <Tag color="blue">{item.schedule_type}</Tag>
                              ) : (
                                <Tag color="green">{item.task_type}</Tag>
                              )}
                              <Tag color={getStatusColor(item.status)}>
                                {item.status}
                              </Tag>
                            </div>
                            <div style={{ fontWeight: 600 }}>
                              {item.title}
                            </div>
                          </Space>
                        }
                        description={
                          <Space direction="vertical" size={2}>
                            <div>
                              <ProjectOutlined /> {item.project_name}
                            </div>
                            {item.time && (
                              <div>
                                <ClockCircleOutlined /> {item.time}
                              </div>
                            )}
                          </Space>
                        }
                      />
                    </List.Item>
                  )}
                />
              ) : (
                <Empty
                  description="Không có công việc"
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                />
              )}
            </Card>
          )}
        </div>

        <Card style={{ marginTop: 16 }} size="small">
          <Space size="large">
            <div>
              <Badge status="success" text="Hoàn thành" />
            </div>
            <div>
              <Badge status="processing" text="Đang thực hiện" />
            </div>
            <div>
              <Badge status="warning" text="Chờ xử lý" />
            </div>
            <div>
              <Badge status="default" text="Chưa bắt đầu" />
            </div>
          </Space>
        </Card>
      </Spin>
    </Modal>
  );
};

export default EmployeeWorkCalendar;