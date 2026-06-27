require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));

// Rate limiting desabilitado em testes para não interferir
if (process.env.NODE_ENV !== 'test') {
  app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 200 }));
  app.use('/api/admin/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 15 }));
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, '../public')));

app.use('/api/services', require('./routes/services'));
app.use('/api/slots', require('./routes/slots'));
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/admin', require('./routes/admin'));

app.get('/api/health', (req, res) => res.json({ status: 'ok', env: process.env.NODE_ENV }));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n🔵 Servidor rodando em http://localhost:${PORT}`);
    console.log(`📋 Admin Panel : http://localhost:${PORT}/admin.html`);
    console.log(`🌿 Ambiente    : ${process.env.NODE_ENV || 'development'}\n`);
  });
}

module.exports = app;
