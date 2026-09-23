// ═══════════════════════════════════════════════════════════
//  BOMTRACK — worklist.js
// ═══════════════════════════════════════════════════════════
// L'elenco a destra, il documento al centro.
// Classic script, scope globale condiviso con gli altri: nessun modulo e
// nessun build, così index.html continua ad aprirsi con un doppio click.
//
// ── Il problema ──
// Commesse, fabbisogno, richieste e ordini sono quattro viste che fanno la
// stessa cosa — si sceglie un documento da un elenco e lo si lavora — ma la
// facevano in quattro modi. Ognuna aveva il suo elenco a tutta pagina, la sua
// barra filtri, i suoi pulsanti in riga, e per aprire un documento si perdeva
// di vista l'elenco: tornare indietro, ritrovare la riga, riaprire. Confrontare
// due ordini o passare in rassegna dieci richieste voleva dire fare quel giro
// dieci volte.
//
// ── La forma ──
// Una sola: l'elenco vive in una colonna a destra e non se ne va mai, il
// documento scelto sta al centro. Cambiare documento è un click, e la riga da
// cui si viene resta sotto gli occhi. I filtri stanno con l'elenco, dove sono
// il modo per restringerlo — non un'intestazione della pagina.
//
// ── Cosa **non** fa ──
// Non aggiunge funzioni. I comandi che stavano nelle righe (duplica, elimina,
// genera ordine) sono gli stessi, spostati nella testata del documento aperto:
// in una colonna da 360px non ci stanno sei icone per riga, e un comando che
// agisce su un documento ha senso dove quel documento si vede.
//
// Le viste che non chiamano `worklistHtml()` non se ne accorgono: qui non c'è
// stato globale, solo un disegno che prende dati e restituisce HTML.

// ─── Il telaio ───
// `o.doc` è l'HTML del documento aperto: vuoto significa «nessuna scelta», e al
// centro compare l'invito invece di una pagina bianca.
//   titolo, icona   — intestazione della colonna
//   comandi         — HTML dei pulsanti di testata (nuovo, export…)
//   filtri          — HTML dei campi di filtro, già con i loro id
//   listaId, righe  — il contenitore dell'elenco e le sue righe
//   nota            — riga di spiegazione sotto l'elenco, facoltativa
//   vuoto           — { titolo, testo, comandi } dell'invito al centro
function worklistHtml(o) {
  return `<div class="wl">
    <section class="wl-main">${o.doc || worklistEmptyHtml(o)}</section>
    <aside class="wl-side" aria-label="Elenco: ${esc(o.titolo || '')}">
      <div class="wl-side-head">
        <h2 class="wl-side-title">${o.icona ? ico(o.icona, 'tinted pill', '') : ''} ${esc(o.titolo || '')}</h2>
      </div>
      ${o.comandi ? `<div class="wl-cmds">${o.comandi}</div>` : ''}
      ${o.filtri ? `<div class="wl-filters">${o.filtri}</div>` : ''}
      <div class="wl-list" id="${esc(o.listaId)}">${o.righe}</div>
      ${o.nota ? `<p class="wl-note">${o.nota}</p>` : ''}
    </aside>
  </div>`;
}
// Il centro quando non c'è niente di scelto. Non è una pagina d'errore: è il
// posto dove dire cosa fa questa vista, a chi la apre per la prima volta.
function worklistEmptyHtml(o) {
  const v = o.vuoto || {};
  return `<div class="wl-empty">
    ${o.icona ? ico(o.icona, 'tinted pill', '') : ''}
    <h2>${esc(v.titolo || o.titolo || '')}</h2>
    ${v.testo ? `<p>${v.testo}</p>` : ''}
    ${v.comandi ? `<div class="wl-empty-cmds">${v.comandi}</div>` : ''}
  </div>`;
}
// Una riga dell'elenco. Tutta cliccabile — il bersaglio è la riga, non
// un'icona da centrare — e con `clickAttrs` risponde anche da tastiera.
//   numero, badge, titolo, meta, sel, spenta, azione, etichetta
function worklistRow(o) {
  const classi = 'wl-row' + (o.sel ? ' sel' : '') + (o.spenta ? ' spenta' : '');
  return `<div class="${classi}" ${clickAttrs(o.azione, o.etichetta)}${o.sel ? ' aria-current="true"' : ''}>
    <div class="wl-row-top">
      <span class="wl-num">${esc(o.numero || '')}</span>
      ${o.badge || ''}
    </div>
    <div class="wl-row-title">${esc(o.titolo || '(senza titolo)')}</div>
    ${o.meta ? `<div class="wl-row-meta">${o.meta}</div>` : ''}
  </div>`;
}
// Il conteggio sotto i filtri: «12 documenti», oppure «3 di 12» quando un
// filtro sta nascondendo qualcosa. Stesso testo in tutte e quattro le viste.
function worklistCount(shown, total, singolare, plurale) {
  if (shown === total) return total + ' ' + (total === 1 ? singolare : plurale);
  return shown + ' di ' + total;
}
// ─── Filtro per periodo, condiviso dai quattro elenchi ───
// Richieste, ordini, commesse e piani si guardano tutti per periodo — «cosa è
// passato a settembre» — e la domanda è la stessa: due estremi sulla data del
// documento. Sta qui perché quattro copie della stessa coppia di caselle
// divergerebbero al primo ritocco, e perché il filtro dello schermo e quello
// dell'export devono restare lo stesso codice.
//
// `onchange` è l'espressione da eseguire al cambio: i menu a tendina in queste
// barre sono già immediati, e scegliere una data dal calendario è un gesto
// concluso quanto un click — non c'è niente da aspettare.
function dateRangeFilter(prefix, from, to, onchange, cosa) {
  const lab = esc(cosa || 'documento');
  return `<div class="wl-filter-dates">
    <span class="wl-filter-lbl">Data</span>
    <input type="date" id="${prefix}-from" value="${esc(from || '')}" title="Dal giorno" aria-label="Data ${lab}: dal giorno" onchange="${onchange}">
    <span class="wl-filter-sep">→</span>
    <input type="date" id="${prefix}-to" value="${esc(to || '')}" title="Al giorno" aria-label="Data ${lab}: al giorno" onchange="${onchange}">
  </div>`;
}
// Le date sono già `AAAA-MM-GG`: confrontarle come stringhe le ordina come il
// calendario, senza costruire Date e senza fusi orari di mezzo. Lo slice
// difende dai record vecchi, che qui portavano l'istante completo.
// Un documento senza data resta fuori quando un periodo è impostato: non
// avendo data, non si può dire che ci cada dentro.
function inDateRange(iso, from, to) {
  if (!from && !to) return true;
  const g = (iso || '').slice(0, 10);
  if (!g) return false;
  if (from && g < from) return false;
  if (to && g > to) return false;
  return true;
}
// L'intervallo detto a parole, per l'intestazione degli export: «dal 1/9 al
// 30/9» si legge, due caselle di date no.
function dateRangeText(from, to) {
  if (from && to) return `dal ${fmtDateIt(from)} al ${fmtDateIt(to)}`;
  if (from) return `dal ${fmtDateIt(from)}`;
  if (to) return `fino al ${fmtDateIt(to)}`;
  return '';
}
// Chiudere il documento aperto. Prende il posto del vecchio «← Elenco»:
// l'elenco non è più un altrove in cui tornare, è lì a destra.
function worklistCloseBtn(azione, cosa) {
  return `<button class="btn-outline" onclick="${azione}" title="Chiudi ${esc(cosa)}: l'elenco resta a destra">${ico('close', 'tinted', '')} Chiudi</button>`;
}
