// Vincoli sui valori numerici.
// clampNum è la parte pura (niente DOM) della lettura dei campi: qui si verifica
// quella, più la tenuta del motore davanti a dati già sporchi — un backup JSON
// o un import Excel non passano dai controlli dell'interfaccia.

const assert = require('node:assert/strict');
const { describe, it, approx } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, acq, asm, comp } = require('./fixtures.js');

const app = loadApp({ silent: true });
const clampNum = app.ref('clampNum');

describe('clampNum', () => {
  it('lascia passare i valori dentro l\'intervallo', () => {
    assert.equal(clampNum(5, 0, 10), 5);
    assert.equal(clampNum(0, 0, 10), 0);
    assert.equal(clampNum(10, 0, 10), 10);
    assert.equal(clampNum(-3), -3, 'senza limiti non tocca nulla');
  });

  it('riporta al minimo e al massimo', () => {
    assert.equal(clampNum(-50, 0), 0);
    assert.equal(clampNum(-50, 0, 100), 0);
    assert.equal(clampNum(5000, 0, 1000), 1000);
    assert.equal(clampNum(150, 0, 100), 100, 'scarto oltre il 100%');
  });

  it('NaN e infiniti diventano il minimo (0 se non c\'è)', () => {
    assert.equal(clampNum(NaN, 0), 0);
    assert.equal(clampNum(NaN), 0);
    assert.equal(clampNum(Infinity, 0, 1000), 0, 'Infinity non deve passare per "molto grande"');
    assert.equal(clampNum(-Infinity, 0), 0);
    assert.equal(clampNum(parseFloat('abc'), 0), 0);
    assert.equal(clampNum(parseFloat(''), 0), 0);
  });

  it('un minimo diverso da zero viene rispettato anche sui non numeri', () => {
    assert.equal(clampNum(NaN, 1), 1);
    assert.equal(clampNum(0, 1, 10), 1);
  });

  it('parseFloat da solo lasciava passare proprio questi casi', () => {
    // Documenta il difetto che clampNum chiude: `parseFloat(x) || 0`.
    assert.equal(parseFloat('-50') || 0, -50);
    assert.equal(parseFloat('Infinity') || 0, Infinity);
    assert.equal(clampNum(parseFloat('-50'), 0), 0);
    assert.equal(clampNum(parseFloat('Infinity'), 0, 1000), 0);
  });
});

describe('il motore regge dati già sporchi (backup e import)', () => {
  function conDb(dbObj) {
    const a = loadApp({ silent: true });
    a.setDb(dbObj);
    return a;
  }

  it('costi negativi salvati in passato non producono NaN', () => {
    const a = conDb(makeDb({ items: [
      mat('m', -5), acq('c', -10),
      asm('g', 'gruppo', { components: [comp('m', 1), comp('c', 1)] }),
    ] }));
    const c = a.ref('costOf')('g');
    assert.ok(!Number.isNaN(c.total), 'totale NaN');
    approx(c.total, -15, 'il valore resta quello salvato: non lo riscriviamo di nascosto');
  });

  it('scarto negativo o assurdo non fa esplodere il calcolo', () => {
    const a = conDb(makeDb({ items: [
      mat('m', 10),
      asm('g', 'gruppo', { components: [{ itemId: 'm', qty: 1, scrapPct: -50 }] }),
    ] }));
    const c = a.ref('costOf')('g');
    assert.ok(isFinite(c.total));
    approx(c.total, 5);
  });

  it('quantità o percentuali non numeriche valgono 0, mai NaN', () => {
    const a = conDb(makeDb({ items: [
      mat('m', 10),
      asm('g', 'gruppo', { components: [{ itemId: 'm', qty: 'due', scrapPct: 'poco' }] }),
    ] }));
    const c = a.ref('costOf')('g');
    assert.ok(!Number.isNaN(c.total));
    approx(c.total, 0);
  });

  it('spese generali fuori scala restano finite', () => {
    const a = conDb(makeDb({
      settings: { overheadPct: 1e308 },
      items: [mat('m', 10), asm('g', 'gruppo', { components: [comp('m', 1)] })],
    }));
    const c = a.ref('costOf')('g');
    assert.ok(!Number.isNaN(c.total), 'totale NaN');
  });
});
