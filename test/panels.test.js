// Pannelli: le schede non sono più modali, restano aperte sopra una pagina
// viva. Quello che deve reggere è la contabilità delle finestre: una sola per
// chiave (perché lo stato di una scheda vive in una variabile globale), chiavi
// diverse che convivono, e closeModal() che chiude quella davanti — è la
// chiamata che ogni salvataggio fa dopo aver scritto.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');

function conPannelli() {
  const app = loadApp({ silent: true });
  app.asRole('admin');
  return app;
}
function aperti(app) { return app.el('modal-root').children; }
function chiave(p) { return p.dataset.panelKey; }

describe('apertura e riuso', () => {
  it('una scheda apre un pannello', () => {
    const app = conPannelli();
    app.eval('openModal("<h3>Prova</h3>")');
    assert.equal(aperti(app).length, 1);
    assert.equal(chiave(aperti(app)[0]), 'form');
  });

  it('la stessa chiave riusa il pannello invece di duplicarlo', () => {
    const app = conPannelli();
    app.eval('openModal("<h3>A</h3>", true, "listino"); openModal("<h3>B</h3>", true, "listino");');
    assert.equal(aperti(app).length, 1, 'due listini affiancati leggerebbero lo stesso articolo');
    assert.ok(aperti(app)[0].innerHTML.includes('<h3>B</h3>'), 'il contenuto è quello nuovo');
  });

  it('chiavi diverse convivono: si consulta il listino con una distinta aperta', () => {
    const app = conPannelli();
    app.eval('openModal("<h3>Listino</h3>", true, "listino"); openModal("<h3>Dove è usato</h3>", true, "usage");');
    assert.deepEqual(Array.from(aperti(app)).map(chiave), ['listino', 'usage']);
  });

  it('ogni pannello porta la sua ✕', () => {
    const app = conPannelli();
    app.eval('openModal("<h3>Prova</h3>")');
    assert.ok(aperti(app)[0].innerHTML.includes('panel-x'));
  });
});

describe('chiusura', () => {
  it('closeModal chiude la scheda in primo piano, non le altre', () => {
    const app = conPannelli();
    app.eval('openModal("<h3>Listino</h3>", true, "listino"); openModal("<h3>Form</h3>");');
    app.eval('closeModal()');
    assert.deepEqual(Array.from(aperti(app)).map(chiave), ['listino'], 'resta quella dietro');
  });

  it('in primo piano è quella riportata davanti per ultima', () => {
    const app = conPannelli();
    app.eval('openModal("<h3>Listino</h3>", true, "listino"); openModal("<h3>Usage</h3>", true, "usage");');
    app.eval('panelRaise(panelRoot().children[0])');   // si clicca sul listino
    app.eval('closeModal()');
    assert.deepEqual(Array.from(aperti(app)).map(chiave), ['usage']);
  });

  it('closeModal senza pannelli aperti non esplode', () => {
    const app = conPannelli();
    app.eval('closeModal(); closeModal();');
    assert.equal(aperti(app).length, 0);
  });

  it('gli z-index non arrivano a coprire il toast', () => {
    const app = conPannelli();
    app.eval('openModal("<h3>A</h3>", true, "listino"); openModal("<h3>B</h3>", true, "usage");');
    app.eval('for (let i = 0; i < 900; i++) panelRaise(panelRoot().children[i % 2]);');
    const z = Array.from(aperti(app)).map(p => Number(p.style.zIndex));
    assert.ok(Math.max.apply(null, z) < 999, 'sopra 999 il toast sparirebbe dietro ai pannelli');
    assert.notEqual(z[0], z[1], 'l\'ordine tra i pannelli resta definito');
  });

  it('chiuse tutte, gli z-index ripartono da capo', () => {
    const app = conPannelli();
    app.eval('openModal("<h3>A</h3>"); closeModal();');
    app.eval('openModal("<h3>B</h3>")');
    assert.equal(Number(aperti(app)[0].style.zIndex), app.eval('PANEL_Z') + 1);
  });
});

describe('un form aperto non si perde per sbaglio', () => {
  it('aprirne un altro chiede conferma', () => {
    const app = conPannelli();
    let chiesto = 0;
    app.ctx.confirm = () => { chiesto++; return false; };
    app.eval('openModal("<h3>Primo</h3>")');
    app.eval('openModal("<h3>Secondo</h3>")');
    assert.equal(chiesto, 1);
    assert.ok(aperti(app)[0].innerHTML.includes('Primo'), 'rifiutando, il form aperto resta intatto');
  });

  it('le schede di consultazione non chiedono nulla', () => {
    const app = conPannelli();
    let chiesto = 0;
    app.ctx.confirm = () => { chiesto++; return true; };
    app.eval('openModal("<h3>A</h3>", true, "listino"); openModal("<h3>B</h3>", true, "listino");');
    assert.equal(chiesto, 0);
  });
});
