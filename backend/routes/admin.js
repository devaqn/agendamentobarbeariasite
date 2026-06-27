const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/connection');
const auth = require('../middleware/auth');

// POST /api/admin/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email e senha obrigatórios' });

  try {
    const result = await db.query('SELECT * FROM admins WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Credenciais inválidas' });

    const admin = result.rows[0];
    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) return res.status(401).json({ error: 'Credenciais inválidas' });

    const token = jwt.sign(
      { id: admin.id, email: admin.email, name: admin.name },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ token, admin: { id: admin.id, email: admin.email, name: admin.name } });
  } catch {
    res.status(500).json({ error: 'Erro no login' });
  }
});

// GET /api/admin/dashboard
router.get('/dashboard', auth, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const [todayAppts, revenue, pending, upcoming, weekly] = await Promise.all([
      db.query(`
        SELECT COUNT(*) AS count FROM appointments a
        LEFT JOIN time_slots ts ON a.time_slot_id = ts.id
        WHERE DATE(ts.slot_datetime AT TIME ZONE 'America/Sao_Paulo') = $1
          AND a.status != 'cancelled'`, [today]),

      db.query(`
        SELECT COALESCE(SUM(signal_amount), 0) AS total
        FROM appointments WHERE payment_status = 'paid'`),

      db.query(`
        SELECT COUNT(*) AS count FROM appointments
        WHERE payment_status = 'pending' AND status NOT IN ('cancelled', 'completed')
          AND created_at > NOW() - INTERVAL '48 hours'`),

      db.query(`
        SELECT a.id, a.client_name, a.client_phone, a.status, a.payment_status,
               a.signal_amount, s.name AS service_name, ts.slot_datetime
        FROM appointments a
        LEFT JOIN services s ON a.service_id = s.id
        LEFT JOIN time_slots ts ON a.time_slot_id = ts.id
        WHERE ts.slot_datetime > NOW() AND a.status != 'cancelled'
        ORDER BY ts.slot_datetime ASC LIMIT 8`),

      db.query(`
        SELECT DATE(ts.slot_datetime AT TIME ZONE 'America/Sao_Paulo') AS date,
               COUNT(*) AS total,
               COUNT(CASE WHEN a.status = 'confirmed' THEN 1 END) AS confirmed,
               COALESCE(SUM(CASE WHEN a.payment_status = 'paid' THEN a.signal_amount ELSE 0 END), 0) AS revenue
        FROM appointments a
        LEFT JOIN time_slots ts ON a.time_slot_id = ts.id
        WHERE ts.slot_datetime >= NOW() - INTERVAL '7 days'
        GROUP BY DATE(ts.slot_datetime AT TIME ZONE 'America/Sao_Paulo')
        ORDER BY date ASC`)
    ]);

    res.json({
      today_appointments: parseInt(todayAppts.rows[0].count),
      total_revenue: parseFloat(revenue.rows[0].total),
      pending_payments: parseInt(pending.rows[0].count),
      upcoming_appointments: upcoming.rows,
      weekly_data: weekly.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar dashboard' });
  }
});

// GET /api/admin/services
router.get('/services', auth, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM services ORDER BY id');
    res.json(result.rows);
  } catch {
    res.status(500).json({ error: 'Erro ao buscar serviços' });
  }
});

// POST /api/admin/services
router.post('/services', auth, async (req, res) => {
  const { name, description, duration_minutes, price, signal_percentage } = req.body;
  if (!name || price === undefined) return res.status(400).json({ error: 'Nome e preço obrigatórios' });

  try {
    const result = await db.query(
      `INSERT INTO services (name, description, duration_minutes, price, signal_percentage)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name, description, duration_minutes || 45, price, signal_percentage ?? 30]
    );
    res.status(201).json(result.rows[0]);
  } catch {
    res.status(500).json({ error: 'Erro ao criar serviço' });
  }
});

// PATCH /api/admin/services/:id
router.patch('/services/:id', auth, async (req, res) => {
  const { name, description, duration_minutes, price, signal_percentage, active } = req.body;
  try {
    const result = await db.query(
      `UPDATE services SET
         name = COALESCE($1, name),
         description = COALESCE($2, description),
         duration_minutes = COALESCE($3, duration_minutes),
         price = COALESCE($4, price),
         signal_percentage = COALESCE($5, signal_percentage),
         active = COALESCE($6, active)
       WHERE id = $7 RETURNING *`,
      [name, description, duration_minutes, price, signal_percentage, active, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Serviço não encontrado' });
    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ error: 'Erro ao atualizar serviço' });
  }
});

// GET /api/admin/config — retorna info pública da barbearia
router.get('/config', (req, res) => {
  res.json({
    name: process.env.BARBERSHOP_NAME || 'Barbearia',
    phone: process.env.BARBERSHOP_PHONE || '',
    address: process.env.BARBERSHOP_ADDRESS || '',
    instagram: process.env.BARBERSHOP_INSTAGRAM || '',
    mp_public_key: process.env.MP_PUBLIC_KEY || ''
  });
});

module.exports = router;
