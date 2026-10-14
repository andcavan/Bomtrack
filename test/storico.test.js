// Lo storico delle modifiche.
//
// Ogni record diceva chi l'aveva toccato per ultimo, non che cosa era
// cambiato. Ora ogni salvataggio annota le differenze. Le proprietà che
// contano:
//   1. si vede chi, quando, quale campo, da cosa a cosa — e solo i campi
//      cambiati davvero: una data rimessa al salvataggio non è una modifica;
//   2. creazione ed eliminazione si annotano, col nome del record;
//   3. un import o una generazione in blocco è una voce sola, e il registro
//      non supera il suo tetto: non deve né riempire l'archivio né perdere
//      tutto il resto per un import;
//   4. le password non finiscono nel registro, nemmeno come hash;
//   5. lo storico viaggia nel backup, e un ripristino non si annota come
//      «tutto è cambiato».

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat } = require('./fixtures.js');

function app(role) {
  const a = loadApp({ silent: true });
  a.setDb(makeDb({ items: [mat('m1', 10), mat('m2', 20)], suppliers: [{ id: 's1', name: 'SKF', active: true }, { id: 's2', name: 'FAG', active: true }] }));
  a.asRole(role || 'admin');
  a.eval("db.users = [{ id: 'u-test', name: 'Test', email: 't@t.it', role: 'admin', active: true }]; Store.setActor('u-test'); storicoFotografa();");
  return a;
}
const storico = a => JSON.parse(a.eval('JSON.stringify(db.storico || [])'));

describe('Storico: cosa si annota', () => {
  it('una modifica dice chi, quale campo, da cosa a cosa', () => {
    const a = app();
    a.eval("const it = getItem('m1'); it.minStock = 5; it.name = 'Vite M8'; touch(it); Store.commit();");
    const s = storico(a);
    assert.equal(s.length, 1);
    assert.equal(s[0].c, 'items');
    assert.equal(s[0].id, 'm1');
    assert.equal(s[0].op, 'm');
    assert.equal(s[0].u, 'u-test');
    const campi = Object.fromEntries(s[0].d.map(x => [x.k, x]));
    assert.equal(campi.minStock.b, '5');
    assert.equal(campi.name.b, 'Vite M8');
    assert.equal(campi.updatedAt, undefined, 'date e autore non sono modifiche');
  });

  it('un salvataggio che rimette solo la data non annota niente', () => {
    const a = app();
    a.eval("touch(getItem('m1')); Store.commit(); Store.commit();");
    assert.deepEqual(storico(a), []);
  });

  it('una modifica senza touch() si vede lo stesso', () => {
    const a = app();
    a.eval("getItem('m2').notes = 'senza data'; Store.commit();");
    assert.equal(storico(a)[0].d[0].k, 'notes');
  });

  it('creazione ed eliminazione portano il nome del record', () => {
    const a = app();
    a.eval("Store.insert('suppliers', { id: 's3', name: 'Bosch', active: true });");
    a.eval("db.suppliers = db.suppliers.filter(s => s.id !== 's2'); Store.commit();");
    const s = storico(a);
    assert.deepEqual(s.map(e => [e.op, e.n]), [['n', 'Bosch'], ['x', 'FAG']]);
  });

  it('le righe di un documento si contano: aggiunte, tolte, cambiate', () => {
    const a = app();
    a.eval(`db.orders = [{ id: 'o1', number: 'ODA-1', active: true, lines: [{ id: 'l1', qty: 1 }, { id: 'l2', qty: 2 }] }]; storicoFotografa();
      const o = db.orders[0]; o.lines[0].qty = 5; o.lines.splice(1, 1); o.lines.push({ id: 'l3', qty: 1 }, { id: 'l4', qty: 1 }); Store.commit();`);
    const d = storico(a)[0].d.find(x => x.k === 'lines');
    assert.equal(d.a, '2 righe');
    assert.equal(d.b, '3 righe');
    assert.equal(d.r, '+2, −1, 1 cambiata');
  });

  it('le impostazioni hanno la loro voce', () => {
    const a = app();
    a.eval("db.settings.scheduleBufferDays = 3; Store.commit();");
    const s = storico(a);
    assert.equal(s[0].c, 'settings');
    assert.equal(s[0].d[0].k, 'scheduleBufferDays');
  });

  it('i movimenti di magazzino sono già un registro: non si annotano due volte', () => {
    const a = app();
    a.eval("db.movements = db.movements || []; db.movements.push({ id: 'mv1', itemId: 'm1', qty: 3 }); Store.commit();");
    assert.deepEqual(storico(a), []);
  });
});

describe('Storico: tetto, blocchi e riservatezza', () => {
  it('un import di molti articoli è una voce sola', () => {
    const a = app();
    a.eval("for (let i = 0; i < 120; i++) db.items.push({ id: 'x' + i, code: 'X' + i, name: 'x', type: 'commerciale', active: true }); Store.commit();");
    const s = storico(a);
    assert.equal(s.length, 1);
    assert.equal(s[0].op, 'b');
    assert.match(s[0].n, /120 nuovi/);
  });

  it('il registro non supera il suo tetto, e perde le voci più vecchie', () => {
    const a = app();
    const max = a.eval('STORICO_MAX');
    a.eval(`db.storico = Array.from({ length: ${max} }, (_, i) => ({ t: '2020-01-01T00:00:00Z', c: 'items', id: 'vecchia' + i, op: 'm', n: '', d: [] }));
      getItem('m1').notes = 'nuova'; Store.commit();`);
    const s = storico(a);
    assert.equal(s.length, max);
    assert.equal(s[0].id, 'vecchia1', 'la più vecchia se ne va');
    assert.equal(s[s.length - 1].id, 'm1');
  });

  it('una password cambiata si dice, ma l\'hash non si scrive', () => {
    const a = app();
    a.eval("setUserPassword(db.users[0], 'segreta'); Store.commit();");
    const testo = JSON.stringify(storico(a));
    const hash = a.eval('db.users[0].passwordHash');
    assert.ok(hash);
    assert.ok(!testo.includes(hash), 'l\'hash non va nel registro');
    assert.match(testo, /\(modificata\)/);
  });
});

describe('Storico: backup e lettura', () => {
  it('viaggia nel backup, e un ripristino non si annota come «tutto cambiato»', () => {
    const a = app();
    a.eval("getItem('m1').notes = 'prima del backup'; Store.commit();");
    const snap = a.eval('Store.exportSnapshot()');
    const b = app();
    b.eval(`Store.importSnapshot(${JSON.stringify(snap)})`);
    const s = storico(b);
    assert.equal(s.length, 1);
    assert.equal(s[0].d[0].b, 'prima del backup');
    b.eval("getItem('m2').notes = 'dopo'; Store.commit();");
    assert.equal(storico(b).length, 2, 'dopo il ripristino si riparte da lì');
  });

  it('si ricarica dall\'archivio e continua da dove era', () => {
    const a = app();
    a.eval("getItem('m1').notes = 'uno'; Store.commit(); Store.load(); getItem('m1').notes = 'due'; Store.commit();");
    const s = storico(a);
    assert.equal(s.length, 2);
    assert.equal(s[1].d[0].a, 'uno');
  });

  it('la scheda Storico mostra fornitore col nome, non con l\'id', () => {
    const a = app();
    a.eval("getItem('m1').supplierId = 's1'; Store.commit(); getItem('m1').supplierId = 's2'; Store.commit();");
    const html = a.eval("storicoBody('items', 'm1')");
    assert.match(html, /Fornitore/);
    assert.match(html, /SKF<\/span> → FAG/);
    assert.ok(html.indexOf('FAG') < html.lastIndexOf('SKF'), 'la più recente in alto');
  });

  it('senza modifiche la scheda dice da quando si conta', () => {
    assert.match(app().eval("storicoBody('items', 'm1')"), /dalla 0\.95\.0/);
  });

  it('il registro della scheda Backup si filtra per quello che si legge', () => {
    const a = app();
    a.eval("getItem('m1').notes = 'alfa'; Store.commit(); getItem('m2').notes = 'beta'; Store.commit();");
    assert.equal(a.eval("storicoVociFiltrate('').length"), 2);
    assert.equal(a.eval("storicoVociFiltrate('beta').length"), 1);
    assert.equal(a.eval("storicoVociFiltrate('test').length"), 2, 'il nome dell\'utente si cerca');
    assert.match(a.eval('renderBackup()'), /Storico delle modifiche/);
  });

  it('il pannello laterale dell\'articolo ha la scheda Storico', () => {
    const a = app();
    const schede = a.eval("inspSchedeArticolo(getItem('m1')).map(s => s.id)");
    assert.ok(Array.from(schede).includes('storico'));
  });
});
