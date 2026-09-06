// Import massivo delle distinte da Excel, e i due lettori di intestazioni che
// tutti gli import condividono (resolveType, pick). È l'import che tocca più
// dati in una volta: un foglio sbagliato riscrive mezza distinta.
//
// Si verifica la logica su righe già lette (l'array di oggetti che readSheet
// passa a importBom): il parsing del binario xlsx è di SheetJS e non è nostro.
// Quello che è nostro, e che qui si fissa, è la risoluzione dei tipi e il
// rifiuto delle righe che romperebbero la distinta.
//
// Gli articoli hanno la loro suite: test/catalog-xlsx.test.js.

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

// ═══════════════════════════════════════════════════════════
//  Una riga rifiutata non deve costare la distinta
// ═══════════════════════════════════════════════════════════
// L'azzeramento del padre avveniva alla prima riga «valida», e il controllo dei
// cicli veniva dopo: un file la cui unica riga per quel padre creava un ciclo
// lasciava il padre senza componenti, con un messaggio d'errore al posto della
// distinta — e saveDB() rendeva la perdita definitiva.
describe('Import distinte: il padre non resta a mani vuote', () => {
  // S1 contiene S2, S2 contiene M. Il file prova a mettere S1 dentro S2: è un
  // ciclo, e il sottogruppo dentro il sottogruppo è ammesso — quindi la riga
  // arriva davvero al controllo dei cicli, che è il punto.
  const conCiclo = () => makeDb({
    items: [
      Object.assign(mat('m1', 10), { code: 'M' }),
      Object.assign(asm('s2', 'sottogruppo'), { code: 'S2', components: [comp('m1', 4)] }),
      Object.assign(asm('s1', 'sottogruppo'), { code: 'S1', components: [comp('s2', 1)] }),
    ],
  });

  it('un ciclo non svuota la distinta che era già lì', () => {
    const a = app(conCiclo());
    const rep = a.eval('importBom([{ CodicePadre: "S2", CodiceFiglio: "S1", Qta: 1 }])');
    const s2 = a.snapshot().items.find(i => i.code === 'S2');
    assert.equal(s2.components.length, 1, 'la distinta di prima è ancora lì');
    assert.equal(s2.components[0].itemId, 'm1');
    assert.equal(s2.components[0].qty, 4, 'con la sua quantità');
    assert.equal(rep.added, 0);
    assert.equal(rep.restored, 1, 'e il report lo dichiara');
    assert.ok(rep.errors.some(e => /ciclo/.test(e)), 'il ciclo resta segnalato');
  });

  it('le righe buone entrano lo stesso, quelle cattive no', () => {
    const a = app(conCiclo());
    const rep = a.eval('importBom([{ CodicePadre: "S2", CodiceFiglio: "M", Qta: 3 }, { CodicePadre: "S2", CodiceFiglio: "NONESISTE", Qta: 1 }])');
    const s2 = a.snapshot().items.find(i => i.code === 'S2');
    assert.equal(s2.components.length, 1);
    assert.equal(s2.components[0].qty, 3, 'la riga buona ha sostituito la distinta');
    assert.equal(rep.added, 1);
    assert.equal(rep.restored, 0);
    assert.equal(rep.errors.length, 1);
  });

  it('una distinta vuota di partenza non viene dichiarata ripristinata', () => {
    const a = app(makeDb({
      items: [
        Object.assign(asm('s2', 'sottogruppo'), { code: 'S2' }),
        Object.assign(asm('s1', 'sottogruppo'), { code: 'S1', components: [comp('s2', 1)] }),
      ],
    }));
    const rep = a.eval('importBom([{ CodicePadre: "S2", CodiceFiglio: "S1", Qta: 1 }])');
    assert.equal(rep.restored, 0, 'non c era niente da rimettere');
  });
});

// ═══════════════════════════════════════════════════════════
//  I numeri come li scrive un ufficio acquisti italiano
// ═══════════════════════════════════════════════════════════
// numOr faceva parseFloat(v.replace(',', '.')): su "1.234,56" si fermava al
// punto delle migliaia e restituiva 1,234 — un prezzo plausibile, e falso.
// Entrava così nelle quantità di distinta, nei parametri delle impostazioni e
// nelle tariffe orarie, senza un errore.
describe('numOr — i separatori italiani', () => {
  const n = (v, def) => app().eval('numOr(' + JSON.stringify(v) + ', ' + JSON.stringify(def === undefined ? null : def) + ')');
  it('migliaia col punto e decimali con la virgola', () => {
    assert.equal(n('1.234,56'), 1234.56, 'era il caso che dava 1,234: un prezzo plausibile, e falso');
  });
  // Con un separatore solo non si indovina: "1.500" può essere millecinquecento
  // o uno e mezzo, e nessuna delle due letture è più vera dell'altra. Il punto
  // isolato resta decimale — le celle numeriche vere arrivano già come numeri e
  // non passano di qui, quindi il caso riguarda solo il testo scritto a mano.
  it('con un separatore solo vale la lettura decimale, dichiarata', () => {
    assert.equal(n('12.000'), 12);
  });
  it('e anche la forma anglosassone, che arriva dai gestionali', () => {
    assert.equal(n('1,234.56'), 1234.56);
  });
  it('la virgola sola resta il separatore decimale', () => {
    assert.equal(n('12,5'), 12.5);
  });
  it('quello che non è un numero ricade sul valore di scorta', () => {
    assert.equal(n('abc', 7), 7);
    assert.equal(n('', 0), 0);
  });
  it('un numero vero passa senza toccarlo', () => {
    assert.equal(n(3.25), 3.25);
  });
});

describe('catDateOf — le date come le scrive un fornitore', () => {
  const d = v => app().eval('catDateOf(' + JSON.stringify(v) + ')');
  it('ISO, anche senza lo zero davanti', () => {
    assert.equal(d('2026-01-05'), '2026-01-05');
    assert.equal(d('2026-1-5'), '2026-01-05', 'prima finiva letto come seriale Excel: 1905');
  });
  it('giorno/mese/anno, con il punto o la barra', () => {
    assert.equal(d('31/01/2026'), '2026-01-31');
    assert.equal(d('5.1.2026'), '2026-01-05');
  });
  it('anno a due cifre: è del Duemila', () => {
    assert.equal(d('31/01/26'), '2026-01-31', 'prima diventava il 30 gennaio 1900');
  });
  it('il seriale di Excel resta un seriale', () => {
    assert.equal(d('46032'), '2026-01-10');
  });
  it('quello che non è una data non diventa una data qualsiasi', () => {
    assert.equal(d('pippo'), '');
    assert.equal(d(''), '');
    assert.equal(d('31/13/2026'), '2026-13-31', 'il mese assurdo si vede, non si inventa');
  });
});
