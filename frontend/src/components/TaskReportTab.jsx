import React, { useEffect, useState } from 'react';
import {
  Card,
  Row,
  Col,
  DatePicker,
  Select,
  Button,
  Table,
  Space,
  Statistic,
  message,
  Tag,
  Progress,
  Spin
} from 'antd';
import {
  DownloadOutlined,
  ReloadOutlined,
  BarChartOutlined,
  FileTextOutlined
} from '@ant-design/icons';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import dayjs from 'dayjs';
import axios from 'axios';
import Papa from 'papaparse';

const { RangePicker } = DatePicker;
const { Option } = Select;

const API_URL = import.meta.env.VITE_API_URL || '/api';

const TaskReportTab = ({ taskId, taskCode, startDate, endDate }) => {
  const [loading, setLoading] = useState(false);
  const [chartData, setChartData] = useState([]);
  const [tableData, setTableData] = useState([]);
  const [summary, setSummary] = useState({});
  
  const [filters, setFilters] = useState({
    dateRange: [
      startDate ? dayjs(startDate) : dayjs(),
      endDate ? dayjs(endDate) : dayjs().add(30, 'day')
    ],
    status: 'all'
  });

  const [sortConfig, setSortConfig] = useState({
    field: 'installation_date',
    order: 'ascend'
  });

  useEffect(() => {
    loadReportData();
  }, [taskId, filters, sortConfig]);

  const loadReportData = async () => {
    setLoading(true);
    try {
      // Load statistics for chart
      const statsResponse = await axios.get(`${API_URL}/tasks/${taskId}/report-statistics`, {
        params: {
          from_date: filters.dateRange[0].format('YYYY-MM-DD'),
          to_date: filters.dateRange[1].format('YYYY-MM-DD'),
          status: filters.status !== 'all' ? filters.status : undefined
        }
      });

      // Load locations for table
      const locationsResponse = await axios.get(`${API_URL}/tasks/${taskId}/locations-report`, {
        params: {
          from_date: filters.dateRange[0].format('YYYY-MM-DD'),
          to_date: filters.dateRange[1].format('YYYY-MM-DD'),
          status: filters.status !== 'all' ? filters.status : undefined,
          sort_by: sortConfig.field,
          sort_order: sortConfig.order === 'ascend' ? 'ASC' : 'DESC'
        }
      });

      if (statsResponse.data.success) {
        setChartData(statsResponse.data.data.daily_stats);
        setSummary(statsResponse.data.data.summary);
      }

      if (locationsResponse.data.success) {
        setTableData(locationsResponse.data.data);
      }
    } catch (error) {
      console.error('Error loading report:', error);
      message.error('Không thể tải báo cáo');
    } finally {
      setLoading(false);
    }
  };

  const handleTableChange = (pagination, filters, sorter) => {
    if (sorter.field) {
      setSortConfig({
        field: sorter.field,
        order: sorter.order || 'ascend'
      });
    }
  };

  const handleExportCSV = () => {
    try {
      // Prepare data for CSV
      const csvData = tableData.map((item, index) => ({
        'STT': index + 1,
        'Mã nhiệm vụ': taskCode,
        'Tên địa điểm': item.location_name,
        'Địa chỉ': item.location_address,
        'Quận/Huyện': item.location_district || '',
        'Thành phố': item.location_city || '',
        'Người liên hệ': item.contact_person || '',
        'Số điện thoại': item.contact_phone || '',
        'Ngày lắp đặt': item.installation_date ? dayjs(item.installation_date).format('DD/MM/YYYY') : '',
        'Giờ bắt đầu': item.installation_time_start || '',
        'Giờ kết thúc': item.installation_time_end || '',
        'Số giờ dự kiến': item.estimated_hours || 0,
        'Số giờ thực tế': item.actual_hours || 0,
        'Trạng thái': item.status,
        'Tiến độ (%)': item.progress || 0,
        'Nhân viên': item.assigned_employees?.map(e => e.employee_name).join(', ') || '',
        'Vai trò': item.assigned_employees?.map(e => e.role).join(', ') || '',
        'Thông tin sản phẩm': item.product_info || '',
        'Mô tả công việc': item.work_description || '',
        'Ghi chú': item.notes || '',
        'Vấn đề': item.issues || ''
      }));

      // Convert to CSV
      const csv = Papa.unparse(csvData, {
        quotes: true,
        delimiter: ',',
        header: true
      });

      // Create blob and download
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      const filename = `Task_${taskCode}_Report_${filters.dateRange[0].format('YYYYMMDD')}_${filters.dateRange[1].format('YYYYMMDD')}.csv`;
      
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      message.success('Đã tải xuống báo cáo CSV');
    } catch (error) {
      console.error('Error exporting CSV:', error);
      message.error('Không thể xuất file CSV');
    }
  };

  const columns = [
    {
      title: 'STT',
      key: 'index',
      width: 60,
      render: (_, __, index) => index + 1,
    },
    {
      title: 'Tên địa điểm',
      dataIndex: 'location_name',
      key: 'location_name',
      width: 200,
      sorter: true,
    },
    {
      title: 'Địa chỉ',
      dataIndex: 'location_address',
      key: 'location_address',
      ellipsis: true,
    },
    {
      title: 'Ngày lắp đặt',
      dataIndex: 'installation_date',
      key: 'installation_date',
      width: 120,
      sorter: true,
      render: (date) => date ? dayjs(date).format('DD/MM/YYYY') : '-',
    },
    {
      title: 'Giờ',
      key: 'time',
      width: 120,
      render: (_, record) => {
        if (record.installation_time_start && record.installation_time_end) {
          return `${record.installation_time_start} - ${record.installation_time_end}`;
        }
        return '-';
      },
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      sorter: true,
      render: (status, record) => {
        let color = 'default';
        if (record.is_completed) color = 'success';
        else if (status === 'Đang lắp đặt') color = 'processing';
        else if (status === 'Có vấn đề') color = 'error';
        
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: 'Tiến độ',
      dataIndex: 'progress',
      key: 'progress',
      width: 120,
      sorter: true,
      render: (progress) => <Progress percent={progress || 0} size="small" />,
    },
    {
      title: 'Nhân viên',
      key: 'employees',
      width: 200,
      render: (_, record) => {
        if (!record.assigned_employees || record.assigned_employees.length === 0) {
          return <Tag>Chưa phân công</Tag>;
        }
        return (
          <Space direction="vertical" size={0}>
            {record.assigned_employees.slice(0, 2).map((emp, idx) => (
              <div key={idx} style={{ fontSize: 12 }}>
                {emp.employee_name} ({emp.role})
              </div>
            ))}
            {record.assigned_employees.length > 2 && (
              <div style={{ fontSize: 12, color: '#999' }}>
                +{record.assigned_employees.length - 2} người khác
              </div>
            )}
          </Space>
        );
      },
    },
  ];

  // Format chart data
  const formattedChartData = chartData.map(item => ({
    date: dayjs(item.report_date).format('DD/MM'),
    'Tất cả': parseInt(item.total),
    'Hoàn thành': parseInt(item.completed),
    'Đang thực hiện': parseInt(item.in_progress),
    'Chưa bắt đầu': parseInt(item.not_started)
  }));

  return (
    <div>
      {/* Filters */}
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={12} md={8}>
            <Space direction="vertical" size={0} style={{ width: '100%' }}>
              <span style={{ fontSize: 12, color: '#999' }}>Khoảng thời gian</span>
              <RangePicker
                value={filters.dateRange}
                onChange={(dates) => setFilters({ ...filters, dateRange: dates })}
                format="DD/MM/YYYY"
                style={{ width: '100%' }}
              />
            </Space>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Space direction="vertical" size={0} style={{ width: '100%' }}>
              <span style={{ fontSize: 12, color: '#999' }}>Trạng thái</span>
              <Select
                value={filters.status}
                onChange={(value) => setFilters({ ...filters, status: value })}
                style={{ width: '100%' }}
              >
                <Option value="all">Tất cả</Option>
                <Option value="Chưa bắt đầu">Chưa bắt đầu</Option>
                <Option value="Đang lắp đặt">Đang thực hiện</Option>
                <Option value="Hoàn thành">Hoàn thành</Option>
              </Select>
            </Space>
          </Col>
          <Col xs={24} sm={12} md={5}>
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              onClick={loadReportData}
              loading={loading}
              block
            >
              Làm mới
            </Button>
          </Col>
          <Col xs={24} sm={12} md={5}>
            <Button
              icon={<DownloadOutlined />}
              onClick={handleExportCSV}
              disabled={tableData.length === 0}
              block
            >
              Tải xuống CSV
            </Button>
          </Col>
        </Row>
      </Card>

      {/* Summary Statistics */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="Tổng địa điểm"
              value={summary.total_locations || 0}
              prefix={<FileTextOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="Hoàn thành"
              value={summary.completed_locations || 0}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="Đang thực hiện"
              value={summary.in_progress_locations || 0}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="Chưa bắt đầu"
              value={summary.not_started_locations || 0}
              valueStyle={{ color: '#999' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Chart */}
      <Card 
        title={
          <Space>
            <BarChartOutlined />
            Biểu đồ theo ngày
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: '50px 0' }}>
            <Spin size="large" />
          </div>
        ) : formattedChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={formattedChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="Tất cả" 
                stroke="#1890ff" 
                strokeWidth={2}
                dot={{ r: 4 }}
              />
              <Line 
                type="monotone" 
                dataKey="Hoàn thành" 
                stroke="#52c41a" 
                strokeWidth={2}
                dot={{ r: 4 }}
              />
              <Line 
                type="monotone" 
                dataKey="Đang thực hiện" 
                stroke="#fa8c16" 
                strokeWidth={2}
                dot={{ r: 4 }}
              />
              <Line 
                type="monotone" 
                dataKey="Chưa bắt đầu" 
                stroke="#999" 
                strokeWidth={2}
                dot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ textAlign: 'center', padding: '50px 0' }}>
            Không có dữ liệu trong khoảng thời gian này
          </div>
        )}
      </Card>

      {/* Table */}
      <Card title="Danh sách chi tiết">
        <Table
          columns={columns}
          dataSource={tableData}
          rowKey="id"
          loading={loading}
          onChange={handleTableChange}
          scroll={{ x: 1400 }}
          pagination={{
            showSizeChanger: true,
            showTotal: (total) => `Tổng ${total} địa điểm`,
            pageSize: 20
          }}
        />
      </Card>
    </div>
  );
};

export default TaskReportTab;