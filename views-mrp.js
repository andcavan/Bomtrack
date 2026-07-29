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
// → { buy: [{ item, qty }], make: [{ item, qty }], cycle: bool }
function mrpExplode(lines) {
  const buy = new Map(), make = new Map();
  const out = { cycle: false };
  (lines || []).forEach(l => mrpDescend(l.itemId, Number(l.qty) || 0, [], buy, make, out));
  const perCodice = m => Array.from(m.values()).sort((a, b) => String(a.item.code).localeCompare(String(b.item.code)));
  return { buy: perCodice(buy), make: perCodice(make), cycle: out.cycle };
}
function mrpAdd(map, it, qty) {
  const e = map.get(it.id);
  if (e) e.qty += qty;
  else map.set(it.id, { item: it, qty });
}
function mrpDescend(itemId, qty, ancestors, buy, make, out) {
  const it = getItem(itemId);
  if (!it || !(qty > 0)) return;
  // Anello: si segnala e si smette di scendere, come fa flattenBom
  if (ancestors.includes(itemId)) { out.cycle = true; return; }
  if (it.type === 'materiale' || it.type === 'acquistato') { mrpAdd(buy, it, qty); return; }
  const next = ancestors.concat(itemId);
  if (it.type === 'parte') {
    mrpAdd(make, it, qty);
    // Col calcolo "solo costo unitario" distinta e ciclo sono documentali: non
    // concorrono al costo e non generano fabbisogno (stessa regola dell'albero).
    if (partCostMode(it) === 'unit') return;
    (it.cycle || []).forEach(r => {
      if (r.kind === 'op') return;   // le lavorazioni non si comprano a magazzino
      mrpDescend(r.itemId, qty * (Number(r.qty) || 0), next, buy, make, out);
    });
    return;
  }
  // assieme: la quantità di riga porta con sé lo scarto, come nel rollup
  (it.components || []).forEach(c => {
    const f = (Number(c.qty) || 0) * (1 + (Number(c.scrapPct) || 0) / 100);
    mrpDescend(c.itemId, qty * f, next, buy, make, out);
  });
}
// Riga d'acquisto completa: il prezzo è quello IN USO nella costificazione, la
// quotazione migliore si segnala soltanto — nessun prezzo cambia da sé.
function mrpBuyRow(entry) {
  const it = entry.item;
  const attiva = activePriceRow(it);
  const price = Number(it[costField(it)]) || 0;
  const best = bestPriceRow(it);
  const bestPrice = best ? (Number(best.price) || 0) : null;
  const minQty = attiva && attiva.minQty !== '' && attiva.minQty != null ? (Number(attiva.minQty) || 0) : 0;
  return {
    item: it, qty: entry.qty, uom: it.uom || '',
    supplierId: (attiva && attiva.supplierId) || it.supplierId || '',
    price, amount: price * entry.qty,
    bestPrice, saving: (bestPrice != null && bestPrice < price) ? (price - bestPrice) * entry.qty : 0,
    minQty, underMin: minQty > 0 && entry.qty < minQty,
  };
}
function mrpBuyRows(plan) { return mrpExplode(plan.lines).buy.map(mrpBuyRow); }
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
  const p = stampNew({ id: gid(), number: nextPlanNumber(), title: '', date: nowISO().slice(0, 10),
    notes: '', lines: [], active: true });
  if (!db.plans) db.plans = [];
  db.plans.push(p); saveDB();
  currentPlanId = p.id; mrpView = 'edit'; renderMrp();
}
function duplicatePlan(id) {
  if (!roleGuard('docs')) return;
  const src = getPlan(id); if (!src) return;
  const p = stampNew({ id: gid(), number: nextPlanNumber(), title: (src.title || src.number) + ' (copia)',
    date: nowISO().slice(0, 10), notes: src.notes || '',
    lines: (src.lines || []).map(l => ({ id: gid(), itemId: l.itemId, qty: l.qty })), active: true });
  db.plans.push(p); saveDB();
  currentPlanId = p.id; mrpView = 'edit'; renderMrp();
  showToast('Piano ' + p.number + ' creato dalla copia');
}
function delPlan(id) {
  if (!roleGuard('docs')) return;
  const p = getPlan(id); if (!p) return;
  askConfirm(`Eliminare il piano ${p.number}?`, () => {
    db.plans = db.plans.filter(x => x.id !== id);
    if (currentPlanId === id) { currentPlanId = null; mrpView = 'list'; }
    saveDB(); renderMrp(); showToast('Piano eliminato');
  });
}
function openPlanEdit(id) { currentPlanId = id; mrpView = 'edit'; renderMrp(); }
function planBackToList() { mrpView = 'list'; currentPlanId = null; renderMrp(); }
function planSearchInput() { debounced('mrp', renderMrp); }
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
    else p.lines.push({ id: gid(), itemId, qty: 1 });
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
function planDelLine(id, lineId) {
  if (!roleGuard('docs')) return;
  const p = getPlan(id); if (!p) return;
  p.lines = p.lines.filter(x => x.id !== lineId);
  touch(p); saveDB(); renderMrp();
}
function toggleMrpGroup() { mrpGrouped = !mrpGrouped; renderMrp(); }

// ─── Disegno ───
function renderMrp() {
  invalidateCaches();
  const host = document.getElementById('view-mrp');
  if (mrpView === 'edit' && getPlan(currentPlanId)) host.innerHTML = renderPlanEdit(currentPlanId);
  else { mrpView = 'list'; host.innerHTML = renderPlanList(); }
}
function renderPlanList() {
  const q = (val('plan-search') || '').toLowerCase();
  const tutti = (db.plans || []).slice().sort((a, b) => (b.number || '').localeCompare(a.number || ''));
  const list = q ? tutti.filter(p => (p.number + ' ' + (p.title || '')).toLowerCase().includes(q)) : tutti;
  const rows = list.map(p => {
    const n = (p.lines || []).length;
    return `<div class="mgmt-item">
      <span class="mgmt-item-name"><span style="font-family:var(--mono)">${esc(p.number)}</span> — ${esc(p.title || '(senza titolo)')}</span>
      <span class="mgmt-item-meta">${n} ${n === 1 ? 'articolo a piano' : 'articoli a piano'}${p.date ? ' · ' + fmtDateIt(p.date) : ''}</span>
      <div class="mgmt-item-actions">
        <button class="mini-btn" onclick="openPlanEdit('${p.id}')" title="Apri">✏</button>
        <button class="mini-btn" onclick="duplicatePlan('${p.id}')" title="Duplica">📋</button>
        <button class="mini-btn danger" onclick="delPlan('${p.id}')" title="Elimina">🗑</button>
      </div></div>`;
  }).join('') || `<div class="empty-text">${tutti.length
    ? 'Nessun piano con questa ricerca.'
    : 'Nessun piano di produzione. Creane uno per sapere cosa comprare per costruire N macchine.'}</div>`;
  return `<div class="manage-wrap">
    <div class="bom-toolbar">
      <h2 class="section-title">📋 Fabbisogno materiali</h2>
      <button class="add-btn-sm" onclick="newPlan()">+ Nuovo piano</button>
    </div>
    <div class="catalog-filters">
      <input type="text" class="search" id="plan-search" value="${esc(val('plan-search'))}" placeholder="🔍 Numero o titolo..." oninput="planSearchInput()">
    </div>
    <div class="mgmt-list">${rows}</div></div>`;
}
function renderPlanEdit(id) {
  const p = getPlan(id);
  const exp = mrpExplode(p.lines);
  const buy = exp.buy.map(mrpBuyRow);
  const totale = buy.reduce((s, r) => s + r.amount, 0);
  const fornitori = new Set(buy.filter(r => r.supplierId).map(r => r.supplierId)).size;
  const risparmio = buy.reduce((s, r) => s + r.saving, 0);

  const planRows = (p.lines || []).map(l => {
    const it = getItem(l.itemId);
    if (!it) return `<tr><td colspan="4" class="empty-text">⚠ articolo mancante</td>
      <td class="line-actions"><button class="mini-btn danger" onclick="planDelLine('${id}','${l.id}')">🗑</button></td></tr>`;
    return `<tr>
      <td style="font-family:var(--mono)">${esc(it.code)}</td>
      <td>${esc(it.name)}<span class="bom-type-tag tt-${it.type}" style="margin-left:6px">${typeShort(it.type)}</span></td>
      <td>${esc(it.uom || '')}</td>
      <td><input type="number" class="rfq-qty-input" min="0" step="any" value="${Number(l.qty) || 0}"
        onchange="planSetLineQty('${id}','${l.id}',this.value)"></td>
      <td class="line-actions"><button class="mini-btn danger" onclick="planDelLine('${id}','${l.id}')" title="Togli dal piano">🗑</button></td></tr>`;
  }).join('') || `<tr><td colspan="5" class="empty-text">Nessun articolo a piano. Usa "+ Aggiungi al piano".</td></tr>`;

  return `<div class="manage-wrap">
    <div class="bom-toolbar">
      <button class="btn-outline" onclick="planBackToList()">← Elenco</button>
      <h2 class="section-title" style="margin:0">📋 ${esc(p.number)}</h2>
      <button class="export-btn-xls" onclick="exportMrpExcel('${id}')">📗 Esporta Excel</button>
      <button class="export-btn-pdf" onclick="exportMrpPDF('${id}')">📄 Esporta PDF</button>
    </div>
    <div class="modal-grid">
      <div class="modal-field"><label>Titolo</label>
        <input id="plan-title" value="${esc(p.title || '')}" placeholder="es. Lotto settembre" onchange="planSetField('${id}','title',this.value)"></div>
      <div class="modal-field"><label>Data</label>
        <input type="date" id="plan-date" value="${esc(p.date || '')}" onchange="planSetField('${id}','date',this.value)"></div>
      <div class="modal-field" style="grid-column:1/-1"><label>Note</label>
        <input id="plan-notes" value="${esc(p.notes || '')}" onchange="planSetField('${id}','notes',this.value)"></div>
    </div>
    ${stampLine(p)}

    <div class="mrp-section">
      <div class="cycle-section-head">
        <h3>🏗 Da produrre</h3>
        <button class="add-btn-sm" onclick="planAddModal('${id}')">+ Aggiungi al piano</button>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Codice</th><th>Articolo</th><th>U.M.</th><th style="width:120px">Q.tà</th><th></th></tr></thead>
        <tbody>${planRows}</tbody></table></div>
    </div>

    <div class="cost-summary">
      ${kpi('Totale acquisti', fmtN(totale), 'accent')}
      ${kpi('Articoli da comprare', String(buy.length), 'orange')}
      ${kpi('Fornitori coinvolti', String(fornitori), '')}
      ${kpi('Parti da fabbricare', String(exp.make.length), 'purple')}
    </div>
    ${exp.cycle ? '<div class="empty-text" style="color:var(--red)">⚠ Rilevato riferimento ciclico nelle distinte: il fabbisogno è troncato su quel ramo.</div>' : ''}
    ${risparmio > 0 ? `<div class="empty-text" style="text-align:left">↓ Scegliendo ovunque la quotazione più bassa a listino il totale scenderebbe di <strong>${fmtN(risparmio)}</strong>. Il prezzo in uso si cambia dal listino dell'articolo.</div>` : ''}

    <div class="mrp-section">
      <div class="cycle-section-head">
        <h3>📦 Da acquistare</h3>
        <button class="btn-outline${mrpGrouped ? ' active' : ''}" onclick="toggleMrpGroup()">${mrpGrouped ? '☑' : '☐'} Raggruppa per fornitore</button>
      </div>
      ${mrpBuyTable(buy)}
    </div>

    <div class="mrp-section">
      <div class="cycle-section-head"><h3>🏭 Da fabbricare</h3></div>
      ${mrpMakeTable(exp.make)}
    </div></div>`;
}
function mrpBuyLineHtml(r) {
  const seg = [];
  if (r.bestPrice != null && r.saving > 0) seg.push(`<span class="price-best" title="A listino c'è ${fmtN(r.bestPrice)}: risparmio ${fmtN(r.saving)}">↓ ${fmtN(r.saving)}</span>`);
  if (r.underMin) seg.push(`<span class="mrp-warn" title="Quantità minima del fornitore: ${r.minQty}">⚠ sotto il minimo</span>`);
  return `<tr>
    <td style="font-family:var(--mono)">${esc(r.item.code)}</td>
    <td>${esc(r.item.name)} ${seg.join(' ')}</td>
    <td>${esc(supplierName(r.supplierId) || '—')}</td>
    <td>${esc(r.uom)}</td>
    <td style="font-family:var(--mono);text-align:right">${fmtQty(r.qty)}</td>
    <td style="font-family:var(--mono);text-align:right">${fmtN(r.price)}</td>
    <td style="font-family:var(--mono);text-align:right">${fmtN(r.amount)}</td></tr>`;
}
function mrpBuyTable(rows) {
  if (!rows.length) return '<div class="empty-text">Niente da comprare: il piano è vuoto o i suoi articoli non hanno distinta.</div>';
  const head = `<thead><tr><th>Codice</th><th>Articolo</th><th>Fornitore</th><th>U.M.</th>
    <th style="text-align:right">Q.tà</th><th style="text-align:right">Prezzo</th><th style="text-align:right">Importo</th></tr></thead>`;
  const totale = rows.reduce((s, r) => s + r.amount, 0);
  let body;
  if (mrpGrouped) {
    body = mrpGroupBySupplier(rows).map(g => `
      <tr class="mrp-group"><td colspan="6">🏭 ${esc(g.name)} — ${g.rows.length} ${g.rows.length === 1 ? 'articolo' : 'articoli'}</td>
        <td style="font-family:var(--mono);text-align:right">${fmtN(g.total)}</td></tr>
      ${g.rows.map(mrpBuyLineHtml).join('')}`).join('');
  } else {
    body = rows.map(mrpBuyLineHtml).join('');
  }
  return `<div class="table-wrap"><table>${head}<tbody>${body}
    <tr class="mrp-total"><td colspan="6">Totale acquisti</td>
      <td style="font-family:var(--mono);text-align:right">${fmtN(totale)}</td></tr></tbody></table></div>`;
}
function mrpMakeTable(make) {
  if (!make.length) return '<div class="empty-text">Nessuna parte da fabbricare in questo piano.</div>';
  const rows = make.map(e => {
    const c = costOf(e.item.id).total;
    return `<tr>
      <td style="font-family:var(--mono)">${esc(e.item.code)}</td>
      <td>${esc(e.item.name)}</td>
      <td>${esc(e.item.uom || '')}</td>
      <td style="font-family:var(--mono);text-align:right">${fmtQty(e.qty)}</td>
      <td style="font-family:var(--mono);text-align:right">${fmtN(c)}</td>
      <td style="font-family:var(--mono);text-align:right">${fmtN(c * e.qty)}</td></tr>`;
  }).join('');
  return `<div class="table-wrap"><table>
    <thead><tr><th>Codice</th><th>Parte</th><th>U.M.</th>
      <th style="text-align:right">Q.tà</th><th style="text-align:right">Costo un.</th><th style="text-align:right">Importo</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}
// Le quantità esplose sono float (scarti e frazioni): si mostrano senza zeri inutili
function fmtQty(n) {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? String(v) : v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

// ─── Export ───
function exportMrpExcel(id) {
  const p = getPlan(id); if (!p) return;
  const exp = mrpExplode(p.lines);
  const buy = exp.buy.map(mrpBuyRow);
  const acquisti = [['Codice', 'Articolo', 'Fornitore', 'U.M.', 'Quantità', 'Prezzo', 'Importo']];
  (mrpGrouped ? mrpGroupBySupplier(buy).flatMap(g => g.rows) : buy).forEach(r =>
    acquisti.push([r.item.code, r.item.name, supplierName(r.supplierId) || '', r.uom, +r.qty.toFixed(3), +r.price.toFixed(4), +r.amount.toFixed(2)]));
  acquisti.push([]);
  acquisti.push(['', 'TOTALE', '', '', '', '', +buy.reduce((s, r) => s + r.amount, 0).toFixed(2)]);
  const produzione = [['Codice', 'Parte', 'U.M.', 'Quantità', 'Costo unitario', 'Importo']];
  exp.make.forEach(e => {
    const c = costOf(e.item.id).total;
    produzione.push([e.item.code, e.item.name, e.item.uom || '', +e.qty.toFixed(3), +c.toFixed(4), +(c * e.qty).toFixed(2)]);
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(acquisti), 'Acquisti');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(produzione), 'Produzione');
  XLSX.writeFile(wb, `Fabbisogno_${p.number}.xlsx`);
  showToast('Excel esportato');
}
function exportMrpPDF(id) {
  const p = getPlan(id); if (!p) return;
  const exp = mrpExplode(p.lines);
  const buy = exp.buy.map(mrpBuyRow);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(15); doc.text(`Fabbisogno materiali — ${p.number}`, 14, 16);
  doc.setFontSize(10); doc.setTextColor(120);
  doc.text(`${p.title || ''}${p.title ? '   ' : ''}Data: ${p.date ? fmtDateIt(p.date) : new Date().toLocaleDateString('it-IT')}`, 14, 23);
  doc.autoTable({
    startY: 28, head: [['Codice', 'Da produrre', 'Q.tà', 'U.M.']],
    body: (p.lines || []).map(l => { const it = getItem(l.itemId); return [it ? it.code : '?', it ? it.name : '⚠ mancante', fmtQty(l.qty), it ? (it.uom || '') : '']; }),
    styles: { fontSize: 8 }, headStyles: { fillColor: [58, 123, 232] },
  });
  const righe = (mrpGrouped ? mrpGroupBySupplier(buy).flatMap(g => g.rows) : buy)
    .map(r => [r.item.code, r.item.name, supplierName(r.supplierId) || '—', fmtQty(r.qty) + ' ' + r.uom, fmtN(r.price), fmtN(r.amount)]);
  righe.push(['', 'TOTALE', '', '', '', fmtN(buy.reduce((s, r) => s + r.amount, 0))]);
  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 8,
    head: [['Codice', 'Da acquistare', 'Fornitore', 'Q.tà', 'Prezzo', 'Importo']], body: righe,
    styles: { fontSize: 8 }, headStyles: { fillColor: [58, 123, 232] },
  });
  if (exp.make.length) {
    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 8,
      head: [['Codice', 'Da fabbricare', 'Q.tà', 'U.M.', 'Costo un.', 'Importo']],
      body: exp.make.map(e => { const c = costOf(e.item.id).total; return [e.item.code, e.item.name, fmtQty(e.qty), e.item.uom || '', fmtN(c), fmtN(c * e.qty)]; }),
      styles: { fontSize: 8 }, headStyles: { fillColor: [155, 109, 255] },
    });
  }
  doc.save(`Fabbisogno_${p.number}.pdf`);
  showToast('PDF esportato');
}
