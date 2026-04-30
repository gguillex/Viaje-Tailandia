/* ═══════════════════════════════════════════════════════════════
   TAILANDIA 2026 · app.js
   ═══════════════════════════════════════════════════════════════ */

'use strict';

// ─────────────────────────────────────────────────────────────────
// 1. CONFIGURACIÓN
// ─────────────────────────────────────────────────────────────────

const API_URL = 'https://qyagxnjmowpkpbeduheg.supabase.co/functions/v1/dynamic-task';

// ─────────────────────────────────────────────────────────────────
// 2. CONSTANTES DE DATOS
// ─────────────────────────────────────────────────────────────────

const travelers = [
  'Guillermo Garcia',
  'Javier Simón',
  'Gerardo Rubio',
  'Francisco Soriano',
  'Carlos Jimenez',
  'Mario Montes',
  'Ivan Martínez'
];

const transportsList = [
  { id: 't1', name: 'Madrid ↔ Bangkok' },
  { id: 't2', name: 'Bangkok → Chiang Mai' },
  { id: 't3', name: 'Chiang Mai → Chiang Rai' },
  { id: 't4', name: 'Chiang Rai → Krabi' },
  { id: 't5', name: 'Krabi ↔ Phi Phi' },
  { id: 't6', name: 'Krabi → Koh Tao' },
  { id: 't7', name: 'Koh Tao → Chumphon' },
  { id: 't8', name: 'Chumphon → Bangkok' }
];

const accomsList = [
  { id: 'a1', name: 'Bangkok 1 (Llegada)' },
  { id: 'a2', name: 'Chiang Mai (Skyzie)' },
  { id: 'a3', name: 'Chiang Rai' },
  { id: 'a4', name: 'Krabi (Hotel Krabi)' },
  { id: 'a5', name: 'Phi Phi (Resort)' },
  { id: 'a6', name: 'Koh Tao (Villa Maravilla)' },
  { id: 'a7', name: 'Bangkok 2 (Final)' }
];

// ─────────────────────────────────────────────────────────────────
// 3. CAPA API — todas las llamadas pasan por la Edge Function
// ─────────────────────────────────────────────────────────────────

const SESSION_KEY    = 'th26_session_v1';
const AUTH_STATE_KEY = 'th26_auth_state_v1';

// ⚠️ Sustituye esto con tu anon key real (empieza por eyJ...)
// La encuentras en: Supabase Dashboard → Settings → API → anon public
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF5YWd4bmptb3dwa3BiZWR1aGVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1MzA3MjAsImV4cCI6MjA5MzEwNjcyMH0.EesUy3bpgi3P7dPHg_iCDFFUhoeHPH4l2M7qmVePAKM';

function getToken() {
  return sessionStorage.getItem(SESSION_KEY) || '';
}

async function api(action, body = null, requiresAuth = true) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
  };
  if (requiresAuth) headers['x-session-token'] = getToken();

  const res = await fetch(`${API_URL}?action=${action}`, {
    method: 'POST',
    headers,
    body: body ? JSON.stringify(body) : '{}'
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

// ─────────────────────────────────────────────────────────────────
// 4. SEGURIDAD — PIN + RATE LIMITING (controla la UI)
// ─────────────────────────────────────────────────────────────────

const MAX_ATTEMPTS         = 5;
const LOCKOUT_DURATIONS_MS = [30_000, 300_000, 1_800_000];

let lockoutTimerInterval = null;

function getAuthState() {
  try {
    return JSON.parse(sessionStorage.getItem(AUTH_STATE_KEY)) || {
      attempts: 0, lockoutLevel: -1, lockedUntil: null
    };
  } catch {
    return { attempts: 0, lockoutLevel: -1, lockedUntil: null };
  }
}

function saveAuthState(state) {
  sessionStorage.setItem(AUTH_STATE_KEY, JSON.stringify(state));
}

function isCurrentlyLocked(state) {
  if (!state.lockedUntil) return false;
  return Date.now() < state.lockedUntil;
}

function recordFailedAttempt() {
  const state = getAuthState();
  state.attempts++;
  if (state.attempts >= MAX_ATTEMPTS) {
    state.lockoutLevel = Math.min(state.lockoutLevel + 1, LOCKOUT_DURATIONS_MS.length - 1);
    state.lockedUntil  = Date.now() + LOCKOUT_DURATIONS_MS[state.lockoutLevel];
    state.attempts     = 0;
  }
  saveAuthState(state);
  return state;
}

function startLockoutTimer() {
  clearInterval(lockoutTimerInterval);
  const lockoutEl = document.getElementById('auth-lockout');
  const msgEl     = document.getElementById('lockout-message');
  const loginBtn  = document.getElementById('login-btn');
  const digits    = document.querySelectorAll('#login-pin-inputs .pin-digit');

  function update() {
    const state     = getAuthState();
    const remaining = state.lockedUntil ? Math.max(0, state.lockedUntil - Date.now()) : 0;

    if (remaining <= 0) {
      clearInterval(lockoutTimerInterval);
      lockoutEl.style.display = 'none';
      loginBtn.disabled       = false;
      digits.forEach(d => { d.disabled = false; d.value = ''; d.classList.remove('error'); });
      document.getElementById('auth-attempts-info').textContent = '';
      digits[0].focus();
      return;
    }

    const secs = Math.ceil(remaining / 1000);
    const mins = Math.floor(secs / 60);
    const s    = secs % 60;
    msgEl.textContent       = mins > 0
      ? `Bloqueado ${mins}m ${s}s — demasiados intentos fallidos`
      : `Bloqueado ${s}s — demasiados intentos fallidos`;
    lockoutEl.style.display = 'flex';
    loginBtn.disabled       = true;
    digits.forEach(d => d.disabled = true);
  }

  update();
  lockoutTimerInterval = setInterval(update, 500);
}

function setupPinInputs(groupId, onEnter) {
  const container = document.getElementById(groupId);
  if (!container) return;
  const inputs = container.querySelectorAll('.pin-digit');

  inputs.forEach((input, idx) => {
    input.addEventListener('keydown', (e) => {
      if (!/^\d$/.test(e.key) && e.key !== 'Backspace' && e.key !== 'Tab' && e.key !== 'Enter') {
        e.preventDefault();
      }
      if (e.key === 'Backspace') {
        if (input.value === '' && idx > 0) {
          inputs[idx - 1].value = '';
          inputs[idx - 1].classList.remove('filled');
          inputs[idx - 1].focus();
        } else {
          input.value = '';
          input.classList.remove('filled');
        }
        e.preventDefault();
      }
      if (e.key === 'Enter') { onEnter(); }
    });

    input.addEventListener('input', () => {
      if (input.value.length > 1) input.value = input.value.slice(-1);
      if (!/^\d$/.test(input.value)) { input.value = ''; return; }
      input.classList.add('filled');
      if (idx < inputs.length - 1) {
        inputs[idx + 1].focus();
      } else {
        setTimeout(onEnter, 80);
      }
    });

    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
      inputs.forEach((inp, i) => {
        inp.value = text[i] || '';
        inp.classList.toggle('filled', !!inp.value);
      });
      inputs[Math.min(text.length, inputs.length - 1)].focus();
    });
  });
}

function readPin(groupId) {
  const inputs = document.querySelectorAll(`#${groupId} .pin-digit`);
  return Array.from(inputs).map(i => i.value).join('');
}

function shakeAndClearPin(groupId) {
  const inputs = document.querySelectorAll(`#${groupId} .pin-digit`);
  inputs.forEach(i => { i.classList.add('error'); i.classList.remove('filled'); });
  setTimeout(() => {
    inputs.forEach(i => { i.value = ''; i.classList.remove('error'); });
    inputs[0].focus();
  }, 500);
}

// ─────────────────────────────────────────────────────────────────
// 5. FLUJO DE AUTENTICACIÓN
// ─────────────────────────────────────────────────────────────────

async function initAuth() {
  const token = getToken();
  if (token) {
    try {
      await api('load', null, true);
      showApp();
      return;
    } catch {
      sessionStorage.removeItem(SESSION_KEY);
    }
  }

  try {
    const { exists } = await api('check_pin', null, false);
    hideAuthLoading();
    if (!exists) {
      showSetupMode();
    } else {
      showLoginMode();
    }
  } catch (err) {
    showAuthError('Error conectando con el servidor: ' + err.message);
  }
}

function hideAuthLoading() {
  document.getElementById('auth-loading').style.display = 'none';
}

function showAuthError(msg) {
  hideAuthLoading();
  const el = document.getElementById('auth-error') || document.getElementById('setup-error');
  if (el) el.textContent = msg;
  document.getElementById('login-mode').style.display = 'block';
}

function showSetupMode() {
  document.getElementById('setup-mode').style.display = 'block';
  setupPinInputs('setup-pin-inputs', setupPin);
  document.querySelector('#setup-pin-inputs .pin-digit').focus();
}

function showLoginMode() {
  document.getElementById('login-mode').style.display = 'block';
  setupPinInputs('login-pin-inputs', verifyPin);
  const state = getAuthState();
  if (isCurrentlyLocked(state)) {
    startLockoutTimer();
  } else {
    document.querySelector('#login-pin-inputs .pin-digit').focus();
  }
}

function showApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  initApp();
}

async function setupPin() {
  const pin   = readPin('setup-pin-inputs');
  const errEl = document.getElementById('setup-error');
  errEl.textContent = '';

  if (pin.length !== 4) {
    errEl.textContent = 'El PIN debe tener exactamente 4 dígitos.';
    return;
  }

  try {
    const { token } = await api('setup', { pin }, false);
    sessionStorage.setItem(SESSION_KEY, token);
    showApp();
  } catch (err) {
    errEl.textContent = 'Error: ' + err.message;
  }
}

async function verifyPin() {
  const state = getAuthState();
  if (isCurrentlyLocked(state)) { startLockoutTimer(); return; }

  const pin   = readPin('login-pin-inputs');
  const errEl = document.getElementById('auth-error');
  const attEl = document.getElementById('auth-attempts-info');
  errEl.textContent = '';

  if (pin.length !== 4) {
    errEl.textContent = 'Introduce los 4 dígitos.';
    return;
  }

  const loginBtn    = document.getElementById('login-btn');
  loginBtn.disabled = true;

  try {
    const { token } = await api('login', { pin }, false);
    saveAuthState({ attempts: 0, lockoutLevel: -1, lockedUntil: null });
    sessionStorage.setItem(SESSION_KEY, token);
    showApp();
  } catch (err) {
    const newState       = recordFailedAttempt();
    const remainAttempts = MAX_ATTEMPTS - newState.attempts;

    shakeAndClearPin('login-pin-inputs');

    if (isCurrentlyLocked(newState)) {
      errEl.textContent = '';
      attEl.textContent = '';
      startLockoutTimer();
    } else {
      errEl.textContent = '❌ PIN incorrecto';
      attEl.textContent = remainAttempts > 0
        ? `${remainAttempts} intento${remainAttempts !== 1 ? 's' : ''} restante${remainAttempts !== 1 ? 's' : ''} antes del bloqueo`
        : '';
      loginBtn.disabled = false;
    }
  }
}

function logout() {
  sessionStorage.removeItem(SESSION_KEY);
  location.reload();
}

// ─────────────────────────────────────────────────────────────────
// 6. CAPA DE DATOS
// ─────────────────────────────────────────────────────────────────

let ticketsCache = {};
let accomsCache  = {};

async function loadAllData() {
  const { tickets, accoms } = await api('load');

  ticketsCache = {};
  for (const row of tickets) {
    if (!ticketsCache[row.traveler_name]) ticketsCache[row.traveler_name] = {};
    ticketsCache[row.traveler_name][row.transport_id] = {
      url:       row.url       || '',
      image_url: row.image_url || '',
      pdf_url:   row.pdf_url   || ''
    };
  }

  accomsCache = {};
  for (const row of accoms) {
    if (!accomsCache[row.traveler_name]) accomsCache[row.traveler_name] = {};
    accomsCache[row.traveler_name][row.accom_id] = row.is_paid;
  }
}

async function upsertTicket(traveler, transportId, fields) {
  const cached  = ticketsCache[traveler]?.[transportId] || {};
  const payload = {
    traveler_name: traveler,
    transport_id:  transportId,
    url:           fields.url       ?? cached.url       ?? '',
    image_url:     fields.image_url ?? cached.image_url ?? '',
    pdf_url:       fields.pdf_url   ?? cached.pdf_url   ?? ''
  };

  await api('upsert_ticket', payload);

  if (!ticketsCache[traveler]) ticketsCache[traveler] = {};
  ticketsCache[traveler][transportId] = {
    url:       payload.url,
    image_url: payload.image_url,
    pdf_url:   payload.pdf_url
  };
}

async function deleteTicketRow(traveler, transportId) {
  await api('delete_ticket', { traveler_name: traveler, transport_id: transportId });
  if (ticketsCache[traveler]) delete ticketsCache[traveler][transportId];
}

async function uploadFile(file, traveler, transportId, onProgress) {
  const ext      = file.name.split('.').pop().toLowerCase();
  const safeName = traveler.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
  const path     = `${safeName}_${transportId}_${Date.now()}.${ext}`;

  onProgress(20);

  // Pedir URL firmada a la Edge Function
  const { signedUrl, path: uploadPath } = await api('upload_url', { path });
  onProgress(40);

  // Subir directamente a Supabase Storage con la URL firmada
  const uploadRes = await fetch(signedUrl, {
    method:  'PUT',
    headers: { 'Content-Type': file.type, 'x-upsert': 'true' },
    body:    file
  });

  if (!uploadRes.ok) throw new Error('Error subiendo fichero al storage');
  onProgress(80);

  // Pedir URL pública a la Edge Function
  const { publicUrl } = await api('public_url', { path: uploadPath || path });
  onProgress(100);

  return publicUrl;
}

async function deleteFileFromStorage(fileUrl) {
  if (!fileUrl) return;
  const marker = '/object/public/tickets/';
  const idx    = fileUrl.indexOf(marker);
  if (idx === -1) return;
  const filePath = decodeURIComponent(fileUrl.slice(idx + marker.length).split('?')[0]);
  await api('delete_file', { path: filePath });
}

async function toggleAccomPaid(traveler, accomId, currentValue) {
  const newValue = !currentValue;
  await api('toggle_accom', { traveler_name: traveler, accom_id: accomId, is_paid: newValue });
  if (!accomsCache[traveler]) accomsCache[traveler] = {};
  accomsCache[traveler][accomId] = newValue;
}

// ─────────────────────────────────────────────────────────────────
// 7. UI — NAVEGACIÓN
// ─────────────────────────────────────────────────────────────────

function showSection(id, event) {
  if (event) event.preventDefault();
  document.getElementById('navbar').classList.remove('open');

  document.querySelectorAll('section').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(id);
  if (target) {
    target.classList.add('active');
    window.scrollTo({ top: document.querySelector('.hero').offsetHeight, behavior: 'smooth' });
  }

  document.querySelectorAll('nav a').forEach(a => a.classList.remove('active-nav'));
  const link = document.querySelector(`nav a[href="#${id}"]`);
  if (link) link.classList.add('active-nav');
}

// ─────────────────────────────────────────────────────────────────
// 8. UI — SECCIÓN BILLETES
// ─────────────────────────────────────────────────────────────────

function renderTravelers() {
  const container = document.getElementById('travelers-container');
  if (!container) return;
  container.innerHTML = '';

  travelers.forEach(traveler => {
    const card = document.createElement('div');
    card.className = 'traveler-card';

    let html = `<div class="traveler-name">👤 ${escHtml(traveler)}</div><div class="t-list">`;

    html += `<div class="t-subtitle">Transportes</div>`;
    transportsList.forEach(t => {
      const ticket    = ticketsCache[traveler]?.[t.id];
      const hasTicket = ticket && (ticket.url || ticket.image_url || ticket.pdf_url);
      html += `
        <div class="traveler-transport">
          <div class="t-info">
            <div class="t-status ${hasTicket ? 'done' : ''}"></div>
            <div>${escHtml(t.name)}</div>
          </div>
          <div class="t-actions">
            ${hasTicket ? `<button class="btn-action btn-view" onclick="handleViewClick('${esc(traveler)}','${t.id}')">Ver</button>` : ''}
            <button class="btn-action" onclick="openTicketModal('${esc(traveler)}','${t.id}','${esc(t.name)}')">
              ${hasTicket ? 'Editar' : 'Subir'}
            </button>
          </div>
        </div>`;
    });

    html += `<div class="t-subtitle">Alojamientos</div>`;
    accomsList.forEach(a => {
      const isPaid = accomsCache[traveler]?.[a.id] || false;
      html += `
        <div class="traveler-transport">
          <div class="t-info">
            <div>🛏️ ${escHtml(a.name)}</div>
          </div>
          <div class="t-actions">
            <button class="btn-action ${isPaid ? 'is-paid' : ''}"
              onclick="openConfirmModal('${esc(traveler)}','${a.id}','${esc(a.name)}')">
              ${isPaid ? '✅ Pagado' : '💳 Pagar'}
            </button>
          </div>
        </div>`;
    });

    html += `</div>`;
    card.innerHTML = html;
    container.appendChild(card);

    card.style.opacity    = '0';
    card.style.transform  = 'translateY(20px)';
    card.style.transition = 'opacity .5s ease, transform .5s ease';
    scrollObserver.observe(card);
  });

  document.getElementById('billetes-loading').style.display = 'none';
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function esc(str) {
  return String(str).replace(/'/g, "\\'");
}

// ─────────────────────────────────────────────────────────────────
// 9. UI — MODALES DE BILLETES
// ─────────────────────────────────────────────────────────────────

let currentModalTraveler    = '';
let currentModalTransportId = '';

function openTicketModal(traveler, transportId, transportName) {
  currentModalTraveler    = traveler;
  currentModalTransportId = transportId;

  document.getElementById('modal-traveler-name-display').textContent = traveler;
  document.getElementById('modal-transport-name').textContent        = transportName;
  document.getElementById('modal-traveler-confirm').value = '';
  document.getElementById('modal-ticket-url').value       = '';
  document.getElementById('modal-ticket-image').value     = '';
  document.getElementById('modal-ticket-pdf').value       = '';
  document.getElementById('modal-error').textContent      = '';
  document.getElementById('modal-upload-progress').style.display = 'none';

  const ticket = ticketsCache[traveler]?.[transportId];
  document.getElementById('btn-delete-url').style.display = ticket?.url       ? 'block' : 'none';
  document.getElementById('btn-delete-img').style.display = ticket?.image_url ? 'block' : 'none';
  document.getElementById('btn-delete-pdf').style.display = ticket?.pdf_url   ? 'block' : 'none';

  document.getElementById('ticket-modal').classList.add('active');
  setTimeout(() => document.getElementById('modal-traveler-confirm').focus(), 100);
}

function closeTicketModal() {
  document.getElementById('ticket-modal').classList.remove('active');
}

function confirmName() {
  const input = document.getElementById('modal-traveler-confirm').value.trim();
  const errEl = document.getElementById('modal-error');
  if (input.toLowerCase() !== currentModalTraveler.toLowerCase()) {
    errEl.textContent = `Escribe exactamente: "${currentModalTraveler}"`;
    return false;
  }
  errEl.textContent = '';
  return true;
}

async function deleteTicketPart(part) {
  if (!confirmName()) return;

  const saveBtn    = document.getElementById('btn-save-ticket');
  saveBtn.disabled = true;

  try {
    const ticket = ticketsCache[currentModalTraveler]?.[currentModalTransportId] || {};

    if (part === 'image') await deleteFileFromStorage(ticket.image_url);
    if (part === 'pdf')   await deleteFileFromStorage(ticket.pdf_url);

    const merged = {
      url:       part === 'url'   ? '' : ticket.url,
      image_url: part === 'image' ? '' : ticket.image_url,
      pdf_url:   part === 'pdf'   ? '' : ticket.pdf_url
    };

    if (!merged.url && !merged.image_url && !merged.pdf_url) {
      await deleteTicketRow(currentModalTraveler, currentModalTransportId);
    } else {
      await upsertTicket(currentModalTraveler, currentModalTransportId, merged);
    }

    closeTicketModal();
    renderTravelers();
  } catch (err) {
    document.getElementById('modal-error').textContent = 'Error: ' + err.message;
  } finally {
    saveBtn.disabled = false;
  }
}

async function saveTicket() {
  if (!confirmName()) return;

  const urlInput   = document.getElementById('modal-ticket-url').value.trim();
  const imageInput = document.getElementById('modal-ticket-image').files[0];
  const pdfInput   = document.getElementById('modal-ticket-pdf').files[0];
  const errEl      = document.getElementById('modal-error');

  if (!urlInput && !imageInput && !pdfInput) {
    errEl.textContent = 'Debes introducir un enlace, una captura o un PDF.';
    return;
  }

  const saveBtn    = document.getElementById('btn-save-ticket');
  saveBtn.disabled = true;
  errEl.textContent = '';

  const fields  = {};
  const MAX_MB  = 10;
  const progBar = document.getElementById('modal-upload-progress');
  const progFill= document.getElementById('progress-fill');
  const progLbl = document.getElementById('progress-label');

  if (urlInput) {
    fields.url = /^https?:\/\//i.test(urlInput) ? urlInput : 'https://' + urlInput;
  }

  if (imageInput) {
    if (imageInput.size > MAX_MB * 1024 * 1024) {
      errEl.textContent = `La imagen supera los ${MAX_MB} MB.`;
      saveBtn.disabled  = false;
      return;
    }
    progBar.style.display = 'flex';
    progFill.style.width  = '0%';
    try {
      const old = ticketsCache[currentModalTraveler]?.[currentModalTransportId];
      if (old?.image_url) await deleteFileFromStorage(old.image_url);
      fields.image_url = await uploadFile(imageInput, currentModalTraveler, currentModalTransportId, pct => {
        progFill.style.width = pct + '%';
        progLbl.textContent  = pct < 100 ? 'Subiendo imagen…' : '¡Listo!';
      });
    } catch (err) {
      errEl.textContent     = 'Error subiendo imagen: ' + err.message;
      progBar.style.display = 'none';
      saveBtn.disabled      = false;
      return;
    }
  }

  if (pdfInput) {
    if (pdfInput.size > MAX_MB * 1024 * 1024) {
      errEl.textContent = `El PDF supera los ${MAX_MB} MB.`;
      saveBtn.disabled  = false;
      return;
    }
    progBar.style.display = 'flex';
    progFill.style.width  = '0%';
    try {
      const old = ticketsCache[currentModalTraveler]?.[currentModalTransportId];
      if (old?.pdf_url) await deleteFileFromStorage(old.pdf_url);
      fields.pdf_url = await uploadFile(pdfInput, currentModalTraveler, currentModalTransportId, pct => {
        progFill.style.width = pct + '%';
        progLbl.textContent  = pct < 100 ? 'Subiendo PDF…' : '¡Listo!';
      });
    } catch (err) {
      errEl.textContent     = 'Error subiendo PDF: ' + err.message;
      progBar.style.display = 'none';
      saveBtn.disabled      = false;
      return;
    }
  }

  try {
    await upsertTicket(currentModalTraveler, currentModalTransportId, fields);
    closeTicketModal();
    renderTravelers();
  } catch (err) {
    errEl.textContent = 'Error guardando: ' + err.message;
  } finally {
    saveBtn.disabled = false;
  }
}

// ─────────────────────────────────────────────────────────────────
// 10. UI — MODAL PAGO ALOJAMIENTO
// ─────────────────────────────────────────────────────────────────

let currentConfirmTraveler = '';
let currentConfirmAccomId  = '';

function openConfirmModal(traveler, accomId, accomName) {
  currentConfirmTraveler = traveler;
  currentConfirmAccomId  = accomId;
  document.getElementById('confirm-accom-name').textContent    = accomName;
  document.getElementById('confirm-traveler-name').textContent = traveler;
  document.getElementById('confirm-modal').classList.add('active');
}

function closeConfirmModal() {
  document.getElementById('confirm-modal').classList.remove('active');
}

async function confirmToggleAccom() {
  const currentState = accomsCache[currentConfirmTraveler]?.[currentConfirmAccomId] || false;
  try {
    await toggleAccomPaid(currentConfirmTraveler, currentConfirmAccomId, currentState);
    closeConfirmModal();
    renderTravelers();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// ─────────────────────────────────────────────────────────────────
// 11. UI — MODAL VER BILLETE
// ─────────────────────────────────────────────────────────────────

let currentViewTraveler    = '';
let currentViewTransportId = '';

function handleViewClick(traveler, transportId) {
  const ticket  = ticketsCache[traveler]?.[transportId];
  if (!ticket) return;

  const options = [ticket.url, ticket.image_url, ticket.pdf_url].filter(Boolean);

  if (options.length > 1) {
    currentViewTraveler    = traveler;
    currentViewTransportId = transportId;

    document.getElementById('btn-choice-url').style.display = ticket.url       ? 'inline-flex' : 'none';
    document.getElementById('btn-choice-img').style.display = ticket.image_url ? 'inline-flex' : 'none';
    document.getElementById('btn-choice-pdf').style.display = ticket.pdf_url   ? 'inline-flex' : 'none';

    document.getElementById('view-choice-modal').classList.add('active');
  } else if (ticket.url) {
    window.open(ticket.url, '_blank', 'noopener');
  } else if (ticket.image_url) {
    openImageModal(ticket.image_url);
  } else if (ticket.pdf_url) {
    window.open(ticket.pdf_url, '_blank', 'noopener');
  }
}

function closeViewChoiceModal() {
  document.getElementById('view-choice-modal').classList.remove('active');
}

function openChoiceUrl() {
  closeViewChoiceModal();
  const ticket = ticketsCache[currentViewTraveler]?.[currentViewTransportId];
  if (ticket?.url) window.open(ticket.url, '_blank', 'noopener');
}

function openChoiceImage() {
  closeViewChoiceModal();
  const ticket = ticketsCache[currentViewTraveler]?.[currentViewTransportId];
  if (ticket?.image_url) openImageModal(ticket.image_url);
}

function openChoicePdf() {
  closeViewChoiceModal();
  const ticket = ticketsCache[currentViewTraveler]?.[currentViewTransportId];
  if (ticket?.pdf_url) window.open(ticket.pdf_url, '_blank', 'noopener');
}

function openImageModal(url) {
  document.getElementById('image-modal-img').src = url;
  document.getElementById('image-modal').classList.add('active');
}

function closeImageModal() {
  document.getElementById('image-modal').classList.remove('active');
  setTimeout(() => { document.getElementById('image-modal-img').src = ''; }, 300);
}

// ─────────────────────────────────────────────────────────────────
// 12. INTERSECTION OBSERVER
// ─────────────────────────────────────────────────────────────────

const scrollObserver = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.style.opacity   = '1';
      e.target.style.transform = 'translateY(0)';
      scrollObserver.unobserve(e.target);
    }
  });
}, { threshold: 0.06 });

function initScrollAnimations() {
  document.querySelectorAll(
    '.transport-card, .accom-card, .city-block, .budget-breakdown'
  ).forEach(el => {
    el.style.opacity    = '0';
    el.style.transform  = 'translateY(20px)';
    el.style.transition = 'opacity .5s ease, transform .5s ease';
    scrollObserver.observe(el);
  });
}

// ─────────────────────────────────────────────────────────────────
// 13. INICIALIZACIÓN
// ─────────────────────────────────────────────────────────────────

async function initApp() {
  document.getElementById('billetes-loading').style.display = 'flex';
  initScrollAnimations();

  try {
    await loadAllData();
  } catch (err) {
    console.error('Error cargando datos:', err);
  }

  renderTravelers();
}

// ─────────────────────────────────────────────────────────────────
// 14. ARRANQUE
// ─────────────────────────────────────────────────────────────────

initAuth();
