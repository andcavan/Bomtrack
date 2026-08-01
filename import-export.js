// ═══════════════════════════════════════════════════════════
//  BOMTRACK — import-export.js
// ═══════════════════════════════════════════════════════════
// Import massivo da Excel, backup JSON e avvio dell'applicazione.
// L'avvio (init) sta in fondo all'ultimo script caricato: quando parte, tutte
// le funzioni degli altri file esistono già.
// Classic script, scope globale condiviso con gli altri: nessun modulo e
// nessun build, così index.html continua ad aprirsi con un doppio click.

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
  if (!requireXlsx()) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const wb = XLSX.read(new Uint8Array(reader.result), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) throw new Error('foglio vuoto');
      cb(XLSX.utils.sheet_to_json(ws, { defval: '' }));
    } catch (e) { console.error(e); showToast('File non valido', 'error'); }
  };
  // Un file illeggibile (disco rimosso, permessi) non deve restare in silenzio
  reader.onerror = () => { console.error(reader.error); showToast('Impossibile leggere il file', 'error'); };
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
  // Sinonimi. `componentecommerciale` non è un vezzo: è la dicitura che scrive
  // il template scaricabile qui sotto, e fino alla 0.21.0 l'import rifiutava le
  // righe del proprio esempio. `materieprime` è il plurale che si usa davvero.
  if (n === 'materiaprima' || n === 'materiaprime' || n === 'materieprime' || n === 'mp') return 'materiale';
  if (n === 'commerciale' || n === 'commerciali' || n === 'comm'
    || n === 'componentecommerciale' || n === 'componenticommerciali') return 'acquistato';
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

    // Upsert per codice, risolto sull'indice: la scansione lineare qui dentro
    // rendeva l'import quadratico sulla dimensione del catalogo.
    let it = code ? getItemByCode(code) : null;
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
    // Un'U.M. non ancora in elenco viene registrata, così resta selezionabile
    it.uom = ensureUom(pick(row, 'UM', 'U.M.', 'UnitaDiMisura', 'Unità') || it.uom || defaultUom());
    it.active = true;
    const notes = String(pick(row, 'Note', 'Notes')).trim();
    if (notes) it.notes = notes; else if (isNew) it.notes = '';

    // Doppia unità: vanno insieme o non valgono. Un'unità senza fattore non
    // converte niente, un fattore senza unità non si applica a niente — e nel
    // dubbio è meglio nessuna conversione che una conversione inventata.
    if (hasPriceList({ type })) {
      const au = String(pick(row, 'UMAcquisto', 'UMPrezzo', 'UnitaAcquisto')).trim();
      const af = numOr(pick(row, 'Fattore', 'FattoreConversione', 'Conversione'), 0);
      if (au && af > 0 && au !== it.uom) { it.altUom = ensureUom(au); it.altFactor = af; }
      else if (isNew) { delete it.altUom; delete it.altFactor; }
    }
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
    else if (isNew) {
      // Il codice generato può collidere con uno inserito a mano fuori schema:
      // nextCodeForPrefix() guarda solo i codici che seguono il proprio
      // pattern. Un duplicato qui farebbe risolvere l'import successivo
      // sull'articolo sbagliato, quindi si ripiega sull'id (unico per
      // costruzione) invece di crearlo.
      const auto = genItemCode(it);
      it.code = (auto && !getItemByCode(auto)) ? auto : it.id;
      if (auto && it.code !== auto) report.errors.push(`Riga ${ln}: codice automatico "${esc(auto)}" già in uso, assegnato un codice provvisorio`);
    }

    if (isNew) { stampNew(it); codeIndexAdd(it); report.created++; } else { touch(it); report.updated++; }
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
function findByCode(code) { return getItemByCode(code) || null; }
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
  const header = ['Tipo', 'Codice', 'Nome', 'UM', 'UMAcquisto', 'Fattore', 'CostoUnitario', 'PrezzoAcquisto', 'Fornitore', 'Macrofamiglia', 'Sottofamiglia', 'Note'];
  const data = [header,
    ['Materia prima', '', 'Lamiera acciaio S235', 'kg', '', '', 1.2, '', '', 'Acciaio', 'Lamiere', 'codice auto se vuoto'],
    ['Materia prima', '', 'Barra tonda Ø30 S355', 'm', 'kg', 5.55, '', '', 'Rossi Acciai', 'Acciaio', 'Barre', 'gestita a metri, comprata a chilo'],
    ['Componente commerciale', '', 'Cuscinetto SKF 6204', 'pz', '', '', '', 12.5, 'SKF', 'Meccanico', 'Cuscinetti', ''],
    ['Parte', '', 'Fiancata lavorata', 'pz', '', '', 45, '', '', 'Carpenteria', 'Fiancate', 'codice auto se vuoto'],
    ['Sottogruppo', 'SGR-100', 'Gruppo motore', 'pz', '', '', '', '', '', '', '', 'la distinta si carica con il foglio Distinte'],
    ['Gruppo', 'GRP-100', 'Gruppo telaio', 'pz', '', '', '', '', '', '', '', ''],
    ['Macchina', 'MAC-100', 'Nastro Trasportatore NT-200', 'pz', '', '', '', '', '', '', '', ''],
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
    ['UM', 'Unità di misura di gestione: quella con cui l\'articolo va in distinta e a magazzino (default pz).'],
    ['UMAcquisto', 'Solo se il fornitore quota in un\'altra unità (es. barra gestita a metri, comprata a chilo). Vuoto = come UM.'],
    ['Fattore', 'Quante UMAcquisto stanno in una UM (es. 5,55 kg per ogni metro). Serve insieme a UMAcquisto: da soli non valgono.'],
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

// Lo spazio di localStorage è circa 5 MB per sito: oltre i 4 conviene saperlo
// prima di sbatterci contro, non quando il salvataggio comincia a fallire.
const DB_SIZE_WARN_MB = 4;
function dbSizeLine() {
  const { mb } = Store.sizeInfo();
  const vicino = mb >= DB_SIZE_WARN_MB;
  return `<p style="margin-top:6px">Spazio occupato: <strong${vicino ? ' style="color:var(--red)"' : ''}>${mb.toFixed(2)} MB</strong>
    ${vicino ? '— vicino al limite del browser (circa 5 MB). Esporta un backup e alleggerisci il database.' : 'sui circa 5 MB che il browser riserva a questa app.'}</p>`;
}
function renderBackup() {
  return `<div class="cloud-section">
    <div style="flex:1">
      <strong>💾 Backup locale</strong>
      <p>I dati sono salvati nel browser (localStorage). Esporta un file JSON per conservare un backup o trasferire i dati su un altro PC. L'import sovrascrive i dati attuali.</p>
      ${dbSizeLine()}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
        <button class="add-btn-sm" onclick="exportBackup()">⬇ Esporta JSON</button>
        <button class="btn-outline" onclick="document.getElementById('import-file').click()">⬆ Importa JSON</button>
        <input type="file" id="import-file" accept="application/json,.json" style="display:none" onchange="importBackup(event)">
        <button class="btn-outline" style="color:var(--red);border-color:var(--red)" onclick="resetDB()">↺ Ripristina dati esempio</button>
      </div>
    </div></div>
  ${renderTrash()}
  ${renderDuplicateCodes()}
  <div class="cloud-section" style="margin-top:16px">
    <div style="flex:1">
      <strong>🐞 Registro errori</strong>
      <p>Gli errori non previsti di questa sessione (al massimo gli ultimi ${ERROR_LOG_MAX}). Serve a chi ripara: si azzera ricaricando la pagina, quindi va scaricato prima.
        ${appErrorLog().length ? `<strong style="color:var(--red)">${appErrorLog().length} errori registrati.</strong>` : 'Nessun errore finora.'}</p>
      <div style="margin-top:8px">
        <button class="btn-outline" onclick="downloadErrorLog()">⬇ Scarica registro errori</button>
      </div>
    </div></div>
  <div class="cloud-section" style="border-color:var(--red);margin-top:16px">
    <div style="flex:1">
      <strong style="color:var(--red)">🗑 Azzera tutto</strong>
      <p>Svuota completamente il database: articoli, distinte, richieste, ordini, fornitori, famiglie, centri di lavoro, unità di misura, dati azienda e impostazioni. Non restano nemmeno i dati di esempio. <strong>L'operazione è irreversibile</strong>: esporta prima un backup JSON.</p>
      <div style="margin-top:8px">
        <button class="btn-outline" style="color:var(--red);border-color:var(--red)" onclick="wipeAll()">🗑 AZZERA TUTTO</button>
      </div>
    </div></div>`;
}
// ─── Cestino ───
// Le eliminazioni non spariscono più: restano qui per TRASH_DAYS giorni, poi se
// ne vanno da sole al caricamento successivo. L'annulla nel toast copre il
// pentimento immediato; questo copre quello di domani mattina.
const TRASH_LABELS = { items: 'Articolo', suppliers: 'Fornitore', workCenters: 'Centro di lavoro',
  families: 'Macrofamiglia', rfqs: 'Richiesta', orders: 'Ordine', plans: 'Piano', users: 'Utente',
  jobs: 'Commessa', movements: 'Movimento', revisions: 'Revisione' };
function trashDescr(t) {
  const r = t.record || {};
  return r.number || r.code || r.name || r.title || '(senza nome)';
}
function renderTrash() {
  const voci = Store.trashList();
  if (!voci.length) {
    return `<div class="cloud-section" style="margin-top:16px">
      <div style="flex:1">
        <strong>🗑 Cestino</strong>
        <p>Vuoto. Ciò che elimini resta qui <strong>${TRASH_DAYS} giorni</strong> e si può rimettere a posto; passati quelli sparisce da solo.</p>
      </div></div>`;
  }
  const righe = voci.map(t => `<div class="mgmt-item">
      <span style="width:140px">${esc(TRASH_LABELS[t.coll] || t.coll)}</span>
      <span style="flex:1;font-family:var(--mono)">${esc(trashDescr(t))}</span>
      <span class="empty-text" style="padding:0">${esc(String(t.deletedAt || '').slice(0, 10))}${t.deletedBy ? ' · ' + esc(actorName(t.deletedBy)) : ''}</span>
      <button class="btn-ghost" onclick="restoreFromTrash('${t.id}')">↶ Ripristina</button>
      <button class="mini-btn danger" title="Elimina definitivamente" onclick="purgeFromTrash('${t.id}')">🗑</button>
    </div>`).join('');
  return `<div class="cloud-section" style="margin-top:16px">
    <div style="flex:1">
      <strong>🗑 Cestino — ${voci.length} ${voci.length === 1 ? 'elemento' : 'elementi'}</strong>
      <p>Eliminazioni degli ultimi <strong>${TRASH_DAYS} giorni</strong>, recuperabili. Passata quella finestra spariscono da sole al caricamento successivo: il cestino non deve diventare il posto dove il database cresce senza che nessuno guardi.</p>
      <div style="display:flex;flex-direction:column;gap:6px;margin-top:8px">${righe}</div>
      <div style="margin-top:10px"><button class="btn-outline" style="color:var(--red);border-color:var(--red)" onclick="emptyTrashConfirm()">Svuota il cestino</button></div>
    </div></div>`;
}
function restoreFromTrash(trashId) {
  if (!roleGuard('manage')) return;
  const t = Store.restore(trashId);
  renderManage();
  showToast(t ? `${TRASH_LABELS[t.coll] || t.coll} "${trashDescr(t)}" ripristinato` : 'Voce non trovata', t ? 'success' : 'error');
}
function purgeFromTrash(trashId) {
  if (!roleGuard('manage')) return;
  askConfirm('Eliminare definitivamente questa voce? Da qui in poi non si recupera più.', () => {
    Store.purge(trashId); renderManage(); showToast('Eliminato definitivamente');
  });
}
function emptyTrashConfirm() {
  if (!roleGuard('manage')) return;
  const n = Store.trashList().length;
  askConfirm(`Svuotare il cestino? ${n} ${n === 1 ? 'elemento' : 'elementi'} non saranno più recuperabili.`, () => {
    Store.emptyTrash(); renderManage(); showToast('Cestino svuotato');
  });
}

// ─── Controllo dati: codici articolo duplicati ───
// Da questa versione l'app impedisce di crearne di nuovi, ma i duplicati già a
// catalogo restano, e vanno sciolti a mano prima che il codice diventi un
// vincolo del database condiviso. Qui si mostrano; a decidere quale tenere è
// una persona — rinominarli in automatico cambierebbe un identificativo
// aziendale di nascosto, e quel codice sta su disegni e ordini già emessi.
function renderDuplicateCodes() {
  const gruppi = duplicateCodeGroups();
  const bordo = gruppi.length ? 'var(--red)' : 'var(--border, #2a2a2a)';
  if (!gruppi.length) {
    return `<div class="cloud-section" style="margin-top:16px">
      <div style="flex:1">
        <strong>🔍 Controllo dati</strong>
        <p>Nessun codice articolo duplicato. È la condizione che l'import massivo dà per scontata: cercando un codice risolve sempre sul primo articolo trovato.</p>
      </div></div>`;
  }
  const quanti = gruppi.reduce((n, g) => n + g.items.length, 0);
  const righe = gruppi.map(g => `<div class="mgmt-item" style="display:block">
      <div style="font-family:var(--mono);font-weight:700;color:var(--red)">${esc(g.code)} — ${g.items.length} articoli</div>
      ${g.items.map(i => `<div style="display:flex;align-items:center;gap:8px;margin-top:4px">
          <span class="picker-type">${typeLabel(i.type)}</span>
          <span style="flex:1">${esc(i.name || '(senza nome)')}</span>
          <button class="btn-ghost" onclick="editItemModal('${i.id}')">✏ Apri</button>
        </div>`).join('')}
    </div>`).join('');
  return `<div class="cloud-section" style="border-color:${bordo};margin-top:16px">
    <div style="flex:1">
      <strong style="color:var(--red)">🔍 Controllo dati — ${gruppi.length} codici duplicati</strong>
      <p><strong>${quanti} articoli condividono ${gruppi.length} codici.</strong> L'import massivo cerca gli articoli per codice e risolve sempre sul primo trovato: reimportando un foglio, le righe di questi codici finiscono tutte sullo stesso articolo e le altre restano indietro, senza segnalazione.</p>
      <p>Vanno sciolti a mano: apri ciascun articolo e dagli un codice suo. L'app non li rinomina da sola — quel codice sta su disegni e ordini già emessi, e sceglierne uno al posto tuo sarebbe peggio del problema.</p>
      <div style="margin-top:10px;display:flex;flex-direction:column;gap:10px">${righe}</div>
    </div></div>`;
}

function exportBackup() {
  // Il backup contiene tutto, utenti e hash compresi: solo agli amministratori
  if (!roleGuard('manage')) return;
  const blob = new Blob([Store.exportSnapshot()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `bomtrack_backup_${new Date().toISOString().slice(0, 10)}.json`;
  a.click(); URL.revokeObjectURL(url);
  showToast('Backup esportato');
}
function importBackup(ev) {
  if (!roleGuard('manage')) return;
  const file = ev.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let data;
    // Il JSON illeggibile e il JSON valido ma non nostro sono due problemi
    // diversi, e chi sta importando ha bisogno di sapere quale dei due ha.
    try { data = JSON.parse(reader.result); }
    catch (e) { showToast('Il file non è un JSON leggibile: potrebbe essere troncato', 'error'); return; }
    const err = validateSnapshot(data);
    if (err) { showToast('Backup non valido: ' + err, 'error'); return; }
    // Si dice cosa sta per entrare PRIMA di sovrascrivere: dai numeri si
    // riconosce al volo un backup sbagliato o vecchio di mesi.
    const n = snapshotCounts(data);
    const cosa = [`${n.items} articoli`, `${n.suppliers} fornitori`, `${n.rfqs} richieste`,
      `${n.orders} ordini`, `${n.plans} piani`, `${n.users} utenti`].join(', ');
    const attuale = `${db.items.length} articoli, ${db.suppliers.length} fornitori, ${db.rfqs.length} richieste, ${db.orders.length} ordini`;
    askConfirm(`Il backup contiene: ${cosa}.\n\nSostituirà i dati attuali (${attuale}), che andranno persi.`, () => {
      try {
        Store.importSnapshot(data);
      } catch (e) { showToast('Import non riuscito: ' + e.message, 'error'); return; }
      resetViewState();
      if (!reconcileSession()) return;   // il backup può contenere altri utenti
      setView('bom'); showToast('Backup importato');
    }, { title: '📥 Importa backup', ok: 'Importa e sovrascrivi' });
  };
  reader.onerror = () => { console.error(reader.error); showToast('Impossibile leggere il file', 'error'); };
  reader.readAsText(file);
  ev.target.value = '';
}
function resetDB() {
  if (!roleGuard('manage')) return;
  askConfirm('Ripristinare i dati di esempio? Tutti i dati attuali saranno persi.', () => {
    Store.reset();
    resetViewState();
    if (!reconcileSession()) return;
    setView('bom'); showToast('Dati ripristinati');
  }, { title: '↩ Ripristina dati di esempio', ok: 'Ripristina' });
}
// Dopo un reset o un import il database sotto i piedi è cambiato: l'utente della
// sessione può non esserci più. Se il nuovo database non ha utenti si ricrea
// (chi ha appena ripristinato resta dentro); se ne ha altri si esce e si rientra.
function reconcileSession() {
  if (!currentUser) return true;
  const mine = getUser(currentUser.id);
  if (mine) { currentUser = mine; renderUserPill(); return true; }
  if (!userList().length) {
    const u = JSON.parse(JSON.stringify(currentUser));
    u.role = 'admin'; u.active = true;
    Store.insert('users', u);
    currentUser = u; renderUserPill(); return true;
  }
  showToast('Il database importato ha altri utenti: accedi di nuovo', 'error');
  logout();
  return false;
}
// Azzeramento totale: doppia conferma, la seconda va digitata (il click distratto non basta).
function wipeAll() {
  if (!roleGuard('manage')) return;
  const size = Store.sizeInfo();
  openModal(`<h3>🧨 Azzera tutto</h3>
    <p class="confirm-text">Il database verrà svuotato <strong>completamente</strong> e in modo <strong>irreversibile</strong>:
      ${db.items.length} articoli, ${db.rfqs.length} richieste, ${db.orders.length} ordini, ${(db.plans || []).length} piani
      (${size.mb} MB). Resti dentro come amministratore, tutto il resto sparisce.</p>
    <p class="confirm-text">Hai esportato un backup JSON? Scrivi <strong>AZZERA</strong> qui sotto per confermare.</p>
    <div class="modal-field"><input id="wipe-word" placeholder="AZZERA" autocomplete="off"
      style="text-transform:uppercase;font-family:var(--mono);font-weight:700"></div>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="btn-outline" onclick="exportBackup()">💾 Esporta backup ora</button>
      <button class="add-btn-sm btn-danger" onclick="wipeAllConfirm()">Azzera tutto</button>
    </div>`, false, 'confirm');
}
function wipeAllConfirm() {
  if (!roleGuard('manage')) return;
  if (val('wipe-word').toUpperCase() !== 'AZZERA') { showToast('Scrivi AZZERA per confermare', 'error'); return; }
  closeModal();
  // L'utente che azzera sopravvive come amministratore: la sessione resta valida
  Store.clearAll(currentUser ? JSON.parse(JSON.stringify(currentUser)) : null);
  currentUser = currentUser ? getUser(currentUser.id) : null;
  resetViewState();
  renderUserPill();
  setView('bom'); showToast('Database azzerato');
}
// Nessun documento o articolo sopravvive a un reset: azzera anche ciò che le viste tengono aperto
function resetViewState() {
  currentBomId = null; reportBomId = null;
  currentRfqId = null; currentOrderId = null;
  rfqView = 'list'; orderView = 'list';
  rfqUnlockedId = null; orderUnlockedId = null;
  rfqDirty = false; orderDirty = false;
  rfqCompareSel = []; bomExpanded = new Set(); favOnly = false;
  docFilters.rfq = { q: '', status: '', supplierId: '' };
  docFilters.order = { q: '', status: '', supplierId: '' };
}

// ═══════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════
function init() {
  Store.load();
  const ver = 'v' + APP_VERSION;
  ['app-version', 'app-version-login'].forEach(id => {
    const el = document.getElementById(id); if (el) el.textContent = ver;
  });
  // Sessione salvata → si rientra diretti; altrimenti accesso (o setup del primo admin)
  if (!restoreSession()) renderLogin();
}
// Nel browser parte da sé; sotto test (Node, nessun DOM) il file si carica
// senza avviare l'app, così la suite può pilotare Store e il motore di costo.
if (typeof document !== 'undefined') init();
