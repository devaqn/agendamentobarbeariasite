/* ================================================
   admin.js — Painel administrativo
   ================================================ */

const API = '/api';

let adminState = {
  token: localStorage.getItem('admin_token'),
  admin: JSON.parse(localStorage.getItem('admin_info') || 'null'),
  currentView: 'dashboard'
};

// ─── Init ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (adminState.token) { showApp(); loadView('dashboard'); }
  else showLogin();

  window.addEventListener('hashchange', () => {
    const view = location.hash.replace('#', '') || 'dashboard';
    loadView(view);
  });

  document.getElementById('login-password')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') login();
  });
});

// ─── Auth ──────────────────────────────────────
async function login() {
  const email = document.getElementById('login-email')?.value.trim();
  const password = document.getElementById('login-password')?.value;
  const btn = document.getElementById('login-btn');

  if (!email || !password) { showLoginError('Preencha email e senha'); return; }
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
    showLoginError('Erro de conexão');
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

function showLogin() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('admin-app').style.display = 'none';
}

function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('admin-app').style.display = 'flex';
  const name = adminState.admin?.name || 'Admin';
  const el = id => document.getElementById(id);
  if (el('admin-avatar')) el('admin-avatar').textContent = name[0].toUpperCase();
  if (el('admin-name')) el('admin-name').textContent = name;
  if (el('admin-email-display')) el('admin-email-display').textContent = adminState.admin?.email || '';
}

// ─── Sidebar ───────────────────────────────────
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const isOpen = sidebar.classList.toggle('open');
  overlay.style.display = isOpen ? 'block' : 'none';
}

// ─── Navegação ─────────────────────────────────
function loadView(view) {
  adminState.currentView = view;
  document.querySelectorAll('.view').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.view === view));
  const el = document.getElementById(`view-${view}`);
  if (el) el.style.display = 'block';

  if (view === 'dashboard')    loadDashboard();
  if (view === 'appointments') loadAppointments();
  if (view === 'slots')        loadSlotsView();
  if (view === 'services')     loadServicesView();

  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebar-overlay').style.display = 'none';
}

function switchTab(view, tab) {
  document.querySelectorAll(`#view-${view} .admin-tab`).forEach((el, i) => {
    const tabId = el.getAttribute('onclick').match(/'([^']+)'\)$/)?.[1];
    el.classList.toggle('active', tabId === tab);
  });
  document.querySelectorAll(`#view-${view} .admin-tab-panel`).forEach(el => el.classList.remove('active'));
  document.getElementById(`${view}-tab-${tab}`)?.classList.add('active');

  if (view === 'slots' && tab === 'agenda') loadSlotsView();
}

// ─── API helper ────────────────────────────────
async function apiCall(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminState.token}` },
    ...options
  });
  if (res.status === 401) { logout(); return null; }
  return res;
}

// ─── Dashboard ─────────────────────────────────
async function loadDashboard() {
  const r = await apiCall('/admin/dashboard');
  if (!r) return;
  const data = await r.json();

  document.getElementById('stat-today').textContent = data.today_appointments;
  document.getElementById('stat-revenue').textContent = fmt(data.total_revenue);
  document.getElementById('stat-pending').textContent = data.pending_payments;
  renderUpcoming(data.upcoming_appointments || []);
}

function renderUpcoming(items) {
  const c = document.getElementById('upcoming-list');
  if (!c) return;
  if (!items.length) {
    c.innerHTML = `<p style="color:var(--text-3);font-size:0.88rem;text-align:center;padding:2rem">Nenhum agendamento próximo</p>`;
    return;
  }
  c.innerHTML = `<div class="upcoming-list">` + items.map(a => {
    const dt = new Date(a.slot_datetime);
    const time = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const date = dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    return `
      <div class="upcoming-item">
        <div class="upcoming-time"><div class="time">${time}</div><div class="date">${date}</div></div>
        <div class="upcoming-info">
          <div class="upcoming-name">${a.client_name}</div>
          <div class="upcoming-service">${a.service_name || '—'} · ${a.client_phone}</div>
        </div>
        <div style="display:flex;gap:0.4rem;align-items:center;flex-shrink:0">
          <span class="badge badge-${a.payment_status}">${statusLabel(a.payment_status)}</span>
          ${a.status !== 'cancelled' ? `<button class="btn-cancel" onclick="cancelAppointment(${a.id}, true)">Cancelar</button>` : ''}
        </div>
      </div>
    `;
  }).join('') + `</div>`;
}

// ─── Agendamentos ──────────────────────────────
async function loadAppointments() {
  const date = document.getElementById('filter-date')?.value || '';
  const status = document.getElementById('filter-status')?.value || '';
  const params = new URLSearchParams();
  if (date) params.append('date', date);
  if (status) params.append('status', status);

  const r = await apiCall(`/appointments?${params}`);
  if (!r) return;
  renderAppointmentsTable(await r.json());
}

function clearFilters() {
  document.getElementById('filter-date').value = '';
  document.getElementById('filter-status').value = '';
  loadAppointments();
}

function renderAppointmentsTable(items) {
  const tbody = document.getElementById('appointments-tbody');
  if (!tbody) return;

  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-3);padding:2.5rem">Nenhum agendamento encontrado</td></tr>`;
    return;
  }

  tbody.innerHTML = items.map(a => {
    const dt = new Date(a.slot_datetime);
    const datetime = `${dt.toLocaleDateString('pt-BR', {day:'2-digit',month:'2-digit'})} ${dt.toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'})}`;
    const isCancelled = a.status === 'cancelled';

    return `
      <tr style="${isCancelled ? 'opacity:0.55' : ''}">
        <td style="font-size:0.78rem;color:var(--text-3)">#${a.id}</td>
        <td>
          <div style="font-weight:600;font-size:0.88rem">${a.client_name}</div>
          <div style="font-size:0.75rem;color:var(--text-3)">${a.client_phone}</div>
        </td>
        <td class="hide-mobile" style="font-size:0.85rem">${a.service_name || '—'}</td>
        <td style="font-size:0.85rem;white-space:nowrap">${datetime}</td>
        <td><span class="badge badge-${a.status}">${statusLabel(a.status)}</span></td>
        <td class="hide-mobile">
          <span class="badge badge-${a.payment_status}">${statusLabel(a.payment_status)}</span>
          ${a.signal_amount > 0 ? `<span style="color:var(--text-3);font-size:0.75rem;margin-left:0.3rem">${fmt(a.signal_amount)}</span>` : ''}
        </td>
        <td>
          <div style="display:flex;gap:0.4rem;flex-wrap:wrap">
            ${a.status === 'pending' ? `<button class="btn-confirm-sm" onclick="updateStatus(${a.id},'confirmed')">✓ Confirmar</button>` : ''}
            ${a.status === 'confirmed' ? `<button class="btn btn-sm btn-ghost" onclick="updateStatus(${a.id},'completed')">Concluir</button>` : ''}
            ${!isCancelled ? `<button class="btn-cancel" onclick="cancelAppointment(${a.id})">✕ Cancelar</button>` : '<span style="color:var(--text-3);font-size:0.78rem">Cancelado</span>'}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function cancelAppointment(id, refreshDashboard = false) {
  if (!confirm('Cancelar este agendamento? O horário ficará disponível novamente.')) return;
  const r = await apiCall(`/appointments/${id}/status`, {
    method: 'PATCH', body: JSON.stringify({ status: 'cancelled' })
  });
  if (r?.ok) {
    showToast('Agendamento cancelado', 'success');
    if (refreshDashboard) loadDashboard(); else loadAppointments();
  } else showToast('Erro ao cancelar', 'error');
}

async function updateStatus(id, status) {
  const r = await apiCall(`/appointments/${id}/status`, {
    method: 'PATCH', body: JSON.stringify({ status })
  });
  if (r?.ok) { showToast('Atualizado!', 'success'); loadAppointments(); }
  else showToast('Erro ao atualizar', 'error');
}

// ─── Horários ──────────────────────────────────
async function loadSlotsView() {
  const date = document.getElementById('slots-filter-date')?.value || '';
  const params = date ? `?date=${date}` : '';
  const r = await apiCall(`/slots/all${params}`);
  if (!r) return;
  renderSlotsAgenda(await r.json());
}

function renderSlotsAgenda(slots) {
  const c = document.getElementById('slots-agenda-container');
  if (!c) return;

  if (!slots.length) {
    c.innerHTML = `<p style="color:var(--text-3);text-align:center;padding:2.5rem">Nenhum horário encontrado para este período</p>`;
    return;
  }

  // Agrupa por data
  const byDate = {};
  slots.forEach(s => {
    const date = s.slot_datetime.split('T')[0];
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push(s);
  });

  const dayNames = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  const monthNames = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

  c.innerHTML = Object.entries(byDate).map(([date, daySlots]) => {
    const dt = new Date(date + 'T12:00:00');
    const dayName = dayNames[dt.getDay()];
    const dateLabel = `${dayName}, ${dt.getDate()} de ${monthNames[dt.getMonth()]}`;
    const available = daySlots.filter(s => s.is_available).length;
    const occupied = daySlots.filter(s => !s.is_available).length;

    const slotsHtml = daySlots.map(s => {
      const time = new Date(s.slot_datetime).toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'});
      if (!s.is_available) {
        return `
          <div class="slot-item occupied">
            <span class="slot-time-badge">${time}</span>
            <div class="slot-info">
              <div class="slot-client">${s.client_name || 'Ocupado'}</div>
              <div class="slot-service">${s.service_name || '—'} · <span class="badge badge-${s.appointment_status}" style="font-size:0.65rem;padding:0.15rem 0.5rem">${statusLabel(s.appointment_status)}</span></div>
            </div>
          </div>`;
      }
      return `
        <div class="slot-item available">
          <span class="slot-time-badge">${time}</span>
          <div class="slot-info">
            <div class="slot-client" style="color:var(--success)">Disponível</div>
          </div>
          <button class="btn-cancel" style="font-size:0.7rem;padding:0.2rem 0.5rem" onclick="deleteSlot(${s.id})">✕</button>
        </div>`;
    }).join('');

    return `
      <div>
        <div class="slot-date-header">
          <span class="slot-date-label">${dateLabel}</span>
          <span style="font-size:0.75rem;color:var(--text-3)">
            <span style="color:var(--success)">● ${available} livre${available !== 1 ? 's' : ''}</span>
            ${occupied > 0 ? ` &nbsp; <span style="color:var(--warning)">● ${occupied} ocupado${occupied !== 1 ? 's' : ''}</span>` : ''}
          </span>
        </div>
        <div class="slots-day-grid">${slotsHtml}</div>
      </div>
    `;
  }).join('<hr style="border:none;border-top:1px solid var(--border);margin:1rem 0">');
}

async function addSlots() {
  const date = document.getElementById('new-slot-date')?.value;
  const checked = [...document.querySelectorAll('.time-check:checked')].map(cb => cb.value);
  if (!date) { showToast('Selecione uma data', 'error'); return; }
  if (!checked.length) { showToast('Selecione ao menos um horário', 'error'); return; }

  const r = await apiCall('/slots/batch', {
    method: 'POST',
    body: JSON.stringify({ slots: checked.map(t => `${date}T${t}:00`) })
  });

  if (r?.ok) {
    const data = await r.json();
    showToast(`${data.created} horário(s) adicionado(s)!`, 'success');
    document.querySelectorAll('.time-check').forEach(cb => cb.checked = false);
    switchTab('slots', 'agenda');
  } else showToast('Erro ao adicionar horários', 'error');
}

async function deleteSlot(id) {
  if (!confirm('Remover este horário disponível?')) return;
  const r = await apiCall(`/slots/${id}`, { method: 'DELETE' });
  if (r?.ok) { showToast('Horário removido', 'success'); loadSlotsView(); }
  else {
    const data = await r?.json();
    showToast(data?.error || 'Erro ao remover', 'error');
  }
}

function selectPeriod(period) {
  const manha = ['09:00','09:30','10:00','10:30','11:00','11:30','12:00'];
  const tarde  = ['13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30','18:00'];
  const target = period === 'manha' ? manha : tarde;
  document.querySelectorAll('.time-check').forEach(cb => {
    cb.checked = target.includes(cb.value);
  });
}

// ─── Serviços ──────────────────────────────────
async function loadServicesView() {
  const r = await apiCall('/admin/services');
  if (!r) return;
  renderServicesAdmin(await r.json());
}

function renderServicesAdmin(services) {
  const c = document.getElementById('services-admin-list');
  if (!c) return;

  c.innerHTML = services.map(s => {
    const signal = s.signal_percentage > 0
      ? `Sinal de ${s.signal_percentage}% = ${fmt(s.price * s.signal_percentage / 100)}`
      : 'Sem sinal';
    return `
      <div class="service-edit-card" id="sec-card-${s.id}">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:0.5rem;margin-bottom:0.25rem">
          <div class="sec-name">${s.name}</div>
          <span class="badge ${s.active ? 'badge-confirmed' : 'badge-cancelled'}">${s.active ? 'Ativo' : 'Inativo'}</span>
        </div>
        <div class="sec-price">R$ ${parseFloat(s.price).toFixed(2).replace('.', ',')}</div>
        <div class="sec-meta">${s.duration_minutes} min · ${signal}</div>

        <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
          <button class="btn btn-sm btn-ghost" onclick="toggleEditCard(${s.id})">✎ Editar</button>
          <button class="btn btn-sm ${s.active ? 'btn-danger' : 'btn-success'}" onclick="toggleService(${s.id}, ${!s.active})">
            ${s.active ? 'Desativar' : 'Ativar'}
          </button>
        </div>

        <!-- Formulário inline -->
        <div class="sec-edit-form" id="sec-form-${s.id}">
          <div class="form-row">
            <div class="admin-form-group">
              <label>Nome</label>
              <input class="admin-input" id="ef-name-${s.id}" value="${s.name}">
            </div>
            <div class="admin-form-group">
              <label>Preço (R$)</label>
              <input class="admin-input" type="number" step="0.01" id="ef-price-${s.id}" value="${s.price}">
            </div>
          </div>
          <div class="admin-form-group">
            <label>Descrição</label>
            <input class="admin-input" id="ef-desc-${s.id}" value="${s.description || ''}">
          </div>
          <div class="form-row">
            <div class="admin-form-group">
              <label>Duração (min)</label>
              <input class="admin-input" type="number" id="ef-dur-${s.id}" value="${s.duration_minutes}">
            </div>
            <div class="admin-form-group">
              <label>% do sinal</label>
              <input class="admin-input" type="number" min="0" max="100" id="ef-sig-${s.id}" value="${s.signal_percentage}">
            </div>
          </div>
          <div style="display:flex;gap:0.5rem">
            <button class="btn btn-primary btn-sm" onclick="saveServiceInline(${s.id})">Salvar</button>
            <button class="btn btn-ghost btn-sm" onclick="toggleEditCard(${s.id})">Cancelar</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function toggleEditCard(id) {
  const form = document.getElementById(`sec-form-${id}`);
  const card = document.getElementById(`sec-card-${id}`);
  const isOpen = form.classList.toggle('open');
  card.classList.toggle('editing', isOpen);
  if (isOpen) form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function saveServiceInline(id) {
  const body = {
    name:             document.getElementById(`ef-name-${id}`)?.value,
    description:      document.getElementById(`ef-desc-${id}`)?.value,
    price:            parseFloat(document.getElementById(`ef-price-${id}`)?.value),
    duration_minutes: parseInt(document.getElementById(`ef-dur-${id}`)?.value),
    signal_percentage:parseInt(document.getElementById(`ef-sig-${id}`)?.value)
  };

  if (!body.name || isNaN(body.price)) { showToast('Nome e preço são obrigatórios', 'error'); return; }

  const r = await apiCall(`/admin/services/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  if (r?.ok) {
    showToast('Serviço atualizado!', 'success');
    loadServicesView();
  } else showToast('Erro ao salvar', 'error');
}

async function saveNewService() {
  const body = {
    name:             document.getElementById('new-service-name')?.value.trim(),
    description:      document.getElementById('new-service-desc')?.value.trim(),
    price:            parseFloat(document.getElementById('new-service-price')?.value),
    duration_minutes: parseInt(document.getElementById('new-service-duration')?.value) || 45,
    signal_percentage:parseInt(document.getElementById('new-service-signal')?.value) || 50
  };
  if (!body.name || isNaN(body.price)) { showToast('Nome e preço são obrigatórios', 'error'); return; }

  const r = await apiCall('/admin/services', { method: 'POST', body: JSON.stringify(body) });
  if (r?.ok) {
    showToast('Serviço criado!', 'success');
    ['new-service-name','new-service-desc','new-service-price','new-service-duration','new-service-signal']
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    loadServicesView();
  } else showToast('Erro ao criar', 'error');
}

async function toggleService(id, active) {
  const r = await apiCall(`/admin/services/${id}`, { method: 'PATCH', body: JSON.stringify({ active }) });
  if (r?.ok) { showToast(`Serviço ${active ? 'ativado' : 'desativado'}!`, 'success'); loadServicesView(); }
  else showToast('Erro', 'error');
}

// ─── Helpers ───────────────────────────────────
function statusLabel(s) {
  return { pending:'Pendente', confirmed:'Confirmado', cancelled:'Cancelado', completed:'Concluído', paid:'Pago', failed:'Falhou' }[s] || s;
}

function fmt(v) {
  return `R$ ${parseFloat(v || 0).toFixed(2).replace('.', ',')}`;
}

function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = `show ${type}`;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.className = ''; }, 3500);
}
