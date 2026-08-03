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
};
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
    if (!e) { e = { onHand: 0, incoming: 0 }; idx.set(id, e); }
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
      if (manca > 0) tocca(l.itemId).incoming += inGestione(manca);
    });
  });
  (db.movements || []).forEach(m => {
    if (!m.itemId) return;
    tocca(m.itemId).onHand += Number(m.qty) || 0;   // i consumi sono già negativi
  });
  _stockIdx = idx;
  return idx;
}
function invalidateStock() { _stockIdx = null; _commitIdx = null; }
function stockOf(itemId) { return stockIndex().get(itemId) || { onHand: 0, incoming: 0 }; }
function onHandOf(itemId) { return stockOf(itemId).onHand; }
function incomingOf(itemId) { return stockOf(itemId).incoming; }

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
function commitsOn(itemId, exceptPlanId) {
  return (commitIndex().get(itemId) || []).filter(c => c.planId !== exceptPlanId);
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

// ─── Il conto ───
// netto = quanto manca davvero, arrotondato al lotto del fornitore.
// Logica pura, senza DOM: è la parte che la suite verifica.
//
// `committed` sta dalla parte del fabbisogno, insieme alla scorta minima, non
// dalla parte del magazzino: sono entrambi merce che c'è ma non si può usare.
// Scriverlo come sottrazione dall'esistente darebbe lo stesso numero e la
// domanda sbagliata — «quanto ne ho» invece di «quanto me ne serve».
function netRequirement(lordo, onHand, incoming, safety, lotSize, committed) {
  const l = Number(lordo) || 0;
  const mancante = l + (Number(safety) || 0) + (Number(committed) || 0)
    - (Number(onHand) || 0) - (Number(incoming) || 0);
  if (!(mancante > 0)) return 0;
  const lot = Number(lotSize) || 0;
  if (!(lot > 0)) return mancante;
  // Si arrotonda per eccesso: comprare mezzo lotto non è un'opzione che il
  // fornitore offre.
  return Math.ceil(mancante / lot - 1e-9) * lot;
}
// I dati di giacenza di una riga di fabbisogno, pronti da mostrare.
// `committed` è quanto gli **altri** piani aperti hanno già promesso: lo passa
// il chiamante, perché solo lui sa da quale piano si sta guardando.
function stockFor(it, lordo, committed) {
  const s = stockOf(it.id);
  const safety = safetyStockOf(it);
  const imp = Math.max(0, Number(committed) || 0);
  const net = netRequirement(lordo, s.onHand, s.incoming, safety, lotSizeOf(it), imp);
  return { onHand: s.onHand, incoming: s.incoming, safety, lotSize: lotSizeOf(it),
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
function addMovement(itemId, kind, qty, note) {
  const it = getItem(itemId);
  if (!it || !hasStock(it)) return null;
  const q = Number(qty) || 0;
  if (!q) return null;                       // un movimento da zero non è un movimento
  const rec = { id: gid(), itemId, kind: MOVEMENT_KINDS[kind] ? kind : 'rettifica',
    qty: q, date: nowISO(), note: String(note || '').trim() };
  return Store.insert('movements', rec);
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
      <strong>📦 Magazzino</strong>
      <div class="cost-summary" style="margin:8px 0">
        ${kpi('Esistente', fmtUom(s.onHand, u), sotto ? 'orange' : '')}
        ${kpi('In arrivo', fmtUom(s.incoming, u), 'accent')}
        ${kpi('Impegnato', fmtUom(impQty, u), impQty > 0 ? 'orange' : '')}
        ${kpi('Libero', fmtUom(libero, u), libero < 0 ? 'red' : '')}
        ${kpi('Scorta minima', fmtUom(safetyStockOf(it), u), '')}
      </div>
      ${sotto ? '<p style="color:var(--red);margin:0 0 8px">⚠ Sotto la scorta minima.</p>' : ''}
      ${libero < 0 ? '<p style="color:var(--red);margin:0 0 8px">⚠ I piani aperti ne hanno promesso più di quanto ne esista o ne sia in arrivo.</p>' : ''}
      <p class="empty-text" style="text-align:left;padding:0 0 8px">L'esistente è calcolato: <strong>ricevuto sugli ordini + movimenti</strong>. Non si scrive a mano — si registra una rettifica, così resta scritto anche perché è cambiato.</p>
      ${impQty > 0 ? `<p class="empty-text" style="text-align:left;padding:0 0 8px">Impegnato dai piani di fabbisogno <strong>aperti</strong>: ${esc(elencoImp)}. <em>Libero = esistente + in arrivo − impegnato</em>: è quanto se ne può ancora promettere. Chiudere un piano libera la sua quota.</p>` : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn-outline" onclick="stockAdjustModal('${it.id}')">✏ Rettifica giacenza</button>
        <button class="btn-outline" onclick="stockMovementsModal('${it.id}')">🕘 Movimenti (${movementsOf(it.id).length})</button>
      </div>
    </div></div>`;
}

function stockAdjustModal(itemId) {
  if (!roleGuard('catalog')) return;
  const it = getItem(itemId); if (!it || !hasStock(it)) return;
  const attuale = onHandOf(it.id);
  openModal(`<h3>✏ Rettifica giacenza — ${esc(it.code)}</h3>
    <p>Esistente calcolato adesso: <strong>${fmtUom(attuale, itemUom(it))}</strong>.</p>
    <div class="modal-grid">
      <div class="modal-field"><label>Tipo</label><select id="mv-kind">
        ${Object.keys(MOVEMENT_KINDS).map(k => `<option value="${k}">${esc(MOVEMENT_KINDS[k])}</option>`).join('')}
      </select></div>
      <div class="modal-field"><label>${labelUom('Quantità contata / movimentata', itemUom(it))}</label>
        <input type="number" id="mv-qty" step="any" value="${attuale}"></div>
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
function stockAdjustHint(itemId) {
  const el = document.getElementById('mv-hint'); if (!el) return;
  const kind = val('mv-kind');
  el.innerHTML = kind === 'rettifica'
    ? `Scrivi quanti ce ne sono <strong>davvero</strong>: viene registrata la differenza rispetto all'esistente calcolato.`
    : (kind === 'scarico'
      ? `Scrivi quanti ne <strong>escono</strong>: verranno sottratti.`
      : `Scrivi quanti ne <strong>entrano</strong>: verranno sommati.`);
}
function saveStockAdjust(itemId) {
  if (!roleGuard('catalog')) return;
  const it = getItem(itemId); if (!it) return;
  const kind = MOVEMENT_KINDS[val('mv-kind')] ? val('mv-kind') : 'rettifica';
  const inserita = rawNum('mv-qty');
  if (kind !== 'rettifica' && inserita < 0) { showToast('Inserisci una quantità positiva: è il tipo a decidere il verso', 'error'); return; }
  const delta = kind === 'rettifica' ? (inserita - onHandOf(it.id))
    : (kind === 'scarico' ? -inserita : inserita);
  if (!delta) { showToast('Nessuna differenza da registrare'); closeModal(); return; }
  addMovement(it.id, kind, delta, val('mv-note'));
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
      <span style="flex:1">${esc(m.note || '')}</span>
      <span style="font-family:var(--mono);color:${m.qty < 0 ? 'var(--red)' : 'var(--green)'}">${m.qty > 0 ? '+' : ''}${fmtUom(m.qty, u)}</span>
      <button class="mini-btn danger" onclick="delMovement('${m.id}','${it.id}')" title="Elimina movimento">🗑</button>
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
  openModal(`<h3>🕘 Movimenti — ${esc(it.code)} ${esc(it.name)}</h3>
    <p>Esistente: <strong>${fmtUom(onHandOf(it.id), u)}</strong>, in arrivo <strong>${fmtUom(incomingOf(it.id), u)}</strong>.</p>
    ${righeOrd ? `<h4 class="settings-group-title">Dai ricevimenti d'ordine</h4><div style="display:flex;flex-direction:column;gap:6px">${righeOrd}</div>
      <p class="empty-text" style="text-align:left;padding:6px 0 0">Queste righe si correggono sull'ordine, dove è registrato il ricevimento.</p>` : ''}
    ${righeMv ? `<h4 class="settings-group-title">Rettifiche e consumi</h4><div style="display:flex;flex-direction:column;gap:6px">${righeMv}</div>` : ''}
    ${!righeMv && !righeOrd ? '<div class="empty-text">Nessun movimento. La giacenza è zero.</div>' : ''}
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Chiudi</button></div>`, true, 'storico');
}
function delMovement(id, itemId) {
  if (!roleGuard('catalog')) return;
  askConfirm('Eliminare questo movimento? La giacenza cambia di conseguenza.', () => {
    removeConUndo('movements', id, 'Movimento eliminato', () => stockMovementsModal(itemId));
  });
}
