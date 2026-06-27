/* ================================================
   app.js — Sistema de agendamento (cliente)
   ================================================ */

const API = '/api';

const state = {
  step: 1,
  services: [],
  availableDates: [],
  availableSlots: [],
  selected: {
    service: null,
    date: null,
    slot: null
  },
  calendarYear: new Date().getFullYear(),
  calendarMonth: new Date().getMonth(),
  config: {}
};

// ─── Inicialização ───────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadConfig();

  const params = new URLSearchParams(window.location.search);
  const payment = params.get('payment');
  const id = params.get('id');

  if (payment) {
    showPaymentResult(payment, id);
    return;
  }

  await Promise.all([loadServices(), loadAvailableDates()]);
  renderServicesSection();
  renderStep(1);
});

// ─── Config e personalização ─────────────────────
async function loadConfig() {
  try {
    const r = await fetch(`${API}/admin/config`);
    state.config = await r.json();
    if (state.config.name) {
      document.querySelectorAll('.barbershop-name').forEach(el => {
        el.textContent = state.config.name;
      });
    }
  } catch {}
}

// Serviços padrão exibidos caso a API não responda ainda
const DEFAULT_SERVICES = [
  { id: 1, name: 'Corte de Cabelo', description: 'Corte moderno e estiloso com acabamento perfeito', duration_minutes: 45, price: 50, signal_percentage: 30 },
  { id: 2, name: 'Barba', description: 'Aparação, modelagem e hidratação da barba', duration_minutes: 30, price: 35, signal_percentage: 30 },
  { id: 3, name: 'Corte + Barba', description: 'Combo completo: corte de cabelo e tratamento de barba', duration_minutes: 70, price: 75, signal_percentage: 30 },
  { id: 4, name: 'Sobrancelha', description: 'Design e alinhamento de sobrancelha masculina', duration_minutes: 20, price: 20, signal_percentage: 0 }
];

// ─── Dados da API ─────────────────────────────────
async function loadServices() {
  try {
    const r = await fetch(`${API}/services`);
    if (!r.ok) throw new Error();
    const data = await r.json();
    state.services = data.length ? data : DEFAULT_SERVICES;
  } catch {
    state.services = DEFAULT_SERVICES;
  }
}

async function loadAvailableDates() {
  try {
    const r = await fetch(`${API}/slots/dates`);
    state.availableDates = await r.json();
  } catch {}
}

async function loadSlots(date) {
  try {
    const r = await fetch(`${API}/slots?date=${date}`);
    state.availableSlots = await r.json();
  } catch { state.availableSlots = []; }
}

// ─── Seção de serviços no hero ────────────────────
function renderServicesSection() {
  const grid = document.getElementById('services-grid');
  if (!grid || !state.services.length) return;

  const icons = ['✂️', '🪒', '💈', '👁️', '🧴', '✨'];
  grid.innerHTML = state.services.map((s, i) => `
    <div class="service-card" onclick="scrollToBooking(${s.id})">
      <div class="service-icon">${icons[i % icons.length]}</div>
      <h3>${s.name}</h3>
      <p>${s.description || ''}</p>
      <div class="service-footer">
        <span class="service-price">R$ ${parseFloat(s.price).toFixed(2).replace('.', ',')}</span>
        <span class="service-duration">${s.duration_minutes} min</span>
      </div>
    </div>
  `).join('');
}

function scrollToBooking(serviceId) {
  if (serviceId) {
    const service = state.services.find(s => s.id === serviceId);
    if (service) selectService(service);
  }
  document.getElementById('agendar').scrollIntoView({ behavior: 'smooth' });
}

// ─── Gerenciamento de steps ────────────────────────
function renderStep(step) {
  state.step = step;

  document.querySelectorAll('.step-content').forEach((el, i) => {
    el.classList.toggle('active', i + 1 === step);
  });

  document.querySelectorAll('.step-item').forEach((el, i) => {
    el.classList.remove('active', 'done');
    if (i + 1 === step) el.classList.add('active');
    if (i + 1 < step) el.classList.add('done');
  });

  if (step === 1) renderServiceOptions();
  if (step === 2) renderCalendar();
  if (step === 4) renderSummary();
}

function nextStep() {
  if (state.step === 1 && !state.selected.service) {
    showToast('Selecione um serviço para continuar', 'error'); return;
  }
  if (state.step === 2 && !state.selected.slot) {
    showToast('Selecione uma data e horário para continuar', 'error'); return;
  }
  if (state.step === 3) {
    if (!validateForm()) return;
  }
  if (state.step < 4) renderStep(state.step + 1);
}

function prevStep() {
  if (state.step > 1) renderStep(state.step - 1);
}

// ─── Step 1: Serviços ─────────────────────────────
function renderServiceOptions() {
  const container = document.getElementById('booking-services');
  if (!container) return;

  container.innerHTML = state.services.map(s => {
    const signal = (s.price * s.signal_percentage / 100).toFixed(2);
    const isSelected = state.selected.service?.id === s.id;
    return `
      <div class="service-option ${isSelected ? 'selected' : ''}" onclick="selectService(${JSON.stringify(s).replace(/"/g, '&quot;')})">
        <h4>${s.name}</h4>
        <div class="price">R$ ${parseFloat(s.price).toFixed(2).replace('.', ',')}</div>
        <div class="duration">${s.duration_minutes} min${s.signal_percentage > 0 ? ` · Sinal: R$ ${parseFloat(signal).toFixed(2).replace('.', ',')}` : ' · Sem sinal'}</div>
      </div>
    `;
  }).join('');
}

function selectService(service) {
  state.selected.service = service;
  document.querySelectorAll('.service-option').forEach(el => el.classList.remove('selected'));
  event?.currentTarget?.classList.add('selected');
  renderServiceOptions();
}

// ─── Step 2: Calendário ────────────────────────────
function renderCalendar() {
  const year = state.calendarYear;
  const month = state.calendarMonth;

  const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                      'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  const title = document.getElementById('cal-title');
  if (title) title.textContent = `${monthNames[month]} ${year}`;

  const grid = document.getElementById('cal-grid');
  if (!grid) return;

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  // Datas com disponibilidade
  const availSet = new Set(state.availableDates.map(d => d.date?.split('T')[0] || d.date));

  let html = '';

  // Cabeçalho
  ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].forEach(d => {
    html += `<div class="cal-day-name">${d}</div>`;
  });

  // Dias vazios antes do início
  for (let i = 0; i < firstDay; i++) html += `<div class="cal-day"></div>`;

  // Dias do mês
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isAvailable = availSet.has(dateStr);
    const isToday = today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;
    const isPast = new Date(year, month, day) < new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const isSelected = state.selected.date === dateStr;

    let cls = 'cal-day';
    if (isToday) cls += ' today';
    if (isAvailable && !isPast) {
      cls += ' available';
      if (isSelected) cls += ' selected';
      html += `<div class="${cls}" onclick="selectDate('${dateStr}')">${day}</div>`;
    } else {
      html += `<div class="${cls}">${day}</div>`;
    }
  }

  grid.innerHTML = html;
  renderSlots();
}

function calNav(dir) {
  state.calendarMonth += dir;
  if (state.calendarMonth > 11) { state.calendarMonth = 0; state.calendarYear++; }
  if (state.calendarMonth < 0) { state.calendarMonth = 11; state.calendarYear--; }
  renderCalendar();
}

async function selectDate(dateStr) {
  state.selected.date = dateStr;
  state.selected.slot = null;

  renderCalendar();

  const slotsContainer = document.getElementById('slots-container');
  if (slotsContainer) {
    slotsContainer.innerHTML = `<div class="slots-empty"><div class="spinner spinner-gold"></div></div>`;
  }

  await loadSlots(dateStr);
  renderSlots();
}

function renderSlots() {
  const container = document.getElementById('slots-container');
  if (!container) return;

  if (!state.selected.date) {
    container.innerHTML = `<p class="slots-empty">Selecione uma data no calendário acima</p>`;
    return;
  }

  if (!state.availableSlots.length) {
    container.innerHTML = `<p class="slots-empty">Nenhum horário disponível para esta data</p>`;
    return;
  }

  const label = document.getElementById('slots-label');
  const dateFormatted = new Date(state.selected.date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  if (label) label.textContent = `Horários disponíveis para ${dateFormatted}:`;

  container.innerHTML = `<div class="slots-grid">` +
    state.availableSlots.map(slot => {
      const time = new Date(slot.slot_datetime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const isSelected = state.selected.slot?.id === slot.id;
      return `<button class="slot-btn ${isSelected ? 'selected' : ''}" onclick="selectSlot(${JSON.stringify(slot).replace(/"/g, '&quot;')})">${time}</button>`;
    }).join('') + `</div>`;
}

function selectSlot(slot) {
  state.selected.slot = slot;
  renderSlots();
}

// ─── Step 3: Formulário ───────────────────────────
function validateForm() {
  const name = document.getElementById('client-name')?.value.trim();
  const phone = document.getElementById('client-phone')?.value.trim();

  if (!name) { showToast('Informe seu nome completo', 'error'); return false; }
  if (!phone || phone.replace(/\D/g, '').length < 10) {
    showToast('Informe um telefone válido', 'error'); return false;
  }
  return true;
}

// ─── Step 4: Resumo e pagamento ───────────────────
function renderSummary() {
  const s = state.selected;
  if (!s.service || !s.date || !s.slot) return;

  const slot = s.slot;
  const slotDate = new Date(slot.slot_datetime);
  const dateStr = slotDate.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  const timeStr = slotDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const name = document.getElementById('client-name')?.value.trim() || '';
  const phone = document.getElementById('client-phone')?.value.trim() || '';
  const email = document.getElementById('client-email')?.value.trim() || '';

  const signal = (s.service.price * s.service.signal_percentage / 100);

  document.getElementById('summary-service').textContent = s.service.name;
  document.getElementById('summary-datetime').textContent = `${dateStr} às ${timeStr}`;
  document.getElementById('summary-client').textContent = name;
  document.getElementById('summary-phone').textContent = phone;
  document.getElementById('summary-price').textContent = `R$ ${parseFloat(s.service.price).toFixed(2).replace('.', ',')}`;

  const signalRow = document.getElementById('summary-signal-row');
  const signalEl = document.getElementById('summary-signal');
  const payBtn = document.getElementById('pay-btn');

  if (s.service.signal_percentage > 0) {
    if (signalRow) signalRow.style.display = 'flex';
    if (signalEl) signalEl.textContent = `R$ ${signal.toFixed(2).replace('.', ',')}`;
    if (payBtn) payBtn.textContent = `Pagar Sinal — R$ ${signal.toFixed(2).replace('.', ',')}`;
  } else {
    if (signalRow) signalRow.style.display = 'none';
    if (payBtn) {
      payBtn.textContent = 'Confirmar Agendamento (sem sinal)';
    }
  }

  if (email && document.getElementById('summary-email-row')) {
    document.getElementById('summary-email-row').style.display = 'flex';
    document.getElementById('summary-email').textContent = email;
  }
}

async function submitBooking() {
  const btn = document.getElementById('pay-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Processando...'; }

  const s = state.selected;
  const name = document.getElementById('client-name')?.value.trim();
  const phone = document.getElementById('client-phone')?.value.trim();
  const email = document.getElementById('client-email')?.value.trim();
  const notes = document.getElementById('client-notes')?.value.trim();

  try {
    // Criar agendamento
    const apptRes = await fetch(`${API}/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: name,
        client_phone: phone,
        client_email: email,
        service_id: s.service.id,
        time_slot_id: s.slot.id,
        notes
      })
    });

    const apptData = await apptRes.json();
    if (!apptRes.ok) throw new Error(apptData.error || 'Erro ao criar agendamento');

    const appointmentId = apptData.appointment.id;
    const signalAmount = apptData.signal_amount;

    if (signalAmount <= 0) {
      // Serviço sem sinal — agendamento direto
      showPaymentResult('free', appointmentId);
      return;
    }

    // Criar preferência de pagamento
    const payRes = await fetch(`${API}/payments/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appointment_id: appointmentId })
    });

    const payData = await payRes.json();
    if (!payRes.ok) throw new Error(payData.error || 'Erro ao criar pagamento');

    // Redirecionar para o Mercado Pago
    window.location.href = payData.checkout_url;

  } catch (err) {
    showToast(err.message, 'error');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `Pagar Sinal`;
    }
  }
}

// ─── Resultado do pagamento ───────────────────────
function showPaymentResult(type, appointmentId) {
  const el = document.getElementById('payment-result');
  if (!el) return;

  const configs = {
    success: {
      icon: '✅',
      title: 'Agendamento Confirmado!',
      desc: 'Sinal pago com sucesso. Você receberá uma confirmação em breve. Nos vemos em breve!',
      color: 'var(--success)'
    },
    failure: {
      icon: '❌',
      title: 'Pagamento não concluído',
      desc: 'Houve um problema com o pagamento. Você pode tentar novamente ou entrar em contato.',
      color: 'var(--error)'
    },
    pending: {
      icon: '⏳',
      title: 'Pagamento em Processamento',
      desc: 'Seu pagamento está sendo processado. Confirmaremos seu agendamento em breve.',
      color: 'var(--warning)'
    },
    free: {
      icon: '✅',
      title: 'Agendamento Realizado!',
      desc: 'Seu horário foi reservado com sucesso. Até breve!',
      color: 'var(--success)'
    }
  };

  const cfg = configs[type] || configs.success;
  el.innerHTML = `
    <div class="result-icon">${cfg.icon}</div>
    <h2 class="result-title" style="color:${cfg.color}">${cfg.title}</h2>
    <p class="result-desc">${cfg.desc}</p>
    ${appointmentId ? `<p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:1.5rem">Agendamento #${appointmentId}</p>` : ''}
    <div style="display:flex;gap:1rem;flex-wrap:wrap;justify-content:center">
      <a href="/" class="btn btn-primary">Voltar ao início</a>
      ${type === 'failure' ? `<a href="/#agendar" class="btn btn-secondary">Tentar novamente</a>` : ''}
    </div>
  `;
  el.classList.add('show');

  window.history.replaceState({}, document.title, '/');
}

// ─── Toast ────────────────────────────────────────
function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = `show ${type}`;
  setTimeout(() => { el.className = ''; }, 3500);
}

// ─── Phone mask ───────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const phone = document.getElementById('client-phone');
  if (!phone) return;
  phone.addEventListener('input', () => {
    let v = phone.value.replace(/\D/g, '').slice(0, 11);
    if (v.length > 6) v = `(${v.slice(0,2)}) ${v.slice(2,7)}-${v.slice(7)}`;
    else if (v.length > 2) v = `(${v.slice(0,2)}) ${v.slice(2)}`;
    else if (v.length > 0) v = `(${v}`;
    phone.value = v;
  });
});
