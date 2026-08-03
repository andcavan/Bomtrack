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
// voce in cima a CHANGELOG.md (l'app si copia a mano tra PC: sapere
// quale revisione sta girando su una postazione è l'unico modo per capirlo).
const APP_VERSION = '0.41.0';

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
let mrpNet = false;          // fabbisogno netto (tolti esistente e in arrivo) invece che lordo
let orderView = 'list';      // 'list' | 'edit'
let currentOrderId = null;   // ordine aperto in editor
let orderDirty = false;      // modifiche non salvate nell'editor ordine


// ═══════════════════════════════════════════════════════════
//  UTILITY
// ═══════════════════════════════════════════════════════════
function cur() { return (db.settings && db.settings.currency) || '€'; }
function fmtN(n) { return cur() + (Number(n) || 0).toFixed(2); }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

// ─── L'unità di misura accanto al numero ───
// Un numero senza unità è un numero da indovinare. «15» in una riga di
// fabbisogno sono quindici pezzi o quindici metri? «3,20» è al pezzo o al chilo?
// Chi ha scritto quella riga lo sa; chi la legge tre settimane dopo — o il
// fornitore che riceve il PDF — no, e sbaglia in silenzio.
//
// Le quantità si formattavano già in due posti diversi (views-mrp e views-docs
// ne avevano una copia a testa, identiche per caso): la definizione sta qui, una
// sola, e con lei i tre modi di appiccicare un'unità a un numero.
//
//   fmtQty  15        →  "15"          quantità nuda (una colonna U.M. accanto)
//   fmtUom  15, 'm'   →  "15 m"        quantità con la sua unità
//   fmtPer  3.2, 'kg' →  "€3.20/kg"    prezzo o costo *per* unità
//   labelUom('Scorta minima', 'm')     →  "Scorta minima (m)"
//
// L'unità vuota non produce niente: un articolo senza U.M. resta un numero
// nudo, non "15 " con uno spazio in fondo o "15 (—)".
function fmtQty(n) { n = Number(n) || 0; return Number.isInteger(n) ? String(n) : String(+n.toFixed(3)); }
function uomSuffix(u) { return u ? ' ' + esc(u) : ''; }
function fmtUom(n, u) { return fmtQty(n) + uomSuffix(u); }
function fmtPer(n, u) { return fmtN(n) + (u ? '/' + esc(u) : ''); }
function labelUom(testo, u) { return u ? `${testo} (${esc(u)})` : String(testo); }
// L'unità di un articolo, pronta da appendere. `itemUom(null)` non lancia:
// molte righe puntano ad articoli che possono essere spariti.
function itemUom(it) { return (it && it.uom) || ''; }
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
// ─── Indice per codice articolo ───
// L'import cerca gli articoli per codice, una `db.items.find` per riga: un
// foglio da 5.000 righe su un catalogo da 5.000 articoli sono ~50 milioni di
// confronti. Serve anche al controllo di unicità del codice, che senza indice
// costerebbe una scansione a ogni salvataggio.
//
// La chiave normalizza come faceva il confronto che sostituisce: senza spazi ai
// bordi e senza distinzione di maiuscole. "M1" e " m1 " sono lo stesso codice.
function itemCodeKey(code) { return String(code == null ? '' : code).trim().toLowerCase(); }
let _codeIdx = null, _codeIdxArr = null, _codeIdxLen = -1;
function codeIndex() {
  if (_codeIdx && db.items === _codeIdxArr && db.items.length === _codeIdxLen) return _codeIdx;
  const idx = new Map();
  (db.items || []).forEach(i => {
    const k = itemCodeKey(i.code);
    // Il primo vince, come faceva il `.find()` che questo indice sostituisce:
    // finché i duplicati sono possibili, il comportamento non deve cambiare.
    if (k && !idx.has(k)) idx.set(k, i);
  });
  _codeIdx = idx; _codeIdxArr = db.items; _codeIdxLen = db.items.length;
  return idx;
}
function getItemByCode(code) { const k = itemCodeKey(code); return k ? codeIndex().get(k) : undefined; }
// Registra un articolo appena creato senza ricostruire l'indice. Serve
// all'import, che aggiunge migliaia di righe prima del salvataggio: senza
// questo, ogni riga farebbe scattare la ricostruzione (il push cambia la
// lunghezza) e si tornerebbe al costo quadratico di prima.
// Chi dimentica di chiamarla non rompe niente: la ricostruzione successiva
// rimette tutto a posto, semplicemente costa.
function codeIndexAdd(it) {
  if (!_codeIdx || db.items !== _codeIdxArr) return;
  const k = itemCodeKey(it && it.code);
  if (k && !_codeIdx.has(k)) _codeIdx.set(k, it);
  _codeIdxLen = db.items.length;
}
// Codici usati da più di un articolo. Oggi nulla lo impedisce, e l'import ci
// inciampa in silenzio: risolve sempre sul primo trovato. Il report in
// Gestione › Backup li mostra perché qualcuno decida quale tenere — rinominarli
// da soli significherebbe cambiare un identificativo aziendale di nascosto.
function duplicateCodeGroups() {
  const per = new Map();
  (db.items || []).forEach(i => {
    const k = itemCodeKey(i.code);
    if (!k) return;
    let l = per.get(k);
    if (!l) { l = []; per.set(k, l); }
    l.push(i);
  });
  const out = [];
  per.forEach((items, k) => { if (items.length > 1) out.push({ code: items[0].code, key: k, items }); });
  return out.sort((a, b) => a.key.localeCompare(b.key));
}
// ─── Indici per fornitori e centri di lavoro ───
// Stesso motivo dell'indice articoli: `db.suppliers.find(...)` compariva dentro
// il disegno di ogni riga di elenco e di ogni lavorazione del rollup.
let _supIdx = null, _wcIdx = null;
function supplierIndex() {
  if (!_supIdx) _supIdx = new Map((db.suppliers || []).map(s => [s.id, s]));
  return _supIdx;
}
function getSupplier(id) { return id ? supplierIndex().get(id) : undefined; }
function workCenterIndex() {
  if (!_wcIdx) _wcIdx = new Map((db.workCenters || []).map(w => [w.id, w]));
  return _wcIdx;
}
function getWorkCenter(id) { return id ? workCenterIndex().get(id) : undefined; }
// ─── Indice inverso figlio → padri ───
// usedBy() scansionava tutto il catalogo a ogni chiamata, e "Dove è usato" la
// invoca una volta per antenato e una seconda per ogni riga della simulazione:
// su un catalogo grande il costo diventava quadratico. L'indice si costruisce
// una volta sola per giro di disegno, come quello degli articoli.
let _parentIdx = null;
function parentIndex() {
  if (_parentIdx) return _parentIdx;
  const idx = new Map();
  const aggiungi = (childId, padre) => {
    if (!childId) return;
    let l = idx.get(childId);
    if (!l) { l = []; idx.set(childId, l); }
    // Lo stesso figlio può comparire più volte nella stessa distinta: il padre
    // va elencato una volta sola, le quantità le somma usageQty().
    if (l[l.length - 1] !== padre) l.push(padre);
  };
  (db.items || []).forEach(i => {
    if (isAssembly(i.type)) (i.components || []).forEach(c => aggiungi(c.itemId, i));
    else if (i.type === 'parte') (i.cycle || []).forEach(r => { if (r.kind !== 'op') aggiungi(r.itemId, i); });
  });
  _parentIdx = idx;
  return idx;
}
// Risultati di costOf già calcolati in questo giro di rendering.
let _costCache = new Map();
// Azzera indice e cache. Chiamata da Store.commit() — l'unico punto di scrittura
// da cui passano tutti i salvataggi — e in testa alle viste che mostrano costi.
function invalidateCaches() {
  _costCache.clear();
  _itemIdx = null; _itemIdxArr = null; _itemIdxLen = -1;
  _codeIdx = null; _codeIdxArr = null; _codeIdxLen = -1;
  _supIdx = null; _wcIdx = null; _parentIdx = null;
  if (typeof invalidateStock === 'function') invalidateStock();   // sta in views-stock.js, caricato dopo
  if (typeof invalidateItemDocs === 'function') invalidateItemDocs(); // sta in views-item.js, caricato dopo
}
// ─── Librerie esterne (PDF ed Excel) ───
// Arrivano da CDN, ma l'app è fatta per aprirsi con un doppio click su file://
// e girare anche offline. Senza rete `window.jspdf` semplicemente non esiste: la
// destrutturazione lanciava un TypeError che nessuno intercettava e l'utente
// premeva "Esporta" senza vedere accadere nulla.
function requirePdf() {
  const lib = typeof window !== 'undefined' && window.jspdf;
  if (lib && lib.jsPDF) return lib.jsPDF;
  showToast('Libreria PDF non disponibile: serve la connessione a internet al primo caricamento', 'error');
  return null;
}
function requireXlsx() {
  if (typeof XLSX !== 'undefined' && XLSX) return XLSX;
  showToast('Libreria Excel non disponibile: serve la connessione a internet al primo caricamento', 'error');
  return null;
}
// ─── Ridisegno che non fa perdere il posto ───
// Riscrive l'innerHTML di un contenitore preservando ciò che un ridisegno
// integrale butta via: lo scroll, il focus (ritrovato per id) e il punto di
// digitazione. È la regola generale dietro le toppe che le viste si erano
// scritte da sole — «ridisegna solo la lista», «salta il select se ha il
// focus», «conserva il valore del campo».
//
// Due comportamenti da conoscere:
// - se il focus è su un <select> dentro il contenitore, NON si ridisegna e si
//   ritorna false: un menu a tendina aperto che si richiude sotto il mouse non
//   si può "ripristinare", si può solo non rompere. Il chiamante ridisegnerà
//   al giro successivo.
// - il focus si ritrova per id: un campo attivo senza id non può essere
//   ripristinato, e il ridisegno glielo toglie. I campi su cui si digita
//   dentro un contenitore ridisegnabile devono avere un id.
function renderInto(id, htmlFn) {
  const host = typeof id === 'string' ? document.getElementById(id) : id;
  if (!host) return false;
  const att = document.activeElement;
  const dentro = att && (att === host || (host.contains && host.contains(att)));
  if (dentro && att.tagName === 'SELECT') return false;
  const stato = dentro && att.id ? {
    id: att.id, value: att.value,
    selStart: att.selectionStart, selEnd: att.selectionEnd,
  } : null;
  const scrollTop = host.scrollTop, scrollLeft = host.scrollLeft;
  host.innerHTML = htmlFn();
  host.scrollTop = scrollTop; host.scrollLeft = scrollLeft;
  if (stato) {
    const el = document.getElementById(stato.id);
    if (el) {
      if (el.value !== undefined && stato.value !== undefined) el.value = stato.value;
      if (el.focus) el.focus();
      if (stato.selStart != null && el.setSelectionRange) {
        try { el.setSelectionRange(stato.selStart, stato.selEnd); } catch { /* tipi senza selezione (number, date…) */ }
      }
    }
  }
  return true;
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
const VIEW_AREA = { home: null, bom: 'bom', buy: 'catalog', design: 'catalog', cycles: 'catalog', report: null, jobs: 'docs', mrp: 'docs', rfq: 'docs', orders: 'docs', manage: 'manage' };

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
// ─── Doppia unità di misura: si gestisce in metri, si compra a chilo ───
// Una barra si gestisce in metri — la distinta dice «2 m», il magazzino conta
// metri — ma il fornitore quota **a chilo**. Senza conversione il prezzo del
// listino finisce tale e quale nel costo dell'articolo, che risulta in €/kg
// mentre le quantità sono in metri: il totale della distinta è sbagliato di un
// fattore, in silenzio, e nessuno se ne accorge finché non arriva la fattura.
// È l'errore peggiore che questa app possa fare — il numero c'è, è plausibile,
// ed è falso.
//
// La divisione dei dati segue la natura di ciò che descrivono:
//   `altUom` + `altFactor` stanno sull'**articolo**, perché sono fisica e non
//   commercio: una barra pesa quel che pesa, uguale per tutti i fornitori.
//   Duplicare il fattore su ogni quotazione vorrebbe dire poterlo sbagliare in
//   un posto solo su cinque.
//   `priceUom` sta sulla **riga di listino**: quella sì è una scelta del
//   fornitore, e due fornitori possono quotare lo stesso articolo diversamente.
//
// Articoli senza `altUom` e righe senza `priceUom` si comportano esattamente
// come prima: fattore 1, nessuna conversione, nessuna migrazione.
function altUomOf(it) { return (it && it.altUom) ? String(it.altUom) : ''; }
function altFactorOf(it) {
  const f = Number(it && it.altFactor);
  return isFinite(f) && f > 0 ? f : 0;
}
// Un'unità alternativa serve solo se ha anche un fattore: senza, sarebbe
// un'etichetta che non converte niente e produrrebbe conti a caso.
function hasAltUom(it) { return !!altUomOf(it) && altFactorOf(it) > 0 && altUomOf(it) !== (it.uom || ''); }
// Quante `uom` stanno in 1 unità di gestione dell'articolo.
// Sconosciuta o uguale a quella di gestione → 1, cioè nessuna conversione.
function uomFactor(it, uom) {
  if (!uom || !hasAltUom(it) || uom === (it.uom || '')) return 1;
  return uom === altUomOf(it) ? altFactorOf(it) : 1;
}
// Gestione → altra unità (15 m → 120 kg)
function toAltUom(it, qty, uom) { return (Number(qty) || 0) * uomFactor(it, uom); }
// Altra unità → gestione (120 kg → 15 m). È la direzione che riporta a casa i
// ricevimenti: il fornitore consegna chili, il magazzino conta metri.
function fromAltUom(it, qty, uom) {
  const f = uomFactor(it, uom);
  return f > 0 ? (Number(qty) || 0) / f : (Number(qty) || 0);
}
// Le due unità di un articolo, per i menu a tendina. Una sola se non c'è la seconda.
function itemUomOptions(it, selected) {
  const uoms = [it.uom || ''];
  if (hasAltUom(it)) uoms.push(altUomOf(it));
  const sel = uoms.includes(selected) ? selected : uoms[0];
  return uoms.map(u => `<option value="${esc(u)}" ${u === sel ? 'selected' : ''}>${esc(u)}</option>`).join('');
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

// `azione` opzionale: { label, fn }. È l'annulla subito dopo un'eliminazione —
// l'unico momento in cui serve davvero, perché è l'unico in cui l'utente sa
// ancora cosa ha appena fatto. Andare a cercarlo nel cestino cinque minuti dopo
// è un'altra cosa, e infatti il cestino c'è lo stesso.
let _toastAzione = null, _toastTimer = null;
const TOAST_MS = 2500, TOAST_AZIONE_MS = 7000;   // con un pulsante serve il tempo di leggerlo e cliccarlo
function showToast(m, t = 'success', azione) {
  const el = document.getElementById('toast');
  if (!el) return;
  _toastAzione = (azione && typeof azione.fn === 'function') ? azione.fn : null;
  el.innerHTML = esc(m) + (_toastAzione
    ? ` <button class="toast-action" onclick="toastAzione()">${esc(azione.label || 'Annulla')}</button>` : '');
  el.style.background = t === 'error' ? 'var(--red)' : 'var(--green)';
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.classList.remove('show'); _toastAzione = null; }, _toastAzione ? TOAST_AZIONE_MS : TOAST_MS);
}
function toastAzione() {
  const fn = _toastAzione; _toastAzione = null;
  const el = document.getElementById('toast'); if (el) el.classList.remove('show');
  if (fn) fn();
}
// Elimina e offre di rimettere a posto. Da usare al posto di showToast dopo
// ogni Store.remove: il record è nel cestino comunque, questo è solo il modo
// più rapido di riaverlo.
function toastEliminato(msg, onUndo) {
  showToast(msg, 'success', { label: '↶ Annulla', fn: onUndo });
}
// Elimina, ridisegna, avvisa e offre di rimettere a posto: il gesto completo in
// una riga sola, così nessun punto di eliminazione se lo dimentica per strada.
// `dopo` è il ridisegno della vista, e viene richiamato anche al ripristino.
function removeConUndo(coll, id, msg, dopo) {
  if (!Store.remove(coll, id)) return false;
  const voce = Store.lastRemoved();
  if (typeof dopo === 'function') dopo();
  toastEliminato(msg, () => {
    Store.restore(voce);
    if (typeof dopo === 'function') dopo();
    showToast('Ripristinato');
  });
  return true;
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

// ─── Errori non previsti ───
// Fuori da store.js non c'era nessuna rete: un'eccezione dentro un render*
// lasciava la vista a metà — mezza tabella, un pannello vuoto — senza dire
// niente. L'utente vedeva l'app "ferma" e non aveva modo di sapere che era
// successo qualcosa, né di raccontarlo a chi doveva ripararla.
//
// Qui non si tenta nessun recupero: un errore in un render lascia comunque uno
// stato incerto, e fingere che sia tutto a posto è peggio che dirlo. Si fa
// l'unica cosa utile — renderlo visibile e conservarlo.
const ERROR_LOG_MAX = 20;    // gli ultimi errori: quanto basta a raccontare cos'è successo
const _errorLog = [];
function logAppError(kind, msg, err) {
  const rec = {
    ts: nowISO(),
    kind,
    msg: String(msg || ''),
    stack: err && err.stack ? String(err.stack).split('\n').slice(0, 8).join('\n') : '',
    view: typeof activeView !== 'undefined' ? activeView : '',
    version: APP_VERSION,
  };
  _errorLog.push(rec);
  if (_errorLog.length > ERROR_LOG_MAX) _errorLog.shift();
  return rec;
}
function appErrorLog() { return _errorLog.slice(); }
// Come per il salvataggio: la finestra esplicativa si mostra una volta sola,
// poi restano il toast e il registro. Ripeterla a ogni errore di un render che
// fallisce a ripetizione renderebbe l'app inutilizzabile.
let appErrorShown = false;
function onAppError(kind, msg, err) {
  const rec = logAppError(kind, msg, err);
  if (typeof console !== 'undefined') console.error('Errore non gestito (' + kind + '):', msg, err || '');
  if (typeof document === 'undefined' || !document.getElementById('toast')) return rec;
  showToast('Si è verificato un errore: la schermata potrebbe essere incompleta', 'error');
  if (!appErrorShown) {
    appErrorShown = true;
    setTimeout(() => showAppErrorModal(rec), 0);
  }
  return rec;
}
function showAppErrorModal(rec) {
  openModal(`<h3>⚠ Errore non previsto</h3>
    <p>Qualcosa è andato storto mentre l'app disegnava la pagina: <strong>quello che vedi a schermo potrebbe essere incompleto</strong>. I dati salvati non sono stati toccati.</p>
    <p>Ricarica la pagina per tornare a uno stato pulito. Se l'errore si ripete, scarica il registro e allegalo alla segnalazione.</p>
    <p class="muted" style="font-family:var(--mono,monospace);font-size:12px">${esc(rec.msg)}</p>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Ho capito</button>
      <button class="btn-ghost" onclick="downloadErrorLog()">⬇ Scarica registro errori</button>
      <button class="add-btn-sm" onclick="location.reload()">↻ Ricarica la pagina</button>
    </div>`, false, 'avviso');
}
function downloadErrorLog() {
  if (!_errorLog.length) { showToast('Nessun errore registrato in questa sessione'); return; }
  const testo = _errorLog.map(r =>
    `[${r.ts}] ${r.kind} · vista: ${r.view} · Bomtrack ${r.version}\n${r.msg}\n${r.stack}`).join('\n\n───\n\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([testo], { type: 'text/plain' }));
  a.download = `bomtrack-errori-${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
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
  // Rete per tutto ciò che non ha un try/catch proprio. `error` cattura anche il
  // caricamento fallito degli script CDN, che però hanno già le loro guardie
  // (requirePdf/requireXlsx) e non vanno segnalati due volte.
  window.addEventListener('error', e => {
    if (e.target && e.target !== window && e.target.tagName) return;   // risorsa non caricata, non un'eccezione
    onAppError('errore', e.message || 'errore sconosciuto', e.error);
  });
  // Indietro/Avanti del browser e link con hash: la navigazione risponde
  // all'indirizzo. Riferimento differito: onHashChange sta in shell.js.
  window.addEventListener('hashchange', () => onHashChange());
  window.addEventListener('unhandledrejection', e => {
    const r = e.reason;
    onAppError('promessa', r && r.message ? r.message : String(r), r instanceof Error ? r : null);
  });
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
