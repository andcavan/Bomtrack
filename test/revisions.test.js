// Revisioni della distinta base.
//
// La proprietà che vale tutta la funzionalità è una: **una revisione rilasciata
// non cambia più**. Se cambia, lo storico non serve a niente — anzi è peggio del
// niente, perché racconta una cosa falsa con l'aria di essere autorevole.
// Il resto (numerazione, confronto, costo del giorno) è comodità.

const assert = require('node:assert/strict');
const { describe, it, approx } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, acq, parte, asm, comp, wc } = require('./fixtures.js');

function app(db) {
  const a = loadApp({ silent: true });
  a.setDb(db || base());
  a.asRole('admin');
  return a;
}
function base() {
  return makeDb({
    workCenters: [wc('w1', 40)],
    items: [
      asm('g1', 'gruppo', { components: [comp('m1', 2), comp('c1', 4)] }),
      mat('m1', 10),
      acq('c1', 5),
      mat('m2', 3),
    ],
  });
}
function rilascia(a, itemId, motivo) {
  return JSON.parse(a.eval(`JSON.stringify(releaseRevision(${JSON.stringify(itemId)}, ${JSON.stringify(motivo || '')}))`));
}

describe('Numerazione delle revisioni', () => {
  it('un articolo senza il campo vale A, senza migrare niente', () => {
    const a = app();
    assert.equal(a.eval('itemRev(getItem("g1"))'), 'A');
  });

  it('A → B → C', () => {
    const a = app();
    assert.equal(a.eval('nextRev("A")'), 'B');
    assert.equal(a.eval('nextRev("B")'), 'C');
  });

  it('dopo la Z si continua invece di fermarsi', () => {
    const a = app();
    assert.equal(a.eval('nextRev("Z")'), 'AA');
    assert.equal(a.eval('nextRev("AA")'), 'AB');
    assert.equal(a.eval('nextRev("AZ")'), 'BA');
    assert.equal(a.eval('nextRev("ZZ")'), 'AAA');
  });

  it('solo ciò che ha una distinta ha revisioni', () => {
    const a = app();
    assert.equal(a.eval('hasRevisions(getItem("g1"))'), true, 'assiemi');
    assert.equal(a.eval('hasRevisions(getItem("m1"))'), false, 'una materia prima ha un prezzo, non una distinta');
    assert.equal(a.eval('hasRevisions(getItem("c1"))'), false);
    assert.equal(a.eval('hasRevisions(null)'), false);
  });

  it('anche una parte: il suo ciclo definisce il costo quanto una distinta', () => {
    const a = app(makeDb({ items: [parte('p1', { cycle: [] })] }));
    assert.equal(a.eval('hasRevisions(getItem("p1"))'), true);
  });
});

describe('Rilascio', () => {
  it('congela la distinta e apre la successiva', () => {
    const a = app();
    const rec = rilascia(a, 'g1', 'Approvata per produzione');
    assert.equal(rec.rev, 'A');
    assert.equal(rec.motivo, 'Approvata per produzione');
    assert.equal(a.eval('itemRev(getItem("g1"))'), 'B', 'da qui in poi si lavora sulla B');
    assert.equal(a.snapshot().revisions.length, 1);
  });

  it('la fotografia contiene la distinta, non un riferimento ad essa', () => {
    const a = app();
    rilascia(a, 'g1');
    const s = a.snapshot().revisions[0].snapshot;
    assert.equal(s.components.length, 2);
    assert.equal(s.code, 'G1');
    assert.deepEqual(s.components.map(c => c.itemId), ['m1', 'c1']);
  });

  // Il test che giustifica l'intera funzionalità.
  it('modificare la distinta domani NON cambia la revisione di ieri', () => {
    const a = app();
    rilascia(a, 'g1', 'prima');
    a.eval('const it = getItem("g1"); it.components.push({ itemId: "m2", qty: 7, scrapPct: 0 }); it.components[0].qty = 99; touch(it); saveDB();');
    const s = a.snapshot().revisions[0].snapshot;
    assert.equal(s.components.length, 2, 'la revisione non deve vedere il componente aggiunto dopo');
    assert.equal(s.components[0].qty, 2, 'né la quantità cambiata dopo');
  });

  it('registra il costo del giorno del rilascio', () => {
    const a = app();
    rilascia(a, 'g1');
    const costo = a.snapshot().revisions[0].snapshot.cost;
    approx(costo.total, 2 * 10 + 4 * 5, 'costo alla data del rilascio');
    approx(costo.material, 20);
    approx(costo.purchased, 20);
  });

  it('cambiare un prezzo dopo non tocca il costo registrato', () => {
    const a = app();
    rilascia(a, 'g1');
    a.eval('const m = getItem("m1"); m.unitCost = 1000; touch(m); saveDB();');
    approx(a.snapshot().revisions[0].snapshot.cost.total, 40,
      'la revisione dice quanto costava allora: è il motivo per cui la si guarda');
  });

  it('rilasci successivi si accumulano in ordine', () => {
    const a = app();
    rilascia(a, 'g1', 'prima');
    a.eval('const it = getItem("g1"); it.components[0].qty = 5; touch(it); saveDB();');
    rilascia(a, 'g1', 'seconda');
    const revs = JSON.parse(a.eval('JSON.stringify(revisionsOf("g1").map(r => r.rev))'));
    assert.deepEqual(revs, ['B', 'A'], 'lo storico si legge dalla più recente');
    assert.equal(a.eval('itemRev(getItem("g1"))'), 'C');
  });

  it('le revisioni di un articolo non si mescolano con quelle di un altro', () => {
    const a = app(makeDb({ items: [asm('g1', 'gruppo', { components: [] }), asm('g2', 'gruppo', { components: [] })] }));
    rilascia(a, 'g1'); rilascia(a, 'g2'); rilascia(a, 'g1');
    assert.equal(a.eval('revisionsOf("g1").length'), 2);
    assert.equal(a.eval('revisionsOf("g2").length'), 1);
  });

  it('su un articolo senza distinta non si rilascia niente', () => {
    const a = app();
    assert.equal(rilascia(a, 'm1'), null);
    assert.equal((a.snapshot().revisions || []).length, 0);
  });

  it('su un articolo inesistente non lancia', () => {
    const a = app();
    assert.doesNotThrow(() => rilascia(a, 'non-esiste'));
  });

  it('il rilascio viene salvato, non resta in memoria', () => {
    const a = app();
    rilascia(a, 'g1', 'motivo');
    a.ref('Store').load();
    assert.equal(a.snapshot().revisions.length, 1);
    assert.equal(a.eval('itemRev(getItem("g1"))'), 'B');
  });

  it('porta l\'autore, come ogni altro record', () => {
    const a = app();
    a.eval('Store.setActor("u-anna")');
    rilascia(a, 'g1');
    assert.equal(a.snapshot().revisions[0].createdBy, 'u-anna',
      'fra un anno serve sapere chi ha rilasciato, non solo quando');
  });

  it('il ruolo lettore non rilascia', () => {
    const a = app();
    a.asRole('lettore');
    a.eval('currentBomId = "g1"; releaseRevisionConfirm("g1");');
    assert.equal((a.snapshot().revisions || []).length, 0);
  });
});

describe('Confronto fra revisioni', () => {
  function conRevisione(a) { rilascia(a, 'g1', 'base'); return a; }
  function diffConAttuale(a) {
    return JSON.parse(a.eval('JSON.stringify(revDiff(revisionsOf("g1")[0].snapshot, revSnapshot(getItem("g1"))))'));
  }

  it('senza modifiche non trova differenze', () => {
    const a = conRevisione(app());
    const d = diffConAttuale(a);
    assert.equal(d.aggiunte.length, 0);
    assert.equal(d.rimosse.length, 0);
    assert.equal(d.cambiate.length, 0);
    assert.equal(d.invariate, 2);
    assert.equal(a.eval(`revDiffVuoto(revDiff(revisionsOf("g1")[0].snapshot, revSnapshot(getItem("g1"))))`), true);
  });

  it('un componente aggiunto compare fra le aggiunte', () => {
    const a = conRevisione(app());
    a.eval('const it = getItem("g1"); it.components.push({ itemId: "m2", qty: 3, scrapPct: 0 }); touch(it); saveDB();');
    const d = diffConAttuale(a);
    assert.equal(d.aggiunte.length, 1);
    assert.match(d.aggiunte[0].etichetta, /M2/);
    assert.equal(d.aggiunte[0].qty, 3);
    assert.equal(d.rimosse.length, 0);
  });

  it('un componente tolto compare fra le rimosse', () => {
    const a = conRevisione(app());
    a.eval('const it = getItem("g1"); it.components.splice(1, 1); touch(it); saveDB();');
    const d = diffConAttuale(a);
    assert.equal(d.rimosse.length, 1);
    assert.match(d.rimosse[0].etichetta, /C1/);
  });

  it('una quantità cambiata porta con sé il valore di prima', () => {
    const a = conRevisione(app());
    a.eval('const it = getItem("g1"); it.components[0].qty = 9; touch(it); saveDB();');
    const d = diffConAttuale(a);
    assert.equal(d.cambiate.length, 1);
    assert.equal(d.cambiate[0].qtyPrima, 2);
    assert.equal(d.cambiate[0].qty, 9);
  });

  it('anche lo scarto è una modifica: cambia il fabbisogno', () => {
    const a = conRevisione(app());
    a.eval('const it = getItem("g1"); it.components[0].scrapPct = 10; touch(it); saveDB();');
    const d = diffConAttuale(a);
    assert.equal(d.cambiate.length, 1);
    assert.equal(d.cambiate[0].scrapPrima, 0);
    assert.equal(d.cambiate[0].scrapPct, 10);
  });

  it('lo stesso componente ripetuto si somma: è la domanda che si fa davvero', () => {
    const a = app(makeDb({ items: [
      asm('g1', 'gruppo', { components: [comp('m1', 2), comp('m1', 3)] }), mat('m1', 10),
    ] }));
    rilascia(a, 'g1');
    a.eval('const it = getItem("g1"); it.components = [{ itemId: "m1", qty: 5, scrapPct: 0 }]; touch(it); saveDB();');
    const d = diffConAttuale(a);
    assert.equal(d.cambiate.length, 0, '2+3 e 5 sono la stessa cosa: di quel materiale ne servono cinque');
    assert.equal(d.invariate, 1);
  });

  it('le lavorazioni entrano nel confronto', () => {
    const a = app(makeDb({
      workCenters: [wc('w1', 40)],
      items: [asm('g1', 'gruppo', { components: [], operations: [{ workCenterId: 'w1', hours: 2 }] })],
    }));
    rilascia(a, 'g1');
    a.eval('const it = getItem("g1"); it.operations[0].hours = 5; touch(it); saveDB();');
    const d = diffConAttuale(a);
    assert.equal(d.cambiate.length, 1);
    assert.equal(d.cambiate[0].qtyPrima, 2);
    assert.equal(d.cambiate[0].tipo, 'Lavorazione');
  });

  it('il ciclo di una parte si confronta come una distinta', () => {
    const a = app(makeDb({ items: [
      parte('p1', { cycle: [{ kind: 'item', itemId: 'm1', qty: 1 }] }), mat('m1', 10), mat('m2', 4),
    ] }));
    rilascia(a, 'p1');
    a.eval('const it = getItem("p1"); it.cycle.push({ kind: "item", itemId: "m2", qty: 2 }); touch(it); saveDB();');
    const d = JSON.parse(a.eval('JSON.stringify(revDiff(revisionsOf("p1")[0].snapshot, revSnapshot(getItem("p1"))))'));
    assert.equal(d.aggiunte.length, 1);
    assert.equal(d.aggiunte[0].tipo, 'Distinta parte');
  });

  it('un componente tolto dalla distinta E dal catalogo resta leggibile', () => {
    const a = conRevisione(app());
    a.eval('const it = getItem("g1"); it.components.splice(1, 1); touch(it); saveDB(); Store.remove("items", "c1");');
    const d = diffConAttuale(a);
    assert.equal(d.rimosse.length, 1);
    assert.match(d.rimosse[0].etichetta, /eliminato/,
      'la revisione resta leggibile anche quando il catalogo è cambiato sotto');
  });

  it('un articolo sparito dal catalogo ma ancora in distinta non fa saltare il confronto', () => {
    const a = conRevisione(app());
    a.eval('Store.remove("items", "c1");');
    let d;
    assert.doesNotThrow(() => { d = diffConAttuale(a); });
    assert.equal(d.aggiunte.length + d.rimosse.length + d.cambiate.length, 0,
      'la distinta non è cambiata: è cambiato il catalogo sotto di essa');
  });
});

describe('Le revisioni nel giro verso il database condiviso', () => {
  it('sono una collezione come le altre e sopravvivono al giro completo', () => {
    const a = app();
    rilascia(a, 'g1', 'motivo');
    const prima = a.snapshot().revisions;
    const dopo = JSON.parse(a.eval('JSON.stringify(nestDB(flattenDB(db)).revisions)'));
    assert.deepEqual(dopo, prima, 'la fotografia deve tornare indietro identica, snapshot compreso');
  });

  it('la fotografia resta un blocco unico, non si esplode in tabelle', () => {
    const a = app();
    rilascia(a, 'g1');
    const t = JSON.parse(a.eval('JSON.stringify(flattenDB(db))'));
    assert.equal(t.item_revisions.length, 1);
    assert.ok(t.item_revisions[0].snapshot, 'normalizzarla vorrebbe dire darle la forma dei dati vivi, cioè invitare a modificarla');
  });

  it('un rilascio compare fra le modifiche da inviare', () => {
    const a = app();
    a.eval('Store.markSynced()');
    rilascia(a, 'g1');
    const p = JSON.parse(a.eval('JSON.stringify(Store.pendingChanges())'));
    assert.equal(p.revisions.upsert.length, 1);
    assert.deepEqual(p.items.upsert, ['g1'], 'anche l\'articolo cambia: la sua revisione in lavorazione è avanzata');
  });

  it('un backup con revisioni si reimporta', () => {
    const a = app();
    rilascia(a, 'g1', 'motivo');
    const json = a.ref('Store').exportSnapshot();
    const altra = loadApp({ silent: true });
    altra.ref('Store').importSnapshot(json);
    assert.equal(altra.snapshot().revisions.length, 1);
  });

  it('un backup vecchio senza revisioni si apre lo stesso', () => {
    const a = app();
    a.ref('Store').importSnapshot({ items: [{ id: 'x', code: 'X', name: 'X', type: 'materiale' }] });
    assert.deepEqual(a.snapshot().revisions, [], 'la collezione si ricostruisce vuota');
  });
});
