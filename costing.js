// ═══════════════════════════════════════════════════════════
//  BOMTRACK — costing.js
// ═══════════════════════════════════════════════════════════
// Motore di costificazione: rollup ricorsivo, modi di calcolo delle parti,
// costo delle righe di ciclo, prezzo di vendita. Nessun DOM: è la parte che
// la suite di test verifica più a fondo.
// Classic script, scope globale condiviso con gli altri: nessun modulo e
// nessun build, così index.html continua ad aprirsi con un doppio click.

// ═══════════════════════════════════════════════════════════
//  MOTORE DI COSTIFICAZIONE (rollup ricorsivo)
// ═══════════════════════════════════════════════════════════
// Ritorna i costi unitari (per 1 unità) suddivisi in categorie.
// material+purchased+labor+parts+overhead === total (= costo totale industriale).
const ZERO_COST = { material: 0, purchased: 0, labor: 0, parts: 0, overhead: 0, base: 0, total: 0, cycle: false };
function costOf(itemId, visited) {
  const it = getItem(itemId);
  if (!it) return { ...ZERO_COST };
  if (visited && visited.has(itemId)) return { ...ZERO_COST, cycle: true };
  // Un risultato senza anelli non dipende dal percorso di discesa: nessun
  // antenato è stato incontrato nel sottoalbero, quindi vale per qualunque
  // chiamante e si può riusare. Un risultato con cycle=true invece è troncato
  // proprio in funzione degli antenati: quello non va mai in cache.
  const hit = _costCache.get(itemId);
  if (hit) return hit;
  const res = computeCost(it, itemId, visited || new Set());
  // Congelato: i chiamanti ricevono lo stesso oggetto, una modifica accidentale
  // avvelenerebbe la cache invece di restare locale.
  if (!res.cycle) _costCache.set(itemId, Object.freeze(res));
  return res;
}
function computeCost(it, itemId, visited) {
  const zero = ZERO_COST;

  if (it.type === 'materiale') {
    const v = Number(it.unitCost) || 0;
    return { ...zero, material: v, base: v, total: v };
  }
  if (it.type === 'acquistato') {
    const v = Number(it.purchasePrice) || 0;
    return { ...zero, purchased: v, base: v, total: v };
  }
  if (it.type === 'parte') {
    // Tre modi di calcolo (campo costMode): solo costo unitario a mano, solo
    // valore del ciclo di lavorazione, oppure la somma dei due.
    const mode = partCostMode(it);
    const manual = Number(it.unitCost) || 0;
    // Senza righe di ciclo resta solo il costo manuale, nella voce "Parti".
    if (mode === 'unit' || !(it.cycle || []).length) {
      return { ...zero, parts: manual, base: manual, total: manual };
    }
    // Col ciclo il costo è derivato e ogni riga confluisce nella propria voce:
    // materie prime → Materiale, commerciali → Commerciali, lavorazioni → Lavorazioni.
    const next = new Set(visited); next.add(itemId);
    let material = 0, purchased = 0, labor = 0;
    const parts = mode === 'sum' ? manual : 0;   // 'sum': il costo unitario si aggiunge al ciclo
    // Accumulatore: raccoglie l'eventuale anello incontrato dalle righe del ciclo.
    // Senza, un troncamento da ricorsione passerebbe per un costo valido.
    const out = { cycle: false };
    it.cycle.forEach(row => {
      const rowCost = cycleRowCost(row, next, out);
      if (row.kind === 'op') { labor += rowCost; return; }
      const ci = getItem(row.itemId);
      if (!ci) return;
      if (ci.type === 'materiale') material += rowCost;
      else if (ci.type === 'acquistato') purchased += rowCost;
      else labor += rowCost;   // tipo inatteso: non perdiamo il costo
    });
    const base = material + purchased + labor + parts;
    return { ...zero, material, purchased, labor, parts, base, total: base, cycle: out.cycle };
  }

  // assieme (macchina/gruppo/sottogruppo): somma figli + lavorazioni
  const next = new Set(visited); next.add(itemId);
  let material = 0, purchased = 0, labor = 0, parts = 0, childOverhead = 0, cycle = false;
  (it.components || []).forEach(c => {
    const cc = costOf(c.itemId, next);
    if (cc.cycle) cycle = true;
    const factor = (Number(c.qty) || 0) * (1 + (Number(c.scrapPct) || 0) / 100);
    material += cc.material * factor;
    purchased += cc.purchased * factor;
    labor += cc.labor * factor;
    parts += cc.parts * factor;
    childOverhead += cc.overhead * factor;
  });
  (it.operations || []).forEach(o => {
    const wc = db.workCenters.find(w => w.id === o.workCenterId);
    labor += (Number(o.hours) || 0) * (wc ? (Number(wc.hourlyRate) || 0) : 0);
  });
  const base = material + purchased + labor + parts;  // costo puro (figli a costo + manodopera)
  const ovPct = it.overheadPctOverride != null ? it.overheadPctOverride : (db.settings.overheadPct || 0);
  const ownOverhead = base * (Number(ovPct) || 0) / 100;
  const overhead = childOverhead + ownOverhead;
  const total = base + overhead;
  return { material, purchased, labor, parts, overhead, base, total, cycle };
}
// ─── Modo di calcolo del costo di una parte ───
const PART_COST_MODES = {
  unit: 'Solo costo unitario',
  cycle: 'Solo valore ciclo di lavorazione',
  sum: 'Costo unitario + valore ciclo',
};
function defaultPartCostMode() {
  const d = db.settings && db.settings.partCostModeDefault;
  return PART_COST_MODES[d] ? d : 'cycle';
}
function partCostMode(it) {
  const m = it && it.costMode;
  return PART_COST_MODES[m] ? m : defaultPartCostMode();
}
function partCostModeOptions(sel) {
  return Object.entries(PART_COST_MODES)
    .map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${v}</option>`).join('');
}

// ─── Ciclo di lavorazione (articoli tipo "parte") ───
// `out` è un accumulatore opzionale: se il sottoalbero della riga contiene un
// anello, ci finisce dentro `out.cycle = true`. Serve a costOf per non spacciare
// per valido un costo troncato dalla ricorsione; i chiamanti dell'interfaccia
// possono ignorarlo.
// Costo calcolato di una riga articolo (q.tà × costo unitario), ignorando l'eventuale override.
function cycleRowComputed(row, visited, out) {
  if (!row || row.kind === 'op') return 0;
  const c = costOf(row.itemId, visited);
  if (out && c.cycle) out.cycle = true;
  return c.total * (Number(row.qty) || 0);
}
// Costo effettivo della riga.
// Lavorazione: costo fisso, non orario (le lavorazioni orarie restano solo negli assiemi).
// Articolo: override se valorizzato, altrimenti q.tà × costo unitario.
function cycleRowCost(row, visited, out) {
  if (!row) return 0;
  if (row.kind === 'op') return Number(row.cost) || 0;
  // Con un override il costo non dipende più dal sottoalbero: niente da segnalare.
  if (row.costOverride != null && row.costOverride !== '') return Number(row.costOverride) || 0;
  return cycleRowComputed(row, visited, out);
}

function sellingPrice(itemId) {
  const it = getItem(itemId);
  const c = costOf(itemId);
  const mgPct = it && it.marginPctOverride != null ? it.marginPctOverride : (db.settings.marginPct || 0);
  return c.total * (1 + (Number(mgPct) || 0) / 100);
}
