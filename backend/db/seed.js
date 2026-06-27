require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function seed() {
  const client = await pool.connect();
  try {
    console.log('Criando tabelas...');
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await client.query(schema);

    console.log('Criando admin...');
    const email = process.env.ADMIN_EMAIL || 'admin@barbearia.com';
    const password = process.env.ADMIN_PASSWORD || 'mudar123';
    const hash = await bcrypt.hash(password, 10);
    const name = process.env.BARBERSHOP_NAME || 'Administrador';

    await client.query(
      `INSERT INTO admins (email, password_hash, name) VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET password_hash = $2`,
      [email, hash, name]
    );

    console.log('\n✅ Setup concluído com sucesso!');
    console.log('─────────────────────────────');
    console.log(`Email admin : ${email}`);
    console.log(`Senha admin : ${password}`);
    console.log(`Acesse      : http://localhost:${process.env.PORT || 3000}/admin.html`);
    console.log('─────────────────────────────');
    console.log('⚠️  Troque a senha após o primeiro login!');
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(err => {
  console.error('Erro no setup:', err.message);
  process.exit(1);
});
