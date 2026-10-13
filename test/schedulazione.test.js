// Programmazione a ritroso del fabbisogno (views-mrp.js, dalla 0.88.0).
//
// Da «il gruppo serve venerdì 16 ottobre» a quando comincia ciascuna cosa:
// montaggio, fasi interne, tratte dal terzista, materiale da ordinare. Le date
// attese sono scritte a mano e si rifanno a mente col calendario di ottobre
// 2026 davanti: è il punto di questi casi.
//
// Il caso di riferimento:
//   gruppo A, 2 pezzi, serve ven 16/10; montaggio 2 gg → comincia mer 14/10
//   perno P, 4 per gruppo = 8 pezzi, serve mer 14/10:
//     fase 40 fresatura interna, 2 h/pz × 8 = 16 h a 8 h/gg = 2 gg → lun 12 – mer 14
//     fasi 20-30 zincatura da Beta, 3 + 1 gg + 2 di trasporto = 6 gg di calendario
//            → rientro lun 12, invio mar 6
//     fase 10 tornitura interna, 1 h/pz × 8 = 8 h = 1 gg → lun 5 – mar 6
//   tondo, materiale del ciclo di P: serve lun 5/10; listino a 10 gg → ordinare ven 25/9

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, parte, asm, comp, wc } = require('./fixtures.js');

function conDb(over, settings) {
  const app = loadApp({ silent: true });
  app.asRole('admin');
  app.setDb(makeDb(Object.assign({
    suppliers: [{ id: 'beta', name: 'Beta', active: true, transitDays: 2 }],
    workCenters: [
      Object.assign(wc('tor', 40), { hoursPerDay: 8 }),
      Object.assign(wc('zin', 30), {}),
      Object.assign(wc('fre', 45), { hoursPerDay: 8 }),
    ],
    items: [
      Object.assign(mat('tondo', 5), { supplierId: 'beta', activePriceId: 'q1',
        priceList: [{ id: 'q1', supplierId: 'beta', price: 5, leadDays: 10, date: '2026-01-01' }] }),
      parte('perno', { cycle: [
        { kind: 'item', itemId: 'tondo', qty: 2 },
        { kind: 'op', workCenterId: 'tor', supplierId: '', costMode: 'fisso', cost: 1, hours: 1, days: 0, note: '' },
        { kind: 'op', workCenterId: 'zin', supplierId: 'beta', costMode: 'fisso', cost: 2, hours: 0, days: 3, note: '' },
        { kind: 'op', workCenterId: 'zin', supplierId: 'beta', costMode: 'fisso', cost: 1, hours: 0, days: 1, note: '' },
        { kind: 'op', workCenterId: 'fre', supplierId: '', costMode: 'fisso', cost: 1, hours: 2, days: 0, note: '' },
      ] }),
      asm('grp', 'gruppo', { components: [comp('perno', 4)], assemblyDays: 2 }),
    ],
    plans: [{ id: 'pl1', number: 'FAB-2026-001', title: '', date: '2026-09-01', notes: '', active: true,
      lines: [{ id: 'l1', itemId: 'grp', qty: 2, dueDate: '2026-10-16' }] }],
  }, over || {}), ) );
  if (settings) app.eval(`Object.assign(db.settings, ${JSON.stringify(settings)}); invalidateCaches();`);
  return app;
}
const ev = (app, code) => JSON.parse(app.eval(`JSON.stringify(${code})`));
const esplodi = app => ev(app, `(() => { const e = mrpExplode(getPlan('pl1').lines); return {
  buy: e.buy.map(x => ({ code: x.item.code, qty: x.qty, due: x.due })),
  make: e.make.map(x => ({ code: x.item.code, qty: x.qty, due: x.due, start: x.start })),
  phases: e.phases.map(x => ({ opIndex: x.opIndex, due: x.due, start: x.start })),
  load: e.load.map(x => ({ wc: x.workCenterId, week: x.week, hours: x.hours })) }; })()`);

describe('Programmazione: la catena a ritroso', () => {
  it('il montaggio anticipa la data in cui servono i componenti', () => {
    const m = esplodi(conDb()).make.find(x => x.code === 'PERNO');
    assert.equal(m.due, '2026-10-14', 'due giorni lavorativi prima di venerdì 16');
    assert.equal(m.qty, 8);
  });

  it('le fasi del ciclo si mettono in fila, dall ultima alla prima', () => {
    const e = esplodi(conDb());
    const m = e.make.find(x => x.code === 'PERNO');
    assert.equal(m.start, '2026-10-05', 'la tornitura comincia lunedì 5');
    const f = e.phases.sort((a, b) => a.opIndex - b.opIndex);
    assert.deepEqual(f.map(x => [x.opIndex, x.start, x.due]), [
      [1, '2026-10-06', '2026-10-12'],
      [2, '2026-10-06', '2026-10-12'],
    ], 'la tratta 20-30 parte martedì 6 e rientra lunedì 12, quando comincia la fresatura');
  });

  it('il materiale del ciclo serve quando parte la prima fase', () => {
    const t = esplodi(conDb()).buy.find(x => x.code === 'TONDO');
    assert.equal(t.due, '2026-10-05');
    assert.equal(t.qty, 16);
  });

  it('la data d ordine toglie i giorni del fornitore, di calendario', () => {
    const r = ev(conDb(), "mrpBuyRows(getPlan('pl1'), false).map(r => ({ due: r.due, orderBy: r.orderBy, leadDays: r.leadDays }))")[0];
    assert.deepEqual(r, { due: '2026-10-05', orderBy: '2026-09-25', leadDays: 10 });
  });

  it('una data d ordine che cade di sabato si anticipa al venerdì', () => {
    const app = conDb();
    app.eval("getItem('tondo').priceList[0].leadDays = 9; invalidateCaches();");
    const r = ev(app, "mrpBuyRows(getPlan('pl1'), false)[0].orderBy");
    assert.equal(r, '2026-09-25', 'lunedì 5 meno 9 giorni è sabato 26');
  });

  it('la riga di conto lavoro dice invio e rientro della tratta, trasporto compreso', () => {
    const r = ev(conDb(), `mrpPhaseRuns(mrpPhaseRows(getPlan('pl1'))).map(r => ({ due: r.due, orderBy: r.orderBy, leadDays: r.leadDays, fasi: r.phaseNos }))`);
    assert.deepEqual(r, [{ due: '2026-10-12', orderBy: '2026-10-06', leadDays: 6, fasi: [20, 30] }]);
  });

  it('il documento al terzista chiede il rientro, non la consegna del gruppo', () => {
    const l = ev(conDb(), "planPhaseDocLine(mrpPhaseRuns(mrpPhaseRows(getPlan('pl1')))[0], true).deliveryDate");
    assert.equal(l, '2026-10-12');
  });

  it('la parte da fabbricare va lanciata all inizio della prima fase', () => {
    const r = ev(conDb(), "mrpMakeRows(getPlan('pl1')).map(r => ({ due: r.due, orderBy: r.orderBy }))")[0];
    assert.deepEqual(r, { due: '2026-10-14', orderBy: '2026-10-05' });
  });

  it('il carico va nella settimana in cui la fase comincia', () => {
    const l = esplodi(conDb()).load.map(x => [x.wc, x.week, x.hours]).sort();
    assert.deepEqual(l, [['fre', '2026-W42', 16], ['tor', '2026-W41', 8]]);
  });
});

describe('Programmazione: i tempi', () => {
  it('le ore al giorno si ricavano dalla capacità settimanale', () => {
    // 20 h a settimana su 5 giorni = 4 h al giorno: 16 h di fresatura sono 4 giorni.
    const app = conDb();
    app.eval("Object.assign(getWorkCenter('fre'), { hoursPerDay: 0, capacityHours: 20 }); invalidateCaches();");
    const m = esplodi(app).phases[0];
    assert.equal(m.due, '2026-10-08', 'la fresatura comincia giovedì 8');
  });

  it('attrezzaggio e coda allungano la fase interna', () => {
    // tornitura: 4 h di attrezzaggio + 8 h = 12 h → 2 gg, più 1 di coda = 3 gg prima di martedì 6.
    const app = conDb();
    app.eval("Object.assign(getWorkCenter('tor'), { setupHours: 4, queueDays: 1 }); invalidateCaches();");
    assert.equal(esplodi(app).make[0].start, '2026-10-01');
  });

  it('i giorni di montaggio, se non dichiarati, vengono dalle lavorazioni dell assieme', () => {
    // 6 h × 2 gruppi = 12 h a 8 h/gg = 2 giorni: lo stesso risultato dei due dichiarati.
    const app = conDb();
    app.eval(`Object.assign(getItem('grp'), { assemblyDays: 0, operations: [{ workCenterId: 'tor', hours: 6, note: '' }] });
      invalidateCaches();`);
    assert.equal(esplodi(app).make[0].due, '2026-10-14');
  });

  it('il margine fra livelli anticipa ancora i componenti', () => {
    const e = esplodi(conDb(null, { scheduleBufferDays: 1 }));
    assert.equal(e.make[0].due, '2026-10-13');
    assert.equal(e.make[0].start, '2026-10-01');
    assert.equal(e.buy[0].due, '2026-09-30');
  });

  it('il calendario conta: un festivo in mezzo sposta tutto di un giorno', () => {
    const app = conDb(null, { calendar: { workDays: [1, 2, 3, 4, 5], holidays: [], easter: true,
      closures: [{ from: '2026-10-13', to: '2026-10-13', note: 'Patrono' }] } });
    const m = esplodi(app).make[0];
    assert.equal(m.due, '2026-10-14', 'il montaggio 14-15 non tocca il patrono');
    assert.equal(esplodi(app).phases[0].due, '2026-10-09', 'la fresatura salta martedì 13: comincia venerdì 9');
  });
});

describe('Programmazione: più domande e dati mancanti', () => {
  it('la stessa parte in due rami tiene le date più vicine', () => {
    // In più un perno sciolto per venerdì 9: fresatura 2 h → 1 gg (gio 8),
    // rientro gio 8 − 6 gg = ven 2, tornitura 1 gg → gio 1.
    const app = conDb();
    app.eval("getPlan('pl1').lines.push({ id: 'l2', itemId: 'perno', qty: 1, dueDate: '2026-10-09' }); invalidateCaches();");
    const e = esplodi(app);
    assert.deepEqual(e.make.map(x => [x.qty, x.due, x.start]), [[9, '2026-10-09', '2026-10-01']]);
    assert.deepEqual(e.phases.map(x => [x.start, x.due]), [['2026-10-02', '2026-10-08'], ['2026-10-02', '2026-10-08']]);
    assert.equal(e.buy[0].due, '2026-10-01');
  });

  it('senza tempi dichiarati le date restano quelle della consegna, come prima', () => {
    const app = conDb();
    app.eval(`getItem('perno').cycle.forEach(r => { if (r.kind === 'op') { r.hours = 0; r.days = 0; } });
      getItem('grp').assemblyDays = 0; getSupplier('beta').transitDays = 0; invalidateCaches();`);
    const e = esplodi(app);
    assert.equal(e.make[0].due, '2026-10-16');
    assert.equal(e.make[0].start, '2026-10-16');
    assert.equal(e.buy[0].due, '2026-10-16');
    assert.deepEqual(e.phases.map(x => [x.start, x.due]), [['2026-10-16', '2026-10-16'], ['2026-10-16', '2026-10-16']]);
  });

  it('una riga senza data non inventa date', () => {
    const app = conDb();
    app.eval("getPlan('pl1').lines[0].dueDate = ''; invalidateCaches();");
    const e = esplodi(app);
    assert.equal(e.make[0].due, '');
    assert.equal(e.make[0].start, '');
    assert.equal(e.buy[0].due, '');
  });

  it('un ordine di lavoro scritto a mano ricava l invio dal rientro, trasporto compreso', () => {
    const r = ev(conDb(), "(() => { const r = clRunRow(getItem('perno'), { from: 1, to: 2 }, 8, '2026-10-12'); return { orderBy: r.orderBy, leadDays: r.leadDays }; })()");
    assert.deepEqual(r, { orderBy: '2026-10-06', leadDays: 6 });
  });
});

describe('Programmazione: i tempi nelle impostazioni Excel', () => {
  const foglio = (app, nome) => ev(app, `settingsSheets().find(s => s.name === ${JSON.stringify(nome)}).aoa`);

  it('i centri di lavoro escono con ore al giorno, attrezzaggio e coda', () => {
    const app = conDb();
    app.eval("Object.assign(getWorkCenter('tor'), { setupHours: 1.5, queueDays: 2 });");
    const aoa = foglio(app, 'Centri di lavoro');
    assert.deepEqual(aoa[0].slice(-3), ['Ore/giorno', 'Attrezzaggio h', 'Coda gg']);
    assert.deepEqual(aoa.find(r => r[0] === 'CDL tor').slice(-3), [8, 1.5, 2]);
  });

  it('reimportati, i tempi tornano; una colonna assente li lascia com erano', () => {
    const app = conDb();
    app.eval(`importSettingsSheets({ 'Centri di lavoro': [
      { 'Nome': 'CDL tor', 'Ore/giorno': 7.5, 'Coda gg': 1 },
      { 'Nome': 'CDL fre', 'Tariffa oraria': 45 } ] })`);
    assert.deepEqual(ev(app, "[getWorkCenter('tor').hoursPerDay, getWorkCenter('tor').queueDays, getWorkCenter('fre').hoursPerDay]"), [7.5, 1, 8]);
  });

  it('un tempo negativo non entra e si dice', () => {
    const app = conDb();
    const rep = ev(app, `importSettingsSheets({ 'Centri di lavoro': [{ 'Nome': 'CDL tor', 'Ore/giorno': -1 }] })`);
    assert.ok(JSON.stringify(rep).includes('ore al giorno non valida'));
    assert.equal(ev(app, "getWorkCenter('tor').hoursPerDay"), 8);
  });

  it('il trasporto del terzista esce e rientra col foglio Fornitori', () => {
    const app = conDb();
    const aoa = foglio(app, 'Fornitori');
    assert.equal(aoa[0][aoa[0].length - 1], 'Trasporto CL gg');
    assert.equal(aoa[1][aoa[1].length - 1], 2);
    app.eval(`importSettingsSheets({ 'Fornitori': [{ 'Nome': 'Beta', 'Trasporto CL gg': 4 }] })`);
    assert.equal(ev(app, "getSupplier('beta').transitDays"), 4);
  });
});

describe('Programmazione: le schede', () => {
  it('le impostazioni mostrano il calendario di fabbrica', () => {
    const html = conDb().eval('renderSettings()');
    assert.match(html, /Calendario di fabbrica/);
    assert.match(html, /value="25\/12, 26\/12|26\/12/);
    assert.match(html, /id="set-sched-buf"/);
  });

  it('la migrazione dà a tutti il calendario di serie e i tempi a zero', () => {
    const app = conDb();
    app.eval('delete db.settings.calendar; db.workCenters.forEach(w => { delete w.queueDays; }); migrateDB();');
    const r = ev(app, '[db.settings.calendar.workDays, db.settings.scheduleBufferDays, getWorkCenter(\'tor\').queueDays, getItem(\'grp\').assemblyDays]');
    assert.deepEqual(r, [[1, 2, 3, 4, 5], 0, 0, 2]);
  });
});
