/* ================================================
   app.js — Sistema de agendamento (cliente)
   ================================================ */

const API = '/api';

const state = {
  step: 1,
  services: [],
  availableDates: [],
  availableSlots: [],
  selected: { service: null, date: null, slot: null },
  calendarYear: new Date().getFullYear(),
  calendarMonth: new Date().getMonth(),
  config: {}
};

// ─── Inicialização ─────────────────────────────
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
  initScrollAnimations();
  initCountUp();
});

// ─── Scroll animations ──────────────────────────
function initScrollAnimations() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        observer.unobserve(e.target);
      }
    });
  }, { threshold: 0.12 });

  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

// ─── Count-up nos stats ─────────────────────────
function initCountUp() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.querySelectorAll('[data-target]').forEach(el => {
          const target = parseInt(el.dataset.target);
          const duration = 1400;
          const start = performance.now();
          const tick = (now) => {
            const p = Math.min((now - start) / duration, 1);
            el.textContent = Math.floor(easeOut(p) * target);
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
        observer.unobserve(e.target);
      }
    });
  }, { threshold: 0.4 });

  const statsEl = document.querySelector('.sobre-stats');
  if (statsEl) observer.observe(statsEl);
}

function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

// ─── Config ─────────────────────────────────────
async function loadConfig() {
  try {
    const r = await fetch(`${API}/admin/config`);
    state.config = await r.json();
    if (state.config.name) {
      document.querySelectorAll('.barbershop-name').forEach(el => {
        el.textContent = '✦ ' + state.config.name;
      });
      document.title = state.config.name + ' — Agendamento Online';
    }
  } catch {}
}

// ─── Serviços padrão ────────────────────────────
const DEFAULT_SERVICES = [
  { id: 1, name: 'Corte de Cabelo',  description: 'Corte moderno e estiloso com acabamento perfeito', duration_minutes: 45, price: 50,  signal_percentage: 30 },
  { id: 2, name: 'Barba',            description: 'Aparação, modelagem e hidratação da barba',         duration_minutes: 30, price: 35,  signal_percentage: 30 },
  { id: 3, name: 'Corte + Barba',    description: 'Combo completo: corte de cabelo e tratamento de barba', duration_minutes: 70, price: 75, signal_percentage: 30 },
  { id: 4, name: 'Sobrancelha',      description: 'Design e alinhamento de sobrancelha masculina',    duration_minutes: 20, price: 20,  signal_percentage: 0 }
];

// ─── Dados da API ────────────────────────────────
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

// ─── Seção hero de serviços ─────────────────────
const SERVICE_ICONS = ['✂️', '🪒', '💈', '👁️', '🧴', '✨'];
const POPULAR_ID = 3; // Corte + Barba

function renderServicesSection() {
  const grid = document.getElementById('services-grid');
  if (!grid || !state.services.length) return;

  grid.innerHTML = state.services.map((s, i) => {
    const signal = s.signal_percentage > 0
      ? `R$ ${(s.price * s.signal_percentage / 100).toFixed(2).replace('.', ',')} de sinal`
      : 'Sem sinal';
    const isPopular = s.id === POPULAR_ID;
    return `
      <div class="service-card ${isPopular ? 'popular' : ''} reveal" style="--reveal-delay:${i * 0.08}s" onclick="scrollToBooking(${s.id})">
        ${isPopular ? '<span class="popular-badge">Mais popular</span>' : ''}
        <div class="service-icon">${SERVICE_ICONS[i % SERVICE_ICONS.length]}</div>
        <h3>${s.name}</h3>
        <p>${s.description || ''}</p>
        <div class="service-footer">
          <div>
            <div class="service-price">R$ ${parseFloat(s.price).toFixed(2).replace('.', ',')}</div>
          </div>
          <div class="service-meta">
            <span class="service-duration">${s.duration_minutes} min</span>
            <span class="service-signal">${signal}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Reaplica observer nos novos elementos
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); }
    });
  }, { threshold: 0.1 });
  grid.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

function scrollToBooking(serviceId) {
  if (serviceId) {
    const service = state.services.find(s => s.id === serviceId);
    if (service) { state.selected.service = service; }
  }
  document.getElementById('agendar').scrollIntoView({ behavior: 'smooth' });
  setTimeout(() => renderStep(1), 400);
}

// ─── Steps ──────────────────────────────────────
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
  if (state.step === 3 && !validateForm()) return;
  if (state.step < 4) renderStep(state.step + 1);
}

function prevStep() {
  if (state.step > 1) renderStep(state.step - 1);
}

// ─── Step 1: Serviços ────────────────────────────
function renderServiceOptions() {
  const container = document.getElementById('booking-services');
  if (!container) return;

  container.innerHTML = state.services.map(s => {
    const signal = (s.price * s.signal_percentage / 100).toFixed(2);
    const isSelected = state.selected.service?.id === s.id;
    const signalText = s.signal_percentage > 0
      ? `${s.duration_minutes} min · Sinal: R$ ${parseFloat(signal).toFixed(2).replace('.', ',')}`
      : `${s.duration_minutes} min · Sem sinal`;
    return `
      <div class="service-option ${isSelected ? 'selected' : ''}" onclick="selectService(${JSON.stringify(s).replace(/"/g, '&quot;')})">
        <span class="selected-check">✓</span>
        <h4>${s.name}</h4>
        <div class="price">R$ ${parseFloat(s.price).toFixed(2).replace('.', ',')}</div>
        <div class="duration">${signalText}</div>
      </div>
    `;
  }).join('');
}

function selectService(service) {
  state.selected.service = service;
  renderServiceOptions();
}

// ─── Step 2: Calendário ─────────────────────────
function renderCalendar() {
  const year = state.calendarYear;
  const month = state.calendarMonth;
  const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  const title = document.getElementById('cal-title');
  if (title) title.textContent = `${monthNames[month]} ${year}`;

  const grid = document.getElementById('cal-grid');
  if (!grid) return;

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  const availSet = new Set(state.availableDates.map(d => (d.date || '').split('T')[0]));

  let html = '';
  ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].forEach(d => {
    html += `<div class="cal-day-name">${d}</div>`;
  });

  for (let i = 0; i < firstDay; i++) html += `<div class="cal-day"></div>`;

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
  if (state.calendarMonth < 0)  { state.calendarMonth = 11; state.calendarYear--; }
  renderCalendar();
}

async function selectDate(dateStr) {
  state.selected.date = dateStr;
  state.selected.slot = null;
  renderCalendar();

  const c = document.getElementById('slots-container');
  if (c) c.innerHTML = `<div class="slots-empty"><div class="spinner spinner-gold"></div></div>`;

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
  if (label) label.textContent = `Horários disponíveis — ${dateFormatted}:`;

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

// ─── Step 3: Validação ──────────────────────────
function validateForm() {
  const name = document.getElementById('client-name')?.value.trim();
  const phone = document.getElementById('client-phone')?.value.trim();
  if (!name) { showToast('Informe seu nome completo', 'error'); return false; }
  if (!phone || phone.replace(/\D/g, '').length < 10) {
    showToast('Informe um WhatsApp válido', 'error'); return false;
  }
  return true;
}

// ─── Step 4: Resumo ─────────────────────────────
function renderSummary() {
  const s = state.selected;
  if (!s.service || !s.date || !s.slot) return;

  const slotDate = new Date(s.slot.slot_datetime);
  const dateStr = slotDate.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  const timeStr = slotDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const name  = document.getElementById('client-name')?.value.trim() || '';
  const phone = document.getElementById('client-phone')?.value.trim() || '';
  const email = document.getElementById('client-email')?.value.trim() || '';

  const signal = s.service.price * s.service.signal_percentage / 100;

  document.getElementById('summary-service').textContent  = s.service.name;
  document.getElementById('summary-datetime').textContent = `${dateStr} às ${timeStr}`;
  document.getElementById('summary-client').textContent   = name;
  document.getElementById('summary-phone').textContent    = phone;
  document.getElementById('summary-price').textContent    = `R$ ${parseFloat(s.service.price).toFixed(2).replace('.', ',')}`;

  const signalRow = document.getElementById('summary-signal-row');
  const signalEl  = document.getElementById('summary-signal');
  const payBtn    = document.getElementById('pay-btn');

  if (s.service.signal_percentage > 0) {
    if (signalRow) signalRow.style.display = 'flex';
    if (signalEl) signalEl.textContent = `R$ ${signal.toFixed(2).replace('.', ',')}`;
    if (payBtn) payBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
      Pagar Sinal — R$ ${signal.toFixed(2).replace('.', ',')}
    `;
  } else {
    if (signalRow) signalRow.style.display = 'none';
    if (payBtn) payBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
      Confirmar Agendamento
    `;
  }

  if (email) {
    const row = document.getElementById('summary-email-row');
    if (row) row.style.display = 'flex';
    const el = document.getElementById('summary-email');
    if (el) el.textContent = email;
  }
}

// ─── Submissão ───────────────────────────────────
async function submitBooking() {
  const btn = document.getElementById('pay-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Processando...'; }

  const s = state.selected;
  const name  = document.getElementById('client-name')?.value.trim();
  const phone = document.getElementById('client-phone')?.value.trim();
  const email = document.getElementById('client-email')?.value.trim();
  const notes = document.getElementById('client-notes')?.value.trim();

  try {
    const apptRes = await fetch(`${API}/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_name: name, client_phone: phone, client_email: email, service_id: s.service.id, time_slot_id: s.slot.id, notes })
    });
    const apptData = await apptRes.json();
    if (!apptRes.ok) throw new Error(apptData.error || 'Erro ao criar agendamento');

    const appointmentId = apptData.appointment.id;
    const signalAmount = apptData.signal_amount;

    if (signalAmount <= 0) {
      showPaymentResult('free', appointmentId);
      return;
    }

    const payRes = await fetch(`${API}/payments/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appointment_id: appointmentId })
    });
    const payData = await payRes.json();
    if (!payRes.ok) throw new Error(payData.error || 'Erro ao criar pagamento');

    window.location.href = payData.checkout_url;

  } catch (err) {
    showToast(err.message, 'error');
    if (btn) {
      btn.disabled = false;
      renderSummary();
    }
  }
}

// ─── Resultado do pagamento ──────────────────────
function showPaymentResult(type, appointmentId) {
  const el = document.getElementById('payment-result');
  if (!el) return;

  const configs = {
    success: {
      icon: '✅',
      title: 'Agendamento Confirmado!',
      desc: 'Sinal pago com sucesso. Seu horário está garantido. Até breve na barbearia!',
      color: 'var(--success)',
      confetti: true
    },
    failure: {
      icon: '❌',
      title: 'Pagamento não concluído',
      desc: 'Houve um problema com seu pagamento. Tente novamente ou entre em contato conosco.',
      color: 'var(--error)',
      confetti: false
    },
    pending: {
      icon: '⏳',
      title: 'Pagamento em análise',
      desc: 'Seu pagamento está sendo processado. Confirmaremos seu agendamento em breve.',
      color: 'var(--warning)',
      confetti: false
    },
    free: {
      icon: '✅',
      title: 'Horário Reservado!',
      desc: 'Seu agendamento foi realizado com sucesso. Sem sinal necessário. Até breve!',
      color: 'var(--success)',
      confetti: true
    }
  };

  const cfg = configs[type] || configs.success;

  document.getElementById('result-icon').textContent = cfg.icon;
  document.getElementById('result-title').style.color = cfg.color;
  document.getElementById('result-title').textContent = cfg.title;
  document.getElementById('result-desc').textContent = cfg.desc;
  document.getElementById('result-id').textContent = appointmentId ? `Agendamento #${appointmentId}` : '';
  document.getElementById('result-actions').innerHTML = `
    <a href="/" class="btn btn-primary btn-glow">Voltar ao início</a>
    ${type === 'failure' ? `<a href="/#agendar" class="btn btn-outline">Tentar novamente</a>` : ''}
  `;

  el.classList.add('show');

  if (cfg.confetti) launchConfetti();

  window.history.replaceState({}, document.title, '/');
}

// ─── Confetti ────────────────────────────────────
function launchConfetti() {
  const container = document.getElementById('confetti-container');
  if (!container) return;

  const colors = ['#C9A84C', '#E2C16C', '#22c55e', '#fff', '#f59e0b', '#60a5fa', '#f472b6'];
  const shapes = ['2px', '50%'];

  for (let i = 0; i < 90; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    const color = colors[Math.floor(Math.random() * colors.length)];
    const size = Math.random() * 10 + 5;
    const shape = shapes[Math.floor(Math.random() * shapes.length)];
    piece.style.cssText = `
      left: ${Math.random() * 100}%;
      width: ${size}px;
      height: ${size}px;
      background: ${color};
      border-radius: ${shape};
      animation-duration: ${Math.random() * 2 + 2}s;
      animation-delay: ${Math.random() * 1.5}s;
    `;
    container.appendChild(piece);
  }

  setTimeout(() => { container.innerHTML = ''; }, 5000);
}

// ─── Toast ────────────────────────────────────────
function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = `show ${type}`;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.className = ''; }, 3500);
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
