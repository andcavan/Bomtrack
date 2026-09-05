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
  // Ogni riga articolo dichiara il proprio id in `data-sel` — è l'attributo con
  // cui il pannello laterale la ritrova; l'intestazione non ce l'ha.
  const conta = html => (html.match(/<tr data-sel=/g) || []).length;

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

describe('filtri della vista Distinta base', () => {
  const { asm } = require('./fixtures.js');
  function conAssiemi() {
    const app = loadApp({ silent: true });
    app.asRole('admin');
    app.setDb(makeDb({ items: [
      asm('m1', 'macchina', { code: 'TRN-001', name: 'Tornio' }),
      asm('m2', 'macchina', { code: 'FRS-001', name: 'Fresa' }),
      asm('g1', 'gruppo', { code: 'TRN-BAS-001', name: 'Basamento', machineItemId: 'm1' }),
      asm('g2', 'gruppo', { code: 'FRS-TAV-001', name: 'Tavola', machineItemId: 'm2' }),
      asm('s1', 'sottogruppo', { code: 'TRN-BAS-S01', name: 'Slitta', machineItemId: 'm1' }),
    ] }));
    return app;
  }
  const codici = (app) => JSON.parse(app.eval('JSON.stringify(bomFilteredProducts().map(i => i.code))'));

  it('senza filtri ci sono tutti gli assiemi, ordinati per codice', () => {
    assert.deepEqual(codici(conAssiemi()), ['FRS-001', 'FRS-TAV-001', 'TRN-001', 'TRN-BAS-001', 'TRN-BAS-S01']);
  });

  it('il testo cerca su codice e nome', () => {
    const app = conAssiemi();
    app.el('bom-search').value = 'basamento';
    assert.deepEqual(codici(app), ['TRN-BAS-001']);
    app.el('bom-search').value = 'frs';
    assert.deepEqual(codici(app), ['FRS-001', 'FRS-TAV-001']);
  });

  it('il livello restringe al tipo scelto', () => {
    const app = conAssiemi();
    app.el('bom-type').value = 'gruppo';
    assert.deepEqual(codici(app), ['FRS-TAV-001', 'TRN-BAS-001']);
  });

  it('la macchina porta con se i suoi gruppi, e anche se stessa', () => {
    const app = conAssiemi();
    app.el('bom-machine').value = 'm1';
    assert.deepEqual(codici(app), ['TRN-001', 'TRN-BAS-001', 'TRN-BAS-S01']);
  });

  it('i filtri si sommano', () => {
    const app = conAssiemi();
    app.el('bom-machine').value = 'm1';
    app.el('bom-type').value = 'sottogruppo';
    assert.deepEqual(codici(app), ['TRN-BAS-S01']);
  });

  it('la distinta aperta resta nel menu anche se il filtro la escluderebbe', () => {
    const app = conAssiemi();
    app.eval('currentBomId = "m2"');
    app.el('bom-machine').value = 'm1';
    assert.ok(app.eval('productOptions(currentBomId)').includes('FRS-001'), 'chiuderebbe l albero sotto le mani');
  });

  it('la selezione non cade su un filtro che non trova nulla', () => {
    const app = conAssiemi();
    app.eval('currentBomId = "m2"');
    app.el('bom-search').value = 'inesistente';
    app.eval('ensureCurrentBom()');
    assert.equal(app.eval('currentBomId'), 'm2', 'i filtri restringono l elenco, non cambiano cosa si guarda');
  });
});

describe('cancellazione di un fornitore ancora citato', () => {
  const { makeDb: mk, acq: cmm, mat: mp, parte: prt } = require('./fixtures.js');
  function conFornitore(over) {
    const app = loadApp({ silent: true });
    app.asRole('admin');
    app.setDb(mk(Object.assign({ suppliers: [{ id: 's1', name: 'Alfa', active: true }] }, over || {})));
    return app;
  }
  const usi = app => JSON.parse(app.eval('JSON.stringify(supplierUses("s1"))'));

  it('un fornitore libero si cancella', () => {
    const app = conFornitore();
    assert.equal(usi(app).length, 0);
    app.eval('delSupplier("s1"); confirmYes();');
    assert.equal(app.snapshot().suppliers.length, 0);
  });

  it('citato da un articolo: bloccato', () => {
    const app = conFornitore({ items: [Object.assign(cmm('a', 1), { supplierId: 's1' })] });
    app.eval('delSupplier("s1"); confirmYes();');
    assert.equal(app.snapshot().suppliers.length, 1);
  });

  it('citato solo da una quotazione a listino: bloccato', () => {
    const app = conFornitore({ items: [Object.assign(mp('m', 2), {
      priceList: [{ id: 'q1', supplierId: 's1', price: 2, date: '2026-01-01' }], priceListSeeded: true })] });
    assert.deepEqual(usi(app), ['1 listino']);
    app.eval('delSupplier("s1"); confirmYes();');
    assert.equal(app.snapshot().suppliers.length, 1, 'lasciava uno storico prezzi orfano');
  });

  it('citato solo da una lavorazione esterna di ciclo: bloccato', () => {
    const app = conFornitore({ items: [prt('p', { cycle: [{ kind: 'op', workCenterId: null, supplierId: 's1', cost: 9 }] })] });
    assert.deepEqual(usi(app), ['1 ciclo']);
  });

  it('citato solo da documenti: bloccato', () => {
    const app = conFornitore({
      rfqs: [{ id: 'r1', number: 'RFQ-2026-001', supplierId: 's1', status: 'bozza', lines: [] }],
      orders: [{ id: 'o1', number: 'ODA-2026-001', supplierId: 's1', status: 'bozza', lines: [] }],
    });
    assert.deepEqual(usi(app), ['1 richiesta', '1 ordine']);
  });

  it('gli usi si elencano tutti insieme, non solo il primo', () => {
    const app = conFornitore({
      items: [Object.assign(cmm('a', 1), { supplierId: 's1', priceList: [{ id: 'q1', supplierId: 's1', price: 1 }] })],
      orders: [{ id: 'o1', number: 'ODA-2026-001', supplierId: 's1', status: 'bozza', lines: [] }],
    });
    assert.deepEqual(usi(app), ['1 articolo', '1 listino', '1 ordine']);
  });
});
