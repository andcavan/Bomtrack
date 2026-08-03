// Raggiungibile anche senza mouse.
//
// L'app è piena di righe e simboli cliccabili che il browser non considera
// pulsanti: un `<div onclick>` non entra nel giro del tabulatore e Invio non lo
// attiva, quindi chi non usa il mouse — per abitudine o perché non può — resta
// fuori da quella funzione senza che niente glielo dica. `codeLink` rispettava
// il patto giusto da sempre; questi test lo estendono a tutti gli altri.
//
// Il DOM finto della suite non ha `querySelectorAll`, quindi `a11yFields()` —
// che lavora sul documento vivo — qui si verifica solo per la sua guardia. Il
// resto è HTML, e l'HTML si legge.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, acq, asm, comp } = require('./fixtures.js');

function app(db) {
  const a = loadApp({ silent: true });
  a.setDb(db || makeDb({ items: [mat('m1', 10)] }));
  a.asRole('admin');
  return a;
}

describe('clickAttrs: il patto di un elemento cliccabile', () => {
  it('si dichiara pulsante ed entra nel giro del tabulatore', () => {
    const a = app();
    const h = a.eval(`clickAttrs("setView('mrp')")`);
    assert.match(h, /role="button"/);
    assert.match(h, /tabindex="0"/);
  });

  it('la stessa azione risponde al click, a Invio e alla barra spaziatrice', () => {
    const a = app();
    const h = a.eval(`clickAttrs("setView('mrp')")`);
    assert.match(h, /onclick="setView\('mrp'\)"/);
    assert.match(h, /onkeydown=.*Enter/);
    assert.match(h, /onkeydown=.*' '/);
    assert.match(h, /preventDefault/, 'senza, la barra spaziatrice fa scorrere la pagina');
  });

  it('l\'etichetta dice cosa fa, ed è escapata', () => {
    const a = app();
    const h = a.eval(`clickAttrs("apri()", 'Apri "ODA-1" & co.')`);
    assert.match(h, /aria-label="Apri &quot;ODA-1&quot; &amp; co\."/);
  });

  it('senza etichetta non si inventa un aria-label vuoto', () => {
    const a = app();
    assert.ok(!/aria-label/.test(a.eval(`clickAttrs("apri()")`)));
  });
});

describe('Le righe cliccabili delle viste rispettano il patto', () => {
  it('il riepilogo: ogni segnale è attivabile da tastiera', () => {
    const a = app(makeDb({ items: [mat('m1', 0)] }));   // articolo senza prezzo: un segnale c'è
    a.eval('renderHome()');
    const h = a.html('view-home');
    assert.match(h, /role="button"/);
    assert.match(h, /onkeydown=/);
    assert.match(h, /aria-label="[^"]*senza prezzo[^"]*"/, 'l\'etichetta dice il numero e dove porta');
  });

  it('l\'elenco commesse: si apre una commessa senza mouse', () => {
    const a = app(makeDb({ items: [], jobs: [{ id: 'j1', number: 'COM-1', customer: 'Rossi', status: 'aperta', active: true }] }));
    a.eval('renderJobs()');
    const h = a.html('view-jobs');
    assert.match(h, /role="button"/);
    assert.match(h, /aria-label="Apri la commessa COM-1"/);
  });

  it('l\'albero della distinta: espandere un nodo è un gesto da tastiera', () => {
    const a = app(makeDb({ items: [
      asm('mac', 'macchina', { components: [comp('g1', 1)] }),
      asm('g1', 'gruppo', { components: [comp('c1', 2)] }),
      acq('c1', 5),
    ] }));
    a.eval('currentBomId = "mac"; renderBom();');
    const h = a.html('bom-tree');
    assert.match(h, /class="bom-toggle" role="button"/);
    assert.match(h, /aria-expanded="false"/, 'e dice se il ramo è aperto o chiuso');
    assert.match(h, /aria-label="Espandi G1"/);
  });
});

describe('a11yFields non è mai un ostacolo', () => {
  it('un contenitore senza DOM interrogabile la lascia passare in silenzio', () => {
    // Vale per il DOM finto della suite e per qualunque render che la chiami
    // prima che l'elemento esista: non deve poter rompere un disegno.
    const a = app();
    assert.doesNotThrow(() => a.eval('a11yFields(null)'));
    assert.doesNotThrow(() => a.eval('a11yFields({})'));
  });

  it('le viste la attraversano senza lanciare', () => {
    const a = app(makeDb({ items: [mat('m1', 10)] }));
    assert.doesNotThrow(() => a.eval('renderHome(); renderJobs(); renderRfq(); renderOrders(); renderMrp();'));
  });
});
