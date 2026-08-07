// Carica i file dell'app in un contesto `vm` isolato, riproducendo il modo in
// cui index.html li include: classic script in sequenza, un solo scope globale.
//
// Nota importante per chi scrive test: in un contesto vm le `function` top-level
// finiscono su globalThis (quindi `ctx.costOf` esiste), ma `const Store` e
// `let db` NO — vivono nel global lexical scope. Vanno letti con ref('Store') /
// ref('db'), che è ciò che questo harness espone.

const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
// Stessa sequenza di index.html: i file si caricano nello stesso contesto e
// condividono lo scope globale, esattamente come i <script> della pagina.
const SRC = ['store.js', 'cloud-map.js', 'core.js', 'auth.js', 'costing.js', 'shell.js',
  'views-bom.js', 'views-rev.js', 'views-stock.js', 'views-catalog.js', 'views-report.js', 'views-jobs.js', 'views-home.js', 'views-mrp.js', 'views-item.js',
  'views-docs.js', 'views-manage.js', 'export-lists.js', 'import-catalog.js', 'import-export.js'];

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
    disabled: false, checked: false, style: {}, className: '',
    // I pannelli si contano e si cercano tra i figli di #modal-root: qui la
    // parentela è finta ma reale abbastanza da farli comparire e sparire.
    children: [], dataset: {}, parentNode: null,
    offsetWidth: 0, offsetHeight: 0,
    appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
    removeChild(c) { this.children = this.children.filter(x => x !== c); c.parentNode = null; return c; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0 }; },
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    insertBefore(c) { this.children.unshift(c); c.parentNode = this; return c; },
    firstChild: null,
    remove() {}, click() {}, closest() { return null; },
    querySelectorAll() { return []; }, querySelector() { return null; },
    insertAdjacentHTML() {}, setAttribute() {}, removeAttribute() {},
    // Il minimo che serve a renderInto(): chi ha il focus, chi contiene chi, e
    // il punto di digitazione. Il focus è finto ma coerente — `focus()` lo
    // sposta davvero, così un test può verificare che il ridisegno lo restituisca.
    tagName: 'DIV', id: '', selectionStart: null, selectionEnd: null,
    scrollTop: 0, scrollLeft: 0,
    focus() { if (this.ownerDocument) this.ownerDocument.activeElement = this; },
    contains(x) { return x === this || this.children.includes(x); },
    setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; },
  };
}

function loadApp(opts) {
  const o = opts || {};
  const storage = o.storage || makeStorage(o.quotaBytes);

  const sandbox = {
    console: o.silent ? { log() {}, warn() {}, error() {} } : console,
    crypto: globalThis.crypto || require('node:crypto').webcrypto,
    // Globale della piattaforma, presente in ogni browser ma non nei contesti
    // vm: lo usa sha256Hex() per convertire la stringa in byte UTF-8.
    TextEncoder,
    localStorage: storage,
    // Volutamente assenti: `document` e `window`. La guardia in fondo a import-export.js
    // (`if (typeof document !== 'undefined') init()`) impedisce l'avvio dell'app.
  };
  const ctx = vm.createContext(sandbox);

  SRC.forEach(f => {
    const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
    vm.runInContext(code, ctx, { filename: f });
  });

  // Il `document` finto si installa DOPO il caricamento, mai prima: la guardia
  // in fondo a import-export.js avvierebbe l'app. Serve solo a far passare a vuoto le
  // funzioni di interfaccia (showToast, openModal, il badge) quando un test
  // esercita un percorso che le attraversa. Nessun test verifica il DOM.
  // Gli elementi sono memorizzati per id: quello che una funzione di render
  // scrive in innerHTML resta leggibile dal test (vedi app.html()).
  const elementi = new Map();
  sandbox.document = {
    getElementById(id) {
      if (!elementi.has(id)) {
        const e = elementoFinto();
        e.id = id; e.ownerDocument = sandbox.document;
        elementi.set(id, e);
      }
      return elementi.get(id);
    },
    querySelectorAll() { return []; },
    createElement() { return elementoFinto(); },
    body: elementoFinto(),
    // Chi ha il focus. `null` come nel DOM vero prima di ogni interazione:
    // le funzioni che lo confrontano si comportano come su una pagina appena
    // caricata, dove nessun campo è a fuoco.
    activeElement: null,
  };
  sandbox.window = sandbox;
  sandbox.innerWidth = 1280; sandbox.innerHeight = 800;   // i pannelli si posizionano rispetto alla finestra
  sandbox.confirm = () => true;   // le richieste di conferma si accettano: il test verifica l'effetto
  sandbox.setTimeout = (fn) => { void fn; return 0; };   // niente code differite nei test
  sandbox.clearTimeout = () => {};                       // globale della piattaforma, assente nei contesti vm

  const ref = name => vm.runInContext(name, ctx);

  return {
    ctx,
    storage,
    ref,
    // Elemento finto per id (persistente): permette di leggere ciò che una
    // funzione di render ha scritto e di preimpostare il valore di un campo.
    // Passa dalla stessa porta dell'app: un elemento creato qui e uno creato da
    // getElementById devono essere lo stesso oggetto, con id e documento.
    el(id) { return sandbox.document.getElementById(id); },
    html(id) { return this.el(id).innerHTML; },
    // Sessione finta: i mutatori passano da roleGuard() e senza utente sono
    // tutti bloccati. Il ruolo si sceglie, così si può verificare anche chi
    // NON deve poter scrivere.
    asRole(role) {
      vm.runInContext(`currentUser = { id: 'u-test', name: 'Test', email: 't@t.it', role: ${JSON.stringify(role || 'admin')}, active: true };`, ctx);
      return this;
    },
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
