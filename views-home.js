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

// Ogni voce: { n, testo, vista, gravita, voci }. `n === 0` non si mostra — un
// elenco pieno di zeri rassicuranti nasconde le due righe che contano.
//
// `voci` è **chi** ha fatto scattare l'avviso: i codici, i numeri di documento.
// Senza, «7 articoli sotto la scorta minima» costringe ad aprire il magazzino e
// rifare a mano il filtro per sapere quali — cioè a rifare il lavoro che
// l'avviso ha già fatto. Ogni voce porta dove si risolve: la commessa alla
// commessa, la riga di fabbisogno al piano che la genera, l'articolo alla sua
// scheda. Le voci senza un posto dove andare (i codici duplicati, che si
// sbrogliano in Gestione) restano testo.
function homeSegnali() {
  const out = [];
  const agg = (voci, uno, molti, vista, gravita) => {
    if (!voci.length) return;
    out.push({ n: voci.length, testo: voci.length === 1 ? uno : molti, vista, gravita: gravita || 'info', voci });
  };
  const voce = (testo, titolo, azione) => ({ testo: testo || '(senza codice)', titolo: titolo || '', azione: azione || '' });

  // Commesse consegnate in ritardo, la più vecchia per prima.
  const commesseTardi = (db.jobs || []).filter(jobLate)
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
  agg(commesseTardi.map(j => voce(j.number,
    [j.customer, j.title].filter(Boolean).join(' · ') + ' — consegna ' + fmtDateIt(j.dueDate),
    `homeApri('job','${j.id}')`)),
  'commessa oltre la data di consegna', 'commesse oltre la data di consegna', 'jobs', 'alta');

  // Commesse già avviate a cui manca del materiale da ordinare. La conferma che
  // compare mettendo in produzione la vede una persona sola, una volta: se dopo
  // l'avvio un ordine slitta o un piano cresce, quella commessa resta scoperta e
  // nessuno lo scopre più. Questo è l'unico posto che rilegge il presente.
  //
  // Gravità alta come la consegna sforata, e per la stessa ragione: il lavoro è
  // partito e la data al cliente è già stata data. Solo 'manca' — i tardivi si
  // vedono già come «ordini confermati oltre la data richiesta», e le commesse
  // senza piani ('ignoto') non si segnalano: lavorare fuori dal fabbisogno è una
  // scelta legittima, e trasformarla in un avviso perpetuo renderebbe questo
  // elenco inutile proprio a chi lavora così.
  const scoperte = (db.jobs || []).filter(j => j.status === 'produzione')
    .map(j => ({ j, cov: jobCoverage(j.id) }))
    .filter(x => x.cov.stato === 'manca')
    .sort((a, b) => String(a.j.dueDate || '9999').localeCompare(String(b.j.dueDate || '9999')));
  agg(scoperte.map(x => voce(x.j.number,
    [x.j.customer, x.j.title].filter(Boolean).join(' · ')
      + ` — ${x.cov.daOrdinare.length} da ordinare: ${x.cov.daOrdinare.slice(0, 3).map(r => r.code).join(', ')}`
      + (x.j.dueDate ? `, consegna ${fmtDateIt(x.j.dueDate)}` : ''),
    `homeApri('job','${x.j.id}')`)),
  'commessa in produzione con materiale da ordinare', 'commesse in produzione con materiale da ordinare', 'jobs', 'alta');

  // Fabbisogno: righe da ordinare subito o già oltre. Sempre al netto di
  // giacenza e impegni — è il numero azionabile («cosa manca davvero da
  // ordinare») e non dipende dal toggle lordo/netto della vista Fabbisogno:
  // due utenti sulla stessa base dati leggono lo stesso conteggio.
  //
  // Le righe si ricavano da commitIndex(), che ha già esploso tutti i piani
  // aperti una volta (i chiusi non sono più lavoro da fare): riesploderli qui
  // con mrpBuyRows raddoppiava il costo della schermata di atterraggio.
  const ritardo = [], urgente = [];
  commitIndex().forEach((commits, itemId) => {
    const it = getItem(itemId); if (!it) return;
    commits.forEach(c => {
      const r = mrpBuyRow({ item: it, qty: c.qty, due: c.due }, true, c.planId);
      if (r.qtyOrder <= 0) return;
      if (r.urgenza !== 'ritardo' && r.urgenza !== 'urgente') return;
      // La riga è di un articolo **dentro un piano**: il codice dice cosa
      // manca, il piano dice per cosa. Il click porta al piano, che è dove si
      // genera la richiesta o l'ordine.
      const v = voce(it.code, `${it.name} — piano ${c.number}${c.due ? ', serve per ' + fmtDateIt(c.due) : ''}`
        + `${r.orderBy ? ', da ordinare entro ' + fmtDateIt(r.orderBy) : ''} · ${fmtQty(r.qtyOrder)} ${itemUom(it)}`,
      `homeApri('plan','${c.planId}')`);
      v.ordine = r.orderBy || '';
      (r.urgenza === 'ritardo' ? ritardo : urgente).push(v);
    });
  });
  const perData = (a, b) => String(a.ordine).localeCompare(String(b.ordine));
  agg(ritardo.sort(perData), 'riga di fabbisogno da ordinare, già oltre la data',
    'righe di fabbisogno da ordinare, già oltre la data', 'mrp', 'alta');
  agg(urgente.sort(perData), 'riga di fabbisogno da ordinare entro pochi giorni',
    'righe di fabbisogno da ordinare entro pochi giorni', 'mrp', 'media');

  // Ordini confermati più tardi di quanto chiesto — d'acquisto e di lavoro
  // insieme: la domanda è una sola — cosa
  // arriva tardi — e separarli in due avvisi avrebbe costretto a leggerne due
  // per farsi la stessa idea. Il tipo si vede dal numero (ODA/ODL) e il click
  // porta ciascuno nel suo elenco.
  const tardi = d => d.status !== 'annullato' && d.status !== 'evaso' && orderWorstDelay(d) != null;
  const ordTardi = [].concat((db.orders || []).filter(tardi).map(o => ({ o, tipo: 'order' })),
    (db.workOrders || []).filter(tardi).map(o => ({ o, tipo: 'odl' })))
    .sort((a, b) => orderWorstDelay(b.o) - orderWorstDelay(a.o));
  agg(ordTardi.map(({ o, tipo }) => {
    const g = orderWorstDelay(o);
    const chi = supplierName(o.supplierId) || (tipo === 'odl' ? 'senza terzista' : 'senza fornitore');
    return voce(o.number, `${chi} — confermato con ${g} ${g === 1 ? 'giorno' : 'giorni'} di ritardo`,
      `homeApri('${tipo}','${o.id}')`);
  }), 'ordine confermato oltre la data richiesta', 'ordini confermati oltre la data richiesta', 'orders', 'media');

  // Richieste partite e mai richiuse
  const rfqAperte = (db.rfqs || []).filter(r => r.status === 'inviata')
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  agg(rfqAperte.map(r => voce(r.number,
    `${supplierName(r.supplierId) || 'senza fornitore'}${r.date ? ' — inviata il ' + fmtDateIt(r.date) : ''}`,
    `homeApri('rfq','${r.id}')`)),
  'richiesta inviata in attesa di risposta', 'richieste inviate in attesa di risposta', 'rfq', 'info');

  // Articoli sotto la scorta minima. Portano al Magazzino, non all'anagrafica:
  // è la vista dove quel numero si vede e da dove si rettifica.
  const sottoScorta = (db.items || []).filter(it => hasStock(it) && safetyStockOf(it) > 0 && onHandOf(it.id) < safetyStockOf(it));
  agg(sottoScorta.map(it => voce(it.code,
    `${it.name} — esistente ${fmtQty(onHandOf(it.id))} ${itemUom(it)}, scorta minima ${fmtQty(safetyStockOf(it))}`,
    `itemInfoModal('${it.id}')`)),
  'articolo sotto la scorta minima', 'articoli sotto la scorta minima', 'stock', 'media');

  // Articoli che si comprano e non hanno un prezzo: in un ordine varrebbero zero
  const senzaPrezzo = (db.items || []).filter(it => hasPriceList(it) && costField(it) && !(Number(it[costField(it)]) > 0));
  agg(senzaPrezzo.map(it => voce(it.code, `${it.name} — ${typeLabel(it.type)}`, `itemInfoModal('${it.id}')`)),
    'articolo d\'acquisto senza prezzo', 'articoli d\'acquisto senza prezzo', 'buy', 'media');

  // Fasi a costo orario rimaste senza ore. Fino alla 0.64.2 una normalizzazione
  // cancellava le ore di ogni fase oraria a ogni caricamento; il recupero le
  // ricostruisce dividendo il costo per la tariffa del centro, ma dove il centro
  // manca o ha tariffa zero non c'è niente da cui ricostruirle. Quelle fasi
  // valgono zero, e vanno **nominate**: sono un costo sparito, e un costo sparito
  // non si scopre guardando il totale, che resta un numero plausibile.
  const senzaOre = [];
  (db.items || []).forEach(it => {
    // La fase si numera fra le sole lavorazioni, non nell'array intero: è il
    // numero che l'utente legge nella vista Cicli, e nominarne un altro
    // manderebbe a cercare la riga sbagliata.
    let k = 0;
    (it.cycle || []).forEach(r => {
      if (r.kind !== 'op') return;
      const n = cyclePhaseNumber(k++);
      if (r.costMode !== 'orario' || Number(r.hours) > 0) return;
      const wc = getWorkCenter(r.workCenterId);
      senzaOre.push(voce(it.code, `${it.name} — fase ${n} su ${wc ? wc.name : '(centro mancante)'}: ore a zero, la lavorazione non costa nulla`,
        `homeApri('cycle','${it.id}')`));
    });
  });
  agg(senzaOre, 'fase a costo orario senza ore', 'fasi a costo orario senza ore', 'cycles', 'media');

  // Codici duplicati: il controllo dati della Gestione, portato in evidenza.
  // Qui la voce è il codice ripetuto, non un articolo: aprirne uno dei due non
  // direbbe quale dei due è quello sbagliato. Si sbroglia in Gestione.
  const dup = duplicateCodeGroups();
  agg(dup.map(g => voce(g.code, `${g.items.length} articoli con questo codice: ${g.items.map(i => i.name || '(senza nome)').join(', ')}`, '')),
    'codice articolo duplicato', 'codici articolo duplicati', isAdmin() ? 'manage' : 'buy', 'media');

  return out;
}
// Aprire ciò che l'avviso nomina. Stessa strada della ricerca globale: prima la
// vista, poi il documento — l'ordine inverso disegnerebbe la vista giusta e poi
// la rimpiazzerebbe con quella di partenza.
function homeApri(tipo, id) {
  if (tipo === 'job') { setView('jobs'); openJobEdit(id); }
  else if (tipo === 'plan') { setView('mrp'); openPlanEdit(id); }
  else if (tipo === 'rfq') { setView('rfq'); openRfqEdit(id); }
  else if (tipo === 'order') { setView('orders'); openOrderEdit(id); }
  else if (tipo === 'odl') { setView('odl'); openOdlEdit(id); }
  else if (tipo === 'cycle') { setView('cycles'); openCycleFor(id); }
}
// Quante voci si scrivono per esteso. Oltre, l'elenco smetterebbe di essere un
// dettaglio e diventerebbe la vista che si apre cliccando la riga.
const HOME_VOCI_MAX = 8;
function homeVociHtml(s) {
  const mostrate = s.voci.slice(0, HOME_VOCI_MAX);
  const resto = s.voci.length - mostrate.length;
  const chip = v => v.azione
    ? `<button class="home-chip" onclick="${v.azione}" title="${esc(v.titolo)}">${esc(v.testo)}</button>`
    : `<span class="home-chip muta" title="${esc(v.titolo)}">${esc(v.testo)}</span>`;
  return `<div class="home-voci">${mostrate.map(chip).join('')}${resto > 0
    ? `<span class="home-voci-resto">+${resto} ${resto === 1 ? 'altro' : 'altri'} in ${esc(viewLabel(s.vista))}</span>` : ''}</div>`;
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
  // La riga di intestazione resta cliccabile e porta alla vista; le voci stanno
  // **fuori** da quel bersaglio, ognuna con il proprio, perché un pulsante
  // dentro un pulsante non si sa più cosa apre — né col mouse né da tastiera.
  const righe = segnali.map(s => `<div class="home-sig">
      <div class="mgmt-item" ${clickAttrs(`setView('${s.vista}')`, `${s.n} ${s.testo} — vai a ${viewLabel(s.vista)}`)} style="cursor:pointer">
        <span style="font-family:var(--mono);font-weight:700;width:60px;text-align:right;color:${GRAVITA[s.gravita]}">${s.n}</span>
        <span style="flex:1">${esc(s.testo)}</span>
        <span class="empty-text" style="padding:0">${esc(viewLabel(s.vista))} →</span>
      </div>
      ${homeVociHtml(s)}
    </div>`).join('');

  const kpiRiga = [
    kpi('Articoli', String((db.items || []).length), ''),
    kpi('Distinte', String((db.items || []).filter(i => isAssembly(i.type)).length), 'purple'),
    kpi('Commesse aperte', String((db.jobs || []).filter(j => j.status === 'aperta' || j.status === 'produzione').length), 'accent'),
    kpi('Ordini da evadere', String((db.orders || []).filter(o => o.status === 'inviato' || o.status === 'confermato' || o.status === 'parziale').length), 'orange'),
  ].join('');

  host.innerHTML = `<div class="manage-wrap">
    <div class="bom-toolbar">
      <h2 class="section-title">${ico('home', 'tinted pill', '')} Riepilogo${nome ? ' — ciao ' + esc(nome) : ''}</h2>
    </div>
    <div class="cost-summary">${kpiRiga}</div>

    <div class="mrp-section">
      <div class="cycle-section-head"><h3>${ico('warning', 'tinted pill', '')} Richiede attenzione</h3></div>
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
      <div class="cycle-section-head"><h3>${ico('refresh', 'tinted pill', '')} Riprendi</h3></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn-outline" onclick="setView('bom')">${ico('tree', 'tinted', '')} Distinta base</button>
        <button class="btn-outline" onclick="setView('stock')">${ico('package', 'tinted', '')} Magazzino</button>
        <button class="btn-outline" onclick="setView('mrp')">${ico('list', 'tinted', '')} Fabbisogno</button>
        <button class="btn-outline" onclick="setView('orders')">${ico('receipt', 'tinted', '')} Ordini</button>
        <button class="btn-outline" onclick="globalSearchModal()">${ico('search', 'tinted', '')} Cerca ovunque (Ctrl+K)</button>
      </div>
    </div></div>`;
}
