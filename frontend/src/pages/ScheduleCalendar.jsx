import React from 'react';
import { Card, Button } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

const ScheduleCalendar = () => {
  const navigate = useNavigate();

  return (
    <div>
      <div className="page-header">
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/schedules')}
        >
          Quay lại danh sách
        </Button>
        <h1>Lịch làm việc</h1>
      </div>

      <Card>
        <p style={{ textAlign: 'center', padding: '50px 0', color: '#999' }}>
          Calendar view đang được phát triển...
        </p>
      </Card>
    </div>
  );
};

export default ScheduleCalendar;