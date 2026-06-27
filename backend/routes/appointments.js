const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const auth = require('../middleware/auth');

// POST /api/appointments — cria agendamento (público)
router.post('/', async (req, res) => {
  const { client_name, client_phone, client_email, service_id, time_slot_id, notes } = req.body;

  if (!client_name || !client_phone || !service_id || !time_slot_id) {
    return res.status(400).json({ error: 'Nome, telefone, serviço e horário são obrigatórios' });
  }

  try {
    const slotCheck = await db.query(
      'SELECT * FROM time_slots WHERE id = $1 AND is_available = true',
      [time_slot_id]
    );
    if (slotCheck.rows.length === 0) {
      return res.status(409).json({ error: 'Este horário não está mais disponível' });
    }

    const serviceCheck = await db.query(
      'SELECT * FROM services WHERE id = $1 AND active = true',
      [service_id]
    );
    if (serviceCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Serviço não encontrado' });
    }

    const service = serviceCheck.rows[0];
    const signal_amount = ((service.price * service.signal_percentage) / 100).toFixed(2);

    // Bloqueia o horário antes de criar o agendamento
    await db.query('UPDATE time_slots SET is_available = false WHERE id = $1', [time_slot_id]);

    const result = await db.query(
      `INSERT INTO appointments
         (client_name, client_phone, client_email, service_id, time_slot_id, signal_amount, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [client_name, client_phone, client_email, service_id, time_slot_id, signal_amount, notes]
    );

    res.status(201).json({
      appointment: result.rows[0],
      service,
      signal_amount: parseFloat(signal_amount)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar agendamento' });
  }
});

// GET /api/appointments — lista agendamentos (admin)
router.get('/', auth, async (req, res) => {
  const { date, status } = req.query;
  try {
    let query = `
      SELECT a.*, s.name AS service_name, s.price AS service_price, ts.slot_datetime
      FROM appointments a
      LEFT JOIN services s ON a.service_id = s.id
      LEFT JOIN time_slots ts ON a.time_slot_id = ts.id
      WHERE 1=1
    `;
    const params = [];
    let i = 1;

    if (date) {
      query += ` AND DATE(ts.slot_datetime AT TIME ZONE 'America/Sao_Paulo') = $${i++}`;
      params.push(date);
    }
    if (status) {
      query += ` AND a.status = $${i++}`;
      params.push(status);
    }

    query += ' ORDER BY ts.slot_datetime ASC';
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch {
    res.status(500).json({ error: 'Erro ao buscar agendamentos' });
  }
});

// GET /api/appointments/:id (admin)
router.get('/:id', auth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT a.*, s.name AS service_name, s.price AS service_price, ts.slot_datetime
       FROM appointments a
       LEFT JOIN services s ON a.service_id = s.id
       LEFT JOIN time_slots ts ON a.time_slot_id = ts.id
       WHERE a.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Agendamento não encontrado' });
    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ error: 'Erro ao buscar agendamento' });
  }
});

// PATCH /api/appointments/:id/status (admin)
router.patch('/:id/status', auth, async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['pending', 'confirmed', 'cancelled', 'completed'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Status inválido' });
  }

  try {
    const result = await db.query(
      'UPDATE appointments SET status = $1 WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Agendamento não encontrado' });

    if (status === 'cancelled') {
      await db.query(
        'UPDATE time_slots SET is_available = true WHERE id = $1',
        [result.rows[0].time_slot_id]
      );
    }

    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ error: 'Erro ao atualizar status' });
  }
});

module.exports = router;
