/* ================================================
   admin.js — Painel administrativo da barbearia
   ================================================ */

const API = '/api';

let adminState = {
  token: localStorage.getItem('admin_token'),
  admin: JSON.parse(localStorage.getItem('admin_info') || 'null'),
  currentView: 'dashboard'
};

// ─── Init ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (adminState.token) {
    showApp();
    loadView('dashboard');
  } else {
    showLogin();
  }

  // Hash routing
  window.addEventListener('hashchange', () => {
    const view = location.hash.replace('#', '') || 'dashboard';
    loadView(view);
  });
});

// ─── Auth ─────────────────────────────────────────
async function login() {
  const email = document.getElementById('login-email')?.value.trim();
  const password = document.getElementById('login-password')?.value;
  const btn = document.getElementById('login-btn');
  const error = document.getElementById('login-error');

  if (!email || !password) {
    showLoginError('Preencha email e senha'); return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Entrando...';

  try {
    const r = await fetch(`${API}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await r.json();

    if (!r.ok) { showLoginError(data.error || 'Credenciais inválidas'); return; }

    adminState.token = data.token;
    adminState.admin = data.admin;
    localStorage.setItem('admin_token', data.token);
    localStorage.setItem('admin_info', JSON.stringify(data.admin));

    showApp();
    loadView('dashboard');
  } catch {
    showLoginError('Erro de conexão com o servidor');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Entrar';
  }
}

function logout() {
  adminState.token = null;
  adminState.admin = null;
  localStorage.removeItem('admin_token');
  localStorage.removeItem('admin_info');
  showLogin();
}

function showLoginError(msg) {
  const el = document.getElementById('login-error');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

// ─── Layouts ──────────────────────────────────────
function showLogin() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('admin-app').style.display = 'none';
}

function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('admin-app').style.display = 'flex';

  const name = adminState.admin?.name || 'Admin';
  const email = adminState.admin?.email || '';
  const avatar = document.getElementById('admin-avatar');
  const adminName = document.getElementById('admin-name');
  const adminEmail = document.getElementById('admin-email-display');

  if (avatar) avatar.textContent = name[0].toUpperCase();
  if (adminName) adminName.textContent = name;
  if (adminEmail) adminEmail.textContent = email;
}

// ─── Navegação de views ───────────────────────────
function loadView(view) {
  adminState.currentView = view;

  document.querySelectorAll('.view').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === view);
  });

  const el = document.getElementById(`view-${view}`);
  if (el) el.style.display = 'block';

  if (view === 'dashboard') loadDashboard();
  else if (view === 'appointments') loadAppointments();
  else if (view === 'slots') loadSlotsView();
  else if (view === 'services') loadServicesView();

  // Fechar sidebar mobile
  document.getElementById('sidebar')?.classList.remove('open');
}

function toggleSidebar() {
  document.getElementById('sidebar')?.classList.toggle('open');
}

// ─── API helper ───────────────────────────────────
async function apiCall(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminState.token}`
    },
    ...options
  });

  if (res.status === 401) { logout(); return null; }
  return res;
}

// ─── Dashboard ────────────────────────────────────
async function loadDashboard() {
  const r = await apiCall('/admin/dashboard');
  if (!r) return;
  const data = await r.json();

  document.getElementById('stat-today').textContent = data.today_appointments;
  document.getElementById('stat-revenue').textContent =
    `R$ ${parseFloat(data.total_revenue).toFixed(2).replace('.', ',')}`;
  document.getElementById('stat-pending').textContent = data.pending_payments;

  renderUpcoming(data.upcoming_appointments || []);
}

function renderUpcoming(items) {
  const container = document.getElementById('upcoming-list');
  if (!container) return;

  if (!items.length) {
    container.innerHTML = `<p style="color:var(--text-muted);font-size:0.9rem;text-align:center;padding:2rem">Nenhum agendamento próximo</p>`;
    return;
  }

  container.innerHTML = items.map(a => {
    const dt = new Date(a.slot_datetime);
    const time = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const date = dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    return `
      <div class="upcoming-item">
        <div class="upcoming-time">
          <div class="time">${time}</div>
          <div class="date">${date}</div>
        </div>
        <div class="upcoming-info">
          <div class="upcoming-name">${a.client_name}</div>
          <div class="upcoming-service">${a.service_name || '-'} · ${a.client_phone}</div>
        </div>
        <span class="badge badge-${a.payment_status}">${statusLabel(a.payment_status)}</span>
      </div>
    `;
  }).join('');
}

// ─── Agendamentos ─────────────────────────────────
async function loadAppointments() {
  const date = document.getElementById('filter-date')?.value || '';
  const status = document.getElementById('filter-status')?.value || '';

  const params = new URLSearchParams();
  if (date) params.append('date', date);
  if (status) params.append('status', status);

  const r = await apiCall(`/appointments?${params}`);
  if (!r) return;
  const data = await r.json();
  renderAppointmentsTable(data);
}

function renderAppointmentsTable(items) {
  const tbody = document.getElementById('appointments-tbody');
  if (!tbody) return;

  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:2rem">Nenhum agendamento encontrado</td></tr>`;
    return;
  }

  tbody.innerHTML = items.map(a => {
    const dt = new Date(a.slot_datetime);
    const datetime = `${dt.toLocaleDateString('pt-BR')} ${dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    const signal = a.signal_amount ? `R$ ${parseFloat(a.signal_amount).toFixed(2).replace('.', ',')}` : '-';

    return `
      <tr>
        <td>#${a.id}</td>
        <td>${a.client_name}<br><small style="color:var(--text-muted)">${a.client_phone}</small></td>
        <td>${a.service_name || '-'}</td>
        <td>${datetime}</td>
        <td><span class="badge badge-${a.status}">${statusLabel(a.status)}</span></td>
        <td>
          <span class="badge badge-${a.payment_status}">${statusLabel(a.payment_status)}</span>
          <span style="color:var(--text-muted);font-size:0.78rem;margin-left:0.3rem">${signal}</span>
        </td>
        <td>
          <div style="display:flex;gap:0.4rem;flex-wrap:wrap">
            ${a.status !== 'confirmed' && a.status !== 'cancelled' ? `<button class="btn btn-sm btn-success" onclick="updateStatus(${a.id},'confirmed')">✓ Confirmar</button>` : ''}
            ${a.status !== 'completed' && a.status !== 'cancelled' ? `<button class="btn btn-sm btn-ghost" onclick="updateStatus(${a.id},'completed')">✔ Concluir</button>` : ''}
            ${a.status !== 'cancelled' ? `<button class="btn btn-sm btn-danger" onclick="updateStatus(${a.id},'cancelled')">✕</button>` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function updateStatus(id, status) {
  const labels = { confirmed: 'confirmar', completed: 'concluir', cancelled: 'cancelar' };
  if (!confirm(`Deseja ${labels[status] || status} este agendamento?`)) return;

  const r = await apiCall(`/appointments/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status })
  });

  if (r?.ok) { showToast('Status atualizado!', 'success'); loadAppointments(); }
  else showToast('Erro ao atualizar status', 'error');
}

// ─── Horários ─────────────────────────────────────
async function loadSlotsView() {
  const date = document.getElementById('slots-filter-date')?.value || '';
  const params = date ? `?date=${date}` : '';
  const r = await apiCall(`/slots/all${params}`);
  if (!r) return;
  const data = await r.json();
  renderSlotsTable(data);
}

function renderSlotsTable(items) {
  const tbody = document.getElementById('slots-tbody');
  if (!tbody) return;

  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:2rem">Nenhum horário encontrado</td></tr>`;
    return;
  }

  tbody.innerHTML = items.map(s => {
    const dt = new Date(s.slot_datetime);
    const date = dt.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
    const time = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const status = s.is_available
      ? '<span class="badge badge-confirmed">Disponível</span>'
      : `<span class="badge badge-pending">${s.client_name ? `Reservado: ${s.client_name}` : 'Ocupado'}</span>`;

    return `
      <tr>
        <td>${date}</td>
        <td>${time}</td>
        <td>${status}</td>
        <td>
          ${s.is_available ? `<button class="btn btn-sm btn-danger" onclick="deleteSlot(${s.id})">Remover</button>` : '-'}
        </td>
      </tr>
    `;
  }).join('');
}

async function addSlots() {
  const date = document.getElementById('new-slot-date')?.value;
  const checked = [...document.querySelectorAll('.time-check:checked')].map(cb => cb.value);

  if (!date) { showToast('Selecione uma data', 'error'); return; }
  if (!checked.length) { showToast('Selecione ao menos um horário', 'error'); return; }

  const slots = checked.map(time => `${date}T${time}:00`);

  const r = await apiCall('/slots/batch', {
    method: 'POST',
    body: JSON.stringify({ slots })
  });

  if (r?.ok) {
    const data = await r.json();
    showToast(`${data.created} horário(s) adicionado(s)!`, 'success');
    document.querySelectorAll('.time-check').forEach(cb => cb.checked = false);
    loadSlotsView();
  } else {
    showToast('Erro ao adicionar horários', 'error');
  }
}

async function deleteSlot(id) {
  if (!confirm('Remover este horário?')) return;
  const r = await apiCall(`/slots/${id}`, { method: 'DELETE' });
  if (r?.ok) { showToast('Horário removido', 'success'); loadSlotsView(); }
  else {
    const data = await r?.json();
    showToast(data?.error || 'Erro ao remover', 'error');
  }
}

// ─── Serviços ─────────────────────────────────────
async function loadServicesView() {
  const r = await apiCall('/admin/services');
  if (!r) return;
  const data = await r.json();
  renderServicesAdmin(data);
}

function renderServicesAdmin(services) {
  const container = document.getElementById('services-admin-list');
  if (!container) return;

  container.innerHTML = services.map(s => {
    const signal = (s.price * s.signal_percentage / 100).toFixed(2);
    return `
      <div class="upcoming-item" style="background:var(--bg-2)">
        <div style="flex:1">
          <div class="upcoming-name">${s.name}</div>
          <div class="upcoming-service">
            R$ ${parseFloat(s.price).toFixed(2).replace('.', ',')} · ${s.duration_minutes} min
            · Sinal: ${s.signal_percentage > 0 ? `R$ ${parseFloat(signal).toFixed(2).replace('.', ',')}` : 'Sem sinal'}
          </div>
        </div>
        <div style="display:flex;gap:0.5rem;align-items:center">
          <span class="badge ${s.active ? 'badge-confirmed' : 'badge-cancelled'}">${s.active ? 'Ativo' : 'Inativo'}</span>
          <button class="btn btn-sm btn-ghost" onclick='editService(${JSON.stringify(s).replace(/'/g, "\\'")})'> ✎ Editar</button>
          <button class="btn btn-sm ${s.active ? 'btn-danger' : 'btn-success'}" onclick="toggleService(${s.id}, ${!s.active})">
            ${s.active ? 'Desativar' : 'Ativar'}
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function editService(service) {
  document.getElementById('edit-service-id').value = service.id;
  document.getElementById('edit-service-name').value = service.name;
  document.getElementById('edit-service-desc').value = service.description || '';
  document.getElementById('edit-service-price').value = service.price;
  document.getElementById('edit-service-duration').value = service.duration_minutes;
  document.getElementById('edit-service-signal').value = service.signal_percentage;
  document.getElementById('edit-service-panel').style.display = 'block';
  document.getElementById('edit-service-panel').scrollIntoView({ behavior: 'smooth' });
}

function cancelEdit() {
  document.getElementById('edit-service-panel').style.display = 'none';
}

async function saveService() {
  const id = document.getElementById('edit-service-id').value;
  const body = {
    name: document.getElementById('edit-service-name').value,
    description: document.getElementById('edit-service-desc').value,
    price: parseFloat(document.getElementById('edit-service-price').value),
    duration_minutes: parseInt(document.getElementById('edit-service-duration').value),
    signal_percentage: parseInt(document.getElementById('edit-service-signal').value)
  };

  const r = await apiCall(`/admin/services/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body)
  });

  if (r?.ok) {
    showToast('Serviço atualizado!', 'success');
    cancelEdit();
    loadServicesView();
  } else showToast('Erro ao salvar', 'error');
}

async function saveNewService() {
  const body = {
    name: document.getElementById('new-service-name').value.trim(),
    description: document.getElementById('new-service-desc').value.trim(),
    price: parseFloat(document.getElementById('new-service-price').value),
    duration_minutes: parseInt(document.getElementById('new-service-duration').value) || 45,
    signal_percentage: parseInt(document.getElementById('new-service-signal').value) ?? 30
  };

  if (!body.name || isNaN(body.price)) { showToast('Nome e preço são obrigatórios', 'error'); return; }

  const r = await apiCall('/admin/services', {
    method: 'POST',
    body: JSON.stringify(body)
  });

  if (r?.ok) {
    showToast('Serviço criado!', 'success');
    ['new-service-name','new-service-desc','new-service-price'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    loadServicesView();
  } else showToast('Erro ao criar serviço', 'error');
}

async function toggleService(id, active) {
  const r = await apiCall(`/admin/services/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ active })
  });
  if (r?.ok) { showToast(`Serviço ${active ? 'ativado' : 'desativado'}!`, 'success'); loadServicesView(); }
  else showToast('Erro', 'error');
}

// ─── Helpers ──────────────────────────────────────
function statusLabel(status) {
  const labels = {
    pending: 'Pendente',
    confirmed: 'Confirmado',
    cancelled: 'Cancelado',
    completed: 'Concluído',
    paid: 'Pago',
    failed: 'Falhou',
    refunded: 'Estornado'
  };
  return labels[status] || status;
}

function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = `show ${type}`;
  setTimeout(() => { el.className = ''; }, 3500);
}

// ─── Login com Enter ──────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('login-password')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') login();
  });
});
