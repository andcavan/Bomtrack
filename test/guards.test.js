// Guardie di ruolo e correttezza dei conteggi (0.37.0).
//
// Tre regole fissate per iscritto:
// 1. i mutatori della Gestione rifiutano chi non può scrivere `manage` — la
//    guardia sta nel mutatore, non nella vista che lo nasconde;
// 2. il riepilogo della home non dipende dal toggle lordo/netto lasciato
//    acceso nella vista Fabbisogno: conta sempre il netto;
// 3. «da dove viene il costo» risolve gli articoli per id, non per codice —
//    i codici duplicati esistono e non devono fondere né nascondere voci.

const assert = require('node:assert/strict');
const { describe, it, approx } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, acq, asm, comp } = require('./fixtures.js');

function app(db, role) {
  const a = loadApp({ silent: true });
  a.setDb(db || makeDb({ items: [] }));
  a.asRole(role || 'admin');
  return a;
}

describe('Le guardie stanno nei mutatori della Gestione', () => {
  const dbTerms = () => makeDb({
    suppliers: [{ id: 's1', name: 'SKF', active: true }],
    settings: { transportOptions: ['Porto franco'], transportDefault: '', uoms: [{ code: 'kg', name: '' }, { code: 'pz', name: '' }], uomDefault: 'pz' },
  });

  it('un lettore non imposta il trasporto predefinito', () => {
    const a = app(dbTerms(), 'lettore');
    a.eval('termsSetDefault("transport", 0)');
    assert.equal(a.eval('db.settings.transportDefault'), '');
  });

  it('un lettore non cancella una voce dei termini', () => {
    const a = app(dbTerms(), 'lettore');
    a.eval('termsDel("transport", 0)');
    assert.equal(a.eval('db.settings.transportOptions.length'), 1);
  });

  it('un lettore non cambia l\'unità di misura predefinita', () => {
    const a = app(dbTerms(), 'lettore');
    a.eval('uomSetDefault(0)');
    assert.equal(a.eval('db.settings.uomDefault'), 'pz');
  });

  it('acquisti e progettazione sono fuori dalla Gestione quanto il lettore', () => {
    // La matrice ROLE_WRITE riserva `manage` al solo admin: la guardia deve
    // rispettarla per tutti, non solo per il caso ovvio.
    ['acquisti', 'progettazione'].forEach(ruolo => {
      const a = app(dbTerms(), ruolo);
      a.eval('termsSetDefault("transport", 0)');
      assert.equal(a.eval('db.settings.transportDefault'), '', ruolo);
    });
  });

  it('l\'amministratore passa: la guardia blocca il ruolo, non la funzione', () => {
    const a = app(dbTerms(), 'admin');
    a.eval('termsSetDefault("transport", 0)');
    assert.equal(a.eval('db.settings.transportDefault'), 'Porto franco');
    a.eval('uomSetDefault(0)');
    assert.equal(a.eval('db.settings.uomDefault'), 'kg');
  });
});

describe('releaseRevision è guardata dentro, non solo dai chiamanti', () => {
  const dbRev = () => makeDb({
    items: [asm('g1', 'gruppo', { components: [comp('m1', 2)] }), mat('m1', 10)],
  });

  it('un lettore non rilascia: nessun record, articolo intatto', () => {
    const a = app(dbRev(), 'lettore');
    const rec = a.eval('releaseRevision("g1", "tentativo")');
    assert.equal(rec, null);
    assert.equal(a.eval('(db.revisions || []).length'), 0);
  });

  it('la progettazione rilascia: le distinte sono area sua', () => {
    const a = app(dbRev(), 'progettazione');
    const rev = JSON.parse(a.eval('JSON.stringify(releaseRevision("g1", "ok"))'));
    assert.equal(rev.rev, 'A');
    assert.equal(a.eval('db.revisions.length'), 1);
  });
});

describe('La home conta il fabbisogno netto, qualunque cosa dica il toggle', () => {
  // Un piano in ritardo su un articolo che il magazzino copre per intero:
  // al lordo segnalerebbe, al netto no. La home deve dire la stessa cosa
  // con il toggle della vista Fabbisogno in entrambe le posizioni.
  const dbPiano = () => makeDb({
    suppliers: [{ id: 's1', name: 'SKF', active: true }],
    items: [Object.assign(acq('c1', 5), {
      priceList: [{ id: 'p1', supplierId: 's1', price: 5, leadDays: 5, date: '2026-01-01' }],
      activePriceId: 'p1', supplierId: 's1',
    })],
    plans: [{ id: 'pl1', number: 'FAB-1', active: true, lines: [{ id: 'l1', itemId: 'c1', qty: 10, dueDate: '2020-01-01' }] }],
    movements: [{ id: 'mv1', itemId: 'c1', kind: 'rettifica', qty: 1000, date: '2026-01-01' }],
  });
  const segnali = a => JSON.parse(a.eval('JSON.stringify(homeSegnali())'));

  it('magazzino che copre tutto: nessun segnale, con il toggle in entrambi i versi', () => {
    const a = app(dbPiano());
    a.eval('mrpNet = false');
    const lordo = segnali(a).filter(s => /fabbisogno/.test(s.testo));
    a.eval('mrpNet = true');
    const netto = segnali(a).filter(s => /fabbisogno/.test(s.testo));
    assert.deepEqual(lordo, netto, 'due utenti sulla stessa base dati devono leggere lo stesso numero');
    assert.equal(netto.length, 0, 'coperto dal magazzino: non c\'è niente da ordinare');
  });

  it('senza copertura il ritardo si segnala, sempre', () => {
    const scoperto = dbPiano(); scoperto.movements = [];
    const a = app(scoperto);
    a.eval('mrpNet = false');
    assert.ok(segnali(a).some(s => /oltre la data/.test(s.testo)));
  });
});

describe('Le ottimizzazioni non cambiano i numeri (0.38.0)', () => {
  it('withTempCost su più cime in un colpo solo dà gli stessi costi di una chiamata per cima', () => {
    const a = app(makeDb({
      items: [
        asm('mac1', 'macchina', { components: [comp('m1', 2)] }),
        asm('mac2', 'macchina', { components: [comp('m1', 5)] }),
        mat('m1', 10),
      ],
    }));
    const unoPerVolta = JSON.parse(a.eval(`JSON.stringify([
      withTempCost(getItem('m1'), 99, () => costOf('mac1').total),
      withTempCost(getItem('m1'), 99, () => costOf('mac2').total),
    ])`));
    const inBlocco = JSON.parse(a.eval(`JSON.stringify(
      withTempCost(getItem('m1'), 99, () => ['mac1', 'mac2'].map(id => costOf(id).total))
    )`));
    assert.deepEqual(inBlocco, unoPerVolta);
    approx(a.eval('costOf("mac1").total'), 20, 'fuori dalla simulazione il costo vero torna');
  });

  it('la scheda articolo elenca anche i piani chiusi in cui l\'articolo compare esploso', () => {
    // planUseIndex() ha sostituito la riesplosione per apertura: la semantica
    // storica («per cosa serviva?») deve restare, piani chiusi compresi —
    // commitIndex() li scarta, questo indice no.
    const a = app(makeDb({
      items: [asm('mac', 'macchina', { components: [comp('c1', 2)] }), acq('c1', 5)],
      plans: [{ id: 'pl1', number: 'FAB-9', active: false, lines: [{ id: 'l1', itemId: 'mac', qty: 1 }] }],
    }));
    const html = a.eval('itemInfoDocumenti(getItem("c1"))');
    assert.match(html, /FAB-9/);
    assert.match(html, /piano chiuso/);
  });
});

describe('I contributi di costo si contano per id, non per codice', () => {
  it('una foglia col codice di un assieme non sparisce dal conto', () => {
    // Prima si risolveva con getItemByCode: il codice DUP trovava l'assieme,
    // la foglia veniva scartata come «assieme» e la spesa spariva dal conto.
    const a = app(makeDb({ items: [
      Object.assign(asm('mac', 'macchina', { components: [comp('x', 2)] }), { code: 'DUP' }),
      Object.assign(mat('x', 10), { code: 'DUP' }),
    ] }));
    const c = JSON.parse(a.eval('JSON.stringify(costContributors("mac"))'));
    assert.equal(c.length, 1);
    assert.equal(c[0].id, 'x');
    approx(c[0].line, 20);
  });

  it('due articoli distinti con lo stesso codice restano due voci', () => {
    const a = app(makeDb({ items: [
      asm('mac', 'macchina', { components: [comp('x1', 1), comp('x2', 1)] }),
      Object.assign(mat('x1', 3), { code: 'EQ' }),
      Object.assign(mat('x2', 7), { code: 'EQ' }),
    ] }));
    const c = JSON.parse(a.eval('JSON.stringify(costContributors("mac").map(x => x.line).sort((p, q) => p - q))'));
    assert.deepEqual(c, [3, 7], 'per codice si fonderebbero in una voce da 10');
  });
});
