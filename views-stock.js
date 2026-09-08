// ═══════════════════════════════════════════════════════════
//  BOMTRACK — views-stock.js
// ═══════════════════════════════════════════════════════════
// Giacenze, movimenti e fabbisogno netto.
// Classic script, scope globale condiviso con gli altri: nessun modulo e
// nessun build, così index.html continua ad aprirsi con un doppio click.
//
// ── Il problema ──
// Il fabbisogno è sempre stato **lordo**: quanto serve, punto. Non quanto serve
// *comprare*. Chi lo usava riordinava materiale che era già a magazzino o già
// in arrivo da un ordine mandato la settimana prima, e se ne accorgeva alla
// consegna.
//
// ── Da dove viene l'esistente, e perché non è un campo ──
// La tentazione è un campo `onHand` sull'articolo, che qualcuno aggiorna. È
// esattamente l'errore già corretto una volta con i prezzi (0.21.0): se lo
// stesso numero si può scrivere in due posti, prima o poi i due posti dicono
// cose diverse e non si sa quale credere.
//
// Qui l'esistente è **calcolato**, e ogni pezzo ha un padrone solo:
//
//   esistente = Σ ricevuto sulle righe d'ordine  +  Σ movimenti
//
// Il ricevuto vive sull'ordine, dove già viveva e dove ha senso — correggere un
// ricevimento sbagliato corregge anche la giacenza, senza doversi ricordare di
// farlo due volte. I movimenti sono per tutto il resto: la rettifica
// d'inventario, il consumo di produzione, il carico che non viene da un ordine.
//
// Ne segue una conseguenza che va detta: **cancellare un ordine ricevuto toglie
// la sua merce dal magazzino.** È coerente — quel carico esisteva perché
// esisteva quell'ordine — ma chi cancella un ordine vecchio va avvisato.

const MOVEMENT_KINDS = {
  rettifica: 'Rettifica inventario',
  carico: 'Carico manuale',
  scarico: 'Consumo di produzione',
  // ── Conto lavoro ──
  // Il materiale che parte verso un terzista **esce dal magazzino**: chi va allo
  // scaffale non lo trova, ed è lo stesso gesto del consumo di produzione. Che
  // sia ancora roba nostra lo racconta il prospetto «presso terzi», che si
  // calcola da questi due movimenti — non da un saldo scritto da qualche parte.
  clOut: 'Uscita a conto lavoro',
  clIn: 'Rientro da conto lavoro',
  // ── Il passaggio da una fase alla successiva ──
  // Un pezzo che torna da un terzista per andarne a un altro non entra e non
  // esce dal magazzino: **cambia luogo a quantita' invariata**. Contarlo come
  // carico e poi come scarico farebbe comparire a scaffale un semilavorato che
  // a scaffale non c'e' mai stato, e il codice prodotto si caricherebbe una
  // volta per ogni terzista che l'ha toccato.
  //
  // Porta due fornitori: `supplierId` e' **dove va** (nullo = torna da noi) e
  // `fromSupplierId` e' **da dove viene** (nullo = parte da noi). Un movimento
  // per gesto, non due: due si sarebbero potuti registrare a meta'.
  clStep: 'Passaggio di lavorazione',
};
// I tipi che muovono materiale verso un terzista e indietro. Portano un
// fornitore, e senza quello il prospetto non saprebbe da chi andare a riprendere
// la merce.
const CL_KINDS = ['clOut', 'clIn', 'clStep'];
function isContoLavoroKind(k) { return CL_KINDS.includes(k); }
// ─── La regola dell'esistente, con la sua unica eccezione ───
//
//   esistente = Sigma ricevuto + Sigma movimenti **che toccano il magazzino**
//
// `clStep` non lo tocca: dice **dove sta** un pezzo, non quanti ce ne sono. E'
// l'unica eccezione alla regola scritta in cima al file, ed e' scritta qui in
// un predicato solo — non in un `if` sparso in ogni punto che somma movimenti,
// dove il prossimo lettore ne dimenticherebbe uno.
function movimentoToccaMagazzino(kind) { return kind !== 'clStep'; }
// Il luogo «in casa, fra due fasi»: i pezzi tornati da un terzista che devono
// ancora andare al successivo. Non sono a magazzino (non li ha caricati
// nessuno) e non sono presso nessun terzista. Ha una chiave sua e non la
// stringa vuota, che nell'indice significa gia' «movimento senza fornitore».
const CL_WIP = '@wip';
function clLuogoNome(id) { return id === CL_WIP ? 'in casa, fra due fasi' : (supplierName(id) || 'senza fornitore'); }
// Stati in cui la merce è davvero attesa. Una bozza non è in arrivo: non è
// ancora uscita di qui, e contarla farebbe rimandare acquisti che nessuno ha
// ordinato.
const ORDER_INCOMING_STATES = ['inviato', 'confermato', 'parziale'];
// Tipi che si tengono a magazzino. Un assieme si produce, non si stocca: la sua
// giacenza sarebbe quella dei suoi componenti contata due volte.
function hasStock(it) { return !!it && (it.type === 'materiale' || it.type === 'acquistato' || it.type === 'parte'); }

// ─── Indice delle giacenze ───
// Stesso ciclo di vita degli altri indici (`invalidateCaches()` lo azzera):
// senza, la lista del fabbisogno rileggerebbe tutti gli ordini e tutti i
// movimenti per ogni riga.
let _stockIdx = null;
function stockIndex() {
  if (_stockIdx) return _stockIdx;
  const idx = new Map();
  const tocca = id => {
    let e = idx.get(id);
    if (!e) { e = { onHand: 0, incoming: 0, arrivi: [] }; idx.set(id, e); }
    return e;
  };
  (db.orders || []).forEach(o => {
    const attesa = ORDER_INCOMING_STATES.includes(o.status);
    (o.lines || []).forEach(l => {
      if (!l.itemId) return;                       // riga manuale: non è un articolo a catalogo
      // La riga d'ordine è nell'unità del fornitore, che può non essere quella
      // di gestione: lui consegna 120 kg, il magazzino conta 15 m. Senza questa
      // conversione la giacenza sarebbe sbagliata di un fattore, e con lei il
      // fabbisogno netto — cioè si smetterebbe di comprare qualcosa che serve.
      const it = getItem(l.itemId);
      const inGestione = q => (it ? fromAltUom(it, q, l.uom) : (Number(q) || 0));
      const ric = Number(l.received) || 0;
      if (ric) tocca(l.itemId).onHand += inGestione(ric);
      if (!attesa) return;
      const manca = (Number(l.qty) || 0) - ric;
      if (manca > 0) {
        const e = tocca(l.itemId);
        e.incoming += inGestione(manca);
        // Non basta sapere CHE arriva: per dire a una commessa se il materiale
        // c'è in tempo bisogna sapere QUANDO. La data è quella confermata dal
        // fornitore se l'ha data, altrimenti quella che gli abbiamo chiesto: la
        // stessa coppia che legge orderWorstDelay(). La quantità passa dalla
        // stessa conversione dell'in arrivo, o si confronterebbero unità
        // diverse e il ritardo scatterebbe a caso.
        e.arrivi.push({ orderId: o.id, number: o.number || '', qty: inGestione(manca),
          eta: l.confirmedDate || l.deliveryDate || '' });
      }
    });
  });
  (db.movements || []).forEach(m => {
    if (!m.itemId) return;
    // Il passaggio di lavorazione sposta un pezzo, non lo carica: vedi
    // movimentoToccaMagazzino.
    if (!movimentoToccaMagazzino(m.kind)) return;
    tocca(m.itemId).onHand += Number(m.qty) || 0;   // i consumi sono già negativi
  });
  _stockIdx = idx;
  return idx;
}
function invalidateStock() { _stockIdx = null; _commitIdx = null; _clIdx = null; }
function stockOf(itemId) { return stockIndex().get(itemId) || { onHand: 0, incoming: 0, arrivi: [] }; }
function onHandOf(itemId) { return stockOf(itemId).onHand; }
function incomingOf(itemId) { return stockOf(itemId).incoming; }
// Quanto di ciò che è in arrivo arriva ENTRO una data, e cosa arriva dopo.
// Serve a distinguere due situazioni che il netto confonde: «non c'è e va
// comprato» e «c'è, ma arriva dopo che serviva». La prima costa un lead time,
// la seconda una telefonata al fornitore.
//
// Un arrivo senza data non è un ritardo: è un'incognita, e si conta in tempo.
// Trattarlo come tardivo farebbe rumore su ogni base dati in cui le date degli
// ordini non si compilano — stessa scelta di leadDaysOfRow(), che senza il dato
// non inventa un anticipo.
function incomingEntro(itemId, data) {
  let inTempo = 0;
  const tardivi = [];
  (stockOf(itemId).arrivi || []).forEach(a => {
    if (!data || !a.eta || a.eta <= data) inTempo += a.qty;
    else tardivi.push(a);
  });
  tardivi.sort((a, b) => String(a.eta).localeCompare(String(b.eta)));
  return { inTempo, tardivi };
}

// ─── Indice degli impegni ───
// L'esistente da solo risponde alla domanda sbagliata. «Ce ne sono 100» non
// significa «ne posso usare 100»: se un altro piano aperto ne chiede già 80,
// liberi ce ne sono 20. Finché questo conto non c'era, due piani sugli stessi
// articoli si dichiaravano **coperti entrambi** e la stessa merce veniva
// promessa due volte — un errore che si scopre solo quando il secondo piano va
// in produzione e il materiale non c'è.
//
// L'impegno è **calcolato**, come l'esistente, e per la stessa ragione: nessun
// campo `impegnato` da tenere allineato, nessuna prenotazione da ricordarsi di
// sciogliere. Un piano che si chiude libera la sua merce da sé.
//
// Cosa impegna: i piani **aperti** (`active !== false`). Chiudere un piano è il
// gesto con cui si dice «questo non serve più»; senza di esso ogni piano mai
// creato continuerebbe a bloccare materiale per sempre, e dopo un anno d'uso
// nessun articolo risulterebbe più disponibile.
let _commitIdx = null;
function commitIndex() {
  if (_commitIdx) return _commitIdx;
  const idx = new Map();
  // `mrpExplode` sta in views-mrp.js, caricato dopo questo file: a runtime c'è
  // sempre, ma la guardia evita di legare l'ordine dei tag <script>.
  if (typeof mrpExplode === 'function') {
    (db.plans || []).forEach(p => {
      if (p.active === false || !(p.lines || []).length) return;
      mrpExplode(p.lines).buy.forEach(e => {
        let l = idx.get(e.item.id);
        if (!l) { l = []; idx.set(e.item.id, l); }
        l.push({ planId: p.id, number: p.number || '', title: p.title || '', qty: e.qty, due: e.due || '' });
      });
    });
  }
  _commitIdx = idx;
  return idx;
}
// Chi impegna questo articolo, **escluso** il piano da cui si sta guardando:
// un piano non fa concorrenza a sé stesso, e sottrargli il proprio fabbisogno
// gli farebbe comprare tutto due volte.
// L'esclusione è un piano solo quando a guardare è una riga di fabbisogno (dal
// suo piano), ma è un **insieme** quando a guardare è una commessa: due piani
// della stessa commessa non si fanno concorrenza, sono la stessa domanda scritta
// su due fogli. Senza questo, con 100 pz a magazzino e due piani che ne chiedono
// 100 a testa, ognuno dei due si vedrebbe scoperto per colpa dell'altro.
function commitsOn(itemId, except) {
  const escl = except instanceof Set ? except
    : new Set(Array.isArray(except) ? except : (except ? [except] : []));
  return (commitIndex().get(itemId) || []).filter(c => !escl.has(c.planId));
}
function committedOf(itemId, exceptPlanId) {
  return commitsOn(itemId, exceptPlanId).reduce((s, c) => s + c.qty, 0);
}
// Quanto se ne può ancora promettere. Può essere negativo, e in quel caso lo si
// mostra così com'è: significa che i piani aperti hanno già promesso più merce
// di quanta ne esista, ed è esattamente il numero che serve vedere.
function freeStockOf(itemId, exceptPlanId) {
  const s = stockOf(itemId);
  return s.onHand + s.incoming - committedOf(itemId, exceptPlanId);
}

function safetyStockOf(it) { return Math.max(0, Number(it && it.safetyStock) || 0); }
function lotSizeOf(it) { return Math.max(0, Number(it && it.lotSize) || 0); }
// Come si compra il lotto: a multipli esatti (predefinito, comportamento
// storico) oppure come semplice soglia minima oltre la quale ogni quantità va
// bene. Senza scelta esplicita resta 'multiple' — un articolo con `lotSize`
// già impostato non deve cambiare comportamento in silenzio.
function lotModeOf(it) { return (it && it.lotMode === 'min') ? 'min' : 'multiple'; }

// ─── Il conto ───
// netto = quanto manca davvero, arrotondato al lotto del fornitore.
// Logica pura, senza DOM: è la parte che la suite verifica.
//
// `committed` sta dalla parte del fabbisogno, insieme alla scorta minima, non
// dalla parte del magazzino: sono entrambi merce che c'è ma non si può usare.
// Scriverlo come sottrazione dall'esistente darebbe lo stesso numero e la
// domanda sbagliata — «quanto ne ho» invece di «quanto me ne serve».
function netRequirement(lordo, onHand, incoming, safety, lotSize, committed, lotMode) {
  const l = Number(lordo) || 0;
  const mancante = l + (Number(safety) || 0) + (Number(committed) || 0)
    - (Number(onHand) || 0) - (Number(incoming) || 0);
  if (!(mancante > 0)) return 0;
  const lot = Number(lotSize) || 0;
  if (!(lot > 0)) return mancante;
  // Lotto minimo: sotto soglia si compra la soglia, sopra si compra esattamente
  // quanto manca — nessun passo, solo un pavimento.
  if (lotMode === 'min') return mancante <= lot ? lot : mancante;
  // Multiplo esatto: si arrotonda per eccesso, comprare mezzo lotto non è
  // un'opzione che il fornitore offre.
  return Math.ceil(mancante / lot - 1e-9) * lot;
}
// I dati di giacenza di una riga di fabbisogno, pronti da mostrare.
// `committed` è quanto gli **altri** piani aperti hanno già promesso: lo passa
// il chiamante, perché solo lui sa da quale piano si sta guardando.
function stockFor(it, lordo, committed) {
  const s = stockOf(it.id);
  const safety = safetyStockOf(it);
  const imp = Math.max(0, Number(committed) || 0);
  const net = netRequirement(lordo, s.onHand, s.incoming, safety, lotSizeOf(it), imp, lotModeOf(it));
  return { onHand: s.onHand, incoming: s.incoming, safety, lotSize: lotSizeOf(it), lotMode: lotModeOf(it),
    committed: imp, libero: s.onHand + s.incoming - imp, net,
    coperto: net === 0 && lordo > 0 };
}

// ─── Movimenti ───
function movementsOf(itemId) {
  return (db.movements || [])
    .map((m, i) => ({ m, i }))
    .filter(x => x.m.itemId === itemId)
    .sort((a, b) => {
      const c = String(b.m.date || '').localeCompare(String(a.m.date || ''));
      return c !== 0 ? c : b.i - a.i;
    })
    .map(x => x.m);
}
// qty con segno: positiva carica, negativa scarica. La rettifica si registra
// come differenza rispetto a ciò che c'è, non come valore assoluto: così lo
// storico dice *cosa è cambiato*, che è la domanda a cui deve rispondere.
//
// `extra` è opzionale e porta il contorno del conto lavoro: da chi sta la merce
// (`supplierId`), da chi arrivava (`fromSupplierId`, solo sui passaggi) e quale
// ordine la giustifica (`orderId`, `lineId`). I tre chiamanti che c'erano prima
// non lo passano e continuano a funzionare.
function addMovement(itemId, kind, qty, note, extra) {
  const it = getItem(itemId);
  if (!it || !hasStock(it)) return null;
  const q = Number(qty) || 0;
  if (!q) return null;                       // un movimento da zero non è un movimento
  const e = extra || {};
  const rec = { id: gid(), itemId, kind: MOVEMENT_KINDS[kind] ? kind : 'rettifica',
    qty: q, date: nowISO(), note: String(note || '').trim(),
    supplierId: e.supplierId || null, fromSupplierId: e.fromSupplierId || null,
    orderId: e.orderId || null, lineId: e.lineId || null };
  return Store.insert('movements', rec);
}

// ─── Materiale presso i terzisti ───
// Si calcola dai **soli movimenti**, come la giacenza si calcola da ricevimenti e
// movimenti: non esiste nessun campo di saldo da tenere allineato, e quindi non
// esiste niente che possa divergere. È la stessa regola per cui non esiste
// `items.onHand`, applicata a un secondo numero.
//
// Il saldo è per **coppia (fornitore, articolo)** e non per articolo soltanto:
// quando esce del materiale e rientrano dei pezzi lavorati i due codici sono
// diversi, e un saldo unico per articolo non significherebbe niente. Il
// prospetto mostra da chi sta cosa, ed è l'unica lettura onesta.
//
// Il **passaggio** tocca due luoghi con un movimento solo: esce da dove era e
// arriva dove va. Uno dei due può essere «in casa, fra due fasi» (CL_WIP), che
// è un luogo a tutti gli effetti — i pezzi ci sono, non sono a magazzino e non
// sono da nessun terzista, e non nominarlo li farebbe sparire.
let _clIdx = null;
function clIndex() {
  if (_clIdx) return _clIdx;
  const idx = new Map();
  const tocca = (luogo, m) => {
    if (!idx.has(luogo)) idx.set(luogo, new Map());
    const perSup = idx.get(luogo);
    let e = perSup.get(m.itemId);
    if (!e) { e = { itemId: m.itemId, out: 0, in: 0, saldo: 0, righe: [] }; perSup.set(m.itemId, e); }
    e.righe.push(m);
    return e;
  };
  // I movimenti si guardano **in ordine di data**, e non e' un dettaglio: il
  // saldo di un luogo non e' `uscito - rientrato` sommato alla fine, ma quel
  // che resta li' dopo ogni passaggio, e non puo' scendere sotto zero.
  //
  // La differenza si vede quando lo **stesso** terzista lavora un pezzo due
  // volte. Quando i perni tornano da Beta la prima volta, dal registro escono
  // senza esserci mai entrati — erano arrivati da lui come tondo, e la
  // trasformazione non la scrive nessuno. Sommando alla fine, quella partenza
  // senza arrivo annullerebbe il ritorno vero della seconda tratta e il
  // prospetto direbbe che da Beta non c'e' niente, mentre i pezzi sono la'.
  //
  // Un saldo negativo e' come si vede una **trasformazione**, non un debito: e'
  // la stessa regola gia' scritta per il prospetto, applicata a ogni passaggio
  // invece che al totale.
  const eventi = [];
  (db.movements || []).forEach(m => {
    if (!m.itemId || !isContoLavoroKind(m.kind)) return;
    // L'uscita è negativa, il rientro positivo: qui si guardano i valori
    // assoluti, perché «uscito 20» si legge meglio di «uscito −20».
    const q = Math.abs(Number(m.qty) || 0);
    if (m.kind === 'clStep') {
      const da = m.fromSupplierId || CL_WIP;
      const a = m.supplierId || CL_WIP;
      if (da === a) return;                    // un passaggio che non sposta niente
      eventi.push({ m, luogo: da, delta: -q });
      eventi.push({ m, luogo: a, delta: q });
      return;
    }
    eventi.push({ m, luogo: m.supplierId || '', delta: m.kind === 'clOut' ? q : -q });
  });
  eventi.sort((a, b) => String(a.m.date || '').localeCompare(String(b.m.date || '')));
  eventi.forEach(ev => {
    const e = tocca(ev.luogo, ev.m);
    if (ev.delta > 0) e.out += ev.delta; else e.in += -ev.delta;
    e.saldo = Math.max(0, e.saldo + ev.delta);
  });
  _clIdx = idx;
  return idx;
}
// Quanto di questo articolo sta fuori, sommando tutti i terzisti.
//
// Solo i saldi **positivi**. Un saldo negativo — più rientri che uscite su uno
// stesso codice — non è merce mancante: è come si vede una **trasformazione**,
// quando esce del materiale e torna un pezzo con un altro codice. Sommarlo
// scalerebbe da un articolo quello che sta fuori come un altro, e mostrerebbe
// «presso terzi −4» su un pezzo che dal terzista non c'è mai stato.
// I pezzi «in casa fra due fasi» non ci stanno: non sono presso nessuno. Si
// contano a parte, con inWorkOf().
function atSupplierOf(itemId) {
  let n = 0;
  clIndex().forEach((perSup, luogo) => {
    if (luogo === CL_WIP) return;
    const e = perSup.get(itemId); if (e && e.saldo > 0) n += e.saldo;
  });
  return n;
}
// Quanti pezzi sono tornati da un terzista e devono ancora andare al successivo.
// Non sono a magazzino e non sono fuori: esistono, e questo è l'unico posto che
// li conta.
function inWorkOf(itemId) {
  const e = (clIndex().get(CL_WIP) || new Map()).get(itemId);
  return e && e.saldo > 0 ? e.saldo : 0;
}
// Il prospetto in forma piatta: una riga per coppia fornitore/articolo con un
// saldo ancora aperto. Alimenta la modale di dettaglio e l'export.
function atSupplierRows() {
  const out = [];
  clIndex().forEach((perSup, luogo) => perSup.forEach(e => {
    // Solo ciò che è davvero fuori. Conto chiuso (zero) e saldo negativo (il
    // rientro di un codice diverso da quello uscito) non sono roba nostra dal
    // terzista, e nel prospetto sarebbero due righe da spiegare ogni volta.
    if (e.saldo < 0.000001) return;
    const it = getItem(e.itemId);
    const ultima = e.righe.reduce((d, m) => (String(m.date || '') > d ? String(m.date || '') : d), '');
    const ordini = Array.from(new Set(e.righe.map(m => m.orderId).filter(Boolean)))
      .map(clDocById).filter(Boolean).map(o => o.number);
    out.push({ supplierId: luogo === CL_WIP ? '' : luogo, wip: luogo === CL_WIP,
      supplierName: clLuogoNome(luogo),
      itemId: e.itemId, item: it, out: e.out, in: e.in, saldo: e.saldo,
      ordini, ultima: ultima.slice(0, 10), righe: e.righe });
  }));
  return out.sort((a, b) => a.supplierName.localeCompare(b.supplierName)
    || String(a.item && a.item.code).localeCompare(String(b.item && b.item.code)));
}

// ─── Interfaccia: scheda articolo ───
function stockPanelHtml(it) {
  if (!hasStock(it)) return '';
  const s = stockOf(it.id);
  const sotto = safetyStockOf(it) > 0 && s.onHand < safetyStockOf(it);
  // Impegnato e libero: la scheda articolo è il posto dove si guarda prima di
  // promettere qualcosa, e «ce ne sono 100» da solo è una risposta che inganna.
  const imp = commitsOn(it.id, null);
  const impQty = imp.reduce((a, c) => a + c.qty, 0);
  const libero = s.onHand + s.incoming - impQty;
  const u = itemUom(it);
  const elencoImp = imp.map(c => `${c.number}${c.title ? ' (' + c.title + ')' : ''}: ${fmtUom(c.qty, u)}`).join(' · ');
  return `<div class="cloud-section" style="margin-top:12px${sotto ? ';border-color:var(--red)' : ''}">
    <div style="flex:1">
      <strong>${ico('package', 'tinted', '')} Magazzino</strong>
      <div class="cost-summary" style="margin:8px 0">
        ${kpi('Esistente', fmtUom(s.onHand, u), sotto ? 'orange' : '')}
        ${kpi('In arrivo', fmtUom(s.incoming, u), 'accent')}
        ${kpi('Impegnato', fmtUom(impQty, u), impQty > 0 ? 'orange' : '')}
        ${kpi('Libero', fmtUom(libero, u), libero < 0 ? 'red' : '')}
        ${kpi('Scorta minima', fmtUom(safetyStockOf(it), u), '')}
      </div>
      ${sotto ? '<p style="color:var(--red);margin:0 0 8px">' + ico('warning', 'tinted', '') + ' Sotto la scorta minima.</p>' : ''}
      ${libero < 0 ? '<p style="color:var(--red);margin:0 0 8px">' + ico('warning', 'tinted', '') + ' I piani aperti ne hanno promesso più di quanto ne esista o ne sia in arrivo.</p>' : ''}
      <p class="empty-text" style="text-align:left;padding:0 0 8px">L'esistente è calcolato: <strong>ricevuto sugli ordini + movimenti</strong>. Non si scrive a mano — si registra una rettifica, così resta scritto anche perché è cambiato.</p>
      ${impQty > 0 ? `<p class="empty-text" style="text-align:left;padding:0 0 8px">Impegnato dai piani di fabbisogno <strong>aperti</strong>: ${esc(elencoImp)}. <em>Libero = esistente + in arrivo − impegnato</em>: è quanto se ne può ancora promettere. Chiudere un piano libera la sua quota.</p>` : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn-outline" onclick="stockAdjustModal('${it.id}')">${ico('scale', 'tinted', '')} Rettifica giacenza</button>
        <button class="btn-outline" onclick="stockMovementsModal('${it.id}')">${ico('clock', 'tinted', '')} Movimenti (${movementsOf(it.id).length})</button>
      </div>
    </div></div>`;
}

function stockAdjustModal(itemId) {
  if (!roleGuard('catalog')) return;
  const it = getItem(itemId); if (!it || !hasStock(it)) return;
  const attuale = onHandOf(it.id);
  openModal(`<h3>${ico('scale', 'tinted pill', '')} Rettifica giacenza — ${esc(it.code)}</h3>
    <p>Esistente calcolato adesso: <strong>${fmtUom(attuale, itemUom(it))}</strong>.</p>
    <div class="modal-grid">
      <div class="modal-field"><label>Tipo</label><select id="mv-kind">
        ${MOVEMENT_MANUAL_KINDS.map(k => `<option value="${k}">${esc(MOVEMENT_KINDS[k])}</option>`).join('')}
      </select></div>
      <div class="modal-field"><label>${labelUom('Quantità contata / movimentata', itemUom(it))}</label>
        <input type="number" id="mv-qty" step="any" value="${attuale}"></div>
    </div>
    <div class="modal-grid" id="mv-cl-box" style="display:none">
      <div class="modal-field"><label>Terzista</label><select id="mv-sup">
        <option value="">— scegli —</option>
        ${(db.suppliers || []).filter(x => x.active !== false).sort((a, b) => String(a.name).localeCompare(String(b.name)))
    .map(x => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}
      </select></div>
      <div class="modal-field"><label>Ordine di conto lavoro (facoltativo)</label><select id="mv-ord">
        <option value="">— nessuno —</option>
        ${[].concat(db.workOrders || [], (db.orders || []).filter(o => (o.lines || []).some(l => l.phaseKey)))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .map(o => `<option value="${esc(o.id)}">${esc(o.number)}${o.supplierId ? ' · ' + esc(supplierName(o.supplierId) || '') : ''}</option>`).join('')}
      </select></div>
    </div>
    <p class="empty-text" style="text-align:left;padding:0 0 8px" id="mv-hint"></p>
    <div class="modal-field"><label>Nota</label>
      <input id="mv-note" placeholder="es. inventario del 31/08, o commessa 240" autocomplete="off"></div>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="saveStockAdjust('${it.id}')">Registra</button>
    </div>`, false, 'form');
  stockAdjustHint(itemId);
  const sel = document.getElementById('mv-kind'); if (sel) sel.onchange = () => stockAdjustHint(itemId);
}
// La rettifica si inserisce come quantità *contata*, gli altri come quantità
// *movimentata*: sono due domande diverse e confonderle produce giacenze
// sbagliate in silenzio.
// Il **passaggio di lavorazione** non è qui: vuole due luoghi (da chi, a chi) e
// li sa solo la riga di ordine di lavoro che lo giustifica. Offrirlo a mano
// avrebbe chiesto due domande a cui, senza il documento davanti, si risponde a
// caso — e un saldo appeso al luogo sbagliato non si riconosce più.
const MOVEMENT_MANUAL_KINDS = Object.keys(MOVEMENT_KINDS).filter(k => k !== 'clStep');
const MOVEMENT_HINTS = {
  rettifica: 'Scrivi quanti ce ne sono <strong>davvero</strong>: viene registrata la differenza rispetto all&rsquo;esistente calcolato.',
  scarico: 'Scrivi quanti ne <strong>escono</strong>: verranno sottratti.',
  carico: 'Scrivi quanti ne <strong>entrano</strong>: verranno sommati.',
  clOut: 'Scrivi quanti ne <strong>spedisci al terzista</strong>: escono dal magazzino, perché allo scaffale non ci sono più. Restano roba tua, e il prospetto <em>presso terzi</em> dice da chi stanno.',
  clStep: 'Passaggio da una fase alla successiva: <strong>non tocca il magazzino</strong>. Si registra dalla riga dell&rsquo;ordine di lavoro, che sa da chi arriva e a chi va.',
  clIn: 'Scrivi quanti ne <strong>rientrano dal terzista</strong>: entrano a magazzino. Se rientra un codice diverso da quello uscito (materiale fuori, pezzi finiti dentro) registra il rientro <strong>sul codice che torna</strong>.',
};
function stockAdjustHint(itemId) {
  const el = document.getElementById('mv-hint');
  const kind = val('mv-kind');
  // Il fornitore compare solo dove serve: su una rettifica sarebbe una domanda
  // senza risposta.
  const box = document.getElementById('mv-cl-box');
  if (box) box.style.display = isContoLavoroKind(kind) ? '' : 'none';
  if (el) el.innerHTML = MOVEMENT_HINTS[kind] || MOVEMENT_HINTS.carico;
}
function saveStockAdjust(itemId) {
  if (!roleGuard('catalog')) return;
  const it = getItem(itemId); if (!it) return;
  const kind = MOVEMENT_KINDS[val('mv-kind')] ? val('mv-kind') : 'rettifica';
  const inserita = rawNum('mv-qty');
  if (kind !== 'rettifica' && inserita < 0) { showToast('Inserisci una quantità positiva: è il tipo a decidere il verso', 'error'); return; }
  // Senza terzista il movimento non è ricostruibile: il prospetto non saprebbe
  // da chi andare a riprendere la merce, e il saldo resterebbe appeso a nessuno.
  const supplierId = isContoLavoroKind(kind) ? val('mv-sup') : '';
  if (isContoLavoroKind(kind) && !supplierId) { showToast('Scegli il terzista: senza, non si sa da chi sta la merce', 'error'); return; }
  const uscita = kind === 'scarico' || kind === 'clOut';
  const delta = kind === 'rettifica' ? (inserita - onHandOf(it.id)) : (uscita ? -inserita : inserita);
  if (!delta) { showToast('Nessuna differenza da registrare'); closeModal(); return; }
  addMovement(it.id, kind, delta, val('mv-note'), { supplierId, orderId: val('mv-ord') });
  closeModal();
  if (typeof renderCatalogs === 'function') renderCatalogs();
  // Il toast passa già da esc(): qui l'unità va concatenata cruda, non da fmtUom.
  showToast(`Giacenza aggiornata: ${fmtQty(onHandOf(it.id))} ${itemUom(it)}`.trim());
}

function stockMovementsModal(itemId) {
  const it = getItem(itemId); if (!it) return;
  const mv = movementsOf(it.id);
  const ordini = (db.orders || []).filter(o => (o.lines || []).some(l => l.itemId === it.id && (Number(l.received) || 0) > 0));
  const u = itemUom(it);
  const righeMv = mv.map(m => `<div class="mgmt-item">
      <span style="width:150px">${esc(MOVEMENT_KINDS[m.kind] || m.kind)}</span>
      <span class="empty-text" style="padding:0;width:90px">${esc(String(m.date || '').slice(0, 10))}</span>
      <span style="flex:1">${m.supplierId ? `<strong>${esc(supplierName(m.supplierId) || '')}</strong>${m.orderId ? ' · ' + esc((clDocById(m.orderId) || {}).number || '') : ''}${m.note ? ' — ' : ''}` : ''}${esc(m.note || '')}</span>
      <span style="font-family:var(--mono);color:${m.qty < 0 ? 'var(--red)' : 'var(--green)'}">${m.qty > 0 ? '+' : ''}${fmtUom(m.qty, u)}</span>
      <button class="mini-btn danger" onclick="delMovement('${m.id}','${it.id}')" title="Elimina movimento">${ico('trash', 'tinted', 'Elimina movimento')}</button>
    </div>`).join('');
  const righeOrd = ordini.map(o => {
    const q = (o.lines || []).filter(l => l.itemId === it.id).reduce((s, l) => s + (Number(l.received) || 0), 0);
    return `<div class="mgmt-item">
      <span style="width:150px">Ricevuto da ordine</span>
      <span class="empty-text" style="padding:0;width:90px">${esc(String(o.date || '').slice(0, 10))}</span>
      <span style="flex:1">${esc(o.number)}${o.title ? ' — ' + esc(o.title) : ''}</span>
      <span style="font-family:var(--mono);color:var(--green)">+${fmtUom(q, u)}</span>
      <span style="width:28px"></span>
    </div>`;
  }).join('');
  openModal(`<h3>${ico('clock', 'tinted pill', '')} Movimenti — ${esc(it.code)} ${esc(it.name)}</h3>
    <p>Esistente: <strong>${fmtUom(onHandOf(it.id), u)}</strong>, in arrivo <strong>${fmtUom(incomingOf(it.id), u)}</strong>.</p>
    ${righeOrd ? `<h4 class="settings-group-title">Dai ricevimenti d'ordine</h4><div style="display:flex;flex-direction:column;gap:6px">${righeOrd}</div>
      <p class="empty-text" style="text-align:left;padding:6px 0 0">Queste righe si correggono sull'ordine, dove è registrato il ricevimento.</p>` : ''}
    ${righeMv ? `<h4 class="settings-group-title">Rettifiche e consumi</h4><div style="display:flex;flex-direction:column;gap:6px">${righeMv}</div>` : ''}
    ${!righeMv && !righeOrd ? '<div class="empty-text">Nessun movimento. La giacenza è zero.</div>' : ''}
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Chiudi</button></div>`, true, 'storico');
}
// ─── Movimenti di conto lavoro dalla riga d'ordine ───
// È il posto naturale per registrarli: il terzista e l'ordine sono già decisi,
// e resta da scegliere solo cosa esce (o cosa rientra) e quanto. Dal Magazzino
// si può fare lo stesso senza un ordine — capita di spedire prima.
// Il documento che giustifica il movimento è un **ordine di lavoro**; resta
// accettato un ordine d'acquisto per le righe di conto lavoro finite lì prima
// della separazione fra ODA e ODL.
function clDocById(id) {
  return (db.workOrders || []).find(x => x.id === id) || (db.orders || []).find(x => x.id === id) || null;
}
// ─── Conto lavoro: le tratte, e i due soli punti in cui il magazzino si muove ───
//
// Una **tratta** è una sequenza massimale di fasi consecutive dello stesso ciclo
// affidate allo stesso terzista. È l'unità di lavoro vera: chiedere a Beta le
// fasi 20 e 30 è **una** commessa, non due, e un ordine di lavoro ne contiene
// una per parte.
//
// Il magazzino si muove in due punti soli, e sono i due estremi del **ciclo**,
// non quelli del documento:
//
//   prima tratta esterna  → esce il **materiale del ciclo**, e scarica  (clOut)
//   ultima tratta esterna → entra il **pezzo finito**, e carica         (clIn)
//   ogni altro estremo    → si sposta il **pezzo stesso**, e basta      (clStep)
//
// Senza questa distinzione una parte con fasi 10 interna, 20 Beta, 30 interna,
// 40 Beta ha due ordini di lavoro da Beta, ognuno dei quali è prima e ultima
// riga di sé stesso: il materiale uscirebbe due volte e il pezzo finito si
// caricherebbe due volte.
//
// Le fasi interne **dopo** l'ultima tratta esterna non spostano il carico: il
// pezzo entra a magazzino quando torna dal terzista, e la lavorazione che resta
// la si fa su un pezzo già a scaffale. È una scelta, non una dimenticanza —
// l'alternativa sarebbe non caricarlo mai, perché una fase interna non ha un
// rientro da registrare.
function clPhaseItemId(l) { return l && l.phaseKey ? String(l.phaseKey).split('#')[0] : ''; }
function clPhaseIndex(l) { return l && l.phaseKey ? (parseInt(String(l.phaseKey).split('#')[1], 10) || 0) : 0; }
// Tutte le fasi che una riga copre: `phaseKeys` le elenca, `phaseKey` nomina la
// prima. Le righe scritte prima che le tratte esistessero ne coprono una sola.
function clPhaseKeys(l) {
  if (!l) return [];
  const s = l.phaseKeys || l.phaseKey || '';
  return String(s).split(',').map(x => x.trim()).filter(Boolean);
}
// Le tratte del ciclo di una parte, in ordine di esecuzione. `passata` conta
// quante volte lo **stesso** terzista è già comparso prima: è ciò che separa le
// fasi 20 e 40 di Beta in due ordini di lavoro distinti.
function clCycleRuns(part) {
  const runs = [];
  let opIndex = 0;
  ((part && part.cycle) || []).forEach(r => {
    if (r.kind !== 'op') return;
    const k = opIndex++;
    const sup = r.supplierId || '';
    const ultima = runs[runs.length - 1];
    // Consecutive **e** dallo stesso terzista: basta una fase interna in mezzo
    // per spezzare la tratta, ed è giusto — il pezzo torna da noi.
    if (ultima && ultima.supplierId === sup && ultima.to === k - 1) { ultima.to = k; return; }
    runs.push({ from: k, to: k, supplierId: sup, esterna: !!sup, passata: 0 });
  });
  const visti = new Map();
  runs.forEach(t => {
    if (!t.esterna) return;
    const n = visti.get(t.supplierId) || 0;
    t.passata = n;
    visti.set(t.supplierId, n + 1);
  });
  return runs;
}
function clRunAt(part, opIndex) {
  return clCycleRuns(part).find(t => opIndex >= t.from && opIndex <= t.to) || null;
}
// La passata di una riga di documento: quante volte quel terzista ha gia' avuto
// il pezzo prima di questa tratta. Serve a non far finire due passate nello
// stesso ordine di lavoro.
function clPassataDiRiga(l) {
  const t = clRunAt(getItem(clPhaseItemId(l)), clPhaseIndex(l));
  return t ? t.passata : 0;
}
function clExternalRuns(part) { return clCycleRuns(part).filter(t => t.esterna); }
function clFirstExternalRun(part) { return clExternalRuns(part)[0] || null; }
function clLastExternalRun(part) { const e = clExternalRuns(part); return e[e.length - 1] || null; }

// ─── Il ruolo di una riga, in due dimensioni ───
// **Dove** sta nel documento: la prima riga di una tratta ha l'uscita, l'ultima
// il rientro. Con le righe unite ogni riga *è* una tratta e le ha entrambe; su
// un ordine di lavoro vecchio, una riga per fase, il conto ricade sugli stessi
// ancoraggi di prima.
// **Che cosa** muove: magazzino ai due estremi del ciclo, passaggio altrove.
function clLineRole(o, l) {
  const vuoto = { out: false, in: false, outKind: '', inKind: '', prima: null, ultima: null, part: null, run: null };
  const partId = clPhaseItemId(l);
  if (!partId) return vuoto;
  const part = getItem(partId);
  // Parte senza ciclo leggibile: tutte le sue righe fanno una tratta sola, che
  // è esattamente il comportamento di prima delle tratte.
  const runDi = x => { const t = clRunAt(part, clPhaseIndex(x)); return t ? t.from : -1; };
  const mia = runDi(l);
  const sorelle = (o.lines || []).filter(x => clPhaseItemId(x) === partId && runDi(x) === mia);
  if (!sorelle.length) return vuoto;
  const prima = sorelle.reduce((a, b) => (clPhaseIndex(b) < clPhaseIndex(a) ? b : a));
  const ultima = sorelle.reduce((a, b) => (clPhaseIndex(b) > clPhaseIndex(a) ? b : a));
  const run = clRunAt(part, clPhaseIndex(l));
  let outKind, inKind;
  if (run && !run.esterna) {
    // Una fase che il ciclo fa in casa, messa qui apposta per mandarla fuori
    // questa volta (vedi odlPhasePickModal): è una gita a sé, non incatenata
    // alle tratte esterne del ciclo — esce e rientra qui, ai suoi due estremi,
    // non a quelli di un giro conto lavoro che non la riguarda. Senza questo
    // caso una fase così non toccava mai il magazzino: non essendo una tratta
    // esterna del ciclo, non coincideva mai con la prima o l'ultima.
    outKind = 'clOut'; inKind = 'clIn';
  } else {
    const primaEst = clFirstExternalRun(part);
    const ultimaEst = clLastExternalRun(part);
    const ePrimaDelCiclo = !!run && !!primaEst && run.from === primaEst.from;
    const eUltimaDelCiclo = !!run && !!ultimaEst && run.from === ultimaEst.from;
    outKind = ePrimaDelCiclo ? 'clOut' : 'clStep';
    inKind = eUltimaDelCiclo ? 'clIn' : 'clStep';
  }
  return {
    out: prima.id === l.id, in: ultima.id === l.id,
    outKind, inKind,
    prima, ultima, part, run,
  };
}
// Il materiale che esce è quello del **ciclo della parte**: le righe di distinta
// parte, moltiplicate per i pezzi del documento. Non è una scelta libera fra
// tutti gli articoli — è scritto nel ciclo, ed è lo stesso materiale che il
// fabbisogno ha già fatto comprare.
function clMaterialsOf(part, pezzi) {
  return ((part && part.cycle) || [])
    .filter(r => r.kind !== 'op' && r.itemId)
    .map(r => ({ item: getItem(r.itemId), perPezzo: Number(r.qty) || 0, qty: (Number(r.qty) || 0) * pezzi }))
    .filter(x => x.item && hasStock(x.item));
}
// ─── Quanto è già stato registrato su questa riga, in questo verso ───
// «Una volta sola» non è una regola che si possa lasciare alla memoria di chi
// registra: la scheda propone il **residuo**, e a residuo zero lo dice invece di
// riproporre il modulo come se niente fosse. I movimenti portano già l'ordine e
// la riga che li giustificano — il conto si legge da lì, senza nessun campo
// nuovo da tenere allineato.
function clRegistrato(o, l, verso) {
  const m = new Map();
  const uscita = verso === 'out';
  (db.movements || []).forEach(x => {
    if (x.orderId !== o.id || x.lineId !== l.id || !x.itemId) return;
    const suo = uscita
      ? (x.kind === 'clOut' || (x.kind === 'clStep' && x.supplierId === o.supplierId))
      : (x.kind === 'clIn' || (x.kind === 'clStep' && x.fromSupplierId === o.supplierId));
    if (!suo) return;
    m.set(x.itemId, (m.get(x.itemId) || 0) + Math.abs(Number(x.qty) || 0));
  });
  return m;
}

function clFromOdlModal(docId, lineId, verso) {
  if (!roleGuard('catalog')) return;
  const o = clDocById(docId); if (!o) return;
  const l = (o.lines || []).find(x => x.id === lineId); if (!l) return;
  if (!o.supplierId) { showToast('Il documento non ha un fornitore: senza, non si sa da chi sta la merce', 'error'); return; }
  const uscita = verso === 'out';
  const ruolo = clLineRole(o, l);
  const kind = uscita ? (ruolo.outKind || 'clOut') : (ruolo.inKind || 'clIn');
  const passaggio = kind === 'clStep';
  const parte = ruolo.part || getItem(clPhaseItemId(l));
  const pezzi = Number(l.qty) || 0;
  // In uscita dal **primo** estremo del ciclo esce il materiale; da ogni altro
  // esce il pezzo stesso, che è quello tornato dalla fase precedente.
  const righe = (uscita && !passaggio) ? clMaterialsOf(parte, pezzi)
    : (parte && hasStock(parte) ? [{ item: parte, perPezzo: 1, qty: pezzi }] : []);
  const gia = clRegistrato(o, l, verso);
  const titolo = uscita
    ? (passaggio ? 'Manda i pezzi al terzista' : 'Spedisci materiale al terzista')
    : (passaggio ? 'Ritira i pezzi dal terzista' : 'Registra rientro dal terzista');
  const testa = `<h3>${ico('factory', 'tinted pill', '')} ${esc(titolo)}</h3>
    <p>${esc(o.number)} · <strong>${esc(supplierName(o.supplierId) || '')}</strong> — ${esc(parte ? (parte.code || '') + ' ' + (parte.name || '') : l.description || '')}, ${fmtQty(pezzi)} ${esc(l.uom || 'pz')}</p>`;
  if (!righe.length) {
    openModal(`${testa}
      <div class="empty-text" style="text-align:left">${uscita
    ? 'Il ciclo di questa parte non ha materiale a magazzino: lo mette il terzista. Non c&rsquo;è niente da spedire, e infatti non c&rsquo;è niente da scaricare.'
    : 'Questa parte non si tiene a magazzino, quindi il rientro non ha nulla da registrare.'}</div>
      <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Chiudi</button></div>`, false, 'form');
    return;
  }
  const residuo = x => Math.max(0, x.qty - (gia.get(x.item.id) || 0));
  const tuttoFatto = righe.every(x => residuo(x) < 0.000001);
  const corpo = righe.map((x, i) => {
    const fatto = gia.get(x.item.id) || 0;
    return `<div class="mgmt-item">
      <span style="width:110px;font-family:var(--mono)">${esc(x.item.code || '')}</span>
      <span style="flex:1">${esc(x.item.name || '')}${uscita && !passaggio ? ` <span class="empty-text" style="padding:0">${fmtQty(x.perPezzo)} ${esc(itemUom(x.item))}/pz</span>` : ''}${fatto ? ` <span class="rfq-clavoro-tag" title="Già registrato su questa riga">già ${fmtQty(+fatto.toFixed(4))}</span>` : ''}</span>
      <input class="num" type="number" id="cl-q-${i}" min="0" step="any" value="${+residuo(x).toFixed(4)}" style="width:110px">
      <span class="empty-text" style="padding:0;width:40px">${esc(itemUom(x.item))}</span>
    </div>`;
  }).join('');
  window.__clRighe = righe.map(x => x.item.id);
  window.__clKind = kind;
  const spiega = passaggio
    ? 'È un <strong>passaggio di lavorazione</strong>: il pezzo cambia posto e <strong>il magazzino non si muove</strong>. Non è né un carico né uno scarico — il codice prodotto entra a magazzino una volta sola, al rientro dell&rsquo;ultima fase esterna del ciclo.'
    : (uscita
      ? 'Le quantità vengono dal <strong>ciclo</strong> moltiplicate per i pezzi dell&rsquo;ordine, e si possono correggere. Il materiale <strong>esce dal magazzino</strong>: allo scaffale non c&rsquo;è più, e il prospetto <em>presso terzi</em> dice da chi sta. Esce una volta sola, qui.'
      : 'I pezzi lavorati <strong>entrano a magazzino</strong>, ed è l&rsquo;unico punto in cui il codice prodotto si carica. Il materiale uscito non va rimesso dentro: il suo consumo è implicito in questa coppia.');
  openModal(`${testa}
    ${tuttoFatto ? `<div class="rfq-warn">${ico('warning', 'tinted', '')} Su questa riga è <strong>già stato registrato tutto</strong>. Registrare ancora è possibile — capita dopo uno scarto — ma non è il gesto normale.</div>` : ''}
    <h4 class="settings-group-title">${uscita ? (passaggio ? 'Pezzi che vanno al terzista' : 'Materiale che esce, dal ciclo della parte') : 'Pezzi che rientrano'}</h4>
    <div style="display:flex;flex-direction:column;gap:6px">${corpo}</div>
    <p class="empty-text" style="text-align:left;padding:8px 0">${spiega}</p>
    <div class="modal-field"><label>Nota</label><input id="cl-note" placeholder="es. bolla 412" autocomplete="off"></div>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="saveClFromOdl('${esc(docId)}','${esc(lineId)}','${uscita ? 'out' : 'in'}')">Registra</button>
    </div>`, true, 'form');
}
function saveClFromOdl(docId, lineId, verso) {
  if (!roleGuard('catalog')) return;
  const o = clDocById(docId); if (!o || !o.supplierId) return;
  const uscita = verso === 'out';
  const kind = window.__clKind || (uscita ? 'clOut' : 'clIn');
  const passaggio = kind === 'clStep';
  const ids = window.__clRighe || [];
  let n = 0;
  ids.forEach((itemId, i) => {
    const q = rawNum('cl-q-' + i);
    if (!(q > 0)) return;                       // riga lasciata a zero: non si registra
    // Il passaggio ha sempre un estremo «in casa»: i pezzi tornano da noi fra
    // due fasi e da noi ripartono. La quantità resta positiva perché non è un
    // carico — non entra nel calcolo dell'esistente affatto.
    const extra = { orderId: docId, lineId };
    if (passaggio) {
      extra.supplierId = uscita ? o.supplierId : null;
      extra.fromSupplierId = uscita ? null : o.supplierId;
    } else {
      extra.supplierId = o.supplierId;
    }
    const qty = passaggio ? q : (uscita ? -q : q);
    if (addMovement(itemId, kind, qty, val('cl-note'), extra)) n++;
  });
  if (!n) { showToast('Nessuna quantità da registrare', 'error'); return; }
  closeModal();
  // Si ridisegna la vista che ha aperto la scheda, non tutte e due.
  if (activeView === 'odl' && typeof renderOdl === 'function') renderOdl();
  else if (typeof renderOrders === 'function') renderOrders();
  showToast(passaggio
    ? (uscita ? 'Pezzi mandati al terzista' : 'Pezzi ritirati dal terzista')
    : (uscita
      ? (n === 1 ? 'Materiale spedito al terzista' : n + ' materiali spediti al terzista')
      : 'Rientro registrato'));
}
// Le righe di conto lavoro finite in un ordine d'acquisto prima della
// separazione fra ODA e ODL passano dalla stessa scheda: hanno la stessa forma.
function clFromOrderModal(docId, lineId, verso) { clFromOdlModal(docId, lineId, verso); }

// ─── Prospetto «materiale presso terzi» ───
// Non è una vista nuova, ed è deliberato: il Magazzino elenca già gli stessi
// articoli, e una voce di menu in più per una domanda che si fa una volta al
// mese avrebbe pesato più di quanto serviva. Qui c'è il filtro di stato «presso
// terzi» e questa scheda, che il filtro non può dare — il dettaglio è per
// fornitore e per ordine, mentre la riga del magazzino è per articolo.
function contoLavoroModal(soloItemId) {
  const righe = atSupplierRows().filter(r => !soloItemId || r.itemId === soloItemId);
  const perFornitore = new Map();
  righe.forEach(r => { if (!perFornitore.has(r.supplierName)) perFornitore.set(r.supplierName, []); perFornitore.get(r.supplierName).push(r); });
  const blocchi = Array.from(perFornitore.entries()).map(([nome, rs]) => `
    <h4 class="settings-group-title">${ico('factory', 'tinted', '')} ${esc(nome)}</h4>
    <div style="display:flex;flex-direction:column;gap:6px">
      ${rs.map(r => `<div class="mgmt-item">
        <span style="width:110px;font-family:var(--mono)">${r.item ? codeLink(r.item.id, r.item.code) : '(articolo mancante)'}</span>
        <span style="flex:1">${esc(r.item ? r.item.name : '')}${r.ordini.length ? ` <span class="empty-text" style="padding:0">· ${esc(r.ordini.join(', '))}</span>` : ''}</span>
        <span class="empty-text" style="padding:0;width:90px">${esc(r.ultima)}</span>
        <span style="font-family:var(--mono);width:90px;text-align:right" title="Uscito">${fmtQty(r.out)}</span>
        <span style="font-family:var(--mono);width:90px;text-align:right" title="Rientrato">${fmtQty(r.in)}</span>
        <span style="font-family:var(--mono);width:90px;text-align:right;color:var(--orange)" title="Ancora fuori">${fmtUom(r.saldo, r.item ? itemUom(r.item) : '')}</span>
      </div>`).join('')}
    </div>`).join('');
  openModal(`<h3>${ico('factory', 'tinted pill', '')} Materiale presso terzi</h3>
    <p class="empty-text" style="text-align:left;padding:0 0 8px">Quello che è uscito verso un terzista e non è ancora rientrato. È calcolato dai <strong>movimenti</strong>, come la giacenza: non esiste nessun saldo scritto da qualche parte, e quindi niente che possa divergere. Il conto è per <strong>fornitore e articolo</strong>, perché quando esce del materiale e rientrano dei pezzi lavorati i due codici sono diversi e un saldo unico non direbbe niente.</p>
    <p class="empty-text" style="text-align:left;padding:0 0 8px">Il blocco <strong>«in casa, fra due fasi»</strong> sono i pezzi tornati da un terzista che devono ancora andare al successivo: non sono a magazzino — il codice prodotto si carica una volta sola, al rientro dell&rsquo;ultima fase — e non sono più da nessuno. Sono l&rsquo;unico posto in cui compaiono.</p>
    ${blocchi || '<div class="empty-text">Nessun materiale fuori: tutto quello che è uscito è rientrato.</div>'}
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Chiudi</button></div>`, true, 'contolavoro');
}
// Il pulsante in toolbar del Magazzino: compare solo se c'è davvero qualcosa
// fuori. Un pulsante permanente che apre una scheda vuota è rumore.
function contoLavoroButton() {
  const n = atSupplierRows().length;
  if (!n) return '';
  return `<button class="btn-outline" onclick="contoLavoroModal()" title="Materiale uscito verso un terzista e non ancora rientrato">
    ${ico('factory', 'tinted', '')} Presso terzi (${n})</button>`;
}
// Export in forma piatta: una riga per coppia fornitore/articolo, che è la forma
// che si ordina e si filtra in un foglio di calcolo.
function contoLavoroExportSpec() {
  const righe = atSupplierRows();
  return {
    titolo: 'Materiale presso terzi',
    slug: 'presso_terzi',
    filtri: [['Estratto il', oggiISO()]],
    sezioni: [{
      nome: 'Saldi aperti',
      colonne: [
        { h: 'Terzista', w: 26 }, { h: 'Codice', w: 18 }, { h: 'Articolo', w: 34 }, { h: 'U.M.', w: 8 },
        { h: 'Uscito', w: 12, num: true }, { h: 'Rientrato', w: 12, num: true },
        { h: 'Ancora fuori', w: 14, num: true }, { h: 'Ordini', w: 20 },
        { h: 'Ultimo movimento', w: 16, data: true },
      ],
      righe: righe.map(r => [r.supplierName, r.item ? (r.item.code || '') : '', r.item ? (r.item.name || '') : '',
        r.item ? itemUom(r.item) : '', +r.out.toFixed(3), +r.in.toFixed(3), +r.saldo.toFixed(3),
        r.ordini.join(', '), r.ultima]),
      totali: null,
    }],
  };
}
function delMovement(id, itemId) {
  if (!roleGuard('catalog')) return;
  askConfirm('Eliminare questo movimento? La giacenza cambia di conseguenza.', () => {
    removeConUndo('movements', id, 'Movimento eliminato', () => stockMovementsModal(itemId));
  });
}

// ═══════════════════════════════════════════════════════════
//  VISTA: MAGAZZINO
// ═══════════════════════════════════════════════════════════
// L'anagrafica guardata dal lato delle giacenze.
//
// ── Perché una vista sua ──
// Tutti i numeri qui sotto esistevano già, ma solo **un articolo per volta**:
// nella sua scheda o dentro una riga di fabbisogno. Per rispondere a «cosa è
// sotto scorta?» bisognava aprire gli articoli a uno a uno, cioè non lo si
// chiedeva mai. Qui non si calcola niente di nuovo — `stockIndex` e
// `commitIndex` sono gli stessi del fabbisogno, e devono restare gli stessi:
// due conti diversi della stessa giacenza sarebbero due verità.
//
// ── Perché una sola pagina per commerciali e progetto ──
// Il magazzino non conosce quella divisione: uno scaffale contiene viti
// comprate e parti lavorate insieme, e chi fa l'inventario le conta nello
// stesso giro. Le due anagrafiche sono divise per competenza di chi le
// **scrive**, il magazzino per ciò che si **tiene**.
const STOCK_TYPES = ['acquistato', 'materiale', 'parte'];   // gli stessi di hasStock()
const STOCK_PFX = 'stk';
const STOCK_PAGE = 200;
let stockLimit = STOCK_PAGE;

function onStockTypeChange() { syncFamilyFilters(STOCK_PFX, STOCK_TYPES); stockFilterChange(); }
function onStockFamilyChange() { syncFamilyFilters(STOCK_PFX, STOCK_TYPES); stockFilterChange(); }
// Punto d'ingresso di tutti i filtri: il limite riparte da capo, perché chi
// filtra vuole vedere l'inizio del nuovo risultato.
function stockFilterChange() { stockLimit = STOCK_PAGE; renderStock(); }
function stockSearchInput() { debounced('stk', stockFilterChange); }
function stockShowMore() { stockLimit += STOCK_PAGE; renderStock(); }
function stockShowAll() { stockLimit = Infinity; renderStock(); }

// Lo stato di un articolo, in una parola. Serve al filtro e alla riga: che il
// ⚠ e il filtro «sotto scorta» dicano la stessa cosa non è scontato se la
// condizione è scritta in due posti.
function stockState(it) {
  const s = stockOf(it.id);
  const safety = safetyStockOf(it);
  return {
    onHand: s.onHand, incoming: s.incoming,
    committed: committedOf(it.id, null),
    libero: freeStockOf(it.id, null),
    safety, lotSize: lotSizeOf(it), lotMode: lotModeOf(it),
    sotto: safety > 0 && s.onHand < safety,
    atSupplier: atSupplierOf(it.id),
    // Fra due fasi il pezzo non e' a magazzino e non e' da nessun terzista.
    // Contarlo con la giacenza lo farebbe promettere a chi guarda il libero.
    inWork: inWorkOf(it.id),
  };
}
const STOCK_STATE_FILTERS = {
  sotto: st => st.sotto,
  zero: st => st.onHand <= 0,
  con: st => st.onHand > 0,
  negativo: st => st.libero < 0,
  // Materiale che sta da un terzista e non è ancora rientrato, o che è tornato
  // fra due fasi e deve ripartire. Non è una giacenza: è roba nostra che allo
  // scaffale non c'è, e le due condizioni stanno insieme perché la domanda che
  // le fa è la stessa — «cosa ho in giro?».
  terzi: st => st.atSupplier > 0.000001 || st.inWork > 0.000001,
};
// Le stesse voci del menu in pagina: servono all'export, che scrive nel file i
// filtri per esteso e non il valore interno.
const STOCK_STATE_LABELS = {
  sotto: 'Sotto la scorta minima', zero: 'Giacenza a zero',
  con: 'Con giacenza', negativo: 'Libero negativo', terzi: 'Presso terzi o in lavorazione',
};

function stockRow(it) {
  const st = stockState(it);
  const u = itemUom(it);
  const flags = `${it.favorite ? '<span class="pick-fav" title="Preferito">★</span>' : ''}${it.obsolete ? `<span class="obs-mark" title="Obsoleto">${ico('blocked', 'tinted', '')}</span>` : ''}`
    + (st.sotto ? '<span title="Sotto la scorta minima">' + ico('warning', 'tinted', '') + '</span>' : '');
  const num = (v, colore, col) => `<td class="col-${col}" style="font-family:var(--mono);text-align:right${colore ? ';color:' + colore : ''}">${fmtQty(v)}</td>`;
  const nMov = movementsOf(it.id).length;
  return `<tr data-sel="${it.id}" class="${it.obsolete ? 'row-obsolete' : ''}">
    <td class="col-flags" style="width:1%;white-space:nowrap">${flags}</td>
    <td class="col-code" style="font-family:var(--mono)">${codeLink(it.id, it.code)}</td>
    <td class="col-name">${esc(it.name)}</td>
    <td class="col-type"><span class="bom-type-tag tt-${it.type}">${typeShort(it.type)}</span> ${typeLabel(it.type)}</td>
    <td class="col-family" style="color:var(--text-dim)">${esc(codingLabel(it) || familyLabel(it))}</td>
    <td class="col-uom">${esc(u)}</td>
    ${num(st.onHand, st.sotto ? 'var(--orange, #d90)' : '', 'onhand')}
    ${num(st.incoming, st.incoming > 0 ? 'var(--accent)' : 'var(--text-dim)', 'incoming')}
    ${num(st.committed, st.committed > 0 ? 'var(--orange, #d90)' : 'var(--text-dim)', 'committed')}
    ${num(st.libero, st.libero < 0 ? 'var(--red)' : '', 'free')}
    ${num(st.safety, st.safety > 0 ? '' : 'var(--text-dim)', 'safety')}
    ${num(st.lotSize, st.lotSize > 0 ? '' : 'var(--text-dim)', 'lot')}
    <td class="row-actions" style="text-align:right;white-space:nowrap">
      <button class="mini-btn" title="Rettifica giacenza" onclick="stockAdjustModal('${it.id}')">${ico('scale', 'tinted', 'Rettifica giacenza')}</button>
      <button class="mini-btn" title="Movimenti (${nMov})" onclick="stockMovementsModal('${it.id}')">${ico('clock', 'tinted', 'Movimenti di magazzino')}</button>
      <button class="mini-btn" title="Dove è usato e impatto costi" onclick="usageModal('${it.id}')">${ico('link', 'tinted', 'Dove è usato e impatto costi')}</button>
      <button class="mini-btn" title="Modifica articolo" onclick="editItemModal('${it.id}')">${ico('edit', 'tinted', 'Modifica articolo')}</button>
    </td></tr>`;
}

// Le righe che la vista mostra, filtrate e ordinate. Sta fuori dal disegno
// perché la serve anche l'export: se il filtro fosse scritto due volte, prima o
// poi il file esportato conterrebbe righe diverse da quelle guardate.
function stockFilteredRows(soloIds) {
  const leggi = k => (document.getElementById(STOCK_PFX + '-' + k) || {}).value || '';
  const q = leggi('search').toLowerCase();
  const ft = leggi('type'), ff = leggi('family'), fsf = leggi('subfamily'), fs = leggi('state');
  // Gli assiemi restano fuori: un gruppo si produce, non si stocca, e la sua
  // giacenza sarebbe quella dei suoi componenti contata due volte.
  let rows = (db.items || []).filter(hasStock);
  if (ft) rows = rows.filter(i => i.type === ft);
  if (ff) rows = rows.filter(i => usesFamily(i.type) && i.familyId === ff);
  if (fsf) rows = rows.filter(i => i.subFamilyId === fsf);
  if (q) rows = rows.filter(i => (i.code + ' ' + i.name).toLowerCase().includes(q));
  const statoOk = STOCK_STATE_FILTERS[fs];
  if (statoOk) rows = rows.filter(i => statoOk(stockState(i)));
  // La scelta fatta a mano vale come un filtro, e si applica per ultima:
  // esportare la selezione deve dare le righe scelte, non quelle scelte più
  // quelle che il filtro avrebbe aggiunto.
  if (soloIds && soloIds.length) rows = rows.filter(i => soloIds.includes(i.id));
  return rows.sort((a, b) => (a.code || '').localeCompare(b.code || ''));
}

function renderStock() {
  invalidateCaches();
  syncFamilyFilters(STOCK_PFX, STOCK_TYPES);
  const rows = stockFilteredRows();

  // I conteggi in testa parlano di **tutto** il magazzino, non del filtro
  // attivo: sono lì per dire se c'è qualcosa da guardare, e un numero che
  // cambia con il filtro non risponderebbe più a quella domanda.
  const tutti = (db.items || []).filter(hasStock);
  let sotto = 0, inArrivo = 0, valore = 0;
  tutti.forEach(i => {
    const st = stockState(i);
    if (st.sotto) sotto++;
    if (st.incoming > 0) inArrivo++;
    valore += st.onHand * itemUnitCost(i);
  });
  const clHost = document.getElementById(STOCK_PFX + '-cl-btn');
  if (clHost) clHost.innerHTML = contoLavoroButton();
  const kpiHost = document.getElementById(STOCK_PFX + '-kpi');
  if (kpiHost) kpiHost.innerHTML = [
    kpi('Articoli a magazzino', String(tutti.length), ''),
    kpi('Sotto scorta minima', String(sotto), sotto > 0 ? 'red' : ''),
    kpi('Con merce in arrivo', String(inArrivo), 'accent'),
    kpi(`Valore giacenza (${esc(cur())})`, fmtN(valore), 'purple'),
  ].join('');

  const head = `<thead><tr><th scope="col" class="col-flags"></th><th scope="col" class="col-code">Codice</th><th scope="col" class="col-name">Nome</th>
    <th scope="col" class="col-type">Tipo</th><th scope="col" class="col-family">Famiglia</th><th scope="col" class="col-uom">U.M.</th>
    <th scope="col" class="col-onhand" style="text-align:right" title="Ricevuto sugli ordini più i movimenti">Esistente</th>
    <th scope="col" class="col-incoming" style="text-align:right" title="Atteso da ordini inviati, confermati o parziali">In arrivo</th>
    <th scope="col" class="col-committed" style="text-align:right" title="Promesso dai piani di fabbisogno aperti">Impegnato</th>
    <th scope="col" class="col-free" style="text-align:right" title="Esistente + in arrivo − impegnato: quanto se ne può ancora promettere">Libero</th>
    <th scope="col" class="col-safety" style="text-align:right">Scorta min.</th><th scope="col" class="col-lot" style="text-align:right">Lotto</th>
    <th scope="col" class="row-actions"></th></tr></thead>`;
  // Stessa griglia dell'anagrafica (itemGrid, views-catalog.js): stessa
  // paginazione, stesso titolo di gruppo, stesso piede. Qui cambiano solo le
  // colonne, il disegno della riga e cosa dire quando non c'è niente.
  itemGrid({
    hostId: STOCK_PFX + '-table',
    rows,
    head,
    riga: stockRow,
    limite: stockLimit,
    pagina: STOCK_PAGE,
    altro: 'stockShowMore()',
    tutti: 'stockShowAll()',
    // Due vuoti diversi: «non c'è niente a magazzino» e «i tuoi filtri non
    // pescano niente» sono due situazioni, e la seconda ha una via d'uscita.
    vuoto: tutti.length ? 'Nessun articolo con questi filtri.'
      : 'Nessun articolo a magazzino: qui compaiono commerciali, materie prime e parti.',
    colonne: 'stock',
  });
}

// ─── Export ───
// Le stesse righe e le stesse colonne che si stanno guardando. Il limite di
// disegno (`stockLimit`) non entra qui: difende il ridisegno, non il contenuto.
function stockExportSpec(soloIds) {
  const leggi = k => (document.getElementById(STOCK_PFX + '-' + k) || {}).value || '';
  const fam = getFamily(leggi('family'));
  const sub = (fam && (fam.subs || []).find(s => s.id === leggi('subfamily'))) || null;
  const righe = stockFilteredRows(soloIds).map(it => {
    const st = stockState(it);
    return [it.code || '', it.name || '', typeLabel(it.type), codingLabel(it) || familyLabel(it),
      itemUom(it), st.onHand, st.incoming, st.committed, st.libero, st.safety, st.lotSize];
  });
  return {
    titolo: 'Magazzino',
    slug: 'magazzino',
    filtri: [
      ['Ricerca', leggi('search')],
      ['Tipo', leggi('type') ? typeLabel(leggi('type')) : ''],
      ['Famiglia', fam ? fam.name : ''],
      ['Sottofamiglia', sub ? sub.name : ''],
      ['Stato', STOCK_STATE_LABELS[leggi('state')] || ''],
      ['Selezione', soloIds && soloIds.length ? soloIds.length + ' righe scelte a mano' : ''],
    ],
    sezioni: [{
      nome: 'Magazzino',
      colonne: [
        { h: 'Codice', w: 18 }, { h: 'Nome', w: 34 }, { h: 'Tipo', w: 16 }, { h: 'Famiglia', w: 24 },
        { h: 'U.M.', w: 8 }, { h: 'Esistente', w: 12, num: true }, { h: 'In arrivo', w: 12, num: true },
        { h: 'Impegnato', w: 12, num: true }, { h: 'Libero', w: 12, num: true },
        { h: 'Scorta minima', w: 14, num: true }, { h: 'Lotto', w: 10, num: true },
      ],
      righe,
    }],
  };
}
