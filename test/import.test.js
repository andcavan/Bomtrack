// Import massivo da Excel: `import-export.js` era il file più grande del
// progetto senza un solo test, ed è quello che tocca più dati in una volta —
// un foglio sbagliato riscrive mezzo catalogo.
//
// Si verifica la logica su righe già lette (l'array di oggetti che readSheet
// passa a importItems/importBom): il parsing del binario xlsx è di SheetJS e
// non è nostro. Quello che è nostro, e che qui si fissa, è l'upsert per
// codice, la risoluzione dei tipi, la creazione al volo delle anagrafiche e
// il rifiuto delle righe che romperebbero la distinta.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, acq, asm, comp } = require('./fixtures.js');

function app(db) {
  const a = loadApp({ silent: true });
  a.setDb(db || makeDb());
  a.asRole('admin');
  return a;
}
// Le righe come le consegna SheetJS: chiavi = intestazioni del foglio.
function riga(o) { return o; }

describe('resolveType — l\'intestazione "Tipo" arriva scritta in tutti i modi', () => {
  const a = app();
  const r = t => a.eval(`resolveType(${JSON.stringify(t)})`);

  it('riconosce la chiave interna', () => {
    assert.equal(r('materiale'), 'materiale');
    assert.equal(r('acquistato'), 'acquistato');
    assert.equal(r('sottogruppo'), 'sottogruppo');
  });
  it('riconosce l\'etichetta mostrata a schermo', () => {
    assert.equal(r('Materia prima'), 'materiale');
    assert.equal(r('Commerciale'), 'acquistato');
  });
  it('accetta le diciture del template scaricabile', () => {
    // Regressione: fino alla 0.21.0 il template proponeva "Componente
    // commerciale" e l'import rifiutava le righe del proprio esempio.
    assert.equal(r('Componente commerciale'), 'acquistato');
    assert.equal(r('Materia prima'), 'materiale');
  });
  it('ignora maiuscole, spazi, accenti e punteggiatura', () => {
    assert.equal(r('  MATERIA  PRIMA '), 'materiale');
    assert.equal(r('Unità'), '');   // non è un tipo: deve restare vuoto, non indovinare
  });
  it('accetta i sinonimi che la gente scrive davvero', () => {
    ['materia prima', 'MP', 'materie prime', 'materia prime'].forEach(v => assert.equal(r(v), 'materiale', v));
    ['commerciale', 'commerciali', 'comm'].forEach(v => assert.equal(r(v), 'acquistato', v));
  });
  it('un tipo sconosciuto non diventa un tipo a caso', () => {
    assert.equal(r('bullone'), '');
    assert.equal(r(''), '');
    assert.equal(r(null), '');
  });
});

describe('pick — la colonna si chiama ogni volta in modo diverso', () => {
  const a = app();
  const p = (row, ...n) => a.eval(`pick(${JSON.stringify(row)}, ${n.map(x => JSON.stringify(x)).join(',')})`);

  it('trova la colonna sotto uno qualsiasi dei nomi ammessi', () => {
    assert.equal(p({ Descrizione: 'Vite' }, 'Nome', 'Name', 'Descrizione'), 'Vite');
  });
  it('normalizza l\'intestazione del foglio, non solo il nome cercato', () => {
    assert.equal(p({ 'Costo Unitario': 3 }, 'CostoUnitario'), 3);
    assert.equal(p({ 'U.M.': 'kg' }, 'UM'), 'kg');
  });
  it('salta le colonne vuote e passa alla successiva', () => {
    assert.equal(p({ Nome: '', Descrizione: 'Vite' }, 'Nome', 'Descrizione'), 'Vite');
  });
  it('nessuna colonna corrispondente: stringa vuota, mai undefined', () => {
    assert.equal(p({ Altro: 'x' }, 'Nome'), '');
  });
});

describe('importItems — creazione', () => {
  it('crea un articolo e conta la riga', () => {
    const a = app();
    const rep = a.eval(`importItems(${JSON.stringify([riga({ Tipo: 'Materia prima', Nome: 'Lamiera S235', UM: 'kg', CostoUnitario: 1.2 })])})`);
    assert.equal(rep.created, 1);
    assert.equal(rep.errors.length, 0);
    const items = a.snapshot().items;
    assert.equal(items.length, 1);
    assert.equal(items[0].name, 'Lamiera S235');
    assert.equal(items[0].unitCost, 1.2);
    assert.equal(items[0].active, true);
  });

  it('la virgola decimale italiana non diventa NaN', () => {
    const a = app();
    a.eval(`importItems(${JSON.stringify([riga({ Tipo: 'Materia prima', Nome: 'X', CostoUnitario: '12,50' })])})`);
    assert.equal(a.snapshot().items[0].unitCost, 12.5);
  });

  it('senza codice ne genera uno, e non è mai vuoto', () => {
    const a = app();
    a.eval(`importItems(${JSON.stringify([riga({ Tipo: 'Materia prima', Nome: 'Senza codice' })])})`);
    const it0 = a.snapshot().items[0];
    assert.ok(it0.code, 'il codice non può restare vuoto: l\'import successivo cerca per codice');
  });

  it('un assieme nasce con distinta e lavorazioni pronte', () => {
    const a = app();
    a.eval(`importItems(${JSON.stringify([riga({ Tipo: 'Gruppo', Nome: 'Basamento' })])})`);
    const it0 = a.snapshot().items[0];
    assert.deepEqual(it0.components, []);
    assert.deepEqual(it0.operations, []);
  });

  it('salva davvero: i dati sopravvivono al ricaricamento', () => {
    const a = app();
    a.eval(`importItems(${JSON.stringify([riga({ Tipo: 'Materia prima', Nome: 'Persistente' })])})`);
    a.ref('Store').load();
    assert.equal(a.snapshot().items[0].name, 'Persistente');
  });
});

describe('importItems — aggiornamento per codice (upsert)', () => {
  it('lo stesso codice aggiorna invece di duplicare', () => {
    const a = app(makeDb({ items: [mat('m1', 5)] }));   // code = 'M1'
    const rep = a.eval(`importItems(${JSON.stringify([riga({ Tipo: 'Materia prima', Codice: 'M1', Nome: 'Rinominata', CostoUnitario: 9 })])})`);
    assert.equal(rep.updated, 1);
    assert.equal(rep.created, 0);
    const items = a.snapshot().items;
    assert.equal(items.length, 1, 'nessun duplicato');
    assert.equal(items[0].name, 'Rinominata');
    assert.equal(items[0].unitCost, 9);
    assert.equal(items[0].id, 'm1', 'l\'identità dell\'articolo non cambia: le distinte lo referenziano per id');
  });

  it('il confronto del codice ignora le maiuscole', () => {
    const a = app(makeDb({ items: [mat('m1', 5)] }));
    const rep = a.eval(`importItems(${JSON.stringify([riga({ Tipo: 'Materia prima', Codice: 'm1', Nome: 'Uguale' })])})`);
    assert.equal(rep.updated, 1);
    assert.equal(a.snapshot().items.length, 1);
  });

  it('reimportare lo stesso foglio due volte non cambia il catalogo', () => {
    const a = app();
    const rows = JSON.stringify([riga({ Tipo: 'Materia prima', Codice: 'AAA', Nome: 'Uno', CostoUnitario: 3 })]);
    a.eval(`importItems(${rows})`);
    const primo = a.snapshot().items;
    a.eval(`importItems(${rows})`);
    const secondo = a.snapshot().items;
    assert.equal(secondo.length, 1);
    assert.equal(secondo[0].id, primo[0].id);
    assert.equal(secondo[0].unitCost, 3);
  });

  it('una colonna assente non azzera il valore già a catalogo', () => {
    const a = app(makeDb({ items: [mat('m1', 7)] }));
    a.eval(`importItems(${JSON.stringify([riga({ Tipo: 'Materia prima', Codice: 'M1', Nome: 'Solo nome' })])})`);
    assert.equal(a.snapshot().items[0].unitCost, 7, 'il costo esistente va conservato, non riportato a zero');
  });
});

describe('importItems — righe rifiutate', () => {
  it('tipo non valido: errore con il numero di riga del foglio', () => {
    const a = app();
    const rep = a.eval(`importItems(${JSON.stringify([riga({ Tipo: 'bullone', Nome: 'X' })])})`);
    assert.equal(rep.created, 0);
    assert.equal(rep.errors.length, 1);
    assert.match(rep.errors[0], /Riga 2/, 'la riga 1 del foglio sono le intestazioni');
    assert.equal(a.snapshot().items.length, 0);
  });

  it('nome mancante: errore, non un articolo senza nome', () => {
    const a = app();
    const rep = a.eval(`importItems(${JSON.stringify([riga({ Tipo: 'Materia prima', Codice: 'X1' })])})`);
    assert.equal(rep.errors.length, 1);
    assert.match(rep.errors[0], /nome/i);
    assert.equal(a.snapshot().items.length, 0);
  });

  it('riga completamente vuota: saltata in silenzio, non è un errore', () => {
    const a = app();
    const rep = a.eval(`importItems(${JSON.stringify([riga({ Tipo: '', Nome: '', Codice: '' })])})`);
    assert.equal(rep.skipped, 1);
    assert.equal(rep.errors.length, 0);
  });

  it('una riga sbagliata non ferma quelle buone', () => {
    const a = app();
    const rep = a.eval(`importItems(${JSON.stringify([
      riga({ Tipo: 'Materia prima', Nome: 'Buona 1' }),
      riga({ Tipo: 'inesistente', Nome: 'Cattiva' }),
      riga({ Tipo: 'Materia prima', Nome: 'Buona 2' }),
    ])})`);
    assert.equal(rep.created, 2);
    assert.equal(rep.errors.length, 1);
    assert.match(rep.errors[0], /Riga 3/);
  });

  it('il testo dell\'errore è escapato: il foglio è input non fidato', () => {
    const a = app();
    const rep = a.eval(`importItems(${JSON.stringify([riga({ Tipo: '<img src=x onerror=alert(1)>', Nome: 'X' })])})`);
    assert.ok(!rep.errors[0].includes('<img'), 'il messaggio finisce in innerHTML nel report di import');
  });
});

describe('importItems — anagrafiche create al volo', () => {
  it('un fornitore nuovo viene creato e collegato', () => {
    const a = app();
    const rep = a.eval(`importItems(${JSON.stringify([riga({ Tipo: 'Componente commerciale', Nome: 'Cuscinetto', PrezzoAcquisto: 12.5, Fornitore: 'SKF' })])})`);
    assert.equal(rep.createdSuppliers, 1);
    const s = a.snapshot();
    assert.equal(s.suppliers.length, 1);
    assert.equal(s.suppliers[0].name, 'SKF');
    assert.equal(s.items[0].supplierId, s.suppliers[0].id);
  });

  it('lo stesso fornitore su più righe viene creato una volta sola', () => {
    const a = app();
    const rep = a.eval(`importItems(${JSON.stringify([
      riga({ Tipo: 'Componente commerciale', Nome: 'A', Fornitore: 'SKF' }),
      riga({ Tipo: 'Componente commerciale', Nome: 'B', Fornitore: 'skf' }),
    ])})`);
    assert.equal(rep.createdSuppliers, 1, 'il confronto per nome ignora le maiuscole');
    assert.equal(a.snapshot().suppliers.length, 1);
  });

  it('famiglia e sottofamiglia nascono annidate e coerenti col tipo', () => {
    const a = app();
    a.eval(`importItems(${JSON.stringify([riga({ Tipo: 'Materia prima', Nome: 'Lamiera', Macrofamiglia: 'Acciaio', Sottofamiglia: 'Lamiere' })])})`);
    const s = a.snapshot();
    assert.equal(s.families.length, 1);
    assert.equal(s.families[0].kind, 'materiale', 'la famiglia appartiene al tipo dell\'articolo che l\'ha creata');
    assert.equal(s.families[0].subs.length, 1);
    assert.equal(s.items[0].familyId, s.families[0].id);
    assert.equal(s.items[0].subFamilyId, s.families[0].subs[0].id);
  });

  it('famiglie omonime di tipo diverso restano separate', () => {
    const a = app();
    a.eval(`importItems(${JSON.stringify([
      riga({ Tipo: 'Materia prima', Nome: 'A', Macrofamiglia: 'Standard' }),
      riga({ Tipo: 'Componente commerciale', Nome: 'B', Macrofamiglia: 'Standard' }),
    ])})`);
    assert.equal(a.snapshot().families.length, 2);
  });

  it('un\'unità di misura sconosciuta viene registrata in elenco', () => {
    const a = app();
    a.eval(`importItems(${JSON.stringify([riga({ Tipo: 'Materia prima', Nome: 'Barra', UM: 'ml' })])})`);
    const s = a.snapshot();
    assert.equal(s.items[0].uom, 'ml');
    assert.ok(s.settings.uoms.some(u => u.code === 'ml'), 'altrimenti l\'U.M. importata non è più selezionabile nei form');
  });
});

describe('importBom — costruzione delle distinte', () => {
  const base = () => makeDb({
    items: [asm('g1', 'gruppo'), mat('m1', 5), acq('c1', 3)],
  });

  it('collega padre e figlio risolvendoli per codice', () => {
    const a = app(base());
    const rep = a.eval(`importBom(${JSON.stringify([riga({ CodicePadre: 'G1', CodiceFiglio: 'M1', Qta: 4, 'Scarto%': 10 })])})`);
    assert.equal(rep.added, 1);
    assert.equal(rep.parents, 1);
    assert.equal(rep.errors.length, 0);
    const g = a.snapshot().items.find(x => x.id === 'g1');
    assert.equal(g.components.length, 1);
    assert.deepEqual(g.components[0], { itemId: 'm1', qty: 4, scrapPct: 10 });
  });

  it('quantità mancante vale 1, scarto mancante vale 0', () => {
    const a = app(base());
    a.eval(`importBom(${JSON.stringify([riga({ CodicePadre: 'G1', CodiceFiglio: 'M1' })])})`);
    const c = a.snapshot().items.find(x => x.id === 'g1').components[0];
    assert.equal(c.qty, 1);
    assert.equal(c.scrapPct, 0);
  });

  it('reimportare sostituisce i componenti del padre, non li accumula', () => {
    const a = app(base());
    const rows = JSON.stringify([riga({ CodicePadre: 'G1', CodiceFiglio: 'M1', Qta: 2 })]);
    a.eval(`importBom(${rows})`);
    a.eval(`importBom(${rows})`);
    const g = a.snapshot().items.find(x => x.id === 'g1');
    assert.equal(g.components.length, 1, 'l\'import distinte è dichiarato idempotente');
  });

  it('il padre si azzera una volta sola per import, non a ogni riga', () => {
    const a = app(base());
    const rep = a.eval(`importBom(${JSON.stringify([
      riga({ CodicePadre: 'G1', CodiceFiglio: 'M1', Qta: 2 }),
      riga({ CodicePadre: 'G1', CodiceFiglio: 'C1', Qta: 5 }),
    ])})`);
    assert.equal(rep.added, 2);
    assert.equal(rep.parents, 1);
    assert.equal(a.snapshot().items.find(x => x.id === 'g1').components.length, 2);
  });

  it('un padre citato solo in righe sbagliate non perde la distinta che aveva', () => {
    const db = base();
    db.items[0].components = [comp('m1', 3)];
    const a = app(db);
    const rep = a.eval(`importBom(${JSON.stringify([riga({ CodicePadre: 'G1', CodiceFiglio: 'INESISTENTE' })])})`);
    assert.equal(rep.errors.length, 1);
    assert.equal(a.snapshot().items.find(x => x.id === 'g1').components.length, 1,
      'l\'azzeramento avviene solo alla prima riga VALIDA: un foglio pieno di errori non svuota le distinte');
  });
});

describe('importBom — righe rifiutate', () => {
  const base = () => makeDb({
    items: [asm('mac', 'macchina'), asm('g1', 'gruppo'), mat('m1', 5)],
  });

  it('padre non a catalogo: errore che dice quale codice', () => {
    const a = app(base());
    const rep = a.eval(`importBom(${JSON.stringify([riga({ CodicePadre: 'NOPE', CodiceFiglio: 'M1' })])})`);
    assert.equal(rep.added, 0);
    assert.match(rep.errors[0], /NOPE/);
  });

  it('figlio non a catalogo: errore, nessun componente fantasma', () => {
    const a = app(base());
    const rep = a.eval(`importBom(${JSON.stringify([riga({ CodicePadre: 'G1', CodiceFiglio: 'NOPE' })])})`);
    assert.equal(rep.added, 0);
    assert.match(rep.errors[0], /NOPE/);
  });

  it('un padre che non può avere distinta viene fermato', () => {
    const a = app(makeDb({ items: [mat('m1', 5), mat('m2', 5)] }));
    const rep = a.eval(`importBom(${JSON.stringify([riga({ CodicePadre: 'M1', CodiceFiglio: 'M2' })])})`);
    assert.equal(rep.added, 0);
    assert.equal(rep.errors.length, 1);
  });

  it('rispetta le regole di contenimento: una materia prima non sta in una macchina', () => {
    const a = app(base());
    const rep = a.eval(`importBom(${JSON.stringify([riga({ CodicePadre: 'MAC', CodiceFiglio: 'M1' })])})`);
    assert.equal(rep.added, 0);
    assert.equal(rep.errors.length, 1, 'le stesse regole del picker, applicate anche all\'import');
  });

  it('un ciclo in distinta viene rifiutato, non salvato', () => {
    // Due sottogruppi: è l'unico accoppiamento che le regole di contenimento
    // lasciano passare in entrambi i versi, quindi l'unico in cui a fermare
    // l'anello deve essere davvero createsCycle() e non isAllowedChild().
    const a = app(makeDb({ items: [asm('g1', 'sottogruppo'), asm('g2', 'sottogruppo')] }));
    const rep = a.eval(`importBom(${JSON.stringify([
      riga({ CodicePadre: 'G1', CodiceFiglio: 'G2' }),
      riga({ CodicePadre: 'G2', CodiceFiglio: 'G1' }),
    ])})`);
    assert.equal(rep.added, 1);
    assert.equal(rep.errors.length, 1);
    assert.match(rep.errors[0], /ciclo/i);
    const g2 = a.snapshot().items.find(x => x.id === 'g2');
    assert.equal(g2.components.length, 0, 'l\'anello non deve entrare nei dati: costOf ricorrerebbe all\'infinito');
  });

  it('riga vuota: saltata, non è un errore', () => {
    const a = app(base());
    const rep = a.eval(`importBom(${JSON.stringify([riga({ CodicePadre: '', CodiceFiglio: '' })])})`);
    assert.equal(rep.skipped, 1);
    assert.equal(rep.errors.length, 0);
  });
});

describe('importItems — codici e indice', () => {
  it('un foglio con lo stesso codice due volte aggiorna, non duplica', () => {
    const a = app();
    const rep = a.eval(`importItems(${JSON.stringify([
      riga({ Tipo: 'Materia prima', Codice: 'X1', Nome: 'Primo', CostoUnitario: 1 }),
      riga({ Tipo: 'Materia prima', Codice: 'X1', Nome: 'Secondo', CostoUnitario: 2 }),
    ])})`);
    assert.equal(rep.created, 1);
    assert.equal(rep.updated, 1);
    const items = a.snapshot().items;
    assert.equal(items.length, 1, 'la seconda riga deve ritrovare l\'articolo creato dalla prima');
    assert.equal(items[0].name, 'Secondo', 'vince l\'ultima riga del foglio');
    assert.equal(items[0].unitCost, 2);
  });

  it('gli articoli creati in questo import sono ritrovabili dalle righe successive', () => {
    const a = app();
    a.eval(`importItems(${JSON.stringify([
      riga({ Tipo: 'Materia prima', Codice: 'A1', Nome: 'Uno' }),
      riga({ Tipo: 'Materia prima', Codice: 'B1', Nome: 'Due' }),
      riga({ Tipo: 'Materia prima', Codice: 'a1', Nome: 'Uno corretto' }),
    ])})`);
    const items = a.snapshot().items;
    assert.equal(items.length, 2, 'l\'indice deve vedere anche gli articoli appena aggiunti, non solo quelli a catalogo');
    assert.equal(items.find(x => x.code.toLowerCase() === 'a1').name, 'Uno corretto');
  });

  it('un codice generato che collide non sovrascrive l\'articolo di qualcun altro', () => {
    // Il caso: qualcuno ha inserito a mano un codice che coincide con il
    // prossimo che la generazione automatica produrrebbe.
    const a = app();
    a.eval(`importItems(${JSON.stringify([riga({ Tipo: 'Materia prima', Nome: 'Primo automatico' })])})`);
    const generato = a.snapshot().items[0].code;
    // Si rimette lo stesso codice in gioco svuotando quello dell'articolo che lo
    // occupava, così la generazione ripropone il medesimo valore.
    const a2 = app(makeDb({ items: [Object.assign(mat('occupante', 1), { code: generato })] }));
    const rep = a2.eval(`importItems(${JSON.stringify([riga({ Tipo: 'Materia prima', Nome: 'Nuovo senza codice' })])})`);
    const items = a2.snapshot().items;
    assert.equal(items.length, 2, 'devono restare due articoli distinti');
    assert.notEqual(items[0].code, items[1].code, 'e con due codici diversi');
    assert.equal(items[0].id, 'occupante');
    assert.equal(items[0].name, 'Materia occupante', 'l\'articolo che c\'era non va toccato');
    assert.ok(rep.errors.length === 0 || /già in uso/.test(rep.errors[0]));
  });

  it('l\'import non è quadratico: 400 righe su 400 articoli restano rapide', () => {
    // Non è un benchmark, è una rete: con la scansione lineare per riga questo
    // caso faceva 160.000 confronti e cresceva col quadrato del catalogo.
    const n = 400;
    const esistenti = [];
    for (let i = 0; i < n; i++) esistenti.push(Object.assign(mat('m' + i, 1), { code: 'MAT-' + i }));
    const a = app(makeDb({ items: esistenti }));
    const rows = [];
    for (let i = 0; i < n; i++) rows.push(riga({ Tipo: 'Materia prima', Codice: 'MAT-' + i, Nome: 'Agg ' + i }));
    const t0 = Date.now();
    const rep = a.eval(`importItems(${JSON.stringify(rows)})`);
    const ms = Date.now() - t0;
    assert.equal(rep.updated, n);
    assert.equal(a.snapshot().items.length, n, 'nessun duplicato creato');
    assert.ok(ms < 3000, `import di ${n} righe in ${ms} ms: troppo lento, l'indice non sta funzionando`);
  });
});

describe('findByCode', () => {
  it('trova ignorando maiuscole e spazi ai bordi', () => {
    const a = app(makeDb({ items: [mat('m1', 5)] }));
    assert.equal(a.eval('findByCode("  m1  ")').id, 'm1');
  });
  it('codice vuoto o assente: null, non il primo articolo che capita', () => {
    const a = app(makeDb({ items: [mat('m1', 5)] }));
    assert.equal(a.eval('findByCode("")'), null);
    assert.equal(a.eval('findByCode("zzz")'), null);
  });
});
