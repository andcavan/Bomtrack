// ═══════════════════════════════════════════════════════════
//  BOMTRACK — produzione.js
// ═══════════════════════════════════════════════════════════
// Avanzamento di produzione: dichiarare quanti pezzi di una parte sono stati
// fatti, dentro un piano di fabbisogno.
// Classic script, scope globale condiviso con gli altri: nessun modulo e
// nessun build, così index.html continua ad aprirsi con un doppio click.
//
// ── Perché è una dichiarazione e non un campo ──
// La tentazione è mettere un `done` sulla riga di piano e aggiornarlo. Sarebbe
// un numero che si sovrascrive: si perde **quando** si è prodotto e chi l'ha
// detto, e due persone che dichiarano lo stesso giorno si cancellano a vicenda.
// Una dichiarazione per volta, sommata quando serve, è la stessa scelta che
// l'app fa già per il magazzino — dove la giacenza *non è un campo* ma la somma
// dei movimenti — e per la stessa ragione: un saldo ricostruibile è un saldo che
// si può spiegare, e uno storico che si può correggere senza riscrivere il
// passato.
//
// ── Che cosa sblocca ──
// Il `MANUALE.md` dichiara «nessun avanzamento di produzione» come prima
// mancanza, e `views-mrp.js` ne nomina la conseguenza esatta: sulle lavorazioni
// «il fabbisogno netto non si applica… sapere quanti pezzi sono già stati
// lavorati richiederebbe un avanzamento di produzione che l'app non ha».
// Adesso ce l'ha, e quel netto si può fare.
//
// ── Che cosa NON è ──
// Non è una schedulazione: non dice *quando* si produrrà, e il carico dei centri
// resta a capacità infinita com'era. Non muove il magazzino: dichiarare un pezzo
// fatto non lo carica a scaffale — il magazzino si muove dai suoi movimenti, e
// mescolare le due cose vorrebbe dire due verità sulla stessa giacenza.
// È una sola domanda, con una sola risposta: **di questo piano, di questa
// parte, quanti ne sono stati fatti.**

// ─── Le dichiarazioni ───
function produzioniDi(planId) {
  return (db.productions || []).filter(p => p.planId === planId);
}
// Quanti pezzi di una parte risultano fatti dentro un piano. È la somma, e la
// somma può essere corretta aggiungendo una dichiarazione negativa — come una
// rettifica di magazzino, e per la stessa ragione: cancellare una riga sbagliata
// è un'altra cosa dal dire che se ne erano contati troppi.
function prodottiDi(planId, itemId) {
  return (db.productions || [])
    .filter(p => p.planId === planId && p.itemId === itemId)
    .reduce((s, p) => s + (Number(p.qty) || 0), 0);
}
// Quanto resta da fare. Mai negativo: se se ne sono dichiarati più del previsto
// il residuo è zero, non un numero che invita a produrre all'indietro. Il
// sovrappiù resta visibile nella colonna «fatti», dove è un'informazione.
function daFare(planId, itemId, richiesti) {
  return Math.max(0, (Number(richiesti) || 0) - prodottiDi(planId, itemId));
}

// ─── Dichiarare ───
function produzioneDichiara(planId, itemId, qty, note) {
  if (!roleGuard('docs')) return null;
  const p = getPlan(planId), it = getItem(itemId);
  if (!p || !it) return null;
  const q = Number(qty) || 0;
  if (!q) { showToast('Scrivi quanti pezzi sono stati fatti', 'error'); return null; }
  return Store.insert('productions', {
    planId, itemId, qty: q,
    date: nowISO(),
    note: String(note || '').trim(),
  });
}
function produzioneElimina(id) {
  if (!roleGuard('docs')) return;
  const rec = (db.productions || []).find(p => p.id === id);
  if (!rec) return;
  askConfirm('Eliminare questa dichiarazione di produzione?', () => {
    Store.remove('productions', id);
    savedToast('Dichiarazione eliminata');
    if (window.__prodPlanId) produzioneRefresh();
    else renderMrp();
  });
}

// ─── La scheda ───
// Chiave propria, come il listino e gli allegati: si affianca al piano aperto
// invece di chiuderlo.
onPanelClose('produzione', () => { window.__prodPlanId = null; window.__prodItemId = null; });
function produzioneModal(planId, itemId, richiesti) {
  const p = getPlan(planId), it = getItem(itemId);
  if (!p || !it) return;
  window.__prodPlanId = planId;
  window.__prodItemId = itemId;
  window.__prodRichiesti = Number(richiesti) || 0;
  openModal(`<h3>${ico('factory', 'tinted pill', '')} Avanzamento — ${esc(it.code)}</h3>
    <p style="color:var(--text-dim);margin-bottom:14px">${esc(it.name)} · piano <strong>${esc(p.number)}</strong></p>
    <div id="produzione-body">${produzioneBody()}</div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Chiudi</button></div>`, true, 'produzione');
}
function produzioneRefresh() {
  const host = document.getElementById('produzione-body');
  if (host) host.innerHTML = produzioneBody();
}
function produzioneBody() {
  const planId = window.__prodPlanId, itemId = window.__prodItemId;
  const it = getItem(itemId); if (!it) return '';
  const richiesti = Number(window.__prodRichiesti) || 0;
  const fatti = prodottiDi(planId, itemId);
  const resta = daFare(planId, itemId, richiesti);
  const u = itemUom(it);
  const puoScrivere = canWrite('docs');
  const storico = (db.productions || [])
    .filter(p => p.planId === planId && p.itemId === itemId)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .map(p => `<div class="mgmt-item">
      <span class="mgmt-item-name" style="font-family:var(--mono)">${p.qty > 0 ? '+' : ''}${fmtQty(p.qty)} ${esc(u)}</span>
      <span class="mgmt-item-meta">${esc(fmtDateIt(p.date))}${p.createdBy ? ' · ' + esc(actorName(p.createdBy)) : ''}${p.note ? ' · ' + esc(p.note) : ''}
        ${puoScrivere ? `<button class="mini-btn danger" title="Elimina la dichiarazione" onclick="produzioneElimina('${p.id}')">${ico('trash', 'tinted', 'Elimina')}</button>` : ''}</span>
    </div>`).join('');
  // Il modulo propone il residuo: il gesto più frequente è «finito», e
  // riscrivere un numero che l'app conosce già è lavoro inutile.
  const modulo = puoScrivere
    ? `<div class="modal-grid" style="margin-top:12px">
        <div class="modal-field"><label>Pezzi fatti (${esc(u)})</label>
          <input type="number" id="prod-qty" step="any" value="${resta || ''}" placeholder="0"></div>
        <div class="modal-field"><label>Nota (facoltativa)</label>
          <input type="text" id="prod-note" placeholder="Es. primo lotto, collaudo ok"></div>
      </div>
      <div style="margin-top:8px"><button class="add-btn-sm" onclick="produzioneSalva()">Dichiara</button></div>
      <p class="empty-text" style="text-align:left;padding:8px 0 0">Un numero <strong>negativo</strong> corregge un conteggio sbagliato, come una rettifica di magazzino: lo storico resta, e si vede che cosa è stato corretto.</p>`
    : '';
  return `${kpi('Richiesti dal piano', fmtQty(richiesti) + ' ' + u, '')}
    ${kpi('Fatti', fmtQty(fatti) + ' ' + u, fatti >= richiesti && richiesti > 0 ? 'green' : '')}
    ${kpi('Restano', fmtQty(resta) + ' ' + u, resta > 0 ? 'orange' : 'green')}
    ${storico ? `<h4 class="settings-group-title">${ico('clock', 'tinted', '')} Dichiarazioni</h4><div class="mgmt-list">${storico}</div>` : ''}
    ${modulo}
    <p class="empty-text" style="text-align:left;padding:10px 0 0">Dichiarare pezzi fatti <strong>non muove il magazzino</strong>: la giacenza si muove dai suoi movimenti, e due strade per lo stesso numero darebbero due verità. Serve a sapere quanto resta da fare — e a non rimandare a lavorare fuori pezzi che sono già stati lavorati.</p>`;
}
function produzioneSalva() {
  const q = numVal('prod-qty', -1000000, 1000000);
  const fatto = produzioneDichiara(window.__prodPlanId, window.__prodItemId, q, val('prod-note'));
  if (!fatto) return;
  savedToast('Avanzamento registrato');
  produzioneRefresh();
}

// ─── Il riepilogo di un piano ───
// Quante parti sono finite, e quante no. Serve al titolo del piano: la domanda
// «a che punto siamo» non deve richiedere di scorrere una tabella.
function pianoAvanzamento(planId, make) {
  const righe = make || [];
  if (!righe.length) return null;
  let finite = 0, pezziRichiesti = 0, pezziFatti = 0;
  righe.forEach(e => {
    const f = prodottiDi(planId, e.item.id);
    pezziRichiesti += e.qty;
    pezziFatti += Math.min(f, e.qty);   // il sovrappiù non fa avanzare oltre il 100%
    if (f >= e.qty) finite++;
  });
  return {
    parti: righe.length, finite,
    pezziRichiesti, pezziFatti,
    quota: pezziRichiesti > 0 ? pezziFatti / pezziRichiesti : 0,
  };
}
