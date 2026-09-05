// Le righe di richiesta e ordine, a due piani.
//
// Dodici colonne erano sei coppie: codice/descrizione, q.tà/U.M.,
// prezzo/importo, richiesta/confermata, ricevuto/residuo, modifica/elimina.
// Quello che questi test tengono fermo non è l'aspetto, è che le coppie non si
// scollino: il numero di colonne dichiarato in testata, quello delle celle di
// ogni riga e i `colspan` del totale e della riga vuota devono raccontare la
// stessa tabella. Sbagliarne uno solo storce l'intestazione rispetto ai dati —
// e una colonna storta su un documento che va al fornitore si legge male
// proprio nel momento in cui conta.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, acq } = require('./fixtures.js');

const RIGA = { id: 'l1', itemId: 'c1', code: 'C1', description: 'Cuscinetto 6204', uom: 'pz',
  qty: 10, price: 12, deliveryDate: '2025-02-01', confirmedDate: '2025-02-05', received: 4 };

function app(over) {
  const a = loadApp({ silent: true });
  a.setDb(makeDb(Object.assign({
    items: [acq('c1', 12)],
    suppliers: [{ id: 's1', name: 'Rossi', active: true }],
    jobs: [], plans: [], rfqs: [], orders: [],
  }, over || {})));
  a.asRole('admin');
  return a;
}
function conOrdine(righe) {
  const a = app({ orders: [{ id: 'o1', number: 'ODA-1', title: 't', status: 'bozza', date: '2025-01-01',
    supplierId: 's1', active: true, lines: righe }] });
  a.eval('renderOrders(); openOrderEdit("o1");');
  return a.html('view-orders');
}
function conRichiesta(righe) {
  const a = app({ rfqs: [{ id: 'r1', number: 'RFQ-1', title: 't', status: 'bozza', date: '2025-01-01',
    supplierId: 's1', active: true, lines: righe }] });
  a.eval('renderRfq(); openRfqEdit("r1");');
  return a.html('view-rfq');
}
// La tabella delle righe, isolata dal resto del documento.
function tabella(html) {
  const i = html.indexOf('rfq-table-2');
  assert.ok(i > 0, 'la tabella a due piani deve esserci');
  return html.slice(i, html.indexOf('</table>', i));
}
function colonne(t) { return (t.slice(0, t.indexOf('</thead>')).match(/<th\b/g) || []).length; }
// Celle della prima riga di corpo: `cell2` ne produce una per coppia.
function celleDiRiga(t) {
  const corpo = t.slice(t.indexOf('<tbody>'), t.indexOf('</tbody>'));
  const prima = corpo.slice(0, corpo.indexOf('</tr>'));
  return (prima.match(/<td\b/g) || []).length;
}

describe('Ogni riga sta in una riga sola di tabella, a due piani', () => {
  it("l'ordine: tante celle quante colonne, una riga per riga di documento", () => {
    const t = tabella(conOrdine([RIGA, Object.assign({}, RIGA, { id: 'l2' })]));
    assert.equal(colonne(t), 7, '# più le sei coppie');
    assert.equal(celleDiRiga(t), 7, 'una cella per coppia: se divergono, testata e dati si scollano');
    const corpo = t.slice(t.indexOf('<tbody>'), t.indexOf('</tbody>'));
    assert.equal((corpo.match(/<tr>/g) || []).length, 2, 'due righe di documento, due <tr>: non una riga ogni piano');
  });

  it('la richiesta: le stesse coppie, meno quelle che una richiesta non ha', () => {
    const t = tabella(conRichiesta([RIGA]));
    assert.equal(colonne(t), 6, 'niente ricevuto/residuo: una richiesta non riceve niente');
    assert.equal(celleDiRiga(t), 6);
  });

  it('sopra il dato che si compila, sotto quello che ne consegue', () => {
    const t = tabella(conOrdine([RIGA]));
    const celle = t.slice(t.indexOf('<tbody>')).split('<td').slice(1);
    const sopra = c => c.slice(c.indexOf('ln-a'), c.indexOf('ln-b'));
    const sotto = c => c.slice(c.indexOf('ln-b'));
    // codice / descrizione
    assert.match(sopra(celle[1]), /C1/);
    assert.match(sotto(celle[1]), /Cuscinetto 6204/);
    // quantità / unità
    assert.match(sopra(celle[2]), /'qty'/);
    assert.match(sotto(celle[2]), />pz</);
    // prezzo unitario / importo di riga
    assert.match(sopra(celle[3]), /'price'/);
    assert.match(sotto(celle[3]), /ln-amount/);
    // data richiesta / data confermata
    assert.match(sopra(celle[4]), /'deliveryDate'/);
    assert.match(sotto(celle[4]), /'confirmedDate'/);
    // ricevuto / residuo
    assert.match(sopra(celle[5]), /'received'/);
    assert.match(sotto(celle[5]), /ln-residual/);
    // modifica / elimina
    assert.match(sopra(celle[6]), /ordEditLineModal/);
    assert.match(sotto(celle[6]), /ordDelLine/);
  });

  it("l'importo è quello della riga, il residuo quello che manca", () => {
    const t = tabella(conOrdine([RIGA]));
    assert.match(t, /ln-amount[^>]*>[^<]*120/, '10 × 12 = 120');
    assert.match(t, /ln-residual[^>]*>6</, 'ordinati 10, ricevuti 4');
  });

  it('il residuo aperto si distingue da quello chiuso', () => {
    assert.match(tabella(conOrdine([RIGA])), /ln-residual pos/);
    assert.doesNotMatch(tabella(conOrdine([Object.assign({}, RIGA, { received: 10 })])), /ln-residual pos/,
      'una riga arrivata tutta non deve restare accesa');
  });
});

describe('I conti della tabella tornano', () => {
  it("il totale dell'ordine sta sotto la colonna degli importi", () => {
    const t = tabella(conOrdine([RIGA]));
    const foot = t.slice(t.indexOf('<tfoot>'));
    const spans = (foot.match(/colspan="(\d+)"/g) || []).map(x => Number(x.match(/\d+/)[0]));
    const celle = (foot.match(/<td\b/g) || []).length;
    // Le celle senza colspan valgono 1: la somma deve fare la larghezza della tabella.
    assert.equal(spans.reduce((s, n) => s + n, 0) + (celle - spans.length), colonne(t),
      'un totale largo quanto non è la tabella sposta tutte le colonne del piede');
    assert.match(foot, /120/, "il totale imponibile è la somma degli importi");
  });

  it('la riga «nessuna riga» attraversa tutta la tabella', () => {
    const t = tabella(conOrdine([]));
    assert.match(t, new RegExp('colspan="' + colonne(t) + '"'), 'ordini');
    const tr = tabella(conRichiesta([]));
    assert.match(tr, new RegExp('colspan="' + colonne(tr) + '"'), 'richieste');
  });
});

describe('Quello che la riga sapeva dire, lo dice ancora', () => {
  it('il blocco del documento vale sui campi dei due piani', () => {
    const t = tabella(conOrdine([RIGA]));
    // Prezzo e quantità sono contratto, ricevuto e data confermata ricevimento:
    // il piano di sotto non è decorazione, ha le sue guardie.
    assert.match(t, /rfq-qty-input lock-contract/);
    assert.match(t, /rfq-qty-input lock-reception/);
    assert.match(t, /rfq-date-input lock-contract/);
    assert.match(t, /rfq-date-input lock-reception/);
  });

  it('la riga manuale si dichiara, e la nota resta leggibile', () => {
    const t = tabella(conOrdine([Object.assign({}, RIGA, { itemId: null, note: 'urgente' })]));
    assert.match(t, /rfq-manual-tag/);
    assert.match(t, /line-note/);
    assert.match(t, /urgente/);
  });
});
