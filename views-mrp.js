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
// → { buy: [{ item, qty, due }], make: [{ item, qty, due }],
//     phases: [{ item, row, opIndex, phaseKey, phaseNo, workCenterId, supplierId, qty, due }],
//     cycle: bool }
//
// `phases` sono le **fasi di conto lavoro**: le righe di lavorazione di una parte
// prodotta in casa che portano un fornitore. Sono denaro che esce, esattamente
// come un commerciale da comprare, e fino alla 0.65.0 non le vedeva nessuno —
// la discesa le scartava con un commento che diceva il vero a metà («le
// lavorazioni non si comprano a magazzino»: quelle esterne si comprano eccome,
// solo non finiscono a scaffale). Le fasi **interne** restano fuori di qui: non
// si comprano, si fanno, e la domanda che pongono è la capacità.
//
// La data scende insieme alla quantità: se una macchina serve per il 30
// settembre, i suoi componenti servono per il 30 settembre. Quando lo stesso
// articolo arriva da più righe di piano con date diverse si tiene **la più
// vicina**: è la scelta conservativa — ordinare per la data più stretta copre
// anche le altre.
//
// Sul **materiale** volutamente NON si fa time-phasing: niente periodi, niente
// fabbisogni separati per settimana. Sarebbe un altro strumento, e prometterlo a
// metà è peggio che non averlo. Qui la data serve a due cose concrete: sapere
// entro quando ordinare, e scriverla sul documento al fornitore.
//
// Dalla 0.68.0 il **carico dei centri** è per settimana, e la distinzione regge
// per tre motivi che vale la pena scrivere invece di lasciare intuire.
//   1. Non tocca il netting. `netRequirement`, `stockFor`, `commitIndex` e
//      `mrpBuyRow` restano identici: il carico è un prospetto derivato in sola
//      lettura, da cui non nasce nessun documento e nessuna quantità. Se domani
//      lo si cancellasse, il resto dell'app non se ne accorgerebbe — ed è una
//      promessa con un test dedicato, non un'intenzione.
//   2. La domanda è diversa. Sul materiale il periodo servirebbe a decidere
//      *quando ordinare*, e a quello risponde già `orderBy` senza secchielli.
//      Sulla capacità il periodo **è** la domanda: la capacità è una portata
//      (ore a settimana), non uno stock, e «quante ore chiedo alla tornitura a
//      settembre» non ha risposta senza un periodo.
//   3. Non si promette nulla che non si dia: capacità **infinita**, dichiarata.
//      Il prospetto mostra il sovraccarico, non lo sposta.
function mrpExplode(lines) {
  // Gli accumulatori viaggiano in un oggetto solo: `mrpDescend` ne aveva già
  // sette di parametri posizionali, e l'ottavo sarebbe stato quello che si
  // sbaglia a passare.
  const acc = { buy: new Map(), make: new Map(), phases: new Map(), load: new Map(), cycle: false };
  (lines || []).forEach(l => mrpDescend(l.itemId, Number(l.qty) || 0, new Set(), acc, l.dueDate || ''));
  const perCodice = m => Array.from(m.values()).sort((a, b) => String(a.item.code).localeCompare(String(b.item.code)));
  // Le fasi si ordinano per parte e poi per posizione nel ciclo: l'ordine delle
  // fasi è quello in cui si eseguono, ed è ciò che il terzista legge.
  const perFase = m => Array.from(m.values()).sort((a, b) =>
    String(a.item.code).localeCompare(String(b.item.code)) || a.opIndex - b.opIndex);
  return { buy: perCodice(acc.buy), make: perCodice(acc.make), phases: perFase(acc.phases),
    load: Array.from(acc.load.values()), cycle: acc.cycle };
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
// L'identità di una fase, e il suo limite dichiarato.
// L'indice conta **fra le sole lavorazioni**, non nell'array `cycle` intero:
// aggiungere una materia prima alla distinta parte è la modifica più frequente,
// e con l'indice assoluto sposterebbe la chiave di tutte le fasi che seguono.
// Riordinare le fasi la sposta lo stesso, ed è accettato: vedi il commento su
// planDocumentedKeys per cosa succede allora, e perché è il modo giusto di
// sbagliare.
function mrpPhaseKey(itemId, opIndex, workCenterId) {
  return String(itemId) + '#' + opIndex + '#' + String(workCenterId || '');
}
function mrpAddPhase(map, it, row, opIndex, qty, due) {
  const k = mrpPhaseKey(it.id, opIndex, row.workCenterId);
  const e = map.get(k);
  if (e) { e.qty += qty; e.due = primaData(e.due, due); return; }
  map.set(k, { item: it, row, opIndex, phaseKey: k, phaseNo: cyclePhaseNumber(opIndex),
    workCenterId: row.workCenterId || '', supplierId: row.supplierId || '', qty, due: due || '' });
}
function mrpDescend(itemId, qty, ancestors, acc, due) {
  const it = getItem(itemId);
  if (!it || !(qty > 0)) return;
  // Anello: si segnala e si smette di scendere, come fa flattenBom
  if (ancestors.has(itemId)) { acc.cycle = true; return; }
  if (it.type === 'materiale' || it.type === 'acquistato') { mrpAdd(acc.buy, it, qty, due); return; }
  const next = new Set(ancestors); next.add(itemId);
  if (it.type === 'parte') {
    // Parte comprata già lavorata da terzi: è una foglia d'acquisto come un
    // commerciale. Il ciclo resta salvato, ma non si scende — quel materiale
    // e quelle lavorazioni li mette il fornitore, non noi.
    if (partSourcing(it) === 'buy') { mrpAdd(acc.buy, it, qty, due); return; }
    mrpAdd(acc.make, it, qty, due);
    // Le righe di ciclo non hanno scarto e il fattore resta la quantità secca —
    // asimmetria rispetto agli assiemi qui sotto, e **voluta**: introdurlo
    // cambierebbe anche il costo, ed è un'altra discussione.
    let opIndex = 0;
    (it.cycle || []).forEach(r => {
      if (r.kind === 'op') {
        const k = opIndex++;
        // Con un fornitore la fase si compra; senza, si fa in casa — e allora
        // non è un acquisto, è un'ora di macchina da qualche parte.
        if (r.supplierId) mrpAddPhase(acc.phases, it, r, k, qty, due);
        else mrpAddLoad(acc.load, r.workCenterId, due, Number(r.hours) || 0, qty, it, cyclePhaseNumber(k));
        return;
      }
      mrpDescend(r.itemId, qty * (Number(r.qty) || 0), next, acc, due);
    });
    return;
  }
  // assieme: le sue lavorazioni caricano i centri come le fasi interne di una
  // parte. Vanno raccolte qui e non a posteriori: `make` contiene solo parti, e
  // le quantità esplose degli assiemi non le conserva nessuno.
  (it.operations || []).forEach(o => {
    mrpAddLoad(acc.load, o.workCenterId, due, Number(o.hours) || 0, qty, it, '');
  });
  // la quantità di riga porta con sé lo scarto, come nel rollup
  (it.components || []).forEach(c => {
    const f = (Number(c.qty) || 0) * (1 + (Number(c.scrapPct) || 0) / 100);
    mrpDescend(c.itemId, qty * f, next, acc, due);
  });
}
// Un'ora di lavoro dentro il suo secchiello: centro di lavoro × settimana.
// Il dettaglio (chi ha portato quelle ore) si accumula accanto al totale, e non
// è un vezzo: vale qui la regola già scritta per gli impegni di magazzino — un
// numero che non dice da dove viene non si può contestare, e quindi neanche
// credere.
// Le voci portano anche i **pezzi** e le ore per pezzo, non solo il totale:
// «62 ore» senza sapere su quanti pezzi non si può verificare, e un numero che
// non si può verificare non si può nemmeno contestare.
function mrpAddLoad(map, workCenterId, due, oreUnit, pezzi, it, faseNo) {
  const ore = (Number(oreUnit) || 0) * (Number(pezzi) || 0);
  if (!workCenterId || !(ore > 0)) return;
  // Una riga senza data non ha settimana, e non se ne inventa una: finisce in un
  // secchiello dichiarato, come un arrivo senza data non è un ritardo.
  const wk = settimanaISO(due);
  const k = workCenterId + '|' + wk;
  let e = map.get(k);
  if (!e) { e = { workCenterId, week: wk, hours: 0, voci: [] }; map.set(k, e); }
  e.hours += ore;
  e.voci.push({ itemId: it.id, code: it.code || '', name: it.name || '', faseNo,
    hoursUnit: Number(oreUnit) || 0, qty: Number(pezzi) || 0, hours: ore });
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
// ─── Settimane ISO ───
// Il secchiello del carico dei centri. Stessa disciplina UTC di addDays, e per
// lo stesso motivo: costruire la data a mezzanotte locale la sposta di un
// giorno a est di Greenwich, e una data che scivola al lunedì precedente
// cambia settimana — cioè sposta le ore in un'altra colonna del prospetto.
//
// La regola ISO-8601 è quella del giovedì: la settimana 1 di un anno è quella
// che contiene il primo giovedì. Ne segue che i primi giorni di gennaio possono
// appartenere alla settimana 52 o 53 dell'anno prima, ed è il caso limite che
// una implementazione ingenua sbaglia in silenzio una volta l'anno.
function settimanaISO(iso) {
  if (!iso) return '';
  const d = new Date(String(iso).slice(0, 10) + 'T00:00:00Z');
  if (isNaN(d)) return '';
  // Ci si sposta al giovedì della stessa settimana: da lì l'anno è per
  // definizione quello a cui la settimana appartiene.
  const giorno = (d.getUTCDay() + 6) % 7;            // 0 = lunedì
  d.setUTCDate(d.getUTCDate() - giorno + 3);
  const anno = d.getUTCFullYear();
  const primoGiovedi = new Date(Date.UTC(anno, 0, 4));
  primoGiovedi.setUTCDate(primoGiovedi.getUTCDate() - ((primoGiovedi.getUTCDay() + 6) % 7) + 3);
  const n = 1 + Math.round((d - primoGiovedi) / 604800000);
  return anno + '-W' + String(n).padStart(2, '0');
}
// Il lunedì della settimana di una data. Serve all'intestazione di colonna:
// «2026-W37» da solo non dice a nessuno di che giorni si parla.
function inizioSettimana(iso) {
  if (!iso) return '';
  const d = new Date(String(iso).slice(0, 10) + 'T00:00:00Z');
  if (isNaN(d)) return '';
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
// oggiISO() e fmtDateIt() sono in core.js, accanto a fmtStamp.
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
// ─── Carico dei centri di lavoro ───
// Le ore che i piani chiedono a ciascun centro, settimana per settimana, contro
// la capacità dichiarata sul centro. Capacità infinita: si mostra il
// sovraccarico e non lo si risolve — vedi i tre motivi in cima al file.
//
// Il modo predefinito somma **tutti i piani aperti**, non uno solo, perché è la
// domanda vera: il centro è condiviso, e «la tornitura regge?» non ha risposta
// guardando un piano per volta. È la stessa regola di `commitIndex` per il
// materiale impegnato.
function mrpLoadEntries(plans) {
  const map = new Map();
  (plans || []).forEach(p => {
    mrpExplode(p.lines).load.forEach(e => {
      const k = e.workCenterId + '|' + e.week;
      let t = map.get(k);
      if (!t) { t = { workCenterId: e.workCenterId, week: e.week, hours: 0, voci: [] }; map.set(k, t); }
      t.hours += e.hours;
      e.voci.forEach(v => t.voci.push(Object.assign({ planId: p.id, planNumber: p.number || '' }, v)));
    });
  });
  return Array.from(map.values());
}
function mrpLoad(plan) { return mrpLoadTable(mrpLoadEntries([plan])); }
function mrpLoadAll() { return mrpLoadTable(mrpLoadEntries((db.plans || []).filter(p => p.active !== false))); }
// Dalla lista piatta alla tavola centro × settimana, pronta da disegnare.
// La colonna «senza data» sta in testa: quelle ore esistono e non hanno una
// settimana, e ometterle farebbe tornare un totale sbagliato.
function mrpLoadTable(entries) {
  const settimane = Array.from(new Set(entries.map(e => e.week))).sort();
  const conData = settimane.filter(Boolean);
  const senzaData = settimane.includes('');
  const perCentro = new Map();
  entries.forEach(e => {
    if (!perCentro.has(e.workCenterId)) perCentro.set(e.workCenterId, new Map());
    perCentro.get(e.workCenterId).set(e.week, e);
  });
  const righe = Array.from(perCentro.entries()).map(([wcId, celle]) => {
    const wc = getWorkCenter(wcId);
    const cap = wc ? (Number(wc.capacityHours) || 0) : 0;
    return {
      workCenterId: wcId, name: wc ? wc.name : '(centro mancante)', capacity: cap,
      totale: Array.from(celle.values()).reduce((s, e) => s + e.hours, 0),
      celle: new Map(Array.from(celle.entries()).map(([wk, e]) => [wk, {
        week: wk, hours: e.hours, voci: e.voci,
        // Senza capacità dichiarata non si calcola nessuna saturazione: un
        // centro a zero non è sfondato, è **non dichiarato**.
        sat: cap > 0 ? e.hours / cap : null,
        over: cap > 0 && e.hours > cap ? e.hours - cap : 0,
      }])),
    };
  }).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return { settimane: (senzaData ? [''] : []).concat(conData), righe };
}
// Le settimane in sovraccarico, con i centri nominati. È il riassunto che si
// legge per primo: la tavola dice tutto, questo dice cosa guardare.
function mrpLoadOverload(tab) {
  const out = [];
  tab.settimane.forEach(wk => {
    const centri = tab.righe.filter(r => { const c = r.celle.get(wk); return c && c.over > 0; });
    if (centri.length) out.push({ week: wk, centri: centri.map(r => ({ name: r.name, over: r.celle.get(wk).over })) });
  });
  return out;
}
// Il lunedì di una settimana ISO scritta come «2026-W37». Il 4 gennaio cade per
// definizione nella settimana 1: da lì si conta.
function lunediDiSettimana(wk) {
  const m = /^(\d{4})-W(\d{2})$/.exec(String(wk || ''));
  if (!m) return '';
  const lun1 = inizioSettimana(m[1] + '-01-04');
  return addDays(lun1, (Number(m[2]) - 1) * 7);
}
// Etichetta di colonna: «W37 · 07/09». Il codice ISO da solo non dice a nessuno
// di che giorni si parla, e una colonna che non si sa collocare non si legge.
function settimanaLabel(wk) {
  if (!wk) return 'Senza data';
  const lun = lunediDiSettimana(wk);
  return 'W' + wk.slice(6) + (lun ? ' · ' + fmtDateIt(lun).slice(0, 5) : '');
}

// ─── Vista: Carico centri ───
// Prospetto derivato, in sola lettura: da qui non nasce nessun documento e
// nessuna quantità cambia. Vale il patto scritto in cima al file.
//
// Tre letture, in quest'ordine: il **grafico** dice dove guardare, la **tavola**
// dice quanto, i **codici** dicono perché. Il grafico non è la fonte — ogni
// barra porta il suo numero e la tavola sotto resta la lettura esatta — perché
// un disegno che sostituisse i numeri li renderebbe incontestabili, ed è la
// stessa ragione per cui una cella si può aprire.
let loadSoloPiano = '';   // '' = tutti i piani aperti
let loadSoloCentro = '';  // '' = tutti i centri

// I piani che entrano nel conto, e le loro ore già raccolte. Passano da qui
// tutte e quattro le funzioni che disegnano o esportano: ricalcolarle ognuna a
// modo suo era il modo di farle divergere.
function loadPiani() {
  const piano = loadSoloPiano ? getPlan(loadSoloPiano) : null;
  return piano ? [piano] : (db.plans || []).filter(p => p.active !== false);
}
function loadEntries() { return mrpLoadEntries(loadPiani()); }

function renderLoad() {
  const host = document.getElementById('view-load'); if (!host) return;
  invalidateCaches();
  if (loadSoloPiano && !getPlan(loadSoloPiano)) loadSoloPiano = '';
  const entries = loadEntries();
  const tab = mrpLoadTable(entries);
  if (loadSoloCentro && !tab.righe.some(r => r.workCenterId === loadSoloCentro)) loadSoloCentro = '';
  const aperti = (db.plans || []).filter(p => p.active !== false);
  const senzaCap = tab.righe.filter(r => !(r.capacity > 0)).length;
  host.innerHTML = `<div class="manage-wrap">
    <div class="bom-toolbar">
      <h2 class="section-title">${ico('wrench', 'tinted pill', '')} Carico centri di lavoro</h2>
      <select id="load-plan" onchange="loadSetPlan(this.value)" title="Quali piani entrano nel conto">
        <option value="">Tutti i piani aperti (${aperti.length})</option>
        ${aperti.map(p => `<option value="${esc(p.id)}" ${p.id === loadSoloPiano ? 'selected' : ''}>${esc(p.number)}${p.title ? ' — ' + esc(p.title) : ''}</option>`).join('')}
      </select>
      <select id="load-wc" onchange="loadSetCentro(this.value)" title="Restringe i codici da produrre a un centro">
        <option value="">Tutti i centri</option>
        ${tab.righe.map(r => `<option value="${esc(r.workCenterId)}" ${r.workCenterId === loadSoloCentro ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}
      </select>
      ${listExportButtons('loadExportSpec')}
    </div>
    <p class="empty-text" style="text-align:left;padding:0 0 8px">Le ore che i piani chiedono a ciascun centro, settimana per settimana, contro la capacità dichiarata in <em>Gestione → Centri di lavoro</em>. Le ore stanno nella settimana in cui <strong>il pezzo serve pronto</strong>, non in quella in cui si lavora: è una lettura della domanda, <strong>non una programmazione</strong>, e non dice quando ciascuna fase vada avviata. La capacità è <strong>infinita</strong>: il sovraccarico si vede, non si sposta.</p>
    ${senzaCap ? `<p class="empty-text" style="text-align:left;padding:0 0 8px">${ico('warning', 'tinted', '')} ${senzaCap} ${senzaCap === 1 ? 'centro non ha' : 'centri non hanno'} una capacità dichiarata: le ore si vedono, il sovraccarico no. Si imposta in <em>Gestione → Centri di lavoro</em>.</p>` : ''}
    ${loadOverloadHtml(tab)}
    ${loadChartHtml(tab)}
    ${loadTableHtml(tab)}
    ${loadItemsHtml(entries)}</div>`;
}
function loadSetPlan(id) { loadSoloPiano = id || ''; renderLoad(); }
function loadSetCentro(id) { loadSoloCentro = id || ''; renderLoad(); }
function loadOverloadHtml(tab) {
  const ov = mrpLoadOverload(tab);
  if (!ov.length) return '';
  const voci = ov.map(o => `${esc(settimanaLabel(o.week))} — ${esc(o.centri.map(c => c.name + ' +' + fmtQty(+c.over.toFixed(1)) + ' h').join(', '))}`).join(' · ');
  return `<div class="rfq-warn">${ico('warning', 'tinted', '')} <strong>Sovraccarico</strong> in ${ov.length} ${ov.length === 1 ? 'settimana' : 'settimane'}: ${voci}</div>`;
}
// ─── Il grafico della saturazione ───
// Un blocco per centro, una barra per settimana, la capacità come linea. SVG
// scritto a mano: le tre librerie in vendor/ ci sono perché un PDF e un foglio
// Excel non si scrivono a mano, un grafico a barre sì — e una libreria in più
// sarebbe un file in più da riverificare a ogni aggiornamento.
//
// I colori sono **gli stessi della tavola**: neutro fino all'85%, arancio fino
// al 100%, rosso sopra. Un centro senza capacità dichiarata disegna le barre e
// nient'altro: non c'è niente con cui confrontarle, e colorarle a caso avrebbe
// dato un allarme che nessuno ha dichiarato.
function loadBarColor(sat) {
  if (sat == null) return 'var(--accent)';
  return sat > 1 ? 'var(--red)' : (sat >= 0.85 ? 'var(--orange)' : 'var(--accent)');
}
function loadChartHtml(tab) {
  if (!tab.righe.length) return '';
  return `<div class="load-charts">${tab.righe.map(r => loadChartOne(r, tab.settimane)).join('')}</div>`;
}
function loadChartOne(r, settimane) {
  const celle = settimane.map(wk => ({ wk, c: r.celle.get(wk) })).filter(x => x.c);
  if (!celle.length) return '';
  const cap = r.capacity;
  // Un margine sopra il massimo, o la barra più alta tocca il bordo e non si
  // vede più di quanto sfonda.
  const max = Math.max(cap > 0 ? cap : 0, ...celle.map(x => x.c.hours)) * 1.15 || 1;
  const bw = 26, gap = 16, alt = 92, top = 10, base = top + alt;
  const larghezza = celle.length * (bw + gap) + gap;
  const y = v => base - (v / max) * alt;
  const sfondate = celle.filter(x => x.c.over > 0).map(x => settimanaLabel(x.wk).split(' · ')[0]);
  const barre = celle.map((x, i) => {
    const bx = gap + i * (bw + gap);
    const by = y(x.c.hours);
    const tit = `${settimanaLabel(x.wk)}: ${fmtQty(+x.c.hours.toFixed(2))} h`
      + (x.c.sat == null ? ' — capacità non dichiarata' : ` su ${fmtQty(cap)} h (${Math.round(x.c.sat * 100)}%)`);
    return `<rect x="${bx}" y="${by.toFixed(1)}" width="${bw}" height="${(base - by).toFixed(1)}" rx="3"
        fill="${loadBarColor(x.c.sat)}"><title>${esc(tit)}</title></rect>
      <text x="${bx + bw / 2}" y="${base + 14}" text-anchor="middle" class="load-chart-lbl">${esc(settimanaLabel(x.wk).split(' · ')[0])}</text>`;
  }).join('');
  const linea = cap > 0
    ? `<line x1="0" y1="${y(cap).toFixed(1)}" x2="${larghezza}" y2="${y(cap).toFixed(1)}" stroke="var(--text-dim)" stroke-dasharray="4 3" stroke-width="1"/>
       <text x="2" y="${(y(cap) - 4).toFixed(1)}" class="load-chart-lbl">capacità ${fmtQty(cap)} h</text>`
    : '';
  const descrizione = `${r.name}, ${celle.length} ${celle.length === 1 ? 'settimana' : 'settimane'}, `
    + (cap > 0 ? (sfondate.length ? 'sovraccarico in ' + sfondate.join(', ') : 'nessun sovraccarico')
      : 'capacità non dichiarata');
  return `<figure class="load-chart">
    <figcaption>${esc(r.name)} <span class="empty-text" style="padding:0">${cap > 0 ? fmtQty(cap) + ' h/sett' : 'capacità non dichiarata'}</span></figcaption>
    <svg viewBox="0 0 ${larghezza} ${base + 20}" preserveAspectRatio="xMinYMid meet" role="img" aria-label="${esc(descrizione)}">
      <line x1="0" y1="${base}" x2="${larghezza}" y2="${base}" stroke="var(--hairline)" stroke-width="1"/>
      ${linea}${barre}
    </svg>
  </figure>`;
}
function loadTableHtml(tab) {
  if (!tab.righe.length) return '<div class="empty-text">Nessuna ora di lavorazione nei piani considerati. Le fasi in conto lavoro non caricano i centri interni: stanno nel fabbisogno, sotto «Da far lavorare fuori».</div>';
  const head = `<thead><tr><th scope="col">Centro</th><th scope="col" style="text-align:right">Capacità</th>
    ${tab.settimane.map(wk => `<th scope="col" style="text-align:right">${esc(settimanaLabel(wk))}</th>`).join('')}
    <th scope="col" style="text-align:right">Totale</th></tr></thead>`;
  const corpo = tab.righe.map(r => {
    const celle = tab.settimane.map(wk => {
      const c = r.celle.get(wk);
      if (!c) return '<td></td>';
      // Neutra fino all'85%, arancio fino al 100%, rossa sopra. Senza capacità
      // dichiarata nessun colore: non c'è niente con cui confrontare le ore.
      const col = c.sat == null ? '' : (c.sat > 1 ? 'var(--red)' : (c.sat >= 0.85 ? 'var(--orange)' : ''));
      const tit = c.sat == null ? 'Capacità non dichiarata' : `Saturazione ${Math.round(c.sat * 100)}%`;
      const apri = clickAttrs(`loadCellModal('${r.workCenterId}','${wk}')`, 'Dettaglio del carico');
      return `<td style="font-family:var(--mono);text-align:right${col ? ';color:' + col : ''}" title="${esc(tit)}">
        <span class="plandoc-link plandoc-link-sm" ${apri}>${fmtQty(+c.hours.toFixed(2))}</span>${c.sat != null ? `<div class="empty-text" style="padding:0;font-size:11px">${Math.round(c.sat * 100)}%</div>` : ''}</td>`;
    }).join('');
    const cap = r.capacity > 0 ? fmtQty(r.capacity) + ' h'
      : '<span class="empty-text" style="padding:0" title="Capacità non dichiarata: il carico si vede, il sovraccarico no">—</span>';
    return `<tr><td><span class="plandoc-link plandoc-link-sm" ${clickAttrs(`loadSetCentro('${r.workCenterId}')`, 'Mostra solo i codici di questo centro')}>${esc(r.name)}</span></td>
      <td style="font-family:var(--mono);text-align:right">${cap}</td>
      ${celle}
      <td style="font-family:var(--mono);text-align:right"><strong>${fmtQty(+r.totale.toFixed(2))}</strong></td></tr>`;
  }).join('');
  return `<div class="table-wrap"><table>${head}<tbody>${corpo}</tbody></table></div>`;
}
// ─── I codici che quelle ore le producono ───
// La tavola sopra dice quanto pesa un centro; questa dice cosa produce quel
// peso. Ordinata per settimana e poi per ore decrescenti, perché la domanda che
// ci si fa guardandola è «cosa lancio per primo».
function loadItemsHtml(entries) {
  const righe = mrpLoadItems(entries, loadSoloCentro);
  const wcNome = loadSoloCentro ? ((getWorkCenter(loadSoloCentro) || {}).name || '') : '';
  const testa = `<h3 class="rfq-subhead">Codici da produrre${loadSoloCentro ? ` — ${esc(wcNome)}
    <span class="rfq-head-actions"><button class="btn-outline" onclick="loadSetCentro('')">Tutti i centri</button></span>` : ''}</h3>`;
  if (!righe.length) return `${testa}<div class="empty-text">Nessun codice da produrre nei piani considerati.</div>`;
  const corpo = righe.map(r => `<tr>
    <td>${esc(settimanaLabel(r.week))}</td>
    <td style="font-family:var(--mono)">${codeLink(r.itemId, r.code)}</td>
    <td>${esc(r.name)}</td>
    <td style="font-family:var(--mono);text-align:right">${fmtQty(+r.qty.toFixed(3))}</td>
    <td>${r.fasi.map(f => `<span class="cycle-phase">${esc(String(f.faseNo || '—'))}</span> ${esc(f.wcName)} <span class="empty-text" style="padding:0">${fmtQty(f.hoursUnit)} h/pz · ${fmtQty(+f.hours.toFixed(2))} h</span>`).join('<br>')}</td>
    <td style="font-family:var(--mono);text-align:right"><strong>${fmtQty(+r.hours.toFixed(2))}</strong></td></tr>`).join('');
  const tot = righe.reduce((s, r) => s + r.hours, 0);
  return `${testa}
    <p class="empty-text" style="text-align:left;padding:0 0 8px">I <strong>pezzi</strong> non si sommano fra le fasi di uno stesso codice: ogni fase lavora gli stessi pezzi. Le <strong>ore</strong> sì.</p>
    <div class="table-wrap"><table>
      <thead><tr><th scope="col">Settimana</th><th scope="col">Codice</th><th scope="col">Descrizione</th>
        <th scope="col" style="text-align:right">Pezzi</th><th scope="col">Fasi interne</th>
        <th scope="col" style="text-align:right">Ore</th></tr></thead>
      <tbody>${corpo}</tbody>
      <tfoot><tr><td colspan="5">Totale ore</td>
        <td style="font-family:var(--mono);text-align:right">${fmtQty(+tot.toFixed(2))}</td></tr></tfoot>
    </table></div>`;
}
// Il dettaglio di una cella non è un vezzo: vale la stessa regola già scritta
// per gli impegni di magazzino — un numero che non dice da dove viene non si può
// contestare, e quindi neanche credere.
function loadCellModal(wcId, week) {
  const tab = mrpLoadTable(loadEntries());
  const riga = tab.righe.find(r => r.workCenterId === wcId);
  const cella = riga && riga.celle.get(week);
  if (!cella) return;
  const voci = cella.voci.slice().sort((a, b) => b.hours - a.hours);
  const capTxt = riga.capacity > 0
    ? ` su ${fmtQty(riga.capacity)} h di capacità (${Math.round(cella.sat * 100)}%)`
    : ' — capacità non dichiarata';
  openModal(`<h3>${ico('wrench', 'tinted pill', '')} ${esc(riga.name)} — ${esc(settimanaLabel(week))}</h3>
    <p><strong>${fmtQty(+cella.hours.toFixed(2))} h</strong>${capTxt}.</p>
    <div style="display:flex;flex-direction:column;gap:6px">
      ${voci.map(v => `<div class="mgmt-item">
        <span style="width:110px;font-family:var(--mono)">${codeLink(v.itemId, v.code)}</span>
        <span style="flex:1">${esc(v.name)}${v.faseNo ? ` <span class="cycle-phase">fase ${esc(String(v.faseNo))}</span>` : ''}</span>
        <span class="empty-text" style="padding:0;width:120px">${esc(v.planNumber || '')}</span>
        <span class="empty-text" style="padding:0;width:110px;text-align:right">${fmtQty(v.qty)} pz × ${fmtQty(v.hoursUnit)} h</span>
        <span style="font-family:var(--mono);width:80px;text-align:right">${fmtQty(+v.hours.toFixed(2))} h</span>
      </div>`).join('')}
    </div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Chiudi</button></div>`, true, 'carico');
}
// Export in **forma lunga**: una riga per coppia centro/settimana. Un foglio con
// trenta colonne di settimane è illeggibile; in forma lunga si pivota in Excel
// in dieci secondi, e si ordina e si filtra per data — che è la promessa già
// scritta sugli export degli elenchi.
//
// Due sezioni, come in pagina: il carico e i codici che lo producono. La seconda
// ha una riga per codice, fase e settimana, che è la forma in cui si somma per
// reparto o per articolo senza rifare i conti a mano.
function loadExportSpec() {
  const piano = loadSoloPiano ? getPlan(loadSoloPiano) : null;
  const entries = loadEntries();
  const tab = mrpLoadTable(entries);
  const righe = [];
  tab.righe.forEach(r => tab.settimane.forEach(wk => {
    const c = r.celle.get(wk);
    if (!c) return;
    righe.push([r.name, wk || '(senza data)', lunediDiSettimana(wk) || '',
      +c.hours.toFixed(2), r.capacity > 0 ? r.capacity : '',
      c.sat == null ? '' : +(c.sat * 100).toFixed(1), +c.over.toFixed(2)]);
  }));
  const codici = [];
  mrpLoadItems(entries, loadSoloCentro).forEach(r => r.fasi.forEach(f => {
    codici.push([r.week || '(senza data)', lunediDiSettimana(r.week) || '', r.code, r.name,
      f.faseNo || '', f.wcName, +f.qty.toFixed(3), +f.hoursUnit.toFixed(4), +f.hours.toFixed(2)]);
  }));
  return {
    titolo: 'Carico dei centri di lavoro',
    slug: 'carico_centri',
    filtri: [['Piani', piano ? piano.number + (piano.title ? ' — ' + piano.title : '') : 'Tutti i piani aperti'],
      ['Centro', loadSoloCentro ? ((getWorkCenter(loadSoloCentro) || {}).name || '') : 'Tutti']],
    sezioni: [{
      nome: 'Ore per centro e settimana',
      colonne: [
        { h: 'Centro', w: 26 }, { h: 'Settimana', w: 14 }, { h: 'Lunedì', w: 14, data: true },
        { h: 'Ore', w: 10, num: true }, { h: 'Capacità (h/sett)', w: 18, num: true },
        { h: 'Saturazione %', w: 16, num: true }, { h: 'Sovraccarico (h)', w: 18, num: true },
      ],
      righe,
      totali: null,
    }, {
      nome: 'Codici da produrre',
      colonne: [
        { h: 'Settimana', w: 14 }, { h: 'Lunedì', w: 14, data: true },
        { h: 'Codice', w: 18 }, { h: 'Descrizione', w: 32 },
        { h: 'Fase', w: 8, num: true }, { h: 'Centro', w: 22 },
        { h: 'Pezzi', w: 12, num: true }, { h: 'Ore/pz', w: 12, num: true }, { h: 'Ore', w: 12, num: true },
      ],
      righe: codici,
      totali: null,
    }],
  };
}

// ─── I codici che quelle ore le producono ───
// La tavola del carico risponde a «quanto pesa un centro». Questa risponde a
// «cosa produce quel peso», e sono due domande diverse: mescolarle in una
// tabella sola avrebbe prodotto qualcosa che non risponde bene a nessuna delle
// due. Stanno una sotto l'altra, e lo stesso filtro le tiene in sincrono.
//
// I **pezzi** di un codice non si sommano fra le sue fasi: ogni fase lavora gli
// stessi pezzi, e sommarle direbbe che ne servono il doppio. Si sommano invece
// fra i piani, ed è per questo che il conto passa dalle fasi — il massimo fra
// le quantità di fase è la quantità del codice.
function mrpLoadItems(entries, soloCentro) {
  const perItem = new Map();
  (entries || []).forEach(e => {
    if (soloCentro && e.workCenterId !== soloCentro) return;
    const wc = getWorkCenter(e.workCenterId);
    const wcName = wc ? wc.name : '(centro mancante)';
    e.voci.forEach(v => {
      const k = v.itemId + '|' + e.week;
      let t = perItem.get(k);
      if (!t) {
        t = { itemId: v.itemId, code: v.code, name: v.name, week: e.week, qty: 0, hours: 0, fasi: new Map() };
        perItem.set(k, t);
      }
      const fk = e.workCenterId + '|' + (v.faseNo || '');
      let f = t.fasi.get(fk);
      if (!f) { f = { workCenterId: e.workCenterId, wcName, faseNo: v.faseNo || '', hoursUnit: v.hoursUnit || 0, qty: 0, hours: 0 }; t.fasi.set(fk, f); }
      f.qty += v.qty || 0;
      f.hours += v.hours || 0;
      t.hours += v.hours || 0;
    });
  });
  return Array.from(perItem.values()).map(t => {
    const fasi = Array.from(t.fasi.values())
      .sort((a, b) => (Number(a.faseNo) || 0) - (Number(b.faseNo) || 0) || a.wcName.localeCompare(b.wcName));
    return Object.assign(t, { fasi, qty: fasi.reduce((m, f) => Math.max(m, f.qty), 0) });
  }).sort((a, b) => String(a.week).localeCompare(String(b.week)) || b.hours - a.hours);
}

// ─── Riga di fabbisogno di una fase di conto lavoro ───
// Molto più povera di una riga d'acquisto, e non per pigrizia: **una lavorazione
// non si mette a scaffale**. Non ha giacenza, non ha in arrivo, non ha impegni,
// non ha scorta minima né lotto — e quindi non ha un netto. `qtyOrder` vale
// sempre `qty`, anche a fabbisogno netto acceso: nettarla richiederebbe di
// sapere quanti pezzi sono già stati lavorati, cioè un avanzamento di produzione
// che Bomtrack non ha. Fingere di saperlo produrrebbe quantità che nessuno può
// spiegare; dirlo è meno comodo e più onesto.
//
// Il prezzo è **per pezzo**, in entrambi i modi di costo: è la forma con cui
// finisce sulla riga di documento, dove la quantità sono i pezzi.
function mrpPhaseRow(entry) {
  const r = entry.row;
  const wc = getWorkCenter(entry.workCenterId);
  const orario = r.costMode === 'orario';
  const hoursUnit = Number(r.hours) || 0;
  const rate = Number(r.rate) || 0;
  // La tariffa è quella **congelata sulla riga** quando la fase è stata scritta,
  // non wcRateFor(): quella è una proposta iniziale, e ripescarla adesso
  // cambierebbe da sé il prezzo di una fase che qualcuno aveva deciso.
  const price = orario ? hoursUnit * rate : (Number(r.cost) || 0);
  const due = entry.due || '';
  const leadDays = Math.max(0, Number(r.days) || 0);
  const orderBy = due ? addDays(due, -leadDays) : '';
  return {
    phaseKey: entry.phaseKey, item: entry.item, row: r, opIndex: entry.opIndex, phaseNo: entry.phaseNo,
    workCenterId: entry.workCenterId, wcName: wc ? wc.name : '(centro mancante)',
    supplierId: entry.supplierId,
    // Marcatore, non un tipo: la modale e gli export disegnano le due righe
    // nella stessa tabella e devono poterle distinguere senza indovinare da
    // quali campi mancano.
    isPhase: true,
    qty: entry.qty, qtyOrder: entry.qty, uom: itemUom(entry.item),
    // I **giorni di attraversamento** della fase sono il suo tempo di consegna:
    // se il pezzo serve pronto il 30 e il terzista ci mette cinque giorni,
    // l'ordine di lavoro deve uscire entro il 25. È la stessa aritmetica dei
    // giorni di consegna a listino per il materiale, e la stessa risposta quando
    // il dato manca: nessun anticipo, non un anticipo inventato.
    due, leadDays, orderBy, urgenza: urgenzaOrdine(orderBy),
    days: leadDays,
    costMode: orario ? 'orario' : 'fisso', hoursUnit, hours: hoursUnit * entry.qty, rate,
    price, amount: price * entry.qty,
    noPrice: !(price > 0),
  };
}
function mrpPhaseRows(plan) { return mrpExplode(plan.lines).phases.map(mrpPhaseRow); }
// ─── Dalle fasi alle tratte ───
// Un ordine di lavoro non si commissiona fase per fase: le fasi **consecutive**
// dello stesso terzista sono una lavorazione sola — il pezzo arriva da lui, gli
// resta sul banco e riparte una volta. Spuntarne una e non l'altra produrrebbe
// un ordine che non sta in piedi, e mandarne due farebbe fare due viaggi allo
// stesso pezzo.
//
// La tabella del fabbisogno resta **per fase**: è un'analisi, e le fasi una per
// una sono ciò che serve leggere lì. L'unione avviene qui, sulla strada del
// documento.
//
// Il prezzo di una tratta è la **somma** dei prezzi per pezzo delle sue fasi, i
// giorni sono la somma dei giorni (il pezzo resta fuori per tutta la tratta) e
// la data in cui serve è la più vicina fra quelle delle fasi.
function mrpPhaseRuns(rows) {
  const map = new Map();
  rows.forEach(r => {
    const t = clRunAt(r.item, r.opIndex);
    // Parte senza ciclo leggibile: la fase fa tratta da sé, ed è il
    // comportamento di prima delle tratte.
    const from = t ? t.from : r.opIndex;
    const k = r.item.id + '#' + from;
    if (!map.has(k)) map.set(k, { from, passata: t ? t.passata : 0, fasi: [] });
    map.get(k).fasi.push(r);
  });
  return Array.from(map.values()).map(g => {
    const fasi = g.fasi.slice().sort((a, b) => a.opIndex - b.opIndex);
    const prima = fasi[0];
    const somma = f => fasi.reduce((s, x) => s + (Number(x[f]) || 0), 0);
    const due = fasi.reduce((d, x) => primaData(d, x.due), '');
    const leadDays = somma('leadDays');
    const orderBy = due ? addDays(due, -leadDays) : '';
    const price = somma('price');
    return Object.assign({}, prima, {
      // L'identità della tratta è la **prima** fase: è quella che gli ancoraggi
      // del conto lavoro leggono per sapere dove il magazzino si muove.
      phaseKey: prima.phaseKey,
      phaseKeys: fasi.map(x => x.phaseKey),
      phaseNos: fasi.map(x => x.phaseNo),
      fasi, passata: g.passata,
      wcName: Array.from(new Set(fasi.map(x => x.wcName))).join(' + '),
      due, leadDays, orderBy, urgenza: urgenzaOrdine(orderBy), days: leadDays,
      hours: somma('hours'), hoursUnit: somma('hoursUnit'),
      price, amount: price * prima.qty, noPrice: !(price > 0),
    });
  }).sort((a, b) => String(a.item.code).localeCompare(String(b.item.code)) || a.opIndex - b.opIndex);
}
// ─── Una tratta senza passare dal fabbisogno ───
// Serve a chi scrive un ordine di lavoro a mano: dalla parte e dalla tratta si
// ricava la stessa riga che avrebbe prodotto un piano. Passa dalle stesse due
// funzioni — `mrpPhaseRow` per ogni fase, `mrpPhaseRuns` per unirle — perché una
// riga scritta a mano che si comportasse diversamente da una generata sarebbe
// una seconda specie di riga da ricordarsi.
function clRunRow(part, run, qty, due) {
  const fasi = [];
  let opIndex = 0;
  ((part && part.cycle) || []).forEach(r => {
    if (r.kind !== 'op') return;
    const k = opIndex++;
    if (k < run.from || k > run.to) return;
    fasi.push(mrpPhaseRow({
      item: part, row: r, opIndex: k, phaseKey: mrpPhaseKey(part.id, k, r.workCenterId),
      phaseNo: cyclePhaseNumber(k), workCenterId: r.workCenterId || '',
      supplierId: r.supplierId || '', qty: Number(qty) || 0, due: due || '',
    }));
  });
  return mrpPhaseRuns(fasi)[0] || null;
}
// L'etichetta di una tratta: «fase 20» quando è una, «fasi 20-30» quando sono
// più d'una. Il terzista legge i numeri di fase del nostro ciclo, ed è l'unico
// modo che ha di dire a quale lavorazione si riferisce una sua bolla.
function mrpRunFasiLabel(r) {
  const nos = r.phaseNos || [r.phaseNo];
  return nos.length === 1 ? `fase ${nos[0]}` : `fasi ${nos[0]}-${nos[nos.length - 1]}`;
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
      key: supplierId,
      supplierId, name: supplierId ? (supplierName(supplierId) || '—') : 'Da assegnare',
      rows: rs, total: rs.reduce((s, r) => s + r.amount, 0),
    }))
    .sort((a, b) => (a.supplierId ? 0 : 1) - (b.supplierId ? 0 : 1) || a.name.localeCompare(b.name));
}
// ─── Un ordine di lavoro per terzista **e passata** ───
// Le fasi 20 e 40 dallo stesso terzista, con la 30 in mezzo altrove, non stanno
// nello stesso documento: fra le due il pezzo torna da noi, e chiedergliele
// insieme significherebbe consegnargli un ordine che non può eseguire di
// seguito. La `passata` di una tratta dice quante volte quel terzista ha già
// avuto il pezzo prima, ed è esattamente il criterio che li separa.
//
// Parti **diverse** alla stessa passata restano insieme: è lo stesso terzista,
// lo stesso viaggio, la stessa bolla.
function mrpGroupOdl(rows) {
  const map = new Map();
  rows.forEach(r => {
    const k = (r.supplierId || '') + '#' + (r.passata || 0);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  });
  return Array.from(map.entries())
    .map(([key, rs]) => {
      const supplierId = key.split('#')[0];
      const passata = Number(key.split('#')[1]) || 0;
      const nome = supplierId ? (supplierName(supplierId) || '—') : 'Da assegnare';
      return {
        key, supplierId, passata,
        // Due gruppi con lo stesso nome non si distinguerebbero, e chi genera
        // non saprebbe quale sta spuntando.
        name: passata ? nome + ' — ' + ordinalePassata(passata) : nome,
        rows: rs, total: rs.reduce((s, r) => s + r.amount, 0),
      };
    })
    .sort((a, b) => (a.supplierId ? 0 : 1) - (b.supplierId ? 0 : 1)
      || a.name.localeCompare(b.name) || a.passata - b.passata);
}
function ordinalePassata(n) {
  return ['prima', 'seconda', 'terza', 'quarta', 'quinta'][n] ? ['prima', 'seconda', 'terza', 'quarta', 'quinta'][n] + ' passata' : (n + 1) + 'ª passata';
}
// I due raggruppamenti hanno la stessa forma, e chi genera i documenti non deve
// sapere quale sta usando.
function planDocGroups(rows, kind) {
  return kind === 'odl' ? mrpGroupOdl(rows) : mrpGroupBySupplier(rows);
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
  p[field] = campoTesto(value);
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
const PLAN_DOC_KINDS = { rfq: 'Richieste di offerta', order: 'Ordini a fornitore', odl: 'Ordini di lavoro' };
// Che cosa può finire in un documento **di quel tipo**. È la regola che tiene
// separati i due ordini: un ordine d'acquisto compra merce, un ordine di lavoro
// manda pezzi a lavorare, e nessuno dei due contiene le righe dell'altro. La
// richiesta d'offerta li tiene invece insieme, e non è un'incoerenza: chiedere
// a un terzista quanto costa il materiale **e** quanto costa lavorarlo è una
// domanda sola, ed è il documento che la fa.
const PLAN_DOC_FILTER = {
  rfq: () => true,
  order: r => !r.isPhase,
  odl: r => !!r.isPhase,
};

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
//
// ─── Come si riconosce una fase di conto lavoro già documentata ───
// La riga di documento di una fase ha `itemId` **nullo** — deve averlo, è la
// garanzia contro il doppio conteggio di magazzino (vedi planPhaseDocLine) — e
// quindi qui non si trova per id articolo. Porta invece una `phaseKey`,
// congelata alla generazione come già lo sono `code` e `description`: la riga di
// documento è una fotografia, e questa la rende una fotografia della fase.
//
// **Come può sbagliare**: chi riordina le fasi del ciclo dopo aver generato il
// documento cambia l'indice, la chiave non corrisponde più e la fase viene
// **riproposta**. È un falso negativo, e si vede — il documento è lì nell'elenco
// di quelli generati dal piano. L'alternativa (ricalcolare la chiave a ogni
// lettura) sbaglierebbe nell'altro verso: bloccherebbe la fase *sbagliata*, e
// quello non si vedrebbe. Fra i due modi di sbagliare, si è scelto quello
// visibile.
function planDocumentedKeys(planId) {
  const map = new Map();
  const aggiungi = (d, kind) => (d.lines || []).forEach(l => {
    // Una riga di lavorazione copre una **tratta**, cioè può valere per più
    // fasi: `phaseKeys` le elenca tutte. Indicizzando solo la prima, le altre
    // risulterebbero ancora da documentare e il fabbisogno le riproporrebbe —
    // in un ordine di lavoro che le contiene già.
    const chiavi = l.itemId ? [l.itemId] : clPhaseKeys(l);
    if (!chiavi.length) return;                  // riga manuale: non viene dal fabbisogno
    chiavi.forEach(k => {
      const l2 = map.get(k) || [];
      l2.push({ kind, number: d.number, id: d.id, qty: Number(l.qty) || 0, uom: l.uom || '' });
      map.set(k, l2);
    });
  });
  (db.rfqs || []).filter(r => r.planId === planId).forEach(d => aggiungi(d, 'rfq'));
  // Un ordine annullato non è un ordine: le sue righe tornano da comprare.
  (db.orders || []).filter(o => o.planId === planId && o.status !== 'annullato').forEach(d => aggiungi(d, 'order'));
  (db.workOrders || []).filter(o => o.planId === planId && o.status !== 'annullato').forEach(d => aggiungi(d, 'odl'));
  return map;
}
function docRefLabel(ref) { return ({ rfq: 'richiesta ', order: 'ordine ', odl: 'ordine di lavoro ' }[ref.kind] || 'documento ') + ref.number; }

// La chiave con cui una riga di fabbisogno viaggia nella modale e nel documento:
// l'id articolo per un acquisto, la `phaseKey` per una fase. Non collidono mai —
// una chiave di fase contiene `#`, che in un UUID non compare.
function planRowKey(r) { return r.phaseKey || r.item.id; }
// Righe del piano indicizzate per chiave: la modale lavora su spunte, e alla
// conferma deve poter ritrovare la riga da quella chiave. Acquisti e fasi
// stanno nella stessa mappa perché la modale ne ha una sola.
function planRowIndex(plan) {
  const map = new Map();
  const exp = mrpExplode(plan.lines);
  mrpRowsOf(exp.buy, plan.id).forEach(r => map.set(r.item.id, r));
  // Le fasi entrano come **tratte**: è la tratta che diventa una riga di
  // documento, e la chiave è quella della sua prima fase.
  mrpPhaseRuns(exp.phases.map(mrpPhaseRow)).forEach(r => map.set(r.phaseKey, r));
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
  const gruppi = planDocGroups(planDocRows(p, k).filter(r => r.qtyOrder > 0), k);
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
  if (kind === 'rfq') return 'Le richieste nascono senza prezzo: è quello che si sta chiedendo. Quando l&rsquo;offerta arriva, i prezzi si registrano a listino dalla richiesta stessa. Una richiesta può contenere insieme materiale e lavorazioni dello stesso fornitore.';
  if (kind === 'odl') return 'Gli ordini di lavoro contengono <strong>solo lavorazioni</strong>: la tariffa è quella scritta nel ciclo. Il materiale dello stesso terzista si ordina a parte, con un ordine d&rsquo;acquisto.';
  return 'Gli ordini d&rsquo;acquisto contengono <strong>solo merce</strong>, col prezzo in uso nella costificazione. Le righe senza prezzo varrebbero zero: correggile a listino prima, o dopo nell&rsquo;ordine. Le lavorazioni hanno un documento loro.';
}
// Quante righe restano da mettere in un documento di quel tipo. Sta sul
// pulsante: quanto lavoro resta si deve vedere prima di aprire la scheda, non
// dopo averla aperta e letta.
function planDocsAvailable(plan, kind) {
  const gia = planDocumentedKeys(plan.id);
  return planDocRows(plan, kind)
    .filter(r => r.qtyOrder > 0 && !(gia.get(planRowKey(r)) || []).some(x => x.kind === kind)).length;
}
// Tutto ciò che da questo piano può diventare una riga di documento: gli
// acquisti prima, le fasi di conto lavoro dopo, filtrate per il tipo di
// documento che si sta generando (vedi PLAN_DOC_FILTER).
function planDocRows(plan, kind) {
  const f = PLAN_DOC_FILTER[kind] || PLAN_DOC_FILTER.rfq;
  return mrpBuyRows(plan, mrpNet).concat(mrpPhaseRuns(mrpPhaseRows(plan))).filter(f);
}
function planDocsBody(gruppi, planId, kind) {
  const gia = planDocumentedKeys(planId);
  // Già usato *per questo tipo* = non riselezionabile. Gli altri riferimenti si
  // mostrano lo stesso: sapere che di quell'articolo esiste già una richiesta è
  // utile anche mentre si prepara un ordine.
  const usati = r => (gia.get(planRowKey(r)) || []).filter(x => x.kind === kind);
  const altri = r => (gia.get(planRowKey(r)) || []).filter(x => x.kind !== kind);
  // Quanto varrà davvero la riga sul documento. Senza listino applicabile la
  // riga nascerà vuota: qui resta la stima da costificazione, che è l'unica
  // cifra disponibile per decidere se conviene generare.
  // Una fase non ha un listino da consultare: il suo prezzo è la tariffa scritta
  // nel ciclo, e quello è già l'importo del documento.
  const importoDoc = r => (r.isPhase || r.noDocPrice ? r.amount : r.amountDoc);

  const corpo = gruppi.map(g => {
    // La spunta porta la chiave del **gruppo**, non del fornitore: per gli
    // ordini di lavoro un terzista può averne due, e la seconda passata è un
    // documento a sé.
    const key = g.key != null ? g.key : (g.supplierId || '');
    const disponibili = g.rows.filter(r => !usati(r).length);
    const righe = g.rows.map(r => {
      const bloccata = usati(r);
      const seg = [];
      if (bloccata.length) {
        seg.push(`<span class="mrp-warn" title="Già inserito in ${esc(bloccata.map(docRefLabel).join(', '))}: per cambiarne la quantità si modifica quel documento">
          ${ico('lock', 'tinted', '')} già in ${esc(bloccata.map(x => x.number).join(', '))}</span>`);
      } else if (r.isPhase) {
        // Una fase non ha magazzino: gli unici avvisi che la riguardano sono il
        // documento gemello già esistente e il prezzo a zero.
        const a = altri(r);
        if (a.length) seg.push(`<span class="price-best" title="Esiste già ${esc(a.map(docRefLabel).join(', '))}, di tipo diverso: questa riga resta selezionabile">${ico('file', 'tinted', '')} ${esc(a.map(x => x.number).join(', '))}</span>`);
        if (r.noPrice) seg.push('<span class="mrp-warn" title="La fase non ha una tariffa nel ciclo: la riga nascerà senza prezzo">' + ico('warning', 'tinted', '') + ' senza tariffa</span>');
      } else {
        const a = altri(r);
        if (a.length) seg.push(`<span class="price-best" title="Esiste già ${esc(a.map(docRefLabel).join(', '))}, di tipo diverso: questa riga resta selezionabile">${ico('file', 'tinted', '')} ${esc(a.map(x => x.number).join(', '))}</span>`);
        if (r.underMin) seg.push(`<span class="mrp-warn" title="Quantità minima del fornitore: ${fmtUom(r.minQty, r.uom)}">${ico('warning', 'tinted', '')} sotto il minimo di ${fmtUom(r.minQty, r.uom)}</span>`);
        // Due assenze diverse, e la seconda è quella che manda fuori un ordine
        // sbagliato: l'articolo un prezzo ce l'ha, ma non da questo fornitore.
        if (r.noDocPrice) seg.push(`<span class="mrp-warn" title="${esc(supplierName(r.supplierId) || 'Questo fornitore')} non ha questo articolo a listino: la riga nascerà senza prezzo, da compilare a mano. Il prezzo di un altro fornitore non si applica.">${ico('warning', 'tinted', '')} non a listino</span>`);
        else if (r.noPrice) seg.push('<span class="mrp-warn" title="Senza prezzo la riga vale zero">' + ico('warning', 'tinted', '') + ' senza prezzo</span>');
        // Il listino applicabile non è quello con cui è stato costificato: il
        // documento seguirà il listino, e il totale qui sopra viene dal costo.
        else if (r.listinoDiverso) seg.push(`<span class="mrp-warn" title="Costificato a ${fmtPer(r.price, r.uom)}, ma ${esc(supplierName(r.supplierId) || 'il fornitore')} oggi quota ${fmtPer(r.docInGestione, r.uom)}. Sul documento va il listino.">${ico('refresh', 'tinted', '')} a listino ${fmtPer(r.priceDoc, r.uom)}</span>`);
      }
      // Questo pannello è l'anteprima del documento: l'importo è quello che il
      // documento porterà, cioè il listino applicabile. Senza una quotazione di
      // quel fornitore resta la stima da costificazione — e accanto c'è il
      // badge che dice che sul documento quella cifra non ci sarà.
      // Una fase si nomina per quello che è — la lavorazione, su quale parte —
      // e porta l'icona della chiave inglese: nella lista di un fornitore che
      // vende anche materiale, distinguerle a colpo d'occhio è ciò che evita di
      // ordinare due volte la stessa cosa con due nomi diversi.
      const etichetta = r.isPhase
        ? `<span class="cycle-phase">${esc((r.phaseNos || [r.phaseNo]).join('-'))}</span> ${ico('wrench', 'tinted', '')} ${esc(r.wcName)}
           <span style="opacity:.7">su ${codeLink(r.item.id, r.item.code)} ${esc(r.item.name)}</span>`
        : `<span style="font-family:var(--mono)">${codeLink(r.item.id, r.item.code)}</span> ${esc(r.item.name)}`;
      return `<label class="plandoc-row${bloccata.length ? ' plandoc-used' : ''}">
        <input type="checkbox" class="plandoc-line" data-sup="${esc(key)}" value="${esc(planRowKey(r))}"
          ${bloccata.length ? 'disabled' : 'checked'} onchange="planDocsCount()">
        ${etichetta}
        <span class="plandoc-qty">${fmtUom(r.qtyOrder, r.uom)}${!r.isPhase && mrpNet && r.qtyOrder !== r.qty ? ` <span style="opacity:.6">(lordo ${fmtUom(r.qty, r.uom)})</span>` : ''} · ${fmtN(importoDoc(r))}</span> ${seg.join(' ')}</label>`;
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
// → Map<supplierId|'', [chiave]>, solo i gruppi con almeno una riga spuntata.
// La chiave è l'id articolo per un acquisto e la phaseKey per una fase: vedi
// planRowKey.
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
  const index = planRowIndex(p);
  // Seconda guardia, oltre alle spunte disabilitate: la selezione arriva dal
  // DOM, e ciò che decide se una riga può finire in un documento deve
  // stare accanto alla scrittura, non solo nell'interfaccia.
  const gia = planDocumentedKeys(p.id);
  const bloccato = chiave => (gia.get(chiave) || []).some(x => x.kind === kind);
  const creati = [];
  let scartate = 0;
  sel.forEach((chiavi, chiaveGruppo) => {
    // La chiave del gruppo può portare la passata (ordini di lavoro): il
    // fornitore è la prima metà, e il resto ha già fatto il suo mestiere
    // separando i documenti.
    const supplierId = String(chiaveGruppo).split('#')[0];
    const ammesse = chiavi.filter(k => { if (bloccato(k)) { scartate++; return false; } return true; });
    const righe = ammesse.map(k => index.get(k)).filter(Boolean);
    if (!righe.length) return;
    creati.push(kind === 'rfq' ? planNewRfq(p, supplierId, righe)
      : (kind === 'odl' ? planNewOdl(p, supplierId, righe) : planNewOrder(p, supplierId, righe)));
  });
  if (!creati.length) {
    showToast(scartate ? 'Quelle righe sono già in un documento di questo tipo' : 'Nessun documento generato', 'error');
    return;
  }
  saveDB(); closeModal();
  // Un documento solo: si apre. Più d'uno: si va all'elenco, non c'è una scelta
  // sensata su quale aprire per primo.
  const vista = { rfq: 'rfq', order: 'orders', odl: 'odl' }[kind];
  docLeave(kind);
  if (creati.length === 1) {
    if (kind === 'rfq') { currentRfqId = creati[0].id; rfqView = 'edit'; }
    else if (kind === 'odl') { currentOdlId = creati[0].id; odlView = 'edit'; }
    else { currentOrderId = creati[0].id; orderView = 'edit'; }
  } else if (kind === 'rfq') { rfqView = 'list'; currentRfqId = null; }
  else if (kind === 'odl') { odlView = 'list'; currentOdlId = null; }
  else { orderView = 'list'; currentOrderId = null; }
  setView(vista);
  const nome = { rfq: ['Richiesta ', ' richieste create da '],
    order: ['Ordine ', ' ordini creati da '],
    odl: ['Ordine di lavoro ', ' ordini di lavoro creati da '] }[kind];
  showToast(creati.length === 1
    ? nome[0] + creati[0].number + ' creato da ' + p.number
    : creati.length + nome[1] + p.number);
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
// Riga di documento di una **fase di conto lavoro**.
//
// `itemId` resta **rigorosamente nullo**, e non è una comodità: è la garanzia
// strutturale contro il doppio conteggio di magazzino. `stockIndex()` carica la
// giacenza dalle righe d'ordine che hanno un articolo (via `received`) e dai
// movimenti; una riga di conto lavoro non ha articolo, quindi non carica nulla
// da sé, e il rientro dei pezzi lo racconta un movimento. Mettendoci un `itemId`
// le due strade si sommerebbero e i pezzi risulterebbero il doppio.
//
// Il `code` è quello della **parte**: è il pezzo che il terzista riceve, lavora
// e rispedisce, ed è il codice con cui lo cercherà nella sua bolla.
//
// La quantità sono i **pezzi**, mai le ore. La riga di documento ha una quantità
// e una unità di misura sole: mettendoci le ore si perderebbe il numero di
// pezzi, che è ciò che si consegna, si conta e si riceve. Il dettaglio
// ore/tariffa va nella nota, che la stampa mostra sotto la descrizione.
//
// La riga copre una **tratta**: `phaseKey` ne nomina la prima fase — è
// l'identità della riga, quella che gli ancoraggi del conto lavoro leggono — e
// `phaseKeys` le elenca tutte, perché il fabbisogno non riproponga le fasi che
// stanno già dentro questa riga.
//
// Il prezzo è la somma delle tariffe per pezzo delle fasi della tratta; il
// dettaglio di ciascuna sta nella nota, dove la stampa lo mostra sotto la
// descrizione. Metterlo in righe separate avrebbe rimesso il terzista davanti a
// due lavorazioni dove ce n'è una sola da fatturare.
function planPhaseDocLine(r, conPrezzo) {
  const it = r.item;
  const fasi = r.fasi || [r];
  const dettaglio = f => (f.costMode === 'orario'
    // fmtPer porta gia' la valuta e il "per unita'": scriverle a mano qui
    // produceva "€32.00 €/h".
    ? `${fmtQty(f.hoursUnit)} h/pz × ${fmtPer(f.rate, 'h')}`
    : fmtPer(f.price, 'pz'));
  const note = fasi.length > 1
    ? fasi.map(f => `fase ${f.phaseNo} ${f.wcName}: ${dettaglio(f)}`).join(' · ')
    : (fasi[0].costMode === 'orario' ? dettaglio(fasi[0]) : '');
  return { id: gid(), itemId: null, phaseKey: r.phaseKey,
    phaseKeys: (r.phaseKeys || [r.phaseKey]).join(','),
    code: it.code || '',
    description: `${r.wcName} — ${mrpRunFasiLabel(r)} su ${it.code || ''} ${it.name || ''}`.trim(),
    uom: itemUom(it) || defaultUom(),
    qty: Number(r.qtyOrder != null ? r.qtyOrder : r.qty) || 0,
    price: conPrezzo && r.price > 0 ? r.price : '',
    deliveryDate: r.due || '',
    note };
}
// Lo smistatore: le due fabbriche di riga hanno la stessa firma, e chi genera i
// documenti non deve sapere quale delle due sta usando.
function planDocLineOf(r, conPrezzo) {
  return r.isPhase ? planPhaseDocLine(r, conPrezzo) : planDocLine(r, conPrezzo);
}
function planNewRfq(p, supplierId, righe) {
  // Una richiesta d'offerta non porta il prezzo: è la domanda, non la risposta.
  const r = stampNew(Object.assign({ id: gid(), number: nextRfqNumber() }, planDocHead(p, supplierId),
    { lines: righe.map(x => planDocLineOf(x, false)) }));
  db.rfqs.push(r);
  return r;
}
// Un ordine di lavoro: stessa testata, righe di sola lavorazione. Il tipo di
// documento decide già quali righe arrivano fin qui (PLAN_DOC_FILTER), e la
// fabbrica di riga è quella delle fasi — non lo smistatore, perché qui non c'è
// niente da smistare.
function planNewOdl(p, supplierId, righe) {
  const o = stampNew(Object.assign({ id: gid(), number: nextOdlNumber() }, planDocHead(p, supplierId),
    { rfqId: null, supplierConfirmation: '',
      lines: righe.map(x => Object.assign(planPhaseDocLine(x, true), { received: 0 })) }));
  db.workOrders.push(o);
  return o;
}
function planNewOrder(p, supplierId, righe) {
  const o = stampNew(Object.assign({ id: gid(), number: nextOrderNumber() }, planDocHead(p, supplierId),
    { rfqId: null, supplierConfirmation: '',
      lines: righe.map(x => Object.assign(planDocLineOf(x, true), { received: 0 })) }));
  db.orders.push(o);
  return o;
}
// ─── Documenti già generati da un piano ───
function planDocs(planId) {
  return {
    rfqs: (db.rfqs || []).filter(r => r.planId === planId),
    orders: (db.orders || []).filter(o => o.planId === planId),
    workOrders: (db.workOrders || []).filter(o => o.planId === planId),
  };
}
function planDocsList(planId) {
  const d = planDocs(planId);
  if (!d.rfqs.length && !d.orders.length && !d.workOrders.length) return '';
  const riga = (x, apri, icona) => `<span class="plandoc-link" ${clickAttrs(apri, 'Apri ' + x.number)}><span style="font-family:var(--mono)">${icona} ${esc(x.number)}</span> · ${esc(supplierName(x.supplierId) || 'da assegnare')}</span>`;
  return `<div class="mrp-section">
    <div class="cycle-section-head"><h3>${ico('clipboard', 'tinted pill', '')} Documenti generati</h3></div>
    <div class="plandoc-links">
      ${d.rfqs.map(r => riga(r, `openRfqFromPlan('${r.id}')`, ico('mail', 'tinted', 'Richiesta di offerta'))).join('')}
      ${d.orders.map(o => riga(o, `openOrderFromPlan('${o.id}')`, ico('receipt', 'tinted', 'Ordine a fornitore'))).join('')}
      ${d.workOrders.map(o => riga(o, `openOdlFromPlan('${o.id}')`, ico('wrench', 'tinted', 'Ordine di lavoro'))).join('')}
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
function openOdlFromPlan(id) {
  docLeave('odl'); currentOdlId = id; odlView = 'edit';
  setView('odl');
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
      ${dateRangeFilter('plan-date', val('plan-date-from'), val('plan-date-to'), 'planFilterChange()', 'piano')}
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
// Come per la ricerca: si ridisegna solo l'elenco, la barra resta com'è.
function planFilterChange() {
  renderInto('plan-list', planListRows);
  const c = document.getElementById('plan-count');
  if (c) c.textContent = planCountText();
}
function planCountText() {
  return worklistCount(planFilteredList().length, (db.plans || []).length, 'piano', 'piani');
}
// I piani che l'elenco mostra. Estratta dal disegno perché la usa l'export.
function planFilteredList() {
  const q = (val('plan-search') || '').toLowerCase();
  const da = val('plan-date-from'), al = val('plan-date-to');
  const tutti = (db.plans || []).slice().sort((a, b) => (b.number || '').localeCompare(a.number || ''));
  return tutti.filter(p => {
    if (!inDateRange(p.date, da, al)) return false;
    if (!q) return true;
    return (p.number + ' ' + (p.title || '')).toLowerCase().includes(q);
  });
}
// ─── Export dell'elenco dei piani ───
// L'elenco, non il contenuto di un piano: quello ha già i suoi export
// (`exportMrpExcel`/`exportMrpPDF`) dentro il piano aperto.
function planListExportSpec() {
  return {
    titolo: 'Fabbisogno materiali — piani',
    slug: 'piani',
    filtri: [['Ricerca', val('plan-search')], ['Data', dateRangeText(val('plan-date-from'), val('plan-date-to'))]],
    sezioni: [{
      nome: 'Piani',
      colonne: [
        { h: 'Numero', w: 18 }, { h: 'Titolo', w: 34 }, { h: 'Stato', w: 12 },
        { h: 'Data', w: 12, data: true }, { h: 'Consegna', w: 12, data: true }, { h: 'Articoli a piano', w: 14, num: true },
      ],
      righe: planFilteredList().map(p => [
        p.number || '', p.title || '', p.active === false ? 'chiuso' : 'aperto',
        p.date || '', p.dueDate || '', (p.lines || []).length,
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
  const fasi = exp.phases.map(mrpPhaseRow);
  // Dove ogni riga è già finita: si legge dai documenti del piano, una volta
  // per disegno invece che una volta per riga.
  const gia = planDocumentedKeys(id);
  buy.forEach(r => { r.docRefs = gia.get(r.item.id) || []; });
  fasi.forEach(r => { r.docRefs = gia.get(r.phaseKey) || []; });
  const totaleCl = fasi.reduce((s, r) => s + r.amount, 0);
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
      <td><input type="date" class="rfq-date-input" value="${esc(l.dueDate || '')}" title="Quando serve pronto: da qui nascono le date d'ordine di tutto ciò che ci va dentro"
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
      ${planDocButton(p, 'odl', ico('wrench', 'tinted', '') + ' Genera ordini di lavoro')}
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
        <thead><tr><th scope="col">Codice</th><th scope="col">Articolo</th><th scope="col">U.M.</th><th scope="col" style="width:120px">Q.tà</th>
          <th scope="col" style="width:150px" title="Data in cui questo deve essere pronto">Serve per</th><th scope="col"></th></tr></thead>
        <tbody>${planRows}</tbody></table></div>
    </div>

    <div class="cost-summary">
      ${kpi('Totale acquisti', fmtN(totale), 'accent')}
      ${kpi('Articoli da comprare', String(buy.length), 'orange')}
      ${kpi('Fornitori coinvolti', String(fornitori), '')}
      ${kpi('Parti da fabbricare', String(exp.make.length), 'purple')}
      ${fasi.length ? kpi('Conto lavoro', fmtN(totaleCl), 'green') : ''}
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
      <div class="cycle-section-head"><h3>${ico('wrench', 'tinted pill', '')} Da far lavorare fuori</h3></div>
      <p class="empty-text" style="text-align:left;padding:0 0 8px">Le fasi del ciclo affidate a un terzista. Entrano nelle richieste e negli ordini come le righe d'acquisto, un documento per fornitore. <strong>Il fabbisogno netto non si applica</strong>: una lavorazione non sta a scaffale, e sapere quanti pezzi sono già stati lavorati richiederebbe un avanzamento di produzione che l'app non ha.</p>
      ${mrpPhaseTable(fasi)}
    </div>

    <div class="mrp-section">
      <div class="cycle-section-head"><h3>${ico('factory', 'tinted pill', '')} Da fabbricare</h3></div>
      ${mrpMakeTable(exp.make)}
    </div>
    <div class="mrp-section">
      <div class="cycle-section-head"><h3>${ico('wrench', 'tinted pill', '')} Carico dei centri</h3></div>
      <p class="empty-text" style="text-align:left;padding:0 0 8px">Le ore che <strong>questo piano</strong> chiede ai centri interni, per settimana. Il carico vero è la somma di tutti i piani aperti: si guarda in <em>Cicli di lavorazione → Carico centri</em>, perché il centro è condiviso e un piano solo non dice se regge.</p>
      ${loadTableHtml(mrpLoad(p))}
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
    ? `<th scope="col" style="text-align:right" title="Quanto serve in tutto">Lordo</th>
       <th scope="col" style="text-align:right" title="Calcolato da ricevimenti e movimenti">Esistente</th>
       <th scope="col" style="text-align:right" title="Già promesso agli altri piani di fabbisogno aperti: esistente meno questo è quello di cui si può disporre">Impegnato</th>
       <th scope="col" style="text-align:right" title="Ordinato e non ancora ricevuto">In arrivo</th>` : '';
  const nCol = (mrpNet ? 11 : 7) + 2;   // + le due colonne di data
  const head = `<thead><tr><th scope="col">Codice</th><th scope="col">Articolo</th><th scope="col">Fornitore</th>
    <th scope="col" title="Data in cui il materiale serve">Serve per</th>
    <th scope="col" title="Data in cui serve meno i giorni di consegna del fornitore">Ordinare entro</th>
    <th scope="col">U.M.</th>
    ${colonneStock}<th scope="col" style="text-align:right">${mrpNet ? 'Da comprare' : 'Q.tà'}</th>
    <th scope="col" style="text-align:right" title="Prezzo di una unità, nella U.M. della colonna U.M.">Prezzo (${esc(cur())}/U.M.)</th>
    <th scope="col" style="text-align:right">Importo (${esc(cur())})</th></tr></thead>`;
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
// ─── Da far lavorare fuori ───
// Le fasi di conto lavoro del piano. Non hanno giacenza né netto — vedi
// mrpPhaseRow — quindi la tabella non ha le colonne che nel «da acquistare»
// raccontano la copertura: qui non ci sarebbe niente da raccontare.
function mrpPhaseTable(rows) {
  if (!rows.length) return '<div class="empty-text">Nessuna lavorazione in conto lavoro in questo piano. Le fasi del ciclo senza fornitore sono interne.</div>';
  const corpo = rows.map(r => {
    const seg = [];
    if (r.docRefs && r.docRefs.length) seg.push(`<span class="price-best" title="Già in ${esc(r.docRefs.map(docRefLabel).join(', '))}">${ico('file', 'tinted', '')} ${esc(r.docRefs.map(x => x.number).join(', '))}</span>`);
    if (r.noPrice) seg.push(`<span class="mrp-warn" title="La fase non ha una tariffa nel ciclo: in un ordine varrebbe zero">${ico('warning', 'tinted', '')} senza tariffa</span>`);
    const u = URGENZA_LABEL[r.urgenza] || null;
    return `<tr>
      <td style="font-family:var(--mono)">${r.phaseNo}</td>
      <td>${esc(r.wcName)} ${seg.join(' ')}</td>
      <td style="font-family:var(--mono)">${codeLink(r.item.id, r.item.code)}</td>
      <td>${esc(r.item.name)}</td>
      <td>${esc(supplierName(r.supplierId) || '—')}</td>
      <td>${r.due ? fmtDateIt(r.due) : '—'}</td>
      <td>${r.orderBy ? fmtDateIt(r.orderBy) : '—'}${r.leadDays ? ` <span class="empty-text" style="padding:0">−${r.leadDays} gg</span>` : ''}${u && u.txt ? ` <span class="${u.cls}" title="${esc(u.desc)}">${u.txt}</span>` : ''}</td>
      <td style="font-family:var(--mono);text-align:right">${fmtQty(r.qty)} ${esc(r.uom)}</td>
      <td style="font-family:var(--mono);text-align:right">${r.hours ? fmtQty(r.hours) : '—'}</td>
      <td style="font-family:var(--mono);text-align:right">${fmtN(r.price)}</td>
      <td style="font-family:var(--mono);text-align:right">${fmtN(r.amount)}</td></tr>`;
  }).join('');
  const tot = rows.reduce((s, r) => s + r.amount, 0);
  const totOre = rows.reduce((s, r) => s + r.hours, 0);
  return `<div class="table-wrap"><table>
    <thead><tr><th scope="col">Fase</th><th scope="col">Lavorazione</th><th scope="col">Codice</th>
      <th scope="col">Parte</th><th scope="col">Terzista</th><th scope="col">Serve per</th>
      <th scope="col" title="Data in cui serve meno i giorni di attraversamento della fase">Ordinare entro</th>
      <th scope="col" style="text-align:right">Q.tà</th>
      <th scope="col" style="text-align:right" title="Ore totali della fase: ore per pezzo x pezzi. Non entrano nel costo se la fase e a costo fisso">Ore tot.</th>
      <th scope="col" style="text-align:right">Prezzo/pz (${esc(cur())})</th>
      <th scope="col" style="text-align:right">Importo (${esc(cur())})</th></tr></thead>
    <tbody>${corpo}</tbody>
    <tfoot><tr><td colspan="8">Totale conto lavoro</td>
      <td style="font-family:var(--mono);text-align:right">${totOre ? fmtQty(totOre) : '—'}</td>
      <td></td><td style="font-family:var(--mono);text-align:right">${fmtN(tot)}</td></tr></tfoot></table></div>`;
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
    <thead><tr><th scope="col">Codice</th><th scope="col">Parte</th><th scope="col">U.M.</th>
      <th scope="col" style="text-align:right">Q.tà</th><th scope="col" style="text-align:right">Costo un. (${esc(cur())}/U.M.)</th>
      <th scope="col" style="text-align:right">Importo (${esc(cur())})</th></tr></thead>
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
  // Foglio a sé, e non righe in coda agli acquisti: le colonne sono diverse
  // (una fase ha una parte, un centro e delle ore) e mescolarle produrrebbe un
  // foglio pieno di celle vuote che nessuno può filtrare.
  const contoLavoro = [['Fase', 'Lavorazione', 'Codice parte', 'Parte', 'Terzista', 'Serve per',
    'Giorni', 'Ordinare entro', 'Quantità', 'U.M.', 'Ore totali', `Prezzo/pz (${cur()})`, `Importo (${cur()})`]];
  mrpPhaseRows(p).forEach(r => contoLavoro.push([r.phaseNo, r.wcName, r.item.code, r.item.name,
    supplierName(r.supplierId) || '', r.due || '', r.leadDays, r.orderBy || '',
    +r.qty.toFixed(3), r.uom, +r.hours.toFixed(2), +r.price.toFixed(4), +r.amount.toFixed(2)]));
  if (!requireXlsx()) return;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(acquisti), 'Acquisti');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(contoLavoro), 'Conto lavoro');
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
  const fasi = exp.phases.map(mrpPhaseRow);
  if (fasi.length) {
    const righeCl = fasi.map(r => [String(r.phaseNo), r.wcName, r.item.code,
      supplierName(r.supplierId) || '—', (fmtQty(r.qty) + ' ' + r.uom).trim(),
      r.leadDays ? r.leadDays + ' gg' : '—', r.orderBy ? fmtDateIt(r.orderBy) : '—',
      fmtN(r.price), fmtN(r.amount)]);
    righeCl.push(['', 'TOTALE', '', '', '', '', '', '', fmtN(fasi.reduce((s, r) => s + r.amount, 0))]);
    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 8,
      head: [['Fase', 'Da far lavorare fuori', 'Parte', 'Terzista', 'Q.tà', 'Attrav.', 'Ordinare entro', 'Prezzo/pz', 'Importo']],
      body: righeCl,
      styles: { fontSize: 8 }, headStyles: { fillColor: [46, 164, 121] },
    });
  }
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
