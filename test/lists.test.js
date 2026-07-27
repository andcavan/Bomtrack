// Reattività degli elenchi: memoria del testo cercabile dei documenti e
// disegno a blocchi del catalogo.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, acq } = require('./fixtures.js');

function conDocumenti(rfqs) {
  const app = loadApp({ silent: true });
  app.setDb(makeDb({ rfqs }));
  return app;
}
function rfq(over) {
  return Object.assign({
    id: 'r1', number: 'RFQ-2026-001', title: 'Ricambi', status: 'bozza', supplierId: null,
    notes: '', notesInternal: '', lines: [], updatedAt: '2026-01-01T00:00:00.000Z',
  }, over || {});
}

describe('docSearchText — memoria del testo cercabile', () => {
  it('trova il numero, l\'oggetto e le note', () => {
    const app = conDocumenti([rfq({ title: 'Cuscinetti SKF', notes: 'urgente' })]);
    const hay = app.eval('docSearchText(db.rfqs[0])');
    assert.ok(hay.includes('rfq-2026-001'));
    assert.ok(hay.includes('cuscinetti skf'));
    assert.ok(hay.includes('urgente'));
    assert.equal(hay, hay.toLowerCase(), 'il testo va normalizzato in minuscolo');
  });

  it('trova anche dentro le righe del documento', () => {
    const app = conDocumenti([rfq({ lines: [{ id: 'l1', code: 'CMM-042', description: 'Motoriduttore', note: 'con freno' }] })]);
    const hay = app.eval('docSearchText(db.rfqs[0])');
    assert.ok(hay.includes('cmm-042'), 'codice di riga');
    assert.ok(hay.includes('motoriduttore'), 'descrizione di riga');
    assert.ok(hay.includes('con freno'), 'nota di riga');
  });

  it('non ricostruisce il testo se il documento non è cambiato', () => {
    const app = conDocumenti([rfq()]);
    app.eval('docSearchText(db.rfqs[0])');
    // Modifica silenziosa, senza touch(): updatedAt invariato → risposta dalla memoria
    app.eval('db.rfqs[0].title = "CAMBIATO SENZA TOUCH"');
    assert.ok(!app.eval('docSearchText(db.rfqs[0])').includes('cambiato'), 'la memoria non è stata usata');
  });

  it('si aggiorna quando il documento viene toccato', () => {
    const app = conDocumenti([rfq()]);
    app.eval('docSearchText(db.rfqs[0])');
    app.eval('db.rfqs[0].title = "Nuovo oggetto"; touch(db.rfqs[0]);');
    assert.ok(app.eval('docSearchText(db.rfqs[0])').includes('nuovo oggetto'));
  });
});

describe('docFilterApply', () => {
  const tre = () => [
    rfq({ id: 'a', number: 'RFQ-2026-001', title: 'Cuscinetti', status: 'bozza' }),
    rfq({ id: 'b', number: 'RFQ-2026-002', title: 'Viteria', status: 'inviata', supplierId: 's1' }),
    rfq({ id: 'c', number: 'RFQ-2026-003', title: 'Motori', status: 'inviata', supplierId: 's2',
      lines: [{ id: 'l', code: 'CMM-999', description: '', note: '' }] }),
  ];
  function filtra(patch) {
    const app = conDocumenti(tre());
    app.eval('Object.assign(docFilters.rfq, ' + JSON.stringify(patch) + ')');
    return app.eval('docFilterApply("rfq", db.rfqs).map(d => d.id)');
  }

  it('senza filtri torna tutto', () => {
    assert.deepEqual(Array.from(filtra({})), ['a', 'b', 'c']);
  });
  it('filtra per stato', () => {
    assert.deepEqual(Array.from(filtra({ status: 'inviata' })), ['b', 'c']);
  });
  it('filtra per fornitore', () => {
    assert.deepEqual(Array.from(filtra({ supplierId: 's2' })), ['c']);
  });
  it('"senza fornitore" seleziona i documenti non assegnati', () => {
    assert.deepEqual(Array.from(filtra({ supplierId: 'none' })), ['a']);
  });
  it('il testo cerca anche nei codici di riga', () => {
    assert.deepEqual(Array.from(filtra({ q: 'cmm-999' })), ['c']);
  });
  it('i criteri si combinano', () => {
    assert.deepEqual(Array.from(filtra({ status: 'inviata', q: 'viteria' })), ['b']);
  });
});

describe('catalogo — disegno a blocchi', () => {
  // 500 commerciali senza famiglia: finiscono tutti nello stesso gruppo.
  function conArticoli(n) {
    const items = [];
    for (let i = 0; i < n; i++) {
      const it = acq('c' + String(i).padStart(4, '0'), 10);
      it.code = 'CMM-' + String(i).padStart(4, '0');
      items.push(it);
    }
    const app = loadApp({ silent: true });
    app.setDb(makeDb({ items }));
    return app;
  }
  // Le righe articolo portano sempre l'attributo class; `<tr>` secco è l'intestazione.
  const conta = html => (html.match(/<tr class=/g) || []).length;

  it('al primo disegno mostra solo il primo blocco', () => {
    const app = conArticoli(500);
    app.eval('renderCatalog("buy")');
    const html = app.html('buy-table');
    assert.equal(conta(html), app.ref('CATALOG_PAGE'), 'righe disegnate oltre il blocco');
    assert.ok(html.includes('Mostrati 200 di 500 articoli'), 'manca il riepilogo');
    assert.ok(html.includes('Mostra tutti'), 'manca il pulsante per allargare');
  });

  it('il titolo del gruppo dice quanti articoli contiene davvero', () => {
    const app = conArticoli(500);
    app.eval('renderCatalog("buy")');
    assert.ok(app.html('buy-table').includes('(200 di 500)'), 'il conteggio del gruppo mente');
  });

  it('"Mostra altri" allarga di un blocco', () => {
    const app = conArticoli(500);
    app.eval('renderCatalog("buy"); catalogShowMore("buy");');
    assert.equal(conta(app.html('buy-table')), 400);
    assert.ok(app.html('buy-table').includes('Mostrati 400 di 500'));
  });

  it('"Mostra tutti" disegna l\'elenco intero e toglie i pulsanti', () => {
    const app = conArticoli(500);
    app.eval('renderCatalog("buy"); catalogShowAll("buy");');
    const html = app.html('buy-table');
    assert.equal(conta(html), 500);
    assert.ok(!html.includes('Mostra tutti'), 'i pulsanti devono sparire quando non serve più');
  });

  it('cambiare filtro riporta il limite al primo blocco', () => {
    const app = conArticoli(500);
    app.eval('renderCatalog("buy"); catalogShowAll("buy"); catalogFilterChange("buy");');
    assert.equal(conta(app.html('buy-table')), app.ref('CATALOG_PAGE'));
  });

  it('sotto la soglia non compare nessun comando', () => {
    const app = conArticoli(20);
    app.eval('renderCatalog("buy")');
    const html = app.html('buy-table');
    assert.equal(conta(html), 20);
    assert.ok(!html.includes('cat-more'), 'niente comandi se c\'è tutto');
    assert.ok(html.includes('(20)'), 'il conteggio resta secco quando non c\'è troncamento');
  });

  it('elenco vuoto: messaggio, non tabella', () => {
    const app = conArticoli(0);
    app.eval('renderCatalog("buy")');
    assert.ok(app.html('buy-table').includes('Nessun articolo trovato'));
  });
});
