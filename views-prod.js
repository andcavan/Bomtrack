// ═══════════════════════════════════════════════════════════
//  BOMTRACK — views-prod.js
// ═══════════════════════════════════════════════════════════
// Gli **ordini di produzione (ODP)**: il documento che segue una parte lungo il
// suo ciclo di lavorazione.
// Classic script, scope globale condiviso con gli altri: nessun modulo e
// nessun build, così index.html continua ad aprirsi con un doppio click.
//
// ── Il buco che riempie ──
// Fino alla 0.73 l'app sapeva cosa serve (fabbisogno), cosa comprare (ODA),
// cosa far lavorare fuori (ODL) e cosa c'è a scaffale (magazzino). Non sapeva
// **a che punto è un pezzo**, e il manuale lo dichiarava come limite. Da lì
// discendevano tre cose che non tornavano:
//   1. una parte a ciclo **tutto interno** non aveva nessun documento: nessuno
//      la lanciava, il suo materiale non usciva mai dal magazzino e il pezzo
//      finito non entrava mai se non con un carico scritto a mano;
//   2. il magazzino si muoveva **solo** passando da un ODL, perché gli
//      ancoraggi erano gli estremi delle *tratte esterne*;
//   3. il fabbisogno non poteva nettare le lavorazioni, e lo diceva in pagina.
//
// ── La regola, in due righe ──
// **Il registro di magazzino racconta l'uscita e l'entrata dal magazzino;
// l'ordine di produzione racconta il viaggio.** Sono due libri diversi e non
// devono raccontarsi a vicenda.
//
// Ne discende la cosa che più distingue questo documento dal conto lavoro come
// era scritto prima: **fra le fasi non si registra niente**. Un movimento
// nomina una quantità di un **codice**, e fra la prima e l'ultima fase i pezzi
// non sono più il materiale e non sono ancora la parte — la parte lo diventano
// alla chiusura dell'ultima fase. Scrivere un movimento col codice parte prima
// di allora inventa una giacenza che non esiste.
//
// ── Le fasi hanno un id, non un indice ──
// È la differenza con `item_cycle_rows`, dove l'array *è* la definizione e la
// posizione è l'identità. Qui la fase porta un avanzamento: un'identità
// posizionale si sposterebbe sotto i piedi al primo riordino del ciclo, e
// l'avanzamento finirebbe sulla fase sbagliata. Congelando le fasi con un id
// proprio, riordinare il ciclo **non sposta niente** su un ordine già lanciato.
// `phaseKey` resta sulla fase, ma solo come **ponte verso il fabbisogno**, dove
// continua a valere con i limiti già dichiarati (vedi planDocumentedKeys).
//
// ── L'avanzamento è un registro, non un campo ──
// Come l'esistente si calcola da ricevimenti e movimenti, l'avanzamento si
// calcola dalle **dichiarazioni** (`db.prodDecls`). Nessun saldo scritto da
// qualche parte, quindi niente che possa divergere — è la stessa scelta che
// tiene in piedi il magazzino, applicata a un secondo numero.

// ═══════════════════════════════════════════════════════════
//  STATI
// ═══════════════════════════════════════════════════════════
// `'contract'` copre testata, quantità, fasi e materiale: congelati dopo il
// lancio. `'reception'` copre le dichiarazioni e i movimenti, che è proprio ciò
// che deve restare aperto dopo. Si riusano i livelli di blocco dei documenti
// (LOCK_KINDS, modeAllows, applyDocLock) senza entrare in DOC_KINDS: quel
// registro è tarato su «documento verso un fornitore» — intestatario, prezzo,
// ricevuto — e un ordine di produzione non è quello.
const ODP_STATUS = { bozza: 'Bozza', lanciato: 'Lanciato', corso: 'In corso',
  completato: 'Completato', chiuso: 'Chiuso', annullato: 'Annullato' };
const ODP_LOCK = { bozza: 'full', lanciato: 'reception', corso: 'reception',
  completato: 'reception', chiuso: 'none', annullato: 'none' };
// Gli stati in cui l'ordine è **vivo**: ha già preso il materiale e non ha
// ancora finito. Sono quelli che il prospetto del lavoro in corso guarda.
const ODP_APERTI = ['lanciato', 'corso'];

function getOdp(id) { return (db.prodOrders || []).find(o => o.id === id); }
function odpMode(o) { return (o && odpUnlockedId === o.id) ? 'full' : ((o && ODP_LOCK[o.status]) || 'full'); }

// ═══════════════════════════════════════════════════════════
//  CONGELAMENTO: dal ciclo vivo alle fasi dell'ordine
// ═══════════════════════════════════════════════════════════
// Si congela **tutto quello che serve a leggere l'ordine senza il ciclo**: i
// nomi del centro e del terzista compresi. Un centro cancellato o un fornitore
// sospeso non devono rendere illeggibile un ordine in corso — è la stessa
// ragione per cui una riga di documento porta `code` e `description` invece di
// ripescarli dall'articolo.
function opFreezePhases(part) {
  const runs = clCycleRuns(part);
  const out = [];
  let opIndex = 0;
  ((part && part.cycle) || []).forEach(r => {
    if (r.kind !== 'op') return;
    const k = opIndex++;
    const t = runs.find(x => k >= x.from && k <= x.to) || { from: k, to: k, passata: 0 };
    const wc = getWorkCenter(r.workCenterId);
    out.push({
      id: newId(),
      seq: cyclePhaseNumber(k),
      opIndex: k,
      phaseKey: mrpPhaseKey(part.id, k, r.workCenterId),
      workCenterId: r.workCenterId || null,
      wcName: wc ? wc.name : '(centro mancante)',
      supplierId: r.supplierId || null,
      supplierName: r.supplierId ? (supplierName(r.supplierId) || '') : '',
      runFrom: t.from, runTo: t.to, passata: t.passata || 0,
      costMode: r.costMode === 'orario' ? 'orario' : 'fisso',
      hours: Number(r.hours) || 0,
      days: Number(r.days) || 0,
      rate: Number(r.rate) || 0,
      cost: Number(r.cost) || 0,
      note: r.note || '',
    });
  });
  return out;
}
// Il materiale che l'ordine consuma: le righe di distinta parte del ciclo per i
// pezzi lanciati. Congelarlo significa che una modifica al ciclo non riscrive
// retroattivamente quanto è già uscito dal magazzino.
function opFreezeMaterials(part, qty) {
  return clMaterialsOf(part, Number(qty) || 0).map(x => ({
    id: newId(), itemId: x.item.id, code: x.item.code || '', name: x.item.name || '',
    uom: itemUom(x.item), perPezzo: x.perPezzo, qty: x.qty,
  }));
}

// ═══════════════════════════════════════════════════════════
//  LE DICHIARAZIONI, E LE QUANTITÀ CHE SE NE RICAVANO
// ═══════════════════════════════════════════════════════════
// Indice memoizzato `odpId#phaseId` → dichiarazioni in ordine di data. Stesso
// ciclo di vita degli altri indici: azzerato da invalidateCaches().
let _opDeclIdx = null;
let _opOdlIdx = null;
function invalidateProd() { _opDeclIdx = null; _opOdlIdx = null; }
function opDeclIndex() {
  if (_opDeclIdx) return _opDeclIdx;
  const map = new Map();
  (db.prodDecls || []).forEach((d, i) => {
    const k = String(d.odpId) + '#' + String(d.phaseId);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push({ d, i });
  });
  map.forEach(arr => arr.sort((a, b) => String(a.d.date || '').localeCompare(String(b.d.date || '')) || a.i - b.i));
  map.forEach((arr, k) => map.set(k, arr.map(x => x.d)));
  _opDeclIdx = map;
  return map;
}
function opDecls(odpId, phaseId) { return opDeclIndex().get(String(odpId) + '#' + String(phaseId)) || []; }
function opDeclsOf(odp) { return (db.prodDecls || []).filter(d => d.odpId === odp.id); }

function opPhaseAt(odp, i) { return (odp.phases || [])[i] || null; }
function opPhaseIndex(odp, fase) { return (odp.phases || []).findIndex(f => f.id === (fase && fase.id)); }
function opPrima(odp) { return opPhaseAt(odp, 0); }
function opUltima(odp) { const ph = odp.phases || []; return ph[ph.length - 1] || null; }
function opPrecedente(odp, fase) { const i = opPhaseIndex(odp, fase); return i > 0 ? opPhaseAt(odp, i - 1) : null; }
function opEPrima(odp, fase) { const p = opPrima(odp); return !!p && !!fase && p.id === fase.id; }
function opEUltima(odp, fase) { const u = opUltima(odp); return !!u && !!fase && u.id === fase.id; }

function opFatti(odp, fase) {
  return opDecls(odp.id, fase.id).reduce((s, d) => s + (d.kind === 'avanzamento' ? (Number(d.qty) || 0) : 0), 0);
}
function opScarti(odp, fase) {
  return opDecls(odp.id, fase.id).reduce((s, d) => s + (d.kind === 'avanzamento' ? (Number(d.scrap) || 0) : 0), 0);
}
function opProcessati(odp, fase) { return opFatti(odp, fase) + opScarti(odp, fase); }
// I pezzi che **entrano** in una fase sono i pezzi **buoni** usciti dalla
// precedente, non quelli lanciati: uno scarto alla 10 restringe la 20 e tutte
// le successive, e la quantità che finisce a magazzino può essere minore di
// quella lanciata. È un fatto, e va visto invece che nascosto.
function opDaFare(odp, fase) {
  const prec = opPrecedente(odp, fase);
  return prec ? opFatti(odp, prec) : (Number(odp.qty) || 0);
}
function opResidua(odp, fase) { return Math.max(0, opDaFare(odp, fase) - opProcessati(odp, fase)); }

function opAvviata(odp, fase) { return opDecls(odp.id, fase.id).some(d => d.kind === 'avvio'); }
function opForzata(odp, fase) { return opDecls(odp.id, fase.id).some(d => d.kind === 'forzatura'); }
// Chiusa per dichiarazione esplicita, oppure perché i pezzi dichiarati coprono
// quelli entrati. L'epsilon è lo stesso dei residui del conto lavoro: le
// quantità sono numeri in virgola mobile, e un confronto secco lascerebbe fasi
// «quasi chiuse» che bloccano la successiva per un miliardesimo.
function opChiusa(odp, fase) {
  if (opDecls(odp.id, fase.id).some(d => d.kind === 'chiusura')) return true;
  const daFare = opDaFare(odp, fase);
  if (!(daFare > 0)) return false;
  return opProcessati(odp, fase) >= daFare - 0.000001;
}
function opTutteChiuse(odp) { return (odp.phases || []).length > 0 && odp.phases.every(f => opChiusa(odp, f)); }
// La fase su cui il lavoro è fermo adesso: la prima non chiusa. Quando non ce
// n'è, l'ordine ha finito. È anche **il luogo dei pezzi**: la risposta alla
// domanda «dove sono?» non è un saldo di magazzino, è questa.
function opFaseCorrente(odp) { return (odp.phases || []).find(f => !opChiusa(odp, f)) || null; }

function opStatoFase(odp, fase) {
  if (opChiusa(odp, fase)) return 'chiusa';
  if (opAvviata(odp, fase)) return 'corso';
  return opAvviabile(odp, fase).ok ? 'avviabile' : 'attesa';
}
const ODP_FASE_LABELS = { attesa: 'In attesa', avviabile: 'Avviabile', corso: 'In corso', chiusa: 'Chiusa' };

// ═══════════════════════════════════════════════════════════
//  LA SUCCESSIONE
// ═══════════════════════════════════════════════════════════
// Il motivo del blocco si scrive **una volta sola**: lo usano sia il rifiuto
// del mutatore sia la conferma della forzatura. Due stringhe scritte a mano
// divergerebbero al primo ritocco, e chi legge la conferma non saprebbe più se
// sta forzando quello che l'app gli ha appena rifiutato.
function opMotivoBlocco(odp, fase) {
  const prec = opPrecedente(odp, fase);
  if (!prec) return '';
  return `la fase ${prec.seq} ${prec.wcName} non è chiusa: ${fmtQty(opProcessati(odp, prec))} di ${fmtQty(opDaFare(odp, prec))}`;
}
// → { ok: true } oppure { ok: false, motivo, fase: la fase che blocca }
function opAvviabile(odp, fase) {
  if (!odp || !fase) return { ok: false, motivo: 'fase non trovata' };
  if (odp.status === 'bozza') return { ok: false, motivo: "l'ordine è ancora in bozza: va lanciato" };
  if (odp.status === 'annullato' || odp.status === 'chiuso') return { ok: false, motivo: `l'ordine è ${(ODP_STATUS[odp.status] || '').toLowerCase()}` };
  if (opChiusa(odp, fase)) return { ok: false, motivo: 'la fase è già chiusa' };
  const prec = opPrecedente(odp, fase);
  if (prec && !opChiusa(odp, prec)) return { ok: false, motivo: opMotivoBlocco(odp, fase), fase: prec };
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════
//  STATO DELLA TESTATA, DEDOTTO
// ═══════════════════════════════════════════════════════════
// Come ordAutoStatus, non tocca mai `bozza` e `annullato`: quelli restano
// decisioni di chi scrive, e dedurli significherebbe riaprire da soli un ordine
// che qualcuno ha annullato.
function odpAutoStatus(odp) {
  if (!odp || odp.status === 'bozza' || odp.status === 'annullato' || odp.status === 'chiuso') return;
  if (opTutteChiuse(odp)) { odp.status = 'completato'; return; }
  const mosso = (odp.phases || []).some(f => opAvviata(odp, f) || opProcessati(odp, f) > 0);
  odp.status = mosso ? 'corso' : 'lanciato';
}

// ═══════════════════════════════════════════════════════════
//  IL MAGAZZINO: due movimenti soli, e il viaggio in mezzo
// ═══════════════════════════════════════════════════════════
//   avvio della PRIMA fase   → escono i **codici del ciclo**
//       fase interna  → `scarico`  (Consumo di produzione)
//       fase esterna  → `clOut`    (Uscita a conto lavoro, intestata al terzista)
//   fra le fasi              → **niente**: il luogo lo dice opFaseCorrente()
//   sull'ULTIMA fase         → entra il **codice parte**, per i pezzi buoni
//       fase interna  → `versamento` (Versamento di produzione)
//       fase esterna  → `clIn`       (Rientro da conto lavoro)
//
// Il carico avviene **a ogni dichiarazione** sull'ultima fase, non solo alla
// chiusura: dichiarare 40 pezzi buoni su 100 significa che quei 40 sono pronti,
// e tenerli fuori dal magazzino fino all'ultimo li renderebbe invisibili a chi
// li deve prendere. Alla chiusura la somma dei carichi è la resa della fase, che
// è esattamente ciò che la regola promette.
function opKindUscita(odp) { const f = opPrima(odp); return f && f.supplierId ? 'clOut' : 'scarico'; }
function opKindEntrata(odp) { const f = opUltima(odp); return f && f.supplierId ? 'clIn' : 'versamento'; }

// ─── Quanto è già stato registrato su questa fase, in questo verso ───
// Stessa forma di clRegistrato: il conto si legge dai movimenti, che l'ordine e
// la fase li portano già, senza nessun campo nuovo da tenere allineato.
function opRegistrato(odp, fase, verso) {
  const m = new Map();
  const uscita = verso === 'out';
  (db.movements || []).forEach(x => {
    if (x.orderId !== odp.id || x.lineId !== (fase && fase.id) || !x.itemId) return;
    const suo = uscita ? (x.kind === 'clOut' || x.kind === 'scarico') : (x.kind === 'clIn' || x.kind === 'versamento');
    if (!suo) return;
    m.set(x.itemId, (m.get(x.itemId) || 0) + Math.abs(Number(x.qty) || 0));
  });
  return m;
}
// Il materiale ancora da prelevare: il congelato meno quello già uscito.
function opMaterialeResiduo(odp) {
  const gia = opRegistrato(odp, opPrima(odp), 'out');
  return (odp.materials || []).map(m => Object.assign({}, m,
    { gia: gia.get(m.itemId) || 0, residuo: Math.max(0, (Number(m.qty) || 0) - (gia.get(m.itemId) || 0)) }));
}
function opMaterialePrelevato(odp) { return opRegistrato(odp, opPrima(odp), 'out').size > 0; }
function opVersato(odp) {
  let n = 0;
  (db.movements || []).forEach(x => {
    if (x.orderId !== odp.id || x.itemId !== odp.itemId) return;
    if (x.kind === 'clIn' || x.kind === 'versamento') n += Number(x.qty) || 0;
  });
  return n;
}

// ─── Dove sono i pezzi, se fra le fasi non si scrive niente ───
// Il lavoro in corso non è un saldo di magazzino: è una lettura degli ordini
// aperti. Per ciascuno, il materiale uscito e non ancora richiuso sta **dove
// dice la fase corrente** — presso il suo terzista, o in casa fra due fasi.
//
// Il **codice parte non compare mai** qui: finché l'ultima fase non ha versato,
// la parte non esiste, e nominarla significherebbe mostrare una giacenza che
// non c'è. È la ragione per cui questo prospetto esiste al posto di un
// movimento fra le fasi.
function prodWipRows() {
  const out = [];
  (db.prodOrders || []).forEach(o => {
    if (o.active === false || !ODP_APERTI.includes(o.status)) return;
    const fase = opFaseCorrente(o); if (!fase) return;
    const gia = opRegistrato(o, opPrima(o), 'out');
    (o.materials || []).forEach(m => {
      const uscito = gia.get(m.itemId) || 0;
      if (!(uscito > 0)) return;
      const it = getItem(m.itemId); if (!it) return;
      out.push({ luogo: fase.supplierId || CL_WIP, item: it, qty: uscito, odp: o, fase });
    });
  });
  return out;
}
function prodWipAt(luogo, itemId) {
  return prodWipRows().reduce((s, r) => s + ((r.luogo === luogo && r.item.id === itemId) ? r.qty : 0), 0);
}
function prodWipOf(itemId) {
  return prodWipRows().reduce((s, r) => s + (r.item.id === itemId && r.luogo !== CL_WIP ? r.qty : 0), 0);
}
function prodWipInCasa(itemId) {
  return prodWipRows().reduce((s, r) => s + (r.item.id === itemId && r.luogo === CL_WIP ? r.qty : 0), 0);
}
// I movimenti di un ordine di produzione escono dal conto per coppia
// (luogo, articolo) di clIndex(): là un `clOut` senza un `clIn` dello stesso
// codice resterebbe per sempre presso il terzista, e su una trasformazione —
// grezzo fuori, parte dentro — il conto per codice non tornerebbe mai. La
// risposta per gli ordini di produzione c'è intera, e viene da prodWipRows().
function opMovimentoDiOdp(m) {
  return !!(m && m.orderId && (db.prodOrders || []).some(o => o.id === m.orderId));
}

// ═══════════════════════════════════════════════════════════
//  I MUTATORI
// ═══════════════════════════════════════════════════════════
// Il blocco vive **qui**, non nell'interfaccia: la vista si limita a non
// disegnare un comando che non si può dare, ma chi arrivasse comunque al
// mutatore — da un altro punto, da un vecchio `onclick`, dalla console — trova
// la stessa guardia. È la regola di docGuard, applicata a un documento che non
// sta in DOC_KINDS.
let odpUnlockedId = null;
function opGuard(id, lockKind) {
  if (!roleGuard('docs')) return false;
  const o = getOdp(id); if (!o) return false;
  if (modeAllows(odpMode(o), lockKind)) return true;
  showToast(`Ordine di produzione ${(ODP_STATUS[o.status] || o.status || '').toLowerCase()}: usa «Sblocca per modifica»`, 'error');
  return false;
}
function opDecl(odp, fase, kind, extra) {
  return Store.insert('prodDecls', Object.assign({
    id: gid(), odpId: odp.id, phaseId: fase ? fase.id : null, kind,
    date: nowISO(), qty: 0, scrap: 0, note: '', motivo: '',
  }, extra || {}));
}

// ─── Lancio: da qui in poi fasi e materiale non si toccano più ───
function opLancia(id) {
  if (!opGuard(id, 'contract')) return false;
  const o = getOdp(id); if (!o) return false;
  if (!(o.phases || []).length) { showToast('Questo ordine non ha fasi: il ciclo della parte è vuoto', 'error'); return false; }
  if (!(Number(o.qty) > 0)) { showToast('Quantità a zero: non c\'è niente da produrre', 'error'); return false; }
  o.status = 'lanciato'; touch(o); saveDB();
  return true;
}

// ─── Avvio di una fase ───
// `opz.forza` salta il blocco della successione, e non è gratis: pretende un
// motivo, e lo scrive nello storico come dichiarazione a sé. Una forzatura non
// è un permesso speso e dimenticato — resta scritta accanto alla fase.
// `opz.materiali` sono le quantità da prelevare, e valgono **solo sulla prima
// fase**: è lì che il materiale esce, una volta sola.
function opAvvia(id, faseId, opz) {
  if (!opGuard(id, 'reception')) return false;
  const o = getOdp(id); if (!o) return false;
  const fase = (o.phases || []).find(f => f.id === faseId); if (!fase) return false;
  const opzioni = opz || {};
  const ok = opAvviabile(o, fase);
  if (!ok.ok) {
    if (!opzioni.forza || !ok.fase) { showToast(`Non si può avviare la fase ${fase.seq}: ${ok.motivo}`, 'error'); return false; }
    const motivo = String(opzioni.motivo || '').trim();
    if (!motivo) { showToast('Per forzare l\'avvio serve il motivo', 'error'); return false; }
    opDecl(o, fase, 'forzatura', { motivo, note: ok.motivo });
  }
  if (opAvviata(o, fase)) { showToast(`La fase ${fase.seq} è già avviata`, 'error'); return false; }
  opDecl(o, fase, 'avvio', { note: String(opzioni.note || '').trim() });
  // Il materiale esce **all'avvio della prima fase**, e solo lì: è il primo dei
  // due estremi del ciclo. Le fasi successive non muovono il magazzino, e non
  // per pigrizia — fra le fasi i pezzi non hanno un codice che li nomini.
  if (opEPrima(o, fase)) opPrelevaMateriale(o, opzioni.materiali, opzioni.note);
  odpAutoStatus(o); touch(o); saveDB();
  return true;
}
// `righe` è [{ itemId, qty }]; senza, si preleva il residuo congelato.
function opPrelevaMateriale(o, righe, note) {
  const kind = opKindUscita(o);
  const fase = opPrima(o);
  const lista = righe && righe.length ? righe
    : opMaterialeResiduo(o).map(m => ({ itemId: m.itemId, qty: m.residuo }));
  let n = 0;
  lista.forEach(r => {
    const q = Number(r.qty) || 0;
    if (!(q > 0)) return;                   // una riga a zero non è un movimento
    const extra = { orderId: o.id, lineId: fase ? fase.id : null, declId: r.declId || null };
    if (kind === 'clOut') extra.supplierId = fase.supplierId;
    if (addMovement(r.itemId, kind, -q, note || `Materiale per ${o.number}`, extra)) n++;
  });
  return n;
}

// ─── Dichiarazione di avanzamento ───
// Pezzi buoni e scarti. Sull'**ultima** fase i pezzi buoni entrano a magazzino
// col codice della parte: è l'altro estremo del ciclo, ed è il solo momento in
// cui quel codice ha diritto di esistere come giacenza.
function opDichiara(id, faseId, dati) {
  if (!opGuard(id, 'reception')) return false;
  const o = getOdp(id); if (!o) return false;
  const fase = (o.phases || []).find(f => f.id === faseId); if (!fase) return false;
  if (!opAvviata(o, fase)) { showToast(`La fase ${fase.seq} non è stata avviata`, 'error'); return false; }
  const d = dati || {};
  const qty = Math.max(0, Number(d.qty) || 0);
  const scrap = Math.max(0, Number(d.scrap) || 0);
  if (!(qty > 0) && !(scrap > 0)) { showToast('Niente da dichiarare: pezzi e scarti sono a zero', 'error'); return false; }
  const decl = opDecl(o, fase, 'avanzamento', { qty, scrap, note: String(d.note || '').trim() });
  if (opEUltima(o, fase) && qty > 0) {
    const extra = { orderId: o.id, lineId: fase.id, declId: decl.id };
    const kind = opKindEntrata(o);
    if (kind === 'clIn') extra.supplierId = fase.supplierId;
    addMovement(o.itemId, kind, qty, String(d.note || '').trim() || `Versamento da ${o.number}`, extra);
  }
  // Il rientro dichiarato qui è lo stesso fatto che l'ordine di lavoro chiama
  // «rientrati»: scriverlo in due posti a mano significherebbe tenerli
  // d'accordo a mano. Il padrone è questo, l'ODL lo rispecchia.
  opSyncOdlReceived(o, fase);
  odpAutoStatus(o); touch(o); saveDB();
  return true;
}
// Chiusura in difetto: i pezzi che mancano **non proseguono**, e va detto.
function opChiudiFase(id, faseId, note) {
  if (!opGuard(id, 'reception')) return false;
  const o = getOdp(id); if (!o) return false;
  const fase = (o.phases || []).find(f => f.id === faseId); if (!fase) return false;
  if (opChiusa(o, fase)) return false;
  opDecl(o, fase, 'chiusura', { note: String(note || '').trim() });
  odpAutoStatus(o); touch(o); saveDB();
  return true;
}
// Riapribile solo se nessuna fase successiva è partita: riaprire sotto una fase
// già avviata cambierebbe i pezzi entrati in quella, a lavoro già cominciato.
function opRiapriFase(id, faseId) {
  if (!opGuard(id, 'reception')) return false;
  const o = getOdp(id); if (!o) return false;
  const i = (o.phases || []).findIndex(f => f.id === faseId);
  if (i < 0) return false;
  const seguente = opPhaseAt(o, i + 1);
  if (seguente && opAvviata(o, seguente)) {
    showToast(`La fase ${seguente.seq} è già avviata: va riaperta prima quella`, 'error');
    return false;
  }
  const chiusure = opDecls(o.id, faseId).filter(d => d.kind === 'chiusura');
  if (!chiusure.length && opChiusa(o, o.phases[i])) {
    showToast('La fase è chiusa perché i pezzi la coprono: per riaprirla annulla una dichiarazione', 'error');
    return false;
  }
  chiusure.forEach(d => Store.remove('prodDecls', d.id));
  odpAutoStatus(o); touch(o); saveDB();
  return true;
}
// Annullare una dichiarazione toglie **i suoi** movimenti, non quelli della
// fase: è per questo che ogni movimento porta il `declId` di chi l'ha generato.
function opAnnullaDichiarazione(declId) {
  if (!roleGuard('docs')) return false;
  const d = (db.prodDecls || []).find(x => x.id === declId); if (!d) return false;
  if (!opGuard(d.odpId, 'reception')) return false;
  const o = getOdp(d.odpId);
  (db.movements || []).filter(m => m.declId === declId).forEach(m => Store.remove('movements', m.id));
  Store.remove('prodDecls', declId);
  if (o) { const fase = (o.phases || []).find(f => f.id === d.phaseId); if (fase) opSyncOdlReceived(o, fase); odpAutoStatus(o); touch(o); }
  saveDB();
  return true;
}

// ═══════════════════════════════════════════════════════════
//  IL LEGAME CON L'ORDINE DI LAVORO
// ═══════════════════════════════════════════════════════════
// L'ordine di produzione dice **cosa va fatto e in che ordine**; l'ordine di
// lavoro è il documento che commissiona una di quelle fasi a un terzista. Il
// legame non è un campo sulla fase — sarebbe un secondo posto da tenere
// allineato — ma un indice sulle righe degli ODL, che quel legame lo portano
// già: `odpId` e `odpPhaseId`.
function opOdlIndex() {
  if (_opOdlIdx) return _opOdlIdx;
  const map = new Map();
  (db.workOrders || []).forEach(o => (o.lines || []).forEach(l => {
    if (l.odpPhaseId) map.set(l.odpPhaseId, { odl: o, line: l });
  }));
  _opOdlIdx = map;
  return map;
}
function opOdlDi(fase) { return fase ? (opOdlIndex().get(fase.id) || null) : null; }
// Tutte le fasi della **tratta** cui la fase appartiene: è la tratta che diventa
// una riga di ordine di lavoro, non la singola fase. Fasi consecutive dello
// stesso terzista sono una lavorazione da commissionare, non due.
function opRunFasi(odp, fase) {
  return (odp.phases || []).filter(f => f.supplierId === fase.supplierId && f.runFrom === fase.runFrom);
}
function opApreTratta(odp, fase) {
  const fasi = opRunFasi(odp, fase);
  return !!fasi.length && fasi[0].id === fase.id;
}
// Una fase esterna che apre la sua tratta e non è ancora commissionata.
function opGenerabile(odp, fase) {
  return !!fase.supplierId && opApreTratta(odp, fase) && !opRunFasi(odp, fase).some(f => opOdlDi(f));
}
// `received` sulla riga di ordine di lavoro significa **pezzi tornati**, e da
// quando esiste l'ordine di produzione quel fatto lo dichiara lui. Il campo
// resta quello di sempre, con gli stessi lettori — orderReception,
// ordAutoStatus, l'elenco, gli export: cambia solo chi lo scrive.
function opSyncOdlReceived(odp, fase) {
  const legame = opOdlDi(fase); if (!legame) return;
  const tutte = opRunFasi(odp, fase);
  // La riga copre la tratta intera: i pezzi tornati sono quelli usciti
  // dall'**ultima** fase della tratta, non la somma delle fasi — sono
  // lavorazioni sullo stesso pezzo, non pezzi diversi.
  const ultima = tutte[tutte.length - 1] || fase;
  const n = Math.min(opFatti(odp, ultima), Number(legame.line.qty) || 0);
  if (legame.line.received === n) return;
  legame.line.received = n;
  if (typeof ordAutoStatus === 'function') ordAutoStatus(legame.odl);
  touch(legame.odl);
}

// ═══════════════════════════════════════════════════════════
//  VISTA: ORDINI DI PRODUZIONE
// ═══════════════════════════════════════════════════════════
// Stesso telaio delle altre viste a documento — l'elenco a destra, il documento
// al centro — perché è la stessa domanda: si sceglie un ordine e lo si lavora.
const odpFilters = { q: '', status: '', from: '', to: '' };
function odpFilterActive() { return !!(odpFilters.q || odpFilters.status || odpFilters.from || odpFilters.to); }
function odpFilterApply(list) {
  const q = odpFilters.q.trim().toLowerCase();
  return list.filter(o => {
    if (odpFilters.status && o.status !== odpFilters.status) return false;
    if (!inDateRange(o.date, odpFilters.from, odpFilters.to)) return false;
    if (!q) return true;
    return [o.number, o.title, o.code, o.name].some(x => String(x || '').toLowerCase().includes(q));
  });
}
function odpFilterChange() {
  odpFilters.q = val('odp-f-q'); odpFilters.status = val('odp-f-status');
  odpFilters.from = val('odp-f-from'); odpFilters.to = val('odp-f-to');
  renderOdp();
}
function odpFilterInput() { debounced('odpf', odpFilterChange); }
function odpFilterReset() { odpFilters.q = ''; odpFilters.status = ''; odpFilters.from = ''; odpFilters.to = ''; renderOdp(); }

function renderOdp() {
  const host = document.getElementById('view-odp'); if (!host) return;
  if (odpView === 'edit' && !getOdp(currentOdpId)) { odpView = 'list'; currentOdpId = null; }
  const o = odpView === 'edit' ? getOdp(currentOdpId) : null;
  const tutti = db.prodOrders || [];
  host.innerHTML = worklistHtml({
    titolo: 'Ordini di produzione', icona: 'factory', listaId: 'odp-list',
    comandi: `<button class="add-btn-sm" onclick="newOdpModal()">+ Nuovo ordine di produzione</button>
      ${listExportButtons('odpListExportSpec')}`,
    filtri: `<input type="text" class="search" id="odp-f-q" value="${esc(odpFilters.q)}" placeholder="Cerca numero, oggetto o parte..." oninput="odpFilterInput()">
      <select id="odp-f-status" onchange="odpFilterChange()">
        <option value="">Tutti gli stati</option>
        ${Object.entries(ODP_STATUS).map(([k, v]) => `<option value="${k}" ${odpFilters.status === k ? 'selected' : ''}>${v}</option>`).join('')}
      </select>
      ${dateRangeFilter('odp-f', odpFilters.from, odpFilters.to, 'odpFilterChange()', 'ordine')}
      <span class="doc-filter-count">${worklistCount(odpFilterApply(tutti).length, tutti.length, 'ordine', 'ordini')}</span>
      ${odpFilterActive() ? '<button class="btn-outline" onclick="odpFilterReset()">✕ Azzera filtri</button>' : ''}`,
    righe: odpListRows(),
    doc: o ? renderOdpEdit(currentOdpId) : '',
    vuoto: {
      titolo: 'Nessun ordine di produzione aperto qui',
      testo: 'Scegli un ordine dall\'elenco a destra. Gli ordini di produzione nascono dal <strong>Fabbisogno</strong>, dalle parti da fabbricare: al centro compaiono le fasi del ciclo in successione, con l\'avanzamento e i due punti in cui il magazzino si muove.',
      comandi: '<button class="add-btn-sm" onclick="newOdpModal()">+ Nuovo ordine di produzione</button>',
    },
  });
  if (o) applyDocLock(odpMode(o), host);
  a11yFields(host);
}
function odpListRows() {
  const tutti = db.prodOrders || [];
  const list = odpFilterApply(tutti.slice().sort((a, b) => (b.number || '').localeCompare(a.number || '')));
  return list.map(o => {
    const fasi = (o.phases || []).length;
    const chiuse = (o.phases || []).filter(f => opChiusa(o, f)).length;
    const corrente = opFaseCorrente(o);
    return worklistRow({
      numero: o.number,
      badge: statusBadge(ODP_STATUS, o.status),
      titolo: `${o.code || ''} ${o.name || ''}`.trim() || o.title || '',
      meta: `${fmtQty(o.qty)} ${esc(o.uom || 'pz')} · fasi ${chiuse}/${fasi}${corrente ? ' · ' + esc('alla ' + corrente.seq + ' ' + corrente.wcName) : ''}${o.dueDate ? ' · ' + esc(fmtDateIt(o.dueDate)) : ''}`,
      sel: odpView === 'edit' && currentOdpId === o.id,
      spenta: o.status === 'annullato' || o.status === 'chiuso',
      azione: `openOdpEdit('${o.id}')`,
      etichetta: `Apri l'ordine di produzione ${o.number}`,
    });
  }).join('') || `<div class="empty-text">${tutti.length ? 'Nessun ordine di produzione con questi filtri.' : 'Nessun ordine di produzione. Si generano dal Fabbisogno, dalle parti da fabbricare.'}</div>`;
}
function openOdpEdit(id) { currentOdpId = id; odpView = 'edit'; odpUnlockedId = null; renderOdp(); }
function odpBackToList() { odpView = 'list'; currentOdpId = null; odpUnlockedId = null; renderOdp(); }
function odpUnlock(id) {
  const o = getOdp(id); if (!o) return;
  askConfirm(`L'ordine di produzione ${o.number} risulta ${(ODP_STATUS[o.status] || '').toLowerCase()}.\nSbloccarlo per modificarlo?`, () => {
    odpUnlockedId = id; renderOdp(); showToast('Ordine di produzione sbloccato');
  }, { title: 'Sblocca per modifica', ok: 'Sblocca', safe: true });
}
function odpSetField(id, field, value) {
  if (!opGuard(id, field === 'status' ? 'ops' : 'contract')) { renderOdp(); return; }
  const o = getOdp(id); if (!o) return;
  if (field === 'qty') {
    // Cambiare i pezzi dopo il lancio vorrebbe dire riscrivere il materiale già
    // uscito: si fa in bozza, dove il materiale non è ancora congelato per
    // nessuno. Ricongelarlo qui tiene le due cose d'accordo senza chiederlo.
    o.qty = Math.max(0, Number(value) || 0);
    const part = getItem(o.itemId);
    if (part && o.status === 'bozza') o.materials = opFreezeMaterials(part, o.qty);
  } else {
    o[field] = campoTesto(value) || (field === 'jobId' ? null : '');
  }
  touch(o); saveDB(); renderOdp();
}
function delOdp(id) {
  const o = getOdp(id); if (!o || !roleGuard('docs')) return;
  const mov = (db.movements || []).filter(m => m.orderId === id).length;
  const avviso = mov ? `\n\n⚠ Ha ${mov} ${mov === 1 ? 'movimento' : 'movimenti'} di magazzino: eliminandolo la merce torna com'era prima.` : '';
  askConfirm(`Eliminare l'ordine di produzione ${o.number}?${avviso}`, () => {
    (db.prodDecls || []).filter(d => d.odpId === id).forEach(d => Store.remove('prodDecls', d.id));
    (db.movements || []).filter(m => m.orderId === id).forEach(m => Store.remove('movements', m.id));
    odpView = 'list'; currentOdpId = null;
    removeConUndo('prodOrders', id, `Ordine di produzione ${o.number} eliminato`, renderOdp);
  }, { title: 'Elimina ordine di produzione', ok: 'Elimina' });
}

// ─── La scheda ───
// La tabella delle fasi è il cuore del documento: si legge dall'alto in basso
// come si esegue il ciclo, e i comandi compaiono **solo dove sono leciti**. Una
// fase bloccata non mostra un pulsante spento — dice *perché e da chi*, che è
// la stessa scelta già fatta per le righe di conto lavoro in mezzo a una
// tratta: l'assenza di un comando, da sola, somiglia a un difetto.
function renderOdpEdit(id) {
  const o = getOdp(id); if (!o) return '';
  const mode = odpMode(o);
  const part = getItem(o.itemId);
  const fasi = o.phases || [];
  const chiuse = fasi.filter(f => opChiusa(o, f)).length;
  const ultima = opUltima(o);
  const buoni = ultima ? opFatti(o, ultima) : 0;
  const scarti = fasi.reduce((s, f) => s + opScarti(o, f), 0);
  const esterno = fasi.reduce((s, f) => s + (f.supplierId ? (f.costMode === 'orario' ? f.hours * f.rate : f.cost) * (Number(o.qty) || 0) : 0), 0);
  const lockBanner = docLockBanner(mode, 'Ordine di produzione ' + (ODP_STATUS[o.status] || o.status).toLowerCase(), 'odp', id);
  const piano = o.planId && (db.plans || []).find(p => p.id === o.planId);
  return `<div class="manage-wrap">
    <div class="bom-toolbar">
      <div class="bom-toolbar-left">
        ${worklistCloseBtn('odpBackToList()', "l'ordine di produzione")}
        <h2 class="section-title" style="font-family:var(--mono)">${esc(o.number)}</h2>
        ${statusBadge(ODP_STATUS, o.status)}
        ${o.status === 'bozza'
    ? `<button class="add-btn-sm" onclick="odpLancia('${id}')" title="Congela fasi e materiale, e apre la produzione">${ico('factory', 'tinted', '')} Lancia</button>`
    : ''}
        ${ODP_APERTI.includes(o.status) || o.status === 'completato'
    ? `<button class="btn-outline" onclick="odpChiudi('${id}')" title="Chiude l'ordine: non si dichiara più niente">${ico('lock', 'tinted', '')} Chiudi</button>` : ''}
        ${o.status !== 'annullato' ? `<button class="btn-outline" onclick="odpAnnulla('${id}')" title="Annulla l'ordine">${ico('close', 'tinted', '')} Annulla</button>` : ''}
        <button class="btn-outline" style="color:var(--red);border-color:var(--red)" onclick="delOdp('${id}')" title="Elimina l'ordine di produzione">${ico('trash', 'tinted', '')} Elimina</button>
      </div>
      <div class="bom-toolbar-right">
        <div class="export-pair">
          <button class="export-btn-xls" onclick="exportOdpExcel('${id}')">${ico('sheet', 'tinted', '')} Esporta Excel</button>
          <button class="export-btn-pdf" onclick="exportOdpPDF('${id}')">${ico('file', 'tinted', '')} Esporta PDF</button>
        </div>
      </div>
    </div>
    ${piano ? `<div class="empty-text" style="text-align:left">${ico('list', 'tinted', '')} Generato dal piano <strong>${esc(piano.number)}</strong></div>` : ''}
    ${lockBanner}
    <div class="modal-grid">
      <div class="modal-field"><label>Parte</label>
        <div class="odp-part">${part ? codeLink(part.id, part.code) : esc(o.code || '')} ${esc(o.name || '')}</div></div>
      <div class="modal-field"><label>Pezzi da produrre</label>
        <input type="number" class="num lock-contract" min="0" step="any" value="${esc(String(o.qty || 0))}" onchange="odpSetField('${id}','qty',this.value)"></div>
      <div class="modal-field"><label>Data</label>
        <input type="date" class="lock-contract" value="${esc((o.date || '').slice(0, 10))}" onchange="odpSetField('${id}','date',this.value)"></div>
      <div class="modal-field"><label>Serve per</label>
        <input type="date" class="lock-contract" value="${esc((o.dueDate || '').slice(0, 10))}" onchange="odpSetField('${id}','dueDate',this.value)"></div>
      <div class="modal-field"><label>Commessa</label>
        <select class="lock-contract" onchange="odpSetField('${id}','jobId',this.value)">${jobOptions(o.jobId || '')}</select></div>
      <div class="modal-field"><label>Stato</label>
        <select onchange="odpSetField('${id}','status',this.value)">
          ${Object.entries(ODP_STATUS).map(([k, v]) => `<option value="${k}" ${o.status === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select></div>
      <div class="modal-field" style="grid-column:1/-1"><label>Note</label>
        <input class="lock-contract" value="${esc(o.notes || '')}" onchange="odpSetField('${id}','notes',this.value)"></div>
      <div class="modal-field" style="grid-column:1/-1"><label>${ico('lock', 'tinted', '')} Note interne (non stampate)</label>
        <input class="notes-internal" value="${esc(o.notesInternal || '')}" onchange="odpSetField('${id}','notesInternal',this.value)"></div>
    </div>
    ${stampLine(o)}
    <div class="cost-summary">
      ${kpi('Pezzi lanciati', fmtQty(o.qty), 'accent')}
      ${kpi('Buoni all\'ultima fase', fmtQty(buoni), 'green')}
      ${kpi('Scarti', fmtQty(scarti), scarti > 0 ? 'orange' : '')}
      ${kpi('Fasi chiuse', `${chiuse}/${fasi.length}`, 'purple')}
      ${esterno > 0 ? kpi('Lavorazioni esterne', fmtN(esterno), '') : ''}
    </div>
    ${o.status === 'bozza' ? `<div class="rfq-warn">${ico('warning', 'tinted', '')} L'ordine è in <strong>bozza</strong>: quantità, date e fasi si possono ancora cambiare, e non si dichiara niente. <strong>Lancia</strong> per aprire la produzione — da lì fasi e materiale si congelano.</div>` : ''}
    <div class="mrp-section">
      <div class="cycle-section-head"><h3>${ico('wrench', 'tinted pill', '')} Le fasi, in successione</h3></div>
      <p class="empty-text" style="text-align:left;padding:0 0 8px">Una fase non si avvia finché la precedente non è chiusa, e <strong>solo i pezzi buoni proseguono</strong>: uno scarto alla prima fase restringe tutte quelle che seguono. Il magazzino si muove in <strong>due punti soli</strong> — escono i codici del ciclo all'avvio della prima fase, entra il codice della parte sull'ultima. In mezzo non si scrive niente: i pezzi non sono più il materiale e non sono ancora la parte, e <em>dove sono</em> lo dice questa tabella.</p>
      <div class="table-wrap"><table>
        <thead><tr>
          <th scope="col" style="width:60px">Fase</th>
          <th scope="col">Lavorazione</th>
          <th scope="col">Dove</th>
          <th scope="col" style="width:90px" title="I pezzi che entrano in questa fase: i buoni usciti dalla precedente">Da fare</th>
          <th scope="col" style="width:90px">Fatti</th>
          <th scope="col" style="width:90px">Scarti</th>
          <th scope="col" style="width:110px">Stato</th>
          <th scope="col">Comandi</th></tr></thead>
        <tbody>${odpPhaseRows(o)}</tbody></table></div>
    </div>
    ${odpMaterialBlock(o)}
    ${odpDeclBlock(o)}
    ${odpMovBlock(o)}
  </div>`;
}
function odpPhaseRows(o) {
  const id = o.id;
  return (o.phases || []).map(f => {
    const st = opStatoFase(o, f);
    const legame = opOdlDi(f);
    const forzata = opForzata(o, f);
    return `<tr class="odp-fase odp-fase-${st}">
      <td><span class="cycle-phase">${esc(String(f.seq))}</span></td>
      <td>${esc(f.wcName)}${f.note ? ` <span class="empty-text" style="padding:0">${esc(f.note)}</span>` : ''}</td>
      <td>${f.supplierId
    ? `${ico('factory', 'tinted', '')} ${esc(f.supplierName || supplierName(f.supplierId) || '—')}`
    : '<span class="empty-text" style="padding:0">Interna</span>'}</td>
      <td class="num">${fmtQty(opDaFare(o, f))}</td>
      <td class="num">${fmtQty(opFatti(o, f))}</td>
      <td class="num">${opScarti(o, f) > 0 ? `<span class="mrp-warn">${fmtQty(opScarti(o, f))}</span>` : '—'}</td>
      <td>${statusBadge(ODP_FASE_LABELS, st)}${forzata ? ` <span class="mrp-warn" title="Avviata forzando la successione: il motivo è nello storico">${ico('warning', 'tinted', '')} forzata</span>` : ''}</td>
      <td>${odpPhaseActions(o, f, st, legame)}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="8" class="empty-text">Questo ordine non ha fasi: il ciclo della parte è vuoto.</td></tr>';
}
function odpPhaseActions(o, f, st, legame) {
  const id = o.id;
  const cmd = [];
  const link = (azione, testo, titolo) => `<span class="plandoc-link plandoc-link-sm" ${clickAttrs(azione, titolo)}>${esc(testo)}</span>`;
  if (st === 'avviabile') {
    cmd.push(link(`opAvviaModal('${id}','${f.id}')`, 'avvia',
      opEPrima(o, f) ? 'Avvia la fase e preleva il materiale del ciclo: esce dal magazzino'
        : 'Avvia la fase. Il magazzino non si muove: i pezzi sono già fuori dallo scaffale'));
  } else if (st === 'attesa') {
    const blocco = opAvviabile(o, f);
    // Dire cosa manca vale più di un pulsante spento: chi guarda vuole sapere
    // dove andare, non scoprire che qui non si può fare niente.
    cmd.push(`<span class="empty-text" style="padding:0" title="La successione delle fasi non si scavalca per sbaglio">${esc(blocco.motivo || 'non avviabile')}</span>`);
    if (blocco.fase) cmd.push(link(`opForzaModal('${id}','${f.id}')`, 'forza avvio', 'Avvia comunque, dichiarando il motivo: resta scritto nello storico'));
  } else if (st === 'corso') {
    cmd.push(link(`opDichiaraModal('${id}','${f.id}')`, 'dichiara',
      opEUltima(o, f) ? 'Dichiara i pezzi buoni e gli scarti: i buoni entrano a magazzino col codice della parte'
        : 'Dichiara i pezzi buoni e gli scarti di questa fase'));
    cmd.push(link(`opChiudiModal('${id}','${f.id}')`, 'chiudi', 'Chiudi la fase anche se i pezzi non la coprono'));
  } else if (st === 'chiusa') {
    cmd.push(link(`opRiapriFaseAsk('${id}','${f.id}')`, 'riapri', 'Riapre la fase, se nessuna successiva è partita'));
  }
  if (legame) {
    cmd.push(`<span class="plandoc-link plandoc-link-sm" ${clickAttrs(`openOdlFromOdp('${legame.odl.id}')`, "Apri l'ordine di lavoro che commissiona questa fase")}>${esc(legame.odl.number)}</span>`);
  } else if (opGenerabile(o, f) && o.status !== 'bozza') {
    cmd.push(link(`opGeneraOdlAsk('${id}','${f.id}')`, 'genera ordine di lavoro',
      'Commissiona questa tratta al terzista: ne nasce un ordine di lavoro con la tariffa del ciclo'));
  }
  return `<div class="line-cl-actions">${cmd.join('')}</div>`;
}

function odpMaterialBlock(o) {
  const righe = opMaterialeResiduo(o);
  if (!righe.length) {
    return `<div class="mrp-section"><div class="cycle-section-head"><h3>${ico('package', 'tinted pill', '')} Materiale del ciclo</h3></div>
      <p class="empty-text" style="text-align:left">Il ciclo di questa parte non ha materiale a magazzino: lo mette chi la lavora. Non c'è niente da prelevare, e infatti non c'è niente da scaricare.</p></div>`;
  }
  const prima = opPrima(o);
  return `<div class="mrp-section">
    <div class="cycle-section-head"><h3>${ico('package', 'tinted pill', '')} Materiale del ciclo</h3></div>
    <p class="empty-text" style="text-align:left;padding:0 0 8px">Esce <strong>una volta sola</strong>, all'avvio della fase ${prima ? esc(String(prima.seq)) : ''}${prima && prima.supplierId ? ` — e va da ${esc(prima.supplierName || '')}` : ''}. Le quantità vengono dal ciclo moltiplicate per i pezzi dell'ordine.</p>
    <div class="table-wrap"><table>
      <thead><tr><th scope="col">Codice</th><th scope="col">Articolo</th><th scope="col" style="width:100px">Per pezzo</th>
        <th scope="col" style="width:100px">Previsto</th><th scope="col" style="width:100px">Uscito</th><th scope="col" style="width:100px">Residuo</th></tr></thead>
      <tbody>${righe.map(m => `<tr>
        <td>${codeLink(m.itemId, m.code)}</td><td>${esc(m.name)}</td>
        <td class="num">${fmtQty(m.perPezzo)} ${esc(m.uom)}</td>
        <td class="num">${fmtQty(m.qty)}</td>
        <td class="num">${fmtQty(m.gia)}</td>
        <td class="num">${m.residuo > 0 ? fmtQty(m.residuo) : '<span class="price-best">✓</span>'}</td></tr>`).join('')}</tbody>
    </table></div></div>`;
}
// Data e ora leggibili: una dichiarazione di produzione si distingue da
// un'altra per l'ora, non per il giorno.
function odpQuando(iso) { return String(iso || '').slice(0, 16).replace('T', ' '); }
function odpDeclBlock(o) {
  const decls = opDeclsOf(o).slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  if (!decls.length) return '';
  const nomeFase = pid => { const f = (o.phases || []).find(x => x.id === pid); return f ? `fase ${f.seq} ${f.wcName}` : '—'; };
  const etichetta = { avvio: 'Avvio', avanzamento: 'Avanzamento', forzatura: 'Forzatura', chiusura: 'Chiusura' };
  return `<div class="mrp-section">
    <div class="cycle-section-head"><h3>${ico('clock', 'tinted pill', '')} Storico delle dichiarazioni</h3></div>
    <div class="table-wrap"><table>
      <thead><tr><th scope="col" style="width:150px">Quando</th><th scope="col">Fase</th><th scope="col" style="width:110px">Cosa</th>
        <th scope="col" style="width:80px">Pezzi</th><th scope="col" style="width:80px">Scarti</th><th scope="col">Nota</th>
        <th scope="col" style="width:60px"></th></tr></thead>
      <tbody>${decls.map(d => `<tr class="${d.kind === 'forzatura' ? 'odp-forzata' : ''}">
        <td>${esc(odpQuando(d.date))}</td>
        <td>${esc(nomeFase(d.phaseId))}</td>
        <td>${d.kind === 'forzatura' ? `<span class="mrp-warn">${ico('warning', 'tinted', '')} Forzatura</span>` : esc(etichetta[d.kind] || d.kind)}</td>
        <td class="num">${d.qty ? fmtQty(d.qty) : '—'}</td>
        <td class="num">${d.scrap ? fmtQty(d.scrap) : '—'}</td>
        <td>${d.kind === 'forzatura' ? `<strong>${esc(d.motivo || '')}</strong>${d.note ? ` <span class="empty-text" style="padding:0">(${esc(d.note)})</span>` : ''}` : esc(d.note || '')}</td>
        <td>${d.kind === 'avanzamento'
    ? `<button class="mini-btn danger lock-reception" onclick="opAnnullaDichiarazioneAsk('${d.id}')" title="Annulla questa dichiarazione e i movimenti che ha generato">${ico('trash', 'tinted', 'Annulla')}</button>`
    : ''}</td></tr>`).join('')}</tbody>
    </table></div></div>`;
}
// I movimenti che questo ordine ha generato, tutti insieme: è la prova visibile
// che «una volta sola» ha retto, e il posto dove si vede che fra le fasi non si
// è scritto niente.
function odpMovBlock(o) {
  const mov = (db.movements || []).filter(m => m.orderId === o.id)
    .slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  if (!mov.length) return '';
  return `<div class="mrp-section">
    <div class="cycle-section-head"><h3>${ico('package', 'tinted pill', '')} Movimenti di magazzino generati</h3></div>
    <div class="table-wrap"><table>
      <thead><tr><th scope="col" style="width:150px">Quando</th><th scope="col">Codice</th><th scope="col">Tipo</th>
        <th scope="col" style="width:100px">Quantità</th><th scope="col">Dove</th><th scope="col">Nota</th></tr></thead>
      <tbody>${mov.map(m => {
    const it = getItem(m.itemId);
    return `<tr>
        <td>${esc(odpQuando(m.date))}</td>
        <td>${it ? codeLink(it.id, it.code) : ''}</td>
        <td>${esc(MOVEMENT_KINDS[m.kind] || m.kind)}</td>
        <td class="num">${fmtQty(m.qty)}</td>
        <td>${m.supplierId ? esc(supplierName(m.supplierId) || '') : '<span class="empty-text" style="padding:0">in casa</span>'}</td>
        <td>${esc(m.note || '')}</td></tr>`;
  }).join('')}</tbody>
    </table></div></div>`;
}

// ─── I comandi della testata ───
function odpLancia(id) { if (opLancia(id)) { renderOdp(); showToast('Ordine di produzione lanciato'); } else renderOdp(); }
function odpChiudi(id) {
  const o = getOdp(id); if (!o || !opGuard(id, 'ops')) return;
  askConfirm(`Chiudere l'ordine ${o.number}?\nNon si dichiarerà più niente su queste fasi.`, () => {
    o.status = 'chiuso'; touch(o); saveDB(); renderOdp(); showToast('Ordine chiuso');
  }, { title: 'Chiudi ordine di produzione', ok: 'Chiudi', safe: true });
}
function odpAnnulla(id) {
  const o = getOdp(id); if (!o || !opGuard(id, 'ops')) return;
  askConfirm(`Annullare l'ordine ${o.number}?\nI movimenti già registrati restano: annullare non è cancellare.`, () => {
    o.status = 'annullato'; touch(o); saveDB(); renderOdp(); showToast('Ordine annullato');
  }, { title: 'Annulla ordine di produzione', ok: 'Annulla ordine' });
}

// ═══════════════════════════════════════════════════════════
//  LE SCHEDE DI AVANZAMENTO
// ═══════════════════════════════════════════════════════════
// Stessa grammatica delle schede del conto lavoro: si dice cosa si sta per
// registrare, si propone il **residuo**, e si spiega in chiaro se il gesto tocca
// il magazzino oppure no. Un comando che sembra un carico e non carica è il modo
// più rapido di far perdere fiducia in una giacenza.
function opFaseDi(id, faseId) {
  const o = getOdp(id); if (!o) return null;
  const f = (o.phases || []).find(x => x.id === faseId);
  return f ? { o, f } : null;
}
function opTestaModal(o, f, titolo) {
  return `<h3>${ico('factory', 'tinted pill', '')} ${esc(titolo)}</h3>
    <p>${esc(o.number)} · <strong>${esc((o.code || '') + ' ' + (o.name || ''))}</strong> — fase ${esc(String(f.seq))} ${esc(f.wcName)}${f.supplierId ? ' · ' + esc(f.supplierName || '') : ''}</p>`;
}
function opAvviaModal(id, faseId) {
  const x = opFaseDi(id, faseId); if (!x) return;
  const { o, f } = x;
  if (!roleGuard('docs')) return;
  const prima = opEPrima(o, f);
  const righe = prima ? opMaterialeResiduo(o).filter(m => m.residuo > 0.000001) : [];
  window.__opAvviaMat = righe.map(m => m.itemId);
  const spiega = prima
    ? (f.supplierId
      ? 'Il materiale <strong>esce dal magazzino</strong> e va dal terzista: allo scaffale non c\'è più, e il prospetto <em>presso terzi</em> dice da chi sta. Esce <strong>una volta sola</strong>, qui.'
      : 'Il materiale <strong>esce dal magazzino</strong> come consumo di produzione. Esce <strong>una volta sola</strong>, qui.')
    : 'Questa fase <strong>non muove il magazzino</strong>: i pezzi sono già fuori dallo scaffale da quando è partita la prima fase, e non sono ancora la parte finita. Dove stanno lo dice questa tabella, non una giacenza.';
  const corpo = righe.map((m, i) => `<div class="mgmt-item">
      <span style="width:110px;font-family:var(--mono)">${esc(m.code)}</span>
      <span style="flex:1">${esc(m.name)} <span class="empty-text" style="padding:0">${fmtQty(m.perPezzo)} ${esc(m.uom)}/pz</span>${m.gia ? ` <span class="rfq-clavoro-tag">già ${fmtQty(m.gia)}</span>` : ''}</span>
      <input class="num" type="number" id="op-q-${i}" min="0" step="any" value="${esc(String(+m.residuo.toFixed(4)))}" style="width:110px">
      <span class="empty-text" style="padding:0;width:40px">${esc(m.uom)}</span>
    </div>`).join('');
  openModal(`${opTestaModal(o, f, 'Avvia la fase ' + f.seq)}
    ${prima && !righe.length && (o.materials || []).length ? `<div class="rfq-warn">${ico('warning', 'tinted', '')} Il materiale di questo ordine è <strong>già uscito tutto</strong>.</div>` : ''}
    ${corpo ? `<h4 class="settings-group-title">Materiale che esce, dal ciclo della parte</h4>
      <div style="display:flex;flex-direction:column;gap:6px">${corpo}</div>` : ''}
    <p class="empty-text" style="text-align:left;padding:8px 0">${spiega}</p>
    <div class="modal-field"><label>Nota</label><input id="op-note" placeholder="es. lotto 12 / bolla 412" autocomplete="off"></div>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="opAvviaSave('${esc(id)}','${esc(faseId)}')">Avvia</button>
    </div>`, !!corpo, 'form');
}
function opAvviaSave(id, faseId) {
  const ids = window.__opAvviaMat || [];
  const materiali = ids.map((itemId, i) => ({ itemId, qty: rawNum('op-q-' + i) }));
  if (!opAvvia(id, faseId, { materiali, note: val('op-note') })) return;
  closeModal(); renderOdp(); showToast('Fase avviata');
}
function opDichiaraModal(id, faseId) {
  const x = opFaseDi(id, faseId); if (!x) return;
  const { o, f } = x;
  if (!roleGuard('docs')) return;
  const residua = opResidua(o, f);
  const ultima = opEUltima(o, f);
  openModal(`${opTestaModal(o, f, 'Dichiara l\'avanzamento')}
    <p class="empty-text" style="text-align:left;padding:0 0 8px">Entrati in questa fase: <strong>${fmtQty(opDaFare(o, f))}</strong> · già lavorati: <strong>${fmtQty(opProcessati(o, f))}</strong> · restano <strong>${fmtQty(residua)}</strong>.</p>
    <div class="modal-grid">
      <div class="modal-field"><label>Pezzi buoni</label>
        <input class="num" type="number" id="op-d-qty" min="0" step="any" value="${esc(String(+residua.toFixed(4)))}"></div>
      <div class="modal-field"><label>Scarti</label>
        <input class="num" type="number" id="op-d-scrap" min="0" step="any" value="0"></div>
    </div>
    <p class="empty-text" style="text-align:left;padding:8px 0">${ultima
    ? `È l'<strong>ultima fase</strong>: i pezzi buoni <strong>entrano a magazzino</strong> col codice <strong>${esc(o.code || '')}</strong>, ed è l'unico punto in cui quel codice si carica.`
    : 'Questa fase <strong>non muove il magazzino</strong>. Gli scarti non proseguono: la fase successiva lavorerà i soli pezzi buoni.'}</p>
    <div class="modal-field"><label>Nota</label><input id="op-d-note" autocomplete="off"></div>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="opDichiaraSave('${esc(id)}','${esc(faseId)}')">Registra</button>
    </div>`, false, 'form');
}
function opDichiaraSave(id, faseId) {
  if (!opDichiara(id, faseId, { qty: rawNum('op-d-qty'), scrap: rawNum('op-d-scrap'), note: val('op-d-note') })) return;
  closeModal(); renderOdp(); showToast('Avanzamento registrato');
}
// La forzatura chiede il motivo, e il testo del blocco è **lo stesso** che il
// mutatore userebbe per rifiutare: due frasi scritte a mano divergerebbero, e
// chi forza non saprebbe più se sta scavalcando quello che l'app gli ha detto.
function opForzaModal(id, faseId) {
  const x = opFaseDi(id, faseId); if (!x) return;
  const { o, f } = x;
  if (!roleGuard('docs')) return;
  const blocco = opAvviabile(o, f);
  openModal(`${opTestaModal(o, f, 'Forza l\'avvio della fase ' + f.seq)}
    <div class="rfq-warn">${ico('warning', 'tinted', '')} ${esc(blocco.motivo || '')}. Avviando comunque, i pezzi di questa fase partono da un conto che non torna.</div>
    <p class="empty-text" style="text-align:left;padding:0 0 8px">La forzatura resta scritta nello storico dell'ordine, col motivo: non è un permesso speso e dimenticato.</p>
    <div class="modal-field"><label>Motivo (obbligatorio)</label>
      <input id="op-forza-motivo" placeholder="es. pezzi campione da consegnare prima" autocomplete="off"></div>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="opForzaSave('${esc(id)}','${esc(faseId)}')">Forza l'avvio</button>
    </div>`, false, 'form');
}
function opForzaSave(id, faseId) {
  const motivo = requireVal('op-forza-motivo', 'Per forzare l\'avvio serve il motivo');
  if (!motivo) return;
  if (!opAvvia(id, faseId, { forza: true, motivo })) return;
  closeModal(); renderOdp(); showToast('Fase avviata forzando la successione');
}
function opChiudiModal(id, faseId) {
  const x = opFaseDi(id, faseId); if (!x) return;
  const { o, f } = x;
  const mancano = opResidua(o, f);
  askConfirm(`Chiudere la fase ${f.seq} ${f.wcName}?` + (mancano > 0.000001
    ? `\n\nMancano ${fmtQty(mancano)} pezzi: non proseguiranno alla fase successiva.` : ''), () => {
    if (!opChiudiFase(id, faseId)) return;
    renderOdp(); showToast('Fase chiusa');
  }, { title: 'Chiudi la fase', ok: 'Chiudi', safe: mancano <= 0.000001 });
}
function opRiapriFaseAsk(id, faseId) {
  const x = opFaseDi(id, faseId); if (!x) return;
  askConfirm(`Riaprire la fase ${x.f.seq} ${x.f.wcName}?`, () => {
    if (!opRiapriFase(id, faseId)) { renderOdp(); return; }
    renderOdp(); showToast('Fase riaperta');
  }, { title: 'Riapri la fase', ok: 'Riapri', safe: true });
}
function opAnnullaDichiarazioneAsk(declId) {
  const d = (db.prodDecls || []).find(x => x.id === declId); if (!d) return;
  askConfirm(`Annullare questa dichiarazione di ${fmtQty(d.qty)} pezzi?\nI movimenti di magazzino che ha generato vengono tolti con lei.`, () => {
    if (!opAnnullaDichiarazione(declId)) return;
    renderOdp(); showToast('Dichiarazione annullata');
  }, { title: 'Annulla la dichiarazione', ok: 'Annulla' });
}

// ═══════════════════════════════════════════════════════════
//  UN ORDINE SCRITTO A MANO
// ═══════════════════════════════════════════════════════════
// Gli ordini di produzione nascono dal fabbisogno, ma lanciare un pezzo fuori
// piano è il caso normale: un urgente, un ricambio, una prova. Si sceglie la
// parte fra quelle che un **ciclo** ce l'hanno — le altre aprirebbero un ordine
// senza nessuna successione da seguire.
function nextOdpNumber() {
  const prefix = `ODP-${new Date().getFullYear()}-`;
  const seqs = (db.prodOrders || []).filter(o => (o.number || '').startsWith(prefix))
    .map(o => parseInt((o.number || '').slice(prefix.length), 10) || 0);
  return prefix + String((seqs.length ? Math.max(...seqs) : 0) + 1).padStart(3, '0');
}
// La fabbrica unica: dal fabbisogno e dalla mano passano di qui entrambe, così
// un ordine scritto a mano non è una seconda specie di ordine.
function odpNew(part, qty, dueDate, extra) {
  const n = Math.max(0, Number(qty) || 0);
  return stampNew(Object.assign({
    id: gid(), number: nextOdpNumber(), itemId: part.id,
    code: part.code || '', name: part.name || '', uom: itemUom(part),
    qty: n, date: nowISO().slice(0, 10), dueDate: dueDate || '',
    status: 'bozza', title: '', notes: '', notesInternal: '',
    planId: null, jobId: null,
    phases: opFreezePhases(part), materials: opFreezeMaterials(part, n),
    active: true,
  }, extra || {}));
}
function newOdpModal() {
  if (!roleGuard('docs')) return;
  catalogPickerModal(ids => odpNewFromPick(ids), {
    titolo: '+ Nuovo ordine di produzione',
    // Un ciclo senza fasi non ha una successione da seguire, e un ordine su una
    // parte così sarebbe una scheda vuota: si scopre dopo averla scelta, ed è
    // il modo peggiore.
    filtro: i => i.type === 'parte' && (i.cycle || []).some(r => r.kind === 'op'),
    vuoto: 'Nessuna parte ha un ciclo di lavorazione. Le fasi si scrivono in <em>Cicli di lavorazione</em>.',
  });
}
function odpNewFromPick(ids) {
  const part = getItem((ids || [])[0]); if (!part) return;
  closeModal();
  openModal(`<h3>${ico('factory', 'tinted pill', '')} Nuovo ordine di produzione</h3>
    <p>${esc((part.code || '') + ' ' + (part.name || ''))}</p>
    <div class="modal-grid">
      <div class="modal-field"><label>Pezzi da produrre</label>
        <input class="num" type="number" id="odp-new-qty" min="0" step="any" value="1"></div>
      <div class="modal-field"><label>Serve per</label><input type="date" id="odp-new-due"></div>
    </div>
    <p class="empty-text" style="text-align:left;padding:8px 0">Nasce in <strong>bozza</strong>: fasi e materiale si congelano al lancio, e da lì in poi non si toccano più. Un ordine scritto a mano <strong>non è legato a nessun piano</strong>, e nel fabbisogno quella parte continuerà a risultare da fabbricare.</p>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="odpNewSave('${esc(part.id)}')">Crea</button>
    </div>`, false, 'form');
}
function odpNewSave(partId) {
  const part = getItem(partId); if (!part || !roleGuard('docs')) return;
  const qty = rawNum('odp-new-qty');
  if (!(qty > 0)) { showToast('Serve una quantità maggiore di zero', 'error'); return; }
  const o = odpNew(part, qty, val('odp-new-due'));
  db.prodOrders.push(o); saveDB();
  closeModal(); currentOdpId = o.id; odpView = 'edit'; renderOdp();
  showToast(`Ordine di produzione ${o.number} creato`);
}
function openOdlFromOdp(odlId) { setView('odl'); openOdlEdit(odlId); }
function openOdpFromOdl(odpId) { setView('odp'); openOdpEdit(odpId); }

// ═══════════════════════════════════════════════════════════
//  EXPORT
// ═══════════════════════════════════════════════════════════
function odpListExportSpec() {
  const tutti = (db.prodOrders || []).slice().sort((a, b) => (b.number || '').localeCompare(a.number || ''));
  const list = odpFilterApply(tutti);
  return {
    titolo: 'Ordini di produzione', slug: 'ordini_di_produzione',
    filtri: [['Ricerca', odpFilters.q], ['Stato', ODP_STATUS[odpFilters.status] || ''],
      ['Data', dateRangeText(odpFilters.from, odpFilters.to)]],
    sezioni: [{
      nome: 'Ordine di produzione',
      colonne: [{ h: 'Numero', w: 18 }, { h: 'Codice', w: 18 }, { h: 'Parte', w: 32 },
        { h: 'Stato', w: 14 }, { h: 'Pezzi', w: 10, num: true }, { h: 'U.M.', w: 8 },
        { h: 'Serve per', w: 12, data: true }, { h: 'Fasi', w: 8, num: true },
        { h: 'Chiuse', w: 8, num: true }, { h: 'Versati', w: 10, num: true }],
      righe: list.map(o => [o.number || '', o.code || '', o.name || '',
        ODP_STATUS[o.status] || o.status || '', Number(o.qty) || 0, o.uom || '',
        o.dueDate || '', (o.phases || []).length,
        (o.phases || []).filter(f => opChiusa(o, f)).length, opVersato(o)]),
    }],
  };
}
// Il documento dell'ordine: è **il foglio che va in officina**, e per questo
// porta le fasi con i loro tempi e lo spazio per leggere l'avanzamento, non i
// prezzi — quelli riguardano l'ordine di lavoro, non chi lavora il pezzo.
function odpDocSpec(o) {
  const fasi = (o.phases || []).map(f => [String(f.seq), f.wcName,
    f.supplierId ? (f.supplierName || supplierName(f.supplierId) || '') : 'Interna',
    f.supplierId ? (f.days ? f.days + ' gg' : '') : (f.hours ? fmtQty(f.hours) + ' h/pz' : ''),
    opDaFare(o, f), opFatti(o, f), opScarti(o, f),
    ODP_FASE_LABELS[opStatoFase(o, f)] || '']);
  const mat = opMaterialeResiduo(o).map(m => [m.code, m.name, m.uom, m.qty, m.gia, m.residuo]);
  const sezioni = [{
    nome: 'Fasi',
    colonne: [{ h: 'Fase', w: 8 }, { h: 'Lavorazione', w: 28 }, { h: 'Dove', w: 22 }, { h: 'Tempo', w: 12 },
      { h: 'Da fare', w: 10, num: true }, { h: 'Fatti', w: 10, num: true },
      { h: 'Scarti', w: 10, num: true }, { h: 'Stato', w: 14 }],
    righe: fasi,
  }];
  if (mat.length) {
    sezioni.push({
      nome: 'Materiale del ciclo',
      colonne: [{ h: 'Codice', w: 18 }, { h: 'Articolo', w: 34 }, { h: 'U.M.', w: 8 },
        { h: 'Previsto', w: 12, num: true }, { h: 'Uscito', w: 12, num: true }, { h: 'Residuo', w: 12, num: true }],
      righe: mat,
    });
  }
  return {
    titolo: `Ordine di produzione ${o.number}`,
    slug: 'odp_' + String(o.number || '').replace(/[^\w-]/g, '_'),
    filtri: [['Parte', `${o.code || ''} ${o.name || ''}`.trim()],
      ['Pezzi', `${fmtQty(o.qty)} ${o.uom || ''}`],
      ['Serve per', o.dueDate ? fmtDateIt(o.dueDate) : ''],
      ['Stato', ODP_STATUS[o.status] || o.status || '']],
    sezioni,
  };
}
function exportOdpPDF(id) { const o = getOdp(id); if (o) exportListPdf(odpDocSpec(o)); }
function exportOdpExcel(id) { const o = getOdp(id); if (o) exportListXlsx(odpDocSpec(o)); }

// ═══════════════════════════════════════════════════════════
//  DALL'ORDINE DI PRODUZIONE ALL'ORDINE DI LAVORO
// ═══════════════════════════════════════════════════════════
// La riga che ne esce passa dalla **stessa fabbrica** del fabbisogno e
// dell'ODL scritto a mano — `mrpPhaseRow` per ogni fase, `planPhaseDocLine` per
// la riga — perché una riga generata da qui che si comportasse diversamente
// sarebbe una terza specie di riga da ricordarsi.
//
// L'unione delle fasi in **tratta** però non passa da `mrpPhaseRuns`: quella
// legge il ciclo **vivo**, e qui l'autorità è la tratta **congelata**. Se il
// ciclo è cambiato dopo il lancio, l'ordine di lavoro deve chiedere al terzista
// quello che l'ordine di produzione gli ha promesso.
function opRunDocRow(o, fase) {
  const part = getItem(o.itemId); if (!part) return null;
  const qty = opDaFare(o, fase);
  const fasi = opRunFasi(o, fase).map(f => mrpPhaseRow({
    item: part, row: f, opIndex: f.opIndex, phaseKey: f.phaseKey, phaseNo: f.seq,
    workCenterId: f.workCenterId || '', supplierId: f.supplierId || '',
    qty, due: o.dueDate || '',
  }));
  if (!fasi.length) return null;
  const prima = fasi[0];
  const somma = campo => fasi.reduce((s, x) => s + (Number(x[campo]) || 0), 0);
  const prezzo = somma('price');
  const giorni = somma('leadDays');
  return Object.assign({}, prima, {
    phaseKey: prima.phaseKey,
    phaseKeys: fasi.map(x => x.phaseKey),
    phaseNos: fasi.map(x => x.phaseNo),
    fasi,
    wcName: Array.from(new Set(fasi.map(x => x.wcName))).join(' + '),
    due: o.dueDate || '', leadDays: giorni, days: giorni,
    orderBy: o.dueDate ? addDays(o.dueDate, -giorni) : '',
    hours: somma('hours'), hoursUnit: somma('hoursUnit'),
    price: prezzo, amount: prezzo * qty, noPrice: !(prezzo > 0),
    qty, qtyOrder: qty,
  });
}
// La testata: stesse condizioni di un ordine generato dal piano, e la catena
// commessa → piano → ordine di produzione → ordine di lavoro che non si spezza.
function opDocHead(o, supplierId) {
  const sup = supplierId ? getSupplier(supplierId) : null;
  return {
    title: `${o.number} — ${(o.code || '')}`.trim(),
    date: nowISO().slice(0, 10), status: 'bozza', supplierId: supplierId || null,
    transport: (sup && sup.defaultTransport) || db.settings.transportDefault || '',
    payment: (sup && sup.defaultPayment) || db.settings.paymentDefault || '',
    rfqId: null, planId: o.planId || null, jobId: o.jobId || null,
    odpId: o.id, supplierConfirmation: '', notes: '', notesInternal: '', active: true,
  };
}
function opGeneraOdl(id, faseId) {
  if (!opGuard(id, 'reception')) return null;
  const x = opFaseDi(id, faseId); if (!x) return null;
  const { o, f } = x;
  if (!f.supplierId) { showToast('Questa fase è interna: non c\'è nessun terzista a cui commissionarla', 'error'); return null; }
  if (!opGenerabile(o, f)) { showToast('Questa tratta è già in un ordine di lavoro', 'error'); return null; }
  const r = opRunDocRow(o, f); if (!r) return null;
  const linea = Object.assign(planPhaseDocLine(r, true), { received: 0, odpId: o.id, odpPhaseId: f.id });
  const odl = stampNew(Object.assign({ id: gid(), number: nextOdlNumber() }, opDocHead(o, f.supplierId), { lines: [linea] }));
  db.workOrders.push(odl);
  saveDB(); invalidateProd();
  return odl;
}
function opGeneraOdlAsk(id, faseId) {
  const x = opFaseDi(id, faseId); if (!x) return;
  const { o, f } = x;
  const fasi = opRunFasi(o, f);
  const quali = fasi.length === 1 ? `la fase ${f.seq}` : `le fasi ${fasi[0].seq}-${fasi[fasi.length - 1].seq}`;
  askConfirm(`Commissionare ${quali} a ${f.supplierName || supplierName(f.supplierId) || 'questo terzista'}?\n${fmtQty(opDaFare(o, f))} pezzi di ${o.code || ''}.`, () => {
    const odl = opGeneraOdl(id, faseId); if (!odl) { renderOdp(); return; }
    renderOdp();
    showToast(`Ordine di lavoro ${odl.number} creato`, 'success');
  }, { title: 'Genera ordine di lavoro', ok: 'Genera', safe: true });
}
// Il rimando che l'ordine di lavoro disegna al posto dei suoi comandi di conto
// lavoro. Il magazzino ha **un padrone solo** per le parti coperte da un ordine
// di produzione, e offrire due strade per lo stesso gesto significa vederlo
// registrato due volte.
function opRimandoHtml(l) {
  const o = getOdp(l.odpId);
  if (!o) return '';
  const f = (o.phases || []).find(x => x.id === l.odpPhaseId);
  return `<div class="line-cl-actions">${ico('factory', 'tinted', '')}
    <span class="plandoc-link plandoc-link-sm" ${clickAttrs(`openOdpFromOdl('${o.id}')`,
    'Apri l\'ordine di produzione: il materiale e i pezzi si registrano da lì, una volta sola')}>${esc(o.number)}${f ? ' › fase ' + esc(String(f.seq)) : ''}</span>
    <span class="empty-text" style="padding:0">· i movimenti di questa lavorazione si registrano sull'ordine di produzione</span></div>`;
}
