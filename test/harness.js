// Carica store.js + app.js in un contesto `vm` isolato, riproducendo il modo in
// cui index.html li include: due classic script nello stesso scope globale.
//
// Nota importante per chi scrive test: in un contesto vm le `function` top-level
// finiscono su globalThis (quindi `ctx.costOf` esiste), ma `const Store` e
// `let db` NO — vivono nel global lexical scope. Vanno letti con ref('Store') /
// ref('db'), che è ciò che questo harness espone.

const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SRC = ['store.js', 'app.js'];

// localStorage finto. `quotaBytes` opzionale: oltre soglia lancia lo stesso
// errore dei browser, per poter testare la gestione dello spazio esaurito.
function makeStorage(quotaBytes) {
  const map = new Map();
  return {
    quotaBytes: quotaBytes == null ? Infinity : quotaBytes,
    get size() { let n = 0; map.forEach((v, k) => { n += k.length + v.length; }); return n; },
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) {
      const s = String(v);
      let n = s.length + String(k).length;
      map.forEach((vv, kk) => { if (kk !== k) n += kk.length + vv.length; });
      if (n > this.quotaBytes) {
        const e = new Error('quota exceeded (finto)');
        e.name = 'QuotaExceededError';
        e.code = 22;
        throw e;
      }
      map.set(String(k), s);
    },
    removeItem(k) { map.delete(String(k)); },
    clear() { map.clear(); },
    _map: map,
  };
}

// Elemento permissivo: accetta qualunque lettura o scrittura senza fare nulla.
function elementoFinto() {
  return {
    value: '', textContent: '', innerHTML: '', placeholder: '', title: '',
    disabled: false, checked: false, style: {},
    classList: { add() {}, remove() {}, contains() { return false; } },
    appendChild() {}, removeChild() {}, focus() {}, click() {},
  };
}

function loadApp(opts) {
  const o = opts || {};
  const storage = o.storage || makeStorage(o.quotaBytes);

  const sandbox = {
    console: o.silent ? { log() {}, warn() {}, error() {} } : console,
    crypto: globalThis.crypto || require('node:crypto').webcrypto,
    localStorage: storage,
    // Volutamente assenti: `document` e `window`. La guardia in fondo ad app.js
    // (`if (typeof document !== 'undefined') init()`) impedisce l'avvio dell'app.
  };
  const ctx = vm.createContext(sandbox);

  SRC.forEach(f => {
    const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
    vm.runInContext(code, ctx, { filename: f });
  });

  // Il `document` finto si installa DOPO il caricamento, mai prima: la guardia
  // in fondo ad app.js avvierebbe l'app. Serve solo a far passare a vuoto le
  // funzioni di interfaccia (showToast, openModal, il badge) quando un test
  // esercita un percorso che le attraversa. Nessun test verifica il DOM.
  sandbox.document = {
    getElementById() { return elementoFinto(); },
    querySelectorAll() { return []; },
    createElement() { return elementoFinto(); },
    body: elementoFinto(),
  };
  sandbox.window = sandbox;
  sandbox.setTimeout = (fn) => { void fn; return 0; };   // niente code differite nei test

  const ref = name => vm.runInContext(name, ctx);

  return {
    ctx,
    storage,
    ref,
    // Imposta il database in memoria senza passare da localStorage.
    // Serializzato apposta: evita ogni problema di oggetti cross-realm.
    setDb(obj) { vm.runInContext('db = ' + JSON.stringify(obj), ctx); return ref('db'); },
    // Preimposta il blob persistito: il test chiama poi Store.load() e passa
    // dalle migrazioni, come al primo avvio su un PC con dati vecchi.
    seedStorage(obj) { storage.setItem(ref('DB_KEY'), typeof obj === 'string' ? obj : JSON.stringify(obj)); },
    // Copia in realm Node del db (comoda per confronti con JSON.stringify)
    snapshot() { return JSON.parse(vm.runInContext('JSON.stringify(db)', ctx)); },
    eval(expr) { return vm.runInContext(expr, ctx); },
  };
}

module.exports = { loadApp, makeStorage };
