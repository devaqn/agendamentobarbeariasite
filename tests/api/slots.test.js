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

describe('GET /api/slots', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna 200 com horários disponíveis', async () => {
    const mockSlots = [
      { id: 1, slot_datetime: '2026-07-01T10:00:00Z', is_available: true },
      { id: 2, slot_datetime: '2026-07-01T11:00:00Z', is_available: true }
    ];
    db.query.mockResolvedValue({ rows: mockSlots });

    const res = await request(app).get('/api/slots');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
  });

  it('aceita e repassa parâmetro de filtro de data', async () => {
    db.query.mockResolvedValue({ rows: [] });

    const res = await request(app).get('/api/slots?date=2026-07-01');

    expect(res.status).toBe(200);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('DATE(slot_datetime'),
      expect.arrayContaining(['2026-07-01'])
    );
  });

  it('retorna 500 em erro de banco', async () => {
    db.query.mockRejectedValue(new Error('db error'));

    const res = await request(app).get('/api/slots');

    expect(res.status).toBe(500);
  });
});

describe('GET /api/slots/dates', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna 200 com datas disponíveis', async () => {
    db.query.mockResolvedValue({
      rows: [
        { date: '2026-07-01', available_count: '3' },
        { date: '2026-07-02', available_count: '5' }
      ]
    });

    const res = await request(app).get('/api/slots/dates');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
  });
});

describe('GET /api/slots/all (admin)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna 200 com todos os horários quando autenticado', async () => {
    db.query.mockResolvedValue({ rows: [] });

    const res = await request(app)
      .get('/api/slots/all')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('retorna 401 sem token de autenticação', async () => {
    const res = await request(app).get('/api/slots/all');

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('retorna 401 com token inválido', async () => {
    const res = await request(app)
      .get('/api/slots/all')
      .set('Authorization', 'Bearer token-invalido');

    expect(res.status).toBe(401);
  });
});

describe('POST /api/slots (admin)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('cria horário com dados válidos e autenticação', async () => {
    const newSlot = { id: 1, slot_datetime: '2026-07-01T10:00:00Z', is_available: true };
    db.query.mockResolvedValue({ rows: [newSlot] });

    const res = await request(app)
      .post('/api/slots')
      .set('Authorization', `Bearer ${token}`)
      .send({ slot_datetime: '2026-07-01T10:00:00Z' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('slot_datetime');
  });

  it('retorna 400 quando slot_datetime está ausente', async () => {
    const res = await request(app)
      .post('/api/slots')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('retorna 401 sem autenticação', async () => {
    const res = await request(app)
      .post('/api/slots')
      .send({ slot_datetime: '2026-07-01T10:00:00Z' });

    expect(res.status).toBe(401);
  });

  it('retorna 409 para horário duplicado', async () => {
    const duplicateErr = new Error('duplicate key');
    duplicateErr.code = '23505';
    db.query.mockRejectedValue(duplicateErr);

    const res = await request(app)
      .post('/api/slots')
      .set('Authorization', `Bearer ${token}`)
      .send({ slot_datetime: '2026-07-01T10:00:00Z' });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('já existe');
  });
});

describe('POST /api/slots/batch (admin)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('cria múltiplos horários', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 1 }, { id: 2 }] });

    const res = await request(app)
      .post('/api/slots/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({ slots: ['2026-07-01T10:00:00Z', '2026-07-01T11:00:00Z'] });

    expect(res.status).toBe(201);
    expect(res.body.created).toBe(2);
    expect(Array.isArray(res.body.slots)).toBe(true);
  });

  it('retorna 400 quando slots está ausente ou vazio', async () => {
    const resEmpty = await request(app)
      .post('/api/slots/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(resEmpty.status).toBe(400);

    const resEmptyArr = await request(app)
      .post('/api/slots/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({ slots: [] });

    expect(resEmptyArr.status).toBe(400);
  });
});

describe('DELETE /api/slots/:id (admin)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('remove horário disponível com sucesso', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1, is_available: true }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .delete('/api/slots/1')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Horário removido');
  });

  it('retorna 400 quando horário já está agendado', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, is_available: false }] });

    const res = await request(app)
      .delete('/api/slots/1')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('agendado');
  });

  it('retorna 404 quando horário não encontrado', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .delete('/api/slots/999')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('retorna 401 sem autenticação', async () => {
    const res = await request(app).delete('/api/slots/1');

    expect(res.status).toBe(401);
  });
});
