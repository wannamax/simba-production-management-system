import React from 'react';
import { Card, Empty, Button } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

const MaterialList = () => {
  return (
    <div>
      <div className="page-header">
        <h1>Quản lý Vật tư</h1>
        <Button type="primary" icon={<PlusOutlined />}>
          Thêm vật tư
        </Button>
      </div>
      <Card>
        <Empty description="Đang phát triển - Danh sách vật tư" />
      </Card>
    </div>
  );
};

export default MaterialList;