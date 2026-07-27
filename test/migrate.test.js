// Migrazioni e normalizzazioni (store.js: loadDB / migrateDB / migrateV2).
// Girano a ogni caricamento su ogni PC dove l'app è stata copiata: se sbagliano,
// sbagliano su dati reali già esistenti.

const assert = require('node:assert/strict');
const { describe, it, approx } = require('./tap.js');
const { loadApp } = require('./harness.js');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Database in formato v1: id interi, nessuno schemaVersion, contatore nextId.
function legacyDb() {
  return {
    nextId: 99,
    suppliers: [{ id: 5, name: 'Fornitore Alfa', address: 'Via Roma 1' }],
    workCenters: [{ id: 1, name: 'Tornitura', hourlyRate: 50 }],
    families: [{ id: 7, name: 'Meccanico', subs: [{ id: 8, name: 'Cuscinetti' }] }],
    items: [
      { id: 10, code: 'M', name: 'Lamiera', type: 'materiale', uom: 'kg', unitCost: 10 },
      { id: 11, code: 'A', name: 'Cuscinetto', type: 'acquistato', uom: 'pz', purchasePrice: 20, supplierId: 5, familyId: 7, subFamilyId: 8 },
      { id: 12, code: 'G', name: 'Gruppo', type: 'gruppo', uom: 'pz',
        components: [{ itemId: 10, qty: 2 }, { itemId: 11, qty: 1 }],
        operations: [{ workCenterId: 1, hours: 1 }] },
    ],
    settings: { overheadPct: 0, marginPct: 0, currency: '€' },
  };
}

function caricato(blob) {
  const app = loadApp({ silent: true });
  app.seedStorage(blob);
  app.ref('Store').load();
  return app;
}

describe('migrateV2 — id legacy → UUID', () => {
  it('tutte le chiavi primarie diventano UUID e nextId sparisce', () => {
    const app = caricato(legacyDb());
    const db = app.snapshot();
    assert.equal(db.schemaVersion, 2);
    assert.equal(db.nextId, undefined);
    [].concat(db.suppliers, db.workCenters, db.items).forEach(r => {
      assert.match(String(r.id), UUID_RE, 'id non migrato: ' + r.id);
    });
    db.families.forEach(f => {
      assert.match(String(f.id), UUID_RE);
      (f.subs || []).forEach(s => assert.match(String(s.id), UUID_RE));
    });
  });

  it('tutti i riferimenti seguono le nuove chiavi', () => {
    const db = caricato(legacyDb()).snapshot();
    const byCode = c => db.items.find(i => i.code === c);
    const m = byCode('M'), a = byCode('A'), g = byCode('G');

    assert.equal(a.supplierId, db.suppliers[0].id, 'fornitore');
    const fam = db.families.find(f => f.name === 'Meccanico');
    assert.equal(a.familyId, fam.id, 'famiglia');
    assert.equal(a.subFamilyId, fam.subs[0].id, 'sottofamiglia');
    assert.equal(g.components[0].itemId, m.id, 'componente 1');
    assert.equal(g.components[1].itemId, a.id, 'componente 2');
    assert.equal(g.operations[0].workCenterId, db.workCenters[0].id, 'centro di lavoro');
  });

  it('il costo calcolato non cambia attraversando la migrazione', () => {
    const prima = loadApp({ silent: true });
    prima.setDb(Object.assign(legacyDb(), { schemaVersion: 2 }));   // stesso db, senza migrare gli id
    const atteso = prima.ref('costOf')(12);

    const dopo = caricato(legacyDb());
    const g = dopo.snapshot().items.find(i => i.code === 'G');
    const ottenuto = dopo.ref('costOf')(g.id);

    approx(ottenuto.total, atteso.total, 'totale');
    approx(ottenuto.total, 90, 'valore atteso a mano (20 materiale + 20 commerciale + 50 manodopera)');
    approx(ottenuto.material, atteso.material, 'materiale');
    approx(ottenuto.labor, atteso.labor, 'manodopera');
  });

  it('un db già in v2 non viene rimaneggiato', () => {
    const app = caricato(Object.assign(legacyDb(), { schemaVersion: 2 }));
    const g = app.snapshot().items.find(i => i.code === 'G');
    assert.equal(g.id, 12, 'gli id restano quelli salvati');
  });
});

describe('migrateDB — idempotenza e normalizzazioni', () => {
  it('eseguirla due volte non cambia nulla', () => {
    const app = caricato(legacyDb());
    const uno = JSON.stringify(app.snapshot());
    app.ref('migrateDB')();
    assert.equal(JSON.stringify(app.snapshot()), uno);
  });

  it('le famiglie seminate hanno subito kind e sigla (servono alla codifica)', () => {
    const db = caricato({ schemaVersion: 2, families: [{ id: 'f1', name: 'Meccanico' }] }).snapshot();
    db.families.forEach(f => {
      assert.ok(f.kind, 'famiglia senza kind: ' + f.name);
      assert.ok(f.sigla, 'famiglia senza sigla: ' + f.name);
      (f.subs || []).forEach(s => assert.ok(s.sigla, 'sottofamiglia senza sigla: ' + s.name));
    });
    assert.ok(db.families.some(f => f.kind === 'materiale'), 'seed materie prime mancante');
    assert.ok(db.families.some(f => f.kind === 'parte'), 'seed parti mancante');
  });

  it('db vuoto: tutte le collezioni esistono', () => {
    const db = caricato({}).snapshot();
    ['suppliers', 'rfqs', 'orders', 'workCenters', 'families', 'users', 'items'].forEach(k => {
      assert.ok(Array.isArray(db[k]), 'manca ' + k);
    });
    assert.ok(db.settings && typeof db.settings === 'object');
  });

  it('ruolo utente sconosciuto → lettore', () => {
    const db = caricato({ schemaVersion: 2, users: [{ id: 'u1', name: 'X', role: 'capo' }] }).snapshot();
    assert.equal(db.users[0].role, 'lettore');
    assert.equal(db.users[0].active, true);
    assert.equal(db.users[0].passwordHash, '');
  });

  it('vecchio tipo "prodotto" → macchina o gruppo', () => {
    const db = caricato({ schemaVersion: 2, items: [
      { id: 'p1', type: 'prodotto', isMachine: true },
      { id: 'p2', type: 'prodotto' },
    ] }).snapshot();
    assert.equal(db.items[0].type, 'macchina');
    assert.equal(db.items[0].isMachine, undefined);
    assert.equal(db.items[1].type, 'gruppo');
  });

  it('indirizzo in campo unico → indirizzo strutturato', () => {
    const db = caricato(legacyDb()).snapshot();
    const s = db.suppliers[0];
    assert.equal(s.street, 'Via Roma 1');
    assert.equal(s.address, undefined);
    assert.equal(s.zip, '');
  });

  it('U.M. incontrate nei dati entrano nell\'elenco gestito', () => {
    const db = caricato({ schemaVersion: 2, items: [{ id: 'x', type: 'materiale', uom: 'daN' }] }).snapshot();
    assert.ok(db.settings.uoms.some(u => u.code === 'daN'), 'daN non registrata');
  });

  it('costMode dedotto dai dati storici delle parti', () => {
    const db = caricato({ schemaVersion: 2, items: [
      { id: 'p1', type: 'parte', unitCost: 10 },
      { id: 'p2', type: 'parte', unitCost: 10, cycle: [{ kind: 'op', cost: 5 }] },
    ] }).snapshot();
    assert.equal(db.items[0].costMode, 'unit', 'senza ciclo resta il costo manuale');
    assert.equal(db.items[1].costMode, 'cycle', 'col ciclo il costo è derivato');
  });
});

describe('migrateDB — righe di lavorazione del ciclo (ore → costo fisso)', () => {
  it('ore x tariffa diventano un costo fisso e il valore non cambia', () => {
    const app = caricato({
      schemaVersion: 2,
      workCenters: [{ id: 'w1', name: 'Tornitura', hourlyRate: 50 }],
      items: [{ id: 'p', type: 'parte', costMode: 'cycle', cycle: [{ kind: 'op', workCenterId: 'w1', hours: 2 }] }],
    });
    const row = app.snapshot().items[0].cycle[0];
    assert.equal(row.cost, 100);
    assert.equal(row.hours, undefined);
    approx(app.ref('costOf')('p').total, 100);
  });

  it('un override già presente vince sul calcolo a ore', () => {
    const app = caricato({
      schemaVersion: 2,
      workCenters: [{ id: 'w1', name: 'Tornitura', hourlyRate: 50 }],
      items: [{ id: 'p', type: 'parte', costMode: 'cycle', cycle: [{ kind: 'op', workCenterId: 'w1', hours: 2, costOverride: 30 }] }],
    });
    const row = app.snapshot().items[0].cycle[0];
    assert.equal(row.cost, 30);
    assert.equal(row.costOverride, undefined);
  });

  it('una riga già convertita non viene ricalcolata', () => {
    const app = caricato({
      schemaVersion: 2,
      workCenters: [{ id: 'w1', name: 'Tornitura', hourlyRate: 50 }],
      items: [{ id: 'p', type: 'parte', costMode: 'cycle', cycle: [{ kind: 'op', workCenterId: 'w1', cost: 7 }] }],
    });
    assert.equal(app.snapshot().items[0].cycle[0].cost, 7);
  });
});

describe('loadDB — primo avvio e dati corrotti', () => {
  it('senza database salvato semina i dati di esempio e li persiste', () => {
    const app = loadApp({ silent: true });
    assert.equal(app.storage.getItem('bomtrack_v1'), null);
    app.ref('Store').load();
    assert.ok(app.storage.getItem('bomtrack_v1'), 'il seed non è stato scritto');
    const db = app.snapshot();
    assert.ok(db.items.some(i => i.type === 'macchina'), 'manca la macchina di esempio');
    assert.equal(db.users.length, 0, 'nessun utente predefinito: il setup lo chiede all\'avvio');
  });

  it('JSON corrotto: fallback sui dati di esempio, nessuna eccezione', () => {
    const app = loadApp({ silent: true });
    app.seedStorage('{ questo non e json');
    assert.doesNotThrow(() => app.ref('Store').load());
    assert.ok(app.snapshot().items.length > 0);
  });
});
