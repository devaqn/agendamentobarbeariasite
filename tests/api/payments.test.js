const request = require('supertest');

jest.mock('../../backend/db/connection', () => ({ query: jest.fn() }));
jest.mock('mercadopago', () => {
  const mockCreate = jest.fn().mockResolvedValue({
    id: 'pref-test-123',
    init_point: 'https://www.mercadopago.com.br/checkout/redirect?pref_id=pref-test-123',
    sandbox_init_point: 'https://sandbox.mercadopago.com.br/checkout/redirect?pref_id=pref-test-123'
  });
  const mockGet = jest.fn().mockResolvedValue({
    status: 'approved',
    external_reference: '1'
  });
  return {
    MercadoPagoConfig: jest.fn().mockImplementation(() => ({})),
    Preference: jest.fn().mockImplementation(() => ({ create: mockCreate })),
    Payment: jest.fn().mockImplementation(() => ({ get: mockGet }))
  };
});

const app = require('../../backend/server');
const db = require('../../backend/db/connection');
const mercadopago = require('mercadopago');

describe('POST /api/payments/create', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna preference_id e checkout_url para agendamento com sinal', async () => {
    const mockAppt = {
      id: 1,
      client_name: 'João Silva',
      client_email: 'joao@test.com',
      client_phone: '11999999999',
      signal_amount: '15.00',
      payment_status: 'pending',
      service_name: 'Corte'
    };
    db.query
      .mockResolvedValueOnce({ rows: [mockAppt] })
      .mockResolvedValueOnce({ rows: [] }); // update preference_id

    const res = await request(app)
      .post('/api/payments/create')
      .send({ appointment_id: 1 });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('preference_id', 'pref-test-123');
    expect(res.body).toHaveProperty('checkout_url');
    expect(res.body.checkout_url).toContain('mercadopago');
  });

  it('usa sandbox_init_point em ambiente de teste (NODE_ENV=test)', async () => {
    const mockAppt = {
      id: 1,
      client_name: 'João',
      client_email: 'joao@test.com',
      client_phone: '11999999999',
      signal_amount: '20.00',
      payment_status: 'pending',
      service_name: 'Barba'
    };
    db.query
      .mockResolvedValueOnce({ rows: [mockAppt] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/payments/create')
      .send({ appointment_id: 1 });

    expect(res.status).toBe(200);
    expect(res.body.checkout_url).toContain('sandbox');
  });

  it('retorna 400 quando appointment_id está ausente', async () => {
    const res = await request(app)
      .post('/api/payments/create')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(db.query).not.toHaveBeenCalled();
  });

  it('retorna 404 quando agendamento não encontrado', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/payments/create')
      .send({ appointment_id: 999 });

    expect(res.status).toBe(404);
  });

  it('retorna 400 quando pagamento já foi realizado', async () => {
    const mockAppt = {
      id: 1,
      client_name: 'João',
      signal_amount: '15.00',
      payment_status: 'paid',
      service_name: 'Corte'
    };
    db.query.mockResolvedValueOnce({ rows: [mockAppt] });

    const res = await request(app)
      .post('/api/payments/create')
      .send({ appointment_id: 1 });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('já realizado');
  });

  it('salva preference_id no agendamento após criação', async () => {
    const mockAppt = {
      id: 1,
      client_name: 'João',
      client_email: 'joao@test.com',
      client_phone: '11999999999',
      signal_amount: '15.00',
      payment_status: 'pending',
      service_name: 'Corte'
    };
    db.query
      .mockResolvedValueOnce({ rows: [mockAppt] })
      .mockResolvedValueOnce({ rows: [] });

    await request(app)
      .post('/api/payments/create')
      .send({ appointment_id: 1 });

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('payment_preference_id'),
      expect.arrayContaining(['pref-test-123', 1])
    );
  });
});

describe('POST /api/payments/webhook', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna 200 immediately sem aguardar processamento', async () => {
    const res = await request(app)
      .post('/api/payments/webhook')
      .send({ type: 'payment', data: { id: '12345' } });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('received', true);
  });

  it('processa evento de tipo não-payment sem erros', async () => {
    const res = await request(app)
      .post('/api/payments/webhook')
      .send({ type: 'merchant_order', data: { id: '123' } });

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
  });

  it('retorna 200 mesmo sem body', async () => {
    const res = await request(app)
      .post('/api/payments/webhook')
      .send({});

    expect(res.status).toBe(200);
  });
});

describe('GET /api/payments/status/:id', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna status do pagamento do agendamento', async () => {
    db.query.mockResolvedValue({
      rows: [{ payment_status: 'pending', status: 'pending' }]
    });

    const res = await request(app).get('/api/payments/status/1');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('payment_status', 'pending');
    expect(res.body).toHaveProperty('status', 'pending');
  });

  it('retorna status paid após pagamento confirmado', async () => {
    db.query.mockResolvedValue({
      rows: [{ payment_status: 'paid', status: 'confirmed' }]
    });

    const res = await request(app).get('/api/payments/status/1');

    expect(res.status).toBe(200);
    expect(res.body.payment_status).toBe('paid');
    expect(res.body.status).toBe('confirmed');
  });

  it('retorna 404 quando agendamento não encontrado', async () => {
    db.query.mockResolvedValue({ rows: [] });

    const res = await request(app).get('/api/payments/status/999');

    expect(res.status).toBe(404);
  });
});
