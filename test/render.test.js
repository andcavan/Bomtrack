// renderInto(): ridisegnare senza far perdere il posto.
//
// Quattro viste si erano scritte da sole la stessa toppa — «ridisegna solo la
// lista», «salta il menu se ha il focus», «conserva il valore del campo» —
// perché un innerHTML integrale butta via scroll, focus e punto di digitazione.
// Qui si fissa la regola una volta: cosa sopravvive al ridisegno e cosa no.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, asm, comp } = require('./fixtures.js');

function app(db) {
  const a = loadApp({ silent: true });
  a.setDb(db || makeDb({ items: [mat('m1', 10)] }));
  a.asRole('admin');
  return a;
}
// Mette `figlio` dentro `padre` nel DOM finto e gli dà il focus.
function focusIn(a, padreId, figlioId, tagName) {
  a.eval(`
    const p = document.getElementById(${JSON.stringify(padreId)});
    const f = document.getElementById(${JSON.stringify(figlioId)});
    f.tagName = ${JSON.stringify(tagName)};
    p.children.push(f);
    f.focus();
  `);
}

describe('renderInto: cosa sopravvive al ridisegno', () => {
  it('senza niente a fuoco ridisegna e basta', () => {
    const a = app();
    assert.equal(a.eval('renderInto("box", () => "<p>nuovo</p>")'), true);
    assert.equal(a.html('box'), '<p>nuovo</p>');
  });

  it('un menu a tendina a fuoco non si ridisegna: si aprirebbe sul vuoto', () => {
    const a = app();
    a.el('box').innerHTML = '<option>vecchio</option>';
    focusIn(a, 'box', 'box', 'SELECT');   // il contenitore stesso è il menu
    assert.equal(a.eval('renderInto("box", () => "<option>nuovo</option>")'), false);
    assert.equal(a.html('box'), '<option>vecchio</option>', 'il chiamante ridisegnerà al giro dopo');
  });

  it('un campo di testo a fuoco sopravvive: valore, focus e punto di digitazione', () => {
    const a = app();
    focusIn(a, 'box', 'campo', 'INPUT');
    a.eval('const c = document.getElementById("campo"); c.value = "acci"; c.setSelectionRange(4, 4);');
    assert.equal(a.eval('renderInto("box", () => "<input id=\\"campo\\">")'), true);
    assert.equal(a.el('campo').value, 'acci', 'quello che si stava scrivendo non si perde');
    assert.equal(a.eval('document.activeElement.id'), 'campo', 'e il cursore resta lì');
    assert.equal(a.el('campo').selectionStart, 4);
  });

  it('lo scroll resta dov\'era', () => {
    const a = app();
    a.el('box').scrollTop = 320;
    a.eval('renderInto("box", () => "<p>lungo</p>")');
    assert.equal(a.el('box').scrollTop, 320, 'una lista lunga non deve tornare in cima da sé');
  });

  it('il focus fuori dal contenitore non viene toccato', () => {
    const a = app();
    focusIn(a, 'altrove', 'campo', 'INPUT');
    assert.equal(a.eval('renderInto("box", () => "<p>x</p>")'), true);
    assert.equal(a.eval('document.activeElement.id'), 'campo');
  });
});

describe('Le viste che ridisegnavano a mano ora passano da qui', () => {
  it('la costificazione non rimescola il menu prodotti mentre lo si usa', () => {
    const a = app(makeDb({ items: [
      asm('mac', 'macchina', { components: [comp('m1', 1)] }),
      mat('m1', 10),
    ] }));
    a.eval('reportBomId = "mac"; currentBomId = "mac";');
    a.eval('renderReport()');
    assert.match(a.html('report-select'), /MAC/, 'a menu non a fuoco l\'elenco si popola');

    a.el('report-select').innerHTML = '<option>congelato</option>';
    focusIn(a, 'report-select', 'report-select', 'SELECT');
    a.eval('renderReport()');
    assert.equal(a.html('report-select'), '<option>congelato</option>');
  });

  it('filtrando i documenti si ridisegna la lista, non la barra dei filtri', () => {
    const a = app(makeDb({
      items: [],
      suppliers: [{ id: 's1', name: 'SKF', active: true }],
      rfqs: [
        { id: 'r1', number: 'RDO-1', title: 'cuscinetti', status: 'bozza', supplierId: 's1', lines: [], active: true },
        { id: 'r2', number: 'RDO-2', title: 'viteria', status: 'bozza', supplierId: 's1', lines: [], active: true },
      ],
    }));
    a.el('rfqf-q').value = 'viteria';
    a.eval('docFilterChange("rfq")');
    const html = a.html('rfq-list');
    assert.match(html, /RDO-2/);
    assert.ok(!/RDO-1/.test(html), 'il filtro ha davvero filtrato');
    assert.equal(a.el('rfqf-count').textContent, '1 di 2');
  });
});
