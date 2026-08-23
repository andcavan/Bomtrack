// ═══════════════════════════════════════════════════════════
//  BOMTRACK — views-docs.js
// ═══════════════════════════════════════════════════════════
// Documenti verso i fornitori: blocco per stato, richieste di offerta e ordini.
// Classic script, scope globale condiviso con gli altri: nessun modulo e
// nessun build, così index.html continua ad aprirsi con un doppio click.

// ═══════════════════════════════════════════════════════════
//  BLOCCO MODIFICHE PER STATO (condiviso RFQ / Ordini)
// ═══════════════════════════════════════════════════════════
// Un documento uscito verso il fornitore non va più toccato per distrazione, ma
// deve restare correggibile: si blocca il contenuto *contrattuale* (fornitore,
// condizioni, righe) lasciando libero l'avanzamento *operativo*.
//   'full'      tutto modificabile        (bozza, o documento sbloccato a mano)
//   'offer'     + prezzo/consegna riga    (RFQ inviata: l'offerta si compila al ritorno)
//   'reception' + colonna Ricevuto        (ODA in corso: le merci arrivano dopo l'invio)
//   'none'      sola lettura              (documento concluso o annullato)
// Stato, note documento e note di riga ('ops') restano sempre modificabili.
const LOCK_KINDS = { full: ['contract', 'offer', 'reception'], offer: ['offer'], reception: ['reception'], none: [] };
function modeAllows(mode, kind) {
  return kind === 'ops' || (LOCK_KINDS[mode] || LOCK_KINDS.full).includes(kind);
}
// Lo sblocco vale per il documento aperto e dura quanto la sessione di editing:
// uscendo verso l'elenco il documento si richiude da solo.
let rfqUnlockedId = null, orderUnlockedId = null;
function docLockBanner(mode, kind, docKind, id) {
  if (mode === 'full') return '';
  const what = mode === 'offer' ? 'Prezzo unitario e data consegna restano compilabili'
    : mode === 'reception' ? 'La colonna Ricevuto resta compilabile'
      : 'Il documento è in sola lettura';
  // Il gestore si compone qui da un tipo noto, non arriva come JavaScript grezzo
  // dal chiamante: nessun template deve poter iniettare codice in un onclick.
  const fn = docKind === 'order' ? 'ordUnlock' : 'rfqUnlock';
  return `<div class="doc-lock-banner">
    <span>🔒 ${esc(kind)} — i dati sono protetti dalle modifiche accidentali. ${what}; note e stato restano sempre modificabili.</span>
    <button class="btn-outline" onclick="${fn}('${esc(id)}')">🔓 Sblocca per modifica</button></div>`;
}
// Disabilita in un passaggio gli input marcati, invece di condizionare ogni template.
function applyDocLock(mode, host) {
  if (!host) return;
  ['contract', 'offer', 'reception'].forEach(kind => {
    const off = !modeAllows(mode, kind);
    host.querySelectorAll('.lock-' + kind).forEach(el => {
      el.disabled = off;
      if (off) el.title = 'Documento bloccato: usa 🔓 Sblocca per modifica';
    });
  });
}
function statusBadge(map, status) {
  return `<span class="doc-badge st-${esc(status)}">${esc(map[status] || status)}</span>`;
}
// Generare il documento è il momento in cui esce verso il fornitore, ma capita
// di stampare una bozza di controllo: si chiede, non si impone.
function askMarkSent(doc, question, sentStatus, rerender) {
  if (doc.status !== 'bozza') return;
  askConfirm(question, () => {
    doc.status = sentStatus;
    touch(doc); saveDB(); rerender();
    showToast('Stato: ' + sentStatus.charAt(0).toUpperCase() + sentStatus.slice(1));
  }, { title: '📤 Documento generato', ok: 'Sì, segna come inviato', cancel: 'No, resta in bozza', safe: true });
}

// ═══════════════════════════════════════════════════════════
//  I DUE TIPI DI DOCUMENTO
// ═══════════════════════════════════════════════════════════
// Richieste d'offerta e ordini sono lo stesso oggetto — una testata con un
// fornitore, delle righe, uno stato e un blocco che dipende dallo stato — e per
// molte versioni sono stati due copie quasi identiche di una ventina di
// funzioni. Le differenze vere sono poche e stanno tutte qui dentro:
//
//   la richiesta                        l'ordine
//   ─────────────────────────────────   ────────────────────────────────────
//   il prezzo è la risposta attesa,     il prezzo è concordato e nasce con
//   arriva dopo l'invio ('offer')       la riga; dopo l'invio arrivano invece
//                                       le merci ('reception')
//   lo stato deriva dai prezzi          lo stato deriva dai ricevimenti
//   nessun ricevimento sulle righe      ogni riga porta il proprio `received`
//
// Tutto il resto — guardie, blocchi, sblocco, modifica campi e righe,
// aggiunta da catalogo, salvataggio, eliminazione — è una funzione sola,
// parametrica sul tipo. I nomi storici (`rfqSetLine`, `ordSetLine`…) restano
// come adattatori di una riga: sono citati in centinaia di `onclick` nei
// template, e cambiarli non avrebbe aggiunto niente se non rischio.
const RFQ_STATUS = { bozza: 'Bozza', inviata: 'Inviata', ricevuta: 'Offerta ricevuta', chiusa: 'Chiusa' };
const RFQ_LOCK = { bozza: 'full', inviata: 'offer', ricevuta: 'offer', chiusa: 'none' };
const ORDER_STATUS = { bozza: 'Bozza', inviato: 'Inviato', confermato: 'Confermato', parziale: 'Parziale', evaso: 'Evaso', annullato: 'Annullato' };
// Dopo l'invio le merci continuano ad arrivare: si blocca il contenuto dell'ordine
// ma non la registrazione dei ricevimenti.
const ORDER_LOCK = { bozza: 'full', inviato: 'reception', confermato: 'reception', parziale: 'reception', evaso: 'reception', annullato: 'none' };

const DOC_KINDS = {
  rfq: {
    coll: 'rfqs', pfx: 'rl',
    nome: 'Richiesta', articolo: 'La richiesta', pronome: 'la', suffisso: 'a',   // «sbloccarla», «richiesta sbloccata»
    STATUS: RFQ_STATUS, LOCK: RFQ_LOCK,
    hasLinePrice: false,          // la richiesta è la domanda, non la risposta
    get: id => getRfq(id),
    all: () => db.rfqs,
    render: () => renderRfq(),
    autoStatus: r => rfqAutoStatus(r),
    unlocked: () => rfqUnlockedId,
    setUnlocked: v => { rfqUnlockedId = v; },
    dirty: v => { if (v === undefined) return rfqDirty; rfqDirty = v; return v; },
    saveBtnId: 'rfq-save-btn', exportBtnClass: 'rfq-export-btn',
    dirtyHint: 'Salva la richiesta prima di generare il documento',
    // Campi che restano modificabili a documento bloccato.
    opsFields: ['status', 'notes', 'notesInternal'],
    // Il campo di riga decide quale blocco lo governa: prezzo e consegna sono
    // ciò che torna con l'offerta, e restano aperti a richiesta inviata.
    lineLock: field => (field === 'price' || field === 'deliveryDate') ? 'offer' : 'contract',
    numLineFields: ['qty', 'price'],
    newLineExtra: () => ({}),
    // Una riga da catalogo su una richiesta non porta prezzo: si chiede
    // un'offerta nell'unità in cui quel fornitore quota, non gli si dice quanto
    // deve costare.
    catalogLine: riga => Object.assign(riga, { price: '' }),
    catalogToast: (n) => n + ' righe aggiunte',
  },
  order: {
    coll: 'orders', pfx: 'ol',
    nome: 'Ordine', articolo: "L'ordine", pronome: 'lo', suffisso: 'o',
    STATUS: ORDER_STATUS, LOCK: ORDER_LOCK,
    hasLinePrice: true,
    get: id => getOrder(id),
    all: () => db.orders,
    render: () => renderOrders(),
    autoStatus: o => ordAutoStatus(o),
    unlocked: () => orderUnlockedId,
    setUnlocked: v => { orderUnlockedId = v; },
    dirty: v => { if (v === undefined) return orderDirty; orderDirty = v; return v; },
    saveBtnId: 'order-save-btn', exportBtnClass: 'order-export-btn',
    dirtyHint: "Salva l'ordine prima di generare il documento",
    opsFields: ['status', 'notes', 'notesInternal', 'supplierConfirmation'],
    // I ricevimenti si registrano proprio a ordine inviato, e la data confermata
    // dal fornitore arriva dopo l'invio per definizione: stesso gruppo.
    lineLock: field => (field === 'received' || field === 'confirmedDate') ? 'reception' : 'contract',
    numLineFields: ['qty', 'price', 'received'],
    newLineExtra: () => ({ received: 0 }),
    catalogLine: riga => Object.assign(riga, { received: 0 }),
    catalogToast: (n, senzaPrezzo, doc) => senzaPrezzo
      // Le righe senza prezzo si dicono subito. Restano vuote apposta — questo
      // fornitore non le ha mai quotate — ma un ordine che parte con righe a
      // zero è un ordine da rifare, e chi lo compila deve saperlo adesso.
      // (showToast passa già da esc(): il nome del fornitore va concatenato crudo.)
      ? `${n} righe aggiunte · ${senzaPrezzo} senza prezzo: ${supplierName(doc.supplierId) || 'questo fornitore'} non le ha a listino`
      : n + ' righe aggiunte',
    // Il n° di conferma d'ordine è la prova che il fornitore ha accettato.
    afterSetField: (o, field, value) => {
      if (field === 'supplierConfirmation' && value && o.status === 'inviato') o.status = 'confermato';
    },
    // Non si può ricevere più di quanto ordinato: sarebbe una riga in eccedenza
    // che manderebbe l'ordine in "evaso" con numeri incoerenti.
    afterSetLine: (o, l, field) => {
      if (field !== 'received') return;
      const ordinata = Number(l.qty) || 0;
      if (l.received > ordinata) { l.received = ordinata; showToast('Non si può ricevere più di quanto ordinato', 'error'); }
    },
  },
};
function docKind(k) { return DOC_KINDS[k] || DOC_KINDS.rfq; }
function docStatusLabel(K, doc) { return (K.STATUS[doc.status] || doc.status || '').toLowerCase(); }

function docMode(k, doc) {
  const K = docKind(k);
  return (doc && K.unlocked() === doc.id) ? 'full' : ((doc && K.LOCK[doc.status]) || 'full');
}
// Guard dei mutatori: il blocco vive qui, non nella UI (che si limita a
// disabilitare). Il ruolo viene prima dello stato — chi non può scrivere
// documenti non passa nemmeno su una bozza.
function docGuard(k, id, lockKind) {
  const K = docKind(k);
  if (!roleGuard('docs')) return false;
  const doc = K.get(id); if (!doc) return false;
  if (modeAllows(docMode(k, doc), lockKind)) return true;
  showToast(`${K.nome} ${docStatusLabel(K, doc)}: usa 🔓 Sblocca per modificarl${K.suffisso}`, 'error');
  return false;
}
function docUnlock(k, id) {
  const K = docKind(k);
  const doc = K.get(id); if (!doc) return;
  askConfirm(`${K.articolo} ${doc.number} risulta ${docStatusLabel(K, doc)}.\nSbloccarl${K.suffisso} per modificarl${K.suffisso}?`, () => {
    K.setUnlocked(id); K.render(); showToast(`${K.nome} sbloccat${K.suffisso}`);
  }, { title: '🔓 Sblocca per modifica', ok: 'Sblocca', safe: true });
}
// Salvataggio differito: le modifiche restano in memoria e si persistono solo
// con "Salva". Finché ci sono modifiche non salvate i pulsanti che generano il
// documento restano disabilitati — un PDF che non corrisponde a ciò che è
// salvato è peggio di nessun PDF.
function docMarkDirty(k) {
  const K = docKind(k);
  K.dirty(true);
  const sv = document.getElementById(K.saveBtnId); if (sv) sv.classList.add('dirty');
  document.querySelectorAll('.' + K.exportBtnClass).forEach(b => { b.disabled = true; b.title = K.dirtyHint; });
}
function docSave(k, id) {
  const K = docKind(k);
  const doc = K.get(id); if (!doc) return;
  touch(doc); saveDB(); K.dirty(false); K.render();
  showToast(`${K.nome} salvat${K.suffisso}`);
}
function docSetField(k, id, field, value) {
  const K = docKind(k);
  const lockKind = K.opsFields.includes(field) ? 'ops' : 'contract';
  if (!docGuard(k, id, lockKind)) { K.render(); return; }
  const doc = K.get(id); if (!doc) return;
  const before = doc.status;
  doc[field] = value || (field === 'supplierId' ? null : '');
  if (K.afterSetField) K.afterSetField(doc, field, value);
  touch(doc); docMarkDirty(k);
  // Il cambio di stato cambia anche il livello di blocco: la vista va rifatta.
  if (doc.status !== before || field === 'status') {
    K.render();
    if (doc.status !== before) showToast('Stato: ' + (K.STATUS[doc.status] || doc.status));
  }
}
// Alla scelta del fornitore si ereditano le sue condizioni predefinite.
function docSetSupplier(k, id, sid) {
  const K = docKind(k);
  if (!docGuard(k, id, 'contract')) { K.render(); return; }
  const doc = K.get(id); if (!doc) return;
  doc.supplierId = sid || null;
  const sup = sid ? getSupplier(sid) : null;
  if (sup) {
    if (sup.defaultTransport) doc.transport = sup.defaultTransport;
    if (sup.defaultPayment) doc.payment = sup.defaultPayment;
  }
  touch(doc); docMarkDirty(k); K.render();
}
function docSetLine(k, id, lineId, field, value) {
  const K = docKind(k);
  if (!docGuard(k, id, K.lineLock(field))) { K.render(); return; }
  const doc = K.get(id); if (!doc) return;
  const l = (doc.lines || []).find(x => x.id === lineId); if (!l) return;
  const before = doc.status;
  // Modifica diretta in tabella: niente messaggi, si riporta a 0 (il vincolo è
  // anche sull'input, qui si copre l'incollaggio di testo).
  if (K.numLineFields.includes(field)) {
    l[field] = (value === '' ? (field === 'received' ? 0 : '') : clampNum(parseFloat(value), 0));
  } else l[field] = value;
  if (K.afterSetLine) K.afterSetLine(doc, l, field);
  K.autoStatus(doc);   // anche cambiare una quantità sposta la soglia di evasione
  touch(doc); docMarkDirty(k);
  if (doc.status !== before) { K.render(); showToast('Stato: ' + (K.STATUS[doc.status] || doc.status)); }
  else if (K.numLineFields.includes(field)) K.render();
}
function docDelLine(k, id, lineId) {
  const K = docKind(k);
  if (!docGuard(k, id, 'contract')) return;
  const doc = K.get(id); if (!doc) return;
  doc.lines = (doc.lines || []).filter(x => x.id !== lineId);
  K.autoStatus(doc); touch(doc); docMarkDirty(k); K.render();
}
function docAddManualLine(k, id) {
  const K = docKind(k), p = K.pfx;
  if (!docGuard(k, id, 'contract')) return;
  const doc = K.get(id); if (!doc) return;
  const desc = val(p + '-desc'); if (!desc) { showToast('Descrizione richiesta', 'error'); return; }
  if (isNeg(p + '-qty')) { showToast('La quantità non può essere negativa', 'error'); return; }
  if (K.hasLinePrice && isNeg(p + '-price')) { showToast('Il prezzo non può essere negativo', 'error'); return; }
  doc.lines.push(Object.assign({
    id: gid(), itemId: null, code: val(p + '-code'), description: desc, uom: val(p + '-uom') || defaultUom(),
    qty: numVal(p + '-qty', 0) || 1,
    price: K.hasLinePrice ? (val(p + '-price') === '' ? '' : numVal(p + '-price', 0)) : '',
    deliveryDate: '', note: val(p + '-note'),
  }, K.newLineExtra()));
  K.autoStatus(doc); touch(doc); docMarkDirty(k); closeModal(); K.render();
}
// Modifica riga: per le righe manuali si possono correggere anche codice,
// descrizione e U.M.; per quelle da catalogo restano legate all'articolo.
// Su documento bloccato resta modificabile la sola nota: gli altri campi si
// mostrano comunque, in grigio, così la riga è consultabile per intero.
function docEditLineModal(k, id, lineId) {
  const K = docKind(k), p = K.pfx;
  const doc = K.get(id); if (!doc) return;
  const l = (doc.lines || []).find(x => x.id === lineId); if (!l) return;
  const ro = !modeAllows(docMode(k, doc), 'contract');
  const qty = `<div class="modal-field"><label id="${p}-qty-label">${docQtyLabel(l.uom || '')}</label>
    <input id="${p}-qty" type="number" value="${l.qty}" min="0" step="any" ${ro ? 'disabled' : ''}></div>`;
  const prezzo = K.hasLinePrice ? `<div class="modal-field"><label id="${p}-price-label">${docPriceLabel(l.uom || '')}</label>
    <input id="${p}-price" type="number" min="0" step="any" value="${l.price === '' || l.price == null ? '' : l.price}" ${ro ? 'disabled' : ''}></div>` : '';
  openModal(`<h3>✏ Modifica riga</h3>
    ${lineIdentityFields(p, l, ro)}
    ${prezzo ? `<div class="modal-grid">${qty}${prezzo}</div>` : qty}
    <div class="modal-field"><label>Nota (stampata sul documento)</label><textarea id="${p}-note" rows="2">${esc(l.note || '')}</textarea></div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="${k === 'order' ? 'ordSaveLineEdit' : 'rfqSaveLineEdit'}('${esc(id)}','${esc(lineId)}')">Salva</button></div>`);
}
function docSaveLineEdit(k, id, lineId) {
  const K = docKind(k), p = K.pfx;
  const doc = K.get(id); if (!doc) return;
  const l = (doc.lines || []).find(x => x.id === lineId); if (!l) return;
  if (modeAllows(docMode(k, doc), 'contract')) {
    if (!readLineIdentity(p, l)) return;
    if (isNeg(p + '-qty')) { showToast('La quantità non può essere negativa', 'error'); return; }
    if (K.hasLinePrice && isNeg(p + '-price')) { showToast('Il prezzo non può essere negativo', 'error'); return; }
    l.qty = numVal(p + '-qty', 0);
    if (K.hasLinePrice) l.price = val(p + '-price') === '' ? '' : numVal(p + '-price', 0);
  }
  l.note = val(p + '-note');   // la nota passa sempre, anche a documento bloccato
  K.autoStatus(doc); touch(doc); docMarkDirty(k); closeModal(); K.render();
}
function docAddCatalogLines(k, id, ids) {
  const K = docKind(k);
  if (!docGuard(k, id, 'contract')) return;
  const doc = K.get(id); if (!doc) return;
  let senzaPrezzo = 0;
  ids.forEach(itemId => {
    const it = getItem(itemId); if (!it) return;
    const riga = K.catalogLine(docLineFromItem(it, doc.supplierId));
    if (riga.price === '') senzaPrezzo++;
    doc.lines.push(riga);
  });
  K.autoStatus(doc); touch(doc); docMarkDirty(k); closeModal(); K.render();
  showToast(K.catalogToast(ids.length, senzaPrezzo, doc));
}
// ─── Intestazione di un documento che esce: chi ordina, chi riceve ───
// Le stesse righe su PDF ed Excel, per la richiesta e per l'ordine: nome,
// indirizzo, partita IVA, referente e recapiti. Le vuote cadono qui, così un
// fornitore senza telefono non lascia una riga bianca in mezzo al blocco.
// `bilingue` mette l'etichetta IT/EN dei documenti stampati, che vanno anche
// a fornitori esteri.
function docPartyLines(e, bilingue) {
  if (!e) return [];
  const iva = bilingue ? 'P.IVA / VAT ' : 'P.IVA ';
  return [e.name, ...addressLines(e), e.vat ? iva + e.vat : '', e.referente, e.email, e.phone]
    .map(s => s || '').filter(Boolean);
}
// Eliminazione. Su un documento che non è più una bozza l'avviso dice **cosa**
// si sta cancellando: «risulta inviato» ferma la mano più di «sei sicuro?».
// `extraWarn` aggiunge ciò che solo quel tipo sa (i ricevimenti di un ordine).
function docDel(k, id, before, extraWarn) {
  const K = docKind(k);
  if (!roleGuard('docs')) return;
  const doc = K.get(id); if (!doc) return;
  const warn = doc.status === 'bozza' ? ''
    : `\nAttenzione: risulta ${docStatusLabel(K, doc)}${extraWarn ? extraWarn(doc) : ''}.`;
  askConfirm(`Eliminare ${K.pronome} ${K.nome.toLowerCase()} ${doc.number}?${warn}`, () => {
    if (before) before();
    removeConUndo(K.coll, id, `${K.nome} ${doc.number} eliminat${K.suffisso}`, () => K.render());
  });
}
function docBackToList(k) {
  const K = docKind(k);
  if (K.dirty()) { saveDB(); K.dirty(false); }
  K.setUnlocked(null);
  if (k === 'order') { orderView = 'list'; currentOrderId = null; }
  else { rfqView = 'list'; currentRfqId = null; }
  K.render();
}

// ═══════════════════════════════════════════════════════════
//  VISTA: RICHIESTE DI OFFERTA (RFQ)
// ═══════════════════════════════════════════════════════════
function rfqMode(r) { return docMode('rfq', r); }
function rfqGuard(id, kind) { return docGuard('rfq', id, kind); }
function rfqUnlock(id) { return docUnlock('rfq', id); }
// Se tutte le righe hanno un prezzo l'offerta è tornata: è un fatto, non una scelta.
function rfqAutoStatus(r) {
  if (r.status !== 'inviata' && r.status !== 'ricevuta') return;
  const lines = r.lines || [];
  const priced = lines.length > 0 && lines.every(l => l.price !== '' && l.price != null);
  r.status = priced ? 'ricevuta' : 'inviata';
}
function getRfq(id) { return db.rfqs.find(r => r.id === id); }
function fmtDateIt(d) { return d ? new Date(d).toLocaleDateString('it-IT') : ''; }
// ─── Codice e descrizione «presso il fornitore», sulla riga di un documento ───
// Escono **solo se il fornitore coincide**: sono il modo in cui quel fornitore
// chiama l'articolo, e stamparli su un documento intestato a un altro non è
// un'imprecisione — è un codice d'ordine sbagliato, che il fornitore prende per
// buono e su cui spedisce il pezzo di qualcun altro.
//
// La coincidenza si verifica dentro il listino, non sui campi dell'articolo:
// `it.supplierCode`/`it.supplierDesc` sono la copia della sola quotazione **in
// uso**, e su un ordine al secondo fornitore lasciavano la casella vuota pur
// avendo il dato a listino. La quotazione giusta la trova supplierPriceRow().
function lineSupInfo(supplierId, l) {
  if (!l.itemId || !supplierId) return null;
  const row = supplierPriceRow(getItem(l.itemId), supplierId);
  if (!row || (!row.code && !row.desc)) return null;
  return { code: row.code || '', desc: row.desc || '' };
}
function rfqLineSupInfo(r, l) { return lineSupInfo(r.supplierId, l); }

// ─── Una riga di documento nata da un articolo di catalogo ───
// Il listino che si applica è quello del **fornitore a cui il documento è
// intestato**, nella sua quotazione più recente: prezzo, unità, codice e
// descrizione vengono tutti da quella riga sola.
//
// Se quel fornitore non ha quotazioni **non si applica niente**: la riga nasce
// senza prezzo, nell'unità di gestione. È l'unica risposta onesta — il prezzo di
// un altro fornitore su un ordine a questo è un numero sbagliato che ha tutta
// l'aria di essere giusto, e si scopre alla fattura. Una casella vuota si vede
// subito, e il fabbisogno la segnala già come «⚠ senza prezzo».
//
// Il documento senza intestatario (capita: si compilano le righe e il fornitore
// si sceglie dopo) ricade nello stesso caso: nessun listino da applicare.
function docLineFromItem(it, supplierId) {
  const row = supplierPriceRow(it, supplierId);
  const quotato = row && row.price !== '' && row.price != null;
  return {
    id: gid(), itemId: it.id, code: it.code || '', description: it.name || '',
    // L'unità è quella in cui quel fornitore quota: se vende a chilo, l'ordine è
    // in chili. Il prezzo è il suo, grezzo — è già espresso in quell'unità, e
    // convertirlo lo porterebbe in una lingua che lui non parla.
    uom: (row ? priceUomOf(it, row) : itemUom(it)) || defaultUom(),
    qty: 1, price: quotato ? Number(row.price) : '', deliveryDate: '', note: '',
  };
}
// Nei documenti la nota di riga si stampa sotto la descrizione, nella stessa cella.
function lineDescDoc(l) { return l.note ? (l.description || '') + '\n' + l.note : (l.description || ''); }
// Da dove arriva un documento: da una richiesta di offerta o da un piano di
// fabbisogno. Serve a ritrovare il perché di un ordine mesi dopo averlo fatto.
function docOriginRef(d) {
  const parti = [];
  if (d.rfqId && getRfq(d.rfqId)) parti.push(`📨 Generato dalla richiesta <strong>${esc(getRfq(d.rfqId).number)}</strong>`);
  const p = d.planId && (db.plans || []).find(x => x.id === d.planId);
  if (p) parti.push(`📋 Dal fabbisogno <strong>${esc(p.number)}</strong>`);
  return parti.length ? `<div class="ord-ref">${parti.join(' · ')}</div>` : '';
}

// ─── Filtri degli elenchi documenti (condivisi tra richieste e ordini) ───
// Gli elenchi si ridisegnano interi a ogni operazione: i criteri vivono qui
// fuori, così sopravvivono al re-render, e la digitazione aggiorna solo la
// lista (toccare la barra filtri farebbe perdere il focus al campo di ricerca).
const docFilters = {
  rfq: { q: '', status: '', supplierId: '' },
  order: { q: '', status: '', supplierId: '' },
};
function docFilterBar(kind, statusMap, shown, total) {
  const f = docFilters[kind];
  const sups = db.suppliers.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return `<div class="catalog-filters">
    <input type="text" class="search" id="${kind}f-q" value="${esc(f.q)}" placeholder="🔍 Cerca numero, oggetto, fornitore o riga..." oninput="docFilterInput('${kind}')">
    <select id="${kind}f-status" onchange="docFilterChange('${kind}')">
      <option value="">Tutti gli stati</option>
      ${Object.entries(statusMap).map(([k, v]) => `<option value="${k}" ${f.status === k ? 'selected' : ''}>${v}</option>`).join('')}
    </select>
    <select id="${kind}f-sup" onchange="docFilterChange('${kind}')">
      <option value="">Tutti i fornitori</option>
      <option value="none" ${f.supplierId === 'none' ? 'selected' : ''}>— senza fornitore —</option>
      ${sups.map(s => `<option value="${s.id}" ${f.supplierId === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
    </select>
    <span class="doc-filter-count" id="${kind}f-count">${docFilterCountText(shown, total)}</span>
    ${docFilterActive(kind) ? `<button class="btn-outline" onclick="docFilterReset('${kind}')">✕ Azzera filtri</button>` : ''}
  </div>`;
}
function docFilterCountText(shown, total) { return shown === total ? `${total} documenti` : `${shown} di ${total}`; }
function docFilterActive(kind) { const f = docFilters[kind]; return !!(f.q || f.status || f.supplierId); }
// Digitazione nel campo di ricerca: si aspetta la pausa. I menu a tendina
// restano immediati — un click è già un'intenzione conclusa.
function docFilterInput(kind) { debounced('doc-' + kind, () => docFilterChange(kind)); }
function docFilterChange(kind) {
  const f = docFilters[kind];
  f.q = (val(kind + 'f-q') || '').toLowerCase();
  f.status = val(kind + 'f-status');
  f.supplierId = val(kind + 'f-sup');
  // Solo la lista: la barra filtri resta com'è, altrimenti il campo perde il focus
  const count = document.getElementById(kind + 'f-count');
  const all = kind === 'rfq' ? db.rfqs : db.orders;
  renderInto(kind + '-list', () => kind === 'rfq' ? rfqListRows() : orderListRows());
  if (count) count.textContent = docFilterCountText(docFilterApply(kind, all).length, all.length);
}
function docFilterReset(kind) {
  docFilters[kind] = { q: '', status: '', supplierId: '' };
  if (kind === 'rfq') renderRfq(); else renderOrders();
}
// Testo cercabile di un documento, righe comprese. Costruirlo significa
// scorrere tutte le righe: senza memoria si rifarebbe per ogni documento a
// ogni carattere digitato. La chiave di validità è updatedAt, che cambia a
// ogni touch() — se il documento non è stato toccato, il testo è ancora buono.
const _docHay = new WeakMap();
function docSearchText(d) {
  const memo = _docHay.get(d);
  if (memo && memo.stamp === d.updatedAt) return memo.hay;
  const hay = [d.number, d.title, supplierName(d.supplierId), d.notes, d.notesInternal]
    .concat((d.lines || []).map(l => [l.code, l.description, l.note].join(' ')))
    .join(' ').toLowerCase();
  _docHay.set(d, { stamp: d.updatedAt, hay });
  return hay;
}
// Il testo cerca anche dentro le righe: spesso si risale al documento dal codice ordinato
function docFilterApply(kind, docs) {
  const f = docFilters[kind];
  return docs.filter(d => {
    if (f.status && d.status !== f.status) return false;
    if (f.supplierId === 'none' ? !!d.supplierId : (f.supplierId && d.supplierId !== f.supplierId)) return false;
    if (!f.q) return true;
    return docSearchText(d).includes(f.q);
  });
}

// ─── Export dell'elenco documenti ───
// Una funzione per i due tipi: richieste e ordini si filtrano allo stesso modo
// e si guardano per le stesse ragioni. L'unica differenza è ciò che l'ordine sa
// in più — quanto vale e quanto ne è arrivato — e sta in due colonne.
// Attenzione a cosa **non** è: l'export del documento aperto, che esiste già
// (`exportRfqPDF`, `exportOrderExcel`…) ed è quello che parte verso il fornitore.
function docListExportSpec(kind) {
  const ordini = kind === 'order';
  const K = docKind(kind);
  const f = docFilters[kind];
  const mappaStati = ordini ? ORDER_STATUS : RFQ_STATUS;
  const docs = docFilterApply(kind, (ordini ? db.orders : db.rfqs).slice()
    .sort((a, b) => (b.number || '').localeCompare(a.number || '')));
  const colonne = [
    { h: 'Numero', w: 18 }, { h: 'Oggetto', w: 34 }, { h: 'Stato', w: 14 },
    { h: 'Fornitore', w: 28 }, { h: 'Data', w: 12 }, { h: 'Righe', w: 8, num: true },
  ];
  if (ordini) colonne.push({ h: `Totale (${cur()})`, w: 16, num: true },
    { h: 'Ordinato', w: 12, num: true }, { h: 'Ricevuto', w: 12, num: true });
  return {
    titolo: ordini ? 'Ordini a fornitore' : 'Richieste di offerta',
    slug: ordini ? 'ordini' : 'richieste',
    filtri: [
      ['Ricerca', f.q],
      ['Stato', mappaStati[f.status] || ''],
      ['Fornitore', f.supplierId === 'none' ? 'senza fornitore' : (supplierName(f.supplierId) || '')],
    ],
    sezioni: [{
      nome: K.nome,
      colonne,
      righe: docs.map(d => {
        const base = [d.number || '', d.title || '', mappaStati[d.status] || d.status || '',
          supplierName(d.supplierId) || '', fmtDateIt(d.date), (d.lines || []).length];
        if (!ordini) return base;
        const rec = orderReception(d);
        return base.concat([+orderTotal(d).toFixed(2), rec.ordered, rec.received]);
      }),
    }],
  };
}
function rfqListExportSpec() { return docListExportSpec('rfq'); }
function orderListExportSpec() { return docListExportSpec('order'); }

function renderRfq() {
  const host = document.getElementById('view-rfq');
  if (rfqView === 'edit' && getRfq(currentRfqId)) {
    host.innerHTML = renderRfqEdit(currentRfqId);
    applyDocLock(rfqMode(getRfq(currentRfqId)), host);
  }
  else if (rfqView === 'compare') host.innerHTML = renderRfqCompare();
  else { rfqView = 'list'; host.innerHTML = renderRfqList(); }
  a11yFields(host);
}

// Progressivo per anno: RFQ-<anno>-NNN
function nextRfqNumber() {
  const prefix = `RFQ-${new Date().getFullYear()}-`;
  const seqs = db.rfqs.filter(r => (r.number || '').startsWith(prefix))
    .map(r => parseInt((r.number || '').slice(prefix.length), 10) || 0);
  return prefix + String((seqs.length ? Math.max(...seqs) : 0) + 1).padStart(3, '0');
}

function rfqListRows() {
  const list = docFilterApply('rfq', db.rfqs.slice().sort((a, b) => (b.number || '').localeCompare(a.number || '')));
  return list.map(r => {
    const nl = (r.lines || []).length;
    const sup = r.supplierId ? supplierName(r.supplierId) : '— nessun fornitore —';
    return `<div class="mgmt-item">
      <span class="mgmt-item-name"><span style="font-family:var(--mono)">${esc(r.number)}</span> — ${esc(r.title || '(senza titolo)')}</span>
      <span class="mgmt-item-meta">${esc(sup)} · ${nl} righe${r.date ? ' · ' + fmtDateIt(r.date) : ''}</span>
      ${statusBadge(RFQ_STATUS, r.status)}
      <div class="mgmt-item-actions">
        <button class="mini-btn" onclick="openRfqEdit('${r.id}')" title="Modifica">✏</button>
        <button class="mini-btn" onclick="orderFromRfq('${r.id}')" title="Crea ordine da questa richiesta">🧾</button>
        <button class="mini-btn danger" onclick="delRfq('${r.id}')" title="Elimina">🗑</button>
      </div></div>`;
  }).join('') || `<div class="empty-text">${db.rfqs.length ? 'Nessuna richiesta con questi filtri.' : 'Nessuna richiesta di offerta. Creane una per chiedere prezzi a un fornitore.'}</div>`;
}
function renderRfqList() {
  return `<div class="manage-wrap">
    <div class="bom-toolbar">
      <h2 class="section-title">📨 Richieste di offerta</h2>
      <button class="add-btn-sm" onclick="newRfq()">+ Nuova richiesta</button>
      <button class="btn-outline" onclick="openRfqCompare()">📊 Confronta offerte</button>
      ${listExportButtons('rfqListExportSpec')}
    </div>
    ${docFilterBar('rfq', RFQ_STATUS, docFilterApply('rfq', db.rfqs).length, db.rfqs.length)}
    <div class="mgmt-list" id="rfq-list">${rfqListRows()}</div></div>`;
}

function newRfq() {
  if (!roleGuard('docs')) return;
  const r = Store.insert('rfqs', { id: gid(), number: nextRfqNumber(), title: '', date: nowISO().slice(0, 10),
    status: 'bozza', notes: '', notesInternal: '', supplierId: null, planId: null,
    transport: db.settings.transportDefault || '', payment: db.settings.paymentDefault || '',
    lines: [], active: true });
  currentRfqId = r.id; rfqView = 'edit'; rfqDirty = false; renderRfq();
}
function openRfqEdit(id) { currentRfqId = id; rfqView = 'edit'; rfqDirty = false; rfqUnlockedId = null; renderRfq(); }
function openRfqCompare() { rfqView = 'compare'; renderRfq(); }
function rfqBackToList() { docBackToList('rfq'); }
function rfqMarkDirty() { docMarkDirty('rfq'); }
function rfqSave(id) { docSave('rfq', id); }
function rfqSetField(id, field, value) { docSetField('rfq', id, field, value); }
function rfqSetSupplier(id, sid) { docSetSupplier('rfq', id, sid); }
function rfqSetLine(id, lineId, field, value) { docSetLine('rfq', id, lineId, field, value); }
function rfqDelLine(id, lineId) { docDelLine('rfq', id, lineId); }

// ─── Nuova riga manuale ───
// L'unico punto in cui i due tipi hanno form diversi: sull'ordine il prezzo è
// concordato e si scrive subito, sulla richiesta si sta chiedendo proprio
// quello e la casella non esiste.
function docAddManualLineModal(k, id) {
  const K = docKind(k), p = K.pfx;
  if (!docGuard(k, id, 'contract')) return;
  const prezzo = K.hasLinePrice
    ? `<div class="modal-field"><label id="${p}-price-label">${docPriceLabel(defaultUom())}</label><input id="${p}-price" type="number" min="0" step="any"></div>` : '';
  const segnaposto = K.hasLinePrice ? 'Es. consegna parziale ammessa, rif. disegno…' : 'Es. materiale certificato, disegno allegato…';
  openModal(`<h3>+ Riga manuale</h3>
    <div class="modal-field"><label>Descrizione</label><input id="${p}-desc"></div>
    <div class="modal-field"><label>Codice (opzionale)</label><input id="${p}-code"></div>
    <div class="modal-grid">
      <div class="modal-field"><label>U.M.</label><select id="${p}-uom" onchange="docLineUomLabels('${p}')">${uomOptions(defaultUom())}</select></div>
      <div class="modal-field"><label id="${p}-qty-label">${docQtyLabel(defaultUom())}</label><input id="${p}-qty" type="number" value="1" min="0" step="any"></div>
      ${prezzo}
    </div>
    <div class="modal-field"><label>Nota (stampata sul documento)</label><textarea id="${p}-note" rows="2" placeholder="${segnaposto}"></textarea></div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="${k === 'order' ? 'ordAddManualLine' : 'rfqAddManualLine'}('${esc(id)}')">Aggiungi</button></div>`);
}
function rfqAddManualLineModal(id) { docAddManualLineModal('rfq', id); }
function rfqAddManualLine(id) { docAddManualLine('rfq', id); }
function rfqEditLineModal(id, lineId) { docEditLineModal('rfq', id, lineId); }
function rfqSaveLineEdit(id, lineId) { docSaveLineEdit('rfq', id, lineId); }

// ─── Campi identità riga (codice/descrizione/U.M.), condivisi RFQ e Ordini ───
// Sola lettura per le righe da catalogo (seguono l'anagrafica) e per i
// documenti bloccati dallo stato.
function lineIdentityFields(pfx, l, locked) {
  if (l.itemId) {
    return `<div class="modal-field"><label>Articolo da catalogo</label>
      <input value="${esc((l.code || '') + (l.code ? ' — ' : '') + (l.description || ''))}" disabled></div>
      <p class="empty-text" style="text-align:left;padding:0 0 8px">Codice, descrizione e U.M. seguono l'anagrafica articolo. Modificali nell'anagrafica articolo.</p>`;
  }
  if (locked) {
    return `<div class="modal-field"><label>Riga manuale</label>
      <input value="${esc((l.code || '') + (l.code ? ' — ' : '') + (l.description || '') + ' · ' + (l.qty || 0) + ' ' + (l.uom || ''))}" disabled></div>
      <p class="empty-text" style="text-align:left;padding:0 0 8px">Documento bloccato dallo stato: modificabile la sola nota. Usa <strong>🔓 Sblocca per modifica</strong> per correggere il resto.</p>`;
  }
  return `<div class="modal-field"><label>Descrizione</label><input id="${pfx}-desc" value="${esc(l.description || '')}"></div>
    <div class="modal-field"><label>Codice (opzionale)</label><input id="${pfx}-code" value="${esc(l.code || '')}"></div>
    <div class="modal-field"><label>U.M.</label><select id="${pfx}-uom" onchange="docLineUomLabels('${pfx}')">${uomOptions(l.uom)}</select></div>`;
}
// ─── Quantità e prezzo, nell'unità della riga ───
// Su un documento che esce di qui — un ordine che il fornitore leggerà — «100»
// e «3,20» senza unità sono l'errore più caro che si possa fare: cento pezzi
// invece di cento metri arrivano davvero, e si pagano. L'unità della riga si
// sceglie nello stesso form (o è già scritta sulla riga), quindi le etichette
// la portano con sé: «Quantità (m)», «Prezzo unitario (€/m)».
function docLineUomLabels(pfx) {
  const u = val(pfx + '-uom') || '';
  const set = (id, testo) => { const el = document.getElementById(id); if (el) el.textContent = testo; };
  set(pfx + '-qty-label', 'Quantità' + (u ? ' (' + u + ')' : ''));
  set(pfx + '-price-label', 'Prezzo unitario (' + cur() + (u ? '/' + u : '') + ')');
}
function docQtyLabel(u) { return labelUom('Quantità', u); }
function docPriceLabel(u) { return `Prezzo unitario (${esc(cur())}${u ? '/' + esc(u) : ''})`; }
// Scrive i campi identità sulla riga; ritorna false se la validazione fallisce.
function readLineIdentity(pfx, l) {
  if (l.itemId) return true;
  const desc = val(pfx + '-desc');
  if (!desc) { showToast('Descrizione richiesta', 'error'); return false; }
  l.description = desc;
  l.code = val(pfx + '-code');
  l.uom = val(pfx + '-uom') || defaultUom();
  return true;
}

// ─── Picker catalogo con filtri, condiviso tra RFQ e Ordini ───
let __pickOnAdd = null;
function catalogPickerModal(onAddIds) {
  __pickOnAdd = onAddIds;
  const opts = db.items.filter(i => i.active !== false).sort((a, b) => (a.code || '').localeCompare(b.code || ''))
    .map(i => `<label class="rfq-pick-row" data-type="${i.type}" data-fam="${i.familyId || ''}" data-sub="${i.subFamilyId || ''}" data-sup="${i.supplierId || ''}"><input type="checkbox" value="${i.id}">
      <span style="font-family:var(--mono)">${esc(i.code || '')}</span> ${esc(i.name)}${itemBadges(i)}
      <span class="rfq-pick-type">${TYPE_LABELS[i.type] || i.type}</span></label>`).join('');
  const typeOpts = ALL_TYPES.map(t => `<option value="${t}">${typeLabel(t)}</option>`).join('');
  const famOpts = (db.families || []).map(f => `<option value="${f.id}">${esc(f.name)}</option>`).join('');
  openModal(`<h3>+ Aggiungi da catalogo</h3>
    <div class="rfq-pick-filters">
      <input class="search" id="pick-search" placeholder="🔍 Codice o nome..." oninput="debounced('pick', pickFilter)">
      <select id="pick-type" onchange="pickFilter()"><option value="">Tutti i tipi</option>${typeOpts}</select>
      <select id="pick-fam" onchange="pickFamilyChange()"><option value="">Tutte le famiglie</option>${famOpts}</select>
      <select id="pick-sub" onchange="pickFilter()"><option value="">Tutte le sottofamiglie</option></select>
      <select id="pick-sup" onchange="pickFilter()"><option value="">Tutti i fornitori</option>${db.suppliers.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>
    </div>
    <div class="rfq-pick-list" id="pick-list">${opts || '<div class="empty-text">Catalogo vuoto.</div>'}</div>
    <div class="empty-text" id="pick-empty" style="display:none">Nessun articolo con questi filtri.</div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="pickConfirm()">Aggiungi selezionati</button></div>`, true);
}
function pickFamilyChange() {
  const f = getFamily(val('pick-fam'));
  const subs = (f && f.subs) || [];
  const sel = document.getElementById('pick-sub');
  if (sel) sel.innerHTML = '<option value="">Tutte le sottofamiglie</option>' + subs.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  pickFilter();
}
function pickFilter() {
  const q = (val('pick-search') || '').toLowerCase();
  const ty = val('pick-type'), fam = val('pick-fam'), sub = val('pick-sub'), sup = val('pick-sup');
  let shown = 0;
  document.querySelectorAll('#pick-list .rfq-pick-row').forEach(el => {
    const ok = el.textContent.toLowerCase().includes(q)
      && (!ty || el.dataset.type === ty)
      && (!fam || el.dataset.fam === fam)
      && (!sub || el.dataset.sub === sub)
      && (!sup || el.dataset.sup === sup);
    el.style.display = ok ? '' : 'none';
    if (ok) shown++;
  });
  const empty = document.getElementById('pick-empty');
  if (empty) empty.style.display = shown ? 'none' : '';
}
function pickConfirm() {
  const ids = Array.from(document.querySelectorAll('#pick-list input:checked')).map(c => c.value);
  if (!ids.length) { showToast('Nessun articolo selezionato', 'error'); return; }
  const cb = __pickOnAdd; __pickOnAdd = null;
  if (cb) cb(ids);
}
function rfqAddCatalogModal(id) { if (!rfqGuard(id, 'contract')) return; catalogPickerModal(ids => rfqAddCatalogLines(id, ids)); }
function rfqAddCatalogLines(id, ids) { docAddCatalogLines('rfq', id, ids); }

function renderRfqEdit(id) {
  const r = getRfq(id); if (!r) { rfqView = 'list'; return renderRfqList(); }
  const lines = (r.lines || []).map((l, i) => {
    const si = rfqLineSupInfo(r, l);
    const siSub = si ? `<div class="rfq-cmp-sub">🏷 ${esc(si.code || '—')}${si.desc ? ' · ' + esc(si.desc) : ''}</div>` : '';
    const noteSub = l.note ? `<div class="line-note">📝 ${esc(l.note)}</div>` : '';
    return `<tr>
    <td>${i + 1}</td>
    <td style="font-family:var(--mono)">${codeLink(l.itemId, l.code || '')}</td>
    <td>${esc(l.description)}${l.itemId ? '' : ' <span class="rfq-manual-tag">manuale</span>'}${siSub}${noteSub}</td>
    <td>${esc(l.uom || '')}</td>
    <td><input type="number" class="rfq-qty-input lock-contract" value="${l.qty}" min="0" step="any" onchange="rfqSetLine('${id}','${l.id}','qty',this.value)"></td>
    <td><input type="number" class="rfq-price-input lock-offer" value="${l.price === '' || l.price == null ? '' : l.price}" min="0" step="any" placeholder="—" onchange="rfqSetLine('${id}','${l.id}','price',this.value)"></td>
    <td><input type="date" class="rfq-date-input lock-offer" value="${esc(l.deliveryDate || '')}" onchange="rfqSetLine('${id}','${l.id}','deliveryDate',this.value)"></td>
    <td class="line-actions"><button class="mini-btn" onclick="rfqEditLineModal('${id}','${l.id}')" title="Modifica riga / nota">✏</button>
      <button class="mini-btn danger lock-contract" onclick="rfqDelLine('${id}','${l.id}')">🗑</button></td></tr>`;
  }).join('')
    || `<tr><td colspan="8" class="empty-text">Nessuna riga. Aggiungi articoli dal catalogo o manualmente.</td></tr>`;
  const co = db.settings.company || {};
  const coWarn = co.name ? '' : `<div class="rfq-warn">⚠ Dati azienda non impostati: compilali in <strong>Gestione › Dati azienda</strong> per stamparli sul documento.</div>`;
  const dis = rfqDirty ? 'disabled title="Salva la richiesta prima di generare il documento"' : '';
  const mode = rfqMode(r);
  const lockBanner = docLockBanner(mode, 'Richiesta ' + (RFQ_STATUS[r.status] || r.status).toLowerCase(), 'rfq', id);
  return `<div class="manage-wrap">
    <div class="bom-toolbar">
      <button class="btn-outline" onclick="rfqBackToList()">← Elenco</button>
      <h2 class="section-title" style="font-family:var(--mono)">${esc(r.number)}</h2>
      ${statusBadge(RFQ_STATUS, r.status)}
      <button class="add-btn-sm rfq-save-btn ${rfqDirty ? 'dirty' : ''}" id="rfq-save-btn" onclick="rfqSave('${id}')">💾 Salva</button>
    </div>
    ${coWarn}${lockBanner}${docOriginRef(r)}${stampLine(r)}
    <div class="rfq-head">
      <div class="modal-field"><label>Titolo / oggetto</label><input class="lock-contract" value="${esc(r.title || '')}" onchange="rfqSetField('${id}','title',this.value)"></div>
      <div class="rfq-head-row">
        <div class="modal-field"><label>Fornitore</label><select class="lock-contract" onchange="rfqSetSupplier('${id}',this.value)">${supplierOptions(r.supplierId)}</select></div>
        <div class="modal-field"><label>Data</label><input type="date" class="lock-contract" value="${(r.date || '').slice(0, 10)}" onchange="rfqSetField('${id}','date',this.value)"></div>
        <div class="modal-field"><label>Stato</label><select onchange="rfqSetField('${id}','status',this.value)">
          ${Object.entries(RFQ_STATUS).map(([k, v]) => `<option value="${k}" ${r.status === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select></div>
      </div>
      <div class="rfq-head-row">
        <div class="modal-field"><label>Tipo di trasporto / resa</label>
          <input list="rfq-transport-opts" class="lock-contract" value="${esc(r.transport || '')}" placeholder="es. Porto franco, EXW, DAP…" onchange="rfqSetField('${id}','transport',this.value)">
          <datalist id="rfq-transport-opts">${(db.settings.transportOptions || []).map(o => `<option value="${esc(o)}"></option>`).join('')}</datalist></div>
        <div class="modal-field"><label>Tipo di pagamento</label>
          <input list="rfq-payment-opts" class="lock-contract" value="${esc(r.payment || '')}" placeholder="es. Bonifico 30gg, RiBa 60gg…" onchange="rfqSetField('${id}','payment',this.value)">
          <datalist id="rfq-payment-opts">${(db.settings.paymentOptions || []).map(o => `<option value="${esc(o)}"></option>`).join('')}</datalist></div>
      </div>
      <div class="modal-field"><label>Note per il fornitore</label><textarea rows="2" onchange="rfqSetField('${id}','notes',this.value)">${esc(r.notes || '')}</textarea></div>
      <div class="modal-field"><label>🔒 Note interne (non stampate sui documenti)</label><textarea rows="2" class="notes-internal" onchange="rfqSetField('${id}','notesInternal',this.value)">${esc(r.notesInternal || '')}</textarea></div>
    </div>
    <h3 class="rfq-subhead">Righe richiesta
      <span class="rfq-head-actions">
        <button class="add-btn-sm lock-contract" onclick="rfqAddCatalogModal('${id}')">+ Da catalogo</button>
        <button class="btn-outline lock-contract" onclick="rfqAddManualLineModal('${id}')">+ Riga manuale</button>
      </span></h3>
    <p class="empty-text" style="text-align:left;padding:0 0 8px">Prezzo unitario e data consegna si lasciano vuoti nel documento inviato e si compilano al ritorno dell'offerta.</p>
    <div class="table-wrap"><table class="rfq-table">
      <thead><tr><th>#</th><th>Codice</th><th>Descrizione</th><th>U.M.</th><th>Q.tà</th>
        <th title="Prezzo di una unità, nella U.M. della riga">Prezzo unit. (${esc(cur())}/U.M.)</th><th>Data consegna</th><th></th></tr></thead>
      <tbody>${lines}</tbody></table></div>
    <div class="rfq-export-bar">
      <label>Documento di richiesta:</label>
      <button class="export-btn-pdf rfq-export-btn" onclick="exportRfqPDF('${id}')" ${dis}>📄 PDF</button>
      <button class="export-btn-xls rfq-export-btn" onclick="exportRfqExcel('${id}')" ${dis}>📗 Excel</button>
      ${rfqDirty ? '<span class="rfq-dirty-hint">Salva per abilitare la generazione del documento</span>' : ''}
    </div>
    ${rfqPriceBar(r)}
  </div>`;
}
// I prezzi tornati con l'offerta valgono oltre questa richiesta: da qui
// diventano quotazioni a listino, riutilizzabili e confrontabili nel tempo.
// L'operazione è esplicita: non si tocca il costo di un articolo di nascosto.
function rfqPriceBar(r) {
  if (!canWrite('catalog')) return '';
  const nuove = rfqPriceCandidates(r).length;
  const già = (r.lines || []).filter(l => {
    const it = l.itemId ? getItem(l.itemId) : null;
    return hasPriceList(it) && priceRows(it).some(p => p.rfqId === r.id && p.lineId === l.id);
  }).length;
  if (!nuove && !già) return '';
  return `<div class="rfq-export-bar">
    <label>Prezzi d'offerta:</label>
    <button class="btn-outline" onclick="rfqRecordPrices('${r.id}')" ${nuove ? '' : 'disabled'}>💶 Registra a listino${nuove ? ' (' + nuove + ')' : ''}</button>
    <span class="rfq-dirty-hint" style="color:var(--text-dim)">${già ? già + ' già registrati. ' : ''}Le quotazioni restano nel listino dell'articolo; il costo in uso si sceglie da lì.</span>
  </div>`;
}

function exportRfqPDF(id) {
  const r = getRfq(id); if (!r) return;
  if (!(r.lines || []).length) { showToast('Nessuna riga da esportare', 'error'); return; }
  const jsPDF = requirePdf(); if (!jsPDF) return;
  const co = db.settings.company || {};
  const sup = r.supplierId ? getSupplier(r.supplierId) : null;
  // Le colonne "codice/descrizione fornitore" compaiono solo se qualche riga è legata
  // allo stesso fornitore della richiesta; in tal caso si usa l'orientamento orizzontale.
  const hasSup = (r.lines || []).some(l => rfqLineSupInfo(r, l));
  const doc = new jsPDF(hasSup ? { orientation: 'landscape' } : undefined);
  // Documento bilingue IT / EN per fornitori esteri
  doc.setFontSize(15); doc.setTextColor(30); doc.text(`Richiesta di offerta / Request for Quotation — ${r.number}`, 14, 16);
  doc.setFontSize(9); doc.setTextColor(90);
  doc.text(`Data / Date: ${fmtDateIt(r.date) || fmtDateIt(nowISO())}`, 14, 22);
  if (r.title) doc.text(`Oggetto / Subject: ${r.title}`, 14, 27);
  const yTop = 36;
  const block = (x, title, rowsTxt) => {
    doc.setFontSize(8); doc.setTextColor(130); doc.text(title, x, yTop);
    doc.setFontSize(9); doc.setTextColor(40);
    const rows = rowsTxt.filter(Boolean);
    rows.forEach((t, i) => doc.text(String(t), x, yTop + 5 + i * 4.5));
    return rows.length;
  };
  const n1 = block(14, 'RICHIEDENTE / BUYER', docPartyLines(co, true));
  const n2 = block(hasSup ? 160 : 110, 'FORNITORE / SUPPLIER', sup ? docPartyLines(sup, true) : ['(fornitore non selezionato / not selected)']);
  const startY = yTop + 5 + Math.max(n1, n2) * 4.5 + 4;
  const head = hasSup
    ? ['#', 'Codice\nCode', 'Descrizione\nDescription', 'Cod. forn.\nSuppl. code', 'Descr. forn.\nSuppl. desc.', 'Q.tà\nQty', 'Prezzo unit.\nUnit price', 'Data consegna\nDelivery date']
    : ['#', 'Codice\nCode', 'Descrizione\nDescription', 'Q.tà\nQty', 'Prezzo unit.\nUnit price', 'Data consegna\nDelivery date'];
  const body = (r.lines || []).map((l, i) => {
    const si = rfqLineSupInfo(r, l);
    // Il prezzo esce con il suo denominatore: su un documento che parte verso il
    // fornitore «3,20» e «3,20/m» sono due offerte diverse.
    const price = l.price === '' || l.price == null ? '' : fmtN(l.price) + (l.uom ? '/' + l.uom : '');
    const tail = [((l.qty || 0) + ' ' + (l.uom || '')).trim(), price, fmtDateIt(l.deliveryDate)];
    return hasSup ? [i + 1, l.code || '', lineDescDoc(l), si ? si.code : '', si ? si.desc : '', ...tail]
      : [i + 1, l.code || '', lineDescDoc(l), ...tail];
  });
  doc.autoTable({ startY, head: [head], body, styles: { fontSize: 8 }, headStyles: { fillColor: [58, 123, 232] } });
  let fy = doc.lastAutoTable.finalY + 8;
  doc.setTextColor(80); doc.setFontSize(9);
  if (r.transport) { doc.text('Trasporto / Shipping: ' + r.transport, 14, fy); fy += 5; }
  if (r.payment) { doc.text('Pagamento / Payment: ' + r.payment, 14, fy); fy += 5; }
  // Solo r.notes: le note interne (notesInternal) non escono mai sul documento.
  if (r.notes) { doc.text('Note / Notes: ' + r.notes, 14, fy); }
  doc.save(`${r.number}${sup ? '_' + (sup.name || '').replace(/\s+/g, '_') : ''}.pdf`);
  showToast('PDF esportato');
  askMarkSent(r, `PDF generato.\nSegnare la richiesta ${r.number} come inviata?`, 'inviata', renderRfq);
}

function exportRfqExcel(id) {
  const r = getRfq(id); if (!r) return;
  if (!(r.lines || []).length) { showToast('Nessuna riga da esportare', 'error'); return; }
  const co = db.settings.company || {};
  const sup = r.supplierId ? getSupplier(r.supplierId) : null;
  const data = [['Richiesta di offerta', r.number], ['Data', fmtDateIt(r.date)]];
  if (r.title) data.push(['Oggetto', r.title]);
  if (r.transport) data.push(['Trasporto / Shipping', r.transport]);
  if (r.payment) data.push(['Pagamento / Payment', r.payment]);
  data.push([]);
  data.push(['RICHIEDENTE', '', 'FORNITORE']);
  const coLines = docPartyLines(co), supLines = docPartyLines(sup);
  for (let i = 0; i < Math.max(coLines.length, supLines.length); i++) data.push([coLines[i] || '', '', supLines[i] || '']);
  data.push([]);
  const hasSup = (r.lines || []).some(l => rfqLineSupInfo(r, l));
  // Come nell'ordine: valuta in intestazione, unità nella colonna U.M.
  const hPrezzo = `Prezzo unitario (${cur()}/U.M.)`;
  data.push(hasSup
    ? ['#', 'Codice', 'Descrizione', 'Codice fornitore', 'Descrizione fornitore', 'Q.tà', 'U.M.', hPrezzo, 'Data consegna', 'Nota']
    : ['#', 'Codice', 'Descrizione', 'Q.tà', 'U.M.', hPrezzo, 'Data consegna', 'Nota']);
  (r.lines || []).forEach((l, i) => {
    const si = rfqLineSupInfo(r, l);
    const price = l.price === '' || l.price == null ? '' : l.price;
    data.push(hasSup
      ? [i + 1, l.code || '', l.description, si ? si.code : '', si ? si.desc : '', l.qty || 0, l.uom || '', price, fmtDateIt(l.deliveryDate), l.note || '']
      : [i + 1, l.code || '', l.description, l.qty || 0, l.uom || '', price, fmtDateIt(l.deliveryDate), l.note || '']);
  });
  // Solo r.notes: le note interne (notesInternal) non escono mai sul documento.
  if (r.notes) { data.push([]); data.push(['Note', r.notes]); }
  if (!requireXlsx()) return;
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'RFQ');
  XLSX.writeFile(wb, `${r.number}${sup ? '_' + (sup.name || '').replace(/\s+/g, '_') : ''}.xlsx`);
  showToast('Excel esportato');
  askMarkSent(r, `Excel generato.\nSegnare la richiesta ${r.number} come inviata?`, 'inviata', renderRfq);
}

// ─── Confronto offerte tra più richieste (una per fornitore) ───
function rfqLineKey(l) { return l.itemId || ('m:' + (l.code || '') + '|' + (l.description || '')); }
function rfqToggleCompare(rid, on) {
  if (on) { if (!rfqCompareSel.includes(rid)) rfqCompareSel.push(rid); }
  else rfqCompareSel = rfqCompareSel.filter(x => x !== rid);
  renderRfq();
}
function renderRfqCompare() {
  rfqCompareSel = rfqCompareSel.filter(id => getRfq(id));
  const head = `<div class="bom-toolbar">
      <button class="btn-outline" onclick="rfqBackToList()">← Elenco</button>
      <h2 class="section-title">📊 Confronto offerte tra richieste</h2></div>`;
  const picker = db.rfqs.slice().sort((a, b) => (b.number || '').localeCompare(a.number || '')).map(r => {
    const on = rfqCompareSel.includes(r.id);
    return `<label class="rfq-sup-chk"><input type="checkbox" ${on ? 'checked' : ''} onchange="rfqToggleCompare('${r.id}',this.checked)">
      <span style="font-family:var(--mono)">${esc(r.number)}</span> ${esc(r.supplierId ? supplierName(r.supplierId) : '(nessun fornitore)')}</label>`;
  }).join('') || '<div class="empty-text">Nessuna richiesta disponibile.</div>';
  const sel = rfqCompareSel.map(id => getRfq(id)).filter(Boolean);
  let matrix;
  if (sel.length < 2) {
    matrix = '<div class="empty-text">Seleziona almeno due richieste per confrontare i prezzi articolo per articolo.</div>';
  } else {
    const keys = [], meta = {};
    sel.forEach(r => (r.lines || []).forEach(l => {
      const k = rfqLineKey(l);
      if (!(k in meta)) { keys.push(k); meta[k] = { itemId: l.itemId, code: l.code, description: l.description }; }
    }));
    const totals = sel.map(() => 0);
    const bodyRows = keys.map(k => {
      const cellsData = sel.map(r => {
        const l = (r.lines || []).find(x => rfqLineKey(x) === k);
        return (l && l.price !== '' && l.price != null) ? { price: Number(l.price), qty: Number(l.qty) || 0, uom: l.uom || '', del: l.deliveryDate } : null;
      });
      const valid = cellsData.filter(p => p && p.price > 0).map(p => p.price);
      const min = valid.length ? Math.min(...valid) : null;
      const cells = cellsData.map((p, ci) => {
        if (!p) return `<td class="rfq-cmp-cell">—</td>`;
        totals[ci] += p.price * p.qty;
        const isMin = min != null && p.price === min;
        // L'unità è quella della riga d'offerta, non "pz": ogni fornitore quota
        // nella sua, e confrontare €/kg con €/m senza dirlo è peggio che non
        // confrontare affatto.
        return `<td class="rfq-cmp-cell ${isMin ? 'rfq-min' : ''}">${fmtPer(p.price, p.uom)}<span class="rfq-line-tot">${fmtUom(p.qty, p.uom)}${p.del ? ' · ' + fmtDateIt(p.del) : ''}</span></td>`;
      }).join('');
      const m = meta[k];
      return `<tr><td>${esc(m.description || '')}<div class="rfq-cmp-sub">${codeLink(m.itemId, m.code || '')}</div></td>${cells}</tr>`;
    }).join('');
    const posTotals = totals.filter(t => t > 0);
    const minTot = posTotals.length ? Math.min(...posTotals) : null;
    const totalRow = `<tr class="rfq-cmp-total"><td>Totale offerta</td>${totals.map(t => `<td class="${minTot != null && t === minTot ? 'rfq-min' : ''}">${fmtN(t)}</td>`).join('')}</tr>`;
    const header = `<tr><th>Articolo</th>${sel.map(r => `<th>${esc(r.supplierId ? supplierName(r.supplierId) : r.number)}<div class="rfq-cmp-sub">${esc(r.number)}</div></th>`).join('')}</tr>`;
    matrix = `<div class="table-wrap"><table class="rfq-table rfq-cmp-table">
      <thead>${header}</thead><tbody>${bodyRows}${totalRow}</tbody></table></div>
      <p class="empty-text" style="text-align:left">Prezzo minimo per riga e totale offerta più basso evidenziati in verde. I totali usano la quantità indicata in ciascuna richiesta.</p>`;
  }
  return `<div class="manage-wrap">${head}
    <h3 class="rfq-subhead">Richieste da confrontare</h3>
    <div class="rfq-sup-grid">${picker}</div>
    <h3 class="rfq-subhead">Confronto prezzi</h3>
    ${matrix}
  </div>`;
}

function delRfq(id) {
  docDel('rfq', id, () => {
    rfqCompareSel = rfqCompareSel.filter(x => x !== id);
    if (currentRfqId === id) { currentRfqId = null; rfqView = 'list'; }
  });
}

// ═══════════════════════════════════════════════════════════
//  VISTA: ORDINI A FORNITORE (ODA)
// ═══════════════════════════════════════════════════════════
function getOrder(id) { return db.orders.find(o => o.id === id); }
function ordMode(o) { return docMode('order', o); }
function ordGuard(id, kind) { return docGuard('order', id, kind); }
function ordUnlock(id) { return docUnlock('order', id); }
// ─── Data richiesta contro data confermata ───
// Il fornitore conferma quasi sempre una data diversa da quella chiesta, e
// finora quella risposta non si scriveva da nessuna parte: restava in una mail.
// Qui si registra accanto alla richiesta, e lo scarto si vede — perché è lo
// scarto, non la data, a dire se la commessa va rifatta.
// In UTC come addDays(): qui la differenza farebbe cadere gli offset, ma il
// passaggio dell'ora legale fra le due date lascerebbe un'ora di scarto, e
// arrotondare a giorni interi è più fragile che non averne bisogno.
function giorniTra(a, b) {
  if (!a || !b) return null;
  const d1 = new Date(a + 'T00:00:00Z'), d2 = new Date(b + 'T00:00:00Z');
  if (isNaN(d1) || isNaN(d2)) return null;
  return Math.round((d2 - d1) / 86400000);
}
function ordLineDelay(l) {
  const g = giorniTra(l && l.deliveryDate, l && l.confirmedDate);
  return g == null ? null : g;
}
function ordLineDelayHtml(l) {
  const g = ordLineDelay(l);
  if (g == null || g === 0) return '';
  return g > 0
    ? `<div class="line-note" style="color:var(--red)">+${g} ${g === 1 ? 'giorno' : 'giorni'} sulla richiesta</div>`
    : `<div class="line-note" style="color:var(--green)">${g} ${g === -1 ? 'giorno' : 'giorni'} — in anticipo</div>`;
}
// Il ritardo peggiore dell'ordine: è quello che decide se la commessa slitta.
function orderWorstDelay(o) {
  let peggiore = null;
  (o.lines || []).forEach(l => {
    const g = ordLineDelay(l);
    if (g != null && g > 0 && (peggiore == null || g > peggiore)) peggiore = g;
  });
  return peggiore;
}
function orderTotal(o) { return (o.lines || []).reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.price) || 0), 0); }
function orderReception(o) {
  let ordered = 0, received = 0;
  (o.lines || []).forEach(l => { ordered += Number(l.qty) || 0; received += Number(l.received) || 0; });
  return { ordered, received, residual: ordered - received };
}
// Parziale/Evaso sono un fatto misurabile sui ricevimenti, non una scelta: li
// deriviamo. Bozza e Annullato restano decisioni dell'utente e non si toccano.
// Azzerando i ricevimenti si torna indietro, a Confermato o Inviato a seconda
// che la conferma d'ordine del fornitore sia arrivata.
function ordAutoStatus(o) {
  if (o.status === 'bozza' || o.status === 'annullato') return;
  const { ordered, received } = orderReception(o);
  if (received <= 0) o.status = o.supplierConfirmation ? 'confermato' : 'inviato';
  else if (ordered > 0 && received >= ordered) o.status = 'evaso';
  else o.status = 'parziale';
}
function nextOrderNumber() {
  const prefix = `ODA-${new Date().getFullYear()}-`;
  const seqs = db.orders.filter(o => (o.number || '').startsWith(prefix)).map(o => parseInt((o.number || '').slice(prefix.length), 10) || 0);
  return prefix + String((seqs.length ? Math.max(...seqs) : 0) + 1).padStart(3, '0');
}

function renderOrders() {
  const host = document.getElementById('view-orders');
  if (orderView === 'edit' && getOrder(currentOrderId)) {
    host.innerHTML = renderOrderEdit(currentOrderId);
    applyDocLock(ordMode(getOrder(currentOrderId)), host);
  }
  else { orderView = 'list'; host.innerHTML = renderOrderList(); }
  a11yFields(host);
}

function orderListRows() {
  const list = docFilterApply('order', db.orders.slice().sort((a, b) => (b.number || '').localeCompare(a.number || '')));
  return list.map(o => {
    const sup = o.supplierId ? supplierName(o.supplierId) : '— nessun fornitore —';
    const rec = orderReception(o);
    const recTxt = rec.ordered ? `ric. ${fmtQty(rec.received)}/${fmtQty(rec.ordered)}` : '';
    return `<div class="mgmt-item">
      <span class="mgmt-item-name"><span style="font-family:var(--mono)">${esc(o.number)}</span> — ${esc(o.title || '(senza titolo)')}</span>
      <span class="mgmt-item-meta">${esc(sup)} · ${fmtN(orderTotal(o))}${recTxt ? ' · ' + recTxt : ''}${o.date ? ' · ' + fmtDateIt(o.date) : ''}</span>
      ${statusBadge(ORDER_STATUS, o.status)}
      <div class="mgmt-item-actions">
        <button class="mini-btn" onclick="openOrderEdit('${o.id}')" title="Modifica">✏</button>
        <button class="mini-btn danger" onclick="delOrder('${o.id}')" title="Elimina">🗑</button>
      </div></div>`;
  }).join('') || `<div class="empty-text">${db.orders.length ? 'Nessun ordine con questi filtri.' : 'Nessun ordine. Creane uno o generane uno da una richiesta di offerta.'}</div>`;
}
function renderOrderList() {
  return `<div class="manage-wrap">
    <div class="bom-toolbar">
      <h2 class="section-title">🧾 Ordini a fornitore</h2>
      <button class="add-btn-sm" onclick="newOrder()">+ Nuovo ordine</button>
      ${listExportButtons('orderListExportSpec')}
    </div>
    ${docFilterBar('order', ORDER_STATUS, docFilterApply('order', db.orders).length, db.orders.length)}
    <div class="mgmt-list" id="order-list">${orderListRows()}</div></div>`;
}

function newOrder() {
  if (!roleGuard('docs')) return;
  const o = Store.insert('orders', { id: gid(), number: nextOrderNumber(), title: '', date: nowISO().slice(0, 10),
    status: 'bozza', supplierId: null, transport: db.settings.transportDefault || '', payment: db.settings.paymentDefault || '',
    rfqId: null, planId: null, supplierConfirmation: '', notes: '', notesInternal: '', lines: [], active: true });
  currentOrderId = o.id; orderView = 'edit'; orderDirty = false; renderOrders();
}
function orderFromRfq(rfqId) {
  if (!roleGuard('docs')) return;
  const r = getRfq(rfqId); if (!r) return;
  const sup = r.supplierId ? getSupplier(r.supplierId) : null;
  const o = stampNew({ id: gid(), number: nextOrderNumber(),
    title: r.title || ('Da ' + r.number), date: nowISO().slice(0, 10), status: 'bozza',
    supplierId: r.supplierId || null,
    transport: r.transport || (sup && sup.defaultTransport) || db.settings.transportDefault || '',
    payment: r.payment || (sup && sup.defaultPayment) || db.settings.paymentDefault || '',
    rfqId: r.id, planId: r.planId || null, supplierConfirmation: '', notes: r.notes || '', notesInternal: r.notesInternal || '',
    lines: (r.lines || []).map(l => ({ id: gid(), itemId: l.itemId || null, code: l.code || '', description: l.description || '',
      uom: l.uom || defaultUom(), qty: Number(l.qty) || 0, price: (l.price === '' || l.price == null) ? '' : Number(l.price),
      deliveryDate: l.deliveryDate || '', received: 0, note: l.note || '' })),
    active: true });
  db.orders.push(o);
  // La richiesta ha esaurito il suo scopo: si chiude da sé, ma solo se era
  // davvero uscita (da una bozza si può generare un ordine di prova).
  let closed = false;
  if (r.status === 'inviata' || r.status === 'ricevuta') { r.status = 'chiusa'; touch(r); closed = true; }
  saveDB();
  currentOrderId = o.id; orderView = 'edit'; orderDirty = false; orderUnlockedId = null;
  setView('orders');
  showToast(`Ordine ${o.number} creato dalla richiesta${closed ? ' · ' + r.number + ' chiusa' : ''}`);
}
function openOrderEdit(id) { currentOrderId = id; orderView = 'edit'; orderDirty = false; orderUnlockedId = null; renderOrders(); }
function orderBackToList() { docBackToList('order'); }
function orderMarkDirty() { docMarkDirty('order'); }
function ordSave(id) { docSave('order', id); }
function ordSetField(id, field, value) { docSetField('order', id, field, value); }
function ordSetSupplier(id, sid) { docSetSupplier('order', id, sid); }
function ordSetLine(id, lineId, field, value) { docSetLine('order', id, lineId, field, value); }
function ordDelLine(id, lineId) { docDelLine('order', id, lineId); }
function ordMarkAllReceived(id) {
  if (!ordGuard(id, 'reception')) return;
  const o = getOrder(id); if (!o) return;
  (o.lines || []).forEach(l => { l.received = Number(l.qty) || 0; });
  ordAutoStatus(o); touch(o); orderMarkDirty(); renderOrders();
}

function ordAddManualLineModal(id) { docAddManualLineModal('order', id); }
function ordAddManualLine(id) { docAddManualLine('order', id); }
function ordEditLineModal(id, lineId) { docEditLineModal('order', id, lineId); }
function ordSaveLineEdit(id, lineId) { docSaveLineEdit('order', id, lineId); }
function ordAddCatalogModal(id) { if (!ordGuard(id, 'contract')) return; catalogPickerModal(ids => ordAddCatalogLines(id, ids)); }
function ordAddCatalogLines(id, ids) { docAddCatalogLines('order', id, ids); }

// ─── La riga porta ancora il listino di un altro? ───
// Le righe si compilano e *poi* si sceglie il fornitore, o lo si cambia a
// documento avviato. I prezzi non si riscrivono da soli — in quest'app nessun
// prezzo cambia da sé, è la regola su cui poggia tutto il resto — ma una riga
// che porta la quotazione di Rossi su un ordine passato a Bianchi va detta,
// altrimenti resta un numero sbagliato dall'aria giusta fino alla fattura.
//
// Si confronta con la quotazione più recente del fornitore attuale. Niente
// avviso su una riga manuale (non viene da un listino), né su una riga senza
// prezzo (l'assenza si vede già da sé).
function ordLineListinoWarn(o, l) {
  if (!l.itemId || !o.supplierId) return '';
  const prezzo = (l.price === '' || l.price == null) ? null : Number(l.price);
  if (prezzo == null) return '';
  const row = supplierPriceRow(getItem(l.itemId), o.supplierId);
  const sup = supplierName(o.supplierId) || 'questo fornitore';
  if (!row || row.price === '' || row.price == null) {
    return `<span class="mrp-warn" title="${esc(sup)} non ha questo articolo a listino: il prezzo in riga viene da un'altra parte. Verificalo prima di mandare l'ordine.">⚠ non a listino</span>`;
  }
  const uom = priceUomOf(getItem(l.itemId), row);
  if (Math.abs(Number(row.price) - prezzo) < 0.00005 && uom === (l.uom || '')) return '';
  return `<span class="mrp-warn" title="A listino ${esc(sup)} quota ${fmtPer(row.price, uom)}. La riga dice altro: può essere un prezzo concordato, o il listino di un fornitore diverso rimasto da prima.">⚠ ${fmtPer(row.price, uom)} a listino</span>`;
}

function renderOrderEdit(id) {
  const o = getOrder(id); if (!o) { orderView = 'list'; return renderOrderList(); }
  const lines = (o.lines || []).map((l, i) => {
    const si = lineSupInfo(o.supplierId, l);
    const siSub = si ? `<div class="rfq-cmp-sub">🏷 ${esc(si.code || '—')}${si.desc ? ' · ' + esc(si.desc) : ''}</div>` : '';
    const warn = ordLineListinoWarn(o, l);
    const qty = Number(l.qty) || 0, price = (l.price === '' || l.price == null) ? null : Number(l.price);
    const amount = price != null ? qty * price : null;
    const rec = Number(l.received) || 0, residual = qty - rec;
    return `<tr>
      <td>${i + 1}</td>
      <td style="font-family:var(--mono)">${codeLink(l.itemId, l.code || '')}</td>
      <td>${esc(l.description)}${l.itemId ? '' : ' <span class="rfq-manual-tag">manuale</span>'}${warn ? ' ' + warn : ''}${siSub}${l.note ? `<div class="line-note">📝 ${esc(l.note)}</div>` : ''}</td>
      <td>${esc(l.uom || '')}</td>
      <td><input type="number" class="rfq-qty-input lock-contract" value="${l.qty}" min="0" step="any" onchange="ordSetLine('${id}','${l.id}','qty',this.value)"></td>
      <td><input type="number" class="rfq-price-input lock-contract" value="${price != null ? price : ''}" min="0" step="any" placeholder="—" onchange="ordSetLine('${id}','${l.id}','price',this.value)"></td>
      <td class="ord-amount">${amount != null ? fmtN(amount) : '—'}</td>
      <td><input type="date" class="rfq-date-input lock-contract" value="${esc(l.deliveryDate || '')}" onchange="ordSetLine('${id}','${l.id}','deliveryDate',this.value)"></td>
      <td><input type="date" class="rfq-date-input lock-reception" value="${esc(l.confirmedDate || '')}" title="Data che il fornitore ha confermato" onchange="ordSetLine('${id}','${l.id}','confirmedDate',this.value)">
        ${ordLineDelayHtml(l)}</td>
      <td><input type="number" class="rfq-qty-input lock-reception" value="${rec}" min="0" step="any" onchange="ordSetLine('${id}','${l.id}','received',this.value)"></td>
      <td class="ord-residual ${residual > 0 ? 'pos' : ''}">${fmtQty(residual)}</td>
      <td class="line-actions"><button class="mini-btn" onclick="ordEditLineModal('${id}','${l.id}')" title="Modifica riga / nota">✏</button>
        <button class="mini-btn danger lock-contract" onclick="ordDelLine('${id}','${l.id}')">🗑</button></td></tr>`;
  }).join('') || `<tr><td colspan="12" class="empty-text">Nessuna riga. Aggiungi articoli dal catalogo o manualmente.</td></tr>`;
  const total = orderTotal(o);
  // Se il fornitore ha confermato più tardi di quanto chiesto, si dice subito e
  // in testata: è l'informazione che fa decidere se la commessa slitta, e non
  // deve stare nascosta in una colonna in fondo.
  const ritardo = orderWorstDelay(o);
  const co = db.settings.company || {};
  const coWarn = co.name ? '' : `<div class="rfq-warn">⚠ Dati azienda non impostati: compilali in <strong>Gestione › Dati azienda</strong> per stamparli sul documento.</div>`;
  const rfqRef = docOriginRef(o);
  const dis = orderDirty ? 'disabled title="Salva l\'ordine prima di generare il documento"' : '';
  const mode = ordMode(o);
  const lockBanner = docLockBanner(mode, 'Ordine ' + (ORDER_STATUS[o.status] || o.status).toLowerCase(), 'order', id);
  return `<div class="manage-wrap">
    <div class="bom-toolbar">
      <button class="btn-outline" onclick="orderBackToList()">← Elenco</button>
      <h2 class="section-title" style="font-family:var(--mono)">${esc(o.number)}</h2>
      ${statusBadge(ORDER_STATUS, o.status)}
      <button class="add-btn-sm rfq-save-btn ${orderDirty ? 'dirty' : ''}" id="order-save-btn" onclick="ordSave('${id}')">💾 Salva</button>
    </div>
    ${coWarn}${rfqRef}${lockBanner}${stampLine(o)}
    <div class="rfq-head">
      <div class="modal-field"><label>Titolo / oggetto</label><input class="lock-contract" value="${esc(o.title || '')}" onchange="ordSetField('${id}','title',this.value)"></div>
      <div class="rfq-head-row">
        <div class="modal-field"><label>Fornitore</label><select class="lock-contract" onchange="ordSetSupplier('${id}',this.value)">${supplierOptions(o.supplierId)}</select></div>
        <div class="modal-field"><label>Data ordine</label><input type="date" class="lock-contract" value="${(o.date || '').slice(0, 10)}" onchange="ordSetField('${id}','date',this.value)"></div>
        <div class="modal-field"><label>Stato</label><select onchange="ordSetField('${id}','status',this.value)">
          ${Object.entries(ORDER_STATUS).map(([k, v]) => `<option value="${k}" ${o.status === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select></div>
      </div>
      <div class="rfq-head-row">
        <div class="modal-field"><label>Tipo di trasporto / resa</label>
          <input list="ord-transport-opts" class="lock-contract" value="${esc(o.transport || '')}" placeholder="es. Porto franco, EXW…" onchange="ordSetField('${id}','transport',this.value)">
          <datalist id="ord-transport-opts">${(db.settings.transportOptions || []).map(x => `<option value="${esc(x)}"></option>`).join('')}</datalist></div>
        <div class="modal-field"><label>Tipo di pagamento</label>
          <input list="ord-payment-opts" class="lock-contract" value="${esc(o.payment || '')}" placeholder="es. Bonifico 60gg…" onchange="ordSetField('${id}','payment',this.value)">
          <datalist id="ord-payment-opts">${(db.settings.paymentOptions || []).map(x => `<option value="${esc(x)}"></option>`).join('')}</datalist></div>
      </div>
      <div class="rfq-head-row">
        <div class="modal-field"><label>N° conferma d'ordine fornitore</label><input value="${esc(o.supplierConfirmation || '')}" onchange="ordSetField('${id}','supplierConfirmation',this.value)"></div>
      </div>
      <div class="modal-field"><label>Note</label><textarea rows="2" onchange="ordSetField('${id}','notes',this.value)">${esc(o.notes || '')}</textarea></div>
      <div class="modal-field"><label>🔒 Note interne (non stampate sui documenti)</label><textarea rows="2" class="notes-internal" onchange="ordSetField('${id}','notesInternal',this.value)">${esc(o.notesInternal || '')}</textarea></div>
    </div>
    ${ritardo != null ? `<div class="rfq-warn">⏱ Il fornitore ha confermato con <strong>${ritardo} ${ritardo === 1 ? 'giorno' : 'giorni'}</strong> di ritardo sulla data richiesta. Se questo materiale è a commessa, la consegna al cliente va verificata.</div>` : ''}
    <h3 class="rfq-subhead">Righe ordine
      <span class="rfq-head-actions">
        <button class="add-btn-sm lock-contract" onclick="ordAddCatalogModal('${id}')">+ Da catalogo</button>
        <button class="btn-outline lock-contract" onclick="ordAddManualLineModal('${id}')">+ Riga manuale</button>
        <button class="btn-outline lock-reception" onclick="ordMarkAllReceived('${id}')">✓ Segna tutto ricevuto</button>
      </span></h3>
    <div class="table-wrap"><table class="rfq-table">
      <thead><tr><th>#</th><th>Codice</th><th>Descrizione</th><th>U.M.</th><th>Q.tà</th>
        <th title="Prezzo di una unità, nella U.M. della riga">Prezzo unit. (${esc(cur())}/U.M.)</th><th>Importo (${esc(cur())})</th>
        <th title="Data che abbiamo chiesto">Richiesta</th>
        <th title="Data che il fornitore ha confermato">Confermata</th>
        <th>Ricevuto</th><th>Residuo</th><th></th></tr></thead>
      <tbody>${lines}</tbody>
      <tfoot><tr class="rfq-cmp-total"><td colspan="6" style="text-align:right">Totale imponibile</td><td>${fmtN(total)}</td><td colspan="5"></td></tr></tfoot>
    </table></div>
    <div class="rfq-export-bar">
      <label>Documento d'ordine:</label>
      <button class="export-btn-pdf order-export-btn" onclick="exportOrderPDF('${id}')" ${dis}>📄 PDF</button>
      <button class="export-btn-xls order-export-btn" onclick="exportOrderExcel('${id}')" ${dis}>📗 Excel</button>
      ${orderDirty ? '<span class="rfq-dirty-hint">Salva per abilitare la generazione del documento</span>' : ''}
    </div>
  </div>`;
}

function exportOrderPDF(id) {
  const o = getOrder(id); if (!o) return;
  if (!(o.lines || []).length) { showToast('Nessuna riga da esportare', 'error'); return; }
  const jsPDF = requirePdf(); if (!jsPDF) return;
  const co = db.settings.company || {};
  const sup = o.supplierId ? getSupplier(o.supplierId) : null;
  const hasSup = (o.lines || []).some(l => lineSupInfo(o.supplierId, l));
  const doc = new jsPDF({ orientation: 'landscape' });
  doc.setFontSize(15); doc.setTextColor(30); doc.text(`Ordine di acquisto / Purchase Order — ${o.number}`, 14, 16);
  doc.setFontSize(9); doc.setTextColor(90);
  doc.text(`Data / Date: ${fmtDateIt(o.date) || fmtDateIt(nowISO())}`, 14, 22);
  if (o.title) doc.text(`Oggetto / Subject: ${o.title}`, 14, 27);
  const yTop = 36;
  const block = (x, title, rowsTxt) => {
    doc.setFontSize(8); doc.setTextColor(130); doc.text(title, x, yTop);
    doc.setFontSize(9); doc.setTextColor(40);
    const rows = rowsTxt.filter(Boolean);
    rows.forEach((t, i) => doc.text(String(t), x, yTop + 5 + i * 4.5));
    return rows.length;
  };
  const n1 = block(14, 'RICHIEDENTE / BUYER', docPartyLines(co, true));
  const n2 = block(160, 'FORNITORE / SUPPLIER', sup ? docPartyLines(sup, true) : ['(fornitore non selezionato / not selected)']);
  const startY = yTop + 5 + Math.max(n1, n2) * 4.5 + 4;
  const head = hasSup
    ? ['#', 'Codice\nCode', 'Descrizione\nDescription', 'Cod. forn.\nSuppl. code', 'Descr. forn.\nSuppl. desc.', 'Q.tà\nQty', 'Prezzo unit.\nUnit price', 'Importo\nAmount', 'Data consegna\nDelivery date']
    : ['#', 'Codice\nCode', 'Descrizione\nDescription', 'Q.tà\nQty', 'Prezzo unit.\nUnit price', 'Importo\nAmount', 'Data consegna\nDelivery date'];
  const body = (o.lines || []).map((l, i) => {
    const si = lineSupInfo(o.supplierId, l);
    const qty = Number(l.qty) || 0, price = (l.price === '' || l.price == null) ? null : Number(l.price);
    const tail = [(qty + ' ' + (l.uom || '')).trim(),
      price != null ? fmtN(price) + (l.uom ? '/' + l.uom : '') : '',
      price != null ? fmtN(qty * price) : '', fmtDateIt(l.deliveryDate)];
    return hasSup ? [i + 1, l.code || '', lineDescDoc(l), si ? si.code : '', si ? si.desc : '', ...tail] : [i + 1, l.code || '', lineDescDoc(l), ...tail];
  });
  const totLabel = { content: 'Totale / Total', styles: { halign: 'right', fontStyle: 'bold' } };
  const totVal = { content: fmtN(orderTotal(o)), styles: { fontStyle: 'bold' } };
  const foot = hasSup ? [['', '', '', '', '', '', totLabel, totVal, '']] : [['', '', '', '', totLabel, totVal, '']];
  doc.autoTable({ startY, head: [head], body, foot, styles: { fontSize: 8 }, headStyles: { fillColor: [58, 123, 232] }, footStyles: { fillColor: [235, 238, 245], textColor: 20 } });
  let fy = doc.lastAutoTable.finalY + 8;
  doc.setTextColor(80); doc.setFontSize(9);
  if (o.transport) { doc.text('Trasporto / Shipping: ' + o.transport, 14, fy); fy += 5; }
  if (o.payment) { doc.text('Pagamento / Payment: ' + o.payment, 14, fy); fy += 5; }
  if (o.supplierConfirmation) { doc.text('Conferma fornitore / Order confirmation: ' + o.supplierConfirmation, 14, fy); fy += 5; }
  // Solo o.notes: le note interne (notesInternal) non escono mai sul documento.
  if (o.notes) { doc.text('Note / Notes: ' + o.notes, 14, fy); }
  doc.save(`${o.number}${sup ? '_' + (sup.name || '').replace(/\s+/g, '_') : ''}.pdf`);
  showToast('PDF esportato');
  askMarkSent(o, `PDF generato.\nSegnare l'ordine ${o.number} come inviato?`, 'inviato', renderOrders);
}

function exportOrderExcel(id) {
  const o = getOrder(id); if (!o) return;
  if (!(o.lines || []).length) { showToast('Nessuna riga da esportare', 'error'); return; }
  const co = db.settings.company || {};
  const sup = o.supplierId ? getSupplier(o.supplierId) : null;
  const data = [['Ordine di acquisto / Purchase Order', o.number], ['Data', fmtDateIt(o.date)]];
  if (o.title) data.push(['Oggetto', o.title]);
  if (o.rfqId && getRfq(o.rfqId)) data.push(['Da richiesta', getRfq(o.rfqId).number]);
  if (o.transport) data.push(['Trasporto / Shipping', o.transport]);
  if (o.payment) data.push(['Pagamento / Payment', o.payment]);
  if (o.supplierConfirmation) data.push(['Conferma fornitore / Order confirmation', o.supplierConfirmation]);
  data.push([]);
  data.push(['RICHIEDENTE', '', 'FORNITORE']);
  const coLines = docPartyLines(co), supLines = docPartyLines(sup);
  for (let i = 0; i < Math.max(coLines.length, supLines.length); i++) data.push([coLines[i] || '', '', supLines[i] || '']);
  data.push([]);
  const hasSup = (o.lines || []).some(l => lineSupInfo(o.supplierId, l));
  // Nel foglio i numeri restano numeri: la valuta si dichiara in intestazione,
  // l'unità sta nella sua colonna e vale per q.tà, ricevuto e residuo.
  const hPrezzo = `Prezzo unitario (${cur()}/U.M.)`, hImporto = `Importo (${cur()})`;
  data.push(hasSup
    ? ['#', 'Codice', 'Descrizione', 'Codice fornitore', 'Descrizione fornitore', 'Q.tà', 'U.M.', hPrezzo, hImporto, 'Consegna', 'Ricevuto', 'Residuo', 'Nota']
    : ['#', 'Codice', 'Descrizione', 'Q.tà', 'U.M.', hPrezzo, hImporto, 'Consegna', 'Ricevuto', 'Residuo', 'Nota']);
  (o.lines || []).forEach((l, i) => {
    const si = lineSupInfo(o.supplierId, l);
    const qty = Number(l.qty) || 0, price = (l.price === '' || l.price == null) ? '' : Number(l.price);
    const amount = price === '' ? '' : qty * price;
    const rec = Number(l.received) || 0;
    const supCols = hasSup ? [si ? si.code : '', si ? si.desc : ''] : [];
    data.push([i + 1, l.code || '', l.description, ...supCols, qty, l.uom || '', price, amount, fmtDateIt(l.deliveryDate), rec, qty - rec, l.note || '']);
  });
  data.push([]);
  data.push(['', 'TOTALE IMPONIBILE / TOTAL', orderTotal(o)]);
  // Solo o.notes: le note interne (notesInternal) non escono mai sul documento.
  if (o.notes) { data.push([]); data.push(['Note', o.notes]); }
  if (!requireXlsx()) return;
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Ordine');
  XLSX.writeFile(wb, `${o.number}${sup ? '_' + (sup.name || '').replace(/\s+/g, '_') : ''}.xlsx`);
  showToast('Excel esportato');
  askMarkSent(o, `Excel generato.\nSegnare l'ordine ${o.number} come inviato?`, 'inviato', renderOrders);
}

function delOrder(id) {
  docDel('order', id, () => {
    if (currentOrderId === id) { currentOrderId = null; orderView = 'list'; }
  }, o => {
    // Un ordine con merce già arrivata non si cancella per sbaglio: il numero
    // dei ricevuti è la ragione per cui vale la pena fermarsi a rileggere.
    const rec = orderReception(o);
    return rec.received ? ` con ${fmtQty(rec.received)} già ricevuti` : '';
  });
}
