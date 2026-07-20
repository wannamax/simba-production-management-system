# Kiến trúc v2

Browser → Nginx:80 → React static files và reverse proxy `/api` → Express API → PostgreSQL.

Chỉ Nginx công khai cổng 8080. Backend và database nằm trong Docker network nội bộ. Dữ liệu PostgreSQL và uploads dùng named volumes. Schema được nạp tự động ở lần khởi tạo database đầu tiên.

Nguyên tắc bảo trì:
1. Database là nguồn dữ liệu chính; Excel/CSV chỉ import-export.
2. Frontend không gắn cứng localhost.
3. Dependency được khóa bằng package-lock.
4. Image sử dụng Node 22 LTS Debian slim để tránh lỗi native package trên Alpine.
5. Backup trước mọi lần cập nhật.
