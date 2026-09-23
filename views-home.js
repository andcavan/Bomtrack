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

  // Fabbisogno: righe da ordinare subito o già oltre. Sempre al netto di
  // giacenza e impegni — è il numero azionabile («cosa manca davvero da
  // ordinare») e non dipende dal toggle lordo/netto della vista Fabbisogno:
  // due utenti sulla stessa base dati leggono lo stesso conteggio.
  //
  // Le righe si ricavano da commitIndex(), che ha già esploso tutti i piani
  // aperti una volta (i chiusi non sono più lavoro da fare): riesploderli qui
  // con mrpBuyRows raddoppiava il costo della schermata di atterraggio.
  let ritardo = 0, urgente = 0;
  commitIndex().forEach((commits, itemId) => {
    const it = getItem(itemId); if (!it) return;
    commits.forEach(c => {
      const r = mrpBuyRow({ item: it, qty: c.qty, due: c.due }, true, c.planId);
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

  // Articoli sotto la scorta minima. Portano al Magazzino, non all'anagrafica:
  // è la vista dove quel numero si vede e da dove si rettifica.
  const sottoScorta = (db.items || []).filter(it => hasStock(it) && safetyStockOf(it) > 0 && onHandOf(it.id) < safetyStockOf(it));
  agg(sottoScorta.length, sottoScorta.length === 1 ? 'articolo sotto la scorta minima' : 'articoli sotto la scorta minima', 'stock', 'media');

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

// ─── Calendario ───
// I segnali sopra dicono *quanto*; il calendario dice *quando*. Le date c'erano
// già tutte — consegna della commessa, data entro cui ordinare, consegna
// confermata dal fornitore — ma ognuna nella sua vista: nessuno le vedeva in
// fila, e due scadenze sullo stesso martedì si scoprivano il martedì.
//
// Anche qui non si calcola niente di nuovo: le righe di fabbisogno sono le
// stesse di homeSegnali() (al netto, da commitIndex()), i ritardi d'ordine sono
// quelli di ordLineDelay(). L'unico dato nuovo sono i promemoria, per le
// scadenze che non stanno in nessun documento.

const CAL_GRAV_ORD = { alta: 0, media: 1, info: 2 };
// Scaduto → alta, entro la finestra d'avviso del fabbisogno → media. Una sola
// soglia per tutta l'app: «tra pochi giorni» non deve voler dire sette giorni
// nel fabbisogno e dieci nel calendario.
function calGravitaData(data, oggi) {
  if (data < oggi) return 'alta';
  return data <= addDays(oggi, URGENCY_WARN_DAYS) ? 'media' : 'info';
}
function calPeggiore(a, b) { return CAL_GRAV_ORD[a] <= CAL_GRAV_ORD[b] ? a : b; }

// Tutte le scadenze aperte: [{ data, icona, testo, dettaglio, gravita, azione, etichetta, tipo }].
// Più righe della stessa fonte nello stesso giorno diventano **una** voce: un
// piano da quaranta articoli riempirebbe la cella e coprirebbe il resto.
function homeEventi() {
  const oggi = oggiISO();
  const out = [];
  const gruppi = new Map();
  const raggruppa = (chiave, base, gravita) => {
    let g = gruppi.get(chiave);
    if (!g) { g = Object.assign({ n: 0, gravita }, base); gruppi.set(chiave, g); out.push(g); }
    g.n++;
    g.gravita = calPeggiore(g.gravita, gravita);
    return g;
  };

  // Commesse: la data a monte di tutto
  (db.jobs || []).forEach(j => {
    if (!j.dueDate || j.status === 'chiusa' || j.status === 'annullata' || j.active === false) return;
    out.push({ tipo: 'commessa', data: j.dueDate, icona: '🏁',
      testo: `Consegna commessa ${j.number || ''}`.trim(),
      dettaglio: [j.customer, j.title].filter(Boolean).join(' — '),
      gravita: jobLate(j) ? 'alta' : calGravitaData(j.dueDate, oggi),
      azione: `setView('jobs');openJobEdit('${j.id}')` });
  });

  // Fabbisogno: entro quando ordinare, piano per piano
  const piani = new Map((db.plans || []).map(p => [p.id, p]));
  commitIndex().forEach((commits, itemId) => {
    const it = getItem(itemId); if (!it) return;
    commits.forEach(c => {
      const r = mrpBuyRow({ item: it, qty: c.qty, due: c.due }, true, c.planId);
      if (r.qtyOrder <= 0 || !r.orderBy) return;
      const grav = r.urgenza === 'ritardo' ? 'alta' : (r.urgenza === 'urgente' ? 'media' : 'info');
      const g = raggruppa('mrp|' + c.planId + '|' + r.orderBy, { tipo: 'fabbisogno', data: r.orderBy, icona: '🛒',
        numero: c.number || '', azione: `setView('mrp');openPlanEdit('${c.planId}')` }, grav);
      g.testo = g.n === 1 ? `Ordinare ${it.code || it.name || 'un articolo'}` : `Ordinare ${g.n} articoli`;
      g.dettaglio = [g.numero, (piani.get(c.planId) || {}).title].filter(Boolean).join(' — ');
    });
  });

  // Piani: quando deve essere pronto
  (db.plans || []).forEach(p => {
    if (p.active === false || !p.dueDate) return;
    out.push({ tipo: 'piano', data: p.dueDate, icona: '🏭',
      testo: `Piano ${p.number || ''} da completare`.replace(/\s+/g, ' '),
      dettaglio: p.title || '', gravita: p.dueDate < oggi ? 'media' : 'info',
      azione: `setView('mrp');openPlanEdit('${p.id}')` });
  });

  // Ordini: le consegne ancora da ricevere, alla data confermata se c'è
  (db.orders || []).forEach(o => {
    if (o.active === false || o.status === 'bozza' || o.status === 'annullato' || o.status === 'evaso') return;
    const forn = (db.suppliers || []).find(s => s.id === o.supplierId);
    (o.lines || []).forEach(l => {
      const data = l.confirmedDate || l.deliveryDate;
      if (!data || (Number(l.received) || 0) >= (Number(l.qty) || 0)) return;
      let grav = data < oggi ? 'alta' : calGravitaData(data, oggi);
      if (grav === 'info' && (ordLineDelay(l) || 0) > 0) grav = 'media';
      const g = raggruppa('ord|' + o.id + '|' + data, { tipo: 'ordine', data, icona: '🚚',
        azione: `setView('orders');openOrderEdit('${o.id}')`,
        dettaglio: [forn && forn.name, o.title].filter(Boolean).join(' — ') }, grav);
      g.testo = `Consegna ordine ${o.number || ''}`.trim() + (g.n > 1 ? ` (${g.n} righe)` : '');
      if ((ordLineDelay(l) || 0) > 0) g.ritardo = true;
    });
  });

  // Richieste inviate: la consegna chiesta, per sapere quando sollecitare
  (db.rfqs || []).forEach(q => {
    if (q.active === false || q.status !== 'inviata') return;
    (q.lines || []).forEach(l => {
      if (!l.deliveryDate) return;
      const g = raggruppa('rfq|' + q.id + '|' + l.deliveryDate, { tipo: 'richiesta', data: l.deliveryDate, icona: '📨',
        azione: `setView('rfq');openRfqEdit('${q.id}')`, dettaglio: q.title || '' }, 'info');
      g.testo = `Consegna chiesta in ${q.number || 'richiesta'}, senza risposta`;
    });
  });

  // Promemoria scritti a mano
  (db.reminders || []).forEach(r => {
    if (r.active === false || r.done || !r.date) return;
    const job = r.jobId ? (db.jobs || []).find(j => j.id === r.jobId) : null;
    out.push({ tipo: 'promemoria', data: r.date, icona: '📌', id: r.id,
      testo: r.title || 'Promemoria',
      dettaglio: [job && job.number, r.notes].filter(Boolean).join(' — '),
      gravita: r.date < oggi ? 'alta' : (CAL_GRAV_ORD[r.gravita] != null ? r.gravita : 'info'),
      azione: `reminderModal('${r.id}')` });
  });

  out.forEach(e => { delete e.numero; delete e.n; });
  return out.sort((a, b) => a.data.localeCompare(b.data) || CAL_GRAV_ORD[a.gravita] - CAL_GRAV_ORD[b.gravita]);
}

// Stato della vista: mese mostrato e giorno scelto. Comodità di navigazione,
// come jobView o mrpView — non finisce nel database.
let homeCalMese = '';     // 'YYYY-MM'
let homeCalGiorno = '';   // 'YYYY-MM-DD'
function calMeseDi(iso) { return String(iso || '').slice(0, 7); }
function calSpostaMese(mese, delta) {
  const [y, m] = mese.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}
function calNomeMese(mese) {
  return new Date(mese + '-01T00:00:00Z').toLocaleDateString('it-IT', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
// «Mercoledì 23 settembre»: maiuscola solo in testa, i mesi in italiano no.
function calNomeGiorno(iso) {
  const t = new Date(iso + 'T00:00:00Z').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}
// Le celle della griglia: da lunedì della prima settimana a domenica
// dell'ultima. Date in UTC per la stessa ragione di addDays(): sono giorni, non
// istanti, e il fuso non deve spostarli.
function calGiorniGriglia(mese) {
  const primo = mese + '-01';
  const lun = (new Date(primo + 'T00:00:00Z').getUTCDay() + 6) % 7;
  const giorni = new Date(Date.UTC(+mese.slice(0, 4), +mese.slice(5, 7), 0)).getUTCDate();
  const celle = Math.ceil((lun + giorni) / 7) * 7;
  const inizio = addDays(primo, -lun);
  return Array.from({ length: celle }, (_, i) => addDays(inizio, i));
}
function homeCalMove(delta) { homeCalMese = calSpostaMese(homeCalMese || calMeseDi(oggiISO()), delta); renderHome(); }
function homeCalToday() { homeCalGiorno = oggiISO(); homeCalMese = calMeseDi(homeCalGiorno); renderHome(); }
function homeCalPick(iso) { homeCalGiorno = iso; homeCalMese = calMeseDi(iso); renderHome(); }

const CAL_GRAV_COL = { alta: 'var(--red)', media: 'var(--orange)', info: 'var(--accent)' };
function calRiga(e, conData) {
  return `<div class="mgmt-item cal-ev" ${clickAttrs(e.azione, `${e.testo}${conData ? ' — ' + fmtDateIt(e.data) : ''}`)}>
      <span class="cal-dot" style="background:${CAL_GRAV_COL[e.gravita]}"></span>
      ${conData ? `<span class="mgmt-item-meta" style="width:78px">${esc(fmtDateIt(e.data))}</span>` : ''}
      <span aria-hidden="true">${e.icona}</span>
      <span style="flex:1;min-width:140px"><strong>${esc(e.testo)}</strong>${e.ritardo ? ' <span class="mrp-warn">confermata in ritardo</span>' : ''}
        ${e.dettaglio ? `<span class="empty-text" style="padding:0;display:block;text-align:left">${esc(e.dettaglio)}</span>` : ''}</span>
    </div>`;
}
function calElenco(eventi, conData, vuoto) {
  return eventi.length ? `<div style="display:flex;flex-direction:column;gap:6px">${eventi.map(e => calRiga(e, conData)).join('')}</div>`
    : `<div class="empty-text" style="text-align:left">${esc(vuoto)}</div>`;
}

function renderHomeCalendar(eventi) {
  const oggi = oggiISO();
  if (!homeCalMese) homeCalMese = calMeseDi(oggi);
  if (!homeCalGiorno) homeCalGiorno = oggi;
  const perGiorno = new Map();
  eventi.forEach(e => { if (!perGiorno.has(e.data)) perGiorno.set(e.data, []); perGiorno.get(e.data).push(e); });

  const intest = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'].map(g => `<div class="cal-head">${g}</div>`).join('');
  const celle = calGiorniGriglia(homeCalMese).map(d => {
    const ev = perGiorno.get(d) || [];
    const cls = ['cal-cell', calMeseDi(d) !== homeCalMese ? 'cal-out' : '', d === oggi ? 'cal-today' : '', d === homeCalGiorno ? 'cal-sel' : ''].filter(Boolean).join(' ');
    const punti = ev.slice(0, 3).map(e => `<span class="cal-dot" style="background:${CAL_GRAV_COL[e.gravita]}"></span>`).join('');
    const etichetta = `${calNomeGiorno(d)}${ev.length ? ', ' + ev.length + (ev.length === 1 ? ' scadenza' : ' scadenze') : ''}`;
    return `<button type="button" class="${cls}" onclick="homeCalPick('${d}')" aria-label="${esc(etichetta)}"${d === homeCalGiorno ? ' aria-pressed="true"' : ''}>
        <span class="cal-num">${+d.slice(8)}</span>
        <span class="cal-dots">${punti}${ev.length > 3 ? `<span class="cal-more">+${ev.length - 3}</span>` : ''}</span></button>`;
  }).join('');

  // Lo scaduto sta fuori dalla griglia e non dipende dal mese: sfogliando
  // avanti non deve sparire proprio quello che è già in ritardo.
  const scaduti = eventi.filter(e => e.data < oggi);
  const MAX_SCADUTI = 10;
  const delGiorno = perGiorno.get(homeCalGiorno) || [];
  const prossimi = eventi.filter(e => e.data >= oggi && e.data <= addDays(oggi, 14));
  const puoi = canWrite('agenda');

  return `<div class="mrp-section">
      <div class="cycle-section-head" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <h3 style="flex:1">📅 Calendario scadenze</h3>
        ${puoi ? `<button class="btn-outline" onclick="reminderModal(null, '${homeCalGiorno}')">+ Promemoria</button>` : ''}
      </div>
      ${scaduti.length ? `<div class="cal-block cal-late">
        <h4>⚠ Scadute e non risolte (${scaduti.length})</h4>
        ${calElenco(scaduti.slice(0, MAX_SCADUTI), true, '')}
        ${scaduti.length > MAX_SCADUTI ? `<div class="empty-text" style="text-align:left">…e altre ${scaduti.length - MAX_SCADUTI}: le trovi nelle viste qui sopra.</div>` : ''}
      </div>` : ''}
      <div class="cal-wide">
        <div class="cal-toolbar">
          <button class="btn-outline" onclick="homeCalMove(-1)" title="Mese precedente" aria-label="Mese precedente">‹</button>
          <strong class="cal-title">${esc(calNomeMese(homeCalMese))}</strong>
          <button class="btn-outline" onclick="homeCalMove(1)" title="Mese successivo" aria-label="Mese successivo">›</button>
          <button class="btn-outline" onclick="homeCalToday()">Oggi</button>
          <span class="cal-legend"><span class="cal-dot" style="background:var(--red)"></span>scaduto
            <span class="cal-dot" style="background:var(--orange)"></span>entro ${URGENCY_WARN_DAYS} giorni
            <span class="cal-dot" style="background:var(--accent)"></span>in programma</span>
        </div>
        <div class="cal-grid">${intest}${celle}</div>
        <div class="cal-block">
          <h4>${esc(calNomeGiorno(homeCalGiorno))}</h4>
          ${calElenco(delGiorno, false, 'Nessuna scadenza in questo giorno.')}
        </div>
      </div>
      <div class="cal-narrow cal-block">
        <h4>Prossimi 14 giorni</h4>
        ${calElenco(prossimi, true, 'Nessuna scadenza nelle prossime due settimane.')}
      </div>
    </div>`;
}

// ─── Promemoria ───
function reminderModal(id, dataProposta) {
  const r = id ? Store.getById('reminders', id) : null;
  if (id && !r) return;
  const puoi = canWrite('agenda');
  if (!r && !roleGuard('agenda')) return;
  const dis = puoi ? '' : ' disabled';
  const commesse = (db.jobs || []).filter(j => j.active !== false && ((r && r.jobId === j.id) || (j.status !== 'chiusa' && j.status !== 'annullata')));
  const grav = (r && r.gravita) || 'info';
  openModal(`<h3>${r ? '📌 Promemoria' : '📌 Nuovo promemoria'}</h3>
    <div class="modal-field"><label>Cosa</label><input id="rem-title" value="${esc(r ? r.title || '' : '')}" placeholder="es. Sollecitare conferma ordine"${dis}></div>
    <div class="modal-grid">
      <div class="modal-field"><label>Data</label><input type="date" id="rem-date" value="${esc(r ? r.date || '' : (dataProposta || oggiISO()))}"${dis}></div>
      <div class="modal-field"><label>Importanza</label><select id="rem-grav"${dis}>
        ${[['info', 'Normale'], ['media', 'Da tenere d\'occhio'], ['alta', 'Critica']].map(([v, t]) => `<option value="${v}"${grav === v ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="modal-field" style="grid-column:1/-1"><label>Commessa (facoltativa)</label><select id="rem-job"${dis}>
        <option value="">—</option>
        ${commesse.map(j => `<option value="${j.id}"${r && r.jobId === j.id ? ' selected' : ''}>${esc([j.number, j.customer].filter(Boolean).join(' — '))}</option>`).join('')}</select></div>
      <div class="modal-field" style="grid-column:1/-1"><label>Note</label><textarea id="rem-notes" rows="3"${dis}>${esc(r ? r.notes || '' : '')}</textarea></div>
    </div>
    ${r ? stampLine(r) : ''}
    <div class="modal-actions">
      ${r && puoi ? `<button class="btn-ghost btn-danger" onclick="reminderDelete('${r.id}')">🗑 Elimina</button>` : ''}
      <button class="btn-ghost" onclick="closeModal()">${puoi ? 'Annulla' : 'Chiudi'}</button>
      ${r && puoi ? `<button class="btn-outline" onclick="reminderDone('${r.id}')">✓ Fatto</button>` : ''}
      ${puoi ? `<button class="add-btn-sm" onclick="reminderSave(${r ? `'${r.id}'` : 'null'})">Salva</button>` : ''}
    </div>`);
}
function reminderSave(id) {
  if (!roleGuard('agenda')) return;
  const title = val('rem-title'), date = val('rem-date');
  if (!title) { showToast('Scrivi di cosa si tratta', 'error'); return; }
  if (!date) { showToast('Serve una data', 'error'); return; }
  const gravita = CAL_GRAV_ORD[val('rem-grav')] != null ? val('rem-grav') : 'info';
  const dati = { title, date, gravita, jobId: val('rem-job') || '', notes: val('rem-notes') };
  if (id) Store.update('reminders', id, dati);
  else Store.insert('reminders', Object.assign({ done: false, active: true }, dati));
  closeModal();
  homeCalGiorno = date; homeCalMese = calMeseDi(date);
  renderHome();
  showToast(id ? 'Promemoria aggiornato' : 'Promemoria aggiunto');
}
// «Fatto» non cancella: il promemoria esce dal calendario ma resta nel
// database, e con lui chi l'ha chiuso e quando.
function reminderDone(id) {
  if (!roleGuard('agenda')) return;
  if (!Store.update('reminders', id, { done: true, doneAt: new Date().toISOString() })) return;
  closeModal();
  renderHome();
  showToast('Promemoria segnato come fatto');
}
function reminderDelete(id) {
  if (!roleGuard('agenda')) return;
  const r = Store.getById('reminders', id); if (!r) return;
  askConfirm(`Eliminare il promemoria «${r.title || ''}»?`, () => {
    closeModal();   // la scheda del promemoria, sotto la conferma
    removeConUndo('reminders', id, 'Promemoria eliminato', () => renderHome());
  }, { ok: 'Elimina' });
}

function renderHome() {
  const host = document.getElementById('view-home'); if (!host) return;
  invalidateCaches();
  const segnali = homeSegnali();
  const ris = homeRisparmio();
  const nome = (currentUser && currentUser.name || '').split(' ')[0];

  const GRAVITA = { alta: 'var(--red)', media: 'var(--orange, #d90)', info: 'var(--text-dim)' };
  const righe = segnali.map(s => `<div class="mgmt-item" ${clickAttrs(`setView('${s.vista}')`, `${s.n} ${s.testo} — vai a ${viewLabel(s.vista)}`)} style="cursor:pointer">
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

    ${renderHomeCalendar(homeEventi())}

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
        <button class="btn-outline" onclick="setView('stock')">📦 Magazzino</button>
        <button class="btn-outline" onclick="setView('mrp')">📋 Fabbisogno</button>
        <button class="btn-outline" onclick="setView('orders')">🧾 Ordini</button>
        <button class="btn-outline" onclick="globalSearchModal()">🔎 Cerca ovunque (Ctrl+K)</button>
      </div>
    </div></div>`;
}
