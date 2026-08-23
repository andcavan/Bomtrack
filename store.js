// ═══════════════════════════════════════════════════════════
//  BOMTRACK — STORE (dati, migrazioni, persistenza)
//  Caricato prima degli script dell'app. Nessun codice di rete: l'adapter
//  attuale è localStorage; il contratto per un futuro adapter
//  cloud (Supabase/Cloudflare D1) è documentato in
//  docs/cloud-schema.md.
// ═══════════════════════════════════════════════════════════

const DB_KEY = 'bomtrack_v1';       // non rinominare: la versione vive dentro il blob
const SCHEMA_VERSION = 2;           // v1 = id interi legacy (implicita), v2 = uuid + timestamp
const TRASH_DAYS = 30;              // per quanto un'eliminazione resta recuperabile

const defaultDB = {
  suppliers: [
    { id: 's1', name: 'Bonfiglioli', referente: '', email: '', active: true },
    { id: 's2', name: 'SKF', referente: '', email: '', active: true },
    { id: 's3', name: 'Würth', referente: '', email: '', active: true },
  ],
  rfqs: [],
  orders: [],
  plans: [],        // piani di produzione (fabbisogno materiali)
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

// Concetti predefiniti: la parte "standardizzata" del nome di una parte
// (l'oggetto), completata poi da una descrizione libera. Gestiti come le U.M.
// in Gestione → Concetti. Id fissi: il seed è una-tantum e idempotente.
const DEFAULT_CONCEPTS = [
  { id: 'cn-albero', name: 'ALBERO' },
  { id: 'cn-flangia', name: 'FLANGIA' },
  { id: 'cn-staffa', name: 'STAFFA' },
  { id: 'cn-piastra', name: 'PIASTRA' },
  { id: 'cn-distanziale', name: 'DISTANZIALE' },
  { id: 'cn-perno', name: 'PERNO' },
  { id: 'cn-boccola', name: 'BOCCOLA' },
  { id: 'cn-coperchio', name: 'COPERCHIO' },
  { id: 'cn-supporto', name: 'SUPPORTO' },
  { id: 'cn-ghiera', name: 'GHIERA' },
];

let db;

// ── Utenti: password e hashing ──────────────────────────────
// SHA-256 in JS puro invece di crypto.subtle: quello è asincrono e vive solo in
// secure context, mentre l'app si apre anche con doppio click su file:// (stesso
// motivo del fallback di newId()).
// ATTENZIONE: con i dati in localStorage questo non è sicurezza — chi apre i
// DevTools legge tutto. È un separatore di ruoli tra colleghi, in attesa che
// l'autenticazione vera passi a Supabase Auth (vedi docs/cloud-schema.md).
function sha256Hex(str) {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  // UTF-8 → byte. Era `unescape(encodeURIComponent(...))`: stesso risultato, ma
  // unescape è deprecato ed encodeURIComponent lancia sui surrogati spaiati.
  // TextEncoder produce esattamente gli stessi byte, quindi gli hash già in
  // archivio restano validi e nessuno deve rifare la password.
  const bytes = Array.from(new TextEncoder().encode(String(str)));
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i--) bytes.push((bitLen / 2 ** (8 * i)) & 0xff);

  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  const w = new Uint32Array(64);
  for (let pos = 0; pos < bytes.length; pos += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = (bytes[pos + 4 * i] << 24) | (bytes[pos + 4 * i + 1] << 16) | (bytes[pos + 4 * i + 2] << 8) | bytes[pos + 4 * i + 3];
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    [a, b, c, d, e, f, g, h].forEach((v, i) => { H[i] = (H[i] + v) >>> 0; });
  }
  return H.map(x => x.toString(16).padStart(8, '0')).join('');
}
function newSalt() { return newId().replace(/-/g, ''); }
function hashPassword(password, salt) { return sha256Hex(salt + ':' + password); }

// Ruoli: chi può scrivere cosa è deciso in core.js, qui resta solo l'elenco valido
const USER_ROLES = ['admin', 'acquisti', 'progettazione', 'lettore'];

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
// Autore delle modifiche: impostato al login (Store.setActor), finisce in
// createdBy/updatedBy di ogni record → created_by/updated_by in cloud.
let actorId = null;
let lastTrashId = null;   // ultima voce di cestino creata (per l'annulla immediato)
function stampNew(rec) {
  const t = nowISO();
  if (!rec.createdAt) rec.createdAt = t;
  rec.updatedAt = t;
  if (actorId) { if (!rec.createdBy) rec.createdBy = actorId; rec.updatedBy = actorId; }
  return rec;
}
function touch(rec) {
  if (!rec) return rec;
  rec.updatedAt = nowISO();
  if (actorId) rec.updatedBy = actorId;
  return rec;
}

// ── Registro dello schema ───────────────────────────────────
// Le nove collezioni radice, i loro array annidati e come ciascuno va trattato
// quando i dati saranno condivisi. Finora questi nomi erano cablati in sei
// punti diversi (migrazioni, validazione, azzeramento, backup…) e ogni aggiunta
// ne dimenticava qualcuno: qui stanno una volta sola e chi deve percorrere il
// database li legge da qui.
//
// `merge` è la decisione che conta, e non può essere la stessa per tutti:
//
//   'row'     — righe con identità propria, dove l'aggiunta concorrente è lo
//               scenario normale, non un conflitto. Due colleghi che
//               registrano una quotazione sullo stesso articolo hanno due id
//               diversi: sopravvivono entrambe, nessuno perde niente.
//
//   'replace' — l'array *è* la definizione dell'oggetto. Metà distinta di uno e
//               metà dell'altro è una distinta che nessuno dei due ha
//               progettato, e un ciclo di lavorazione mezzo e mezzo è un costo
//               sbagliato che nessuno verifica. Qui l'ultimo che salva
//               sostituisce l'insieme intero e l'altro viene avvisato.
//               Queste righe, per giunta, non hanno un id proprio: l'identità
//               per fare il merge riga per riga non esisterebbe nemmeno.
//
// `table` è il nome che la collezione avrà nel database condiviso
// (docs/cloud-schema.md). Serve all'adapter, non serve all'app.
const SCHEMA = {
  items: {
    table: 'items',
    children: {
      components: { table: 'item_components', rowId: null, merge: 'replace' },
      operations: { table: 'item_operations', rowId: null, merge: 'replace' },
      cycle: { table: 'item_cycle_rows', rowId: null, merge: 'replace' },
      priceList: { table: 'item_prices', rowId: 'id', merge: 'row' },
    },
  },
  // Le revisioni rilasciate sono fotografie congelate: `snapshot` resta un
  // oggetto unico e non si esplode in tabelle figlie. Non è pigrizia — una
  // revisione non va mai fusa con niente, e normalizzarla significherebbe darle
  // la stessa forma dei dati vivi, cioè invitare qualcuno a modificarla.
  revisions: { table: 'item_revisions' },
  // Movimenti di magazzino: rettifiche e consumi. I **carichi da ordine non
  // stanno qui** — quelli li racconta già `received` sulla riga d'ordine, e
  // scriverli in due posti significherebbe tenerli d'accordo a mano.
  movements: { table: 'stock_movements' },
  suppliers: { table: 'suppliers' },
  workCenters: { table: 'work_centers' },
  families: { table: 'families', children: { subs: { table: 'sub_families', rowId: 'id', merge: 'row' } } },
  rfqs: { table: 'rfqs', children: { lines: { table: 'rfq_lines', rowId: 'id', merge: 'row' } } },
  orders: { table: 'orders', children: { lines: { table: 'order_lines', rowId: 'id', merge: 'row' } } },
  plans: { table: 'production_plans', children: { lines: { table: 'production_plan_lines', rowId: 'id', merge: 'row' } } },
  // Commesse: il cliente e la data a monte di tutto. Un piano ne cita una, e da
  // lì la citazione scende su richieste e ordini — è la catena che risponde a
  // «cosa abbiamo ordinato per la commessa 240?».
  jobs: { table: 'jobs' },
  // Il cestino non è dominio: è la rete sotto le eliminazioni. In cloud è una
  // tabella come le altre, con il record conservato in jsonb.
  trash: { table: 'trash' },
  // Gli hash delle password non migrano: le password vere le possiede l'auth
  // del backend. `secret` è l'elenco dei campi che l'adapter deve togliere.
  users: { table: 'profiles', secret: ['passwordHash', 'passwordSalt'] },
};
const COLLECTIONS = Object.keys(SCHEMA);
function childrenOf(coll) { return (SCHEMA[coll] && SCHEMA[coll].children) || {}; }

function siglaFromName(name) {
  return String(name || '').replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 3) || 'XXX';
}
function isAssembly(t) { return t === 'macchina' || t === 'gruppo' || t === 'sottogruppo'; }

// ── Caricamento e migrazioni ────────────────────────────────
function loadDB() {
  try {
    const r = adapter.read();
    if (r) { db = JSON.parse(r); migrateDB(); markSynced(); return; }
  } catch (e) { console.error('Errore lettura locale:', e); }
  db = JSON.parse(JSON.stringify(defaultDB));
  migrateDB();
  saveDB();
  markSynced();
}
function migrateDB() {
  // Normalizzazioni legacy (idempotenti, sempre eseguite)
  if (!db.suppliers) db.suppliers = [];
  if (!db.rfqs) db.rfqs = [];
  if (!db.orders) db.orders = [];
  if (!db.plans) db.plans = [];
  if (!db.workCenters) db.workCenters = [];
  if (!db.families) db.families = JSON.parse(JSON.stringify(defaultDB.families));
  // Utenti: 1:1 con la futura tabella `profiles`. Nessun seed e nessuna
  // credenziale predefinita: senza utenti l'app apre il setup del primo admin.
  if (!db.users) db.users = [];
  db.users.forEach(u => {
    if (u.username == null) u.username = '';
    if (u.email == null) u.email = '';
    if (!USER_ROLES.includes(u.role)) u.role = 'lettore';
    if (!u.color) u.color = '#3A7BE8';
    if (u.active == null) u.active = true;
    if (u.passwordHash == null) { u.passwordHash = ''; u.passwordSalt = ''; }
  });
  if (!db.items) db.items = [];
  if (!db.revisions) db.revisions = [];   // storico delle distinte rilasciate
  if (!db.movements) db.movements = [];   // rettifiche e consumi di magazzino
  if (!db.jobs) db.jobs = [];             // commesse cliente
  // Cestino: le eliminazioni recenti, recuperabili. Si svuota da solo passata
  // la finestra di ripristino, altrimenti crescerebbe finché lo spazio del
  // browser non finisce — e a quel punto il rimedio sarebbe peggio del male.
  if (!Array.isArray(db.trash)) db.trash = [];
  else {
    const limite = new Date(Date.now() - TRASH_DAYS * 86400000).toISOString();
    db.trash = db.trash.filter(t => t && t.deletedAt && t.deletedAt >= limite);
  }
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
  // Approvvigionamento proposto alle nuove parti: 'make' | 'buy'
  if (!db.settings.partSourcingDefault) db.settings.partSourcingDefault = 'buy';
  // Durata della sessione salvata, in giorni (0 = non scade mai). Il `ts` era
  // già scritto al login e non lo leggeva nessuno: una postazione condivisa
  // restava aperta sull'utente di chi l'aveva usata mesi prima.
  if (db.settings.sessionDays == null) db.settings.sessionDays = 30;
  delete db.settings.partCostModeDefault;   // sostituito da partSourcingDefault
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
  // Concetti gestiti: seed una-tantum con i predefiniti. Idempotente e non
  // ripristina quelli cancellati (stesso criterio delle U.M.).
  if (!Array.isArray(db.settings.concepts)) {
    db.settings.concepts = DEFAULT_CONCEPTS.map(c => ({ ...c }));
  }
  // I concetti sono sempre in maiuscolo: normalizza anche quelli già salvati
  db.settings.concepts.forEach(c => { c.name = String(c.name || '').toUpperCase(); });
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
    if (r.planId == null) r.planId = null;   // richiesta nata da un piano di fabbisogno
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
    delete o.requestedDelivery;   // rimosso: ridondante con la data di consegna per riga, che sola aveva effetto
    if (o.rfqId == null) o.rfqId = null;
    if (o.planId == null) o.planId = null;   // ordine nato da un piano di fabbisogno
    if (o.supplierConfirmation == null) o.supplierConfirmation = '';
    if (o.notesInternal == null) o.notesInternal = '';
    (o.lines || []).forEach(l => {
      if (l.price == null) l.price = '';
      if (l.deliveryDate == null) l.deliveryDate = '';
      if (l.received == null) l.received = 0;
      if (l.note == null) l.note = '';
    });
  });
  // Piani di produzione. L'unico stato è aperto/chiuso, e decide se il piano
  // impegna materiale a magazzino. I piani salvati prima che l'impegno
  // esistesse nascono **aperti**: sono i piani in corso di chi aggiorna, e
  // dichiararli chiusi lascerebbe promettere due volte la stessa merce.
  (db.plans || []).forEach(p => {
    if (p.active == null) p.active = true;
    if (p.title == null) p.title = '';
    if (p.notes == null) p.notes = '';
    if (!Array.isArray(p.lines)) p.lines = [];
    p.lines.forEach(l => { if (l.qty == null) l.qty = 0; });
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
  // Famiglie: tipizzazione (materie prime vs commerciali) + sigla per codifica automatica.
  // Va DOPO i seed: le famiglie appena seminate non hanno sigla e la codifica per
  // famiglia (MAT-ACC-LAM-001) la richiede subito, non al ricaricamento successivo.
  (db.families || []).forEach(f => {
    if (!f.kind) f.kind = 'acquistato'; // le famiglie storiche erano tutte commerciali
    if (!f.sigla) f.sigla = siglaFromName(f.name);
    (f.subs || []).forEach(s => { if (!s.sigla) s.sigla = siglaFromName(s.name); });
  });
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
    // Listino fornitori: lo stesso articolo può essere quotato da più fornitori,
    // e le quotazioni si accumulano nel tempo. I campi singoli dell'articolo
    // (supplierId, purchasePrice/unitCost, supplierCode, supplierDesc) restano
    // il "prezzo in uso", cioè quello che entra nella costificazione: il listino
    // è la memoria da cui lo si sceglie, non un secondo calcolo parallelo.
    // Anche le parti hanno listino: molte si comprano già lavorate da terzi, e il
    // prezzo del fornitore va conservato con la stessa memoria dei commerciali.
    if (it.type === 'acquistato' || it.type === 'materiale' || it.type === 'parte') {
      if (!Array.isArray(it.priceList)) it.priceList = [];
      // Chi ha già un fornitore parte con quella quotazione in elenco, marcata
      // come in uso. Il flag rende il seed una-tantum: se poi si svuota il
      // listino, non ricompare al caricamento successivo.
      if (!it.priceListSeeded) {
        // Anche un prezzo senza fornitore diventa una quotazione "a mano": ora
        // che i prezzi si toccano solo dal listino, altrimenti resterebbe un
        // valore nella costificazione che nessuna schermata può più correggere.
        const prezzo = it.type === 'acquistato' ? it.purchasePrice : it.unitCost;
        if (it.supplierId || Number(prezzo) > 0) {
          const riga = stampNew({
            id: newId(), supplierId: it.supplierId || null, price: Number(prezzo) || 0,
            minQty: '', leadDays: '', code: it.supplierCode || '', desc: it.supplierDesc || '',
            date: (it.updatedAt || nowISO()).slice(0, 10), rfqId: null, note: '',
          });
          it.priceList.push(riga);
          it.activePriceId = riga.id;
        }
        it.priceListSeeded = true;
      }
    }
    // Approvvigionamento della parte: si produce in casa o si compra. Ha preso il
    // posto del vecchio modo di calcolo (costMode), che rispondeva alla stessa
    // domanda per metà — da dove viene il costo — lasciando all'utente il compito
    // di tenere i due interruttori d'accordo. La conversione conserva il
    // comportamento precedente, costo e fabbisogno insieme:
    //   'unit' → il costo era il campo manuale e la distinta non si esplodeva:
    //            è esattamente una parte comprata.
    //   'cycle'/'sum' → il costo veniva dal ciclo e la distinta si esplodeva:
    //            produzione interna. Per 'sum' si perde la quota manuale che si
    //            sommava al ciclo, ed è una scelta: il ciclo è il costo del farla.
    if (it.type === 'parte') {
      if (it.costMode != null) {
        it.sourcing = it.costMode === 'unit' ? 'buy' : 'make';
        delete it.costMode;
      } else if (it.sourcing == null) {
        // Parte mai passata dal modo di calcolo: col ciclo la si fa, senza la si compra
        it.sourcing = (it.cycle || []).length ? 'make' : 'buy';
      }
    }
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

// ── Validazione di un backup prima di aprirlo ───────────────
// `importSnapshot` guardava solo `Array.isArray(data.items)`: un file troncato a
// metà — download interrotto, chiavetta estratta, JSON di tutt'altro programma —
// passava la guardia, sostituiva l'intero database e mandava `migrateDB()` a
// lavorare su strutture che nessuno aveva verificato. L'errore usciva molto
// dopo, in una vista a caso, quando i dati veri erano già stati sovrascritti.
//
// Qui si controlla la forma, non il contenuto: le collezioni sono elenchi, le
// impostazioni sono un oggetto, la versione dello schema è una che sappiamo
// leggere. Il resto lo normalizza migrateDB(), che è fatto per dati vecchi ma
// non per dati assurdi.
function validateSnapshot(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 'il file non contiene un database Bomtrack';
  // Gli articoli sono l'unica collezione obbligatoria: un backup senza `items`
  // non è un database Bomtrack, mentre le altre possono mancare nei file vecchi
  // (migrateDB le ricostruisce vuote).
  if (!Array.isArray(data.items)) return 'manca l\'elenco degli articoli: il file non è un backup di Bomtrack, o è troncato';
  for (const c of COLLECTIONS) {
    if (data[c] != null && !Array.isArray(data[c])) return `"${c}" doveva essere un elenco: il file è danneggiato`;
  }
  if (data.settings != null && (typeof data.settings !== 'object' || Array.isArray(data.settings))) {
    return 'le impostazioni sono danneggiate';
  }
  const v = data.schemaVersion;
  if (v != null && (typeof v !== 'number' || !isFinite(v) || v < 1)) return 'versione dello schema non leggibile';
  // Un file più recente dell'app va fermato: le migrazioni sanno salire, non
  // scendere, e aprirlo lo degraderebbe in silenzio.
  if (typeof v === 'number' && v > SCHEMA_VERSION) {
    return `il file viene da una revisione più recente dell'app (schema v${v}, questa legge fino alla v${SCHEMA_VERSION}): aggiorna Bomtrack prima di importarlo`;
  }
  return null;
}
// Cosa c'è dentro, per dirlo prima di sovrascrivere.
function snapshotCounts(data) {
  const out = {};
  COLLECTIONS.forEach(c => { out[c] = Array.isArray(data && data[c]) ? data[c].length : 0; });
  return out;
}

// ── Cosa è cambiato dall'ultimo allineamento ────────────────
// Oggi il salvataggio riscrive tutto il database e la domanda non si pone. Con
// un backend condiviso si pone eccome: mandare l'intero database a ogni
// modifica significa che l'ultimo che salva cancella il lavoro di tutti gli
// altri, in silenzio.
//
// Il conto si fa confrontando lo stato attuale con una fotografia degli id e dei
// loro `updatedAt`, presa all'ultimo allineamento. Costa una passata sui record,
// contro la serializzazione dell'intero database che il salvataggio già fa: in
// proporzione, nulla.
//
// Perché `updatedAt` e non un confronto del contenuto: è lo stesso criterio con
// cui il backend deciderà chi vince (last-write-wins su `updated_at`). Un record
// il cui `updatedAt` non è cambiato non è una modifica — per definizione del
// protocollo, non per approssimazione.
//
// Ne discende un'invariante che vale la pena scrivere: **chi modifica un record
// senza chiamare `touch()` è invisibile alla sincronizzazione.** Vale già oggi
// per i campi di audit, quindi non è una regola nuova; da qui in poi, però, non
// costa più solo una data sbagliata.
//
// Le impostazioni fanno eccezione: sono un oggetto solo, senza `updatedAt`, e le
// viste ci scrivono dentro direttamente. Lì si confronta il contenuto, che è
// piccolo.
let _baseIds = null;        // Map collezione → Map(id → updatedAt)
let _baseSettings = '';
function safeStringify(v) { try { return JSON.stringify(v); } catch (e) { return ''; } }
function markSynced() {
  const m = new Map();
  COLLECTIONS.forEach(c => {
    const inner = new Map();
    (db[c] || []).forEach(r => { if (r && r.id != null) inner.set(r.id, r.updatedAt || ''); });
    m.set(c, inner);
  });
  _baseIds = m;
  _baseSettings = safeStringify(db.settings);
}
// { items: { upsert: [id…], remove: [id…] }, …, settings: true }
// Le collezioni senza modifiche non compaiono. `null` = nessuna fotografia
// ancora presa (database mai caricato).
function pendingChanges() {
  if (!_baseIds) return null;
  const out = {};
  COLLECTIONS.forEach(c => {
    const prima = _baseIds.get(c) || new Map();
    const upsert = [], remove = [], visti = new Set();
    (db[c] || []).forEach(r => {
      if (!r || r.id == null) return;
      visti.add(r.id);
      const era = prima.get(r.id);
      if (era === undefined || era !== (r.updatedAt || '')) upsert.push(r.id);
    });
    prima.forEach((_, id) => { if (!visti.has(id)) remove.push(id); });
    if (upsert.length || remove.length) out[c] = { upsert, remove };
  });
  if (safeStringify(db.settings) !== _baseSettings) out.settings = true;
  return out;
}
function hasPendingChanges() {
  const p = pendingChanges();
  return !!p && Object.keys(p).length > 0;
}

// ── Adapter di persistenza ──────────────────────────────────
// Dove finiscono i byte. Oggi localStorage; domani un backend condiviso, che si
// aggancia sostituendo questo oggetto invece di rincorrere i saveDB() sparsi
// nelle viste. Il contratto è volutamente minimo — leggi una stringa, scrivine
// una, dimmi quanto occupa — perché è tutto ciò che `Store` usa davvero.
//
// Gli errori NON si gestiscono qui: l'adapter lascia passare l'eccezione e
// `Store.commit()` la classifica (quota, storage non disponibile, dati non
// serializzabili). Così la classificazione resta in un punto solo, qualunque
// sia la destinazione dei dati.
const LocalAdapter = {
  name: 'local',
  read() { return localStorage.getItem(DB_KEY); },
  write(payload) { localStorage.setItem(DB_KEY, payload); },
  size() { try { return (localStorage.getItem(DB_KEY) || '').length; } catch (e) { return 0; } },
};
let adapter = LocalAdapter;

// ── Esito dei salvataggi ────────────────────────────────────
// Quando localStorage rifiuta la scrittura, l'app continua a funzionare
// mostrando i dati aggiornati: la memoria diverge dal persistito e alla
// chiusura del browser sparisce tutto. Va detto, e va detto in modo che non si
// possa non vederlo — non con un toast che sparisce in due secondi e mezzo.
let dbUnsaved = false;
function isQuotaError(e) {
  return !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED'
              || e.code === 22 || e.code === 1014);
}
// kind: 'quota' (spazio esaurito) | 'storage' (salvataggio non disponibile,
// es. navigazione privata) | 'serialize' (dati non serializzabili).
// La segnalazione all'utente sta in core.js, dietro l'hook onPersistError:
// store.js resta senza codice di interfaccia.
function commitFailed(kind, err, bytes) {
  dbUnsaved = true;
  console.error('Salvataggio locale fallito (' + kind + '):', err);
  if (typeof onPersistError === 'function') onPersistError(kind, { bytes, err });
  else if (typeof showToast === 'function') showToast('Errore salvataggio', 'error');
  return false;
}

// ── Store: API repository (contratto per il futuro adapter cloud) ──
const Store = {
  load() { loadDB(); },
  commit() {
    // Unico punto di scrittura: ci passano tutti i saveDB() delle viste, insert/
    // update/remove, load, reset, clearAll e importSnapshot. Invalidare qui
    // copre ogni mutazione. Prima del salvataggio, non dopo: se setItem fallisce
    // la cache resta comunque allineata a ciò che c'è in memoria.
    if (typeof invalidateCaches === 'function') invalidateCaches();
    let payload;
    try { payload = JSON.stringify(db); }
    catch (e) { return commitFailed('serialize', e, 0); }
    try {
      adapter.write(payload);
      if (dbUnsaved) {
        dbUnsaved = false;
        if (typeof onPersistRecovered === 'function') onPersistRecovered();
      }
      return true;
    } catch (e) {
      return commitFailed(isQuotaError(e) ? 'quota' : 'storage', e, payload.length);
    }
  },
  // Vero finché una modifica è rimasta solo in memoria. Chiudere la scheda in
  // questo stato perde tutto il lavoro fatto dal primo errore in poi.
  isUnsaved() { return dbUnsaved; },
  // Dimensione del database persistito, per far vedere il limite arrivare.
  sizeInfo() {
    let bytes = 0;
    try { bytes = adapter.size(); } catch (e) { /* storage non leggibile */ }
    return { bytes, mb: bytes / 1024 / 1024 };
  },
  // ── Seam per il futuro adapter cloud ──
  // Sostituire questo oggetto è l'unico punto da cui passa la destinazione dei
  // dati: nessuna vista sa dove finiscono, e nessuna deve saperlo.
  get adapter() { return adapter; },
  set adapter(a) { adapter = a || LocalAdapter; },
  // Cosa non è ancora stato mandato al backend, e riallineamento dopo un invio
  // riuscito. In locale nessuno li chiama: il salvataggio riscrive tutto.
  pendingChanges() { return pendingChanges(); },
  hasPendingChanges() { return hasPendingChanges(); },
  markSynced() { markSynced(); },
  schema() { return SCHEMA; },
  reset() {
    db = JSON.parse(JSON.stringify(defaultDB));
    migrateDB();
    this.commit();
  },
  // Svuota il database: nessun dato di esempio, nessuna anagrafica, nessuna
  // impostazione. migrateDB() ricostruisce lo scheletro e semina famiglie e
  // U.M. predefinite: qui si torna a svuotarle e si alzano i flag di seed,
  // altrimenti il seed una-tantum ripopolerebbe subito il db appena azzerato.
  // L'autore delle modifiche (createdBy/updatedBy). null = nessuna sessione.
  setActor(id) { actorId = id || null; },
  getActor() { return actorId; },
  // keepUser: l'utente che sta azzerando, ricreato come admin — chi svuota il
  // database non deve restare chiuso fuori dalla propria app.
  clearAll(keepUser) {
    db = { settings: {}, schemaVersion: SCHEMA_VERSION };
    COLLECTIONS.forEach(c => { db[c] = []; });
    if (keepUser) {
      db.users.push(stampNew(Object.assign({}, keepUser, { role: 'admin', active: true })));
    }
    migrateDB();
    db.families = [];
    db.settings.uoms = [];
    db.settings.uomDefault = '';
    db.settings.concepts = [];
    db.settings.mpFamiliesSeeded = true;
    db.settings.partFamiliesSeeded = true;
    this.commit();
  },
  getAll(coll) { return db[coll] || []; },
  getById(coll, id) { return (db[coll] || []).find(r => r.id === id); },
  // insert/remove salvano subito, uno alla volta: sono il gesto singolo
  // dell'utente ("crea fornitore", "elimina piano"). Chi inserisce in blocco —
  // l'import massivo, la generazione dei documenti da un piano — continua a
  // scrivere su `db` e a salvare una volta sola alla fine: passare di qui
  // significherebbe un salvataggio per riga, e su cinquemila righe è un'altra
  // cosa. Quelle mutazioni non restano scoperte: pendingChanges() le vede
  // comunque, perché confronta lo stato, non le chiamate.
  insert(coll, rec) {
    if (rec.id == null) rec.id = newId();
    stampNew(rec);
    if (!Array.isArray(db[coll])) db[coll] = [];
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
  // Eliminare non butta: sposta nel cestino. La riga esce dalla collezione — e
  // quindi da indici, elenchi e conti, che restano ignari — ma il record intero
  // resta da parte per TRASH_DAYS giorni.
  //
  // È volutamente un'altra collezione e non un flag `deleted` sul record: un
  // flag obbligherebbe *ogni* lettura del database a ricordarsi di escluderlo, e
  // chi se ne dimenticasse farebbe ricomparire un articolo cancellato in una
  // distinta. Qui non c'è niente da ricordarsi.
  remove(coll, id) {
    const arr = db[coll] || [];
    const i = arr.findIndex(r => r.id === id);
    if (i < 0) return false;
    const rec = arr[i];
    arr.splice(i, 1);
    if (!Array.isArray(db.trash)) db.trash = [];
    lastTrashId = newId();
    db.trash.push({ id: lastTrashId, coll, deletedAt: nowISO(), deletedBy: actorId || null, record: rec });
    this.commit();
    return true;
  },
  // La voce di cestino appena creata, per l'«Annulla» del toast. Serve un
  // riferimento esplicito: cercare «l'ultima per data» non basta, due
  // eliminazioni nello stesso millisecondo hanno la stessa data.
  lastRemoved() { return lastTrashId; },
  // Rimette il record dov'era. Best effort: se nel frattempo qualcosa che
  // citava è sparito, torna comunque — meglio un riferimento da sistemare che
  // un dato perso.
  restore(trashId) {
    const i = (db.trash || []).findIndex(t => t.id === trashId);
    if (i < 0) return null;
    const t = db.trash[i];
    if (!Array.isArray(db[t.coll])) db[t.coll] = [];
    // Se un record con lo stesso id è tornato nel frattempo (import, ripristino
    // doppio), non si duplica: vince quello vivo.
    if (!db[t.coll].some(r => r.id === t.record.id)) db[t.coll].push(t.record);
    db.trash.splice(i, 1);
    this.commit();
    return t;
  },
  purge(trashId) {
    const i = (db.trash || []).findIndex(t => t.id === trashId);
    if (i < 0) return false;
    db.trash.splice(i, 1);
    this.commit();
    return true;
  },
  emptyTrash() { db.trash = []; this.commit(); },
  trashList() { return (db.trash || []).slice().sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt))); },
  getSettings() { return db.settings; },
  setSettings(patch) { Object.assign(db.settings, patch); this.commit(); },
  exportSnapshot() { return JSON.stringify(db, null, 2); },
  importSnapshot(json) {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    const err = validateSnapshot(data);
    if (err) throw new Error(err);
    db = data;
    migrateDB();
    this.commit();
  },
};

// Shim: i punti di mutazione esistenti nelle viste chiamano saveDB()
function saveDB() { Store.commit(); }
