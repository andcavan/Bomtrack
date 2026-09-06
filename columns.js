// ─── Colonne degli elenchi ───
//
// L'altra metà del problema che il pannello laterale ha cominciato a risolvere.
// Il pannello ha tolto dalle righe i comandi; qui si tolgono le colonne che a
// una certa persona, in un certo lavoro, non servono: chi compra non guarda il
// lotto, chi controlla il magazzino non guarda la famiglia. Nascondere non è
// perdere — l'articolo ha tutto nel pannello, che di spazio ne ha.
//
// Il meccanismo è deliberatamente stupido: ogni cella porta la classe della sua
// colonna (`col-uom`, `col-lot`…) e nascondere significa scrivere una regola
// CSS. Nessun ridisegno, nessuna tabella da ricostruire, nessun conteggio di
// `<td>` da tenere allineato con i `<th>` — la stessa classe sta su entrambi, e
// se sbagli sparisce la coppia, non mezza tabella.
//
// La scelta è **per vista**, non per utente e non nel database: Acquisti e
// Progetto disegnano le righe con la stessa funzione ma sono due elenchi
// diversi, e chi li usa li guarda per motivi diversi.

// Underscore come tutte le altre chiavi locali. La vecchia col punto si
// travasa alla prima lettura (localPref, core.js): le colonne nascoste a mano
// non devono ricomparire tutte per un cambio di nome.
const COLS_KEY = 'bomtrack_columns';
const COLS_KEY_VECCHIA = 'bomtrack.columns';

// Codice e Nome non si nascondono: sono l'identità della riga, e un elenco in
// cui non si sa più di cosa parla ogni riga non è un elenco più pulito, è un
// elenco rotto. La colonna dei comandi non è qui: la governa il pannello.
const COLUMNS = {
  buy: [
    { key: 'flags', label: 'Indicatori' },
    { key: 'code', label: 'Codice', fissa: true },
    { key: 'name', label: 'Nome', fissa: true },
    { key: 'type', label: 'Tipo' },
    { key: 'family', label: 'Famiglia' },
    { key: 'uom', label: 'U.M.' },
    { key: 'cost', label: 'Costo unitario' },
    { key: 'meta', label: 'Dettaglio' },
  ],
  stock: [
    { key: 'flags', label: 'Indicatori' },
    { key: 'code', label: 'Codice', fissa: true },
    { key: 'name', label: 'Nome', fissa: true },
    { key: 'type', label: 'Tipo' },
    { key: 'family', label: 'Famiglia' },
    { key: 'uom', label: 'U.M.' },
    { key: 'onhand', label: 'Esistente' },
    { key: 'incoming', label: 'In arrivo' },
    { key: 'committed', label: 'Impegnato' },
    { key: 'free', label: 'Libero' },
    { key: 'safety', label: 'Scorta minima' },
    { key: 'lot', label: 'Lotto' },
  ],
};
// Le due anagrafiche hanno le stesse colonne ma tengono scelte separate.
// Una copia e non lo stesso array: l'alias funzionava solo finché nessuno lo
// mutava, e la separazione che il commento descrive valeva per colsHidden, non
// per la definizione — aggiungere una colonna a Progetto l'avrebbe aggiunta
// anche ad Acquisti, senza un errore da nessuna parte.
COLUMNS.design = COLUMNS.buy.map(c => Object.assign({}, c));
// Dove sta la tabella di ciascuna vista: la regola CSS si limita a quella, così
// nascondere una colonna in Acquisti non la nasconde in Progetto.
const COL_TABLE = { buy: 'buy-table', design: 'des-table', stock: 'stk-table' };

let colsHidden = {};    // vista → elenco delle colonne nascoste

function colsFor(view) { return COLUMNS[view] || null; }
function colsHiddenOf(view) { return colsHidden[view] || []; }
function colIsHidden(view, key) { return colsHiddenOf(view).includes(key); }

function colsLoad() {
  try {
    const p = JSON.parse(localPref(COLS_KEY, COLS_KEY_VECCHIA) || 'null');
    if (p && typeof p === 'object') colsHidden = p;
  } catch (e) { /* preferenze illeggibili: si riparte da tutte le colonne */ }
  colsSanitize();
}
function colsSave() {
  try { localStorage.setItem(COLS_KEY, JSON.stringify(colsHidden)); } catch (e) { /* niente da rompere */ }
}
// Una colonna tolta dal codice, o resa fissa, non deve restare nascosta per
// sempre per via di una preferenza salvata mesi fa: si scarta ciò che non
// esiste più e ciò che non si può nascondere.
function colsSanitize() {
  Object.keys(colsHidden).forEach(view => {
    const cols = colsFor(view);
    if (!cols) { delete colsHidden[view]; return; }
    const buone = (colsHidden[view] || []).filter(k => cols.some(c => c.key === k && !c.fissa));
    if (buone.length) colsHidden[view] = buone; else delete colsHidden[view];
  });
}

// Nascondere e rimettere è lo stesso gesto: si scrive la regola e basta.
function colToggle(view, key) {
  const cols = colsFor(view);
  const col = cols && cols.find(c => c.key === key);
  if (!col || col.fissa) return;
  const attuali = colsHiddenOf(view);
  colsHidden[view] = attuali.includes(key) ? attuali.filter(k => k !== key) : attuali.concat(key);
  if (!colsHidden[view].length) delete colsHidden[view];
  colsSave();
  colsApply();
  colsRenderPicker(view);
}
function colsResetView(view) {
  delete colsHidden[view];
  colsSave();
  colsApply();
  colsRenderPicker(view);
}

// Tutte le regole in una stringa sola: è la funzione che la suite verifica, e
// non tocca il DOM.
function colsHideCss() {
  return Object.keys(colsHidden).map(view => {
    const t = COL_TABLE[view];
    const keys = colsHiddenOf(view);
    if (!t || !keys.length) return '';
    return keys.map(k => `#${t} .col-${k}`).join(',') + '{display:none}';
  }).filter(Boolean).join('\n');
}
// Un solo foglio di stile, riscritto per intero a ogni cambio: niente regole
// vecchie da rincorrere.
function colsApply() {
  if (typeof document === 'undefined' || !document.createElement) return;
  let st = document.getElementById('col-style');
  if (!st) {
    st = document.createElement('style');
    st.id = 'col-style';
    if (document.head && document.head.appendChild) document.head.appendChild(st);
  }
  st.textContent = colsHideCss();
}

// ─── La scheda per scegliere ───
function colsPickerModal(view) {
  if (!colsFor(view)) return;
  openModal(colsPickerHtml(view), false, 'colonne');
}
function colsPickerHtml(view) {
  const cols = colsFor(view);
  const nascoste = colsHiddenOf(view).length;
  return `<h3>${ico('list', 'tinted pill', '')} Colonne dell'elenco</h3>
    <p class="empty-text" style="text-align:left;padding:0 0 12px">Le colonne che togli restano tolte anche
    domani. Quello che sparisce dall'elenco resta nel <strong>pannello laterale</strong>, che dell'articolo
    scelto dice tutto.</p>
    <div id="col-picker">${colsPickerBody(view)}</div>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="colsResetView('${view}')" ${nascoste ? '' : 'disabled'}>Mostra tutte</button>
      <button class="btn-outline" onclick="closeModal()">Chiudi</button>
    </div>`;
}
function colsPickerBody(view) {
  const cols = colsFor(view);
  return cols.map(c => {
    const vis = !colIsHidden(view, c.key);
    if (c.fissa) {
      return `<label class="flag-check col-pick-fissa" title="Identifica la riga: non si può nascondere">
        <input type="checkbox" checked disabled> ${esc(c.label)}</label>`;
    }
    return `<label class="flag-check">
      <input type="checkbox" ${vis ? 'checked' : ''} onchange="colToggle('${view}','${c.key}')"> ${esc(c.label)}</label>`;
  }).join('');
}
// Ridisegna solo l'elenco delle caselle: la scheda resta aperta, così si tolgono
// tre colonne di fila senza riaprirla ogni volta.
function colsRenderPicker(view) {
  if (typeof document === 'undefined') return;
  const box = document.getElementById('col-picker');
  if (box) box.innerHTML = colsPickerBody(view);
}
// Il pulsante che apre la scheda, con il conto di quante colonne mancano: senza,
// un elenco a cui manca una colonna sembra un elenco rotto.
function colsButton(view) {
  const n = colsHiddenOf(view).length;
  return `<button class="btn-outline${n ? ' active' : ''}" onclick="colsPickerModal('${view}')"
    title="Scegli quali colonne mostrare in questo elenco">${ico('list', 'tinted', '')} Colonne${n ? ` (${n} ${n === 1 ? 'nascosta' : 'nascoste'})` : ''}</button>`;
}
// Il pulsante vive dentro la barra dei filtri, che è HTML statico: lo si innesta
// al primo disegno della vista e lo si aggiorna a ogni cambio.
function colsMountButton(view) {
  if (typeof document === 'undefined') return;
  const host = document.getElementById('cols-btn-' + view);
  if (host) host.innerHTML = colsButton(view);
}

if (typeof document !== 'undefined') colsLoad();
