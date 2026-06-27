-- Schema do sistema de agendamento da barbearia

CREATE TABLE IF NOT EXISTS admins (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL DEFAULT 'Admin',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS services (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  duration_minutes INT NOT NULL DEFAULT 45,
  price DECIMAL(10,2) NOT NULL,
  signal_percentage INT NOT NULL DEFAULT 30,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS time_slots (
  id SERIAL PRIMARY KEY,
  slot_datetime TIMESTAMP NOT NULL,
  is_available BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(slot_datetime)
);

CREATE TABLE IF NOT EXISTS appointments (
  id SERIAL PRIMARY KEY,
  client_name VARCHAR(255) NOT NULL,
  client_phone VARCHAR(30) NOT NULL,
  client_email VARCHAR(255),
  service_id INT REFERENCES services(id),
  time_slot_id INT REFERENCES time_slots(id),
  status VARCHAR(50) DEFAULT 'pending',
  payment_status VARCHAR(50) DEFAULT 'pending',
  payment_id VARCHAR(255),
  payment_preference_id VARCHAR(255),
  signal_amount DECIMAL(10,2),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Serviços padrão
INSERT INTO services (name, description, duration_minutes, price, signal_percentage) VALUES
  ('Corte de Cabelo', 'Corte moderno e estiloso com acabamento perfeito', 45, 50.00, 30),
  ('Barba', 'Aparação, modelagem e hidratação da barba', 30, 35.00, 30),
  ('Corte + Barba', 'Combo completo: corte de cabelo e tratamento de barba', 70, 75.00, 30),
  ('Sobrancelha', 'Design e alinhamento de sobrancelha masculina', 20, 20.00, 0)
ON CONFLICT DO NOTHING;
