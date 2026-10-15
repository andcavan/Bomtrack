// ═══════════════════════════════════════════════════════════
//  BOMTRACK — combo.js (menu a tendina in cui si scrive, dalla 0.102.0)
// ═══════════════════════════════════════════════════════════
// Un <select> con la classe `sel-cerca` diventa un campo in cui si scrive:
// la lista si apre, e mentre si digita restano solo le voci che contengono
// quello che si è scritto. Serve ai fornitori, che sono decine e in un menu
// normale si cercano scorrendo.
//
// ── Il <select> resta ──
// Il menu vero non sparisce: resta nella pagina, nascosto, con il suo id, il
// suo valore e il suo `onchange`. Il campo nuovo gli scrive il valore e gli
// manda l'evento `change`, esattamente come una scelta col mouse. Così nessuna
// vista va riscritta: `val('pick-sup')`, i filtri, gli export, il blocco del
// documento (`disabled`) e i test continuano a leggere il <select>.
//
// ── Come si accende ──
// Le viste scrivono l'HTML con innerHTML in cento punti diversi: invece di
// chiamare qualcosa dopo ognuno, un MutationObserver guarda la pagina e
// trasforma ogni `select.sel-cerca` appena compare. Lo stesso osservatore
// tiene allineato il campo quando il <select> cambia voci o diventa
// disabilitato.

const COMBO_CLASSE = 'sel-cerca';

// Minuscole e senza accenti: «citta» trova «Città». Ogni parola scritta deve
// comparire, in qualunque ordine: «rid bonf» trova «Bonfiglioli Riduttori».
function comboNorm(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
// opzioni: [{ value, testo }]. Prima chi comincia con quello che si è scritto,
// poi chi lo contiene; dentro ciascun gruppo l'ordine del menu.
function comboFiltra(opzioni, testo) {
  const t = comboNorm(testo);
  if (!t) return opzioni.slice();
  const parole = t.split(/\s+/).filter(Boolean);
  const buone = opzioni.filter(o => { const n = comboNorm(o.testo); return parole.every(p => n.includes(p)); });
  const inizio = buone.filter(o => comboNorm(o.testo).startsWith(t));
  return inizio.concat(buone.filter(o => !inizio.includes(o)));
}
function comboOpzioni(sel) {
  return Array.prototype.map.call(sel.options || [], o => ({ value: o.value, testo: (o.textContent || '').trim() }));
}
function comboTestoScelto(sel) {
  const o = sel.options && sel.options[sel.selectedIndex];
  return o ? (o.textContent || '').trim() : '';
}

// ─── La lista ───
// Una sola, attaccata al body e posizionata sotto il campo: dentro una
// finestra o una tabella con overflow nascosto verrebbe tagliata.
let _combo = null;   // { sel, inp, voci, attiva }
function comboLista() {
  let l = document.getElementById('combo-list');
  if (!l) {
    l = document.createElement('div');
    l.id = 'combo-list';
    l.className = 'combo-list';
    l.setAttribute('role', 'listbox');
    l.addEventListener('mousedown', e => {
      // Il campo non deve perdere il focus prima che la scelta arrivi.
      e.preventDefault();
      const v = e.target.closest && e.target.closest('.combo-opt');
      if (v && _combo) comboScegli(Number(v.dataset.i));
    });
    document.body.appendChild(l);
  }
  return l;
}
function comboPosiziona() {
  if (!_combo) return;
  const l = comboLista(), r = _combo.inp.getBoundingClientRect();
  const sotto = window.innerHeight - r.bottom, sopra = r.top;
  const alto = Math.min(280, Math.max(sotto, sopra) - 12);
  l.style.left = Math.max(4, Math.min(r.left, window.innerWidth - Math.max(r.width, 220) - 4)) + 'px';
  l.style.width = Math.max(r.width, 220) + 'px';
  l.style.maxHeight = alto + 'px';
  if (sotto < 160 && sopra > sotto) { l.style.top = ''; l.style.bottom = (window.innerHeight - r.top + 2) + 'px'; }
  else { l.style.bottom = ''; l.style.top = (r.bottom + 2) + 'px'; }
}
function comboApri(inp, sel, testo) {
  const voci = comboFiltra(comboOpzioni(sel), testo);
  const scelta = voci.findIndex(o => o.value === sel.value);
  _combo = { sel, inp, voci, attiva: testo ? (voci.length ? 0 : -1) : Math.max(0, scelta) };
  comboDisegna();
  inp.setAttribute('aria-expanded', 'true');
}
function comboDisegna() {
  if (!_combo) return;
  const l = comboLista();
  const { voci, attiva, sel } = _combo;
  l.innerHTML = voci.length ? voci.map((o, i) => `<div class="combo-opt${i === attiva ? ' attiva' : ''}${o.value === sel.value ? ' scelta' : ''}${o.value === '' ? ' vuota' : ''}" role="option" data-i="${i}" id="combo-opt-${i}"${i === attiva ? ' aria-selected="true"' : ''}>${esc(o.testo || '—')}</div>`).join('')
    : '<div class="combo-nulla">Nessun fornitore con questo nome</div>';
  l.style.display = 'block';
  comboPosiziona();
  const a = l.querySelector('.attiva');
  if (a && a.scrollIntoView) a.scrollIntoView({ block: 'nearest' });
  if (attiva >= 0) _combo.inp.setAttribute('aria-activedescendant', 'combo-opt-' + attiva);
}
function comboChiudi(ripristina) {
  const l = document.getElementById('combo-list');
  if (l) { l.style.display = 'none'; l.innerHTML = ''; }
  if (_combo) {
    _combo.inp.setAttribute('aria-expanded', 'false');
    _combo.inp.removeAttribute('aria-activedescendant');
    if (ripristina) comboAllinea(_combo.sel);
  }
  _combo = null;
}
function comboScegli(i) {
  if (!_combo) return;
  const { sel, voci } = _combo;
  const o = voci[i];
  comboChiudi(false);
  if (!o) { comboAllinea(sel); return; }
  const cambiato = sel.value !== o.value;
  sel.value = o.value;
  comboAllinea(sel);
  // Dopo `change` molte viste ridisegnano tutto: il campo che stiamo usando
  // può non esistere più, ed è giusto così.
  if (cambiato) sel.dispatchEvent(new Event('change', { bubbles: true }));
}

// ─── Il campo ───
// Il testo mostrato è la voce scelta; una voce vuota («—», «Tutti i
// fornitori») diventa il segnaposto, così si comincia a scrivere senza
// cancellare niente.
function comboAllinea(sel) {
  const inp = sel && sel._comboIn;
  if (!inp) return;
  const vuota = sel.value === '';
  inp.value = vuota ? '' : comboTestoScelto(sel);
  inp.placeholder = vuota ? (comboTestoScelto(sel) && comboTestoScelto(sel) !== '—' ? comboTestoScelto(sel) : 'Scrivi per cercare…') : '';
  inp.disabled = !!sel.disabled;
  if (sel.title) inp.title = sel.title;
}
function comboAttacca(sel) {
  if (!sel || sel._comboIn || sel.tagName !== 'SELECT') return;
  const box = document.createElement('span');
  box.className = 'combo';
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.className = 'combo-in';
  inp.autocomplete = 'off';
  inp.spellcheck = false;
  inp.setAttribute('role', 'combobox');
  inp.setAttribute('aria-autocomplete', 'list');
  inp.setAttribute('aria-expanded', 'false');
  inp.setAttribute('aria-controls', 'combo-list');
  const etichetta = sel.getAttribute('aria-label') || sel.title
    || (sel.closest && sel.closest('.modal-field') && (sel.closest('.modal-field').querySelector('label') || {}).textContent) || 'Fornitore';
  inp.setAttribute('aria-label', String(etichetta).trim());
  box.appendChild(inp);
  sel.insertAdjacentElement('afterend', box);
  sel.classList.add('combo-nascosto');
  sel.setAttribute('tabindex', '-1');
  sel.setAttribute('aria-hidden', 'true');
  sel._comboIn = inp;
  comboAllinea(sel);

  inp.addEventListener('focus', () => { comboAllinea(sel); if (inp.select) inp.select(); comboApri(inp, sel, ''); });
  inp.addEventListener('click', () => { if (!_combo || _combo.inp !== inp) comboApri(inp, sel, ''); });
  inp.addEventListener('input', () => comboApri(inp, sel, inp.value));
  inp.addEventListener('blur', () => { if (_combo && _combo.inp === inp) comboChiudi(true); else comboAllinea(sel); });
  inp.addEventListener('keydown', e => {
    const aperto = _combo && _combo.inp === inp;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!aperto) { comboApri(inp, sel, ''); return; }
      const n = _combo.voci.length; if (!n) return;
      _combo.attiva = (_combo.attiva + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
      comboDisegna();
    } else if (e.key === 'Enter') {
      if (aperto) { e.preventDefault(); if (_combo.attiva >= 0) comboScegli(_combo.attiva); else comboChiudi(true); }
    } else if (e.key === 'Escape') {
      // Esc chiude la lista, non la finestra intorno.
      if (aperto) { e.preventDefault(); e.stopPropagation(); comboChiudi(true); }
    } else if (e.key === 'Tab') {
      if (aperto) comboChiudi(true);
    }
  });
}
function comboScansiona(radice) {
  if (!radice || !radice.querySelectorAll) return;
  if (radice.matches && radice.matches('select.' + COMBO_CLASSE)) comboAttacca(radice);
  radice.querySelectorAll('select.' + COMBO_CLASSE).forEach(comboAttacca);
}

if (typeof document !== 'undefined' && document.body && typeof MutationObserver !== 'undefined') {
  new MutationObserver(cambi => {
    cambi.forEach(m => {
      if (m.type === 'attributes') { if (m.target._comboIn) comboAllinea(m.target); return; }
      if (m.target && m.target._comboIn) comboAllinea(m.target);   // voci del <select> riscritte
      m.addedNodes.forEach(n => { if (n.nodeType === 1) comboScansiona(n); });
    });
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
  comboScansiona(document.body);
  // La lista segue il campo; se il campo esce di scena, si chiude.
  window.addEventListener('scroll', e => {
    if (!_combo || (e.target && e.target.id === 'combo-list')) return;
    if (!document.body.contains(_combo.inp)) comboChiudi(false); else comboPosiziona();
  }, true);
  window.addEventListener('resize', () => { if (_combo) comboPosiziona(); });
}
