// Store: API repository, persistenza, snapshot, hashing password.
// È il punto in cui passerà l'adapter cloud: il contratto va tenuto fermo.

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat } = require('./fixtures.js');

function conDb(dbObj) {
  const app = loadApp({ silent: true });
  app.setDb(dbObj || makeDb({}));
  return app;
}

describe('Store — insert / update / remove', () => {
  it('insert assegna un id, marca i timestamp e persiste', () => {
    const app = conDb();
    const rec = app.ref('Store').insert('items', { code: 'X', type: 'materiale', unitCost: 5 });
    assert.ok(rec.id, 'id non assegnato');
    assert.ok(rec.createdAt && rec.updatedAt, 'timestamp mancanti');
    assert.equal(app.snapshot().items.length, 1);
    assert.ok(app.storage.getItem('bomtrack_v1'), 'non persistito');
  });

  it('insert rispetta un id fornito', () => {
    const app = conDb();
    app.ref('Store').insert('items', { id: 'mio-id', type: 'materiale' });
    assert.equal(app.snapshot().items[0].id, 'mio-id');
  });

  it('update applica la patch e aggiorna updatedAt', () => {
    const app = conDb(makeDb({ items: [Object.assign(mat('m', 10), { updatedAt: '2020-01-01T00:00:00.000Z' })] }));
    const rec = app.ref('Store').update('items', 'm', { unitCost: 99 });
    assert.equal(rec.unitCost, 99);
    assert.notEqual(app.snapshot().items[0].updatedAt, '2020-01-01T00:00:00.000Z');
  });

  it('update su id inesistente ritorna null senza toccare i dati', () => {
    const app = conDb(makeDb({ items: [mat('m', 10)] }));
    assert.equal(app.ref('Store').update('items', 'boh', { unitCost: 1 }), null);
    assert.equal(app.snapshot().items[0].unitCost, 10);
  });

  it('remove ritorna true se ha rimosso, false altrimenti', () => {
    const app = conDb(makeDb({ items: [mat('m', 10)] }));
    const S = app.ref('Store');
    assert.equal(S.remove('items', 'boh'), false);
    assert.equal(S.remove('items', 'm'), true);
    assert.equal(app.snapshot().items.length, 0);
  });

  it('getAll / getById leggono la collezione', () => {
    const app = conDb(makeDb({ items: [mat('m', 10)] }));
    const S = app.ref('Store');
    assert.equal(S.getAll('items').length, 1);
    assert.equal(S.getById('items', 'm').unitCost, 10);
    assert.equal(S.getById('items', 'boh'), undefined);
    assert.equal(S.getAll('collezione-inesistente').length, 0, 'una collezione ignota deve dare un array vuoto');
  });
});

describe('Store — autore delle modifiche', () => {
  it('setActor firma createdBy e updatedBy', () => {
    const app = conDb();
    const S = app.ref('Store');
    S.setActor('utente-1');
    const rec = S.insert('items', { type: 'materiale' });
    assert.equal(rec.createdBy, 'utente-1');
    assert.equal(rec.updatedBy, 'utente-1');

    S.setActor('utente-2');
    S.update('items', rec.id, { unitCost: 1 });
    const dopo = app.snapshot().items[0];
    assert.equal(dopo.createdBy, 'utente-1', 'il creatore non cambia');
    assert.equal(dopo.updatedBy, 'utente-2', 'l\'ultimo modificatore sì');
  });

  it('senza sessione i record non vengono firmati', () => {
    const app = conDb();
    const S = app.ref('Store');
    S.setActor(null);
    const rec = S.insert('items', { type: 'materiale' });
    assert.equal(rec.createdBy, undefined);
  });
});

describe('Store — snapshot (backup JSON)', () => {
  it('export e import fanno un giro completo senza perdite', () => {
    const app = conDb(makeDb({ items: [mat('m', 10)], settings: { overheadPct: 15 } }));
    const json = app.ref('Store').exportSnapshot();

    const altra = loadApp({ silent: true });
    altra.ref('Store').importSnapshot(json);
    const db = altra.snapshot();
    assert.equal(db.items.find(i => i.code === 'M').unitCost, 10);
    assert.equal(db.settings.overheadPct, 15);
  });

  it('import di un file non valido viene rifiutato', () => {
    const app = conDb(makeDb({ items: [mat('m', 10)] }));
    assert.throws(() => app.ref('Store').importSnapshot('{"cosa":"altro"}'), /articoli/);
    assert.equal(app.snapshot().items.length, 1, 'i dati esistenti restano');
  });

  // Il caso vero: un file troncato a metà (download interrotto, chiavetta
  // estratta) o il JSON di tutt'altro programma. Prima passava la guardia,
  // sostituiva il database e l'errore usciva molto dopo, in una vista a caso,
  // quando i dati veri erano già stati sovrascritti.
  it('un backup danneggiato non entra, e i dati esistenti restano', () => {
    const rifiutati = [
      ['null', null],
      ['un array invece di un oggetto', []],
      ['una stringa', 'ciao'],
      ['senza articoli', { suppliers: [] }],
      ['articoli non è un elenco', { items: {} }],
      ['fornitori troncati a metà', { items: [], suppliers: 'no' }],
      ['ordini troncati a metà', { items: [], orders: 3 }],
      ['impostazioni danneggiate', { items: [], settings: [] }],
      ['schema illeggibile', { items: [], schemaVersion: 'due' }],
    ];
    // L'eccezione nasce nel contesto vm: non è un'istanza dell'Error di Node,
    // quindi si verifica il messaggio, non il costruttore.
    rifiutati.forEach(([che, data]) => {
      const app = conDb(makeDb({ items: [mat('m', 10)] }));
      assert.throws(() => app.ref('Store').importSnapshot(data), /./, che);
      assert.equal(app.snapshot().items.length, 1, che + ': i dati esistenti devono restare');
    });
  });

  it('un file di una revisione più recente viene fermato, non degradato', () => {
    const app = conDb(makeDb({ items: [mat('m', 10)] }));
    const futuro = { items: [], schemaVersion: app.eval('SCHEMA_VERSION') + 1 };
    assert.throws(() => app.ref('Store').importSnapshot(futuro), /più recente/,
      'le migrazioni sanno salire, non scendere');
    assert.equal(app.snapshot().items.length, 1);
  });

  it('un backup vecchio senza le collezioni introdotte dopo resta importabile', () => {
    const app = conDb(makeDb({ items: [] }));
    assert.doesNotThrow(() => app.ref('Store').importSnapshot({ items: [{ id: 'x', code: 'X', name: 'X', type: 'materiale' }] }),
      'plans, users e orders mancano nei file vecchi: li ricostruisce migrateDB()');
    const db = app.snapshot();
    assert.ok(Array.isArray(db.plans) && Array.isArray(db.users) && Array.isArray(db.orders));
  });

  it('snapshotCounts dice cosa c\'è dentro prima di sovrascrivere', () => {
    const app = conDb(makeDb({ items: [] }));
    const n = app.eval(`snapshotCounts(${JSON.stringify({ items: [1, 2, 3], suppliers: [1], orders: 'rotto' })})`);
    assert.equal(n.items, 3);
    assert.equal(n.suppliers, 1);
    assert.equal(n.orders, 0, 'ciò che non è un elenco vale zero, non lancia');
    assert.equal(n.plans, 0);
  });

  it('import fa passare i dati dalle migrazioni', () => {
    const app = loadApp({ silent: true });
    app.ref('Store').importSnapshot(JSON.stringify({ items: [{ id: 1, type: 'prodotto', isMachine: true }] }));
    const it0 = app.snapshot().items[0];
    assert.equal(it0.type, 'macchina', 'tipo legacy non migrato');
    assert.match(String(it0.id), /^[0-9a-f-]{36}$/i, 'id legacy non migrato');
  });
});

describe('Store — reset e azzeramento', () => {
  it('reset ripristina i dati di esempio', () => {
    const app = conDb(makeDb({ items: [] }));
    app.ref('Store').reset();
    assert.ok(app.snapshot().items.some(i => i.type === 'macchina'));
  });

  it('clearAll svuota tutto ma non chiude fuori chi azzera', () => {
    const app = conDb(makeDb({ items: [mat('m', 10)] }));
    app.ref('Store').clearAll({ id: 'u1', name: 'Andrea', email: 'a@b.it', role: 'lettore', active: false });
    const db = app.snapshot();
    assert.equal(db.items.length, 0);
    assert.equal(db.families.length, 0, 'nessuna famiglia riseminata');
    assert.equal(db.settings.uoms.length, 0, 'nessuna U.M. riseminata');
    assert.equal(db.users.length, 1);
    assert.equal(db.users[0].role, 'admin', 'chi azzera resta amministratore');
    assert.equal(db.users[0].active, true);
  });

  it('clearAll senza utente lascia il database completamente vuoto', () => {
    const app = conDb(makeDb({ items: [mat('m', 10)] }));
    app.ref('Store').clearAll(null);
    assert.equal(app.snapshot().users.length, 0);
  });
});

describe('sha256Hex — implementazione a mano', () => {
  const casi = ['', 'a', 'password', 'Æ una stringa con accènti è simboli €', 'x'.repeat(200)];
  casi.forEach(s => {
    it('coincide con node:crypto per ' + JSON.stringify(s.length > 24 ? s.slice(0, 24) + '…' : s), () => {
      const atteso = crypto.createHash('sha256').update(s, 'utf8').digest('hex');
      assert.equal(loadApp({ silent: true }).ref('sha256Hex')(s), atteso);
    });
  });

  it('hashPassword dipende dal salt', () => {
    const app = loadApp({ silent: true });
    const h = app.ref('hashPassword');
    assert.notEqual(h('segreta', 'salt-a'), h('segreta', 'salt-b'));
    assert.equal(h('segreta', 'salt-a'), h('segreta', 'salt-a'), 'deve essere deterministico');
  });

  it('newSalt produce valori diversi', () => {
    const app = loadApp({ silent: true });
    const s = new Set();
    for (let i = 0; i < 50; i++) s.add(app.ref('newSalt')());
    assert.equal(s.size, 50);
  });
});
