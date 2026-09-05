// ═══════════════════════════════════════════════════════════
//  BOMTRACK — views-rev.js
// ═══════════════════════════════════════════════════════════
// Revisioni della distinta base: rilascio, storico e confronto.
// Classic script, scope globale condiviso con gli altri: nessun modulo e
// nessun build, così index.html continua ad aprirsi con un doppio click.
//
// ── Il problema ──
// Fino alla 0.24.0 modificare una distinta riscriveva il passato. Un costo
// calcolato tre mesi fa non era più riproducibile, e un ordine emesso su una
// distinta poi cambiata non era più giustificabile: restava il documento, ma
// non ciò su cui era stato deciso. In meccanica è la mancanza che si sente di
// più, ed è l'unica che peggiora da sola — più dati si accumulano senza
// storico, più costa introdurlo.
//
// ── Il modello, e perché questo e non l'altro ──
// La strada ovvia sarebbe: una distinta rilasciata si blocca, e per modificarla
// bisogna aprire una revisione nuova. Blocca però il lavoro di tutti i giorni
// per un beneficio che si vede una volta ogni tanto, e chi lavora impara a
// evitarla.
//
// Qui il verso è opposto: **quella su cui si lavora è sempre modificabile, e
// rilasciare significa metterne da parte una copia congelata**. La revisione
// rilasciata è immutabile perché è una fotografia, non perché un lucchetto lo
// impedisce — e una fotografia nessuno la modifica per sbaglio.
// Rilasciata la A, la distinta viva diventa la B e si continua a lavorare.

// Revisione in lavorazione. Gli articoli già a catalogo non hanno il campo:
// valgono A, senza bisogno di riscrivere il database.
function itemRev(it) { return (it && it.rev) || 'A'; }
// A → B … Z → AA → AB. Le lettere bastano per anni; quando finiscono, si
// continua a contare invece di fermarsi.
function nextRev(letter) {
  const s = String(letter || 'A').toUpperCase();
  const chars = s.split('');
  let i = chars.length - 1;
  while (i >= 0) {
    if (chars[i] !== 'Z') { chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1); return chars.join(''); }
    chars[i] = 'A'; i--;
  }
  return 'A' + chars.join('');
}
// Solo ciò che ha una distinta: un commerciale non ha revisioni di distinta,
// ha un prezzo.
function hasRevisions(it) { return !!it && (isAssembly(it.type) || it.type === 'parte'); }

// Dalla più recente. Due rilasci nello stesso millisecondo hanno la stessa
// data — succede nei test e succederebbe a chi rilascia due articoli di fila:
// a parità vince l'ordine di inserimento, che è quello vero.
function revisionsOf(itemId) {
  return (db.revisions || [])
    .map((r, i) => ({ r, i }))
    .filter(x => x.r.itemId === itemId)
    .sort((a, b) => {
      const c = String(b.r.date || '').localeCompare(String(a.r.date || ''));
      return c !== 0 ? c : b.i - a.i;
    })
    .map(x => x.r);
}
function getRevision(id) { return (db.revisions || []).find(r => r.id === id); }

// La fotografia. Si copia in profondità: se restassero riferimenti agli array
// vivi, modificare la distinta domani cambierebbe la revisione di ieri — cioè
// esattamente il difetto che si sta risolvendo.
function revSnapshot(it) {
  const c = costOf(it.id);
  return {
    code: it.code, name: it.name, type: it.type, uom: it.uom || '',
    sourcing: it.sourcing || null,
    components: JSON.parse(JSON.stringify(it.components || [])),
    operations: JSON.parse(JSON.stringify(it.operations || [])),
    cycle: JSON.parse(JSON.stringify(it.cycle || [])),
    // Il costo del giorno del rilascio: senza, la revisione direbbe *cosa* c'era
    // ma non *quanto* costava, e i prezzi di allora non tornano più.
    cost: { material: c.material, purchased: c.purchased, labor: c.labor,
      parts: c.parts, overhead: c.overhead, total: c.total },
  };
}

// Rilascia la revisione in lavorazione e ne apre la successiva.
// Ritorna il record creato, o null se non c'era niente da rilasciare.
function releaseRevision(itemId, motivo) {
  // La guardia sta nel mutatore, non solo nei chiamanti: la funzione è globale
  // e chiunque la raggiunga deve passare dallo stesso controllo.
  if (!roleGuard('bom')) return null;
  const it = getItem(itemId);
  if (!it || !hasRevisions(it)) return null;
  const rev = itemRev(it);
  const rec = {
    id: gid(), itemId, rev,
    date: nowISO(),
    motivo: String(motivo || '').trim(),
    snapshot: revSnapshot(it),
  };
  // Prima si avanza l'articolo, poi si inserisce: Store.insert salva una volta
  // sola e porta con sé entrambe le modifiche. Passa da lì anche perché crea la
  // collezione se manca — su un database precedente alla 0.25.0 non c'è.
  it.rev = nextRev(rev);
  touch(it);
  Store.insert('revisions', rec);
  return rec;
}

// ─── Confronto ───
// Le righe si confrontano per articolo, sommando le quantità quando lo stesso
// componente compare più volte nella stessa distinta: è la domanda che si fa
// davvero guardando due revisioni («di questo, quanti ne servono adesso?»),
// non «la terza riga è cambiata».
function revRowsOf(snapshot) {
  const m = new Map();
  const somma = (chiave, etichetta, qty, extra) => {
    const r = m.get(chiave) || Object.assign({ chiave, etichetta, qty: 0 }, extra || {});
    r.qty += Number(qty) || 0;
    m.set(chiave, r);
  };
  // Ogni riga porta con sé la propria unità: nel confronto «2 → 3» va detto di
  // che cosa, e le lavorazioni si misurano in ore mentre i componenti no.
  (snapshot.components || []).forEach(c => {
    const ci = getItem(c.itemId);
    somma('i:' + c.itemId, ci ? ci.code + ' — ' + ci.name : '(articolo eliminato)',
      c.qty, { tipo: 'Componente', uom: itemUom(ci), scrapPct: Number(c.scrapPct) || 0 });
  });
  (snapshot.operations || []).forEach(o => {
    const w = getWorkCenter(o.workCenterId);
    somma('o:' + o.workCenterId, '🔧 ' + (w ? w.name : '(centro eliminato)'), o.hours, { tipo: 'Lavorazione', uom: 'h' });
  });
  (snapshot.cycle || []).forEach(r => {
    if (r.kind === 'op') {
      const w = getWorkCenter(r.workCenterId);
      somma('c:' + r.workCenterId + ':' + (r.note || ''), '🔧 ' + (w ? w.name : '(centro eliminato)') + (r.note ? ' · ' + r.note : ''),
        1, { tipo: 'Fase ciclo', cost: Number(r.cost) || 0 });
    } else {
      const ci = getItem(r.itemId);
      somma('c:' + r.itemId, ci ? ci.code + ' — ' + ci.name : '(articolo eliminato)', r.qty, { tipo: 'Distinta parte', uom: itemUom(ci) });
    }
  });
  return m;
}
// { aggiunte, rimosse, cambiate, invariate } — righe pronte da mostrare.
function revDiff(snapPrima, snapDopo) {
  const a = revRowsOf(snapPrima || {}), b = revRowsOf(snapDopo || {});
  const out = { aggiunte: [], rimosse: [], cambiate: [], invariate: 0 };
  b.forEach((riga, k) => {
    const vecchia = a.get(k);
    if (!vecchia) { out.aggiunte.push(riga); return; }
    if (Math.abs(vecchia.qty - riga.qty) > 1e-9 || (vecchia.scrapPct || 0) !== (riga.scrapPct || 0)) {
      out.cambiate.push(Object.assign({}, riga, { qtyPrima: vecchia.qty, scrapPrima: vecchia.scrapPct || 0 }));
    } else out.invariate++;
  });
  a.forEach((riga, k) => { if (!b.has(k)) out.rimosse.push(riga); });
  return out;
}
function revDiffVuoto(d) { return !d.aggiunte.length && !d.rimosse.length && !d.cambiate.length; }

// ─── Interfaccia ───
function revBadge(it) {
  if (!hasRevisions(it)) return '';
  const n = revisionsOf(it.id).length;
  const titolo = n ? `Revisione in lavorazione. ${n} ${n === 1 ? 'revisione rilasciata' : 'revisioni rilasciate'}` : 'Revisione in lavorazione. Nessun rilascio finora';
  return `<span class="doc-badge" title="${esc(titolo)}">Rev. ${esc(itemRev(it))}${n ? ' · ' + n + ' rilasciate' : ''}</span>`;
}
// La stessa barra serve due viste: le distinte degli assiemi e i cicli delle
// parti. Sono la stessa cosa — ciò che definisce il costo di un articolo — e
// congelare l'una senza l'altra lascerebbe metà storico.
function renderRevBar(elId, itemId) {
  const el = document.getElementById(elId); if (!el) return;
  const it = getItem(itemId);
  if (!it || !hasRevisions(it)) { el.innerHTML = ''; return; }
  el.innerHTML = `${revBadge(it)}
    <button class="btn-outline" onclick="releaseRevisionModal('${it.id}')">${ico('pin', 'tinted', '')} Nuova revisione</button>
    <button class="btn-outline" onclick="revHistoryModal('${it.id}')">${ico('clock', 'tinted', '')} Storico revisioni</button>`;
}
function renderBomRevBar() { renderRevBar('bom-rev-bar', currentBomId); }
function renderCyclesRevBar() { renderRevBar('cycles-rev-bar', currentCycleItemId); }

function releaseRevisionModal(itemId) {
  if (!roleGuard('bom')) return;
  const it = getItem(itemId || currentBomId); if (!it || !hasRevisions(it)) return;
  const rev = itemRev(it);
  const ultima = revisionsOf(it.id)[0];
  const d = ultima ? revDiff(ultima.snapshot, revSnapshot(it)) : null;
  // Se dall'ultimo rilascio non è cambiato niente, si dice invece di lasciar
  // creare una revisione identica alla precedente: uno storico pieno di
  // revisioni uguali non è uno storico.
  const avviso = d && revDiffVuoto(d)
    ? `<p style="color:var(--red)"><strong>Dalla revisione ${esc(ultima.rev)} non è cambiato niente.</strong> Rilasciarla creerebbe una copia identica.</p>` : '';
  const riepilogo = d && !revDiffVuoto(d)
    ? `<p>Rispetto alla ${esc(ultima.rev)}: ${d.aggiunte.length} aggiunte, ${d.rimosse.length} rimosse, ${d.cambiate.length} modificate.</p>` : '';
  openModal(`<h3>${ico('pin', 'tinted pill', '')} Rilascia revisione ${esc(rev)}</h3>
    <p>La distinta di <strong>${esc(it.code)} — ${esc(it.name)}</strong> viene <strong>congelata così com'è</strong>, col costo di oggi. Da qui in poi si lavora sulla <strong>${esc(nextRev(rev))}</strong>: la ${esc(rev)} resta consultabile e non cambia più.</p>
    ${riepilogo}${avviso}
    <div class="modal-field"><label>Motivo del rilascio</label>
      <input id="rev-motivo" placeholder="es. Approvata per produzione lotto 2026-08" autocomplete="off"></div>
    <p class="empty-text" style="text-align:left;padding:0 0 10px">Il motivo è quello che si legge fra un anno per capire perché la distinta è cambiata. Vale la pena scriverlo.</p>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="releaseRevisionConfirm('${it.id}')">Rilascia ${esc(rev)}</button>
    </div>`, false, 'form');
  setTimeout(() => { const e = document.getElementById('rev-motivo'); if (e) e.focus(); }, 50);
}
function releaseRevisionConfirm(itemId) {
  if (!roleGuard('bom')) return;
  const it = getItem(itemId || currentBomId); if (!it) return;
  const rec = releaseRevision(it.id, val('rev-motivo'));
  if (!rec) { showToast('Questo articolo non ha una distinta da rilasciare', 'error'); return; }
  closeModal();
  // Si ridisegna la vista da cui si è partiti, non quella dell'altro tipo.
  if (it.type === 'parte' && typeof renderCycles === 'function' && activeView === 'cycles') renderCycles();
  else renderBom();
  showToast(`Revisione ${rec.rev} rilasciata — si lavora sulla ${itemRev(getItem(it.id))}`);
}

function revHistoryModal(itemId) {
  const it = getItem(itemId || currentBomId); if (!it) return;
  const lista = revisionsOf(it.id);
  // La fotografia dell'attuale è la stessa per tutte le righe: si scatta una
  // volta, non tre deep-clone e un rollup di costo per ogni revisione in elenco.
  const attuale = lista.length ? revSnapshot(it) : null;
  const corpo = lista.length ? lista.map(r => {
    const d = revDiff(r.snapshot, attuale);
    const quante = d.aggiunte.length + d.rimosse.length + d.cambiate.length;
    return `<div class="mgmt-item" style="display:block">
      <div style="display:flex;align-items:center;gap:8px">
        <strong style="font-family:var(--mono)">Rev. ${esc(r.rev)}</strong>
        <span class="empty-text" style="padding:0">${esc(String(r.date || '').slice(0, 10))} · ${esc(r.createdBy ? actorName(r.createdBy) : '—')}</span>
        <span style="flex:1"></span>
        <span class="empty-text" style="padding:0">${fmtPer(r.snapshot.cost ? r.snapshot.cost.total : 0, itemUom(it))}</span>
        <button class="btn-ghost" onclick="revCompareModal('${r.id}')">${quante ? '⇄ Confronta (' + quante + ')' : '⇄ Confronta'}</button>
      </div>
      ${r.motivo ? `<div style="margin-top:4px">${esc(r.motivo)}</div>` : '<div class="empty-text" style="text-align:left;padding:2px 0 0">nessun motivo indicato</div>'}
    </div>`;
  }).join('') : `<div class="empty-text">Nessuna revisione rilasciata. La distinta attuale è la ${esc(itemRev(it))}.</div>`;
  openModal(`<h3>${ico('clock', 'tinted pill', '')} Revisioni — ${esc(it.code)} ${esc(it.name)}</h3>
    <p>In lavorazione: <strong>Rev. ${esc(itemRev(it))}</strong>. Le revisioni qui sotto sono congelate e non cambiano più.</p>
    <div style="display:flex;flex-direction:column;gap:8px">${corpo}</div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Chiudi</button></div>`, true, 'storico');
}

// Confronto fra una revisione rilasciata e la distinta attuale.
function revCompareModal(revId) {
  const r = getRevision(revId); if (!r) return;
  const it = getItem(r.itemId); if (!it) return;
  const d = revDiff(r.snapshot, revSnapshot(it));
  const riga = (x, segno, colore, extra) => `<div class="mgmt-item">
      <span style="color:${colore};font-weight:700;width:18px">${segno}</span>
      <span style="flex:1">${esc(x.etichetta)}</span>
      <span class="empty-text" style="padding:0">${esc(x.tipo)}</span>
      <span style="font-family:var(--mono)">${extra}</span>
    </div>`;
  const sezione = (titolo, righe) => righe.length
    ? `<h4 class="settings-group-title">${titolo} (${righe.length})</h4>${righe.join('')}` : '';
  const costoPrima = r.snapshot.cost ? r.snapshot.cost.total : 0;
  const costoOra = costOf(it.id).total;
  const delta = costoOra - costoPrima;
  const u = itemUom(it);
  openModal(`<h3>⇄ Rev. ${esc(r.rev)} → attuale (${esc(itemRev(it))})</h3>
    <p>${esc(it.code)} — ${esc(it.name)}${r.motivo ? ` · <em>${esc(r.motivo)}</em>` : ''}</p>
    <div class="cost-summary">
      ${kpi('Costo alla Rev. ' + esc(r.rev), fmtPer(costoPrima, u), '')}
      ${kpi('Costo attuale', fmtPer(costoOra, u), '')}
      ${kpi('Differenza', (delta >= 0 ? '+' : '') + fmtPer(delta, u), delta > 0 ? 'orange' : (delta < 0 ? 'green' : ''))}
    </div>
    ${revDiffVuoto(d) ? '<div class="empty-text">Nessuna differenza nella distinta. Se il costo è cambiato, è cambiato un prezzo, non la distinta.</div>' : ''}
    ${sezione('Aggiunte', d.aggiunte.map(x => riga(x, '+', 'var(--green)', fmtUom(x.qty, x.uom))))}
    ${sezione('Rimosse', d.rimosse.map(x => riga(x, '−', 'var(--red)', fmtUom(x.qty, x.uom))))}
    ${sezione('Quantità cambiate', d.cambiate.map(x => riga(x, '≠', 'var(--orange, #d90)',
      `${fmtQty(x.qtyPrima)} → ${fmtUom(x.qty, x.uom)}`)))}
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Chiudi</button></div>`, true, 'confronto');
}
