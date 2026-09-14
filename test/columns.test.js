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
  a.eval('groupOff = {}');
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
    // La riga di #buy-table nasconde anche le colonne nuove, nascoste di
    // serie: qui interessa solo che "family" ci sia, nella tabella giusta.
    assert.match(css, /#buy-table \.col-family(,|\{)/);
    assert.doesNotMatch(css, /#des-table \.col-family/);
    assert.doesNotMatch(css, /#stk-table \.col-family/);
  });

  it('le colonne nuove nascono nascoste: senza toccare nulla il CSS non è vuoto', () => {
    // "Situazione attuale" per chi non apre mai il pannello: le colonne di
    // ieri restano tutte visibili, quelle di oggi restano tutte spente.
    const css = String(app().eval('colsHideCss()'));
    assert.match(css, /#buy-table \.col-subfamily/);
    assert.match(css, /#des-table \.col-concept/);
    assert.match(css, /#stk-table \.col-notes/);
    // Le colonne di ieri non sono in quella lista.
    assert.doesNotMatch(css, /#buy-table \.col-family/);
    assert.doesNotMatch(css, /#stk-table \.col-onhand/);
  });

  it('"Mostra tutte" azzera davvero il CSS, colonne nuove comprese', () => {
    const a = app();
    a.eval('colsResetView("buy")'); a.eval('colsResetView("design")'); a.eval('colsResetView("stock")');
    assert.equal(a.eval('colsHideCss()'), '');
  });

  it('più colonne nascoste stanno nella stessa regola', () => {
    const a = app();
    a.eval('colToggle("stock", "safety")');
    a.eval('colToggle("stock", "lot")');
    const css = String(a.eval('colsHideCss()'));
    const riga = css.split('\n').find(r => r.includes('#stk-table'));
    assert.match(riga, /#stk-table \.col-safety/);
    assert.match(riga, /#stk-table \.col-lot/);
  });
});

describe('Colonne nascoste di serie (defaultHidden)', () => {
  it('nascono spente, e si accendono con lo stesso gesto delle altre', () => {
    const a = app();
    assert.equal(a.eval('colIsHidden("buy", "notes")'), true, 'nessuno l\'ha mai accesa');
    a.eval('colToggle("buy", "notes")');
    assert.equal(a.eval('colIsHidden("buy", "notes")'), false, 'accesa: ora si vede');
    a.eval('colToggle("buy", "notes")');
    assert.equal(a.eval('colIsHidden("buy", "notes")'), true, 'spenta di nuovo: torna com\'era di serie');
  });

  it('Concetto e Approvvigionamento esistono solo in Progetto', () => {
    const a = app();
    assert.equal(a.eval('colIsHidden("design", "concept")'), true);
    a.eval('colToggle("buy", "concept")');   // Acquisti non ha questa colonna: no-op
    assert.equal(a.eval('JSON.stringify(colsHiddenOf("buy"))'), '[]',
      'una colonna che Acquisti non ha non può finire nelle sue preferenze');
  });
});

describe('Dividere l\'elenco per famiglia', () => {
  it('di serie è acceso, come oggi', () => {
    assert.equal(app().eval('isGrouped("buy")'), true);
  });

  it('si spegne, resta spento dopo il ridisegno, e si può riaccendere', () => {
    const a = app();
    a.eval('groupToggle("stock")');
    assert.equal(a.eval('isGrouped("stock")'), false);
    assert.equal(a.eval('isGrouped("buy")'), true, 'è una scelta per vista, non globale');
    a.eval('groupToggle("stock")');
    assert.equal(a.eval('isGrouped("stock")'), true);
  });

  it('spenta, itemGrid disegna una tabella sola', () => {
    const a = app();
    a.setDb(makeDb({ items: [mat('m1', 10), mat('m2', 20)] }));
    a.eval('groupOff = { buy: true }');
    a.eval('renderCatalog("buy")');
    const host = a.eval('document.getElementById("buy-table").innerHTML');
    assert.equal((String(host).match(/<table>/g) || []).length, 1,
      'senza divisione le righe stanno tutte nella stessa tabella');
    assert.doesNotMatch(String(host), /cat-group-title/);
  });

  it('accesa (di serie), itemGrid torna a dividere per gruppo', () => {
    const a = app();
    a.setDb(makeDb({ items: [mat('m1', 10), mat('m2', 20)] }));
    a.eval('renderCatalog("buy")');
    const host = a.eval('document.getElementById("buy-table").innerHTML');
    assert.match(String(host), /cat-group-title/);
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
    // Di serie mancano già le colonne nuove (nascoste finché non si accendono).
    const n0 = a.eval('colsHiddenCount("buy")');
    assert.match(String(a.eval('colsButton("buy")')), new RegExp(`${n0} nascoste`));
    a.eval('colToggle("buy", "meta")');
    assert.match(String(a.eval('colsButton("buy")')), new RegExp(`${n0 + 1} nascoste`),
      'senza il conto, un elenco a cui manca una colonna sembra rotto');
  });
});
