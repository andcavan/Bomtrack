// Documenti: stati, ricevimenti e blocchi.
//
// È il buco di copertura più costoso del repo (C3 in docs/analisi-tecnica.md):
// `views-docs.js` è il file più lungo e il più duplicato, e finché queste tre
// cose non erano fissate per iscritto la deduplica RFQ/ODA era un refactor
// senza rete. Qui si scrive **cosa deve continuare a succedere**, non come è
// scritto oggi: sono i test che devono sopravvivere alla riscrittura del file.
//
// Le tre regole:
// 1. lo stato di un documento è in parte **derivato** — «ricevuto tutto» e
//    «offerta tornata» sono fatti misurabili, non scelte da ricordarsi;
// 2. il **blocco** cambia con lo stato e protegge i dati contrattuali, mai le
//    note e mai i ricevimenti;
// 3. la **numerazione** è progressiva per anno e per tipo.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, acq } = require('./fixtures.js');

function base(over) {
  return makeDb(Object.assign({
    suppliers: [{ id: 's1', name: 'SKF', active: true }, { id: 's2', name: 'Bianchi', active: true }],
    items: [Object.assign(acq('c1', 5), {
      priceList: [{ id: 'p1', supplierId: 's1', price: 5, date: '2026-01-01' }],
      activePriceId: 'p1', supplierId: 's1',
    })],
  }, over || {}));
}
function app(db, role) {
  const a = loadApp({ silent: true });
  a.setDb(db || base());
  a.asRole(role || 'admin');
  return a;
}
// Un ordine con una riga sola, nello stato richiesto.
function conOrdine(a, status, qty, received) {
  a.eval(`Store.insert('orders', { id: 'o1', number: 'ODA-2026-001', title: 'prova', date: '2026-02-01',
    status: ${JSON.stringify(status)}, supplierId: 's1', supplierConfirmation: '', notes: '', notesInternal: '',
    lines: [{ id: 'ol1', itemId: 'c1', code: 'C1', description: 'Commerciale c1', uom: 'pz',
      qty: ${qty}, price: 5, deliveryDate: '2026-03-01', received: ${received || 0}, note: '' }], active: true });`);
  return a;
}
function conRfq(a, status, prezzi) {
  const lines = prezzi.map((p, i) => `{ id: 'rl${i}', itemId: 'c1', code: 'C1', description: 'Commerciale c1',
    uom: 'pz', qty: 10, price: ${p === null ? "''" : p}, deliveryDate: '', note: '' }`).join(',');
  a.eval(`Store.insert('rfqs', { id: 'r1', number: 'RDO-2026-001', title: 'prova', date: '2026-02-01',
    status: ${JSON.stringify(status)}, supplierId: 's1', notes: '', notesInternal: '', lines: [${lines}], active: true });`);
  return a;
}
const ordine = a => JSON.parse(a.eval('JSON.stringify(getOrder("o1"))'));
const rfq = a => JSON.parse(a.eval('JSON.stringify(getRfq("r1"))'));

describe('Ordine: lo stato segue i ricevimenti, non la memoria di chi registra', () => {
  it('ricevuto in parte → Parziale', () => {
    const a = conOrdine(app(), 'inviato', 10, 0);
    a.eval('ordSetLine("o1", "ol1", "received", "4")');
    assert.equal(ordine(a).status, 'parziale');
  });

  it('ricevuto tutto → Evaso', () => {
    const a = conOrdine(app(), 'inviato', 10, 4);
    a.eval('ordSetLine("o1", "ol1", "received", "10")');
    assert.equal(ordine(a).status, 'evaso');
  });

  it('azzerando i ricevimenti si torna indietro, non si resta evasi', () => {
    const a = conOrdine(app(), 'evaso', 10, 10);
    a.eval('ordSetLine("o1", "ol1", "received", "0")');
    assert.equal(ordine(a).status, 'inviato', 'senza conferma del fornitore');
  });

  it('con la conferma del fornitore il ritorno indietro è a Confermato', () => {
    const a = conOrdine(app(), 'evaso', 10, 10);
    a.eval('getOrder("o1").supplierConfirmation = "CONF-99"');
    a.eval('ordSetLine("o1", "ol1", "received", "0")');
    assert.equal(ordine(a).status, 'confermato');
  });

  it('non si può ricevere più di quanto ordinato', () => {
    const a = conOrdine(app(), 'inviato', 10, 0);
    a.eval('ordSetLine("o1", "ol1", "received", "999")');
    const o = ordine(a);
    assert.equal(o.lines[0].received, 10, 'si tronca alla quantità ordinata');
    assert.equal(o.status, 'evaso');
  });

  it('la quantità di un ordine evaso è protetta: cambiarla richiede lo sblocco', () => {
    const a = conOrdine(app(), 'evaso', 10, 10);
    a.eval('ordSetLine("o1", "ol1", "qty", "20")');
    assert.equal(ordine(a).lines[0].qty, 10, 'è un dato contrattuale, l\'ordine è già uscito');
    assert.equal(ordine(a).status, 'evaso');
  });

  it('sbloccato, alzare la quantità riapre l\'ordine evaso', () => {
    const a = conOrdine(app(), 'evaso', 10, 10);
    a.eval('orderUnlockedId = "o1"');
    a.eval('ordSetLine("o1", "ol1", "qty", "20")');
    assert.equal(ordine(a).status, 'parziale', 'la soglia di evasione si è spostata');
  });

  it('«ricevi tutto» chiude l\'ordine in un gesto', () => {
    const a = conOrdine(app(), 'inviato', 7, 0);
    a.eval('ordMarkAllReceived("o1")');
    const o = ordine(a);
    assert.equal(o.lines[0].received, 7);
    assert.equal(o.status, 'evaso');
  });

  it('le righe di un ordine uscito non si cancellano senza sbloccarlo', () => {
    const a = conOrdine(app(), 'evaso', 10, 10);
    a.eval('ordDelLine("o1", "ol1")');
    assert.equal(ordine(a).lines.length, 1);
  });

  it('cancellare l\'ultima riga non lascia l\'ordine evaso a vuoto', () => {
    const a = conOrdine(app(), 'evaso', 10, 10);
    a.eval('orderUnlockedId = "o1"');
    a.eval('ordDelLine("o1", "ol1")');
    const o = ordine(a);
    assert.equal(o.lines.length, 0);
    assert.equal(o.status, 'inviato', 'senza righe non c\'è niente di ricevuto');
  });

  it('bozza e annullato restano decisioni di chi scrive: non si derivano', () => {
    ['bozza', 'annullato'].forEach(st => {
      const a = conOrdine(app(), st, 10, 10);
      a.eval('ordAutoStatus(getOrder("o1"))');
      assert.equal(ordine(a).status, st);
    });
  });

  it('il numero di conferma porta l\'ordine da Inviato a Confermato', () => {
    const a = conOrdine(app(), 'inviato', 10, 0);
    a.eval('ordSetField("o1", "supplierConfirmation", "CONF-1")');
    assert.equal(ordine(a).status, 'confermato');
  });
});

describe('Richiesta: l\'offerta tornata è un fatto, non una spunta', () => {
  it('tutte le righe con prezzo → Offerta ricevuta', () => {
    const a = conRfq(app(), 'inviata', [null, null]);
    a.eval('rfqSetLine("r1", "rl0", "price", "3")');
    assert.equal(rfq(a).status, 'inviata', 'una riga sola non basta');
    a.eval('rfqSetLine("r1", "rl1", "price", "4")');
    assert.equal(rfq(a).status, 'ricevuta');
  });

  it('togliere un prezzo riporta la richiesta a Inviata', () => {
    const a = conRfq(app(), 'ricevuta', [3, 4]);
    a.eval('rfqSetLine("r1", "rl0", "price", "")');
    assert.equal(rfq(a).status, 'inviata');
  });

  it('una bozza non diventa «ricevuta» solo perché ha i prezzi', () => {
    const a = conRfq(app(), 'bozza', [3, 4]);
    a.eval('rfqAutoStatus(getRfq("r1"))');
    assert.equal(rfq(a).status, 'bozza', 'non è mai uscita: non può essere tornata');
  });

  it('una richiesta senza righe non è un\'offerta ricevuta', () => {
    const a = conRfq(app(), 'inviata', []);
    a.eval('rfqAutoStatus(getRfq("r1"))');
    assert.equal(rfq(a).status, 'inviata');
  });
});

describe('Blocchi: cosa si può ancora toccare, e quando', () => {
  it('a richiesta inviata il contratto è chiuso ma il prezzo si compila', () => {
    const a = conRfq(app(), 'inviata', [null]);
    assert.equal(a.eval('rfqMode(getRfq("r1"))'), 'offer');
    a.eval('rfqSetLine("r1", "rl0", "qty", "999")');
    assert.equal(rfq(a).lines[0].qty, 10, 'la quantità è un dato contrattuale');
    a.eval('rfqSetLine("r1", "rl0", "price", "7")');
    assert.equal(rfq(a).lines[0].price, 7, 'il prezzo è la risposta che si aspettava');
  });

  it('a richiesta chiusa non si tocca più niente, tranne note e stato', () => {
    const a = conRfq(app(), 'chiusa', [3]);
    assert.equal(a.eval('rfqMode(getRfq("r1"))'), 'none');
    a.eval('rfqSetLine("r1", "rl0", "price", "99")');
    assert.equal(rfq(a).lines[0].price, 3);
    a.eval('rfqSetField("r1", "notes", "arrivata via mail")');
    assert.equal(rfq(a).notes, 'arrivata via mail', 'le note restano sempre aperte');
  });

  it('a ordine inviato il contratto è chiuso ma i ricevimenti no', () => {
    const a = conOrdine(app(), 'inviato', 10, 0);
    assert.equal(a.eval('ordMode(getOrder("o1"))'), 'reception');
    a.eval('ordSetLine("o1", "ol1", "price", "99")');
    assert.equal(ordine(a).lines[0].price, 5, 'il prezzo è concordato');
    a.eval('ordSetLine("o1", "ol1", "received", "3")');
    assert.equal(ordine(a).lines[0].received, 3);
  });

  it('la data confermata dal fornitore si registra a ordine già inviato', () => {
    // Arriva dopo l'invio per definizione: se fosse un dato contrattuale non
    // ci sarebbe modo di scriverla.
    const a = conOrdine(app(), 'confermato', 10, 0);
    a.eval('ordSetLine("o1", "ol1", "confirmedDate", "2026-03-20")');
    assert.equal(ordine(a).lines[0].confirmedDate, '2026-03-20');
    assert.equal(a.eval('orderWorstDelay(getOrder("o1"))'), 19, 'chiesto il 1° marzo, confermato il 20');
  });

  it('un ordine annullato è sola lettura, ricevimenti compresi', () => {
    const a = conOrdine(app(), 'annullato', 10, 0);
    assert.equal(a.eval('ordMode(getOrder("o1"))'), 'none');
    a.eval('ordSetLine("o1", "ol1", "received", "5")');
    assert.equal(ordine(a).lines[0].received, 0);
  });

  it('lo sblocco vale per un documento solo, e si perde tornando all\'elenco', () => {
    const a = conOrdine(app(), 'evaso', 10, 10);
    a.eval('orderUnlockedId = "o1"');
    assert.equal(a.eval('ordMode(getOrder("o1"))'), 'full');
    a.eval('ordSetLine("o1", "ol1", "price", "9")');
    assert.equal(ordine(a).lines[0].price, 9, 'sbloccato: si corregge davvero');
    a.eval('orderBackToList()');
    assert.equal(a.eval('orderUnlockedId'), null);
    assert.equal(a.eval('ordMode(getOrder("o1"))'), 'reception', 'si richiude da sé');
  });

  it('un lettore non passa nemmeno su un documento in bozza', () => {
    const a = conOrdine(app(base(), 'lettore'), 'bozza', 10, 0);
    a.asRole('lettore');
    a.eval('ordSetLine("o1", "ol1", "qty", "99")');
    assert.equal(ordine(a).lines[0].qty, 10, 'il ruolo viene prima del blocco di stato');
  });
});

describe('Numerazione: progressiva per anno e per tipo', () => {
  it('il primo documento dell\'anno parte da 001', () => {
    const a = app();
    const anno = new Date().getFullYear();
    assert.equal(a.eval('nextOrderNumber()'), `ODA-${anno}-001`);
    assert.equal(a.eval('nextRfqNumber()'), `RFQ-${anno}-001`);
  });

  it('i numeri di altri anni non spostano il progressivo di quest\'anno', () => {
    const a = app();
    a.eval(`Store.insert('orders', { id: 'vecchio', number: 'ODA-2019-042', status: 'evaso', lines: [], active: true });`);
    assert.equal(a.eval('nextOrderNumber()'), `ODA-${new Date().getFullYear()}-001`);
  });

  it('il progressivo riprende dal massimo, non dal conteggio', () => {
    const a = app();
    const anno = new Date().getFullYear();
    a.eval(`Store.insert('orders', { id: 'o7', number: 'ODA-${anno}-007', status: 'evaso', lines: [], active: true });`);
    assert.equal(a.eval('nextOrderNumber()'), `ODA-${anno}-008`, 'i buchi lasciati dalle eliminazioni non si riusano');
  });
});

describe('Una regola sola per i due tipi di documento (0.41.0)', () => {
  // Dopo la deduplica le due strade passano dalle stesse funzioni: questi
  // controlli verificano che il parametro `kind` scelga davvero il
  // comportamento giusto, ed è ciò che impedisce alle due copie di tornare.
  it('il registro conosce entrambi i tipi, e un tipo inventato non lancia', () => {
    const a = app();
    assert.equal(a.eval('docKind("order").coll'), 'orders');
    assert.equal(a.eval('docKind("rfq").coll'), 'rfqs');
    assert.equal(a.eval('docKind("inesistente").coll'), 'rfqs', 'ripiega sul primo invece di rompersi');
  });

  it('il prezzo di riga esiste sull\'ordine e non sulla richiesta', () => {
    const a = app();
    assert.equal(a.eval('docKind("order").hasLinePrice'), true);
    assert.equal(a.eval('docKind("rfq").hasLinePrice'), false, 'la richiesta è la domanda, non la risposta');
  });

  it('lo stesso campo è governato da blocchi diversi nei due documenti', () => {
    const a = app();
    assert.equal(a.eval('docKind("rfq").lineLock("price")'), 'offer', 'sulla richiesta il prezzo torna col preventivo');
    assert.equal(a.eval('docKind("order").lineLock("price")'), 'contract', 'sull\'ordine è concordato');
    assert.equal(a.eval('docKind("order").lineLock("received")'), 'reception');
  });

  it('docGuard blocca lo stesso su entrambi, e il messaggio si accorda', () => {
    const a = conOrdine(conRfq(app(), 'chiusa', [3]), 'annullato', 10, 0);
    assert.equal(a.eval('docGuard("rfq", "r1", "contract")'), false);
    assert.equal(a.eval('docGuard("order", "o1", "contract")'), false);
    assert.equal(a.eval('docGuard("order", "inesistente", "contract")'), false, 'un id che non esiste non passa');
  });

  it('l\'intestazione del documento salta le righe vuote', () => {
    const a = app();
    a.eval(`db.settings.company = { name: 'Acme', street: 'Via Roma', streetNumber: '1',
      zip: '41100', city: 'Modena', province: 'MO', country: 'Italia', vat: '123', email: '', phone: '' }`);
    const righe = JSON.parse(a.eval('JSON.stringify(docPartyLines(db.settings.company))'));
    assert.deepEqual(righe, ['Acme', 'Via Roma 1', '41100 Modena (MO)', 'Italia', 'P.IVA 123']);
    assert.ok(!righe.some(r => !r), 'un recapito mancante non lascia una riga bianca nel blocco');
  });

  it('sul documento stampato la partita IVA è bilingue', () => {
    const a = app();
    const it = JSON.parse(a.eval('JSON.stringify(docPartyLines({ name: "Acme", vat: "123" }))'));
    const en = JSON.parse(a.eval('JSON.stringify(docPartyLines({ name: "Acme", vat: "123" }, true))'));
    assert.deepEqual(it, ['Acme', 'P.IVA 123']);
    assert.deepEqual(en, ['Acme', 'P.IVA / VAT 123'], 'i documenti vanno anche a fornitori esteri');
  });

  it('un fornitore non ancora scelto non produce righe', () => {
    const a = app();
    assert.deepEqual(JSON.parse(a.eval('JSON.stringify(docPartyLines(null))')), []);
  });
});

describe('Dalla richiesta all\'ordine', () => {
  it('l\'ordine eredita fornitore, condizioni e righe, e azzera i ricevimenti', () => {
    const a = conRfq(app(), 'ricevuta', [3]);
    a.eval('getRfq("r1").transport = "Porto franco"; getRfq("r1").payment = "Bonifico 30gg";');
    a.eval('orderFromRfq("r1")');
    const o = JSON.parse(a.eval('JSON.stringify(db.orders[0])'));
    assert.equal(o.supplierId, 's1');
    assert.equal(o.transport, 'Porto franco');
    assert.equal(o.payment, 'Bonifico 30gg');
    assert.equal(o.rfqId, 'r1', 'la tracciabilità richiesta → ordine resta');
    assert.equal(o.status, 'bozza', 'nasce da rileggere, non da spedire');
    assert.equal(o.lines.length, 1);
    assert.equal(o.lines[0].price, 3, 'il prezzo offerto diventa il prezzo d\'ordine');
    assert.equal(o.lines[0].received, 0);
    assert.notEqual(o.lines[0].id, 'rl0', 'le righe sono nuove: due documenti distinti');
  });

  it('generando l\'ordine la richiesta uscita si chiude da sé', () => {
    const a = conRfq(app(), 'ricevuta', [3]);
    a.eval('orderFromRfq("r1")');
    assert.equal(rfq(a).status, 'chiusa');
  });

  it('da una bozza si può generare un ordine di prova senza chiuderla', () => {
    const a = conRfq(app(), 'bozza', [3]);
    a.eval('orderFromRfq("r1")');
    assert.equal(rfq(a).status, 'bozza', 'non era uscita: non c\'è niente da chiudere');
  });
});
