const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../../backend/db/connection', () => ({ query: jest.fn() }));
jest.mock('bcryptjs');

const app = require('../../backend/server');
const db = require('../../backend/db/connection');
const bcrypt = require('bcryptjs');

const token = jwt.sign(
  { id: 1, email: 'admin@test.com', name: 'Admin' },
  'test-jwt-secret-key-for-testing-only',
  { expiresIn: '1h' }
);

describe('POST /api/admin/login', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna token JWT com credenciais válidas', async () => {
    const mockAdmin = { id: 1, email: 'admin@test.com', name: 'Admin', password_hash: '$2b$10$hash' };
    db.query.mockResolvedValue({ rows: [mockAdmin] });
    bcrypt.compare.mockResolvedValue(true);

    const res = await request(app)
      .post('/api/admin/login')
      .send({ email: 'admin@test.com', password: 'senha123' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('admin');
    expect(res.body.admin.email).toBe('admin@test.com');
    expect(res.body.admin).not.toHaveProperty('password_hash');
  });

  it('retorna 400 quando email ou senha estão ausentes', async () => {
    const resMissingPass = await request(app)
      .post('/api/admin/login')
      .send({ email: 'admin@test.com' });

    expect(resMissingPass.status).toBe(400);

    const resMissingEmail = await request(app)
      .post('/api/admin/login')
      .send({ password: 'senha123' });

    expect(resMissingEmail.status).toBe(400);
  });

  it('retorna 401 quando usuário não encontrado', async () => {
    db.query.mockResolvedValue({ rows: [] });

    const res = await request(app)
      .post('/api/admin/login')
      .send({ email: 'nao@existe.com', password: 'senha123' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Credenciais inválidas');
  });

  it('retorna 401 quando senha está incorreta', async () => {
    const mockAdmin = { id: 1, email: 'admin@test.com', name: 'Admin', password_hash: '$2b$10$hash' };
    db.query.mockResolvedValue({ rows: [mockAdmin] });
    bcrypt.compare.mockResolvedValue(false);

    const res = await request(app)
      .post('/api/admin/login')
      .send({ email: 'admin@test.com', password: 'senhaerrada' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Credenciais inválidas');
  });

  it('o token gerado é válido e contém os dados do admin', async () => {
    const mockAdmin = { id: 1, email: 'admin@test.com', name: 'Admin', password_hash: '$hash' };
    db.query.mockResolvedValue({ rows: [mockAdmin] });
    bcrypt.compare.mockResolvedValue(true);

    const res = await request(app)
      .post('/api/admin/login')
      .send({ email: 'admin@test.com', password: 'senha123' });

    expect(res.status).toBe(200);

    const decoded = jwt.verify(res.body.token, 'test-jwt-secret-key-for-testing-only');
    expect(decoded.id).toBe(1);
    expect(decoded.email).toBe('admin@test.com');
  });
});

describe('GET /api/admin/dashboard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna dados completos do dashboard com autenticação', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ count: '5' }] })
      .mockResolvedValueOnce({ rows: [{ total: '225.00' }] })
      .mockResolvedValueOnce({ rows: [{ count: '3' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, client_name: 'João', service_name: 'Corte' }] })
      .mockResolvedValueOnce({ rows: [{ date: '2026-07-01', total: '2', confirmed: '1', revenue: '30.00' }] });

    const res = await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('today_appointments', 5);
    expect(res.body).toHaveProperty('total_revenue', 225);
    expect(res.body).toHaveProperty('pending_payments', 3);
    expect(Array.isArray(res.body.upcoming_appointments)).toBe(true);
    expect(Array.isArray(res.body.weekly_data)).toBe(true);
  });

  it('retorna 401 sem token de autenticação', async () => {
    const res = await request(app).get('/api/admin/dashboard');

    expect(res.status).toBe(401);
  });

  it('retorna 401 com token expirado', async () => {
    const expiredToken = jwt.sign(
      { id: 1, email: 'admin@test.com' },
      'test-jwt-secret-key-for-testing-only',
      { expiresIn: '-1s' }
    );

    const res = await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
  });
});

describe('GET /api/admin/config', () => {
  it('retorna configuração pública da barbearia sem autenticação', async () => {
    const res = await request(app).get('/api/admin/config');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('name', 'Barbearia Teste');
    expect(res.body).toHaveProperty('phone');
    expect(res.body).toHaveProperty('address');
    expect(res.body).toHaveProperty('mp_public_key');
  });
});

describe('GET /api/admin/services (admin)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna todos os serviços incluindo inativos', async () => {
    const mockServices = [
      { id: 1, name: 'Corte', price: 50, active: true },
      { id: 2, name: 'Serviço Inativo', price: 30, active: false }
    ];
    db.query.mockResolvedValue({ rows: mockServices });

    const res = await request(app)
      .get('/api/admin/services')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.some(s => !s.active)).toBe(true);
  });

  it('retorna 401 sem autenticação', async () => {
    const res = await request(app).get('/api/admin/services');

    expect(res.status).toBe(401);
  });
});

describe('POST /api/admin/services (admin)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('cria novo serviço com dados válidos', async () => {
    const novoServico = { id: 5, name: 'Coloração', price: 80, signal_percentage: 50, active: true };
    db.query.mockResolvedValue({ rows: [novoServico] });

    const res = await request(app)
      .post('/api/admin/services')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Coloração', price: 80, signal_percentage: 50 });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Coloração');
  });

  it('retorna 400 quando nome ou preço estão ausentes', async () => {
    const res = await request(app)
      .post('/api/admin/services')
      .set('Authorization', `Bearer ${token}`)
      .send({ description: 'Sem nome e preço' });

    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/admin/services/:id (admin)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('atualiza serviço existente', async () => {
    const updated = { id: 1, name: 'Corte Degradê', price: 55, active: true };
    db.query.mockResolvedValue({ rows: [updated] });

    const res = await request(app)
      .patch('/api/admin/services/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Corte Degradê', price: 55 });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Corte Degradê');
  });

  it('retorna 404 quando serviço não encontrado', async () => {
    db.query.mockResolvedValue({ rows: [] });

    const res = await request(app)
      .patch('/api/admin/services/999')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Novo nome' });

    expect(res.status).toBe(404);
  });
});
