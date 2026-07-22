import React, { useEffect, useMemo, useState } from 'react';
import { Button, DatePicker, Space, Tag, Typography } from 'antd';
import { CalendarOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;
const { Text } = Typography;
export const DAILY_PLANNED_HOURS = 8;

export function enumerateWorkDates(startDate, endDate) {
  if (!startDate || !endDate) return [];
  const dates = [];
  let cursor = dayjs(startDate).startOf('day');
  const last = dayjs(endDate).startOf('day');
  while (!cursor.isAfter(last, 'day')) {
    dates.push(cursor.format('YYYY-MM-DD'));
    cursor = cursor.add(1, 'day');
  }
  return dates;
}

export function summarizeAssignments(assignments = []) {
  const rows = assignments.filter(row => row?.employee_id && Array.isArray(row.work_dates) && row.work_dates.length);
  const allDates = rows.flatMap(row => row.work_dates).sort();
  return {
    employees: new Set(rows.map(row => row.employee_id)).size,
    startDate: allDates[0] || null,
    endDate: allDates[allDates.length - 1] || null,
    workDays: new Set(allDates).size,
    personDays: allDates.length,
    plannedHours: allDates.length * DAILY_PLANNED_HOURS,
  };
}

export default function AssignmentWorkCalendar({ value = [], onChange, compact = false }) {
  const normalized = useMemo(() => [...new Set((value || []).map(item => String(item).slice(0, 10)))].sort(), [value]);
  const [range, setRange] = useState(() => normalized.length ? [dayjs(normalized[0]), dayjs(normalized[normalized.length - 1])] : null);

  useEffect(() => {
    if (!normalized.length) {
      setRange(null);
      return;
    }
    setRange(previous => previous || [dayjs(normalized[0]), dayjs(normalized[normalized.length - 1])]);
  }, [normalized.join('|')]);

  const rangeDates = useMemo(() => range ? enumerateWorkDates(range[0], range[1]) : [], [range]);
  const selected = useMemo(() => new Set(normalized), [normalized]);
  const months = useMemo(() => {
    if (!range) return [];
    const result = [];
    let cursor = range[0].startOf('month');
    const last = range[1].startOf('month');
    while (!cursor.isAfter(last, 'month')) {
      const offset = (cursor.day() + 6) % 7;
      const cells = Array(offset).fill(null);
      for (let day = 1; day <= cursor.daysInMonth(); day += 1) {
        const date = cursor.date(day);
        if (!date.isBefore(range[0], 'day') && !date.isAfter(range[1], 'day')) cells.push(date);
        else cells.push(null);
      }
      result.push({ key:cursor.format('YYYY-MM'), label:`Tháng ${cursor.format('MM/YYYY')}`, cells });
      cursor = cursor.add(1, 'month');
    }
    return result;
  }, [range]);

  const selectRange = dates => {
    setRange(dates);
    onChange?.(dates ? enumerateWorkDates(dates[0], dates[1]) : []);
  };
  const applyFilter = predicate => onChange?.(rangeDates.filter(date => predicate(dayjs(date))));
  const toggleDate = date => {
    const next = new Set(normalized);
    if (next.has(date)) next.delete(date); else next.add(date);
    onChange?.([...next].sort());
  };

  return <div className={`assignment-work-calendar${compact ? ' compact' : ''}`}>
    <Space wrap style={{ marginBottom: 10 }}>
      <RangePicker value={range} onChange={selectRange} format="DD/MM/YYYY" placeholder={['Từ ngày', 'Đến ngày']} />
      <Button disabled={!rangeDates.length} onClick={() => onChange?.(rangeDates)}>Chọn toàn bộ</Button>
      <Button disabled={!rangeDates.length} onClick={() => applyFilter(date => date.day() !== 0)}>Bỏ Chủ nhật</Button>
      <Button disabled={!rangeDates.length} onClick={() => applyFilter(date => ![0, 6].includes(date.day()))}>Bỏ T7 &amp; CN</Button>
    </Space>
    {range ? <>
      <div className="assignment-calendar-months">
        {months.map(month => <div className="assignment-calendar-month" key={month.key}>
          <Text strong><CalendarOutlined /> {month.label}</Text>
          <div className="assignment-calendar-grid weekday-header">
            {['T2','T3','T4','T5','T6','T7','CN'].map(label => <span key={label}>{label}</span>)}
          </div>
          <div className="assignment-calendar-grid">
            {month.cells.map((date,index) => date ? <button
              type="button"
              key={date.format('YYYY-MM-DD')}
              className={`assignment-calendar-day${selected.has(date.format('YYYY-MM-DD')) ? ' selected' : ''}${[0,6].includes(date.day()) ? ' weekend' : ''}`}
              onClick={() => toggleDate(date.format('YYYY-MM-DD'))}
              aria-pressed={selected.has(date.format('YYYY-MM-DD'))}
              aria-label={`${selected.has(date.format('YYYY-MM-DD')) ? 'Bỏ' : 'Chọn'} ngày ${date.format('DD/MM/YYYY')}`}
            >{date.date()}</button> : <span className="assignment-calendar-empty" key={`blank-${index}`} />)}
          </div>
        </div>)}
      </div>
      <Space wrap style={{ marginTop: 10 }}>
        <Tag color="blue">Đã chọn {normalized.length} ngày</Tag>
        <Tag color="geekblue">{normalized.length * DAILY_PLANNED_HOURS} giờ dự kiến</Tag>
        <Text type="secondary">Nhấn vào từng ngày để bật hoặc bỏ ngày làm việc.</Text>
      </Space>
    </> : <Text type="secondary">Chọn khoảng ngày để tạo lịch làm việc.</Text>}
  </div>;
}
