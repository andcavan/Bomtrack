// ═══════════════════════════════════════════════════════════
//  BOMTRACK — shell.js
// ═══════════════════════════════════════════════════════════
// Guscio dell'applicazione: ricerca globale (Ctrl+K), stampa della vista
// aperta e navigazione tra le viste.
// Classic script, scope globale condiviso con gli altri: nessun modulo e
// nessun build, così index.html continua ad aprirsi con un doppio click.

// ═══════════════════════════════════════════════════════════
//  RICERCA GLOBALE (Ctrl+K)
// ═══════════════════════════════════════════════════════════
// Un campo solo per tutto: articoli, richieste, ordini, piani. Serve a saltare
// dove serve senza prima indovinare la vista giusta e i suoi filtri.
let gsHits = [], gsSel = 0;
const GS_MAX = 25;
function globalSearchHits(q) {
  const s = String(q || '').toLowerCase().trim();
  if (!s) return [];
  const hits = [];
  (db.items || []).forEach(i => {
    const testo = ((i.code || '') + ' ' + (i.name || '')).toLowerCase();
    if (!testo.includes(s)) return;
    hits.push({ kind: 'item', id: i.id, code: i.code || '', label: i.name || '',
      meta: typeLabel(i.type), tag: typeShort(i.type), type: i.type,
      exact: String(i.code || '').toLowerCase().startsWith(s) ? 0 : 1 });
  });
  const doc = (arr, kind, tag, meta) => (arr || []).forEach(d => {
    const testo = ((d.number || '') + ' ' + (d.title || '')).toLowerCase();
    if (!testo.includes(s)) return;
    hits.push({ kind, id: d.id, code: d.number || '', label: d.title || '(senza titolo)',
      meta: meta(d), tag, exact: String(d.number || '').toLowerCase().startsWith(s) ? 0 : 1 });
  });
  doc(db.rfqs, 'rfq', 'RDO', d => 'Richiesta · ' + (supplierName(d.supplierId) || 'senza fornitore'));
  doc(db.orders, 'order', 'ODA', d => 'Ordine · ' + (supplierName(d.supplierId) || 'senza fornitore'));
  doc(db.workOrders, 'odl', 'ODL', d => 'Ordine di lavoro · ' + (supplierName(d.supplierId) || 'senza terzista'));
  doc(db.plans, 'plan', 'FAB', d => 'Piano di produzione · ' + (d.lines || []).length + ' righe');
  // Chi ha il codice che inizia con quanto digitato viene prima: è la ricerca
  // di chi sa già cosa cerca e lo sta scrivendo.
  return hits.sort((a, b) => a.exact - b.exact || String(a.code).localeCompare(String(b.code))).slice(0, GS_MAX);
}
function globalSearchModal() {
  openModal(`<h3>${ico('search', 'tinted pill', '')} Cerca ovunque</h3>
    <div class="modal-field">
      <input type="text" id="gs-input" placeholder="Codice, nome, numero di documento..." autocomplete="off"
        oninput="debounced('gs', renderGlobalSearch, 90)" onkeydown="globalSearchKey(event)"></div>
    <div id="gs-results" class="picker-results"></div>
    <p class="empty-text" style="padding:8px 0 0;text-align:left">↑ ↓ per scorrere · Invio per aprire · Esc per chiudere</p>`, false, 'search');
  gsHits = []; gsSel = 0;
  renderGlobalSearch();
  const i = document.getElementById('gs-input'); if (i) i.focus();
}
function renderGlobalSearch() {
  const box = document.getElementById('gs-results'); if (!box) return;
  const q = val('gs-input');
  gsHits = globalSearchHits(q);
  if (gsSel >= gsHits.length) gsSel = 0;
  if (!q) { box.innerHTML = ''; return; }
  box.innerHTML = gsHits.map((h, i) =>
    `<div class="picker-row${i === gsSel ? ' is-sel' : ''}" onclick="globalSearchOpen(${i})">
       <span class="picker-type">${esc(h.tag)}</span><b>${esc(h.code)}</b> — ${esc(h.label)}
       <span class="gs-meta">${esc(h.meta)}</span>
     </div>`).join('') || `<div class="picker-empty">Nessun risultato per "${esc(q)}"</div>`;
}
function globalSearchKey(e) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (!gsHits.length) return;
    gsSel = (gsSel + (e.key === 'ArrowDown' ? 1 : gsHits.length - 1)) % gsHits.length;
    renderGlobalSearch();
    e.preventDefault();
  } else if (e.key === 'Enter') {
    globalSearchOpen(gsSel);
    e.preventDefault();
  }
}
// Ogni risultato si apre dove ha senso guardarlo: un assieme nella sua distinta,
// un articolo d'acquisto nella sua scheda, un documento nel suo editor.
function globalSearchOpen(i) {
  const h = gsHits[i]; if (!h) return;
  closeModal();
  if (h.kind === 'item') {
    const it = getItem(h.id); if (!it) return;
    if (isAssembly(it.type)) { currentBomId = it.id; bomExpanded = new Set(); setView('bom'); }
    else { setView(scopeOf(it.type)); editItemModal(it.id); }
  } else if (h.kind === 'rfq') { setView('rfq'); openRfqEdit(h.id); }
  else if (h.kind === 'order') { setView('orders'); openOrderEdit(h.id); }
  else if (h.kind === 'odl') { setView('odl'); openOdlEdit(h.id); }
  else if (h.kind === 'plan') { setView('mrp'); openPlanEdit(h.id); }
}

// ═══════════════════════════════════════════════════════════
//  STAMPA DELLA VISTA APERTA
// ═══════════════════════════════════════════════════════════
// Nessun documento nuovo da mantenere: si stampa ciò che è a video, ripulito
// dal foglio di stile (@media print) di navigazione, filtri e pulsanti.
// L'intestazione si riempie qui, ed è agganciata anche a onbeforeprint: vale
// anche per il Ctrl+P del browser, non solo per il pulsante.
function printSubtitle() {
  if (activeView === 'bom' || activeView === 'report') {
    const it = getItem(activeView === 'bom' ? currentBomId : reportBomId);
    return it ? (it.code || '') + ' — ' + it.name : '';
  }
  if (activeView === 'cycles') { const it = currentCycleItem(); return it ? (it.code || '') + ' — ' + it.name : ''; }
  if (activeView === 'mrp') { const p = getPlan(currentPlanId); return p ? p.number + ' ' + (p.title || '') : ''; }
  if (activeView === 'rfq') { const r = getRfq(currentRfqId); return r ? r.number + ' ' + (r.title || '') : ''; }
  if (activeView === 'orders') { const o = getOrder(currentOrderId); return o ? o.number + ' ' + (o.title || '') : ''; }
  if (activeView === 'odl') { const o = getOdl(currentOdlId); return o ? o.number + ' ' + (o.title || '') : ''; }
  return '';
}
function printHeadFill() {
  const el = document.getElementById('print-head'); if (!el) return;
  const g = groupOfView(activeView);
  // "Distinta base › Visualizza DB": sul foglio stampato deve leggersi da dove viene
  const sezione = g ? g.label + (g.views.length > 1 ? ' › ' + viewLabel(activeView) : '') : '';
  const co = (db.settings && db.settings.company && db.settings.company.name) || 'Bomtrack';
  const sub = printSubtitle();
  el.innerHTML = `<div class="print-title">${esc(co)} — ${esc(sezione)}</div>
    <div class="print-sub">${sub ? esc(sub) + ' · ' : ''}${new Date().toLocaleDateString('it-IT')}${currentUser ? ' · ' + esc(currentUser.name) : ''}</div>`;
}
function printView() { printHeadFill(); window.print(); }

// ─── Manuale d'uso ───
// `manuale.html` sta nella cartella dell'app, accanto a index.html: si apre
// senza rete, come tutto il resto, e viaggia con la cartella quando la si copia
// su un altro PC. In una scheda nuova, perché il manuale si consulta **mentre**
// si lavora — chi cerca come si registra un rientro da conto lavoro ha l'ordine
// di lavoro aperto davanti, e non deve perderlo per leggere come si fa.
// Il manuale legge `bomtrack_theme` e si apre nel tema scelto qui.
function openManual() {
  window.open('manuale.html', 'bomtrack-manuale');
}

// ═══════════════════════════════════════════════════════════
//  NAVIGAZIONE
// ═══════════════════════════════════════════════════════════
// Due livelli: cinque gruppi in barra, le loro voci su una seconda riga che
// compare solo dove serve. Nove pulsanti affiancati non raccontavano più come
// si lavora — Gestione DB e Visualizza DB sono la stessa distinta vista in due
// modi, Acquisti e Progetto lo stesso archivio diviso per competenza.
// Icona ed etichetta restano separate: su schermi stretti l'etichetta del
// gruppo sparisce e la barra resta su una riga sola (vedi .nav-label).
const NAV = [
  { id: 'home', icon: 'home', label: 'Riepilogo', views: [
    { id: 'home', label: 'Riepilogo' }] },
  { id: 'anag', icon: 'contacts', label: 'Anagrafica', views: [
    { id: 'buy', label: 'Acquisti' },
    { id: 'design', label: 'Progetto' }] },
  // Il magazzino sta accanto alle anagrafiche perché elenca gli stessi articoli,
  // ma è un gruppo suo: non conosce la divisione fra acquisti e progetto —
  // commerciali, materie prime e parti stanno sullo stesso scaffale.
  { id: 'stock', icon: 'package', label: 'Magazzino', views: [
    { id: 'stock', label: 'Magazzino' }] },
  { id: 'cicli', icon: 'wrench', label: 'Cicli di lavorazione', views: [
    { id: 'cycles', label: 'Cicli di lavorazione' },
    // Il carico aggregato non appartiene a nessun piano: infilarlo dentro un
    // piano lo farebbe cercare nel posto sbagliato. Il carico del singolo piano
    // resta comunque in fondo alla sua scheda.
    { id: 'load', label: 'Carico centri' }] },
  { id: 'db', icon: 'tree', label: 'Distinta base', views: [
    { id: 'bom', label: 'Gestione DB' },
    { id: 'report', label: 'Visualizza DB' }] },
  { id: 'docs', icon: 'mail', label: 'Documenti', views: [
    { id: 'jobs', label: 'Commesse' },
    { id: 'mrp', label: 'Fabbisogno' },
    { id: 'rfq', label: 'Richieste offerta' },
    { id: 'orders', label: 'Ordini' },
    // ODA e ODL sono due documenti diversi e stanno in due elenchi: uno compra
    // merce, l'altro manda pezzi a lavorare.
    { id: 'odl', label: 'Ordini di lavoro' }] },
  { id: 'manage', icon: 'settings', label: 'Gestione', views: [
    { id: 'manage', label: 'Gestione' }] },
];
function navGroups() { return NAV.filter(g => g.id !== 'manage' || isAdmin()); }
function groupOfView(v) { return NAV.find(g => g.views.some(x => x.id === v)) || null; }
function viewLabel(v) {
  const g = groupOfView(v);
  const w = g && g.views.find(x => x.id === v);
  return w ? w.label : '';
}
// Dove si era rimasti in ciascun gruppo. Vive quanto la sessione: è comodità di
// navigazione, non un dato da salvare nel database.
const lastViewOfGroup = {};
function openNavGroup(gid) {
  const g = NAV.find(x => x.id === gid); if (!g) return;
  setView(lastViewOfGroup[gid] || g.views[0].id);
}
function renderNav() {
  const attivo = groupOfView(activeView);
  // aria-label esplicito, non affidato al testo: sotto i 1330px la media query
  // nasconde .nav-label, e display:none toglie quel testo anche all'albero di
  // accessibilità — il pulsante resterebbe senza nome. a11yFields non lo ripara,
  // perché ripara solo i pulsanti che il testo non ce l'hanno per niente, e qui
  // ce l'hanno: semplicemente non si vede e non si sente.
  document.getElementById('main-nav').innerHTML = navGroups().map(g =>
    `<button class="nav-btn ${attivo && attivo.id === g.id ? 'active' : ''}" onclick="openNavGroup('${g.id}')" title="${esc(g.label)}" aria-label="${esc(g.label)}">
       <span class="nav-ico">${ico(g.icon, 'tinted pill')}</span><span class="nav-label">${esc(g.label)}</span></button>`).join('');
  // Seconda riga: le voci del gruppo aperto. Con una voce sola non c'è niente
  // da scegliere e la riga sparisce invece di ripetere il nome del gruppo.
  const sub = document.getElementById('sub-nav');
  if (!sub) return;
  const voci = attivo && attivo.views.length > 1 ? attivo.views : [];
  sub.innerHTML = voci.map(w =>
    `<button class="subnav-btn ${activeView === w.id ? 'active' : ''}" onclick="setView('${w.id}')" title="${esc(w.label)}" aria-current="${activeView === w.id ? 'page' : 'false'}">${esc(w.label)}</button>`).join('');
}
// ─── Navigazione e indirizzo ───
// La vista aperta finisce nell'hash dell'indirizzo. Non è un vezzo: senza,
// il tasto Indietro del browser usciva dall'app, un refresh riportava sempre
// alla stessa schermata e non c'era modo di mandare a un collega il punto in
// cui si sta guardando. Costa poche righe e riusa la navigazione che c'è già.
//
// Il giro infinito (scrivo l'hash → scatta l'ascoltatore → richiama setView →
// riscrive l'hash) si evita **senza tenere stato**: entrambe le direzioni
// controllano se c'è davvero qualcosa da cambiare, e se non c'è si fermano.
// Un flag "questo cambio l'ho fatto io" sarebbe più intuitivo e più fragile:
// basterebbe un evento che non arriva per lasciarlo alzato, e la navigazione
// successiva dell'utente verrebbe ignorata senza che nulla lo segnali.
function viewEsiste(v) { return NAV.some(g => g.views.some(x => x.id === v)); }
function viewDaHash() {
  const h = (typeof location !== 'undefined' && location.hash || '').replace(/^#\/?/, '');
  return viewEsiste(h) ? h : '';
}
function scriviHash(v) {
  if (typeof location === 'undefined') return;
  if ((location.hash || '').replace(/^#\/?/, '') === v) return;   // già lì: non si tocca
  location.hash = v;
}
function onHashChange() {
  if (!currentUser) return;                 // fuori sessione l'indirizzo non comanda niente
  const v = viewDaHash();
  if (v && v !== activeView) setView(v);    // già lì: non si fa niente, e il giro si chiude
}
// Vista di partenza: quella nell'indirizzo se è valida, altrimenti il riepilogo.
function viewIniziale() { return viewDaHash() || 'home'; }

function setView(v) {
  // La Gestione è riservata agli amministratori: chi non lo è torna alle distinte
  if (v === 'manage' && !isAdmin()) { showToast('Sezione riservata agli amministratori', 'error'); v = 'bom'; }
  scriviHash(v);
  activeView = v;
  const g = groupOfView(v);
  if (g) lastViewOfGroup[g.id] = v;
  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById('view-' + v);
  // Senza guardia un id mancante lasciava l'app con TUTTE le viste nascoste:
  // le .view-panel sono già state spente qui sopra, e l'eccezione fermava il
  // resto della funzione. Meglio non cambiare vista che restare al buio.
  if (!panel) { onAppError('view', 'Pannello mancante: view-' + v); return; }
  panel.classList.add('active');
  // Sola lettura per il ruolo: la UI nasconde le azioni, le guardie bloccano comunque
  const area = VIEW_AREA[v];
  panel.classList.toggle('view-readonly', !!area && !canWrite(area));
  renderNav();
  if (v === 'bom') renderBom();
  else if (v === 'buy' || v === 'design') renderCatalog(v);
  else if (v === 'stock') renderStock();
  else if (v === 'cycles') renderCycles();
  else if (v === 'report') renderReport();
  else if (v === 'home') renderHome();
  else if (v === 'jobs') renderJobs();
  else if (v === 'mrp') renderMrp();
  else if (v === 'rfq') renderRfq();
  else if (v === 'orders') renderOrders();
  else if (v === 'odl') renderOdl();
  else if (v === 'load') renderLoad();
  else if (v === 'manage') renderManage();
  showReadOnlyBanner(panel, area);
  a11yFields(panel);   // etichette ai campi e nomi ai pulsanti-icona della vista appena disegnata
  // Il pannello laterale appartiene alla vista che lo ha riempito: cambiando
  // vista la riga scelta altrove non vuol più dire niente, e i suoi comandi
  // agirebbero su qualcosa che non si sta più guardando.
  inspectorClear();
}
// Il banner va messo dopo il render: le viste documenti si riscrivono per intero
function showReadOnlyBanner(panel, area) {
  const old = panel.querySelector(':scope > .ro-banner');
  if (old) old.remove();
  if (!area || canWrite(area)) return;
  const b = document.createElement('div');
  b.className = 'ro-banner';
  // innerHTML e non textContent: il testo porta un'icona, e i due pezzi che
  // vengono dai dati passano da esc() come ovunque.
  b.innerHTML = `${ico('eye', 'tinted', '')} Sola lettura — il ruolo "${esc(roleLabel(currentUser && currentUser.role))}" non modifica ${esc(AREA_LABELS[area])}.`;
  panel.insertBefore(b, panel.firstChild);
}
