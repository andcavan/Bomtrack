// ═══════════════════════════════════════════════════════════
//  BOMTRACK — views-home.js
// ═══════════════════════════════════════════════════════════
// Riepilogo: cosa richiede attenzione, adesso.
// Classic script, scope globale condiviso con gli altri: nessun modulo e
// nessun build, così index.html continua ad aprirsi con un doppio click.
//
// ── Perché ──
// Si atterrava sulla distinta base, cioè su uno strumento: l'app diceva «ecco
// gli attrezzi», non «ecco cosa c'è da fare». Eppure i segnali li aveva già
// tutti — ordini confermati in ritardo, materiale da ordinare entro pochi
// giorni, articoli senza prezzo, quotazioni migliori a listino — sparsi in
// cinque viste diverse, ognuno visibile solo a chi andava a cercarlo.
//
// Qui non si calcola niente di nuovo: si mette in fila quello che le altre
// viste già sanno, e ogni riga porta dove si risolve. Un riepilogo che chiede
// di essere letto e basta non serve a nessuno.

// Ogni voce: { n, testo, vista, gravita }. `n === 0` non si mostra — un elenco
// pieno di zeri rassicuranti nasconde le due righe che contano.
function homeSegnali() {
  const out = [];
  const agg = (n, testo, vista, gravita) => { if (n > 0) out.push({ n, testo, vista, gravita: gravita || 'info' }); };

  // Commesse consegnate in ritardo
  const commesseTardi = (db.jobs || []).filter(jobLate);
  agg(commesseTardi.length, commesseTardi.length === 1 ? 'commessa oltre la data di consegna' : 'commesse oltre la data di consegna', 'jobs', 'alta');

  // Fabbisogno: righe da ordinare subito o già oltre
  let ritardo = 0, urgente = 0;
  (db.plans || []).forEach(p => {
    // Un piano chiuso non è più lavoro da fare: le sue righe in ritardo sono
    // storia, e tenerle nei segnali riempirebbe la home di allarmi che nessuno
    // può più spegnere.
    if (p.active === false || !(p.lines || []).length) return;
    // Sempre al netto di giacenza e impegni: è il numero azionabile («cosa manca
    // davvero da ordinare»), e non deve dipendere dal toggle lordo/netto lasciato
    // acceso nella vista Fabbisogno — due utenti sulla stessa base dati devono
    // leggere lo stesso conteggio.
    mrpBuyRows(p, true).forEach(r => {
      if (r.qtyOrder <= 0) return;
      if (r.urgenza === 'ritardo') ritardo++;
      else if (r.urgenza === 'urgente') urgente++;
    });
  });
  agg(ritardo, ritardo === 1 ? 'riga di fabbisogno da ordinare, già oltre la data' : 'righe di fabbisogno da ordinare, già oltre la data', 'mrp', 'alta');
  agg(urgente, urgente === 1 ? 'riga di fabbisogno da ordinare entro pochi giorni' : 'righe di fabbisogno da ordinare entro pochi giorni', 'mrp', 'media');

  // Ordini che il fornitore ha confermato più tardi di quanto chiesto
  const ordTardi = (db.orders || []).filter(o => o.status !== 'annullato' && o.status !== 'evaso' && orderWorstDelay(o) != null);
  agg(ordTardi.length, ordTardi.length === 1 ? 'ordine confermato oltre la data richiesta' : 'ordini confermati oltre la data richiesta', 'orders', 'media');

  // Richieste partite e mai richiuse
  const rfqAperte = (db.rfqs || []).filter(r => r.status === 'inviata');
  agg(rfqAperte.length, rfqAperte.length === 1 ? 'richiesta inviata in attesa di risposta' : 'richieste inviate in attesa di risposta', 'rfq', 'info');

  // Articoli sotto la scorta minima
  const sottoScorta = (db.items || []).filter(it => hasStock(it) && safetyStockOf(it) > 0 && onHandOf(it.id) < safetyStockOf(it));
  agg(sottoScorta.length, sottoScorta.length === 1 ? 'articolo sotto la scorta minima' : 'articoli sotto la scorta minima', 'buy', 'media');

  // Articoli che si comprano e non hanno un prezzo: in un ordine varrebbero zero
  const senzaPrezzo = (db.items || []).filter(it => hasPriceList(it) && costField(it) && !(Number(it[costField(it)]) > 0));
  agg(senzaPrezzo.length, senzaPrezzo.length === 1 ? 'articolo d\'acquisto senza prezzo' : 'articoli d\'acquisto senza prezzo', 'buy', 'media');

  // Codici duplicati: il controllo dati della Gestione, portato in evidenza
  const dup = duplicateCodeGroups().length;
  agg(dup, dup === 1 ? 'codice articolo duplicato' : 'codici articolo duplicati', isAdmin() ? 'manage' : 'buy', 'media');

  return out;
}
// Quanto si risparmierebbe scegliendo ovunque la quotazione più bassa già a
// listino. Non si applica niente da solo — è un'informazione, come nel
// fabbisogno.
function homeRisparmio() {
  let tot = 0, quanti = 0;
  (db.items || []).forEach(it => {
    if (!hasPriceList(it)) return;
    const campo = costField(it); if (!campo) return;
    const inUso = Number(it[campo]) || 0;
    const best = bestPriceRow(it);
    const migliore = best ? (rowUnitCost(it, best) || 0) : 0;
    if (inUso > 0 && migliore > 0 && migliore < inUso) { tot += inUso - migliore; quanti++; }
  });
  return { tot, quanti };
}

function renderHome() {
  const host = document.getElementById('view-home'); if (!host) return;
  invalidateCaches();
  const segnali = homeSegnali();
  const ris = homeRisparmio();
  const nome = (currentUser && currentUser.name || '').split(' ')[0];

  const GRAVITA = { alta: 'var(--red)', media: 'var(--orange, #d90)', info: 'var(--text-dim)' };
  const righe = segnali.map(s => `<div class="mgmt-item" onclick="setView('${s.vista}')" style="cursor:pointer">
      <span style="font-family:var(--mono);font-weight:700;width:60px;text-align:right;color:${GRAVITA[s.gravita]}">${s.n}</span>
      <span style="flex:1">${esc(s.testo)}</span>
      <span class="empty-text" style="padding:0">${esc(viewLabel(s.vista))} →</span>
    </div>`).join('');

  const kpiRiga = [
    kpi('Articoli', String((db.items || []).length), ''),
    kpi('Distinte', String((db.items || []).filter(i => isAssembly(i.type)).length), 'purple'),
    kpi('Commesse aperte', String((db.jobs || []).filter(j => j.status === 'aperta' || j.status === 'produzione').length), 'accent'),
    kpi('Ordini da evadere', String((db.orders || []).filter(o => o.status === 'inviato' || o.status === 'confermato' || o.status === 'parziale').length), 'orange'),
  ].join('');

  host.innerHTML = `<div class="manage-wrap">
    <div class="bom-toolbar">
      <h2 class="section-title">🏠 Riepilogo${nome ? ' — ciao ' + esc(nome) : ''}</h2>
    </div>
    <div class="cost-summary">${kpiRiga}</div>

    <div class="mrp-section">
      <div class="cycle-section-head"><h3>⚠ Richiede attenzione</h3></div>
      ${righe ? `<div style="display:flex;flex-direction:column;gap:6px">${righe}</div>`
        : '<div class="empty-text">Niente in sospeso: nessuna data scaduta, nessun articolo senza prezzo, nessun codice duplicato.</div>'}
    </div>

    ${ris.tot > 0 ? `<div class="cloud-section" style="margin-top:16px">
      <div style="flex:1">
        <strong>↓ Risparmio possibile</strong>
        <p>Su <strong>${ris.quanti}</strong> ${ris.quanti === 1 ? 'articolo' : 'articoli'} il listino contiene una quotazione più bassa di quella in uso: <strong>${fmtN(ris.tot)}</strong> per unità, sommati. Non si applica niente da solo — il prezzo in uso si cambia dal listino dell'articolo, una scelta per volta.</p>
        <div style="margin-top:8px"><button class="btn-outline" onclick="setView('buy')">Vai alle anagrafiche</button></div>
      </div></div>` : ''}

    <div class="mrp-section">
      <div class="cycle-section-head"><h3>↪ Riprendi</h3></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn-outline" onclick="setView('bom')">🌳 Distinta base</button>
        <button class="btn-outline" onclick="setView('mrp')">📋 Fabbisogno</button>
        <button class="btn-outline" onclick="setView('orders')">🧾 Ordini</button>
        <button class="btn-outline" onclick="globalSearchModal()">🔎 Cerca ovunque (Ctrl+K)</button>
      </div>
    </div></div>`;
}
