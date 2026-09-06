// Vincoli sui valori numerici.
// clampNum è la parte pura (niente DOM) della lettura dei campi: qui si verifica
// quella, più la tenuta del motore davanti a dati già sporchi — un backup JSON
// o un import Excel non passano dai controlli dell'interfaccia.

const assert = require('node:assert/strict');
const { describe, it, approx } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, acq, asm, comp } = require('./fixtures.js');

const app = loadApp({ silent: true });
const clampNum = app.ref('clampNum');

describe('clampNum', () => {
  it('lascia passare i valori dentro l\'intervallo', () => {
    assert.equal(clampNum(5, 0, 10), 5);
    assert.equal(clampNum(0, 0, 10), 0);
    assert.equal(clampNum(10, 0, 10), 10);
    assert.equal(clampNum(-3), -3, 'senza limiti non tocca nulla');
  });

  it('riporta al minimo e al massimo', () => {
    assert.equal(clampNum(-50, 0), 0);
    assert.equal(clampNum(-50, 0, 100), 0);
    assert.equal(clampNum(5000, 0, 1000), 1000);
    assert.equal(clampNum(150, 0, 100), 100, 'scarto oltre il 100%');
  });

  it('NaN e infiniti diventano il minimo (0 se non c\'è)', () => {
    assert.equal(clampNum(NaN, 0), 0);
    assert.equal(clampNum(NaN), 0);
    assert.equal(clampNum(Infinity, 0, 1000), 0, 'Infinity non deve passare per "molto grande"');
    assert.equal(clampNum(-Infinity, 0), 0);
    assert.equal(clampNum(parseFloat('abc'), 0), 0);
    assert.equal(clampNum(parseFloat(''), 0), 0);
  });

  it('un minimo diverso da zero viene rispettato anche sui non numeri', () => {
    assert.equal(clampNum(NaN, 1), 1);
    assert.equal(clampNum(0, 1, 10), 1);
  });

  it('parseFloat da solo lasciava passare proprio questi casi', () => {
    // Documenta il difetto che clampNum chiude: `parseFloat(x) || 0`.
    assert.equal(parseFloat('-50') || 0, -50);
    assert.equal(parseFloat('Infinity') || 0, Infinity);
    assert.equal(clampNum(parseFloat('-50'), 0), 0);
    assert.equal(clampNum(parseFloat('Infinity'), 0, 1000), 0);
  });
});

describe('il motore regge dati già sporchi (backup e import)', () => {
  function conDb(dbObj) {
    const a = loadApp({ silent: true });
    a.setDb(dbObj);
    return a;
  }

  it('costi negativi salvati in passato non producono NaN', () => {
    const a = conDb(makeDb({ items: [
      mat('m', -5), acq('c', -10),
      asm('g', 'gruppo', { components: [comp('m', 1), comp('c', 1)] }),
    ] }));
    const c = a.ref('costOf')('g');
    assert.ok(!Number.isNaN(c.total), 'totale NaN');
    approx(c.total, -15, 'il valore resta quello salvato: non lo riscriviamo di nascosto');
  });

  it('scarto negativo o assurdo non fa esplodere il calcolo', () => {
    const a = conDb(makeDb({ items: [
      mat('m', 10),
      asm('g', 'gruppo', { components: [{ itemId: 'm', qty: 1, scrapPct: -50 }] }),
    ] }));
    const c = a.ref('costOf')('g');
    assert.ok(isFinite(c.total));
    approx(c.total, 5);
  });

  it('quantità o percentuali non numeriche valgono 0, mai NaN', () => {
    const a = conDb(makeDb({ items: [
      mat('m', 10),
      asm('g', 'gruppo', { components: [{ itemId: 'm', qty: 'due', scrapPct: 'poco' }] }),
    ] }));
    const c = a.ref('costOf')('g');
    assert.ok(!Number.isNaN(c.total));
    approx(c.total, 0);
  });

  it('spese generali fuori scala restano finite', () => {
    const a = conDb(makeDb({
      settings: { overheadPct: 1e308 },
      items: [mat('m', 10), asm('g', 'gruppo', { components: [comp('m', 1)] })],
    }));
    const c = a.ref('costOf')('g');
    assert.ok(!Number.isNaN(c.total), 'totale NaN');
  });
});

// ═══════════════════════════════════════════════════════════
//  Quello che «Salva» non deve poter salvare
// ═══════════════════════════════════════════════════════════
// La validazione stava solo sul ramo «aggiungi»: addSupplier chiedeva il nome,
// saveSupplier lo lasciava svuotare. Un fornitore senza nome è una riga bianca
// in Gestione, e ogni richiesta e ordine intestati a lui stampano «senza
// fornitore» in PDF senza che niente lo segnali.
function conAnagrafica() {
  const a = loadApp({ silent: true });
  a.asRole('admin');
  a.setDb(makeDb({
    suppliers: [{ id: 's1', name: 'Rossi', active: true }],
    workCenters: [{ id: 'w1', name: 'Tornitura', hourlyRate: 40, active: true }],
    families: [{ id: 'f1', name: 'Meccanico', kind: 'acquistato', sigla: 'MEC',
      subs: [{ id: 'f1s1', name: 'Cuscinetti', sigla: 'CUS' }] }],
  }));
  return a;
}

describe('Il nome obbligatorio vale anche in modifica', () => {
  it('un fornitore non si può rinominare a vuoto', () => {
    const a = conAnagrafica();
    a.eval('editSupplierModal("s1")');
    a.el('es-name').value = '';
    a.eval('saveSupplier("s1")');
    assert.equal(a.eval('db.suppliers[0].name'), 'Rossi', 'il nome resta quello di prima');
  });

  it('un centro di lavoro nemmeno', () => {
    const a = conAnagrafica();
    a.eval('editWcModal("w1")');
    a.el('ew-name').value = '';
    a.eval('saveWc("w1")');
    assert.equal(a.eval('db.workCenters[0].name'), 'Tornitura');
  });

  it('una macrofamiglia svuotata non viene dichiarata «Aggiornata»', () => {
    const a = conAnagrafica();
    a.eval('editFamilyModal("f1")');
    a.el('ef-name').value = '';
    a.el('ef-sigla').value = 'MEC';
    a.eval('saveFamily("f1")');
    assert.equal(a.eval('getFamily("f1").name'), 'Meccanico');
    assert.equal(a.eval('!!panelTop()'), true, 'la scheda resta aperta: c-è ancora da correggere');
  });

  it('e nemmeno una sottofamiglia', () => {
    const a = conAnagrafica();
    a.eval('editSubFamilyModal("f1", "f1s1")');
    a.el('esf-name').value = '';
    a.eval('saveSubFamily("f1", "f1s1")');
    assert.equal(a.eval('getFamily("f1").subs[0].name'), 'Cuscinetti');
  });

  it('un nome valido passa, come sempre', () => {
    const a = conAnagrafica();
    a.eval('editSupplierModal("s1")');
    a.el('es-name').value = 'Rossi & Figli';
    a.eval('saveSupplier("s1")');
    assert.equal(a.eval('db.suppliers[0].name'), 'Rossi & Figli');
  });
});

describe('Unità di misura: kg e KG sono la stessa cosa', () => {
  it('non si aggiunge un doppione che differisce solo per le maiuscole', () => {
    const a = conAnagrafica();
    a.eval('db.settings.uoms = [{ code: "kg", name: "Chilogrammi" }]');
    a.el('uom-code').value = 'KG';
    a.el('uom-name').value = 'Chili';
    a.eval('addUom()');
    assert.equal(a.eval('uomList().length'), 1, 'due grafie della stessa unità dividerebbero le righe in due');
  });
});

// esc() non copriva l'apice singolo, e il codice scrive di continuo attributi
// come onclick="fn('${x}')". Oggi passano solo id generati, ma il contratto
// dell-helper deve reggere l-uso che se ne fa.
describe('esc — i caratteri che rompono un attributo', () => {
  const e = s => loadApp({ silent: true }).eval('esc(' + JSON.stringify(s) + ')');
  it('copre tutti e cinque i caratteri di HTML', () => {
    assert.equal(e('<b>'), '&lt;b&gt;');
    assert.equal(e('a & b'), 'a &amp; b');
    assert.equal(e('dice "ciao"'), 'dice &quot;ciao&quot;');
    assert.equal(e("L'albero"), 'L&#39;albero', 'l-apice chiude gli attributi scritti con gli apici singoli');
  });
  it('la e commerciale si converte per prima, o si scaperebbe da sola', () => {
    assert.equal(e('&lt;'), '&amp;lt;');
  });
});
