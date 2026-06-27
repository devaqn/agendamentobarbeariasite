const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../../backend/db/connection', () => ({ query: jest.fn() }));

const app = require('../../backend/server');
const db = require('../../backend/db/connection');

const token = jwt.sign(
  { id: 1, email: 'admin@test.com', name: 'Admin' },
  'test-jwt-secret-key-for-testing-only',
  { expiresIn: '1h' }
);

const validPayload = {
  client_name: 'João Silva',
  client_phone: '(11) 99999-9999',
  client_email: 'joao@test.com',
  service_id: 1,
  time_slot_id: 1,
  notes: 'Nenhuma'
};

describe('POST /api/appointments', () => {
  beforeEach(() => jest.clearAllMocks());

  it('cria agendamento com sucesso e bloqueia o horário', async () => {
    const mockSlot = { id: 1, slot_datetime: '2026-07-01T10:00:00Z', is_available: true };
    const mockService = { id: 1, name: 'Corte', price: 50, signal_percentage: 30, active: true };
    const mockAppt = {
      id: 1, client_name: 'João Silva', service_id: 1,
      time_slot_id: 1, signal_amount: '15.00', status: 'pending', payment_status: 'pending'
    };

    db.query
      .mockResolvedValueOnce({ rows: [mockSlot] })    // verifica disponibilidade do slot
      .mockResolvedValueOnce({ rows: [mockService] }) // verifica serviço ativo
      .mockResolvedValueOnce({ rows: [] })            // bloqueia slot
      .mockResolvedValueOnce({ rows: [mockAppt] });   // insere agendamento

    const res = await request(app).post('/api/appointments').send(validPayload);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('appointment');
    expect(res.body).toHaveProperty('service');
    expect(res.body).toHaveProperty('signal_amount', 15);
    expect(db.query).toHaveBeenCalledTimes(4);
  });

  it('retorna 400 quando campos obrigatórios estão ausentes', async () => {
    const res = await request(app)
      .post('/api/appointments')
      .send({ client_name: 'João' }); // falta phone, service_id, time_slot_id

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('retorna 409 quando horário não está disponível', async () => {
    db.query.mockResolvedValueOnce({ rows: [] }); // slot indisponível

    const res = await request(app).post('/api/appointments').send(validPayload);

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('disponível');
  });

  it('retorna 404 quando serviço não encontrado ou inativo', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1, is_available: true }] }) // slot ok
      .mockResolvedValueOnce({ rows: [] }); // serviço não encontrado

    const res = await request(app).post('/api/appointments').send(validPayload);

    expect(res.status).toBe(404);
  });

  it('calcula sinal correto (preço × porcentagem)', async () => {
    const mockService = { id: 1, name: 'Barba', price: 35, signal_percentage: 30, active: true };
    const mockAppt = {
      id: 2, client_name: 'João', service_id: 1,
      time_slot_id: 1, signal_amount: '10.50', status: 'pending'
    };

    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1, is_available: true }] })
      .mockResolvedValueOnce({ rows: [mockService] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [mockAppt] });

    const res = await request(app).post('/api/appointments').send(validPayload);

    expect(res.status).toBe(201);
    expect(res.body.signal_amount).toBeCloseTo(10.5, 1);
  });
});

describe('GET /api/appointments (admin)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna lista de agendamentos com autenticação', async () => {
    const mockAppts = [
      { id: 1, client_name: 'João', service_name: 'Corte', status: 'confirmed' }
    ];
    db.query.mockResolvedValue({ rows: mockAppts });

    const res = await request(app)
      .get('/api/appointments')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
  });

  it('retorna 401 sem autenticação', async () => {
    const res = await request(app).get('/api/appointments');

    expect(res.status).toBe(401);
  });

  it('aceita filtro por data', async () => {
    db.query.mockResolvedValue({ rows: [] });

    await request(app)
      .get('/api/appointments?date=2026-07-01')
      .set('Authorization', `Bearer ${token}`);

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("DATE(ts.slot_datetime"),
      expect.arrayContaining(['2026-07-01'])
    );
  });

  it('aceita filtro por status', async () => {
    db.query.mockResolvedValue({ rows: [] });

    await request(app)
      .get('/api/appointments?status=confirmed')
      .set('Authorization', `Bearer ${token}`);

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('a.status = '),
      expect.arrayContaining(['confirmed'])
    );
  });
});

describe('GET /api/appointments/:id (admin)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna agendamento por ID', async () => {
    const mockAppt = { id: 1, client_name: 'João', service_name: 'Corte', slot_datetime: '2026-07-01T10:00:00Z' };
    db.query.mockResolvedValue({ rows: [mockAppt] });

    const res = await request(app)
      .get('/api/appointments/1')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
    expect(res.body.client_name).toBe('João');
  });

  it('retorna 404 quando agendamento não encontrado', async () => {
    db.query.mockResolvedValue({ rows: [] });

    const res = await request(app)
      .get('/api/appointments/999')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/appointments/:id/status (admin)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('atualiza status para confirmed', async () => {
    const mockAppt = { id: 1, status: 'confirmed', time_slot_id: 1 };
    db.query.mockResolvedValue({ rows: [mockAppt] });

    const res = await request(app)
      .patch('/api/appointments/1/status')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'confirmed' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('confirmed');
  });

  it('retorna 400 para status inválido', async () => {
    const res = await request(app)
      .patch('/api/appointments/1/status')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'status-invalido' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('libera o horário ao cancelar o agendamento', async () => {
    const mockAppt = { id: 1, status: 'cancelled', time_slot_id: 5 };
    db.query
      .mockResolvedValueOnce({ rows: [mockAppt] }) // update appointment
      .mockResolvedValueOnce({ rows: [] });         // libera slot

    const res = await request(app)
      .patch('/api/appointments/1/status')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'cancelled' });

    expect(res.status).toBe(200);
    // Deve ter executado 2 queries: update appointment + liberar slot
    expect(db.query).toHaveBeenCalledTimes(2);
    expect(db.query).toHaveBeenLastCalledWith(
      expect.stringContaining('is_available = true'),
      [5]
    );
  });

  it('não libera horário ao marcar como completed', async () => {
    const mockAppt = { id: 1, status: 'completed', time_slot_id: 5 };
    db.query.mockResolvedValueOnce({ rows: [mockAppt] });

    const res = await request(app)
      .patch('/api/appointments/1/status')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'completed' });

    expect(res.status).toBe(200);
    expect(db.query).toHaveBeenCalledTimes(1); // apenas update appointment
  });

  it('retorna 404 quando agendamento não encontrado', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .patch('/api/appointments/999/status')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'confirmed' });

    expect(res.status).toBe(404);
  });
});
