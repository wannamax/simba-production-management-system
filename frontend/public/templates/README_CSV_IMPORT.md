# Hướng dẫn Import Địa điểm từ CSV

## 📋 Các trường bắt buộc

### ✅ BẮT BUỘC (Required)
- **location_name**: Tên địa điểm (VD: Chi nhánh Quận 1)
- **location_address**: Địa chỉ đầy đủ (VD: 123 Nguyễn Huệ)

### 🔸 TÙY CHỌN (Optional)
- **location_city**: Thành phố (VD: TP.HCM, Hà Nội)
- **location_district**: Quận/Huyện (VD: Quận 1, Huyện Củ Chi)
- **location_ward**: Phường/Xã (VD: Phường Bến Nghé)
- **contact_person**: Người liên hệ tại địa điểm
- **contact_phone**: Số điện thoại (VD: 0901234567)
- **contact_email**: Email liên hệ
- **installation_date**: Ngày lắp đặt (Format: YYYY-MM-DD, VD: 2024-02-01)
- **installation_time_start**: Giờ bắt đầu (Format: HH:mm, VD: 08:00)
- **installation_time_end**: Giờ kết thúc (Format: HH:mm, VD: 12:00)
- **estimated_hours**: Số giờ dự kiến (VD: 4, 4.5, 8)
- **product_info**: Thông tin sản phẩm lắp đặt
- **work_description**: Mô tả công việc chi tiết
- **notes**: Ghi chú thêm

## 📝 Ví dụ dữ liệu hợp lệ

```csv
location_name,location_address,location_city,location_district,contact_person,contact_phone,installation_date,installation_time_start,installation_time_end,estimated_hours
Chi nhánh Q1,123 Nguyễn Huệ,TP.HCM,Quận 1,Nguyễn Văn A,0901234567,2024-02-01,08:00,12:00,4
Chi nhánh Q3,456 Lê Văn Sỹ,TP.HCM,Quận 3,Trần Thị B,0912345678,2024-02-02,13:00,17:00,4