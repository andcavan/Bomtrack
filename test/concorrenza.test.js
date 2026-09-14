// Due schede aperte sulla stessa app.
//
// `Store.commit()` riscrive **tutta** la chiave con la fotografia che ha in
// memoria. Con due finestre aperte — normalissimo su un gestionale — la seconda
// che salva cancellava tutto ciò che la prima aveva fatto nel frattempo, senza
// un errore e senza un avviso: la setItem riesce, quindi nemmeno il badge
// «modifiche non salvate» si accendeva.
//
// Qui le due schede sono due `loadApp` che **condividono lo stesso
// localStorage**, che è esattamente il rapporto che hanno due schede del
// browser sullo stesso sito.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp, makeStorage } = require('./harness.js');
const { makeDb, mat } = require('./fixtures.js');

// Due schede sullo stesso archivio. `A` ha già salvato una volta, così le due
// partono allineate sulla stessa revisione — come due finestre aperte di fila.
function dueSchede(dbIniziale) {
  const storage = makeStorage();
  const A = loadApp({ silent: true, storage });
  A.setDb(dbIniziale || makeDb({ items: [mat('m1', 10)] }));
  A.ref('Store').commit();
  const B = loadApp({ silent: true, storage });
  B.ref('Store').load();
  return { storage, A, B };
}
// Registra l'avviso al posto della modale.
function spiaConflitto(app) {
  const eventi = [];
  app.ctx.__spiaC = () => eventi.push('conflitto');
  app.eval('onExternalChange = function () { __spiaC(); };');
  return eventi;
}

describe('Due schede sullo stesso archivio', () => {
  it('la seconda che salva non cancella il lavoro della prima', () => {
    const { storage, A, B } = dueSchede();
    spiaConflitto(B);

    // A aggiunge un articolo e salva.
    A.setDb(makeDb({ items: [mat('m1', 10), mat('m2', 20)] }));
    assert.equal(A.ref('Store').commit(), true, 'A salva normalmente');

    // B, che aveva caricato prima, prova a salvare la sua fotografia vecchia.
    B.setDb(makeDb({ items: [mat('m1', 10), mat('m3', 30)] }));
    assert.equal(B.ref('Store').commit(), false, 'B non deve sovrascrivere');

    // L'archivio contiene ancora quello che ha scritto A.
    const salvato = JSON.parse(storage.getItem(A.ref('DB_KEY')));
    const codici = salvato.items.map(i => i.code).sort();
    assert.deepEqual(codici, ['M1', 'M2'], 'il lavoro di A è ancora lì');
  });

  it('il conflitto viene annunciato, non taciuto', () => {
    const { A, B } = dueSchede();
    const avvisi = spiaConflitto(B);
    A.setDb(makeDb({ items: [mat('m1', 10), mat('m2', 20)] }));
    A.ref('Store').commit();

    B.ref('Store').commit();
    assert.deepEqual(avvisi, ['conflitto'], 'l\'utente deve saperlo');
  });

  it('dopo un conflitto la scheda si sa in stato non salvato', () => {
    const { A, B } = dueSchede();
    spiaConflitto(B);
    assert.equal(B.ref('Store').isUnsaved(), false, 'si parte puliti');
    A.setDb(makeDb({ items: [mat('m1', 10), mat('m2', 20)] }));
    A.ref('Store').commit();

    B.ref('Store').commit();
    assert.equal(B.ref('Store').isUnsaved(), true,
      'il badge «modifiche non salvate» deve accendersi: è lavoro solo in memoria');
  });

  it('chi sceglie di tenere la propria versione la salva davvero', () => {
    const { storage, A, B } = dueSchede();
    spiaConflitto(B);
    A.setDb(makeDb({ items: [mat('m1', 10), mat('m2', 20)] }));
    A.ref('Store').commit();
    B.setDb(makeDb({ items: [mat('m1', 10), mat('m3', 30)] }));
    B.ref('Store').commit();   // rifiutato

    B.ref('Store').forzaProssimaScrittura();
    assert.equal(B.ref('Store').commit(), true, 'la forzatura deve passare');
    const salvato = JSON.parse(storage.getItem(A.ref('DB_KEY')));
    assert.deepEqual(salvato.items.map(i => i.code).sort(), ['M1', 'M3'],
      'vince la versione di B, come l\'utente ha chiesto');
  });

  it('la forzatura vale una volta sola', () => {
    const { A, B } = dueSchede();
    spiaConflitto(B);
    B.ref('Store').forzaProssimaScrittura();
    B.ref('Store').commit();          // consuma la forzatura

    A.ref('Store').load();            // A si riallinea
    A.setDb(makeDb({ items: [mat('m1', 10), mat('zz', 99)] }));
    A.ref('Store').commit();          // A scrive: B è di nuovo indietro

    assert.equal(B.ref('Store').commit(), false,
      'un permesso dato su un conflitto non vale per quelli successivi');
  });

  it('una scheda sola salva quante volte vuole, senza mai confliggere', () => {
    const storage = makeStorage();
    const A = loadApp({ silent: true, storage });
    A.setDb(makeDb({ items: [mat('m1', 10)] }));
    for (let i = 0; i < 5; i++) {
      assert.equal(A.ref('Store').commit(), true, 'salvataggio ' + (i + 1));
    }
  });

  it('la revisione non si muove se la scrittura fallisce', () => {
    const storage = makeStorage(60);   // quota strettissima
    const A = loadApp({ silent: true, storage });
    A.eval('onPersistError = function () {};');
    A.setDb(makeDb({ items: [mat('m1', 10)] }));
    const prima = A.ref('Store').revisione();
    assert.equal(A.ref('Store').commit(), false, 'la quota impedisce il salvataggio');
    assert.equal(A.ref('Store').revisione(), prima,
      'senza scrittura la revisione resta ferma: le altre schede non devono vedere un conflitto mai avvenuto');
  });
});
