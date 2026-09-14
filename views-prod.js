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
