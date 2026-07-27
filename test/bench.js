// Benchmark del motore di costificazione. Non fa parte della suite
// (`node test/run.js` non lo lancia): si esegue a mano con `node test/bench.js`
// quando si tocca costOf o getItem.
//
// Scenario: distinta profonda con componenti largamente condivisi, cioè il caso
// in cui il rollup ricorsivo senza memoizzazione ricalcola gli stessi
// sottoalberi molte volte. Misura il tempo di un intero disegno del catalogo
// (costOf su ogni articolo).

const { loadApp } = require('./harness.js');

const FOGLIE = 400;      // materie prime e commerciali
const PER_NODO = 4;      // figli per assieme
const LIVELLI = 5;       // profondità sopra le foglie
const PER_LIVELLO = 60;  // assiemi per livello

function generaDb() {
  const items = [];
  for (let i = 0; i < FOGLIE; i++) {
    items.push(i % 2
      ? { id: 'f' + i, code: 'F' + i, name: 'Foglia ' + i, type: 'materiale', uom: 'kg', unitCost: 1 + (i % 17) }
      : { id: 'f' + i, code: 'F' + i, name: 'Foglia ' + i, type: 'acquistato', uom: 'pz', purchasePrice: 2 + (i % 23) });
  }
  let sotto = items.map(i => i.id);
  for (let lv = 0; lv < LIVELLI; lv++) {
    const livello = [];
    for (let k = 0; k < PER_LIVELLO; k++) {
      const id = 'a' + lv + '_' + k;
      const components = [];
      for (let c = 0; c < PER_NODO; c++) {
        // I figli si sovrappongono tra assiemi: è il riuso che fa esplodere il
        // costo del ricalcolo, ed è come sono fatte le distinte vere.
        components.push({ itemId: sotto[(k * PER_NODO + c * 7) % sotto.length], qty: 1 + (c % 3), scrapPct: c % 2 ? 5 : 0 });
      }
      items.push({ id, code: id.toUpperCase(), name: 'Assieme ' + id, type: lv === LIVELLI - 1 ? 'macchina' : 'sottogruppo',
        uom: 'pz', components, operations: [] });
      livello.push(id);
    }
    sotto = livello;
  }
  return {
    schemaVersion: 2, suppliers: [], rfqs: [], orders: [], users: [], families: [], workCenters: [], items,
    settings: { overheadPct: 12, marginPct: 20, currency: '€', partCostModeDefault: 'cycle',
      uoms: [], uomDefault: 'pz', concepts: [], mpFamiliesSeeded: true, partFamiliesSeeded: true },
  };
}

function misura(app, ripetizioni) {
  const ids = app.eval('db.items.map(i => i.id)');
  const t0 = process.hrtime.bigint();
  for (let r = 0; r < ripetizioni; r++) {
    app.eval('invalidateCaches(); db.items.forEach(i => costOf(i.id));');
  }
  const t1 = process.hrtime.bigint();
  return { ms: Number(t1 - t0) / 1e6 / ripetizioni, n: ids.length };
}

const db = generaDb();
const app = loadApp({ silent: true });
app.setDb(db);

// Controllo di sanità: cache accesa e spenta devono dare lo stesso numero.
const conCache = app.eval('costOf(db.items[db.items.length - 1].id).total');
app.eval('const _set = _costCache.set.bind(_costCache); _costCache.set = () => _costCache;');
app.eval('invalidateCaches();');
const senzaCache = app.eval('costOf(db.items[db.items.length - 1].id).total');
if (Math.abs(conCache - senzaCache) > 1e-6) {
  console.error('DIVERGENZA: con cache ' + conCache + ', senza ' + senzaCache);
  process.exit(1);
}

// Cache disattivata (la set è stata neutralizzata sopra), indice attivo
const soloIndice = misura(app, 3);
// Cache disattivata e getItem riportata alla scansione lineare: è il
// comportamento che l'app aveva prima di questo blocco.
app.eval('getItem = function (id) { return db.items.find(i => i.id === id); };');
const comePrima = misura(app, 3);
// Tutto riacceso
app.eval('_costCache.set = _set; getItem = function (id) { return itemIndex().get(id); };');
const completo = misura(app, 3);

const riga = (etichetta, m) => '  ' + etichetta.padEnd(24) + m.ms.toFixed(1).padStart(7) + ' ms';
console.log('Distinta sintetica: ' + completo.n + ' articoli, ' + LIVELLI + ' livelli, componenti condivisi');
console.log('  (tempo di un disegno completo del catalogo: costOf su ogni articolo)\n');
console.log(riga('come prima', comePrima));
console.log(riga('solo indice articoli', soloIndice));
console.log(riga('indice + memoizzazione', completo));
console.log('\n  guadagno complessivo: ' + (comePrima.ms / completo.ms).toFixed(0) + 'x');
