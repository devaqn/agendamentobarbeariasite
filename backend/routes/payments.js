const express = require('express');
const router = express.Router();
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const db = require('../db/connection');

const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN
});

// POST /api/payments/create — cria preferência de pagamento
router.post('/create', async (req, res) => {
  const { appointment_id } = req.body;
  if (!appointment_id) return res.status(400).json({ error: 'ID do agendamento obrigatório' });

  try {
    const apptResult = await db.query(
      `SELECT a.*, s.name AS service_name
       FROM appointments a
       LEFT JOIN services s ON a.service_id = s.id
       WHERE a.id = $1`,
      [appointment_id]
    );

    if (apptResult.rows.length === 0) return res.status(404).json({ error: 'Agendamento não encontrado' });

    const appt = apptResult.rows[0];
    if (appt.payment_status === 'paid') return res.status(400).json({ error: 'Pagamento já realizado' });

    const signalAmount = parseFloat(appt.signal_amount);

    const preference = new Preference(mpClient);
    const body = {
      items: [{
        title: `Sinal - ${appt.service_name}`,
        quantity: 1,
        unit_price: signalAmount > 0 ? signalAmount : 0.01,
        currency_id: 'BRL'
      }],
      payer: {
        name: appt.client_name,
        email: appt.client_email || 'cliente@email.com',
        phone: { number: appt.client_phone.replace(/\D/g, '') }
      },
      back_urls: {
        success: `${process.env.FRONTEND_URL}/?payment=success&id=${appointment_id}`,
        failure: `${process.env.FRONTEND_URL}/?payment=failure&id=${appointment_id}`,
        pending: `${process.env.FRONTEND_URL}/?payment=pending&id=${appointment_id}`
      },
      auto_return: 'approved',
      notification_url: `${process.env.BACKEND_URL}/api/payments/webhook`,
      external_reference: appointment_id.toString(),
      statement_descriptor: process.env.BARBERSHOP_NAME || 'Barbearia'
    };

    const result = await preference.create({ body });

    await db.query(
      'UPDATE appointments SET payment_preference_id = $1 WHERE id = $2',
      [result.id, appointment_id]
    );

    const isSandbox = process.env.NODE_ENV !== 'production';
    res.json({
      preference_id: result.id,
      checkout_url: isSandbox ? result.sandbox_init_point : result.init_point
    });
  } catch (err) {
    console.error('Erro ao criar pagamento:', err);
    res.status(500).json({ error: 'Erro ao criar pagamento no Mercado Pago' });
  }
});

// POST /api/payments/webhook — recebe notificações do Mercado Pago
router.post('/webhook', async (req, res) => {
  const { type, data } = req.body;

  res.status(200).json({ received: true });

  if (type !== 'payment' || !data?.id) return;

  try {
    const payment = new Payment(mpClient);
    const paymentData = await payment.get({ id: data.id });

    if (paymentData.status === 'approved') {
      await db.query(
        `UPDATE appointments
         SET payment_status = 'paid', payment_id = $1, status = 'confirmed'
         WHERE id = $2`,
        [data.id.toString(), paymentData.external_reference]
      );
    } else if (['rejected', 'cancelled'].includes(paymentData.status)) {
      const apptId = paymentData.external_reference;
      const appt = await db.query('SELECT time_slot_id FROM appointments WHERE id = $1', [apptId]);
      if (appt.rows.length > 0) {
        await db.query('UPDATE time_slots SET is_available = true WHERE id = $1', [appt.rows[0].time_slot_id]);
        await db.query(
          `UPDATE appointments SET payment_status = 'failed', status = 'cancelled' WHERE id = $1`,
          [apptId]
        );
      }
    }
  } catch (err) {
    console.error('Erro no webhook:', err);
  }
});

// GET /api/payments/status/:id — verifica status do pagamento (público)
router.get('/status/:appointment_id', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT payment_status, status FROM appointments WHERE id = $1',
      [req.params.appointment_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Agendamento não encontrado' });
    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ error: 'Erro ao verificar status' });
  }
});

module.exports = router;
