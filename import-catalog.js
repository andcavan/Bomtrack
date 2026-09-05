// ═══════════════════════════════════════════════════════════
//  BOMTRACK — import-catalog.js
// ═══════════════════════════════════════════════════════════
// Articoli ⇄ Excel, in due file: **Acquisti** (commerciali e materie prime) e
// **Progetto** (macchine, gruppi, sottogruppi, parti). È la stessa divisione che
// l'app ha già in Anagrafica (CATALOG_SCOPES) e nei ruoli, e sono due mestieri
// diversi: l'ufficio acquisti compila fornitori e prezzi, la progettazione
// compila sigle e appartenenze. Due file si mandano a due persone senza dover
// spiegare quali fogli non toccare.
//
// Dentro ogni file **il tipo è il foglio**: niente colonna "Tipo" da sbagliare,
// e ogni foglio ha solo le colonne che valgono per quel tipo. Nel file Progetto
// l'ordine dei fogli è il contratto — Macchine → Gruppi → Sottogruppi → Parti —
// perché gruppi e parti referenziano la macchina *per codice*, e quel codice può
// nascere nello stesso file.
//
// L'export produce i dati veri, ed è anche il template: si esporta, si modifica,
// si ricarica. Prima di scrivere c'è 🔍 Verifica, che fa l'import per intero e
// poi annulla tutto: gli errori si leggono prima, non dopo.
//
// Classic script, scope globale condiviso con gli altri: nessun modulo e
// nessun build, così index.html continua ad aprirsi con un doppio click.

// ═══════════════════════════════════════════════════════════
//  DIZIONARIO DELLE COLONNE
// ═══════════════════════════════════════════════════════════
// Intestazioni e lettori nascono qui, in un punto solo: l'export scrive queste
// stringhe e l'import cerca queste stringhe, quindi non possono divergere.
//
// Le obbligatorie sono marcate con " *", e non costa niente: normHeader() toglie
// tutto ciò che non è a-z0-9, quindi "Nome *" e "Nome" sono la stessa chiave.
// Attenzione a inventare colonne nuove: la chiave è il nome *normalizzato*, e
// "Codice articolo" NON è "Codice". Oggi sono tutte distinte — Codice, Codice
// macchina, Codice gruppo, Codice fornitore, Codice articolo; UM, UM acquisto,
// UM prezzo; Data, Data prezzo; Nome, Nome composto.
const CAT_ALIAS = {
  'Codice': ['Code'],
  'Nome *': ['Nome', 'Name', 'Denominazione'],
  'UM *': ['UM', 'U.M.', 'Unità', 'UnitaDiMisura'],
  'UM acquisto': ['UMAcquisto', 'UnitaAcquisto'],
  'Fattore': ['FattoreConversione', 'Conversione'],
  'Macrofamiglia': ['Famiglia', 'Family'],
  'Sottofamiglia': ['SubFamily'],
  'Fornitore': ['Supplier'],
  'Prezzo': ['PrezzoAcquisto', 'Price'],
  'UM prezzo': ['UMPrezzo'],
  'Q.tà min': ['QtaMin', 'Quantità minima', 'MinQty'],
  'GG consegna': ['GiorniConsegna', 'LeadDays', 'Consegna'],
  'Codice fornitore': ['CodiceFornitore', 'SupplierCode'],
  'Descrizione fornitore': ['DescrizioneFornitore', 'SupplierDesc'],
  'Data prezzo': ['DataPrezzo'],
  'Scorta minima': ['ScortaMinima', 'SafetyStock'],
  'Lotto riordino': ['LottoRiordino', 'LotSize', 'Lotto'],
  'Preferito': ['Favorite'],
  'Obsoleto': ['Obsolete'],
  'Note': ['Notes'],
  'Sigla': ['SiglaCodice'],
  'Codice macchina *': ['Codice macchina', 'Macchina', 'CodiceMacchina'],
  'Codice macchina': ['Macchina', 'CodiceMacchina'],
  'Codice gruppo': ['Gruppo', 'CodiceGruppo'],
  'N° car. sigla gruppo': ['CaratteriSiglaGruppo', 'gCodeLen'],
  'Tipo sigla gruppo': ['TipoSiglaGruppo', 'gCodeType'],
  'Cifre progressivo S': ['CifreProgressivo', 'incrDigitsS'],
  'Cifre numerazione': ['CifreNumerazione', 'incrDigitsN'],
  'Concetto *': ['Concetto', 'Concept'],
  'Descrizione *': ['Descrizione', 'DescrizioneLibera'],
  'Approvvigionamento': ['Sourcing'],
  'Codice articolo *': ['Codice articolo', 'CodiceArticolo'],
  'Prezzo *': ['Prezzo', 'Price'],
  'Data *': ['Data', 'Date'],
  'In uso': ['InUso', 'Attiva', 'Predefinita'],
};
function catNames(h) { return [h].concat(CAT_ALIAS[h] || []); }
function catCell(row, h) { return cell(row, ...catNames(h)); }
function catBool(row, h) { return boolCell(row, ...catNames(h)); }

// Un numero come lo scrive davvero un foglio italiano. `numOr` da solo
// sostituisce la prima virgola e lascia i punti: "1.234,56" diventava 1.234 —
// un prezzo plausibile, e falso. Le celle numeriche vere arrivano già come
// numeri e non passano di qui.
function catNum(row, h) {
  const v = catCell(row, h);
  if (v === null || v === '') return v;
  return catNumOf(v);
}
function catNumOf(v) {
  if (typeof v === 'number') return isFinite(v) ? v : NaN;
  let s = String(v).trim().replace(/\s|'| /g, '');
  const ic = s.lastIndexOf(','), ip = s.lastIndexOf('.');
  if (ic >= 0 && ip >= 0) {
    // Vince l'ultimo separatore: è quello decimale, l'altro sono le migliaia
    if (ic > ip) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (ic >= 0) s = s.replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? NaN : n;
}
// Una data da Excel arriva come seriale (45658), non come "2025-01-10". Si
// accettano seriale, Date e testo; si restituisce sempre yyyy-mm-dd, che è il
// formato con cui bestPriceRow() confronta le quotazioni.
function catDate(row, h) {
  const v = catCell(row, h);
  if (v === null || v === '') return v;
  return catDateOf(v);
}
function catDateOf(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const it = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (it) return `${it[3]}-${it[2].padStart(2, '0')}-${it[1].padStart(2, '0')}`;
  const n = catNumOf(s);
  if (!isNaN(n) && n > 0 && n < 300000) {
    // Epoca Excel: il giorno 1 è il 1900-01-01, con il 1900 bisestile inesistente
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000);
    return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  }
  return '';
}
function catToday() { return new Date().toISOString().slice(0, 10); }
// In export: un numero resta numero, un campo non impostato resta vuoto (le
// scorte distinguono "nessun valore" da "zero", e uno 0 finto le riempirebbe).
function catNumOut(v) { return v === '' || v == null ? '' : (Number(v) || 0); }
function catSiNo(v) { return v ? 'Sì' : ''; }
function catSupplierName(id) { const s = getSupplier(id); return s ? (s.name || '') : ''; }

// ─── Colonne per tipo ───
// [intestazione, valore in export]. L'import legge per intestazione, quindi
// l'ordine qui dentro è solo l'ordine con cui si presentano nel foglio.
const CAT_COL_PRICE = [
  ['Fornitore', (it, q) => q ? catSupplierName(q.supplierId) : ''],
  ['Prezzo', (it, q) => q ? catNumOut(q.price) : ''],
  ['UM prezzo', (it, q) => q ? (q.priceUom || '') : ''],
  ['Q.tà min', (it, q) => q ? catNumOut(q.minQty) : ''],
  ['GG consegna', (it, q) => q ? catNumOut(q.leadDays) : ''],
  ['Codice fornitore', (it, q) => q ? (q.code || '') : ''],
  ['Descrizione fornitore', (it, q) => q ? (q.desc || '') : ''],
  ['Data prezzo', (it, q) => q ? (q.date || '') : ''],
];
const CAT_COL_STOCK = [
  ['Scorta minima', it => catNumOut(it.safetyStock)],
  ['Lotto riordino', it => catNumOut(it.lotSize)],
];
const CAT_COL_FAMILY = [
  ['Macrofamiglia', it => familyName(it.familyId)],
  ['Sottofamiglia', it => subFamilyName(it.familyId, it.subFamilyId)],
];
const CAT_COL_ALTUOM = [
  ['UM acquisto', it => it.altUom || ''],
  ['Fattore', it => catNumOut(it.altFactor)],
];
// Commerciali e materie prime condividono tutto: usesFamily, hasPriceList,
// hasStock e canFavorite li trattano allo stesso modo. Una definizione, due fogli.
const CAT_COLS_BUY = [
  ['Codice', it => it.code || ''],
  ['Nome *', it => it.name || ''],
  ['UM *', it => it.uom || ''],
].concat(CAT_COL_ALTUOM, CAT_COL_FAMILY, CAT_COL_PRICE, CAT_COL_STOCK, [
  ['Preferito', it => catSiNo(it.favorite)],
  ['Obsoleto', it => catSiNo(it.obsolete)],
  ['Note', it => it.notes || ''],
]);
const CAT_COLS_MACCHINA = [
  ['Codice', it => it.code || ''],
  ['Sigla', it => it.sigla || ''],
  ['Nome *', it => it.name || ''],
  ['UM *', it => it.uom || ''],
  ['N° car. sigla gruppo', it => catNumOut(it.gCodeLen)],
  ['Tipo sigla gruppo', it => it.gCodeType || ''],
  ['Cifre progressivo S', it => catNumOut(it.incrDigitsS)],
  ['Cifre numerazione', it => catNumOut(it.incrDigitsN)],
  ['Note', it => it.notes || ''],
];
const CAT_COLS_GRUPPO = [
  ['Codice', it => it.code || ''],
  ['Codice macchina *', it => catItemCode(it.machineItemId)],
  ['Sigla', it => it.sigla || ''],
  ['Nome *', it => it.name || ''],
  ['UM *', it => it.uom || ''],
  ['Note', it => it.notes || ''],
];
const CAT_COLS_SOTTOGRUPPO = [
  ['Codice', it => it.code || ''],
  ['Codice macchina', it => catItemCode(it.machineItemId)],
  ['Codice gruppo', it => catItemCode(it.groupItemId)],
  ['Nome *', it => it.name || ''],
  ['UM *', it => it.uom || ''],
  ['Note', it => it.notes || ''],
];
const CAT_COLS_PARTE = [
  ['Codice', it => it.code || ''],
  ['Codice macchina', it => catItemCode(it.machineItemId)],
  ['Codice gruppo', it => catItemCode(it.groupItemId)],
  ['Concetto *', it => conceptName(it.conceptId)],
  ['Descrizione *', it => it.nameFree || ''],
  ['UM *', it => it.uom || ''],
  ['Approvvigionamento', it => PART_SOURCING[partSourcing(it)] || ''],
].concat(CAT_COL_FAMILY, CAT_COL_ALTUOM, CAT_COL_PRICE, CAT_COL_STOCK, [
  ['Obsoleto', it => catSiNo(it.obsolete)],
  ['Note', it => it.notes || ''],
  // Di sola lettura: il nome di una parte si compone da concetto + descrizione
  // (composePartName). Scriverlo qui non cambierebbe niente, e l'import lo ignora.
  ['Nome composto (calcolato)', it => it.name || ''],
]);
const CAT_COLS = {
  acquistato: CAT_COLS_BUY, materiale: CAT_COLS_BUY, macchina: CAT_COLS_MACCHINA,
  gruppo: CAT_COLS_GRUPPO, sottogruppo: CAT_COLS_SOTTOGRUPPO, parte: CAT_COLS_PARTE,
};
const CAT_COLS_PRICELIST = [
  ['Codice articolo *', (it) => it.code || ''],
  ['Fornitore', (it, r) => catSupplierName(r.supplierId)],
  ['Prezzo *', (it, r) => catNumOut(r.price)],
  ['UM prezzo', (it, r) => r.priceUom || ''],
  ['Q.tà min', (it, r) => catNumOut(r.minQty)],
  ['GG consegna', (it, r) => catNumOut(r.leadDays)],
  ['Codice fornitore', (it, r) => r.code || ''],
  ['Descrizione fornitore', (it, r) => r.desc || ''],
  ['Data *', (it, r) => r.date || ''],
  ['In uso', (it, r) => catSiNo(it.activePriceId === r.id)],
  ['Note', (it, r) => r.note || ''],
];
function catItemCode(id) { const it = getItem(id); return it ? (it.code || '') : ''; }

// ─── I fogli dei due file ───
// L'ordine è il contratto: gruppi, sottogruppi e parti si agganciano a codici
// che possono essere stati creati dai fogli precedenti dello stesso file.
const CATALOG_SHEET_DEFS = {
  buy: [
    { name: 'Commerciali', type: 'acquistato' },
    { name: 'Materie prime', type: 'materiale' },
  ],
  design: [
    { name: 'Macchine', type: 'macchina' },
    { name: 'Gruppi', type: 'gruppo' },
    { name: 'Sottogruppi', type: 'sottogruppo' },
    { name: 'Parti', type: 'parte' },
  ],
};
const CAT_PRICE_SHEET = 'Listino';
const CAT_SCOPE_LABEL = { buy: 'Acquisti', design: 'Progetto' };
function catScopeOf(scope) { return CATALOG_SHEET_DEFS[scope] ? scope : 'buy'; }
function catItemsOfType(type) { return (db.items || []).filter(i => i.type === type); }

// ═══════════════════════════════════════════════════════════
//  EXPORT — i dati veri, che sono anche il template
// ═══════════════════════════════════════════════════════════
// Una quotazione compare in un posto solo: quella singola e in uso sta sulla
// riga dell'articolo (il caso normale), tutte le altre stanno nel foglio
// Listino. Così il giro export → import → export non duplica e non perde niente.
function catInlineQuote(it) {
  const righe = priceRows(it);
  if (righe.length !== 1) return null;
  return it.activePriceId === righe[0].id ? righe[0] : null;
}
function catListinoRows(it) {
  const righe = priceRows(it);
  if (!righe.length || catInlineQuote(it)) return [];
  return righe;
}
function catalogSheets(scope) {
  scope = catScopeOf(scope);
  const out = [];
  CATALOG_SHEET_DEFS[scope].forEach(def => {
    const cols = CAT_COLS[def.type];
    const items = catItemsOfType(def.type);
    out.push({
      name: def.name, type: def.type,
      aoa: [cols.map(c => c[0])].concat(items.map(it => {
        const q = hasPriceList(it) ? catInlineQuote(it) : null;
        return cols.map(c => c[1](it, q));
      })),
      cols: cols.map(c => ({ wch: catWidth(c[0]) })),
    });
  });
  const listino = [];
  CATALOG_SHEET_DEFS[scope].forEach(def => {
    catItemsOfType(def.type).forEach(it => {
      catListinoRows(it).forEach(r => listino.push(CAT_COLS_PRICELIST.map(c => c[1](it, r))));
    });
  });
  out.push({ name: CAT_PRICE_SHEET,
    aoa: [CAT_COLS_PRICELIST.map(c => c[0])].concat(listino),
    cols: CAT_COLS_PRICELIST.map(c => ({ wch: catWidth(c[0]) })) });
  return out;
}
function catWidth(h) {
  if (h === 'Note' || h === 'Descrizione fornitore') return 38;
  if (h === 'Nome *' || h === 'Descrizione *' || h === 'Nome composto (calcolato)') return 34;
  if (h === 'Fornitore' || h === 'Macrofamiglia' || h === 'Sottofamiglia' || h === 'Approvvigionamento') return 24;
  if (h.indexOf('Codice') === 0) return 18;
  return 13;
}
// ─── Foglio Liste ───
// Non è decorazione: SheetJS (edizione community) non sa scrivere le convalide
// dati, quindi menu a tendina veri non ce ne sono. Un elenco contiguo su un
// foglio a parte è però esattamente ciò che serve per farsela da sé in due clic
// (Dati → Convalida → Elenco → =Liste!$B$2:$B$40), ed è anche il vocabolario a
// cui rimandano i messaggi d'errore dell'import.
function catListeAoa(scope) {
  const colonne = [];
  const push = (titolo, valori) => colonne.push([titolo].concat(valori));
  push('UM', uomList().map(u => u.code));
  const attivi = (db.suppliers || []).filter(s => s.active !== false).map(s => s.name);
  if (scope === 'buy') {
    push('Fornitori', attivi);
    [['acquistato', 'commerciali'], ['materiale', 'materie prime']].forEach(([kind, et]) => {
      const macro = [], sotto = [];
      (db.families || []).filter(f => (f.kind || 'acquistato') === kind).forEach(f => {
        if (!(f.subs || []).length) { macro.push(f.name); sotto.push(''); }
        (f.subs || []).forEach(s => { macro.push(f.name); sotto.push(s.name); });
      });
      // Macro e sotto stanno appaiate perché sono dipendenti: due elenchi piatti
      // direbbero che qualunque sottofamiglia sta sotto qualunque macrofamiglia.
      push('Macrofamiglia ' + et, macro);
      push('Sottofamiglia ' + et, sotto);
    });
  } else {
    const mac = machineItems();
    push('Codice macchina', mac.map(m => m.code || ''));
    push('Macchina', mac.map(m => m.name || ''));
    const grp = catItemsOfType('gruppo');
    push('Codice gruppo', grp.map(g => g.code || ''));
    push('Gruppo', grp.map(g => g.name || ''));
    push('Macchina del gruppo', grp.map(g => catItemCode(g.machineItemId)));
    push('Concetti', conceptList().map(c => c.name));
    push('Approvvigionamento', Object.values(PART_SOURCING));
    push('Tipo sigla gruppo', Object.values(CODE_TYPES));
    const macro = [], sotto = [];
    (db.families || []).filter(f => (f.kind || 'acquistato') === 'parte').forEach(f => {
      if (!(f.subs || []).length) { macro.push(f.name); sotto.push(''); }
      (f.subs || []).forEach(s => { macro.push(f.name); sotto.push(s.name); });
    });
    push('Macrofamiglia parti', macro);
    push('Sottofamiglia parti', sotto);
    push('Fornitori', attivi);
  }
  push('Sì / No', ['Sì', 'No']);
  const righe = Math.max(...colonne.map(c => c.length));
  const aoa = [];
  for (let r = 0; r < righe; r++) aoa.push(colonne.map(c => (c[r] === undefined ? '' : c[r])));
  return aoa;
}
function catInfoAoa(scope) {
  const comune = [
    [],
    ['Come si usa', ''],
    ['', 'Questo file è insieme l\'esportazione e il template: modificalo e ricaricalo da Gestione → Import.'],
    ['', 'Prima di caricare usa 🔍 Verifica: fa l\'import per intero e poi annulla tutto, così gli errori si leggono prima di scrivere.'],
    ['', 'Il tipo di articolo è il FOGLIO: non spostare righe da un foglio all\'altro.'],
    ['', 'Le intestazioni con * sono obbligatorie. Non rinominare le intestazioni.'],
    ['', 'Il Codice è la chiave: se esiste, l\'articolo viene aggiornato; se è vuoto, viene generato.'],
    ['', 'Una colonna cancellata lascia il campo com\'è; una colonna presente ma vuota lo svuota.'],
    ['', 'L\'import non elimina mai articoli né quotazioni: si eliminano dall\'app.'],
    ['', 'Il foglio Liste contiene tutti i valori ammessi. Menu a tendina: Dati → Convalida → Elenco → =Liste!$A$2:$A$50'],
    ['', 'Decimali con la virgola o con il punto: vanno bene entrambi. Le date come 2025-01-31 o 31/01/2025.'],
    [],
    ['Unità di misura', ''],
    // Le intestazioni non si possono arricchire con l'unità — sono la chiave con
    // cui l'import riconosce le colonne, e rinominarle romperebbe i file già in
    // giro. L'unità si dichiara qui, dove si legge prima di compilare.
    ['', 'Scorta minima, Lotto riordino e le quantità sono nell\'UM dell\'articolo (colonna UM).'],
    ['', 'Q.tà min è invece nell\'UM della quotazione (UM prezzo, se valorizzata; altrimenti UM).'],
    ['', 'GG consegna è in giorni di calendario.'],
    [],
    ['Prezzi', ''],
    ['', 'Prezzo e fornitore sulla riga articolo creano una QUOTAZIONE nel listino e diventano il prezzo in uso.'],
    ['', 'Il prezzo è per una unità: nell\'UM prezzo se valorizzata, altrimenti nell\'UM dell\'articolo.'],
    ['', 'Un articolo con più quotazioni le tiene nel foglio Listino, e la riga articolo le lascia vuote.'],
    ['', 'Una quotazione senza fornitore azzera il fornitore dell\'articolo.'],
    ['', 'UM prezzo vale solo se coincide con UM acquisto dell\'articolo; qualunque altro valore viene ignorato.'],
  ];
  if (scope === 'buy') {
    return [['ISTRUZIONI — Articoli: Acquisti (commerciali e materie prime)']].concat(comune, [
      [],
      ['Colonna', 'Descrizione'],
      ['Codice', 'Chiave. Vuoto = generato dalla famiglia (es. CMM-MEC-CUS-001).'],
      ['Nome *', 'Obbligatorio.'],
      ['UM *', 'Unità di gestione: quella con cui l\'articolo va in distinta e a magazzino.'],
      ['UM acquisto', 'Solo se il fornitore quota in un\'altra unità (barra gestita a metri, comprata a chilo).'],
      ['Fattore', 'Quante UM acquisto stanno in una UM (es. 5,55 kg per ogni metro). Vale insieme a UM acquisto: da soli non valgono.'],
      ['Macrofamiglia / Sottofamiglia', 'Create se non esistono. Determinano il codice automatico.'],
      ['Fornitore', 'Creato se non esiste.'],
      ['Scorta minima / Lotto riordino', 'Vuoto = non impostato (diverso da 0).'],
      ['Preferito / Obsoleto', 'Sì oppure vuoto.'],
      ['Esempio', 'Codice vuoto · Cuscinetto SKF 6204 · pz · famiglia Meccanico/Cuscinetti · fornitore SKF · prezzo 12,50'],
    ]);
  }
  return [['ISTRUZIONI — Articoli: Progetto (macchine, gruppi, sottogruppi, parti)']].concat(comune, [
    [],
    ['Attenzione', 'Questo file NON contiene la distinta base: una macchina importata nasce senza componenti.'],
    ['', 'La distinta si carica a parte, con il foglio Distinte (colonne CodicePadre, CodiceFiglio, Qta, Scarto%).'],
    [],
    ['I fogli si applicano in ordine', 'Macchine → Gruppi → Sottogruppi → Parti.'],
    ['', 'Un gruppo può quindi puntare a una macchina definita in questo stesso file.'],
    [],
    ['Colonna', 'Descrizione'],
    ['Sigla (macchina)', 'Solo A-Z e 0-9, unica fra le macchine. Senza sigla non c\'è codice automatico.'],
    ['N° car. sigla gruppo', 'Quanti caratteri deve avere la sigla dei suoi gruppi (1-10).'],
    ['Tipo sigla gruppo', 'Alfabetico, Numerico o Alfanumerico.'],
    ['Cifre progressivo S', 'Cifre del progressivo S## di macchine e gruppi (1-6).'],
    ['Cifre numerazione', 'Cifre del progressivo ### di sottogruppi e parti (1-6).'],
    ['Codice macchina', 'Codice di una macchina già a catalogo o presente nel foglio Macchine.'],
    ['Codice gruppo', 'Codice di un gruppo di QUELLA macchina.'],
    ['Sigla (gruppo)', 'Deve rispettare lo schema della sua macchina ed essere unica su quella macchina.'],
    ['Concetto *', 'Deve esistere già (Gestione → Concetti). Non viene creato dall\'import: finisce dentro il nome della parte, e un refuso resterebbe per sempre.'],
    ['Descrizione *', 'La parte libera del nome. Nome parte = Concetto + Descrizione.'],
    ['Approvvigionamento', 'Produzione interna oppure Acquisto da fornitore. Su una parte a produzione interna con ciclo, il prezzo di listino non diventa costo.'],
    ['Esempio', 'Parti: codice vuoto · macchina TRN-S00 · gruppo TRN-BAS-S00 · concetto ALBERO · descrizione motore 20x100 · UM pz'],
  ]);
}
function exportCatalogXlsx(scope) {
  scope = catScopeOf(scope);
  if (!requireXlsx()) return;
  const wb = XLSX.utils.book_new();
  catalogSheets(scope).forEach(sh => {
    const ws = XLSX.utils.aoa_to_sheet(sh.aoa);
    if (sh.cols) ws['!cols'] = sh.cols;
    // Filtro automatico sull'intestazione: con qualche migliaio di righe è la
    // differenza fra un foglio che si usa e uno che si guarda.
    if (sh.aoa.length > 1) ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: sh.aoa.length - 1, c: sh.aoa[0].length - 1 } }) };
    XLSX.utils.book_append_sheet(wb, ws, sh.name);
  });
  const liste = XLSX.utils.aoa_to_sheet(catListeAoa(scope));
  liste['!protect'] = { password: '' };   // non si compila: è solo da leggere e copiare
  XLSX.utils.book_append_sheet(wb, liste, 'Liste');
  const info = XLSX.utils.aoa_to_sheet(catInfoAoa(scope));
  info['!cols'] = [{ wch: 30 }, { wch: 110 }];
  info['!protect'] = { password: '' };
  XLSX.utils.book_append_sheet(wb, info, 'Istruzioni');
  XLSX.writeFile(wb, `bomtrack_${scope === 'buy' ? 'acquisti' : 'progetto'}_${catToday()}.xlsx`);
  showToast('Articoli esportati');
}

// ═══════════════════════════════════════════════════════════
//  IMPORT
// ═══════════════════════════════════════════════════════════
// Tre fasi, e l'ordine non è un dettaglio:
//   A. i fogli articolo, nell'ordine dichiarato;
//   B. il foglio Listino, che ha bisogno degli articoli della fase A;
//   C. la quotazione in uso, una volta per articolo e non una per riga.
function catStat() { return { created: 0, updated: 0, skipped: 0 }; }
function importCatalogSheets(byName, scope, opts) {
  scope = catScopeOf(scope);
  const o = opts || {};
  const rep = { scope, dryRun: !!o.dryRun, sheets: [], missing: [], foreign: [], legacy: false,
    errors: [], warnings: [], createdSuppliers: 0, createdFamilies: 0, createdSubFamilies: 0,
    createdUoms: [], preview: [] };
  const ctx = { rep, scope, seen: new Map(), touched: new Map() };
  const norm = {};
  Object.keys(byName || {}).forEach(n => { norm[normHeader(n)] = byName[n]; });

  const esegui = () => {
    codeIndex();   // costruito una volta: poi ogni articolo nuovo entra con codeIndexAdd
    const defs = CATALOG_SHEET_DEFS[scope];
    let trovati = 0;
    defs.forEach(def => {
      const rows = norm[normHeader(def.name)];
      if (!Array.isArray(rows)) { rep.missing.push(def.name); return; }
      trovati++;
      const st = catStat();
      rows.forEach((row, i) => catApplyItemRow(row, def, ctx, i + 2, st));
      rep.sheets.push(Object.assign({ name: def.name }, st));
    });
    // File caricato dal pulsante sbagliato: dirlo, invece di lasciar credere che
    // il file sia illeggibile.
    const altro = scope === 'buy' ? 'design' : 'buy';
    CATALOG_SHEET_DEFS[altro].forEach(def => {
      if (Array.isArray(norm[normHeader(def.name)])) rep.foreign.push(def.name);
    });
    const listino = norm[normHeader(CAT_PRICE_SHEET)];
    // Il ripiego sul formato precedente vale solo per un file che non ha
    // **nessun** foglio nostro: con il solo Listino leggerlo come foglio unico
    // di articoli sarebbe un modo raffinato di sbagliare tutto.
    if (!trovati && !rep.foreign.length && !Array.isArray(listino)) catLegacySheets(byName, ctx);
    if (Array.isArray(listino)) {
      const st = catStat();
      listino.forEach((row, i) => catApplyPriceRow(row, ctx, i + 2, st));
      rep.sheets.push(Object.assign({ name: CAT_PRICE_SHEET }, st));
    } else if (trovati) rep.missing.push(CAT_PRICE_SHEET);
    catFinalizePrices(ctx);
    return rep;
  };

  if (o.dryRun) return catWithRollback(esegui);
  // L'applicazione parziale riga per riga è voluta: su un foglio da 5.000 righe
  // le buone devono entrare. Un'eccezione imprevista no: quella lascerebbe il
  // database scritto a metà, e finora lo salvava pure.
  try {
    esegui();
  } catch (e) {
    console.error(e);
    throw e;
  }
  saveDB();
  return rep;
}
// Adapter che non scrive da nessuna parte: cintura di sicurezza del dry-run,
// perché un saveDB() dimenticato dentro un ramo non deve poter toccare il disco.
const CAT_NULL_ADAPTER = { name: 'nulla', read() { return null; }, write() {}, size() { return 0; } };
function catWithRollback(fn) {
  const backup = JSON.stringify(db);
  const prima = Store.adapter;
  Store.adapter = CAT_NULL_ADAPTER;
  try {
    return fn();
  } finally {
    db = JSON.parse(backup);
    // Obbligatoria: gli indici di fornitori, centri di lavoro e padri non si
    // accorgono da soli del ripristino e resterebbero puntati agli oggetti del
    // giro annullato. markSynced() invece NON va chiamata — dichiarerebbe
    // sincronizzate modifiche mai inviate.
    invalidateCaches();
    Store.adapter = prima;
  }
}

// ─── Una riga di foglio articolo ───
function catApplyItemRow(row, def, ctx, ln, st) {
  const rep = ctx.rep, type = def.type, foglio = def.name;
  const err = m => rep.errors.push(`${foglio}, riga ${ln}: ${m}`);
  const avviso = m => rep.warnings.push(`${foglio}, riga ${ln}: ${m}`);
  if (!Object.values(row).some(v => String(v == null ? '' : v).trim())) { st.skipped++; return; }

  // Colonna Tipo di troppo (o riga incollata da un altro foglio)
  const tipoRaw = cell(row, 'Tipo', 'Type');
  if (tipoRaw) {
    const t = resolveType(tipoRaw);
    if (t !== type) { err(`la colonna Tipo dice "${esc(tipoRaw)}" ma questo è il foglio ${foglio}`); return; }
  }
  const code = catCell(row, 'Codice') || '';
  if (code) {
    const k = itemCodeKey(code);
    if (ctx.seen.has(k)) { err(`codice "${esc(code)}" già usato alla riga ${ctx.seen.get(k)} di questo file`); return; }
    ctx.seen.set(k, ln);
  }
  let it = code ? getItemByCode(code) : null;
  if (it && it.type !== type) { err(`il codice "${esc(code)}" è già di ${typeLabel(it.type)}: il tipo di un articolo non si cambia da un foglio`); return; }
  const isNew = !it;
  if (isNew) {
    it = { id: gid(), type, active: true };
    if (isAssembly(type)) { it.components = []; it.operations = []; }
    if (type === 'parte') { it.cycle = []; it.sourcing = defaultPartSourcing(); }
    if (hasPriceList(it)) { it.priceList = []; it.priceListSeeded = true; }
  }

  // ── Nome ──
  if (type === 'parte') {
    const cn = catCell(row, 'Concetto *');
    const descr = catCell(row, 'Descrizione *');
    if (isNew && !cn) { err('concetto mancante'); return; }
    if (isNew && !descr) { err('descrizione mancante'); return; }
    if (cn !== null && cn !== '') {
      const c = conceptList().find(x => (x.name || '').toUpperCase() === cn.toUpperCase());
      // Il concetto non si crea dall'import: finisce dentro il nome della parte
      // e da lì in poi è congelato, quindi un refuso resterebbe per sempre.
      if (!c) { err(`concetto "${esc(cn)}" non in elenco — vedi foglio Liste, colonna Concetti`); return; }
      it.conceptId = c.id;
    }
    if (descr !== null) it.nameFree = descr;
    it.name = composePartName(it.conceptId, it.nameFree);
  } else {
    const nome = catCell(row, 'Nome *');
    if (isNew && !nome) { err('nome mancante'); return; }
    if (nome !== null && nome !== '') it.name = nome;
    else if (nome === '') { err('il nome non può restare vuoto'); return; }
  }

  // ── U.M. e doppia unità (prima del prezzo: la conversione dipende da qui) ──
  const um = catCell(row, 'UM *');
  if (um) it.uom = catEnsureUom(um, ctx);
  else if (isNew) it.uom = defaultUom();
  if (hasPriceList(it)) {
    const au = catCell(row, 'UM acquisto');
    const afRaw = catNum(row, 'Fattore');
    if (au !== null || afRaw !== null) {
      const au2 = au === null ? altUomOf(it) : au;
      const af = afRaw === null || afRaw === '' ? altFactorOf(it) : afRaw;
      if (au2 && !isNaN(af) && af > 0 && au2 !== it.uom) { it.altUom = catEnsureUom(au2, ctx); it.altFactor = af; }
      else { delete it.altUom; delete it.altFactor; }
    }
  }

  // ── Famiglia ──
  if (usesFamily(type)) {
    const fam = catCell(row, 'Macrofamiglia');
    const sub = catCell(row, 'Sottofamiglia');
    if (fam !== null || sub !== null) {
      if (fam) {
        const f = findOrCreateFamily(fam, sub || '', type, rep);
        it.familyId = f.familyId; it.subFamilyId = f.subFamilyId;
      } else if (fam === '') { it.familyId = ''; it.subFamilyId = ''; }
    }
  }

  // ── Codifica gerarchica ──
  if (type === 'macchina') {
    const sigla = catCell(row, 'Sigla');
    if (sigla) {
      const s = sigla.toUpperCase();
      if (!/^[A-Z0-9]+$/.test(s)) { err('la sigla macchina ammette solo A-Z e 0-9'); return; }
      if (machineItems().some(m => m.sigla === s && m.id !== it.id)) { err(`sigla macchina "${esc(s)}" già in uso`); return; }
      it.sigla = s;
    }
    const nums = [['N° car. sigla gruppo', 'gCodeLen', 1, 10], ['Cifre progressivo S', 'incrDigitsS', 1, 6],
      ['Cifre numerazione', 'incrDigitsN', 1, 6]];
    for (const [h, campo, min, max] of nums) {
      const v = catNum(row, h);
      if (v === null || v === '') continue;
      if (isNaN(v) || v < min || v > max) { err(`${h}: valore non valido (ammessi ${min}-${max})`); return; }
      if (!isNew && Number(it[campo] || 0) !== Math.round(v)) {
        avviso(`schema di codifica cambiato: i codici dei gruppi già a catalogo su "${esc(it.code || it.name)}" non vengono rifatti`);
      }
      it[campo] = Math.round(v);
    }
    const gt = catCell(row, 'Tipo sigla gruppo');
    if (gt) {
      const k = Object.keys(CODE_TYPES).find(x => normHeader(x) === normHeader(gt) || normHeader(CODE_TYPES[x]) === normHeader(gt));
      if (!k) { err(`tipo sigla gruppo "${esc(gt)}" sconosciuto — vedi foglio Liste`); return; }
      it.gCodeType = k;
    }
  } else if (type !== 'acquistato' && type !== 'materiale') {
    const macCode = catCell(row, type === 'gruppo' ? 'Codice macchina *' : 'Codice macchina');
    if (macCode) {
      const mac = getItemByCode(macCode);
      if (!mac) { err(`macchina "${esc(macCode)}" non trovata — vedi foglio Liste, colonna Codice macchina`); return; }
      if (mac.type !== 'macchina') { err(`"${esc(macCode)}" è ${typeLabel(mac.type)}, non una macchina`); return; }
      it.machineItemId = mac.id;
    } else if (macCode === '') it.machineItemId = '';
    if (type === 'gruppo') {
      if (isNew && !it.machineItemId) { err('codice macchina mancante'); return; }
      const sigla = catCell(row, 'Sigla');
      if (sigla) {
        const s = sigla.toUpperCase();
        const sm = machineScheme(getItem(it.machineItemId));
        const e = validateCodeFormat(s, sm.gLen, sm.gType);
        if (e) { err(e); return; }
        if (groupItemsFor(it.machineItemId).some(g => g.sigla === s && g.id !== it.id)) {
          err(`sigla gruppo "${esc(s)}" già usata su questa macchina`); return;
        }
        it.sigla = s;
      }
    } else {
      const grpCode = catCell(row, 'Codice gruppo');
      if (grpCode) {
        const grp = getItemByCode(grpCode);
        if (!grp) { err(`gruppo "${esc(grpCode)}" non trovato — vedi foglio Liste, colonna Codice gruppo`); return; }
        if (grp.type !== 'gruppo') { err(`"${esc(grpCode)}" è ${typeLabel(grp.type)}, non un gruppo`); return; }
        if (it.machineItemId && grp.machineItemId !== it.machineItemId) {
          err(`il gruppo "${esc(grpCode)}" non appartiene alla macchina indicata`); return;
        }
        it.groupItemId = grp.id;
        if (!it.machineItemId) it.machineItemId = grp.machineItemId;
      } else if (grpCode === '') it.groupItemId = '';
    }
  }

  // ── Approvvigionamento, scorte, flag, note ──
  if (type === 'parte') {
    const so = catCell(row, 'Approvvigionamento');
    if (so) {
      const k = Object.keys(PART_SOURCING).find(x => normHeader(x) === normHeader(so) || normHeader(PART_SOURCING[x]) === normHeader(so));
      if (!k) { err(`approvvigionamento "${esc(so)}" sconosciuto — vedi foglio Liste`); return; }
      it.sourcing = k;
    }
  }
  if (hasStock(it)) {
    for (const [h, campo] of [['Scorta minima', 'safetyStock'], ['Lotto riordino', 'lotSize']]) {
      const v = catNum(row, h);
      if (v === null) continue;
      if (v === '') { it[campo] = null; continue; }   // vuoto = non impostato, non zero
      if (isNaN(v) || v < 0) { err(`${h}: valore non valido`); return; }
      it[campo] = v;
    }
  }
  if (canFavorite(type)) { const f = catBool(row, 'Preferito'); if (f !== null) it.favorite = f; }
  if (usesFamily(type)) { const ob = catBool(row, 'Obsoleto'); if (ob !== null) it.obsolete = ob; }
  const note = catCell(row, 'Note');
  if (note !== null) it.notes = note;

  // ── Codice ──
  if (code) it.code = code;
  else if (isNew) {
    const auto = genItemCode(it);
    if (!auto) {
      err(type === 'gruppo' || type === 'macchina'
        ? 'codice mancante e non generabile: serve la sigla (e la macchina) oppure un codice scritto a mano'
        : 'codice mancante e non generabile: servono macchina e gruppo, oppure la macrofamiglia, oppure un codice scritto a mano');
      return;
    }
    if (getItemByCode(auto)) { err(`codice automatico "${esc(auto)}" già in uso`); return; }
    it.code = auto;
    ctx.seen.set(itemCodeKey(auto), ln);
  }

  if (isNew) {
    stampNew(it);
    db.items.push(it);
    codeIndexAdd(it);
    st.created++;
    if (rep.preview.length < 20) rep.preview.push(`${it.code} — ${it.name}`);
  } else { touch(it); st.updated++; }

  // ── Quotazione sulla riga articolo ──
  if (hasPriceList(it)) {
    const prezzo = catNum(row, 'Prezzo');
    if (prezzo !== null && prezzo !== '') {
      if (isNaN(prezzo) || prezzo < 0) { err('prezzo non valido'); return; }
      // Lo stato si fotografa PRIMA di toccare il listino: catStage registra
      // se l'articolo aveva già quotazioni, e dopo la creazione sarebbe tardi.
      const s = catStage(ctx, it);
      s.inline = catUpsertQuote(it, row, ctx, foglio, ln, prezzo);
    }
  }
}
function catEnsureUom(code, ctx) {
  const c = String(code || '').trim();
  if (c && !uomList().some(u => u.code === c) && ctx.rep.createdUoms.indexOf(c) < 0) ctx.rep.createdUoms.push(c);
  return ensureUom(c);
}
function catStage(ctx, it) {
  let s = ctx.touched.get(it.id);
  // `aveva` fotografa la situazione PRIMA di questo import: serve a non
  // attivare da soli una quotazione su un articolo che ne aveva già e che
  // qualcuno aveva deliberatamente lasciato senza prezzo in uso.
  if (!s) { s = { it, inline: null, forced: null, aveva: priceRows(it).length > 0 }; ctx.touched.set(it.id, s); }
  return s;
}
// Crea o aggiorna la quotazione. Identità = (articolo, fornitore, data): l'id
// non sta nel foglio — un uuid fra le mani di chi compila è solo rumore, e
// cambiare la data *è* una quotazione nuova.
function catUpsertQuote(it, row, ctx, foglio, ln, prezzo) {
  const rep = ctx.rep;
  const supName = catCell(row, 'Fornitore');
  const supplierId = supName ? findOrCreateSupplier(supName, rep) : (supName === '' ? null : undefined);
  const data = catDate(row, foglio === CAT_PRICE_SHEET ? 'Data *' : 'Data prezzo') || catToday();
  if (!Array.isArray(it.priceList)) it.priceList = [];
  const sid = supplierId === undefined ? null : supplierId;
  let r = it.priceList.find(x => (x.supplierId || null) === sid && (x.date || '') === data);
  const nuova = !r;
  if (nuova) {
    r = stampNew({ id: gid(), supplierId: sid, price: '', minQty: '', leadDays: '',
      code: '', desc: '', date: data, rfqId: null, note: '' });
    it.priceList.push(r);
  }
  r.price = prezzo;
  const pu = catCell(row, 'UM prezzo');
  if (pu) {
    // Solo l'unità di acquisto dell'articolo converte davvero (priceUomOf):
    // qualunque altra verrebbe ignorata in silenzio, e il silenzio qui è un
    // prezzo giusto nell'unità sbagliata.
    if (pu === altUomOf(it)) r.priceUom = pu;
    else if (pu !== it.uom) rep.warnings.push(`${foglio}, riga ${ln}: "UM prezzo" ${esc(pu)} non è l'unità di acquisto di ${esc(it.code)}: ignorata`);
  }
  for (const [h, campo] of [['Q.tà min', 'minQty'], ['GG consegna', 'leadDays']]) {
    const v = catNum(row, h);
    if (v === null) continue;
    r[campo] = v === '' || isNaN(v) ? '' : v;
  }
  const sc = catCell(row, 'Codice fornitore'); if (sc !== null) r.code = sc;
  const sd = catCell(row, 'Descrizione fornitore'); if (sd !== null) r.desc = sd;
  const nt = catCell(row, 'Note'); if (nt !== null && foglio === CAT_PRICE_SHEET) r.note = nt;
  if (!nuova) touch(r);
  return r;
}
// ─── Foglio Listino ───
function catApplyPriceRow(row, ctx, ln, st) {
  const rep = ctx.rep;
  const err = m => rep.errors.push(`${CAT_PRICE_SHEET}, riga ${ln}: ${m}`);
  if (!Object.values(row).some(v => String(v == null ? '' : v).trim())) { st.skipped++; return; }
  const code = catCell(row, 'Codice articolo *');
  if (!code) { err('codice articolo mancante'); return; }
  const it = getItemByCode(code);
  if (!it) { err(`articolo "${esc(code)}" non trovato: importa prima i fogli articolo`); return; }
  if (!hasPriceList(it)) { err(`${typeLabel(it.type)} non ha listino`); return; }
  const prezzo = catNum(row, 'Prezzo *');
  if (prezzo === null || prezzo === '' || isNaN(prezzo) || prezzo < 0) { err('prezzo non valido'); return; }
  const s = catStage(ctx, it);          // prima di toccare il listino: vedi catStage
  const prima = priceRows(it).length;
  const r = catUpsertQuote(it, row, ctx, CAT_PRICE_SHEET, ln, prezzo);
  if (!r) return;
  if (catBool(row, 'In uso') === true) {
    if (s.forced && s.forced !== r) rep.warnings.push(`${CAT_PRICE_SHEET}, riga ${ln}: più di una quotazione "In uso" per ${esc(code)}: vale l'ultima`);
    s.forced = r;
  }
  touch(it);
  if (priceRows(it).length > prima) st.created++; else st.updated++;
}
// ─── Fase C: quale quotazione va in uso ───
function catFinalizePrices(ctx) {
  ctx.touched.forEach(s => {
    const it = s.it;
    let riga = s.forced || s.inline;
    // Ripiego per l'articolo che non ne aveva nessuna: una sola quotazione e
    // nessuno che dica quale usare vuol dire quella.
    if (!riga && !s.aveva && priceRows(it).length === 1) riga = priceRows(it)[0];
    if (!riga) return;
    applyPriceRow(it, riga);
    touch(it);
    // Su una parte prodotta in casa il costo viene dal ciclo: la quotazione
    // entra a listino ma non muove il costo, e tacerlo sembrerebbe un bug.
    if (!costField(it)) {
      ctx.rep.warnings.push(`${esc(it.code)}: la parte è a produzione interna, il prezzo è registrato a listino ma non diventa costo`);
    }
  });
}
// ─── File nel formato precedente (foglio unico con colonna Tipo) ───
// Non è una seconda implementazione: è solo un'altra mappatura di colonne sopra
// lo stesso applicatore di riga, così i file già in giro ereditano gratis la
// regola nuova — prezzo e fornitore diventano una quotazione a listino. Le
// intestazioni di allora (Nome, UM, UMAcquisto, PrezzoAcquisto) sono già fra gli
// alias di CAT_ALIAS: l'unica che cambia significato è CostoUnitario.
function catLegacySheets(byName, ctx) {
  const primo = Object.keys(byName || {}).find(n => Array.isArray(byName[n]) && byName[n].length);
  if (!primo) return;
  ctx.rep.legacy = true;
  const st = catStat();
  let altri = 0;
  byName[primo].forEach((row, i) => {
    const ln = i + 2;
    const tipoRaw = pick(row, 'Tipo', 'Type');
    const type = resolveType(tipoRaw);
    if (!type) {
      if (Object.values(row).some(v => String(v == null ? '' : v).trim())) {
        ctx.rep.errors.push(`${primo}, riga ${ln}: tipo non valido ("${esc(tipoRaw)}")`);
      } else st.skipped++;
      return;
    }
    // Le righe dell'altro mestiere non sono un errore: il foglio unico di prima
    // li teneva insieme. Si saltano, e si dice da quale pulsante caricarle —
    // una riga d'avviso, non cinquecento righe rosse.
    if (!CATALOG_SHEET_DEFS[ctx.scope].some(d => d.type === type)) { altri++; st.skipped++; return; }
    const riga = Object.assign({}, row);
    // Il vecchio foglio chiamava "CostoUnitario" il prezzo delle materie prime
    if ((type === 'materiale' || type === 'parte') && pick(row, 'CostoUnitario', 'Costo') !== '') {
      riga['Prezzo'] = pick(row, 'CostoUnitario', 'Costo');
    }
    catApplyItemRow(riga, { name: primo, type }, ctx, ln, st);
  });
  if (altri) {
    const altro = ctx.scope === 'buy' ? 'Progetto' : 'Acquisti';
    ctx.rep.warnings.push(`${primo}: ${altri} righe sono di tipi che appartengono al file ${altro} — ricarica lo stesso file dal pulsante ${altro}.`);
  }
  ctx.rep.sheets.push(Object.assign({ name: primo + ' (formato precedente)' }, st));
}

// ═══════════════════════════════════════════════════════════
//  INTERFACCIA
// ═══════════════════════════════════════════════════════════
function onCatalogFile(ev, scope, dryRun) {
  const file = ev.target.files[0]; ev.target.value = '';
  if (!file) return;
  if (!roleGuard('catalog')) return;
  readWorkbook(file, byName => {
    window.__lastCatalogImport = { scope: catScopeOf(scope), byName };
    catRunImport(!!dryRun);
  });
}
function catRunImport(dryRun) {
  const pending = window.__lastCatalogImport;
  if (!pending) { showToast('Nessun file da importare', 'error'); return; }
  if (!roleGuard('catalog')) return;
  let rep;
  try {
    rep = importCatalogSheets(pending.byName, pending.scope, { dryRun });
  } catch (e) {
    console.error(e);
    showToast('Import non riuscito: ' + e.message, 'error');
    return;
  }
  showCatalogReport(rep);
}
function showCatalogReport(rep) {
  const tot = rep.sheets.reduce((a, s) => ({ c: a.c + s.created, u: a.u + s.updated }), { c: 0, u: 0 });
  const cards = [['Creati', tot.c], ['Aggiornati', tot.u], ['Avvisi', rep.warnings.length], ['Errori', rep.errors.length]]
    .map(([l, v]) => `<div class="kpi-card ${(l === 'Errori' || l === 'Avvisi') && v ? 'orange' : ''}"><div class="kpi-value">${v}</div><div class="kpi-label">${l}</div></div>`).join('');
  const righe = rep.sheets.map(s => `<div class="mgmt-item">
      <span class="mgmt-item-name">${esc(s.name)}</span>
      <span class="mgmt-item-meta">${s.created} creati · ${s.updated} aggiornati · ${s.skipped} righe vuote</span>
    </div>`).join('') || '<div class="empty-text">Nessun foglio riconosciuto.</div>';
  const note = [];
  if (rep.foreign.length) {
    const altro = rep.scope === 'buy' ? 'Progetto' : 'Acquisti';
    note.push(`<strong style="color:var(--red)">Questo sembra il file ${altro}</strong> (contiene ${esc(rep.foreign.join(', '))}): caricalo dal pulsante ${altro}.`);
  }
  if (rep.legacy) note.push('File nel <strong>formato precedente</strong> (foglio unico con colonna Tipo), letto in compatibilità.');
  if (rep.missing.length) note.push('Fogli assenti dal file, saltati: ' + esc(rep.missing.join(', ')) + '.');
  const auto = [];
  if (rep.createdSuppliers) auto.push(`${rep.createdSuppliers} fornitori`);
  if (rep.createdFamilies) auto.push(`${rep.createdFamilies} famiglie`);
  if (rep.createdSubFamilies) auto.push(`${rep.createdSubFamilies} sottofamiglie`);
  if (auto.length) note.push('Creati automaticamente: ' + auto.join(', ') + '.');
  if (rep.createdUoms.length) note.push(`<strong>Unità di misura nuove</strong>: ${esc(rep.createdUoms.join(', '))} — se è un refuso, correggilo in Gestione → Unità di misura.`);
  const blocco = (titolo, voci, colore) => voci.length
    ? `<div style="margin-top:12px"><strong style="color:${colore}">${titolo} (${voci.length}):</strong>
        <div class="picker-results" style="max-height:200px;margin-top:6px">${voci.map(e => `<div class="picker-row">${e}</div>`).join('')}</div></div>` : '';
  const anteprima = rep.dryRun && rep.preview.length
    ? `<div style="margin-top:12px"><strong>Articoli che verrebbero creati</strong> (primi ${rep.preview.length}):
        <div class="picker-results" style="max-height:160px;margin-top:6px">${rep.preview.map(p => `<div class="picker-row" style="font-family:var(--mono)">${esc(p)}</div>`).join('')}</div></div>`
    : '';
  const azioni = rep.dryRun
    ? `<button class="btn-ghost" onclick="closeModal()">Chiudi</button>
       <button class="add-btn-sm" onclick="catRunImport(false)">${ico('upload', 'tinted', '')} Importa davvero</button>`
    : `<button class="add-btn-sm" onclick="closeCatalogReport()">Chiudi</button>`;
  openModal(`<h3>${rep.dryRun ? ico('search', 'tinted pill', '') + ' Verifica' : ico('list', 'tinted pill', '') + ' Esito import'} — Articoli ${esc(CAT_SCOPE_LABEL[rep.scope])}</h3>
    ${rep.dryRun ? '<p class="empty-text" style="text-align:left;padding:0 0 10px"><strong>Nessun dato è stato modificato.</strong> Questa è una prova: correggi il foglio e riprova, oppure procedi.</p>' : ''}
    <div class="cost-summary">${cards}</div>
    <div class="mgmt-list" style="margin-top:12px">${righe}</div>
    ${note.map(n => `<p class="empty-text" style="text-align:left;padding:6px 0">${n}</p>`).join('')}
    ${anteprima}
    ${blocco('Righe con problemi', rep.errors, 'var(--red)')}
    ${blocco('Avvisi', rep.warnings, 'var(--orange, #d98a3a)')}
    ${!rep.errors.length && !rep.warnings.length ? `<p class="empty-text" style="padding:8px 0">Nessun errore. ${ico('check', 'tinted', '')}</p>` : ''}
    <div class="modal-actions">${azioni}</div>`);
}
function closeCatalogReport() {
  closeModal();
  window.__lastCatalogImport = null;
  renderManage();
  showToast('Import completato');
}
