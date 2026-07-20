const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// GET all customers
router.get('/', async (req, res) => {
  try {
    const { search } = req.query;
    let query = 'SELECT * FROM customers WHERE 1=1';
    const params = [];
    
    if (search) {
      query += ' AND (company_name ILIKE $1 OR customer_code ILIKE $1)';
      params.push(`%${search}%`);
    }
    
    query += ' ORDER BY company_name';
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
    const result = await pool.query('SELECT * FROM customers WHERE id = $1', [req.params.id]);
    
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
  try {
    const { company_name, contact_person, phone, email, address, tax_code } = req.body;
    
    const codeResult = await pool.query("SELECT COUNT(*) as count FROM customers");
    const customerCode = `KH${String(parseInt(codeResult.rows[0].count) + 1).padStart(5, '0')}`;
    
    const result = await pool.query(
      `INSERT INTO customers (customer_code, company_name, contact_person, phone, email, address, tax_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [customerCode, company_name, contact_person, phone, email, address, tax_code]
    );
    
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT update customer
router.put('/:id', async (req, res) => {
  try {
    const { company_name, contact_person, phone, email, address, tax_code } = req.body;
    
    const result = await pool.query(
      `UPDATE customers SET 
        company_name = $1, contact_person = $2, phone = $3,
        email = $4, address = $5, tax_code = $6, updated_at = NOW()
       WHERE id = $7 RETURNING *`,
      [company_name, contact_person, phone, email, address, tax_code, req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy khách hàng' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: error.message });
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