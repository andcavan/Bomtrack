// ═══════════════════════════════════════════════════════════
//  BOMTRACK — views-catalog.js
// ═══════════════════════════════════════════════════════════
// Anagrafiche articoli (Acquisti e Progetto), listino fornitori con lo storico
// prezzi, scheda articolo e vista Cicli di lavorazione.
// Classic script, scope globale condiviso con gli altri: nessun modulo e
// nessun build, così index.html continua ad aprirsi con un doppio click.

// ═══════════════════════════════════════════════════════════
//  LISTINO FORNITORI E STORICO PREZZI
// ═══════════════════════════════════════════════════════════
// Un articolo comprato viene quotato da più fornitori, e le quotazioni
// cambiano nel tempo. Il listino le conserva tutte; una sola è "in uso" ed è
// quella che finisce nei campi dell'articolo, cioè nella costificazione.
// Nessun costo viene derivato dal listino di nascosto: il passaggio è sempre
// una scelta esplicita, così un prezzo non cambia da solo sotto un'offerta.
// Anche le parti: molte si comprano già lavorate da terzi, e chi le produce in
// casa usa comunque il listino come unico posto dove nasce un costo unitario.
function hasPriceList(it) { return !!it && (it.type === 'acquistato' || it.type === 'materiale' || it.type === 'parte'); }
function priceRows(it) { return (it && it.priceList) || []; }
function activePriceRow(it) { return priceRows(it).find(r => r.id === it.activePriceId) || null; }
// ─── La quotazione con cui si parla a UN fornitore preciso ───
// Prezzo, unità, codice e descrizione su un documento non sono dell'articolo:
// sono di quel fornitore. Rossi lo chiama ROSSI-1 e lo quota 10 €/m, Bianchi lo
// chiama BIA-9 e lo quota 12 €/kg, e la stessa riga d'ordine porta l'uno o
// l'altro a seconda di a chi è intestata.
//
// Prenderli dalla quotazione **in uso** rispondeva alla domanda sbagliata —
// «quanto lo pago di solito?» invece di «quanto me lo fa questo qui?» — e
// mandava a un fornitore il prezzo di un altro.
//
// Fra le sue quotazioni vince la **più recente**: è l'ultima volta che ci si è
// parlati, e un listino vecchio di due anni non è il prezzo di oggi. A parità di
// data vince l'ultima registrata. La quotazione in uso non ha alcun privilegio
// qui: quella riguarda la costificazione, che è un'altra domanda.
function supplierPriceRow(it, supplierId) {
  if (!it || !supplierId) return null;
  return priceRows(it)
    .filter(r => r.supplierId === supplierId)
    .reduce((best, r) => (!best || (r.date || '') >= (best.date || '') ? r : best), null);
}
// ─── Quotazioni in un'unità diversa da quella di gestione ───
// L'unità in cui è espressa QUESTA quotazione. Vale solo se è l'unità
// alternativa dell'articolo: qualunque altra cosa vale come unità di gestione,
// così un dato sporco non produce una conversione inventata.
function priceUomOf(it, row) {
  const u = row && row.priceUom;
  return (u && hasAltUom(it) && u === altUomOf(it)) ? u : (it ? (it.uom || '') : '');
}
// Il costo di una quotazione **nell'unità di gestione**, che è l'unica in cui i
// costi hanno senso: le quantità delle distinte sono in quella.
// 2 €/kg su una barra da 8 kg/m fanno 16 €/m.
function rowUnitCost(it, row) {
  if (!row || row.price === '' || row.price == null) return null;
  return (Number(row.price) || 0) * uomFactor(it, priceUomOf(it, row));
}
// La quotazione più bassa tra quelle valorizzate (a parità, la più recente).
// Il confronto è sui costi **convertiti**, mai sui prezzi grezzi: «2 €/kg»
// sembrerebbe più conveniente di «5 €/m» su una barra che pesa 8 kg/m, e la
// segnalazione di risparmio consiglierebbe il fornitore più caro — un errore
// silenzioso e per giunta a effetto opposto.
function bestPriceRow(it) {
  const quotate = priceRows(it).filter(r => r.price !== '' && r.price != null);
  if (!quotate.length) return null;
  return quotate.reduce((best, r) => {
    const d = (rowUnitCost(it, r) || 0) - (rowUnitCost(it, best) || 0);
    if (d < 0) return r;
    if (d > 0) return best;
    return (r.date || '') > (best.date || '') ? r : best;
  });
}
// Unità in cui si parla col fornitore: quella della quotazione in uso. È la
// lingua in cui vanno scritti richieste e ordini — «15 m» a chi vende a chilo
// è un ordine da rifare.
// L'unità in cui si parla a un fornitore preciso: quella della sua quotazione
// applicabile. Senza quotazioni sue si ricade sull'unità di gestione — non
// sull'unità di un altro fornitore, che sarebbe una lingua inventata.
function docUomFor(it, supplierId) {
  const row = supplierPriceRow(it, supplierId);
  return (row && priceUomOf(it, row)) || itemUom(it);
}
// Porta una quotazione nei campi dell'articolo: da qui in poi è quella che costa.
// È la porta unica in cui avviene la conversione, ed è il motivo per cui il
// motore di costo non sa niente di unità di misura: riceve già tutto nell'unità
// di gestione e continua a moltiplicare un costo per una quantità.
function applyPriceRow(it, row) {
  const campo = costField(it);
  if (campo) it[campo] = rowUnitCost(it, row) || 0;
  // Il fornitore vale per ogni tipo con listino: senza, una materia prima o una
  // parte acquistata arriverebbero al fabbisogno e ai documenti senza intestatario.
  it.supplierId = row.supplierId || null;
  it.supplierCode = row.code || '';
  it.supplierDesc = row.desc || '';
  it.activePriceId = row.id;
}

function priceListModal(id) {
  const it = getItem(id); if (!it) return;
  if (!hasPriceList(it)) { showToast('Il listino vale solo per commerciali e materie prime', 'error'); return; }
  window.__priceItemId = id;
  openModal(`<h3>💶 Listino fornitori — ${esc(it.code)}</h3>
    <p style="color:var(--text-dim);margin-bottom:14px">${esc(it.name)} · ${typeLabel(it.type)}</p>
    <div id="pricelist-body">${priceListBody(id)}</div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Chiudi</button></div>`, true, 'listino');
}
function priceListRefresh() {
  const host = document.getElementById('pricelist-body');
  if (host && window.__priceItemId) host.innerHTML = priceListBody(window.__priceItemId);
}
function priceListBody(id) {
  const it = getItem(id); if (!it) return '';
  const campo = costField(it);
  const inUso = activePriceRow(it);
  const migliore = bestPriceRow(it);
  const scrivibile = canWrite('catalog');
  const doppia = hasAltUom(it);   // la colonna dell'unità compare solo se serve

  // Le quotazioni più recenti in cima: è quello che si guarda per primo.
  const righe = priceRows(it).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const corpo = righe.map(r => {
    const attiva = inUso && r.id === inUso.id;
    const best = migliore && r.id === migliore.id && righe.length > 1;
    const ro = scrivibile ? '' : 'disabled';
    return `<tr class="${attiva ? 'price-active' : ''}">
      <td class="pl-flag">${attiva ? '<span title="Prezzo in uso nella costificazione">✓</span>' : ''}${best ? '<span class="price-best" title="Quotazione più bassa">↓</span>' : ''}</td>
      <td class="pl-sup">
        <select ${ro} onchange="priceSetField('${r.id}','supplierId',this.value)">${supplierOptions(r.supplierId || '')}</select>
        <div class="pl-sub">
          <input value="${esc(r.code || '')}" placeholder="codice fornitore" title="Codice dell'articolo presso il fornitore" ${ro} onchange="priceSetField('${r.id}','code',this.value)">
          <input class="pl-desc" value="${esc(r.desc || '')}" placeholder="descrizione fornitore" title="Descrizione dell'articolo presso il fornitore" ${ro} onchange="priceSetField('${r.id}','desc',this.value)">
          <span title="Da dove arriva la quotazione">${esc(priceRowOrigin(r))}</span>
        </div>
      </td>
      <td><input type="number" class="num pl-price" min="0" step="0.0001" value="${r.price === '' || r.price == null ? '' : r.price}" ${ro} onchange="priceSetField('${r.id}','price',this.value)">
        ${doppia ? `<div class="pl-sub"><select ${ro} title="Unità in cui il fornitore quota" onchange="priceSetField('${r.id}','priceUom',this.value)">${itemUomOptions(it, priceUomOf(it, r))}</select>
          ${priceUomOf(it, r) !== (it.uom || '') ? `<span title="Costo convertito nell'unità di gestione">= ${fmtN(rowUnitCost(it, r) || 0)}/${esc(it.uom || '')}</span>` : ''}</div>` : ''}</td>
      <td><input type="number" class="num pl-small" min="0" step="any" value="${r.minQty === '' || r.minQty == null ? '' : r.minQty}" placeholder="—" title="Quantità minima, nell'unità della quotazione" ${ro} onchange="priceSetField('${r.id}','minQty',this.value)"></td>
      <td><input type="number" class="num pl-small" min="0" max="9999" step="1" value="${r.leadDays === '' || r.leadDays == null ? '' : r.leadDays}" placeholder="—" title="Giorni di consegna" ${ro} onchange="priceSetField('${r.id}','leadDays',this.value)"></td>
      <td><input type="date" class="pl-date" value="${esc(r.date || '')}" ${ro} onchange="priceSetField('${r.id}','date',this.value)"></td>
      <td class="pl-act">
        ${attiva ? '' : `<button class="mini-btn" title="Usa questo prezzo nella costificazione" onclick="priceUseRow('${r.id}')">✓ Usa</button>`}
        <button class="mini-btn danger" title="Elimina la voce" onclick="priceDelRow('${r.id}')">🗑</button>
      </td></tr>`;
  }).join('');

  const vuoto = `<tr><td colspan="7" class="empty-text">Nessuna quotazione registrata. Aggiungine una, oppure registrale da una richiesta di offerta ricevuta.</td></tr>`;
  const attuale = campo
    ? `<p style="margin-bottom:12px">Prezzo in uso nella costificazione: <strong style="font-family:var(--mono)">${fmtPer(Number(it[campo]) || 0, itemUom(it))}</strong>${doppia ? ` <span style="color:var(--text-dim)">— ${esc(itemUom(it))} è l'unità con cui l'articolo si gestisce e si mette in distinta</span>` : ''}${inUso ? '' : ' <span style="color:var(--text-dim)">(inserito a mano, non da listino)</span>'}</p>`
    : `<p style="margin-bottom:12px;color:var(--text-dim)">Il costo di questa parte è derivato dalla distinta parte e dal ciclo di lavorazione. Con “✓ Usa” si può passare al prezzo del fornitore, cambiando il modo di calcolo.</p>`;
  // Prezzo e quantità minima sono entrambi nell'unità **della quotazione**, che
  // può non essere quella di gestione: quando le due differiscono la colonna
  // dell'unità compare accanto al prezzo e l'intestazione non la anticipa.
  const uQuot = doppia ? 'U.M. quotazione' : (itemUom(it) || 'U.M.');
  return `${attuale}
    <div class="table-wrap"><table class="price-table">
      <thead><tr><th></th><th>Fornitore</th><th>Prezzo (${esc(cur())}/${esc(uQuot)})</th><th>Q.tà min (${esc(uQuot)})</th>
        <th title="Giorni di consegna">GG</th><th>Data</th><th></th></tr></thead>
      <tbody>${corpo || vuoto}</tbody></table></div>
    <div style="margin-top:10px"><button class="add-btn-sm" onclick="priceAddRow()">+ Aggiungi quotazione</button></div>`;
}
function priceRowOrigin(r) {
  if (!r.rfqId) return 'a mano';
  const q = db.rfqs.find(x => x.id === r.rfqId);
  return q ? q.number : 'richiesta eliminata';
}
// ─── Mutatori del listino ───
// Ogni operazione salva: il listino è un dato dell'articolo come gli altri.
function priceRowById(rowId) {
  const it = getItem(window.__priceItemId);
  if (!it) return null;
  return { it, row: priceRows(it).find(r => r.id === rowId) || null };
}
function priceAddRow() {
  if (!roleGuard('catalog')) return;
  const it = getItem(window.__priceItemId); if (!it) return;
  // Il listino lo semina migrateDB() su ogni articolo che ne ha diritto, quindi
  // di norma c'è già; ma dipendere da una migrazione per non lanciare è una
  // fragilità che costa una riga togliere.
  if (!Array.isArray(it.priceList)) it.priceList = [];
  it.priceList.push(stampNew({
    id: gid(), supplierId: it.supplierId || null, price: '', minQty: '', leadDays: '',
    code: '', desc: '', date: new Date().toISOString().slice(0, 10), rfqId: null, note: '',
  }));
  touch(it); saveDB(); priceListRefresh(); renderCatalogs();
}
function priceSetField(rowId, field, value) {
  if (!roleGuard('catalog')) { priceListRefresh(); return; }
  const found = priceRowById(rowId); if (!found || !found.row) return;
  const { it, row } = found;
  if (field === 'price' || field === 'minQty') {
    row[field] = value === '' ? '' : clampNum(parseFloat(value), 0);
  } else if (field === 'priceUom') {
    // Vuoto o pari all'unità di gestione = nessuna conversione: si toglie il
    // campo invece di scriverci dentro un valore che vuol dire "niente".
    if (value && hasAltUom(it) && value === altUomOf(it)) row.priceUom = value;
    else delete row.priceUom;
  } else if (field === 'leadDays') {
    // La colonna è larga quattro cifre: oltre 9999 giorni non è un termine di consegna.
    row.leadDays = value === '' ? '' : clampNum(parseFloat(value), 0, 9999);
  } else if (field === 'supplierId') {
    row.supplierId = value || null;
  } else {
    row[field] = value;
  }
  touch(row); touch(it);
  // Correggere il prezzo della quotazione in uso deve muovere anche il costo:
  // altrimenti listino e costificazione direbbero due cose diverse. Vale anche
  // per l'unità: cambiarla senza ricalcolare lascerebbe un costo che è un
  // numero giusto nell'unità sbagliata, cioè un numero sbagliato.
  //
  // E vale per fornitore, codice e descrizione: l'articolo ne tiene una copia
  // (è il "prezzo in uso"), e correggere un refuso nel codice del fornitore
  // sulla riga in uso lasciava quella copia al valore vecchio — cioè lasciava
  // in giro un secondo codice, sbagliato, che nessuna schermata mostrava come
  // tale. Si riapplica la riga: è già la porta unica per questo travaso.
  const RIAPPLICA = ['price', 'priceUom', 'supplierId', 'code', 'desc'];
  if (RIAPPLICA.includes(field) && it.activePriceId === row.id) applyPriceRow(it, row);
  saveDB(); priceListRefresh(); renderCatalogs();
}
function priceUseRow(rowId) {
  if (!roleGuard('catalog')) return;
  const found = priceRowById(rowId); if (!found || !found.row) return;
  // Parte prodotta in casa: il costo lo determina il ciclo, non c'è un campo dove
  // scrivere il prezzo. Usarlo significa dire che quella parte la si compra —
  // decisione che sposta il costo di ogni distinta che la contiene, quindi si chiede.
  if (!costField(found.it)) { priceSourcingModal(rowId); return; }
  priceApplyRow(rowId);
}
// Il passaggio vero e proprio, una volta che c'è un campo dove scrivere.
function priceApplyRow(rowId) {
  if (!roleGuard('catalog')) return;
  const found = priceRowById(rowId); if (!found || !found.row) return;
  applyPriceRow(found.it, found.row);
  touch(found.it); saveDB(); priceListRefresh(); renderCatalogs();
  // showToast passa già da esc(): l'unità va concatenata cruda, non da fmtPer.
  const uRiga = priceUomOf(found.it, found.row);
  showToast('Prezzo in uso aggiornato: ' + fmtN(Number(found.row.price) || 0) + (uRiga ? '/' + uRiga : ''));
}
function priceSourcingModal(rowId) {
  const found = priceRowById(rowId); if (!found || !found.row) return;
  openModal(`<h3>Questa parte risulta prodotta in casa</h3>
    <p style="margin-bottom:14px">Il costo di <strong>${esc(found.it.code)}</strong> lo determinano la sua distinta parte e il suo
      ciclo di lavorazione. Per usare il prezzo del fornitore va segnata come <strong>acquistata</strong>: il costo diventa
      quello a listino e nel fabbisogno la sua distinta smette di esplodersi.</p>
    <p style="margin-bottom:14px;color:var(--text-dim)">Distinta e ciclo restano salvati: si può tornare indietro dalla scheda articolo.</p>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="priceUseAsBought('${rowId}')">Segna come acquistata e usa il prezzo</button>
    </div>`, true, 'listino-sourcing');
}
function priceUseAsBought(rowId) {
  if (!roleGuard('catalog')) return;
  const found = priceRowById(rowId); if (!found || !found.row) return;
  found.it.sourcing = 'buy';
  closeModal();
  priceApplyRow(rowId);
  renderBom();
  showToast(found.it.code + ': parte acquistata da fornitore');
}
function priceDelRow(rowId) {
  if (!roleGuard('catalog')) return;
  const found = priceRowById(rowId); if (!found || !found.row) return;
  const { it, row } = found;
  const attiva = it.activePriceId === row.id;
  askConfirm(attiva
    ? 'Questa è la quotazione in uso. Eliminandola il costo dell\'articolo resta quello attuale, ma non sarà più legato a un fornitore. Procedere?'
    : 'Eliminare questa quotazione dal listino?', () => {
    it.priceList = it.priceList.filter(r => r.id !== rowId);
    if (attiva) it.activePriceId = null;   // il costo resta, si sgancia il riferimento
    touch(it); saveDB(); priceListRefresh(); renderCatalogs();
  });
}

// ─── Dalla richiesta di offerta al listino ───
// Le righe da catalogo con un prezzo compilato diventano quotazioni. Una riga
// già registrata non si duplica: la coppia richiesta + riga è la chiave.
function rfqPriceCandidates(r) {
  if (!r || !r.supplierId) return [];
  return (r.lines || []).filter(l => {
    if (!l.itemId || l.price === '' || l.price == null) return false;
    const it = getItem(l.itemId);
    if (!hasPriceList(it)) return false;
    return !priceRows(it).some(p => p.rfqId === r.id && p.lineId === l.id);
  });
}
function rfqRecordPrices(id) {
  if (!roleGuard('catalog')) return;
  const r = getRfq(id); if (!r) return;
  if (!r.supplierId) { showToast('La richiesta non ha un fornitore', 'error'); return; }
  const righe = rfqPriceCandidates(r);
  if (!righe.length) { showToast('Nessun prezzo nuovo da registrare', 'error'); return; }
  const data = (r.date || new Date().toISOString()).slice(0, 10);
  righe.forEach(l => {
    const it = getItem(l.itemId);
    const si = rfqLineSupInfo(r, l);
    it.priceList.push(stampNew({
      id: gid(), supplierId: r.supplierId, price: Number(l.price) || 0,
      minQty: '', leadDays: '', code: (si && si.code) || '', desc: (si && si.desc) || '',
      date: data, rfqId: r.id, lineId: l.id, note: '',
    }));
    touch(it);
  });
  saveDB(); renderRfq(); renderCatalogs();
  showToast(righe.length + (righe.length === 1 ? ' prezzo registrato a listino' : ' prezzi registrati a listino'));
}

function usageModal(id) {
  const it = getItem(id); if (!it) return;
  window.__usageItemId = id;
  openModal(`<h3>🔗 Dove è usato — ${esc(it.code)}</h3>
    <p style="color:var(--text-dim);margin-bottom:14px">${esc(it.name)} · ${typeLabel(it.type)}</p>
    ${usageWhatIfField(it)}
    <div id="usage-body">${usageBody(id)}</div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Chiudi</button></div>`, true, 'usage');
}
function usageWhatIfField(it) {
  const campo = costField(it);
  if (!campo) return '';
  const attuale = Number(it[campo]) || 0;
  return `<div class="modal-field">
    <label>Simula un costo diverso (${cur()}/${esc(it.uom || 'U.M.')})</label>
    <input type="number" id="usage-whatif" min="0" step="0.0001" placeholder="${attuale.toFixed(4)}"
      oninput="debounced('whatif', usageRecalc)" autocomplete="off">
    <small style="color:var(--text-dim)">Il valore non viene salvato: serve solo a vedere l'effetto sulle macchine qui sotto.</small>
  </div>`;
}
// Ridisegna solo il corpo: la barra della simulazione resta com'è, altrimenti
// il campo perderebbe il focus a ogni cifra digitata.
function usageRecalc() {
  if (window.__usageItemId) renderInto('usage-body', () => usageBody(window.__usageItemId));
}
function usageBody(id) {
  const it = getItem(id); if (!it) return '';
  const diretti = directUses(id);
  const cime = impactedTops(id);
  const simula = costField(it) && val('usage-whatif') !== '';
  const nuovo = simula ? numVal('usage-whatif', 0) : null;

  if (!diretti.length) {
    return `<div class="empty-text">Questo articolo non è usato da nessuna parte: si può eliminare senza conseguenze.</div>`;
  }

  // Le quantità in colonna sono di **questo** articolo dentro i suoi padri: la
  // sua unità vale per tutte le righe e si dice una volta, in testa.
  const u = itemUom(it);
  const tabDiretti = `<div class="cat-group-title">Impieghi diretti (${diretti.length})</div>
    <table><thead><tr><th>Codice</th><th>Articolo</th><th>Tipo</th><th style="text-align:right">${labelUom('Q.tà', u)}</th><th></th></tr></thead>
    <tbody>${diretti.map(r => `<tr>
      <td style="font-family:var(--mono)">${codeLink(r.item.id, r.item.code)}</td>
      <td>${esc(r.item.name)}</td>
      <td><span class="bom-type-tag tt-${r.item.type}">${typeShort(r.item.type)}</span> ${typeLabel(r.item.type)}</td>
      <td style="text-align:right;font-family:var(--mono)">${fmtQty(r.qty)}</td>
      <td style="text-align:right"><button class="mini-btn" title="Apri qui" onclick="usageModal('${r.item.id}')">🔗</button></td>
    </tr>`).join('')}</tbody></table>`;

  if (!cime.length) return tabDiretti;

  const etichettaCime = cime.some(c => c.item.type === 'macchina') ? 'Macchine impattate' : 'Assiemi di testa impattati';
  const colonneSim = simula ? '<th style="text-align:right">Costo simulato</th><th style="text-align:right">Differenza</th>' : '';
  // Un solo withTempCost per tutte le cime: entra e esce dalla simulazione una
  // volta, non una per riga — ogni giro azzerava le cache globali due volte e
  // rifaceva ogni rollup da zero, a ogni carattere digitato nel campo.
  const costiDopo = simula ? withTempCost(it, nuovo, () => cime.map(c => costOf(c.item.id).total)) : null;
  const righe = cime.map((c, i) => {
    const costoOra = costOf(c.item.id).total;
    const prezzoOra = sellingPrice(c.item.id);
    // Costi e prezzi qui sono di una unità della **cima** impattata, che ha la
    // sua unità e non quella dell'articolo simulato.
    const uc = itemUom(c.item);
    let celleSim = '';
    if (simula) {
      const costoDopo = costiDopo[i];
      const delta = costoDopo - costoOra;
      const segno = delta > 0 ? '+' : '';
      const colore = Math.abs(delta) < 0.005 ? 'var(--text-dim)' : (delta > 0 ? 'var(--red)' : 'var(--green)');
      celleSim = `<td style="text-align:right;font-family:var(--mono)">${fmtPer(costoDopo, uc)}</td>
        <td style="text-align:right;font-family:var(--mono);color:${colore}">${segno}${fmtPer(delta, uc)}</td>`;
    }
    return `<tr>
      <td style="font-family:var(--mono)">${codeLink(c.item.id, c.item.code)}</td>
      <td>${esc(c.item.name)}</td>
      <td style="text-align:right;font-family:var(--mono)">${fmtQty(c.qty)}</td>
      <td style="text-align:right;font-family:var(--mono)">${fmtPer(costoOra, uc)}</td>
      <td style="text-align:right;font-family:var(--mono)">${fmtPer(prezzoOra, uc)}</td>
      ${celleSim}</tr>`;
  }).join('');

  return `${tabDiretti}
    <div class="cat-group-title">${etichettaCime} (${cime.length})</div>
    <table><thead><tr><th>Codice</th><th>Articolo</th>
      <th style="text-align:right">${labelUom('Q.tà impiegata', u)}</th><th style="text-align:right">Costo attuale</th>
      <th style="text-align:right">Prezzo vendita</th>${colonneSim}</tr></thead>
    <tbody>${righe}</tbody></table>
    <p style="color:var(--text-dim);font-size:12px;margin-top:10px">La quantità è quella necessaria per una unità dell'assieme di testa, scarto compreso.</p>`;
}

// ═══════════════════════════════════════════════════════════
//  VISTE: ANAGRAFICHE ARTICOLI (Acquisti / Progetto)
// ═══════════════════════════════════════════════════════════
function onCatTypeChange(scope) {
  updateCatFamilyFilters(scope);
  catalogFilterChange(scope);
}
function onCatFamilyChange(scope) {
  updateCatFamilyFilters(scope);
  catalogFilterChange(scope);
}
// Ridisegna la vista di anagrafica attiva (le due condividono le funzioni di render)
function renderCatalogs() {
  if (activeView === 'buy' || activeView === 'design') renderCatalog(activeView);
  // I costi mostrati nei cicli vengono dalle stesse anagrafiche: cambiando un
  // articolo la vista aperta deve rifare i conti.
  else if (activeView === 'cycles') renderCycles();
  // Il Magazzino elenca gli stessi articoli: una rettifica di giacenza registrata
  // da lì deve aggiornare la riga senza far cambiare pagina a chi la sta facendo.
  else if (activeView === 'stock') renderStock();
}
// Allinea i filtri famiglia/sottofamiglia al tipo selezionato, preservando le selezioni compatibili
function updateCatFamilyFilters(scope) {
  syncFamilyFilters(CATALOG_SCOPES[scope].pfx, CATALOG_SCOPES[scope].types);
}
// Il corpo vero, su prefisso e tipi anziché su uno scope di anagrafica: la vista
// Magazzino ha la stessa barra di filtri ma non è una delle due anagrafiche, e
// due copie della stessa logica si sarebbero disallineate alla prima modifica.
function syncFamilyFilters(pfx, types) {
  const famSel = document.getElementById(pfx + '-family');
  const subSel = document.getElementById(pfx + '-subfamily');
  const ft = document.getElementById(pfx + '-type').value;
  // Senza tipo selezionato valgono le famiglie di tutti i tipi in elenco che ne usano
  const kinds = (ft ? [ft] : types).filter(usesFamily);
  const famApplies = !!kinds.length; // gli assiemi non hanno famiglia
  famSel.disabled = !famApplies; subSel.disabled = !famApplies;
  const fams = (db.families || []).filter(f => kinds.includes(f.kind || 'acquistato'));
  const keepFam = fams.some(f => f.id === famSel.value) ? famSel.value : '';
  famSel.innerHTML = `<option value="">Tutte le famiglie</option>` +
    fams.map(f => `<option value="${f.id}" ${f.id === keepFam ? 'selected' : ''}>${esc(f.name)}</option>`).join('');
  const f = getFamily(keepFam);
  const subs = (f && f.subs) || [];
  const keepSub = subs.some(s => s.id === subSel.value) ? subSel.value : '';
  subSel.innerHTML = `<option value="">Tutte le sottofamiglie</option>` +
    subs.map(s => `<option value="${s.id}" ${s.id === keepSub ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
}
// Preferiti: solo su ciò che si acquista, per ritrovare in fretta gli articoli ricorrenti
function canFavorite(type) { return type === 'acquistato' || type === 'materiale'; }
function toggleFavorite(id) {
  if (!roleGuard('catalog')) return;
  const it = getItem(id); if (!it) return;
  it.favorite = !it.favorite;
  touch(it); saveDB(); renderCatalogs();
}
function toggleFavFilter() {
  favOnly = !favOnly;
  const b = document.getElementById('buy-fav');
  if (b) b.classList.toggle('active', favOnly);
  catalogFilterChange('buy');
}
// Badge preferito/obsoleto, mostrati in ogni selezione dell'articolo (righe picker).
function itemBadges(i) {
  if (!i) return '';
  return (i.favorite ? ' <span class="pick-fav" title="Preferito">★</span>' : '')
    + (i.obsolete ? ' <span class="obs-mark" title="Articolo obsoleto">⛔</span>' : '');
}
// Variante testuale per i menu a tendina (<option> non ammette HTML).
function itemBadgesTxt(i) {
  if (!i) return '';
  return (i.favorite ? '★ ' : '') + (i.obsolete ? '⛔ ' : '');
}
// Costo di una unità, nella U.M. di gestione dell'articolo: calcolato per ciò
// che si produce, letto dal listino per ciò che si compra.
function itemUnitCost(i) {
  if (!i) return 0;
  if (isAssembly(i.type) || i.type === 'parte') return costOf(i.id).total;
  return i.type === 'acquistato' ? (i.purchasePrice || 0) : (i.unitCost || 0);
}
// La colonna «Dettaglio»: cosa c'è da sapere su quell'articolo in una riga
// sola, e cambia con il tipo. Estratta dalla riga perché la usa anche l'export.
function catalogMeta(i) {
  let meta = '';
  if (i.type === 'acquistato') { const s = getSupplier(i.supplierId); meta = s ? s.name : '—'; }
  else if (i.type === 'materiale' && priceRows(i).length) meta = '';
  else if (isAssembly(i.type)) meta = (i.components || []).length + ' comp. / ' + (i.operations || []).length + ' lav.';
  else if (i.type === 'parte') {
    // Una parte comprata si riconosce dal fornitore, non dal suo ciclo
    meta = partSourcing(i) === 'buy'
      ? (supplierName(i.supplierId) || 'da acquistare')
      : ((i.cycle || []).length ? cycleCountLabel(i) : '—');
  }
  else meta = '—';
  // Più quotazioni a listino: si segnala qui, è il posto dove si confrontano i costi
  const quot = hasPriceList(i) ? priceRows(i).length : 0;
  if (quot > 1) meta = (meta && meta !== '—' ? meta + ' · ' : '') + quot + ' quotazioni';
  else if (!meta) meta = '—';
  return meta;
}
function catalogRow(i) {
  const unit = itemUnitCost(i);
  const meta = catalogMeta(i);
  // Indicatori a sinistra, di sola visione (i flag si impostano nella scheda articolo)
  const flags = `${i.favorite ? '<span class="pick-fav" title="Preferito">★</span>' : ''}${i.obsolete ? '<span class="obs-mark" title="Obsoleto">⛔</span>' : ''}`
    + (i.type === 'parte' && partSourcing(i) === 'buy' ? '<span class="buy-mark" title="Parte acquistata da fornitore">🛒</span>' : '');
  return `<tr class="${i.obsolete ? 'row-obsolete' : ''}">
    <td style="width:1%;white-space:nowrap">${flags}</td>
    <td style="font-family:var(--mono)">${codeLink(i.id, i.code)}</td>
    <td>${esc(i.name)}</td>
    <td><span class="bom-type-tag tt-${i.type}">${typeShort(i.type)}</span> ${typeLabel(i.type)}</td>
    <td style="color:var(--text-dim)">${esc(codingLabel(i) || familyLabel(i))}</td>
    <td>${esc(i.uom || '')}</td>
    <td style="font-family:var(--mono)">${fmtN(unit)}</td>
    <td style="color:var(--text-dim)">${esc(meta)}</td>
    <td style="text-align:right;white-space:nowrap">
      ${hasPriceList(i) ? `<button class="mini-btn" title="Listino fornitori e storico prezzi" onclick="priceListModal('${i.id}')">💶</button>` : ''}
      ${i.type === 'parte' ? `<button class="mini-btn" title="Distinta parte e ciclo di lavorazione" onclick="openCycleFor('${i.id}')">🔧</button>` : ''}
      <button class="mini-btn" title="Dove è usato e impatto costi" onclick="usageModal('${i.id}')">🔗</button>
      <button class="mini-btn" onclick="editItemModal('${i.id}')">✏</button>
      <button class="mini-btn" title="Duplica" onclick="duplicateItemModal('${i.id}')">📋</button>
      <button class="mini-btn danger" onclick="delItem('${i.id}')">🗑</button>
    </td></tr>`;
}
// ─── Quante righe disegnare per volta ───
// Il catalogo costruisce l'HTML di tutti gli articoli filtrati in una stringa
// sola: oltre qualche centinaio di righe il ridisegno si vede. Si mostra un
// blocco per volta, con i pulsanti per allargare. Il limite riparte da capo a
// ogni cambio di filtro: chi filtra vuole vedere l'inizio del nuovo risultato.
const CATALOG_PAGE = 200;
const catalogLimit = { buy: CATALOG_PAGE, design: CATALOG_PAGE };
function catalogShowMore(scope) { catalogLimit[scope] += CATALOG_PAGE; renderCatalog(scope); }
function catalogShowAll(scope) { catalogLimit[scope] = Infinity; renderCatalog(scope); }
// Punto d'ingresso di tutti i filtri: azzera il limite e ridisegna.
function catalogFilterChange(scope) {
  catalogLimit[scope] = CATALOG_PAGE;
  renderCatalog(scope);
}
// Ricerca testuale: stesso effetto, ma dopo la pausa di digitazione.
function catalogSearchInput(scope) {
  debounced('cat-' + scope, () => catalogFilterChange(scope));
}
// ─── Raggruppamento delle righe ───
// Commerciali, materie prime e parti per macrofamiglia; gli altri tipi per
// categoria. Restituisce i gruppi e le loro chiavi già in ordine di
// visualizzazione. Lo usano l'anagrafica e il magazzino: la stessa lista di
// articoli deve raggrupparsi allo stesso modo ovunque la si guardi.
function catalogGroups(rows) {
  const GROUP_LABELS = { materiale: 'Materie prime', parte: 'Parti', sottogruppo: 'Sottogruppi', gruppo: 'Gruppi', macchina: 'Macchine' };
  const ORDER = { acquistato: 0, materiale: 1, parte: 2, sottogruppo: 3, gruppo: 4, macchina: 5 };
  const NO_FAMILY_LABELS = { acquistato: 'Commerciali senza famiglia', materiale: 'Materie prime senza famiglia', parte: 'Parti senza famiglia' };
  const groupKey = (i) => usesFamily(i.type)
    ? (i.familyId ? familyName(i.familyId) : NO_FAMILY_LABELS[i.type])
    : GROUP_LABELS[i.type];
  const order = (i) => ORDER[i.type] != null ? ORDER[i.type] : 9;
  const groups = {};
  rows.forEach(i => { const k = groupKey(i); (groups[k] = groups[k] || { items: [], ord: order(i) }).items.push(i); });
  const keys = Object.keys(groups).sort((a, b) => groups[a].ord - groups[b].ord || a.localeCompare(b));
  return { groups, keys };
}
// Gli articoli che la vista mostra, filtrati e ordinati. Come per il magazzino
// sta fuori dal disegno: l'export deve dare esattamente queste righe, e un
// filtro scritto due volte prima o poi dice due cose diverse.
function catalogFilteredRows(scope) {
  const sc = CATALOG_SCOPES[scope]; if (!sc) return [];
  const leggi = k => (document.getElementById(sc.pfx + '-' + k) || {}).value || '';
  const q = leggi('search').toLowerCase();
  const ft = leggi('type'), ff = leggi('family'), fsf = leggi('subfamily');
  let rows = db.items.filter(i => sc.types.includes(i.type));
  if (ft) rows = rows.filter(i => i.type === ft);
  if (scope === 'buy' && favOnly) rows = rows.filter(i => i.favorite);
  if (ff) rows = rows.filter(i => usesFamily(i.type) && i.familyId === ff);
  if (fsf) rows = rows.filter(i => i.subFamilyId === fsf);
  if (q) rows = rows.filter(i => (i.code + ' ' + i.name).toLowerCase().includes(q));
  return rows.sort((a, b) => (a.code || '').localeCompare(b.code || ''));
}
function renderCatalog(scope) {
  invalidateCaches();
  const sc = CATALOG_SCOPES[scope]; if (!sc) return;
  updateCatFamilyFilters(scope);
  const pfx = sc.pfx;
  const rows = catalogFilteredRows(scope);

  const { groups, keys } = catalogGroups(rows);

  // «Costo un.» è per una unità dell'articolo, cioè nella U.M. della colonna
  // accanto: si dice in intestazione, una volta, invece che su ogni riga.
  const head = `<thead><tr><th></th><th>Codice</th><th>Nome</th><th>Tipo</th><th>Famiglia</th><th>U.M.</th>
    <th title="Costo di una unità, nella U.M. della colonna accanto">Costo un. (${esc(cur())}/U.M.)</th><th>Dettaglio</th><th></th></tr></thead>`;
  // Si riempiono i gruppi nell'ordine di visualizzazione finché c'è spazio.
  // Il titolo dice sempre quanti articoli contiene il gruppo per intero, anche
  // quando ne sono disegnati solo i primi: il conteggio non deve mentire.
  let restanti = catalogLimit[scope];
  let disegnati = 0;
  const html = keys.map(k => {
    const tutti = groups[k].items;
    const visibili = tutti.slice(0, Math.max(0, restanti));
    restanti -= visibili.length;
    disegnati += visibili.length;
    if (!visibili.length) return '';
    const conteggio = visibili.length < tutti.length ? `${visibili.length} di ${tutti.length}` : `${tutti.length}`;
    return `<div class="cat-group-title">${esc(k)} <span style="color:var(--text-dim);font-weight:500">(${conteggio})</span></div>
      <table>${head}<tbody>${visibili.map(catalogRow).join('')}</tbody></table>`;
  }).join('');
  const mancanti = rows.length - disegnati;
  const piu = mancanti > 0 ? `<div class="cat-more">
      <span>Mostrati ${disegnati} di ${rows.length} articoli</span>
      <button class="btn-outline" onclick="catalogShowMore('${scope}')">Mostra altri ${Math.min(CATALOG_PAGE, mancanti)}</button>
      <button class="btn-outline" onclick="catalogShowAll('${scope}')">Mostra tutti</button>
    </div>` : '';
  const tabella = document.getElementById(pfx + '-table');
  tabella.innerHTML = rows.length ? html + piu : '<div class="empty-text">Nessun articolo trovato.</div>';
  a11yFields(tabella);
}
// ─── Export dell'anagrafica ───
// È l'elenco che si sta guardando, non il template d'import: quello resta
// `exportCatalogXlsx` in Gestione, con tutte le colonne e i fogli di contorno.
// Sono due cose diverse e vanno tenute diverse — chi esporta da qui vuole le
// righe che ha davanti, non un file da ricaricare.
function catalogExportSpec(scope) {
  const sc = CATALOG_SCOPES[scope] || CATALOG_SCOPES.buy;
  const leggi = k => (document.getElementById(sc.pfx + '-' + k) || {}).value || '';
  const fam = getFamily(leggi('family'));
  const sub = (fam && (fam.subs || []).find(s => s.id === leggi('subfamily'))) || null;
  const righe = catalogFilteredRows(scope).map(i => [
    i.code || '', i.name || '', typeLabel(i.type), codingLabel(i) || familyLabel(i),
    i.uom || '', +(itemUnitCost(i) || 0).toFixed(4), catalogMeta(i),
  ]);
  return {
    titolo: scope === 'buy' ? 'Anagrafica — Commerciali e materie prime' : 'Anagrafica — Macchine, gruppi e parti',
    slug: scope === 'buy' ? 'anagrafica_acquisti' : 'anagrafica_progetto',
    filtri: [
      ['Ricerca', leggi('search')],
      ['Tipo', leggi('type') ? typeLabel(leggi('type')) : ''],
      ['Famiglia', fam ? fam.name : ''],
      ['Sottofamiglia', sub ? sub.name : ''],
      ['Preferiti', scope === 'buy' && favOnly ? 'solo i preferiti' : ''],
    ],
    sezioni: [{
      nome: scope === 'buy' ? 'Acquisti' : 'Progetto',
      colonne: [
        { h: 'Codice', w: 18 }, { h: 'Nome', w: 34 }, { h: 'Tipo', w: 16 }, { h: 'Famiglia', w: 24 },
        { h: 'U.M.', w: 8 },
        // La valuta sta in intestazione: nella cella romperebbe ogni formula.
        { h: `Costo unitario (${cur()}/U.M.)`, w: 18, num: true },
        { h: 'Dettaglio', w: 28 },
      ],
      righe,
    }],
  };
}
// Etichette del menu "Tipo" (l'elenco è ristretto ai tipi della vista di provenienza)
const TYPE_OPTION_LABELS = {
  acquistato: 'Componente commerciale', materiale: 'Materia prima', parte: 'Parte (lavorato)',
  sottogruppo: 'Sottogruppo', gruppo: 'Gruppo', macchina: 'Macchina',
};
// Riepilogo in sola lettura di fornitore e prezzo dentro la scheda articolo.
// Non sono campi: fornitore, prezzo, codice e descrizione presso il fornitore
// nascono tutti nel listino, e il listino è l'unico posto che li scrive. Con due
// porte sullo stesso dato lo storico dei prezzi resterebbe pieno di buchi.
function itemPricingSummary(it) {
  const apri = it
    ? `<button class="btn-outline" style="margin-left:8px" onclick="closeModal();priceListModal('${it.id}')">💶 Apri il listino</button>`
    : '';
  if (!it) return `<span class="empty-text" style="padding:0">Fornitore e prezzo si inseriscono nel <strong>listino fornitori</strong>, che si apre da solo appena l'articolo è creato.</span>`;
  const campo = costField(it);
  const riga = activePriceRow(it);
  const n = priceRows(it).length;
  const prezzo = campo
    ? `<strong style="font-family:var(--mono)">${fmtPer(Number(it[campo]) || 0, itemUom(it) || 'U.M.')}</strong>`
    : '<em>derivato dal ciclo di lavorazione</em>';
  const forn = riga && riga.supplierId
    ? esc(supplierName(riga.supplierId) || '—')
    : (it.supplierId ? esc(supplierName(it.supplierId) || '—') : '<span style="color:var(--text-dim)">nessun fornitore</span>');
  // Dalla quotazione in uso, non dalla copia sull'articolo: un posto solo.
  const rif = riga ? [riga.code, riga.desc].filter(Boolean).map(esc).join(' · ') : '';
  return `<span class="empty-text" style="padding:0">
    ${prezzo} · ${forn}${rif ? ' · ' + rif : ''}<br>
    ${n ? `${n} ${n === 1 ? 'quotazione a listino' : 'quotazioni a listino'}${riga ? '' : ' — nessuna in uso'}` : 'Nessuna quotazione a listino'}${apri}</span>`;
}
function itemModalBody(it, scope) {
  const sc = CATALOG_SCOPES[scope] || CATALOG_SCOPES.buy;
  const t = it ? it.type : sc.types[0];
  const sourcePicker = it ? '' : `
    <div class="modal-field"><label>Parti da (opzionale)</label>
      <input type="text" id="src-search" class="search" placeholder="🔍 Duplica da un articolo esistente..." oninput="debounced('src', renderSourceResults)" autocomplete="off">
      <div id="src-results" class="picker-results"></div>
    </div>`;
  // In modifica il tipo è bloccato: resta l'unica voce dell'articolo, qualunque sia lo scope
  const types = it ? [it.type] : sc.types;
  return `${sourcePicker}
    <div class="modal-grid">
      <div class="modal-field"><label>Tipo</label>
        <select id="it-type" onchange="toggleItemFields()" ${it ? 'disabled' : ''}>
          ${types.map(x => `<option value="${x}" ${t === x ? 'selected' : ''}>${TYPE_OPTION_LABELS[x]}</option>`).join('')}
        </select>
      </div>
      <div class="modal-field"><label>Codice</label><input id="it-code" value="${it ? esc(it.code) : ''}" oninput="markCodeManual()"></div>
    </div>
    <div class="modal-field" id="fld-name-std"><label>Nome</label><input id="it-name" value="${it ? esc(it.name) : ''}"></div>
    <div class="modal-grid" id="fld-name-parte">
      <div class="modal-field"><label>Concetto</label>
        <select id="it-concept" onchange="updatePartNamePreview()">${conceptOptions(it ? it.conceptId : '')}</select></div>
      <div class="modal-field"><label>Descrizione</label>
        <input id="it-namefree" value="${it ? esc(it.nameFree != null ? it.nameFree : it.name) : ''}" oninput="updatePartNamePreview()"></div>
      <div class="modal-field" style="grid-column:1/-1;margin-top:-4px">
        <span class="empty-text" style="padding:0">Nome: <strong id="part-name-preview"></strong></span></div>
    </div>
    <div class="modal-grid">
      <div class="modal-field"><label>Unità di misura</label><select id="it-uom" onchange="itemUomLabelsRefresh()">${uomOptions(it ? (it.uom || defaultUom()) : defaultUom())}</select></div>
      <div class="modal-field" id="fld-sourcing"><label>Approvvigionamento</label>
        <select id="it-sourcing">${partSourcingOptions(it ? partSourcing(it) : defaultPartSourcing())}</select></div>
      <div class="modal-field" id="fld-assembly-note" style="grid-column:1/-1"><label>Composizione</label><span class="empty-text" style="padding:0">La distinta (componenti e lavorazioni) si gestisce in <strong>Distinta base → Gestione DB</strong>.</span></div>
    </div>
    <div class="modal-field" id="fld-pricing">
      <label>Fornitore e prezzo d'acquisto</label>
      ${itemPricingSummary(it)}
    </div>
    <div class="modal-grid" id="fld-family">
      <div class="modal-field"><label>Macrofamiglia</label><select id="it-family" onchange="onItemFamilyChange()">${familyOptions(it ? it.familyId : '', usesFamily(t) ? t : '')}</select></div>
      <div class="modal-field"><label>Sottofamiglia</label><select id="it-subfamily" onchange="onItemSubFamilyChange()">${subFamilyOptions(it ? it.familyId : '', it ? it.subFamilyId : '')}</select></div>
    </div>
    ${codingFieldsHtml(it)}
    <div class="modal-field" id="fld-cycle">
      <label>Distinta parte e ciclo di lavorazione</label>
      <span class="empty-text" style="padding:0">${it
        ? `${cycleCountLabel(it)} — si gestiscono nella vista <strong>🔧 Cicli di lavorazione</strong>.
           <button class="btn-outline" style="margin-left:8px" onclick="closeModal();openCycleFor('${it.id}')">🔧 Apri il ciclo</button>`
        : 'Si gestiscono nella vista <strong>🔧 Cicli di lavorazione</strong>, dopo aver creato l\'articolo.'}</span>
    </div>
    <div class="modal-grid" id="fld-flags">
      <div class="modal-field" id="fld-flag-fav"><label>Preferito</label>
        <label class="flag-check"><input type="checkbox" id="it-favorite" ${it && it.favorite ? 'checked' : ''}> ★ Segna come preferito</label></div>
      <div class="modal-field" id="fld-flag-obs"><label>Obsoleto</label>
        <label class="flag-check"><input type="checkbox" id="it-obsolete" ${it && it.obsolete ? 'checked' : ''}> ⛔ Articolo obsoleto (non più utilizzabile)</label></div>
    </div>
    <div class="modal-grid" id="fld-altuom">
      <div class="modal-field"><label>U.M. d'acquisto (se diversa)</label>
        <select id="it-altuom" onchange="itemUomLabelsRefresh()">${uomOptions(it ? (it.altUom || '') : '')}</select></div>
      <div class="modal-field"><label id="it-altfactor-label">${altFactorLabel(it ? (it.altUom || '') : '', it ? (it.uom || defaultUom()) : defaultUom())}</label>
        <input type="number" id="it-altfactor" min="0" step="any" value="${it && it.altFactor != null ? it.altFactor : ''}" placeholder="es. 8"></div>
      <div class="modal-field" style="grid-column:1/-1"><span class="empty-text" style="padding:0">Da usare quando il fornitore quota in un'unità diversa da quella con cui l'articolo si gestisce e si mette in distinta. Il fattore dice <strong>quante unità d'acquisto stanno in una di gestione</strong>: una barra gestita in <span style="font-family:var(--mono)">m</span> che pesa 8 kg al metro ha U.M. d'acquisto <span style="font-family:var(--mono)">kg</span> e fattore <span style="font-family:var(--mono)">8</span>.<br>Serve a non sbagliare il costo: senza, un prezzo a chilo finirebbe nella costificazione come se fosse al metro. Lasciare vuoto se le due unità coincidono.</span></div>
    </div>
    <div class="modal-grid" id="fld-stock">
      <div class="modal-field"><label id="it-safety-label">${labelUom('Scorta minima', it ? (it.uom || defaultUom()) : defaultUom())}</label>
        <input type="number" id="it-safety" min="0" step="any" value="${it && it.safetyStock != null ? it.safetyStock : ''}" placeholder="0"></div>
      <div class="modal-field"><label id="it-lot-label">${labelUom('Lotto di riordino', it ? (it.uom || defaultUom()) : defaultUom())}</label>
        <input type="number" id="it-lot" min="0" step="any" value="${it && it.lotSize != null ? it.lotSize : ''}" placeholder="nessuno"></div>
      <div class="modal-field" style="grid-column:1/-1"><span class="empty-text" style="padding:0">La <strong>scorta minima</strong> è la quantità che il fabbisogno netto vuole lasciare a magazzino dopo aver coperto il piano. Il <strong>lotto di riordino</strong> arrotonda per eccesso quanto si compra: vuoto = nessun arrotondamento.</span></div>
    </div>
    ${it ? stockPanelHtml(it) : ''}
    <div class="modal-field"><label>Note</label><textarea id="it-notes" rows="2">${it ? esc(it.notes || '') : ''}</textarea></div>
    ${stampLine(it)}`;
}
// ─── Le etichette che seguono l'unità di misura ───
// Scorta minima e lotto di riordino sono quantità dell'articolo, e il fattore di
// conversione è un rapporto fra due unità: scriverli senza unità lascia decidere
// a chi compila, che tira a indovinare e sbaglia di un fattore. L'unità però si
// sceglie **dentro lo stesso form**, qualche riga più su, quindi le etichette la
// inseguono a ogni cambio invece di essere fissate al primo disegno.
function altFactorLabel(altUom, uom) {
  return altUom && altUom !== uom
    ? `Fattore di conversione (${esc(altUom)} in 1 ${esc(uom || 'U.M.')})`
    : 'Fattore di conversione';
}
function itemUomLabelsRefresh() {
  const u = val('it-uom') || defaultUom();
  const set = (id, testo) => { const el = document.getElementById(id); if (el) el.textContent = testo; };
  // textContent: l'unità arriva da un <select> di codici già validati, e passarla
  // come testo evita di doverla riescapare a mano.
  set('it-safety-label', `Scorta minima${u ? ' (' + u + ')' : ''}`);
  set('it-lot-label', `Lotto di riordino${u ? ' (' + u + ')' : ''}`);
  const alt = val('it-altuom');
  set('it-altfactor-label', alt && alt !== u ? `Fattore di conversione (${alt} in 1 ${u || 'U.M.'})` : 'Fattore di conversione');
}

// ─── Campi di codifica (macchina › gruppo) nella modale articolo ───
function machineOptions(selectedId) {
  return `<option value="">—</option>` + machineItems()
    .map(m => `<option value="${m.id}" ${m.id === selectedId ? 'selected' : ''}>${esc((m.sigla ? m.sigla + ' — ' : '') + m.name)}</option>`).join('');
}
function groupOptions(machineId, selectedId) {
  return `<option value="">—</option>` + groupItemsFor(machineId)
    .map(g => `<option value="${g.id}" ${g.id === selectedId ? 'selected' : ''}>${esc((g.sigla ? g.sigla + ' — ' : '') + g.name)}</option>`).join('');
}
function codingFieldsHtml(it) {
  const sm = machineScheme(it);
  const macId = it ? (it.machineItemId || '') : '';
  const grpId = it ? (it.groupItemId || '') : '';
  const gsm = machineScheme(getItem(macId));
  return `
    <div id="fld-coding-mac" class="modal-grid">
      <div class="modal-field"><label>Sigla macchina</label>
        <input id="it-sigla-mac" maxlength="10" value="${it ? esc(it.sigla || '') : ''}" placeholder="es. TRN"
          style="text-transform:uppercase;font-family:var(--mono);font-weight:700"
          oninput="this.value=this.value.toUpperCase();refreshItemCode()"></div>
      <div class="modal-field"><label>N° car. sigla gruppo</label>
        <input type="number" id="it-glen" min="1" max="10" value="${sm.gLen}" onchange="refreshItemCode()"></div>
      <div class="modal-field"><label>Tipo car. sigla gruppo</label>
        <select id="it-gtype" onchange="refreshItemCode()">${typeOptionsHtml(sm.gType)}</select></div>
      <div class="modal-field"><label>Cifre progressivo S## </label>
        <input type="number" id="it-incrs" min="1" max="6" value="${sm.incrS}" onchange="refreshItemCode()"></div>
      <div class="modal-field"><label>Cifre numerazione ###</label>
        <input type="number" id="it-incrn" min="1" max="6" value="${sm.incrN}" onchange="refreshItemCode()"></div>
    </div>
    <div id="fld-coding-child" class="modal-grid">
      <div class="modal-field"><label>Macchina</label>
        <select id="it-machine" onchange="onItemMachineChange()">${machineOptions(macId)}</select></div>
      <div class="modal-field" id="fld-coding-gsigla"><label id="it-sigla-grp-label">Sigla gruppo (${typeHint(gsm.gLen, gsm.gType)})</label>
        <input id="it-sigla-grp" maxlength="${gsm.gLen}" value="${it && it.type === 'gruppo' ? esc(it.sigla || '') : ''}" placeholder="es. BAS"
          style="text-transform:uppercase;font-family:var(--mono);font-weight:700"
          oninput="this.value=this.value.toUpperCase();refreshItemCode()"></div>
      <div class="modal-field" id="fld-coding-group"><label>Gruppo</label>
        <select id="it-group" onchange="refreshItemCode()">${groupOptions(macId, grpId)}</select></div>
    </div>`;
}
function onItemMachineChange() {
  const macId = val('it-machine');
  const gsm = machineScheme(getItem(macId));
  const lbl = document.getElementById('it-sigla-grp-label');
  const inp = document.getElementById('it-sigla-grp');
  if (lbl) lbl.textContent = `Sigla gruppo (${typeHint(gsm.gLen, gsm.gType)})`;
  if (inp) inp.maxLength = gsm.gLen;
  const grpSel = document.getElementById('it-group');
  if (grpSel) grpSel.innerHTML = groupOptions(macId, '');
  refreshItemCode();
}
// Bozza dell'articolo con i soli campi che determinano il codice automatico
function itemDraftFromForm() {
  const t = val('it-type');
  const draft = { id: window.__editingItemId || null, type: t, familyId: val('it-family'), subFamilyId: val('it-subfamily') };
  if (t === 'macchina') {
    draft.sigla = val('it-sigla-mac');
    draft.gCodeLen = parseInt(val('it-glen'), 10) || 3;
    draft.gCodeType = val('it-gtype') || 'alpha';
    draft.incrDigitsS = parseInt(val('it-incrs'), 10) || 2;
    draft.incrDigitsN = parseInt(val('it-incrn'), 10) || 3;
  } else if (t === 'gruppo') {
    draft.machineItemId = val('it-machine');
    draft.sigla = val('it-sigla-grp');
  } else if (t === 'sottogruppo' || t === 'parte') {
    draft.machineItemId = val('it-machine');
    draft.groupItemId = val('it-group');
  }
  return draft;
}
// Stato: true finché il codice è ancora "automatico" (non modificato a mano dall'utente)
let itemCodeAuto = true;
function markCodeManual() { itemCodeAuto = false; }
function refreshItemCode() {
  if (!itemCodeAuto) return;
  const codeEl = document.getElementById('it-code');
  if (!codeEl) return;
  codeEl.value = genItemCode(itemDraftFromForm());
}
// Anteprima del nome composto (concetto + descrizione) nella modale parte
function updatePartNamePreview() {
  const el = document.getElementById('part-name-preview');
  if (el) el.textContent = composePartName(val('it-concept'), val('it-namefree')) || '—';
}
function toggleItemFields() {
  const t = document.getElementById('it-type').value;
  // Nome: campo libero singolo per tutti i tipi tranne "parte", che usa concetto + descrizione
  document.getElementById('fld-name-std').style.display = t === 'parte' ? 'none' : '';
  document.getElementById('fld-name-parte').style.display = t === 'parte' ? '' : 'none';
  if (t === 'parte') updatePartNamePreview();
  // Prezzo e fornitore: riepilogo in sola lettura, si modificano solo dal listino
  document.getElementById('fld-pricing').style.display = hasPriceList({ type: t }) ? '' : 'none';
  document.getElementById('fld-sourcing').style.display = t === 'parte' ? '' : 'none';
  const showFam = usesFamily(t);
  document.getElementById('fld-family').style.display = showFam ? '' : 'none';
  document.getElementById('fld-assembly-note').style.display = isAssembly(t) ? '' : 'none';
  document.getElementById('fld-cycle').style.display = t === 'parte' ? '' : 'none';
  // Flag: preferito su commerciali e materie prime, obsoleto anche sulle parti
  const showObs = t === 'acquistato' || t === 'materiale' || t === 'parte';
  document.getElementById('fld-flag-fav').style.display = canFavorite(t) ? '' : 'none';
  document.getElementById('fld-flag-obs').style.display = showObs ? '' : 'none';
  document.getElementById('fld-flags').style.display = showObs ? '' : 'none';
  // Magazzino: solo su ciò che si tiene a scorta. Un assieme si produce, e la
  // sua giacenza sarebbe quella dei componenti contata due volte.
  const stock = document.getElementById('fld-stock');
  if (stock) stock.style.display = hasStock({ type: t }) ? '' : 'none';
  // Doppia unità: solo dove esiste un listino, perché è il prezzo del fornitore
  // che può essere espresso in un'altra unità.
  const alt = document.getElementById('fld-altuom');
  if (alt) alt.style.display = hasPriceList({ type: t }) ? '' : 'none';
  // Codifica gerarchica: schema per la macchina, appartenenza per gli altri tipi
  const isChild = t === 'gruppo' || t === 'sottogruppo' || t === 'parte';
  document.getElementById('fld-coding-mac').style.display = t === 'macchina' ? '' : 'none';
  document.getElementById('fld-coding-child').style.display = isChild ? '' : 'none';
  document.getElementById('fld-coding-gsigla').style.display = t === 'gruppo' ? '' : 'none';
  document.getElementById('fld-coding-group').style.display = (t === 'sottogruppo' || t === 'parte') ? '' : 'none';
  if (showFam) {
    // Ripopola le famiglie con quelle del tipo selezionato, preservando la selezione se compatibile
    const famSel = document.getElementById('it-family');
    const cur = famSel.value;
    famSel.innerHTML = familyOptions(cur, t);
    if (famSel.value !== cur) document.getElementById('it-subfamily').innerHTML = subFamilyOptions('', '');
  }
  refreshItemCode();
}
function onItemFamilyChange() {
  document.getElementById('it-subfamily').innerHTML = subFamilyOptions(val('it-family'), '');
  refreshItemCode();
}
function onItemSubFamilyChange() { refreshItemCode(); }

// ═══════════════════════════════════════════════════════════
//  VISTA: CICLI DI LAVORAZIONE (distinta parte + fasi)
// ═══════════════════════════════════════════════════════════
// Distinta parte e ciclo sono due sezioni della STESSA lista `it.cycle`: le
// righe kind:'item' sono gli articoli necessari, le kind:'op' le lavorazioni.
// Un array solo significa nessuna conversione dei dati e motore di costo,
// albero di distinta, report ed export che continuano a leggere ciò che
// leggevano prima. Le funzioni che modificano una riga usano sempre il suo
// indice ASSOLUTO nell'array: quello di sezione servirebbe solo a sbagliare.
// Nessuna bozza: qui si è in una vista, non in un form, e ogni azione salva
// subito come nella vista della distinta.

// Sposta di una posizione la k-esima riga di un certo kind, scambiandola con la
// riga vicina dello STESSO kind: tutte le altre restano dove sono. Logica pura
// (è l'unico punto con aritmetica sugli indici): ritorna un nuovo array, o
// quello ricevuto se lo spostamento non è possibile.
function moveKindRow(rows, kind, k, dir) {
  const list = Array.isArray(rows) ? rows : [];
  const pos = [];
  list.forEach((r, i) => { if (r && r.kind === kind) pos.push(i); });
  const to = k + (dir < 0 ? -1 : 1);
  if (k < 0 || k >= pos.length || to < 0 || to >= pos.length) return rows;
  const out = list.slice();
  const a = pos[k], b = pos[to];
  const tmp = out[a]; out[a] = out[b]; out[b] = tmp;
  return out;
}
// Numero di fase mostrato accanto a una lavorazione: 10, 20, 30… Deriva
// dall'ordine e non si salva, così non c'è una numerazione da tenere allineata.
function cyclePhaseNumber(k) { return (k + 1) * 10; }

// Riassunto testuale del contenuto, per il catalogo e la scheda articolo
function cycleCountLabel(it) {
  const rows = (it && it.cycle) || [];
  const art = rows.filter(r => r.kind !== 'op').length;
  const lav = rows.filter(r => r.kind === 'op').length;
  if (!art && !lav) return 'Distinta parte e ciclo vuoti';
  return `${art} ${art === 1 ? 'articolo' : 'articoli'} · ${lav} ${lav === 1 ? 'lavorazione' : 'lavorazioni'}`;
}
function cycleRowLabel(row) {
  if (row.kind === 'op') {
    const wc = getWorkCenter(row.workCenterId);
    // Nella tabella delle fasi il tipo è già dato dalla sezione: basta il centro di lavoro
    return `🔧 ${esc(wc ? wc.name : '?')}`;
  }
  const it = getItem(row.itemId);
  if (!it) return '⚠ articolo mancante';
  return `<span class="bom-type-tag tt-${it.type}">${typeShort(it.type)}</span>
    <span class="cycle-code">${codeLink(it.id, it.code)}</span> ${esc(it.name)}${itemBadges(it)}`;
}
// ─── Selezione della parte (filtri in cima alla vista) ───
function partItems() { return (db.items || []).filter(i => i.type === 'parte'); }
// Famiglie e sottofamiglie delle parti, con le selezioni preservate se ancora
// valide (stesso patto di updateCatFamilyFilters nelle anagrafiche).
function updateCycleFamilyFilters() {
  const famSel = document.getElementById('cyc-family');
  const subSel = document.getElementById('cyc-subfamily');
  if (!famSel || !subSel) return;
  const fams = (db.families || []).filter(f => (f.kind || 'acquistato') === 'parte');
  const keepFam = fams.some(f => f.id === famSel.value) ? famSel.value : '';
  famSel.innerHTML = `<option value="">Tutte le famiglie</option>` +
    fams.map(f => `<option value="${f.id}" ${f.id === keepFam ? 'selected' : ''}>${esc(f.name)}</option>`).join('');
  const subs = (getFamily(keepFam) || {}).subs || [];
  const keepSub = subs.some(s => s.id === subSel.value) ? subSel.value : '';
  subSel.innerHTML = `<option value="">Tutte le sottofamiglie</option>` +
    subs.map(s => `<option value="${s.id}" ${s.id === keepSub ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
}
function cycleFilteredParts() {
  const q = (val('cyc-search') || '').toLowerCase();
  const fam = val('cyc-family');
  const sub = val('cyc-subfamily');
  let rows = partItems();
  if (fam) rows = rows.filter(i => i.familyId === fam);
  if (sub) rows = rows.filter(i => i.subFamilyId === sub);
  if (q) rows = rows.filter(i => (i.code + ' ' + i.name).toLowerCase().includes(q));
  return rows.sort((a, b) => String(a.code).localeCompare(String(b.code)));
}
function cycleSearchInput() { debounced('cyc-sel', renderCycles); }
function onCycleFilterChange() { renderCycles(); }
function onCyclePartSelect() { currentCycleItemId = val('cyc-part'); renderCycles(); }
// La selezione resta valida finché la parte esiste ed è tra quelle filtrate,
// altrimenti si ricade sulla prima (stesso patto di ensureCurrentBom).
function ensureCurrentCycleItem(parts) {
  if (!parts.some(p => p.id === currentCycleItemId)) currentCycleItemId = parts.length ? parts[0].id : null;
}
// Apertura diretta su una parte, dal catalogo o dall'albero di distinta: i
// filtri si azzerano, altrimenti la parte appena scelta potrebbe non comparire.
function openCycleFor(id) {
  const it = getItem(id);
  if (!it || it.type !== 'parte') return;
  currentCycleItemId = id;
  setVal('cyc-search', ''); setVal('cyc-family', ''); setVal('cyc-subfamily', '');
  setView('cycles');
}
function currentCycleItem() {
  const it = getItem(currentCycleItemId);
  return it && it.type === 'parte' ? it : null;
}

// Da dove viene il costo di questa parte, detto qui perché è la vista in cui si
// costruisce il ciclo — e vedere le righe senza sapere se contano sarebbe
// fuorviante. La scelta si fa nella scheda articolo, non qui: un solo posto.
function cycleSourcingNote(it) {
  const apri = `<button class="mini-btn" style="margin-left:8px" onclick="editItemModal('${it.id}')">✏ Scheda articolo</button>`;
  if (partSourcing(it) === 'buy') {
    const forn = supplierName(it.supplierId);
    return `<div class="cycle-note">🛒 <strong>Parte acquistata</strong>${forn ? ' da ' + esc(forn) : ' (nessun fornitore a listino)'}:
      il costo è il prezzo scelto nel listino. Distinta e ciclo qui sotto restano documentali — non concorrono al costo e nel
      fabbisogno non vengono esplosi.${apri}</div>`;
  }
  const vuoto = !(it.cycle || []).length;
  return `<div class="cycle-note">🏭 <strong>Parte prodotta in casa</strong>: il costo lo determinano la distinta parte e il ciclo
    qui sotto.${vuoto ? ' Finché sono vuoti vale il prezzo a listino.' : ''}${apri}</div>`;
}

// ─── Disegno della vista ───
function renderCycles() {
  invalidateCaches();   // la cache dei costi vive dentro un singolo disegno
  updateCycleFamilyFilters();
  const parts = cycleFilteredParts();
  ensureCurrentCycleItem(parts);
  const partSel = document.getElementById('cyc-part');
  if (partSel) partSel.innerHTML = parts.length
    ? parts.map(p => `<option value="${p.id}" ${p.id === currentCycleItemId ? 'selected' : ''}>${esc(itemBadgesTxt(p) + p.code + ' — ' + p.name)}</option>`).join('')
    : `<option value="">— nessuna parte —</option>`;

  const body = document.getElementById('cyc-body');
  const it = currentCycleItem();
  renderCyclesRevBar();   // anche senza parte aperta: si svuota invece di restare com'era
  if (!it) {
    document.getElementById('cyc-summary').innerHTML = '';
    body.innerHTML = `<div class="empty-text">${partItems().length
      ? 'Nessuna parte con questi filtri.'
      : 'Nessuna parte a catalogo. Creane una in <strong>📇 Anagrafica → Progetto → + Nuovo articolo</strong>.'}</div>`;
    return;
  }
  renderCycleSummary(it);
  const rows = (it.cycle || []).map((r, i) => ({ r, i }));
  const bomRows = rows.filter(x => x.r.kind !== 'op');
  const opRows = rows.filter(x => x.r.kind === 'op');
  body.innerHTML = `
    ${cycleSourcingNote(it)}
    <div class="cycle-section">
      <div class="cycle-section-head">
        <h3>📦 Distinta parte <span class="cycle-dim">${bomRows.length} ${bomRows.length === 1 ? 'articolo' : 'articoli'}</span></h3>
        <button class="add-btn-sm" onclick="addCycleItemRow()">+ Articolo</button>
      </div>
      <div class="cycle-box">${cycleBomTable(bomRows)}</div>
      <div id="picker-bom"></div>
    </div>
    <div class="cycle-section">
      <div class="cycle-section-head">
        <h3>🔧 Ciclo di lavorazione <span class="cycle-dim">${opRows.length} ${opRows.length === 1 ? 'fase' : 'fasi'}</span></h3>
        <button class="add-btn-sm" onclick="addCycleOpRow()">+ Lavorazione</button>
      </div>
      <div class="cycle-box">${cycleOpsTable(opRows)}</div>
      <div id="picker-op"></div>
    </div>`;
  a11yFields(body);
}
// Riepilogo in cima: le due metà del costo separate, come le due sezioni sotto.
function renderCycleSummary(it) {
  const el = document.getElementById('cyc-summary'); if (!el) return;
  const rows = it.cycle || [];
  const bomTot = rows.filter(r => r.kind !== 'op').reduce((s, r) => s + cycleRowCost(r), 0);
  const opsTot = rows.filter(r => r.kind === 'op').reduce((s, r) => s + cycleRowCost(r), 0);
  const c = costOf(it.id);
  const u = itemUom(it);
  el.innerHTML = [
    kpi('Distinta parte', fmtPer(bomTot, u), 'orange'),
    kpi('Lavorazioni', fmtPer(opsTot, u), 'green'),
    kpi('Costo unitario a mano', fmtPer(Number(it.unitCost) || 0, u), 'purple'),
    kpi('Costo parte', fmtPer(c.total, u), ''),
  ].join('') + (c.cycle ? '<div class="empty-text" style="color:var(--red)">⚠ Rilevato riferimento ciclico: una riga risale a questa stessa parte.</div>' : '');
}
function cycleBomTable(bomRows) {
  if (!bomRows.length) return '<div class="empty-text" style="padding:8px 0">Nessun articolo. Usa "+ Articolo" per aggiungere commerciali e materie prime.</div>';
  const head = `<div class="cycle-row cycle-head">
    <span>Voce</span><span>Fornitore</span><span>U.M.</span><span class="num">Q.tà</span>
    <span class="num" title="Costo di una unità: vuoto = quello calcolato dall'anagrafica">Costo (${esc(cur())}/U.M.)</span>
    <span class="num">Costo riga (${esc(cur())})</span><span></span></div>`;
  return head + bomRows.map(({ r, i }) => {
    const ci = getItem(r.itemId);
    return `<div class="cycle-row">
      <span class="cycle-name">${cycleRowLabel(r)}</span>
      <span class="cycle-dim">${esc(supplierName(ci && ci.supplierId) || '—')}</span>
      <span class="cycle-dim">${esc(ci ? (ci.uom || '') : '')}</span>
      <input class="num" type="number" min="0" step="0.001" value="${Number(r.qty) || 0}"
        onchange="updateCycleRow(${i})" id="cyc-qty-${i}">
      <input class="num" type="number" min="0" step="0.01" value="${r.costOverride != null ? r.costOverride : ''}"
        placeholder="${cycleRowComputed(r).toFixed(2)}" title="Lascia vuoto per usare il costo calcolato"
        onchange="updateCycleRow(${i})" id="cyc-ovr-${i}">
      <span class="num cost" id="cyc-cost-${i}">${fmtN(cycleRowCost(r))}</span>
      <button class="mini-btn danger" title="Elimina" onclick="delCycleRow(${i})">🗑</button>
    </div>`;
  }).join('');
}
function cycleOpsTable(opRows) {
  if (!opRows.length) return '<div class="empty-text" style="padding:8px 0">Nessuna lavorazione. Usa "+ Lavorazione" per aggiungere una fase.</div>';
  const head = `<div class="cycle-row cycle-op-row cycle-head">
    <span>Fase</span><span>Lavorazione</span><span>Fornitore</span>
    <span class="num">Costo (${esc(cur())})</span><span class="num">Costo riga (${esc(cur())})</span><span>Ordine</span><span></span></div>`;
  const last = opRows.length - 1;
  return head + opRows.map(({ r, i }, k) => `<div class="cycle-row cycle-op-row">
      <span class="cycle-phase">${cyclePhaseNumber(k)}</span>
      <span class="cycle-name">${cycleRowLabel(r)}</span>
      <select class="cycle-sup" onchange="updateCycleRow(${i})" id="cyc-sup-${i}">${supplierOptions(r.supplierId || '')}</select>
      <input class="num" type="number" min="0" step="0.01" value="${Number(r.cost) || 0}"
        title="Costo fisso della lavorazione" onchange="updateCycleRow(${i})" id="cyc-cost-in-${i}">
      <span class="num cost" id="cyc-cost-${i}">${fmtN(cycleRowCost(r))}</span>
      <span class="cycle-move">
        <button class="mini-btn" title="Sposta su" onclick="moveCycleOp(${k},-1)" ${k === 0 ? 'disabled' : ''}>↑</button>
        <button class="mini-btn" title="Sposta giù" onclick="moveCycleOp(${k},1)" ${k === last ? 'disabled' : ''}>↓</button>
      </span>
      <button class="mini-btn danger" title="Elimina" onclick="delCycleRow(${i})">🗑</button>
    </div>`).join('');
}
// ─── Export del ciclo aperto ───
// I Cicli non sono un elenco ma una scheda: si esporta la parte che si sta
// guardando, con le sue due tavole. `cycleRowLabel` qui non serve — restituisce
// HTML, e in un foglio di calcolo un tag è solo sporcizia.
function cycleExportSpec() {
  const it = currentCycleItem();
  const righe = ((it && it.cycle) || []).map((r, i) => ({ r, i }));
  const bom = righe.filter(x => x.r.kind !== 'op');
  const ops = righe.filter(x => x.r.kind === 'op');
  const fam = getFamily(val('cyc-family'));
  const sub = (fam && (fam.subs || []).find(s => s.id === val('cyc-subfamily'))) || null;
  const tot = rs => +rs.reduce((s, x) => s + cycleRowCost(x.r), 0).toFixed(2);
  const nome = it ? ((it.code || '') + ' — ' + (it.name || '')).trim() : '(nessuna parte)';
  return {
    titolo: 'Ciclo di lavorazione — ' + nome,
    // Il codice finisce nel nome del file: quello che non è lettera o cifra
    // diventa un trattino, perché una barra in un nome di file non è un nome.
    slug: 'ciclo_' + String((it && it.code) || 'parte').replace(/[^A-Za-z0-9]+/g, '-'),
    filtri: [
      ['Parte', nome],
      ['Ricerca', val('cyc-search')],
      ['Famiglia', fam ? fam.name : ''],
      ['Sottofamiglia', sub ? sub.name : ''],
    ],
    sezioni: [
      {
        nome: 'Distinta parte',
        colonne: [
          { h: 'Codice', w: 18 }, { h: 'Descrizione', w: 34 }, { h: 'Fornitore', w: 24 },
          { h: 'U.M.', w: 8 }, { h: 'Q.tà', w: 10, num: true },
          { h: `Costo unitario (${cur()}/U.M.)`, w: 18, num: true },
          { h: `Costo riga (${cur()})`, w: 16, num: true },
        ],
        righe: bom.map(({ r }) => {
          const ci = getItem(r.itemId);
          return [ci ? (ci.code || '') : '(articolo mancante)', ci ? (ci.name || '') : '',
            supplierName(ci && ci.supplierId) || '', ci ? (ci.uom || '') : '',
            Number(r.qty) || 0, +cycleRowComputed(r).toFixed(4), +cycleRowCost(r).toFixed(2)];
        }),
        totali: bom.length ? ['Totale distinta parte', '', '', '', '', '', tot(bom)] : null,
      },
      {
        nome: 'Ciclo di lavorazione',
        colonne: [
          { h: 'Fase', w: 8, num: true }, { h: 'Lavorazione', w: 34 }, { h: 'Fornitore', w: 24 },
          { h: `Costo (${cur()})`, w: 16, num: true },
        ],
        righe: ops.map(({ r }, k) => {
          const wc = getWorkCenter(r.workCenterId);
          return [cyclePhaseNumber(k), wc ? wc.name : '(centro mancante)',
            supplierName(r.supplierId) || '', +cycleRowCost(r).toFixed(2)];
        }),
        totali: ops.length ? ['Totale lavorazioni', '', '', tot(ops)] : null,
      },
    ],
  };
}

// Dopo una modifica di valore si aggiornano solo le celle calcolate: ridisegnare
// tutto porterebbe via il campo su cui l'utente sta passando col tabulatore.
function refreshCycleCosts(it) {
  (it.cycle || []).forEach((row, i) => {
    const el = document.getElementById('cyc-cost-' + i);
    if (el) el.textContent = fmtN(cycleRowCost(row));
    const ovr = document.getElementById('cyc-ovr-' + i);
    if (ovr) ovr.placeholder = cycleRowComputed(row).toFixed(2);
  });
  renderCycleSummary(it);
}

// ─── Modifiche (salvataggio immediato) ───
function updateCycleRow(idx) {
  const it = currentCycleItem(); if (!it) return;
  // Il ridisegno rimette il valore salvato: senza permessi il campo non resta modificato a video
  if (!roleGuard('catalog')) { renderCycles(); return; }
  const row = (it.cycle || [])[idx]; if (!row) return;
  if (row.kind === 'op') {
    row.cost = numVal('cyc-cost-in-' + idx, 0);
    row.supplierId = val('cyc-sup-' + idx);
  } else {
    row.qty = numVal('cyc-qty-' + idx, 0);
    // Vuoto = nessun override, si usa il costo calcolato. Un negativo si corregge
    // in silenzio: è una cella di tabella, non un form con la sua validazione.
    const ovr = val('cyc-ovr-' + idx);
    row.costOverride = ovr === '' ? null : clampNum(parseFloat(ovr), 0);
  }
  touch(it); saveDB();
  refreshCycleCosts(it);
}
function delCycleRow(idx) {
  const it = currentCycleItem(); if (!it) return;
  if (!roleGuard('catalog')) return;
  if (!(it.cycle || [])[idx]) return;
  it.cycle.splice(idx, 1);
  touch(it); saveDB(); renderCycles(); showToast('Riga eliminata');
}
function moveCycleOp(k, dir) {
  const it = currentCycleItem(); if (!it) return;
  if (!roleGuard('catalog')) return;
  const next = moveKindRow(it.cycle || [], 'op', k, dir);
  if (next === it.cycle) return;   // già in cima o in fondo
  it.cycle = next;
  touch(it); saveDB(); renderCycles();
}
function closeCyclePicker() {
  ['picker-bom', 'picker-op'].forEach(id => { const b = document.getElementById(id); if (b) b.innerHTML = ''; });
}
// Picker inline di un articolo (commerciale o materia prima) per la distinta parte.
function addCycleItemRow() {
  if (!roleGuard('catalog')) return;
  const box = document.getElementById('picker-bom'); if (!box) return;
  window.__cyclePickerCandidates = db.items
    .filter(i => CYCLE_CHILD_TYPES.includes(i.type))
    .sort((a, b) => String(a.code).localeCompare(String(b.code)));
  if (!window.__cyclePickerCandidates.length) {
    showToast('Nessun commerciale o materia prima a catalogo.', 'error'); return;
  }
  box.innerHTML = `<div class="cycle-picker-box">
    <input type="text" id="cycpick-search" class="search" placeholder="🔍 Cerca codice o nome..." oninput="debounced('cycpick', renderCyclePickerResults)" autocomplete="off">
    <div id="cycpick-results" class="picker-results"></div>
    <div class="cycle-actions"><button class="btn-ghost" onclick="closeCyclePicker()">Annulla</button></div>
  </div>`;
  renderCyclePickerResults();
  const s = document.getElementById('cycpick-search'); if (s) s.focus();
}
function renderCyclePickerResults() {
  const box = document.getElementById('cycpick-results'); if (!box) return;
  const q = (val('cycpick-search') || '').toLowerCase();
  let rows = window.__cyclePickerCandidates || [];
  if (q) rows = rows.filter(i => (i.code + ' ' + i.name).toLowerCase().includes(q));
  const total = rows.length;
  rows = rows.slice(0, 50);
  let html = rows.map(i =>
    `<div class="picker-row" ${clickAttrs(`pickCycleItem('${i.id}')`, `Scegli ${i.code}`)}>
       <span class="picker-type">${typeLabel(i.type)}</span><b>${esc(i.code)}</b> — ${esc(i.name)}${itemBadges(i)}
     </div>`).join('');
  if (!html) html = `<div class="picker-empty">Nessun articolo trovato</div>`;
  else if (total > rows.length) html += `<div class="picker-empty">+${total - rows.length} altri — affina la ricerca</div>`;
  box.innerHTML = html;
}
function pickCycleItem(id) {
  const it = currentCycleItem(); if (!it) return;
  if (!roleGuard('catalog')) return;
  // Le stesse due guardie della distinta base. Il selettore propone già solo i
  // tipi ammessi e oggi quei tipi sono foglie, quindi nessuna delle due può
  // scattare: sono qui perché la regola stia scritta accanto alla scrittura che
  // la deve rispettare, non nel filtro di un elenco.
  const child = getItem(id);
  if (!child || !CYCLE_CHILD_TYPES.includes(child.type)) { showToast('Nella distinta parte vanno solo commerciali e materie prime', 'error'); return; }
  if (createsCycle(it.id, id)) { showToast('Operazione annullata: creerebbe un ciclo', 'error'); return; }
  if (!Array.isArray(it.cycle)) it.cycle = [];
  it.cycle.push({ kind: 'item', itemId: id, qty: 1, costOverride: null });
  closeCyclePicker();
  touch(it); saveDB(); renderCycles(); showToast('Articolo aggiunto alla distinta parte');
}
// Selettore inline di una lavorazione da un centro di lavoro esistente (costo fisso, non orario).
function addCycleOpRow() {
  if (!roleGuard('catalog')) return;
  const box = document.getElementById('picker-op'); if (!box) return;
  if (!db.workCenters.length) { showToast('Aggiungi prima un centro di lavoro in Gestione', 'error'); return; }
  box.innerHTML = `<div class="cycle-picker-box">
    <div class="modal-grid">
      <div class="modal-field"><label>Centro di lavoro</label><select id="cyc-wc">${wcOptionsNoRate(null)}</select></div>
      <div class="modal-field"><label>Fornitore</label><select id="cyc-opsup">${supplierOptions('')}</select></div>
      <div class="modal-field"><label>Costo (${cur()})</label><input type="number" id="cyc-opcost" min="0" step="0.01" value="0"></div>
    </div>
    <div class="cycle-actions">
      <button class="btn-ghost" onclick="closeCyclePicker()">Annulla</button>
      <button class="add-btn-sm" onclick="pickCycleOp()">Aggiungi</button>
    </div>
  </div>`;
}
function pickCycleOp() {
  const it = currentCycleItem(); if (!it) return;
  if (!roleGuard('catalog')) return;
  const wcId = val('cyc-wc');
  if (!wcId) { showToast('Seleziona un centro di lavoro', 'error'); return; }
  if (!Array.isArray(it.cycle)) it.cycle = [];
  // In fondo all'elenco: l'ultima fase aggiunta è l'ultima del ciclo, poi si sposta con ↑↓
  it.cycle.push({ kind: 'op', workCenterId: wcId, supplierId: val('cyc-opsup'), cost: numVal('cyc-opcost', 0), note: '' });
  closeCyclePicker();
  touch(it); saveDB(); renderCycles(); showToast('Lavorazione aggiunta');
}

function newItemModal(scope) {
  if (!roleGuard('catalog')) return;
  scope = CATALOG_SCOPES[scope] ? scope : 'buy';
  itemCodeAuto = true;
  window.__dupSourceId = null;
  window.__editingItemId = null;
  window.__itemScope = scope;
  openModal(`<h3>${scope === 'buy' ? '📦' : '🏗'} Nuovo articolo — ${esc(CATALOG_SCOPES[scope].title)}</h3>${itemModalBody(null, scope)}
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="saveNewItem()">Crea</button></div>`, true);
  toggleItemFields();
}
// Ricerca live di un articolo sorgente da cui duplicare (tutti i tipi).
function renderSourceResults() {
  const box = document.getElementById('src-results'); if (!box) return;
  const q = (val('src-search') || '').toLowerCase();
  if (!q) { box.innerHTML = ''; return; }
  // Solo articoli dello stesso scope: il menu Tipo della modale non conosce gli altri
  const types = (CATALOG_SCOPES[window.__itemScope] || CATALOG_SCOPES.buy).types;
  const rows = db.items.filter(i => types.includes(i.type) && (i.code + ' ' + i.name).toLowerCase().includes(q))
    .sort((a, b) => String(a.code).localeCompare(String(b.code))).slice(0, 50);
  box.innerHTML = rows.map(i =>
    `<div class="picker-row" ${clickAttrs(`applyItemSource('${i.id}')`, `Copia i dati di ${i.code}`)}>
       <span class="picker-type">${typeLabel(i.type)}</span><b>${esc(i.code)}</b> — ${esc(i.name)}${itemBadges(i)}
     </div>`).join('') || `<div class="picker-empty">Nessun articolo trovato</div>`;
}
// Precompila il form "Nuovo articolo" coi dati della sorgente (codice escluso, sempre univoco).
function applyItemSource(id) {
  const src = getItem(id); if (!src) return;
  window.__dupSourceId = id;
  itemCodeAuto = true;
  setVal('it-type', src.type); toggleItemFields();
  if (usesFamily(src.type)) {
    setVal('it-family', src.familyId || '');
    document.getElementById('it-subfamily').innerHTML = subFamilyOptions(src.familyId || '', src.subFamilyId || '');
  }
  // Appartenenza copiata; la sigla della macchina no (deve restare univoca)
  if (src.type === 'gruppo' || src.type === 'sottogruppo' || src.type === 'parte') {
    setVal('it-machine', src.machineItemId || '');
    onItemMachineChange();
    if (src.type === 'gruppo') setVal('it-sigla-grp', src.sigla || '');
    else setVal('it-group', src.groupItemId || '');
  }
  // Nome: le parti copiano concetto + descrizione, gli altri tipi il nome libero
  if (src.type === 'parte') {
    setVal('it-concept', src.conceptId || '');
    setVal('it-namefree', (src.nameFree != null ? src.nameFree : src.name) + ' (copia)');
    updatePartNamePreview();
  } else {
    setVal('it-name', src.name + ' (copia)');
  }
  setVal('it-uom', src.uom || defaultUom());
  if (src.type === 'parte') setVal('it-sourcing', partSourcing(src));
  setVal('it-notes', src.notes || '');
  setVal('it-code', '');
  refreshItemCode();
  const box = document.getElementById('src-results'); if (box) box.innerHTML = '';
  setVal('src-search', src.code + ' — ' + src.name);
}
function duplicateItemModal(id) {
  if (!roleGuard('catalog')) return;
  const src = getItem(id); if (!src) return;
  newItemModal(scopeOf(src.type));
  applyItemSource(id);
}
function readItemForm(it) {
  it.code = val('it-code') || it.id;
  // Le parti compongono il nome da concetto + descrizione libera; gli altri tipi restano a testo libero
  if (it.type === 'parte') {
    it.conceptId = val('it-concept');
    it.nameFree = val('it-namefree');
    it.name = composePartName(it.conceptId, it.nameFree);
  } else {
    it.name = val('it-name');
  }
  it.uom = val('it-uom') || defaultUom();
  it.notes = val('it-notes');
  // Parametri di scorta: solo su ciò che si tiene a magazzino. Vuoto resta
  // vuoto — zero e "non impostato" qui vogliono dire la stessa cosa, ma un
  // campo lasciato in bianco non deve comparire come 0 alla riapertura.
  if (hasStock(it)) {
    const sa = val('it-safety'), lo = val('it-lot');
    it.safetyStock = sa === '' ? null : clampNum(parseFloat(sa), 0);
    it.lotSize = lo === '' ? null : clampNum(parseFloat(lo), 0);
  }
  // Doppia unità di misura. Le due voci vanno insieme: un'unità senza fattore
  // non converte niente, un fattore senza unità non si applica a niente.
  if (hasPriceList(it)) {
    const au = val('it-altuom'), af = val('it-altfactor');
    const fattore = af === '' ? 0 : clampNum(parseFloat(af), 0);
    if (au && au !== it.uom && fattore > 0) { it.altUom = au; it.altFactor = fattore; }
    else { delete it.altUom; delete it.altFactor; }
    // Cambiare il fattore cambia il costo di ogni quotazione espressa
    // nell'altra unità: quella in uso va ricalcolata subito, altrimenti la
    // costificazione resterebbe ferma alla conversione di prima.
    const attiva = activePriceRow(it);
    if (attiva) applyPriceRow(it, attiva);
  }
  // Flag: preferito (solo commerciali e materie prime), obsoleto (anche parti)
  if (canFavorite(it.type)) it.favorite = isChecked('it-favorite');
  if (it.type === 'acquistato' || it.type === 'materiale' || it.type === 'parte') it.obsolete = isChecked('it-obsolete');
  // Prezzo, fornitore, codice e descrizione presso il fornitore NON si leggono
  // da qui: li scrive solo applyPriceRow() quando si sceglie una quotazione.
  // Solo un valore valido sovrascrive: in creazione il campo può non esserci
  // ancora, e lì vale il default delle impostazioni scritto da saveNewItem.
  if (it.type === 'parte') { const s = val('it-sourcing'); if (PART_SOURCING[s]) it.sourcing = s; }
  if (usesFamily(it.type)) { it.familyId = val('it-family'); it.subFamilyId = val('it-subfamily'); }
  // Codifica gerarchica: schema sulla macchina, appartenenza sugli altri tipi
  const d = itemDraftFromForm();
  if (it.type === 'macchina') {
    it.sigla = d.sigla; it.gCodeLen = d.gCodeLen; it.gCodeType = d.gCodeType;
    it.incrDigitsS = d.incrDigitsS; it.incrDigitsN = d.incrDigitsN;
  } else if (it.type === 'gruppo') {
    it.machineItemId = d.machineItemId; it.sigla = d.sigla;
  } else if (it.type === 'sottogruppo' || it.type === 'parte') {
    it.machineItemId = d.machineItemId; it.groupItemId = d.groupItemId;
  }
  // Distinta parte, ciclo e modo di calcolo non passano da qui: si modificano
  // nella vista Cicli di lavorazione, che salva per conto suo.
}
// Controlli sulla codifica: sigle valide e univoche. Restituisce un messaggio o null.
function validateItemCoding(id) {
  const d = itemDraftFromForm();
  if (d.type === 'macchina') {
    if (!d.sigla) return null; // sigla facoltativa: senza, niente codice automatico
    if (!/^[A-Z0-9]+$/.test(d.sigla)) return 'La sigla macchina ammette solo A-Z e 0-9';
    if (machineItems().some(m => m.sigla === d.sigla && m.id !== id)) return `Sigla macchina "${d.sigla}" già in uso`;
    if (!(d.gCodeLen >= 1 && d.gCodeLen <= 10)) return 'N° caratteri sigla gruppo non valido (1-10)';
    if (!(d.incrDigitsS >= 1 && d.incrDigitsS <= 6)) return 'Cifre progressivo S## non valide (1-6)';
    if (!(d.incrDigitsN >= 1 && d.incrDigitsN <= 6)) return 'Cifre numerazione ### non valide (1-6)';
  } else if (d.type === 'gruppo') {
    if (!d.machineItemId || !d.sigla) return null; // senza macchina+sigla il codice resta manuale
    const sm = machineScheme(getItem(d.machineItemId));
    const err = validateCodeFormat(d.sigla, sm.gLen, sm.gType);
    if (err) return err;
    if (groupItemsFor(d.machineItemId).some(g => g.sigla === d.sigla && g.id !== id))
      return `Sigla gruppo "${d.sigla}" già usata su questa macchina`;
  }
  return null;
}
// Unicità del codice articolo. Fino alla 0.22.0 non la controllava nessuno, ma
// tutto ciò che cerca un articolo per codice — l'import massivo, la ricerca — dà
// per scontato che sia unico e risolve sul primo trovato, in silenzio. In cloud
// diventerà un vincolo del database.
//
// `codiceAttuale` è la chiave della regola: si impedisce di *introdurre* un
// duplicato, non si blocca chi sta correggendo altro su un articolo che era già
// duplicato prima. Chi ripulisce i duplicati esistenti lo fa dal report in
// Gestione › Backup, non venendo bloccato mentre rinomina un articolo.
function validateItemCode(code, exceptId, codiceAttuale) {
  const k = itemCodeKey(code);
  if (!k) return null;                                   // vuoto: readItemForm ci mette l'id, unico per costruzione
  if (codiceAttuale != null && k === itemCodeKey(codiceAttuale)) return null;
  const altro = getItemByCode(k);
  if (altro && altro.id !== exceptId) return `Codice "${code}" già usato da ${altro.name || altro.id}`;
  return null;
}
// Controlli sul nome secondo il tipo: le parti richiedono concetto + descrizione, gli altri il nome libero.
function validateItemName(type) {
  if (type === 'parte') {
    if (!val('it-concept')) return 'Concetto richiesto';
    if (!val('it-namefree')) return 'Descrizione richiesta';
    return null;
  }
  return val('it-name') ? null : 'Nome richiesto';
}
function saveNewItem() {
  if (!roleGuard('catalog')) return;
  const nameErr = validateItemName(val('it-type'));
  if (nameErr) { showToast(nameErr, 'error'); return; }
  const codErr = validateItemCoding(null);
  if (codErr) { showToast(codErr, 'error'); return; }
  const dupErr = validateItemCode(val('it-code'), null, null);
  if (dupErr) { showToast(dupErr, 'error'); return; }
  const it = { id: gid(), type: val('it-type') };
  if (isAssembly(it.type)) { it.components = []; it.operations = []; }
  if (it.type === 'parte') { it.cycle = []; it.sourcing = defaultPartSourcing(); }
  readItemForm(it);
  const src = window.__dupSourceId ? getItem(window.__dupSourceId) : null;
  if (src && isAssembly(it.type)) {
    it.components = (src.components || []).map(c => Object.assign({}, c));
    it.operations = (src.operations || []).map(o => Object.assign({}, o));
  }
  // Duplicando una parte si porta dietro distinta e ciclo, come gli assiemi coi componenti
  if (src && it.type === 'parte') {
    it.cycle = (src.cycle || []).map(r => Object.assign({}, r));
  }
  if (src) {
    if (src.overheadPctOverride != null) it.overheadPctOverride = src.overheadPctOverride;
    if (src.marginPctOverride != null) it.marginPctOverride = src.marginPctOverride;
  }
  // Il listino è dove vive il prezzo: duplicando un articolo si porta dietro
  // anche le sue quotazioni, altrimenti la copia nascerebbe a costo zero.
  if (hasPriceList(it)) {
    it.priceList = [];
    it.priceListSeeded = true;
    if (src && hasPriceList(src)) {
      const rimappa = {};
      it.priceList = priceRows(src).map(r => {
        const n = stampNew(Object.assign({}, r, { id: gid() }));
        rimappa[r.id] = n.id;
        return n;
      });
      if (src.activePriceId && rimappa[src.activePriceId]) {
        const attiva = it.priceList.find(r => r.id === rimappa[src.activePriceId]);
        if (attiva) applyPriceRow(it, attiva);
      }
    }
  }
  Store.insert('items', it);
  closeModal(); renderCatalogs(); showToast(src ? 'Copia creata' : 'Articolo creato');
  // Un articolo appena creato non ha modo di ricevere un prezzo: la scheda non
  // lo chiede più. Il listino si apre da solo, ma solo se non è già arrivato
  // dalla copia — lì il prezzo c'è già.
  if (hasPriceList(it) && !priceRows(it).length) priceListModal(it.id);
}
function editItemModal(id) {
  if (!roleGuard('catalog')) return;
  const it = getItem(id); if (!it) return;
  itemCodeAuto = false; // in modifica non si rigenera mai il codice esistente
  window.__editingItemId = id;
  window.__itemScope = scopeOf(it.type);
  openModal(`<h3>✏ Modifica articolo</h3>${itemModalBody(it, window.__itemScope)}
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="saveItemEdit('${id}')">Salva</button></div>`, true);
  toggleItemFields();
}
function saveItemEdit(id) {
  if (!roleGuard('catalog')) return;
  const it = getItem(id); if (!it) return;
  const nameErr = validateItemName(it.type);
  if (nameErr) { showToast(nameErr, 'error'); return; }
  const codErr = validateItemCoding(id);
  if (codErr) { showToast(codErr, 'error'); return; }
  const dupErr = validateItemCode(val('it-code'), id, it.code);
  if (dupErr) { showToast(dupErr, 'error'); return; }
  readItemForm(it);
  touch(it);
  saveDB(); closeModal(); renderCatalogs(); showToast('Articolo aggiornato');
}
function delItem(id) {
  if (!roleGuard('catalog')) return;
  const it = getItem(id); if (!it) return;
  // Invece del solo elenco di codici, si apre direttamente il "dove è usato":
  // da lì si vede chi lo contiene e si può risalire.
  const used = usedBy(id);
  if (used.length) { showToast('Usato in ' + used.length + ' articoli: rimuovilo prima.', 'error'); usageModal(id); return; }
  askConfirm(`Eliminare "${it.name}"?`, () => {
    if (currentBomId === id) currentBomId = null;
    removeConUndo('items', id, `"${it.name}" eliminato`, renderCatalogs);
  });
}
