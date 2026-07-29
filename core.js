// ═══════════════════════════════════════════════════════════
//  BOMTRACK — core.js
// ═══════════════════════════════════════════════════════════
// Stato dell'applicazione, utility, ruoli, pannelli e conferme.
// È il fondo comune: tutto il resto lo dà per caricato.
// Classic script, scope globale condiviso con gli altri: nessun modulo e
// nessun build, così index.html continua ad aprirsi con un doppio click.

// ═══════════════════════════════════════════════════════════
//  BOMTRACK — Distinte Base & Costificazione (DB locale)
// ═══════════════════════════════════════════════════════════

// Revisione in esecuzione, mostrata accanto al logo. Va tenuta allineata alla
// voce in cima al changelog del README (l'app si copia a mano tra PC: sapere
// quale revisione sta girando su una postazione è l'unico modo per capirlo).
const APP_VERSION = '0.19.0';

let currentUser = null;      // utente della sessione (null = schermata di accesso)
let currentBomId = null;     // articolo prodotto attualmente aperto nelle Distinte
let currentCycleItemId = null; // Parte aperta nella vista Cicli di lavorazione
let reportBomId = null;      // articolo selezionato nel report
let mgmtTab = 'suppliers';
let bomExpanded = new Set(); // chiavi-percorso dei nodi espansi
let favOnly = false;         // filtro "solo preferiti" nella vista Acquisti
let activeView = 'bom';
let rfqView = 'list';        // 'list' | 'edit' | 'compare'
let currentRfqId = null;     // richiesta di offerta aperta in editor
let rfqCompareSel = [];      // id delle richieste selezionate nel confronto tra richieste
let rfqDirty = false;        // modifiche non salvate nell'editor RFQ (il documento si genera solo dopo il salvataggio)
let mrpView = 'list';        // 'list' | 'edit' — vista Fabbisogno materiali
let currentPlanId = null;    // piano di produzione aperto
let mrpGrouped = false;      // lista d'acquisto raggruppata per fornitore
let orderView = 'list';      // 'list' | 'edit'
let currentOrderId = null;   // ordine aperto in editor
let orderDirty = false;      // modifiche non salvate nell'editor ordine


// ═══════════════════════════════════════════════════════════
//  UTILITY
// ═══════════════════════════════════════════════════════════
function cur() { return (db.settings && db.settings.currency) || '€'; }
function fmtN(n) { return cur() + (Number(n) || 0).toFixed(2); }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
// ─── Indice articoli e cache dei costi ───
// getItem era una scansione lineare di db.items, chiamata dentro costOf e per
// ogni riga di catalogo. L'indice si ricostruisce da solo quando l'array cambia
// identità o lunghezza: copre così anche le mutazioni dirette (db.items.push,
// splice, riassegnazione di db in loadDB/importSnapshot) sparse per le viste.
let _itemIdx = null, _itemIdxArr = null, _itemIdxLen = -1;
function itemIndex() {
  if (_itemIdx && db.items === _itemIdxArr && db.items.length === _itemIdxLen) return _itemIdx;
  _itemIdx = new Map(db.items.map(i => [i.id, i]));
  _itemIdxArr = db.items; _itemIdxLen = db.items.length;
  return _itemIdx;
}
function getItem(id) { return itemIndex().get(id); }
// Risultati di costOf già calcolati in questo giro di rendering.
let _costCache = new Map();
// Azzera indice e cache. Chiamata da Store.commit() — l'unico punto di scrittura
// da cui passano tutti i salvataggi — e in testa alle viste che mostrano costi.
function invalidateCaches() {
  _costCache.clear();
  _itemIdx = null; _itemIdxArr = null; _itemIdxLen = -1;
}
// Indirizzo strutturato → righe di testo (per documenti) o riga singola (per liste)
function addressLines(o) {
  if (!o) return [];
  const l1 = [o.street, o.streetNumber].filter(Boolean).join(' ');
  const cityPart = [o.zip, o.city].filter(Boolean).join(' ');
  const l2 = [cityPart, o.province ? '(' + o.province + ')' : ''].filter(Boolean).join(' ');
  return [l1, l2, o.country].map(s => (s || '').trim()).filter(Boolean);
}
function addressOneLine(o) { return addressLines(o).join(', '); }
// Tassonomia tipi articolo e regole di contenimento (distinta meccanica)
const ALL_TYPES = ['macchina', 'gruppo', 'sottogruppo', 'parte', 'materiale', 'acquistato'];
const ALLOWED_CHILDREN = {
  macchina: ['gruppo', 'sottogruppo'],
  gruppo: ['sottogruppo', 'parte', 'materiale', 'acquistato'],
  sottogruppo: ['sottogruppo', 'parte', 'materiale', 'acquistato'],
  parte: [], materiale: [], acquistato: [],
};
// ─── Ruoli e permessi ───
// I ruoli limitano la SCRITTURA, non la lettura: tutti vedono tutto. Le aree
// sono quattro: catalog (articoli), bom (distinte), docs (RFQ/ODA), manage.
// Il controllo vero arriverà con Supabase (RLS): qui è una divisione di
// responsabilità tra colleghi, non una barriera di sicurezza.
const ROLES = {
  admin: 'Amministratore',
  acquisti: 'Ufficio acquisti',
  progettazione: 'Progettazione',
  lettore: 'Lettore',
};
const ROLE_WRITE = {
  admin: ['catalog', 'bom', 'docs', 'manage'],
  acquisti: ['docs'],
  progettazione: ['catalog', 'bom'],
  lettore: [],
};
const AREA_LABELS = { catalog: 'anagrafiche articoli', bom: 'distinte base', docs: 'richieste e ordini', manage: 'gestione' };
function roleLabel(r) { return ROLES[r] || r || '—'; }
function canWrite(area) {
  if (!currentUser) return false;
  return (ROLE_WRITE[currentUser.role] || []).includes(area);
}
function isAdmin() { return !!currentUser && currentUser.role === 'admin'; }
// Guardia dei mutatori, sul modello di rfqGuard: blocca e spiega.
function roleGuard(area) {
  if (canWrite(area)) return true;
  showToast(`Il ruolo "${roleLabel(currentUser && currentUser.role)}" non può modificare ${AREA_LABELS[area] || area}`, 'error');
  return false;
}
// Area di scrittura corrispondente a ciascuna vista (per il banner di sola lettura)
const VIEW_AREA = { bom: 'bom', buy: 'catalog', design: 'catalog', cycles: 'catalog', report: null, mrp: 'docs', rfq: 'docs', orders: 'docs', manage: 'manage' };

// Le due viste di anagrafica: ciò che si compra e ciò che si progetta.
// Ogni vista ha i suoi filtri (prefisso degli id nella pagina) e la creazione
// di articoli è ristretta ai tipi di sua competenza.
const CATALOG_SCOPES = {
  buy: { types: ['acquistato', 'materiale'], pfx: 'buy', title: 'Commerciali & materie prime' },
  design: { types: ['macchina', 'gruppo', 'sottogruppo', 'parte'], pfx: 'des', title: 'Macchine, gruppi e parti' },
};
function scopeOf(type) { return CATALOG_SCOPES.buy.types.includes(type) ? 'buy' : 'design'; }
// Tipi inseribili nel ciclo di lavorazione di una Parte (le lavorazioni sono a parte, dai centri di lavoro)
const CYCLE_CHILD_TYPES = ['acquistato', 'materiale'];
const TYPE_LABELS = { macchina: 'Macchina', gruppo: 'Gruppo', sottogruppo: 'Sottogruppo', parte: 'Parte', materiale: 'Materia prima', acquistato: 'Commerciale' };
const TYPE_SHORTS = { macchina: 'MAC', gruppo: 'GRP', sottogruppo: 'SGR', parte: 'PRT', materiale: 'MAT', acquistato: 'CMM' };
function typeLabel(t) { return TYPE_LABELS[t] || t; }
function typeShort(t) { return TYPE_SHORTS[t] || '?'; }

// ─── Unità di misura (elenco gestito in Gestione › Unità di misura) ───
function uomList() { return (db.settings && db.settings.uoms) || []; }
function defaultUom() {
  const d = db.settings && db.settings.uomDefault;
  if (d) return d;
  const first = uomList()[0];
  return first ? first.code : 'pz';
}
// Il valore corrente resta selezionabile anche se non è (più) in elenco: i dati
// storici non devono cambiare U.M. da soli.
function uomOptions(selected) {
  const sel = String(selected == null ? '' : selected).trim();
  const list = uomList().slice();
  if (sel && !list.some(u => u.code === sel)) list.unshift({ code: sel, name: '(non in elenco)' });
  if (!sel) list.unshift({ code: '', name: '—' });
  return list.map(u => `<option value="${esc(u.code)}" ${u.code === sel ? 'selected' : ''}>${esc(u.code)}${u.name ? ' — ' + esc(u.name) : ''}</option>`).join('');
}
// ── Concetti (parte "standardizzata" del nome di una Parte) ──
function conceptList() { return (db.settings && db.settings.concepts) || []; }
function conceptById(id) { return conceptList().find(c => c.id === id); }
function conceptName(id) { const c = conceptById(id); return c ? c.name : ''; }
function conceptOptions(selectedId) {
  const sel = selectedId || '';
  return `<option value="">—</option>` + conceptList()
    .map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
}
// Nome finale di una parte: concetto + descrizione libera
function composePartName(conceptId, free) {
  return (conceptName(conceptId) + ' ' + (free || '')).trim();
}
// Registra al volo un'U.M. incontrata nell'import massivo
function ensureUom(code) {
  const c = String(code || '').trim();
  if (!c) return '';
  if (!db.settings.uoms) db.settings.uoms = [];
  if (!db.settings.uoms.some(u => u.code === c)) db.settings.uoms.push({ code: c, name: '' });
  return c;
}

// ─── Famiglie / sottofamiglie (materie prime e componenti commerciali) ───
function getFamily(id) { return (db.families || []).find(f => f.id === id); }
function familyName(id) { const f = getFamily(id); return f ? f.name : ''; }
function subFamilyName(famId, subId) { const f = getFamily(famId); const s = f && (f.subs || []).find(x => x.id === subId); return s ? s.name : ''; }
// Tipi articolo che usano famiglie/sottofamiglie e codifica per famiglia
function usesFamily(t) { return t === 'acquistato' || t === 'materiale' || t === 'parte'; }
function familyLabel(it) {
  if (!it || !usesFamily(it.type) || !it.familyId) return '—';
  const fn = familyName(it.familyId); const sn = subFamilyName(it.familyId, it.subFamilyId);
  return sn ? fn + ' › ' + sn : (fn || '—');
}
function familyOptions(selectedId, kind) {
  return `<option value="">—</option>` + (db.families || [])
    .filter(f => !kind || (f.kind || 'acquistato') === kind)
    .map(f => `<option value="${f.id}" ${f.id === selectedId ? 'selected' : ''}>${esc(f.name)}</option>`).join('');
}
function subFamilyOptions(familyId, selectedSubId) {
  const f = getFamily(familyId);
  return `<option value="">—</option>` + ((f && f.subs) || [])
    .map(s => `<option value="${s.id}" ${s.id === selectedSubId ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
}
// ─── Sigle famiglia/sottofamiglia + codifica automatica articoli ───
function familySigla(famId) { const f = getFamily(famId); return f ? (f.sigla || siglaFromName(f.name)) : ''; }
function subFamilySigla(famId, subId) {
  const f = getFamily(famId); const s = f && (f.subs || []).find(x => x.id === subId);
  return s ? (s.sigla || siglaFromName(s.name)) : '';
}
function escapeRegExp(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
// Numero di cifre della parte incrementale (configurabile in Impostazioni)
function codeDigits() {
  const n = parseInt(db.settings && db.settings.codeDigits, 10);
  return (n >= 1 && n <= 10) ? n : 3;
}
// Prossimo codice libero per un prefisso, es. 'MAT-ACC-LAM-' → 'MAT-ACC-LAM-003'
function nextCodeForPrefix(prefix) {
  const re = new RegExp('^' + escapeRegExp(prefix) + '(\\d+)$');
  let max = 0;
  (db.items || []).forEach(it => {
    const m = it.code && String(it.code).match(re);
    if (m) { const n = parseInt(m[1], 10); if (n > max) max = n; }
  });
  return prefix + String(max + 1).padStart(codeDigits(), '0');
}
// Codice per famiglia: materie prime, commerciali e parti non legate a una macchina
function genFamilyCode(type, familyId, subFamilyId) {
  let base = '';
  if (type === 'materiale') base = (db.settings.codePrefixMateriale || 'MAT') + '-';
  else if (type === 'acquistato') base = (db.settings.codePrefixAcquistato || 'CMM') + '-';
  else if (type === 'parte') base = (db.settings.codePrefixParte || 'PRT') + '-';
  if (!base) return '';
  let prefix = base;
  if (familyId) {
    prefix += familySigla(familyId) + '-';
    if (subFamilyId) prefix += subFamilySigla(familyId, subFamilyId) + '-';
  }
  return nextCodeForPrefix(prefix);
}

// ─── Codifica gerarchica macchina › gruppo › sottogruppo/parte ───
// Es. TRN-S00 (macchina), TRN-BAS-S00 (gruppo), TRN-BAS-999 (sottogruppo, a scendere),
// TRN-BAS-001 (parte, a salire). Lo schema (lunghezza sigle, cifre) è per macchina.
const CODE_TYPES = { alpha: 'Alfabetico', num: 'Numerico', alnum: 'Alfanumerico' };
// Default retrocompatibili: le macchine create prima non hanno schema
function machineScheme(m) {
  return {
    gLen: (m && m.gCodeLen) || 3, gType: (m && m.gCodeType) || 'alpha',
    incrS: (m && m.incrDigitsS) || 2,   // progressivo S## (macchina/gruppo)
    incrN: (m && m.incrDigitsN) || 3,   // numerico ### (sottogruppo/parte)
  };
}
function codeTypePattern(type) {
  if (type === 'num') return /^[0-9]+$/;
  if (type === 'alnum') return /^[A-Z0-9]+$/;
  return /^[A-Z]+$/;
}
function validateCodeFormat(code, len, type) {
  if (code.length !== len) return `La sigla deve essere esattamente ${len} caratteri`;
  if (!codeTypePattern(type).test(code)) {
    const t = type === 'num' ? 'numerici (0-9)' : type === 'alnum' ? 'alfanumerici (A-Z, 0-9)' : 'alfabetici (A-Z)';
    return `La sigla deve contenere solo caratteri ${t}`;
  }
  return null;
}
function typeHint(len, type) { return `${len} car., ${(CODE_TYPES[type] || '').toLowerCase()}`; }
function typeOptionsHtml(sel) {
  return Object.keys(CODE_TYPES).map(v => `<option value="${v}" ${v === sel ? 'selected' : ''}>${CODE_TYPES[v]}</option>`).join('');
}
function machineItems() { return (db.items || []).filter(i => i.type === 'macchina'); }
function groupItemsFor(machineId) { return (db.items || []).filter(i => i.type === 'gruppo' && i.machineItemId === machineId); }
function itemSigla(id) { const it = getItem(id); return it ? (it.sigla || '') : ''; }
// Numeri già usati dai codici degli articoli passati (parte finale numerica del codice)
function usedCodeNumbers(items) {
  return items
    .map(i => { const m = String(i.code || '').match(/(\d+)$/); return m ? parseInt(m[1], 10) : null; })
    .filter(n => n != null);
}
// Prossimo progressivo: sottogruppi a scendere da 10^incrN-1, gli altri a salire.
// Restituisce null quando la numerazione è esaurita.
function nextCodeNumber(type, siblings, sm) {
  const used = usedCodeNumbers(siblings);
  if (type === 'sottogruppo') {
    const n = used.length ? Math.min(...used) - 1 : 10 ** sm.incrN - 1;
    return n < 0 ? null : n;
  }
  if (type === 'parte') {
    const n = used.length ? Math.max(...used) + 1 : 1;
    return n > 10 ** sm.incrN - 1 ? null : n;
  }
  // macchina e gruppo: progressivo S## a salire da 0
  const n = used.length ? Math.max(...used) + 1 : 0;
  return n > 10 ** sm.incrS - 1 ? null : n;
}
// Codice automatico dell'articolo (bozza o esistente). '' quando non è generabile.
function genItemCode(it) {
  if (!it) return '';
  const type = it.type;
  if (type === 'materiale' || type === 'acquistato') return genFamilyCode(type, it.familyId, it.subFamilyId);

  if (type === 'macchina') {
    if (!it.sigla) return '';
    const sm = machineScheme(it);
    // Progressivo tra le macchine che condividono la stessa sigla (esclusa se stessa in modifica)
    const siblings = machineItems().filter(m => m.sigla === it.sigla && m.id !== it.id);
    const n = nextCodeNumber('macchina', siblings, sm);
    if (n == null) { showToast('Numerazione macchine esaurita', 'error'); return ''; }
    return `${it.sigla}-S${String(n).padStart(sm.incrS, '0')}`;
  }

  const mac = getItem(it.machineItemId);
  if (type === 'gruppo') {
    if (!mac || !it.sigla) return '';
    const sm = machineScheme(mac);
    const siblings = groupItemsFor(mac.id).filter(g => g.sigla === it.sigla && g.id !== it.id);
    const n = nextCodeNumber('gruppo', siblings, sm);
    if (n == null) { showToast('Numerazione gruppi esaurita', 'error'); return ''; }
    return `${mac.sigla}-${it.sigla}-S${String(n).padStart(sm.incrS, '0')}`;
  }

  if (type === 'sottogruppo' || type === 'parte') {
    const grp = getItem(it.groupItemId);
    // La parte senza macchina/gruppo mantiene la codifica per famiglia
    if (!mac || !grp) return type === 'parte' ? genFamilyCode(type, it.familyId, it.subFamilyId) : '';
    const sm = machineScheme(mac);
    const siblings = (db.items || []).filter(i =>
      i.type === type && i.machineItemId === mac.id && i.groupItemId === grp.id && i.id !== it.id);
    const n = nextCodeNumber(type, siblings, sm);
    if (n == null) { showToast(`Numerazione ${type === 'parte' ? 'parti' : 'sottogruppi'} esaurita`, 'error'); return ''; }
    return `${mac.sigla}-${grp.sigla}-${String(n).padStart(sm.incrN, '0')}`;
  }
  return '';
}
// Etichetta di appartenenza per il catalogo: "TRN › BAS"
function codingLabel(it) {
  if (!it) return '';
  if (it.type === 'macchina') return it.sigla || '';
  const ms = itemSigla(it.machineItemId);
  if (!ms) return '';
  const gs = it.type === 'gruppo' ? it.sigla : itemSigla(it.groupItemId);
  return gs ? ms + ' › ' + gs : ms;
}

function showToast(m, t = 'success') {
  const el = document.getElementById('toast');
  el.textContent = m;
  el.style.background = t === 'error' ? 'var(--red)' : 'var(--green)';
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}
// ─── Esito del salvataggio locale ───
// Hook chiamati da Store.commit(). Quando localStorage rifiuta la scrittura
// l'app continua a mostrare i dati aggiornati, ma non li conserva: chiudere la
// scheda in quello stato perde tutto il lavoro fatto dall'errore in poi.
let persistErrorShown = false;   // il messaggio si mostra una volta, poi resta il badge
function onPersistError(kind, info) {
  renderUnsavedBadge();
  if (persistErrorShown) return;
  persistErrorShown = true;
  // Differito: chi ha appena salvato chiama closeModal() subito dopo, e
  // chiuderebbe questa finestra prima che si riesca a leggerla.
  setTimeout(() => showPersistErrorModal(kind, info), 0);
}
function onPersistRecovered() {
  persistErrorShown = false;
  renderUnsavedBadge();
  showToast('Salvataggio ripristinato');
}
function showPersistErrorModal(kind, info) {
  const mb = info && info.bytes ? ` (il database occupa ${(info.bytes / 1024 / 1024).toFixed(1)} MB)` : '';
  const testo = kind === 'quota'
    ? `<p>Lo spazio che il browser riserva a questa app è esaurito${mb}.</p>
       <p><strong>Le modifiche fatte da ora in poi non vengono salvate.</strong> I dati che vedi sono ancora tutti in memoria, ma chiudendo questa scheda andrebbero persi.</p>
       <p>Esporta subito un backup JSON, poi libera spazio: elimina richieste e ordini vecchi, oppure azzera il database e reimporta solo ciò che serve.</p>`
    : kind === 'storage'
      ? `<p>Questo browser non consente il salvataggio locale: succede in navigazione privata o quando i dati dei siti sono bloccati.</p>
         <p><strong>L'app funziona, ma alla chiusura non resterà nulla.</strong> Esporta un backup JSON prima di uscire.</p>`
      : `<p>I dati in memoria non sono salvabili: c'è un valore che non si riesce a convertire in JSON.</p>
         <p><strong>Le modifiche non vengono salvate.</strong> Esporta un backup e segnala il problema.</p>`;
  // Il backup contiene gli utenti: il pulsante compare solo a chi può esportarlo.
  const btnBackup = canWrite('manage')
    ? `<button class="add-btn-sm" onclick="closeModal(); exportBackup()">⬇ Esporta backup JSON ora</button>` : '';
  // Chiave propria: l'avviso si affianca a quello che è aperto invece di
  // buttar via un form a metà compilazione.
  openModal(`<h3>⚠ Salvataggio non riuscito</h3>${testo}
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Ho capito</button>${btnBackup}</div>`, false, 'avviso');
}
// Indicatore fisso nell'header finché c'è divergenza tra memoria e persistito.
function renderUnsavedBadge() {
  const el = document.getElementById('unsaved-badge'); if (!el) return;
  const aperto = Store.isUnsaved();
  el.style.display = aperto ? '' : 'none';
  el.textContent = aperto ? '⚠ Modifiche non salvate' : '';
  el.title = aperto ? 'Le ultime modifiche sono rimaste solo in memoria: esporta un backup prima di chiudere la scheda' : '';
}

// ─── Pannelli ───
// Le schede non oscurano più la pagina: sono finestre mobili appoggiate sopra
// il contenuto, si spostano trascinandole per il titolo e si ridimensionano
// dall'angolo. Dietro si continua a navigare: si può tenere aperto il listino
// di un articolo mentre si sfoglia una distinta.
//
// Ogni pannello ha una chiave e per ogni chiave ce n'è uno solo: riaprire la
// stessa scheda riusa il pannello invece di duplicarlo. Non è una restrizione
// grafica ma sostanziale — lo stato di una scheda aperta vive in una variabile
// sola (window.__priceItemId e simili), quindi due listini affiancati
// scriverebbero l'uno sull'articolo dell'altro. Chiavi diverse convivono
// senza toccarsi.
// Il click fuori dalla finestra non chiude: si esce solo con Salva/Annulla
// (o Chiudi, la ✕, Esc).
// wide = true per i form ampi, es. la scheda articolo.
const PANEL_Z = 100;
let _panelZ = PANEL_Z;
function panelRoot() { return document.getElementById('modal-root'); }
function openModal(h, wide, key) {
  const root = panelRoot(); if (!root) return null;
  const k = key || 'form';
  let p = Array.prototype.find.call(root.children, el => el.dataset.panelKey === k);
  // Con la pagina viva dietro, un form aperto si può lasciare lì e aprirne un
  // altro: prima l'overlay lo impediva, ora va chiesto. Vale solo per i form,
  // le schede di consultazione non hanno niente da perdere.
  if (p && k === 'form' && !confirm('Una scheda è già aperta: le modifiche non salvate andranno perse. Continuare?')) return null;
  const nuovo = !p;
  if (nuovo) {
    p = document.createElement('div');
    p.dataset.panelKey = k;
    root.appendChild(p);
  }
  p.className = 'panel' + (wide ? ' panel-wide' : '');
  p.innerHTML = `<button class="panel-x" title="Chiudi (Esc)" onclick="closePanel(this.parentNode)">✕</button>${h}`;
  if (nuovo) panelPlace(p);
  panelRaise(p);
  return p;
}
// Il primo pannello al centro, i successivi a scalare: due schede aperte non
// devono coprirsi esattamente, altrimenti sembra che sia una sola.
function panelPlace(p) {
  const n = panelRoot().children.length - 1;
  const off = (n % 6) * 26;
  const w = p.offsetWidth, h = p.offsetHeight;
  const maxL = Math.max(8, window.innerWidth - w - 8);
  const maxT = Math.max(8, window.innerHeight - h - 8);
  p.style.left = Math.min(Math.max(8, (window.innerWidth - w) / 2 + off), maxL) + 'px';
  p.style.top = Math.min(Math.max(8, window.innerHeight * 0.06 + off), maxT) + 'px';
}
// Portare avanti un pannello alza un contatore: in una sessione lunga
// salirebbe sopra al toast (z-index 999), che deve restare visibile. Prima di
// arrivarci si rinumera dal basso, mantenendo l'ordine attuale.
function panelRaise(p) {
  if (!p) return;
  if (_panelZ > PANEL_Z + 600) {
    const ord = Array.prototype.slice.call(panelRoot().children)
      .sort((a, b) => (+a.style.zIndex || 0) - (+b.style.zIndex || 0));
    _panelZ = PANEL_Z;
    ord.forEach(el => { el.style.zIndex = ++_panelZ; });
  }
  p.style.zIndex = ++_panelZ;
}
// Il pannello davanti a tutti: è quello su cui si sta lavorando, ed è quello
// che closeModal() chiude dopo un salvataggio.
function panelTop() {
  const root = panelRoot(); if (!root) return null;
  return Array.prototype.reduce.call(root.children,
    (best, el) => (!best || (+el.style.zIndex || 0) >= (+best.style.zIndex || 0)) ? el : best, null);
}
function closePanel(p) {
  if (p && p.parentNode) p.parentNode.removeChild(p);
  if (!panelRoot() || !panelRoot().children.length) _panelZ = PANEL_Z;   // gli z-index non crescono all'infinito
}
// Chiude la scheda in primo piano: le decine di "Annulla" e i salvataggi che
// chiamano closeModal() intendono sempre quella con cui si sta lavorando.
function closeModal() { closePanel(panelTop()); }
function closeAllPanels() { const r = panelRoot(); if (r) r.innerHTML = ''; _panelZ = PANEL_Z; }

// ─── Conferme in scheda ───
// confirm() nativo blocca il browser, esce dallo stile dell'app e non lascia
// scrivere la domanda con un minimo di cura. Qui la domanda è una scheda come
// le altre; non essendo bloccante, il seguito dell'azione arriva come funzione:
//   askConfirm('Eliminare X?', () => { …il resto… })
// L'unica confirm() nativa che resta è quella dentro openModal: fa da guardia
// al meccanismo stesso dei pannelli e non può aprirne uno per chiederlo.
let _confirmFn = null;
function askConfirm(message, onYes, opts) {
  const o = opts || {};
  _confirmFn = typeof onYes === 'function' ? onYes : null;
  openModal(`<h3>${esc(o.title || '❓ Conferma')}</h3>
    <p class="confirm-text">${esc(message).replace(/\n/g, '<br>')}</p>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="confirmNo()">${esc(o.cancel || 'Annulla')}</button>
      <button class="add-btn-sm${o.safe ? '' : ' btn-danger'}" onclick="confirmYes()">${esc(o.ok || 'Conferma')}</button>
    </div>`, false, 'confirm');
}
function confirmNo() { _confirmFn = null; closeModal(); }
// ─── Autore delle modifiche ───
// createdBy/updatedBy sono scritti da sempre da stampNew()/touch(), ma non si
// erano mai visti: in due su un database condiviso "chi ha cambiato questo
// prezzo?" è la prima domanda che arriva.
function actorName(id) {
  if (!id) return '';
  const u = (db.users || []).find(x => x.id === id);
  return u ? u.name : 'utente rimosso';
}
function fmtStamp(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleDateString('it-IT') + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}
// Riga "creato/aggiornato da" per il fondo di una scheda. Vuota se il record
// non porta timestamp (dati importati o precedenti allo schema v2).
function stampLine(rec) {
  if (!rec) return '';
  const parts = [];
  if (rec.createdAt) parts.push(`Creato${rec.createdBy ? ' da ' + esc(actorName(rec.createdBy)) : ''} il ${esc(fmtStamp(rec.createdAt))}`);
  if (rec.updatedAt && rec.updatedAt !== rec.createdAt) parts.push(`aggiornato${rec.updatedBy ? ' da ' + esc(actorName(rec.updatedBy)) : ''} il ${esc(fmtStamp(rec.updatedAt))}`);
  if (!parts.length) return '';
  return `<p class="stamp-line">🕓 ${parts.join(' · ')}</p>`;
}
function confirmYes() {
  const fn = _confirmFn; _confirmFn = null;
  closeModal();
  if (fn) fn();
}

// ─── Trascinamento e messa in primo piano ───
// Delegato sulla radice: i pannelli nascono e muoiono di continuo, agganciare
// gli ascoltatori a ognuno significherebbe ricordarsi di staccarli.
let _drag = null;
function panelDragStart(e) {
  const p = e.target.closest ? e.target.closest('.panel') : null;
  if (!p) return;
  panelRaise(p);
  // Si trascina solo per il titolo, e solo per quello del pannello (children[1]:
  // children[0] è la ✕). Un <h3> dentro al corpo non deve muovere la finestra.
  const h = e.target.closest('h3');
  if (!h || h !== p.children[1] || e.button !== 0) return;
  const r = p.getBoundingClientRect();
  _drag = { p, dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, h: r.height };
  e.preventDefault();   // niente selezione del testo del titolo mentre si sposta
}
function panelDragMove(e) {
  if (!_drag) return;
  const maxL = Math.max(0, window.innerWidth - _drag.w);
  const maxT = Math.max(0, window.innerHeight - 34);   // il titolo resta sempre afferrabile
  _drag.p.style.left = Math.min(Math.max(0, e.clientX - _drag.dx), maxL) + 'px';
  _drag.p.style.top = Math.min(Math.max(0, e.clientY - _drag.dy), maxT) + 'px';
}
function panelDragEnd() { _drag = null; }
if (typeof document !== 'undefined') {
  document.addEventListener('mousedown', panelDragStart, true);
  document.addEventListener('mousemove', panelDragMove);
  document.addEventListener('mouseup', panelDragEnd);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && panelTop()) { closeModal(); e.preventDefault(); }
    // Ctrl+K (⌘K su Mac): la ricerca globale da qualunque punto dell'app
    else if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K') && currentUser) {
      globalSearchModal(); e.preventDefault();
    }
  });
  // Il Ctrl+P del browser deve trovare l'intestazione già compilata.
  // Riferimento differito: printHeadFill sta in uno script caricato dopo questo.
  window.addEventListener('beforeprint', () => printHeadFill());
}
function val(id) { const e = document.getElementById(id); return e ? e.value.trim() : ''; }
function setVal(id, v) { const e = document.getElementById(id); if (e) e.value = v; }
// ─── Digitazione: rinvio del ridisegno ───
// I campi di ricerca ridisegnano interi elenchi a ogni carattere. Con poche
// centinaia di articoli si sente: la digitazione "impasta". Si aspetta una
// breve pausa e si disegna una volta sola. Il rinvio è per chiave, così due
// campi diversi non si annullano a vicenda.
const SEARCH_DELAY = 160;   // ms: sotto la soglia in cui si percepisce un ritardo
const _debounceTimers = {};
function debounced(key, fn, ms) {
  clearTimeout(_debounceTimers[key]);
  _debounceTimers[key] = setTimeout(fn, ms == null ? SEARCH_DELAY : ms);
}

// ─── Lettura dei campi numerici ───
// parseFloat da solo lascia passare i negativi e Infinity: un costo negativo si
// propaga per tutto il rollup, un Infinity fa comparire NaN ovunque.
// clampNum è logica pura, senza DOM: è la parte che la suite verifica.
function clampNum(v, min, max) {
  if (!isFinite(v)) return min != null ? min : 0;      // campo vuoto, testo, NaN, Infinity
  if (min != null && v < min) return min;
  if (max != null && v > max) return max;
  return v;
}
// Valore così com'è stato digitato (0 se vuoto o non numerico): serve a
// riconoscere un negativo prima di correggerlo.
function rawNum(id) {
  const e = document.getElementById(id);
  const v = parseFloat(e ? e.value : '');
  return isFinite(v) ? v : 0;
}
function numVal(id, min, max) { return clampNum(rawNum(id), min, max); }
// Percentuali e valori di bozza si riportano dentro l'intervallo in silenzio
// (come già fa codeDigits); costi, prezzi e quantità no: lì un negativo è un
// errore di battitura, e azzerarlo lo farebbe sparire senza dirlo a nessuno.
function isNeg(id) { return rawNum(id) < 0; }
function isChecked(id) { const e = document.getElementById(id); return !!(e && e.checked); }
