# Báo cáo nâng cấp từ bản cũ

## Đã thay đổi
- Bỏ Electron và Create React App.
- React 19, Vite 8, Ant Design 6.
- Express 5, Node.js 22 LTS, PostgreSQL 17.
- API chuyển sang same-origin `/api` qua Nginx.
- Docker multi-stage, npm cache mount, Debian slim để tránh lỗi `Exit handler never called` gặp trên image Alpine.
- Database/backend không mở trực tiếp ra LAN.
- Thêm healthcheck, backup, restore, update và status scripts.
- Dọn file backup và file tạm khỏi source.

## Giữ nguyên nghiệp vụ
Các route, schema và màn hình hiện có được giữ lại để giảm rủi ro thay đổi quy trình vận hành.

## Việc nên làm tiếp theo
- Bổ sung đăng nhập và phân quyền nếu hệ thống dùng ngoài mạng tin cậy.
- Viết test API cho các luồng tạo dự án, phân công task, tạm dừng và hoàn thành.
- Thiết lập backup tự động ngoài máy chủ.
