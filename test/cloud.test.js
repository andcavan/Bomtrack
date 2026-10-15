// L'archivio condiviso (cloud.js): invio, ricezione, primo collegamento.
//
// Due parti. La prima prova le due traduzioni — dal conto delle modifiche al
// lotto di push_changes(), e dalla risposta di pull_changes() all'archivio
// locale — senza rete né server. La seconda fa lavorare più PC veri (l'app
// intera, ciascuno con il suo localStorage) contro il Supabase finto di
// test/supabase-finto.js, che dietro ha Postgres con supabase/schema.sql: le
// stesse funzioni, le stesse policy e gli stessi trigger della produzione.
// Gira dove c'è un Postgres (BOMTRACK_PG, vedi test/pg.js).

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp, makeStorage } = require('./harness.js');
const { makeDb, dbCloudCompleto, U } = require('./fixtures.js');
const pg = require('./pg.js');

const ev = (a, code) => JSON.parse(a.eval(`JSON.stringify(${code})`));
// Un'app in modo condiviso con il suo archivio già caricato, e la fotografia
// presa: quello che c'è adesso è «già inviato».
function appCondivisa(db) {
  const storage = makeStorage();
  storage.setItem('bomtrack_cloud', JSON.stringify({ url: 'http://x', chiave: 'k', allineato: true }));
  const a = loadApp({ silent: true, storage });
  a.seedStorage(db);
  a.eval('Store.load(); Store.markSynced();');
  return a;
}
const ID = { item: U(7), pr1: U(12), pr2: U(13), ord: U(17), ol1: U(18), rc1: U(30), rem: U(35), fam: U(4), sub: U(5) };

describe('Archivio condiviso — il lotto da inviare', () => {
  it('un articolo cambiato viaggia da solo, con la sua posizione', () => {
    const a = appCondivisa(dbCloudCompleto());
    a.eval(`Store.update('items', '${ID.item}', { name: 'Barra tonda' })`);
    const p = ev(a, `cloudPayload(Store.pendingChanges(), new Date(Date.now() - 60000).toISOString(), true).payload`);
    assert.deepEqual(Object.keys(p.upsert).sort(), ['items']);
    assert.equal(p.upsert.items.length, 1);
    assert.equal(p.upsert.items[0].name, 'Barra tonda');
    assert.equal(p.upsert.items[0].pos, 0, 'la posizione nella collezione intera');
    assert.equal(p.remove, undefined);
  });

  it('di un padre già noto partono solo le righe cambiate', () => {
    const a = appCondivisa(dbCloudCompleto());
    a.eval(`{ const it = Store.getById('items', '${ID.item}'); it.priceList.find(p => p.id === '${ID.pr2}').price = 5.1; saveDB(); }`);
    const p = ev(a, `cloudPayload(Store.pendingChanges(), new Date(Date.now() - 60000).toISOString(), true).payload`);
    assert.deepEqual(p.upsert.item_prices.map(r => r.id), [ID.pr2], 'la quotazione non toccata resta a casa');
  });

  it('un padre nuovo manda tutte le sue righe', () => {
    const a = appCondivisa(dbCloudCompleto());
    a.eval(`{ const o = JSON.parse(JSON.stringify(Store.getById('orders', '${ID.ord}')));
      o.id = '${U(600)}'; o.number = 'ODA-2026-002'; o.lines[0].id = '${U(601)}'; o.lines[0].updatedAt = '2020-01-01T00:00:00.000Z';
      db.orders.push(o); saveDB(); }`);
    const p = ev(a, `cloudPayload(Store.pendingChanges(), new Date().toISOString(), true).payload`);
    assert.deepEqual(p.upsert.order_lines.map(r => r.id), [U(601)], 'anche con una data vecchia: il server non l\'ha mai vista');
  });

  it('le righe tolte e i record eliminati diventano cancellazioni', () => {
    const a = appCondivisa(dbCloudCompleto());
    a.eval(`{ const pl = Store.getById('items', '${ID.item}').priceList; pl.splice(pl.findIndex(p => p.id === '${ID.pr2}'), 1); saveDB(); } Store.remove('reminders', '${ID.rem}');`);
    const p = ev(a, `cloudPayload(Store.pendingChanges(), null, true).payload`);
    assert.deepEqual(p.remove.item_prices, [ID.pr2]);
    assert.deepEqual(p.remove.reminders, [ID.rem]);
    assert.ok(p.upsert.trash, 'il cestino viaggia: è la rete sotto le eliminazioni di tutti');
  });

  it('le impostazioni partono solo con la gestione', () => {
    const a = appCondivisa(dbCloudCompleto());
    a.eval(`db.settings.currency = 'CHF'; saveDB();`);
    const si = ev(a, `cloudPayload(Store.pendingChanges(), null, true)`);
    assert.equal(si.payload.settings.data.currency, 'CHF');
    const no = ev(a, `cloudPayload(Store.pendingChanges(), null, false)`);
    assert.equal(no.payload.settings, undefined);
    assert.equal(no.impostazioniTenute, true);
  });

  it('la fotografia salvata tiene in coda una modifica anche dopo un riavvio', () => {
    const a = appCondivisa(dbCloudCompleto());
    a.eval('cloudSalvaBase()');
    a.eval(`Store.update('items', '${ID.item}', { name: 'Modificato offline' })`);
    // Riavvio: stesso archivio, app nuova. Il caricamento rifotografa l'adesso;
    // cloudAvvio() rimette la fotografia dell'ultimo invio.
    const b = loadApp({ silent: true, storage: a.storage });
    b.eval('Store.load()');
    assert.equal(b.eval('Store.hasPendingChanges()'), false, 'senza la fotografia la modifica sarebbe persa');
    b.eval('cloudAvvio()');
    assert.deepEqual(ev(b, 'Store.pendingChanges()').items.upsert, [ID.item]);
  });
});

describe('Archivio condiviso — quello che arriva', () => {
  const risposta = t => ({ now: '2026-05-01T00:00:00Z', tables: t.tables || {}, removed: t.removed || {}, settings: t.settings || null });
  it('un record cambiato si sostituisce e tiene le sue righe', () => {
    const a = appCondivisa(dbCloudCompleto());
    const riga = ev(a, `dbVersoCloud({ items: [Store.getById('items', '${ID.item}')] }).items[0]`);
    riga.name = 'Dal collega'; riga.updated_at = '2026-05-01T00:00:00.000Z';
    a.eval(`cloudApplica(db, ${JSON.stringify(risposta({ tables: { items: [riga] } }))})`);
    const it = ev(a, `Store.getById('items', '${ID.item}')`);
    assert.equal(it.name, 'Dal collega');
    assert.equal(it.priceList.length, 2, 'le quotazioni arrivano dalla loro tabella: quelle locali restano');
  });

  it('una riga per riga si fonde, una distinta si rifà', () => {
    const a = appCondivisa(dbCloudCompleto());
    const g1 = U(10);
    const righe = ev(a, `dbVersoCloud({ items: [Store.getById('items', '${g1}')] })`);
    righe.item_components = [righe.item_components[0]];   // il collega ha tolto un componente
    const prezzo = ev(a, `dbVersoCloud({ items: [Store.getById('items', '${ID.item}')] }).item_prices[0]`);
    prezzo.price = 9.9;
    a.eval(`cloudApplica(db, ${JSON.stringify(risposta({ tables: { items: righe.items, item_components: righe.item_components, item_prices: [prezzo] } }))})`);
    assert.equal(ev(a, `Store.getById('items', '${g1}').components.length`), 1);
    const pl = ev(a, `Store.getById('items', '${ID.item}').priceList`);
    assert.deepEqual(pl.map(p => p.price), [9.9, 4.8], 'cambia solo la riga arrivata, al suo posto');
  });

  it('le lapidi tolgono record e righe', () => {
    const a = appCondivisa(dbCloudCompleto());
    a.eval(`cloudApplica(db, ${JSON.stringify(risposta({ removed: { reminders: [ID.rem], item_prices: [ID.pr2] } }))})`);
    assert.equal(ev(a, 'db.reminders.length'), 0);
    assert.equal(ev(a, `Store.getById('items', '${ID.item}').priceList.length`), 1);
  });

  it('un ricevimento nuovo rifà il ricevuto della riga', () => {
    const a = appCondivisa(dbCloudCompleto());
    a.eval(`Store.applicaRemoto(d => cloudApplica(d, ${JSON.stringify(risposta({ tables: { order_receipts: [
      { id: U(700), coll: 'orders', order_id: ID.ord, line_id: ID.ol1, qty: 15, kind: 'ricevimento', date: '2026-05-01', note: '', updated_at: '2026-05-01T00:00:00.000Z' }] } }))}))`);
    assert.equal(ev(a, `Store.getById('orders', '${ID.ord}').lines[0].received`), 55);
    assert.equal(ev(a, 'Store.hasPendingChanges()'), false, 'quello che arriva non torna indietro');
  });
});

// ═══════════════════════════════════════════════════════════
//  Più PC, un server
// ═══════════════════════════════════════════════════════════
describe('Archivio condiviso — più PC contro Supabase (finto, con Postgres vero)', () => {
  if (!pg.disponibile()) {
    it('saltato: BOMTRACK_PG non impostata (vedi test/pg.js)', () => {});
    return;
  }
  const { avviaSupabaseFinto } = require('./supabase-finto.js');
  // I passi dipendono l'uno dall'altro: girano in fila.
  let fila = Promise.resolve();
  const passo = (nome, fn) => it(nome, () => { const p = fila.then(fn); fila = p.catch(() => {}); return p; });

  let srv, A, B, C, anna, bruno, dario;
  const pc = (storage) => {
    const st = storage || makeStorage();
    if (!storage) st.setItem('bomtrack_cloud', JSON.stringify({ url: srv.url, chiave: srv.chiave, allineato: false }));
    const a = loadApp({ silent: true, storage: st });
    a.ctx.fetch = fetch;
    return a;
  };
  const entra = (a, id) => a.eval(`currentUser = getUser('${id}'); Store.setActor(currentUser.id);`);
  const giro = a => a.eval('cloudGiro()');

  passo('il primo utente creato su Supabase è l\'amministratore, gli altri nascono sospesi', async () => {
    srv = await avviaSupabaseFinto();
    anna = srv.crea('a@x.it', 'pw-anna', 'Anna');
    bruno = srv.crea('b@x.it', 'pw-bruno', 'Bruno');
    assert.equal(srv.db.sql(`select role || ' ' || active from profiles where id = '${anna}'`), 'admin true');
    assert.equal(srv.db.sql(`select role || ' ' || active from profiles where id = '${bruno}'`), 'lettore false');
  });

  passo('l\'amministratore carica l\'archivio del suo PC; gli utenti passano per email', async () => {
    const db = dbCloudCompleto();
    db.users.push({ id: U(801), name: 'Bruno', email: 'B@x.it', role: 'acquisti', active: true, createdAt: '2026-03-01T08:00:00.000Z', updatedAt: '2026-03-01T08:00:00.000Z' });
    db.users.push({ id: U(802), name: 'Carlo', email: 'c@x.it', role: 'lettore', active: true, createdAt: '2026-03-01T08:00:00.000Z', updatedAt: '2026-03-01T08:00:00.000Z' });
    const st = makeStorage();
    st.setItem('bomtrack_cloud', JSON.stringify({ url: srv.url, chiave: srv.chiave, allineato: false }));
    A = loadApp({ silent: true, storage: st });
    A.ctx.fetch = fetch;
    A.seedStorage(db);
    A.eval('Store.load(); cloudAvvio();');
    assert.equal(A.eval('Store.modoCondiviso'), true);
    const esito = await A.eval(`cloudAccediConPassword('a@x.it', 'pw-anna').then(() => cloudDopoAccesso())`);
    assert.equal(esito.primo, true);
    assert.equal(esito.stato.vuoto, true);
    const r = JSON.parse(JSON.stringify(await A.eval(`cloudCaricaArchivio(${JSON.stringify(esito.stato)})`)));
    assert.deepEqual(r.fuori.map(u => u.name), ['Carlo'], 'chi non ha un utente su Supabase resta fuori, e lo si dice');
    entra(A, anna);
    assert.equal(srv.db.sql('select count(*) from items'), '5');
    assert.equal(srv.db.sql(`select role || ' ' || active from profiles where id = '${bruno}'`), 'acquisti true', 'ruolo e stato dal PC che carica');
    assert.equal(srv.db.sql(`select created_by from items where code = 'MAT-ACC-BAR-001'`), '', 'nessun autore registrato nella fixture');
    assert.equal(A.eval(`Store.getAll('users').map(u => u.id).sort().join()`), [anna, bruno].sort().join(), 'gli id sono quelli di Supabase');
    assert.equal(A.eval('Store.hasPendingChanges()'), false);
    assert.equal(JSON.parse(A.storage.getItem('bomtrack_cloud')).allineato, true);
  });

  passo('un collega scarica l\'archivio condiviso al primo accesso', async () => {
    B = pc();
    B.eval('Store.load(); cloudAvvio();');
    const esito = await B.eval(`cloudAccediConPassword('b@x.it', 'pw-bruno').then(() => cloudDopoAccesso())`);
    assert.equal(esito.primo, true);
    assert.equal(esito.stato.vuoto, false);
    await B.eval('cloudScaricaArchivio()');
    entra(B, bruno);
    assert.equal(B.eval('db.items.length'), 5);
    assert.equal(B.eval(`Store.getById('orders', '${ID.ord}').lines[0].received`), 40, 'il ricevuto torna dagli eventi');
    assert.equal(B.eval('Store.hasPendingChanges()'), false, 'scaricare non crea niente da rimandare');
    assert.equal(B.eval(`currentUser.role`), 'acquisti');
  });

  passo('una modifica parte da sola e arriva all\'altro PC al giro', async () => {
    A.eval(`Store.update('items', '${ID.item}', { name: 'Barra tonda' })`);
    assert.equal(await giro(A), true);
    assert.equal(srv.db.sql(`select name from items where id = '${ID.item}'`), 'Barra tonda');
    assert.equal(await giro(B), true);
    assert.equal(B.eval(`Store.getById('items', '${ID.item}').name`), 'Barra tonda');
    assert.equal(B.eval('Store.hasPendingChanges()'), false);
  });

  passo('anche nell\'altro verso, con le righe del documento', async () => {
    B.eval(`{ const o = Store.getById('orders', '${ID.ord}'); o.title = 'Urgente'; o.lines[0].qty = 120; touch(o); saveDB(); }`);
    await giro(B);
    await giro(A);
    const o = ev(A, `Store.getById('orders', '${ID.ord}')`);
    assert.equal(o.title, 'Urgente');
    assert.equal(o.lines[0].qty, 120);
  });

  passo('due quotazioni sullo stesso articolo, da due PC, convivono', async () => {
    A.eval(`{ const it = Store.getById('items', '${ID.item}'); it.priceList.push({ id: '${U(901)}', supplierId: null, price: 4.2, minQty: '', leadDays: '', code: '', desc: 'da A', date: '2026-05-01', rfqId: null, note: '' }); saveDB(); }`);
    // Bruno è dell'ufficio acquisti: non scrive i listini. Scrive la terza,
    // Dario, che arriva adesso.
    dario = srv.crea('d@x.it', 'pw-dario', 'Dario');
    await giro(A);   // porta anche il profilo di Dario, ancora sospeso
    A.eval(`{ const u = getUser('${dario}'); u.role = 'progettazione'; u.active = true; touch(u); saveDB(); }`);
    await giro(A);
    assert.equal(srv.db.sql(`select role || ' ' || active from profiles where id = '${dario}'`), 'progettazione true');
    C = pc();
    C.eval('Store.load(); cloudAvvio();');
    await C.eval(`cloudAccediConPassword('d@x.it', 'pw-dario').then(() => cloudScaricaArchivio())`);
    entra(C, dario);
    C.eval(`{ const it = Store.getById('items', '${ID.item}'); it.priceList.push({ id: '${U(902)}', supplierId: null, price: 4.1, minQty: '', leadDays: '', code: '', desc: 'da C', date: '2026-05-01', rfqId: null, note: '' }); saveDB(); }`);
    await giro(C);
    await giro(A);
    const descr = ev(A, `Store.getById('items', '${ID.item}').priceList.map(p => p.desc)`);
    assert.ok(descr.includes('da A') && descr.includes('da C'), JSON.stringify(descr));
  });

  passo('chi salva per secondo una versione più vecchia la perde, e riceve quella che ha vinto', async () => {
    // A scrive prima, B dopo; A però manda per secondo.
    const tA = new Date(Date.now() + 1000).toISOString(), tB = new Date(Date.now() + 2000).toISOString();
    A.eval(`{ const o = Store.getById('orders', '${ID.ord}'); o.notes = 'nota di A'; o.updatedAt = '${tA}'; saveDB(); }`);
    B.eval(`{ const o = Store.getById('orders', '${ID.ord}'); o.notes = 'nota di B'; o.updatedAt = '${tB}'; saveDB(); }`);
    await giro(B);
    await giro(A);
    assert.equal(A.eval('_cloud.respinti.length'), 1, 'A lo sa');
    assert.equal(A.eval(`Store.getById('orders', '${ID.ord}').notes`), 'nota di B', 'e vede quella che ha vinto');
    assert.equal(srv.db.sql(`select notes from orders where id = '${ID.ord}'`), 'nota di B');
  });

  passo('una cancellazione arriva come cancellazione', async () => {
    A.eval(`Store.remove('reminders', '${ID.rem}')`);
    await giro(A);
    await giro(B);
    assert.equal(B.eval(`!!Store.getById('reminders', '${ID.rem}')`), false);
    assert.equal(B.eval(`db.trash.some(t => t.record && t.record.id === '${ID.rem}')`), true, 'ed è nel cestino di tutti');
  });

  passo('quello che il ruolo non scrive il server lo rifiuta, e la coda resta', async () => {
    B.eval(`Store.update('items', '${ID.item}', { name: 'Tentativo di Bruno' })`);
    assert.equal(await giro(B), false);
    assert.equal(B.eval('_cloud.stato'), 'errore');
    assert.match(B.eval('_cloud.messaggio'), /non scrive/);
    assert.equal(B.eval('Store.hasPendingChanges()'), true);
    assert.equal(srv.db.sql(`select name from items where id = '${ID.item}'`), 'Barra tonda');
    // L'uscita: riscaricare.
    await B.eval('cloudScaricaArchivio()');
    assert.equal(B.eval(`Store.getById('items', '${ID.item}').name`), 'Barra tonda');
    assert.equal(B.eval('Store.hasPendingChanges()'), false);
  });

  passo('le impostazioni di chi non è amministratore restano sul suo PC, senza fermare il resto', async () => {
    B.eval(`{ db.settings.currency = 'CHF'; const o = Store.getById('orders', '${ID.ord}'); o.title = 'Con impostazioni'; touch(o); saveDB(); }`);
    assert.equal(await giro(B), true);
    assert.equal(srv.db.sql(`select title from orders where id = '${ID.ord}'`), 'Con impostazioni');
    assert.notEqual(srv.db.sql(`select data->>'currency' from settings`), 'CHF');
  });

  passo('senza rete si lavora; la coda sopravvive a un riavvio e parte al ritorno', async () => {
    srv.spento = true;
    A.eval(`Store.update('items', '${ID.item}', { notes: 'scritto offline' })`);
    assert.equal(await giro(A), false);
    assert.equal(A.eval('_cloud.stato'), 'offline');
    // Il PC si spegne e si riaccende.
    const A2 = pc(A.storage);
    A2.eval('Store.load(); cloudAvvio();');
    entra(A2, anna);
    assert.equal(A2.eval('Store.hasPendingChanges()'), true);
    srv.spento = false;
    assert.equal(await giro(A2), true);
    assert.equal(srv.db.sql(`select notes from items where id = '${ID.item}'`), 'scritto offline');
    A = A2;
  });

  passo('un token scaduto si rinnova da solo', async () => {
    srv.scadiTutto();
    A.eval(`Store.update('items', '${ID.item}', { notes: 'dopo il rinnovo' })`);
    assert.equal(await giro(A), true);
    assert.equal(srv.db.sql(`select notes from items where id = '${ID.item}'`), 'dopo il rinnovo');
  });

  passo('un utente sospeso dall\'amministratore non entra più', async () => {
    A.eval(`{ const u = getUser('${bruno}'); u.active = false; touch(u); saveDB(); }`);
    await giro(A);
    await assert.rejects(B.eval(`cloudAccediConPassword('b@x.it', 'pw-bruno').then(() => cloudDopoAccesso())`), /non è ancora attivo/);
    await srv.chiudi();
  });
});
