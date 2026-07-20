import React, { useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Divider, List, Modal, Row, Select, Space, Table, Typography, Upload, message } from 'antd';
import { DownloadOutlined, FileExcelOutlined, ImportOutlined, UploadOutlined } from '@ant-design/icons';
import { dataTransferAPI } from '../services/api';

const { Title, Paragraph, Text } = Typography;

const entities = [
  { value: 'customers', label: 'Khách hàng' },
  { value: 'employees', label: 'Nhân viên' },
  { value: 'projects', label: 'Dự án' },
  { value: 'tasks', label: 'Công việc' },
];

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function DataTransfer() {
  const [entity, setEntity] = useState('customers');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const entityLabel = useMemo(() => entities.find((item) => item.value === entity)?.label, [entity]);

  const downloadTemplate = async () => {
    try {
      setBusy(true);
      const blob = await dataTransferAPI.downloadTemplate(entity);
      saveBlob(blob, `simba-${entity}-template.xlsx`);
    } catch (error) { message.error(error.message); } finally { setBusy(false); }
  };

  const exportExcel = async () => {
    try {
      setBusy(true);
      const blob = await dataTransferAPI.exportExcel(entity);
      saveBlob(blob, `simba-${entity}-${new Date().toISOString().slice(0, 10)}.xlsx`);
      message.success(`Đã xuất ${entityLabel}`);
    } catch (error) { message.error(error.message); } finally { setBusy(false); }
  };

  const previewImport = async () => {
    if (!file) return message.warning('Vui lòng chọn file Excel');
    try {
      setBusy(true);
      const result = await dataTransferAPI.importExcel(entity, file, true);
      setPreview(result);
    } catch (error) { message.error(error.message); } finally { setBusy(false); }
  };

  const confirmImport = async () => {
    try {
      setBusy(true);
      const result = await dataTransferAPI.importExcel(entity, file, false);
      message.success(result.message || 'Nhập dữ liệu thành công');
      setPreview(null);
      setFile(null);
    } catch (error) { message.error(error.message); } finally { setBusy(false); }
  };

  const previewColumns = preview?.preview?.[0]
    ? Object.keys(preview.preview[0].data).map((key) => ({ title: key, dataIndex: ['data', key], key }))
    : [];

  return (
    <div>
      <Title level={2}><FileExcelOutlined /> Import / Export Excel</Title>
      <Paragraph>Nhập và xuất dữ liệu nghiệp vụ bằng file Excel. Hệ thống kiểm tra toàn bộ file trước khi ghi vào cơ sở dữ liệu.</Paragraph>
      <Alert type="warning" showIcon message="Nên backup trước khi import số lượng lớn" style={{ marginBottom: 16 }} />

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="1. Chọn loại dữ liệu">
            <Select value={entity} options={entities} onChange={(value) => { setEntity(value); setFile(null); setPreview(null); }} style={{ width: '100%' }} />
            <Divider />
            <Space wrap>
              <Button icon={<DownloadOutlined />} onClick={downloadTemplate} loading={busy}>Tải file mẫu</Button>
              <Button type="primary" icon={<FileExcelOutlined />} onClick={exportExcel} loading={busy}>Export {entityLabel}</Button>
            </Space>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="2. Import dữ liệu">
            <Upload
              accept=".xlsx"
              maxCount={1}
              beforeUpload={(selectedFile) => { setFile(selectedFile); setPreview(null); return false; }}
              onRemove={() => { setFile(null); setPreview(null); }}
              fileList={file ? [file] : []}
            >
              <Button icon={<UploadOutlined />}>Chọn file Excel</Button>
            </Upload>
            <Divider />
            <Button type="primary" icon={<ImportOutlined />} disabled={!file} loading={busy} onClick={previewImport}>
              Kiểm tra và xem trước
            </Button>
          </Card>
        </Col>
      </Row>

      <Card title="Quy trình an toàn" style={{ marginTop: 16 }}>
        <List size="small" dataSource={[
          'Tải file mẫu đúng loại dữ liệu.',
          'Giữ nguyên tên cột; nhập dữ liệu từ dòng thứ hai.',
          'Bấm Kiểm tra và xem trước. Hệ thống chưa ghi dữ liệu ở bước này.',
          'Chỉ xác nhận import khi số dòng và dữ liệu xem trước đã đúng.',
        ]} renderItem={(item) => <List.Item>{item}</List.Item>} />
      </Card>

      <Modal
        open={Boolean(preview)}
        title={`Xác nhận import ${entityLabel}`}
        width="90%"
        okText={`Import ${preview?.total || 0} dòng`}
        cancelText="Hủy"
        onOk={confirmImport}
        onCancel={() => setPreview(null)}
        confirmLoading={busy}
      >
        <Text strong>Tổng số dòng hợp lệ: {preview?.total}</Text>
        <Table style={{ marginTop: 16 }} size="small" rowKey="rowNumber" dataSource={preview?.preview || []} columns={previewColumns} scroll={{ x: true }} pagination={false} />
        {preview?.total > 20 && <Paragraph type="secondary">Chỉ hiển thị 20 dòng đầu tiên.</Paragraph>}
      </Modal>
    </div>
  );
}
