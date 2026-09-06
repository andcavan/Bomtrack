// Il telaio comune delle viste a documento: elenco a destra, documento al centro.
//
// Quello che questi test proteggono non è la grafica, è il patto:
//   1. l'elenco c'è sempre — anche mentre un documento è aperto: è l'unica
//      ragione per cui questa forma esiste;
//   2. le quattro viste lo disegnano allo stesso modo, e nessuna torna alla
//      pagina-elenco di prima;
//   3. saltare da un documento all'altro non perde le modifiche in sospeso —
//      prima quel salvataggio lo faceva l'uscita verso l'elenco, che non c'è più;
//   4. la riga aperta si vede che è quella aperta.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, acq } = require('./fixtures.js');

// Un database con un documento per tipo, tutti collegati come nella realtà:
// commessa → piano → richiesta → ordine.
function dati() {
  return makeDb({
    items: [acq('c1', 5)],
    suppliers: [{ id: 's1', name: 'Rossi', active: true }],
    jobs: [
      { id: 'j1', number: 'COM-2025-001', customer: 'Alfa', title: 'Linea 1', status: 'aperta', date: '2025-01-10', dueDate: '2025-06-30', active: true },
      { id: 'j2', number: 'COM-2025-002', customer: 'Beta', title: 'Linea 2', status: 'chiusa', date: '2025-02-10', dueDate: '', active: true },
    ],
    plans: [
      { id: 'pl1', number: 'PRD-2025-001', title: 'Lotto marzo', date: '2025-03-01', jobId: 'j1', lines: [{ id: 'l1', itemId: 'c1', qty: 2 }], active: true },
      { id: 'pl2', number: 'PRD-2025-002', title: 'Lotto aprile', date: '2025-04-01', lines: [], active: false },
    ],
    rfqs: [
      { id: 'r1', number: 'RFQ-2025-001', title: 'Cuscinetti', status: 'bozza', date: '2025-03-02', supplierId: 's1', lines: [], active: true },
      { id: 'r2', number: 'RFQ-2025-002', title: 'Viteria', status: 'inviata', date: '2025-03-03', supplierId: null, lines: [], active: true },
    ],
    orders: [
      { id: 'o1', number: 'ODA-2025-001', title: 'Cuscinetti', status: 'bozza', date: '2025-03-10', supplierId: 's1', lines: [], active: true },
      { id: 'o2', number: 'ODA-2025-002', title: 'Viteria', status: 'annullato', date: '2025-03-11', supplierId: 's1', lines: [], active: true },
    ],
  });
}
function app() {
  const a = loadApp({ silent: true });
  a.setDb(dati());
  a.asRole('admin');
  return a;
}
// Le quattro viste, con quel che serve per aprire un documento in ciascuna.
const VISTE = [
  { view: 'jobs', render: 'renderJobs()', lista: 'job-list', apri: "openJobEdit('j1')", numero: 'COM-2025-001' },
  { view: 'mrp', render: 'renderMrp()', lista: 'plan-list', apri: "openPlanEdit('pl1')", numero: 'PRD-2025-001' },
  { view: 'rfq', render: 'renderRfq()', lista: 'rfq-list', apri: "openRfqEdit('r1')", numero: 'RFQ-2025-001' },
  { view: 'orders', render: 'renderOrders()', lista: 'order-list', apri: "openOrderEdit('o1')", numero: 'ODA-2025-001' },
];

describe('Le quattro viste hanno la stessa forma', () => {
  VISTE.forEach(v => {
    it(`${v.view}: elenco a destra e documento al centro, anche a documento aperto`, () => {
      const a = app();
      a.eval(v.render);
      const chiuso = a.html('view-' + v.view);
      assert.match(chiuso, /class="wl"/, 'senza telaio la vista è tornata alla pagina-elenco');
      assert.match(chiuso, /class="wl-side"/);
      assert.match(chiuso, /wl-empty/, 'senza documento scelto il centro spiega cosa fare, non resta bianco');

      a.eval(v.apri);
      const aperto = a.html('view-' + v.view);
      assert.match(aperto, /class="wl-side"/, "l'elenco deve restare visibile mentre si lavora un documento");
      assert.match(aperto, new RegExp(v.numero), 'il documento aperto sta al centro');
      assert.doesNotMatch(aperto, /wl-empty/, 'con un documento aperto non c\'è nessun invito da mostrare');
    });

    it(`${v.view}: la riga aperta è marcata come tale`, () => {
      const a = app();
      a.eval(v.render);
      assert.doesNotMatch(a.html('view-' + v.view), /wl-row sel/, 'senza documento aperto non c\'è riga scelta');
      a.eval(v.apri);
      const h = a.html('view-' + v.view);
      assert.match(h, /wl-row sel/, 'la riga da cui si viene deve restare riconoscibile');
      assert.equal((h.match(/wl-row sel/g) || []).length, 1, 'una sola riga aperta per volta');
    });

    it(`${v.view}: l'elenco resta un elenco, non una pagina`, () => {
      const a = app();
      a.eval(v.render);
      const h = a.html('view-' + v.view);
      assert.doesNotMatch(h, /← Elenco/, 'non c\'è più un elenco altrove a cui tornare');
      assert.match(h, /id="[a-z-]*list"/, "l'elenco ha un contenitore proprio: si ridisegna da solo quando si filtra");
    });
  });
});

describe('Saltare da un documento all\'altro', () => {
  it('la richiesta in sospeso si salva prima di aprirne un\'altra', () => {
    const a = app();
    a.eval('renderRfq(); openRfqEdit("r1");');
    a.eval('rfqSetField("r1","title","Cuscinetti SKF")');
    assert.equal(a.eval('rfqDirty'), true, 'il campo modificato lascia il documento in sospeso');
    a.eval('openRfqEdit("r2")');
    assert.equal(a.eval('rfqDirty'), false, 'aprendo un\'altra richiesta il sospeso è chiuso, non perso');
    assert.equal(a.eval('getRfq("r1").title'), 'Cuscinetti SKF', 'la modifica deve essere rimasta');
    assert.equal(a.eval('currentRfqId'), 'r2');
  });

  it('lo sblocco vale per un documento solo e non segue chi cambia riga', () => {
    const a = app();
    // Lo sblocco vero passa da una conferma a schermo: qui si posa lo stato
    // che quella conferma lascia, che è ciò che il cambio di riga deve azzerare.
    a.eval('renderRfq(); openRfqEdit("r2"); rfqUnlockedId = "r2";');
    assert.equal(a.eval('rfqUnlockedId'), 'r2');
    a.eval('openRfqEdit("r1")');
    assert.equal(a.eval('rfqUnlockedId'), null, 'un documento sbloccato non deve sbloccare il successivo');
  });

  it('lo stesso vale per gli ordini', () => {
    const a = app();
    a.eval('renderOrders(); openOrderEdit("o1"); ordSetField("o1","notes","urgente");');
    assert.equal(a.eval('orderDirty'), true);
    a.eval('openOrderEdit("o2")');
    assert.equal(a.eval('orderDirty'), false);
    assert.equal(a.eval('getOrder("o1").notes'), 'urgente');
  });
});

describe('I comandi che stavano nelle righe', () => {
  it('la richiesta aperta offre «crea ordine» ed «elimina»', () => {
    const a = app();
    a.eval('renderRfq(); openRfqEdit("r1");');
    const h = a.html('view-rfq');
    assert.match(h, /orderFromRfq\('r1'\)/, 'era il pulsante della riga: deve esistere ancora da qualche parte');
    assert.match(h, /delRfq\('r1'\)/);
  });

  it('il piano aperto offre «duplica» ed «elimina», oltre a chiudi/riapri', () => {
    const a = app();
    a.eval('renderMrp(); openPlanEdit("pl1");');
    const h = a.html('view-mrp');
    assert.match(h, /duplicatePlan\('pl1'\)/);
    assert.match(h, /delPlan\('pl1'\)/);
    assert.match(h, /planToggleActive\('pl1'\)/);
  });

  it('l\'ordine aperto offre «elimina»', () => {
    const a = app();
    a.eval('renderOrders(); openOrderEdit("o1");');
    assert.match(a.html('view-orders'), /delOrder\('o1'\)/);
  });
});

describe('Righe e filtri', () => {
  it('un documento chiuso o annullato si vede spento, non sparisce', () => {
    const a = app();
    a.eval('renderMrp()');
    assert.match(a.html('view-mrp'), /wl-row spenta[\s\S]*PRD-2025-002/, 'il piano chiuso resta in elenco');
    a.eval('renderOrders()');
    assert.match(a.html('view-orders'), /wl-row spenta/, "l'ordine annullato resta in elenco");
  });

  it('i filtri dei documenti vivono nella colonna dell\'elenco', () => {
    const a = app();
    a.eval('renderRfq()');
    const h = a.html('view-rfq');
    assert.match(h, /wl-filters/, 'in una colonna da 360px i filtri vanno impilati');
    assert.doesNotMatch(h, /catalog-filters/, 'la barra filtri a tutta pagina non c\'è più');
  });

  it('il conteggio dice quanti sono, e quanti su quanti quando si filtra', () => {
    const a = app();
    assert.equal(a.eval("worklistCount(3, 3, 'commessa', 'commesse')"), '3 commesse');
    assert.equal(a.eval("worklistCount(1, 1, 'commessa', 'commesse')"), '1 commessa');
    assert.equal(a.eval("worklistCount(1, 3, 'commessa', 'commesse')"), '1 di 3');
  });

  it('una riga è cliccabile anche da tastiera', () => {
    const a = app();
    a.eval('renderJobs()');
    const h = a.html('view-jobs');
    assert.match(h, /role="button"/);
    assert.match(h, /tabindex="0"/);
    assert.match(h, /onkeydown=/, 'chi non usa il mouse deve poter aprire una commessa');
  });
});

// Il filtro per periodo è uno solo per quattro elenchi: se diverge, schermo ed
// export cominciano a raccontare due storie diverse dello stesso periodo.
describe('Filtro per periodo, condiviso', () => {
  const app = () => { const a = loadApp({ silent: true }); a.setDb(dati()); a.asRole('admin'); return a; };
  const dentro = (a, iso, da, al) =>
    a.eval(`inDateRange(${JSON.stringify(iso)}, ${JSON.stringify(da)}, ${JSON.stringify(al)})`);

  it('un intervallo vuoto lascia passare tutto, data o non data', () => {
    const a = app();
    assert.equal(dentro(a, '2025-03-01', '', ''), true);
    assert.equal(dentro(a, '', '', ''), true);
  });
  it('gli estremi sono compresi', () => {
    const a = app();
    assert.equal(dentro(a, '2025-03-01', '2025-03-01', '2025-03-31'), true);
    assert.equal(dentro(a, '2025-03-31', '2025-03-01', '2025-03-31'), true);
    assert.equal(dentro(a, '2025-04-01', '2025-03-01', '2025-03-31'), false);
  });
  it('vale anche aperto da un lato solo', () => {
    const a = app();
    assert.equal(dentro(a, '2025-03-01', '2025-02-01', ''), true);
    assert.equal(dentro(a, '2025-01-01', '2025-02-01', ''), false);
    assert.equal(dentro(a, '2025-01-01', '', '2025-02-01'), true);
  });
  it('senza data si resta fuori quando un periodo è impostato', () => {
    const a = app();
    assert.equal(dentro(a, '', '2020-01-01', ''), false, 'non avendo data non ci si può dire dentro');
  });
  it("una data vecchia con l'ora dentro si confronta lo stesso", () => {
    const a = app();
    assert.equal(dentro(a, '2025-03-01T09:30:00.000Z', '2025-03-01', '2025-03-31'), true);
  });
  it("l'intervallo si dice a parole per l'intestazione degli export", () => {
    const a = app();
    assert.equal(a.eval("dateRangeText('2025-03-01', '2025-03-31')"), 'dal 01/03/2025 al 31/03/2025');
    assert.equal(a.eval("dateRangeText('2025-03-01', '')"), 'dal 01/03/2025');
    assert.equal(a.eval("dateRangeText('', '2025-03-31')"), 'fino al 31/03/2025');
    assert.equal(a.eval("dateRangeText('', '')"), '');
  });

  it("le commesse si filtrano per data di apertura, e l'export lo dichiara", () => {
    const a = app();
    a.eval('renderJobs()');
    assert.match(a.html('view-jobs'), /job-date-from/, "le caselle stanno con l'elenco");
    a.el('job-date-from').value = '2025-02-01';
    assert.deepEqual(Array.from(a.eval('jobFilteredList().map(j => j.id)')), ['j2']);
    assert.equal(a.eval('jobCountText()'), '1 di 2');
    assert.match(a.eval('JSON.stringify(jobsExportSpec().filtri)'), /dal 01\/02\/2025/);
  });

  it("i piani si filtrano per data, e l'export lo dichiara", () => {
    const a = app();
    a.eval('renderMrp()');
    assert.match(a.html('view-mrp'), /plan-date-from/);
    a.el('plan-date-from').value = '2025-03-15';
    a.el('plan-date-to').value = '2025-04-30';
    assert.deepEqual(Array.from(a.eval('planFilteredList().map(p => p.id)')), ['pl2']);
    assert.equal(a.eval('planCountText()'), '1 di 2');
    assert.match(a.eval('JSON.stringify(planListExportSpec().filtri)'), /dal 15\/03\/2025 al 30\/04\/2025/);
  });

  it('il periodo si combina con la ricerca testuale', () => {
    const a = app();
    a.eval('renderJobs()');
    a.el('job-search').value = 'alfa';
    a.el('job-date-from').value = '2025-02-01';
    assert.deepEqual(Array.from(a.eval('jobFilteredList().map(j => j.id)')), [],
      'Alfa è di gennaio: il testo trova, il periodo esclude');
  });
});
