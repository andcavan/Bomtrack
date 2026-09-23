// Calendario scadenze nel Riepilogo.
//
// I segnali dicono quante cose sono in ritardo; il calendario dice quando
// scadono. Questi test fissano da dove arriva ciascuna data, quale gravità
// prende, e che i promemoria scritti a mano seguano le stesse regole di ruolo
// del resto dell'app.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, asm, comp } = require('./fixtures.js');

function app(db, role) {
  const a = loadApp({ silent: true });
  a.setDb(db || makeDb({ items: [] }));
  a.asRole(role || 'admin');
  return a;
}
const eventi = a => JSON.parse(a.eval('JSON.stringify(homeEventi())'));
const oggi = a => a.eval('oggiISO()');
const giorni = (a, n) => a.eval(`addDays(oggiISO(), ${n})`);

describe('Calendario: da dove arrivano le date', () => {
  it('un database vuoto non ha scadenze', () => {
    assert.deepEqual(eventi(app()), []);
  });

  it('una commessa scaduta è rossa, una lontana è in programma', () => {
    const a = app();
    a.eval(`db.jobs = [
      { id: 'j1', number: 'COM-1', status: 'aperta', dueDate: '2020-01-01', active: true },
      { id: 'j2', number: 'COM-2', status: 'produzione', dueDate: addDays(oggiISO(), 60), active: true },
      { id: 'j3', number: 'COM-3', status: 'chiusa', dueDate: '2020-01-01', active: true }]`);
    const e = eventi(a);
    assert.equal(e.length, 2, 'una commessa chiusa non è più una scadenza');
    assert.equal(e[0].data, '2020-01-01');
    assert.equal(e[0].gravita, 'alta');
    assert.match(e[0].azione, /openJobEdit\('j1'\)/, 'ogni voce porta dove si risolve');
    assert.equal(e[1].gravita, 'info');
  });

  it('il fabbisogno mette la data entro cui ordinare, raggruppata per piano', () => {
    const a = app(makeDb({
      suppliers: [{ id: 's1', name: 'SKF', active: true }],
      items: [
        asm('mac', 'macchina', { components: [comp('m1', 4), comp('m2', 2)] }),
        Object.assign(mat('m1', 10), { priceList: [{ id: 'p1', supplierId: 's1', price: 10, leadDays: 10, date: '2026-01-01' }], activePriceId: 'p1', supplierId: 's1' }),
        Object.assign(mat('m2', 5), { priceList: [{ id: 'p2', supplierId: 's1', price: 5, leadDays: 10, date: '2026-01-01' }], activePriceId: 'p2', supplierId: 's1' }),
      ],
    }));
    const due = giorni(a, 13);
    a.eval(`Store.insert('plans', { id: 'pl1', number: 'FAB-1', active: true, lines: [{ id: 'l1', itemId: 'mac', qty: 1, dueDate: '${due}' }] })`);
    const f = eventi(a).filter(e => e.tipo === 'fabbisogno');
    assert.equal(f.length, 1, 'due articoli dello stesso piano nello stesso giorno sono una voce sola');
    assert.equal(f[0].data, giorni(a, 3), 'serve fra 13 giorni, consegna in 10: si ordina fra 3');
    assert.equal(f[0].gravita, 'media', 'dentro la finestra d\'avviso');
    assert.match(f[0].testo, /2 articoli/);
    assert.match(f[0].azione, /openPlanEdit\('pl1'\)/);
  });

  it('un ordine da ricevere compare alla data confermata; evaso o ricevuto no', () => {
    const a = app();
    const conf = giorni(a, 30), rich = giorni(a, 20);
    a.eval(`db.orders = [
      { id: 'o1', number: 'ODA-1', status: 'confermato', active: true, lines: [
        { id: 'r1', qty: 5, received: 0, deliveryDate: '${rich}', confirmedDate: '${conf}' },
        { id: 'r2', qty: 5, received: 5, deliveryDate: '${rich}' }] },
      { id: 'o2', number: 'ODA-2', status: 'evaso', active: true, lines: [{ id: 'r3', qty: 1, received: 0, deliveryDate: '${rich}' }] }]`);
    const e = eventi(a);
    assert.equal(e.length, 1, 'una riga già ricevuta e un ordine evaso non sono scadenze');
    assert.equal(e[0].data, conf, 'la data che conta è quella promessa dal fornitore');
    assert.equal(e[0].gravita, 'media', 'confermato più tardi del chiesto: da tenere d\'occhio');
    assert.equal(e[0].ritardo, true);
  });

  it('una consegna d\'ordine già passata e non ricevuta è rossa', () => {
    const a = app();
    a.eval(`db.orders = [{ id: 'o1', number: 'ODA-1', status: 'inviato', active: true, lines: [{ id: 'r1', qty: 5, received: 2, deliveryDate: '2020-02-01' }] }]`);
    assert.equal(eventi(a)[0].gravita, 'alta');
  });

  it('le voci sono in ordine di data, e a parità la più grave prima', () => {
    const a = app();
    const d = giorni(a, 40);
    a.eval(`db.reminders = [
      { id: 'r1', title: 'normale', date: '${d}', gravita: 'info', active: true },
      { id: 'r2', title: 'critico', date: '${d}', gravita: 'alta', active: true },
      { id: 'r3', title: 'prima', date: '${giorni(a, 35)}', gravita: 'info', active: true }]`);
    assert.deepEqual(eventi(a).map(e => e.testo), ['prima', 'critico', 'normale']);
  });
});

describe('Calendario: griglia e navigazione', () => {
  it('la griglia parte di lunedì e copre settimane intere', () => {
    const a = app();
    const g = JSON.parse(a.eval('JSON.stringify(calGiorniGriglia("2026-09"))'));
    assert.equal(g[0], '2026-08-31', 'il 1° settembre 2026 è martedì');
    assert.equal(g.length % 7, 0);
    assert.equal(g[g.length - 1], '2026-10-04');
  });

  it('febbraio che inizia di lunedì sta in quattro settimane', () => {
    const a = app();
    assert.equal(a.eval('calGiorniGriglia("2027-02").length'), 28);
  });

  it('si sfoglia avanti e indietro, anche a cavallo d\'anno', () => {
    const a = app();
    assert.equal(a.eval('calSpostaMese("2026-12", 1)'), '2027-01');
    assert.equal(a.eval('calSpostaMese("2026-01", -1)'), '2025-12');
  });

  it('le scadute restano in vista anche sfogliando un altro mese', () => {
    const a = app();
    a.eval(`db.jobs = [{ id: 'j1', number: 'COM-1', status: 'aperta', dueDate: '2020-01-01', active: true }]`);
    a.eval('renderHome(); homeCalMove(3);');
    const h = a.html('view-home');
    assert.match(h, /Scadute e non risolte \(1\)/);
    assert.match(h, /COM-1/);
    assert.match(h, /class="cal-grid"/);
  });

  it('un giorno con scadenze lo dice anche a chi non vede i pallini', () => {
    const a = app();
    a.eval(`db.reminders = [{ id: 'r1', title: 'Collaudo', date: oggiISO(), gravita: 'info', active: true }]`);
    a.eval('renderHome()');
    assert.match(a.html('view-home'), /aria-label="[^"]*, 1 scadenza"/);
  });

  it('scegliere un giorno mostra le sue voci', () => {
    const a = app();
    const d = giorni(a, 45);
    a.eval(`db.reminders = [{ id: 'r1', title: 'Collaudo in officina', date: '${d}', gravita: 'info', active: true }]`);
    a.eval(`renderHome(); homeCalPick('${d}')`);
    assert.equal(a.eval('homeCalMese'), d.slice(0, 7));
    assert.match(a.html('view-home'), /Collaudo in officina/);
  });
});

describe('Promemoria', () => {
  function compila(a, campi) {
    Object.entries(campi).forEach(([k, v]) => { a.el(k).value = v; });
  }

  it('si aggiunge, entra nel calendario e «fatto» lo toglie', () => {
    const a = app();
    const d = giorni(a, 5);
    a.eval(`reminderModal(null, '${d}')`);
    compila(a, { 'rem-title': 'Sollecitare SKF', 'rem-date': d, 'rem-grav': 'media', 'rem-job': '', 'rem-notes': '' });
    a.eval('reminderSave(null)');
    const r = a.eval('JSON.stringify(db.reminders)');
    const lista = JSON.parse(r);
    assert.equal(lista.length, 1);
    assert.ok(lista[0].createdAt, 'porta i timestamp come ogni record');
    const e = eventi(a);
    assert.equal(e[0].testo, 'Sollecitare SKF');
    assert.equal(e[0].gravita, 'media');
    a.eval(`reminderDone('${lista[0].id}')`);
    assert.deepEqual(eventi(a), []);
    assert.equal(a.eval('db.reminders.length'), 1, 'fatto non vuol dire cancellato');
  });

  it('senza titolo o senza data non si salva', () => {
    const a = app();
    a.eval('reminderModal(null)');
    compila(a, { 'rem-title': '', 'rem-date': oggi(a), 'rem-grav': 'info', 'rem-job': '', 'rem-notes': '' });
    a.eval('reminderSave(null)');
    compila(a, { 'rem-title': 'x', 'rem-date': '' });
    a.eval('reminderSave(null)');
    assert.equal(a.eval('(db.reminders || []).length'), 0);
  });

  it('un promemoria scaduto diventa rosso, qualunque importanza avesse', () => {
    const a = app();
    a.eval(`db.reminders = [{ id: 'r1', title: 'x', date: '2020-01-01', gravita: 'info', active: true }]`);
    assert.equal(eventi(a)[0].gravita, 'alta');
  });

  it('un lettore non li crea e non li chiude', () => {
    const a = app(null, 'lettore');
    a.eval(`db.reminders = [{ id: 'r1', title: 'x', date: oggiISO(), gravita: 'info', active: true }]`);
    a.eval('reminderSave(null); reminderDone("r1")');
    assert.equal(a.eval('db.reminders.length'), 1);
    assert.equal(a.eval('db.reminders[0].done'), undefined);
    a.eval('renderHome()');
    assert.ok(!a.html('view-home').includes('+ Promemoria'), 'il pulsante non si offre a chi non può usarlo');
  });

  it('eliminato finisce nel cestino e si può riavere', () => {
    const a = app();
    a.eval(`Store.insert('reminders', { id: 'r1', title: 'x', date: oggiISO(), gravita: 'info', active: true })`);
    a.eval('reminderDelete("r1"); confirmYes();');
    assert.equal(a.eval('db.reminders.length'), 0);
    assert.equal(a.eval('db.trash.filter(t => t.coll === "reminders").length'), 1);
  });

  it('la migrazione crea la collezione vuota sui database vecchi', () => {
    const a = app();
    a.eval('delete db.reminders; migrateDB();');
    assert.equal(a.eval('Array.isArray(db.reminders) && db.reminders.length'), 0);
  });
});
