const base = process.env.TEST_BASE_URL || 'http://web';
async function request(path, options = {}) {
  const response = await fetch(`${base}/api${path}`, { headers: { 'content-type': 'application/json', ...(options.headers || {}) }, ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path}: ${response.status} ${JSON.stringify(body)}`);
  return body;
}
(async () => {
  const projects = await request('/projects?limit=1');
  const project = projects.data?.[0];
  if (!project) throw new Error('Cần ít nhất một dự án để chạy smoke test');
  const start = new Date(Date.now() + 3600000);
  const end = new Date(Date.now() + 7200000);
  const created = await request('/schedules', { method: 'POST', body: JSON.stringify({ project_id: project.id, schedule_type: 'Sản xuất', title: `CI Schedule ${Date.now()}`, start_datetime: start.toISOString(), end_datetime: end.toISOString(), priority: 'Cao', employee_ids: [] }) });
  const id = created.data.id;
  const updated = await request(`/schedules/${id}`, { method: 'PUT', body: JSON.stringify({ ...created.data, title: `${created.data.title} updated`, start_datetime: start.toISOString(), end_datetime: end.toISOString(), employee_ids: [] }) });
  if (!updated.data.title.endsWith('updated')) throw new Error('Schedule update failed');
  const notifications = await request('/notifications?unread_only=true');
  const item = notifications.data.find(n => n.source === 'system' && n.schedule_id === id);
  if (!item) throw new Error('Schedule notification was not created');
  await request(`/notifications/${item.source}/${item.id}/read`, { method: 'PATCH', body: '{}' });
  await request(`/schedules/${id}`, { method: 'DELETE' });
  console.log('Schedule and notifications smoke test passed');
})().catch((error) => { console.error(error); process.exit(1); });
