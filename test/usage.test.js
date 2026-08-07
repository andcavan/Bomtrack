// Dove è usato e impatto sui costi: la risalita della distinta.
// Il rischio qui è duplice: contare male le quantità lungo il percorso, e —
// peggio — lasciare in giro il valore simulato dopo la simulazione.

const assert = require('node:assert/strict');
const { describe, it, approx } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, acq, parte, asm, comp } = require('./fixtures.js');

function conDb(dbObj) {
  const app = loadApp({ silent: true });
  app.setDb(dbObj);
  return app;
}
// Macchina → 2 gruppi → una vite comune, in quantità diverse.
function dbCondiviso() {
  return makeDb({ items: [
    acq('vite', 1),
    asm('g1', 'gruppo', { components: [comp('vite', 4)] }),
    asm('g2', 'gruppo', { components: [comp('vite', 6)] }),
    asm('mac', 'macchina', { components: [comp('g1', 1), comp('g2', 2)] }),
  ] });
}
const codici = righe => Array.from(righe).map(r => r.item.code).sort();

describe('usageQty — quantità dentro un padre', () => {
  it('somma le comparse ripetute dello stesso componente', () => {
    const app = conDb(makeDb({ items: [
      acq('a', 1),
      asm('g', 'gruppo', { components: [comp('a', 2), comp('a', 3)] }),
    ] }));
    approx(app.eval('usageQty(getItem("g"), "a")'), 5);
  });

  it('tiene conto dello scarto', () => {
    const app = conDb(makeDb({ items: [
      mat('m', 1), asm('g', 'gruppo', { components: [comp('m', 10, 20)] }),
    ] }));
    approx(app.eval('usageQty(getItem("g"), "m")'), 12);
  });

  it('conta le righe del ciclo di lavorazione di una parte', () => {
    const app = conDb(makeDb({ items: [
      mat('m', 1),
      parte('p', { cycle: [{ kind: 'item', itemId: 'm', qty: 3 }] }),
    ] }));
    approx(app.eval('usageQty(getItem("p"), "m")'), 3);
  });

  it('una parte acquistata non impiega davvero la sua distinta', () => {
    const app = conDb(makeDb({ items: [
      mat('m', 1),
      parte('p', { sourcing: 'buy', unitCost: 50, cycle: [{ kind: 'item', itemId: 'm', qty: 3 }] }),
    ] }));
    approx(app.eval('usageQty(getItem("p"), "m")'), 0, 'il ciclo resta documentale, non incide');
  });
});

describe('directUses — impieghi diretti', () => {
  it('elenca chi contiene l\'articolo, con la quantità', () => {
    const app = conDb(dbCondiviso());
    const righe = app.eval('directUses("vite")');
    assert.deepEqual(codici(righe), ['G1', 'G2']);
    approx(Array.from(righe).find(r => r.item.id === 'g2').qty, 6);
  });

  it('un articolo non usato non ha impieghi', () => {
    const app = conDb(makeDb({ items: [acq('solo', 10)] }));
    assert.equal(app.eval('directUses("solo").length'), 0);
  });

  it('non risale oltre il primo livello', () => {
    const app = conDb(dbCondiviso());
    assert.ok(!codici(app.eval('directUses("vite")')).includes('MAC'), 'la macchina non è un impiego diretto');
  });
});

describe('ancestorTotals — quantità lungo la risalita', () => {
  it('moltiplica le quantità e somma i rami', () => {
    const app = conDb(dbCondiviso());
    const t = app.eval('Object.fromEntries(ancestorTotals("vite"))');
    approx(t.g1, 4);
    approx(t.g2, 6);
    approx(t.mac, 4 * 1 + 6 * 2, 'i due rami vanno sommati: 4 + 12 = 16');
  });

  it('un anello non manda in ricorsione infinita', () => {
    const app = conDb(makeDb({ items: [
      acq('a', 1),
      asm('g1', 'gruppo', { components: [comp('a', 1), comp('g2', 1)] }),
      asm('g2', 'gruppo', { components: [comp('g1', 1)] }),
    ] }));
    let t;
    assert.doesNotThrow(() => { t = app.eval('Object.fromEntries(ancestorTotals("a"))'); });
    assert.ok(t.g1 > 0 && t.g2 > 0);
  });
});

describe('impactedTops — cosa risente della variazione', () => {
  it('si ferma alle macchine quando ce ne sono', () => {
    const app = conDb(dbCondiviso());
    const cime = app.eval('impactedTops("vite")');
    assert.deepEqual(codici(cime), ['MAC']);
    approx(Array.from(cime)[0].qty, 16);
  });

  it('senza macchine mostra gli assiemi più alti', () => {
    const app = conDb(makeDb({ items: [
      acq('a', 1),
      asm('sg', 'sottogruppo', { components: [comp('a', 2)] }),
      asm('g', 'gruppo', { components: [comp('sg', 3)] }),
    ] }));
    const cime = app.eval('impactedTops("a")');
    assert.deepEqual(codici(cime), ['G']);
    approx(Array.from(cime)[0].qty, 6);
  });

  it('più macchine impattate vengono elencate tutte', () => {
    const app = conDb(makeDb({ items: [
      acq('a', 1),
      asm('m1', 'macchina', { components: [comp('a', 1)] }),
      asm('m2', 'macchina', { components: [comp('a', 5)] }),
    ] }));
    assert.deepEqual(codici(app.eval('impactedTops("a")')), ['M1', 'M2']);
  });
});

describe('withTempCost — simulazione senza salvare', () => {
  it('il costo della macchina segue il valore simulato', () => {
    const app = conDb(dbCondiviso());
    approx(app.ref('costOf')('mac').total, 16, 'partenza: 16 viti da 1');
    const simulato = app.eval('withTempCost(getItem("vite"), 3, () => costOf("mac").total)');
    approx(simulato, 48, '16 viti da 3');
  });

  it('dopo la simulazione il dato originale è intatto', () => {
    const app = conDb(dbCondiviso());
    app.eval('withTempCost(getItem("vite"), 999, () => costOf("mac").total)');
    approx(app.ref('getItem')('vite').purchasePrice, 1, 'il prezzo è stato modificato davvero');
    approx(app.ref('costOf')('mac').total, 16, 'la cache dei costi è rimasta sporca');
  });

  it('il ripristino avviene anche se il calcolo fallisce', () => {
    const app = conDb(dbCondiviso());
    assert.throws(() => app.eval('withTempCost(getItem("vite"), 999, () => { throw new Error("crac"); })'), /crac/);
    approx(app.ref('getItem')('vite').purchasePrice, 1);
    approx(app.ref('costOf')('mac').total, 16);
  });

  it('la simulazione non tocca il database salvato', () => {
    const app = conDb(dbCondiviso());
    app.ref('Store').commit();
    const prima = app.storage.getItem('bomtrack_v1');
    app.eval('withTempCost(getItem("vite"), 42, () => costOf("mac").total)');
    assert.equal(app.storage.getItem('bomtrack_v1'), prima, 'il persistito non deve cambiare');
  });

  it('usa il campo giusto secondo il tipo di articolo', () => {
    const app = conDb(makeDb({ items: [
      acq('c', 10), mat('m', 10),
      parte('pu', { sourcing: 'buy', unitCost: 10 }),
      parte('pc', { cycle: [{ kind: 'op', cost: 10 }] }),
      asm('g', 'gruppo', { components: [] }),
    ] }));
    assert.equal(app.eval('costField(getItem("c"))'), 'purchasePrice');
    assert.equal(app.eval('costField(getItem("m"))'), 'unitCost');
    assert.equal(app.eval('costField(getItem("pu"))'), 'unitCost');
    assert.equal(app.eval('costField(getItem("pc"))'), null, 'costo derivato dal ciclo: non si simula');
    assert.equal(app.eval('costField(getItem("g"))'), null, 'un assieme non ha un costo proprio');
  });

  it('su un articolo senza costo proprio la simulazione non altera nulla', () => {
    const app = conDb(makeDb({ items: [
      acq('a', 5), asm('g', 'gruppo', { components: [comp('a', 2)] }),
    ] }));
    const r = app.eval('withTempCost(getItem("g"), 999, () => costOf("g").total)');
    approx(r, 10, 'il calcolo prosegue normalmente');
  });
});

describe('usageBody — contenuto della finestra', () => {
  it('dice chiaramente quando un articolo non è usato', () => {
    const app = conDb(makeDb({ items: [acq('solo', 10)] }));
    assert.ok(app.eval('usageBody("solo")').includes('non è usato'));
  });

  it('elenca impieghi diretti e macchine impattate', () => {
    const app = conDb(dbCondiviso());
    const html = app.eval('usageBody("vite")');
    assert.ok(html.includes('Impieghi diretti (2)'));
    assert.ok(html.includes('Macchine impattate (1)'));
    assert.ok(html.includes('G1') && html.includes('G2') && html.includes('MAC'));
  });

  it('senza valore nel campo di simulazione non mostra le colonne del confronto', () => {
    const app = conDb(dbCondiviso());
    assert.ok(!app.eval('usageBody("vite")').includes('Costo simulato'));
  });

  it('col valore inserito compare il confronto', () => {
    const app = conDb(dbCondiviso());
    app.el('usage-whatif').value = '3';
    const html = app.eval('usageBody("vite")');
    assert.ok(html.includes('Costo simulato'), 'mancano le colonne del confronto');
    assert.ok(html.includes('Differenza'));
    approx(app.ref('costOf')('mac').total, 16, 'la simulazione ha lasciato residui');
  });
});

describe('indice inverso figlio -> padri', () => {
  it('un articolo usato in due gruppi li elenca entrambi, una volta ciascuno', () => {
    const app = conDb(dbCondiviso());
    assert.deepEqual(codici(app.eval('usedBy("vite").map(i => ({ item: i }))')), ['G1', 'G2']);
  });

  it('lo stesso componente ripetuto nel padre non lo duplica', () => {
    const app = conDb(makeDb({ items: [
      acq('a', 1),
      asm('g', 'gruppo', { components: [comp('a', 2), comp('a', 3)] }),
    ] }));
    assert.equal(app.eval('usedBy("a").length'), 1);
  });

  it('una parte compare fra i padri dei suoi articoli di ciclo', () => {
    const app = conDb(makeDb({ items: [
      mat('m', 2),
      parte('p', { cycle: [{ kind: 'item', itemId: 'm', qty: 3 }] }),
    ] }));
    assert.deepEqual(codici(app.eval('usedBy("m").map(i => ({ item: i }))')), ['P']);
  });

  it('le lavorazioni del ciclo non generano padri', () => {
    const app = conDb(makeDb({ workCenters: [{ id: 'w1', name: 'CDL', hourlyRate: 0 }], items: [
      parte('p', { cycle: [{ kind: 'op', workCenterId: 'w1', cost: 5 }] }),
    ] }));
    assert.equal(app.eval('usedBy("w1").length'), 0);
  });

  it('una riga di ciclo senza kind vale come articolo, come nel motore di costo', () => {
    const app = conDb(makeDb({ items: [
      mat('m', 2),
      parte('p', { cycle: [{ itemId: 'm', qty: 3 }] }),
    ] }));
    assert.equal(app.eval('usedBy("m").length'), 1);
  });

  it('chi non e usato da nessuno restituisce una lista vuota, non undefined', () => {
    const app = conDb(dbCondiviso());
    assert.equal(app.eval('Array.isArray(usedBy("mac")) && usedBy("mac").length'), 0);
  });

  it('il risultato e una copia: ordinarlo non altera l indice', () => {
    const app = conDb(dbCondiviso());
    app.eval('usedBy("vite").reverse()');
    assert.deepEqual(codici(app.eval('usedBy("vite").map(i => ({ item: i }))')), ['G1', 'G2']);
  });

  it('l indice si ricostruisce dopo una modifica alla distinta', () => {
    const app = conDb(dbCondiviso());
    assert.equal(app.eval('usedBy("vite").length'), 2);
    app.eval('getItem("g2").components = []; invalidateCaches();');
    assert.equal(app.eval('usedBy("vite").length'), 1);
  });
});
