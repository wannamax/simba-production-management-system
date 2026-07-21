-- Simba PMS 2.3.0-A: Company Profile + Vietnam two-tier administrative divisions
CREATE TABLE IF NOT EXISTS administrative_provinces (
  code varchar(2) PRIMARY KEY,
  name varchar(120) NOT NULL,
  unit_type varchar(30) NOT NULL CHECK (unit_type IN ('Tỉnh','Thành phố')),
  is_active boolean NOT NULL DEFAULT true,
  source varchar(200) NOT NULL DEFAULT 'Cục Thống kê',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS administrative_communes (
  code varchar(5) PRIMARY KEY,
  province_code varchar(2) NOT NULL REFERENCES administrative_provinces(code),
  name varchar(180) NOT NULL,
  unit_type varchar(30) NOT NULL CHECK (unit_type IN ('Phường','Xã','Đặc khu')),
  is_active boolean NOT NULL DEFAULT true,
  source varchar(200) NOT NULL DEFAULT 'Cục Thống kê',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_communes_province ON administrative_communes(province_code, name);

CREATE TABLE IF NOT EXISTS administrative_dataset_meta (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id=1),
  source_name varchar(200) NOT NULL DEFAULT 'Cục Thống kê - Danh mục hành chính',
  source_url text NOT NULL DEFAULT 'https://danhmuchanhchinh.nso.gov.vn/',
  legal_reference varchar(200) NOT NULL DEFAULT '19/2025/QĐ-TTg và cập nhật hiện hành',
  effective_date date,
  last_synced_at timestamptz,
  province_count integer NOT NULL DEFAULT 0,
  commune_count integer NOT NULL DEFAULT 0,
  sync_status varchar(30) NOT NULL DEFAULT 'seeded',
  sync_message text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO administrative_dataset_meta(id) VALUES(1) ON CONFLICT(id) DO NOTHING;

CREATE TABLE IF NOT EXISTS company_profile (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id=1),
  company_name varchar(255) NOT NULL DEFAULT '',
  short_name varchar(120),
  tax_code varchar(50),
  representative_name varchar(180),
  phone varchar(50),
  email varchar(180),
  website varchar(255),
  address_line varchar(500),
  province_code varchar(2) REFERENCES administrative_provinces(code),
  commune_code varchar(5) REFERENCES administrative_communes(code),
  postal_code varchar(20),
  logo_url text,
  timezone varchar(80) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  date_format varchar(30) NOT NULL DEFAULT 'DD/MM/YYYY',
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO company_profile(id) VALUES(1) ON CONFLICT(id) DO NOTHING;

INSERT INTO administrative_provinces(code,name,unit_type,is_active) VALUES
('01','Hà Nội','Thành phố',true),
('04','Cao Bằng','Tỉnh',true),
('08','Tuyên Quang','Tỉnh',true),
('11','Điện Biên','Tỉnh',true),
('12','Lai Châu','Tỉnh',true),
('14','Sơn La','Tỉnh',true),
('15','Lào Cai','Tỉnh',true),
('19','Thái Nguyên','Tỉnh',true),
('20','Lạng Sơn','Tỉnh',true),
('22','Quảng Ninh','Tỉnh',true),
('24','Bắc Ninh','Tỉnh',true),
('25','Phú Thọ','Tỉnh',true),
('31','Hải Phòng','Thành phố',true),
('33','Hưng Yên','Tỉnh',true),
('37','Ninh Bình','Tỉnh',true),
('38','Thanh Hóa','Tỉnh',true),
('40','Nghệ An','Tỉnh',true),
('42','Hà Tĩnh','Tỉnh',true),
('44','Quảng Trị','Tỉnh',true),
('46','Huế','Thành phố',true),
('48','Đà Nẵng','Thành phố',true),
('51','Quảng Ngãi','Tỉnh',true),
('52','Gia Lai','Tỉnh',true),
('56','Khánh Hòa','Tỉnh',true),
('66','Đắk Lắk','Tỉnh',true),
('68','Lâm Đồng','Tỉnh',true),
('75','Đồng Nai','Thành phố',true),
('79','Hồ Chí Minh','Thành phố',true),
('80','Tây Ninh','Tỉnh',true),
('82','Đồng Tháp','Tỉnh',true),
('86','Vĩnh Long','Tỉnh',true),
('91','An Giang','Tỉnh',true),
('92','Cần Thơ','Thành phố',true),
('96','Cà Mau','Tỉnh',true)
ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name, unit_type=EXCLUDED.unit_type, is_active=true, updated_at=now();

UPDATE administrative_dataset_meta SET province_count=(SELECT count(*) FROM administrative_provinces), updated_at=now() WHERE id=1;
