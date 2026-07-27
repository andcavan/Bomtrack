// Indice articoli e memoizzazione del rollup dei costi.
// Il rischio di questa ottimizzazione è uno solo: un costo stantio mostrato
// come corretto. Questi test presidiano l'invalidazione.

const assert = require('node:assert/strict');
const { describe, it, approx } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, acq, asm, comp } = require('./fixtures.js');

function conDb(dbObj) {
  const app = loadApp({ silent: true });
  app.setDb(dbObj);
  return app;
}
// Distinta con un componente condiviso da due rami (caso diamante).
function dbDiamante() {
  return makeDb({ items: [
    acq('d', 50),
    asm('g1', 'gruppo', { components: [comp('d', 1)] }),
    asm('g2', 'gruppo', { components: [comp('d', 1)] }),
    asm('mac', 'macchina', { components: [comp('g1', 1), comp('g2', 1)] }),
  ] });
}

describe('itemIndex — lookup degli articoli', () => {
  it('trova gli articoli e ignora gli id inesistenti', () => {
    const app = conDb(makeDb({ items: [mat('m', 10), acq('a', 20)] }));
    assert.equal(app.ref('getItem')('m').unitCost, 10);
    assert.equal(app.ref('getItem')('boh'), undefined);
  });

  it('si accorge di un articolo aggiunto direttamente a db.items', () => {
    const app = conDb(makeDb({ items: [mat('m', 10)] }));
    app.ref('getItem')('m');                       // costruisce l'indice
    app.eval('db.items.push({ id: "nuovo", type: "materiale", unitCost: 7 })');
    assert.ok(app.ref('getItem')('nuovo'), 'articolo aggiunto non visto');
  });

  it('si accorge di un articolo rimosso direttamente da db.items', () => {
    const app = conDb(makeDb({ items: [mat('m', 10), acq('a', 20)] }));
    app.ref('getItem')('m');
    app.eval('db.items.splice(0, 1)');
    assert.equal(app.ref('getItem')('m'), undefined, 'articolo rimosso ancora visibile');
  });

  it('push + splice nella stessa sequenza: coperto dall\'invalidazione su commit', () => {
    const app = conDb(makeDb({ items: [mat('m', 10)] }));
    app.ref('getItem')('m');
    app.eval('db.items.push({ id: "tmp", type: "materiale", unitCost: 1 }); db.items.splice(0, 1);');
    app.ref('saveDB')();
    assert.equal(app.ref('getItem')('m'), undefined);
    assert.ok(app.ref('getItem')('tmp'), 'il nuovo articolo deve essere raggiungibile');
  });

  it('segue la riassegnazione completa di db (import di un backup)', () => {
    const app = conDb(makeDb({ items: [mat('m', 10)] }));
    app.ref('getItem')('m');
    app.ref('Store').importSnapshot(JSON.stringify(makeDb({ items: [acq('altro', 99)] })));
    assert.equal(app.ref('getItem')('m'), undefined);
    assert.equal(app.ref('getItem')('altro').purchasePrice, 99);
  });
});

describe('costOf — la cache non cambia i risultati', () => {
  it('diamante: stesso totale alla prima e alla seconda chiamata', () => {
    const app = conDb(dbDiamante());
    const primo = app.ref('costOf')('mac').total;
    const secondo = app.ref('costOf')('mac').total;
    approx(primo, 100); approx(secondo, 100);
  });

  it('un sottoalbero già visitato dà lo stesso risultato di uno calcolato da zero', () => {
    const caldo = conDb(dbDiamante());
    caldo.ref('costOf')('mac');                    // riempie la cache dal ramo padre
    const daCache = caldo.ref('costOf')('g1');

    const freddo = conDb(dbDiamante());
    const daZero = freddo.ref('costOf')('g1');

    approx(daCache.total, daZero.total);
    approx(daCache.purchased, daZero.purchased);
  });

  it('i risultati sono congelati: un chiamante non può avvelenare la cache', () => {
    const app = conDb(dbDiamante());
    const c = app.ref('costOf')('mac');
    try { c.total = 99999; } catch (e) { /* strict mode */ }
    approx(app.ref('costOf')('mac').total, 100, 'la cache è stata alterata');
  });

  it('un risultato con anello non viene messo in cache', () => {
    const app = conDb(makeDb({ items: [
      asm('a', 'macchina', { components: [comp('b', 1)] }),
      asm('b', 'gruppo', { components: [comp('a', 1)] }),
    ] }));
    assert.equal(app.ref('costOf')('a').cycle, true);
    // Se il risultato troncato fosse stato messo in cache, chiedere B partendo
    // dalla radice darebbe un valore diverso da quello calcolato per sé.
    assert.equal(app.ref('costOf')('b').cycle, true);
    assert.equal(app.eval('_costCache.size'), 0, 'nessun risultato in anello deve finire in cache');
  });
});

describe('invalidazione della cache', () => {
  it('modifica di un costo + salvataggio: il totale della macchina cambia', () => {
    const app = conDb(makeDb({ items: [
      mat('m', 10),
      asm('g', 'gruppo', { components: [comp('m', 2)] }),
      asm('mac', 'macchina', { components: [comp('g', 1)] }),
    ] }));
    approx(app.ref('costOf')('mac').total, 20);
    app.eval('getItem("m").unitCost = 30');
    app.ref('saveDB')();
    approx(app.ref('costOf')('mac').total, 60, 'costo stantio dopo il salvataggio');
  });

  it('Store.update propaga fino alla radice', () => {
    const app = conDb(makeDb({ items: [
      acq('a', 100),
      asm('mac', 'macchina', { components: [comp('a', 1)] }),
    ] }));
    approx(app.ref('costOf')('mac').total, 100);
    app.ref('Store').update('items', 'a', { purchasePrice: 250 });
    approx(app.ref('costOf')('mac').total, 250);
  });

  it('Store.remove propaga fino alla radice', () => {
    const app = conDb(makeDb({ items: [
      acq('a', 100), acq('b', 5),
      asm('mac', 'macchina', { components: [comp('a', 1), comp('b', 1)] }),
    ] }));
    approx(app.ref('costOf')('mac').total, 105);
    app.ref('Store').remove('items', 'b');
    approx(app.ref('costOf')('mac').total, 100);
  });

  it('cambiare le spese generali e salvare ricalcola tutto', () => {
    const app = conDb(makeDb({ items: [
      mat('m', 100),
      asm('mac', 'macchina', { components: [comp('m', 1)] }),
    ] }));
    approx(app.ref('costOf')('mac').total, 100);
    app.ref('Store').setSettings({ overheadPct: 20 });
    approx(app.ref('costOf')('mac').total, 120);
  });

  it('la cache viene azzerata anche se il salvataggio fallisce', () => {
    const app = loadApp({ silent: true, quotaBytes: 10 });   // qualunque scrittura eccede
    app.eval('db = ' + JSON.stringify(makeDb({ items: [
      mat('m', 10), asm('mac', 'macchina', { components: [comp('m', 1)] }),
    ] })));
    approx(app.ref('costOf')('mac').total, 10);
    app.eval('getItem("m").unitCost = 99');
    app.ref('saveDB')();                                     // fallisce sulla quota
    approx(app.ref('costOf')('mac').total, 99, 'la cache deve seguire la memoria, non il persistito');
  });
});
