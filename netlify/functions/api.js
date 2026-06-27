const serverless = require('serverless-http');
const express = require('express');

const app = express();
app.use(express.json());

// ── Dados fixos da barbearia ──────────────────────────────────
const CONFIG = {
  name: 'Barbearia Classic',
  phone: '(11) 99999-9999',
  address: 'Rua Exemplo, 123 – Centro',
  instagram: '@barbeariaclassic',
  mp_public_key: ''
};

const SERVICES = [
  { id: 1, name: 'Corte de Cabelo', description: 'Tesoura, máquina, acabamento no capricho. Do social ao degradê.', duration_minutes: 45, price: 50.00, signal_percentage: 50, active: true },
  { id: 2, name: 'Barba', description: 'Toalha quente, navalha e produto. Barba alinhada do jeito que você quer.', duration_minutes: 30, price: 35.00, signal_percentage: 50, active: true },
  { id: 3, name: 'Corte + Barba', description: 'Os dois juntos, sem correria. Sai daqui pronto pra qualquer ocasião.', duration_minutes: 70, price: 75.00, signal_percentage: 50, active: true },
  { id: 4, name: 'Sobrancelha', description: 'Alinhamento rápido com pinça ou gilete. Faz diferença no visual.', duration_minutes: 20, price: 20.00, signal_percentage: 0, active: true }
];

// ── Helpers ───────────────────────────────────────────────────

// Gera os próximos N dias úteis (seg–sab) a partir de amanhã
function nextWorkdays(n) {
  const days = [];
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (days.length < n) {
    if (d.getDay() !== 0) days.push(d.toISOString().split('T')[0]);
    d.setDate(d.getDate() + 1);
  }
  return days;
}

// Gera horários disponíveis para uma data (09:00–17:30 de 30 em 30 min)
// Usa um hash simples para que a mesma data sempre retorne os mesmos slots
function slotsForDate(date) {
  const hash = date.split('-').reduce((acc, n) => acc + parseInt(n), 0);
  const all = [];
  let id = 1;
  for (let h = 9; h < 18; h++) {
    for (const m of [0, 30]) {
      const pad = (n) => String(n).padStart(2, '0');
      all.push({
        id: id++,
        slot_datetime: `${date}T${pad(h)}:${pad(m)}:00`,
        is_available: true
      });
    }
  }
  // Remove ~3 slots de forma determinística para parecer realista
  const toRemove = new Set([(hash % 18) + 1, ((hash * 3) % 18) + 1, ((hash * 7) % 18) + 1]);
  return all.filter(s => !toRemove.has(s.id));
}

// ── Rotas públicas ────────────────────────────────────────────

app.get('/api/admin/config', (req, res) => res.json(CONFIG));

app.get('/api/services', (req, res) => res.json(SERVICES.filter(s => s.active)));

app.get('/api/slots/dates', (req, res) => {
  const days = nextWorkdays(18);
  res.json(days.map(date => ({ date, available_count: slotsForDate(date).length })));
});

app.get('/api/slots', (req, res) => {
  const { date } = req.query;
  if (!date) return res.json([]);
  res.json(slotsForDate(date));
});

app.post('/api/appointments', (req, res) => {
  const { client_name, client_phone, client_email, service_id, time_slot_id, notes } = req.body;
  if (!client_name || !client_phone || !service_id || !time_slot_id) {
    return res.status(400).json({ error: 'Campos obrigatórios faltando' });
  }
  const service = SERVICES.find(s => s.id == service_id) || SERVICES[0];
  const signal_amount = parseFloat(((service.price * service.signal_percentage) / 100).toFixed(2));
  const appointment = {
    id: Math.floor(Date.now() / 1000) % 9000 + 1000,
    client_name, client_phone, client_email,
    service_id: service.id, time_slot_id,
    status: 'pending',
    payment_status: 'pending',
    signal_amount,
    notes,
    created_at: new Date().toISOString()
  };
  res.status(201).json({ appointment, service, signal_amount });
});

app.post('/api/payments/create', (req, res) => {
  const { appointment_id } = req.body;
  if (!appointment_id) return res.status(400).json({ error: 'ID do agendamento obrigatório' });
  // Em modo demo, redireciona direto para a tela de sucesso
  res.json({
    preference_id: `demo-${appointment_id}`,
    checkout_url: `https://agendamentobarbeariateste.netlify.app/?payment=success&id=${appointment_id}`
  });
});

app.get('/api/payments/status/:id', (req, res) => {
  res.json({ payment_status: 'paid', status: 'confirmed' });
});

// ── Rotas admin (mock) ────────────────────────────────────────

app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body;
  // Credenciais demo fixas
  if (email === 'admin@barbearia.com' && password === 'admin123') {
    return res.json({
      token: 'demo-token',
      admin: { id: 1, email, name: 'Admin Demo' }
    });
  }
  res.status(401).json({ error: 'Credenciais inválidas' });
});

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return next();
  res.status(401).json({ error: 'Token não fornecido' });
}

app.get('/api/admin/dashboard', auth, (req, res) => {
  const now = Date.now();
  res.json({
    today_appointments: 4,
    total_revenue: 287.50,
    pending_payments: 1,
    upcoming_appointments: [
      { id: 1001, client_name: 'João Silva',     client_phone: '(11) 91234-5678', status: 'confirmed', payment_status: 'paid',    signal_amount: 15.00, service_name: 'Corte de Cabelo', slot_datetime: new Date(now + 1 * 3600000).toISOString() },
      { id: 1002, client_name: 'Pedro Santos',   client_phone: '(11) 99876-5432', status: 'pending',   payment_status: 'pending', signal_amount: 10.50, service_name: 'Barba',           slot_datetime: new Date(now + 3 * 3600000).toISOString() },
      { id: 1003, client_name: 'Carlos Oliveira',client_phone: '(11) 95555-1234', status: 'confirmed', payment_status: 'paid',    signal_amount: 22.50, service_name: 'Corte + Barba',  slot_datetime: new Date(now + 5 * 3600000).toISOString() },
    ],
    weekly_data: []
  });
});

app.get('/api/admin/services', auth, (req, res) => res.json(SERVICES));
app.post('/api/admin/services', auth, (req, res) => res.status(201).json({ ...req.body, id: 99, active: true }));
app.patch('/api/admin/services/:id', auth, (req, res) => res.json({ ...req.body, id: parseInt(req.params.id) }));

app.get('/api/slots/all', auth, (req, res) => res.json([]));
app.post('/api/slots', auth, (req, res) => res.status(201).json({ id: 99, ...req.body, is_available: true }));
app.post('/api/slots/batch', auth, (req, res) => res.status(201).json({ created: 0, slots: [] }));
app.delete('/api/slots/:id', auth, (req, res) => res.json({ message: 'Horário removido' }));

app.get('/api/appointments', auth, (req, res) => res.json([]));
app.get('/api/appointments/:id', auth, (req, res) => res.status(404).json({ error: 'Não encontrado' }));
app.patch('/api/appointments/:id/status', auth, (req, res) => res.json({ id: parseInt(req.params.id), ...req.body }));

app.get('/api/health', (req, res) => res.json({ status: 'ok', mode: 'demo' }));

module.exports.handler = serverless(app);
