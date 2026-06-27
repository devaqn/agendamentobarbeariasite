const express = require('express');
const router = express.Router();
const db = require('../db/connection');

// GET /api/services — público, retorna serviços ativos
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, name, description, duration_minutes, price, signal_percentage FROM services WHERE active = true ORDER BY id'
    );
    res.json(result.rows);
  } catch {
    res.status(500).json({ error: 'Erro ao buscar serviços' });
  }
});

module.exports = router;
