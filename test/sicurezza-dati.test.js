// La sicurezza dell'archivio: l'unica copia sta in questo browser.
//
// Il backup c'era, ma niente ricordava di farlo, e lo spazio si vedeva solo
// aprendo Gestione → Backup. Questi test tengono ferme tre cose:
//   1. l'export registra la data, e la data sta fuori dal database;
//   2. il Riepilogo avvisa — solo chi può esportare — quando il backup
//      invecchia o lo spazio si riempie, e porta dritto alla scheda Backup;
//   3. un'installazione nuova non parte già in allarme.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat } = require('./fixtures.js');

function app(role) {
  const a = loadApp({ silent: true });
  a.setDb(makeDb({ items: [mat('m1', 10)], jobs: [], plans: [], rfqs: [], orders: [] }));
  a.asRole(role || 'admin');
  return a;
}
const segnali = a => JSON.parse(a.eval('JSON.stringify(homeSegnali())'));
const backupSig = a => segnali(a).find(s => /backup/.test(s.testo));
const spazioSig = a => segnali(a).find(s => /spazio/.test(s.testo));
const giorniFa = (a, n) => a.eval(`addDays(oggiISO(), -${n})`);

describe('L\'export registra quando è stato fatto', () => {
  it('la data è quella di oggi, in localStorage', () => {
    const a = app();
    assert.equal(a.eval('ultimoBackup()'), '');
    a.eval('exportBackup()');
    assert.equal(a.eval('ultimoBackup()'), a.eval('oggiISO()'));
  });

  it('e non entra nel database: viaggerebbe col backup, falsa su ogni altro PC', () => {
    const a = app();
    a.eval('exportBackup()');
    assert.doesNotMatch(a.scaricati()[0].contenuto, /ultimo_backup/);
  });

  it('un lettore non esporta, e non sposta la data', () => {
    const a = app('lettore');
    a.eval('exportBackup()');
    assert.equal(a.eval('ultimoBackup()'), '');
  });

  it('la scheda Backup dice quando, o che non è mai successo', () => {
    const a = app();
    assert.match(a.eval('backupLine()'), /Nessun backup esportato/);
    a.storage.setItem('bomtrack_ultimo_backup', giorniFa(a, 3));
    assert.match(a.eval('backupLine()'), /Ultimo backup: <strong>[^<]+<\/strong> \(3 giorni fa\)/);
    assert.match(a.eval('renderBackup()'), /Ultimo backup/);
  });
});

describe('Il Riepilogo ricorda il backup', () => {
  it('un\'installazione nuova non parte già in allarme', () => {
    const a = app();
    assert.equal(backupSig(a), undefined);
    assert.equal(a.storage.getItem('bomtrack_ultimo_backup_dal'), a.eval('oggiISO()'),
      'il primo giorno contato si fissa, così i giorni senza backup partono da qui');
  });

  it('dopo una settimana avvisa, dopo un mese è un allarme', () => {
    const a = app();
    a.storage.setItem('bomtrack_ultimo_backup', giorniFa(a, 8));
    let s = backupSig(a);
    assert.equal(s.n, 8);
    assert.equal(s.gravita, 'media');
    a.storage.setItem('bomtrack_ultimo_backup', giorniFa(a, 40));
    s = backupSig(a);
    assert.equal(s.gravita, 'alta');
    assert.equal(s.testo, 'giorni dall\'ultimo backup');
  });

  it('mai fatto: lo dice, contando dal primo giorno', () => {
    const a = app();
    a.storage.setItem('bomtrack_ultimo_backup_dal', giorniFa(a, 12));
    const s = backupSig(a);
    assert.equal(s.n, 12);
    assert.match(s.testo, /mai/);
  });

  it('esportare lo spegne', () => {
    const a = app();
    a.storage.setItem('bomtrack_ultimo_backup', giorniFa(a, 20));
    a.eval('exportBackup()');
    assert.equal(backupSig(a), undefined);
  });

  it('porta alla scheda Backup, e offre l\'export lì dove si legge', () => {
    const a = app();
    a.storage.setItem('bomtrack_ultimo_backup', giorniFa(a, 9));
    const s = backupSig(a);
    assert.equal(s.apri, "homeApri('backup')");
    assert.match(s.voci[0].azione, /exportBackup\(\)/);
  });

  it('a chi non può esportare non lo chiede', () => {
    const a = app('acquisti');
    a.storage.setItem('bomtrack_ultimo_backup', giorniFa(a, 60));
    assert.equal(backupSig(a), undefined);
  });
});

describe('Il Riepilogo avvisa quando lo spazio si riempie', () => {
  const conSpazio = (a, mb) => a.eval(`Store.adapter = Object.assign({}, Store.adapter, { size: () => ${mb} * 1024 * 1024 })`);

  it('sotto il 70% tace', () => {
    const a = app();
    conSpazio(a, 3);
    assert.equal(spazioSig(a), undefined);
  });

  it('dal 70% avvisa, dal 90% è un allarme, con i MB nella voce', () => {
    const a = app();
    conSpazio(a, 3.6);
    let s = spazioSig(a);
    assert.equal(s.n, 72);
    assert.equal(s.gravita, 'media');
    assert.match(s.voci[0].testo, /3\.60 MB su 5/);
    conSpazio(a, 4.6);
    assert.equal(spazioSig(a).gravita, 'alta');
  });

  it('solo per chi può fare qualcosa', () => {
    const a = app('lettore');
    conSpazio(a, 4.8);
    assert.equal(spazioSig(a), undefined);
  });
});

describe('Archiviazione persistente', () => {
  it('senza l\'API del browser non dice niente e non si rompe', () => {
    const a = app();
    a.eval('richiediPersistenza()');
    assert.equal(a.eval('persistenzaLine()'), '');
  });

  it('chiede la persistenza e mostra l\'esito', async () => {
    const a = app();
    a.eval('globalThis.navigator = { storage: { persisted: () => Promise.resolve(false), persist: () => { globalThis.__chiesto = 1; return Promise.resolve(true); } } }');
    await a.eval('richiediPersistenza()');
    assert.equal(a.eval('globalThis.__chiesto'), 1);
    assert.match(a.eval('persistenzaLine()'), /persistenti/);
  });
});
