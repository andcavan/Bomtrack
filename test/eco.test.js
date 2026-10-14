// Le modifiche tecniche: ogni revisione rilasciata è numerata, ha un tipo, e
// fotografa i documenti aperti costruiti sulla versione che si lascia.
//
// Le proprietà che contano:
//   1. numerazione MT-AAAA-NNN per anno, che non si ripete;
//   2. l'impatto prende i piani e gli ODP dell'articolo **e di chi lo
//      contiene**, e gli ordini dei componenti che la modifica tocca;
//   3. i documenti chiusi non contano: la domanda è «cosa c'è ancora in giro»;
//   4. la fotografia resta com'era anche quando i documenti cambiano;
//   5. il tipo è uno di quelli previsti, o niente.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, acq, asm, comp } = require('./fixtures.js');

function app() {
  const a = loadApp({ silent: true });
  a.setDb(makeDb({
    suppliers: [{ id: 's1', name: 'SKF', active: true }],
    items: [
      asm('mac', 'macchina', { components: [comp('g1', 1)] }),
      asm('g1', 'gruppo', { components: [comp('m1', 2), comp('c1', 4)] }),
      mat('m1', 10), acq('c1', 5), acq('c2', 7),
    ],
    plans: [
      { id: 'pl1', number: 'FAB-1', active: true, lines: [{ id: 'l1', itemId: 'mac', qty: 1 }] },
      { id: 'pl2', number: 'FAB-2', active: false, lines: [{ id: 'l2', itemId: 'mac', qty: 1 }] },
    ],
    orders: [
      { id: 'o1', number: 'ODA-1', status: 'inviato', supplierId: 's1', active: true, lines: [{ id: 'x1', itemId: 'c1', qty: 4 }] },
      { id: 'o2', number: 'ODA-2', status: 'evaso', supplierId: 's1', active: true, lines: [{ id: 'x2', itemId: 'c1', qty: 4 }] },
      { id: 'o3', number: 'ODA-3', status: 'inviato', supplierId: 's1', active: true, lines: [{ id: 'x3', itemId: 'm1', qty: 4 }] },
    ],
    prodOrders: [{ id: 'p1', number: 'ODP-1', itemId: 'g1', status: 'lanciato', qty: 1, phases: [] }],
    revisions: [],
  }));
  a.asRole('admin');
  return a;
}
const rilascia = (a, id, tipo) => JSON.parse(a.eval(`JSON.stringify(releaseRevision('${id}', 'prova', { tipo: '${tipo || ''}' }))`));

describe('Modifiche tecniche: numero e tipo', () => {
  it('numerate per anno, senza ripetersi fra articoli diversi', () => {
    const a = app();
    const anno = new Date().getFullYear();
    assert.equal(rilascia(a, 'g1').ecoNumber, `MT-${anno}-001`);
    assert.equal(rilascia(a, 'mac').ecoNumber, `MT-${anno}-002`);
    assert.equal(rilascia(a, 'g1').ecoNumber, `MT-${anno}-003`);
  });

  it('il tipo è uno di quelli previsti, o niente', () => {
    const a = app();
    assert.equal(rilascia(a, 'g1', 'correttiva').ecoKind, 'correttiva');
    assert.equal(rilascia(a, 'g1', 'inventato').ecoKind, '');
  });
});

describe('Modifiche tecniche: i documenti aperti toccati', () => {
  it('il primo rilascio: piani e ODP di chi contiene l\'articolo', () => {
    const a = app();
    const imp = rilascia(a, 'g1').ecoImpact.map(d => d.number).sort();
    assert.deepEqual(imp, ['FAB-1', 'ODP-1'], 'FAB-2 è chiuso; gli ordini dei componenti contano solo se la modifica li tocca');
  });

  it('un componente tolto porta dentro i suoi ordini aperti, non quelli evasi', () => {
    const a = app();
    rilascia(a, 'g1');
    a.eval("getItem('g1').components = [{ itemId: 'm1', qty: 2, scrapPct: 0 }, { itemId: 'c2', qty: 4, scrapPct: 0 }]; saveDB();");
    const imp = rilascia(a, 'g1').ecoImpact.map(d => d.number).sort();
    assert.ok(imp.includes('ODA-1'), 'c1 è stato tolto: l\'ordine aperto va rivisto');
    assert.ok(!imp.includes('ODA-2'), 'evaso: non c\'è più niente da fare');
    assert.ok(!imp.includes('ODA-3'), 'm1 non è cambiato');
  });

  it('una quantità cambiata conta come componente toccato', () => {
    const a = app();
    rilascia(a, 'g1');
    a.eval("getItem('g1').components[0].qty = 3; saveDB();");
    assert.ok(rilascia(a, 'g1').ecoImpact.some(d => d.number === 'ODA-3'));
  });

  it('la fotografia resta com\'era quando il documento si chiude', () => {
    const a = app();
    const r = rilascia(a, 'g1');
    a.eval("db.plans[0].active = false; db.prodOrders[0].status = 'chiuso'; saveDB();");
    const salvata = JSON.parse(a.eval(`JSON.stringify(getRevision('${r.id}').ecoImpact)`));
    assert.equal(salvata.length, 2);
  });

  it('il registro le elenca tutte, dalla più recente', () => {
    const a = app();
    rilascia(a, 'g1'); rilascia(a, 'mac');
    const n = JSON.parse(a.eval('JSON.stringify(ecoRegistro().map(r => r.ecoNumber))'));
    assert.equal(n.length, 2);
    assert.match(n[0], /-002$/);
  });
});

// Si chiama ancora come prima: chi passava solo il motivo non deve rompersi.
describe('Modifiche tecniche: compatibilità', () => {
  it('releaseRevision senza il terzo argomento funziona come prima', () => {
    const a = app();
    const r = JSON.parse(a.eval("JSON.stringify(releaseRevision('g1', 'vecchio modo'))"));
    assert.equal(r.rev, 'A');
    assert.equal(r.ecoKind, '');
    assert.match(r.ecoNumber, /^MT-/);
  });

  it('una revisione di prima, senza numero, si legge lo stesso nel registro', () => {
    const a = app();
    a.eval("db.revisions.push({ id: 'old', itemId: 'g1', rev: 'A', date: '2025-01-01T00:00:00Z', motivo: 'storica', snapshot: { components: [] } })");
    assert.doesNotThrow(() => a.eval('ecoRegistroModal()'));
  });
});
