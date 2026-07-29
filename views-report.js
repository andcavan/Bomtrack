// ═══════════════════════════════════════════════════════════
//  BOMTRACK — views-report.js
// ═══════════════════════════════════════════════════════════
// Vista Costificazione: distinta esplosa, incidenza delle voci, export.
// Classic script, scope globale condiviso con gli altri: nessun modulo e
// nessun build, così index.html continua ad aprirsi con un doppio click.

// ═══════════════════════════════════════════════════════════
//  VISTA: COSTIFICAZIONE & REPORT
// ═══════════════════════════════════════════════════════════
function flattenBom(itemId, qty, scrap, level, rows, ancestors) {
  const it = getItem(itemId); if (!it) return;
  const cyc = ancestors.includes(itemId);
  const unit = cyc ? 0 : costOf(itemId).total;
  const factor = (Number(qty) || 0) * (1 + (Number(scrap) || 0) / 100);
  rows.push({ level, code: it.code, name: it.name + (cyc ? ' (ciclo!)' : ''), type: typeLabel(it.type),
    qty: Number(qty) || 0, uom: it.uom || '', unit, line: unit * factor });
  if (isAssembly(it.type) && !cyc) {
    (it.components || []).forEach(c => flattenBom(c.itemId, c.qty, c.scrapPct, level + 1, rows, ancestors.concat(itemId)));
  }
  // Una Parte esplode il proprio ciclo di lavorazione: i costi riga sono scalati per la quantità del padre,
  // così la somma dei figli coincide col costo riga della Parte.
  // (col calcolo "solo costo unitario" il ciclo non concorre al costo: niente esplosione)
  if (it.type === 'parte' && !cyc && partCostMode(it) !== 'unit') {
    (it.cycle || []).forEach(row => {
      const rowCost = cycleRowCost(row);
      if (row.kind === 'op') {
        const wc = db.workCenters.find(w => w.id === row.workCenterId);
        const sup = supplierName(row.supplierId);
        rows.push({ level: level + 1, code: '', name: '🔧 ' + (wc ? wc.name : '?') + (sup ? ' · ' + sup : ''),
          type: 'Lavorazione', qty: 1, uom: '', unit: rowCost, line: rowCost * factor });
      } else {
        const ci = getItem(row.itemId); if (!ci) return;
        rows.push({ level: level + 1, code: ci.code, name: ci.name, type: typeLabel(ci.type),
          qty: Number(row.qty) || 0, uom: ci.uom || '', unit: costOf(row.itemId).total, line: rowCost * factor });
      }
    });
    // Col calcolo "costo unitario + ciclo" anche la quota manuale è una riga,
    // altrimenti la somma dei figli non tornerebbe col costo della Parte.
    const manual = Number(it.unitCost) || 0;
    if (partCostMode(it) === 'sum' && manual) {
      rows.push({ level: level + 1, code: '', name: 'Costo unitario (manuale)', type: 'Costo',
        qty: 1, uom: it.uom || '', unit: manual, line: manual * factor });
    }
  }
}
function renderReport() {
  invalidateCaches();
  // sincronizza i due selettori
  if (!reportBomId) reportBomId = currentBomId;
  ensureCurrentBom(); if (!reportBomId) reportBomId = currentBomId;
  const sel = document.getElementById('report-select');
  if (document.activeElement !== sel) sel.innerHTML = productOptions(reportBomId);
  reportBomId = val('report-select') || reportBomId;
  const it = getItem(reportBomId);
  const wrap = document.getElementById('report-content');
  if (!it) { wrap.innerHTML = '<div class="empty-text">Seleziona un prodotto.</div>'; return; }

  const c = costOf(it.id);
  const price = sellingPrice(it.id);
  const cats = [
    { name: 'Materiale', val: c.material, color: 'var(--orange)' },
    { name: 'Commerciali', val: c.purchased, color: 'var(--accent)' },
    { name: 'Parti', val: c.parts, color: 'var(--purple)' },
    { name: 'Lavorazioni', val: c.labor, color: 'var(--green)' },
    { name: 'Spese generali', val: c.overhead, color: 'var(--text-dim)' },
  ];
  const mx = Math.max(...cats.map(x => x.val), 0.0001);
  const bars = cats.map(x => `<div class="breakdown-row">
    <div class="breakdown-name">${x.name}</div>
    <div class="breakdown-bar"><div class="breakdown-fill" style="width:${x.val / mx * 100}%;background:${x.color}"></div></div>
    <div class="breakdown-stats"><span>${fmtN(x.val)}</span><span style="color:var(--text-dim)">${c.total ? (x.val / c.total * 100).toFixed(1) : '0.0'}%</span></div>
  </div>`).join('');

  const rows = [];
  flattenBom(it.id, 1, 0, 0, rows, []);
  const tableRows = rows.map(r => `<tr>
    <td style="font-family:var(--mono)">${esc(r.code)}</td>
    <td style="padding-left:${12 + r.level * 18}px">${r.level ? '└ ' : ''}${esc(r.name)}</td>
    <td style="color:var(--text-dim)">${esc(r.type)}</td>
    <td style="font-family:var(--mono)">${r.qty} ${esc(r.uom)}</td>
    <td style="font-family:var(--mono)">${fmtN(r.unit)}</td>
    <td style="font-family:var(--mono)">${fmtN(r.line)}</td></tr>`).join('');

  wrap.innerHTML = `
    <div class="cost-summary">
      ${kpi('Materiale', fmtN(c.material), 'orange')}
      ${kpi('Commerciali', fmtN(c.purchased), 'accent')}
      ${kpi('Parti', fmtN(c.parts), 'purple')}
      ${kpi('Lavorazioni', fmtN(c.labor), 'green')}
      ${kpi('Spese generali', fmtN(c.overhead), '')}
      ${kpi('Costo totale', fmtN(c.total), '')}
      ${kpi('Prezzo vendita', fmtN(price), 'green')}
    </div>
    <div class="breakdown-section" style="margin-bottom:20px"><h3 class="sub-title">Incidenza voci di costo</h3>${bars}</div>
    <div class="breakdown-section"><h3 class="sub-title">Distinta base esplosa</h3>
      <div class="table-wrap"><table><thead><tr><th>Codice</th><th>Articolo</th><th>Tipo</th><th>Q.tà</th><th>Costo un.</th><th>Costo riga</th></tr></thead>
      <tbody>${tableRows}</tbody></table></div></div>`;
}

// ─── EXPORT ───
function reportRows() { const r = []; flattenBom(reportBomId || currentBomId, 1, 0, 0, r, []); return r; }
function exportBomExcel() {
  const it = getItem(reportBomId || currentBomId); if (!it) { showToast('Seleziona un prodotto', 'error'); return; }
  const c = costOf(it.id);
  const rows = reportRows();
  const data = [['Codice', 'Articolo', 'Livello', 'Tipo', 'Quantità', 'U.M.', 'Costo unitario', 'Costo riga']];
  rows.forEach(r => data.push([r.code, '  '.repeat(r.level) + r.name, r.level, r.type, r.qty, r.uom, +r.unit.toFixed(4), +r.line.toFixed(4)]));
  data.push([]);
  data.push(['', 'Materiale', '', '', '', '', '', +c.material.toFixed(2)]);
  data.push(['', 'Commerciali', '', '', '', '', '', +c.purchased.toFixed(2)]);
  data.push(['', 'Parti', '', '', '', '', '', +c.parts.toFixed(2)]);
  data.push(['', 'Lavorazioni', '', '', '', '', '', +c.labor.toFixed(2)]);
  data.push(['', 'Spese generali', '', '', '', '', '', +c.overhead.toFixed(2)]);
  data.push(['', 'COSTO TOTALE', '', '', '', '', '', +c.total.toFixed(2)]);
  data.push(['', 'PREZZO VENDITA', '', '', '', '', '', +sellingPrice(it.id).toFixed(2)]);
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Distinta');
  XLSX.writeFile(wb, `Distinta_${it.code || it.name}.xlsx`);
  showToast('Excel esportato');
}
function exportBomPDF() {
  const it = getItem(reportBomId || currentBomId); if (!it) { showToast('Seleziona un prodotto', 'error'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const c = costOf(it.id);
  doc.setFontSize(15); doc.text(`Distinta base — ${it.name}`, 14, 16);
  doc.setFontSize(10); doc.setTextColor(120);
  doc.text(`Codice: ${it.code || '-'}   Data: ${new Date().toLocaleDateString('it-IT')}`, 14, 23);
  const rows = reportRows().map(r => ['  '.repeat(r.level) + r.code, '  '.repeat(r.level) + r.name, r.type, r.qty + ' ' + r.uom, fmtN(r.unit), fmtN(r.line)]);
  doc.autoTable({
    startY: 28, head: [['Codice', 'Articolo', 'Tipo', 'Q.tà', 'Costo un.', 'Costo riga']], body: rows,
    styles: { fontSize: 8 }, headStyles: { fillColor: [58, 123, 232] },
  });
  let y = doc.lastAutoTable.finalY + 8;
  const sum = [
    ['Materiale', fmtN(c.material)], ['Commerciali', fmtN(c.purchased)], ['Parti', fmtN(c.parts)], ['Lavorazioni', fmtN(c.labor)],
    ['Spese generali', fmtN(c.overhead)], ['COSTO TOTALE', fmtN(c.total)], ['PREZZO VENDITA', fmtN(sellingPrice(it.id))],
  ];
  doc.autoTable({ startY: y, body: sum, theme: 'plain', styles: { fontSize: 10 },
    columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'right', fontStyle: 'bold' } }, tableWidth: 90 });
  doc.save(`Distinta_${it.code || it.name}.pdf`);
  showToast('PDF esportato');
}
