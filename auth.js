// ═══════════════════════════════════════════════════════════
//  BOMTRACK — auth.js
// ═══════════════════════════════════════════════════════════
// Accesso, sessione e primo amministratore.
// Classic script, scope globale condiviso con gli altri: nessun modulo e
// nessun build, così index.html continua ad aprirsi con un doppio click.

// ═══════════════════════════════════════════════════════════
//  ACCESSO, SESSIONE E UTENTI
// ═══════════════════════════════════════════════════════════
// Struttura e nomi ricalcano timetrack-supabase (submitLogin/initSession/
// doLogin/logout): quando i dati passeranno a Supabase basterà sostituire il
// corpo di verifyCredentials() con supa.auth.signInWithPassword() e il caricamento
// utenti con la tabella `profiles`. Tutto il resto — ruoli, guardie, UI — resta.
const SESSION_KEY = 'bomtrack_session';
const SAVED_EMAIL_KEY = 'bomtrack_saved_email';

function userList() { return db.users || []; }
function getUser(id) { return userList().find(u => u.id === id); }
function findUserByEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  return userList().find(u => (u.email || '').toLowerCase() === e);
}
function activeAdmins(exceptId) { return userList().filter(u => u.role === 'admin' && u.active !== false && u.id !== exceptId); }
function setUserPassword(u, password) {
  u.passwordSalt = newSalt();
  u.passwordHash = hashPassword(password, u.passwordSalt);
}
function verifyPassword(u, password) {
  return !!u && !!u.passwordHash && hashPassword(password, u.passwordSalt) === u.passwordHash;
}

function _loginError(msg) {
  const el = document.getElementById('login-error');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}
// Primo avvio: senza utenti si crea il primo amministratore, invece di
// spedire l'app con credenziali predefinite scritte nel codice.
function needsSetup() { return userList().length === 0; }
function renderLogin() {
  const setup = needsSetup();
  document.getElementById('login-setup-fields').style.display = setup ? '' : 'none';
  document.getElementById('login-remember-row').style.display = setup ? 'none' : '';
  document.getElementById('login-sub').textContent = setup
    ? 'Primo avvio — crea l\'amministratore' : 'Distinte base & Costificazione';
  document.getElementById('login-submit').textContent = setup ? 'Crea amministratore' : 'Accedi';
  const err = document.getElementById('login-error'); if (err) err.style.display = 'none';
  const saved = !setup && localStorage.getItem(SAVED_EMAIL_KEY);
  if (saved) {
    setVal('login-email', saved);
    const cb = document.getElementById('login-remember'); if (cb) cb.checked = true;
    setTimeout(() => document.getElementById('login-password') && document.getElementById('login-password').focus(), 50);
  } else {
    setTimeout(() => {
      const first = document.getElementById(setup ? 'login-name' : 'login-email');
      if (first) first.focus();
    }, 50);
  }
}
function submitLogin() {
  if (needsSetup()) return createFirstAdmin();
  const email = val('login-email');
  const password = document.getElementById('login-password').value;
  if (!email) return _loginError('Inserisci la tua email');
  if (!password) return _loginError('Inserisci la password');
  const u = findUserByEmail(email);
  // Un solo messaggio per utente inesistente e password errata: non si rivela
  // quali email esistono.
  if (!u || !verifyPassword(u, password)) {
    _loginError('Email o password errati');
    setVal('login-password', '');
    return;
  }
  if (u.active === false) return _loginError('Account sospeso. Contatta un amministratore.');
  if (document.getElementById('login-remember').checked) localStorage.setItem(SAVED_EMAIL_KEY, u.email || '');
  else localStorage.removeItem(SAVED_EMAIL_KEY);
  setVal('login-password', '');
  doLogin(u, true);
}
function createFirstAdmin() {
  const name = val('login-name'), email = val('login-email');
  const password = document.getElementById('login-password').value;
  if (!name) return _loginError('Inserisci il tuo nome');
  if (!email) return _loginError('Inserisci la tua email');
  if (password.length < 4) return _loginError('La password deve avere almeno 4 caratteri');
  const u = { id: gid(), name, username: '', email, role: 'admin', color: '#3A7BE8', active: true };
  setUserPassword(u, password);
  Store.insert('users', u);
  setVal('login-password', '');
  doLogin(u, true);
  showToast('Amministratore creato: benvenuto in Bomtrack');
}
function doLogin(user, persist) {
  currentUser = user;
  Store.setActor(user.id);
  if (persist) {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id, ts: nowISO() })); } catch (e) { /* sessione non persistita */ }
  }
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-header').style.display = 'flex';
  document.getElementById('app-main').style.display = 'block';
  renderUserPill();
  startClock();
  // L'indirizzo comanda: chi apre un link a una vista precisa, o ricarica la
  // pagina, ci ritrova. Altrimenti si atterra sul riepilogo.
  setView(viewIniziale());
}
// Durata della sessione salvata. 0 = non scade (comportamento fino alla 0.21.0).
function sessionMaxDays() {
  const d = db.settings && db.settings.sessionDays;
  return Number.isFinite(+d) && +d >= 0 ? +d : 30;
}
// Vero quando il `ts` scritto al login è più vecchio della durata configurata.
// Una data illeggibile conta come scaduta: meglio richiedere la password che
// tenere aperta una sessione di cui non si sa più l'età.
function sessionExpired(s) {
  const giorni = sessionMaxDays();
  if (!giorni) return false;
  const t = s && s.ts ? Date.parse(s.ts) : NaN;
  if (!isFinite(t)) return true;
  return (Date.now() - t) > giorni * 86400000;
}
// Sessione salvata: si riapre l'app senza credenziali, purché l'utente esista
// ancora, non sia stato sospeso nel frattempo e la sessione non sia scaduta.
function restoreSession() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { s = null; }
  const u = s && s.userId ? getUser(s.userId) : null;
  if (!u || u.active === false || sessionExpired(s)) { localStorage.removeItem(SESSION_KEY); return false; }
  doLogin(u, false);
  return true;
}
function logout() {
  localStorage.removeItem(SESSION_KEY);
  currentUser = null;
  Store.setActor(null);
  stopClock();
  document.getElementById('app-header').style.display = 'none';
  document.getElementById('app-main').style.display = 'none';
  // Il pannello sta fuori da #app-main: se non lo si spegne qui resta appeso
  // sopra la schermata di accesso.
  document.body.classList.remove('insp-on', 'insp-rail');
  document.getElementById('sub-nav').innerHTML = '';   // la seconda riga se ne va con l'intestazione
  document.getElementById('login-screen').style.display = 'flex';
  setVal('login-password', '');
  renderLogin();
}
function renderUserPill() {
  const pill = document.getElementById('user-pill');
  if (!pill || !currentUser) return;
  pill.style.borderColor = safeColor(currentUser.color);
  pill.title = `${currentUser.name} · ${roleLabel(currentUser.role)}`;
  pill.innerHTML = `<span class="user-dot" style="background:${safeColor(currentUser.color)}"></span>${esc(currentUser.name.split(' ')[0])}
    <span class="user-role">${esc(roleLabel(currentUser.role))}</span>`;
}
// Orologio dell'header: data per esteso e ora, allineato al minuto
let clockTimer = null;
function renderClock() {
  const el = document.getElementById('header-clock');
  if (!el) return;
  const now = new Date();
  let d = now.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  d = d.charAt(0).toUpperCase() + d.slice(1);   // "mercoledì 22 luglio 2026" → maiuscola iniziale
  const t = now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  el.innerHTML = `<span class="clock-date">${esc(d)}</span><span class="clock-time">${t}</span>`;
}
// L'orologio mostra ore e minuti: si risveglia al cambio di minuto, non ogni
// secondo. Il primo colpo si allinea al minuto pieno, poi si va di 60 in 60.
function startClock() {
  renderClock();
  if (clockTimer) return;
  const alProssimoMinuto = 60000 - (Date.now() % 60000);
  clockTimer = setTimeout(function tic() {
    renderClock();
    clockTimer = setTimeout(tic, 60000);
  }, alProssimoMinuto);
}
function stopClock() { if (clockTimer) { clearTimeout(clockTimer); clockTimer = null; } }
function safeColor(c) { return /^#[0-9A-Fa-f]{6}$/.test(String(c || '')) ? c : '#3A7BE8'; }

// Cambio password del proprio account
function changePassword() {
  if (!currentUser) return;
  openModal(`<h3>${ico('key', 'tinted pill', '')} Cambia password</h3>
    <div class="modal-field"><label>Password attuale</label><input type="password" id="cp-old"></div>
    <div class="modal-field"><label>Nuova password</label><input type="password" id="cp-new"></div>
    <div class="modal-field"><label>Ripeti nuova password</label><input type="password" id="cp-new2"></div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="saveOwnPassword()">Salva</button></div>`);
}
function saveOwnPassword() {
  const u = getUser(currentUser.id); if (!u) return;
  if (!verifyPassword(u, document.getElementById('cp-old').value)) { showToast('Password attuale errata', 'error'); return; }
  const n1 = document.getElementById('cp-new').value, n2 = document.getElementById('cp-new2').value;
  if (n1.length < 4) { showToast('La nuova password deve avere almeno 4 caratteri', 'error'); return; }
  if (n1 !== n2) { showToast('Le due password non coincidono', 'error'); return; }
  setUserPassword(u, n1);
  touch(u); saveDB(); closeModal(); showToast('Password aggiornata');
}
