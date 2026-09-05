// Scelta delle colonne.
//
// Nascondere una colonna è una preferenza, non un dato: se si rompe non si
// perde niente di aziendale. Quello che si può rompere davvero è l'**identità
// della riga** — un elenco senza codice né nome non è più pulito, è illeggibile
// — e la **separazione fra viste**: Acquisti e Progetto disegnano le righe con
// la stessa funzione, e una scelta fatta in uno non deve svuotare l'altro.
// Il resto (che una preferenza salvata mesi fa continui a valere anche dopo che
// una colonna è stata tolta dal codice) è la solita igiene dei dati persistiti.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat } = require('./fixtures.js');

function app() {
  const a = loadApp({ silent: true });
  a.setDb(makeDb({ items: [mat('m1', 10)] }));
  a.asRole('admin');
  a.eval('colsHidden = {}');
  return a;
}

describe('Cosa si può nascondere', () => {
  it('codice e nome non si tolgono: sono l\'identità della riga', () => {
    const a = app();
    a.eval('colToggle("buy", "code")');
    a.eval('colToggle("buy", "name")');
    assert.equal(a.eval('JSON.stringify(colsHiddenOf("buy"))'), '[]',
      'un elenco in cui non si sa di cosa parla ogni riga non è un elenco più pulito');
  });

  it('una colonna che non esiste non entra nelle preferenze', () => {
    const a = app();
    a.eval('colToggle("buy", "inventata")');
    assert.equal(a.eval('JSON.stringify(colsHiddenOf("buy"))'), '[]');
  });

  it('togliere e rimettere è lo stesso gesto', () => {
    const a = app();
    a.eval('colToggle("buy", "meta")');
    assert.equal(a.eval('colIsHidden("buy", "meta")'), true);
    a.eval('colToggle("buy", "meta")');
    assert.equal(a.eval('colIsHidden("buy", "meta")'), false);
    assert.equal(a.eval('JSON.stringify(colsHidden)'), '{}',
      'niente di nascosto, niente da ricordare: la preferenza vuota non resta lì');
  });
});

describe('Ogni elenco tiene le sue scelte', () => {
  it('Acquisti e Progetto hanno le stesse colonne ma non la stessa scelta', () => {
    const a = app();
    a.eval('colToggle("buy", "family")');
    assert.equal(a.eval('colIsHidden("buy", "family")'), true);
    assert.equal(a.eval('colIsHidden("design", "family")'), false,
      'si guardano per motivi diversi: la scelta non si travasa');
  });

  it('la regola CSS colpisce solo la tabella di quella vista', () => {
    const a = app();
    a.eval('colToggle("buy", "family")');
    const css = String(a.eval('colsHideCss()'));
    assert.match(css, /#buy-table \.col-family\{display:none\}/);
    assert.doesNotMatch(css, /#des-table/);
    assert.doesNotMatch(css, /#stk-table/);
  });

  it('senza niente da nascondere non si scrive nessuna regola', () => {
    assert.equal(app().eval('colsHideCss()'), '');
  });

  it('più colonne nascoste stanno in una regola sola', () => {
    const a = app();
    a.eval('colToggle("stock", "safety")');
    a.eval('colToggle("stock", "lot")');
    const css = String(a.eval('colsHideCss()'));
    assert.match(css, /#stk-table \.col-safety,#stk-table \.col-lot\{display:none\}/);
  });
});

describe('Preferenze vecchie', () => {
  it('una colonna sparita dal codice non resta nascosta per sempre', () => {
    const a = app();
    a.eval('colsHidden = { buy: ["family", "colonna-di-una-volta"], vistaMorta: ["x"] }');
    a.eval('colsSanitize()');
    assert.equal(a.eval('JSON.stringify(colsHiddenOf("buy"))'), '["family"]',
      'si tiene ciò che esiste ancora e si scarta il resto');
    assert.equal(a.eval('!!colsHidden.vistaMorta'), false, 'una vista che non c\'è più non lascia residui');
  });

  it('una colonna diventata fissa torna visibile', () => {
    const a = app();
    a.eval('colsHidden = { buy: ["code"] }');
    a.eval('colsSanitize()');
    assert.equal(a.eval('colIsHidden("buy", "code")'), false);
  });
});

describe('La scheda per scegliere', () => {
  it('mostra accese le colonne visibili e spente quelle tolte', () => {
    const a = app();
    a.eval('colToggle("buy", "meta")');
    const h = String(a.eval('colsPickerBody("buy")'));
    assert.match(h, /checked[^>]*onchange="colToggle\('buy','uom'\)"/,
      'U.M. è visibile: la casella è accesa');
    assert.match(h, /<input type="checkbox"\s+onchange="colToggle\('buy','meta'\)"/,
      'Dettaglio è nascosta: la casella è spenta');
  });

  it('le colonne che non si possono togliere si vedono, spente e spiegate', () => {
    const h = String(app().eval('colsPickerBody("buy")'));
    assert.match(h, /col-pick-fissa/);
    assert.match(h, /non si può nascondere/, 'una casella disabilitata senza motivo è un dispetto');
  });

  it('il pulsante dice quante colonne mancano all\'elenco', () => {
    const a = app();
    assert.doesNotMatch(String(a.eval('colsButton("buy")')), /nascoste/);
    a.eval('colToggle("buy", "meta")');
    assert.match(String(a.eval('colsButton("buy")')), /1 nascosta/,
      'senza il conto, un elenco a cui manca una colonna sembra rotto');
  });
});
