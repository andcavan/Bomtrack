// ═══════════════════════════════════════════════════════════
//  BOMTRACK — views-item.js
// ═══════════════════════════════════════════════════════════
// Scheda articolo di **sola lettura**: tutto quello che si sa di un codice, in
// una finestra sola, raggiungibile da ovunque quel codice compaia.
// Classic script, scope globale condiviso con gli altri: nessun modulo e
// nessun build, così index.html continua ad aprirsi con un doppio click.
//
// ── Il problema ──
// Le informazioni di un articolo erano tutte nell'app, ma sparse in sei posti
// diversi e raggiungibili solo passando dalla vista giusta: il costo in
// costificazione, il prezzo nel listino, la giacenza nella scheda del catalogo,
// gli impieghi in *Dove è usato*, la distinta nell'albero, i documenti negli
// elenchi. Chi leggeva un codice in una lista d'acquisto o in un ordine e si
// chiedeva «ma questo cos'è?» doveva ricordarsi dove andare a guardare, uscire
// da dove stava lavorando e poi tornarci.
//
// ── La scelta ──
// Il codice diventa **cliccabile ovunque**, e apre questa scheda. Un solo
// gesto, sempre lo stesso, da qualunque tabella.
//
// E la scheda **non modifica niente**. Non è una limitazione da togliere più
// avanti: è la ragione per cui la si può aprire senza pensarci, in mezzo a
// qualunque lavoro, anche mentre un form è aperto dietro. Una scheda che non
// scrive non ha uno stato da salvare, non chiede conferme all'uscita e non può
// rovinare niente per un click di troppo. Le modifiche restano dove stanno —
// anagrafica, listino, distinta — dove chi le fa ci è arrivato apposta.

// ─── Il codice cliccabile ───
// Unico punto in cui nasce un codice a schermo. Le tabelle passano di qui e
// non ripetono né lo stile né il gesto: cambiare cosa fa un click su un codice
// è una modifica sola.
//
// `stopPropagation` non è un dettaglio: molte righe hanno già un loro click —
// la riga di distinta si espande, la riga del catalogo si apre in modifica — e
// senza, un click sul codice farebbe due cose insieme, di cui una indesiderata.
function codeLink(itemId, testo, cls) {
  const txt = esc(testo == null ? '' : String(testo));
  if (!itemId || !getItem(itemId)) return txt;   // codice libero o articolo cancellato: niente da aprire
  return `<span class="code-link${cls ? ' ' + cls : ''}" role="button" tabindex="0"
    title="Scheda completa (sola lettura)"
    onclick="itemInfoModal('${itemId}', event)"
    onkeydown="if(event.key==='Enter'||event.key===' '){itemInfoModal('${itemId}', event)}">${txt}</span>`;
}
// Comodità per il caso normale: il codice dell'articolo stesso.
function itemCodeLink(it, cls) { return it ? codeLink(it.id, it.code, cls) : ''; }

// ─── La scheda ───
// Una chiave di pannello sola: cliccare un codice dentro la scheda sostituisce
// il contenuto invece di aprire una seconda finestra sopra la prima. È la
// navigazione di un browser, e come in un browser serve il tasto indietro —
// altrimenti scendere in una distinta è un viaggio di sola andata.
let _itemInfoStack = [];
function itemInfoModal(id, ev, indietro) {
  if (ev && ev.stopPropagation) { ev.stopPropagation(); ev.preventDefault(); }
  const it = getItem(id);
  if (!it) { showToast('Articolo non più a catalogo', 'error'); return; }
  if (!indietro) {
    const corrente = window.__itemInfoId;
    if (corrente && corrente !== id) _itemInfoStack.push(corrente);
  }
  window.__itemInfoId = id;
  openModal(itemInfoHtml(it), true, 'iteminfo');
}
function itemInfoBack() {
  const prev = _itemInfoStack.pop();
  if (prev) itemInfoModal(prev, null, true);
}
// Chiudendo si dimentica la strada percorsa: riaprire da un'altra tabella
// comincia da capo, e un "indietro" che riporta a un articolo di mezz'ora fa
// sarebbe più sorprendente che utile.
function itemInfoClose() { _itemInfoStack = []; window.__itemInfoId = null; closeModal(); }

function itemInfoHtml(it) {
  const back = _itemInfoStack.length
    ? `<button class="btn-outline" onclick="itemInfoBack()" title="Torna a ${esc(getItem(_itemInfoStack[_itemInfoStack.length - 1]) ? getItem(_itemInfoStack[_itemInfoStack.length - 1]).code : '')}">← Indietro</button>`
    : '';
  return `<h3>🔎 ${esc(it.code)} — ${esc(it.name)}${itemBadges(it)}</h3>
    <p style="color:var(--text-dim);margin-bottom:4px">
      <span class="bom-type-tag tt-${it.type}">${typeShort(it.type)}</span> ${esc(typeLabel(it.type))}
      · U.M. <strong>${esc(it.uom || '—')}</strong>${hasRevisions(it) ? ` · revisione in lavorazione <strong>${esc(itemRev(it))}</strong>` : ''}</p>
    <p class="empty-text" style="text-align:left;padding:0 0 12px">Scheda di <strong>sola lettura</strong>: qui non si modifica niente, e per questo si può aprire in mezzo a qualunque lavoro. Le modifiche si fanno dall'anagrafica, dal listino e dalla distinta.</p>
    ${itemInfoAnagrafica(it)}
    ${itemInfoAcquisto(it)}
    ${itemInfoCosto(it)}
    ${itemInfoMagazzino(it)}
    ${itemInfoComposizione(it)}
    ${itemInfoImpieghi(it)}
    ${itemInfoDocumenti(it)}
    ${itemInfoRevisioni(it)}
    ${stampLine(it)}
    <div class="modal-actions">
      ${back}
      <button class="btn-ghost" onclick="itemInfoClose()">Chiudi</button>
    </div>`;
}

// Titolo di sezione + corpo. Le sezioni che non hanno niente da dire non si
// disegnano: una scheda piena di «—» nasconde le righe che contano.
function itemInfoSection(titolo, corpo) {
  return corpo ? `<h4 class="settings-group-title">${titolo}</h4>${corpo}` : '';
}
// Griglia etichetta/valore. Le voci vuote cadono qui, una volta per tutte.
function itemInfoRows(voci) {
  const righe = voci.filter(v => v && v[1] !== '' && v[1] != null)
    .map(([k, v]) => `<div class="info-row"><span class="info-key">${k}</span><span class="info-val">${v}</span></div>`)
    .join('');
  return righe ? `<div class="info-grid">${righe}</div>` : '';
}
const _mono = s => `<span style="font-family:var(--mono)">${esc(s)}</span>`;

function itemInfoAnagrafica(it) {
  const fam = familyName(it.familyId);
  const sub = subFamilyName(it.familyId, it.subFamilyId);
  const mac = getItem(it.machineItemId);
  const grp = getItem(it.groupItemId);
  return itemInfoSection('Anagrafica', itemInfoRows([
    ['Codice', _mono(it.code)],
    ['Nome', esc(it.name)],
    it.type === 'parte' && it.conceptId ? ['Concetto', esc(conceptName(it.conceptId))] : null,
    ['Tipo', esc(typeLabel(it.type))],
    ['Unità di misura', _mono(it.uom || '—')],
    it.type === 'parte' ? ['Approvvigionamento', esc(PART_SOURCING[partSourcing(it)])] : null,
    fam ? ['Macrofamiglia', esc(fam)] : null,
    sub ? ['Sottofamiglia', esc(sub)] : null,
    it.sigla ? ['Sigla', _mono(it.sigla)] : null,
    mac ? ['Macchina', codeLink(mac.id, mac.code) + ' — ' + esc(mac.name)] : null,
    grp ? ['Gruppo', codeLink(grp.id, grp.code) + ' — ' + esc(grp.name)] : null,
    it.favorite ? ['Preferito', '★ sì'] : null,
    it.obsolete ? ['Obsoleto', '<span style="color:var(--red)">⛔ non più utilizzabile</span>'] : null,
    it.notes ? ['Note', esc(it.notes)] : null,
  ]));
}

// Fornitore, prezzo in uso e listino completo. Il prezzo in uso e la quotazione
// più bassa sono due numeri diversi e vanno detti come tali: l'app non cambia
// mai un prezzo da sé, quindi la differenza è una scelta di qualcuno.
function itemInfoAcquisto(it) {
  if (!hasPriceList(it)) return '';
  const campo = costField(it);
  const inUso = campo ? (Number(it[campo]) || 0) : null;
  const attiva = activePriceRow(it);
  const best = bestPriceRow(it);
  const bestCosto = best ? rowUnitCost(it, best) : null;
  const righe = priceRows(it);

  // Codice e descrizione si leggono dalla quotazione in uso, non dalla copia sui
  // campi dell'articolo: è la stessa cosa, ma da un posto solo. Sono di **quel**
  // fornitore, quindi l'etichetta lo nomina — gli altri stanno in tabella, ognuno
  // col suo.
  const nomeForn = supplierName(it.supplierId);
  const presso = nomeForn ? ` presso ${esc(nomeForn)}` : ' presso il fornitore';
  const testa = itemInfoRows([
    ['Fornitore', esc(nomeForn || '— nessuno')],
    attiva && attiva.code ? ['Codice' + presso, _mono(attiva.code)] : null,
    attiva && attiva.desc ? ['Descrizione' + presso, esc(attiva.desc)] : null,
    inUso != null ? ['Costo in uso', `<strong>${fmtPer(inUso, itemUom(it))}</strong>${inUso > 0 ? '' : ' <span style="color:var(--red)">⚠ nessun prezzo</span>'}`] : null,
    attiva ? ['Quotazione in uso', `${fmtPer(attiva.price, priceUomOf(it, attiva))}${attiva.date ? ' · ' + esc(fmtDateIt(attiva.date)) : ''}`] : null,
    attiva && attiva.leadDays ? ['Giorni di consegna', esc(String(attiva.leadDays)) + ' gg'] : null,
    attiva && attiva.minQty ? ['Quantità minima', fmtUom(attiva.minQty, priceUomOf(it, attiva))] : null,
    hasAltUom(it) ? ['U.M. d\'acquisto', `${_mono(altUomOf(it))} · ${fmtUom(altFactorOf(it), altUomOf(it))} in 1 ${esc(itemUom(it))}`] : null,
    best && bestCosto != null && inUso != null && bestCosto < inUso - 0.00005
      ? ['Miglior quotazione', `<span class="price-best">${fmtPer(bestCosto, itemUom(it))} da ${esc(supplierName(best.supplierId) || '—')}</span> — più bassa di quella in uso, ma il prezzo non cambia da sé: si sceglie dal listino`]
      : null,
  ]);

  const tabella = righe.length ? `<div class="table-wrap"><table>
    <thead><tr><th>Fornitore</th><th title="Come questo fornitore chiama l'articolo: è quello che finisce sui suoi documenti">Codice e descrizione presso il fornitore</th>
      <th style="text-align:right" title="Prezzo di una unità, nella U.M. della colonna accanto">Prezzo (${esc(cur())}/U.M.)</th><th>U.M.</th>
      <th style="text-align:right">Q.tà min.</th><th style="text-align:right" title="Giorni di consegna dichiarati dal fornitore">Consegna (gg)</th>
      <th>Data</th><th></th></tr></thead>
    <tbody>${righe.map(r => {
      const u = priceUomOf(it, r);
      return `<tr${r.id === it.activePriceId ? ' style="font-weight:700"' : ''}>
        <td>${esc(supplierName(r.supplierId) || '—')}</td>
        <td style="font-family:var(--mono)">${esc(r.code || '—')}${r.desc ? `<div class="empty-text" style="padding:0;font-family:inherit">${esc(r.desc)}</div>` : ''}</td>
        <td style="font-family:var(--mono);text-align:right">${r.price === '' || r.price == null ? '<span class="empty-text" style="padding:0">in attesa</span>' : fmtN(r.price)}</td>
        <td>${esc(u)}</td>
        <td style="font-family:var(--mono);text-align:right">${r.minQty ? fmtUom(r.minQty, u) : '—'}</td>
        <td style="font-family:var(--mono);text-align:right">${r.leadDays ? esc(String(r.leadDays)) + ' gg' : '—'}</td>
        <td>${r.date ? esc(fmtDateIt(r.date)) : '—'}</td>
        <td>${r.id === it.activePriceId ? '<span class="price-best">✓ in uso</span>' : ''}</td></tr>`;
    }).join('')}</tbody></table></div>` : '<div class="empty-text">Nessuna quotazione a listino.</div>';

  return itemInfoSection('💶 Acquisto e listino', testa + tabella);
}

// La ripartizione del costo, con le sole voci che pesano. Il totale c'è sempre,
// anche a zero: è il numero che si è venuti a cercare.
function itemInfoCosto(it) {
  const c = costOf(it.id);
  const u = itemUom(it);
  const voci = [
    ['Materiale', c.material], ['Commerciali', c.purchased], ['Lavorazioni', c.labor],
    ['Parti', c.parts], ['Spese generali', c.overhead],
  ].filter(v => Math.abs(v[1]) > 0.00005);
  // Ogni voce è la sua quota **per unità**, non la spesa di un lotto: senza il
  // denominatore la ripartizione si legge come un totale e non torna con niente.
  const corpo = itemInfoRows(voci.map(([k, v]) => [k, `<span style="font-family:var(--mono)">${fmtPer(v, u)}</span>`]).concat([
    ['Costo industriale', `<strong style="font-family:var(--mono)">${fmtPer(c.total, u)}</strong>`],
    ['Prezzo di vendita', `<span style="font-family:var(--mono)">${fmtPer(sellingPrice(it.id), u)}</span>`],
    c.cycle ? ['⚠ Attenzione', '<span style="color:var(--red)">Riferimento ciclico nella distinta: il costo è troncato su quel ramo.</span>'] : null,
  ]));
  return itemInfoSection('💰 Costo unitario', corpo);
}

// Magazzino in sola lettura: gli stessi numeri della scheda del catalogo, senza
// i pulsanti che li cambiano.
function itemInfoMagazzino(it) {
  if (!hasStock(it)) return '';
  const s = stockOf(it.id);
  const imp = commitsOn(it.id, null);
  const impQty = imp.reduce((a, x) => a + x.qty, 0);
  const libero = s.onHand + s.incoming - impQty;
  const u = itemUom(it);
  const dettaglio = imp.length
    ? `<div class="empty-text" style="text-align:left;padding:0 0 8px">Impegnato dai piani aperti: ${imp.map(x => `${esc(x.number)}${x.title ? ' (' + esc(x.title) + ')' : ''} ${fmtUom(x.qty, u)}`).join(' · ')}.</div>`
    : '';
  return itemInfoSection('📦 Magazzino', itemInfoRows([
    ['Esistente', `<span style="font-family:var(--mono)">${fmtUom(s.onHand, u)}</span>`],
    ['In arrivo', `<span style="font-family:var(--mono)">${fmtUom(s.incoming, u)}</span>`],
    ['Impegnato', `<span style="font-family:var(--mono)">${fmtUom(impQty, u)}</span>`],
    ['Libero', `<strong style="font-family:var(--mono)${libero < 0 ? ';color:var(--red)' : ''}">${fmtUom(libero, u)}</strong>`],
    safetyStockOf(it) ? ['Scorta minima', `<span style="font-family:var(--mono)">${fmtUom(safetyStockOf(it), u)}</span>`] : null,
    lotSizeOf(it) ? ['Lotto di riordino', `<span style="font-family:var(--mono)">${fmtUom(lotSizeOf(it), u)}</span>`] : null,
    ['Movimenti registrati', String(movementsOf(it.id).length)],
  ]) + dettaglio);
}

// Di cosa è fatto: componenti per un assieme, distinta parte e ciclo per una
// parte. Un solo livello — scendere si fa cliccando il codice, che è il gesto
// che questa scheda insegna.
function itemInfoComposizione(it) {
  if (isAssembly(it.type)) {
    const comps = it.components || [];
    const ops = it.operations || [];
    if (!comps.length && !ops.length) return itemInfoSection('🌳 Composizione', '<div class="empty-text">Distinta vuota.</div>');
    const righe = comps.map(c => {
      const ci = getItem(c.itemId);
      if (!ci) return `<tr><td colspan="5" class="empty-text">⚠ componente mancante</td></tr>`;
      return `<tr>
        <td>${codeLink(ci.id, ci.code)}</td>
        <td><span class="bom-type-tag tt-${ci.type}">${typeShort(ci.type)}</span> ${esc(ci.name)}${itemBadges(ci)}</td>
        <td style="font-family:var(--mono);text-align:right">${fmtUom(c.qty, itemUom(ci))}</td>
        <td style="font-family:var(--mono);text-align:right">${c.scrapPct ? fmtQty(c.scrapPct) + '%' : '—'}</td>
        <td style="font-family:var(--mono);text-align:right">${fmtN(costOf(ci.id).total * (Number(c.qty) || 0) * (1 + (Number(c.scrapPct) || 0) / 100))}</td></tr>`;
    }).join('');
    const righeOp = ops.map(o => {
      const wc = getWorkCenter(o.workCenterId);
      return `<tr><td>🔧</td><td>${esc(wc ? wc.name : '?')}</td>
        <td style="font-family:var(--mono);text-align:right">${fmtUom(o.hours, 'h')}</td><td>—</td>
        <td style="font-family:var(--mono);text-align:right">${fmtN((Number(o.hours) || 0) * (wc ? (Number(wc.hourlyRate) || 0) : 0))}</td></tr>`;
    }).join('');
    return itemInfoSection(`🌳 Composizione (${comps.length} ${comps.length === 1 ? 'componente' : 'componenti'}${ops.length ? ' · ' + ops.length + (ops.length === 1 ? ' lavorazione' : ' lavorazioni') : ''})`,
      `<div class="table-wrap"><table>
        <thead><tr><th>Codice</th><th>Componente</th><th style="text-align:right">Q.tà</th>
          <th style="text-align:right">Scarto</th><th style="text-align:right">Costo riga</th></tr></thead>
        <tbody>${righe}${righeOp}</tbody></table></div>`);
  }

  if (it.type !== 'parte') return '';
  const rows = it.cycle || [];
  if (!rows.length) return itemInfoSection('🔧 Distinta parte e ciclo', '<div class="empty-text">Distinta parte e ciclo vuoti.</div>');
  let fase = 0;
  const righe = rows.map(r => {
    if (r.kind === 'op') {
      fase++;
      const wc = getWorkCenter(r.workCenterId);
      return `<tr><td style="font-family:var(--mono)">${cyclePhaseNumber(fase - 1)}</td>
        <td>🔧 ${esc(wc ? wc.name : '?')}${r.note ? ' — ' + esc(r.note) : ''}</td>
        <td style="text-align:right">—</td>
        <td style="font-family:var(--mono);text-align:right">${fmtN(r.cost)}</td></tr>`;
    }
    const ci = getItem(r.itemId);
    if (!ci) return `<tr><td colspan="4" class="empty-text">⚠ articolo mancante</td></tr>`;
    return `<tr><td>${codeLink(ci.id, ci.code)}</td>
      <td><span class="bom-type-tag tt-${ci.type}">${typeShort(ci.type)}</span> ${esc(ci.name)}${itemBadges(ci)}</td>
      <td style="font-family:var(--mono);text-align:right">${fmtUom(r.qty, itemUom(ci))}</td>
      <td style="font-family:var(--mono);text-align:right">${fmtN(cycleRowCost(r))}${r.costOverride != null && r.costOverride !== '' ? '<div class="empty-text" style="padding:0">forzato</div>' : ''}</td></tr>`;
  }).join('');
  // Una parte comprata da terzi ha ciclo e distinta salvati, ma non è da lì che
  // viene il suo costo: dirlo qui evita di leggere due numeri e crederli in
  // contraddizione.
  const nota = partSourcing(it) === 'buy'
    ? '<p class="empty-text" style="text-align:left;padding:6px 0 0">Questa parte si <strong>acquista</strong>: il suo costo è il prezzo a listino, non la somma di queste righe. Distinta e ciclo restano salvati e tornano a contare se l\'approvvigionamento passa a produzione interna.</p>'
    : '';
  return itemInfoSection(`🔧 Distinta parte e ciclo — ${esc(cycleCountLabel(it))}`,
    `<div class="table-wrap"><table>
      <thead><tr><th>Codice / Fase</th><th>Riga</th><th style="text-align:right">Q.tà</th><th style="text-align:right">Costo</th></tr></thead>
      <tbody>${righe}</tbody></table></div>${nota}`);
}

// Dove è usato, in forma compatta. La versione completa — con la simulazione
// del costo — resta in *Dove è usato*: quella è uno strumento, questa è una
// risposta.
function itemInfoImpieghi(it) {
  const diretti = directUses(it.id);
  if (!diretti.length) return itemInfoSection('🔗 Dove è usato', '<div class="empty-text">Non è usato da nessuna parte.</div>');
  const cime = impactedTops(it.id);
  // La quantità in colonna è quella di **questo** articolo dentro il padre, non
  // del padre: l'unità che le va accanto è la sua, e va detta una volta in testa.
  const u = itemUom(it);
  const tab = (titolo, righe) => `<div class="cat-group-title">${titolo}</div>
    <div class="table-wrap"><table>
      <thead><tr><th>Codice</th><th>Articolo</th><th style="text-align:right">${labelUom('Q.tà', u)}</th></tr></thead>
      <tbody>${righe.map(r => `<tr>
        <td>${codeLink(r.item.id, r.item.code)}</td>
        <td><span class="bom-type-tag tt-${r.item.type}">${typeShort(r.item.type)}</span> ${esc(r.item.name)}</td>
        <td style="font-family:var(--mono);text-align:right">${fmtQty(r.qty)}</td></tr>`).join('')}</tbody></table></div>`;
  const etichetta = cime.some(c => c.item.type === 'macchina') ? 'Macchine impattate' : 'Assiemi di testa impattati';
  return itemInfoSection('🔗 Dove è usato',
    tab(`Impieghi diretti (${diretti.length})`, diretti)
    + (cime.length ? tab(`${etichetta} (${cime.length}) — q.tà per una unità, scarto compreso`, cime) : ''));
}

// In quali documenti e piani compare. È la domanda che segue sempre le altre —
// «l'ho già ordinato?», «per cosa serviva?» — e finora si rispondeva solo
// aprendo gli elenchi e filtrandoli uno per uno.
function itemInfoDocumenti(it) {
  const conRiga = (lista) => (lista || []).filter(d => (d.lines || []).some(l => l.itemId === it.id));
  const rfqs = conRiga(db.rfqs);
  const ordini = conRiga(db.orders);
  const piani = (db.plans || []).filter(p => mrpExplode(p.lines).buy.some(e => e.item.id === it.id)
    || (p.lines || []).some(l => l.itemId === it.id));
  if (!rfqs.length && !ordini.length && !piani.length) return '';
  const qtaIn = d => (d.lines || []).filter(l => l.itemId === it.id).reduce((s, l) => s + (Number(l.qty) || 0), 0);
  const voce = (icona, d, extra) => `<div class="mgmt-item">
    <span class="mgmt-item-name">${icona} <span style="font-family:var(--mono)">${esc(d.number)}</span>${d.title ? ' — ' + esc(d.title) : ''}</span>
    <span class="mgmt-item-meta">${extra}</span></div>`;
  const u = itemUom(it);
  const corpo = [
    ...rfqs.map(d => voce('📨', d, `${esc(d.status || '')} · ${fmtUom(qtaIn(d), u)}`)),
    ...ordini.map(d => voce('🧾', d, `${esc(d.status || '')} · ${fmtUom(qtaIn(d), u)} · ricevuto ${fmtUom((d.lines || []).filter(l => l.itemId === it.id).reduce((s, l) => s + (Number(l.received) || 0), 0), u)}`)),
    ...piani.map(p => voce('📋', p, p.active === false ? 'piano chiuso' : 'piano aperto')),
  ].join('');
  return itemInfoSection('📄 Documenti e piani in cui compare', `<div class="mgmt-list">${corpo}</div>`);
}

function itemInfoRevisioni(it) {
  if (!hasRevisions(it)) return '';
  const revs = revisionsOf(it.id);
  if (!revs.length) return itemInfoSection('🕘 Revisioni', `<div class="empty-text">Nessun rilascio: si sta lavorando sulla <strong>${esc(itemRev(it))}</strong>, la prima.</div>`);
  return itemInfoSection('🕘 Revisioni', `<div class="mgmt-list">${revs.map(r => {
      const tot = r.snapshot && r.snapshot.cost ? r.snapshot.cost.total : null;
      return `<div class="mgmt-item">
        <span class="mgmt-item-name"><strong>${esc(r.rev || '')}</strong>${r.motivo ? ' — ' + esc(r.motivo) : ''}</span>
        <span class="mgmt-item-meta">${esc(fmtStamp(r.date))}${tot != null ? ' · costo congelato ' + fmtPer(tot, itemUom(it)) : ''}</span>
      </div>`;
    }).join('')}</div>
    <p class="empty-text" style="text-align:left;padding:6px 0 0">In lavorazione: <strong>${esc(itemRev(it))}</strong>. Le revisioni rilasciate sono fotografie e non cambiano più.</p>`);
}
