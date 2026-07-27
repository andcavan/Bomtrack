// Esito dei salvataggi su localStorage.
// Il caso che conta: lo spazio si esaurisce, l'app continua a mostrare i dati
// aggiornati, e alla chiusura della scheda tutto ciò che è stato fatto dopo
// sparisce. Deve essere impossibile non accorgersene.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat } = require('./fixtures.js');

// Registra le chiamate all'hook di segnalazione, al posto della modale.
function spia(app) {
  const eventi = [];
  app.ctx.__spia = e => eventi.push(e);
  app.eval('onPersistError = function (kind, info) { __spia({ tipo: "errore", kind, bytes: info && info.bytes }); };');
  app.eval('onPersistRecovered = function () { __spia({ tipo: "ripreso" }); };');
  return eventi;
}

describe('Store.commit — spazio esaurito', () => {
  it('segnala la quota, non lancia e ritorna false', () => {
    const app = loadApp({ silent: true, quotaBytes: 50 });
    const eventi = spia(app);
    app.setDb(makeDb({ items: [mat('m', 10)] }));

    let esito;
    assert.doesNotThrow(() => { esito = app.ref('Store').commit(); });
    assert.equal(esito, false, 'commit deve dire che non ha salvato');
    assert.equal(eventi.length, 1);
    assert.equal(eventi[0].kind, 'quota');
    assert.ok(eventi[0].bytes > 0, 'la dimensione del payload va riportata');
  });

  it('lo stato "non salvato" resta finché il salvataggio non riesce', () => {
    const app = loadApp({ silent: true, quotaBytes: 50 });
    spia(app);
    app.setDb(makeDb({ items: [mat('m', 10)] }));
    const S = app.ref('Store');

    assert.equal(S.isUnsaved(), false, 'si parte puliti');
    S.commit();
    assert.equal(S.isUnsaved(), true);
    S.commit();
    assert.equal(S.isUnsaved(), true, 'un secondo tentativo fallito non lo azzera');
  });

  it('al primo salvataggio riuscito lo stato si azzera e viene segnalato', () => {
    const app = loadApp({ silent: true, quotaBytes: 50 });
    const eventi = spia(app);
    app.setDb(makeDb({ items: [mat('m', 10)] }));
    const S = app.ref('Store');

    S.commit();
    assert.equal(S.isUnsaved(), true);
    app.storage.quotaBytes = Infinity;      // spazio liberato
    assert.equal(S.commit(), true);
    assert.equal(S.isUnsaved(), false);
    assert.deepEqual(eventi.map(e => e.tipo), ['errore', 'ripreso']);
  });

  it('un salvataggio riuscito senza errori precedenti non segnala nulla', () => {
    const app = loadApp({ silent: true });
    const eventi = spia(app);
    app.setDb(makeDb({ items: [mat('m', 10)] }));
    assert.equal(app.ref('Store').commit(), true);
    assert.equal(eventi.length, 0);
  });

  it('i dati restano intatti in memoria dopo un salvataggio fallito', () => {
    const app = loadApp({ silent: true, quotaBytes: 50 });
    spia(app);
    app.setDb(makeDb({ items: [mat('m', 10)] }));
    app.ref('Store').insert('items', { id: 'nuovo', type: 'acquistato', purchasePrice: 42 });
    assert.equal(app.snapshot().items.length, 2, 'la mutazione in memoria non va persa');
    assert.equal(app.ref('getItem')('nuovo').purchasePrice, 42);
  });
});

describe('Store.commit — altri motivi di fallimento', () => {
  it('storage non disponibile: motivo distinto dalla quota', () => {
    const app = loadApp({ silent: true });
    const eventi = spia(app);
    app.setDb(makeDb({ items: [] }));
    app.storage.setItem = () => { throw new Error('accesso negato'); };   // navigazione privata
    app.ref('Store').commit();
    assert.equal(eventi[0].kind, 'storage');
  });

  it('dati non serializzabili: motivo distinto e nessuna eccezione', () => {
    const app = loadApp({ silent: true });
    const eventi = spia(app);
    app.setDb(makeDb({ items: [] }));
    app.eval('db.items.push({ id: "x", type: "materiale" }); db.items[0].se = db.items[0];');  // riferimento circolare
    assert.doesNotThrow(() => app.ref('Store').commit());
    assert.equal(eventi[0].kind, 'serialize');
    assert.equal(app.ref('Store').isUnsaved(), true);
  });
});

describe('Store.sizeInfo', () => {
  it('riporta la dimensione di ciò che è salvato', () => {
    const app = loadApp({ silent: true });
    assert.equal(app.ref('Store').sizeInfo().bytes, 0, 'senza database salvato');
    app.ref('Store').load();
    const info = app.ref('Store').sizeInfo();
    assert.ok(info.bytes > 100, 'dopo il seed deve esserci qualcosa');
    assert.ok(info.mb > 0 && info.mb < 1);
  });
});
