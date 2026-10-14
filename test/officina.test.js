// Il ruolo «Officina e magazzino».
//
// Chi dichiarava l'avanzamento doveva essere «acquisti», che però scrive anche
// richieste e ordini. Il ruolo nuovo fa solo i gesti dell'officina: ricevere,
// avanzare la produzione, rettificare le giacenze. Le proprietà che contano:
//   1. i gesti dell'officina passano;
//   2. tutto il resto si ferma — ordini nuovi, articoli, distinte, gestione;
//   3. nessun ruolo esistente perde niente: acquisti riceve ancora, la
//      progettazione rettifica ancora le giacenze.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, acq } = require('./fixtures.js');

function app(role) {
  const a = loadApp({ silent: true });
  a.setDb(makeDb({ suppliers: [{ id: 's1', name: 'SKF', active: true }], movements: [], items: [acq('c1', 5)] }));
  a.asRole(role);
  a.eval(`db.orders.push({ id: 'o1', number: 'ODA-2026-001', title: '', date: '2026-02-01', status: 'inviato', supplierId: 's1',
    supplierConfirmation: '', notes: '', notesInternal: '', active: true,
    lines: [{ id: 'ol1', itemId: 'c1', code: 'C1', description: 'c1', uom: 'pz', qty: 7, price: 5, received: 0 }] });`);
  return a;
}

describe('Officina: i suoi gesti', () => {
  it('riceve la merce di un ordine', () => {
    const a = app('officina');
    a.eval('ordMarkAllReceived("o1")');
    assert.equal(a.eval('getOrder("o1").lines[0].received'), 7);
    assert.equal(a.eval('getOrder("o1").status'), 'evaso');
  });

  it('rettifica una giacenza', () => {
    const a = app('officina');
    a.el('mv-kind').value = 'rettifica';
    a.el('mv-qty').value = '12';
    a.eval("saveStockAdjust('c1')");
    assert.equal(a.eval("onHandOf('c1')"), 12);
  });

  it('una rettifica col campo vuoto non azzera la giacenza', () => {
    const a = app('officina');
    a.el('mv-kind').value = 'rettifica';
    a.el('mv-qty').value = '12';
    a.eval("saveStockAdjust('c1')");
    a.el('mv-qty').value = '';
    a.eval("saveStockAdjust('c1')");
    assert.equal(a.eval("onHandOf('c1')"), 12, 'un campo vuoto non è un inventario a zero');
  });

  it('la vista del magazzino e degli ordini non è in sola lettura', () => {
    const a = app('officina');
    assert.equal(a.eval("SHOP_VIEWS.has('stock') && canWrite('shop')"), true);
  });
});

describe('Officina: quello che non fa', () => {
  it('non crea ordini né richieste', () => {
    const a = app('officina');
    a.eval('newOrder()');
    a.eval('newRfq()');
    assert.equal(a.eval('db.orders.length'), 1);
    assert.equal(a.eval('db.rfqs.length'), 0);
  });

  it('non cambia prezzi o quantità di un ordine', () => {
    const a = app('officina');
    a.eval('orderUnlockedId = "o1"');
    a.eval('ordSetLine("o1", "ol1", "qty", "20")');
    assert.equal(a.eval('getOrder("o1").lines[0].qty'), 7);
  });

  it('non tocca articoli, distinte e gestione', () => {
    const a = app('officina');
    ['catalog', 'bom', 'docs', 'manage'].forEach(x => assert.equal(a.eval(`canWrite('${x}')`), false, x));
  });
});

describe('Nessuno perde niente', () => {
  it('acquisti riceve ancora', () => {
    const a = app('acquisti');
    a.eval('ordMarkAllReceived("o1")');
    assert.equal(a.eval('getOrder("o1").lines[0].received'), 7);
  });

  it('la progettazione rettifica ancora le giacenze', () => {
    const a = app('progettazione');
    a.el('mv-kind').value = 'rettifica';
    a.el('mv-qty').value = '3';
    a.eval("saveStockAdjust('c1')");
    assert.equal(a.eval("onHandOf('c1')"), 3);
  });

  it('il lettore non riceve e non rettifica', () => {
    const a = app('lettore');
    a.eval('ordMarkAllReceived("o1")');
    a.el('mv-kind').value = 'rettifica';
    a.el('mv-qty').value = '3';
    a.eval("saveStockAdjust('c1')");
    assert.equal(a.eval('getOrder("o1").lines[0].received'), 0);
    assert.equal(a.eval("onHandOf('c1')"), 0);
  });

  it('un utente con ruolo «officina» sopravvive alla migrazione', () => {
    const a = app('admin');
    a.eval("db.users = [{ id: 'u1', name: 'F', role: 'officina', active: true }]; migrateDB();");
    assert.equal(a.eval('db.users[0].role'), 'officina');
  });
});
