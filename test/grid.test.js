// La griglia raggruppata di Anagrafica e Magazzino.
//
// Le due viste disegnano lo stesso oggetto — gruppi con un titolo che conta,
// le prime N righe, un piede che offre di vederne altre — ed erano due
// implementazioni parallele, già divergenti. Questi test descrivono il
// comportamento **condiviso**: sono la rete sotto l'unificazione, e restano
// dopo, perché è quel comportamento a dover valere in entrambe.
//
// La parte che conta è il conteggio: il titolo di un gruppo dice quanti
// articoli contiene **per intero** anche quando ne disegna solo i primi. Un
// numero che mentisse lì manderebbe qualcuno a ordinare sulla base di un
// elenco tagliato senza avvisare.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, acq } = require('./fixtures.js');

// Articoli commerciali tutti nella stessa famiglia, così finiscono in un gruppo
// solo e la paginazione si vede senza rumore.
function molti(n, extra) {
  const items = [];
  for (let i = 1; i <= n; i++) {
    items.push(Object.assign(acq('a' + i, 10), {
      code: 'CMM-' + String(i).padStart(4, '0'),
      name: 'Articolo ' + i,
      familyId: 'f1', subFamilyId: 'f1s1',
      safetyStock: 5, lotSize: 10,
    }, extra || {}));
  }
  return makeDb({
    families: [{ id: 'f1', name: 'Meccanico', kind: 'acquistato', sigla: 'MEC',
      subs: [{ id: 'f1s1', name: 'Cuscinetti', sigla: 'CUS' }] }],
    items,
  });
}
function app(db) {
  const a = loadApp({ silent: true });
  a.setDb(db || molti(3));
  a.asRole('admin');
  return a;
}
// Le due viste, disegnate e rilette dal loro contenitore.
function anagrafica(a) { a.eval('renderCatalog("buy")'); return a.html('buy-table'); }
function magazzino(a) { a.eval('renderStock()'); return a.html('stk-table'); }
const VISTE = [['Anagrafica', anagrafica, 'buy'], ['Magazzino', magazzino, 'stock']];

VISTE.forEach(([nome, disegna]) => {
  describe('Griglia — ' + nome, () => {
    it('disegna una tabella per gruppo, dentro un contenitore che scorre', () => {
      const h = disegna(app(molti(3)));
      assert.match(h, /class="table-wrap"><table>/, 'senza, su schermo stretto scorre la pagina intera');
      assert.match(h, /<thead>/);
      assert.equal((h.match(/<tbody>/g) || []).length, 1, 'un gruppo solo, una tabella sola');
    });

    it('il titolo del gruppo porta il nome e quanti ne contiene', () => {
      const h = disegna(app(molti(3)));
      assert.match(h, /cat-group-title/);
      assert.match(h, /\(3\)/);
    });

    it('senza righe lo dice, invece di lasciare il vuoto', () => {
      const a = app(makeDb({ items: [] }));
      const h = disegna(a);
      assert.match(h, /empty-text/);
      assert.doesNotMatch(h, /<tbody>/);
    });

    it('sotto il limite non offre di mostrarne altri', () => {
      const h = disegna(app(molti(3)));
      assert.doesNotMatch(h, /cat-more/);
    });
  });
});

// La paginazione: 200 righe di serie, con il piede che dice quante se ne vedono.
describe('Griglia — la paginazione', () => {
  it('Anagrafica: oltre il limite taglia e lo dichiara', () => {
    const a = app(molti(210));
    const h = anagrafica(a);
    assert.match(h, /Mostrati 200 di 210 articoli/);
    assert.match(h, /Mostra altri 10/, 'offre quello che manca, non la pagina intera');
    assert.match(h, /Mostra tutti/);
    assert.match(h, /\(200 di 210\)/, 'il titolo del gruppo nomina il totale, non solo i disegnati');
  });

  it('Magazzino: si comporta allo stesso modo', () => {
    const a = app(molti(210));
    const h = magazzino(a);
    assert.match(h, /Mostrati 200 di 210 articoli/);
    assert.match(h, /Mostra altri 10/);
    assert.match(h, /\(200 di 210\)/);
  });

  it('«Mostra altri» allarga di una pagina', () => {
    const a = app(molti(500));
    anagrafica(a);
    a.eval('catalogShowMore("buy")');
    assert.match(a.html('buy-table'), /Mostrati 400 di 500/);
    a.eval('stockShowMore()');
    assert.match(a.html('stk-table'), /Mostrati 400 di 500/);
  });

  it('«Mostra tutti» toglie il limite e il piede sparisce', () => {
    const a = app(molti(500));
    anagrafica(a);
    a.eval('catalogShowAll("buy")');
    assert.doesNotMatch(a.html('buy-table'), /cat-more/);
    a.eval('stockShowAll()');
    assert.doesNotMatch(a.html('stk-table'), /cat-more/);
  });

  it('il taglio non salta gruppi: si riempiono in ordine finché c-è spazio', () => {
    // Due famiglie, 150 articoli ciascuna: il limite di 200 riempie la prima e
    // taglia la seconda a metà, invece di prenderne 100 da ognuna.
    const db = molti(300);
    db.families.push({ id: 'f2', name: 'Pneumatico', kind: 'acquistato', sigla: 'PNE',
      subs: [{ id: 'f2s1', name: 'Cilindri', sigla: 'CIL' }] });
    db.items.slice(150).forEach(i => { i.familyId = 'f2'; i.subFamilyId = 'f2s1'; });
    const h = anagrafica(app(db));
    assert.match(h, /\(150\)/, 'il primo gruppo dichiara i suoi 150');
    assert.match(h, /50 di 150/, 'il secondo dice quanti ne sta mostrando');
    assert.match(h, /Mostrati 200 di 300/);
  });
});

// Quello che le due viste NON condividono, e che deve restare distinto.
describe('Griglia — quello che le due viste dicono di diverso', () => {
  it('le colonne sono quelle della vista', () => {
    const a = app(molti(2));
    assert.match(anagrafica(a), /Costo un\./);
    const m = magazzino(a);
    assert.match(m, /Esistente/);
    assert.match(m, /Impegnato/);
    assert.doesNotMatch(m, /Costo un\./, 'il magazzino non parla di costi');
  });

  it('ogni intestazione dichiara di essere una colonna', () => {
    const a = app(molti(2));
    [anagrafica(a), magazzino(a)].forEach(h => {
      const th = h.match(/<th(?![a-z])[^>]*>/g) || [];   // <thead> non e' un <th>
      assert.ok(th.length > 0);
      th.forEach(t => assert.match(t, /scope="col"/, t));
    });
  });

  it('il magazzino vuoto spiega cosa ci finirebbe dentro', () => {
    const a = app(makeDb({ items: [] }));
    assert.match(magazzino(a), /commerciali, materie prime e parti/);
  });

  it('un magazzino pieno ma filtrato a zero dice un-altra cosa', () => {
    const a = app(molti(3));
    a.el('stk-search').value = 'nonesistenulla';
    assert.match(magazzino(a), /Nessun articolo con questi filtri/);
  });

  it('i comandi del piede chiamano ciascuno il proprio', () => {
    const a = app(molti(210));
    assert.match(anagrafica(a), /catalogShowMore\('buy'\)/);
    assert.match(magazzino(a), /stockShowMore\(\)/);
  });
});
