const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const auth = require('../middleware/auth');

// GET /api/slots — horários disponíveis (público)
router.get('/', async (req, res) => {
  const { date } = req.query;
  try {
    let query = `SELECT id, slot_datetime, is_available
                 FROM time_slots
                 WHERE is_available = true AND slot_datetime > NOW()`;
    const params = [];

    if (date) {
      params.push(date);
      query += ` AND DATE(slot_datetime AT TIME ZONE 'America/Sao_Paulo') = $1`;
    }

    query += ' ORDER BY slot_datetime ASC';
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch {
    res.status(500).json({ error: 'Erro ao buscar horários' });
  }
});

// GET /api/slots/dates — datas com horários disponíveis (público)
router.get('/dates', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        DATE(slot_datetime AT TIME ZONE 'America/Sao_Paulo') AS date,
        COUNT(*) AS available_count
      FROM time_slots
      WHERE is_available = true AND slot_datetime > NOW()
      GROUP BY DATE(slot_datetime AT TIME ZONE 'America/Sao_Paulo')
      ORDER BY date ASC
    `);
    res.json(result.rows);
  } catch {
    res.status(500).json({ error: 'Erro ao buscar datas' });
  }
});

// GET /api/slots/all — todos os horários futuros com status (admin)
router.get('/all', auth, async (req, res) => {
  const { date } = req.query;
  try {
    let query = `
      SELECT ts.*, a.client_name, a.status AS appointment_status
      FROM time_slots ts
      LEFT JOIN appointments a ON a.time_slot_id = ts.id AND a.status != 'cancelled'
      WHERE ts.slot_datetime > NOW()
    `;
    const params = [];

    if (date) {
      params.push(date);
      query += ` AND DATE(ts.slot_datetime AT TIME ZONE 'America/Sao_Paulo') = $1`;
    }

    query += ' ORDER BY ts.slot_datetime ASC';
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch {
    res.status(500).json({ error: 'Erro ao buscar horários' });
  }
});

// POST /api/slots — adiciona horário único (admin)
router.post('/', auth, async (req, res) => {
  const { slot_datetime } = req.body;
  if (!slot_datetime) return res.status(400).json({ error: 'Data/hora obrigatória' });

  try {
    const result = await db.query(
      'INSERT INTO time_slots (slot_datetime) VALUES ($1) RETURNING *',
      [slot_datetime]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Horário já existe' });
    res.status(500).json({ error: 'Erro ao criar horário' });
  }
});

// POST /api/slots/batch — adiciona múltiplos horários (admin)
router.post('/batch', auth, async (req, res) => {
  const { slots } = req.body;
  if (!slots || !Array.isArray(slots) || slots.length === 0) {
    return res.status(400).json({ error: 'Lista de horários obrigatória' });
  }

  try {
    const placeholders = slots.map((_, i) => `($${i + 1})`).join(', ');
    const result = await db.query(
      `INSERT INTO time_slots (slot_datetime) VALUES ${placeholders} ON CONFLICT DO NOTHING RETURNING *`,
      slots
    );
    res.status(201).json({ created: result.rows.length, slots: result.rows });
  } catch {
    res.status(500).json({ error: 'Erro ao criar horários' });
  }
});

// DELETE /api/slots/:id — remove horário (admin)
router.delete('/:id', auth, async (req, res) => {
  const { id } = req.params;
  try {
    const check = await db.query('SELECT * FROM time_slots WHERE id = $1', [id]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Horário não encontrado' });
    if (!check.rows[0].is_available) {
      return res.status(400).json({ error: 'Não é possível remover um horário já agendado' });
    }

    await db.query('DELETE FROM time_slots WHERE id = $1', [id]);
    res.json({ message: 'Horário removido' });
  } catch {
    res.status(500).json({ error: 'Erro ao remover horário' });
  }
});

module.exports = router;
