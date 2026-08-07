// Il ponte binario: un file .xlsx vero, scritto e riletto dalla libreria vera.
//
// Tutti gli altri test sull'import lavorano su righe **già lette** — l'array di
// oggetti che `readWorkbook` consegna — perché il binario è di SheetJS e non è
// nostro. È la scelta giusta, ma lascia scoperto proprio il punto in cui si
// cambia libreria: se una nuova versione scrivesse o rileggesse le celle in
// modo diverso, nessuno se ne accorgerebbe fino al primo file sbagliato in mano
// a un fornitore.
//
// Qui si chiude quel buco. La libreria è nel repo (`vendor/`, vedi il LEGGIMI)
// e si carica anche in Node, quindi il giro si può fare per intero: esportare
// come fa l'app, scrivere il file, rileggerlo **con le stesse chiamate di
// `readWorkbook`**, reimportarlo, e ritrovare l'articolo com'era.

const assert = require('node:assert/strict');
const path = require('node:path');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb } = require('./fixtures.js');

const XLSX = require(path.join(__dirname, '..', 'vendor', 'xlsx.full.min.js'));

function app(db) {
  const a = loadApp({ silent: true });
  a.setDb(db || makeDb());
  a.asRole('admin');
  return a;
}
// Scrive un vero .xlsx in memoria dai fogli che l'app esporta.
function scrivi(sheets) {
  const wb = XLSX.utils.book_new();
  sheets.forEach(sh => {
    const ws = XLSX.utils.aoa_to_sheet(sh.aoa);
    if (sh.cols) ws['!cols'] = sh.cols;
    XLSX.utils.book_append_sheet(wb, ws, sh.name);
  });
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
// Le stesse due chiamate di readWorkbook(), su un buffer invece che su un File.
function rileggi(buf) {
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
  const out = {};
  wb.SheetNames.forEach(n => { out[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: '' }); });
  return out;
}

describe('La libreria Excel nel repo', () => {
  it('è la 0.20 o più recente: le due CVE della 0.18.5 sono a monte', () => {
    const [maj, min] = String(XLSX.version).split('.').map(Number);
    assert.ok(maj > 0 || min >= 20, `versione trovata: ${XLSX.version}`);
  });

  it('ha tutte le funzioni che l\'app le chiede', () => {
    ['read', 'write', 'writeFile'].forEach(f => assert.equal(typeof XLSX[f], 'function', f));
    ['aoa_to_sheet', 'sheet_to_json', 'json_to_sheet', 'book_new', 'book_append_sheet', 'encode_range']
      .forEach(f => assert.equal(typeof XLSX.utils[f], 'function', 'utils.' + f));
  });
});

describe('Giro completo su un file .xlsx vero', () => {
  // Un articolo con dentro tutto ciò che si rompe passando per un file:
  // accenti, virgolette, un trattino lungo, un decimale e una data.
  const dbCon = () => makeDb({
    suppliers: [{ id: 's1', name: 'SKF Italia', active: true }],
    settings: { uoms: [{ code: 'kg', name: 'Chilogrammi' }, { code: 'pz', name: 'Pezzi' }], uomDefault: 'pz' },
    items: [{
      id: 'm1', code: 'ACC-S235-20', name: 'Piatto «S235» 20×100 — laminato a caldo',
      type: 'materiale', uom: 'kg', unitCost: 3.25, active: true,
      notes: 'Tolleranza h9; cert. 3.1',
      priceList: [{ id: 'p1', supplierId: 's1', price: 3.25, minQty: 50, leadDays: 21,
        code: 'SKF/AC-20', desc: 'Piatto acciaio', date: '2026-01-15', rfqId: null, note: '' }],
      activePriceId: 'p1', supplierId: 's1',
    }],
  });

  it('esportare, scrivere il file, rileggerlo e reimportarlo non cambia niente', () => {
    const a = app(dbCon());
    const sheets = JSON.parse(a.eval('JSON.stringify(catalogSheets("buy"))'));
    const riletto = rileggi(scrivi(sheets));

    // Il file rileggibile ha i fogli che l'app si aspetta di trovare.
    assert.ok(Object.keys(riletto).length, 'nessun foglio riletto');
    const rep = JSON.parse(a.eval(
      `JSON.stringify(importCatalogSheets(${JSON.stringify(riletto)}, "buy", {}))`));
    assert.equal(rep.errors.length, 0, 'errori: ' + JSON.stringify(rep.errors));

    const it = JSON.parse(a.eval('JSON.stringify(getItemByCode("ACC-S235-20"))'));
    assert.equal(it.name, 'Piatto «S235» 20×100 — laminato a caldo', 'accenti e simboli sopravvivono al binario');
    assert.equal(it.uom, 'kg');
    assert.equal(it.notes, 'Tolleranza h9; cert. 3.1');
    assert.equal(a.eval('db.items.length'), 1, 'reimportare lo stesso file non duplica l\'articolo');
  });

  it('i numeri restano numeri, non testo che somiglia a un numero', () => {
    const a = app(dbCon());
    const sheets = JSON.parse(a.eval('JSON.stringify(catalogSheets("buy"))'));
    const riletto = rileggi(scrivi(sheets));
    const foglio = Object.values(riletto).find(righe => righe.some(r => r['Codice'] === 'ACC-S235-20'));
    const riga = foglio.find(r => r['Codice'] === 'ACC-S235-20');
    const prezzo = Object.keys(riga).find(k => /prezzo/i.test(k));
    assert.equal(typeof riga[prezzo], 'number',
      'se tornasse stringa, un foglio con la virgola decimale entrerebbe a zero');
  });

  it('una cella vuota resta vuota e non diventa la stringa "undefined"', () => {
    const buf = scrivi([{ name: 'Prova', aoa: [['Codice', 'Nota'], ['X-1', '']] }]);
    const righe = rileggi(buf).Prova;
    assert.equal(righe[0]['Nota'], '', 'defval: "" è ciò su cui contano tutti i lettori di riga');
  });
});
