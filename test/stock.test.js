// Giacenze e fabbisogno netto.
//
// La domanda a cui questi test rispondono non è «il conto torna» ma «da dove
// viene il numero». L'esistente è calcolato, non scritto: se qualcuno un giorno
// aggiunge un campo `onHand` scrivibile, questi test devono diventare rossi.

const assert = require('node:assert/strict');
const { describe, it, approx } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, acq, parte, asm, comp } = require('./fixtures.js');

function app(db) {
  const a = loadApp({ silent: true });
  a.setDb(db || base());
  a.asRole('admin');
  return a;
}
function base() {
  return makeDb({
    suppliers: [{ id: 's1', name: 'SKF', active: true }],
    items: [
      asm('mac', 'macchina', { components: [comp('g1', 1)] }),
      asm('g1', 'gruppo', { components: [comp('m1', 4), comp('c1', 2)] }),
      Object.assign(mat('m1', 10), { uom: 'kg' }),
      Object.assign(acq('c1', 5), { supplierId: 's1' }),
    ],
  });
}
// Un ordine con una riga sull'articolo indicato.
function ordine(a, o) {
  const rec = Object.assign({ id: 'o-' + Math.random().toString(36).slice(2, 8), number: 'ODA-1',
    status: 'inviato', supplierId: 's1', active: true, date: '2026-08-01' }, o);
  a.eval(`db.orders.push(${JSON.stringify(rec)}); saveDB();`);
  return rec;
}
function riga(itemId, qty, received) { return { id: 'l-' + itemId + '-' + qty, itemId, code: '', qty, price: 1, received: received || 0 }; }

describe('netRequirement — il conto, senza dati intorno', () => {
  // Gli argomenti si serializzano: passarli grezzi manderebbe nel contesto vm
  // identificatori invece di valori.
  const n = (a) => (...args) =>
    a.eval(`netRequirement(${args.map(v => (typeof v === 'number' && !isFinite(v)) ? 'NaN' : JSON.stringify(v === undefined ? null : v)).join(', ')})`);

  it('senza niente a magazzino il netto è il lordo', () => {
    assert.equal(n(app())(40, 0, 0, 0, 0), 40);
  });
  it('l\'esistente si sottrae', () => {
    assert.equal(n(app())(40, 25, 0, 0, 0), 15);
  });
  it('l\'ordinato in arrivo si sottrae anche lui', () => {
    assert.equal(n(app())(40, 25, 10, 0, 0), 5, 'ricomprare ciò che è già in viaggio è il difetto da togliere');
  });
  it('la scorta minima si somma: è quello che si vuole lasciare a magazzino', () => {
    assert.equal(n(app())(40, 25, 0, 10, 0), 25);
  });
  it('quando basta, il netto è zero e non diventa negativo', () => {
    assert.equal(n(app())(40, 100, 0, 0, 0), 0);
    assert.equal(n(app())(0, 100, 0, 0, 0), 0);
  });
  it('il lotto arrotonda per eccesso: mezzo lotto non lo vende nessuno', () => {
    assert.equal(n(app())(40, 25, 0, 0, 10), 20, '15 mancanti → 2 lotti da 10');
    assert.equal(n(app())(40, 30, 0, 0, 10), 10);
  });
  it('un mancante esattamente pari a un multiplo non fa scattare un lotto in più', () => {
    assert.equal(n(app())(40, 20, 0, 0, 10), 20, 'i float non devono produrre 30 per un 20 arrivato da 19.9999999');
  });
  it('lotto zero o assente: nessun arrotondamento', () => {
    approx(n(app())(40, 25.5, 0, 0, 0), 14.5);
  });
  it('valori sporchi non producono NaN', () => {
    assert.equal(n(app())('x', null, undefined, NaN, 'y'), 0);
  });
});

describe('L\'esistente è calcolato, non scritto', () => {
  it('un database senza movimenti né ordini ha giacenza zero', () => {
    const a = app();
    assert.equal(a.eval('onHandOf("m1")'), 0);
    assert.equal(a.eval('incomingOf("m1")'), 0);
  });

  it('il ricevuto su un ordine carica il magazzino', () => {
    const a = app();
    ordine(a, { status: 'parziale', lines: [riga('m1', 100, 60)] });
    assert.equal(a.eval('onHandOf("m1")'), 60);
    assert.equal(a.eval('incomingOf("m1")'), 40, 'il resto è ancora in arrivo');
  });

  it('correggere il ricevimento corregge la giacenza, senza doverlo fare due volte', () => {
    const a = app();
    const o = ordine(a, { status: 'parziale', lines: [riga('m1', 100, 60)] });
    a.eval(`const o = getOrder(${JSON.stringify(o.id)}); o.lines[0].received = 80; saveDB();`);
    assert.equal(a.eval('onHandOf("m1")'), 80);
    assert.equal(a.eval('incomingOf("m1")'), 20);
  });

  it('una bozza non è in arrivo: non è ancora uscita di qui', () => {
    const a = app();
    ordine(a, { status: 'bozza', lines: [riga('m1', 50, 0)] });
    assert.equal(a.eval('incomingOf("m1")'), 0,
      'contarla farebbe rimandare acquisti che nessuno ha ordinato');
  });

  it('un ordine annullato non porta niente', () => {
    const a = app();
    ordine(a, { status: 'annullato', lines: [riga('m1', 50, 0)] });
    assert.equal(a.eval('incomingOf("m1")'), 0);
  });

  it('un ordine evaso non è più in arrivo, ma il ricevuto resta a magazzino', () => {
    const a = app();
    ordine(a, { status: 'evaso', lines: [riga('m1', 50, 50)] });
    assert.equal(a.eval('incomingOf("m1")'), 0);
    assert.equal(a.eval('onHandOf("m1")'), 50);
  });

  it('le righe manuali senza articolo non muovono nessuna giacenza', () => {
    const a = app();
    ordine(a, { status: 'inviato', lines: [{ id: 'x', itemId: null, code: 'LIBERA', qty: 10, received: 5 }] });
    assert.equal(a.eval('onHandOf("m1")'), 0);
  });

  it('più ordini si sommano', () => {
    const a = app();
    ordine(a, { status: 'evaso', lines: [riga('m1', 30, 30)] });
    ordine(a, { status: 'parziale', lines: [riga('m1', 20, 5)] });
    assert.equal(a.eval('onHandOf("m1")'), 35);
    assert.equal(a.eval('incomingOf("m1")'), 15);
  });
});

describe('Movimenti', () => {
  it('un carico somma, un consumo sottrae', () => {
    const a = app();
    a.eval('addMovement("m1", "carico", 100, "inventario iniziale")');
    a.eval('addMovement("m1", "scarico", -30, "commessa 240")');
    assert.equal(a.eval('onHandOf("m1")'), 70);
  });

  it('movimenti e ricevimenti si sommano fra loro', () => {
    const a = app();
    ordine(a, { status: 'evaso', lines: [riga('m1', 40, 40)] });
    a.eval('addMovement("m1", "scarico", -15, "produzione")');
    assert.equal(a.eval('onHandOf("m1")'), 25);
  });

  it('un movimento da zero non si registra', () => {
    const a = app();
    assert.equal(a.eval('addMovement("m1", "carico", 0, "")'), null);
    assert.equal((a.snapshot().movements || []).length, 0);
  });

  it('non si movimenta ciò che non si tiene a magazzino', () => {
    const a = app();
    assert.equal(a.eval('addMovement("mac", "carico", 5, "")'), null,
      'un assieme si produce: la sua giacenza sarebbe quella dei componenti contata due volte');
    assert.equal(a.eval('addMovement("non-esiste", "carico", 5, "")'), null);
  });

  it('la rettifica registra la differenza, non il valore contato', () => {
    const a = app();
    ordine(a, { status: 'evaso', lines: [riga('m1', 40, 40)] });
    a.eval('window.__x = null');
    a.el('mv-kind').value = 'rettifica';
    a.el('mv-qty').value = '35';
    a.el('mv-note').value = 'inventario';
    a.eval('saveStockAdjust("m1")');
    const mv = a.snapshot().movements;
    assert.equal(mv.length, 1);
    assert.equal(mv[0].qty, -5, 'lo storico deve dire cosa è cambiato, non cosa c\'era');
    assert.equal(a.eval('onHandOf("m1")'), 35);
  });

  it('una rettifica che non cambia niente non lascia un movimento vuoto', () => {
    const a = app();
    ordine(a, { status: 'evaso', lines: [riga('m1', 40, 40)] });
    a.el('mv-kind').value = 'rettifica';
    a.el('mv-qty').value = '40';
    a.eval('saveStockAdjust("m1")');
    assert.equal((a.snapshot().movements || []).length, 0);
  });

  it('eliminare un movimento riporta indietro la giacenza', () => {
    const a = app();
    const m = JSON.parse(a.eval('JSON.stringify(addMovement("m1", "carico", 100, ""))'));
    assert.equal(a.eval('onHandOf("m1")'), 100);
    a.eval(`Store.remove("movements", ${JSON.stringify(m.id)})`);
    assert.equal(a.eval('onHandOf("m1")'), 0);
  });

  it('il ruolo lettore non movimenta', () => {
    const a = app();
    a.asRole('lettore');
    a.el('mv-kind').value = 'carico';
    a.el('mv-qty').value = '50';
    a.eval('saveStockAdjust("m1")');
    assert.equal((a.snapshot().movements || []).length, 0);
  });
});

describe('L\'indice delle giacenze si aggiorna', () => {
  it('un movimento salvato cambia subito il risultato', () => {
    const a = app();
    assert.equal(a.eval('onHandOf("m1")'), 0);      // costruisce l'indice
    a.eval('addMovement("m1", "carico", 42, "")');
    assert.equal(a.eval('onHandOf("m1")'), 42, 'senza invalidazione l\'indice resterebbe a zero');
  });

  it('anche una modifica diretta a un ordine, dopo il salvataggio', () => {
    const a = app();
    const o = ordine(a, { status: 'parziale', lines: [riga('m1', 100, 10)] });
    assert.equal(a.eval('onHandOf("m1")'), 10);
    a.eval(`const o = getOrder(${JSON.stringify(o.id)}); o.lines[0].received = 90; saveDB();`);
    assert.equal(a.eval('onHandOf("m1")'), 90);
  });
});

describe('Fabbisogno netto nella lista d\'acquisto', () => {
  function conPiano(a) {
    a.eval(`Store.insert('plans', { id: 'pl1', number: 'FAB-1', active: true, lines: [{ id: 'l1', itemId: 'mac', qty: 10 }] });`);
    return a;
  }
  function righe(a, net) {
    return JSON.parse(a.eval(`JSON.stringify(mrpBuyRows(getPlan("pl1"), ${net ? 'true' : 'false'}).map(r => ({ code: r.item.code, qty: r.qty, net: r.net, qtyOrder: r.qtyOrder, onHand: r.onHand, incoming: r.incoming, coperto: r.coperto, amount: r.amount })))`));
  }

  it('senza magazzino, netto e lordo coincidono', () => {
    const a = conPiano(app());
    const r = righe(a, true).find(x => x.code === 'M1');
    assert.equal(r.qty, 40);        // 10 macchine × 1 gruppo × 4
    assert.equal(r.net, 40);
  });

  it('l\'esistente riduce quanto si compra, ma non il lordo', () => {
    const a = conPiano(app());
    a.eval('addMovement("m1", "carico", 25, "")');
    const r = righe(a, true).find(x => x.code === 'M1');
    assert.equal(r.qty, 40, 'il lordo non cambia mai: è una proprietà del prodotto');
    assert.equal(r.onHand, 25);
    assert.equal(r.qtyOrder, 15);
  });

  it('col netto spento si compra il lordo, come prima', () => {
    const a = conPiano(app());
    a.eval('addMovement("m1", "carico", 25, "")');
    const r = righe(a, false).find(x => x.code === 'M1');
    assert.equal(r.qtyOrder, 40);
    assert.equal(r.net, 15, 'il netto resta calcolato: serve a mostrarlo, non ad applicarlo');
  });

  it('una riga coperta si segnala e vale zero', () => {
    const a = conPiano(app());
    a.eval('addMovement("m1", "carico", 500, "")');
    const r = righe(a, true).find(x => x.code === 'M1');
    assert.equal(r.qtyOrder, 0);
    assert.equal(r.coperto, true);
    assert.equal(r.amount, 0, 'una riga coperta non deve pesare sul totale d\'acquisto');
  });

  it('la scorta minima fa comprare più del mancante', () => {
    const a = conPiano(app());
    a.eval('addMovement("m1", "carico", 40, ""); const it = getItem("m1"); it.safetyStock = 12; touch(it); saveDB();');
    const r = righe(a, true).find(x => x.code === 'M1');
    assert.equal(r.qtyOrder, 12, 'il piano è coperto, ma la scorta va ricostituita');
  });

  it('il lotto di riordino arrotonda la riga', () => {
    const a = conPiano(app());
    a.eval('addMovement("m1", "carico", 25, ""); const it = getItem("m1"); it.lotSize = 10; touch(it); saveDB();');
    const r = righe(a, true).find(x => x.code === 'M1');
    assert.equal(r.qtyOrder, 20, '15 mancanti, si comprano 2 lotti da 10');
  });

  it('l\'importo segue la quantità che si compra davvero', () => {
    const a = conPiano(app());
    a.eval('addMovement("m1", "carico", 25, "")');
    const r = righe(a, true).find(x => x.code === 'M1');
    approx(r.amount, 15 * 10, 'altrimenti il totale del piano direbbe una spesa che nessuno farà');
  });

  it('il minimo del fornitore si confronta con la quantità netta', () => {
    const a = conPiano(app());
    a.eval(`const it = getItem("c1"); it.priceList = [{ id: 'p1', supplierId: 's1', price: 5, minQty: 15 }]; it.activePriceId = 'p1'; touch(it); saveDB();`);
    a.eval('addMovement("c1", "carico", 12, "")');
    const r = JSON.parse(a.eval('JSON.stringify(mrpBuyRows(getPlan("pl1"), true).map(x => ({ code: x.item.code, qtyOrder: x.qtyOrder, underMin: x.underMin })))'))
      .find(x => x.code === 'C1');
    assert.equal(r.qtyOrder, 8);        // 20 lordi − 12
    assert.equal(r.underMin, true, 'sotto il minimo si è per quello che si ordina, non per quello che serve');
  });
});

describe('Documenti generati dal fabbisogno netto', () => {
  function conPiano(a) {
    a.eval(`Store.insert('plans', { id: 'pl1', number: 'FAB-1', active: true, lines: [{ id: 'l1', itemId: 'mac', qty: 10 }] });`);
    return a;
  }

  it('l\'ordine porta la quantità netta, non quella lorda', () => {
    const a = conPiano(app());
    a.eval('addMovement("m1", "carico", 25, ""); mrpNet = true;');
    const righe = JSON.parse(a.eval('JSON.stringify(mrpBuyRows(getPlan("pl1"), true).filter(r => r.item.code === "M1"))'));
    const linea = JSON.parse(a.eval(`JSON.stringify(planDocLine(mrpBuyRows(getPlan("pl1"), true).find(r => r.item.code === "M1"), 10))`));
    assert.equal(righe[0].qtyOrder, 15);
    assert.equal(linea.qty, 15, 'mandare al fornitore un numero diverso da quello mostrato sarebbe il modo più rapido di perdere fiducia');
  });

  it('col netto spento torna la quantità lorda', () => {
    const a = conPiano(app());
    a.eval('addMovement("m1", "carico", 25, ""); mrpNet = false;');
    const linea = JSON.parse(a.eval(`JSON.stringify(planDocLine(mrpBuyRows(getPlan("pl1"), false).find(r => r.item.code === "M1"), 10))`));
    assert.equal(linea.qty, 40);
  });
});

describe('Le giacenze nel giro verso il database condiviso', () => {
  it('i movimenti sono una collezione come le altre', () => {
    const a = app();
    a.eval('addMovement("m1", "carico", 10, "nota")');
    const prima = a.snapshot().movements;
    const dopo = JSON.parse(a.eval('JSON.stringify(nestDB(flattenDB(db)).movements)'));
    assert.deepEqual(dopo, prima);
  });

  it('un backup vecchio senza movimenti si apre lo stesso', () => {
    const a = app();
    a.ref('Store').importSnapshot({ items: [{ id: 'x', code: 'X', name: 'X', type: 'materiale' }] });
    assert.deepEqual(a.snapshot().movements, []);
  });
});
