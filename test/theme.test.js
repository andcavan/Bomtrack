// Tema chiaro e scuro.
//
// Il colore non si può provare da qui — sta nel foglio di stile, e la suite non
// ha un motore di rendering. Quello che si prova è il **contratto** fra i due:
// theme.js scrive un attributo sull'elemento radice, style.css lo legge. Se
// l'attributo esce sbagliato, o resta scritto quando dovrebbe sparire, i colori
// non seguono più — ed è esattamente il caso che non si vede rileggendo il CSS.
//
// Il pezzo delicato è «come il sistema»: si esprime con l'**assenza**
// dell'attributo, perché è così che la media query torna a decidere. Scrivere
// `data-theme="auto"` sarebbe la cosa naturale da fare e la cosa sbagliata: il
// selettore `:root:not([data-theme=dark])` continuerebbe a valere, ma quello
// esplicito `[data-theme=light]` no, e il tema resterebbe bloccato a metà.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb } = require('./fixtures.js');

// L'elemento radice arriva dall'harness, come tutto il resto del DOM finto:
// è lì che theme.js scrive `data-theme`, ed è lì che questi test lo rileggono.
function app(opts) {
  return loadApp(Object.assign({ silent: true }, opts || {}));
}
const attr = a => a.eval('JSON.stringify(document.documentElement.attrs)');

describe('Tema — l\'attributo che il foglio di stile legge', () => {
  it('«come il sistema» non scrive niente: è l\'assenza a far decidere la media query', () => {
    const a = app();
    a.eval('themeSet("auto")');
    assert.equal(attr(a), '{}', 'un data-theme="auto" scavalcherebbe il sistema senza dire quale tema vuole');
  });

  it('chiaro e scuro si scrivono per esteso', () => {
    const a = app();
    a.eval('themeSet("light")');
    assert.equal(attr(a), '{"data-theme":"light"}');
    a.eval('themeSet("dark")');
    assert.equal(attr(a), '{"data-theme":"dark"}');
  });

  it('tornando in automatico l\'attributo si toglie, non si sovrascrive', () => {
    const a = app();
    a.eval('themeSet("dark")');
    a.eval('themeSet("auto")');
    assert.equal(attr(a), '{}', 'restando scritto, il tema resterebbe inchiodato allo scuro');
  });

  it('un valore che non esiste ricade in automatico invece di scriversi', () => {
    const a = app();
    a.eval('themeSet("seppia")');
    assert.equal(a.eval('theme'), 'auto');
    assert.equal(attr(a), '{}');
  });
});

describe('Tema — la preferenza vive nel browser di chi lavora', () => {
  it('la scelta si salva e si rilegge', () => {
    const a = app();
    a.eval('themeSet("light")');
    assert.equal(a.eval('localStorage.getItem("bomtrack_theme")'), 'light');
    // Un secondo avvio sullo stesso browser: stessa preferenza.
    a.eval('theme = "dark"; themeLoad()');
    assert.equal(a.eval('theme'), 'light');
  });

  it('senza niente salvato si parte in automatico', () => {
    const a = app();
    assert.equal(a.eval('themeLoad()'), 'auto');
  });

  it('una preferenza illeggibile non impedisce l\'avvio', () => {
    const a = app();
    a.eval('localStorage.setItem("bomtrack_theme", "arcobaleno")');
    assert.equal(a.eval('themeLoad()'), 'auto', 'un valore ignoto vale come nessun valore');
  });

  it('se localStorage rifiuta la scrittura il tema si applica lo stesso', () => {
    // Spazio esaurito o modo privato: la preferenza non si conserva, ma
    // pretendere di salvarla non deve impedire di cambiare tema adesso.
    const a = app({ quotaBytes: 1 });
    a.eval('themeSet("light")');
    assert.equal(a.eval('theme'), 'light');
    assert.equal(attr(a), '{"data-theme":"light"}');
  });

  it('il tema non finisce nel database: è di chi guarda, non dell\'azienda', () => {
    const a = app();
    a.setDb(makeDb());
    a.eval('themeSet("light")');
    assert.ok(!('theme' in JSON.parse(a.eval('JSON.stringify(db.settings)'))),
      'sincronizzato, imporrebbe il proprio tema ai colleghi');
  });
});

describe('Tema — il giro del pulsante', () => {
  it('passa da tutti e tre gli stati e torna al principio', () => {
    const a = app();
    a.eval('themeSet("auto")');
    const giro = [];
    for (let i = 0; i < 4; i++) { a.eval('themeToggle()'); giro.push(a.eval('theme')); }
    assert.deepEqual(giro, ['light', 'dark', 'auto', 'light'],
      '«come il sistema» deve restare raggiungibile: è l\'unico controllo del tema, e la Gestione la scrive solo l\'amministratore');
  });

  it('senza sistema da interrogare l\'automatico vale scuro', () => {
    // `window` non esiste nella suite, come in un contesto senza browser:
    // themeEffective() non deve rompersi, deve scegliere il tema di partenza.
    const a = app();
    a.eval('themeSet("auto")');
    assert.equal(a.eval('themeEffective()'), 'dark');
  });

  it('scelto un tema esplicito, quello vale a prescindere dal sistema', () => {
    const a = app();
    a.eval('themeSet("light")');
    assert.equal(a.eval('themeEffective()'), 'light');
  });

  it('ogni stato ha un nome leggibile: il pulsante deve poterlo dire', () => {
    const a = app();
    const l = JSON.parse(a.eval('JSON.stringify(THEME_LABEL)'));
    JSON.parse(a.eval('JSON.stringify(THEMES)')).forEach(t => {
      assert.ok(l[t], 'manca il nome di "' + t + '"');
    });
  });
});

// ─── I contrasti della palette ───
//
// Questi non provano codice, provano dei numeri — ed è il motivo per cui
// esistono. Un colore si sposta di due punti perché «si vedeva meglio», e la
// leggibilità se ne va senza che niente si rompa: nessuna schermata sbaglia,
// nessun test fallisce, semplicemente qualcuno in officina fatica a leggere.
// Qui la soglia è scritta, e la palette si legge dal foglio di stile vero: se
// un domani cambia, sono questi a dirlo.
//
// La soglia è 4.5:1, quella di WCAG AA per il testo normale. Vale anche per le
// scritte dei pulsanti: sono in grassetto ma a 12-13px, molto sotto i 18.66px
// da cui il testo conta come «grande» e la soglia scende a 3:1.

const fs = require('node:fs');
const path = require('node:path');
const CSS = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
const SOGLIA = 4.5;

function luminanza(hex) {
  const h = hex.replace('#', '');
  const canali = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * canali[0] + 0.7152 * canali[1] + 0.0722 * canali[2];
}
function contrasto(a, b) {
  const la = luminanza(a), lb = luminanza(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
// I token di un blocco della palette, letti dal foglio di stile vero: il test
// non deve avere una sua copia dei colori, o si direbbero d'accordo fra loro
// mentre l'app va per conto suo.
function palette(marcatore) {
  const i = CSS.indexOf(marcatore);
  assert.ok(i > 0, 'blocco non trovato nel foglio di stile: ' + marcatore);
  const blocco = CSS.slice(i, CSS.indexOf('}', i));
  const out = {};
  blocco.replace(/(--[a-z0-9-]+)\s*:\s*(#[0-9A-Fa-f]{6})/g, (_, k, v) => { out[k] = v; return ''; });
  return out;
}
const SCURO = palette('color-scheme:dark');
const CHIARO = palette(':root[data-theme=light]');

// Il colore che si legge sta sulla scheda; quello su cui si scrive sta sotto
// il suo inchiostro. Sono i due mestieri che un valore solo non copre.
const DA_LEGGERE = ['--text', '--text-dim', '--accent', '--red', '--red-h', '--green', '--orange', '--purple'];
const DA_SCRIVERCI = [
  ['--accent-solid', '#FFFFFF'], ['--accent-h', '#FFFFFF'],
  ['--red-solid', '#FFFFFF'], ['--green-solid', '#FFFFFF'],
  ['--orange-solid', null], ['--orange-h', null],   // null = l'inchiostro è --on-orange
];

[['scuro', SCURO], ['chiaro', CHIARO]].forEach(([nome, p]) => {
  describe(`Contrasti — tema ${nome}`, () => {
    it('ogni colore che si legge stacca dalla scheda', () => {
      DA_LEGGERE.forEach(k => {
        assert.ok(p[k], 'token assente: ' + k);
        const v = contrasto(p[k], p['--card']);
        assert.ok(v >= SOGLIA, `${k} ${p[k]} su --card ${p['--card']}: ${v.toFixed(2)}:1, sotto ${SOGLIA}`);
      });
    });

    it('ogni fondo pieno regge l\'inchiostro che ci va sopra', () => {
      DA_SCRIVERCI.forEach(([k, inchiostro]) => {
        assert.ok(p[k], 'token assente: ' + k);
        const ink = inchiostro || p['--on-orange'];
        const v = contrasto(ink, p[k]);
        assert.ok(v >= SOGLIA, `${ink} su ${k} ${p[k]}: ${v.toFixed(2)}:1, sotto ${SOGLIA}`);
      });
    });

    it('le due palette dichiarano gli stessi token', () => {
      const altra = nome === 'scuro' ? CHIARO : SCURO;
      Object.keys(p).forEach(k => {
        if (k === '--font' || k === '--mono') return;
        assert.ok(altra[k], `${k} manca nell'altra palette: al cambio di tema resterebbe quello di prima`);
      });
    });
  });
});

describe('Contrasti — i colori dei formati di export', () => {
  it('il bianco regge sul rosso Acrobat e sul verde Excel', () => {
    // Non sono colori del tema e non cambiano col fondo: restano gli stessi,
    // ma la scritta sopra deve leggersi lo stesso.
    [['export-btn-pdf', /\.export-btn-pdf\{background:(#[0-9A-Fa-f]{6})/],
     ['export-btn-xls', /\.export-btn-xls\{background:(#[0-9A-Fa-f]{6})/]].forEach(([nome, re]) => {
      const m = CSS.match(re);
      assert.ok(m, 'colore non trovato per ' + nome);
      const v = contrasto('#FFFFFF', m[1]);
      assert.ok(v >= SOGLIA, `${nome} ${m[1]}: ${v.toFixed(2)}:1, sotto ${SOGLIA}`);
    });
  });
});

// ═══════════════════════════════════════════════════════════
//  I token che il foglio di stile deve davvero definire
// ═══════════════════════════════════════════════════════════
// `--shadow:var(--shadow)` è auto-referenziale: la proprietà diventa invalida e
// ogni box-shadow che la usa viene scartato in silenzio. Non è un errore che si
// veda rileggendo il CSS — sembra una riga come le altre — e il browser non
// protesta: l'ombra semplicemente non c'è.
describe('Ogni variabile di colore ha un valore, non se stessa', () => {
  it('nessun token si definisce con sé stesso', () => {
    const circolari = [];
    CSS.replace(/(--[a-z0-9-]+)\s*:\s*var\(\s*(--[a-z0-9-]+)/g, (tutto, nome, dentro) => {
      if (nome === dentro) circolari.push(nome);
      return tutto;
    });
    assert.deepEqual(circolari, [], 'un token che cita sé stesso è invalido: la regola che lo usa viene scartata');
  });

  it('i token usati con var() sono tutti definiti da qualche parte', () => {
    const definiti = new Set();
    CSS.replace(/(--[a-z0-9-]+)\s*:/g, (t, n) => { definiti.add(n); return t; });
    // Chi ha un valore di scorta nel var() si arrangia da sé, ed è legittimo.
    const mancanti = [];
    CSS.replace(/var\(\s*(--[a-z0-9-]+)\s*([,)])/g, (t, n, sep) => {
      if (sep === ')' && !definiti.has(n)) mancanti.push(n);
      return t;
    });
    assert.deepEqual([...new Set(mancanti)], []);
  });

  it('le ombre hanno un valore anche nel tema scuro, che è quello di partenza', () => {
    // Il primo :root del foglio è il tema scuro: lì dentro i due token devono
    // avere un colore vero, o pannelli, toast e ispettore restano piatti.
    const primoRoot = CSS.slice(CSS.indexOf(':root{'), CSS.indexOf('}', CSS.indexOf(':root{')));
    assert.match(primoRoot, /--shadow:\s*rgba\(/, '--shadow');
    assert.match(primoRoot, /--shadow-soft:\s*rgba\(/, '--shadow-soft');
  });
});

// ═══════════════════════════════════════════════════════════
//  Ogni campo data deve poter essere raggiunto dal foglio di stile
// ═══════════════════════════════════════════════════════════
// Un `<input type="date">` senza una classe, dentro un `<td>` nudo, non lo
// raggiunge nessuna regola: esce col fondo bianco e gli spigoli vivi del
// browser, in mezzo a campi disegnati. È capitato alla data delle righe del
// piano di fabbisogno, dove la quantità nella cella accanto era invece a posto.
//
// Il controllo è sul sorgente e non sul disegno, perché è lì che il difetto
// nasce: un campo aggiunto domani in una cella si dimentica la classe, non il
// colore. Le vie legittime sono due — una classe che il foglio di stile
// conosce, oppure il contenitore `.modal-field`, che i suoi campi li veste tutti.
describe('I campi data sono tutti vestiti', () => {
  const FILES = ['views-catalog.js', 'views-docs.js', 'views-jobs.js', 'views-mrp.js',
    'views-stock.js', 'views-bom.js', 'views-item.js', 'worklist.js', 'index.html'];
  // Le classi che il foglio di stile disegna davvero, ricavate da style.css e
  // non elencate a mano: se una sparisce dal CSS, il campo che la usa risulta
  // scoperto qui invece che a schermo.
  const VESTITE = ['rfq-date-input', 'pl-date', 'search']
    .filter(c => new RegExp('\\.' + c + '[^{]*\\{|\\.' + c + ',').test(CSS));

  it('le classi su cui questo controllo si appoggia esistono nel foglio di stile', () => {
    assert.ok(VESTITE.includes('rfq-date-input'), 'rfq-date-input non è più disegnata');
    assert.ok(VESTITE.includes('pl-date'), 'pl-date non è più disegnata');
    assert.match(CSS, /\.modal-field input/, 'il contenitore che veste i suoi campi');
    assert.match(CSS, /\.wl-filters input/, 'i filtri degli elenchi');
  });

  it('nessun campo data resta senza una regola che lo raggiunga', () => {
    const nudi = [];
    let trovati = 0;
    FILES.forEach(f => {
      const s = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
      const re = /<input[^>]*type="date"[^>]*>/g;
      let m;
      while ((m = re.exec(s)) !== null) {
        trovati++;
        const tag = m[0];
        const classi = (tag.match(/class="([^"]*)"/) || ['', ''])[1].split(/\s+/);
        if (VESTITE.some(c => classi.includes(c))) continue;
        // Il contenitore: si guarda indietro fino all'apertura del campo.
        const prima = s.slice(Math.max(0, m.index - 220), m.index);
        if (/class="modal-field[^"]*"[^<]*(<label[^>]*>[^<]*<\/label>)?\s*$/.test(prima)) continue;
        // La barra dei filtri veste i suoi campi (.wl-filters input). Il secondo
        // dei due estremi dista di piu: fra i due c'e l'altro campo e la freccia.
        if (/class="wl-filter-dates"/.test(s.slice(Math.max(0, m.index - 700), m.index))) continue;
        const riga = s.slice(0, m.index).split(/\r?\n/).length;
        nudi.push(f + ':' + riga + '  ' + tag.slice(0, 70));
      }
    });
    assert.ok(trovati >= 10, 'il controllo deve trovarli davvero, i campi data: ne ha visti ' + trovati);
    assert.deepEqual(nudi, [], 'campi data che nessuna regola raggiunge');
  });

  it('l-icona del calendario segue il tema, in tutti e tre gli stati', () => {
    // Su fondo scuro l-icona di serie è nera e sparisce: si inverte. Sul chiaro
    // no. I tre stati sono scuro (:root), «come il sistema» (media query) e
    // chiaro esplicito, e devono dirlo tutti e tre.
    assert.match(CSS, /:root[^{]*\{[\s\S]*?\}|input\[type=date\]::-webkit-calendar-picker-indicator[^}]*\{filter:invert/);
    assert.match(CSS, /:root:not\(\[data-theme=dark\]\) input\[type=date\]::-webkit-calendar-picker-indicator/);
    assert.match(CSS, /:root\[data-theme=light\] input\[type=date\]::-webkit-calendar-picker-indicator/);
  });
});
