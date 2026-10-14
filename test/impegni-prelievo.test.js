// L'impegno di un piano scende quando i suoi documenti prelevano il materiale.
//
// Il fabbisogno di un piano è lordo e non cambia; il suo impegno sì. Prima
// della correzione, un ODP che prelevava il materiale lo toglieva
// dall'esistente mentre il piano continuava a impegnarlo per intero: la stessa
// merce si contava due volte, il libero andava sotto zero e i piani chiedevano
// di ricomprare quello che era appena stato usato.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, parte, asm, comp, wc } = require('./fixtures.js');

const fase = (wcId, s) => ({ kind: 'op', workCenterId: wcId, supplierId: s || null, costMode: 'fisso', cost: 3, hours: 0.5, days: 0, note: '' });
// 100 kg di tondo; il piano 1 ne chiede 20 (10 gruppi), il piano 2 ne chiede 80.
function app() {
  const a = loadApp({ silent: true });
  a.asRole('admin');
  a.setDb(makeDb({
    suppliers: [{ id: 'beta', name: 'Beta', active: true }], workCenters: [wc('tor', 40)],
    items: [Object.assign(mat('tondo', 5), { uom: 'kg' }),
      parte('p', { cycle: [{ kind: 'item', itemId: 'tondo', qty: 2 }, fase('tor')] }),
      asm('grp', 'gruppo', { components: [comp('p', 1)] })],
    plans: [
      { id: 'pl1', number: 'FAB-1', title: 'A', date: '2026-07-01', active: true, lines: [{ id: 'l1', itemId: 'grp', qty: 10, dueDate: '2026-12-30' }] },
      { id: 'pl2', number: 'FAB-2', title: 'B', date: '2026-07-01', active: true, lines: [{ id: 'l2', itemId: 'grp', qty: 40, dueDate: '2026-12-30' }] },
    ],
  }));
  a.eval("addMovement('tondo', 'carico', 100, 'iniziale')");
  return a;
}
// Un ODP del piano 1 per `qty` pezzi, lanciato e con la prima fase avviata:
// è l'avvio che preleva il materiale.
function preleva(a, qty, planId) {
  return a.eval(`(function () {
    const o = odpNew(getItem('p'), ${qty}, '2026-12-01', { planId: ${JSON.stringify(planId || 'pl1')} });
    db.prodOrders.push(o); invalidateCaches();
    opLancia(o.id); opAvvia(o.id, o.phases[0].id, {});
    return o.id;
  })()`);
}
const conti = a => JSON.parse(a.eval(`(invalidateCaches(), JSON.stringify({
  esistente: onHandOf('tondo'), impegnato: committedOf('tondo', null), libero: freeStockOf('tondo', null),
  netto1: mrpBuyRow({ item: getItem('tondo'), qty: 20, due: '' }, true, 'pl1').net,
  netto2: mrpBuyRow({ item: getItem('tondo'), qty: 80, due: '' }, true, 'pl2').net }))`));

describe('Impegno e prelievo', () => {
  it('prima del prelievo: tutto impegnato, niente da comprare', () => {
    assert.deepEqual(conti(app()), { esistente: 100, impegnato: 100, libero: 0, netto1: 0, netto2: 0 });
  });

  it('il prelievo di un ODP del piano toglie la stessa quantità dal suo impegno', () => {
    const a = app();
    preleva(a, 10);
    assert.deepEqual(conti(a), { esistente: 80, impegnato: 80, libero: 0, netto1: 0, netto2: 0 },
      'i 20 kg usciti non sono più a magazzino né impegnati: nessun piano ricompra niente');
  });

  it('un prelievo parziale lascia impegnato solo il resto', () => {
    const a = app();
    preleva(a, 4);
    const c = conti(a);
    assert.equal(c.esistente, 92);
    assert.equal(c.impegnato, 92, '100 − 8 prelevati');
    assert.equal(c.netto1, 0);
  });

  it('il dettaglio dell\'impegno tiene il lordo e il prelevato', () => {
    const a = app();
    preleva(a, 4);
    const c = JSON.parse(a.eval("JSON.stringify(commitsOn('tondo', null).find(x => x.planId === 'pl1'))"));
    assert.equal(c.lordo, 20);
    assert.equal(c.prelevato, 8);
    assert.equal(c.qty, 12);
  });

  it('un piano che ha prelevato tutto non impegna più', () => {
    const a = app();
    preleva(a, 10);
    assert.equal(a.eval("commitsOn('tondo', null).some(x => x.planId === 'pl1')"), false);
  });

  it('un ODP annullato non riduce l\'impegno: il piano quel materiale lo deve ancora avere', () => {
    const a = app();
    const id = preleva(a, 10);
    a.eval(`getOdp(${JSON.stringify(id)}).status = 'annullato'; invalidateCaches();`);
    const c = conti(a);
    assert.equal(c.impegnato, 100);
    assert.equal(c.libero, -20, 'il materiale uscito manca davvero');
  });

  it('un ODP senza piano non tocca gli impegni', () => {
    const a = app();
    a.eval(`(function () {
      const o = odpNew(getItem('p'), 10, '2026-12-01'); db.prodOrders.push(o); invalidateCaches();
      opLancia(o.id); opAvvia(o.id, o.phases[0].id, {});
    })()`);
    const c = conti(a);
    assert.equal(c.impegnato, 100);
    assert.equal(c.libero, -20);
  });

  it('il prelievo per un piano chiuso non tocca gli altri piani', () => {
    const a = app();
    preleva(a, 10);
    a.eval("getPlan('pl1').active = false; invalidateCaches();");
    const c = conti(a);
    assert.equal(c.impegnato, 80);
    assert.equal(c.libero, 0);
  });
});
