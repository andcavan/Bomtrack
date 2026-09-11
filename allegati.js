// ═══════════════════════════════════════════════════════════
//  BOMTRACK — allegati.js
// ═══════════════════════════════════════════════════════════
// Disegni, schede tecniche e fotografie appesi a un articolo.
// Classic script, scope globale condiviso con gli altri: nessun modulo e
// nessun build, così index.html continua ad aprirsi con un doppio click.
//
// ── Perché non in localStorage ──
// Un solo disegno in PDF pesa più di tutto il database messo insieme.
// `localStorage` dà qualche megabyte in tutto — l'app già avvisa a quota 4 su
// ~5 (`dbSizeLine`) — e ci si può tenere del testo, non dei file. Metterceli
// dentro non avrebbe fatto crescere il database: lo avrebbe fatto **smettere di
// salvare**, e con esso tutto il resto del lavoro.
//
// ── La divisione ──
// I **byte** stanno in IndexedDB, che è fatta per questo e non ha quel limite.
// I **dati** dell'allegato — nome, tipo, dimensione, a quale articolo appartiene,
// chi l'ha messo e quando — restano in `db.attachments` come ogni altra
// collezione: passano da `Store`, finiscono nel backup JSON, si vedono negli
// elenchi, e il giorno del cloud seguono la strada di tutti gli altri.
//
// Il prezzo di questa divisione va detto, ed è scritto anche in Gestione e nel
// README: **il backup JSON non contiene i file**. Porta l'elenco di quali erano,
// così chi lo ripristina su un altro PC vede che cosa manca invece di scoprirlo
// aprendo una scheda vuota. Copiare i file veri è un gesto a sé, e per ora si fa
// riscaricandoli prima di trasferirsi.
//
// ── Sincrono contro asincrono ──
// Tutta l'app è sincrona: si legge `db`, si disegna, si salva. IndexedDB no.
// Il confine sta qui dentro e non passa oltre: le funzioni che l'app chiama per
// **disegnare** leggono solo i dati di `db` e restano sincrone; solo prendere o
// depositare i byte è una promessa, e succede su un gesto esplicito — aggiungi,
// scarica, elimina — dove un attimo di attesa è normale e atteso.

const ALLEGATI_DB = 'bomtrack_allegati';
const ALLEGATI_STORE = 'file';
// Oltre questa soglia si rifiuta. Non è un limite tecnico di IndexedDB — che
// regge molto di più — ma un argine al caso in cui qualcuno appende il video
// della prova di collaudo a un codice articolo: il deposito è sul PC, non c'è
// nessuno che lo sorveglia, e la sorpresa arriverebbe mesi dopo sotto forma di
// disco pieno.
const ALLEGATO_MAX_MB = 25;
// Quello che ha senso appendere a un articolo in officina.
const ALLEGATI_ACCETTATI = '.pdf,.dwg,.dxf,.step,.stp,.igs,.iges,.png,.jpg,.jpeg,.webp,.txt,.csv,.xlsx,.docx';

// ─── Il deposito dei byte ───
// Una tabella sola, con l'id dell'allegato per chiave: l'id lo genera il record
// in `db.attachments`, quindi i due lati si ritrovano senza una mappa in mezzo.
let _allegatiDb = null;
function allegatiDisponibili() {
  return typeof indexedDB !== 'undefined' && !!indexedDB;
}
function allegatiApri() {
  if (_allegatiDb) return Promise.resolve(_allegatiDb);
  if (!allegatiDisponibili()) return Promise.reject(new Error('IndexedDB non disponibile'));
  return new Promise((ok, no) => {
    const req = indexedDB.open(ALLEGATI_DB, 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(ALLEGATI_STORE)) d.createObjectStore(ALLEGATI_STORE);
    };
    req.onsuccess = () => { _allegatiDb = req.result; ok(_allegatiDb); };
    req.onerror = () => no(req.error || new Error('apertura fallita'));
  });
}
function _transazione(modo, fn) {
  return allegatiApri().then(d => new Promise((ok, no) => {
    const tx = d.transaction(ALLEGATI_STORE, modo);
    const req = fn(tx.objectStore(ALLEGATI_STORE));
    req.onsuccess = () => ok(req.result);
    req.onerror = () => no(req.error || new Error('operazione fallita'));
  }));
}
function allegatoScrivi(id, blob) { return _transazione('readwrite', s => s.put(blob, id)); }
function allegatoLeggi(id) { return _transazione('readonly', s => s.get(id)); }
function allegatoCancella(id) { return _transazione('readwrite', s => s.delete(id)); }

// ─── I dati, che stanno in db ───
function allegatiDi(itemId) {
  return (db.attachments || []).filter(a => a.itemId === itemId)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}
function allegatiCount(itemId) { return allegatiDi(itemId).length; }
// Dimensione leggibile. Sotto il mega si scrive in KB: «0,02 MB» non dice niente
// a nessuno.
function pesoFile(bytes) {
  const n = Number(bytes) || 0;
  return n < 1024 * 1024 ? Math.max(1, Math.round(n / 1024)) + ' KB' : (n / 1024 / 1024).toFixed(1) + ' MB';
}

// ─── Aggiungere ───
// Il record nasce **dopo** che i byte sono stati depositati: al contrario si
// avrebbe un allegato in elenco che non si può scaricare, ed è la forma di
// guasto peggiore — visibile, permanente e senza spiegazione.
function allegatoAggiungi(itemId, file) {
  if (!roleGuard('catalog')) return Promise.resolve(null);
  const it = getItem(itemId);
  if (!it || !file) return Promise.resolve(null);
  if (file.size > ALLEGATO_MAX_MB * 1024 * 1024) {
    showToast(`Il file supera ${ALLEGATO_MAX_MB} MB: troppo per stare qui`, 'error');
    return Promise.resolve(null);
  }
  if (!allegatiDisponibili()) {
    showToast('Questo browser non consente di conservare i file allegati', 'error');
    return Promise.resolve(null);
  }
  const id = newId();
  return allegatoScrivi(id, file)
    .then(() => {
      Store.insert('attachments', {
        id, itemId,
        name: String(file.name || 'documento'),
        mime: String(file.type || ''),
        size: Number(file.size) || 0,
      });
      savedToast('Allegato aggiunto');
      return id;
    })
    .catch(e => {
      console.error('Allegato non salvato:', e);
      showToast('Allegato non salvato: spazio esaurito o archivio non disponibile', 'error');
      return null;
    });
}

// ─── Scaricare ───
function allegatoScarica(id) {
  const rec = (db.attachments || []).find(a => a.id === id);
  if (!rec) return;
  allegatoLeggi(id).then(blob => {
    if (!blob) {
      // Il record c'è e il file no: succede se il deposito del browser è stato
      // svuotato (pulizia dei dati dei siti) o se il database è stato importato
      // da un altro PC — il backup JSON i file non li porta, e lo dice.
      showToast('Il file non è su questo computer: il backup JSON non trasporta gli allegati', 'error');
      return;
    }
    // Stessa strada di exportBackup(): un <a download> usa e getta.
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = rec.name;
    a.click(); URL.revokeObjectURL(url);
  }).catch(e => {
    console.error('Allegato non leggibile:', e);
    showToast('Allegato non leggibile', 'error');
  });
}

// ─── Eliminare ───
// Prima il record, poi i byte: l'ordine opposto a quello dell'inserimento, e
// per la stessa ragione. Se la cancellazione dei byte fallisce resta un file
// orfano nel deposito — spazio sprecato, che si recupera con la pulizia in
// Gestione — mentre l'ordine contrario lascerebbe in elenco un allegato che
// non si può più aprire.
function allegatoElimina(id) {
  if (!roleGuard('catalog')) return;
  const rec = (db.attachments || []).find(a => a.id === id);
  if (!rec) return;
  askConfirm(`Eliminare l'allegato "${rec.name}"?`, () => {
    Store.remove('attachments', id);
    allegatoCancella(id).catch(e => console.error('File non rimosso dal deposito:', e));
    savedToast('Allegato eliminato');
    // La scheda si ridisegna, così l'allegato sparisce dall'elenco invece di
    // restarci finché non la si chiude e riapre.
    allegatiRefresh();
  });
}

// ═══════════════════════════════════════════════════════════
//  LA SCHEDA
// ═══════════════════════════════════════════════════════════
// Chiave propria ('allegati'), come il listino: si affianca a ciò che è già
// aperto invece di buttare via un form a metà. E come il listino ricorda su
// quale articolo sta lavorando in una globale, che va spenta alla chiusura.
onPanelClose('allegati', () => { window.__allegatiItemId = null; });
function allegatiModal(id) {
  const it = getItem(id); if (!it) return;
  window.__allegatiItemId = id;
  openModal(`<h3>${ico('folder', 'tinted pill', '')} Allegati — ${esc(it.code)}</h3>
    <p style="color:var(--text-dim);margin-bottom:14px">${esc(it.name)} · ${typeLabel(it.type)}</p>
    <div id="allegati-body">${allegatiBody(id)}</div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Chiudi</button></div>`, true, 'allegati');
}
function allegatiRefresh() {
  const host = document.getElementById('allegati-body');
  if (host && window.__allegatiItemId) host.innerHTML = allegatiBody(window.__allegatiItemId);
}
function allegatiBody(id) {
  const lista = allegatiDi(id);
  const puoScrivere = canWrite('catalog');
  const righe = lista.map(a => `<div class="mgmt-item">
    <span class="mgmt-item-name">${ico('file', 'tinted', '')}
      <button class="code-link" title="Scarica" onclick="allegatoScarica('${a.id}')">${esc(a.name)}</button></span>
    <span class="mgmt-item-meta">${esc(pesoFile(a.size))}${a.createdAt ? ' · ' + esc(fmtDateIt(a.createdAt)) : ''}${a.createdBy ? ' · ' + esc(actorName(a.createdBy)) : ''}
      ${puoScrivere ? `<button class="mini-btn danger" title="Elimina l'allegato" onclick="allegatoElimina('${a.id}')">${ico('trash', 'tinted', 'Elimina')}</button>` : ''}</span>
  </div>`).join('');
  // L'input sta nascosto e lo apre il pulsante: un <input type=file> nudo non
  // somiglia a nessun altro controllo dell'app.
  const aggiungi = puoScrivere
    ? `<div style="margin-top:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <input type="file" id="allegato-file" style="display:none" accept="${ALLEGATI_ACCETTATI}" onchange="allegatoScelto(event)">
        <button class="add-btn-sm" onclick="document.getElementById('allegato-file').click()">+ Aggiungi allegato</button>
        <span class="empty-text" style="padding:0">Disegni, schede tecniche, foto — fino a ${ALLEGATO_MAX_MB} MB l'uno.</span>
      </div>`
    : '';
  const elenco = righe
    ? `<div class="mgmt-list">${righe}</div>`
    : '<div class="empty-text" style="text-align:left;padding:0">Nessun allegato.</div>';
  return elenco + aggiungi
    + `<p class="empty-text" style="text-align:left;padding:10px 0 0">I file stanno su <strong>questo computer</strong>, fuori dal database: il backup JSON ne porta l'elenco, non il contenuto. Prima di trasferire i dati su un altro PC, riscaricali.</p>`;
}
// Il file scelto dalla finestra di sistema. Si svuota l'input subito dopo:
// senza, riscegliere lo stesso file non scatenerebbe un secondo `change`.
function allegatoScelto(ev) {
  const file = ev && ev.target && ev.target.files && ev.target.files[0];
  const id = window.__allegatiItemId;
  if (ev && ev.target) ev.target.value = '';
  if (!id || !file) return;
  allegatoAggiungi(id, file).then(() => allegatiRefresh());
}

// ─── I file rimasti senza un record ───
// Il cestino conserva il record per TRASH_DAYS giorni, quindi un allegato
// eliminato si può rimettere a posto — e per questo i byte non si buttano
// subito. Restano però i casi veri di scarto: un articolo cancellato, un
// database importato da un altro PC, un ripristino. Questa funzione dice quanto
// spazio occupano i file che non appartengono più a nessuno.
function allegatiOrfani() {
  if (!allegatiDisponibili()) return Promise.resolve([]);
  const vivi = new Set((db.attachments || []).map(a => a.id));
  (db.trash || []).forEach(t => { if (t.coll === 'attachments' && t.record) vivi.add(t.record.id); });
  return _transazione('readonly', s => s.getAllKeys())
    .then(chiavi => (chiavi || []).filter(k => !vivi.has(k)))
    .catch(() => []);
}
function allegatiPulisci() {
  if (!roleGuard('manage')) return;
  allegatiOrfani().then(orfani => {
    if (!orfani.length) { showToast('Nessun file da recuperare'); return; }
    askConfirm(`Eliminare ${orfani.length} file che non appartengono più a nessun articolo?`, () => {
      Promise.all(orfani.map(k => allegatoCancella(k)))
        .then(() => { savedToast(`${orfani.length} file rimossi`); renderManage(); })
        .catch(() => showToast('Pulizia non riuscita', 'error'));
    });
  });
}
