// Righe locali ↔ righe del database: nomi delle colonne e tipi (D2).
//
// flattenDB() parla la lingua del codice — `unitCost`, `parentId`, `''` per
// vuoto. Il database parla SQL — `unit_cost`, `item_id`, NULL. Una riga che
// arriva con una colonna inesistente, o con `''` in una colonna numerica, fa
// fallire l'invio intero: qui si verifica che la traduzione lo impedisca, e
// che dica **prima** quali righe non entrerebbero.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, acq, parte, asm, comp, wc } = require('./fixtures.js');

function app(db) {
  const a = loadApp({ silent: true });
  if (db) a.setDb(db); else a.ref('Store').reset();
  return a;
}
const ev = (a, code) => JSON.parse(a.eval(`JSON.stringify(${code})`));
const errore = (a, code) => {
  try { a.eval(code); } catch (e) { return String(e.message); }
  return null;
};

// Un database che porta le forme di «vuoto» del modello locale: `''` in un
// prezzo, in una data, in un riferimento; null dove il codice scrive null.
function dbVuoti() {
  return makeDb({
    workCenters: [wc('w1', 40)],
    suppliers: [{ id: 's1', name: 'SKF', referente: '', email: '', active: true }],
    families: [{ id: 'f1', name: 'Acciaio', kind: 'materiale', sigla: 'ACC', subs: [{ id: 'sf1', name: 'Lamiere', sigla: 'LAM' }] }],
    items: [
      asm('g1', 'gruppo', { components: [comp('m1', 4)], operations: [{ workCenterId: 'w1', hours: 1, note: '' }] }),
      parte('p1', { cycle: [{ kind: 'item', itemId: 'm1', qty: 2, costOverride: null },
        { kind: 'op', workCenterId: 'w1', supplierId: null, costMode: 'fisso', cost: 12, hours: 1, days: 0, rate: 0, note: '' }] }),
      Object.assign(mat('m1', 5), { familyId: '', subFamilyId: '', groupItemId: '', machineItemId: '', notes: '',
        priceListSeeded: true, activePriceId: 'pr1',
        priceList: [{ id: 'pr1', supplierId: 's1', price: 5, minQty: '', leadDays: '', code: '', desc: 'Lamiera', date: '2026-01-02', rfqId: null, note: '' }] }),
      acq('c1', 3),
    ],
    rfqs: [{ id: 'r1', number: 'RFQ-2026-001', status: 'bozza', supplierId: 's1', jobId: null, planId: null, notes: '', active: true,
      lines: [{ id: 'rl1', itemId: 'm1', code: 'M1', description: '', uom: 'kg', qty: 10, price: '', deliveryDate: '', note: '', phaseKey: null, phaseKeys: null }] }],
    orders: [{ id: 'o1', number: 'ODA-2026-001', status: 'bozza', supplierId: 's1', active: true,
      lines: [{ id: 'ol1', itemId: 'c1', code: 'C1', qty: 5, price: 3, deliveryDate: '2026-03-01', confirmedDate: '', received: 2, note: '' }] }],
    reminders: [{ id: 'rm1', date: '2026-05-01', title: 'Sollecito', notes: '', gravita: 'media', done: false, jobId: '', active: true }],
    users: [{ id: 'u1', name: 'Anna', email: 'a@x.it', role: 'admin', active: true, passwordHash: 'abc', passwordSalt: 'def' }],
  });
}
// Nel modello locale un campo null e un campo assente dicono la stessa cosa,
// e al ritorno dal server i null spariscono: i confronti li ignorano.
function senzaNull(x) {
  if (Array.isArray(x)) return x.map(senzaNull);
  if (x && typeof x === 'object') {
    const o = {};
    Object.keys(x).forEach(k => { if (x[k] !== null) o[k] = senzaNull(x[k]); });
    return o;
  }
  return x;
}
const piatte = a => ev(a, 'flattenDB(db, { stripSecrets: true, stripDerived: true })');
const cloud = a => ev(a, 'dbVersoCloud(db, { uuid: false })');

describe('I nomi delle colonne sono quelli di SQL', () => {
  it('i dati di esempio dell\'app passano interi, id compresi', () => {
    const a = app();
    const t = ev(a, 'dbVersoCloud(db)');   // controllo degli uuid attivo
    Object.keys(t).forEach(tab => t[tab].forEach(r => Object.keys(r).forEach(k => {
      assert.match(k, /^[a-z][a-z0-9_]*$/, `${tab}.${k} non è un nome di colonna SQL`);
    })));
    assert.ok(t.items.length && t.item_components.length);
  });

  it('camelCase → snake_case, e ritorno, senza perdere nessun nome', () => {
    const a = app(dbVuoti());
    const nomi = new Set();
    const t = piatte(a);
    Object.keys(t).forEach(tab => t[tab].forEach(r => Object.keys(r).forEach(k => nomi.add(k))));
    nomi.forEach(k => assert.equal(a.eval(`snakeToCamel(camelToSnake(${JSON.stringify(k)}))`), k, k));
  });

  it('ogni riga figlia porta il padre col nome della sua tabella', () => {
    const t = cloud(app(dbVuoti()));
    assert.equal(t.item_prices[0].item_id, 'm1');
    assert.equal(t.sub_families[0].family_id, 'f1');
    assert.equal(t.rfq_lines[0].rfq_id, 'r1');
    assert.equal(t.order_lines[0].order_id, 'o1');
    assert.equal('parent_id' in t.order_lines[0], false);
  });

  it('in distinta e ciclo il figlio è child_item_id: item_id è già il padre', () => {
    const t = cloud(app(dbVuoti()));
    assert.deepEqual([t.item_components[0].item_id, t.item_components[0].child_item_id], ['g1', 'm1']);
    const r = t.item_cycle_rows.find(x => x.kind === 'item');
    assert.deepEqual([r.item_id, r.child_item_id], ['p1', 'm1']);
  });

  it('`desc` è una parola riservata: la quotazione la porta come description', () => {
    const q = cloud(app(dbVuoti())).item_prices[0];
    assert.equal(q.description, 'Lamiera');
    assert.equal('desc' in q, false);
  });

  it('ogni tabella figlia del registro ha la sua colonna padre dichiarata', () => {
    const a = app();
    const mancano = ev(a, `Object.values(SCHEMA).flatMap(d => Object.values(d.children || {}))
      .map(c => c.table).filter(t => !(CLOUD_TABLES[t] && CLOUD_TABLES[t].parent))`);
    assert.deepEqual(mancano, [], 'una tabella figlia aggiunta domani finirebbe con un parent_id generico');
  });
});

describe('Vuoto è NULL dove la colonna ha un tipo', () => {
  it('prezzo, quantità minima, data e riferimenti vuoti diventano NULL', () => {
    const t = cloud(app(dbVuoti()));
    const q = t.item_prices[0];
    assert.equal(q.min_qty, null);
    assert.equal(q.lead_days, null);
    const l = t.rfq_lines[0];
    assert.equal(l.price, null);
    assert.equal(l.delivery_date, null);
    const m = t.items.find(i => i.id === 'm1');
    assert.equal(m.family_id, null, 'una colonna uuid non accetta una stringa vuota');
    assert.equal(t.reminders[0].job_id, null);
  });

  it('nelle colonne di testo il vuoto resta vuoto', () => {
    const t = cloud(app(dbVuoti()));
    assert.equal(t.items.find(i => i.id === 'm1').notes, '');
    assert.equal(t.rfq_lines[0].description, '');
  });

  it('niente segreti, niente campi derivati, niente flag locali', () => {
    const t = cloud(app(dbVuoti()));
    assert.equal('password_hash' in t.profiles[0], false);
    assert.equal('received' in t.order_lines[0], false);
    assert.equal('price_list_seeded' in t.items.find(i => i.id === 'm1'), false);
  });

  it('al ritorno NULL torna `\'\'` dove il modello locale scrive `\'\'`, e sparisce altrove', () => {
    const a = app(dbVuoti());
    const prima = senzaNull(piatte(a));
    delete prima.items.find(i => i.id === 'm1').priceListSeeded;   // non ha colonna: si perde, ed è voluto
    const dopo = ev(a, 'righeLocali(righeCloud(flattenDB(db, { stripSecrets: true, stripDerived: true }), { uuid: false }))');
    assert.deepEqual(dopo, prima);
    assert.equal(dopo.rfq_lines[0].price, '', 'il prezzo non quotato torna vuoto, come lo scrive migrateDB');
  });

  it('gli istanti tornano nella forma di toISOString, anche se Postgres li scrive diversi', () => {
    const a = app();
    const r = ev(a, `righeLocali({ suppliers: [{ id: 'x', created_at: '2026-10-12T06:41:58.13+00:00', notes: null }] })`);
    assert.deepEqual(r.suppliers[0], { id: 'x', createdAt: '2026-10-12T06:41:58.130Z' });
  });

  it('dal database al documento locale, passando da nestDB', () => {
    const a = app();
    const atteso = senzaNull(ev(a, 'nestDB(flattenDB(db, { stripSecrets: true, stripDerived: true }))'));
    delete atteso.settings;
    const giro = ev(a, 'dbDaCloud(dbVersoCloud(db))');
    atteso.items.forEach(i => { delete i.priceListSeeded; });
    assert.deepEqual(giro, atteso);
  });
});

describe('Le righe che non entrerebbero si dicono prima, tutte', () => {
  it('un numero illeggibile, una data storta, un oggetto fuori posto', () => {
    const a = app(dbVuoti());
    a.eval('db.orders[0].lines[0].qty = "dieci"; db.rfqs[0].date = "01/02/2026"; db.suppliers[0].email = { x: 1 };');
    const msg = errore(a, 'dbVersoCloud(db, { uuid: false })');
    assert.ok(msg, 'deve fermarsi');
    assert.match(msg, /order_lines\/ol1: qty non è un numero/);
    assert.match(msg, /rfqs\/r1: date non è una data/);
    assert.match(msg, /suppliers\/s1: email è un oggetto/);
  });

  it('un numero scritto come testo passa, convertito', () => {
    const a = app(dbVuoti());
    a.eval('db.orders[0].lines[0].qty = "7"');
    assert.equal(cloud(a).order_lines[0].qty, 7);
  });

  it('un id che non è un uuid si ferma: è il difetto che la 0.80.1 ha riparato nelle famiglie', () => {
    const a = app(dbVuoti());
    assert.match(errore(a, 'dbVersoCloud(db)'), /non è un uuid/);
  });

  it('le chiavi costruite delle righe senza identità sono testo, e passano', () => {
    const a = app();
    assert.equal(errore(a, 'dbVersoCloud(db)'), null);
    assert.match(ev(a, 'dbVersoCloud(db)').item_components[0].id, /#components#0$/);
  });
});

describe('Riferimenti vuoti nel ciclo: uno solo', () => {
  it('al caricamento `\'\'` diventa null, come già scrivono le righe nuove', () => {
    const a = loadApp({ silent: true });
    a.seedStorage(makeDb({ items: [parte('p1', { cycle: [{ kind: 'op', workCenterId: '', supplierId: '', costMode: 'fisso', cost: 1 }] })] }));
    a.ref('Store').load();
    assert.deepEqual(ev(a, '[db.items[0].cycle[0].workCenterId, db.items[0].cycle[0].supplierId]'), [null, null]);
  });
});
