// Il pannello laterale.
//
// Quello che questi test proteggono non è la grafica: è il **patto** fra il
// pannello e l'elenco. Il pannello mostra comandi che agiscono su una riga, e
// tre cose devono restare vere, perché sbagliarle significa far premere il
// pulsante giusto sull'articolo sbagliato:
//   1. i comandi compaiono alle stesse condizioni a cui comparivano in riga;
//   2. chi ha la vista in sola lettura non li vede affatto;
//   3. una selezione che non ha più una riga viva decade, invece di restare lì
//      a offrire azioni su qualcosa che non si vede più.
// `inspectorHtml()` non tocca il DOM: si prova come ogni altra vista del repo.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, acq, asm, comp, parte } = require('./fixtures.js');

function app(items) {
  const a = loadApp({ silent: true });
  a.setDb(makeDb({ items: items || [mat('m1', 10), acq('c1', 5)] }));
  a.asRole('admin');
  return a;
}
// Porta l'app nella vista chiesta e sceglie un articolo, come farebbe un click.
function scegli(a, view, id) {
  a.eval(`activeView = ${JSON.stringify(view)}`);
  a.eval(`inspSel = { view: ${JSON.stringify(view)}, kind: 'item', ids: [${JSON.stringify(id)}] }`);
  return String(a.eval('inspectorHtml()'));
}

describe('Pannello: quando c\'è e quando non c\'è', () => {
  it('le viste senza pannello non ne disegnano uno', () => {
    const a = app();
    a.eval('activeView = "bom"');
    assert.equal(a.eval('inspectorHtml()'), '', 'la distinta non ha pannello: non deve inventarne uno');
    assert.equal(a.eval('!!inspectorFor("manage")'), false);
  });

  it('senza selezione il pannello spiega cosa fare invece di restare vuoto', () => {
    const a = app();
    a.eval('activeView = "buy"');
    const h = String(a.eval('inspectorHtml()'));
    assert.match(h, /Scegli una riga/, 'uno spazio bianco non insegna niente');
    assert.doesNotMatch(h, /insp-cmd/, 'senza riga scelta non ci sono comandi da offrire');
  });
});

describe('I comandi sono quelli della riga, alle stesse condizioni', () => {
  it('un commerciale ha il listino, una macchina no', () => {
    const a = app([acq('c1', 5), asm('a1', 'macchina')]);
    assert.match(scegli(a, 'buy', 'c1'), /priceListModal\('c1'\)/);
    assert.doesNotMatch(scegli(a, 'buy', 'a1'), /priceListModal/,
      'il listino vale per ciò che si compra, non per una macchina');
  });

  it('solo una parte porta al suo ciclo di lavorazione', () => {
    const a = app([parte('p1'), acq('c1', 5)]);
    assert.match(scegli(a, 'design', 'p1'), /openCycleFor\('p1'\)/);
    assert.doesNotMatch(scegli(a, 'buy', 'c1'), /openCycleFor/);
  });

  it('il Magazzino offre rettifica e movimenti, l\'anagrafica no', () => {
    const a = app();
    const stock = scegli(a, 'stock', 'm1');
    assert.match(stock, /stockAdjustModal\('m1'\)/);
    assert.match(stock, /stockMovementsModal\('m1'\)/);
    assert.doesNotMatch(scegli(a, 'buy', 'm1'), /stockAdjustModal/,
      'la rettifica è un gesto di magazzino: dall\'anagrafica non si fa');
  });

  it('ogni comando dice a parole cosa fa', () => {
    const a = app();
    const h = scegli(a, 'buy', 'm1');
    assert.match(h, /Modifica articolo/);
    assert.match(h, /Elimina articolo/);
    assert.match(h, /Dove è usato/, 'era un\'icona muta in riga: qui ha lo spazio per dirsi');
  });
});

describe('Sola lettura', () => {
  it('a chi non può scrivere il pannello non offre i comandi che modificano', () => {
    const a = app();
    a.asRole('lettore');   // ruolo vero del repo: legge tutto, non scrive niente
    const h = scegli(a, 'buy', 'm1');
    assert.doesNotMatch(h, /editItemModal/, 'un comando che le guardie rifiuterebbero non va nemmeno disegnato');
    assert.doesNotMatch(h, /delItem/);
    assert.doesNotMatch(h, /duplicateItemModal/);
    assert.match(h, /usageModal/, 'consultare resta permesso: è il senso della sola lettura');
  });
});

describe('La selezione non sopravvive a ciò che la rende falsa', () => {
  it('un articolo eliminato non lascia comandi in giro', () => {
    const a = app();
    a.eval('activeView = "buy"');
    a.eval('inspSel = { view: "buy", kind: "item", ids: ["sparito"] }');
    assert.equal(a.eval('inspectorSelected()'), null);
    assert.match(String(a.eval('inspectorHtml()')), /Scegli una riga/);
  });

  it('la selezione fatta in un\'altra vista non vale qui', () => {
    const a = app();
    a.eval('activeView = "stock"');
    a.eval('inspSel = { view: "buy", kind: "item", ids: ["m1"] }');
    assert.equal(a.eval('inspectorSelected()'), null,
      'i comandi del Magazzino non devono agire su una riga scelta nell\'anagrafica');
  });
});

describe('Riepilogo e schede', () => {
  it('il riepilogo risponde alle domande veloci senza aprire niente', () => {
    const a = app([mat('m1', 10), asm('a1', 'macchina', { components: [comp('m1', 2)] })]);
    const h = scegli(a, 'buy', 'm1');
    assert.match(h, /Costo unitario/);
    assert.match(h, /Giacenza/, 'una materia prima sta a scaffale: la giacenza si dice');
    assert.match(h, /1 impiego diretto/, 'il conto degli impieghi è quello vero, non un\x27etichetta fissa');
  });

  it('un articolo che non usa nessuno lo dice, invece di mostrare uno zero', () => {
    const h = scegli(app(), 'buy', 'c1');
    assert.match(h, /nessun impiego/, 'è la riga che dice se si può eliminare senza conseguenze');
  });

  it('un assieme non dichiara una giacenza che non ha senso', () => {
    const a = app([asm('a1', 'macchina')]);
    const h = scegli(a, 'design', 'a1');
    assert.doesNotMatch(h, /insp-sum-k">Giacenza/, 'un assieme si produce, non si tiene a scaffale');
  });

  it('le schede sono quelle che esistono già, non copie nuove', () => {
    const a = app();
    const h = scegli(a, 'buy', 'm1');
    assert.match(h, /insp-tab/);
    assert.match(h, /Anagrafica/, 'la scheda articolo è la stessa della finestra di sola lettura');
  });
});

describe('Larghezza', () => {
  it('resta dentro limiti che lasciano leggibili sia il pannello sia l\'elenco', () => {
    const a = app();
    assert.equal(a.eval('inspClampWidth(10)'), a.ref('INSP_MIN'), 'sotto il minimo non ci sta un comando');
    assert.equal(a.eval('inspClampWidth(5000)'), a.ref('INSP_MAX'), 'sopra il massimo il pannello mangia l\'elenco');
    assert.equal(a.eval('inspClampWidth("boh")'), a.ref('INSP_DEF'), 'un valore illeggibile torna a quello di serie');
    assert.equal(a.eval('inspClampWidth(400)'), 400);
  });
});

// ─── Più righe insieme ───
// Le azioni di massa sono l'unico punto dell'app in cui un click cambia venti
// record. Quello che va protetto è il **confine**: che non tocchino ciò che non
// possono toccare (un articolo usato in una distinta, il preferito su un tipo
// che non lo prevede, qualunque cosa per chi è in sola lettura) e che dicano
// sempre quanti ne hanno cambiati davvero.

describe('Selezione multipla', () => {
  function scegliTanti(a, view, ids) {
    a.eval(`activeView = ${JSON.stringify(view)}`);
    a.eval(`inspSel = { view: ${JSON.stringify(view)}, kind: 'item', ids: ${JSON.stringify(ids)} }`);
    return String(a.eval('inspectorHtml()'));
  }

  it('il pannello passa alle azioni di massa e dice quanti sono', () => {
    const a = app();
    const h = scegliTanti(a, 'buy', ['m1', 'c1']);
    assert.match(h, /2 articoli scelti/);
    assert.match(h, /bulkObsolete\(\['m1','c1'\], true\)/);
    assert.doesNotMatch(h, /priceListModal/, 'il listino è di un articolo solo: qui non ha senso');
  });

  it('elenca le righe scelte: agire su venti senza vederle è firmare senza leggere', () => {
    const h = scegliTanti(app(), 'buy', ['m1', 'c1']);
    assert.match(h, /insp-multi-list/);
    assert.match(h, /M1/);
    assert.match(h, /C1/);
  });

  it('l\'export della selezione passa gli id, non i filtri della vista', () => {
    const h = scegliTanti(app(), 'buy', ['m1', 'c1']);
    assert.match(h, /exportListXlsx\(catalogExportSpec\('buy', \['m1','c1'\]\)\)/);
    const s = scegliTanti(app(), 'stock', ['m1', 'c1']);
    assert.match(s, /stockExportSpec\(\['m1','c1'\]\)/);
  });

  it('in sola lettura restano solo gli export', () => {
    const a = app();
    a.asRole('lettore');
    const h = scegliTanti(a, 'buy', ['m1', 'c1']);
    assert.doesNotMatch(h, /bulkObsolete/);
    assert.doesNotMatch(h, /bulkDelete/);
    assert.match(h, /exportListXlsx/, 'esportare ciò che si vede resta permesso');
  });

  it('avvisa prima di quanti non si possono eliminare', () => {
    const a = app([mat('m1', 10), acq('c1', 5), asm('a1', 'macchina', { components: [comp('m1', 1)] })]);
    const h = scegliTanti(a, 'buy', ['m1', 'c1']);
    assert.match(h, /non si eliminano/, 'saperlo dopo, a gesto fatto, è saperlo tardi');
    assert.match(h, /Elimina 1 articoli/);
  });
});

describe('Azioni di massa', () => {
  it('segna obsoleti solo quelli che non lo erano già', () => {
    const a = app([mat('m1', 10), Object.assign(acq('c1', 5), { obsolete: true })]);
    a.eval('activeView = "buy"');
    assert.equal(a.eval('bulkSetFlag(["m1","c1"], "obsolete", true)'), 1,
      'il conto è di quelli cambiati davvero, non di quelli scelti');
    assert.equal(a.eval('db.items.filter(i => i.obsolete).length'), 2);
  });

  it('il preferito non tocca i tipi che non lo prevedono', () => {
    const a = app([acq('c1', 5), parte('p1')]);
    a.eval('activeView = "buy"');
    a.eval('bulkFavorite(["c1","p1"], true)');
    assert.equal(a.eval('!!getItem("c1").favorite'), true);
    assert.equal(a.eval('!!getItem("p1").favorite'), false,
      'sulle parti il preferito non esiste: non fallisce, proprio non si applica');
  });

  it('chi è in sola lettura non cambia niente', () => {
    const a = app();
    a.asRole('lettore');
    a.eval('activeView = "buy"');
    assert.equal(a.eval('bulkSetFlag(["m1"], "obsolete", true)'), 0);
    assert.equal(a.eval('!!getItem("m1").obsolete'), false);
  });

  it('l\'eliminazione in blocco salta chi è usato in una distinta', () => {
    const a = app([mat('m1', 10), acq('c1', 5), asm('a1', 'macchina', { components: [comp('m1', 1)] })]);
    a.eval('activeView = "buy"');
    a.eval('bulkDelete(["m1","c1"])');
    a.eval('confirmYes()');
    assert.equal(a.eval('!!getItem("m1")'), true, 'è dentro una distinta: resta dov\'è');
    assert.equal(a.eval('!!getItem("c1")'), false);
  });

  it('quello che è stato eliminato in blocco si rimette insieme', () => {
    const a = app([mat('m1', 10), acq('c1', 5)]);
    a.eval('activeView = "buy"');
    a.eval('bulkDelete(["m1","c1"])');
    a.eval('confirmYes()');
    assert.equal(a.eval('db.items.length'), 0);
    a.eval('toastAzione()');   // il pulsante "Annulla" del messaggio
    assert.equal(a.eval('db.items.length'), 2, 'chi si pente si pente dell\'intero gesto, non di una riga');
  });

  it('se sono tutti usati non si apre nemmeno la conferma', () => {
    const a = app([mat('m1', 10), asm('a1', 'macchina', { components: [comp('m1', 1)] })]);
    a.eval('activeView = "buy"');
    a.eval('bulkDelete(["m1"])');
    assert.equal(a.eval('db.items.length'), 2);
  });
});

// ═══════════════════════════════════════════════════════════
//  Allegati
// ═══════════════════════════════════════════════════════════
// Il comando sta nel pannello come sta nella riga: da lì si aprono i disegni.
// Non è marcato `write` di proposito — scaricare un disegno e modificare
// l'anagrafica sono due permessi diversi, e chi va in officina con il foglio in
// mano non è detto che abbia il secondo.
describe('Pannello: gli allegati', () => {
  it('il comando c\'è in entrambe le anagrafiche e in magazzino', () => {
    const a = app();
    ['buy', 'design', 'stock'].forEach(v => {
      assert.match(scegli(a, v, 'm1'), /Allegati/, `manca in ${v}`);
    });
  });

  it('l\'etichetta dice quanti sono, senza doverli aprire', () => {
    const a = app();
    a.eval('db.attachments = [{ id: "a1", itemId: "m1", name: "disegno.pdf", size: 2048 },'
      + '{ id: "a2", itemId: "m1", name: "scheda.pdf", size: 1024 }]');
    assert.match(scegli(a, 'buy', 'm1'), /Allegati \(2\)/);
  });

  it('senza allegati l\'etichetta resta pulita, non «Allegati (0)»', () => {
    const a = app();
    const h = scegli(a, 'buy', 'm1');
    assert.match(h, /Allegati/);
    assert.doesNotMatch(h, /Allegati \(0\)/, 'uno zero fra parentesi è rumore, non informazione');
  });

  it('anche chi ha la vista in sola lettura può aprirli', () => {
    const a = app();
    a.asRole('lettore');
    const h = scegli(a, 'buy', 'm1');
    assert.match(h, /Allegati/, 'consultare un disegno non è modificare un articolo');
    assert.doesNotMatch(h, /Elimina articolo/, 'i comandi che scrivono restano nascosti');
  });
});
