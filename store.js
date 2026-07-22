// ═══════════════════════════════════════════════════════════
//  BOMTRACK — STORE (dati, migrazioni, persistenza)
//  Caricato prima di app.js. Nessun codice di rete: l'adapter
//  attuale è localStorage; il contratto per un futuro adapter
//  cloud (Supabase/Cloudflare D1) è documentato in
//  docs/cloud-schema.md.
// ═══════════════════════════════════════════════════════════

const DB_KEY = 'bomtrack_v1';       // non rinominare: la versione vive dentro il blob
const SCHEMA_VERSION = 2;           // v1 = id interi legacy (implicita), v2 = uuid + timestamp

const defaultDB = {
  suppliers: [
    { id: 's1', name: 'Bonfiglioli', referente: '', email: '', active: true },
    { id: 's2', name: 'SKF', referente: '', email: '', active: true },
    { id: 's3', name: 'Würth', referente: '', email: '', active: true },
  ],
  rfqs: [],
  orders: [],
  workCenters: [
    { id: 'w1', name: 'Taglio laser', hourlyRate: 45, active: true },
    { id: 'w2', name: 'Saldatura', hourlyRate: 38, active: true },
    { id: 'w3', name: 'Tornitura', hourlyRate: 42, active: true },
    { id: 'w4', name: 'Montaggio', hourlyRate: 30, active: true },
  ],
  families: [
    { id: 'f1', name: 'Meccanico', subs: [
      { id: 'f1s1', name: 'Riduttori' }, { id: 'f1s2', name: 'Cuscinetti' }, { id: 'f1s3', name: 'Viteria' },
      { id: 'f1s4', name: 'Cinghie e pulegge' }, { id: 'f1s5', name: 'Guide lineari' } ] },
    { id: 'f2', name: 'Pneumatico', subs: [
      { id: 'f2s1', name: 'Cilindri' }, { id: 'f2s2', name: 'Valvole' }, { id: 'f2s3', name: 'Raccordi' }, { id: 'f2s4', name: 'Gruppi FRL' } ] },
    { id: 'f3', name: 'Oleodinamico', subs: [
      { id: 'f3s1', name: 'Pompe' }, { id: 'f3s2', name: 'Cilindri' }, { id: 'f3s3', name: 'Valvole' }, { id: 'f3s4', name: 'Tubi e raccordi' } ] },
    { id: 'f4', name: 'Elettrico', subs: [
      { id: 'f4s1', name: 'Motori' }, { id: 'f4s2', name: 'Cavi' }, { id: 'f4s3', name: 'Interruttori' }, { id: 'f4s4', name: 'Quadri' } ] },
    { id: 'f5', name: 'Elettronico', subs: [
      { id: 'f5s1', name: 'Sensori' }, { id: 'f5s2', name: 'PLC' }, { id: 'f5s3', name: 'Schede' }, { id: 'f5s4', name: 'Encoder' } ] },
    // Famiglie materie prime
    { id: 'fm1', name: 'Acciaio', kind: 'materiale', subs: [
      { id: 'fm1s1', name: 'Lamiere' }, { id: 'fm1s2', name: 'Profilati' }, { id: 'fm1s3', name: 'Tubi' }, { id: 'fm1s4', name: 'Barre' }, { id: 'fm1s5', name: 'Tondi' } ] },
    { id: 'fm2', name: 'Alluminio', kind: 'materiale', subs: [
      { id: 'fm2s1', name: 'Lamiere' }, { id: 'fm2s2', name: 'Profilati' }, { id: 'fm2s3', name: 'Barre' }, { id: 'fm2s4', name: 'Tubi' } ] },
    { id: 'fm3', name: 'Acciaio inox', kind: 'materiale', subs: [
      { id: 'fm3s1', name: 'Lamiere' }, { id: 'fm3s2', name: 'Tubi' }, { id: 'fm3s3', name: 'Barre' }, { id: 'fm3s4', name: 'Profilati' } ] },
    { id: 'fm4', name: 'Ottone e rame', kind: 'materiale', subs: [
      { id: 'fm4s1', name: 'Barre' }, { id: 'fm4s2', name: 'Tubi' }, { id: 'fm4s3', name: 'Lamiere' } ] },
    { id: 'fm5', name: 'Ghisa', kind: 'materiale', subs: [
      { id: 'fm5s1', name: 'Barre' }, { id: 'fm5s2', name: 'Getti' } ] },
    { id: 'fm6', name: 'Materie plastiche', kind: 'materiale', subs: [
      { id: 'fm6s1', name: 'Nylon (PA)' }, { id: 'fm6s2', name: 'POM (Delrin)' }, { id: 'fm6s3', name: 'PTFE' }, { id: 'fm6s4', name: 'PVC' }, { id: 'fm6s5', name: 'Plexiglass (PMMA)' } ] },
    { id: 'fm7', name: 'Gomma e guarnizioni', kind: 'materiale', subs: [
      { id: 'fm7s1', name: 'Lastre' }, { id: 'fm7s2', name: 'O-ring' }, { id: 'fm7s3', name: 'Profili' } ] },
    // Famiglie parti (lavorati interni)
    { id: 'fp1', name: 'Lavorazioni meccaniche', kind: 'parte', subs: [
      { id: 'fp1s1', name: 'Tornitura' }, { id: 'fp1s2', name: 'Fresatura' }, { id: 'fp1s3', name: 'Taglio laser' }, { id: 'fp1s4', name: 'Piegatura' }, { id: 'fp1s5', name: 'Saldatura' } ] },
    { id: 'fp2', name: 'Carpenteria', kind: 'parte', subs: [
      { id: 'fp2s1', name: 'Telai' }, { id: 'fp2s2', name: 'Fiancate' }, { id: 'fp2s3', name: 'Staffe' } ] },
  ],
  items: [
    // Materie prime
    { id: 'm1', code: 'MAT-001', name: 'Lamiera acciaio S235', type: 'materiale', uom: 'kg', unitCost: 1.20, notes: '', active: true },
    { id: 'm2', code: 'MAT-002', name: 'Profilato alluminio', type: 'materiale', uom: 'kg', unitCost: 4.50, notes: '', active: true },
    // Commerciali
    { id: 'a1', code: 'CMM-001', name: 'Motoriduttore 1.5 kW', type: 'acquistato', uom: 'pz', supplierId: 's1', purchasePrice: 320, familyId: 'f1', subFamilyId: 'f1s1', notes: '', active: true },
    { id: 'a2', code: 'CMM-002', name: 'Cuscinetto SKF 6204', type: 'acquistato', uom: 'pz', supplierId: 's2', purchasePrice: 12.5, familyId: 'f1', subFamilyId: 'f1s2', notes: '', active: true },
    { id: 'a3', code: 'CMM-003', name: 'Kit viteria M8', type: 'acquistato', uom: 'pz', supplierId: 's3', purchasePrice: 8, familyId: 'f1', subFamilyId: 'f1s3', notes: '', active: true },
    // Parti (foglie a costo diretto)
    { id: 'pt1', code: 'PRT-001', name: 'Fiancata lavorata', type: 'parte', uom: 'pz', unitCost: 45, familyId: 'fp2', subFamilyId: 'fp2s2', notes: '', active: true },
    { id: 'pt2', code: 'PRT-002', name: 'Albero tornito', type: 'parte', uom: 'pz', unitCost: 60, familyId: 'fp1', subFamilyId: 'fp1s1', notes: '', active: true },
    // Sottogruppo
    {
      id: 'sg1', code: 'SGR-001', name: 'Gruppo motore', type: 'sottogruppo', uom: 'pz',
      notes: '', active: true,
      components: [
        { itemId: 'a1', qty: 1, scrapPct: 0 },
        { itemId: 'a2', qty: 2, scrapPct: 0 },
      ],
      operations: [
        { workCenterId: 'w4', hours: 1, note: 'Montaggio motore' },
      ],
    },
    // Gruppi
    {
      id: 'g1', code: 'GRP-001', name: 'Gruppo telaio', type: 'gruppo', uom: 'pz',
      notes: '', active: true,
      components: [
        { itemId: 'pt1', qty: 2, scrapPct: 0 },
        { itemId: 'm1', qty: 25, scrapPct: 5 },
        { itemId: 'a3', qty: 1, scrapPct: 0 },
      ],
      operations: [
        { workCenterId: 'w1', hours: 1.5, note: 'Taglio lamiere' },
        { workCenterId: 'w2', hours: 2, note: 'Saldatura struttura' },
      ],
    },
    {
      id: 'g2', code: 'GRP-002', name: 'Gruppo trasmissione', type: 'gruppo', uom: 'pz',
      notes: '', active: true,
      components: [
        { itemId: 'sg1', qty: 1, scrapPct: 0 },
        { itemId: 'pt2', qty: 1, scrapPct: 0 },
        { itemId: 'm2', qty: 8, scrapPct: 3 },
      ],
      operations: [
        { workCenterId: 'w4', hours: 1.5, note: 'Montaggio trasmissione' },
      ],
    },
    // Macchina (top-level)
    {
      id: 'mac1', code: 'NT-100', name: 'Nastro Trasportatore NT-100', type: 'macchina', uom: 'pz',
      notes: 'Macchina esempio', active: true,
      components: [
        { itemId: 'g1', qty: 1, scrapPct: 0 },
        { itemId: 'g2', qty: 1, scrapPct: 0 },
      ],
      operations: [
        { workCenterId: 'w4', hours: 3, note: 'Montaggio finale' },
      ],
    },
  ],
  settings: { overheadPct: 12, marginPct: 20, currency: '€', codeDigits: 3, codePrefixAcquistato: 'CMM', codePrefixMateriale: 'MAT', codePrefixParte: 'PRT' },
};

// Unità di misura predefinite (codice = quello stampato sui documenti)
const DEFAULT_UOMS = [
  { code: 'pz', name: 'Pezzi' },
  { code: 'n', name: 'Numero' },
  { code: 'set', name: 'Set / kit' },
  { code: 'conf', name: 'Confezione' },
  { code: 'kg', name: 'Chilogrammi' },
  { code: 'g', name: 'Grammi' },
  { code: 't', name: 'Tonnellate' },
  { code: 'm', name: 'Metri' },
  { code: 'mm', name: 'Millimetri' },
  { code: 'm2', name: 'Metri quadri' },
  { code: 'm3', name: 'Metri cubi' },
  { code: 'l', name: 'Litri' },
  { code: 'h', name: 'Ore' },
];

let db;

// ── ID e timestamp ──────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  // fallback per contesti senza randomUUID (browser datati su file://)
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
function gid() { return newId(); }
function nowISO() { return new Date().toISOString(); }
function stampNew(rec) { const t = nowISO(); if (!rec.createdAt) rec.createdAt = t; rec.updatedAt = t; return rec; }
function touch(rec) { if (rec) rec.updatedAt = nowISO(); return rec; }

function siglaFromName(name) {
  return String(name || '').replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 3) || 'XXX';
}
function isAssembly(t) { return t === 'macchina' || t === 'gruppo' || t === 'sottogruppo'; }

// ── Caricamento e migrazioni ────────────────────────────────
function loadDB() {
  try {
    const r = localStorage.getItem(DB_KEY);
    if (r) { db = JSON.parse(r); migrateDB(); return; }
  } catch (e) { console.error('Errore lettura locale:', e); }
  db = JSON.parse(JSON.stringify(defaultDB));
  migrateDB();
  saveDB();
}
function migrateDB() {
  // Normalizzazioni legacy (idempotenti, sempre eseguite)
  if (!db.suppliers) db.suppliers = [];
  if (!db.rfqs) db.rfqs = [];
  if (!db.orders) db.orders = [];
  if (!db.workCenters) db.workCenters = [];
  if (!db.families) db.families = JSON.parse(JSON.stringify(defaultDB.families));
  if (!db.items) db.items = [];
  if (!db.settings) db.settings = { overheadPct: 0, marginPct: 0, currency: '€' };
  if (db.settings.codeDigits == null) db.settings.codeDigits = 3;
  if (!db.settings.codePrefixAcquistato) db.settings.codePrefixAcquistato = 'CMM';
  if (!db.settings.codePrefixMateriale) db.settings.codePrefixMateriale = 'MAT';
  if (!db.settings.codePrefixParte) db.settings.codePrefixParte = 'PRT';
  // Voci precompilabili per trasporto/pagamento nelle richieste di offerta (+ predefinita)
  if (!db.settings.transportOptions) db.settings.transportOptions = ['Porto franco', 'Porto assegnato', 'EXW', 'FCA', 'DAP', 'CIF'];
  if (!db.settings.paymentOptions) db.settings.paymentOptions = ['Bonifico anticipato', 'Bonifico 30gg', 'Bonifico 60gg', 'RiBa 30gg', 'RiBa 60gg'];
  if (db.settings.transportDefault == null) db.settings.transportDefault = '';
  if (db.settings.paymentDefault == null) db.settings.paymentDefault = '';
  // Modo di calcolo del costo proposto alle nuove parti: 'unit' | 'cycle' | 'sum'
  if (!db.settings.partCostModeDefault) db.settings.partCostModeDefault = 'cycle';
  // Unità di misura gestite: seed una-tantum con le predefinite + quelle già
  // presenti nei dati (finora l'U.M. era testo libero, non va persa).
  if (!Array.isArray(db.settings.uoms)) {
    db.settings.uoms = DEFAULT_UOMS.map(u => ({ ...u }));
    const known = new Set(db.settings.uoms.map(u => u.code));
    const seen = [];
    (db.items || []).forEach(i => seen.push(i.uom));
    (db.rfqs || []).forEach(r => (r.lines || []).forEach(l => seen.push(l.uom)));
    (db.orders || []).forEach(o => (o.lines || []).forEach(l => seen.push(l.uom)));
    seen.forEach(c => {
      const code = String(c || '').trim();
      if (code && !known.has(code)) { known.add(code); db.settings.uoms.push({ code, name: '' }); }
    });
  }
  if (db.settings.uomDefault == null) db.settings.uomDefault = 'pz';
  // Dati dell'azienda utilizzatrice (richiedente), stampati sui documenti RFQ
  if (!db.settings.company) db.settings.company = { name: '', referente: '', email: '', phone: '', vat: '', street: '', streetNumber: '', zip: '', city: '', province: '', country: '' };
  // Indirizzo strutturato (via, civico, CAP, città, provincia, stato); migra il vecchio campo unico
  const ensureAddr = o => {
    if (!o) return;
    if (o.street == null) o.street = o.address || '';
    if (o.streetNumber == null) o.streetNumber = '';
    if (o.zip == null) o.zip = '';
    if (o.city == null) o.city = '';
    if (o.province == null) o.province = '';
    if (o.country == null) o.country = '';
    delete o.address;
  };
  ensureAddr(db.settings.company);
  // Fornitori: campi anagrafici estesi usati nei documenti di richiesta offerta
  (db.suppliers || []).forEach(s => {
    if (s.phone == null) s.phone = '';
    if (s.vat == null) s.vat = '';
    if (s.defaultTransport == null) s.defaultTransport = '';
    if (s.defaultPayment == null) s.defaultPayment = '';
    ensureAddr(s);
  });
  // RFQ: modello a fornitore singolo + campi riga (prezzo unitario e data consegna)
  (db.rfqs || []).forEach(r => {
    if (r.supplierId == null) r.supplierId = (r.supplierIds && r.supplierIds[0]) || null;
    if (r.transport == null) r.transport = '';
    if (r.payment == null) r.payment = '';
    if (r.notesInternal == null) r.notesInternal = '';
    (r.lines || []).forEach(l => {
      if (l.price == null) {
        const o = r.offers && r.supplierId && r.offers[r.supplierId];
        l.price = (o && o.lines && o.lines[l.id] != null) ? o.lines[l.id] : '';
      }
      if (l.deliveryDate == null) l.deliveryDate = '';
      if (l.note == null) l.note = '';
    });
    delete r.supplierIds; delete r.offers; delete r.awards;
  });
  // Ordini a fornitore: normalizzazione campi riga (prezzo, consegna, ricevuto)
  (db.orders || []).forEach(o => {
    if (o.transport == null) o.transport = '';
    if (o.payment == null) o.payment = '';
    if (o.requestedDelivery == null) o.requestedDelivery = '';
    if (o.rfqId == null) o.rfqId = null;
    if (o.supplierConfirmation == null) o.supplierConfirmation = '';
    if (o.notesInternal == null) o.notesInternal = '';
    (o.lines || []).forEach(l => {
      if (l.price == null) l.price = '';
      if (l.deliveryDate == null) l.deliveryDate = '';
      if (l.received == null) l.received = 0;
      if (l.note == null) l.note = '';
    });
  });
  // Famiglie: tipizzazione (materie prime vs commerciali) + sigla per codifica automatica
  (db.families || []).forEach(f => {
    if (!f.kind) f.kind = 'acquistato'; // le famiglie storiche erano tutte commerciali
    if (!f.sigla) f.sigla = siglaFromName(f.name);
    (f.subs || []).forEach(s => { if (!s.sigla) s.sigla = siglaFromName(s.name); });
  });
  // Seed una-tantum delle famiglie materie prime predefinite mancanti (non ripristina quelle cancellate)
  if (!db.settings.mpFamiliesSeeded) {
    const existingIds = new Set((db.families || []).map(f => f.id));
    defaultDB.families.filter(f => f.kind === 'materiale' && !existingIds.has(f.id))
      .forEach(f => db.families.push(JSON.parse(JSON.stringify(f))));
    db.settings.mpFamiliesSeeded = true;
  }
  // Seed una-tantum delle famiglie parti predefinite mancanti (non ripristina quelle cancellate)
  if (!db.settings.partFamiliesSeeded) {
    const existingIds = new Set((db.families || []).map(f => f.id));
    defaultDB.families.filter(f => f.kind === 'parte' && !existingIds.has(f.id))
      .forEach(f => db.families.push(JSON.parse(JSON.stringify(f))));
    db.settings.partFamiliesSeeded = true;
  }
  db.items.forEach(it => {
    // Migrazione vecchio tipo 'prodotto' + flag isMachine ai nuovi tipi
    if (it.type === 'prodotto') {
      it.type = it.isMachine ? 'macchina' : 'gruppo';
      delete it.isMachine;
    }
    if (isAssembly(it.type)) {
      if (!it.components) it.components = [];
      if (!it.operations) it.operations = [];
    }
    if (it.type === 'parte' && !it.cycle) it.cycle = [];
    // Modo di calcolo del costo della parte. I dati storici conservano il
    // comportamento precedente: col ciclo il costo era derivato dal ciclo,
    // senza ciclo era quello del campo manuale.
    if (it.type === 'parte' && !it.costMode) it.costMode = (it.cycle || []).length ? 'cycle' : 'unit';
    // Righe lavorazione del ciclo: da ore × tariffa a costo fisso (conserva il valore già calcolato)
    (it.cycle || []).forEach(row => {
      if (row.kind !== 'op' || row.cost != null) return;
      const wc = db.workCenters.find(w => w.id === row.workCenterId);
      row.cost = (row.costOverride != null && row.costOverride !== '')
        ? (Number(row.costOverride) || 0)
        : (Number(row.hours) || 0) * (wc ? (Number(wc.hourlyRate) || 0) : 0);
      delete row.hours; delete row.costOverride;
    });
  });
  // Migrazioni versionate
  if ((db.schemaVersion || 1) < 2) { migrateV2(); db.schemaVersion = 2; }
}
// v2: id legacy (interi/sigle) → UUID su tutte le entità e i riferimenti,
// timestamp createdAt/updatedAt, rimozione contatore nextId.
function migrateV2() {
  const idMap = {};
  const mapId = rec => { if (rec.id != null && !UUID_RE.test(String(rec.id))) idMap[rec.id] = newId(); };
  db.suppliers.forEach(mapId);
  db.workCenters.forEach(mapId);
  db.families.forEach(f => { mapId(f); (f.subs || []).forEach(mapId); });
  db.items.forEach(mapId);

  const re = id => (id != null && idMap[id] != null) ? idMap[id] : id;
  const rewritePK = rec => { rec.id = re(rec.id); };
  db.suppliers.forEach(rewritePK);
  db.workCenters.forEach(rewritePK);
  db.families.forEach(f => { rewritePK(f); (f.subs || []).forEach(rewritePK); });
  db.items.forEach(rewritePK);

  db.items.forEach(it => {
    if (it.supplierId != null) it.supplierId = re(it.supplierId);
    if (it.familyId != null) it.familyId = re(it.familyId);
    if (it.subFamilyId != null) it.subFamilyId = re(it.subFamilyId);
    (it.components || []).forEach(c => { c.itemId = re(c.itemId); });
    (it.operations || []).forEach(o => { o.workCenterId = re(o.workCenterId); });
    (it.cycle || []).forEach(row => {
      if (row.itemId != null) row.itemId = re(row.itemId);
      if (row.workCenterId != null) row.workCenterId = re(row.workCenterId);
      if (row.supplierId != null) row.supplierId = re(row.supplierId);
    });
  });

  const t = nowISO();
  const stampAll = rec => { if (!rec.createdAt) rec.createdAt = t; if (!rec.updatedAt) rec.updatedAt = t; };
  db.suppliers.forEach(stampAll);
  db.workCenters.forEach(stampAll);
  db.families.forEach(f => { stampAll(f); (f.subs || []).forEach(stampAll); });
  db.items.forEach(stampAll);

  delete db.nextId;
}

// ── Store: API repository (contratto per il futuro adapter cloud) ──
const Store = {
  load() { loadDB(); },
  commit() {
    try { localStorage.setItem(DB_KEY, JSON.stringify(db)); }
    catch (e) {
      console.error('Errore salvataggio locale:', e);
      if (typeof showToast === 'function') showToast('Errore salvataggio', 'error');
    }
  },
  reset() {
    db = JSON.parse(JSON.stringify(defaultDB));
    migrateDB();
    this.commit();
  },
  // Svuota il database: nessun dato di esempio, nessuna anagrafica, nessuna
  // impostazione. migrateDB() ricostruisce lo scheletro e semina famiglie e
  // U.M. predefinite: qui si torna a svuotarle e si alzano i flag di seed,
  // altrimenti il seed una-tantum ripopolerebbe subito il db appena azzerato.
  clearAll() {
    db = { suppliers: [], rfqs: [], orders: [], workCenters: [], families: [], items: [], settings: {}, schemaVersion: SCHEMA_VERSION };
    migrateDB();
    db.families = [];
    db.settings.uoms = [];
    db.settings.uomDefault = '';
    db.settings.mpFamiliesSeeded = true;
    db.settings.partFamiliesSeeded = true;
    this.commit();
  },
  getAll(coll) { return db[coll] || []; },
  getById(coll, id) { return (db[coll] || []).find(r => r.id === id); },
  insert(coll, rec) {
    if (rec.id == null) rec.id = newId();
    stampNew(rec);
    db[coll].push(rec);
    this.commit();
    return rec;
  },
  update(coll, id, patch) {
    const rec = this.getById(coll, id);
    if (!rec) return null;
    Object.assign(rec, patch);
    touch(rec);
    this.commit();
    return rec;
  },
  remove(coll, id) {
    const arr = db[coll] || [];
    const i = arr.findIndex(r => r.id === id);
    if (i >= 0) { arr.splice(i, 1); this.commit(); return true; }
    return false;
  },
  getSettings() { return db.settings; },
  setSettings(patch) { Object.assign(db.settings, patch); this.commit(); },
  exportSnapshot() { return JSON.stringify(db, null, 2); },
  importSnapshot(json) {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    if (!data || !Array.isArray(data.items)) throw new Error('formato non valido');
    db = data;
    migrateDB();
    this.commit();
  },
};

// Shim: i punti di mutazione esistenti in app.js chiamano saveDB()
function saveDB() { Store.commit(); }
