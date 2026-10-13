// Ricevimenti come eventi (D1 in docs/analisi-tecnica.md).
//
// Il ricevuto di una riga d'ordine era un numero riscritto a ogni arrivo, e la
// giacenza ne è la somma: in cloud due ricevimenti concorrenti sulla stessa
// riga si sarebbero sovrascritti, e un carico sarebbe sparito dal magazzino.
// Ora ogni ricevimento è un evento con la differenza, e `received` ne è la
// somma — una lettura, ricavata dallo Store e non inviata.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, acq } = require('./fixtures.js');

const VECCHIA = '2026-01-01T00:00:00.000Z';
function riga(id, o) {
  return Object.assign({ id, itemId: 'c1', code: 'C1', description: 'Commerciale', uom: 'pz', qty: 10, price: 5,
    deliveryDate: '', received: 0, note: '', phaseKey: null, phaseKeys: null }, o || {});
}
function base(righe, extra) {
  return makeDb(Object.assign({
    suppliers: [{ id: 's1', name: 'SKF', active: true }],
    items: [acq('c1', 5)],
    orders: [{ id: 'o1', number: 'ODA-2026-001', title: '', date: '2026-02-01', status: 'confermato', supplierId: 's1',
      supplierConfirmation: 'X', notes: '', notesInternal: '', active: true, createdAt: VECCHIA, updatedAt: VECCHIA,
      lines: righe || [riga('l1')] }],
  }, extra || {}));
}
// Caricato dall'archivio, come all'avvio: è lì che girano migrazione e riallineamento.
// In modo condiviso, come lo vorrà un adattatore cloud: in locale i ricevimenti
// non diventano eventi (vedi il gruppo in fondo).
function caricato(db, condiviso) {
  const a = loadApp({ silent: true });
  a.seedStorage(db);
  if (condiviso !== false) a.eval('Store.modoCondiviso = true');
  a.ref('Store').load();
  a.asRole('admin');
  return a;
}
function ricaricato(a) {
  const b = loadApp({ silent: true });
  b.seedStorage(a.eval('JSON.stringify(db)'));
  if (a.eval('Store.modoCondiviso')) b.eval('Store.modoCondiviso = true');
  b.ref('Store').load();
  b.asRole('admin');
  return b;
}
const ricevuto = (a, lid) => a.eval(`getOrder("o1").lines.find(l => l.id === ${JSON.stringify(lid || 'l1')}).received`);
const eventi = a => JSON.parse(a.eval('JSON.stringify(db.receipts)'));

describe('Il primo caricamento trasforma il ricevuto in un saldo d\'apertura', () => {
  it('il numero resta quello di prima, e diventa un evento', () => {
    const a = caricato(base([riga('l1', { received: 4 }), riga('l2')]));
    assert.equal(ricevuto(a), 4);
    const ev = eventi(a);
    assert.equal(ev.length, 1, 'una riga a zero non ha niente da raccontare');
    assert.equal(ev[0].kind, 'apertura');
    assert.equal(ev[0].qty, 4);
    assert.equal(ev[0].lineId, 'l1');
    assert.equal(ev[0].orderId, 'o1');
  });

  it('una volta sola: il caricamento dopo non aggiunge niente', () => {
    const b = ricaricato(caricato(base([riga('l1', { received: 4 })])));
    assert.equal(eventi(b).length, 1);
    assert.equal(ricevuto(b), 4);
  });

  it('un numero scritto senza passare dagli eventi non si perde: si pareggia', () => {
    const a = caricato(base([riga('l1', { received: 4 })]));
    a.eval('getOrder("o1").lines[0].received = 7; saveDB();');   // un percorso che scrive il campo a mano
    const b = ricaricato(a);
    assert.equal(ricevuto(b), 7, 'in locale il numero che l\'utente ha visto non cambia mai da solo');
    const ultimo = eventi(b).pop();
    assert.deepEqual([ultimo.kind, ultimo.qty], ['allineamento', 3]);
    assert.equal(eventi(ricaricato(b)).length, 2, 'una volta pareggiato, non si ripete');
  });

  it('il caso peggiore: un archivio che ha già gli eventi, e righe ricevute senza', () => {
    const db = base([riga('l1', { received: 5 }), riga('l2', { received: 0 })]);
    db.receipts = [];
    const a = caricato(db);
    assert.equal(ricevuto(a, 'l1'), 5, 'fino alla 0.83 tornava 0, senza dirlo');
    assert.equal(ricevuto(a, 'l2'), 0);
  });

  it('una riga senza il campo lo ricava dagli eventi: è come arriva da un backend', () => {
    const a = caricato(base([riga('l1', { received: 4 })]));
    a.eval('delete getOrder("o1").lines[0].received; saveDB();');
    assert.equal(ricevuto(ricaricato(a)), 4);
  });
});

describe('Registrare un ricevimento scrive la differenza', () => {
  it('dal campo in tabella: si digita il totale, nasce un evento col delta', () => {
    const a = caricato(base([riga('l1', { received: 3 })]));
    a.eval('ordSetLine("o1", "l1", "received", "5")');
    assert.equal(ricevuto(a), 5);
    const ultimo = eventi(a).pop();
    assert.equal(ultimo.kind, 'ricevimento');
    assert.equal(ultimo.qty, 2);
    assert.match(ultimo.date, /^\d{4}-\d{2}-\d{2}$/);
  });

  it('una correzione all\'ingiù è un evento negativo, non una riscrittura', () => {
    const a = caricato(base([riga('l1', { received: 5 })]));
    a.eval('ordSetLine("o1", "l1", "received", "4")');
    assert.equal(eventi(a).pop().qty, -1);
    assert.equal(ricevuto(ricaricato(a)), 4);
  });

  it('il tetto sull\'ordinato vale ancora, e l\'evento registra quanto è passato', () => {
    const a = caricato(base([riga('l1', { qty: 10 })]));
    a.eval('ordSetLine("o1", "l1", "received", "50")');
    assert.equal(ricevuto(a), 10);
    assert.equal(eventi(a).pop().qty, 10);
  });

  it('lo stesso totale non crea eventi', () => {
    const a = caricato(base([riga('l1', { received: 5 })]));
    const n = eventi(a).length;
    a.eval('ordSetLine("o1", "l1", "received", "5")');
    assert.equal(eventi(a).length, n);
  });

  it('«ricevuto tutto» registra un evento per riga, del residuo', () => {
    const a = caricato(base([riga('l1', { received: 4 }), riga('l2', { qty: 3 })]));
    a.eval('ordMarkAllReceived("o1")');
    const nuovi = eventi(a).filter(e => e.kind === 'ricevimento').map(e => [e.lineId, e.qty]);
    assert.deepEqual(nuovi, [['l1', 6], ['l2', 3]]);
    assert.equal(a.eval('getOrder("o1").status'), 'evaso');
  });

  it('la giacenza legge il ricevuto come prima', () => {
    const a = caricato(base([riga('l1')]));
    a.eval('ordSetLine("o1", "l1", "received", "7")');
    assert.equal(a.eval('onHandOf("c1")'), 7);
  });
});

describe('Due ricevimenti concorrenti si sommano', () => {
  it('nessun carico sparisce: il punto di D1', () => {
    const db = base([riga('l1', { qty: 10 })]);
    const a = caricato(db), b = caricato(db);
    a.eval('ordSetLine("o1", "l1", "received", "3")');   // magazziniere A: arrivano 3
    b.eval('ordSetLine("o1", "l1", "received", "2")');   // magazziniere B, nello stesso momento: arrivano 2
    // Il server tiene entrambi gli eventi (righe diverse, merge per riga); il
    // pull li porta a tutti e due, e il ricevuto si ricalcola.
    const unione = eventi(a).concat(eventi(b).filter(e => !eventi(a).some(x => x.id === e.id)));
    // Al pull il ricevuto non viaggia (è derivato): la riga arriva senza, e lo
    // ricava dagli eventi di tutti e due.
    a.eval(`db.receipts = ${JSON.stringify(unione)}; delete getOrder("o1").lines[0].received; riallineaRicevuti(false);`);
    assert.equal(ricevuto(a), 5,
      'con il numero sulla riga avrebbe vinto l\'ultimo che salva: 2 o 3, mai 5');
  });

  it('il ricevuto non si invia: lo toglie flattenDB con stripDerived', () => {
    const a = caricato(base([riga('l1', { received: 4 })]));
    const t = JSON.parse(a.eval('JSON.stringify(flattenDB(db, { stripDerived: true }))'));
    assert.equal('received' in t.order_lines[0], false);
    assert.equal(t.order_receipts.length, 1);
    const pieno = JSON.parse(a.eval('JSON.stringify(flattenDB(db))'));
    assert.equal(pieno.order_lines[0].received, 4, 'senza l\'opzione il giro completo resta esatto');
  });
});

describe('Righe da un ordine di produzione: le dichiara l\'ODP', () => {
  it('nessun evento, né all\'apertura né dopo, e il ricevuto non si azzera', () => {
    const db = makeDb({
      suppliers: [{ id: 's1', name: 'Beta', active: true }],
      workOrders: [{ id: 'w1', number: 'ODL-2026-001', title: '', date: '2026-02-01', status: 'confermato', supplierId: 's1',
        supplierConfirmation: '', notes: '', notesInternal: '', active: true, odpId: 'p1', updatedAt: VECCHIA,
        lines: [{ id: 'wl1', itemId: null, code: 'P1', description: 'Fase', uom: 'pz', qty: 10, price: 1, deliveryDate: '',
          received: 6, note: '', phaseKey: 'x#0#w', phaseKeys: 'x#0#w', odpId: 'p1', odpPhaseId: 'f1' }] }],
    });
    const a = caricato(db);
    assert.equal(eventi(a).length, 0);
    assert.equal(ricaricato(a).eval('db.workOrders[0].lines[0].received'), 6);
  });
});

describe('Eventi di righe che non esistono più', () => {
  it('un documento nel cestino li conserva, per ritrovarli al ripristino', () => {
    const a = caricato(base([riga('l1', { received: 4 })]));
    a.eval('Store.remove("orders", "o1")');
    const b = ricaricato(a);
    assert.equal(eventi(b).length, 1);
    b.eval('Store.restore(Store.trashList()[0].id)');
    assert.equal(ricaricato(b).eval('getOrder("o1").lines[0].received'), 4);
  });

  it('una riga tolta li perde al caricamento successivo', () => {
    const a = caricato(base([riga('l1', { received: 4 }), riga('l2', { received: 1 })]));
    a.eval('getOrder("o1").lines = getOrder("o1").lines.filter(l => l.id !== "l1"); saveDB();');
    assert.deepEqual(eventi(ricaricato(a)).map(e => e.lineId), ['l2']);
  });
});

describe('In locale il ricevuto resta un numero sulla riga', () => {
  it('nessun evento, né all\'apertura né registrando', () => {
    const a = caricato(base([riga('l1', { received: 4 })]), false);
    a.eval('ordSetLine("o1", "l1", "received", "6")');
    assert.equal(ricevuto(a), 6);
    assert.deepEqual(eventi(a), [], 'ogni evento è spazio in un localStorage da ~5 MB, per un vantaggio che esiste solo in due');
  });

  it('e il numero resta quello che l\'utente ha scritto, di caricamento in caricamento', () => {
    const a = caricato(base([riga('l1')]), false);
    a.eval('ordSetLine("o1", "l1", "received", "6"); saveDB();');
    assert.equal(ricevuto(ricaricato(a)), 6);
  });

  it('accendere il modo condiviso dopo non perde niente: il ricevuto diventa un evento d\'apertura', () => {
    const a = caricato(base([riga('l1', { received: 4 })]), false);
    a.eval('saveDB()');
    const b = loadApp({ silent: true });
    b.seedStorage(a.eval('JSON.stringify(db)'));
    b.eval('Store.modoCondiviso = true');
    b.ref('Store').load();
    assert.equal(b.eval('getOrder("o1").lines[0].received'), 4);
    assert.deepEqual(JSON.parse(b.eval('JSON.stringify(db.receipts.map(e => [e.kind, e.qty]))')), [['apertura', 4]]);
  });
});
