// ═══════════════════════════════════════════════════════════
//  BOMTRACK — Distinte Base & Costificazione (DB locale)
// ═══════════════════════════════════════════════════════════

let currentBomId = null;     // articolo prodotto attualmente aperto nelle Distinte
let reportBomId = null;      // articolo selezionato nel report
let mgmtTab = 'suppliers';
let bomExpanded = new Set(); // chiavi-percorso dei nodi espansi
let activeView = 'bom';
let rfqView = 'list';        // 'list' | 'edit' | 'compare'
let currentRfqId = null;     // richiesta di offerta aperta in editor
let rfqCompareSel = [];      // id delle richieste selezionate nel confronto tra richieste
let rfqDirty = false;        // modifiche non salvate nell'editor RFQ (il documento si genera solo dopo il salvataggio)
let orderView = 'list';      // 'list' | 'edit'
let currentOrderId = null;   // ordine aperto in editor
let orderDirty = false;      // modifiche non salvate nell'editor ordine


// ═══════════════════════════════════════════════════════════
//  UTILITY
// ═══════════════════════════════════════════════════════════
function cur() { return (db.settings && db.settings.currency) || '€'; }
function fmtN(n) { return cur() + (Number(n) || 0).toFixed(2); }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function getItem(id) { return db.items.find(i => i.id === id); }
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
  sottogruppo: ['parte', 'materiale', 'acquistato'],
  parte: [], materiale: [], acquistato: [],
};
// Tipi inseribili nel ciclo di lavorazione di una Parte (le lavorazioni sono a parte, dai centri di lavoro)
const CYCLE_CHILD_TYPES = ['acquistato', 'materiale'];
const TYPE_LABELS = { macchina: 'Macchina', gruppo: 'Gruppo', sottogruppo: 'Sottogruppo', parte: 'Parte', materiale: 'Materia prima', acquistato: 'Commerciale' };
const TYPE_SHORTS = { macchina: 'MAC', gruppo: 'GRP', sottogruppo: 'SGR', parte: 'PRT', materiale: 'MAT', acquistato: 'CMM' };
function typeLabel(t) { return TYPE_LABELS[t] || t; }
function typeShort(t) { return TYPE_SHORTS[t] || '?'; }

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
// Il click fuori dalla finestra non chiude: si esce solo con Salva/Annulla (o Chiudi).
// wide = true per i form ampi, es. la scheda articolo col ciclo di lavorazione.
function openModal(h, wide) {
  document.getElementById('modal-root').innerHTML =
    `<div class="modal-overlay"><div class="modal${wide ? ' modal-wide' : ''}">${h}</div></div>`;
}
function closeModal() { document.getElementById('modal-root').innerHTML = ''; }
function val(id) { const e = document.getElementById(id); return e ? e.value.trim() : ''; }
function setVal(id, v) { const e = document.getElementById(id); if (e) e.value = v; }
function numVal(id) { const e = document.getElementById(id); return e ? (parseFloat(e.value) || 0) : 0; }

// ═══════════════════════════════════════════════════════════
//  MOTORE DI COSTIFICAZIONE (rollup ricorsivo)
// ═══════════════════════════════════════════════════════════
// Ritorna i costi unitari (per 1 unità) suddivisi in categorie.
// material+purchased+labor+parts+overhead === total (= costo totale industriale).
function costOf(itemId, visited) {
  visited = visited || new Set();
  const zero = { material: 0, purchased: 0, labor: 0, parts: 0, overhead: 0, base: 0, total: 0, cycle: false };
  const it = getItem(itemId);
  if (!it) return zero;
  if (visited.has(itemId)) { return { ...zero, cycle: true }; }

  if (it.type === 'materiale') {
    const v = Number(it.unitCost) || 0;
    return { ...zero, material: v, base: v, total: v };
  }
  if (it.type === 'acquistato') {
    const v = Number(it.purchasePrice) || 0;
    return { ...zero, purchased: v, base: v, total: v };
  }
  if (it.type === 'parte') {
    // Senza ciclo il costo è quello manuale e resta nella voce "Parti".
    if (!(it.cycle || []).length) {
      const v = Number(it.unitCost) || 0;
      return { ...zero, parts: v, base: v, total: v };
    }
    // Col ciclo il costo è derivato e ogni riga confluisce nella propria voce:
    // materie prime → Materiale, commerciali → Commerciali, lavorazioni → Lavorazioni.
    const next = new Set(visited); next.add(itemId);
    let material = 0, purchased = 0, labor = 0;
    it.cycle.forEach(row => {
      const rowCost = cycleRowCost(row, next);
      if (row.kind === 'op') { labor += rowCost; return; }
      const ci = getItem(row.itemId);
      if (!ci) return;
      if (ci.type === 'materiale') material += rowCost;
      else if (ci.type === 'acquistato') purchased += rowCost;
      else labor += rowCost;   // tipo inatteso: non perdiamo il costo
    });
    const base = material + purchased + labor;
    return { ...zero, material, purchased, labor, base, total: base };
  }

  // assieme (macchina/gruppo/sottogruppo): somma figli + lavorazioni
  const next = new Set(visited); next.add(itemId);
  let material = 0, purchased = 0, labor = 0, parts = 0, childOverhead = 0, cycle = false;
  (it.components || []).forEach(c => {
    const cc = costOf(c.itemId, next);
    if (cc.cycle) cycle = true;
    const factor = (Number(c.qty) || 0) * (1 + (Number(c.scrapPct) || 0) / 100);
    material += cc.material * factor;
    purchased += cc.purchased * factor;
    labor += cc.labor * factor;
    parts += cc.parts * factor;
    childOverhead += cc.overhead * factor;
  });
  (it.operations || []).forEach(o => {
    const wc = db.workCenters.find(w => w.id === o.workCenterId);
    labor += (Number(o.hours) || 0) * (wc ? (Number(wc.hourlyRate) || 0) : 0);
  });
  const base = material + purchased + labor + parts;  // costo puro (figli a costo + manodopera)
  const ovPct = it.overheadPctOverride != null ? it.overheadPctOverride : (db.settings.overheadPct || 0);
  const ownOverhead = base * (Number(ovPct) || 0) / 100;
  const overhead = childOverhead + ownOverhead;
  const total = base + overhead;
  return { material, purchased, labor, parts, overhead, base, total, cycle };
}
// ─── Ciclo di lavorazione (articoli tipo "parte") ───
// Costo calcolato di una riga articolo (q.tà × costo unitario), ignorando l'eventuale override.
function cycleRowComputed(row, visited) {
  if (!row || row.kind === 'op') return 0;
  return costOf(row.itemId, visited).total * (Number(row.qty) || 0);
}
// Costo effettivo della riga.
// Lavorazione: costo fisso, non orario (le lavorazioni orarie restano solo negli assiemi).
// Articolo: override se valorizzato, altrimenti q.tà × costo unitario.
function cycleRowCost(row, visited) {
  if (!row) return 0;
  if (row.kind === 'op') return Number(row.cost) || 0;
  if (row.costOverride != null && row.costOverride !== '') return Number(row.costOverride) || 0;
  return cycleRowComputed(row, visited);
}

function sellingPrice(itemId) {
  const it = getItem(itemId);
  const c = costOf(itemId);
  const mgPct = it && it.marginPctOverride != null ? it.marginPctOverride : (db.settings.marginPct || 0);
  return c.total * (1 + (Number(mgPct) || 0) / 100);
}

// ═══════════════════════════════════════════════════════════
//  NAVIGAZIONE
// ═══════════════════════════════════════════════════════════
const NAV = [
  { id: 'bom', label: '🌳 Distinte base' },
  { id: 'catalog', label: '📦 Catalogo' },
  { id: 'report', label: '💶 Costificazione' },
  { id: 'rfq', label: '📨 Richieste offerta' },
  { id: 'orders', label: '🧾 Ordini' },
  { id: 'manage', label: '⚙ Gestione' },
];
function renderNav() {
  document.getElementById('main-nav').innerHTML = NAV.map(n =>
    `<button class="nav-btn ${activeView === n.id ? 'active' : ''}" onclick="setView('${n.id}')">${n.label}</button>`).join('');
}
function setView(v) {
  activeView = v;
  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('view-' + v).classList.add('active');
  renderNav();
  if (v === 'bom') renderBom();
  else if (v === 'catalog') renderCatalog();
  else if (v === 'report') renderReport();
  else if (v === 'rfq') renderRfq();
  else if (v === 'orders') renderOrders();
  else if (v === 'manage') renderManage();
}

// ═══════════════════════════════════════════════════════════
//  VISTA: DISTINTE BASE
// ═══════════════════════════════════════════════════════════
function productOptions(selectedId) {
  const opt = (i) => `<option value="${i.id}" ${i.id === selectedId ? 'selected' : ''}>${esc(i.code)} — ${esc(i.name)}</option>`;
  const groups = [['macchina', 'Macchine'], ['gruppo', 'Gruppi'], ['sottogruppo', 'Sottogruppi']];
  let h = groups.map(([t, lbl]) => {
    const items = db.items.filter(i => i.type === t);
    return items.length ? `<optgroup label="${lbl}">${items.map(opt).join('')}</optgroup>` : '';
  }).join('');
  if (!h) h = '<option value="">— nessun assieme —</option>';
  return h;
}
function ensureCurrentBom() {
  const products = db.items.filter(i => isAssembly(i.type));
  if (!currentBomId || !products.some(p => p.id === currentBomId)) {
    const m = products.find(p => p.type === 'macchina') || products[0];
    currentBomId = m ? m.id : null;
  }
}
function onBomSelect() { currentBomId = val('bom-select'); bomExpanded = new Set(); renderBom(); }

function renderBom() {
  ensureCurrentBom();
  document.getElementById('bom-select').innerHTML = productOptions(currentBomId);
  const it = getItem(currentBomId);
  const summary = document.getElementById('bom-cost-summary');
  const tree = document.getElementById('bom-tree');
  if (!it) {
    summary.innerHTML = '';
    tree.innerHTML = '<div class="empty-text">Nessun prodotto. Crea una macchina con "+ Nuova macchina".</div>';
    return;
  }
  const c = costOf(it.id);
  const price = sellingPrice(it.id);
  summary.innerHTML = [
    kpi('Materiale', fmtN(c.material), 'orange'),
    kpi('Commerciali', fmtN(c.purchased), 'accent'),
    kpi('Parti', fmtN(c.parts), 'purple'),
    kpi('Lavorazioni', fmtN(c.labor), 'green'),
    kpi('Spese generali', fmtN(c.overhead), ''),
    kpi('Costo totale', fmtN(c.total), ''),
    kpi('Prezzo vendita', fmtN(price), 'green'),
  ].join('') + (c.cycle ? '<div class="empty-text" style="color:var(--red)">⚠ Rilevato riferimento ciclico nella distinta!</div>' : '');

  // Albero
  const head = `<div class="bom-head"><span>Articolo</span><span class="num">Q.tà</span><span>U.M.</span>
    <span class="num">Costo un.</span><span class="num">Scarto %</span><span class="num">Costo riga</span><span style="text-align:right">Azioni</span></div>`;
  const rootRow = renderBomRootNode(it);
  const rows = (it.components || []).map((comp, idx) =>
    renderBomNode(comp, 1, it.id, true, idx, it.id, [it.id])).join('');
  const opsRow = renderOpsBlock(it, true);
  tree.innerHTML = head + rootRow + (rows || `<div class="empty-text">Nessun componente. Usa "+ Aggiungi componente".</div>`) + opsRow;
}
function kpi(label, value, cls) {
  return `<div class="kpi-card ${cls}"><div class="kpi-value">${value}</div><div class="kpi-label">${label}</div></div>`;
}

// Render ricorsivo di un nodo (componente). editable = riga di primo livello dell'articolo aperto.
function renderBomNode(comp, level, parentId, editable, idx, pathPrefix, ancestorIds) {
  const child = getItem(comp.itemId);
  if (!child) return `<div class="bom-node"><span class="bom-name">⚠ articolo mancante</span></div>`;
  const nodeKey = pathPrefix + '>' + comp.itemId + '#' + idx;
  const cyc = ancestorIds.includes(comp.itemId);
  const isProd = isAssembly(child.type);
  // Anche una Parte è espandibile: mostra il proprio ciclo di lavorazione (articoli + lavorazioni).
  const hasCycle = child.type === 'parte' && (child.cycle || []).length > 0;
  const expandable = !cyc && (hasCycle || (isProd && (child.components || []).length > 0));
  const expanded = bomExpanded.has(nodeKey);
  const unit = cyc ? 0 : costOf(comp.itemId).total;
  const qty = Number(comp.qty) || 0;
  const factor = qty * (1 + (Number(comp.scrapPct) || 0) / 100);
  const lineCost = unit * factor;
  const indent = (level - 1) * 18;
  const toggle = expandable
    ? `<span class="bom-toggle" onclick="toggleBom('${nodeKey}')">${expanded ? '▼' : '▶'}</span>`
    : `<span class="bom-toggle leaf">•</span>`;
  const actions = editable
    ? `<button class="mini-btn" title="Modifica" onclick="editComponentModal(${idx})">✏</button>
       <button class="mini-btn danger" title="Elimina" onclick="delComponent(${idx})">🗑</button>`
    : '';

  let h = `<div class="bom-node" style="padding-left:${18 + indent}px">
    <span class="bom-name">${toggle}
      <span class="bom-code">${esc(child.code)}</span>
      <span class="bom-type-tag tt-${child.type}">${typeShort(child.type)}</span>
      <span class="nm" title="${esc(child.name)}">${esc(child.name)}${cyc ? ' ⚠' : ''}</span>
    </span>
    <span class="num">${qty}</span>
    <span>${esc(child.uom || '')}</span>
    <span class="num cost">${fmtN(unit)}</span>
    <span class="num">${Number(comp.scrapPct) || 0}</span>
    <span class="num cost">${fmtN(lineCost)}</span>
    <span class="bom-row-actions">${actions}</span>
  </div>`;

  if (expandable && expanded) {
    if (hasCycle) {
      h += (child.cycle || []).map(row => renderCycleBomNode(row, level + 1)).join('');
    } else {
      h += (child.components || []).map((cc, i) =>
        renderBomNode(cc, level + 1, child.id, false, i, nodeKey, ancestorIds.concat(child.id))).join('');
      if ((child.operations || []).length) h += renderOpsBlock(child, false, 18 + indent + 18);
    }
  }
  return h;
}

// Riga del ciclo di lavorazione di una Parte, mostrata nell'albero della distinta (sola lettura:
// il ciclo si modifica dalla scheda articolo in Catalogo).
function renderCycleBomNode(row, level) {
  const indent = (level - 1) * 18;
  const lineCost = cycleRowCost(row);
  let name, qtyCell, uom, unit;
  if (row.kind === 'op') {
    const wc = db.workCenters.find(w => w.id === row.workCenterId);
    const sup = supplierName(row.supplierId);
    name = `<span class="bom-type-tag tt-lav">LAV</span>
      <span class="nm" title="${esc(wc ? wc.name : '?')}">🔧 ${esc(wc ? wc.name : '?')}${sup ? ' · ' + esc(sup) : ''}</span>`;
    qtyCell = '—'; uom = ''; unit = lineCost;
  } else {
    const ci = getItem(row.itemId);
    if (!ci) return `<div class="bom-node" style="padding-left:${18 + indent}px"><span class="bom-name">⚠ articolo mancante</span></div>`;
    name = `<span class="bom-code">${esc(ci.code)}</span>
      <span class="bom-type-tag tt-${ci.type}">${typeShort(ci.type)}</span>
      <span class="nm" title="${esc(ci.name)}">${esc(ci.name)}</span>`;
    qtyCell = Number(row.qty) || 0; uom = ci.uom || ''; unit = costOf(row.itemId).total;
  }
  return `<div class="bom-node bom-node-cycle" style="padding-left:${18 + indent}px">
    <span class="bom-name"><span class="bom-toggle leaf">•</span>${name}</span>
    <span class="num">${qtyCell}</span>
    <span>${esc(uom)}</span>
    <span class="num cost">${fmtN(unit)}</span>
    <span class="num">—</span>
    <span class="num cost">${fmtN(lineCost)}</span>
    <span class="bom-row-actions"></span>
  </div>`;
}

// Riga radice: mostra l'articolo padre (macchina/gruppo selezionata) come prima riga dell'albero.
function renderBomRootNode(it) {
  const unit = costOf(it.id).total;
  return `<div class="bom-node bom-node-root">
    <span class="bom-name">
      <span class="bom-toggle leaf">•</span>
      <span class="bom-code">${esc(it.code)}</span>
      <span class="bom-type-tag tt-${it.type}">${typeShort(it.type)}</span>
      <span class="nm" title="${esc(it.name)}">${esc(it.name)}</span>
    </span>
    <span class="num">1</span>
    <span>${esc(it.uom || '')}</span>
    <span class="num cost">${fmtN(unit)}</span>
    <span class="num">0</span>
    <span class="num cost">${fmtN(unit)}</span>
    <span class="bom-row-actions"></span>
  </div>`;
}

function renderOpsBlock(item, editable, padLeft) {
  const ops = item.operations || [];
  const pl = padLeft != null ? padLeft : 18;
  const tags = ops.map((o, i) => {
    const wc = db.workCenters.find(w => w.id === o.workCenterId);
    const cost = (Number(o.hours) || 0) * (wc ? (Number(wc.hourlyRate) || 0) : 0);
    const del = editable ? ` <span style="cursor:pointer;color:var(--red)" title="Elimina" onclick="delOperation(${i})">✕</span>` : '';
    const ed = editable ? `<span style="cursor:pointer" onclick="editOperationModal(${i})">` : '<span>';
    return `<span class="bom-op-tag">${ed}🔧 ${esc(wc ? wc.name : '?')} · ${(Number(o.hours) || 0)}h · ${fmtN(cost)}</span>${del}</span>`;
  }).join('');
  if (!ops.length && !editable) return '';
  const label = editable ? 'Lavorazioni' : 'Lavorazioni (' + esc(item.name) + ')';
  return `<div class="bom-ops" style="padding-left:${pl}px"><strong style="color:var(--text-dim);font-size:11px">${label}:</strong> ${tags || '<span class="empty-text" style="padding:0">nessuna</span>'}</div>`;
}

function toggleBom(key) { if (bomExpanded.has(key)) bomExpanded.delete(key); else bomExpanded.add(key); renderBom(); }
function expandAllBom(on) {
  bomExpanded = new Set();
  if (on) {
    const walk = (item, prefix) => {
      (item.components || []).forEach((comp, idx) => {
        const key = prefix + '>' + comp.itemId + '#' + idx;
        const child = getItem(comp.itemId);
        if (!child || prefix.split('>').includes(comp.itemId)) return;
        if (isAssembly(child.type)) { bomExpanded.add(key); walk(child, key); }
        // Una Parte col ciclo si espande, ma non ha figli da percorrere oltre
        else if (child.type === 'parte' && (child.cycle || []).length) bomExpanded.add(key);
      });
    };
    const it = getItem(currentBomId); if (it) walk(it, it.id);
  }
  renderBom();
}

// ─── CRUD componenti / lavorazioni dell'articolo aperto ───
// Opzioni limitate ai tipi ammessi dal tipo del padre (regole rigide di contenimento).
function itemPickerOptions(parentType, selectedId, excludeId) {
  const allowed = ALLOWED_CHILDREN[parentType] || [];
  return allowed.map(t => {
    const opts = db.items.filter(i => i.type === t && i.id !== excludeId)
      .map(i => `<option value="${i.id}" ${i.id === selectedId ? 'selected' : ''}>${esc(i.code)} — ${esc(i.name)}</option>`).join('');
    return opts ? `<optgroup label="${typeLabel(t)}">${opts}</optgroup>` : '';
  }).join('');
}
// Picker a ricerca live: candidati ammessi dal tipo padre, filtrabili per codice/nome.
function pickerCandidates(parentType, excludeId) {
  const allowed = ALLOWED_CHILDREN[parentType] || [];
  return db.items
    .filter(i => allowed.includes(i.type) && i.id !== excludeId)
    .sort((a, b) => String(a.code).localeCompare(String(b.code)));
}
// Markup del campo di selezione articolo (input ricerca + lista risultati + valore nascosto).
function itemPickerField(selectedId) {
  const sel = selectedId ? getItem(selectedId) : null;
  return `<div class="modal-field"><label>Articolo</label>
      <input type="hidden" id="cmp-item" value="${selectedId ? esc(selectedId) : ''}">
      <input type="text" id="cmp-search" class="search" placeholder="🔍 Cerca codice o nome..."
        value="${sel ? esc(sel.code + ' — ' + sel.name) : ''}" oninput="renderPickerResults()" autocomplete="off">
      <div id="cmp-results" class="picker-results"></div>
    </div>`;
}
function renderPickerResults() {
  const box = document.getElementById('cmp-results'); if (!box) return;
  const q = (val('cmp-search') || '').toLowerCase();
  let rows = (window.__pickerCandidates || []);
  if (q) rows = rows.filter(i => (i.code + ' ' + i.name).toLowerCase().includes(q));
  const total = rows.length;
  rows = rows.slice(0, 50);
  const sel = val('cmp-item');
  let html = rows.map(i =>
    `<div class="picker-row ${i.id === sel ? 'is-sel' : ''}" onclick="selectPickerItem('${i.id}')">
       <span class="picker-type">${typeLabel(i.type)}</span><b>${esc(i.code)}</b> — ${esc(i.name)}
     </div>`).join('');
  if (!html) html = `<div class="picker-empty">Nessun articolo trovato</div>`;
  else if (total > rows.length) html += `<div class="picker-empty">+${total - rows.length} altri — affina la ricerca</div>`;
  box.innerHTML = html;
}
function selectPickerItem(id) {
  const hidden = document.getElementById('cmp-item'); if (!hidden) return;
  hidden.value = id;
  const it = getItem(id);
  const search = document.getElementById('cmp-search');
  if (search && it) search.value = it.code + ' — ' + it.name;
  renderPickerResults();
}
function allowedHint(parentType) {
  const allowed = (ALLOWED_CHILDREN[parentType] || []).map(typeLabel);
  return allowed.length ? `Tipi ammessi in un ${typeLabel(parentType).toLowerCase()}: ${allowed.join(', ')}.` : '';
}
function addComponentModal() {
  const it = getItem(currentBomId); if (!it) return;
  window.__pickerCandidates = pickerCandidates(it.type, it.id);
  if (!window.__pickerCandidates.length) { showToast('Nessun articolo dei tipi ammessi. Crealo prima nel Catalogo.', 'error'); return; }
  openModal(`<h3>➕ Aggiungi componente</h3>
    <p class="empty-text" style="text-align:left;padding:0 0 10px">${allowedHint(it.type)}</p>
    ${itemPickerField(null)}
    <div class="modal-grid">
      <div class="modal-field"><label>Quantità</label><input type="number" id="cmp-qty" min="0" step="0.001" value="1"></div>
      <div class="modal-field"><label>Scarto %</label><input type="number" id="cmp-scrap" min="0" step="0.1" value="0"></div>
    </div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="saveNewComponent()">Aggiungi</button></div>`);
  renderPickerResults();
}
function isAllowedChild(parentType, childId) {
  const child = getItem(childId);
  return !!child && (ALLOWED_CHILDREN[parentType] || []).includes(child.type);
}
function saveNewComponent() {
  const it = getItem(currentBomId); if (!it) return;
  const itemId = val('cmp-item');
  if (!itemId) { showToast('Seleziona un articolo', 'error'); return; }
  if (!isAllowedChild(it.type, itemId)) { showToast('Tipo non ammesso in un ' + typeLabel(it.type).toLowerCase(), 'error'); return; }
  if (createsCycle(it.id, itemId)) { showToast('Operazione annullata: creerebbe un ciclo', 'error'); return; }
  it.components.push({ itemId, qty: numVal('cmp-qty'), scrapPct: numVal('cmp-scrap') });
  touch(it);
  saveDB(); closeModal(); renderBom(); showToast('Componente aggiunto');
}
function editComponentModal(idx) {
  const it = getItem(currentBomId); if (!it) return;
  const comp = it.components[idx]; if (!comp) return;
  window.__pickerCandidates = pickerCandidates(it.type, it.id);
  openModal(`<h3>✏ Modifica componente</h3>
    <p class="empty-text" style="text-align:left;padding:0 0 10px">${allowedHint(it.type)}</p>
    ${itemPickerField(comp.itemId)}
    <div class="modal-grid">
      <div class="modal-field"><label>Quantità</label><input type="number" id="cmp-qty" min="0" step="0.001" value="${comp.qty}"></div>
      <div class="modal-field"><label>Scarto %</label><input type="number" id="cmp-scrap" min="0" step="0.1" value="${comp.scrapPct || 0}"></div>
    </div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="saveComponentEdit(${idx})">Salva</button></div>`);
  renderPickerResults();
}
function saveComponentEdit(idx) {
  const it = getItem(currentBomId); if (!it) return;
  const comp = it.components[idx]; if (!comp) return;
  const itemId = val('cmp-item');
  if (!isAllowedChild(it.type, itemId)) { showToast('Tipo non ammesso in un ' + typeLabel(it.type).toLowerCase(), 'error'); return; }
  if (createsCycle(it.id, itemId)) { showToast('Operazione annullata: creerebbe un ciclo', 'error'); return; }
  comp.itemId = itemId; comp.qty = numVal('cmp-qty'); comp.scrapPct = numVal('cmp-scrap');
  touch(it);
  saveDB(); closeModal(); renderBom(); showToast('Componente aggiornato');
}
function delComponent(idx) {
  const it = getItem(currentBomId); if (!it) return;
  if (!confirm('Eliminare questo componente dalla distinta?')) return;
  it.components.splice(idx, 1); touch(it); saveDB(); renderBom(); showToast('Componente eliminato');
}
// Verifica se aggiungere childId dentro parentId creerebbe un ciclo
function createsCycle(parentId, childId) {
  if (parentId === childId) return true;
  const child = getItem(childId);
  if (!child || !isAssembly(child.type)) return false;
  const visited = new Set();
  const dfs = (id) => {
    if (id === parentId) return true;
    if (visited.has(id)) return false;
    visited.add(id);
    const node = getItem(id);
    if (!node || !isAssembly(node.type)) return false;
    return (node.components || []).some(c => dfs(c.itemId));
  };
  return dfs(childId);
}

function supplierName(id) { const s = db.suppliers.find(x => x.id === id); return s ? s.name : ''; }
function supplierOptions(selectedId) {
  return `<option value="">—</option>` + db.suppliers
    .map(s => `<option value="${s.id}" ${s.id === selectedId ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
}
// Solo il nome del centro: nel ciclo di una Parte il costo è fisso, la tariffa oraria non si applica.
function wcOptionsNoRate(selectedId) {
  return db.workCenters.filter(w => w.active !== false)
    .map(w => `<option value="${w.id}" ${w.id === selectedId ? 'selected' : ''}>${esc(w.name)}</option>`).join('');
}
function wcOptions(selectedId) {
  return db.workCenters.filter(w => w.active !== false)
    .map(w => `<option value="${w.id}" ${w.id === selectedId ? 'selected' : ''}>${esc(w.name)} (${fmtN(w.hourlyRate)}/h)</option>`).join('');
}
function addOperationModal() {
  const it = getItem(currentBomId); if (!it) return;
  if (!db.workCenters.length) { showToast('Aggiungi prima un centro di lavoro in Gestione', 'error'); return; }
  openModal(`<h3>🔧 Aggiungi lavorazione</h3>
    <div class="modal-field"><label>Centro di lavoro</label><select id="op-wc">${wcOptions(null)}</select></div>
    <div class="modal-grid">
      <div class="modal-field"><label>Ore</label><input type="number" id="op-hours" min="0" step="0.25" value="1"></div>
      <div class="modal-field"><label>Nota</label><input type="text" id="op-note" placeholder="opzionale"></div>
    </div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="saveNewOperation()">Aggiungi</button></div>`);
}
function saveNewOperation() {
  const it = getItem(currentBomId); if (!it) return;
  it.operations.push({ workCenterId: val('op-wc'), hours: numVal('op-hours'), note: val('op-note') });
  touch(it);
  saveDB(); closeModal(); renderBom(); showToast('Lavorazione aggiunta');
}
function editOperationModal(idx) {
  const it = getItem(currentBomId); if (!it) return;
  const op = it.operations[idx]; if (!op) return;
  openModal(`<h3>🔧 Modifica lavorazione</h3>
    <div class="modal-field"><label>Centro di lavoro</label><select id="op-wc">${wcOptions(op.workCenterId)}</select></div>
    <div class="modal-grid">
      <div class="modal-field"><label>Ore</label><input type="number" id="op-hours" min="0" step="0.25" value="${op.hours}"></div>
      <div class="modal-field"><label>Nota</label><input type="text" id="op-note" value="${esc(op.note || '')}"></div>
    </div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="saveOperationEdit(${idx})">Salva</button></div>`);
}
function saveOperationEdit(idx) {
  const it = getItem(currentBomId); if (!it) return;
  const op = it.operations[idx]; if (!op) return;
  op.workCenterId = val('op-wc'); op.hours = numVal('op-hours'); op.note = val('op-note');
  touch(it);
  saveDB(); closeModal(); renderBom(); showToast('Lavorazione aggiornata');
}
function delOperation(idx) {
  const it = getItem(currentBomId); if (!it) return;
  if (!confirm('Eliminare questa lavorazione?')) return;
  it.operations.splice(idx, 1); touch(it); saveDB(); renderBom(); showToast('Lavorazione eliminata');
}

// ─── Macchina / testata prodotto ───
function newMachineModal() {
  const sm = machineScheme(null);
  openModal(`<h3>🛠 Nuova macchina</h3>
    <div class="modal-grid">
      <div class="modal-field"><label>Sigla macchina</label>
        <input id="mac-sigla" maxlength="10" placeholder="es. TRN" style="text-transform:uppercase;font-family:var(--mono);font-weight:700"
          oninput="this.value=this.value.toUpperCase();refreshMachineCode()"></div>
      <div class="modal-field"><label>Codice</label><input id="mac-code" placeholder="auto dalla sigla" oninput="markCodeManual()"></div>
      <div class="modal-field"><label>U.M.</label><input id="mac-uom" value="pz"></div>
    </div>
    <div class="modal-field"><label>Nome</label><input id="mac-name" placeholder="Es. Nastro Trasportatore NT-200"></div>
    <div class="modal-grid">
      <div class="modal-field"><label>N° car. sigla gruppo</label><input type="number" id="mac-glen" min="1" max="10" value="${sm.gLen}" onchange="refreshMachineCode()"></div>
      <div class="modal-field"><label>Tipo car. sigla gruppo</label><select id="mac-gtype" onchange="refreshMachineCode()">${typeOptionsHtml(sm.gType)}</select></div>
      <div class="modal-field"><label>Cifre progressivo S##</label><input type="number" id="mac-incrs" min="1" max="6" value="${sm.incrS}" onchange="refreshMachineCode()"></div>
      <div class="modal-field"><label>Cifre numerazione ###</label><input type="number" id="mac-incrn" min="1" max="6" value="${sm.incrN}" onchange="refreshMachineCode()"></div>
    </div>
    <div class="modal-field"><label>Note</label><textarea id="mac-notes" rows="2"></textarea></div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="saveNewMachine()">Crea</button></div>`);
  itemCodeAuto = true;
}
// Bozza macchina dai campi della modale "Nuova macchina"
function machineDraftFromForm() {
  return {
    type: 'macchina', sigla: val('mac-sigla'),
    gCodeLen: parseInt(val('mac-glen'), 10) || 3,
    gCodeType: val('mac-gtype') || 'alpha',
    incrDigitsS: parseInt(val('mac-incrs'), 10) || 2,
    incrDigitsN: parseInt(val('mac-incrn'), 10) || 3,
  };
}
function refreshMachineCode() {
  if (!itemCodeAuto) return;
  const el = document.getElementById('mac-code'); if (!el) return;
  el.value = genItemCode(machineDraftFromForm());
}
function saveNewMachine() {
  const name = val('mac-name');
  if (!name) { showToast('Nome richiesto', 'error'); return; }
  const d = machineDraftFromForm();
  if (d.sigla && !/^[A-Z0-9]+$/.test(d.sigla)) { showToast('La sigla macchina ammette solo A-Z e 0-9', 'error'); return; }
  if (d.sigla && machineItems().some(m => m.sigla === d.sigla)) { showToast(`Sigla macchina "${d.sigla}" già in uso`, 'error'); return; }
  const id = gid();
  db.items.push(stampNew(Object.assign({
    id, code: val('mac-code') || id, name, type: 'macchina', uom: val('mac-uom') || 'pz',
    notes: val('mac-notes'), active: true, components: [], operations: [],
  }, d)));
  currentBomId = id; bomExpanded = new Set();
  saveDB(); closeModal(); renderBom(); showToast('Macchina creata');
}
function editCurrentItemModal() {
  const it = getItem(currentBomId); if (!it) return;
  openModal(`<h3>✏ Modifica testata — <span style="color:var(--text-dim);font-weight:500">${typeLabel(it.type)}</span></h3>
    <div class="modal-grid">
      <div class="modal-field"><label>Codice</label><input id="mac-code" value="${esc(it.code)}"></div>
      <div class="modal-field"><label>U.M.</label><input id="mac-uom" value="${esc(it.uom || 'pz')}"></div>
    </div>
    <div class="modal-field"><label>Nome</label><input id="mac-name" value="${esc(it.name)}"></div>
    <div class="modal-grid">
      <div class="modal-field"><label>Spese generali % (override)</label><input type="number" id="mac-ov" step="0.1" value="${it.overheadPctOverride != null ? it.overheadPctOverride : ''}" placeholder="default ${db.settings.overheadPct}%"></div>
      <div class="modal-field"><label>Margine % (override)</label><input type="number" id="mac-mg" step="0.1" value="${it.marginPctOverride != null ? it.marginPctOverride : ''}" placeholder="default ${db.settings.marginPct}%"></div>
    </div>
    <div class="modal-field"><label>Note</label><textarea id="mac-notes" rows="2">${esc(it.notes || '')}</textarea></div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="saveCurrentItem()">Salva</button></div>`);
}
function saveCurrentItem() {
  const it = getItem(currentBomId); if (!it) return;
  it.code = val('mac-code'); it.uom = val('mac-uom'); it.name = val('mac-name') || it.name;
  it.notes = val('mac-notes');
  const ov = val('mac-ov'); it.overheadPctOverride = ov === '' ? null : parseFloat(ov);
  const mg = val('mac-mg'); it.marginPctOverride = mg === '' ? null : parseFloat(mg);
  touch(it);
  saveDB(); closeModal(); renderBom(); showToast('Testata aggiornata');
}
function deleteCurrentMachine() {
  const it = getItem(currentBomId); if (!it) return;
  const used = usedBy(it.id);
  if (used.length) { showToast('Usato in: ' + used.map(u => u.code).join(', ') + '. Rimuovilo prima.', 'error'); return; }
  if (!confirm(`Eliminare "${it.name}" e la sua distinta?`)) return;
  db.items = db.items.filter(i => i.id !== it.id);
  currentBomId = null; saveDB(); renderBom(); showToast('Eliminato');
}
function usedBy(itemId) {
  return db.items.filter(i =>
    (isAssembly(i.type) && (i.components || []).some(c => c.itemId === itemId)) ||
    (i.type === 'parte' && (i.cycle || []).some(r => r.kind === 'item' && r.itemId === itemId)));
}

// ═══════════════════════════════════════════════════════════
//  VISTA: CATALOGO ARTICOLI
// ═══════════════════════════════════════════════════════════
function onCatTypeChange() {
  updateCatFamilyFilters();
  renderCatalog();
}
function onCatFamilyChange() {
  updateCatFamilyFilters();
  renderCatalog();
}
// Allinea i filtri famiglia/sottofamiglia al tipo selezionato, preservando le selezioni compatibili
function updateCatFamilyFilters() {
  const famSel = document.getElementById('cat-family');
  const subSel = document.getElementById('cat-subfamily');
  const ft = document.getElementById('cat-type').value;
  const famApplies = !ft || usesFamily(ft); // gli assiemi non hanno famiglia
  famSel.disabled = !famApplies; subSel.disabled = !famApplies;
  const fams = famApplies
    ? (db.families || []).filter(f => !ft || (f.kind || 'acquistato') === ft)
    : [];
  const keepFam = fams.some(f => f.id === famSel.value) ? famSel.value : '';
  famSel.innerHTML = `<option value="">Tutte le famiglie</option>` +
    fams.map(f => `<option value="${f.id}" ${f.id === keepFam ? 'selected' : ''}>${esc(f.name)}</option>`).join('');
  const f = getFamily(keepFam);
  const subs = (f && f.subs) || [];
  const keepSub = subs.some(s => s.id === subSel.value) ? subSel.value : '';
  subSel.innerHTML = `<option value="">Tutte le sottofamiglie</option>` +
    subs.map(s => `<option value="${s.id}" ${s.id === keepSub ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
}
function catalogRow(i) {
  const unit = (isAssembly(i.type) || i.type === 'parte') ? costOf(i.id).total
    : (i.type === 'acquistato' ? (i.purchasePrice || 0) : (i.unitCost || 0));
  let meta = '';
  if (i.type === 'acquistato') { const s = db.suppliers.find(x => x.id === i.supplierId); meta = s ? s.name : '—'; }
  else if (isAssembly(i.type)) meta = (i.components || []).length + ' comp. / ' + (i.operations || []).length + ' lav.';
  else if (i.type === 'parte') meta = (i.cycle || []).length ? (i.cycle.length + ' righe ciclo') : '—';
  else meta = '—';
  return `<tr>
    <td style="font-family:var(--mono)">${esc(i.code)}</td>
    <td>${esc(i.name)}</td>
    <td><span class="bom-type-tag tt-${i.type}">${typeShort(i.type)}</span> ${typeLabel(i.type)}</td>
    <td style="color:var(--text-dim)">${esc(codingLabel(i) || familyLabel(i))}</td>
    <td>${esc(i.uom || '')}</td>
    <td style="font-family:var(--mono)">${fmtN(unit)}</td>
    <td style="color:var(--text-dim)">${esc(meta)}</td>
    <td style="text-align:right;white-space:nowrap">
      <button class="mini-btn" onclick="editItemModal('${i.id}')">✏</button>
      <button class="mini-btn" title="Duplica" onclick="duplicateItemModal('${i.id}')">📋</button>
      <button class="mini-btn danger" onclick="delItem('${i.id}')">🗑</button>
    </td></tr>`;
}
function renderCatalog() {
  updateCatFamilyFilters();
  const q = (document.getElementById('cat-search').value || '').toLowerCase();
  const ft = document.getElementById('cat-type').value;
  const ff = document.getElementById('cat-family').value;
  const fsf = document.getElementById('cat-subfamily').value;
  let rows = db.items.slice();
  if (ft) rows = rows.filter(i => i.type === ft);
  if (ff) rows = rows.filter(i => usesFamily(i.type) && i.familyId === ff);
  if (fsf) rows = rows.filter(i => i.subFamilyId === fsf);
  if (q) rows = rows.filter(i => (i.code + ' ' + i.name).toLowerCase().includes(q));
  rows.sort((a, b) => (a.code || '').localeCompare(b.code || ''));

  // Raggruppamento: commerciali e materie prime per macrofamiglia, gli altri tipi per categoria
  const GROUP_LABELS = { materiale: 'Materie prime', parte: 'Parti', sottogruppo: 'Sottogruppi', gruppo: 'Gruppi', macchina: 'Macchine' };
  const ORDER = { acquistato: 0, materiale: 1, parte: 2, sottogruppo: 3, gruppo: 4, macchina: 5 };
  const NO_FAMILY_LABELS = { acquistato: 'Commerciali senza famiglia', materiale: 'Materie prime senza famiglia', parte: 'Parti senza famiglia' };
  const groupKey = (i) => usesFamily(i.type)
    ? (i.familyId ? familyName(i.familyId) : NO_FAMILY_LABELS[i.type])
    : GROUP_LABELS[i.type];
  const order = (i) => ORDER[i.type] != null ? ORDER[i.type] : 9;
  const groups = {};
  rows.forEach(i => { const k = groupKey(i); (groups[k] = groups[k] || { items: [], ord: order(i) }).items.push(i); });
  const keys = Object.keys(groups).sort((a, b) => groups[a].ord - groups[b].ord || a.localeCompare(b));

  const head = `<thead><tr><th>Codice</th><th>Nome</th><th>Tipo</th><th>Famiglia</th><th>U.M.</th><th>Costo un.</th><th>Dettaglio</th><th></th></tr></thead>`;
  const html = keys.map(k =>
    `<div class="cat-group-title">${esc(k)} <span style="color:var(--text-dim);font-weight:500">(${groups[k].items.length})</span></div>
     <table>${head}<tbody>${groups[k].items.map(catalogRow).join('')}</tbody></table>`).join('');
  document.getElementById('catalog-table').innerHTML = rows.length ? html : '<div class="empty-text">Nessun articolo trovato.</div>';
}
function itemModalBody(it) {
  const t = it ? it.type : 'acquistato';
  const sourcePicker = it ? '' : `
    <div class="modal-field"><label>Parti da (opzionale)</label>
      <input type="text" id="src-search" class="search" placeholder="🔍 Duplica da un articolo esistente..." oninput="renderSourceResults()" autocomplete="off">
      <div id="src-results" class="picker-results"></div>
    </div>`;
  return `${sourcePicker}
    <div class="modal-grid">
      <div class="modal-field"><label>Tipo</label>
        <select id="it-type" onchange="toggleItemFields()" ${it ? 'disabled' : ''}>
          <option value="materiale" ${t === 'materiale' ? 'selected' : ''}>Materia prima</option>
          <option value="acquistato" ${t === 'acquistato' ? 'selected' : ''}>Componente commerciale</option>
          <option value="parte" ${t === 'parte' ? 'selected' : ''}>Parte (lavorato)</option>
          <option value="sottogruppo" ${t === 'sottogruppo' ? 'selected' : ''}>Sottogruppo</option>
          <option value="gruppo" ${t === 'gruppo' ? 'selected' : ''}>Gruppo</option>
          <option value="macchina" ${t === 'macchina' ? 'selected' : ''}>Macchina</option>
        </select>
      </div>
      <div class="modal-field"><label>Codice</label><input id="it-code" value="${it ? esc(it.code) : ''}" oninput="markCodeManual()"></div>
    </div>
    <div class="modal-field"><label>Nome</label><input id="it-name" value="${it ? esc(it.name) : ''}"></div>
    <div class="modal-grid">
      <div class="modal-field"><label>Unità di misura</label><input id="it-uom" value="${it ? esc(it.uom || 'pz') : 'pz'}"></div>
      <div class="modal-field" id="fld-unitcost"><label>Costo unitario (${cur()}/U.M.)</label><input type="number" id="it-unitcost" step="0.0001" value="${it && it.unitCost != null ? it.unitCost : ''}"></div>
      <div class="modal-field" id="fld-assembly-note" style="grid-column:1/-1"><label>Composizione</label><span class="empty-text" style="padding:0">La distinta (componenti e lavorazioni) si gestisce nella vista <strong>Distinte base</strong>.</span></div>
      <div class="modal-field" id="fld-price"><label>Prezzo acquisto (${cur()}/U.M.)</label><input type="number" id="it-price" step="0.0001" value="${it && it.purchasePrice != null ? it.purchasePrice : ''}"></div>
      <div class="modal-field" id="fld-supplier"><label>Fornitore</label><select id="it-supplier">${supplierOptions(it ? it.supplierId : '')}</select></div>
    </div>
    <div class="modal-grid" id="fld-supinfo">
      <div class="modal-field"><label>Codice fornitore</label><input id="it-supcode" value="${it ? esc(it.supplierCode || '') : ''}"></div>
      <div class="modal-field"><label>Descrizione fornitore</label><input id="it-supdesc" value="${it ? esc(it.supplierDesc || '') : ''}"></div>
    </div>
    <div class="modal-grid" id="fld-family">
      <div class="modal-field"><label>Macrofamiglia</label><select id="it-family" onchange="onItemFamilyChange()">${familyOptions(it ? it.familyId : '', usesFamily(t) ? t : '')}</select></div>
      <div class="modal-field"><label>Sottofamiglia</label><select id="it-subfamily" onchange="onItemSubFamilyChange()">${subFamilyOptions(it ? it.familyId : '', it ? it.subFamilyId : '')}</select></div>
    </div>
    ${codingFieldsHtml(it)}
    <div class="modal-field" id="fld-cycle">
      <label>Ciclo di lavorazione</label>
      <div class="cycle-box">
        <div id="cycle-list"></div>
        <div id="cycle-picker"></div>
        <div class="cycle-actions">
          <button type="button" class="add-btn-sm" onclick="addCycleItemRow()">+ Articolo</button>
          <button type="button" class="add-btn-sm" onclick="addCycleOpRow()">+ Lavorazione</button>
          <span id="cycle-total" class="cycle-total"></span>
        </div>
      </div>
    </div>
    <div class="modal-field"><label>Note</label><textarea id="it-notes" rows="2">${it ? esc(it.notes || '') : ''}</textarea></div>`;
}
// ─── Campi di codifica (macchina › gruppo) nella modale articolo ───
function machineOptions(selectedId) {
  return `<option value="">—</option>` + machineItems()
    .map(m => `<option value="${m.id}" ${m.id === selectedId ? 'selected' : ''}>${esc((m.sigla ? m.sigla + ' — ' : '') + m.name)}</option>`).join('');
}
function groupOptions(machineId, selectedId) {
  return `<option value="">—</option>` + groupItemsFor(machineId)
    .map(g => `<option value="${g.id}" ${g.id === selectedId ? 'selected' : ''}>${esc((g.sigla ? g.sigla + ' — ' : '') + g.name)}</option>`).join('');
}
function codingFieldsHtml(it) {
  const sm = machineScheme(it);
  const macId = it ? (it.machineItemId || '') : '';
  const grpId = it ? (it.groupItemId || '') : '';
  const gsm = machineScheme(getItem(macId));
  return `
    <div id="fld-coding-mac" class="modal-grid">
      <div class="modal-field"><label>Sigla macchina</label>
        <input id="it-sigla-mac" maxlength="10" value="${it ? esc(it.sigla || '') : ''}" placeholder="es. TRN"
          style="text-transform:uppercase;font-family:var(--mono);font-weight:700"
          oninput="this.value=this.value.toUpperCase();refreshItemCode()"></div>
      <div class="modal-field"><label>N° car. sigla gruppo</label>
        <input type="number" id="it-glen" min="1" max="10" value="${sm.gLen}" onchange="refreshItemCode()"></div>
      <div class="modal-field"><label>Tipo car. sigla gruppo</label>
        <select id="it-gtype" onchange="refreshItemCode()">${typeOptionsHtml(sm.gType)}</select></div>
      <div class="modal-field"><label>Cifre progressivo S## </label>
        <input type="number" id="it-incrs" min="1" max="6" value="${sm.incrS}" onchange="refreshItemCode()"></div>
      <div class="modal-field"><label>Cifre numerazione ###</label>
        <input type="number" id="it-incrn" min="1" max="6" value="${sm.incrN}" onchange="refreshItemCode()"></div>
    </div>
    <div id="fld-coding-child" class="modal-grid">
      <div class="modal-field"><label>Macchina</label>
        <select id="it-machine" onchange="onItemMachineChange()">${machineOptions(macId)}</select></div>
      <div class="modal-field" id="fld-coding-gsigla"><label id="it-sigla-grp-label">Sigla gruppo (${typeHint(gsm.gLen, gsm.gType)})</label>
        <input id="it-sigla-grp" maxlength="${gsm.gLen}" value="${it && it.type === 'gruppo' ? esc(it.sigla || '') : ''}" placeholder="es. BAS"
          style="text-transform:uppercase;font-family:var(--mono);font-weight:700"
          oninput="this.value=this.value.toUpperCase();refreshItemCode()"></div>
      <div class="modal-field" id="fld-coding-group"><label>Gruppo</label>
        <select id="it-group" onchange="refreshItemCode()">${groupOptions(macId, grpId)}</select></div>
    </div>`;
}
function onItemMachineChange() {
  const macId = val('it-machine');
  const gsm = machineScheme(getItem(macId));
  const lbl = document.getElementById('it-sigla-grp-label');
  const inp = document.getElementById('it-sigla-grp');
  if (lbl) lbl.textContent = `Sigla gruppo (${typeHint(gsm.gLen, gsm.gType)})`;
  if (inp) inp.maxLength = gsm.gLen;
  const grpSel = document.getElementById('it-group');
  if (grpSel) grpSel.innerHTML = groupOptions(macId, '');
  refreshItemCode();
}
// Bozza dell'articolo con i soli campi che determinano il codice automatico
function itemDraftFromForm() {
  const t = val('it-type');
  const draft = { id: window.__editingItemId || null, type: t, familyId: val('it-family'), subFamilyId: val('it-subfamily') };
  if (t === 'macchina') {
    draft.sigla = val('it-sigla-mac');
    draft.gCodeLen = parseInt(val('it-glen'), 10) || 3;
    draft.gCodeType = val('it-gtype') || 'alpha';
    draft.incrDigitsS = parseInt(val('it-incrs'), 10) || 2;
    draft.incrDigitsN = parseInt(val('it-incrn'), 10) || 3;
  } else if (t === 'gruppo') {
    draft.machineItemId = val('it-machine');
    draft.sigla = val('it-sigla-grp');
  } else if (t === 'sottogruppo' || t === 'parte') {
    draft.machineItemId = val('it-machine');
    draft.groupItemId = val('it-group');
  }
  return draft;
}
// Stato: true finché il codice è ancora "automatico" (non modificato a mano dall'utente)
let itemCodeAuto = true;
function markCodeManual() { itemCodeAuto = false; }
function refreshItemCode() {
  if (!itemCodeAuto) return;
  const codeEl = document.getElementById('it-code');
  if (!codeEl) return;
  codeEl.value = genItemCode(itemDraftFromForm());
}
function toggleItemFields() {
  const t = document.getElementById('it-type').value;
  document.getElementById('fld-unitcost').style.display = (t === 'materiale' || t === 'parte') ? '' : 'none';
  document.getElementById('fld-price').style.display = t === 'acquistato' ? '' : 'none';
  document.getElementById('fld-supplier').style.display = t === 'acquistato' ? '' : 'none';
  document.getElementById('fld-supinfo').style.display = (t === 'acquistato' || t === 'materiale') ? '' : 'none';
  const showFam = usesFamily(t);
  document.getElementById('fld-family').style.display = showFam ? '' : 'none';
  document.getElementById('fld-assembly-note').style.display = isAssembly(t) ? '' : 'none';
  document.getElementById('fld-cycle').style.display = t === 'parte' ? '' : 'none';
  // Codifica gerarchica: schema per la macchina, appartenenza per gli altri tipi
  const isChild = t === 'gruppo' || t === 'sottogruppo' || t === 'parte';
  document.getElementById('fld-coding-mac').style.display = t === 'macchina' ? '' : 'none';
  document.getElementById('fld-coding-child').style.display = isChild ? '' : 'none';
  document.getElementById('fld-coding-gsigla').style.display = t === 'gruppo' ? '' : 'none';
  document.getElementById('fld-coding-group').style.display = (t === 'sottogruppo' || t === 'parte') ? '' : 'none';
  if (showFam) {
    // Ripopola le famiglie con quelle del tipo selezionato, preservando la selezione se compatibile
    const famSel = document.getElementById('it-family');
    const cur = famSel.value;
    famSel.innerHTML = familyOptions(cur, t);
    if (famSel.value !== cur) document.getElementById('it-subfamily').innerHTML = subFamilyOptions('', '');
  }
  if (t === 'parte') renderCycleList();
  refreshItemCode();
}
function onItemFamilyChange() {
  document.getElementById('it-subfamily').innerHTML = subFamilyOptions(val('it-family'), '');
  refreshItemCode();
}
function onItemSubFamilyChange() { refreshItemCode(); }

// ─── Editor inline del ciclo di lavorazione (solo articoli "parte") ───
// openModal() sostituisce l'intero #modal-root, quindi l'editor non può usare modali annidati:
// lavora su una bozza in memoria, committata su readItemForm().
let cycleDraft = [];

function cycleRowLabel(row) {
  if (row.kind === 'op') {
    const wc = db.workCenters.find(w => w.id === row.workCenterId);
    return `🔧 ${esc(wc ? wc.name : '?')} <span class="cycle-dim">lavorazione</span>`;
  }
  const it = getItem(row.itemId);
  if (!it) return '⚠ articolo mancante';
  return `<span class="bom-type-tag tt-${it.type}">${typeShort(it.type)}</span>
    <span class="cycle-code">${esc(it.code)}</span> ${esc(it.name)}`;
}
function renderCycleList() {
  const box = document.getElementById('cycle-list'); if (!box) return;
  if (!cycleDraft.length) {
    box.innerHTML = '<div class="empty-text" style="padding:8px 0">Nessuna riga. Il costo unitario resta quello inserito a mano.</div>';
    renderCycleTotals();
    return;
  }
  const head = `<div class="cycle-row cycle-head">
    <span>Voce</span><span>Fornitore</span><span class="num">Q.tà</span><span class="num">Costo</span><span class="num">Costo riga</span><span></span></div>`;
  box.innerHTML = head + cycleDraft.map((row, idx) => {
    // Lavorazione: fornitore selezionabile e costo fisso, nessuna quantità.
    // Articolo: fornitore ereditato dall'anagrafica, q.tà × costo unitario, con override facoltativo.
    const supCell = row.kind === 'op'
      ? `<select class="cycle-sup" onchange="updateCycleRow(${idx})" id="cyc-sup-${idx}">${supplierOptions(row.supplierId || '')}</select>`
      : `<span class="cycle-dim">${esc(supplierName(getItem(row.itemId) && getItem(row.itemId).supplierId) || '—')}</span>`;
    const qtyCell = row.kind === 'op'
      ? `<span class="num cycle-dim">—</span>`
      : `<input class="num" type="number" min="0" step="0.001" value="${Number(row.qty) || 0}"
           onchange="updateCycleRow(${idx})" id="cyc-qty-${idx}">`;
    const costCell = row.kind === 'op'
      ? `<input class="num" type="number" min="0" step="0.01" value="${Number(row.cost) || 0}"
           title="Costo fisso della lavorazione" onchange="updateCycleRow(${idx})" id="cyc-cost-in-${idx}">`
      : `<input class="num" type="number" min="0" step="0.01" value="${row.costOverride != null ? row.costOverride : ''}"
           placeholder="${cycleRowComputed(row).toFixed(2)}" title="Lascia vuoto per usare il costo calcolato"
           onchange="updateCycleRow(${idx})" id="cyc-ovr-${idx}">`;
    return `<div class="cycle-row">
      <span class="cycle-name">${cycleRowLabel(row)}</span>
      ${supCell}
      ${qtyCell}
      ${costCell}
      <span class="num cost" id="cyc-cost-${idx}">${fmtN(cycleRowCost(row))}</span>
      <button type="button" class="mini-btn danger" onclick="delCycleRow(${idx})">🗑</button>
    </div>`;
  }).join('');
  renderCycleTotals();
}
// Aggiorna solo i totali/costi riga, senza ridisegnare gli input (il re-render farebbe perdere il focus).
function renderCycleTotals() {
  cycleDraft.forEach((row, idx) => {
    const el = document.getElementById('cyc-cost-' + idx);
    if (el) el.textContent = fmtN(cycleRowCost(row));
    // Il suggerimento "costo calcolato" della riga articolo segue la quantità
    const ovr = document.getElementById('cyc-ovr-' + idx);
    if (ovr) ovr.placeholder = cycleRowComputed(row).toFixed(2);
  });
  const tot = document.getElementById('cycle-total');
  if (tot) tot.innerHTML = cycleDraft.length
    ? `Totale ciclo: <strong>${fmtN(cycleDraft.reduce((s, r) => s + cycleRowCost(r), 0))}</strong>`
    : '';
  // Con un ciclo il costo unitario è derivato: il campo manuale non si usa più.
  const uc = document.getElementById('it-unitcost');
  if (uc) {
    const derived = cycleDraft.length > 0;
    uc.disabled = derived;
    uc.title = derived ? 'Costo derivato dal ciclo di lavorazione' : '';
  }
}
function updateCycleRow(idx) {
  const row = cycleDraft[idx]; if (!row) return;
  if (row.kind === 'op') {
    row.cost = numVal('cyc-cost-in-' + idx);
    row.supplierId = val('cyc-sup-' + idx);
  } else {
    row.qty = numVal('cyc-qty-' + idx);
    const ovr = val('cyc-ovr-' + idx);
    row.costOverride = ovr === '' ? null : (parseFloat(ovr) || 0);
  }
  renderCycleTotals();
}
function delCycleRow(idx) {
  cycleDraft.splice(idx, 1);
  renderCycleList();
}
function closeCyclePicker() {
  const box = document.getElementById('cycle-picker'); if (box) box.innerHTML = '';
}
// Picker inline di un articolo (commerciale o materia prima) da aggiungere al ciclo.
function addCycleItemRow() {
  const box = document.getElementById('cycle-picker'); if (!box) return;
  window.__cyclePickerCandidates = db.items
    .filter(i => CYCLE_CHILD_TYPES.includes(i.type))
    .sort((a, b) => String(a.code).localeCompare(String(b.code)));
  if (!window.__cyclePickerCandidates.length) {
    showToast('Nessun commerciale o materia prima a catalogo.', 'error'); return;
  }
  box.innerHTML = `<div class="cycle-picker-box">
    <input type="text" id="cyc-search" class="search" placeholder="🔍 Cerca codice o nome..." oninput="renderCyclePickerResults()" autocomplete="off">
    <div id="cyc-results" class="picker-results"></div>
    <div class="cycle-actions"><button type="button" class="btn-ghost" onclick="closeCyclePicker()">Annulla</button></div>
  </div>`;
  renderCyclePickerResults();
  const s = document.getElementById('cyc-search'); if (s) s.focus();
}
function renderCyclePickerResults() {
  const box = document.getElementById('cyc-results'); if (!box) return;
  const q = (val('cyc-search') || '').toLowerCase();
  let rows = window.__cyclePickerCandidates || [];
  if (q) rows = rows.filter(i => (i.code + ' ' + i.name).toLowerCase().includes(q));
  const total = rows.length;
  rows = rows.slice(0, 50);
  let html = rows.map(i =>
    `<div class="picker-row" onclick="pickCycleItem('${i.id}')">
       <span class="picker-type">${typeLabel(i.type)}</span><b>${esc(i.code)}</b> — ${esc(i.name)}
     </div>`).join('');
  if (!html) html = `<div class="picker-empty">Nessun articolo trovato</div>`;
  else if (total > rows.length) html += `<div class="picker-empty">+${total - rows.length} altri — affina la ricerca</div>`;
  box.innerHTML = html;
}
function pickCycleItem(id) {
  cycleDraft.push({ kind: 'item', itemId: id, qty: 1, costOverride: null });
  closeCyclePicker();
  renderCycleList();
}
// Selettore inline di una lavorazione da un centro di lavoro esistente (costo fisso, non orario).
function addCycleOpRow() {
  const box = document.getElementById('cycle-picker'); if (!box) return;
  if (!db.workCenters.length) { showToast('Aggiungi prima un centro di lavoro in Gestione', 'error'); return; }
  box.innerHTML = `<div class="cycle-picker-box">
    <div class="modal-grid">
      <div class="modal-field"><label>Centro di lavoro</label><select id="cyc-wc">${wcOptionsNoRate(null)}</select></div>
      <div class="modal-field"><label>Fornitore</label><select id="cyc-opsup">${supplierOptions('')}</select></div>
      <div class="modal-field"><label>Costo (${cur()})</label><input type="number" id="cyc-opcost" min="0" step="0.01" value="0"></div>
    </div>
    <div class="cycle-actions">
      <button type="button" class="btn-ghost" onclick="closeCyclePicker()">Annulla</button>
      <button type="button" class="add-btn-sm" onclick="pickCycleOp()">Aggiungi</button>
    </div>
  </div>`;
}
function pickCycleOp() {
  const wcId = val('cyc-wc');
  if (!wcId) { showToast('Seleziona un centro di lavoro', 'error'); return; }
  cycleDraft.push({ kind: 'op', workCenterId: wcId, supplierId: val('cyc-opsup'), cost: numVal('cyc-opcost'), note: '' });
  closeCyclePicker();
  renderCycleList();
}

function newItemModal() {
  itemCodeAuto = true;
  window.__dupSourceId = null;
  window.__editingItemId = null;
  cycleDraft = [];
  openModal(`<h3>📦 Nuovo articolo</h3>${itemModalBody(null)}
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="saveNewItem()">Crea</button></div>`, true);
  toggleItemFields();
}
// Ricerca live di un articolo sorgente da cui duplicare (tutti i tipi).
function renderSourceResults() {
  const box = document.getElementById('src-results'); if (!box) return;
  const q = (val('src-search') || '').toLowerCase();
  if (!q) { box.innerHTML = ''; return; }
  const rows = db.items.filter(i => (i.code + ' ' + i.name).toLowerCase().includes(q))
    .sort((a, b) => String(a.code).localeCompare(String(b.code))).slice(0, 50);
  box.innerHTML = rows.map(i =>
    `<div class="picker-row" onclick="applyItemSource('${i.id}')">
       <span class="picker-type">${typeLabel(i.type)}</span><b>${esc(i.code)}</b> — ${esc(i.name)}
     </div>`).join('') || `<div class="picker-empty">Nessun articolo trovato</div>`;
}
// Precompila il form "Nuovo articolo" coi dati della sorgente (codice escluso, sempre univoco).
function applyItemSource(id) {
  const src = getItem(id); if (!src) return;
  window.__dupSourceId = id;
  itemCodeAuto = true;
  cycleDraft = (src.cycle || []).map(r => Object.assign({}, r));
  setVal('it-type', src.type); toggleItemFields();
  if (usesFamily(src.type)) {
    setVal('it-family', src.familyId || '');
    document.getElementById('it-subfamily').innerHTML = subFamilyOptions(src.familyId || '', src.subFamilyId || '');
  }
  // Appartenenza copiata; la sigla della macchina no (deve restare univoca)
  if (src.type === 'gruppo' || src.type === 'sottogruppo' || src.type === 'parte') {
    setVal('it-machine', src.machineItemId || '');
    onItemMachineChange();
    if (src.type === 'gruppo') setVal('it-sigla-grp', src.sigla || '');
    else setVal('it-group', src.groupItemId || '');
  }
  setVal('it-name', src.name + ' (copia)');
  setVal('it-uom', src.uom || 'pz');
  setVal('it-unitcost', src.unitCost != null ? src.unitCost : '');
  setVal('it-price', src.purchasePrice != null ? src.purchasePrice : '');
  setVal('it-supplier', src.supplierId || '');
  setVal('it-supcode', src.supplierCode || '');
  setVal('it-supdesc', src.supplierDesc || '');
  setVal('it-notes', src.notes || '');
  setVal('it-code', '');
  refreshItemCode();
  const box = document.getElementById('src-results'); if (box) box.innerHTML = '';
  setVal('src-search', src.code + ' — ' + src.name);
}
function duplicateItemModal(id) {
  if (!getItem(id)) return;
  newItemModal();
  applyItemSource(id);
}
function readItemForm(it) {
  it.code = val('it-code') || it.id;
  it.name = val('it-name');
  it.uom = val('it-uom') || 'pz';
  it.notes = val('it-notes');
  if (it.type === 'materiale' || it.type === 'parte') { it.unitCost = numVal('it-unitcost'); }
  if (it.type === 'acquistato') { it.purchasePrice = numVal('it-price'); it.supplierId = val('it-supplier'); }
  if (it.type === 'materiale' || it.type === 'acquistato') { it.supplierCode = val('it-supcode'); it.supplierDesc = val('it-supdesc'); }
  if (usesFamily(it.type)) { it.familyId = val('it-family'); it.subFamilyId = val('it-subfamily'); }
  // Codifica gerarchica: schema sulla macchina, appartenenza sugli altri tipi
  const d = itemDraftFromForm();
  if (it.type === 'macchina') {
    it.sigla = d.sigla; it.gCodeLen = d.gCodeLen; it.gCodeType = d.gCodeType;
    it.incrDigitsS = d.incrDigitsS; it.incrDigitsN = d.incrDigitsN;
  } else if (it.type === 'gruppo') {
    it.machineItemId = d.machineItemId; it.sigla = d.sigla;
  } else if (it.type === 'sottogruppo' || it.type === 'parte') {
    it.machineItemId = d.machineItemId; it.groupItemId = d.groupItemId;
  }
  // Il ciclo (con costo derivato) sostituisce il costo manuale quando ha almeno una riga.
  if (it.type === 'parte') it.cycle = cycleDraft.map(r => Object.assign({}, r));
}
// Controlli sulla codifica: sigle valide e univoche. Restituisce un messaggio o null.
function validateItemCoding(id) {
  const d = itemDraftFromForm();
  if (d.type === 'macchina') {
    if (!d.sigla) return null; // sigla facoltativa: senza, niente codice automatico
    if (!/^[A-Z0-9]+$/.test(d.sigla)) return 'La sigla macchina ammette solo A-Z e 0-9';
    if (machineItems().some(m => m.sigla === d.sigla && m.id !== id)) return `Sigla macchina "${d.sigla}" già in uso`;
    if (!(d.gCodeLen >= 1 && d.gCodeLen <= 10)) return 'N° caratteri sigla gruppo non valido (1-10)';
    if (!(d.incrDigitsS >= 1 && d.incrDigitsS <= 6)) return 'Cifre progressivo S## non valide (1-6)';
    if (!(d.incrDigitsN >= 1 && d.incrDigitsN <= 6)) return 'Cifre numerazione ### non valide (1-6)';
  } else if (d.type === 'gruppo') {
    if (!d.machineItemId || !d.sigla) return null; // senza macchina+sigla il codice resta manuale
    const sm = machineScheme(getItem(d.machineItemId));
    const err = validateCodeFormat(d.sigla, sm.gLen, sm.gType);
    if (err) return err;
    if (groupItemsFor(d.machineItemId).some(g => g.sigla === d.sigla && g.id !== id))
      return `Sigla gruppo "${d.sigla}" già usata su questa macchina`;
  }
  return null;
}
function saveNewItem() {
  const name = val('it-name'); if (!name) { showToast('Nome richiesto', 'error'); return; }
  const codErr = validateItemCoding(null);
  if (codErr) { showToast(codErr, 'error'); return; }
  const it = { id: gid(), type: val('it-type') };
  if (isAssembly(it.type)) { it.components = []; it.operations = []; }
  readItemForm(it);
  const src = window.__dupSourceId ? getItem(window.__dupSourceId) : null;
  if (src && isAssembly(it.type)) {
    it.components = (src.components || []).map(c => Object.assign({}, c));
    it.operations = (src.operations || []).map(o => Object.assign({}, o));
  }
  if (src) {
    if (src.overheadPctOverride != null) it.overheadPctOverride = src.overheadPctOverride;
    if (src.marginPctOverride != null) it.marginPctOverride = src.marginPctOverride;
  }
  db.items.push(stampNew(it));
  saveDB(); closeModal(); renderCatalog(); showToast(src ? 'Copia creata' : 'Articolo creato');
}
function editItemModal(id) {
  const it = getItem(id); if (!it) return;
  itemCodeAuto = false; // in modifica non si rigenera mai il codice esistente
  window.__editingItemId = id;
  cycleDraft = (it.cycle || []).map(r => Object.assign({}, r));
  openModal(`<h3>✏ Modifica articolo</h3>${itemModalBody(it)}
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="saveItemEdit('${id}')">Salva</button></div>`, true);
  toggleItemFields();
}
function saveItemEdit(id) {
  const it = getItem(id); if (!it) return;
  const codErr = validateItemCoding(id);
  if (codErr) { showToast(codErr, 'error'); return; }
  readItemForm(it);
  touch(it);
  saveDB(); closeModal(); renderCatalog(); showToast('Articolo aggiornato');
}
function delItem(id) {
  const it = getItem(id); if (!it) return;
  const used = usedBy(id);
  if (used.length) { showToast('Usato in: ' + used.map(u => u.code).join(', ') + '. Rimuovilo prima.', 'error'); return; }
  if (!confirm(`Eliminare "${it.name}"?`)) return;
  db.items = db.items.filter(x => x.id !== id);
  if (currentBomId === id) currentBomId = null;
  saveDB(); renderCatalog(); showToast('Eliminato');
}

// ═══════════════════════════════════════════════════════════
//  VISTA: COSTIFICAZIONE & REPORT
// ═══════════════════════════════════════════════════════════
function flattenBom(itemId, qty, scrap, level, rows, ancestors) {
  const it = getItem(itemId); if (!it) return;
  const cyc = ancestors.includes(itemId);
  const unit = cyc ? 0 : costOf(itemId).total;
  const factor = (Number(qty) || 0) * (1 + (Number(scrap) || 0) / 100);
  rows.push({ level, code: it.code, name: it.name + (cyc ? ' (ciclo!)' : ''), type: typeLabel(it.type),
    qty: Number(qty) || 0, uom: it.uom || '', unit, line: unit * factor });
  if (isAssembly(it.type) && !cyc) {
    (it.components || []).forEach(c => flattenBom(c.itemId, c.qty, c.scrapPct, level + 1, rows, ancestors.concat(itemId)));
  }
  // Una Parte esplode il proprio ciclo di lavorazione: i costi riga sono scalati per la quantità del padre,
  // così la somma dei figli coincide col costo riga della Parte.
  if (it.type === 'parte' && !cyc) {
    (it.cycle || []).forEach(row => {
      const rowCost = cycleRowCost(row);
      if (row.kind === 'op') {
        const wc = db.workCenters.find(w => w.id === row.workCenterId);
        const sup = supplierName(row.supplierId);
        rows.push({ level: level + 1, code: '', name: '🔧 ' + (wc ? wc.name : '?') + (sup ? ' · ' + sup : ''),
          type: 'Lavorazione', qty: 1, uom: '', unit: rowCost, line: rowCost * factor });
      } else {
        const ci = getItem(row.itemId); if (!ci) return;
        rows.push({ level: level + 1, code: ci.code, name: ci.name, type: typeLabel(ci.type),
          qty: Number(row.qty) || 0, uom: ci.uom || '', unit: costOf(row.itemId).total, line: rowCost * factor });
      }
    });
  }
}
function renderReport() {
  // sincronizza i due selettori
  if (!reportBomId) reportBomId = currentBomId;
  ensureCurrentBom(); if (!reportBomId) reportBomId = currentBomId;
  const sel = document.getElementById('report-select');
  if (document.activeElement !== sel) sel.innerHTML = productOptions(reportBomId);
  reportBomId = val('report-select') || reportBomId;
  const it = getItem(reportBomId);
  const wrap = document.getElementById('report-content');
  if (!it) { wrap.innerHTML = '<div class="empty-text">Seleziona un prodotto.</div>'; return; }

  const c = costOf(it.id);
  const price = sellingPrice(it.id);
  const cats = [
    { name: 'Materiale', val: c.material, color: 'var(--orange)' },
    { name: 'Commerciali', val: c.purchased, color: 'var(--accent)' },
    { name: 'Parti', val: c.parts, color: 'var(--purple)' },
    { name: 'Lavorazioni', val: c.labor, color: 'var(--green)' },
    { name: 'Spese generali', val: c.overhead, color: 'var(--text-dim)' },
  ];
  const mx = Math.max(...cats.map(x => x.val), 0.0001);
  const bars = cats.map(x => `<div class="breakdown-row">
    <div class="breakdown-name">${x.name}</div>
    <div class="breakdown-bar"><div class="breakdown-fill" style="width:${x.val / mx * 100}%;background:${x.color}"></div></div>
    <div class="breakdown-stats"><span>${fmtN(x.val)}</span><span style="color:var(--text-dim)">${c.total ? (x.val / c.total * 100).toFixed(1) : '0.0'}%</span></div>
  </div>`).join('');

  const rows = [];
  flattenBom(it.id, 1, 0, 0, rows, []);
  const tableRows = rows.map(r => `<tr>
    <td style="font-family:var(--mono)">${esc(r.code)}</td>
    <td style="padding-left:${12 + r.level * 18}px">${r.level ? '└ ' : ''}${esc(r.name)}</td>
    <td style="color:var(--text-dim)">${esc(r.type)}</td>
    <td style="font-family:var(--mono)">${r.qty} ${esc(r.uom)}</td>
    <td style="font-family:var(--mono)">${fmtN(r.unit)}</td>
    <td style="font-family:var(--mono)">${fmtN(r.line)}</td></tr>`).join('');

  wrap.innerHTML = `
    <div class="cost-summary">
      ${kpi('Materiale', fmtN(c.material), 'orange')}
      ${kpi('Commerciali', fmtN(c.purchased), 'accent')}
      ${kpi('Parti', fmtN(c.parts), 'purple')}
      ${kpi('Lavorazioni', fmtN(c.labor), 'green')}
      ${kpi('Spese generali', fmtN(c.overhead), '')}
      ${kpi('Costo totale', fmtN(c.total), '')}
      ${kpi('Prezzo vendita', fmtN(price), 'green')}
    </div>
    <div class="breakdown-section" style="margin-bottom:20px"><h3 class="sub-title">Incidenza voci di costo</h3>${bars}</div>
    <div class="breakdown-section"><h3 class="sub-title">Distinta base esplosa</h3>
      <div class="table-wrap"><table><thead><tr><th>Codice</th><th>Articolo</th><th>Tipo</th><th>Q.tà</th><th>Costo un.</th><th>Costo riga</th></tr></thead>
      <tbody>${tableRows}</tbody></table></div></div>`;
}

// ─── EXPORT ───
function reportRows() { const r = []; flattenBom(reportBomId || currentBomId, 1, 0, 0, r, []); return r; }
function exportBomExcel() {
  const it = getItem(reportBomId || currentBomId); if (!it) { showToast('Seleziona un prodotto', 'error'); return; }
  const c = costOf(it.id);
  const rows = reportRows();
  const data = [['Codice', 'Articolo', 'Livello', 'Tipo', 'Quantità', 'U.M.', 'Costo unitario', 'Costo riga']];
  rows.forEach(r => data.push([r.code, '  '.repeat(r.level) + r.name, r.level, r.type, r.qty, r.uom, +r.unit.toFixed(4), +r.line.toFixed(4)]));
  data.push([]);
  data.push(['', 'Materiale', '', '', '', '', '', +c.material.toFixed(2)]);
  data.push(['', 'Commerciali', '', '', '', '', '', +c.purchased.toFixed(2)]);
  data.push(['', 'Parti', '', '', '', '', '', +c.parts.toFixed(2)]);
  data.push(['', 'Lavorazioni', '', '', '', '', '', +c.labor.toFixed(2)]);
  data.push(['', 'Spese generali', '', '', '', '', '', +c.overhead.toFixed(2)]);
  data.push(['', 'COSTO TOTALE', '', '', '', '', '', +c.total.toFixed(2)]);
  data.push(['', 'PREZZO VENDITA', '', '', '', '', '', +sellingPrice(it.id).toFixed(2)]);
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Distinta');
  XLSX.writeFile(wb, `Distinta_${it.code || it.name}.xlsx`);
  showToast('Excel esportato');
}
function exportBomPDF() {
  const it = getItem(reportBomId || currentBomId); if (!it) { showToast('Seleziona un prodotto', 'error'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const c = costOf(it.id);
  doc.setFontSize(15); doc.text(`Distinta base — ${it.name}`, 14, 16);
  doc.setFontSize(10); doc.setTextColor(120);
  doc.text(`Codice: ${it.code || '-'}   Data: ${new Date().toLocaleDateString('it-IT')}`, 14, 23);
  const rows = reportRows().map(r => ['  '.repeat(r.level) + r.code, '  '.repeat(r.level) + r.name, r.type, r.qty + ' ' + r.uom, fmtN(r.unit), fmtN(r.line)]);
  doc.autoTable({
    startY: 28, head: [['Codice', 'Articolo', 'Tipo', 'Q.tà', 'Costo un.', 'Costo riga']], body: rows,
    styles: { fontSize: 8 }, headStyles: { fillColor: [58, 123, 232] },
  });
  let y = doc.lastAutoTable.finalY + 8;
  const sum = [
    ['Materiale', fmtN(c.material)], ['Commerciali', fmtN(c.purchased)], ['Parti', fmtN(c.parts)], ['Lavorazioni', fmtN(c.labor)],
    ['Spese generali', fmtN(c.overhead)], ['COSTO TOTALE', fmtN(c.total)], ['PREZZO VENDITA', fmtN(sellingPrice(it.id))],
  ];
  doc.autoTable({ startY: y, body: sum, theme: 'plain', styles: { fontSize: 10 },
    columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'right', fontStyle: 'bold' } }, tableWidth: 90 });
  doc.save(`Distinta_${it.code || it.name}.pdf`);
  showToast('PDF esportato');
}

// ═══════════════════════════════════════════════════════════
//  VISTA: RICHIESTE DI OFFERTA (RFQ)
// ═══════════════════════════════════════════════════════════
const RFQ_STATUS = { bozza: 'Bozza', inviata: 'Inviata', chiusa: 'Chiusa' };
function getRfq(id) { return db.rfqs.find(r => r.id === id); }
function fmtDateIt(d) { return d ? new Date(d).toLocaleDateString('it-IT') : ''; }
// Codice/descrizione del fornitore per una riga, ma solo se l'articolo è legato
// allo stesso fornitore del documento (RFQ o ordine); altrimenti non è pertinente.
function lineSupInfo(supplierId, l) {
  if (!l.itemId || !supplierId) return null;
  const it = getItem(l.itemId);
  if (!it || it.supplierId !== supplierId) return null;
  if (!it.supplierCode && !it.supplierDesc) return null;
  return { code: it.supplierCode || '', desc: it.supplierDesc || '' };
}
function rfqLineSupInfo(r, l) { return lineSupInfo(r.supplierId, l); }

function renderRfq() {
  const host = document.getElementById('view-rfq');
  if (rfqView === 'edit' && getRfq(currentRfqId)) host.innerHTML = renderRfqEdit(currentRfqId);
  else if (rfqView === 'compare') host.innerHTML = renderRfqCompare();
  else { rfqView = 'list'; host.innerHTML = renderRfqList(); }
}

// Progressivo per anno: RFQ-<anno>-NNN
function nextRfqNumber() {
  const prefix = `RFQ-${new Date().getFullYear()}-`;
  const seqs = db.rfqs.filter(r => (r.number || '').startsWith(prefix))
    .map(r => parseInt((r.number || '').slice(prefix.length), 10) || 0);
  return prefix + String((seqs.length ? Math.max(...seqs) : 0) + 1).padStart(3, '0');
}

function renderRfqList() {
  const rows = db.rfqs.slice().sort((a, b) => (b.number || '').localeCompare(a.number || '')).map(r => {
    const nl = (r.lines || []).length;
    const sup = r.supplierId ? supplierName(r.supplierId) : '— nessun fornitore —';
    return `<div class="mgmt-item">
      <span class="mgmt-item-name"><span style="font-family:var(--mono)">${esc(r.number)}</span> — ${esc(r.title || '(senza titolo)')}</span>
      <span class="mgmt-item-meta">${esc(sup)} · ${RFQ_STATUS[r.status] || r.status} · ${nl} righe${r.date ? ' · ' + fmtDateIt(r.date) : ''}</span>
      <div class="mgmt-item-actions">
        <button class="mini-btn" onclick="openRfqEdit('${r.id}')" title="Modifica">✏</button>
        <button class="mini-btn" onclick="orderFromRfq('${r.id}')" title="Crea ordine da questa richiesta">🧾</button>
        <button class="mini-btn danger" onclick="delRfq('${r.id}')" title="Elimina">🗑</button>
      </div></div>`;
  }).join('') || '<div class="empty-text">Nessuna richiesta di offerta. Creane una per chiedere prezzi a un fornitore.</div>';
  return `<div class="manage-wrap">
    <div class="bom-toolbar">
      <h2 class="section-title">📨 Richieste di offerta</h2>
      <button class="add-btn-sm" onclick="newRfq()">+ Nuova richiesta</button>
      <button class="btn-outline" onclick="openRfqCompare()">📊 Confronta offerte</button>
    </div>
    <div class="mgmt-list">${rows}</div></div>`;
}

function newRfq() {
  const r = stampNew({ id: gid(), number: nextRfqNumber(), title: '', date: nowISO().slice(0, 10),
    status: 'bozza', notes: '', supplierId: null,
    transport: db.settings.transportDefault || '', payment: db.settings.paymentDefault || '',
    lines: [], active: true });
  db.rfqs.push(r); saveDB();
  currentRfqId = r.id; rfqView = 'edit'; rfqDirty = false; renderRfq();
}
function openRfqEdit(id) { currentRfqId = id; rfqView = 'edit'; rfqDirty = false; renderRfq(); }
function openRfqCompare() { rfqView = 'compare'; renderRfq(); }
function rfqBackToList() { if (rfqDirty) { saveDB(); rfqDirty = false; } rfqView = 'list'; currentRfqId = null; renderRfq(); }

// Salvataggio differito: le modifiche restano in memoria e si persistono solo con "Salva".
// Finché ci sono modifiche non salvate i pulsanti documento restano disabilitati.
function rfqMarkDirty() {
  rfqDirty = true;
  const sv = document.getElementById('rfq-save-btn'); if (sv) sv.classList.add('dirty');
  document.querySelectorAll('.rfq-export-btn').forEach(b => { b.disabled = true; b.title = 'Salva la richiesta prima di generare il documento'; });
}
function rfqSave(id) {
  const r = getRfq(id); if (!r) return;
  touch(r); saveDB(); rfqDirty = false; renderRfq(); showToast('Richiesta salvata');
}
function rfqSetField(id, field, value) {
  const r = getRfq(id); if (!r) return;
  r[field] = value || (field === 'supplierId' ? null : '');
  touch(r); rfqMarkDirty();
}
// Alla scelta del fornitore eredita le sue condizioni predefinite (se impostate)
function rfqSetSupplier(id, sid) {
  const r = getRfq(id); if (!r) return;
  r.supplierId = sid || null;
  const sup = sid ? db.suppliers.find(s => s.id === sid) : null;
  if (sup) {
    if (sup.defaultTransport) r.transport = sup.defaultTransport;
    if (sup.defaultPayment) r.payment = sup.defaultPayment;
  }
  touch(r); rfqMarkDirty(); renderRfq();
}
function rfqSetLine(id, lineId, field, value) {
  const r = getRfq(id); if (!r) return;
  const l = (r.lines || []).find(x => x.id === lineId); if (!l) return;
  l[field] = (field === 'qty' || field === 'price') ? (value === '' ? '' : (parseFloat(value) || 0)) : value;
  touch(r); rfqMarkDirty();
}
function rfqDelLine(id, lineId) { const r = getRfq(id); if (!r) return; r.lines = (r.lines || []).filter(x => x.id !== lineId); touch(r); rfqMarkDirty(); renderRfq(); }

function rfqAddManualLineModal(id) {
  openModal(`<h3>+ Riga manuale</h3>
    <div class="modal-field"><label>Descrizione</label><input id="rl-desc"></div>
    <div class="modal-field"><label>Codice (opzionale)</label><input id="rl-code"></div>
    <div class="modal-field"><label>U.M.</label><input id="rl-uom" value="pz"></div>
    <div class="modal-field"><label>Quantità</label><input id="rl-qty" type="number" value="1" min="0" step="any"></div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="rfqAddManualLine('${id}')">Aggiungi</button></div>`);
}
function rfqAddManualLine(id) {
  const r = getRfq(id); if (!r) return;
  const desc = val('rl-desc'); if (!desc) { showToast('Descrizione richiesta', 'error'); return; }
  r.lines.push({ id: gid(), itemId: null, code: val('rl-code'), description: desc, uom: val('rl-uom') || 'pz', qty: numVal('rl-qty') || 1, price: '', deliveryDate: '' });
  touch(r); rfqMarkDirty(); closeModal(); renderRfq();
}

// ─── Picker catalogo con filtri, condiviso tra RFQ e Ordini ───
let __pickOnAdd = null;
function catalogPickerModal(onAddIds) {
  __pickOnAdd = onAddIds;
  const opts = db.items.filter(i => i.active !== false).sort((a, b) => (a.code || '').localeCompare(b.code || ''))
    .map(i => `<label class="rfq-pick-row" data-type="${i.type}" data-fam="${i.familyId || ''}" data-sub="${i.subFamilyId || ''}" data-sup="${i.supplierId || ''}"><input type="checkbox" value="${i.id}">
      <span style="font-family:var(--mono)">${esc(i.code || '')}</span> ${esc(i.name)}
      <span class="rfq-pick-type">${TYPE_LABELS[i.type] || i.type}</span></label>`).join('');
  const typeOpts = ALL_TYPES.map(t => `<option value="${t}">${typeLabel(t)}</option>`).join('');
  const famOpts = (db.families || []).map(f => `<option value="${f.id}">${esc(f.name)}</option>`).join('');
  openModal(`<h3>+ Aggiungi da catalogo</h3>
    <div class="rfq-pick-filters">
      <input class="search" id="pick-search" placeholder="🔍 Codice o nome..." oninput="pickFilter()">
      <select id="pick-type" onchange="pickFilter()"><option value="">Tutti i tipi</option>${typeOpts}</select>
      <select id="pick-fam" onchange="pickFamilyChange()"><option value="">Tutte le famiglie</option>${famOpts}</select>
      <select id="pick-sub" onchange="pickFilter()"><option value="">Tutte le sottofamiglie</option></select>
      <select id="pick-sup" onchange="pickFilter()"><option value="">Tutti i fornitori</option>${db.suppliers.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>
    </div>
    <div class="rfq-pick-list" id="pick-list">${opts || '<div class="empty-text">Catalogo vuoto.</div>'}</div>
    <div class="empty-text" id="pick-empty" style="display:none">Nessun articolo con questi filtri.</div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="pickConfirm()">Aggiungi selezionati</button></div>`, true);
}
function pickFamilyChange() {
  const f = getFamily(val('pick-fam'));
  const subs = (f && f.subs) || [];
  const sel = document.getElementById('pick-sub');
  if (sel) sel.innerHTML = '<option value="">Tutte le sottofamiglie</option>' + subs.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  pickFilter();
}
function pickFilter() {
  const q = (val('pick-search') || '').toLowerCase();
  const ty = val('pick-type'), fam = val('pick-fam'), sub = val('pick-sub'), sup = val('pick-sup');
  let shown = 0;
  document.querySelectorAll('#pick-list .rfq-pick-row').forEach(el => {
    const ok = el.textContent.toLowerCase().includes(q)
      && (!ty || el.dataset.type === ty)
      && (!fam || el.dataset.fam === fam)
      && (!sub || el.dataset.sub === sub)
      && (!sup || el.dataset.sup === sup);
    el.style.display = ok ? '' : 'none';
    if (ok) shown++;
  });
  const empty = document.getElementById('pick-empty');
  if (empty) empty.style.display = shown ? 'none' : '';
}
function pickConfirm() {
  const ids = Array.from(document.querySelectorAll('#pick-list input:checked')).map(c => c.value);
  if (!ids.length) { showToast('Nessun articolo selezionato', 'error'); return; }
  const cb = __pickOnAdd; __pickOnAdd = null;
  if (cb) cb(ids);
}
function rfqAddCatalogModal(id) { catalogPickerModal(ids => rfqAddCatalogLines(id, ids)); }
function rfqAddCatalogLines(id, ids) {
  const r = getRfq(id); if (!r) return;
  ids.forEach(itemId => {
    const it = getItem(itemId); if (!it) return;
    r.lines.push({ id: gid(), itemId, code: it.code || '', description: it.name || '', uom: it.uom || 'pz', qty: 1, price: '', deliveryDate: '' });
  });
  touch(r); rfqMarkDirty(); closeModal(); renderRfq();
  showToast(ids.length + ' righe aggiunte');
}

function renderRfqEdit(id) {
  const r = getRfq(id); if (!r) { rfqView = 'list'; return renderRfqList(); }
  const lines = (r.lines || []).map((l, i) => {
    const si = rfqLineSupInfo(r, l);
    const siSub = si ? `<div class="rfq-cmp-sub">🏷 ${esc(si.code || '—')}${si.desc ? ' · ' + esc(si.desc) : ''}</div>` : '';
    return `<tr>
    <td>${i + 1}</td>
    <td style="font-family:var(--mono)">${esc(l.code || '')}</td>
    <td>${esc(l.description)}${l.itemId ? '' : ' <span class="rfq-manual-tag">manuale</span>'}${siSub}</td>
    <td>${esc(l.uom || '')}</td>
    <td><input type="number" class="rfq-qty-input" value="${l.qty}" min="0" step="any" onchange="rfqSetLine('${id}','${l.id}','qty',this.value)"></td>
    <td><input type="number" class="rfq-price-input" value="${l.price === '' || l.price == null ? '' : l.price}" min="0" step="any" placeholder="—" onchange="rfqSetLine('${id}','${l.id}','price',this.value)"></td>
    <td><input type="date" class="rfq-date-input" value="${esc(l.deliveryDate || '')}" onchange="rfqSetLine('${id}','${l.id}','deliveryDate',this.value)"></td>
    <td><button class="mini-btn danger" onclick="rfqDelLine('${id}','${l.id}')">🗑</button></td></tr>`;
  }).join('')
    || `<tr><td colspan="8" class="empty-text">Nessuna riga. Aggiungi articoli dal catalogo o manualmente.</td></tr>`;
  const co = db.settings.company || {};
  const coWarn = co.name ? '' : `<div class="rfq-warn">⚠ Dati azienda non impostati: compilali in <strong>Gestione › Dati azienda</strong> per stamparli sul documento.</div>`;
  const dis = rfqDirty ? 'disabled title="Salva la richiesta prima di generare il documento"' : '';
  return `<div class="manage-wrap">
    <div class="bom-toolbar">
      <button class="btn-outline" onclick="rfqBackToList()">← Elenco</button>
      <h2 class="section-title" style="font-family:var(--mono)">${esc(r.number)}</h2>
      <button class="add-btn-sm rfq-save-btn ${rfqDirty ? 'dirty' : ''}" id="rfq-save-btn" onclick="rfqSave('${id}')">💾 Salva</button>
    </div>
    ${coWarn}
    <div class="rfq-head">
      <div class="modal-field"><label>Titolo / oggetto</label><input value="${esc(r.title || '')}" onchange="rfqSetField('${id}','title',this.value)"></div>
      <div class="rfq-head-row">
        <div class="modal-field"><label>Fornitore</label><select onchange="rfqSetSupplier('${id}',this.value)">${supplierOptions(r.supplierId)}</select></div>
        <div class="modal-field"><label>Data</label><input type="date" value="${(r.date || '').slice(0, 10)}" onchange="rfqSetField('${id}','date',this.value)"></div>
        <div class="modal-field"><label>Stato</label><select onchange="rfqSetField('${id}','status',this.value)">
          ${Object.entries(RFQ_STATUS).map(([k, v]) => `<option value="${k}" ${r.status === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select></div>
      </div>
      <div class="rfq-head-row">
        <div class="modal-field"><label>Tipo di trasporto / resa</label>
          <input list="rfq-transport-opts" value="${esc(r.transport || '')}" placeholder="es. Porto franco, EXW, DAP…" onchange="rfqSetField('${id}','transport',this.value)">
          <datalist id="rfq-transport-opts">${(db.settings.transportOptions || []).map(o => `<option value="${esc(o)}"></option>`).join('')}</datalist></div>
        <div class="modal-field"><label>Tipo di pagamento</label>
          <input list="rfq-payment-opts" value="${esc(r.payment || '')}" placeholder="es. Bonifico 30gg, RiBa 60gg…" onchange="rfqSetField('${id}','payment',this.value)">
          <datalist id="rfq-payment-opts">${(db.settings.paymentOptions || []).map(o => `<option value="${esc(o)}"></option>`).join('')}</datalist></div>
      </div>
      <div class="modal-field"><label>Note per il fornitore</label><textarea rows="2" onchange="rfqSetField('${id}','notes',this.value)">${esc(r.notes || '')}</textarea></div>
    </div>
    <h3 class="rfq-subhead">Righe richiesta
      <span class="rfq-head-actions">
        <button class="add-btn-sm" onclick="rfqAddCatalogModal('${id}')">+ Da catalogo</button>
        <button class="btn-outline" onclick="rfqAddManualLineModal('${id}')">+ Riga manuale</button>
      </span></h3>
    <p class="empty-text" style="text-align:left;padding:0 0 8px">Prezzo unitario e data consegna si lasciano vuoti nel documento inviato e si compilano al ritorno dell'offerta.</p>
    <div class="table-wrap"><table class="rfq-table">
      <thead><tr><th>#</th><th>Codice</th><th>Descrizione</th><th>U.M.</th><th>Q.tà</th><th>Prezzo unit.</th><th>Data consegna</th><th></th></tr></thead>
      <tbody>${lines}</tbody></table></div>
    <div class="rfq-export-bar">
      <label>Documento di richiesta:</label>
      <button class="export-btn-pdf rfq-export-btn" onclick="exportRfqPDF('${id}')" ${dis}>📄 PDF</button>
      <button class="export-btn-xls rfq-export-btn" onclick="exportRfqExcel('${id}')" ${dis}>📗 Excel</button>
      ${rfqDirty ? '<span class="rfq-dirty-hint">Salva per abilitare la generazione del documento</span>' : ''}
    </div>
  </div>`;
}

function exportRfqPDF(id) {
  const r = getRfq(id); if (!r) return;
  if (!(r.lines || []).length) { showToast('Nessuna riga da esportare', 'error'); return; }
  const { jsPDF } = window.jspdf;
  const co = db.settings.company || {};
  const sup = r.supplierId ? db.suppliers.find(s => s.id === r.supplierId) : null;
  // Le colonne "codice/descrizione fornitore" compaiono solo se qualche riga è legata
  // allo stesso fornitore della richiesta; in tal caso si usa l'orientamento orizzontale.
  const hasSup = (r.lines || []).some(l => rfqLineSupInfo(r, l));
  const doc = new jsPDF(hasSup ? { orientation: 'landscape' } : undefined);
  // Documento bilingue IT / EN per fornitori esteri
  doc.setFontSize(15); doc.setTextColor(30); doc.text(`Richiesta di offerta / Request for Quotation — ${r.number}`, 14, 16);
  doc.setFontSize(9); doc.setTextColor(90);
  doc.text(`Data / Date: ${fmtDateIt(r.date) || fmtDateIt(nowISO())}`, 14, 22);
  if (r.title) doc.text(`Oggetto / Subject: ${r.title}`, 14, 27);
  const yTop = 36;
  const block = (x, title, rowsTxt) => {
    doc.setFontSize(8); doc.setTextColor(130); doc.text(title, x, yTop);
    doc.setFontSize(9); doc.setTextColor(40);
    const rows = rowsTxt.filter(Boolean);
    rows.forEach((t, i) => doc.text(String(t), x, yTop + 5 + i * 4.5));
    return rows.length;
  };
  const n1 = block(14, 'RICHIEDENTE / BUYER', [co.name, ...addressLines(co), co.vat ? 'P.IVA / VAT ' + co.vat : '', co.referente, co.email, co.phone]);
  const n2 = block(hasSup ? 160 : 110, 'FORNITORE / SUPPLIER', [sup ? sup.name : '(fornitore non selezionato / not selected)', ...(sup ? addressLines(sup) : []), sup && sup.vat ? 'P.IVA / VAT ' + sup.vat : '', sup && sup.referente, sup && sup.email, sup && sup.phone]);
  const startY = yTop + 5 + Math.max(n1, n2) * 4.5 + 4;
  const head = hasSup
    ? ['#', 'Codice\nCode', 'Descrizione\nDescription', 'Cod. forn.\nSuppl. code', 'Descr. forn.\nSuppl. desc.', 'Q.tà\nQty', 'Prezzo unit.\nUnit price', 'Data consegna\nDelivery date']
    : ['#', 'Codice\nCode', 'Descrizione\nDescription', 'Q.tà\nQty', 'Prezzo unit.\nUnit price', 'Data consegna\nDelivery date'];
  const body = (r.lines || []).map((l, i) => {
    const si = rfqLineSupInfo(r, l);
    const price = l.price === '' || l.price == null ? '' : fmtN(l.price);
    const tail = [(l.qty || 0) + ' ' + (l.uom || ''), price, fmtDateIt(l.deliveryDate)];
    return hasSup ? [i + 1, l.code || '', l.description, si ? si.code : '', si ? si.desc : '', ...tail]
      : [i + 1, l.code || '', l.description, ...tail];
  });
  doc.autoTable({ startY, head: [head], body, styles: { fontSize: 8 }, headStyles: { fillColor: [58, 123, 232] } });
  let fy = doc.lastAutoTable.finalY + 8;
  doc.setTextColor(80); doc.setFontSize(9);
  if (r.transport) { doc.text('Trasporto / Shipping: ' + r.transport, 14, fy); fy += 5; }
  if (r.payment) { doc.text('Pagamento / Payment: ' + r.payment, 14, fy); fy += 5; }
  if (r.notes) { doc.text('Note / Notes: ' + r.notes, 14, fy); }
  doc.save(`${r.number}${sup ? '_' + (sup.name || '').replace(/\s+/g, '_') : ''}.pdf`);
  showToast('PDF esportato');
}

function exportRfqExcel(id) {
  const r = getRfq(id); if (!r) return;
  if (!(r.lines || []).length) { showToast('Nessuna riga da esportare', 'error'); return; }
  const co = db.settings.company || {};
  const sup = r.supplierId ? db.suppliers.find(s => s.id === r.supplierId) : null;
  const data = [['Richiesta di offerta', r.number], ['Data', fmtDateIt(r.date)]];
  if (r.title) data.push(['Oggetto', r.title]);
  if (r.transport) data.push(['Trasporto / Shipping', r.transport]);
  if (r.payment) data.push(['Pagamento / Payment', r.payment]);
  data.push([]);
  data.push(['RICHIEDENTE', '', 'FORNITORE']);
  const coLines = [co.name || '', ...addressLines(co), co.vat ? 'P.IVA ' + co.vat : '', co.referente || '', co.email || '', co.phone || ''];
  const supLines = sup ? [sup.name, ...addressLines(sup), sup.vat ? 'P.IVA ' + sup.vat : '', sup.referente || '', sup.email || '', sup.phone || ''] : [''];
  for (let i = 0; i < Math.max(coLines.length, supLines.length); i++) data.push([coLines[i] || '', '', supLines[i] || '']);
  data.push([]);
  const hasSup = (r.lines || []).some(l => rfqLineSupInfo(r, l));
  data.push(hasSup
    ? ['#', 'Codice', 'Descrizione', 'Codice fornitore', 'Descrizione fornitore', 'Q.tà', 'U.M.', 'Prezzo unitario', 'Data consegna']
    : ['#', 'Codice', 'Descrizione', 'Q.tà', 'U.M.', 'Prezzo unitario', 'Data consegna']);
  (r.lines || []).forEach((l, i) => {
    const si = rfqLineSupInfo(r, l);
    const price = l.price === '' || l.price == null ? '' : l.price;
    data.push(hasSup
      ? [i + 1, l.code || '', l.description, si ? si.code : '', si ? si.desc : '', l.qty || 0, l.uom || '', price, fmtDateIt(l.deliveryDate)]
      : [i + 1, l.code || '', l.description, l.qty || 0, l.uom || '', price, fmtDateIt(l.deliveryDate)]);
  });
  if (r.notes) { data.push([]); data.push(['Note', r.notes]); }
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'RFQ');
  XLSX.writeFile(wb, `${r.number}${sup ? '_' + (sup.name || '').replace(/\s+/g, '_') : ''}.xlsx`);
  showToast('Excel esportato');
}

// ─── Confronto offerte tra più richieste (una per fornitore) ───
function rfqLineKey(l) { return l.itemId || ('m:' + (l.code || '') + '|' + (l.description || '')); }
function rfqToggleCompare(rid, on) {
  if (on) { if (!rfqCompareSel.includes(rid)) rfqCompareSel.push(rid); }
  else rfqCompareSel = rfqCompareSel.filter(x => x !== rid);
  renderRfq();
}
function renderRfqCompare() {
  rfqCompareSel = rfqCompareSel.filter(id => getRfq(id));
  const head = `<div class="bom-toolbar">
      <button class="btn-outline" onclick="rfqBackToList()">← Elenco</button>
      <h2 class="section-title">📊 Confronto offerte tra richieste</h2></div>`;
  const picker = db.rfqs.slice().sort((a, b) => (b.number || '').localeCompare(a.number || '')).map(r => {
    const on = rfqCompareSel.includes(r.id);
    return `<label class="rfq-sup-chk"><input type="checkbox" ${on ? 'checked' : ''} onchange="rfqToggleCompare('${r.id}',this.checked)">
      <span style="font-family:var(--mono)">${esc(r.number)}</span> ${esc(r.supplierId ? supplierName(r.supplierId) : '(nessun fornitore)')}</label>`;
  }).join('') || '<div class="empty-text">Nessuna richiesta disponibile.</div>';
  const sel = rfqCompareSel.map(id => getRfq(id)).filter(Boolean);
  let matrix;
  if (sel.length < 2) {
    matrix = '<div class="empty-text">Seleziona almeno due richieste per confrontare i prezzi articolo per articolo.</div>';
  } else {
    const keys = [], meta = {};
    sel.forEach(r => (r.lines || []).forEach(l => {
      const k = rfqLineKey(l);
      if (!(k in meta)) { keys.push(k); meta[k] = { code: l.code, description: l.description }; }
    }));
    const totals = sel.map(() => 0);
    const bodyRows = keys.map(k => {
      const cellsData = sel.map(r => {
        const l = (r.lines || []).find(x => rfqLineKey(x) === k);
        return (l && l.price !== '' && l.price != null) ? { price: Number(l.price), qty: Number(l.qty) || 0, del: l.deliveryDate } : null;
      });
      const valid = cellsData.filter(p => p && p.price > 0).map(p => p.price);
      const min = valid.length ? Math.min(...valid) : null;
      const cells = cellsData.map((p, ci) => {
        if (!p) return `<td class="rfq-cmp-cell">—</td>`;
        totals[ci] += p.price * p.qty;
        const isMin = min != null && p.price === min;
        return `<td class="rfq-cmp-cell ${isMin ? 'rfq-min' : ''}">${fmtN(p.price)}<span class="rfq-line-tot">${p.qty} pz${p.del ? ' · ' + fmtDateIt(p.del) : ''}</span></td>`;
      }).join('');
      const m = meta[k];
      return `<tr><td>${esc(m.description || '')}<div class="rfq-cmp-sub">${esc(m.code || '')}</div></td>${cells}</tr>`;
    }).join('');
    const posTotals = totals.filter(t => t > 0);
    const minTot = posTotals.length ? Math.min(...posTotals) : null;
    const totalRow = `<tr class="rfq-cmp-total"><td>Totale offerta</td>${totals.map(t => `<td class="${minTot != null && t === minTot ? 'rfq-min' : ''}">${fmtN(t)}</td>`).join('')}</tr>`;
    const header = `<tr><th>Articolo</th>${sel.map(r => `<th>${esc(r.supplierId ? supplierName(r.supplierId) : r.number)}<div class="rfq-cmp-sub">${esc(r.number)}</div></th>`).join('')}</tr>`;
    matrix = `<div class="table-wrap"><table class="rfq-table rfq-cmp-table">
      <thead>${header}</thead><tbody>${bodyRows}${totalRow}</tbody></table></div>
      <p class="empty-text" style="text-align:left">Prezzo minimo per riga e totale offerta più basso evidenziati in verde. I totali usano la quantità indicata in ciascuna richiesta.</p>`;
  }
  return `<div class="manage-wrap">${head}
    <h3 class="rfq-subhead">Richieste da confrontare</h3>
    <div class="rfq-sup-grid">${picker}</div>
    <h3 class="rfq-subhead">Confronto prezzi</h3>
    ${matrix}
  </div>`;
}

function delRfq(id) {
  const r = getRfq(id); if (!r) return;
  if (!confirm(`Eliminare la richiesta ${r.number}?`)) return;
  db.rfqs = db.rfqs.filter(x => x.id !== id);
  rfqCompareSel = rfqCompareSel.filter(x => x !== id);
  saveDB();
  if (currentRfqId === id) { currentRfqId = null; rfqView = 'list'; }
  renderRfq(); showToast('Richiesta eliminata');
}

// ═══════════════════════════════════════════════════════════
//  VISTA: ORDINI A FORNITORE (ODA)
// ═══════════════════════════════════════════════════════════
const ORDER_STATUS = { bozza: 'Bozza', inviato: 'Inviato', confermato: 'Confermato', parziale: 'Parziale', evaso: 'Evaso', annullato: 'Annullato' };
function getOrder(id) { return db.orders.find(o => o.id === id); }
function fmtQty(n) { n = Number(n) || 0; return Number.isInteger(n) ? String(n) : String(+n.toFixed(3)); }
function orderTotal(o) { return (o.lines || []).reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.price) || 0), 0); }
function orderReception(o) {
  let ordered = 0, received = 0;
  (o.lines || []).forEach(l => { ordered += Number(l.qty) || 0; received += Number(l.received) || 0; });
  return { ordered, received, residual: ordered - received };
}
function nextOrderNumber() {
  const prefix = `ODA-${new Date().getFullYear()}-`;
  const seqs = db.orders.filter(o => (o.number || '').startsWith(prefix)).map(o => parseInt((o.number || '').slice(prefix.length), 10) || 0);
  return prefix + String((seqs.length ? Math.max(...seqs) : 0) + 1).padStart(3, '0');
}

function renderOrders() {
  const host = document.getElementById('view-orders');
  if (orderView === 'edit' && getOrder(currentOrderId)) host.innerHTML = renderOrderEdit(currentOrderId);
  else { orderView = 'list'; host.innerHTML = renderOrderList(); }
}

function renderOrderList() {
  const rows = db.orders.slice().sort((a, b) => (b.number || '').localeCompare(a.number || '')).map(o => {
    const sup = o.supplierId ? supplierName(o.supplierId) : '— nessun fornitore —';
    const rec = orderReception(o);
    const recTxt = rec.ordered ? `ric. ${fmtQty(rec.received)}/${fmtQty(rec.ordered)}` : '';
    return `<div class="mgmt-item">
      <span class="mgmt-item-name"><span style="font-family:var(--mono)">${esc(o.number)}</span> — ${esc(o.title || '(senza titolo)')}</span>
      <span class="mgmt-item-meta">${esc(sup)} · ${ORDER_STATUS[o.status] || o.status} · ${fmtN(orderTotal(o))}${recTxt ? ' · ' + recTxt : ''}${o.date ? ' · ' + fmtDateIt(o.date) : ''}</span>
      <div class="mgmt-item-actions">
        <button class="mini-btn" onclick="openOrderEdit('${o.id}')" title="Modifica">✏</button>
        <button class="mini-btn danger" onclick="delOrder('${o.id}')" title="Elimina">🗑</button>
      </div></div>`;
  }).join('') || '<div class="empty-text">Nessun ordine. Creane uno o generane uno da una richiesta di offerta.</div>';
  return `<div class="manage-wrap">
    <div class="bom-toolbar">
      <h2 class="section-title">🧾 Ordini a fornitore</h2>
      <button class="add-btn-sm" onclick="newOrder()">+ Nuovo ordine</button>
    </div>
    <div class="mgmt-list">${rows}</div></div>`;
}

function newOrder() {
  const o = stampNew({ id: gid(), number: nextOrderNumber(), title: '', date: nowISO().slice(0, 10),
    status: 'bozza', supplierId: null, transport: db.settings.transportDefault || '', payment: db.settings.paymentDefault || '',
    requestedDelivery: '', rfqId: null, supplierConfirmation: '', notes: '', lines: [], active: true });
  db.orders.push(o); saveDB();
  currentOrderId = o.id; orderView = 'edit'; orderDirty = false; renderOrders();
}
function orderFromRfq(rfqId) {
  const r = getRfq(rfqId); if (!r) return;
  const sup = r.supplierId ? db.suppliers.find(s => s.id === r.supplierId) : null;
  const o = stampNew({ id: gid(), number: nextOrderNumber(),
    title: r.title || ('Da ' + r.number), date: nowISO().slice(0, 10), status: 'bozza',
    supplierId: r.supplierId || null,
    transport: r.transport || (sup && sup.defaultTransport) || db.settings.transportDefault || '',
    payment: r.payment || (sup && sup.defaultPayment) || db.settings.paymentDefault || '',
    requestedDelivery: '', rfqId: r.id, supplierConfirmation: '', notes: r.notes || '',
    lines: (r.lines || []).map(l => ({ id: gid(), itemId: l.itemId || null, code: l.code || '', description: l.description || '',
      uom: l.uom || 'pz', qty: Number(l.qty) || 0, price: (l.price === '' || l.price == null) ? '' : Number(l.price),
      deliveryDate: l.deliveryDate || '', received: 0 })),
    active: true });
  db.orders.push(o); saveDB();
  currentOrderId = o.id; orderView = 'edit'; orderDirty = false;
  setView('orders');
  showToast('Ordine ' + o.number + ' creato dalla richiesta');
}
function openOrderEdit(id) { currentOrderId = id; orderView = 'edit'; orderDirty = false; renderOrders(); }
function orderBackToList() { if (orderDirty) { saveDB(); orderDirty = false; } orderView = 'list'; currentOrderId = null; renderOrders(); }
function orderMarkDirty() {
  orderDirty = true;
  const sv = document.getElementById('order-save-btn'); if (sv) sv.classList.add('dirty');
  document.querySelectorAll('.order-export-btn').forEach(b => { b.disabled = true; b.title = "Salva l'ordine prima di generare il documento"; });
}
function ordSave(id) { const o = getOrder(id); if (!o) return; touch(o); saveDB(); orderDirty = false; renderOrders(); showToast('Ordine salvato'); }

function ordSetField(id, field, value) { const o = getOrder(id); if (!o) return; o[field] = value || (field === 'supplierId' ? null : ''); touch(o); orderMarkDirty(); }
function ordSetSupplier(id, sid) {
  const o = getOrder(id); if (!o) return;
  o.supplierId = sid || null;
  const sup = sid ? db.suppliers.find(s => s.id === sid) : null;
  if (sup) { if (sup.defaultTransport) o.transport = sup.defaultTransport; if (sup.defaultPayment) o.payment = sup.defaultPayment; }
  touch(o); orderMarkDirty(); renderOrders();
}
function ordSetLine(id, lineId, field, value) {
  const o = getOrder(id); if (!o) return;
  const l = (o.lines || []).find(x => x.id === lineId); if (!l) return;
  if (field === 'qty' || field === 'price' || field === 'received') l[field] = (value === '' ? (field === 'received' ? 0 : '') : (parseFloat(value) || 0));
  else l[field] = value;
  touch(o); orderMarkDirty();
}
function ordDelLine(id, lineId) { const o = getOrder(id); if (!o) return; o.lines = (o.lines || []).filter(x => x.id !== lineId); touch(o); orderMarkDirty(); renderOrders(); }
function ordMarkAllReceived(id) { const o = getOrder(id); if (!o) return; (o.lines || []).forEach(l => { l.received = Number(l.qty) || 0; }); touch(o); orderMarkDirty(); renderOrders(); }

function ordAddManualLineModal(id) {
  openModal(`<h3>+ Riga manuale</h3>
    <div class="modal-field"><label>Descrizione</label><input id="ol-desc"></div>
    <div class="modal-field"><label>Codice (opzionale)</label><input id="ol-code"></div>
    <div class="modal-field"><label>U.M.</label><input id="ol-uom" value="pz"></div>
    <div class="modal-field"><label>Quantità</label><input id="ol-qty" type="number" value="1" min="0" step="any"></div>
    <div class="modal-field"><label>Prezzo unitario</label><input id="ol-price" type="number" min="0" step="any"></div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="ordAddManualLine('${id}')">Aggiungi</button></div>`);
}
function ordAddManualLine(id) {
  const o = getOrder(id); if (!o) return;
  const desc = val('ol-desc'); if (!desc) { showToast('Descrizione richiesta', 'error'); return; }
  o.lines.push({ id: gid(), itemId: null, code: val('ol-code'), description: desc, uom: val('ol-uom') || 'pz',
    qty: numVal('ol-qty') || 1, price: (val('ol-price') === '' ? '' : numVal('ol-price')), deliveryDate: '', received: 0 });
  touch(o); orderMarkDirty(); closeModal(); renderOrders();
}
function ordAddCatalogModal(id) { catalogPickerModal(ids => ordAddCatalogLines(id, ids)); }
function ordAddCatalogLines(id, ids) {
  const o = getOrder(id); if (!o) return;
  ids.forEach(itemId => {
    const it = getItem(itemId); if (!it) return;
    const price = (it.type === 'acquistato' && it.purchasePrice != null) ? Number(it.purchasePrice)
      : (it.type === 'materiale' && it.unitCost != null) ? Number(it.unitCost) : '';
    o.lines.push({ id: gid(), itemId, code: it.code || '', description: it.name || '', uom: it.uom || 'pz', qty: 1, price, deliveryDate: '', received: 0 });
  });
  touch(o); orderMarkDirty(); closeModal(); renderOrders();
  showToast(ids.length + ' righe aggiunte');
}

function renderOrderEdit(id) {
  const o = getOrder(id); if (!o) { orderView = 'list'; return renderOrderList(); }
  const lines = (o.lines || []).map((l, i) => {
    const si = lineSupInfo(o.supplierId, l);
    const siSub = si ? `<div class="rfq-cmp-sub">🏷 ${esc(si.code || '—')}${si.desc ? ' · ' + esc(si.desc) : ''}</div>` : '';
    const qty = Number(l.qty) || 0, price = (l.price === '' || l.price == null) ? null : Number(l.price);
    const amount = price != null ? qty * price : null;
    const rec = Number(l.received) || 0, residual = qty - rec;
    return `<tr>
      <td>${i + 1}</td>
      <td style="font-family:var(--mono)">${esc(l.code || '')}</td>
      <td>${esc(l.description)}${l.itemId ? '' : ' <span class="rfq-manual-tag">manuale</span>'}${siSub}</td>
      <td>${esc(l.uom || '')}</td>
      <td><input type="number" class="rfq-qty-input" value="${l.qty}" min="0" step="any" onchange="ordSetLine('${id}','${l.id}','qty',this.value)"></td>
      <td><input type="number" class="rfq-price-input" value="${price != null ? price : ''}" min="0" step="any" placeholder="—" onchange="ordSetLine('${id}','${l.id}','price',this.value)"></td>
      <td class="ord-amount">${amount != null ? fmtN(amount) : '—'}</td>
      <td><input type="date" class="rfq-date-input" value="${esc(l.deliveryDate || '')}" onchange="ordSetLine('${id}','${l.id}','deliveryDate',this.value)"></td>
      <td><input type="number" class="rfq-qty-input" value="${rec}" min="0" step="any" onchange="ordSetLine('${id}','${l.id}','received',this.value)"></td>
      <td class="ord-residual ${residual > 0 ? 'pos' : ''}">${fmtQty(residual)}</td>
      <td><button class="mini-btn danger" onclick="ordDelLine('${id}','${l.id}')">🗑</button></td></tr>`;
  }).join('') || `<tr><td colspan="11" class="empty-text">Nessuna riga. Aggiungi articoli dal catalogo o manualmente.</td></tr>`;
  const total = orderTotal(o);
  const co = db.settings.company || {};
  const coWarn = co.name ? '' : `<div class="rfq-warn">⚠ Dati azienda non impostati: compilali in <strong>Gestione › Dati azienda</strong> per stamparli sul documento.</div>`;
  const rfqRef = (o.rfqId && getRfq(o.rfqId)) ? `<div class="ord-ref">📨 Generato dalla richiesta <strong>${esc(getRfq(o.rfqId).number)}</strong></div>` : '';
  const dis = orderDirty ? 'disabled title="Salva l\'ordine prima di generare il documento"' : '';
  return `<div class="manage-wrap">
    <div class="bom-toolbar">
      <button class="btn-outline" onclick="orderBackToList()">← Elenco</button>
      <h2 class="section-title" style="font-family:var(--mono)">${esc(o.number)}</h2>
      <button class="add-btn-sm rfq-save-btn ${orderDirty ? 'dirty' : ''}" id="order-save-btn" onclick="ordSave('${id}')">💾 Salva</button>
    </div>
    ${coWarn}${rfqRef}
    <div class="rfq-head">
      <div class="modal-field"><label>Titolo / oggetto</label><input value="${esc(o.title || '')}" onchange="ordSetField('${id}','title',this.value)"></div>
      <div class="rfq-head-row">
        <div class="modal-field"><label>Fornitore</label><select onchange="ordSetSupplier('${id}',this.value)">${supplierOptions(o.supplierId)}</select></div>
        <div class="modal-field"><label>Data ordine</label><input type="date" value="${(o.date || '').slice(0, 10)}" onchange="ordSetField('${id}','date',this.value)"></div>
        <div class="modal-field"><label>Stato</label><select onchange="ordSetField('${id}','status',this.value)">
          ${Object.entries(ORDER_STATUS).map(([k, v]) => `<option value="${k}" ${o.status === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select></div>
      </div>
      <div class="rfq-head-row">
        <div class="modal-field"><label>Tipo di trasporto / resa</label>
          <input list="ord-transport-opts" value="${esc(o.transport || '')}" placeholder="es. Porto franco, EXW…" onchange="ordSetField('${id}','transport',this.value)">
          <datalist id="ord-transport-opts">${(db.settings.transportOptions || []).map(x => `<option value="${esc(x)}"></option>`).join('')}</datalist></div>
        <div class="modal-field"><label>Tipo di pagamento</label>
          <input list="ord-payment-opts" value="${esc(o.payment || '')}" placeholder="es. Bonifico 60gg…" onchange="ordSetField('${id}','payment',this.value)">
          <datalist id="ord-payment-opts">${(db.settings.paymentOptions || []).map(x => `<option value="${esc(x)}"></option>`).join('')}</datalist></div>
      </div>
      <div class="rfq-head-row">
        <div class="modal-field"><label>Consegna richiesta</label><input type="date" value="${esc(o.requestedDelivery || '')}" onchange="ordSetField('${id}','requestedDelivery',this.value)"></div>
        <div class="modal-field"><label>N° conferma d'ordine fornitore</label><input value="${esc(o.supplierConfirmation || '')}" onchange="ordSetField('${id}','supplierConfirmation',this.value)"></div>
      </div>
      <div class="modal-field"><label>Note</label><textarea rows="2" onchange="ordSetField('${id}','notes',this.value)">${esc(o.notes || '')}</textarea></div>
    </div>
    <h3 class="rfq-subhead">Righe ordine
      <span class="rfq-head-actions">
        <button class="add-btn-sm" onclick="ordAddCatalogModal('${id}')">+ Da catalogo</button>
        <button class="btn-outline" onclick="ordAddManualLineModal('${id}')">+ Riga manuale</button>
        <button class="btn-outline" onclick="ordMarkAllReceived('${id}')">✓ Segna tutto ricevuto</button>
      </span></h3>
    <div class="table-wrap"><table class="rfq-table">
      <thead><tr><th>#</th><th>Codice</th><th>Descrizione</th><th>U.M.</th><th>Q.tà</th><th>Prezzo unit.</th><th>Importo</th><th>Consegna</th><th>Ricevuto</th><th>Residuo</th><th></th></tr></thead>
      <tbody>${lines}</tbody>
      <tfoot><tr class="rfq-cmp-total"><td colspan="6" style="text-align:right">Totale imponibile</td><td>${fmtN(total)}</td><td colspan="4"></td></tr></tfoot>
    </table></div>
    <div class="rfq-export-bar">
      <label>Documento d'ordine:</label>
      <button class="export-btn-pdf order-export-btn" onclick="exportOrderPDF('${id}')" ${dis}>📄 PDF</button>
      <button class="export-btn-xls order-export-btn" onclick="exportOrderExcel('${id}')" ${dis}>📗 Excel</button>
      ${orderDirty ? '<span class="rfq-dirty-hint">Salva per abilitare la generazione del documento</span>' : ''}
    </div>
  </div>`;
}

function exportOrderPDF(id) {
  const o = getOrder(id); if (!o) return;
  if (!(o.lines || []).length) { showToast('Nessuna riga da esportare', 'error'); return; }
  const { jsPDF } = window.jspdf;
  const co = db.settings.company || {};
  const sup = o.supplierId ? db.suppliers.find(s => s.id === o.supplierId) : null;
  const hasSup = (o.lines || []).some(l => lineSupInfo(o.supplierId, l));
  const doc = new jsPDF({ orientation: 'landscape' });
  doc.setFontSize(15); doc.setTextColor(30); doc.text(`Ordine di acquisto / Purchase Order — ${o.number}`, 14, 16);
  doc.setFontSize(9); doc.setTextColor(90);
  doc.text(`Data / Date: ${fmtDateIt(o.date) || fmtDateIt(nowISO())}`, 14, 22);
  if (o.title) doc.text(`Oggetto / Subject: ${o.title}`, 14, 27);
  const yTop = 36;
  const block = (x, title, rowsTxt) => {
    doc.setFontSize(8); doc.setTextColor(130); doc.text(title, x, yTop);
    doc.setFontSize(9); doc.setTextColor(40);
    const rows = rowsTxt.filter(Boolean);
    rows.forEach((t, i) => doc.text(String(t), x, yTop + 5 + i * 4.5));
    return rows.length;
  };
  const n1 = block(14, 'RICHIEDENTE / BUYER', [co.name, ...addressLines(co), co.vat ? 'P.IVA / VAT ' + co.vat : '', co.referente, co.email, co.phone]);
  const n2 = block(160, 'FORNITORE / SUPPLIER', [sup ? sup.name : '(fornitore non selezionato / not selected)', ...(sup ? addressLines(sup) : []), sup && sup.vat ? 'P.IVA / VAT ' + sup.vat : '', sup && sup.referente, sup && sup.email, sup && sup.phone]);
  const startY = yTop + 5 + Math.max(n1, n2) * 4.5 + 4;
  const head = hasSup
    ? ['#', 'Codice\nCode', 'Descrizione\nDescription', 'Cod. forn.\nSuppl. code', 'Descr. forn.\nSuppl. desc.', 'Q.tà\nQty', 'Prezzo unit.\nUnit price', 'Importo\nAmount', 'Data consegna\nDelivery date']
    : ['#', 'Codice\nCode', 'Descrizione\nDescription', 'Q.tà\nQty', 'Prezzo unit.\nUnit price', 'Importo\nAmount', 'Data consegna\nDelivery date'];
  const body = (o.lines || []).map((l, i) => {
    const si = lineSupInfo(o.supplierId, l);
    const qty = Number(l.qty) || 0, price = (l.price === '' || l.price == null) ? null : Number(l.price);
    const tail = [qty + ' ' + (l.uom || ''), price != null ? fmtN(price) : '', price != null ? fmtN(qty * price) : '', fmtDateIt(l.deliveryDate)];
    return hasSup ? [i + 1, l.code || '', l.description, si ? si.code : '', si ? si.desc : '', ...tail] : [i + 1, l.code || '', l.description, ...tail];
  });
  const totLabel = { content: 'Totale / Total', styles: { halign: 'right', fontStyle: 'bold' } };
  const totVal = { content: fmtN(orderTotal(o)), styles: { fontStyle: 'bold' } };
  const foot = hasSup ? [['', '', '', '', '', '', totLabel, totVal, '']] : [['', '', '', '', totLabel, totVal, '']];
  doc.autoTable({ startY, head: [head], body, foot, styles: { fontSize: 8 }, headStyles: { fillColor: [58, 123, 232] }, footStyles: { fillColor: [235, 238, 245], textColor: 20 } });
  let fy = doc.lastAutoTable.finalY + 8;
  doc.setTextColor(80); doc.setFontSize(9);
  if (o.transport) { doc.text('Trasporto / Shipping: ' + o.transport, 14, fy); fy += 5; }
  if (o.payment) { doc.text('Pagamento / Payment: ' + o.payment, 14, fy); fy += 5; }
  if (o.requestedDelivery) { doc.text('Consegna richiesta / Requested delivery: ' + fmtDateIt(o.requestedDelivery), 14, fy); fy += 5; }
  if (o.supplierConfirmation) { doc.text('Conferma fornitore / Order confirmation: ' + o.supplierConfirmation, 14, fy); fy += 5; }
  if (o.notes) { doc.text('Note / Notes: ' + o.notes, 14, fy); }
  doc.save(`${o.number}${sup ? '_' + (sup.name || '').replace(/\s+/g, '_') : ''}.pdf`);
  showToast('PDF esportato');
}

function exportOrderExcel(id) {
  const o = getOrder(id); if (!o) return;
  if (!(o.lines || []).length) { showToast('Nessuna riga da esportare', 'error'); return; }
  const co = db.settings.company || {};
  const sup = o.supplierId ? db.suppliers.find(s => s.id === o.supplierId) : null;
  const data = [['Ordine di acquisto / Purchase Order', o.number], ['Data', fmtDateIt(o.date)]];
  if (o.title) data.push(['Oggetto', o.title]);
  if (o.rfqId && getRfq(o.rfqId)) data.push(['Da richiesta', getRfq(o.rfqId).number]);
  if (o.transport) data.push(['Trasporto / Shipping', o.transport]);
  if (o.payment) data.push(['Pagamento / Payment', o.payment]);
  if (o.requestedDelivery) data.push(['Consegna richiesta / Requested delivery', fmtDateIt(o.requestedDelivery)]);
  if (o.supplierConfirmation) data.push(['Conferma fornitore / Order confirmation', o.supplierConfirmation]);
  data.push([]);
  data.push(['RICHIEDENTE', '', 'FORNITORE']);
  const coLines = [co.name || '', ...addressLines(co), co.vat ? 'P.IVA ' + co.vat : '', co.referente || '', co.email || '', co.phone || ''];
  const supLines = sup ? [sup.name, ...addressLines(sup), sup.vat ? 'P.IVA ' + sup.vat : '', sup.referente || '', sup.email || '', sup.phone || ''] : [''];
  for (let i = 0; i < Math.max(coLines.length, supLines.length); i++) data.push([coLines[i] || '', '', supLines[i] || '']);
  data.push([]);
  const hasSup = (o.lines || []).some(l => lineSupInfo(o.supplierId, l));
  data.push(hasSup
    ? ['#', 'Codice', 'Descrizione', 'Codice fornitore', 'Descrizione fornitore', 'Q.tà', 'U.M.', 'Prezzo unitario', 'Importo', 'Consegna', 'Ricevuto', 'Residuo']
    : ['#', 'Codice', 'Descrizione', 'Q.tà', 'U.M.', 'Prezzo unitario', 'Importo', 'Consegna', 'Ricevuto', 'Residuo']);
  (o.lines || []).forEach((l, i) => {
    const si = lineSupInfo(o.supplierId, l);
    const qty = Number(l.qty) || 0, price = (l.price === '' || l.price == null) ? '' : Number(l.price);
    const amount = price === '' ? '' : qty * price;
    const rec = Number(l.received) || 0;
    const supCols = hasSup ? [si ? si.code : '', si ? si.desc : ''] : [];
    data.push([i + 1, l.code || '', l.description, ...supCols, qty, l.uom || '', price, amount, fmtDateIt(l.deliveryDate), rec, qty - rec]);
  });
  data.push([]);
  data.push(['', 'TOTALE IMPONIBILE / TOTAL', orderTotal(o)]);
  if (o.notes) { data.push([]); data.push(['Note', o.notes]); }
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Ordine');
  XLSX.writeFile(wb, `${o.number}${sup ? '_' + (sup.name || '').replace(/\s+/g, '_') : ''}.xlsx`);
  showToast('Excel esportato');
}

function delOrder(id) {
  const o = getOrder(id); if (!o) return;
  if (!confirm(`Eliminare l'ordine ${o.number}?`)) return;
  db.orders = db.orders.filter(x => x.id !== id); saveDB();
  if (currentOrderId === id) { currentOrderId = null; orderView = 'list'; }
  renderOrders(); showToast('Ordine eliminato');
}

// ═══════════════════════════════════════════════════════════
//  VISTA: GESTIONE
// ═══════════════════════════════════════════════════════════
const MGMT_TABS = [
  { id: 'company', label: '🏢 Dati azienda' },
  { id: 'suppliers', label: '🏭 Fornitori' },
  { id: 'terms', label: '🚚 Condizioni offerta' },
  { id: 'fam-acquistato', label: '🛒 Famiglie commerciali' },
  { id: 'fam-materiale', label: '🧱 Famiglie materie prime' },
  { id: 'fam-parte', label: '⚙️ Famiglie parti' },
  { id: 'workcenters', label: '🔧 Centri di lavoro' },
  { id: 'settings', label: '📐 Impostazioni' },
  { id: 'import', label: '⬆ Import' },
  { id: 'backup', label: '💾 Backup' },
];
function renderManage() {
  document.getElementById('mgmt-tabs').innerHTML = MGMT_TABS.map(t =>
    `<button class="mgmt-tab ${mgmtTab === t.id ? 'active' : ''}" onclick="setMgmtTab('${t.id}')">${t.label}</button>`).join('');
  const c = document.getElementById('mgmt-content');
  if (mgmtTab === 'company') c.innerHTML = renderCompany();
  else if (mgmtTab === 'terms') c.innerHTML = renderTerms();
  else if (mgmtTab === 'suppliers') c.innerHTML = renderSuppliers();
  else if (mgmtTab === 'fam-acquistato') c.innerHTML = renderFamilies('acquistato');
  else if (mgmtTab === 'fam-materiale') c.innerHTML = renderFamilies('materiale');
  else if (mgmtTab === 'fam-parte') c.innerHTML = renderFamilies('parte');
  else if (mgmtTab === 'workcenters') c.innerHTML = renderWorkCenters();
  else if (mgmtTab === 'settings') c.innerHTML = renderSettings();
  else if (mgmtTab === 'import') c.innerHTML = renderImport();
  else if (mgmtTab === 'backup') c.innerHTML = renderBackup();
}
function setMgmtTab(t) { mgmtTab = t; renderManage(); }

function renderTerms() {
  const s = db.settings;
  const sect = (kind, title, def) => {
    const arr = s[kind + 'Options'] || [];
    const list = arr.map((o, i) => `<div class="mgmt-item">
      <span class="mgmt-item-name">${esc(o)}${o === def ? ' <span class="terms-default">predefinito</span>' : ''}</span>
      <div class="mgmt-item-actions">
        <button class="mini-btn" onclick="termsSetDefault('${kind}',${i})" title="Imposta/rimuovi predefinito">${o === def ? '★' : '☆'}</button>
        <button class="mini-btn danger" onclick="termsDel('${kind}',${i})">🗑</button>
      </div></div>`).join('') || '<div class="empty-text">Nessuna voce.</div>';
    return `<h3 class="settings-group-title">${title}</h3>
      <div class="mgmt-list">${list}</div>
      <div class="mgmt-form"><input id="terms-${kind}-new" placeholder="Nuova voce"><button class="add-btn-sm" onclick="termsAdd('${kind}')">+ Aggiungi</button></div>`;
  };
  return `<div class="mgmt-panel">
    <p class="empty-text" style="text-align:left;padding:4px 0 12px">Gestisci le voci selezionabili per Trasporto e Pagamento nelle richieste di offerta. La voce con ★ precompila automaticamente le nuove richieste.</p>
    ${sect('transport', '🚚 Tipi di trasporto / resa', s.transportDefault)}
    ${sect('payment', '💳 Tipi di pagamento', s.paymentDefault)}</div>`;
}
function termsAdd(kind) {
  const v = val('terms-' + kind + '-new'); if (!v) { showToast('Valore richiesto', 'error'); return; }
  const key = kind + 'Options';
  db.settings[key] = db.settings[key] || [];
  if (db.settings[key].includes(v)) { showToast('Voce già presente', 'error'); return; }
  db.settings[key].push(v);
  saveDB(); renderManage(); showToast('Aggiunto');
}
function termsDel(kind, i) {
  const key = kind + 'Options', arr = db.settings[key] || [];
  const v = arr[i]; if (v == null) return;
  db.settings[key] = arr.filter((_, idx) => idx !== i);
  if (db.settings[kind + 'Default'] === v) db.settings[kind + 'Default'] = '';
  saveDB(); renderManage(); showToast('Eliminato');
}
function termsSetDefault(kind, i) {
  const arr = db.settings[kind + 'Options'] || [];
  const v = arr[i]; if (v == null) return;
  db.settings[kind + 'Default'] = (db.settings[kind + 'Default'] === v) ? '' : v;
  saveDB(); renderManage();
}

function renderCompany() {
  const co = db.settings.company || {};
  return `<div class="mgmt-panel">
    <h3 class="settings-group-title">🏢 Dati azienda (richiedente)</h3>
    <p class="empty-text" style="text-align:left;padding:4px 0 12px">Questi dati identificano la tua azienda e vengono stampati come intestazione del richiedente sui documenti di richiesta di offerta.</p>
    <div class="modal-grid">
      <div class="modal-field"><label>Ragione sociale</label><input id="co-name" value="${esc(co.name || '')}"></div>
      <div class="modal-field"><label>Referente</label><input id="co-ref" value="${esc(co.referente || '')}"></div>
      <div class="modal-field"><label>Email</label><input id="co-email" value="${esc(co.email || '')}"></div>
      <div class="modal-field"><label>Telefono</label><input id="co-phone" value="${esc(co.phone || '')}"></div>
      <div class="modal-field"><label>P.IVA / C.F.</label><input id="co-vat" value="${esc(co.vat || '')}"></div>
      ${addressFieldsHtml('co', co)}
    </div>
    <button class="add-btn-sm" onclick="saveCompany()">Salva dati azienda</button></div>`;
}
function saveCompany() {
  db.settings.company = Object.assign({
    name: val('co-name'), referente: val('co-ref'), email: val('co-email'),
    phone: val('co-phone'), vat: val('co-vat'),
  }, readAddressFields('co'));
  saveDB(); renderManage(); showToast('Dati azienda salvati');
}

function renderSuppliers() {
  const list = db.suppliers.map(s => {
    const loc = [s.city, s.province ? '(' + s.province + ')' : ''].filter(Boolean).join(' ');
    return `<div class="mgmt-item">
    <span class="mgmt-item-name">${esc(s.name)}</span>
    <span class="mgmt-item-meta">${esc(s.referente || '')} ${s.email ? '· ' + esc(s.email) : ''} ${s.phone ? '· ' + esc(s.phone) : ''} ${loc ? '· ' + esc(loc) : ''}</span>
    <div class="mgmt-item-actions">
      <button class="mini-btn" onclick="editSupplierModal('${s.id}')">✏</button>
      <button class="mini-btn danger" onclick="delSupplier('${s.id}')">🗑</button></div></div>`;
  }).join('') || '<div class="empty-text">Nessun fornitore.</div>';
  return `<div class="mgmt-panel"><div class="mgmt-list">${list}</div>
    <div class="mgmt-form">
      <input id="sup-name" placeholder="Nome fornitore">
      <input id="sup-ref" placeholder="Referente">
      <input id="sup-email" placeholder="Email">
      <input id="sup-phone" placeholder="Telefono">
      <button class="add-btn-sm" onclick="addSupplier()">+ Aggiungi</button></div>
    <p class="empty-text" style="text-align:left;padding:6px 0 0">Indirizzo completo e P.IVA si inseriscono con ✏ Modifica.</p></div>`;
}
function addSupplier() {
  const n = val('sup-name'); if (!n) { showToast('Nome richiesto', 'error'); return; }
  db.suppliers.push(stampNew({ id: gid(), name: n, referente: val('sup-ref'), email: val('sup-email'),
    phone: val('sup-phone'), vat: '', street: '', streetNumber: '', zip: '', city: '', province: '', country: '',
    defaultTransport: '', defaultPayment: '', active: true }));
  saveDB(); renderManage(); showToast('Fornitore aggiunto');
}
function addressFieldsHtml(pfx, o) {
  o = o || {};
  return `<div class="modal-field" style="grid-column:1/-1"><label>Via / indirizzo</label><input id="${pfx}-street" value="${esc(o.street || '')}"></div>
    <div class="modal-field"><label>Numero civico</label><input id="${pfx}-num" value="${esc(o.streetNumber || '')}"></div>
    <div class="modal-field"><label>CAP</label><input id="${pfx}-zip" value="${esc(o.zip || '')}"></div>
    <div class="modal-field"><label>Città</label><input id="${pfx}-city" value="${esc(o.city || '')}"></div>
    <div class="modal-field"><label>Provincia</label><input id="${pfx}-prov" value="${esc(o.province || '')}" maxlength="4" placeholder="es. MO"></div>
    <div class="modal-field"><label>Stato</label><input id="${pfx}-country" value="${esc(o.country || '')}" placeholder="es. Italia"></div>`;
}
function readAddressFields(pfx) {
  return { street: val(pfx + '-street'), streetNumber: val(pfx + '-num'), zip: val(pfx + '-zip'),
    city: val(pfx + '-city'), province: val(pfx + '-prov').toUpperCase(), country: val(pfx + '-country') };
}
function editSupplierModal(id) {
  const s = db.suppliers.find(x => x.id === id); if (!s) return;
  openModal(`<h3>✏ Modifica fornitore</h3>
    <div class="modal-grid">
      <div class="modal-field"><label>Nome</label><input id="es-name" value="${esc(s.name)}"></div>
      <div class="modal-field"><label>Referente</label><input id="es-ref" value="${esc(s.referente || '')}"></div>
      <div class="modal-field"><label>Email</label><input id="es-email" value="${esc(s.email || '')}"></div>
      <div class="modal-field"><label>Telefono</label><input id="es-phone" value="${esc(s.phone || '')}"></div>
      <div class="modal-field"><label>P.IVA / C.F.</label><input id="es-vat" value="${esc(s.vat || '')}"></div>
      <div class="modal-field"><label>Pagamento predefinito</label>
        <input id="es-dpayment" list="sup-payment-opts" value="${esc(s.defaultPayment || '')}" placeholder="es. Bonifico 30gg">
        <datalist id="sup-payment-opts">${(db.settings.paymentOptions || []).map(o => `<option value="${esc(o)}"></option>`).join('')}</datalist></div>
      <div class="modal-field"><label>Trasporto predefinito</label>
        <input id="es-dtransport" list="sup-transport-opts" value="${esc(s.defaultTransport || '')}" placeholder="es. Porto franco">
        <datalist id="sup-transport-opts">${(db.settings.transportOptions || []).map(o => `<option value="${esc(o)}"></option>`).join('')}</datalist></div>
      ${addressFieldsHtml('es', s)}
    </div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="saveSupplier('${id}')">Salva</button></div>`, true);
}
function saveSupplier(id) {
  const s = db.suppliers.find(x => x.id === id); if (!s) return;
  s.name = val('es-name'); s.referente = val('es-ref'); s.email = val('es-email');
  s.phone = val('es-phone'); s.vat = val('es-vat');
  s.defaultPayment = val('es-dpayment'); s.defaultTransport = val('es-dtransport');
  Object.assign(s, readAddressFields('es'));
  touch(s);
  saveDB(); closeModal(); renderManage(); showToast('Aggiornato');
}
function delSupplier(id) {
  const used = db.items.filter(i => i.supplierId === id);
  if (used.length) { showToast('Fornitore usato da ' + used.length + ' articoli', 'error'); return; }
  if (!confirm('Eliminare il fornitore?')) return;
  db.suppliers = db.suppliers.filter(x => x.id !== id); saveDB(); renderManage(); showToast('Eliminato');
}

// ─── Famiglie / sottofamiglie ───
function familyPanelHtml(f) {
  const subs = (f.subs || []).map(s => `<div class="mgmt-item" style="padding:6px 12px">
      <span class="mgmt-item-name" style="font-size:13px;font-weight:500">${esc(s.name)} <span style="font-family:var(--mono);color:var(--text-dim);font-size:11px">[${esc(s.sigla || siglaFromName(s.name))}]</span></span>
      <div class="mgmt-item-actions">
        <button class="mini-btn" onclick="editSubFamilyModal('${f.id}','${s.id}')">✏</button>
        <button class="mini-btn danger" onclick="delSubFamily('${f.id}','${s.id}')">🗑</button></div></div>`).join('')
    || '<div class="empty-text" style="padding:6px 0">Nessuna sottofamiglia.</div>';
  return `<div class="mgmt-panel" style="margin-bottom:12px">
      <div class="mgmt-item" style="background:transparent;border:none;padding:0 0 10px">
        <span class="mgmt-item-name" style="font-size:15px;color:var(--accent)">🗂 ${esc(f.name)} <span style="font-family:var(--mono);color:var(--text-dim);font-size:12px">[${esc(f.sigla || siglaFromName(f.name))}]</span></span>
        <div class="mgmt-item-actions">
          <button class="mini-btn" onclick="editFamilyModal('${f.id}')">✏</button>
          <button class="mini-btn danger" onclick="delFamily('${f.id}')">🗑</button></div></div>
      <div class="mgmt-list" style="margin-bottom:10px">${subs}</div>
      <div class="mgmt-form">
        <input id="sub-name-${f.id}" placeholder="Nuova sottofamiglia">
        <input id="sub-sigla-${f.id}" placeholder="Sigla" maxlength="6" style="max-width:90px">
        <button class="add-btn-sm" onclick="addSubFamily('${f.id}')">+ Sottofamiglia</button></div>
    </div>`;
}
function renderFamilies(kind) {
  kind = kind || 'acquistato';
  const hint = kind === 'materiale' ? 'Nuova macrofamiglia (es. Acciaio)'
    : kind === 'parte' ? 'Nuova macrofamiglia (es. Lavorazioni meccaniche)'
    : 'Nuova macrofamiglia (es. Idraulico)';
  const blocks = (db.families || []).filter(f => (f.kind || 'acquistato') === kind).map(familyPanelHtml).join('')
    || '<div class="empty-text">Nessuna macrofamiglia.</div>';
  return `<div>${blocks}
    <div class="mgmt-panel"><div class="mgmt-form">
      <input id="fam-name-${kind}" placeholder="${hint}">
      <input id="fam-sigla-${kind}" placeholder="Sigla" maxlength="6" style="max-width:90px">
      <button class="add-btn-sm" onclick="addFamily('${kind}')">+ Aggiungi macrofamiglia</button></div></div></div>`;
}
function addFamily(kind) {
  kind = kind || 'acquistato';
  const n = val('fam-name-' + kind); if (!n) { showToast('Nome richiesto', 'error'); return; }
  const sg = val('fam-sigla-' + kind);
  db.families.push(stampNew({ id: gid(), name: n, kind, sigla: sg ? sg.toUpperCase() : siglaFromName(n), subs: [] }));
  saveDB(); renderManage(); showToast('Macrofamiglia aggiunta');
}
function editFamilyModal(id) {
  const f = getFamily(id); if (!f) return;
  openModal(`<h3>✏ Modifica macrofamiglia</h3>
    <div class="modal-grid">
      <div class="modal-field"><label>Nome</label><input id="ef-name" value="${esc(f.name)}"></div>
      <div class="modal-field"><label>Sigla (per codifica)</label><input id="ef-sigla" value="${esc(f.sigla || siglaFromName(f.name))}" maxlength="6"></div>
    </div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="saveFamily('${id}')">Salva</button></div>`);
}
function saveFamily(id) {
  const f = getFamily(id); if (!f) return;
  f.name = val('ef-name') || f.name;
  const sg = val('ef-sigla'); f.sigla = sg ? sg.toUpperCase() : siglaFromName(f.name);
  touch(f);
  saveDB(); closeModal(); renderManage(); showToast('Aggiornata');
}
function delFamily(id) {
  const used = db.items.filter(i => i.familyId === id);
  if (used.length) { showToast('Famiglia usata da ' + used.length + ' articoli', 'error'); return; }
  if (!confirm('Eliminare la macrofamiglia e le sue sottofamiglie?')) return;
  db.families = db.families.filter(f => f.id !== id);
  saveDB(); renderManage(); showToast('Eliminata');
}
function addSubFamily(familyId) {
  const f = getFamily(familyId); if (!f) return;
  const n = val('sub-name-' + familyId); if (!n) { showToast('Nome richiesto', 'error'); return; }
  if (!f.subs) f.subs = [];
  const sg = val('sub-sigla-' + familyId);
  f.subs.push(stampNew({ id: gid(), name: n, sigla: sg ? sg.toUpperCase() : siglaFromName(n) }));
  touch(f);
  saveDB(); renderManage(); showToast('Sottofamiglia aggiunta');
}
function editSubFamilyModal(familyId, subId) {
  const f = getFamily(familyId); const s = f && (f.subs || []).find(x => x.id === subId); if (!s) return;
  openModal(`<h3>✏ Modifica sottofamiglia</h3>
    <div class="modal-grid">
      <div class="modal-field"><label>Nome (in ${esc(f.name)})</label><input id="esf-name" value="${esc(s.name)}"></div>
      <div class="modal-field"><label>Sigla (per codifica)</label><input id="esf-sigla" value="${esc(s.sigla || siglaFromName(s.name))}" maxlength="6"></div>
    </div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="saveSubFamily('${familyId}','${subId}')">Salva</button></div>`);
}
function saveSubFamily(familyId, subId) {
  const f = getFamily(familyId); const s = f && (f.subs || []).find(x => x.id === subId); if (!s) return;
  s.name = val('esf-name') || s.name;
  const sg = val('esf-sigla'); s.sigla = sg ? sg.toUpperCase() : siglaFromName(s.name);
  touch(s);
  saveDB(); closeModal(); renderManage(); showToast('Aggiornata');
}
function delSubFamily(familyId, subId) {
  const used = db.items.filter(i => i.subFamilyId === subId);
  if (used.length) { showToast('Sottofamiglia usata da ' + used.length + ' articoli', 'error'); return; }
  if (!confirm('Eliminare la sottofamiglia?')) return;
  const f = getFamily(familyId); if (!f) return;
  f.subs = (f.subs || []).filter(x => x.id !== subId);
  saveDB(); renderManage(); showToast('Eliminata');
}

function renderWorkCenters() {
  const list = db.workCenters.map(w => `<div class="mgmt-item">
    <span class="mgmt-item-name">${esc(w.name)}</span>
    <span class="mgmt-item-meta">${fmtN(w.hourlyRate)}/h</span>
    <div class="mgmt-item-actions">
      <button class="mini-btn" onclick="editWcModal('${w.id}')">✏</button>
      <button class="mini-btn danger" onclick="delWc('${w.id}')">🗑</button></div></div>`).join('') || '<div class="empty-text">Nessun centro di lavoro.</div>';
  return `<div class="mgmt-panel"><div class="mgmt-list">${list}</div>
    <div class="mgmt-form">
      <input id="wc-name" placeholder="Nome (es. Tornitura)">
      <input id="wc-rate" type="number" step="0.5" placeholder="Tariffa €/h">
      <button class="add-btn-sm" onclick="addWc()">+ Aggiungi</button></div></div>`;
}
function addWc() {
  const n = val('wc-name'); if (!n) { showToast('Nome richiesto', 'error'); return; }
  db.workCenters.push(stampNew({ id: gid(), name: n, hourlyRate: numVal('wc-rate'), active: true }));
  saveDB(); renderManage(); showToast('Centro di lavoro aggiunto');
}
function editWcModal(id) {
  const w = db.workCenters.find(x => x.id === id); if (!w) return;
  openModal(`<h3>✏ Modifica centro di lavoro</h3>
    <div class="modal-field"><label>Nome</label><input id="ew-name" value="${esc(w.name)}"></div>
    <div class="modal-field"><label>Tariffa (${cur()}/h)</label><input id="ew-rate" type="number" step="0.5" value="${w.hourlyRate}"></div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="saveWc('${id}')">Salva</button></div>`);
}
function saveWc(id) {
  const w = db.workCenters.find(x => x.id === id); if (!w) return;
  w.name = val('ew-name'); w.hourlyRate = numVal('ew-rate');
  touch(w);
  saveDB(); closeModal(); renderManage(); showToast('Aggiornato');
}
function delWc(id) {
  const used = db.items.filter(i => (i.operations || []).some(o => o.workCenterId === id));
  if (used.length) { showToast('Usato in ' + used.length + ' distinte', 'error'); return; }
  if (!confirm('Eliminare il centro di lavoro?')) return;
  db.workCenters = db.workCenters.filter(x => x.id !== id); saveDB(); renderManage(); showToast('Eliminato');
}

function renderSettings() {
  const s = db.settings;
  return `<div class="mgmt-panel">
    <h3 class="settings-group-title">💶 Costi e margini</h3>
    <div class="modal-grid">
      <div class="modal-field"><label>Spese generali / overhead (%)</label><input type="number" id="set-ov" step="0.1" value="${s.overheadPct}"></div>
      <div class="modal-field"><label>Margine / markup (%)</label><input type="number" id="set-mg" step="0.1" value="${s.marginPct}"></div>
      <div class="modal-field"><label>Simbolo valuta</label><input id="set-cur" value="${esc(s.currency)}" maxlength="3"></div>
    </div>
    <p class="empty-text" style="text-align:left;padding:4px 0 12px">Le percentuali sono i valori di default applicati a tutti i prodotti. Si possono sovrascrivere per singola macchina dalla "Modifica testata".</p>

    <h3 class="settings-group-title">🏷 Codifica automatica articoli</h3>
    <div class="modal-grid">
      <div class="modal-field"><label>Cifre parte incrementale codice</label><input type="number" id="set-digits" min="1" max="10" step="1" value="${codeDigits()}"></div>
      <div class="modal-field"><label>Prefisso codice — Commerciali</label><input id="set-pfx-acq" maxlength="10" value="${esc(s.codePrefixAcquistato || 'CMM')}" placeholder="CMM"></div>
      <div class="modal-field"><label>Prefisso codice — Materie prime</label><input id="set-pfx-mat" maxlength="10" value="${esc(s.codePrefixMateriale || 'MAT')}" placeholder="MAT"></div>
      <div class="modal-field"><label>Prefisso codice — Parti</label><input id="set-pfx-prt" maxlength="10" value="${esc(s.codePrefixParte || 'PRT')}" placeholder="PRT"></div>
    </div>
    <p class="empty-text" style="text-align:left;padding:4px 0 12px">Le cifre della parte incrementale determinano lo zero-padding del progressivo (es. 3 → <span style="font-family:var(--mono)">${esc(s.codePrefixMateriale || 'MAT')}-ACC-LAM-001</span>). Il prefisso codice è la sigla iniziale usata nei codici automatici per commerciali, materie prime e parti.<br>Macchine, gruppi, sottogruppi e le parti legate a una macchina usano invece la <strong>codifica gerarchica</strong> (es. <span style="font-family:var(--mono)">TRN-BAS-001</span>), il cui schema si configura sulla singola macchina.</p>

    <button class="add-btn-sm" onclick="saveSettings()">Salva impostazioni</button></div>`;
}
function saveSettings() {
  db.settings.overheadPct = numVal('set-ov');
  db.settings.marginPct = numVal('set-mg');
  db.settings.currency = val('set-cur') || '€';
  const d = parseInt(val('set-digits'), 10);
  db.settings.codeDigits = (d >= 1 && d <= 10) ? d : 3;
  db.settings.codePrefixAcquistato = (val('set-pfx-acq') || 'CMM').toUpperCase();
  db.settings.codePrefixMateriale = (val('set-pfx-mat') || 'MAT').toUpperCase();
  db.settings.codePrefixParte = (val('set-pfx-prt') || 'PRT').toUpperCase();
  saveDB(); renderManage(); showToast('Impostazioni salvate');
}

// ═══════════════════════════════════════════════════════════
//  IMPORT MASSIVO DA EXCEL (Articoli e Distinte)
// ═══════════════════════════════════════════════════════════
function renderImport() {
  const types = ALL_TYPES.map(t => typeLabel(t)).join(', ');
  return `<div class="cloud-section" style="flex-direction:column;align-items:stretch;gap:18px">
    <div>
      <strong>📦 Import Articoli</strong>
      <p>Carica un foglio Excel per creare o aggiornare articoli in blocco (materie prime, commerciali, parti, assiemi). Se il <b>Codice</b> esiste già l'articolo viene <b>aggiornato</b>; se è vuoto viene generato automaticamente per materie prime, commerciali e parti. Colonne: <span style="font-family:var(--mono)">Tipo, Codice, Nome, UM, CostoUnitario, PrezzoAcquisto, Fornitore, Macrofamiglia, Sottofamiglia, Note</span>. Tipi ammessi: ${esc(types)}.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
        <button class="btn-outline" onclick="downloadItemsTemplate()">⬇ Scarica template Articoli</button>
        <button class="add-btn-sm" onclick="document.getElementById('imp-items-file').click()">⬆ Carica file Articoli</button>
        <input type="file" id="imp-items-file" accept=".xlsx,.xls,.csv" style="display:none" onchange="onImportItems(event)">
      </div>
    </div>
    <div style="border-top:1px solid var(--border, #2a2a2a);padding-top:16px">
      <strong>🌳 Import Distinte</strong>
      <p>Carica un foglio Excel con le relazioni <b>padre-figlio</b> per costruire le distinte. Gli articoli (padri e figli) devono già esistere in catalogo — importali prima con il foglio Articoli. Per ogni padre presente nel file i componenti vengono <b>sostituiti</b> (reimport idempotente); le lavorazioni non vengono toccate. Colonne: <span style="font-family:var(--mono)">CodicePadre, CodiceFiglio, Qta, Scarto%</span>.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
        <button class="btn-outline" onclick="downloadBomTemplate()">⬇ Scarica template Distinte</button>
        <button class="add-btn-sm" onclick="document.getElementById('imp-bom-file').click()">⬆ Carica file Distinte</button>
        <input type="file" id="imp-bom-file" accept=".xlsx,.xls,.csv" style="display:none" onchange="onImportBom(event)">
      </div>
    </div></div>`;
}

// ─── Lettura foglio Excel → array di oggetti riga ───
function readSheet(file, cb) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const wb = XLSX.read(new Uint8Array(reader.result), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) throw new Error('foglio vuoto');
      cb(XLSX.utils.sheet_to_json(ws, { defval: '' }));
    } catch (e) { console.error(e); showToast('File non valido', 'error'); }
  };
  reader.readAsArrayBuffer(file);
}
// Normalizza un'intestazione: minuscolo, senza spazi/accenti/punteggiatura
function normHeader(s) {
  return String(s == null ? '' : s).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}
// Legge il primo valore non vuoto tra più nomi colonna alternativi (tollerante a varianti)
function pick(row, ...names) {
  const wanted = names.map(normHeader);
  for (const k of Object.keys(row)) {
    if (wanted.includes(normHeader(k))) {
      const v = row[k];
      if (v !== '' && v != null) return v;
    }
  }
  return '';
}
function numOr(v, def) { const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? def : n; }

// Mappa un valore "Tipo" (label IT o chiave interna) al tipo articolo canonico
function resolveType(raw) {
  const n = normHeader(raw);
  if (!n) return '';
  for (const t of ALL_TYPES) {
    if (normHeader(t) === n || normHeader(TYPE_LABELS[t]) === n || normHeader(TYPE_SHORTS[t]) === n) return t;
  }
  // sinonimi comuni
  if (n === 'materiaprima' || n === 'materiaprime' || n === 'mp') return 'materiale';
  if (n === 'commerciale' || n === 'commerciali' || n === 'comm') return 'acquistato';
  return '';
}
// Trova (o crea) un fornitore per nome
function findOrCreateSupplier(name, report) {
  const n = String(name).trim(); if (!n) return '';
  let s = db.suppliers.find(x => x.name.toLowerCase() === n.toLowerCase());
  if (!s) { s = stampNew({ id: gid(), name: n, referente: '', email: '', active: true }); db.suppliers.push(s); report.createdSuppliers++; }
  return s.id;
}
// Trova (o crea) famiglia e sottofamiglia per nome, coerenti col tipo
function findOrCreateFamily(famName, subName, type, report) {
  const fn = String(famName).trim();
  const result = { familyId: '', subFamilyId: '' };
  if (!fn) return result;
  const kind = type;
  let f = (db.families || []).find(x => x.name.toLowerCase() === fn.toLowerCase() && (x.kind || 'acquistato') === kind);
  if (!f) { f = stampNew({ id: gid(), name: fn, kind, sigla: siglaFromName(fn), subs: [] }); db.families.push(f); report.createdFamilies++; }
  result.familyId = f.id;
  const sn = String(subName).trim();
  if (sn) {
    let s = (f.subs || []).find(x => x.name.toLowerCase() === sn.toLowerCase());
    if (!s) { s = stampNew({ id: gid(), name: sn, sigla: siglaFromName(sn) }); (f.subs = f.subs || []).push(s); report.createdSubFamilies++; }
    result.subFamilyId = s.id;
  }
  return result;
}

// ─── Import Articoli ───
function onImportItems(ev) {
  const file = ev.target.files[0]; ev.target.value = '';
  if (!file) return;
  readSheet(file, rows => { showImportReport(importItems(rows), 'items'); });
}
function importItems(rows) {
  const report = { created: 0, updated: 0, skipped: 0, errors: [],
    createdSuppliers: 0, createdFamilies: 0, createdSubFamilies: 0 };
  rows.forEach((row, i) => {
    const ln = i + 2; // riga foglio (1 = intestazioni)
    const name = String(pick(row, 'Nome', 'Name', 'Descrizione')).trim();
    const typeRaw = pick(row, 'Tipo', 'Type');
    const type = resolveType(typeRaw);
    if (!name && !type && !pick(row, 'Codice', 'Code')) { report.skipped++; return; } // riga vuota
    if (!type) { report.errors.push(`Riga ${ln}: tipo non valido ("${esc(typeRaw)}")`); return; }
    if (!name) { report.errors.push(`Riga ${ln}: nome mancante`); return; }
    const code = String(pick(row, 'Codice', 'Code')).trim();

    // Upsert per codice
    let it = code ? db.items.find(x => String(x.code).toLowerCase() === code.toLowerCase()) : null;
    const isNew = !it;
    if (isNew) {
      it = { id: gid(), type };
      if (isAssembly(type)) { it.components = []; it.operations = []; }
      db.items.push(it);
    } else {
      it.type = type;
      if (isAssembly(type)) { if (!it.components) it.components = []; if (!it.operations) it.operations = []; }
    }
    it.name = name;
    it.uom = String(pick(row, 'UM', 'U.M.', 'UnitaDiMisura', 'Unità') || it.uom || 'pz').trim();
    it.active = true;
    const notes = String(pick(row, 'Note', 'Notes')).trim();
    if (notes) it.notes = notes; else if (isNew) it.notes = '';

    if (type === 'materiale' || type === 'parte') it.unitCost = numOr(pick(row, 'CostoUnitario', 'Costo', 'UnitCost'), it.unitCost || 0);
    if (type === 'acquistato') {
      it.purchasePrice = numOr(pick(row, 'PrezzoAcquisto', 'Prezzo', 'PurchasePrice'), it.purchasePrice || 0);
      const supName = pick(row, 'Fornitore', 'Supplier');
      if (supName) it.supplierId = findOrCreateSupplier(supName, report);
    }
    if (usesFamily(type)) {
      const fam = findOrCreateFamily(pick(row, 'Macrofamiglia', 'Famiglia', 'Family'), pick(row, 'Sottofamiglia', 'SubFamily'), type, report);
      it.familyId = fam.familyId; it.subFamilyId = fam.subFamilyId;
    }
    // Codice: dato esplicito, oppure auto per mat/acq, oppure id come fallback
    if (code) it.code = code;
    else if (isNew) it.code = genItemCode(it) || it.id;

    if (isNew) { stampNew(it); report.created++; } else { touch(it); report.updated++; }
  });
  saveDB();
  return report;
}

// ─── Import Distinte (righe padre-figlio) ───
function onImportBom(ev) {
  const file = ev.target.files[0]; ev.target.value = '';
  if (!file) return;
  readSheet(file, rows => { showImportReport(importBom(rows), 'bom'); });
}
function findByCode(code) {
  const c = String(code).trim().toLowerCase();
  if (!c) return null;
  return db.items.find(x => String(x.code).toLowerCase() === c) || null;
}
function importBom(rows) {
  const report = { added: 0, parents: 0, skipped: 0, errors: [] };
  const clearedParents = new Set(); // padri già azzerati in questo import
  rows.forEach((row, i) => {
    const ln = i + 2;
    const pCode = String(pick(row, 'CodicePadre', 'Padre', 'Parent')).trim();
    const cCode = String(pick(row, 'CodiceFiglio', 'Figlio', 'Child', 'Componente')).trim();
    if (!pCode && !cCode) { report.skipped++; return; } // riga vuota
    const parent = findByCode(pCode);
    if (!parent) { report.errors.push(`Riga ${ln}: padre "${esc(pCode)}" non trovato in catalogo`); return; }
    if (!isAssembly(parent.type)) { report.errors.push(`Riga ${ln}: "${esc(pCode)}" è ${typeLabel(parent.type)}, non può avere una distinta`); return; }
    const child = findByCode(cCode);
    if (!child) { report.errors.push(`Riga ${ln}: figlio "${esc(cCode)}" non trovato in catalogo`); return; }
    if (!isAllowedChild(parent.type, child.id)) {
      report.errors.push(`Riga ${ln}: ${typeLabel(child.type)} non ammesso in ${typeLabel(parent.type)}`); return;
    }
    // Azzera i componenti del padre alla prima riga valida che lo riguarda
    if (!clearedParents.has(parent.id)) { parent.components = []; clearedParents.add(parent.id); report.parents++; }
    if (createsCycle(parent.id, child.id)) {
      report.errors.push(`Riga ${ln}: "${esc(cCode)}" in "${esc(pCode)}" creerebbe un ciclo`); return;
    }
    parent.components.push({ itemId: child.id, qty: numOr(pick(row, 'Qta', 'Quantità', 'Qty', 'Quantita'), 1), scrapPct: numOr(pick(row, 'Scarto%', 'Scarto', 'ScrapPct'), 0) });
    touch(parent);
    report.added++;
  });
  saveDB();
  return report;
}

// ─── Template scaricabili ───
function downloadItemsTemplate() {
  const header = ['Tipo', 'Codice', 'Nome', 'UM', 'CostoUnitario', 'PrezzoAcquisto', 'Fornitore', 'Macrofamiglia', 'Sottofamiglia', 'Note'];
  const data = [header,
    ['Materia prima', '', 'Lamiera acciaio S235', 'kg', 1.2, '', '', 'Acciaio', 'Lamiere', 'codice auto se vuoto'],
    ['Componente commerciale', '', 'Cuscinetto SKF 6204', 'pz', '', 12.5, 'SKF', 'Meccanico', 'Cuscinetti', ''],
    ['Parte', '', 'Fiancata lavorata', 'pz', 45, '', '', 'Carpenteria', 'Fiancate', 'codice auto se vuoto'],
    ['Sottogruppo', 'SGR-100', 'Gruppo motore', 'pz', '', '', '', '', '', 'la distinta si carica con il foglio Distinte'],
    ['Gruppo', 'GRP-100', 'Gruppo telaio', 'pz', '', '', '', '', '', ''],
    ['Macchina', 'MAC-100', 'Nastro Trasportatore NT-200', 'pz', '', '', '', '', '', ''],
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = header.map((h, i) => ({ wch: i === 2 ? 30 : 16 }));
  const info = XLSX.utils.aoa_to_sheet([
    ['ISTRUZIONI — Import Articoli'],
    [],
    ['Colonna', 'Descrizione'],
    ['Tipo', 'Uno tra: ' + ALL_TYPES.map(t => typeLabel(t)).join(', ')],
    ['Codice', 'Se esiste già viene aggiornato. Se vuoto: generato per materie prime/commerciali/parti, altrimenti interno.'],
    ['Nome', 'Obbligatorio.'],
    ['UM', 'Unità di misura (default pz).'],
    ['CostoUnitario', 'Per Materia prima e Parte.'],
    ['PrezzoAcquisto', 'Per Componente commerciale.'],
    ['Fornitore', 'Per Commerciale. Creato se non esiste.'],
    ['Macrofamiglia / Sottofamiglia', 'Per Materia prima, Commerciale e Parte. Create se non esistono.'],
    ['Note', 'Opzionale.'],
  ]);
  info['!cols'] = [{ wch: 28 }, { wch: 70 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Articoli');
  XLSX.utils.book_append_sheet(wb, info, 'Istruzioni');
  XLSX.writeFile(wb, 'Template_Articoli.xlsx');
  showToast('Template scaricato');
}
function downloadBomTemplate() {
  const data = [['CodicePadre', 'CodiceFiglio', 'Qta', 'Scarto%'],
    ['MAC-100', 'GRP-100', 1, 0],
    ['GRP-100', 'PRT-100', 2, 0],
    ['GRP-100', 'SGR-100', 1, 0],
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 16 }, { wch: 16 }, { wch: 8 }, { wch: 10 }];
  const info = XLSX.utils.aoa_to_sheet([
    ['ISTRUZIONI — Import Distinte'],
    [],
    ['Ogni riga collega un padre (assieme) a un suo componente figlio.'],
    ['I codici di padre e figlio devono già esistere in catalogo (importa prima gli Articoli).'],
    ['Per ogni padre presente nel file i componenti vengono SOSTITUITI (le lavorazioni restano).'],
    ['Le relazioni non ammesse o cicliche vengono segnalate e saltate.'],
    [],
    ['Colonna', 'Descrizione'],
    ['CodicePadre', 'Codice dell\'assieme (macchina/gruppo/sottogruppo).'],
    ['CodiceFiglio', 'Codice del componente contenuto.'],
    ['Qta', 'Quantità (default 1).'],
    ['Scarto%', 'Percentuale di scarto (default 0).'],
  ]);
  info['!cols'] = [{ wch: 16 }, { wch: 70 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Distinte');
  XLSX.utils.book_append_sheet(wb, info, 'Istruzioni');
  XLSX.writeFile(wb, 'Template_Distinte.xlsx');
  showToast('Template scaricato');
}

// ─── Report di esito import ───
function showImportReport(r, kind) {
  let stats, extra = '';
  if (kind === 'items') {
    stats = [['Creati', r.created], ['Aggiornati', r.updated], ['Saltati (vuote)', r.skipped], ['Errori', r.errors.length]];
    const auto = [];
    if (r.createdSuppliers) auto.push(`${r.createdSuppliers} fornitori`);
    if (r.createdFamilies) auto.push(`${r.createdFamilies} famiglie`);
    if (r.createdSubFamilies) auto.push(`${r.createdSubFamilies} sottofamiglie`);
    if (auto.length) extra = `<p class="empty-text" style="text-align:left;padding:6px 0">Creati automaticamente: ${auto.join(', ')}.</p>`;
  } else {
    stats = [['Componenti aggiunti', r.added], ['Distinte aggiornate', r.parents], ['Saltati (vuote)', r.skipped], ['Errori', r.errors.length]];
  }
  const cards = stats.map(([l, v]) => `<div class="kpi-card ${l === 'Errori' && v ? 'orange' : ''}"><div class="kpi-value">${v}</div><div class="kpi-label">${l}</div></div>`).join('');
  const errBlock = r.errors.length
    ? `<div style="margin-top:12px"><strong style="color:var(--red)">Righe con problemi (${r.errors.length}):</strong>
        <div class="picker-results" style="max-height:240px;margin-top:6px">${r.errors.map(e => `<div class="picker-row">${e}</div>`).join('')}</div></div>`
    : `<p class="empty-text" style="padding:8px 0">Nessun errore. ✔</p>`;
  openModal(`<h3>📋 Esito import ${kind === 'items' ? 'Articoli' : 'Distinte'}</h3>
    <div class="cost-summary">${cards}</div>${extra}${errBlock}
    <div class="modal-actions"><button class="add-btn-sm" onclick="closeImportReport('${kind}')">Chiudi</button></div>`);
}
function closeImportReport(kind) {
  closeModal();
  if (kind === 'bom') { currentBomId = null; reportBomId = null; }
  renderManage();
  showToast('Import completato');
}

function renderBackup() {
  return `<div class="cloud-section">
    <div style="flex:1">
      <strong>💾 Backup locale</strong>
      <p>I dati sono salvati nel browser (localStorage). Esporta un file JSON per conservare un backup o trasferire i dati su un altro PC. L'import sovrascrive i dati attuali.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
        <button class="add-btn-sm" onclick="exportBackup()">⬇ Esporta JSON</button>
        <button class="btn-outline" onclick="document.getElementById('import-file').click()">⬆ Importa JSON</button>
        <input type="file" id="import-file" accept="application/json,.json" style="display:none" onchange="importBackup(event)">
        <button class="btn-outline" style="color:var(--red);border-color:var(--red)" onclick="resetDB()">↺ Ripristina dati esempio</button>
      </div>
    </div></div>`;
}
function exportBackup() {
  const blob = new Blob([Store.exportSnapshot()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `bomtrack_backup_${new Date().toISOString().slice(0, 10)}.json`;
  a.click(); URL.revokeObjectURL(url);
  showToast('Backup esportato');
}
function importBackup(ev) {
  const file = ev.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || !Array.isArray(data.items)) throw new Error('formato non valido');
      if (!confirm('Importare questo file? I dati attuali verranno sovrascritti.')) return;
      Store.importSnapshot(data);
      currentBomId = null; reportBomId = null;
      setView('bom'); showToast('Backup importato');
    } catch (e) { showToast('File non valido', 'error'); }
  };
  reader.readAsText(file);
  ev.target.value = '';
}
function resetDB() {
  if (!confirm('Ripristinare i dati di esempio? Tutti i dati attuali saranno persi.')) return;
  Store.reset();
  currentBomId = null; reportBomId = null;
  setView('bom'); showToast('Dati ripristinati');
}

// ═══════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════
(function init() {
  Store.load();
  renderNav();
  setView('bom');
})();
