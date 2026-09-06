// ═══════════════════════════════════════════════════════════
//  BOMTRACK — theme.js
// ═══════════════════════════════════════════════════════════
// Tema chiaro e scuro. Classic script, scope globale condiviso con gli altri.
//
// Tre stati, non due: chiaro, scuro e **automatico**, che è quello di partenza.
// L'automatico non è un ripiego — è il PC che sa già se fuori è giorno, e in
// officina lo schermo si guarda alle sette del mattino e alle sette di sera.
// Un interruttore a due posizioni costringerebbe a girarlo due volte al giorno.
//
// La scelta vive nel browser di chi lavora, non nel database: è una comodità
// personale, come la larghezza dell'ispettore, e sincronizzarla sul database
// condiviso significherebbe imporre il proprio tema ai colleghi. Se
// localStorage rifiuta — modo privato, spazio esaurito — si continua in
// automatico: una preferenza non deve poter impedire l'avvio.
//
// Il colore vero sta tutto in style.css. Qui si scrive un attributo e basta.

// ATTENZIONE: questa stringa è ripetuta, cablata, nello script in testa a
// index.html — quello che applica il tema prima che la pagina si disegni.
// Rinominarla qui non produce nessun errore da nessuna parte: il tema smette
// solo di applicarsi in anticipo, e torna il lampo scuro che quello script
// esiste per evitare. Se si cambia, si cambia in tutti e due i posti.
const THEME_KEY = 'bomtrack_theme';
// L'ordine è anche il giro del pulsante: si parte da «come il sistema», che è
// il valore di serie, e ci si torna dopo aver provato i due espliciti.
const THEMES = ['auto', 'light', 'dark'];
const THEME_LABEL = { auto: 'Come il sistema', light: 'Chiaro', dark: 'Scuro' };
let theme = 'auto';

function themeLoad() {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (THEMES.includes(v)) theme = v;
  } catch (e) { /* preferenza illeggibile: si resta in automatico */ }
  return theme;
}
function themeSave() {
  try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* niente da salvare, niente da rompere */ }
}
// In automatico l'attributo si toglie del tutto: è l'assenza a lasciare
// decidere alla media query. Scrivere `data-theme="auto"` la scavalcherebbe
// senza dire quale dei due si vuole.
function themeApply() {
  const r = typeof document !== 'undefined' && document.documentElement;
  if (!r) return theme;
  if (theme === 'auto') r.removeAttribute('data-theme');
  else r.setAttribute('data-theme', theme);
  return theme;
}
// Il tema che si sta effettivamente vedendo, che in automatico è quello del
// sistema. Serve al pulsante, che deve mostrare dove si va, non come si chiama
// l'impostazione: con la luna quando è chiaro, col sole quando è scuro.
function themeEffective() {
  if (theme !== 'auto') return theme;
  const mm = typeof window !== 'undefined' && window.matchMedia;
  return mm && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}
function themeSet(t) {
  theme = THEMES.includes(t) ? t : 'auto';
  themeApply(); themeSave(); themeButtonFill();
  return theme;
}
// Il giro passa da tutti e tre gli stati — automatico compreso — perché questo
// pulsante è l'unico posto da cui il tema si sceglie, e deve bastare a
// chiunque. La Gestione non andrebbe bene: là dentro scrive solo
// l'amministratore, mentre il tema è una comodità di chi guarda lo schermo,
// qualunque ruolo abbia. Rimasto fuori dal giro, «come il sistema» sarebbe
// irraggiungibile per tre utenti su quattro.
function themeNext() { return THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]; }
function themeToggle() {
  themeSet(themeNext());
  showToast('Tema: ' + THEME_LABEL[theme].toLowerCase());
}
// Il pulsante nell'intestazione (il markup sta in index.html, come gli altri).
// L'icona dice **dove si è**: il sole se lo schermo è chiaro, la luna se è
// scuro. Con tre stati non può dire dove si va — la meta cambia a ogni giro, e
// una freccia che punta a «come il sistema» non si disegna.
//
// A dirlo è il titolo, che nomina lo stato per esteso e il prossimo del giro.
// Serve soprattutto a distinguere «chiaro» da «come il sistema, che ora è
// chiaro»: sullo schermo sono identici, ed è l'unico posto dove la differenza
// si può leggere.
function themeButtonFill() {
  const b = typeof document !== 'undefined' && document.getElementById('theme-btn');
  if (!b) return;
  const eff = themeEffective();
  const ora = theme === 'auto' ? `come il sistema (${eff === 'dark' ? 'scuro' : 'chiaro'})` : THEME_LABEL[theme].toLowerCase();
  const testo = `Tema: ${ora} · premi per «${THEME_LABEL[themeNext()].toLowerCase()}»`;
  b.innerHTML = ico(eff === 'dark' ? 'moon' : 'sun', 'tinted', '');
  b.setAttribute('title', testo);
  b.setAttribute('aria-label', testo);
}
// Chi resta in automatico deve vedere il cambio quando il sistema passa a sera,
// senza ricaricare. Cambia solo l'icona del pulsante: il colore lo fa la media
// query da sé, senza passare da qui.
function themeWatchSystem() {
  const mm = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)');
  if (!mm || !mm.addEventListener) return;
  mm.addEventListener('change', () => { if (theme === 'auto') themeButtonFill(); });
}

// L'attributo è già stato scritto dallo script in testa a index.html, prima
// che la pagina si disegnasse: qui si riallinea lo stato del modulo e si
// riempie il pulsante. Il DOM finto della suite non ha documentElement con
// gli attributi: la guardia lo tiene fuori, e le funzioni restano provabili.
if (typeof document !== 'undefined' && document.documentElement) {
  themeLoad(); themeApply(); themeButtonFill(); themeWatchSystem();
}
