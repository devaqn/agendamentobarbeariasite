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

// ── Mock de agendamentos ──────────────────────────────────────
function mockAppointments() {
  const now = new Date();
  const d = (h, m, daysAhead) => {
    const dt = new Date(now);
    dt.setDate(dt.getDate() + daysAhead);
    dt.setHours(h, m, 0, 0);
    return dt.toISOString();
  };
  return [
    { id: 1001, client_name: 'Lucas Ferreira',  client_phone: '(11) 98765-4321', service_id: 1, service_name: 'Corte de Cabelo', service_price: 50, slot_datetime: d(9,  0, 0), status: 'confirmed',  payment_status: 'paid',    signal_amount: 25.00 },
    { id: 1002, client_name: 'Marcos Almeida',  client_phone: '(11) 91234-5678', service_id: 3, service_name: 'Corte + Barba',  service_price: 75, slot_datetime: d(10, 0, 0), status: 'confirmed',  payment_status: 'paid',    signal_amount: 37.50 },
    { id: 1003, client_name: 'Thiago Ramos',    client_phone: '(11) 99999-1234', service_id: 2, service_name: 'Barba',           service_price: 35, slot_datetime: d(11, 0, 0), status: 'pending',    payment_status: 'pending', signal_amount: 17.50 },
    { id: 1004, client_name: 'Rafael Costa',    client_phone: '(11) 97777-8888', service_id: 1, service_name: 'Corte de Cabelo', service_price: 50, slot_datetime: d(14, 0, 0), status: 'pending',    payment_status: 'pending', signal_amount: 25.00 },
    { id: 1005, client_name: 'Bruno Mendes',    client_phone: '(11) 96666-3333', service_id: 4, service_name: 'Sobrancelha',     service_price: 20, slot_datetime: d(15, 0, 0), status: 'confirmed',  payment_status: 'paid',    signal_amount: 0     },
    { id: 1006, client_name: 'Gabriel Lima',    client_phone: '(11) 95555-2222', service_id: 3, service_name: 'Corte + Barba',  service_price: 75, slot_datetime: d(9,  0, 1), status: 'confirmed',  payment_status: 'paid',    signal_amount: 37.50 },
    { id: 1007, client_name: 'Pedro Oliveira',  client_phone: '(11) 94444-1111', service_id: 1, service_name: 'Corte de Cabelo', service_price: 50, slot_datetime: d(10,30, 1), status: 'confirmed',  payment_status: 'paid',    signal_amount: 25.00 },
    { id: 1008, client_name: 'Diego Santos',    client_phone: '(11) 93333-9999', service_id: 2, service_name: 'Barba',           service_price: 35, slot_datetime: d(14, 0, 2), status: 'pending',    payment_status: 'pending', signal_amount: 17.50 },
    { id: 1009, client_name: 'Fernando Rocha',  client_phone: '(11) 92222-7777', service_id: 1, service_name: 'Corte de Cabelo', service_price: 50, slot_datetime: d(9,  0,-1), status: 'completed',  payment_status: 'paid',    signal_amount: 25.00 },
    { id: 1010, client_name: 'André Carvalho',  client_phone: '(11) 91111-6666', service_id: 3, service_name: 'Corte + Barba',  service_price: 75, slot_datetime: d(11, 0,-1), status: 'cancelled',  payment_status: 'pending', signal_amount: 37.50 },
  ];
}

// ── Mock de slots ─────────────────────────────────────────────
function mockSlots() {
  const now = new Date();
  const appts = mockAppointments();
  const slots = [];
  let id = 200;

  for (let day = 0; day <= 7; day++) {
    const dt = new Date(now);
    dt.setDate(dt.getDate() + day);
    if (dt.getDay() === 0) continue;
    const dateStr = dt.toISOString().split('T')[0];

    for (let h = 9; h < 18; h++) {
      for (const m of [0, 30]) {
        const pad = n => String(n).padStart(2, '0');
        const slotKey = `${dateStr}T${pad(h)}:${pad(m)}`;
        const occupied = appts.find(a =>
          a.slot_datetime.startsWith(slotKey) && a.status !== 'cancelled'
        );
        slots.push({
          id: id++,
          slot_datetime: `${dateStr}T${pad(h)}:${pad(m)}:00`,
          is_available: !occupied,
          client_name: occupied ? occupied.client_name : null,
          appointment_status: occupied ? occupied.status : null,
          service_name: occupied ? occupied.service_name : null
        });
      }
    }
  }
  return slots;
}

app.get('/api/admin/dashboard', auth, (req, res) => {
  const appts = mockAppointments();
  const today = new Date().toISOString().split('T')[0];
  const todayAppts = appts.filter(a => a.slot_datetime.startsWith(today) && a.status !== 'cancelled');
  const revenue = appts.filter(a => a.payment_status === 'paid').reduce((s, a) => s + a.signal_amount, 0);
  const pending = appts.filter(a => a.payment_status === 'pending' && a.status !== 'cancelled');
  const upcoming = appts
    .filter(a => a.status !== 'cancelled' && a.status !== 'completed' && new Date(a.slot_datetime) > new Date())
    .slice(0, 6);
  res.json({
    today_appointments: todayAppts.length,
    total_revenue: revenue,
    pending_payments: pending.length,
    upcoming_appointments: upcoming,
    weekly_data: []
  });
});

app.get('/api/admin/services', auth, (req, res) => res.json(SERVICES));
app.post('/api/admin/services', auth, (req, res) => res.status(201).json({ ...req.body, id: 99, active: true }));
app.patch('/api/admin/services/:id', auth, (req, res) => {
  const id = parseInt(req.params.id);
  const svc = SERVICES.find(s => s.id === id) || {};
  res.json({ ...svc, ...req.body, id });
});

app.get('/api/slots/all', auth, (req, res) => {
  const { date } = req.query;
  let slots = mockSlots();
  if (date) slots = slots.filter(s => s.slot_datetime.startsWith(date));
  res.json(slots);
});
app.post('/api/slots', auth, (req, res) => res.status(201).json({ id: 299, ...req.body, is_available: true }));
app.post('/api/slots/batch', auth, (req, res) => {
  const { slots } = req.body;
  res.status(201).json({ created: slots ? slots.length : 0, slots: [] });
});
app.delete('/api/slots/:id', auth, (req, res) => res.json({ message: 'Horário removido' }));

app.get('/api/appointments', auth, (req, res) => {
  const { date, status } = req.query;
  let appts = mockAppointments();
  if (date) appts = appts.filter(a => a.slot_datetime.startsWith(date));
  if (status) appts = appts.filter(a => a.status === status);
  res.json(appts);
});
app.get('/api/appointments/:id', auth, (req, res) => {
  const appt = mockAppointments().find(a => a.id === parseInt(req.params.id));
  if (!appt) return res.status(404).json({ error: 'Não encontrado' });
  res.json(appt);
});
app.patch('/api/appointments/:id/status', auth, (req, res) => {
  res.json({ id: parseInt(req.params.id), ...req.body });
});

app.get('/api/health', (req, res) => res.json({ status: 'ok', mode: 'demo' }));

module.exports.handler = serverless(app);
