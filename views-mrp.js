// ═══════════════════════════════════════════════════════════
//  BOMTRACK — views-mrp.js
// ═══════════════════════════════════════════════════════════
// Vista Fabbisogno materiali: piani di produzione, esplosione delle distinte,
// lista d'acquisto consolidata ed export.
// Classic script, scope globale condiviso con gli altri: nessun modulo e
// nessun build, così index.html continua ad aprirsi con un doppio click.

// ═══════════════════════════════════════════════════════════
//  VISTA: FABBISOGNO MATERIALI (piani di produzione)
// ═══════════════════════════════════════════════════════════
// Dato un piano (3 × macchina A, 2 × macchina B) si esplodono le distinte e si
// somma per articolo: la lista di ciò che serve comprare, con lo stesso conto
// che fa la costificazione. Le regole di discesa sono quelle di computeCost —
// se le due strade divergono su una distinta, una delle due sta mentendo.

// ─── Motore (logica pura, nessun DOM) ───
// → { buy: [{ item, qty, due }], make: [{ item, qty, due }], cycle: bool }
//
// La data scende insieme alla quantità: se una macchina serve per il 30
// settembre, i suoi componenti servono per il 30 settembre. Quando lo stesso
// articolo arriva da più righe di piano con date diverse si tiene **la più
// vicina**: è la scelta conservativa — ordinare per la data più stretta copre
// anche le altre.
//
// Volutamente NON si fa il time-phasing: niente periodi, niente fabbisogni
// separati per settimana. Sarebbe un altro strumento, e prometterlo a metà è
// peggio che non averlo. Qui la data serve a due cose concrete: sapere entro
// quando ordinare, e scriverla sul documento al fornitore.
function mrpExplode(lines) {
  const buy = new Map(), make = new Map();
  const out = { cycle: false };
  (lines || []).forEach(l => mrpDescend(l.itemId, Number(l.qty) || 0, new Set(), buy, make, out, l.dueDate || ''));
  const perCodice = m => Array.from(m.values()).sort((a, b) => String(a.item.code).localeCompare(String(b.item.code)));
  return { buy: perCodice(buy), make: perCodice(make), cycle: out.cycle };
}
// Le date sono stringhe ISO `YYYY-MM-DD`: si confrontano bene così come sono, e
// una vuota non deve mai vincere su una valorizzata.
function primaData(a, b) {
  if (!a) return b || '';
  if (!b) return a;
  return a < b ? a : b;
}
function mrpAdd(map, it, qty, due) {
  const e = map.get(it.id);
  if (e) { e.qty += qty; e.due = primaData(e.due, due); }
  else map.set(it.id, { item: it, qty, due: due || '' });
}
function mrpDescend(itemId, qty, ancestors, buy, make, out, due) {
  const it = getItem(itemId);
  if (!it || !(qty > 0)) return;
  // Anello: si segnala e si smette di scendere, come fa flattenBom
  if (ancestors.has(itemId)) { out.cycle = true; return; }
  if (it.type === 'materiale' || it.type === 'acquistato') { mrpAdd(buy, it, qty, due); return; }
  const next = new Set(ancestors); next.add(itemId);
  if (it.type === 'parte') {
    // Parte comprata già lavorata da terzi: è una foglia d'acquisto come un
    // commerciale. Il ciclo resta salvato, ma non si scende — quel materiale
    // e quelle lavorazioni li mette il fornitore, non noi.
    if (partSourcing(it) === 'buy') { mrpAdd(buy, it, qty, due); return; }
    mrpAdd(make, it, qty, due);
    (it.cycle || []).forEach(r => {
      if (r.kind === 'op') return;   // le lavorazioni non si comprano a magazzino
      mrpDescend(r.itemId, qty * (Number(r.qty) || 0), next, buy, make, out, due);
    });
    return;
  }
  // assieme: la quantità di riga porta con sé lo scarto, come nel rollup
  (it.components || []).forEach(c => {
    const f = (Number(c.qty) || 0) * (1 + (Number(c.scrapPct) || 0) / 100);
    mrpDescend(c.itemId, qty * f, next, buy, make, out, due);
  });
}
// ─── Date: da quando serve a entro quando ordinare ───
// `leadDays` stava a listino da versioni e non entrava in nessun conto: c'era
// scritto che il fornitore consegna in 21 giorni e nessuno se ne faceva niente.
// Adesso è il ponte fra «serve per il 30 settembre» e «va ordinato entro il 9».
const URGENCY_WARN_DAYS = 7;   // sotto una settimana di margine si avvisa
// I conti si fanno in UTC, non nell'ora locale. Con `T00:00:00` la data nasce a
// mezzanotte locale e `toISOString()` la riporta in UTC: a est di Greenwich
// torna indietro di un giorno, e ogni data d'ordine risultava anticipata di
// ventiquattr'ore — uno sbaglio che nessuno avrebbe notato guardando lo schermo.
// Qui non esistono orari: sono date, e le date non hanno fuso.
function addDays(iso, giorni) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00Z');
  if (isNaN(d)) return '';
  d.setUTCDate(d.getUTCDate() + (Number(giorni) || 0));
  return d.toISOString().slice(0, 10);
}
// Oggi secondo il calendario dell'utente, non secondo Greenwich: alle 23 del 30
// settembre in Italia è ancora il 30, e un semaforo che dicesse "1 ottobre"
// segnalerebbe in ritardo qualcosa che non lo è.
function oggiISO() {
  const n = new Date();
  return new Date(n.getTime() - n.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
// Giorni di consegna dichiarati da una quotazione. Senza quotazione, o senza il
// dato, vale zero: nessun anticipo, non un anticipo inventato.
function leadDaysOfRow(row) {
  const g = row ? Number(row.leadDays) : NaN;
  return isFinite(g) && g > 0 ? g : 0;
}
// Urgenza di una riga d'acquisto: 'ritardo' | 'urgente' | 'ok' | '' (senza data).
// Si guarda la data entro cui ordinare, non quella in cui serve: è l'unica su
// cui si può ancora fare qualcosa.
function urgenzaOrdine(orderBy) {
  if (!orderBy) return '';
  const oggi = oggiISO();
  if (orderBy < oggi) return 'ritardo';
  return orderBy <= addDays(oggi, URGENCY_WARN_DAYS) ? 'urgente' : 'ok';
}
const URGENZA_LABEL = {
  ritardo: { txt: ico('warning', 'tinted', '') + ' in ritardo', cls: 'mrp-warn', desc: 'La data entro cui ordinare è già passata' },
  urgente: { txt: ico('clock', 'tinted', '') + ' da ordinare', cls: 'mrp-warn', desc: 'Meno di ' + URGENCY_WARN_DAYS + ' giorni di margine' },
  ok: { txt: '', cls: '', desc: '' },
};

// Riga d'acquisto completa: il prezzo è quello IN USO nella costificazione, la
// quotazione migliore si segnala soltanto — nessun prezzo cambia da sé.
// `netMode` è un parametro, non una lettura del toggle: la riga resta logica
// pura e la vista decide quale delle due domande sta facendo.
//   qty      = fabbisogno lordo, quanto serve. Non cambia mai: è la proprietà
//              del prodotto, e serve per l'analisi di costo.
//   net      = quanto manca comprare, tolto l'esistente e l'in arrivo, e tolto
//              quello che gli altri piani aperti hanno già promesso.
//   qtyOrder = quella con cui si fanno i conti e nascono i documenti.
//
// `planId` dice **da quale piano si sta guardando**: serve a non contare come
// concorrenza il fabbisogno del piano stesso. Passarlo è obbligatorio nei fatti
// — ometterlo fa risultare ogni riga impegnata contro sé stessa e raddoppia gli
// acquisti — e infatti nessuna vista chiama questa funzione direttamente.
function mrpBuyRow(entry, netMode, planId) {
  const it = entry.item;
  const attiva = activePriceRow(it);
  const price = Number(it[costField(it)]) || 0;
  const best = bestPriceRow(it);
  // Il confronto è fra costi nell'unità di gestione, non fra prezzi grezzi:
  // vedi bestPriceRow(). Un €/kg accanto a un €/m non è un confronto.
  const bestPrice = best ? (rowUnitCost(it, best) || 0) : null;
  const impegni = commitsOn(it.id, planId || null);
  const st = stockFor(it, entry.qty, impegni.reduce((s, c) => s + c.qty, 0));
  const qtyOrder = netMode ? st.net : entry.qty;

  // ─── Da chi si compra, e a quale listino ───
  // Il fornitore lo decide la quotazione **in uso**: è la scelta che qualcuno ha
  // fatto, ed è la stessa da cui viene il costo. Il listino che finirà sul
  // documento è invece la quotazione **più recente di quel fornitore** — quello
  // che ci fa oggi, non quello che gli abbiamo scelto mesi fa. Nel caso normale
  // sono la stessa riga; quando divergono, il documento deve dire il vero e la
  // divergenza va mostrata (`listinoDiverso`), non appianata di nascosto.
  const supplierId = (attiva && attiva.supplierId) || it.supplierId || '';
  const doc = supplierPriceRow(it, supplierId) || attiva;
  const quotato = doc && doc.price !== '' && doc.price != null;

  // Il documento nasce sempre nell'unità di gestione dell'articolo — è quella
  // con cui si ordina e si riceve davvero, non quella in cui il fornitore
  // valorizza il listino. Il prezzo di riga è quindi il costo **convertito**
  // (docInGestione), mai il prezzo grezzo della quotazione.
  const docInGestione = quotato ? (rowUnitCost(it, doc) || 0) : null;
  const priceDoc = docInGestione != null ? docInGestione : 0;
  // Il minimo del fornitore è dichiarato nella SUA unità di quotazione: va
  // convertito nell'unità di gestione prima di confrontarlo con la quantità
  // ordinata, altrimenti l'allarme scatterebbe sul numero sbagliato.
  const minQtyGrezzo = doc && doc.minQty !== '' && doc.minQty != null ? (Number(doc.minQty) || 0) : 0;
  const minQty = minQtyGrezzo > 0 ? fromAltUom(it, minQtyGrezzo, priceUomOf(it, doc)) : 0;

  // Data in cui serve, giorni di consegna di quel listino, data entro cui ordinare.
  const due = entry.due || '';
  const leadDays = leadDaysOfRow(doc);
  const orderBy = due ? addDays(due, -leadDays) : '';
  return {
    item: it, qty: entry.qty, uom: itemUom(it),
    due, leadDays, orderBy, urgenza: urgenzaOrdine(orderBy),
    priceDoc, amountDoc: priceDoc * qtyOrder,
    onHand: st.onHand, incoming: st.incoming, safety: st.safety, lotSize: st.lotSize, lotMode: st.lotMode,
    // Impegnato dagli **altri** piani aperti, e il dettaglio di chi lo impegna:
    // un numero che toglie merce senza dire chi se l'è presa è un numero che non
    // si può contestare, e quindi neanche credere.
    committed: st.committed, impegni, libero: st.libero,
    net: st.net, coperto: !!netMode && st.coperto, qtyOrder,
    supplierId,
    price, amount: price * qtyOrder,
    bestPrice, saving: (bestPrice != null && bestPrice < price) ? (price - bestPrice) * qtyOrder : 0,
    // Il minimo del fornitore è già stato convertito nell'unità di gestione
    // qui sopra: il confronto è alla pari con la quantità ordinata.
    minQty, underMin: minQty > 0 && qtyOrder > 0 && qtyOrder < minQty,
    // Righe che manderebbero un ordine a zero o senza intestatario: si segnalano
    // qui, prima di generare il documento, non dopo averlo mandato al fornitore.
    noSupplier: !supplierId,
    noPrice: !(price > 0),
    // Il documento partirebbe senza prezzo perché **quel fornitore** non ha
    // quotato questo articolo, pur essendocene uno in costificazione.
    noDocPrice: !quotato,
    // Il listino applicabile dice un prezzo diverso da quello con cui è stato
    // costificato: il documento seguirà il listino.
    listinoDiverso: docInGestione != null && Math.abs(docInGestione - price) > 0.00005,
    docInGestione,
  };
}
function mrpBuyRows(plan, netMode) { return mrpExplode(plan.lines).buy.map(e => mrpBuyRow(e, netMode, plan.id)); }
// `.map(mrpBuyRow)` passerebbe l'indice dell'array come secondo argomento, e
// dalla seconda riga in poi il netto si accenderebbe da solo. Le viste passano
// sempre da qui.
function mrpRowsOf(entries, planId) { return entries.map(e => mrpBuyRow(e, mrpNet, planId)); }
// Raggruppamento per fornitore; chi non ne ha finisce in coda, sotto "Da assegnare"
function mrpGroupBySupplier(rows) {
  const map = new Map();
  rows.forEach(r => {
    const k = r.supplierId || '';
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  });
  return Array.from(map.entries())
    .map(([supplierId, rs]) => ({
      supplierId, name: supplierId ? (supplierName(supplierId) || '—') : 'Da assegnare',
      rows: rs, total: rs.reduce((s, r) => s + r.amount, 0),
    }))
    .sort((a, b) => (a.supplierId ? 0 : 1) - (b.supplierId ? 0 : 1) || a.name.localeCompare(b.name));
}

// ─── Piani: CRUD ───
function getPlan(id) { return (db.plans || []).find(p => p.id === id); }
// Progressivo per anno: FAB-<anno>-NNN
function nextPlanNumber() {
  const prefix = `FAB-${new Date().getFullYear()}-`;
  const seqs = (db.plans || []).filter(p => (p.number || '').startsWith(prefix))
    .map(p => parseInt((p.number || '').slice(prefix.length), 10) || 0);
  return prefix + String((seqs.length ? Math.max(...seqs) : 0) + 1).padStart(3, '0');
}
function newPlan() {
  if (!roleGuard('docs')) return;
  const p = Store.insert('plans', { id: gid(), number: nextPlanNumber(), title: '', date: nowISO().slice(0, 10),
    notes: '', lines: [], active: true });
  currentPlanId = p.id; mrpView = 'edit'; renderMrp();
}
function duplicatePlan(id) {
  if (!roleGuard('docs')) return;
  const src = getPlan(id); if (!src) return;
  const p = Store.insert('plans', { id: gid(), number: nextPlanNumber(), title: (src.title || src.number) + ' (copia)',
    date: nowISO().slice(0, 10), notes: src.notes || '',
    lines: (src.lines || []).map(l => ({ id: gid(), itemId: l.itemId, qty: l.qty })), active: true });
  currentPlanId = p.id; mrpView = 'edit'; renderMrp();
  showToast('Piano ' + p.number + ' creato dalla copia');
}
function delPlan(id) {
  if (!roleGuard('docs')) return;
  const p = getPlan(id); if (!p) return;
  askConfirm(`Eliminare il piano ${p.number}?`, () => {
    if (currentPlanId === id) { currentPlanId = null; mrpView = 'list'; }
    removeConUndo('plans', id, `Piano ${p.number} eliminato`, renderMrp);
  });
}
function openPlanEdit(id) { currentPlanId = id; mrpView = 'edit'; renderMrp(); }
// Aperto / chiuso. È l'unico stato che un piano ha, ed esiste per una ragione
// sola: un piano aperto **impegna** materiale a magazzino, uno chiuso no.
// Senza questo interruttore ogni piano mai creato continuerebbe a promettere
// merce per sempre, e dopo qualche mese nessun articolo risulterebbe più
// disponibile. Chiudere non cancella e non blocca niente: il piano resta
// leggibile, esportabile, e si riapre con lo stesso pulsante.
function planToggleActive(id) {
  if (!roleGuard('docs')) return;
  const p = getPlan(id); if (!p) return;
  p.active = p.active === false;
  touch(p); saveDB(); renderMrp();
  showToast(`Piano ${p.number} ${p.active ? 'riaperto: torna a impegnare materiale' : 'chiuso: il materiale che impegnava torna libero'}`);
}
function planBackToList() { mrpView = 'list'; currentPlanId = null; renderMrp(); }
function planSearchInput() {
  // Solo l'elenco: ridisegnare la colonna intera farebbe perdere il focus al
  // campo di ricerca a ogni lettera.
  debounced('mrp', () => {
    renderInto('plan-list', planListRows);
    const c = document.getElementById('plan-count');
    if (c) c.textContent = planCountText();
  });
}
function planSetField(id, field, value) {
  if (!roleGuard('docs')) { renderMrp(); return; }
  const p = getPlan(id); if (!p) return;
  p[field] = value;
  touch(p); saveDB();
}
function planAddModal(id) {
  if (!roleGuard('docs')) return;
  catalogPickerModal(ids => planAddLines(id, ids));
}
function planAddLines(id, ids) {
  if (!roleGuard('docs')) return;
  const p = getPlan(id); if (!p) return;
  ids.forEach(itemId => {
    const it = getItem(itemId); if (!it) return;
    // Stesso articolo due volte: si somma sulla riga esistente invece di duplicarla
    const gia = p.lines.find(l => l.itemId === itemId);
    if (gia) gia.qty = (Number(gia.qty) || 0) + 1;
    // La data di testata del piano fa da proposta: quasi sempre le righe di un
    // piano servono per la stessa consegna, e riscriverla una per una è lavoro
    // inutile. Resta modificabile riga per riga.
    else p.lines.push({ id: gid(), itemId, qty: 1, dueDate: p.dueDate || '' });
  });
  touch(p); saveDB(); closeModal(); renderMrp();
  showToast(ids.length + (ids.length === 1 ? ' articolo aggiunto' : ' articoli aggiunti'));
}
function planSetLineQty(id, lineId, value) {
  if (!roleGuard('docs')) { renderMrp(); return; }
  const p = getPlan(id); if (!p) return;
  const l = p.lines.find(x => x.id === lineId); if (!l) return;
  l.qty = clampNum(parseFloat(value), 0);
  touch(p); saveDB(); renderMrp();
}
// Data in cui la riga deve essere pronta. Da qui scendono, lungo la distinta,
// le date d'ordine di tutto ciò che ci va dentro.
function planSetLineDue(id, lineId, value) {
  if (!roleGuard('docs')) { renderMrp(); return; }
  const p = getPlan(id); if (!p) return;
  const l = p.lines.find(x => x.id === lineId); if (!l) return;
  l.dueDate = value || '';
  touch(p); saveDB(); renderMrp();
}
function planDelLine(id, lineId) {
  if (!roleGuard('docs')) return;
  const p = getPlan(id); if (!p) return;
  p.lines = p.lines.filter(x => x.id !== lineId);
  touch(p); saveDB(); renderMrp();
}
function toggleMrpGroup() { mrpGrouped = !mrpGrouped; renderMrp(); }
function toggleMrpNet() { mrpNet = !mrpNet; renderMrp(); }

// ═══════════════════════════════════════════════════════════
//  DAL FABBISOGNO AI DOCUMENTI (richieste di offerta e ordini)
// ═══════════════════════════════════════════════════════════
// Il piano sa già cosa comprare e da chi: fin qui finiva in un export e la
// stessa lista si riscriveva a mano nei documenti. Qui il giro si chiude — un
// documento per fornitore, con le righe scelte. Nulla parte da solo: la modale
// è il momento in cui si guarda cosa manca (fornitori, prezzi, minimi d'ordine)
// prima di mandare qualcosa fuori.
const PLAN_DOC_KINDS = { rfq: 'Richieste di offerta', order: 'Ordini a fornitore' };

// ─── Cosa è già stato messo in un documento di questo piano ───
// Generare due volte lo stesso ordine dallo stesso fabbisogno è l'errore facile:
// si sceglie un fornitore, si genera, si torna indietro per il fornitore
// successivo e le righe di prima sono ancora lì, spuntate, identiche. Il doppio
// ordine si scopre alla consegna.
//
// Il conto si fa **leggendo i documenti**, non segnando gli articoli: nessun
// campo nuovo, nessuna divergenza possibile. Se un documento viene eliminato o
// annullato le sue righe tornano disponibili da sole, ed è giusto così —
// quell'ordine non esiste più.
//
// Il blocco è **per tipo di documento**, e la distinzione non è un dettaglio:
// chiedere un'offerta e poi ordinare è il flusso normale, quello che l'app
// accompagna dalla 0.21.0. Bloccare l'ordine perché esiste già una richiesta
// significherebbe rendere impossibile proprio il percorso che si vuole
// incoraggiare. Si impedisce di rifare *lo stesso tipo* di documento; l'altro
// resta consentito, e l'articolo mostra comunque dove è già finito.
function planDocumentedItems(planId) {
  const map = new Map();
  const aggiungi = (d, kind) => (d.lines || []).forEach(l => {
    if (!l.itemId) return;                       // riga manuale: non viene dal fabbisogno
    const l2 = map.get(l.itemId) || [];
    l2.push({ kind, number: d.number, id: d.id, qty: Number(l.qty) || 0, uom: l.uom || '' });
    map.set(l.itemId, l2);
  });
  (db.rfqs || []).filter(r => r.planId === planId).forEach(d => aggiungi(d, 'rfq'));
  // Un ordine annullato non è un ordine: le sue righe tornano da comprare.
  (db.orders || []).filter(o => o.planId === planId && o.status !== 'annullato').forEach(d => aggiungi(d, 'order'));
  return map;
}
function docRefLabel(ref) { return (ref.kind === 'rfq' ? 'richiesta ' : 'ordine ') + ref.number; }

// Righe d'acquisto del piano indicizzate per id articolo: la modale lavora su
// spunte, e alla conferma deve poter ritrovare la riga da un id.
function planBuyIndex(plan) {
  const map = new Map();
  mrpRowsOf(mrpExplode(plan.lines).buy, plan.id).forEach(r => map.set(r.item.id, r));
  return map;
}
// Il tipo di documento si sceglie **prima**, dal pulsante che si preme: sono
// due gesti diversi — «chiedo quanto costa» e «compro» — e metterli in un menu
// dentro la scheda li faceva sembrare la stessa cosa scelta due volte. Con la
// scelta già fatta, la scheda mostra da subito le righe giuste: quelle già
// finite in un documento *di quel tipo* risultano bloccate all'apertura, senza
// dover toccare un selettore per scoprirlo.
function planDocsModal(id, kind) {
  if (!roleGuard('docs')) return;
  const p = getPlan(id); if (!p) return;
  const k = PLAN_DOC_KINDS[kind] ? kind : 'rfq';
  // Le righe già coperte da magazzino e ordini non entrano nei documenti: sono
  // proprio quelle che il netto serve a non ricomprare.
  const gruppi = mrpGroupBySupplier(mrpBuyRows(p, mrpNet).filter(r => r.qtyOrder > 0));
  if (!gruppi.length) {
    showToast(mrpNet ? 'Niente da ordinare: esistente e in arrivo coprono tutto il piano' : 'Il piano non ha nulla da comprare', 'error');
    return;
  }
  window.__planDocsId = id;
  window.__planDocsKind = k;
  openModal(`<h3>${k === 'rfq' ? ico('mail', 'tinted pill', '') + ' Genera richieste di offerta' : ico('receipt', 'tinted pill', '') + ' Genera ordini a fornitore'} — ${esc(p.number)}</h3>
    <p class="empty-text" style="text-align:left;padding:0 0 8px">Quantità <strong>${mrpNet ? 'nette' : 'lorde'}</strong>${mrpNet ? ' — tolti esistente e in arrivo, e tolto quello che gli altri piani aperti hanno già impegnato' : ' — l\'intero fabbisogno del piano'}. Si cambia col pulsante <em>Fabbisogno netto</em> nell\'elenco.</p>
    <p class="empty-text" style="text-align:left;padding:0 0 12px">${planDocsHint(k)}</p>
    <div id="plandoc-body">${planDocsBody(gruppi, id, k)}</div>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="planCreateDocs()">${k === 'rfq' ? 'Genera richieste' : 'Genera ordini'}</button>
    </div>`, true, 'plandocs');
  planDocsCount();
}
// Un pulsante per tipo, col numero di righe ancora da documentare. Disabilitato
// quando non ne restano: un pulsante che si può premere e non fa niente è
// peggio di uno spento, perché costringe a scoprirlo aprendo.
function planDocButton(p, kind, label) {
  const n = planDocsAvailable(p, kind);
  const titolo = n
    ? `${n} ${n === 1 ? 'riga ancora da mettere' : 'righe ancora da mettere'} in ${kind === 'rfq' ? 'una richiesta' : 'un ordine'}`
    : `Tutte le righe di questo fabbisogno sono già in ${kind === 'rfq' ? 'una richiesta' : 'un ordine'}`;
  return `<button class="${kind === 'order' ? 'add-btn-sm' : 'btn-outline'}" onclick="planDocsModal('${p.id}','${kind}')"
    ${n ? '' : 'disabled'} title="${esc(titolo)}">${label}${n ? ` (${n})` : ''}</button>`;
}
function planDocsHint(kind) {
  return kind === 'rfq'
    ? 'Le richieste nascono senza prezzo: è quello che si sta chiedendo. Quando l\'offerta arriva, i prezzi si registrano a listino dalla richiesta stessa.'
    : 'Gli ordini portano il prezzo in uso nella costificazione. Le righe senza prezzo varrebbero zero: correggile a listino prima, o dopo nell\'ordine.';
}
// Quante righe restano da mettere in un documento di quel tipo. Sta sul
// pulsante: quanto lavoro resta si deve vedere prima di aprire la scheda, non
// dopo averla aperta e letta.
function planDocsAvailable(plan, kind) {
  const gia = planDocumentedItems(plan.id);
  return mrpBuyRows(plan, mrpNet)
    .filter(r => r.qtyOrder > 0 && !(gia.get(r.item.id) || []).some(x => x.kind === kind)).length;
}
function planDocsBody(gruppi, planId, kind) {
  const gia = planDocumentedItems(planId);
  // Già usato *per questo tipo* = non riselezionabile. Gli altri riferimenti si
  // mostrano lo stesso: sapere che di quell'articolo esiste già una richiesta è
  // utile anche mentre si prepara un ordine.
  const usati = r => (gia.get(r.item.id) || []).filter(x => x.kind === kind);
  const altri = r => (gia.get(r.item.id) || []).filter(x => x.kind !== kind);
  // Quanto varrà davvero la riga sul documento. Senza listino applicabile la
  // riga nascerà vuota: qui resta la stima da costificazione, che è l'unica
  // cifra disponibile per decidere se conviene generare.
  const importoDoc = r => (r.noDocPrice ? r.amount : r.amountDoc);

  const corpo = gruppi.map(g => {
    const key = g.supplierId || '';
    const disponibili = g.rows.filter(r => !usati(r).length);
    const righe = g.rows.map(r => {
      const bloccata = usati(r);
      const seg = [];
      if (bloccata.length) {
        seg.push(`<span class="mrp-warn" title="Già inserito in ${esc(bloccata.map(docRefLabel).join(', '))}: per cambiarne la quantità si modifica quel documento">
          ${ico('lock', 'tinted', '')} già in ${esc(bloccata.map(x => x.number).join(', '))}</span>`);
      } else {
        const a = altri(r);
        if (a.length) seg.push(`<span class="price-best" title="Esiste già ${esc(a.map(docRefLabel).join(', '))}, di tipo diverso: questa riga resta selezionabile">📄 ${esc(a.map(x => x.number).join(', '))}</span>`);
        if (r.underMin) seg.push(`<span class="mrp-warn" title="Quantità minima del fornitore: ${fmtUom(r.minQty, r.uom)}">${ico('warning', 'tinted', '')} sotto il minimo di ${fmtUom(r.minQty, r.uom)}</span>`);
        // Due assenze diverse, e la seconda è quella che manda fuori un ordine
        // sbagliato: l'articolo un prezzo ce l'ha, ma non da questo fornitore.
        if (r.noDocPrice) seg.push(`<span class="mrp-warn" title="${esc(supplierName(r.supplierId) || 'Questo fornitore')} non ha questo articolo a listino: la riga nascerà senza prezzo, da compilare a mano. Il prezzo di un altro fornitore non si applica.">⚠ non a listino</span>`);
        else if (r.noPrice) seg.push('<span class="mrp-warn" title="Senza prezzo la riga vale zero">' + ico('warning', 'tinted', '') + ' senza prezzo</span>');
        // Il listino applicabile non è quello con cui è stato costificato: il
        // documento seguirà il listino, e il totale qui sopra viene dal costo.
        else if (r.listinoDiverso) seg.push(`<span class="mrp-warn" title="Costificato a ${fmtPer(r.price, r.uom)}, ma ${esc(supplierName(r.supplierId) || 'il fornitore')} oggi quota ${fmtPer(r.docInGestione, r.uom)}. Sul documento va il listino.">⇄ a listino ${fmtPer(r.priceDoc, r.uom)}</span>`);
      }
      // Questo pannello è l'anteprima del documento: l'importo è quello che il
      // documento porterà, cioè il listino applicabile. Senza una quotazione di
      // quel fornitore resta la stima da costificazione — e accanto c'è il
      // badge che dice che sul documento quella cifra non ci sarà.
      return `<label class="plandoc-row${bloccata.length ? ' plandoc-used' : ''}">
        <input type="checkbox" class="plandoc-line" data-sup="${esc(key)}" value="${r.item.id}"
          ${bloccata.length ? 'disabled' : 'checked'} onchange="planDocsCount()">
        <span style="font-family:var(--mono)">${codeLink(r.item.id, r.item.code)}</span> ${esc(r.item.name)}
        <span class="plandoc-qty">${fmtUom(r.qtyOrder, r.uom)}${mrpNet && r.qtyOrder !== r.qty ? ` <span style="opacity:.6">(lordo ${fmtUom(r.qty, r.uom)})</span>` : ''} · ${fmtN(importoDoc(r))}</span> ${seg.join(' ')}</label>`;
    }).join('');
    const totDisp = disponibili.reduce((s, r) => s + importoDoc(r), 0);
    return `<div class="plandoc-group">
      <label class="plandoc-head">
        <input type="checkbox" class="plandoc-sup" data-sup="${esc(key)}" ${disponibili.length ? 'checked' : 'disabled'} onchange="planDocsToggleGroup(this)">
        ${ico('factory', 'tinted', '')} <strong>${esc(g.name)}</strong>
        <span class="plandoc-qty">${disponibili.length ? `${disponibili.length} ${disponibili.length === 1 ? 'riga' : 'righe'} · ${fmtN(totDisp)}` : 'tutto già documentato'}${disponibili.length < g.rows.length ? ` <span style="opacity:.6">(${g.rows.length - disponibili.length} già ${kind === 'rfq' ? 'in richiesta' : 'in ordine'})</span>` : ''}</span>
        ${g.supplierId ? '' : '<span class="mrp-warn" title="Nessun fornitore: il documento nasce da intestare">' + ico('warning', 'tinted', '') + ' da assegnare</span>'}
      </label>
      ${righe}</div>`;
  }).join('');
  const nDisp = gruppi.reduce((s, g) => s + g.rows.filter(r => !usati(r).length).length, 0);
  const avviso = nDisp ? '' : `<div class="rfq-warn">Tutte le righe di questo fabbisogno sono già finite in ${kind === 'rfq' ? 'una richiesta' : 'un ordine'}. Per cambiare quantità o fornitore si modifica il documento, oppure lo si elimina e si rigenera.</div>`;
  return `${avviso}${corpo}<p class="empty-text" style="text-align:left;padding:8px 0 0" id="plandoc-count"></p>`;
}
// Spunta di gruppo: trascina le sue righe, ed è il modo rapido di escludere un
// fornitore intero senza toccare riga per riga.
function planDocsToggleGroup(cb) {
  // Le righe già documentate restano fuori: la spunta di gruppo è una comodità,
  // non un modo per aggirare il blocco.
  document.querySelectorAll(`.plandoc-line[data-sup="${cb.dataset.sup}"]`)
    .forEach(x => { if (!x.disabled) x.checked = cb.checked; });
  planDocsCount();
}
function planDocsCount() {
  const el = document.getElementById('plandoc-count'); if (!el) return;
  const sel = planDocsSelection();
  const n = Array.from(sel.values()).reduce((s, ids) => s + ids.length, 0);
  el.textContent = n
    ? `${sel.size} ${sel.size === 1 ? 'documento' : 'documenti'} · ${n} ${n === 1 ? 'riga' : 'righe'}`
    : 'Nessuna riga selezionata.';
}
// → Map<supplierId|'', [itemId]>, solo i gruppi con almeno una riga spuntata
function planDocsSelection() {
  const sel = new Map();
  document.querySelectorAll('.plandoc-line').forEach(cb => {
    if (!cb.checked) return;
    const k = cb.dataset.sup || '';
    if (!sel.has(k)) sel.set(k, []);
    sel.get(k).push(cb.value);
  });
  return sel;
}
function planCreateDocs() {
  if (!roleGuard('docs')) return;
  const p = getPlan(window.__planDocsId); if (!p) return;
  // Il tipo l'ha deciso il pulsante che ha aperto la scheda, non un menu qui
  // dentro: qui si scelgono solo le righe.
  const kind = PLAN_DOC_KINDS[window.__planDocsKind] ? window.__planDocsKind : 'rfq';
  const sel = planDocsSelection();
  if (!sel.size) { showToast('Nessuna riga selezionata', 'error'); return; }
  const index = planBuyIndex(p);
  // Seconda guardia, oltre alle spunte disabilitate: la selezione arriva dal
  // DOM, e ciò che decide se un articolo può finire in un documento deve
  // stare accanto alla scrittura, non solo nell'interfaccia.
  const gia = planDocumentedItems(p.id);
  const bloccato = itemId => (gia.get(itemId) || []).some(x => x.kind === kind);
  const creati = [];
  let scartate = 0;
  sel.forEach((itemIds, supplierId) => {
    const ammesse = itemIds.filter(id => { if (bloccato(id)) { scartate++; return false; } return true; });
    const righe = ammesse.map(id => index.get(id)).filter(Boolean);
    if (!righe.length) return;
    creati.push(kind === 'rfq' ? planNewRfq(p, supplierId, righe) : planNewOrder(p, supplierId, righe));
  });
  if (!creati.length) {
    showToast(scartate ? 'Quelle righe sono già in un documento di questo tipo' : 'Nessun documento generato', 'error');
    return;
  }
  saveDB(); closeModal();
  // Un documento solo: si apre. Più d'uno: si va all'elenco, non c'è una scelta
  // sensata su quale aprire per primo.
  if (creati.length === 1) {
    docLeave(kind === 'rfq' ? 'rfq' : 'order');
    if (kind === 'rfq') { currentRfqId = creati[0].id; rfqView = 'edit'; }
    else { currentOrderId = creati[0].id; orderView = 'edit'; }
  } else if (kind === 'rfq') { rfqView = 'list'; currentRfqId = null; }
  else { orderView = 'list'; currentOrderId = null; }
  setView(kind === 'rfq' ? 'rfq' : 'orders');
  showToast(creati.length === 1
    ? (kind === 'rfq' ? 'Richiesta ' : 'Ordine ') + creati[0].number + ' creato da ' + p.number
    : creati.length + (kind === 'rfq' ? ' richieste create da ' : ' ordini creati da ') + p.number);
}
// Testata comune ai due tipi: intestatario, condizioni e legame col piano.
function planDocHead(p, supplierId) {
  const sup = supplierId ? getSupplier(supplierId) : null;
  return {
    title: p.title ? p.title + ' — ' + (sup ? sup.name : 'da assegnare') : ('Da ' + p.number),
    date: nowISO().slice(0, 10), status: 'bozza', supplierId: supplierId || null,
    transport: (sup && sup.defaultTransport) || db.settings.transportDefault || '',
    payment: (sup && sup.defaultPayment) || db.settings.paymentDefault || '',
    // La commessa segue il piano fino al documento: è la catena che permette di
    // chiedere «cosa abbiamo ordinato per la commessa 240?» e avere risposta.
    planId: p.id, jobId: p.jobId || null, notes: '', notesInternal: '', active: true,
  };
}
function planDocLine(r, conPrezzo) {
  const it = r.item;
  // La quantità del documento è quella mostrata nell'elenco: netta se il
  // fabbisogno netto è acceso, lorda altrimenti. Nascondere all'utente quale
  // delle due sta ordinando sarebbe il modo più rapido di fargli mandare al
  // fornitore un numero che non ha visto.
  // Unità sempre quella di gestione dell'articolo — è quella con cui si
  // ordina e si riceve davvero. Il prezzo è il costo del **listino
  // applicabile** (la quotazione più recente del fornitore a cui il
  // documento è intestato, vedi mrpBuyRow) già convertito in
  // quell'unità: se il fornitore quota a chilo, sulla riga va comunque
  // l'equivalente al metro, mai il prezzo grezzo al chilo.
  // Se quel fornitore non ha quotato l'articolo la riga parte **senza prezzo**:
  // una casella vuota si vede, il prezzo di un altro no.
  // La data di consegna richiesta è quella in cui il materiale serve: era
  // sempre vuota, e chi generava un ordine dal fabbisogno doveva riscriverla a
  // mano su ogni riga — cioè non la scriveva.
  return { id: gid(), itemId: it.id, code: it.code || '', description: it.name || '',
    uom: itemUom(it) || defaultUom(),
    qty: Number(r.qtyOrder != null ? r.qtyOrder : r.qty) || 0,
    price: conPrezzo && !r.noDocPrice && r.priceDoc > 0 ? r.priceDoc : '',
    deliveryDate: r.due || '', note: '' };
}
function planNewRfq(p, supplierId, righe) {
  // Una richiesta d'offerta non porta il prezzo: è la domanda, non la risposta.
  const r = stampNew(Object.assign({ id: gid(), number: nextRfqNumber() }, planDocHead(p, supplierId),
    { lines: righe.map(x => planDocLine(x, false)) }));
  db.rfqs.push(r);
  return r;
}
function planNewOrder(p, supplierId, righe) {
  const o = stampNew(Object.assign({ id: gid(), number: nextOrderNumber() }, planDocHead(p, supplierId),
    { rfqId: null, supplierConfirmation: '',
      lines: righe.map(x => Object.assign(planDocLine(x, true), { received: 0 })) }));
  db.orders.push(o);
  return o;
}
// ─── Documenti già generati da un piano ───
function planDocs(planId) {
  return {
    rfqs: (db.rfqs || []).filter(r => r.planId === planId),
    orders: (db.orders || []).filter(o => o.planId === planId),
  };
}
function planDocsList(planId) {
  const d = planDocs(planId);
  if (!d.rfqs.length && !d.orders.length) return '';
  const riga = (x, apri, icona) => `<span class="plandoc-link" ${clickAttrs(apri, 'Apri ' + x.number)}><span style="font-family:var(--mono)">${icona} ${esc(x.number)}</span> · ${esc(supplierName(x.supplierId) || 'da assegnare')}</span>`;
  return `<div class="mrp-section">
    <div class="cycle-section-head"><h3>${ico('clipboard', 'tinted pill', '')} Documenti generati</h3></div>
    <div class="plandoc-links">
      ${d.rfqs.map(r => riga(r, `openRfqFromPlan('${r.id}')`, ico('mail', 'tinted', 'Richiesta di offerta'))).join('')}
      ${d.orders.map(o => riga(o, `openOrderFromPlan('${o.id}')`, ico('receipt', 'tinted', 'Ordine a fornitore'))).join('')}
    </div></div>`;
}
// Stato prima, vista dopo: setView disegna già, chiamare open*Edit prima
// significherebbe disegnare due volte la stessa scheda.
function openRfqFromPlan(id) {
  docLeave('rfq'); currentRfqId = id; rfqView = 'edit';
  setView('rfq');
}
function openOrderFromPlan(id) {
  docLeave('order'); currentOrderId = id; orderView = 'edit';
  setView('orders');
}

// ─── Disegno ───
function renderMrp() {
  invalidateCaches();
  const host = document.getElementById('view-mrp');
  if (mrpView === 'edit' && !getPlan(currentPlanId)) { mrpView = 'list'; currentPlanId = null; }
  host.innerHTML = worklistHtml({
    titolo: 'Fabbisogno materiali', icona: 'list', listaId: 'plan-list',
    comandi: `<button class="add-btn-sm" onclick="newPlan()">+ Nuovo piano</button>
      ${listExportButtons('planListExportSpec')}`,
    filtri: `<input type="text" class="search" id="plan-search" value="${esc(val('plan-search'))}" placeholder="Numero o titolo..." oninput="planSearchInput()">
      <span class="doc-filter-count" id="plan-count">${planCountText()}</span>`,
    righe: planListRows(),
    doc: mrpView === 'edit' ? renderPlanEdit(currentPlanId) : '',
    nota: `Un piano <strong>aperto</strong> impegna il materiale che gli serve: gli altri piani lo vedono come non disponibile e non se lo contano. Chiuderlo — dalla testata del piano — restituisce quella quota, senza cancellare niente.`,
    vuoto: {
      titolo: 'Nessun piano aperto qui',
      testo: 'Scegli un piano dall\'elenco a destra: al centro compaiono cosa produrre, cosa comprare — al lordo o al netto di magazzino, ordinato e impegnato — e cosa fabbricare in casa.',
      comandi: '<button class="add-btn-sm" onclick="newPlan()">+ Nuovo piano</button>',
    },
  });
  a11yFields(host);
}
function planCountText() {
  return worklistCount(planFilteredList().length, (db.plans || []).length, 'piano', 'piani');
}
// I piani che l'elenco mostra. Estratta dal disegno perché la usa l'export.
function planFilteredList() {
  const q = (val('plan-search') || '').toLowerCase();
  const tutti = (db.plans || []).slice().sort((a, b) => (b.number || '').localeCompare(a.number || ''));
  return q ? tutti.filter(p => (p.number + ' ' + (p.title || '')).toLowerCase().includes(q)) : tutti;
}
// ─── Export dell'elenco dei piani ───
// L'elenco, non il contenuto di un piano: quello ha già i suoi export
// (`exportMrpExcel`/`exportMrpPDF`) dentro il piano aperto.
function planListExportSpec() {
  return {
    titolo: 'Fabbisogno materiali — piani',
    slug: 'piani',
    filtri: [['Ricerca', val('plan-search')]],
    sezioni: [{
      nome: 'Piani',
      colonne: [
        { h: 'Numero', w: 18 }, { h: 'Titolo', w: 34 }, { h: 'Stato', w: 12 },
        { h: 'Data', w: 12 }, { h: 'Consegna', w: 12 }, { h: 'Articoli a piano', w: 14, num: true },
      ],
      righe: planFilteredList().map(p => [
        p.number || '', p.title || '', p.active === false ? 'chiuso' : 'aperto',
        fmtDateIt(p.date), fmtDateIt(p.dueDate), (p.lines || []).length,
      ]),
    }],
  };
}
function planListRows() {
  const tutti = db.plans || [];
  const list = planFilteredList();
  return list.map(p => {
    const n = (p.lines || []).length;
    const chiuso = p.active === false;
    return worklistRow({
      numero: p.number,
      badge: `<span class="doc-badge ${chiuso ? 'st-chiusa' : 'st-aperta'}" title="${chiuso ? 'Chiuso: non impegna più materiale a magazzino' : 'Aperto: impegna a magazzino il materiale che gli serve'}">${chiuso ? 'chiuso' : 'aperto'}</span>`,
      titolo: p.title || '',
      meta: `${n} ${n === 1 ? 'articolo a piano' : 'articoli a piano'}${p.date ? ' · ' + esc(fmtDateIt(p.date)) : ''}`,
      sel: mrpView === 'edit' && currentPlanId === p.id,
      spenta: chiuso,
      azione: `openPlanEdit('${p.id}')`,
      etichetta: `Apri il piano ${p.number}`,
    });
  }).join('') || `<div class="empty-text">${tutti.length
    ? 'Nessun piano con questa ricerca.'
    : 'Nessun piano di produzione. Creane uno per sapere cosa comprare per costruire N macchine.'}</div>`;
}
function renderPlanEdit(id) {
  const p = getPlan(id);
  const exp = mrpExplode(p.lines);
  const buy = mrpRowsOf(exp.buy, id);
  // Dove ogni riga è già finita: si legge dai documenti del piano, una volta
  // per disegno invece che una volta per riga.
  const gia = planDocumentedItems(id);
  buy.forEach(r => { r.docRefs = gia.get(r.item.id) || []; });
  const totale = buy.reduce((s, r) => s + r.amount, 0);
  const fornitori = new Set(buy.filter(r => r.supplierId).map(r => r.supplierId)).size;
  const risparmio = buy.reduce((s, r) => s + r.saving, 0);
  const nImpegnate = buy.filter(r => r.committed > 0).length;

  const planRows = (p.lines || []).map(l => {
    const it = getItem(l.itemId);
    if (!it) return `<tr><td colspan="4" class="empty-text">${ico('warning', 'tinted', '')} articolo mancante</td>
      <td class="line-actions"><button class="mini-btn danger" onclick="planDelLine('${id}','${l.id}')" title="Togli dal piano">${ico('trash', 'tinted', 'Togli dal piano')}</button></td></tr>`;
    return `<tr>
      <td style="font-family:var(--mono)">${codeLink(it.id, it.code)}</td>
      <td>${esc(it.name)}<span class="bom-type-tag tt-${it.type}" style="margin-left:6px">${typeShort(it.type)}</span></td>
      <td>${esc(it.uom || '')}</td>
      <td><input type="number" class="rfq-qty-input" min="0" step="any" value="${Number(l.qty) || 0}"
        onchange="planSetLineQty('${id}','${l.id}',this.value)"></td>
      <td><input type="date" value="${esc(l.dueDate || '')}" title="Quando serve pronto: da qui nascono le date d'ordine di tutto ciò che ci va dentro"
        onchange="planSetLineDue('${id}','${l.id}',this.value)"></td>
      <td class="line-actions"><button class="mini-btn danger" onclick="planDelLine('${id}','${l.id}')" title="Togli dal piano">${ico('trash', 'tinted', 'Togli dal piano')}</button></td></tr>`;
  }).join('') || `<tr><td colspan="6" class="empty-text">Nessun articolo a piano. Usa "+ Aggiungi al piano".</td></tr>`;

  return `<div class="manage-wrap">
    <div class="bom-toolbar">
      ${worklistCloseBtn('planBackToList()', 'il piano')}
      <h2 class="section-title" style="margin:0">${ico('list', 'tinted pill', 'Piano di fabbisogno')} ${esc(p.number)}</h2>
      <button class="btn-outline" onclick="planToggleActive('${id}')" title="${p.active === false
        ? 'Chiuso: non impegna materiale. Riaprendolo tornerà a riservarsi quello che gli serve.'
        : 'Aperto: impegna a magazzino il materiale che gli serve, e gli altri piani non se lo contano. Chiudendolo quella quota torna libera.'}">${p.active === false ? ico('unlock', 'tinted', '') + ' Chiuso — riapri' : ico('lock', 'tinted', '') + ' Aperto — chiudi'}</button>
      ${planDocButton(p, 'rfq', ico('mail', 'tinted', '') + ' Genera richieste')}
      ${planDocButton(p, 'order', ico('receipt', 'tinted', '') + ' Genera ordini')}
      <button class="btn-outline" onclick="duplicatePlan('${id}')" title="Duplica il piano">${ico('copy', 'tinted', '')} Duplica</button>
      <button class="btn-outline" style="color:var(--red);border-color:var(--red)" onclick="delPlan('${id}')" title="Elimina il piano">${ico('trash', 'tinted', '')} Elimina</button>
      <button class="export-btn-xls" onclick="exportMrpExcel('${id}')">${ico('sheet', 'tinted', '')} Esporta Excel</button>
      <button class="export-btn-pdf" onclick="exportMrpPDF('${id}')">${ico('file', 'tinted', '')} Esporta PDF</button>
    </div>
    <div class="modal-grid">
      <div class="modal-field"><label>Titolo</label>
        <input id="plan-title" value="${esc(p.title || '')}" placeholder="es. Lotto settembre" onchange="planSetField('${id}','title',this.value)"></div>
      <div class="modal-field"><label>Data</label>
        <input type="date" id="plan-date" value="${esc(p.date || '')}" onchange="planSetField('${id}','date',this.value)"></div>
      <div class="modal-field"><label>Consegna richiesta</label>
        <input type="date" id="plan-due" value="${esc(p.dueDate || '')}" title="Proposta alle righe nuove: si può cambiare riga per riga" onchange="planSetField('${id}','dueDate',this.value)"></div>
      <div class="modal-field"><label>Commessa</label>
        <select id="plan-job" onchange="planSetField('${id}','jobId',this.value)">${jobOptions(p.jobId || '')}</select></div>
      <div class="modal-field" style="grid-column:1/-1"><label>Note</label>
        <input id="plan-notes" value="${esc(p.notes || '')}" onchange="planSetField('${id}','notes',this.value)"></div>
    </div>
    ${stampLine(p)}

    <div class="mrp-section">
      <div class="cycle-section-head">
        <h3>${ico('wrench', 'tinted pill', '')} Da produrre</h3>
        <button class="add-btn-sm" onclick="planAddModal('${id}')">+ Aggiungi al piano</button>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Codice</th><th>Articolo</th><th>U.M.</th><th style="width:120px">Q.tà</th>
          <th style="width:150px" title="Data in cui questo deve essere pronto">Serve per</th><th></th></tr></thead>
        <tbody>${planRows}</tbody></table></div>
    </div>

    <div class="cost-summary">
      ${kpi('Totale acquisti', fmtN(totale), 'accent')}
      ${kpi('Articoli da comprare', String(buy.length), 'orange')}
      ${kpi('Fornitori coinvolti', String(fornitori), '')}
      ${kpi('Parti da fabbricare', String(exp.make.length), 'purple')}
    </div>
    ${exp.cycle ? '<div class="empty-text" style="color:var(--red)">' + ico('warning', 'tinted', '') + ' Rilevato riferimento ciclico nelle distinte: il fabbisogno è troncato su quel ramo.</div>' : ''}
    ${risparmio > 0 ? `<div class="empty-text" style="text-align:left">↓ Scegliendo ovunque la quotazione più bassa a listino il totale scenderebbe di <strong>${fmtN(risparmio)}</strong>. Il prezzo in uso si cambia dal listino dell'articolo.</div>` : ''}

    <div class="mrp-section">
      <div class="cycle-section-head">
        <h3>${ico('cart', 'tinted pill', '')} Da acquistare</h3>
        <button class="btn-outline${mrpNet ? ' active' : ''}" onclick="toggleMrpNet()" title="Toglie dal fabbisogno quello che è già a magazzino, quello già ordinato e quello già impegnato da altri piani aperti">${mrpNet ? '☑' : '☐'} Fabbisogno netto</button>
        <button class="btn-outline${mrpGrouped ? ' active' : ''}" onclick="toggleMrpGroup()">${mrpGrouped ? '☑' : '☐'} Raggruppa per fornitore</button>
      </div>
      ${mrpNet ? `<p class="empty-text" style="text-align:left;padding:0 0 8px">Netto = <strong>lordo + scorta minima + impegnato − esistente − in arrivo</strong>, arrotondato al lotto di riordino. L'esistente è calcolato da ricevimenti e movimenti; l'in arrivo è ciò che è stato ordinato e non è ancora entrato; l'<strong>impegnato</strong> è quanto gli <em>altri piani aperti</em> hanno già promesso — senza toglierlo, due piani sugli stessi articoli si direbbero coperti entrambi con la stessa merce. Il lordo resta in colonna: serve a capire il prodotto, il netto a capire cosa comprare.</p>
      ${nImpegnate ? `<p class="empty-text" style="text-align:left;padding:0 0 8px">${ico('lock', 'tinted', '')} ${nImpegnate} ${nImpegnate === 1 ? 'riga contende' : 'righe contendono'} materiale con altri piani aperti. Un piano che non serve più si chiude dall'elenco: la sua quota torna libera.</p>` : ''}` : ''}
      ${mrpBuyTable(buy)}
    </div>

    <div class="mrp-section">
      <div class="cycle-section-head"><h3>${ico('factory', 'tinted pill', '')} Da fabbricare</h3></div>
      ${mrpMakeTable(exp.make)}
    </div>
    ${planDocsList(id)}</div>`;
}
// Il lordo non sparisce mai dalla riga: nel netto resta accanto, in chiaro.
// Vedere "servono 40, ne hai 25, ne compri 15" è tutt'altra cosa che vedere 15
// e doversi fidare.
function mrpBuyLineHtml(r) {
  const seg = [];
  if (r.bestPrice != null && r.saving > 0) seg.push(`<span class="price-best" title="A listino c'è ${fmtPer(r.bestPrice, r.uom)}: risparmio ${fmtPer(r.saving, r.uom)}">↓ ${fmtN(r.saving)}</span>`);
  if (r.underMin) seg.push(`<span class="mrp-warn" title="Quantità minima del fornitore: ${fmtUom(r.minQty, r.uom)}">${ico('warning', 'tinted', '')} sotto il minimo</span>`);
  if (r.noPrice) seg.push(`<span class="mrp-warn" title="Nessun prezzo in uso: la riga varrebbe zero in un ordine">${ico('warning', 'tinted', '')} senza prezzo</span>`);
  if (mrpNet && r.lotSize > 0 && r.net > 0) seg.push(r.lotMode === 'min'
    ? `<span class="mrp-warn" title="Portato al minimo ordinabile di ${fmtUom(r.lotSize, r.uom)}">↑ minimo ${fmtUom(r.lotSize, r.uom)}</span>`
    : `<span class="mrp-warn" title="Arrotondato al lotto di riordino di ${fmtUom(r.lotSize, r.uom)}">↑ lotto ${fmtUom(r.lotSize, r.uom)}</span>`);
  if (r.coperto) seg.push(`<span class="price-best" title="Esistente e in arrivo bastano, al netto di quanto è già impegnato">✓ coperto</span>`);
  // L'impegno si segnala **sempre**, anche col netto spento: è la risposta alla
  // domanda «la giacenza che vedo è davvero mia?», e nasconderla dietro un
  // toggle significherebbe lasciar promettere due volte la stessa merce a chi
  // quel toggle non l'ha acceso.
  if (r.committed > 0) {
    const chi = r.impegni.map(c => `${c.number}${c.title ? ' — ' + c.title : ''}: ${fmtQty(c.qty)} ${r.uom}`.trim()).join('\n');
    seg.push(`<span class="mrp-warn" title="Già promesso ad altri piani aperti:\n${esc(chi)}\n\nLibero = esistente + in arrivo − impegnato = ${fmtUom(r.libero, r.uom)}">🔒 impegnato ${fmtUom(r.committed, r.uom)}</span>`);
  }
  const urg = URGENZA_LABEL[r.urgenza];
  if (urg && urg.txt) seg.push(`<span class="${urg.cls}" title="${esc(urg.desc)}: ordinare entro il ${fmtDateIt(r.orderBy)}">${urg.txt}</span>`);
  // Dove è già finita questa riga. Si vede qui, senza aprire la generazione:
  // è la domanda «l'ho già ordinato?», e va risposta dove si guarda per primo.
  (r.docRefs || []).forEach(x => seg.push(
    `<span class="price-best" title="Questo articolo è già in ${esc(docRefLabel(x))} (${fmtQty(x.qty)} ${esc(x.uom)}) generato da questo fabbisogno">📄 ${esc(x.number)}</span>`));
  const celleStock = mrpNet ? `
    <td style="font-family:var(--mono);text-align:right;color:var(--text-dim)">${fmtQty(r.qty)}</td>
    <td style="font-family:var(--mono);text-align:right">${fmtQty(r.onHand)}${r.safety > 0 ? `<span class="empty-text" style="padding:0"> (min ${fmtQty(r.safety)})</span>` : ''}</td>
    <td style="font-family:var(--mono);text-align:right${r.committed > 0 ? ';color:var(--orange,#d90)' : ''}">${r.committed > 0 ? '−' + fmtQty(r.committed) : '—'}
      ${r.committed > 0 ? `<div class="empty-text" style="padding:0${r.libero < 0 ? ';color:var(--red)' : ''}">libero ${fmtQty(r.libero)}</div>` : ''}</td>
    <td style="font-family:var(--mono);text-align:right">${fmtQty(r.incoming)}</td>` : '';
  // Le due date stanno insieme: quella in cui serve non si può cambiare, quella
  // entro cui ordinare è l'unica su cui si può ancora fare qualcosa.
  const celleDate = `<td style="white-space:nowrap">${r.due ? esc(fmtDateIt(r.due)) : '<span class="empty-text" style="padding:0">—</span>'}</td>
    <td style="white-space:nowrap${r.urgenza === 'ritardo' ? ';color:var(--red);font-weight:700' : (r.urgenza === 'urgente' ? ';color:var(--orange,#d90)' : '')}">
      ${r.orderBy ? esc(fmtDateIt(r.orderBy)) : '<span class="empty-text" style="padding:0">—</span>'}
      ${r.leadDays ? `<div class="empty-text" style="padding:0">${r.leadDays} gg</div>` : ''}</td>`;
  return `<tr${r.coperto ? ' style="opacity:.55"' : ''}>
    <td style="font-family:var(--mono)">${codeLink(r.item.id, r.item.code)}</td>
    <td>${esc(r.item.name)} ${seg.join(' ')}</td>
    <td>${esc(supplierName(r.supplierId) || '—')}</td>
    ${celleDate}
    <td>${esc(r.uom)}</td>
    ${celleStock}
    <td style="font-family:var(--mono);text-align:right"><strong>${fmtQty(r.qtyOrder)}</strong></td>
    <td style="font-family:var(--mono);text-align:right">${fmtN(r.price)}</td>
    <td style="font-family:var(--mono);text-align:right">${fmtN(r.amount)}</td></tr>`;
}
function mrpBuyTable(rows) {
  if (!rows.length) return '<div class="empty-text">Niente da comprare: il piano è vuoto o i suoi articoli non hanno distinta.</div>';
  const colonneStock = mrpNet
    ? `<th style="text-align:right" title="Quanto serve in tutto">Lordo</th>
       <th style="text-align:right" title="Calcolato da ricevimenti e movimenti">Esistente</th>
       <th style="text-align:right" title="Già promesso agli altri piani di fabbisogno aperti: esistente meno questo è quello di cui si può disporre">Impegnato</th>
       <th style="text-align:right" title="Ordinato e non ancora ricevuto">In arrivo</th>` : '';
  const nCol = (mrpNet ? 11 : 7) + 2;   // + le due colonne di data
  const head = `<thead><tr><th>Codice</th><th>Articolo</th><th>Fornitore</th>
    <th title="Data in cui il materiale serve">Serve per</th>
    <th title="Data in cui serve meno i giorni di consegna del fornitore">Ordinare entro</th>
    <th>U.M.</th>
    ${colonneStock}<th style="text-align:right">${mrpNet ? 'Da comprare' : 'Q.tà'}</th>
    <th style="text-align:right" title="Prezzo di una unità, nella U.M. della colonna U.M.">Prezzo (${esc(cur())}/U.M.)</th>
    <th style="text-align:right">Importo (${esc(cur())})</th></tr></thead>`;
  const totale = rows.reduce((s, r) => s + r.amount, 0);
  let body;
  if (mrpGrouped) {
    body = mrpGroupBySupplier(rows).map(g => `
      <tr class="mrp-group"><td colspan="${nCol - 1}">${ico('factory', 'tinted', '')} ${esc(g.name)} — ${g.rows.length} ${g.rows.length === 1 ? 'articolo' : 'articoli'}</td>
        <td style="font-family:var(--mono);text-align:right">${fmtN(g.total)}</td></tr>
      ${g.rows.map(mrpBuyLineHtml).join('')}`).join('');
  } else {
    body = rows.map(mrpBuyLineHtml).join('');
  }
  return `<div class="table-wrap"><table>${head}<tbody>${body}
    <tr class="mrp-total"><td colspan="${nCol - 1}">Totale acquisti${mrpNet ? ' (netti)' : ''}</td>
      <td style="font-family:var(--mono);text-align:right">${fmtN(totale)}</td></tr></tbody></table></div>`;
}
function mrpMakeTable(make) {
  if (!make.length) return '<div class="empty-text">Nessuna parte da fabbricare in questo piano.</div>';
  const rows = make.map(e => {
    const c = costOf(e.item.id).total;
    return `<tr>
      <td style="font-family:var(--mono)">${codeLink(e.item.id, e.item.code)}</td>
      <td>${esc(e.item.name)}</td>
      <td>${esc(e.item.uom || '')}</td>
      <td style="font-family:var(--mono);text-align:right">${fmtQty(e.qty)}</td>
      <td style="font-family:var(--mono);text-align:right">${fmtN(c)}</td>
      <td style="font-family:var(--mono);text-align:right">${fmtN(c * e.qty)}</td></tr>`;
  }).join('');
  return `<div class="table-wrap"><table>
    <thead><tr><th>Codice</th><th>Parte</th><th>U.M.</th>
      <th style="text-align:right">Q.tà</th><th style="text-align:right">Costo un. (${esc(cur())}/U.M.)</th>
      <th style="text-align:right">Importo (${esc(cur())})</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}
// Le quantità esplose sono float (scarti e frazioni): si mostrano senza zeri
// inutili. La formattazione — e l'unità che le va accanto — stanno in core.js:
// fmtQty / fmtUom / fmtPer.

// ─── Export ───
function exportMrpExcel(id) {
  const p = getPlan(id); if (!p) return;
  const exp = mrpExplode(p.lines);
  const buy = mrpRowsOf(exp.buy, id);
  // Nel netto l'esportazione porta anche le colonne che spiegano il numero:
  // un foglio con solo "15" non permette a nessuno di rifare il conto.
  // Le quantità restano numeri, sommabili: l'unità è nella colonna U.M. e la
  // valuta nell'intestazione delle colonne di denaro.
  const colPrezzo = `Prezzo (${cur()}/U.M.)`, colImporto = `Importo (${cur()})`;
  const acquisti = [mrpNet
    ? ['Codice', 'Articolo', 'Fornitore', 'U.M.', 'Lordo', 'Esistente', 'Impegnato', 'In arrivo', 'Da comprare', colPrezzo, colImporto]
    : ['Codice', 'Articolo', 'Fornitore', 'U.M.', 'Quantità', colPrezzo, colImporto]];
  (mrpGrouped ? mrpGroupBySupplier(buy).flatMap(g => g.rows) : buy).forEach(r => {
    const testa = [r.item.code, r.item.name, supplierName(r.supplierId) || '', r.uom];
    const coda = [+r.price.toFixed(4), +r.amount.toFixed(2)];
    acquisti.push(mrpNet
      ? testa.concat([+r.qty.toFixed(3), +r.onHand.toFixed(3), +r.committed.toFixed(3), +r.incoming.toFixed(3), +r.qtyOrder.toFixed(3)], coda)
      : testa.concat([+r.qty.toFixed(3)], coda));
  });
  acquisti.push([]);
  const rigaTotale = new Array(acquisti[0].length).fill('');
  rigaTotale[1] = 'TOTALE';
  rigaTotale[rigaTotale.length - 1] = +buy.reduce((s, r) => s + r.amount, 0).toFixed(2);
  acquisti.push(rigaTotale);
  const produzione = [['Codice', 'Parte', 'U.M.', 'Quantità', `Costo unitario (${cur()}/U.M.)`, `Importo (${cur()})`]];
  exp.make.forEach(e => {
    const c = costOf(e.item.id).total;
    produzione.push([e.item.code, e.item.name, e.item.uom || '', +e.qty.toFixed(3), +c.toFixed(4), +(c * e.qty).toFixed(2)]);
  });
  if (!requireXlsx()) return;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(acquisti), 'Acquisti');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(produzione), 'Produzione');
  XLSX.writeFile(wb, `Fabbisogno_${p.number}.xlsx`);
  showToast('Excel esportato');
}
function exportMrpPDF(id) {
  const p = getPlan(id); if (!p) return;
  const exp = mrpExplode(p.lines);
  const buy = mrpRowsOf(exp.buy, id);
  const jsPDF = requirePdf(); if (!jsPDF) return;
  const doc = new jsPDF();
  doc.setFontSize(15); doc.text(`Fabbisogno materiali — ${p.number}`, 14, 16);
  doc.setFontSize(10); doc.setTextColor(120);
  doc.text(`${p.title || ''}${p.title ? '   ' : ''}Data: ${p.date ? fmtDateIt(p.date) : new Date().toLocaleDateString('it-IT')}`, 14, 23);
  doc.autoTable({
    startY: 28, head: [['Codice', 'Da produrre', 'Q.tà', 'U.M.']],
    body: (p.lines || []).map(l => { const it = getItem(l.itemId); return [it ? it.code : '?', it ? it.name : '⚠ mancante', fmtQty(l.qty), it ? (it.uom || '') : '']; }),
    styles: { fontSize: 8 }, headStyles: { fillColor: [58, 123, 232] },
  });
  // Nel netto la quantità porta accanto il lordo fra parentesi: chi riceve il
  // foglio deve poter rifare il conto senza tornare all'app.
  const righe = (mrpGrouped ? mrpGroupBySupplier(buy).flatMap(g => g.rows) : buy)
    .map(r => [r.item.code, r.item.name, supplierName(r.supplierId) || '—',
      (fmtQty(r.qtyOrder) + ' ' + r.uom).trim() + (mrpNet && r.qtyOrder !== r.qty ? ` (lordo ${fmtQty(r.qty)} ${r.uom})`.trimEnd() : ''),
      fmtN(r.price) + (r.uom ? '/' + r.uom : ''), fmtN(r.amount)]);
  righe.push(['', 'TOTALE', '', '', '', fmtN(buy.reduce((s, r) => s + r.amount, 0))]);
  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 8,
    head: [['Codice', mrpNet ? 'Da acquistare (netto)' : 'Da acquistare', 'Fornitore', 'Q.tà', 'Prezzo', 'Importo']], body: righe,
    styles: { fontSize: 8 }, headStyles: { fillColor: [58, 123, 232] },
  });
  if (exp.make.length) {
    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 8,
      head: [['Codice', 'Da fabbricare', 'Q.tà', 'U.M.', 'Costo un.', 'Importo']],
      body: exp.make.map(e => {
        const c = costOf(e.item.id).total, u = e.item.uom || '';
        return [e.item.code, e.item.name, fmtQty(e.qty), u, fmtN(c) + (u ? '/' + u : ''), fmtN(c * e.qty)];
      }),
      styles: { fontSize: 8 }, headStyles: { fillColor: [155, 109, 255] },
    });
  }
  doc.save(`Fabbisogno_${p.number}.pdf`);
  showToast('PDF esportato');
}
