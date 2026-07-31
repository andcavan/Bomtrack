// ═══════════════════════════════════════════════════════════
//  BOMTRACK — views-bom.js
// ═══════════════════════════════════════════════════════════
// Vista Distinte base e finestra "Dove è usato" con la simulazione dei costi.
// Classic script, scope globale condiviso con gli altri: nessun modulo e
// nessun build, così index.html continua ad aprirsi con un doppio click.

// ═══════════════════════════════════════════════════════════
//  VISTA: DISTINTE BASE
// ═══════════════════════════════════════════════════════════
// ─── Filtri dell'elenco distinte ───
// Oltre il centinaio di assiemi il menu a tendina non si scorre più. I criteri
// sono gli stessi della vista Cicli: testo, livello e — al posto della famiglia,
// che gli assiemi non usano — la macchina di appartenenza.
function bomProducts() { return (db.items || []).filter(i => isAssembly(i.type)); }
function bomFilteredProducts() {
  const q = (val('bom-search') || '').toLowerCase();
  const tipo = val('bom-type');
  const mac = val('bom-machine');
  let rows = bomProducts();
  if (tipo) rows = rows.filter(i => i.type === tipo);
  // La macchina stessa vale come "appartenente a sé": filtrando per una macchina
  // ci si aspetta di trovarci dentro anche lei, non solo i suoi gruppi.
  if (mac) rows = rows.filter(i => i.id === mac || i.machineItemId === mac);
  if (q) rows = rows.filter(i => (i.code + ' ' + i.name).toLowerCase().includes(q));
  return rows.sort((a, b) => String(a.code).localeCompare(String(b.code)));
}
// Ripopola il menu delle macchine conservando la scelta, se ancora valida
// (stesso patto di updateCycleFamilyFilters).
function updateBomMachineFilter() {
  const sel = document.getElementById('bom-machine'); if (!sel) return;
  const macs = (db.items || []).filter(i => i.type === 'macchina')
    .sort((a, b) => String(a.code).localeCompare(String(b.code)));
  const keep = macs.some(m => m.id === sel.value) ? sel.value : '';
  sel.innerHTML = `<option value="">Tutte le macchine</option>` +
    macs.map(m => `<option value="${m.id}" ${m.id === keep ? 'selected' : ''}>${esc(m.code)} — ${esc(m.name)}</option>`).join('');
}
function bomSearchInput() { debounced('bom', renderBom); }
function onBomFilterChange() { renderBom(); }

function productOptions(selectedId) {
  const opt = (i) => `<option value="${i.id}" ${i.id === selectedId ? 'selected' : ''}>${itemBadgesTxt(i)}${esc(i.code)} — ${esc(i.name)}</option>`;
  // La distinta aperta resta sempre in elenco, anche se non passa i filtri:
  // altrimenti restringere la ricerca chiuderebbe l'albero sotto le mani.
  const rows = bomFilteredProducts();
  const aperta = getItem(selectedId);
  if (aperta && isAssembly(aperta.type) && !rows.some(i => i.id === selectedId)) rows.push(aperta);
  const groups = [['macchina', 'Macchine'], ['gruppo', 'Gruppi'], ['sottogruppo', 'Sottogruppi']];
  let h = groups.map(([t, lbl]) => {
    const items = rows.filter(i => i.type === t);
    return items.length ? `<optgroup label="${lbl}">${items.map(opt).join('')}</optgroup>` : '';
  }).join('');
  if (!h) h = '<option value="">— nessun assieme —</option>';
  return h;
}
// La selezione ricade sui prodotti NON filtrati: i filtri restringono l'elenco,
// non decidono cosa si sta guardando.
function ensureCurrentBom() {
  const products = bomProducts();
  if (!currentBomId || !products.some(p => p.id === currentBomId)) {
    const m = products.find(p => p.type === 'macchina') || products[0];
    currentBomId = m ? m.id : null;
  }
}
function onBomSelect() { currentBomId = val('bom-select'); bomExpanded = new Set(); renderBom(); }

function renderBom() {
  invalidateCaches();   // rete di sicurezza: la cache dei costi vive dentro un singolo disegno
  updateBomMachineFilter();
  ensureCurrentBom();
  document.getElementById('bom-select').innerHTML = productOptions(currentBomId);
  const conta = document.getElementById('bom-count');
  if (conta) {
    const n = bomFilteredProducts().length, tot = bomProducts().length;
    conta.textContent = n === tot ? `${tot} ${tot === 1 ? 'distinta' : 'distinte'}` : `${n} di ${tot}`;
  }
  const it = getItem(currentBomId);
  const summary = document.getElementById('bom-cost-summary');
  const tree = document.getElementById('bom-tree');
  if (!it) {
    summary.innerHTML = '';
    tree.innerHTML = '<div class="empty-text">Nessun prodotto. Crea una macchina con "+ Nuova macchina".</div>';
    return;
  }
  const c = costOf(it.id);
  const price = sellingPrice(it.id);
  summary.innerHTML = [
    kpi('Materiale', fmtN(c.material), 'orange'),
    kpi('Commerciali', fmtN(c.purchased), 'accent'),
    kpi('Parti', fmtN(c.parts), 'purple'),
    kpi('Lavorazioni', fmtN(c.labor), 'green'),
    kpi('Spese generali', fmtN(c.overhead), ''),
    kpi('Costo totale', fmtN(c.total), ''),
    kpi('Prezzo vendita', fmtN(price), 'green'),
  ].join('') + (c.cycle ? '<div class="empty-text" style="color:var(--red)">⚠ Rilevato riferimento ciclico nella distinta!</div>' : '');

  // Albero
  const head = `<div class="bom-head"><span>Articolo</span><span class="num">Q.tà</span><span>U.M.</span>
    <span class="num">Costo un.</span><span class="num">Scarto %</span><span class="num">Costo riga</span><span style="text-align:right">Azioni</span></div>`;
  const rootRow = renderBomRootNode(it);
  const rows = (it.components || []).map((comp, idx) =>
    renderBomNode(comp, 1, it.id, true, idx, it.id, [it.id], bomPos('', idx))).join('');
  const opsRow = renderOpsBlock(it, true);
  tree.innerHTML = head + rootRow + (rows || `<div class="empty-text">Nessun componente. Usa "+ Aggiungi componente".</div>`) + opsRow;
}
function kpi(label, value, cls) {
  return `<div class="kpi-card ${cls}"><div class="kpi-value">${value}</div><div class="kpi-label">${label}</div></div>`;
}

// Posizione gerarchica di una riga: "1", poi "1.2", "1.2.1"… La radice non ha numero,
// e sotto ogni padre la numerazione riparte da 1.
function bomPos(parentPos, idx) { return parentPos ? parentPos + '.' + (idx + 1) : String(idx + 1); }

// Render ricorsivo di un nodo (componente). editable = riga di primo livello dell'articolo aperto.
function renderBomNode(comp, level, parentId, editable, idx, pathPrefix, ancestorIds, pos) {
  const child = getItem(comp.itemId);
  if (!child) return `<div class="bom-node"><span class="bom-name"><span class="bom-pos">${esc(pos || '')}</span>⚠ articolo mancante</span></div>`;
  const nodeKey = pathPrefix + '>' + comp.itemId + '#' + idx;
  const cyc = ancestorIds.includes(comp.itemId);
  const isProd = isAssembly(child.type);
  // Anche una Parte è espandibile: mostra il proprio ciclo di lavorazione (articoli + lavorazioni).
  // Col calcolo "solo costo unitario" il ciclo non concorre al costo e non va mostrato nell'albero.
  const hasCycle = child.type === 'parte' && (child.cycle || []).length > 0 && partSourcing(child) !== 'buy';
  const expandable = !cyc && (hasCycle || (isProd && (child.components || []).length > 0));
  const expanded = bomExpanded.has(nodeKey);
  const unit = cyc ? 0 : costOf(comp.itemId).total;
  const qty = Number(comp.qty) || 0;
  const factor = qty * (1 + (Number(comp.scrapPct) || 0) / 100);
  const lineCost = unit * factor;
  const indent = (level - 1) * 18;
  const toggle = expandable
    ? `<span class="bom-toggle" onclick="toggleBom('${nodeKey}')">${expanded ? '▼' : '▶'}</span>`
    : `<span class="bom-toggle leaf">•</span>`;
  const actions = `<button class="mini-btn" title="Dove è usato e impatto costi" onclick="usageModal('${comp.itemId}')">🔗</button>`
    + (child.type === 'parte' ? `<button class="mini-btn" title="Distinta parte e ciclo di lavorazione" onclick="openCycleFor('${comp.itemId}')">🔧</button>` : '')
    + (editable
      ? `<button class="mini-btn" title="Modifica" onclick="editComponentModal(${idx})">✏</button>
         <button class="mini-btn danger" title="Elimina" onclick="delComponent(${idx})">🗑</button>`
      : '');

  let h = `<div class="bom-node" style="padding-left:${18 + indent}px">
    <span class="bom-name"><span class="bom-pos">${esc(pos || '')}</span>${toggle}
      <span class="bom-code">${esc(child.code)}</span>
      <span class="bom-type-tag tt-${child.type}">${typeShort(child.type)}</span>
      <span class="nm" title="${esc(child.name)}">${esc(child.name)}${cyc ? ' ⚠' : ''}</span>
    </span>
    <span class="num">${qty}</span>
    <span>${esc(child.uom || '')}</span>
    <span class="num cost">${fmtN(unit)}</span>
    <span class="num">${Number(comp.scrapPct) || 0}</span>
    <span class="num cost">${fmtN(lineCost)}</span>
    <span class="bom-row-actions">${actions}</span>
  </div>`;

  if (expandable && expanded) {
    if (hasCycle) {
      // Le fasi di lavorazione non prendono posizione: numerata è la distinta parte,
      // quindi il contatore avanza solo sugli articoli e la serie resta senza buchi.
      let n = 0;
      h += (child.cycle || []).map(row =>
        renderCycleBomNode(row, level + 1, row.kind === 'op' ? '' : bomPos(pos, n++))).join('');
    } else {
      h += (child.components || []).map((cc, i) =>
        renderBomNode(cc, level + 1, child.id, false, i, nodeKey, ancestorIds.concat(child.id), bomPos(pos, i))).join('');
      if ((child.operations || []).length) h += renderOpsBlock(child, false, 18 + indent + 18);
    }
  }
  return h;
}

// Riga del ciclo di lavorazione di una Parte, mostrata nell'albero della distinta (sola lettura:
// distinta parte e ciclo si modificano nella vista Cicli di lavorazione).
function renderCycleBomNode(row, level, pos) {
  const indent = (level - 1) * 18;
  const lineCost = cycleRowCost(row);
  let name, qtyCell, uom, unit;
  if (row.kind === 'op') {
    const wc = getWorkCenter(row.workCenterId);
    const sup = supplierName(row.supplierId);
    name = `<span class="bom-type-tag tt-lav">LAV</span>
      <span class="nm" title="${esc(wc ? wc.name : '?')}">🔧 ${esc(wc ? wc.name : '?')}${sup ? ' · ' + esc(sup) : ''}</span>`;
    qtyCell = '—'; uom = ''; unit = lineCost;
  } else {
    const ci = getItem(row.itemId);
    if (!ci) return `<div class="bom-node" style="padding-left:${18 + indent}px"><span class="bom-name"><span class="bom-pos">${esc(pos || '')}</span>⚠ articolo mancante</span></div>`;
    name = `<span class="bom-code">${esc(ci.code)}</span>
      <span class="bom-type-tag tt-${ci.type}">${typeShort(ci.type)}</span>
      <span class="nm" title="${esc(ci.name)}">${esc(ci.name)}</span>`;
    qtyCell = Number(row.qty) || 0; uom = ci.uom || ''; unit = costOf(row.itemId).total;
  }
  return `<div class="bom-node bom-node-cycle" style="padding-left:${18 + indent}px">
    <span class="bom-name"><span class="bom-pos">${esc(pos || '')}</span><span class="bom-toggle leaf">•</span>${name}</span>
    <span class="num">${qtyCell}</span>
    <span>${esc(uom)}</span>
    <span class="num cost">${fmtN(unit)}</span>
    <span class="num">—</span>
    <span class="num cost">${fmtN(lineCost)}</span>
    <span class="bom-row-actions"></span>
  </div>`;
}


// Riga radice: mostra l'articolo padre (macchina/gruppo selezionata) come prima riga dell'albero.
function renderBomRootNode(it) {
  const unit = costOf(it.id).total;
  return `<div class="bom-node bom-node-root">
    <span class="bom-name">
      <span class="bom-pos"></span>
      <span class="bom-toggle leaf">•</span>
      <span class="bom-code">${esc(it.code)}</span>
      <span class="bom-type-tag tt-${it.type}">${typeShort(it.type)}</span>
      <span class="nm" title="${esc(it.name)}">${esc(it.name)}</span>
    </span>
    <span class="num">1</span>
    <span>${esc(it.uom || '')}</span>
    <span class="num cost">${fmtN(unit)}</span>
    <span class="num">0</span>
    <span class="num cost">${fmtN(unit)}</span>
    <span class="bom-row-actions"></span>
  </div>`;
}

function renderOpsBlock(item, editable, padLeft) {
  const ops = item.operations || [];
  const pl = padLeft != null ? padLeft : 18;
  const tags = ops.map((o, i) => {
    const wc = getWorkCenter(o.workCenterId);
    const cost = (Number(o.hours) || 0) * (wc ? (Number(wc.hourlyRate) || 0) : 0);
    const del = editable ? ` <span style="cursor:pointer;color:var(--red)" title="Elimina" onclick="delOperation(${i})">✕</span>` : '';
    const ed = editable ? `<span style="cursor:pointer" onclick="editOperationModal(${i})">` : '<span>';
    return `<span class="bom-op-tag">${ed}🔧 ${esc(wc ? wc.name : '?')} · ${(Number(o.hours) || 0)}h · ${fmtN(cost)}</span>${del}</span>`;
  }).join('');
  if (!ops.length && !editable) return '';
  const label = editable ? 'Lavorazioni' : 'Lavorazioni (' + esc(item.name) + ')';
  return `<div class="bom-ops" style="padding-left:${pl}px"><strong style="color:var(--text-dim);font-size:11px">${label}:</strong> ${tags || '<span class="empty-text" style="padding:0">nessuna</span>'}</div>`;
}

function toggleBom(key) { if (bomExpanded.has(key)) bomExpanded.delete(key); else bomExpanded.add(key); renderBom(); }
function expandAllBom(on) {
  bomExpanded = new Set();
  if (on) {
    const walk = (item, prefix) => {
      (item.components || []).forEach((comp, idx) => {
        const key = prefix + '>' + comp.itemId + '#' + idx;
        const child = getItem(comp.itemId);
        if (!child || prefix.split('>').includes(comp.itemId)) return;
        if (isAssembly(child.type)) { bomExpanded.add(key); walk(child, key); }
        // Una Parte col ciclo si espande, ma non ha figli da percorrere oltre
        else if (child.type === 'parte' && (child.cycle || []).length) bomExpanded.add(key);
      });
    };
    const it = getItem(currentBomId); if (it) walk(it, it.id);
  }
  renderBom();
}

// ─── CRUD componenti / lavorazioni dell'articolo aperto ───
// Opzioni limitate ai tipi ammessi dal tipo del padre (regole rigide di contenimento).
function itemPickerOptions(parentType, selectedId, excludeId) {
  const allowed = ALLOWED_CHILDREN[parentType] || [];
  return allowed.map(t => {
    const opts = db.items.filter(i => i.type === t && i.id !== excludeId)
      .map(i => `<option value="${i.id}" ${i.id === selectedId ? 'selected' : ''}>${itemBadgesTxt(i)}${esc(i.code)} — ${esc(i.name)}</option>`).join('');
    return opts ? `<optgroup label="${typeLabel(t)}">${opts}</optgroup>` : '';
  }).join('');
}
// Picker a ricerca live: candidati ammessi dal tipo padre, filtrabili per codice/nome.
function pickerCandidates(parentType, excludeId) {
  const allowed = ALLOWED_CHILDREN[parentType] || [];
  return db.items
    .filter(i => allowed.includes(i.type) && i.id !== excludeId)
    .sort((a, b) => String(a.code).localeCompare(String(b.code)));
}
// Markup del campo di selezione articolo (input ricerca + lista risultati + valore nascosto).
function itemPickerField(selectedId) {
  const sel = selectedId ? getItem(selectedId) : null;
  return `<div class="modal-field"><label>Articolo</label>
      <input type="hidden" id="cmp-item" value="${selectedId ? esc(selectedId) : ''}">
      <input type="text" id="cmp-search" class="search" placeholder="🔍 Cerca codice o nome..."
        value="${sel ? esc(sel.code + ' — ' + sel.name) : ''}" oninput="debounced('picker', renderPickerResults)" autocomplete="off">
      <div id="cmp-results" class="picker-results"></div>
    </div>`;
}
function renderPickerResults() {
  const box = document.getElementById('cmp-results'); if (!box) return;
  const q = (val('cmp-search') || '').toLowerCase();
  let rows = (window.__pickerCandidates || []);
  if (q) rows = rows.filter(i => (i.code + ' ' + i.name).toLowerCase().includes(q));
  const total = rows.length;
  rows = rows.slice(0, 50);
  const sel = val('cmp-item');
  let html = rows.map(i =>
    `<div class="picker-row ${i.id === sel ? 'is-sel' : ''}" onclick="selectPickerItem('${i.id}')">
       <span class="picker-type">${typeLabel(i.type)}</span><b>${esc(i.code)}</b> — ${esc(i.name)}${itemBadges(i)}
     </div>`).join('');
  if (!html) html = `<div class="picker-empty">Nessun articolo trovato</div>`;
  else if (total > rows.length) html += `<div class="picker-empty">+${total - rows.length} altri — affina la ricerca</div>`;
  box.innerHTML = html;
}
function selectPickerItem(id) {
  const hidden = document.getElementById('cmp-item'); if (!hidden) return;
  hidden.value = id;
  const it = getItem(id);
  const search = document.getElementById('cmp-search');
  if (search && it) search.value = it.code + ' — ' + it.name;
  renderPickerResults();
}
function allowedHint(parentType) {
  const allowed = (ALLOWED_CHILDREN[parentType] || []).map(typeLabel);
  return allowed.length ? `Tipi ammessi in un ${typeLabel(parentType).toLowerCase()}: ${allowed.join(', ')}.` : '';
}
function addComponentModal() {
  if (!roleGuard('bom')) return;
  const it = getItem(currentBomId); if (!it) return;
  window.__pickerCandidates = pickerCandidates(it.type, it.id);
  if (!window.__pickerCandidates.length) { showToast('Nessun articolo dei tipi ammessi. Crealo prima in Anagrafica (Acquisti o Progetto).', 'error'); return; }
  openModal(`<h3>➕ Aggiungi componente</h3>
    <p class="empty-text" style="text-align:left;padding:0 0 10px">${allowedHint(it.type)}</p>
    ${itemPickerField(null)}
    <div class="modal-grid">
      <div class="modal-field"><label>Quantità</label><input type="number" id="cmp-qty" min="0" step="0.001" value="1"></div>
      <div class="modal-field"><label>Scarto %</label><input type="number" id="cmp-scrap" min="0" step="0.1" value="0"></div>
    </div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="saveNewComponent()">Aggiungi</button></div>`);
  renderPickerResults();
}
function isAllowedChild(parentType, childId) {
  const child = getItem(childId);
  return !!child && (ALLOWED_CHILDREN[parentType] || []).includes(child.type);
}
function saveNewComponent() {
  if (!roleGuard('bom')) return;
  const it = getItem(currentBomId); if (!it) return;
  const itemId = val('cmp-item');
  if (!itemId) { showToast('Seleziona un articolo', 'error'); return; }
  if (!isAllowedChild(it.type, itemId)) { showToast('Tipo non ammesso in un ' + typeLabel(it.type).toLowerCase(), 'error'); return; }
  if (createsCycle(it.id, itemId)) { showToast('Operazione annullata: creerebbe un ciclo', 'error'); return; }
  if (isNeg('cmp-qty')) { showToast('La quantità non può essere negativa', 'error'); return; }
  it.components.push({ itemId, qty: numVal('cmp-qty', 0), scrapPct: numVal('cmp-scrap', 0, 100) });
  touch(it);
  saveDB(); closeModal(); renderBom(); showToast('Componente aggiunto');
}
function editComponentModal(idx) {
  if (!roleGuard('bom')) return;
  const it = getItem(currentBomId); if (!it) return;
  const comp = it.components[idx]; if (!comp) return;
  window.__pickerCandidates = pickerCandidates(it.type, it.id);
  openModal(`<h3>✏ Modifica componente</h3>
    <p class="empty-text" style="text-align:left;padding:0 0 10px">${allowedHint(it.type)}</p>
    ${itemPickerField(comp.itemId)}
    <div class="modal-grid">
      <div class="modal-field"><label>Quantità</label><input type="number" id="cmp-qty" min="0" step="0.001" value="${comp.qty}"></div>
      <div class="modal-field"><label>Scarto %</label><input type="number" id="cmp-scrap" min="0" step="0.1" value="${comp.scrapPct || 0}"></div>
    </div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="saveComponentEdit(${idx})">Salva</button></div>`);
  renderPickerResults();
}
function saveComponentEdit(idx) {
  if (!roleGuard('bom')) return;
  const it = getItem(currentBomId); if (!it) return;
  const comp = it.components[idx]; if (!comp) return;
  const itemId = val('cmp-item');
  if (!isAllowedChild(it.type, itemId)) { showToast('Tipo non ammesso in un ' + typeLabel(it.type).toLowerCase(), 'error'); return; }
  if (createsCycle(it.id, itemId)) { showToast('Operazione annullata: creerebbe un ciclo', 'error'); return; }
  if (isNeg('cmp-qty')) { showToast('La quantità non può essere negativa', 'error'); return; }
  comp.itemId = itemId; comp.qty = numVal('cmp-qty', 0); comp.scrapPct = numVal('cmp-scrap', 0, 100);
  touch(it);
  saveDB(); closeModal(); renderBom(); showToast('Componente aggiornato');
}
function delComponent(idx) {
  if (!roleGuard('bom')) return;
  const it = getItem(currentBomId); if (!it) return;
  askConfirm('Eliminare questo componente dalla distinta?', () => {
    it.components.splice(idx, 1); touch(it); saveDB(); renderBom(); showToast('Componente eliminato');
  });
}
// Verifica se aggiungere childId dentro parentId creerebbe un ciclo
function createsCycle(parentId, childId) {
  if (parentId === childId) return true;
  const child = getItem(childId);
  if (!child || !isAssembly(child.type)) return false;
  const visited = new Set();
  const dfs = (id) => {
    if (id === parentId) return true;
    if (visited.has(id)) return false;
    visited.add(id);
    const node = getItem(id);
    if (!node || !isAssembly(node.type)) return false;
    return (node.components || []).some(c => dfs(c.itemId));
  };
  return dfs(childId);
}

function supplierName(id) { const s = getSupplier(id); return s ? s.name : ''; }
function supplierOptions(selectedId) {
  return `<option value="">—</option>` + db.suppliers
    .map(s => `<option value="${s.id}" ${s.id === selectedId ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
}
// Solo il nome del centro: nel ciclo di una Parte il costo è fisso, la tariffa oraria non si applica.
function wcOptionsNoRate(selectedId) {
  return db.workCenters.filter(w => w.active !== false)
    .map(w => `<option value="${w.id}" ${w.id === selectedId ? 'selected' : ''}>${esc(w.name)}</option>`).join('');
}
function wcOptions(selectedId) {
  return db.workCenters.filter(w => w.active !== false)
    .map(w => `<option value="${w.id}" ${w.id === selectedId ? 'selected' : ''}>${esc(w.name)} (${fmtN(w.hourlyRate)}/h)</option>`).join('');
}
function addOperationModal() {
  if (!roleGuard('bom')) return;
  const it = getItem(currentBomId); if (!it) return;
  if (!db.workCenters.length) { showToast('Aggiungi prima un centro di lavoro in Gestione', 'error'); return; }
  openModal(`<h3>🔧 Aggiungi lavorazione</h3>
    <div class="modal-field"><label>Centro di lavoro</label><select id="op-wc">${wcOptions(null)}</select></div>
    <div class="modal-grid">
      <div class="modal-field"><label>Ore</label><input type="number" id="op-hours" min="0" step="0.25" value="1"></div>
      <div class="modal-field"><label>Nota</label><input type="text" id="op-note" placeholder="opzionale"></div>
    </div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="saveNewOperation()">Aggiungi</button></div>`);
}
function saveNewOperation() {
  if (!roleGuard('bom')) return;
  const it = getItem(currentBomId); if (!it) return;
  if (isNeg('op-hours')) { showToast('Le ore non possono essere negative', 'error'); return; }
  it.operations.push({ workCenterId: val('op-wc'), hours: numVal('op-hours', 0), note: val('op-note') });
  touch(it);
  saveDB(); closeModal(); renderBom(); showToast('Lavorazione aggiunta');
}
function editOperationModal(idx) {
  if (!roleGuard('bom')) return;
  const it = getItem(currentBomId); if (!it) return;
  const op = it.operations[idx]; if (!op) return;
  openModal(`<h3>🔧 Modifica lavorazione</h3>
    <div class="modal-field"><label>Centro di lavoro</label><select id="op-wc">${wcOptions(op.workCenterId)}</select></div>
    <div class="modal-grid">
      <div class="modal-field"><label>Ore</label><input type="number" id="op-hours" min="0" step="0.25" value="${op.hours}"></div>
      <div class="modal-field"><label>Nota</label><input type="text" id="op-note" value="${esc(op.note || '')}"></div>
    </div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="saveOperationEdit(${idx})">Salva</button></div>`);
}
function saveOperationEdit(idx) {
  if (!roleGuard('bom')) return;
  const it = getItem(currentBomId); if (!it) return;
  const op = it.operations[idx]; if (!op) return;
  if (isNeg('op-hours')) { showToast('Le ore non possono essere negative', 'error'); return; }
  op.workCenterId = val('op-wc'); op.hours = numVal('op-hours', 0); op.note = val('op-note');
  touch(it);
  saveDB(); closeModal(); renderBom(); showToast('Lavorazione aggiornata');
}
function delOperation(idx) {
  if (!roleGuard('bom')) return;
  const it = getItem(currentBomId); if (!it) return;
  askConfirm('Eliminare questa lavorazione?', () => {
    it.operations.splice(idx, 1); touch(it); saveDB(); renderBom(); showToast('Lavorazione eliminata');
  });
}

// ─── Macchina / testata prodotto ───
function newMachineModal() {
  if (!roleGuard('bom')) return;
  const sm = machineScheme(null);
  openModal(`<h3>🛠 Nuova macchina</h3>
    <div class="modal-grid">
      <div class="modal-field"><label>Sigla macchina</label>
        <input id="mac-sigla" maxlength="10" placeholder="es. TRN" style="text-transform:uppercase;font-family:var(--mono);font-weight:700"
          oninput="this.value=this.value.toUpperCase();refreshMachineCode()"></div>
      <div class="modal-field"><label>Codice</label><input id="mac-code" placeholder="auto dalla sigla" oninput="markCodeManual()"></div>
      <div class="modal-field"><label>U.M.</label><select id="mac-uom">${uomOptions(defaultUom())}</select></div>
    </div>
    <div class="modal-field"><label>Nome</label><input id="mac-name" placeholder="Es. Nastro Trasportatore NT-200"></div>
    <div class="modal-grid">
      <div class="modal-field"><label>N° car. sigla gruppo</label><input type="number" id="mac-glen" min="1" max="10" value="${sm.gLen}" onchange="refreshMachineCode()"></div>
      <div class="modal-field"><label>Tipo car. sigla gruppo</label><select id="mac-gtype" onchange="refreshMachineCode()">${typeOptionsHtml(sm.gType)}</select></div>
      <div class="modal-field"><label>Cifre progressivo S##</label><input type="number" id="mac-incrs" min="1" max="6" value="${sm.incrS}" onchange="refreshMachineCode()"></div>
      <div class="modal-field"><label>Cifre numerazione ###</label><input type="number" id="mac-incrn" min="1" max="6" value="${sm.incrN}" onchange="refreshMachineCode()"></div>
    </div>
    <div class="modal-field"><label>Note</label><textarea id="mac-notes" rows="2"></textarea></div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="saveNewMachine()">Crea</button></div>`);
  itemCodeAuto = true;
}
// Bozza macchina dai campi della modale "Nuova macchina"
function machineDraftFromForm() {
  return {
    type: 'macchina', sigla: val('mac-sigla'),
    gCodeLen: parseInt(val('mac-glen'), 10) || 3,
    gCodeType: val('mac-gtype') || 'alpha',
    incrDigitsS: parseInt(val('mac-incrs'), 10) || 2,
    incrDigitsN: parseInt(val('mac-incrn'), 10) || 3,
  };
}
function refreshMachineCode() {
  if (!itemCodeAuto) return;
  const el = document.getElementById('mac-code'); if (!el) return;
  el.value = genItemCode(machineDraftFromForm());
}
function saveNewMachine() {
  if (!roleGuard('bom')) return;
  const name = val('mac-name');
  if (!name) { showToast('Nome richiesto', 'error'); return; }
  const d = machineDraftFromForm();
  if (d.sigla && !/^[A-Z0-9]+$/.test(d.sigla)) { showToast('La sigla macchina ammette solo A-Z e 0-9', 'error'); return; }
  if (d.sigla && machineItems().some(m => m.sigla === d.sigla)) { showToast(`Sigla macchina "${d.sigla}" già in uso`, 'error'); return; }
  const id = gid();
  db.items.push(stampNew(Object.assign({
    id, code: val('mac-code') || id, name, type: 'macchina', uom: val('mac-uom') || defaultUom(),
    notes: val('mac-notes'), active: true, components: [], operations: [],
  }, d)));
  currentBomId = id; bomExpanded = new Set();
  saveDB(); closeModal(); renderBom(); showToast('Macchina creata');
}
function editCurrentItemModal() {
  if (!roleGuard('bom')) return;
  const it = getItem(currentBomId); if (!it) return;
  openModal(`<h3>✏ Modifica testata — <span style="color:var(--text-dim);font-weight:500">${typeLabel(it.type)}</span></h3>
    <div class="modal-grid">
      <div class="modal-field"><label>Codice</label><input id="mac-code" value="${esc(it.code)}"></div>
      <div class="modal-field"><label>U.M.</label><select id="mac-uom">${uomOptions(it.uom || defaultUom())}</select></div>
    </div>
    <div class="modal-field"><label>Nome</label><input id="mac-name" value="${esc(it.name)}"></div>
    <div class="modal-grid">
      <div class="modal-field"><label>Spese generali % (override)</label><input type="number" id="mac-ov" step="0.1" value="${it.overheadPctOverride != null ? it.overheadPctOverride : ''}" placeholder="default ${db.settings.overheadPct}%"></div>
      <div class="modal-field"><label>Margine % (override)</label><input type="number" id="mac-mg" step="0.1" value="${it.marginPctOverride != null ? it.marginPctOverride : ''}" placeholder="default ${db.settings.marginPct}%"></div>
    </div>
    <div class="modal-field"><label>Note</label><textarea id="mac-notes" rows="2">${esc(it.notes || '')}</textarea></div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="saveCurrentItem()">Salva</button></div>`);
}
function saveCurrentItem() {
  if (!roleGuard('bom')) return;
  const it = getItem(currentBomId); if (!it) return;
  it.code = val('mac-code'); it.uom = val('mac-uom'); it.name = val('mac-name') || it.name;
  it.notes = val('mac-notes');
  // Vuoto = nessuna sovrascrittura (si usa l'impostazione globale); un valore
  // fuori scala viene riportato dentro l'intervallo, come per le impostazioni.
  const ov = val('mac-ov'); it.overheadPctOverride = ov === '' ? null : clampNum(parseFloat(ov), 0, 1000);
  const mg = val('mac-mg'); it.marginPctOverride = mg === '' ? null : clampNum(parseFloat(mg), 0, 1000);
  touch(it);
  saveDB(); closeModal(); renderBom(); showToast('Testata aggiornata');
}
function deleteCurrentMachine() {
  if (!roleGuard('bom')) return;
  const it = getItem(currentBomId); if (!it) return;
  const used = usedBy(it.id);
  if (used.length) { showToast('Usato in: ' + used.map(u => u.code).join(', ') + '. Rimuovilo prima.', 'error'); return; }
  askConfirm(`Eliminare "${it.name}" e la sua distinta?`, () => {
    db.items = db.items.filter(i => i.id !== it.id);
    currentBomId = null; saveDB(); renderBom(); showToast('Eliminato');
  });
}
// Chi contiene questo articolo, dall'indice inverso: una lettura invece di una
// scansione del catalogo. La copia protegge l'indice da chi ordina il risultato.
function usedBy(itemId) {
  const l = parentIndex().get(itemId);
  return l ? l.slice() : [];
}

// ═══════════════════════════════════════════════════════════
//  DOVE È USATO E IMPATTO SUI COSTI
// ═══════════════════════════════════════════════════════════
// La distinta si è sempre potuta leggere dall'alto verso il basso. Qui si
// risale: dato un articolo, chi lo contiene e quali macchine ne risentono se
// il suo costo cambia.

// Quantità di `childId` dentro una unità di `parent`, scarto compreso.
// Un componente può comparire più volte nella stessa distinta: si sommano.
function usageQty(parent, childId) {
  let q = 0;
  if (isAssembly(parent.type)) {
    (parent.components || []).forEach(c => {
      if (c.itemId === childId) q += (Number(c.qty) || 0) * (1 + (Number(c.scrapPct) || 0) / 100);
    });
  }
  // Nel ciclo di lavorazione una riga con override non dipende più dal costo
  // dell'articolo: conta come impiego, ma non propaga la variazione di prezzo.
  if (parent.type === 'parte' && partSourcing(parent) !== 'buy') {
    // kind assente vale 'item', come nel motore di costo: una riga di ciclo è
    // una lavorazione solo se lo dice esplicitamente.
    (parent.cycle || []).forEach(r => {
      if (r.kind !== 'op' && r.itemId === childId) q += Number(r.qty) || 0;
    });
  }
  return q;
}
// Impieghi diretti: chi contiene l'articolo, con la quantità per unità.
function directUses(itemId) {
  return usedBy(itemId)
    .map(p => ({ item: p, qty: usageQty(p, itemId) }))
    .sort((a, b) => (a.item.code || '').localeCompare(b.item.code || ''));
}
// Tutti gli antenati, con la quantità complessiva che ne serve per una unità di
// ciascuno: si moltiplicano le quantità lungo la risalita. Il percorso già
// attraversato ferma gli anelli.
function ancestorTotals(itemId) {
  const totali = new Map();
  const salita = (id, qty, percorso) => {
    usedBy(id).forEach(p => {
      if (percorso.has(p.id)) return;
      const q = qty * usageQty(p, id);
      totali.set(p.id, (totali.get(p.id) || 0) + q);
      const oltre = new Set(percorso); oltre.add(p.id);
      salita(p.id, q, oltre);
    });
  };
  salita(itemId, 1, new Set([itemId]));
  return totali;
}
// Assiemi di testa impattati: le macchine, oppure — se l'articolo non arriva a
// nessuna macchina — gli assiemi più alti che lo contengono.
function impactedTops(itemId) {
  const totali = ancestorTotals(itemId);
  const righe = [...totali.entries()]
    .map(([id, qty]) => ({ item: getItem(id), qty }))
    .filter(r => r.item);
  const macchine = righe.filter(r => r.item.type === 'macchina');
  const cime = macchine.length ? macchine : righe.filter(r => !usedBy(r.item.id).length);
  return cime.sort((a, b) => (a.item.code || '').localeCompare(b.item.code || ''));
}

// ─── Il campo dove vive il costo proprio dell'articolo ───
// Dipende dal tipo. Gli assiemi non ne hanno uno (il loro costo è derivato) e
// nemmeno le parti prodotte in casa con un ciclo: lì non c'è un prezzo da
// simulare o da prendere a listino, lo determinano distinta e lavorazioni.
function costField(it) {
  if (!it) return null;
  if (it.type === 'acquistato') return 'purchasePrice';
  if (it.type === 'materiale') return 'unitCost';
  // Una parte prodotta in casa ha il costo derivato dal ciclo: non c'è un campo
  // da scrivere. Senza righe di ciclo il costo torna a essere il prezzo a listino.
  if (it.type === 'parte') return (partSourcing(it) === 'buy' || !(it.cycle || []).length) ? 'unitCost' : null;
  return null;
}
// Esegue `fn` come se l'articolo costasse `valore`, poi rimette tutto a posto.
// Nulla viene salvato: si tocca l'oggetto in memoria e lo si ripristina sempre,
// anche se il calcolo solleva un'eccezione.
function withTempCost(it, valore, fn) {
  const campo = costField(it);
  if (!campo) return fn();
  const prima = it[campo];
  it[campo] = valore;
  invalidateCaches();
  try { return fn(); }
  finally { it[campo] = prima; invalidateCaches(); }
}
