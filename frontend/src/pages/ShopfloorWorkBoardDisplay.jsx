import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, Progress, Spin } from 'antd';
import dayjs from 'dayjs';
import { shopfloorWorkBoardAPI } from '../services/api';
import './ShopfloorWorkBoardDisplay.css';

const statuses = {
  NOT_STARTED: ['CHƯA BẮT ĐẦU', 'gray'], READY: ['SẮN SÀNG', 'blue'], IN_PROGRESS: ['ĐANG THỰC HIỆN', 'green'],
  WAITING_MATERIAL: ['CHỜ VẬT TƯ', 'orange'], ISSUE: ['CÓ SỰ CỐ', 'red'], PAUSED: ['TẠM DỪNG', 'purple'],
  COMPLETED: ['HOÀN THÀNH', 'cyan'], ABSENT: ['NGHỈ / VẮNG', 'red'],
};

export default function ShopfloorWorkBoardDisplay() {
  const { token } = useParams(); const [board, setBoard] = useState(null); const [error, setError] = useState(''); const [now, setNow] = useState(dayjs());
  const load = async () => { try { const response = await shopfloorWorkBoardAPI.getPublic(token); setBoard(response.data); setError(''); } catch (e) { setError(e.message); } };
  useEffect(() => { load(); const dataTimer = setInterval(load, 15000); const clockTimer = setInterval(() => setNow(dayjs()), 1000); return () => { clearInterval(dataTimer); clearInterval(clockTimer); }; }, [token]);
  if (error) return <div className="shopfloor-display center"><Alert type="error" showIcon message="Không thể hiển thị bảng xưởng" description={error} /></div>;
  if (!board) return <div className="shopfloor-display center"><Spin size="large" /></div>;
  return <div className="shopfloor-display">
    <header><div><h1>BẢNG ĐIỀU HÀNH XƯỞNG</h1><div className="board-meta">{board.workshop} · {board.shift_name} · {(board.shift_start || '').slice(0,5)}–{(board.shift_end || '').slice(0,5)}</div></div><div className="clock"><b>{now.format('HH:mm:ss')}</b><span>{now.format('DD/MM/YYYY')}</span></div></header>
    {board.announcement && <div className="announcement">⚠ {board.announcement}</div>}
    <main><table><thead><tr><th>THỜI GIAN</th><th>NHÂN VIÊN / TỔ</th><th>DỰ ÁN · TASK</th><th>CÔNG VIỆC TRONG NGÀY</th><th>KHU VỰC / MÁY</th><th>TIẾN ĐỘ</th><th>TRẠNG THÁI</th></tr></thead><tbody>{board.items.map(item => <tr key={item.id} className={`row-${statuses[item.status]?.[1] || 'gray'}`}><td className="time">{(item.start_time || '--:--').slice(0,5)}<br/><span>{(item.end_time || '--:--').slice(0,5)}</span></td><td>{item.assignments.map(x => x.full_name || x.team_name).join(', ') || '-'}</td><td><b>{item.project_code || '-'}</b>{item.task_code && <small className="task-code">{item.task_code}</small>}</td><td className="work"><b>{item.title}</b>{(item.absence_reason || item.notes) && <small>{item.absence_reason || item.notes}</small>}</td><td>{item.work_area || '-'}</td><td>{item.status === 'ABSENT' ? '-' : <Progress percent={item.progress} strokeColor="#38bdf8" trailColor="#334155" size={[110, 14]} />}</td><td><span className={`status ${statuses[item.status]?.[1]}`}>{statuses[item.status]?.[0]}</span></td></tr>)}</tbody></table>{!board.items.length && <div className="empty">CHƯA CÓ CÔNG VIỆC TRONG CA</div>}</main>
    <footer><span>Phiên bản {board.published_version} · Cập nhật {dayjs(board.published_at).format('HH:mm DD/MM/YYYY')}{board.status === 'CLOSED' ? ' · ĐÃ CHỐT NHẬT KÝ' : ''}</span><span>Simba PMS - Version: 2.6.0-I</span></footer>
  </div>;
}
