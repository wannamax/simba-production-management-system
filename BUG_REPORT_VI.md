# Báo cáo rà soát và thay đổi

## Lỗi/rủi ro chính đã xử lý
1. `bcrypt@5.1.1` là native dependency cũ, cài lỗi trên Node mới; source hiện không sử dụng bcrypt/JWT nên đã loại bỏ dependency thừa.
2. Frontend gắn cứng `http://localhost:3000/api`; trên máy khách, localhost là chính máy khách. Đã đổi sang `/api` cùng domain và Nginx reverse proxy.
3. Create React App/react-scripts và Electron làm triển khai nặng. Đã chuyển build sang Vite và loại Electron khỏi luồng production.
4. Docker Compose cũ không mount schema vào PostgreSQL, nên database mới không tự khởi tạo. Đã thêm chuỗi init SQL.
5. Schema gốc không chứa bảng task trong `database.sql`; đã đưa migration task vào thứ tự khởi tạo.
6. Hai router cùng mount `/api/tasks`; đã sắp xếp action routes trước CRUD route để tránh `/:id` bắt nhầm action.
7. Graceful shutdown gọi `app.close()` (Express app không có hàm này). Đã giữ HTTP server và gọi `server.close()`.
8. PostgreSQL/backend trước đây mở cổng trực tiếp. Bản mới chỉ mở Nginx, giảm bề mặt tấn công.
9. Không có healthcheck/depends_on theo trạng thái. Đã bổ sung healthcheck cho database, backend, web.
10. Một số file nguồn có encoding không đồng nhất. Các file frontend đã được chuẩn hóa UTF-8 trong quá trình chuyển đổi.

## Công nghệ bản mới
- Node.js 22 container
- Express 5
- React 18 + Vite 7
- Ant Design 6
- PostgreSQL 17
- Nginx 1.27
- Docker Compose specification hiện hành

## Hạn chế chưa thể khẳng định đã hết
- Chưa có bộ test nghiệp vụ tự động từ dự án gốc.
- Dữ liệu backup cũ chưa được restore để kiểm tra tương thích.
- Một số migration cũ trùng số và chứa script thủ công; bản triển khai chỉ chọn chuỗi migration cần thiết.
- Hệ thống có bảng users nhưng chưa có luồng đăng nhập/phân quyền hoàn chỉnh trong source hiện tại.

## Kết quả kiểm tra bản đóng gói
- Backend: `npm ci` thành công.
- Backend: kiểm tra cú pháp toàn bộ file JavaScript thành công.
- Backend: `npm audit --omit=dev` báo 0 vulnerability.
- Frontend: `npm ci` thành công.
- Frontend: `vite build` thành công; tạo production bundle.
- Frontend: `npm audit` báo 0 vulnerability.
- Docker Compose: YAML và cấu trúc service được kiểm tra tĩnh thành công.
- Chưa chạy end-to-end bằng Docker trong môi trường này vì Docker daemon không được cung cấp.

## Việc nên làm sau khi cài trên máy chủ thật
1. Chạy `docker compose up -d --build` trên một máy thử nghiệm.
2. Kiểm tra tạo/sửa/xóa khách hàng, dự án, nhân viên và task.
3. Kiểm tra import CSV, pause/resume/cancel task và xuất báo cáo.
4. Restore một bản backup thật vào môi trường staging trước khi chuyển dữ liệu production.
