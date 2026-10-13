// Le righe figlie con identità propria, in vista del database condiviso.
//
// Righe di documento, quotazioni, sottofamiglie, fasi e materiali di un ODP,
// fornitori di un centro: si fondono **per riga**, e per farlo servono due
// cose che fino alla 0.80 mancavano — una data propria su ogni riga, e il
// conto delle righe sparite. Più due riparazioni che riguardano le chiavi:
// gli id delle famiglie seminate e la riscrittura dei riferimenti agli utenti.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb } = require('./fixtures.js');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VECCHIA = '2026-01-01T00:00:00.000Z';

function ordine(id, righe) {
  return { id, number: 1, title: '', status: 'bozza', supplierId: null, active: true,
    createdAt: VECCHIA, updatedAt: VECCHIA,
    lines: righe.map(r => Object.assign({ itemId: null, code: '', description: 'Riga', uom: 'pz',
      qty: 1, price: '', deliveryDate: '', received: 0, note: '', phaseKey: null, phaseKeys: null }, r)) };
}
// Caricato dall'archivio, come all'avvio dell'app: è il percorso che fa da
// riferimento per le impronte delle righe.
// Con la traccia delle righe accesa, come la vorrà un adattatore cloud: in
// locale è spenta (vedi il gruppo in fondo).
function caricato(db, traccia) {
  const a = loadApp({ silent: true });
  a.seedStorage(db);
  if (traccia !== false) a.eval('Store.modoCondiviso = true');
  a.ref('Store').load();
  a.asRole('admin');
  return a;
}
const pending = a => JSON.parse(a.eval('JSON.stringify(Store.pendingChanges())'));
const riga = (a, oid, lid) => JSON.parse(a.eval(`JSON.stringify(db.orders.find(o => o.id === ${JSON.stringify(oid)}).lines.find(l => l.id === ${JSON.stringify(lid)}))`));

describe('Ogni riga figlia ha la propria data', () => {
  it('al caricamento le righe storiche prendono la data del padre, e non risultano da mandare', () => {
    const a = caricato(makeDb({ orders: [ordine('o1', [{ id: 'l1' }, { id: 'l2' }])] }));
    assert.equal(riga(a, 'o1', 'l1').updatedAt, VECCHIA,
      'l\'adesso le farebbe vincere a torto su una modifica vera di un collega');
    assert.deepEqual(pending(a), {});
  });

  it('modificare una riga data **quella** riga, e non le altre', () => {
    const a = caricato(makeDb({ orders: [ordine('o1', [{ id: 'l1' }, { id: 'l2' }])] }));
    a.eval('db.orders[0].lines[0].qty = 7; saveDB();');
    assert.notEqual(riga(a, 'o1', 'l1').updatedAt, VECCHIA, 'la riga modificata ha una data nuova');
    assert.equal(riga(a, 'o1', 'l2').updatedAt, VECCHIA,
      'la riga intatta resta com\'era: è ciò che permette a due colleghi di lavorare su righe diverse');
    assert.deepEqual(pending(a).orders.upsert, ['o1']);
  });

  it('anche senza salvataggio: il conto guarda lo stato, non le chiamate', () => {
    const a = caricato(makeDb({ orders: [ordine('o1', [{ id: 'l1' }])] }));
    a.eval('db.orders[0].lines[0].note = "a mano";');
    assert.deepEqual(pending(a).orders.upsert, ['o1']);
  });

  it('una riga nuova nasce con la data di creazione e il suo autore', () => {
    const a = caricato(makeDb({ orders: [ordine('o1', [])] }));
    a.eval('Store.setActor("u9"); db.orders[0].lines.push({ id: "l9", qty: 1 }); saveDB();');
    const l = riga(a, 'o1', 'l9');
    assert.ok(l.createdAt && l.updatedAt);
    assert.equal(l.createdBy, 'u9');
  });

  it('datare una riga non la fa risultare modificata al giro dopo', () => {
    const a = caricato(makeDb({ orders: [ordine('o1', [{ id: 'l1' }])] }));
    a.eval('db.orders[0].lines[0].qty = 3; saveDB();');
    const prima = riga(a, 'o1', 'l1').updatedAt;
    a.eval('saveDB(); saveDB();');
    assert.equal(riga(a, 'o1', 'l1').updatedAt, prima);
  });

  it('rinominare un\'unità di misura fa risultare da mandare i documenti che la usano', () => {
    const a = caricato(makeDb({ orders: [ordine('o1', [{ id: 'l1', uom: 'pz' }]), ordine('o2', [{ id: 'l2', uom: 'kg' }])],
      settings: { uoms: [{ code: 'pz', name: 'Pezzi' }, { code: 'kg', name: '' }] } }));
    a.eval('renameUom("pz", "PZ"); saveDB();');
    assert.equal(riga(a, 'o1', 'l1').uom, 'PZ');
    assert.deepEqual(pending(a).orders.upsert, ['o1'],
      'fino alla 0.80 la rinomina toccava le righe senza datarle, e risultava «niente da mandare»');
  });
});

describe('Le righe figlie sparite si contano', () => {
  it('una riga tolta da un documento che resta compare in removeChildren', () => {
    const a = caricato(makeDb({ orders: [ordine('o1', [{ id: 'l1' }, { id: 'l2' }])] }));
    a.eval('db.orders[0].lines = db.orders[0].lines.filter(l => l.id !== "l1"); saveDB();');
    const p = pending(a);
    assert.deepEqual(p.orders.removeChildren, { lines: ['l1'] },
      'senza, il merge per riga non distingue «l\'ho tolta» da «non l\'ho mai vista»');
  });

  it('le righe di un documento eliminato le porta via il documento', () => {
    const a = caricato(makeDb({ orders: [ordine('o1', [{ id: 'l1' }])] }));
    a.eval('Store.remove("orders", "o1");');
    const p = pending(a);
    assert.deepEqual(p.orders.remove, ['o1']);
    assert.equal(p.orders.removeChildren, undefined);
  });

  it('dopo l\'invio la riga tolta non si conta più', () => {
    const a = caricato(makeDb({ orders: [ordine('o1', [{ id: 'l1' }, { id: 'l2' }])] }));
    a.eval('db.orders[0].lines.shift(); saveDB();');
    a.eval('const _t = Store.takeChanges(); Store.markSynced(_t.mark);');
    assert.deepEqual(pending(a), {});
  });

  it('una sottofamiglia eliminata pure, ed è il caso che non toccava la famiglia', () => {
    const a = caricato(makeDb({ families: [{ id: 'f1', name: 'Acciaio', kind: 'materiale', sigla: 'ACC',
      createdAt: VECCHIA, updatedAt: VECCHIA, subs: [{ id: 's1', name: 'Barre', sigla: 'BAR' }, { id: 's2', name: 'Tubi', sigla: 'TUB' }] }] }));
    a.eval('delSubFamily("f1", "s2"); confirmYes();');
    assert.deepEqual(pending(a).families.removeChildren, { subs: ['s2'] });
  });
});

describe('Fornitori di un centro di lavoro: dichiarati nello schema', () => {
  const conCentro = righe => makeDb({ suppliers: [{ id: 'sup1', name: 'Beta', active: true }],
    workCenters: [{ id: 'w1', name: 'Tornitura', hourlyRate: 40, active: true, createdAt: VECCHIA, updatedAt: VECCHIA, suppliers: righe }] });

  it('flattenDB li esplode in work_center_suppliers, e il giro completo regge', () => {
    const a = caricato(conCentro([{ id: 'r1', supplierId: 'sup1', rate: 55, note: '' }]));
    const t = JSON.parse(a.eval('JSON.stringify(flattenDB(db))'));
    assert.equal(t.work_center_suppliers.length, 1);
    assert.equal(t.work_center_suppliers[0].parentId, 'w1');
    assert.equal(t.work_centers[0].suppliers, undefined, 'non più un array dentro la riga del centro');
    const giro = JSON.parse(a.eval('JSON.stringify(nestDB(flattenDB(db)).workCenters)'));
    assert.deepEqual(giro, JSON.parse(a.eval('JSON.stringify(db.workCenters)')));
  });

  it('un centro senza fornitori resta senza il campo', () => {
    const a = caricato(makeDb({ workCenters: [{ id: 'w2', name: 'Montaggio', hourlyRate: 30, active: true }] }));
    const giro = JSON.parse(a.eval('JSON.stringify(nestDB(flattenDB(db)).workCenters[0])'));
    assert.equal('suppliers' in giro, false);
  });

  it('una riga senza id lo riceve al caricamento', () => {
    const a = caricato(conCentro([{ supplierId: 'sup1', rate: 55, note: '' }]));
    assert.match(a.eval('db.workCenters[0].suppliers[0].id'), UUID_RE);
  });

  it('la migrazione v1 riscrive anche il fornitore di queste righe', () => {
    const a = caricato({ suppliers: [{ id: 5, name: 'Beta' }],
      workCenters: [{ id: 1, name: 'Tornitura', hourlyRate: 40, suppliers: [{ id: 'r1', supplierId: 5, rate: 50 }] }],
      items: [], settings: {} });
    const sid = a.eval('db.suppliers[0].id');
    assert.match(sid, UUID_RE);
    assert.equal(a.eval('db.workCenters[0].suppliers[0].supplierId'), sid);
  });
});

describe('Famiglie seminate su un archivio già v2', () => {
  const v2SenzaSeed = extra => Object.assign({ schemaVersion: 2, items: [], families: [], settings: { overheadPct: 0 } }, extra || {});

  it('nascono con id UUID, famiglie e sottofamiglie', () => {
    const a = caricato(v2SenzaSeed());
    const non = JSON.parse(a.eval('JSON.stringify(db.families.flatMap(f => [f.id].concat((f.subs || []).map(s => s.id))).filter(id => !UUID_RE.test(id)))'));
    assert.deepEqual(non, [], 'fino alla 0.80 restavano «fm1», «fm1s1»…: in una colonna uuid il primo invio falliva');
  });

  it('chi li aveva già li ritrova riparati, con gli articoli che le citano', () => {
    const a = caricato(v2SenzaSeed({
      families: [{ id: 'fm1', name: 'Acciaio', kind: 'materiale', sigla: 'ACC', subs: [{ id: 'fm1s1', name: 'Lamiere', sigla: 'LAM' }] }],
      items: [{ id: 'm1', code: 'M1', name: 'Lamiera', type: 'materiale', uom: 'kg', familyId: 'fm1', subFamilyId: 'fm1s1', active: true }],
      settings: { overheadPct: 0, mpFamiliesSeeded: true, partFamiliesSeeded: true },
    }));
    const f = JSON.parse(a.eval('JSON.stringify(db.families[0])'));
    assert.match(f.id, UUID_RE);
    assert.match(f.subs[0].id, UUID_RE);
    assert.equal(a.eval('db.items[0].familyId'), f.id);
    assert.equal(a.eval('db.items[0].subFamilyId'), f.subs[0].id);
  });

  it('un «fm1» che non è la famiglia demo non si tocca', () => {
    const a = caricato(v2SenzaSeed({
      families: [{ id: 'fm1', name: 'Altro nome', kind: 'materiale', sigla: 'ALT', subs: [] }],
      settings: { overheadPct: 0, mpFamiliesSeeded: true, partFamiliesSeeded: true },
    }));
    assert.equal(a.eval('db.families[0].id'), 'fm1');
  });
});

describe('remapIds — i riferimenti agli utenti', () => {
  it('riscrive l\'utente e ogni campo di audit, anche sulle righe figlie e nel cestino', () => {
    const a = caricato(makeDb({
      users: [{ id: 'u-vecchio', name: 'Anna', role: 'admin' }],
      orders: [Object.assign(ordine('o1', [{ id: 'l1', createdBy: 'u-vecchio', updatedBy: 'u-vecchio' }]), { createdBy: 'u-vecchio', updatedBy: 'u-altro' })],
      trash: [{ id: 't1', coll: 'orders', deletedAt: new Date().toISOString(), deletedBy: 'u-vecchio', record: { id: 'x', createdBy: 'u-vecchio' } }],
    }));
    a.eval('remapIds({ user: { "u-vecchio": "auth-1" } })');
    const db = a.snapshot();
    assert.equal(db.users[0].id, 'auth-1');
    assert.equal(db.orders[0].createdBy, 'auth-1');
    assert.equal(db.orders[0].updatedBy, 'u-altro', 'un utente non nella mappa resta com\'era');
    assert.equal(db.orders[0].lines[0].createdBy, 'auth-1');
    assert.equal(db.trash[0].deletedBy, 'auth-1');
    assert.equal(db.trash[0].record.createdBy, 'u-vecchio', 'il contenuto del cestino è una fotografia e non si riscrive');
  });
});

describe('Una modifica fa sempre avanzare la data', () => {
  it('due touch nello stesso millisecondo danno due date diverse, in ordine', () => {
    const a = loadApp({ silent: true });
    const [d1, d2, d3] = JSON.parse(a.eval('(() => { const r = {}; touch(r); const x = r.updatedAt; touch(r); const y = r.updatedAt; touch(r); return JSON.stringify([x, y, r.updatedAt]); })()'));
    assert.ok(d1 < d2 && d2 < d3, `${d1} ${d2} ${d3}`);
  });

  it('anche su un record datato nel futuro da un orologio avanti', () => {
    const a = loadApp({ silent: true });
    const futuro = '2099-01-01T00:00:00.000Z';
    assert.equal(a.eval(`(() => { const r = { updatedAt: '${futuro}' }; touch(r); return r.updatedAt; })()`), '2099-01-01T00:00:00.001Z',
      'chi modifica un record ha visto quella versione: la sua deve vincere su di essa');
  });
});

describe('In locale la traccia delle righe è spenta, e non costa niente', () => {
  it('le righe storiche non si gonfiano di date al caricamento', () => {
    const a = caricato(makeDb({ orders: [ordine('o1', [{ id: 'l1' }])] }), false);
    a.eval('saveDB()');
    const l = riga(a, 'o1', 'l1');
    assert.equal(l.updatedAt, undefined, 'ogni data in più è spazio in un localStorage da ~5 MB');
    assert.equal(l.createdAt, undefined);
  });

  it('modificare una riga non la data: lo farà il backend, quando ci sarà', () => {
    const a = caricato(makeDb({ orders: [ordine('o1', [{ id: 'l1' }])] }), false);
    a.eval('db.orders[0].lines[0].qty = 9; saveDB();');
    assert.equal(riga(a, 'o1', 'l1').updatedAt, undefined);
  });

  it('accenderla dopo non perde niente: le righe prendono la data del documento', () => {
    const a = caricato(makeDb({ orders: [ordine('o1', [{ id: 'l1' }])] }), false);
    a.eval('Store.modoCondiviso = true; Store.markSynced();');
    assert.equal(riga(a, 'o1', 'l1').updatedAt, VECCHIA);
  });
});
