// L'archivio in IndexedDB nel browser vero. Non è un file di test: lo lancia
// test/idb.test.js in un processo a parte e ne legge l'esito in JSON.
const path = require('node:path');
const { chromium } = require('playwright');
const APP = 'file://' + path.join(__dirname, '..', 'index.html');
const pronto = () => typeof Store !== 'undefined' && typeof db !== 'undefined' && !!db && Store.archivio !== undefined;
const salvato = () => Store.scrittureInVolo() === 0;

(async () => {
  const esito = {};
  const browser = await chromium.launch();
  try {
    // 1. Un archivio da 8 MB: in localStorage non ci starebbe.
    let ctx = await browser.newContext();
    let p = await ctx.newPage();
    const errori = [];
    p.on('pageerror', e => errori.push(e.message));
    await p.goto(APP); await p.waitForFunction(pronto);
    esito.archivio = await p.evaluate(() => Store.archivio);
    await p.evaluate(() => { db.settings.zavorra = 'x'.repeat(8 * 1024 * 1024); Store.commit(); });
    await p.waitForFunction(salvato);
    esito.nonSalvato = await p.evaluate(() => Store.isUnsaved());
    await p.reload(); await p.waitForFunction(pronto);
    esito.zavorraDopoRicarica = await p.evaluate(() => (db.settings.zavorra || '').length);
    esito.lsDopo = await p.evaluate(() => localStorage.getItem('bomtrack_v1'));
    esito.errori = errori;
    await ctx.close();

    // 2. Il trasloco: un archivio in localStorage, come lo lascia la 0.86.
    ctx = await browser.newContext();
    p = await ctx.newPage();
    await p.goto(APP); await p.waitForFunction(pronto);
    await p.evaluate(() => new Promise(ok => {
      const vecchio = JSON.parse(JSON.stringify(db));
      vecchio.items[0].code = 'DA-LOCALSTORAGE';
      const r = indexedDB.deleteDatabase('bomtrack_archivio');
      r.onsuccess = r.onerror = r.onblocked = () => {
        localStorage.setItem('bomtrack_v1', JSON.stringify(vecchio));
        localStorage.removeItem('bomtrack_v1_in_indexeddb');
        ok();
      };
    }));
    // La scheda vecchia tiene aperta la connessione: deleteDatabase aspetta che
    // si chiuda, cioè la ricarica.
    await p.reload(); await p.waitForFunction(pronto);
    esito.trasloco = await p.evaluate(() => ({ archivio: Store.archivio, codice: db.items[0].code,
      ls: localStorage.getItem('bomtrack_v1'), segno: localStorage.getItem('bomtrack_v1_in_indexeddb') }));

    // 3. Due schede: quello che salva una, l'altra lo sa.
    const q = await ctx.newPage();
    await q.goto(APP); await q.waitForFunction(pronto);
    await p.evaluate(() => { db.items[0].code = 'DALLA-PRIMA'; Store.commit(); });
    await p.waitForFunction(salvato);
    await q.waitForTimeout(200);
    esito.dueSchede = await q.evaluate(() => ({
      avviso: !!Array.from(document.getElementById('modal-root').children).find(x => x.dataset.panelKey === 'avviso'),
      salva: Store.commit(),
    }));
    await q.reload(); await q.waitForFunction(pronto);
    esito.dueSchede.dopoRicarica = await q.evaluate(() => db.items[0].code);
    await ctx.close();
  } catch (e) {
    esito.errore = String(e && e.stack || e);
  }
  await browser.close();
  process.stdout.write(JSON.stringify(esito));
})();
