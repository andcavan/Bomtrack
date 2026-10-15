// Il menu dei fornitori in cui si scrive (combo.js), nel Chromium vero.
// Stampa un JSON che test/combo.test.js controlla: qui si guida la pagina,
// là si decide se è giusto. Stessa forma di layout-browser.js.
const path = require('node:path');
const { chromium } = require('playwright');
const APP = path.join(__dirname, '..', 'index.html');

const SEED = () => {
  Store.reset();
  const u = { id: newId(), name: 'Anna Bianchi', username: 'anna', email: 'a@x.it', role: 'admin', color: '#3A7BE8', active: true };
  setUserPassword(u, 'x'); stampNew(u); db.users.push(u);
  ['Bonfiglioli Riduttori S.p.A.', 'Officine Meccaniche Lombarde S.r.l.', 'Città Viteria', 'Lombardini Motori']
    .forEach(n => db.suppliers.push(stampNew({ id: newId(), name: n, active: true })));
  const o = stampNew({ id: newId(), number: 'ODA-2026-001', title: 'Prova', date: '2026-10-01', status: 'bozza', supplierId: db.suppliers[0].id,
    transport: '', payment: '', notes: '', notesInternal: '', supplierConfirmation: '', active: true, rfqId: null, planId: null, jobId: null, lines: [] });
  db.orders.push(o);
  db.orders.push(stampNew(Object.assign({}, o, { id: newId(), number: 'ODA-2026-002', status: 'inviato', supplierId: db.suppliers[3].id })));
  saveDB();
  return u.id;
};

(async () => {
  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errori = [];
    page.on('pageerror', e => errori.push(e.message));
    await page.goto('file://' + APP);
    await page.waitForFunction(() => typeof Store !== 'undefined' && Store.archivio !== undefined && typeof db !== 'undefined' && db);
    const uid = await page.evaluate(SEED);
    await page.waitForFunction(() => Store.scrittureInVolo() === 0);
    await page.evaluate(id => localStorage.setItem('bomtrack_session', JSON.stringify({ userId: id, ts: new Date().toISOString() })), uid);
    await page.reload(); await page.waitForTimeout(300);
    const r = {};

    // 1. Il fornitore dell'ordine in bozza.
    await page.evaluate(() => { setView('orders'); openOrderEdit(db.orders[0].id); });
    await page.waitForTimeout(150);
    r.campo = await page.evaluate(() => {
      const sel = document.querySelector('#view-orders select[onchange^="ordSetSupplier"]');
      if (!sel || !sel._comboIn) return null;
      sel._comboIn.id = 't-ordine';
      return { selNascosto: getComputedStyle(sel).display === 'none', testo: sel._comboIn.value };
    });
    if (!r.campo) throw new Error('campo fornitore non trovato: ' + await page.evaluate(() => [...document.querySelectorAll('select.sel-cerca')].map(s => s.id + ':' + !!s._comboIn).join(',')));
    await page.click('#t-ordine');
    r.tutte = await page.$$eval('#combo-list .combo-opt', v => v.length);
    await page.keyboard.type('citta');
    r.filtrate = await page.$$eval('#combo-list .combo-opt', v => v.map(x => x.textContent));
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    r.scelto = await page.evaluate(() => supplierName(db.orders[0].supplierId));
    // Due parole, in un altro ordine.
    await page.evaluate(() => { const s = document.querySelector('#view-orders select[onchange^="ordSetSupplier"]'); s._comboIn.id = 't-ordine'; });
    await page.click('#t-ordine');
    await page.keyboard.type('lomb mot');
    r.dueParole = await page.$$eval('#combo-list .combo-opt', v => v.map(x => x.textContent));
    await page.keyboard.press('Escape');
    r.dopoEsc = await page.evaluate(() => ({ testo: document.getElementById('t-ordine').value, lista: getComputedStyle(document.getElementById('combo-list')).display, fornitore: supplierName(db.orders[0].supplierId) }));
    // Niente che corrisponde.
    await page.click('#t-ordine');
    await page.keyboard.type('zzz');
    r.nulla = await page.$eval('#combo-list', l => l.textContent);
    await page.keyboard.press('Escape');

    // 2. Ordine inviato: il campo è bloccato come il menu.
    await page.evaluate(() => openOrderEdit(db.orders[1].id));
    await page.waitForTimeout(150);
    r.bloccato = await page.evaluate(() => { const s = document.querySelector('#view-orders select[onchange^="ordSetSupplier"]'); return { sel: s.disabled, campo: s._comboIn.disabled }; });

    // 3. Il filtro dell'elenco ordini, con la tastiera.
    await page.evaluate(() => { document.getElementById('orderf-sup')._comboIn.id = 't-filtro'; });
    await page.click('#t-filtro');
    r.segnaposto = await page.$eval('#t-filtro', i => i.placeholder);
    await page.keyboard.type('l');
    r.conL = await page.$$eval('#combo-list .combo-opt', v => v.map(x => x.textContent));
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    r.filtro = await page.evaluate(() => ({ valore: supplierName(docFilters.order.supplierId), sel: supplierName(val('orderf-sup')), elenco: [...document.querySelectorAll('#order-list .wl-row, #order-list [onclick]')].length }));

    r.errori = errori;
    console.log(JSON.stringify(r));
  } catch (e) {
    console.log(JSON.stringify({ errore: String(e && e.stack || e) }));
  } finally {
    if (browser) await browser.close();
  }
})();
