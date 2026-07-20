# Quy trình phát hành 2.2.1

1. Đẩy source lên repository GitHub `wannamax/production-management-system`.
2. Mở Actions, chạy workflow **Release 2.2.1**, hoặc tạo tag `v2.2.1`.
3. Workflow chỉ publish image sau khi đạt: migration database, database health, backend health, frontend health, import/export Excel, backup và restore.
4. Trong GitHub Packages, đặt `simba-pms-backend` và `simba-pms-web` thành Public, hoặc cấp PAT `read:packages` cho máy cài đặt.
5. Chỉ sau khi workflow xanh mới dùng gói production installer.
