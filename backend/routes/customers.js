const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const CodeGenerator = require('../utils/codeGenerator');

async function validateAdministrativeAddress(provinceCode, communeCode) {
  if (!provinceCode && !communeCode) return;
  if (!provinceCode) throw Object.assign(new Error('Cần chọn Tỉnh/Thành trước Phường/Xã'), { status: 400 });
  const province = await pool.query('SELECT 1 FROM administrative_provinces WHERE code=$1 AND is_active=true', [provinceCode]);
  if (!province.rowCount) throw Object.assign(new Error('Tỉnh/Thành không hợp lệ hoặc đã ngừng sử dụng'), { status: 400 });
  if (communeCode) {
    const commune = await pool.query('SELECT 1 FROM administrative_communes WHERE code=$1 AND province_code=$2 AND is_active=true', [communeCode, provinceCode]);
    if (!commune.rowCount) throw Object.assign(new Error('Phường/Xã không thuộc Tỉnh/Thành đã chọn'), { status: 400 });
  }
}

// GET all customers
router.get('/', async (req, res) => {
  try {
    const { search } = req.query;
    let query = `SELECT c.*,p.name province_name,p.unit_type province_type,
      a.name commune_name,a.unit_type commune_type FROM customers c
      LEFT JOIN administrative_provinces p ON p.code=c.province_code
      LEFT JOIN administrative_communes a ON a.code=c.commune_code WHERE 1=1`;
    const params = [];
    
    if (search) {
      query += ' AND (c.company_name ILIKE $1 OR c.customer_code ILIKE $1)';
      params.push(`%${search}%`);
    }
    
    query += ' ORDER BY c.company_name';
    const result = await pool.query(query, params);
    
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET single customer
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(`SELECT c.*,p.name province_name,p.unit_type province_type,
      a.name commune_name,a.unit_type commune_type FROM customers c
      LEFT JOIN administrative_provinces p ON p.code=c.province_code
      LEFT JOIN administrative_communes a ON a.code=c.commune_code WHERE c.id=$1`, [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy khách hàng' });
    }
    
    const projects = await pool.query(
      'SELECT * FROM projects WHERE customer_id = $1 ORDER BY created_at DESC',
      [req.params.id]
    );
    
    res.json({
      success: true,
      data: { ...result.rows[0], projects: projects.rows }
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST create customer
router.post('/', async (req, res) => {
  let client;
  try {
    const { company_name, contact_person, phone, email, address, province_code, commune_code, tax_code, notes } = req.body;
    await validateAdministrativeAddress(province_code, commune_code);

    client = await pool.connect();
    await client.query('BEGIN');
    const customerCode = await CodeGenerator.generateCustomerCode(client);

    const result = await client.query(
      `INSERT INTO customers (customer_code,company_name,contact_person,phone,email,address,province_code,commune_code,tax_code,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [customerCode, company_name, contact_person, phone, email, address, province_code || null, commune_code || null, tax_code, notes]
    );
    await client.query('COMMIT');

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('Error:', error);
    res.status(error.status || 500).json({ success: false, message: error.message });
  } finally {
    if (client) client.release();
  }
});

// PUT update customer
router.put('/:id', async (req, res) => {
  try {
    const { company_name, contact_person, phone, email, address, province_code, commune_code, tax_code, notes } = req.body;
    await validateAdministrativeAddress(province_code, commune_code);
    
    const result = await pool.query(
      `UPDATE customers SET 
        company_name = $1, contact_person = $2, phone = $3,
        email=$4,address=$5,province_code=$6,commune_code=$7,tax_code=$8,notes=$9,updated_at=NOW()
       WHERE id=$10 RETURNING *`,
      [company_name, contact_person, phone, email, address, province_code || null, commune_code || null, tax_code, notes, req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy khách hàng' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error:', error);
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
});

// DELETE customer
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM customers WHERE id = $1 RETURNING *', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy khách hàng' });
    }
    
    res.json({ success: true, message: 'Xóa khách hàng thành công' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
