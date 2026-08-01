// Due client, un server.
//
// Questi test non verificano codice di rete — non ne esiste ancora. Definiscono
// il **comportamento atteso sui conflitti prima che esista il codice che li
// deve gestire**, che è l'unico momento in cui si può decidere con calma.
//
// Il server finto è deliberatamente stupido: tiene righe per tabella e applica
// last-write-wins su `updatedAt`, che è ciò che farà Postgres. Se una politica
// di merge sbagliata perde dati, qui si vede subito e costa niente; scoperta in
// produzione, costa il lavoro di un pomeriggio di qualcun altro.
//
// I tre scenari sono quelli veri, non quelli comodi:
//   1. due colleghi aggiungono una quotazione allo stesso articolo
//   2. due colleghi creano un documento nello stesso minuto
//   3. uno cancella ciò che l'altro sta modificando

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, acq, asm, comp } = require('./fixtures.js');

// ── Server finto ──
// Righe per tabella, con la stessa regola di risoluzione che avrà il backend:
// vince chi ha `updatedAt` più recente. Le righe figlie non hanno `updatedAt`
// proprio (in locale non ce l'hanno): per loro vince l'ultimo arrivato, ed è
// esattamente il motivo per cui il registro dello schema distingue 'row' da
// 'replace'.
function makeServer() {
  const tabelle = {};
  return {
    tabelle,
    // `replaceSets`: le tabelle di cui questo invio sostituisce l'intero
    // insieme per i padri toccati (la politica 'replace' del registro).
    push(righePerTabella, replaceSets) {
      const sostituite = new Set(replaceSets || []);
      Object.keys(righePerTabella).forEach(t => {
        const arrivo = righePerTabella[t];
        if (!tabelle[t]) tabelle[t] = [];
        if (sostituite.has(t)) {
          const padri = new Set(arrivo.map(r => r.parentId));
          tabelle[t] = tabelle[t].filter(r => !padri.has(r.parentId)).concat(arrivo);
          return;
        }
        arrivo.forEach(r => {
          const i = tabelle[t].findIndex(x => x.id === r.id);
          if (i < 0) { tabelle[t].push(r); return; }
          const vecchio = tabelle[t][i].updatedAt || '';
          const nuovo = r.updatedAt || '';
          if (nuovo >= vecchio) tabelle[t][i] = r;      // last-write-wins
        });
      });
    },
    remove(tabella, ids) {
      if (!tabelle[tabella]) return;
      const s = new Set(ids);
      tabelle[tabella] = tabelle[tabella].filter(r => !s.has(r.id));
    },
    pull() { return JSON.parse(JSON.stringify(tabelle)); },
  };
}

// Un client: la sua copia dell'app, con il proprio localStorage.
function client(db, nome) {
  const a = loadApp({ silent: true });
  a.setDb(JSON.parse(JSON.stringify(db)));
  a.asRole('admin');
  a.eval(`Store.setActor(${JSON.stringify(nome || 'u1')}); Store.markSynced();`);
  return a;
}
function tabelleDi(a, opts) {
  return JSON.parse(a.eval(`JSON.stringify(flattenDB(db${opts ? ', ' + JSON.stringify(opts) : ''}))`));
}
// Applica al client le tabelle del server, come farebbe un pull.
function applica(a, tabelle) {
  a.eval(`db = nestDB(${JSON.stringify(tabelle)}, { settings: db.settings, schemaVersion: db.schemaVersion }); Store.commit(); Store.markSynced();`);
}
// Le tabelle di una collezione e dei suoi figli, per un invio parziale.
function soloDi(tabelle, nomi) {
  const out = {};
  nomi.forEach(n => { out[n] = tabelle[n] || []; });
  return out;
}

describe('Il conto delle modifiche', () => {
  const base = () => makeDb({ items: [mat('m1', 5)], suppliers: [{ id: 's1', name: 'SKF', active: true }] });

  it('appena allineato, non c\'è niente da mandare', () => {
    const a = client(base());
    assert.deepEqual(JSON.parse(a.eval('JSON.stringify(Store.pendingChanges())')), {});
    assert.equal(a.eval('Store.hasPendingChanges()'), false);
  });

  it('un articolo modificato compare fra gli upsert, e nient\'altro', () => {
    const a = client(base());
    a.eval('const it = getItem("m1"); it.unitCost = 9; touch(it); saveDB();');
    const p = JSON.parse(a.eval('JSON.stringify(Store.pendingChanges())'));
    assert.deepEqual(p, { items: { upsert: ['m1'], remove: [] } },
      'mandare anche i fornitori significherebbe sovrascrivere le modifiche di un collega su dati che non ho toccato');
  });

  it('una modifica senza touch() resta invisibile, ed è l\'invariante da conoscere', () => {
    const a = client(base());
    a.eval('getItem("m1").unitCost = 9; saveDB();');
    assert.deepEqual(JSON.parse(a.eval('JSON.stringify(Store.pendingChanges())')), {},
      'il protocollo è last-write-wins su updatedAt: un record la cui data non cambia non è una modifica');
  });

  it('inserimenti e cancellazioni si distinguono', () => {
    const a = client(base());
    a.eval('Store.insert("items", { id: "m2", code: "M2", name: "Nuova", type: "materiale" });');
    a.eval('Store.remove("suppliers", "s1");');
    const p = JSON.parse(a.eval('JSON.stringify(Store.pendingChanges())'));
    assert.deepEqual(p.items.upsert, ['m2']);
    assert.deepEqual(p.suppliers.remove, ['s1']);
    assert.deepEqual(p.suppliers.upsert, []);
  });

  it('modificare una riga annidata segnala il padre', () => {
    const a = client(makeDb({ items: [Object.assign(mat('m1', 5), { priceList: [] })] }));
    a.eval('const it = getItem("m1"); it.priceList.push({ id: "pr1", price: 4 }); touch(it); saveDB();');
    assert.deepEqual(JSON.parse(a.eval('JSON.stringify(Store.pendingChanges())')), { items: { upsert: ['m1'], remove: [] } },
      'l\'articolo è l\'unità che le viste toccano: è la granularità giusta');
  });

  it('le impostazioni si contano a parte, per contenuto', () => {
    const a = client(base());
    a.eval('db.settings.overheadPct = 12; saveDB();');
    const p = JSON.parse(a.eval('JSON.stringify(Store.pendingChanges())'));
    assert.equal(p.settings, true, 'le impostazioni non hanno updatedAt e le viste ci scrivono dentro direttamente');
    assert.equal(p.items, undefined);
  });

  it('markSynced azzera il conto', () => {
    const a = client(base());
    a.eval('const it = getItem("m1"); it.unitCost = 9; touch(it); saveDB(); Store.markSynced();');
    assert.equal(a.eval('Store.hasPendingChanges()'), false);
  });

  it('il conto non dipende dal salvataggio: guarda lo stato, non le chiamate', () => {
    const a = client(base());
    a.eval('const it = getItem("m1"); it.unitCost = 9; touch(it);');   // nessun saveDB
    assert.equal(a.eval('Store.hasPendingChanges()'), true,
      'copre anche l\'import massivo e le migrazioni, che nessuno si ricorderà di strumentare');
  });
});

describe('Scenario 1 — due quotazioni sullo stesso articolo', () => {
  // Il caso che decide la politica di merge del listino. Non è un conflitto:
  // è il lavoro normale di due persone che chiamano due fornitori diversi.
  function partenza() {
    return makeDb({
      suppliers: [{ id: 's1', name: 'SKF', active: true }, { id: 's2', name: 'NSK', active: true }],
      items: [Object.assign(acq('c1', 10), { priceList: [], priceListSeeded: true })],
    });
  }

  it('sopravvivono entrambe: nessuno perde la propria', () => {
    const server = makeServer();
    const anna = client(partenza(), 'anna');
    const bruno = client(partenza(), 'bruno');

    anna.eval('const it = getItem("c1"); it.priceList.push({ id: "pr-anna", supplierId: "s1", price: 9.5 }); touch(it); saveDB();');
    bruno.eval('const it = getItem("c1"); it.priceList.push({ id: "pr-bruno", supplierId: "s2", price: 9.8 }); touch(it); saveDB();');

    // Anna invia, poi Bruno. `item_prices` si sincronizza riga per riga.
    server.push(soloDi(tabelleDi(anna), ['items', 'item_prices']));
    server.push(soloDi(tabelleDi(bruno), ['items', 'item_prices']));

    const ids = server.pull().item_prices.map(r => r.id).sort();
    assert.deepEqual(ids, ['pr-anna', 'pr-bruno'],
      'due id diversi: il merge per riga li tiene entrambi, ed è ciò che l\'utente si aspetta');
  });

  it('dopo il pull, entrambi vedono tutte e due le quotazioni', () => {
    const server = makeServer();
    const anna = client(partenza(), 'anna');
    const bruno = client(partenza(), 'bruno');
    anna.eval('const it = getItem("c1"); it.priceList.push({ id: "pr-anna", supplierId: "s1", price: 9.5 }); touch(it); saveDB();');
    bruno.eval('const it = getItem("c1"); it.priceList.push({ id: "pr-bruno", supplierId: "s2", price: 9.8 }); touch(it); saveDB();');
    server.push(soloDi(tabelleDi(anna), ['items', 'item_prices']));
    server.push(soloDi(tabelleDi(bruno), ['items', 'item_prices']));

    applica(anna, server.pull());
    const prezzi = JSON.parse(anna.eval('JSON.stringify(getItem("c1").priceList.map(r => r.id))')).sort();
    assert.deepEqual(prezzi, ['pr-anna', 'pr-bruno']);
    assert.equal(anna.eval('Store.hasPendingChanges()'), false, 'dopo un pull applicato non resta niente da mandare');
  });

  it('il prezzo in uso è un campo dell\'articolo: lì il conflitto è vero', () => {
    const server = makeServer();
    const anna = client(partenza(), 'anna');
    const bruno = client(partenza(), 'bruno');
    anna.eval('const it = getItem("c1"); it.priceList.push({ id: "pr-anna", price: 9.5 }); it.activePriceId = "pr-anna"; it.purchasePrice = 9.5; touch(it); saveDB();');
    bruno.eval('const it = getItem("c1"); it.priceList.push({ id: "pr-bruno", price: 9.8 }); it.activePriceId = "pr-bruno"; it.purchasePrice = 9.8; touch(it); saveDB();');
    server.push(soloDi(tabelleDi(anna), ['items', 'item_prices']));
    server.push(soloDi(tabelleDi(bruno), ['items', 'item_prices']));

    const art = server.pull().items.find(r => r.id === 'c1');
    assert.equal(art.activePriceId, 'pr-bruno', 'su un campo scalare vince chi salva per ultimo');
    assert.equal(server.pull().item_prices.length, 2, 'ma nessuna delle due quotazioni va persa');
    // Questo è il caso in cui l'utente va avvisato: il costo dell'articolo è
    // cambiato sotto i piedi, e con esso ogni distinta che lo contiene.
  });
});

describe('Scenario 2 — due documenti creati nello stesso minuto', () => {
  it('stesso numero, id diversi: nessuno dei due sparisce', () => {
    const server = makeServer();
    const base = makeDb({ items: [], rfqs: [] });
    const anna = client(base, 'anna');
    const bruno = client(base, 'bruno');

    // Entrambi calcolano il progressivo sulla propria copia: max+1 dà lo stesso
    // numero a tutti e due. È la collisione che oggi è garantita.
    const nA = anna.eval('nextRfqNumber()');
    const nB = bruno.eval('nextRfqNumber()');
    assert.equal(nA, nB, 'la numerazione locale è per costruzione soggetta a collisione');

    anna.eval('newRfq()'); bruno.eval('newRfq()');
    server.push(soloDi(tabelleDi(anna), ['rfqs', 'rfq_lines']));
    server.push(soloDi(tabelleDi(bruno), ['rfqs', 'rfq_lines']));

    const rfqs = server.pull().rfqs;
    assert.equal(rfqs.length, 2, 'l\'identità è l\'id UUID, non il numero: due documenti restano due documenti');
    assert.equal(new Set(rfqs.map(r => r.number)).size, 1, 'ma il numero è lo stesso: va rinumerato e detto');
  });

  it('rinumerare non rompe i riferimenti: le FK usano l\'id', () => {
    const a = client(makeDb({ items: [], rfqs: [], orders: [] }), 'anna');
    a.eval('newRfq()');
    const rfqId = a.eval('currentRfqId');
    a.eval(`orderFromRfq(${JSON.stringify(rfqId)})`);
    a.eval('db.rfqs[0].number = "RFQ-2026-999"; touch(db.rfqs[0]); saveDB();');
    const o = a.snapshot().orders[0];
    assert.equal(o.rfqId, rfqId, 'l\'ordine punta all\'id: il numero può cambiare senza conseguenze');
  });
});

describe('Scenario 3 — cancella contro modifica', () => {
  it('senza tombstone, ciò che uno cancella risorge al pull dell\'altro', () => {
    // Il bug più insidioso della migrazione, riprodotto: qui si documenta
    // perché la cancellazione deve essere una riga, non un'assenza.
    const server = makeServer();
    const base = makeDb({ items: [mat('m1', 5), mat('m2', 7)] });
    const anna = client(base, 'anna');
    const bruno = client(base, 'bruno');

    server.push(soloDi(tabelleDi(anna), ['items']));
    anna.eval('Store.remove("items", "m2");');

    // Anna manda solo ciò che ha: le sue righe. Il server non ha modo di
    // sapere che m2 è stato cancellato — l'assenza non è un'informazione.
    server.push(soloDi(tabelleDi(anna), ['items']));
    assert.equal(server.pull().items.length, 2,
      'un invio di soli upsert non può esprimere una cancellazione');

    applica(anna, server.pull());
    assert.ok(anna.eval('!!getItem("m2")'), 'e al pull successivo l\'articolo cancellato torna');
  });

  it('con la cancellazione esplicita, resta cancellato', () => {
    const server = makeServer();
    const base = makeDb({ items: [mat('m1', 5), mat('m2', 7)] });
    const anna = client(base, 'anna');
    server.push(soloDi(tabelleDi(anna), ['items']));

    anna.eval('Store.remove("items", "m2");');
    const p = JSON.parse(anna.eval('JSON.stringify(Store.pendingChanges())'));
    server.push(soloDi(tabelleDi(anna), ['items']));
    server.remove('items', p.items.remove);       // ciò che pendingChanges ha visto sparire

    assert.deepEqual(server.pull().items.map(r => r.id), ['m1']);
    applica(anna, server.pull());
    assert.equal(anna.eval('!!getItem("m2")'), false);
  });

  it('chi lo stava modificando se lo vede sparire, non a metà', () => {
    const server = makeServer();
    const base = makeDb({ items: [mat('m1', 5), mat('m2', 7)] });
    const anna = client(base, 'anna');
    const bruno = client(base, 'bruno');
    server.push(soloDi(tabelleDi(anna), ['items']));

    bruno.eval('const it = getItem("m2"); it.unitCost = 99; touch(it); saveDB();');
    anna.eval('Store.remove("items", "m2");');
    const p = JSON.parse(anna.eval('JSON.stringify(Store.pendingChanges())'));
    server.push(soloDi(tabelleDi(anna), ['items']));
    server.remove('items', p.items.remove);

    applica(bruno, server.pull());
    assert.equal(bruno.eval('!!getItem("m2")'), false,
      'la cancellazione vince sulla modifica: un articolo mezzo cancellato non esiste');
    // Che sia la scelta giusta è discutibile; che debba essere una scelta
    // esplicita, e non l'esito casuale di chi arriva per primo, no.
  });
});

describe('Distinte: sostituzione dell\'insieme, non merge riga per riga', () => {
  // Le righe di `components` non hanno un id proprio: l'identità per un merge
  // riga per riga non esisterebbe nemmeno. E anche se esistesse, mezza distinta
  // di uno e mezza dell'altro è una distinta che nessuno ha progettato.
  function partenza() {
    return makeDb({ items: [
      asm('g1', 'gruppo', { components: [comp('m1', 1), comp('m2', 2)] }),
      mat('m1', 5), mat('m2', 7), mat('m3', 9),
    ] });
  }

  it('l\'ultimo che salva definisce la distinta, per intero', () => {
    const server = makeServer();
    const anna = client(partenza(), 'anna');
    const bruno = client(partenza(), 'bruno');

    anna.eval('const it = getItem("g1"); it.components = [{ itemId: "m1", qty: 1, scrapPct: 0 }]; touch(it); saveDB();');
    bruno.eval('const it = getItem("g1"); it.components = [{ itemId: "m1", qty: 1, scrapPct: 0 }, { itemId: "m3", qty: 5, scrapPct: 0 }]; touch(it); saveDB();');

    server.push(soloDi(tabelleDi(anna), ['items', 'item_components']), ['item_components']);
    server.push(soloDi(tabelleDi(bruno), ['items', 'item_components']), ['item_components']);

    const righe = server.pull().item_components.filter(r => r.parentId === 'g1');
    assert.deepEqual(righe.map(r => r.itemId), ['m1', 'm3'],
      'la distinta di Bruno, intera: non l\'unione delle due, che sarebbe un prodotto inesistente');
  });

  it('e il pull la restituisce nell\'ordine giusto', () => {
    const server = makeServer();
    const anna = client(partenza(), 'anna');
    anna.eval('const it = getItem("g1"); it.components = [{ itemId: "m3", qty: 1, scrapPct: 0 }, { itemId: "m1", qty: 2, scrapPct: 0 }]; touch(it); saveDB();');
    server.push(soloDi(tabelleDi(anna), ['items', 'item_components']), ['item_components']);
    applica(anna, server.pull());
    assert.deepEqual(JSON.parse(anna.eval('JSON.stringify(getItem("g1").components.map(c => c.itemId))')), ['m3', 'm1']);
  });

  it('una riga tolta resta tolta: la sostituzione la porta via', () => {
    const server = makeServer();
    const anna = client(partenza(), 'anna');
    server.push(soloDi(tabelleDi(anna), ['items', 'item_components']), ['item_components']);
    anna.eval('const it = getItem("g1"); it.components.splice(1, 1); touch(it); saveDB();');
    server.push(soloDi(tabelleDi(anna), ['items', 'item_components']), ['item_components']);
    assert.equal(server.pull().item_components.filter(r => r.parentId === 'g1').length, 1,
      'con un merge riga per riga la riga cancellata sarebbe rimasta lì');
  });
});

describe('Il giro completo attraverso il server finto', () => {
  it('un database intero sopravvive a push e pull senza cambiare', () => {
    const server = makeServer();
    const a = client(makeDb({
      workCenters: [{ id: 'w1', name: 'Tornio', hourlyRate: 40, active: true }],
      suppliers: [{ id: 's1', name: 'SKF', active: true }],
      items: [asm('g1', 'gruppo', { components: [comp('m1', 2)], operations: [{ workCenterId: 'w1', hours: 1 }] }), mat('m1', 5)],
      rfqs: [{ id: 'r1', number: 'RFQ-1', active: true, lines: [{ id: 'l1', code: 'M1', qty: 3 }] }],
    }), 'anna');

    const prima = a.snapshot();
    server.push(tabelleDi(a));
    applica(a, server.pull());
    const dopo = a.snapshot();

    // Una collezione mai esistita torna come elenco vuoto: è la stessa
    // normalizzazione che fa migrateDB() e ciò che l'app si aspetta di trovare.
    ['items', 'suppliers', 'workCenters', 'rfqs', 'families', 'orders', 'plans', 'users'].forEach(c => {
      assert.deepEqual(dopo[c], prima[c] || [], 'collezione ' + c);
    });
    assert.equal(a.eval('Store.hasPendingChanges()'), false,
      'se un giro a vuoto lasciasse modifiche pendenti, i client si rimanderebbero dati all\'infinito');
  });
});
