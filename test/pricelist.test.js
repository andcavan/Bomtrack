// Listino fornitori e storico prezzi.
// Il punto delicato: il listino è memoria, non un secondo motore di costo. Il
// prezzo che costa resta quello nei campi dell'articolo, e ci arriva solo per
// scelta esplicita — mai da solo dietro un'offerta ricevuta.

const assert = require('node:assert/strict');
const { describe, it, approx } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, acq, mat, asm, comp } = require('./fixtures.js');

function conDb(dbObj) {
  const app = loadApp({ silent: true });
  app.asRole('admin');   // i mutatori del listino passano da roleGuard('catalog')
  app.setDb(dbObj);
  return app;
}
function quota(over) {
  return Object.assign({ id: 'q1', supplierId: 's1', price: 10, minQty: '', leadDays: '', code: '', desc: '', date: '2026-01-01', rfqId: null, note: '' }, over || {});
}
function conListino(righe, over) {
  const art = Object.assign(acq('a', 10), { priceList: righe, priceListSeeded: true }, over || {});
  return makeDb({ suppliers: [{ id: 's1', name: 'Alfa' }, { id: 's2', name: 'Beta' }], items: [art] });
}

describe('migrazione — il fornitore esistente diventa la prima quotazione', () => {
  function caricato(blob) {
    const app = loadApp({ silent: true });
    app.seedStorage(blob);
    app.ref('Store').load();
    return app;
  }

  it('un commerciale con fornitore parte con quella quotazione, marcata in uso', () => {
    const app = caricato({ schemaVersion: 2, suppliers: [{ id: 's1', name: 'Alfa' }],
      items: [{ id: 'a', code: 'A', type: 'acquistato', supplierId: 's1', purchasePrice: 42, supplierCode: 'XY-9' }] });
    const it0 = app.snapshot().items[0];
    assert.equal(it0.priceList.length, 1);
    assert.equal(it0.priceList[0].supplierId, 's1');
    assert.equal(it0.priceList[0].price, 42);
    assert.equal(it0.priceList[0].code, 'XY-9');
    assert.equal(it0.activePriceId, it0.priceList[0].id, 'la quotazione seminata dev\'essere quella in uso');
  });

  it('una materia prima usa il proprio campo di costo', () => {
    const app = caricato({ schemaVersion: 2, suppliers: [{ id: 's1', name: 'Alfa' }],
      items: [{ id: 'm', code: 'M', type: 'materiale', supplierId: 's1', unitCost: 3.5 }] });
    assert.equal(app.snapshot().items[0].priceList[0].price, 3.5);
  });

  it('senza fornitore il listino resta vuoto', () => {
    const app = caricato({ schemaVersion: 2, items: [{ id: 'a', code: 'A', type: 'acquistato', purchasePrice: 42 }] });
    const it0 = app.snapshot().items[0];
    assert.equal(it0.priceList.length, 0);
    assert.equal(it0.priceListSeeded, true, 'il seme è comunque consumato');
  });

  it('il seed non si ripete: un listino svuotato resta vuoto', () => {
    const app = caricato({ schemaVersion: 2, suppliers: [{ id: 's1', name: 'Alfa' }],
      items: [{ id: 'a', code: 'A', type: 'acquistato', supplierId: 's1', purchasePrice: 42 }] });
    app.eval('getItem("a").priceList = []; getItem("a").activePriceId = null;');
    app.ref('migrateDB')();
    assert.equal(app.snapshot().items[0].priceList.length, 0);
  });

  it('gli assiemi e le parti non hanno listino', () => {
    const app = caricato({ schemaVersion: 2, items: [
      { id: 'g', code: 'G', type: 'gruppo' }, { id: 'p', code: 'P', type: 'parte' },
    ] });
    app.snapshot().items.forEach(i => assert.equal(i.priceList, undefined, i.code + ' non deve avere listino'));
  });
});

describe('bestPriceRow — la quotazione più conveniente', () => {
  it('sceglie il prezzo più basso', () => {
    const app = conDb(conListino([quota({ id: 'q1', price: 10 }), quota({ id: 'q2', price: 7, supplierId: 's2' })]));
    assert.equal(app.eval('bestPriceRow(getItem("a")).id'), 'q2');
  });

  it('a parità di prezzo tiene la più recente', () => {
    const app = conDb(conListino([
      quota({ id: 'vecchia', price: 5, date: '2025-01-01' }),
      quota({ id: 'nuova', price: 5, date: '2026-06-01' }),
    ]));
    assert.equal(app.eval('bestPriceRow(getItem("a")).id'), 'nuova');
  });

  it('ignora le quotazioni senza prezzo', () => {
    const app = conDb(conListino([quota({ id: 'q1', price: '' }), quota({ id: 'q2', price: 20 })]));
    assert.equal(app.eval('bestPriceRow(getItem("a")).id'), 'q2');
  });

  it('listino vuoto: nessuna migliore', () => {
    const app = conDb(conListino([]));
    assert.equal(app.eval('bestPriceRow(getItem("a"))'), null);
  });
});

describe('applyPriceRow — la scelta esplicita del prezzo in uso', () => {
  it('porta prezzo, fornitore e codice nei campi dell\'articolo', () => {
    const app = conDb(conListino([quota({ id: 'q2', price: 7, supplierId: 's2', code: 'BETA-1', desc: 'Vite beta' })]));
    app.eval('applyPriceRow(getItem("a"), priceRows(getItem("a"))[0])');
    const it0 = app.ref('getItem')('a');
    approx(it0.purchasePrice, 7);
    assert.equal(it0.supplierId, 's2');
    assert.equal(it0.supplierCode, 'BETA-1');
    assert.equal(it0.activePriceId, 'q2');
  });

  it('il costo delle macchine segue il nuovo prezzo scelto', () => {
    const db = conListino([quota({ id: 'q2', price: 7 })]);
    db.items.push(asm('mac', 'macchina', { components: [comp('a', 10)] }));
    const app = conDb(db);
    approx(app.ref('costOf')('mac').total, 100, 'partenza: prezzo 10');
    app.eval('applyPriceRow(getItem("a"), priceRows(getItem("a"))[0]); invalidateCaches();');
    approx(app.ref('costOf')('mac').total, 70);
  });

  it('registrare quotazioni NON cambia da solo il costo', () => {
    const app = conDb(conListino([]));
    app.eval('getItem("a").priceList.push({ id: "nuova", supplierId: "s2", price: 1, date: "2026-06-01" })');
    approx(app.ref('getItem')('a').purchasePrice, 10, 'il prezzo in uso non deve muoversi da solo');
  });

  it('una materia prima aggiorna il proprio campo di costo', () => {
    const app = conDb(makeDb({ suppliers: [{ id: 's1', name: 'Alfa' }],
      items: [Object.assign(mat('m', 2), { priceList: [quota({ price: 5 })], priceListSeeded: true })] }));
    app.eval('applyPriceRow(getItem("m"), priceRows(getItem("m"))[0])');
    approx(app.ref('getItem')('m').unitCost, 5);
  });
});

describe('registrazione dei prezzi da una richiesta di offerta', () => {
  function conRfq(lines, over) {
    const d = makeDb({
      suppliers: [{ id: 's1', name: 'Alfa' }],
      items: [
        Object.assign(acq('a', 10), { priceList: [], priceListSeeded: true }),
        Object.assign(acq('b', 20), { priceList: [], priceListSeeded: true }),
        asm('g', 'gruppo', { components: [] }),
      ],
      rfqs: [Object.assign({ id: 'r1', number: 'RFQ-2026-001', status: 'ricevuta', supplierId: 's1',
        date: '2026-05-10', lines }, over || {})],
    });
    return conDb(d);
  }

  it('registra solo le righe da catalogo con un prezzo', () => {
    const app = conRfq([
      { id: 'l1', itemId: 'a', price: 8 },
      { id: 'l2', itemId: 'b', price: '' },          // prezzo non compilato
      { id: 'l3', itemId: null, price: 5 },          // riga manuale
      { id: 'l4', itemId: 'g', price: 99 },          // assieme: niente listino
    ]);
    assert.equal(app.eval('rfqPriceCandidates(getRfq("r1")).length'), 1);
    app.eval('rfqRecordPrices("r1")');
    assert.equal(app.eval('priceRows(getItem("a")).length'), 1);
    assert.equal(app.eval('priceRows(getItem("b")).length'), 0);
  });

  it('la quotazione porta fornitore, prezzo, data e origine della richiesta', () => {
    const app = conRfq([{ id: 'l1', itemId: 'a', price: 8 }]);
    app.eval('rfqRecordPrices("r1")');
    const r = app.snapshot().items.find(i => i.code === 'A').priceList[0];
    assert.equal(r.supplierId, 's1');
    assert.equal(r.price, 8);
    assert.equal(r.date, '2026-05-10', 'la data è quella della richiesta, non di oggi');
    assert.equal(r.rfqId, 'r1');
    assert.equal(r.lineId, 'l1');
  });

  it('registrare due volte non duplica', () => {
    const app = conRfq([{ id: 'l1', itemId: 'a', price: 8 }]);
    app.eval('rfqRecordPrices("r1")');
    assert.equal(app.eval('rfqPriceCandidates(getRfq("r1")).length'), 0, 'la riga non è più candidata');
    app.eval('rfqRecordPrices("r1")');
    assert.equal(app.eval('priceRows(getItem("a")).length'), 1);
  });

  it('un prezzo registrato non diventa il costo in uso da solo', () => {
    const app = conRfq([{ id: 'l1', itemId: 'a', price: 8 }]);
    app.eval('rfqRecordPrices("r1")');
    approx(app.ref('getItem')('a').purchasePrice, 10, 'il costo deve restare quello scelto');
    assert.ok(!app.ref('getItem')('a').activePriceId, 'e nessuna quotazione va marcata in uso');
  });

  it('senza fornitore non si registra nulla', () => {
    const app = conRfq([{ id: 'l1', itemId: 'a', price: 8 }], { supplierId: null });
    assert.equal(app.eval('rfqPriceCandidates(getRfq("r1")).length'), 0);
    app.eval('rfqRecordPrices("r1")');
    assert.equal(app.eval('priceRows(getItem("a")).length'), 0);
  });

  it('una seconda richiesta allo stesso fornitore aggiunge una riga di storico', () => {
    const app = conRfq([{ id: 'l1', itemId: 'a', price: 8 }]);
    app.eval('rfqRecordPrices("r1")');
    app.eval(`db.rfqs.push({ id: 'r2', number: 'RFQ-2026-002', status: 'ricevuta', supplierId: 's1',
      date: '2026-09-01', lines: [{ id: 'l1', itemId: 'a', price: 9.5 }] }); rfqRecordPrices('r2');`);
    const righe = app.snapshot().items.find(i => i.code === 'A').priceList;
    assert.equal(righe.length, 2, 'lo storico deve conservare entrambe');
    assert.deepEqual(righe.map(r => r.price).sort((x, y) => x - y), [8, 9.5]);
  });
});

describe('permessi', () => {
  function comeRuolo(role) {
    const app = loadApp({ silent: true });
    app.asRole(role);
    app.setDb(conListino([quota({ id: 'q1', price: 10 }), quota({ id: 'q2', price: 7, supplierId: 's2' })], { activePriceId: 'q1' }));
    return app;
  }

  it('l\'ufficio acquisti non può cambiare il prezzo in uso di un articolo', () => {
    const app = comeRuolo('acquisti');   // può scrivere sui documenti, non sulle anagrafiche
    app.eval('window.__priceItemId = "a"; priceUseRow("q2");');
    approx(app.ref('getItem')('a').purchasePrice, 10, 'il costo non doveva cambiare');
    assert.equal(app.ref('getItem')('a').activePriceId, 'q1');
  });

  it('un lettore non può aggiungere quotazioni', () => {
    const app = comeRuolo('lettore');
    app.eval('window.__priceItemId = "a"; priceAddRow();');
    assert.equal(app.eval('priceRows(getItem("a")).length'), 2, 'nessuna riga doveva essere aggiunta');
  });

  it('la progettazione può, il listino è un\'anagrafica articolo', () => {
    const app = comeRuolo('progettazione');
    app.eval('window.__priceItemId = "a"; priceUseRow("q2");');
    approx(app.ref('getItem')('a').purchasePrice, 7);
  });
});

describe('priceListBody — contenuto della finestra', () => {
  it('mostra il prezzo in uso e segnala che viene da listino', () => {
    const app = conDb(conListino([quota({ price: 10 })], { activePriceId: 'q1' }));
    const html = app.eval('priceListBody("a")');
    assert.ok(html.includes('Prezzo in uso'));
    assert.ok(!html.includes('inserito a mano'), 'la quotazione è agganciata');
  });

  it('segnala un costo scollegato dal listino', () => {
    const app = conDb(conListino([quota({ price: 10 })], { activePriceId: null }));
    assert.ok(app.eval('priceListBody("a")').includes('inserito a mano'));
  });

  it('listino vuoto: lo dice e suggerisce da dove partire', () => {
    const app = conDb(conListino([]));
    assert.ok(app.eval('priceListBody("a")').includes('Nessuna quotazione registrata'));
  });

  it('la quotazione in uso non offre il pulsante "Usa"', () => {
    const app = conDb(conListino([quota({ id: 'q1', price: 10 }), quota({ id: 'q2', price: 7, supplierId: 's2' })], { activePriceId: 'q1' }));
    const html = app.eval('priceListBody("a")');
    assert.ok(html.includes(`priceUseRow('q2')`), 'l\'altra deve essere selezionabile');
    assert.ok(!html.includes(`priceUseRow('q1')`), 'quella già in uso no');
  });

  it('codice fornitore e origine restano, sulla seconda riga della quotazione', () => {
    const app = conDb(conListino([quota({ code: 'BETA-1' })]));
    const html = app.eval('priceListBody("a")');
    assert.ok(html.includes('pl-sub'), 'la riga si sviluppa su due livelli');
    assert.ok(html.includes('BETA-1'), 'il codice fornitore è ancora modificabile');
    assert.ok(!html.includes('<th>Codice forn.</th>'), 'ma non occupa più una colonna');
  });

  it('i giorni di consegna non superano le quattro cifre', () => {
    const app = conDb(conListino([quota()]));
    app.eval('window.__priceItemId = "a"; priceSetField("q1","leadDays","123456");');
    assert.equal(app.eval('priceRows(getItem("a"))[0].leadDays'), 9999);
    app.eval('priceSetField("q1","leadDays","");');
    assert.equal(app.eval('priceRows(getItem("a"))[0].leadDays'), '', 'vuoto resta vuoto');
  });

  it('l\'origine indica la richiesta di provenienza', () => {
    const d = conListino([quota({ rfqId: 'r1' })]);
    d.rfqs = [{ id: 'r1', number: 'RFQ-2026-007', lines: [] }];
    const app = conDb(d);
    assert.ok(app.eval('priceListBody("a")').includes('RFQ-2026-007'));
  });
});
