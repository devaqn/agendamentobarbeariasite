const request = require('supertest');

jest.mock('../../backend/db/connection', () => ({ query: jest.fn() }));

const app = require('../../backend/server');
const db = require('../../backend/db/connection');

describe('GET /api/services', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna 200 com lista de serviços ativos', async () => {
    const mockServices = [
      { id: 1, name: 'Corte', description: 'Desc', duration_minutes: 45, price: 50, signal_percentage: 30 },
      { id: 2, name: 'Barba', description: 'Desc', duration_minutes: 30, price: 35, signal_percentage: 30 }
    ];
    db.query.mockResolvedValue({ rows: mockServices });

    const res = await request(app).get('/api/services');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].name).toBe('Corte');
    expect(res.body[0]).toHaveProperty('price');
    expect(res.body[0]).toHaveProperty('signal_percentage');
  });

  it('retorna array vazio quando não há serviços', async () => {
    db.query.mockResolvedValue({ rows: [] });

    const res = await request(app).get('/api/services');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('retorna 500 em erro de banco de dados', async () => {
    db.query.mockRejectedValue(new Error('db connection error'));

    const res = await request(app).get('/api/services');

    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
  });

  it('consulta apenas serviços ativos (active = true)', async () => {
    db.query.mockResolvedValue({ rows: [] });

    await request(app).get('/api/services');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('active = true')
    );
  });
});
