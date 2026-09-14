// Ordini di produzione (ODP): la successione delle fasi, e il magazzino.
//
// Due cose vanno provate qui, e sono quelle che a occhio non si vedono.
//
// La prima è la **successione**: una fase non parte se la precedente non è
// chiusa, e quando l'app rifiuta deve dire *quale* fase la blocca — un rifiuto
// muto manda a cercare per mezz'ora.
//
// La seconda è la regola del magazzino, che si legge in tre casi e deve valere
// in tutti e tre con lo stesso codice: **escono i codici del ciclo alla prima
// fase, entra il codice parte all'ultima, e fra le fasi non si scrive niente**.
// Quel «niente» è la correzione che ha fatto nascere questo documento: fra la
// prima e l'ultima fase i pezzi non sono più il materiale e non sono ancora la
// parte, e un movimento col codice parte inventerebbe una giacenza che non c'è.

const assert = require('node:assert/strict');
const { describe, it, approx } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, parte, asm, comp, wc } = require('./fixtures.js');

// Tre cicli, uno per caso. Stessa parte a tre nomi, così i numeri attesi sono
// gli stessi e l'unica variabile è dove stanno le fasi.
const fase = (wcId, supplierId, o) => Object.assign(
  { kind: 'op', workCenterId: wcId, supplierId: supplierId || null, costMode: 'fisso', cost: 3, hours: 0.5, days: 0, note: '' }, o || {});

function conDb(over) {
  const app = loadApp({ silent: true });
  app.asRole('admin');
  app.setDb(makeDb(Object.assign({
    suppliers: [
      { id: 'beta', name: 'Beta', active: true },
      { id: 'gamma', name: 'Gamma', active: true },
    ],
    workCenters: [wc('tor', 40), wc('fre', 35), wc('zin', 30)],
    items: [
      Object.assign(mat('tondo', 5), { uom: 'kg' }),
      // Ciclo tutto interno: 10 tornitura, 20 fresatura
      parte('interna', { uom: 'pz', cycle: [
        { kind: 'item', itemId: 'tondo', qty: 2 },
        fase('tor'), fase('fre'),
      ] }),
      // Ciclo tutto esterno: 10 Beta, 20 Gamma
      parte('esterna', { uom: 'pz', cycle: [
        { kind: 'item', itemId: 'tondo', qty: 2 },
        fase('zin', 'beta'), fase('zin', 'gamma'),
      ] }),
      // Ciclo misto: 10 interna, 20 Beta, 30 interna
      parte('mista', { uom: 'pz', cycle: [
        { kind: 'item', itemId: 'tondo', qty: 2 },
        fase('tor'), fase('zin', 'beta'), fase('fre'),
      ] }),
      asm('grp', 'gruppo', { components: [comp('interna', 3)] }),
    ],
    plans: [{ id: 'pl1', number: 'FAB-2026-001', title: 'Lotto', date: '2026-07-01', notes: '',
      lines: [{ id: 'l1', itemId: 'grp', qty: 2, dueDate: '2026-09-30' }], active: true, jobId: null }],
  }, over || {})));
  return app;
}

// Un ordine lanciato per `partId`, `qty` pezzi. Ritorna il suo id.
function lancia(app, partId, qty) {
  return app.eval(`(function () {
    const part = getItem(${JSON.stringify(partId)});
    const o = { id: 'odp-' + part.id, number: 'ODP-2026-001', itemId: part.id,
      code: part.code, name: part.name, uom: itemUom(part), qty: ${qty},
      date: '2026-07-01', dueDate: '2026-09-30', status: 'bozza', title: '',
      notes: '', notesInternal: '', planId: 'pl1', jobId: null,
      phases: opFreezePhases(part), materials: opFreezeMaterials(part, ${qty}), active: true };
    db.prodOrders.push(o); invalidateCaches();
    opLancia(o.id);
    return o.id;
  })()`);
}
const fasi = (app, id) => JSON.parse(app.eval(`JSON.stringify((getOdp(${JSON.stringify(id)}).phases || [])
  .map(f => ({ id: f.id, seq: f.seq, sup: f.supplierId, wc: f.wcName })))`));
const stato = (app, id, i) => app.eval(`(function(){ const o = getOdp(${JSON.stringify(id)}); return opStatoFase(o, o.phases[${i}]); })()`);
const avvia = (app, id, i, opz) => app.eval(`(function(){ const o = getOdp(${JSON.stringify(id)});
  return opAvvia(o.id, o.phases[${i}].id, ${JSON.stringify(opz || {})}); })()`);
const dichiara = (app, id, i, dati) => app.eval(`(function(){ const o = getOdp(${JSON.stringify(id)});
  return opDichiara(o.id, o.phases[${i}].id, ${JSON.stringify(dati)}); })()`);
const movimenti = app => JSON.parse(app.eval(`JSON.stringify((db.movements || [])
  .map(m => ({ item: (getItem(m.itemId) || {}).code, kind: m.kind, qty: m.qty, sup: m.supplierId })))`));
const onHand = (app, itemId) => Number(app.eval(`(invalidateCaches(), onHandOf(${JSON.stringify(itemId)}))`));

describe('ODP: il modello', () => {
  it('è dichiarato nel registro dello schema, coi suoi due figli', () => {
    const app = conDb();
    const sch = JSON.parse(app.eval('JSON.stringify(Store.schema().prodOrders)'));
    assert.equal(sch.table, 'production_orders');
    assert.equal(sch.children.phases.table, 'production_order_phases');
    assert.equal(sch.children.phases.merge, 'row', 'due reparti che dichiarano su due fasi non sono in conflitto');
    assert.equal(sch.children.materials.table, 'production_order_materials');
    assert.equal(JSON.parse(app.eval('JSON.stringify(Store.schema().prodDecls)')).table, 'production_declarations');
  });

  it('il giro verso la forma normalizzata e ritorno non perde niente', () => {
    const app = conDb();
    lancia(app, 'mista', 10);
    app.eval(`(function(){ const o = getOdp('odp-mista'); opAvvia(o.id, o.phases[0].id, {}); })()`);
    const giro = JSON.parse(app.eval('JSON.stringify(nestDB(flattenDB(db)).prodOrders)'));
    assert.deepEqual(giro, JSON.parse(app.eval('JSON.stringify(db.prodOrders)')));
    assert.deepEqual(JSON.parse(app.eval('JSON.stringify(nestDB(flattenDB(db)).prodDecls)')),
      JSON.parse(app.eval('JSON.stringify(db.prodDecls)')));
  });

  it('un database senza le collezioni se le ritrova vuote al caricamento', () => {
    const app = loadApp({ silent: true });
    app.seedStorage({ schemaVersion: 2, items: [],
      settings: { currency: '€', uoms: [], concepts: [], mpFamiliesSeeded: true, partFamiliesSeeded: true } });
    app.ref('Store').load();
    assert.deepEqual(app.snapshot().prodOrders, []);
    assert.deepEqual(app.snapshot().prodDecls, []);
  });

  it('gli ordini di lavoro esistenti nascono senza legame, ed è ciò che li lascia come prima', () => {
    const app = loadApp({ silent: true });
    app.seedStorage({ schemaVersion: 2, items: [],
      workOrders: [{ id: 'w1', number: 'ODL-1', status: 'bozza', active: true,
        lines: [{ id: 'l', phaseKey: 'perno#0#zin', qty: 1 }] }],
      movements: [{ id: 'm1', itemId: 'x', kind: 'clOut', qty: -2 }],
      settings: { currency: '€', uoms: [], concepts: [], mpFamiliesSeeded: true, partFamiliesSeeded: true } });
    app.ref('Store').load();
    const s = app.snapshot();
    assert.equal(s.workOrders[0].odpId, null);
    assert.equal(s.workOrders[0].lines[0].odpId, null);
    assert.equal(s.workOrders[0].lines[0].odpPhaseId, null);
    assert.equal(s.movements[0].declId, null);
  });

  it('le fasi si congelano col numero del ciclo e con la natura di ciascuna', () => {
    const app = conDb();
    lancia(app, 'mista', 10);
    assert.deepEqual(fasi(app, 'odp-mista').map(f => [f.seq, f.sup]),
      [[10, null], [20, 'beta'], [30, null]]);
  });

  it('ogni fase ha un id proprio, e riordinare il ciclo dopo non sposta niente', () => {
    const app = conDb();
    lancia(app, 'mista', 10);
    const prima = fasi(app, 'odp-mista');
    assert.ok(prima.every(f => f.id), 'una fase senza id è una fase che le dichiarazioni non sanno nominare');
    // Il ciclo cambia sotto: si aggiunge una fase in testa e si sposta l'ultima.
    app.eval(`(function(){ const p = getItem('mista');
      p.cycle.splice(1, 0, { kind: 'op', workCenterId: 'tor', supplierId: null, costMode: 'fisso', cost: 1, hours: 1, days: 0, note: '' });
      invalidateCaches(); })()`);
    assert.deepEqual(fasi(app, 'odp-mista'), prima, "l'ordine lanciato non si muove col ciclo");
  });

  it('il materiale congelato è quello del ciclo per i pezzi lanciati', () => {
    const app = conDb();
    lancia(app, 'interna', 10);
    const m = JSON.parse(app.eval(`JSON.stringify(getOdp('odp-interna').materials.map(x => ({ code: x.code, per: x.perPezzo, qty: x.qty })))`));
    assert.deepEqual(m, [{ code: 'TONDO', per: 2, qty: 20 }]);
  });

  it('una quantità a zero non si lancia: non c\'è niente da produrre', () => {
    const app = conDb();
    lancia(app, 'interna', 0);
    assert.equal(app.eval(`getOdp('odp-interna').status`), 'bozza');
  });

  it('una parte senza fasi non si lancia: non c\'è nessuna successione da seguire', () => {
    const app = conDb();
    app.eval(`(function(){ getItem('interna').cycle = [{ kind: 'item', itemId: 'tondo', qty: 2 }]; invalidateCaches(); })()`);
    lancia(app, 'interna', 10);
    assert.equal(app.eval(`getOdp('odp-interna').status`), 'bozza');
  });
});

describe('ODP: la successione', () => {
  it('la seconda fase non parte se la prima non è chiusa, e il rifiuto la nomina', () => {
    const app = conDb();
    lancia(app, 'interna', 10);
    assert.equal(stato(app, 'odp-interna', 1), 'attesa');
    assert.equal(avvia(app, 'odp-interna', 1), false);
    const motivo = app.eval(`(function(){ const o = getOdp('odp-interna'); return opAvviabile(o, o.phases[1]).motivo; })()`);
    assert.match(motivo, /fase 10/, 'il blocco deve dire quale fase lo causa');
    assert.match(motivo, /0 di 10/, 'e con quali numeri');
  });

  it('chiusa la prima, si sblocca la seconda e solo quella', () => {
    const app = conDb();
    lancia(app, 'mista', 10);
    avvia(app, 'odp-mista', 0);
    dichiara(app, 'odp-mista', 0, { qty: 10, scrap: 0 });
    assert.equal(stato(app, 'odp-mista', 0), 'chiusa');
    assert.equal(stato(app, 'odp-mista', 1), 'avviabile');
    assert.equal(stato(app, 'odp-mista', 2), 'attesa');
  });

  it('un avanzamento parziale non chiude la fase', () => {
    const app = conDb();
    lancia(app, 'interna', 10);
    avvia(app, 'odp-interna', 0);
    dichiara(app, 'odp-interna', 0, { qty: 4, scrap: 0 });
    assert.equal(stato(app, 'odp-interna', 0), 'corso');
    dichiara(app, 'odp-interna', 0, { qty: 6, scrap: 0 });
    assert.equal(stato(app, 'odp-interna', 0), 'chiusa');
  });

  it('pezzi buoni più scarti chiudono la fase: sono i pezzi lavorati', () => {
    const app = conDb();
    lancia(app, 'interna', 10);
    avvia(app, 'odp-interna', 0);
    dichiara(app, 'odp-interna', 0, { qty: 8, scrap: 2 });
    assert.equal(stato(app, 'odp-interna', 0), 'chiusa');
  });

  it('solo i pezzi buoni proseguono: uno scarto restringe la fase seguente', () => {
    const app = conDb();
    lancia(app, 'interna', 10);
    avvia(app, 'odp-interna', 0);
    dichiara(app, 'odp-interna', 0, { qty: 8, scrap: 2 });
    const daFare = app.eval(`(function(){ const o = getOdp('odp-interna'); return opDaFare(o, o.phases[1]); })()`);
    assert.equal(Number(daFare), 8, 'alla fase 20 entrano gli otto buoni, non i dieci lanciati');
  });

  it('forzare senza motivo non passa; col motivo avvia e resta scritto', () => {
    const app = conDb();
    lancia(app, 'interna', 10);
    assert.equal(avvia(app, 'odp-interna', 1, { forza: true }), false);
    assert.equal(avvia(app, 'odp-interna', 1, { forza: true, motivo: 'pezzi campione urgenti' }), true);
    const d = JSON.parse(app.eval(`JSON.stringify(db.prodDecls.map(x => ({ kind: x.kind, motivo: x.motivo, note: x.note })))`));
    const forzatura = d.find(x => x.kind === 'forzatura');
    assert.ok(forzatura, 'la forzatura è un fatto del documento, e resta nello storico');
    assert.equal(forzatura.motivo, 'pezzi campione urgenti');
    assert.match(forzatura.note, /fase 10/, 'con dentro cosa si è scavalcato');
    assert.equal(app.eval(`(function(){ const o = getOdp('odp-interna'); return opForzata(o, o.phases[1]); })()`), true);
  });

  it('un ordine in bozza non avvia niente', () => {
    const app = conDb();
    lancia(app, 'interna', 10);
    app.eval(`(getOdp('odp-interna').status = 'bozza')`);
    assert.equal(avvia(app, 'odp-interna', 0), false);
  });

  it("lo stato della testata si deduce, e non torna mai indietro da sé su annullato", () => {
    const app = conDb();
    lancia(app, 'interna', 10);
    assert.equal(app.eval(`getOdp('odp-interna').status`), 'lanciato');
    avvia(app, 'odp-interna', 0);
    assert.equal(app.eval(`getOdp('odp-interna').status`), 'corso');
    dichiara(app, 'odp-interna', 0, { qty: 10 });
    avvia(app, 'odp-interna', 1);
    dichiara(app, 'odp-interna', 1, { qty: 10 });
    assert.equal(app.eval(`getOdp('odp-interna').status`), 'completato');
    app.eval(`(function(){ const o = getOdp('odp-interna'); o.status = 'annullato'; odpAutoStatus(o); })()`);
    assert.equal(app.eval(`getOdp('odp-interna').status`), 'annullato');
  });
});

describe('ODP: il magazzino, i tre cicli', () => {
  it('ciclo tutto interno: esce il materiale, entra la parte, e niente in mezzo', () => {
    const app = conDb();
    app.eval(`(addMovement('tondo', 'carico', 100, 'giacenza iniziale'), invalidateCaches())`);
    lancia(app, 'interna', 10);
    avvia(app, 'odp-interna', 0);
    assert.equal(onHand(app, 'tondo'), 80, 'venti chili di tondo usciti, una volta sola');
    dichiara(app, 'odp-interna', 0, { qty: 10 });
    avvia(app, 'odp-interna', 1);
    assert.equal(onHand(app, 'tondo'), 80, 'la seconda fase non ripreleva niente');
    dichiara(app, 'odp-interna', 1, { qty: 10 });
    assert.equal(onHand(app, 'interna'), 10, 'la parte entra a magazzino una volta sola');
    const kinds = movimenti(app).filter(m => m.kind !== 'carico').map(m => m.kind);
    assert.deepEqual(kinds, ['scarico', 'versamento']);
    assert.equal(kinds.filter(k => k === 'clStep').length, 0, 'un ciclo interno non passa da nessun terzista');
  });

  it('ciclo tutto esterno: il materiale va al primo, la parte torna dall\'ultimo, niente fra i due', () => {
    const app = conDb();
    app.eval(`(addMovement('tondo', 'carico', 100, ''), invalidateCaches())`);
    lancia(app, 'esterna', 10);
    avvia(app, 'odp-esterna', 0);
    dichiara(app, 'odp-esterna', 0, { qty: 10 });
    avvia(app, 'odp-esterna', 1);
    dichiara(app, 'odp-esterna', 1, { qty: 10 });
    const m = movimenti(app).filter(x => x.kind !== 'carico');
    assert.deepEqual(m, [
      { item: 'TONDO', kind: 'clOut', qty: -20, sup: 'beta' },
      { item: 'ESTERNA', kind: 'clIn', qty: 10, sup: 'gamma' },
    ], 'due movimenti soli: fra Beta e Gamma non si scrive niente');
    assert.equal(onHand(app, 'tondo'), 80);
    assert.equal(onHand(app, 'esterna'), 10);
  });

  it('ciclo misto: scarico all\'avvio, versamento alla fine, e in mezzo il silenzio', () => {
    const app = conDb();
    app.eval(`(addMovement('tondo', 'carico', 100, ''), invalidateCaches())`);
    lancia(app, 'mista', 10);
    [0, 1, 2].forEach(i => { avvia(app, 'odp-mista', i); dichiara(app, 'odp-mista', i, { qty: 10 }); });
    const m = movimenti(app).filter(x => x.kind !== 'carico');
    assert.deepEqual(m, [
      { item: 'TONDO', kind: 'scarico', qty: -20, sup: null },
      { item: 'MISTA', kind: 'versamento', qty: 10, sup: null },
    ]);
  });

  it('il codice parte non risulta mai presso un terzista prima del versamento', () => {
    const app = conDb();
    app.eval(`(addMovement('tondo', 'carico', 100, ''), invalidateCaches())`);
    lancia(app, 'esterna', 10);
    avvia(app, 'odp-esterna', 0);
    app.eval('invalidateCaches()');
    assert.equal(Number(app.eval(`atSupplierOf('esterna')`)), 0, 'la parte non esiste ancora: nominarla sarebbe una giacenza inventata');
    assert.equal(Number(app.eval(`atSupplierOf('tondo')`)), 20, 'il materiale invece è davvero da Beta');
  });

  it('il materiale segue la fase corrente: passa a Gamma senza nessun movimento', () => {
    const app = conDb();
    app.eval(`(addMovement('tondo', 'carico', 100, ''), invalidateCaches())`);
    lancia(app, 'esterna', 10);
    avvia(app, 'odp-esterna', 0);
    dichiara(app, 'odp-esterna', 0, { qty: 10 });
    avvia(app, 'odp-esterna', 1);
    app.eval('invalidateCaches()');
    const dove = JSON.parse(app.eval(`JSON.stringify(prodWipRows().map(r => ({ luogo: r.luogo, code: r.item.code, qty: r.qty })))`));
    assert.deepEqual(dove, [{ luogo: 'gamma', code: 'TONDO', qty: 20 }],
      'i movimenti non si sono mossi: il luogo lo dà la fase corrente');
    assert.equal(app.eval('db.movements.filter(m => m.kind === "clStep").length'), 0);
  });

  it('a ordine completato non resta niente fuori', () => {
    const app = conDb();
    app.eval(`(addMovement('tondo', 'carico', 100, ''), invalidateCaches())`);
    lancia(app, 'esterna', 10);
    [0, 1].forEach(i => { avvia(app, 'odp-esterna', i); dichiara(app, 'odp-esterna', i, { qty: 10 }); });
    app.eval('invalidateCaches()');
    assert.equal(app.eval('prodWipRows().length'), 0);
    assert.equal(Number(app.eval(`atSupplierOf('tondo')`)), 0);
  });

  it('il materiale esce una volta sola: riavviare la prima fase non lo ripreleva', () => {
    const app = conDb();
    app.eval(`(addMovement('tondo', 'carico', 100, ''), invalidateCaches())`);
    lancia(app, 'interna', 10);
    avvia(app, 'odp-interna', 0);
    assert.equal(avvia(app, 'odp-interna', 0), false, 'una fase già avviata non si riavvia');
    assert.equal(onHand(app, 'tondo'), 80);
    const residuo = JSON.parse(app.eval(`JSON.stringify(opMaterialeResiduo(getOdp('odp-interna')).map(m => m.residuo))`));
    assert.deepEqual(residuo, [0], 'a residuo zero la scheda lo dice, invece di riproporre il modulo');
  });

  it('si versa la resa vera, non la quantità lanciata', () => {
    const app = conDb();
    app.eval(`(addMovement('tondo', 'carico', 100, ''), invalidateCaches())`);
    lancia(app, 'interna', 10);
    avvia(app, 'odp-interna', 0);
    dichiara(app, 'odp-interna', 0, { qty: 8, scrap: 2 });
    avvia(app, 'odp-interna', 1);
    dichiara(app, 'odp-interna', 1, { qty: 7, scrap: 1 });
    assert.equal(onHand(app, 'interna'), 7, 'sette buoni su dieci lanciati: il magazzino dice sette');
  });

  it('il versamento non si può registrare a mano dalla rettifica', () => {
    const app = conDb();
    const manuali = JSON.parse(app.eval('JSON.stringify(MOVEMENT_MANUAL_KINDS)'));
    assert.ok(!manuali.includes('versamento'), 'senza un ordine dietro, un versamento è un carico che nessuno spiega');
    assert.ok(!manuali.includes('clStep'));
    assert.ok(manuali.includes('carico') && manuali.includes('scarico'));
  });

  it('annullare una dichiarazione toglie i suoi movimenti, non quelli delle altre', () => {
    const app = conDb();
    app.eval(`(addMovement('tondo', 'carico', 100, ''), invalidateCaches())`);
    lancia(app, 'interna', 10);
    avvia(app, 'odp-interna', 0);
    dichiara(app, 'odp-interna', 0, { qty: 10 });
    avvia(app, 'odp-interna', 1);
    dichiara(app, 'odp-interna', 1, { qty: 6 });
    dichiara(app, 'odp-interna', 1, { qty: 4 });
    assert.equal(onHand(app, 'interna'), 10);
    const ultima = app.eval(`db.prodDecls.filter(d => d.kind === 'avanzamento' && d.qty === 4)[0].id`);
    app.eval(`opAnnullaDichiarazione(${JSON.stringify(ultima)})`);
    assert.equal(onHand(app, 'interna'), 6, 'se ne va solo il carico di quella dichiarazione');
    assert.equal(onHand(app, 'tondo'), 80, 'e il prelievo del materiale resta dov\'era');
  });
});
