CREATE TABLE IF NOT EXISTS system_notifications (
    id SERIAL PRIMARY KEY,
    notification_type VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    priority VARCHAR(20) NOT NULL DEFAULT 'Normal',
    schedule_id INTEGER REFERENCES schedules(id) ON DELETE SET NULL,
    task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
    link VARCHAR(300),
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_notifications_unread
    ON system_notifications(is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_notifications_schedule
    ON system_notifications(schedule_id);
CREATE INDEX IF NOT EXISTS idx_system_notifications_task
    ON system_notifications(task_id);
