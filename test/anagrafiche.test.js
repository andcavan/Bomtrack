// Le anagrafiche di servizio: cosa tiene in vita un fornitore, e cosa succede
// rinominando un'unità di misura.
//
// Sono due funzioni che toccano **tutto il database** — `supplierUses` decide se
// si può cancellare, `renameUom` riscrive ogni riga che nomina quel codice — ed
// erano fra le ultime senza copertura (`docs/analisi-tecnica.md`, C3).

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, acq } = require('./fixtures.js');

function app(dbObj) {
  const a = loadApp({ silent: true });
  a.setDb(dbObj);
  a.asRole('admin');
  return a;
}
const usi = (a, id) => JSON.parse(a.eval('JSON.stringify(supplierUses(' + JSON.stringify(id) + '))'));

// ═══════════════════════════════════════════════════════════
//  Dove vive un fornitore
// ═══════════════════════════════════════════════════════════
describe('supplierUses — chi trattiene un fornitore', () => {
  const forn = [{ id: 's1', name: 'Terzista Verdi', active: true }];

  it('un fornitore che non c\'entra niente si può cancellare', () => {
    const a = app(makeDb({ suppliers: forn, items: [acq('C1', 5)] }));
    assert.deepEqual(usi(a, 's1'), []);
  });

  it('un articolo che lo cita lo trattiene', () => {
    const a = app(makeDb({ suppliers: forn, items: [Object.assign(acq('C1', 5), { supplierId: 's1' })] }));
    assert.equal(usi(a, 's1').length, 1);
  });

  // Il caso che mancava. La scheda del movimento **pretende** il terzista
  // («senza, non si sa da chi sta la merce»), quindi su ogni uscita a conto
  // lavoro quel riferimento c'è per costruzione. Cancellando il fornitore, il
  // prospetto «presso terzi» restava a raggruppare sotto «senza fornitore»
  // materiale che è nostro e sta fisicamente da qualcuno.
  it('un\'uscita a conto lavoro lo trattiene: quei pezzi stanno da lui', () => {
    const a = app(makeDb({
      suppliers: forn,
      items: [mat('M1', 10)],
      movements: [{ id: 'mv1', itemId: 'M1', kind: 'clOut', qty: -5, date: '2026-08-01', supplierId: 's1' }],
    }));
    const u = usi(a, 's1');
    assert.equal(u.length, 1, 'il movimento deve trattenerlo');
    assert.ok(/movimento/.test(u[0]), 'e deve dire che è un movimento: ' + u[0]);
  });

  it('vale anche per il fornitore da cui la merce rientra', () => {
    const a = app(makeDb({
      suppliers: forn,
      items: [mat('M1', 10)],
      movements: [{ id: 'mv1', itemId: 'M1', kind: 'clStep', qty: 0, date: '2026-08-01', fromSupplierId: 's1' }],
    }));
    assert.equal(usi(a, 's1').length, 1, 'fromSupplierId è un riferimento come gli altri');
  });

  it('i movimenti che non lo nominano non lo trattengono', () => {
    const a = app(makeDb({
      suppliers: forn,
      items: [mat('M1', 10)],
      movements: [{ id: 'mv1', itemId: 'M1', kind: 'rettifica', qty: 3, date: '2026-08-01' }],
    }));
    assert.deepEqual(usi(a, 's1'), [], 'una rettifica di magazzino non c\'entra con nessun fornitore');
  });

  it('più usi si elencano tutti, così si sa dove andare a guardare', () => {
    const a = app(makeDb({
      suppliers: forn,
      items: [Object.assign(acq('C1', 5), { supplierId: 's1' })],
      movements: [{ id: 'mv1', itemId: 'C1', kind: 'clOut', qty: -2, date: '2026-08-01', supplierId: 's1' }],
      orders: [{ id: 'o1', number: 'ODA-1', supplierId: 's1', active: true, lines: [] }],
    }));
    assert.equal(usi(a, 's1').length, 3);
  });
});

// ═══════════════════════════════════════════════════════════
//  Rinominare un'unità di misura
// ═══════════════════════════════════════════════════════════
// Una barra si gestisce in metri e si compra a chilo: il chilo vive in
// `altUom` sull'articolo e in `priceUom` sulla riga di listino, non in `uom`.
// Erano i due campi che la rinomina lasciava indietro e che il conteggio d'uso
// non vedeva — al punto che `delUom` dichiarava «non usata» l'unità che stava
// convertendo i prezzi di mezzo magazzino.
describe('renameUom — la seconda unità viene con', () => {
  function barra() {
    return makeDb({
      settings: { uoms: [{ code: 'm', name: 'Metri' }, { code: 'kg', name: 'Chili' }] },
      suppliers: [{ id: 's1', name: 'Ferriera', active: true }],
      items: [Object.assign(mat('B1', 10), {
        uom: 'm', altUom: 'kg', altFactor: 2.5,
        priceList: [{ id: 'p1', supplierId: 's1', price: 2, priceUom: 'kg', date: '2026-08-01' }],
      })],
    });
  }

  it('la seconda unità dell\'articolo viene rinominata', () => {
    const a = app(barra());
    a.eval('renameUom("kg", "KG")');
    assert.equal(a.snapshot().items[0].altUom, 'KG');
  });

  it('e anche l\'unità in cui il fornitore quota', () => {
    const a = app(barra());
    a.eval('renameUom("kg", "KG")');
    assert.equal(a.snapshot().items[0].priceList[0].priceUom, 'KG');
  });

  it('dopo la rinomina la conversione dà ancora lo stesso costo', () => {
    const a = app(barra());
    const prima = a.eval('rowUnitCost(getItem("B1"), getItem("B1").priceList[0])');
    a.eval('renameUom("kg", "KG")');
    const dopo = a.eval('rowUnitCost(getItem("B1"), getItem("B1").priceList[0])');
    assert.equal(dopo, prima, '2 €/kg su una barra da 2,5 kg/m fanno 5 €/m, comunque si chiami il chilo');
    assert.equal(dopo, 5);
  });

  it('l\'unità di gestione continua a funzionare quando si rinomina lei', () => {
    const a = app(barra());
    a.eval('renameUom("m", "M")');
    const it = a.snapshot().items[0];
    assert.equal(it.uom, 'M');
    assert.equal(it.altUom, 'kg', 'la seconda unità non c\'entra e non va toccata');
    assert.equal(a.eval('rowUnitCost(getItem("B1"), getItem("B1").priceList[0])'), 5);
  });

  it('un\'unità che non compare da nessuna parte non cambia niente', () => {
    const a = app(barra());
    const prima = JSON.stringify(a.snapshot().items);
    a.eval('renameUom("litri", "L")');
    assert.equal(JSON.stringify(a.snapshot().items), prima);
  });
});

describe('uomUsage — quante volte un\'unità è in uso', () => {
  function barra() {
    return makeDb({
      settings: { uoms: [{ code: 'm', name: 'Metri' }, { code: 'kg', name: 'Chili' }] },
      suppliers: [{ id: 's1', name: 'Ferriera', active: true }],
      items: [Object.assign(mat('B1', 10), {
        uom: 'm', altUom: 'kg', altFactor: 2.5,
        priceList: [{ id: 'p1', supplierId: 's1', price: 2, priceUom: 'kg', date: '2026-08-01' }],
      })],
    });
  }

  // Su questo numero `delUom` decide se lasciar cancellare: contarlo male
  // significa far sparire dall'elenco l'unità che converte i prezzi.
  it('conta la seconda unità e quella del listino, non solo uom', () => {
    const a = app(barra());
    assert.equal(a.eval('uomUsage("kg")'), 2, 'una volta come altUom, una come priceUom');
  });

  it('l\'unità di gestione si conta come sempre', () => {
    const a = app(barra());
    assert.equal(a.eval('uomUsage("m")'), 1);
  });

  it('un\'unità davvero libera resta a zero', () => {
    const a = app(barra());
    assert.equal(a.eval('uomUsage("litri")'), 0);
  });
});
