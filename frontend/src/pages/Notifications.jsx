import React, { useEffect, useState } from 'react';
import { Button, Card, Empty, List, Space, Spin, Tag, Typography, message } from 'antd';
import { BellOutlined, CheckOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { notificationAPI } from '../services/api';

const { Text, Title } = Typography;

const Notifications = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const response = await notificationAPI.getAll({ limit: 100 });
      setItems(response.data || []);
      setUnreadCount(response.unread_count || 0);
    } catch (error) {
      message.error(error.message || 'Không thể tải thông báo');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const markRead = async (item) => {
    if (!item.is_read) {
      await notificationAPI.markRead(item.source, item.id);
    }
    if (item.link) navigate(item.link);
    await load();
  };

  const markAll = async () => {
    try {
      await notificationAPI.markAllRead();
      message.success('Đã đánh dấu tất cả là đã đọc');
      await load();
    } catch (error) {
      message.error(error.message || 'Không thể cập nhật thông báo');
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <Title level={2} style={{ marginBottom: 0 }}><BellOutlined /> Thông báo</Title>
          <Text type="secondary">{unreadCount} thông báo chưa đọc</Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load}>Làm mới</Button>
          <Button icon={<CheckOutlined />} disabled={!unreadCount} onClick={markAll}>Đánh dấu tất cả đã đọc</Button>
        </Space>
      </div>
      <Card>
        <Spin spinning={loading}>
          {items.length === 0 ? <Empty description="Chưa có thông báo" /> : (
            <List
              dataSource={items}
              renderItem={(item) => (
                <List.Item
                  onClick={() => markRead(item)}
                  style={{ cursor: 'pointer', background: item.is_read ? undefined : '#f0f7ff', padding: 16 }}
                >
                  <List.Item.Meta
                    title={<Space><Text strong={!item.is_read}>{item.title}</Text><Tag>{item.notification_type}</Tag>{item.priority === 'High' && <Tag color="red">Ưu tiên cao</Tag>}</Space>}
                    description={<><div>{item.message}</div><Text type="secondary" style={{ fontSize: 12 }}>{dayjs(item.created_at).format('DD/MM/YYYY HH:mm')} {item.project_name ? `• ${item.project_name}` : ''}</Text></>}
                  />
                  {!item.is_read && <Tag color="blue">Chưa đọc</Tag>}
                </List.Item>
              )}
            />
          )}
        </Spin>
      </Card>
    </div>
  );
};

export default Notifications;
