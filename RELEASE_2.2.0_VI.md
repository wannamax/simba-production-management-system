# Simba PMS 2.2.0

## Mục tiêu
- Giữ source React/Node/PostgreSQL và nghiệp vụ hiện có.
- Build image đa kiến trúc trên GitHub Actions, không build trên máy xưởng.
- Gói production chỉ pull image cố định `2.2.0` và chạy.

## Pipeline
Workflow `.github/workflows/release.yml` thực hiện:
1. Build image thử nghiệm trên `linux/amd64`.
2. Tạo PostgreSQL mới hoàn toàn.
3. Backend tự chạy toàn bộ migration có checksum.
4. Kiểm tra schema, database health, API health và frontend health.
5. Tạo task thử, import `.xlsx`, export `.xlsx`.
6. `pg_dump`, tạo database restore mới và `pg_restore`.
7. Chỉ khi toàn bộ bước đạt mới publish image `linux/amd64,linux/arm64` lên GHCR.

## Image phát hành
- `ghcr.io/wannamax/simba-pms-backend:2.2.0`
- `ghcr.io/wannamax/simba-pms-web:2.2.0`

## Kết quả kiểm tra trong môi trường tạo gói
- Backend syntax check: đạt.
- Backend dependency install: đạt.
- Frontend dependency install: đạt.
- Frontend production build: đạt, 3.708 modules.
- YAML workflow/Compose: hợp lệ.
- Shell script syntax: hợp lệ.

## Giới hạn cần nói rõ
Môi trường tạo gói không có Docker daemon và không có quyền GitHub của chủ repository, nên image GHCR chưa được publish từ đây. Kiểm thử container end-to-end được cấu hình trong workflow và phải chạy xanh trên GitHub Actions trước khi dùng installer production.
