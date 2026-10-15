// ═══════════════════════════════════════════════════════════
//  BOMTRACK — cloud.js (archivio condiviso su Supabase, dalla 0.103.0)
// ═══════════════════════════════════════════════════════════
// Il pezzo che mancava al piano di docs/cloud-schema.md: lo schema, le due
// funzioni di sincronizzazione e i permessi stanno in supabase/schema.sql,
// la traduzione delle righe in cloud-map.js, il conto delle modifiche in
// store.js. Qui c'è la rete: l'accesso, l'invio, la ricezione.
//
// ── Come lavora ──
// L'archivio locale resta dov'è e resta quello che le viste leggono e
// scrivono, in modo sincrono come sempre: nessuna vista sa che esiste un
// server. Diventa lo **specchio** dell'archivio condiviso e la **coda** di
// quello che non è ancora partito.
//  - Ogni salvataggio riuscito programma un invio (Store.dopoCommit), con un
//    attimo di attesa per raccogliere i salvataggi ravvicinati in un lotto.
//    Un lotto di Store.takeChanges() è **una** chiamata a push_changes(), mai
//    spezzata: è una transazione, ed è ciò che tiene insieme una dichiarazione
//    di produzione e i movimenti che genera.
//  - Ogni 25 secondi, al ritorno sulla finestra e al ritorno della rete si
//    chiede al server che cosa è cambiato (pull_changes). Si applica solo
//    quando non c'è niente in sospeso e nessuno sta scrivendo in una scheda o
//    in un campo: un ridisegno in mezzo a un ordine a metà perderebbe il
//    lavoro. Si riprova al giro dopo.
//  - Senza rete si lavora come prima. Le modifiche aspettano, e la fotografia
//    dell'ultimo invio riuscito è salvata: anche chiudendo la finestra non si
//    perdono, e partono al prossimo avvio.
//
// ── Niente librerie ──
// supabase-js non serve: l'app usa quattro indirizzi di Auth e tre funzioni
// RPC, e fetch() basta. Una libreria in meno da tenere in vendor/, e niente
// che cambi sotto i piedi.
//
// ── Le chiavi ──
// L'indirizzo del progetto e la chiave **pubblica** (anon) stanno su ogni PC,
// in localStorage, inseriti dall'amministratore o arrivati con il link di
// collegamento. Non sono un segreto — Supabase le pensa per stare nel browser,
// e a proteggere i dati sono le policy — ma non stanno nel codice: il codice è
// lo stesso per tutti, il progetto no. La chiave di servizio non passa mai di qui.

const CLOUD_KEY = 'bomtrack_cloud';                 // { url, chiave, allineato, since, soglia }
const CLOUD_SESS_KEY = 'bomtrack_cloud_sessione';   // la sessione di Supabase Auth
const CLOUD_BASE_KEY = 'bomtrack_cloud_base';       // la fotografia dell'ultimo invio riuscito
const CLOUD_GIRO_MS = 25000;
const CLOUD_ATTESA_MS = 1500;
// Il pull riparte da un po' prima dell'ultimo: una transazione lunga può
// scrivere un synced_at più vecchio di un pull già fatto (schema.sql).
const CLOUD_MARGINE_MS = 5000;
// Le righe figlie già note si mandano solo se cambiate dall'ultimo invio. Il
// margine copre gli orologi dei PC che non vanno d'accordo al secondo.
const CLOUD_MARGINE_FIGLI_MS = 120000;

function cloudLeggi(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
function cloudScrivi(k, v) {
  try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); return true; }
  catch (e) { return false; }
}
function cloudConfig() { const c = cloudLeggi(CLOUD_KEY); return c && c.url && c.chiave ? c : null; }
function cloudAttivo() { return !!cloudConfig(); }
function cloudAggiornaConfig(campi) { const c = cloudConfig(); if (c) cloudScrivi(CLOUD_KEY, Object.assign(c, campi)); }
// Indirizzo pulito: niente barra finale, niente percorso dopo il dominio.
function cloudNormalizzaUrl(u) {
  let s = String(u || '').trim();
  if (s && !/^https?:\/\//i.test(s)) s = 'https://' + s;
  try { const x = new URL(s); return x.origin; } catch (e) { return ''; }
}

// Il modo condiviso si decide **prima** che l'archivio venga caricato
// (store.js, modoCondiviso): accende le date sulle righe figlie e i
// ricevimenti come eventi.
if (typeof Store !== 'undefined' && cloudAttivo()) Store.modoCondiviso = true;

// ═══════════════════════════════════════════════════════════
//  Rete
// ═══════════════════════════════════════════════════════════
// Un errore che sa dire che cosa è successo: `rete` (non si arriva al
// server), `accesso` (la sessione non vale più), `permesso` (il ruolo non
// scrive), `server` (il server ha rifiutato, con il suo messaggio).
function cloudErrore(tipo, messaggio, extra) {
  const e = new Error(messaggio);
  e.cloud = tipo;
  return Object.assign(e, extra || {});
}
async function cloudHttp(percorso, opz) {
  const c = cloudConfig();
  if (!c) throw cloudErrore('config', 'Archivio condiviso non configurato');
  const o = opz || {};
  const headers = { apikey: c.chiave, 'Content-Type': 'application/json' };
  if (o.token) headers.Authorization = 'Bearer ' + o.token;
  let r;
  try {
    r = await fetch(c.url + percorso, { method: o.metodo || 'POST', headers, body: o.corpo === undefined ? undefined : JSON.stringify(o.corpo) });
  } catch (e) {
    throw cloudErrore('rete', 'Server non raggiungibile');
  }
  const testo = await r.text();
  let dati = null;
  try { dati = testo ? JSON.parse(testo) : null; } catch (e) { dati = testo; }
  if (!r.ok) {
    const msg = (dati && (dati.error_description || dati.msg || dati.message || dati.error)) || ('HTTP ' + r.status);
    // PGRST202: la funzione chiamata non c'è. Succede quando sul progetto è
    // stato eseguito uno schema.sql più vecchio dell'app.
    if (dati && dati.code === 'PGRST202') throw cloudErrore('server', 'Lo schema del progetto Supabase non è aggiornato: riesegui supabase/schema.sql di questa versione nel SQL Editor', { stato: r.status });
    if (r.status === 401) throw cloudErrore('accesso', msg, { stato: r.status });
    if (r.status === 403 || (dati && dati.code === '42501')) throw cloudErrore('permesso', msg, { stato: r.status });
    throw cloudErrore('server', msg, { stato: r.status });
  }
  return dati;
}

// ── Sessione di Supabase Auth ──
function cloudSessione() { return cloudLeggi(CLOUD_SESS_KEY); }
function cloudSalvaSessione(s) {
  if (!s || !s.access_token) { cloudScrivi(CLOUD_SESS_KEY, null); return null; }
  const x = {
    access_token: s.access_token, refresh_token: s.refresh_token,
    expires_at: s.expires_at || (Math.floor(Date.now() / 1000) + (Number(s.expires_in) || 3600)),
    user: s.user ? { id: s.user.id, email: s.user.email } : null,
  };
  cloudScrivi(CLOUD_SESS_KEY, x);
  return x;
}
async function cloudAccediConPassword(email, password) {
  const s = await cloudHttp('/auth/v1/token?grant_type=password', { corpo: { email, password } });
  return cloudSalvaSessione(s);
}
// Un rinnovo alla volta: due chiamate che rinnovano insieme consumerebbero lo
// stesso refresh token, e la seconda verrebbe rifiutata.
let _cloudRinnovo = null;
function cloudRinnova() {
  if (_cloudRinnovo) return _cloudRinnovo;
  const s = cloudSessione();
  if (!s || !s.refresh_token) return Promise.reject(cloudErrore('accesso', 'Sessione assente'));
  _cloudRinnovo = cloudHttp('/auth/v1/token?grant_type=refresh_token', { corpo: { refresh_token: s.refresh_token } })
    .then(n => cloudSalvaSessione(Object.assign({ user: s.user }, n)))
    .catch(e => {
      // Rifiutato dal server: la sessione è finita davvero. Senza rete invece
      // resta, e si riprova al prossimo giro.
      if (e.cloud !== 'rete') { cloudScrivi(CLOUD_SESS_KEY, null); throw cloudErrore('accesso', 'Sessione scaduta: accedi di nuovo'); }
      throw e;
    })
    .finally(() => { _cloudRinnovo = null; });
  return _cloudRinnovo;
}
async function cloudToken() {
  let s = cloudSessione();
  if (!s) throw cloudErrore('accesso', 'Accesso richiesto');
  if (!s.expires_at || s.expires_at * 1000 - 60000 < Date.now()) s = await cloudRinnova();
  return s.access_token;
}
// Una chiamata come l'utente. Un 401 a token appena controllato vuol dire
// che il server lo considera scaduto: si rinnova una volta e si riprova.
async function cloudRpc(fn, argomenti) {
  const chiama = async () => cloudHttp('/rest/v1/rpc/' + fn, { token: await cloudToken(), corpo: argomenti || {} });
  try { return await chiama(); }
  catch (e) {
    if (e.cloud !== 'accesso' || !cloudSessione()) throw e;
    await cloudRinnova();
    return chiama();
  }
}
async function cloudAggiornaPassword(password) {
  return cloudHttp('/auth/v1/user', { metodo: 'PUT', token: await cloudToken(), corpo: { password } });
}
// Il link dell'email torna al «Site URL» del progetto: è lì che va messo il
// link di collegamento (cloudPannello). Un redirect_to esplicito dovrebbe
// stare anche nell'elenco degli indirizzi ammessi, e sarebbe un posto in più
// da tenere allineato.
async function cloudRecuperaPassword(email) {
  return cloudHttp('/auth/v1/recover', { corpo: { email } });
}
async function cloudEsci() {
  const s = cloudSessione();
  cloudScrivi(CLOUD_SESS_KEY, null);
  if (s && s.access_token) { try { await cloudHttp('/auth/v1/logout', { token: s.access_token }); } catch (e) { /* la sessione locale è già andata */ } }
}

// ═══════════════════════════════════════════════════════════
//  Invio
// ═══════════════════════════════════════════════════════════
// Il lotto di Store.takeChanges() nella forma di push_changes(). Funzione pura
// rispetto alla rete: si prova senza server.
//  - le radici portano `pos`, la loro posizione nella collezione **intera**
//    (dbVersoCloud la calcolerebbe sul solo lotto);
//  - le righe figlie «per riga» di un padre già noto al server viaggiano solo
//    se cambiate dall'ultimo invio (`soglia`): mandarle tutte farebbe
//    risultare respinte, come un conflitto, righe che un collega ha cambiato
//    e che qui nessuno ha toccato. Un padre nuovo le manda tutte;
//  - le figlie «sostituite» (distinta, ciclo, lavorazioni) viaggiano intere:
//    è la regola del server;
//  - le impostazioni le scrive solo chi ha la gestione: altrimenti il server
//    rifiuterebbe l'intero lotto. Restano su questo PC, e lo si dice.
function cloudPayload(changes, soglia, puoImpostazioni) {
  const upsert = {}, remove = {};
  let impostazioniTenute = false;
  const aggiungi = (dove, t, righe) => { if (righe.length) dove[t] = (dove[t] || []).concat(righe); };
  Object.keys(changes || {}).forEach(c => {
    if (c === 'settings') return;
    const def = SCHEMA[c]; if (!def) return;
    const ch = changes[c];
    const figli = def.children || {};
    const recs = (ch.upsert || []).map(id => Store.getById(c, id)).filter(Boolean);
    if (recs.length) {
      const posizioni = new Map((Store.getAll(c) || []).map((r, i) => [r.id, i]));
      const righe = dbVersoCloud({ [c]: recs });
      Object.keys(righe).forEach(t => {
        let r = righe[t];
        if (t === def.table) r.forEach(x => { x.pos = posizioni.get(x.id); });
        else {
          const k = Object.keys(figli).find(a => figli[a].table === t);
          if (k && figli[k].merge === 'row') {
            const colPadre = (CLOUD_TABLES[t] && CLOUD_TABLES[t].parent) || 'parent_id';
            r = r.filter(x => !Store.inBase(c, x[colPadre]) || !x.updated_at || !soglia || x.updated_at >= soglia);
          }
        }
        aggiungi(upsert, t, r);
      });
    }
    aggiungi(remove, def.table, ch.remove || []);
    Object.keys(ch.removeChildren || {}).forEach(k => { if (figli[k]) aggiungi(remove, figli[k].table, ch.removeChildren[k]); });
  });
  const payload = {};
  if (Object.keys(upsert).length) payload.upsert = upsert;
  if (Object.keys(remove).length) payload.remove = remove;
  if (changes && changes.settings) {
    if (puoImpostazioni) {
      payload.settings = { data: Store.getSettings(), updated_at: nowISO(), updated_by: Store.getActor() };
    } else impostazioniTenute = true;
  }
  return { payload, impostazioniTenute };
}
function cloudPayloadVuoto(p) { return !p.upsert && !p.remove && !p.settings; }

// ── La fotografia salvata ──
function cloudSalvaBase() {
  const b = Store.baseSalvabile();
  if (!cloudScrivi(CLOUD_BASE_KEY, b)) {
    // Senza spazio la fotografia non si salva: al prossimo avvio si manda
    // tutto (il server tiene la versione più recente di ogni riga), ma le
    // cancellazioni fatte offline andrebbero perse. Si dice.
    _cloud.baseNonSalvata = true;
  } else _cloud.baseNonSalvata = false;
}

// ═══════════════════════════════════════════════════════════
//  Ricezione
// ═══════════════════════════════════════════════════════════
// Le righe di pull_changes() dentro l'archivio locale. Funzione pura su `d`
// (il db), si prova senza server. Restituisce quante cose sono cambiate.
//
// Le radici arrivano intere e sostituiscono il record locale, tenendone gli
// array figli: quelli arrivano dalle loro tabelle. Le figlie «sostituite»
// arrivano sempre con il padre e sempre tutte: l'insieme si rifà. Quelle «per
// riga» arrivano solo se cambiate: si fondono per id, al loro posto.
// Le lapidi tolgono i record e le righe. Le impostazioni si sostituiscono.
function cloudApplica(d, risposta) {
  const loc = righeLocali((risposta && risposta.tables) || {});
  let n = 0;
  const lineeRicevute = new Set((loc.order_receipts || []).map(r => r.lineId).filter(Boolean));
  Object.keys(SCHEMA).forEach(c => {
    const def = SCHEMA[c];
    const figli = def.children || {};
    if (!Array.isArray(d[c])) d[c] = [];
    const arr = d[c];
    const indice = new Map(arr.map((x, i) => [x && x.id, i]));
    ordinaPerPos(loc[def.table] || []).forEach(riga => {
      const rec = Object.assign({}, riga);
      delete rec.pos; delete rec.childSets;
      const dichiarati = riga.childSets != null ? String(riga.childSets).split(',').filter(Boolean) : null;
      const i = indice.get(rec.id);
      const vecchio = i != null ? arr[i] : null;
      Object.keys(figli).forEach(k => {
        const presente = dichiarati ? dichiarati.includes(k) : !!(vecchio && Array.isArray(vecchio[k]));
        if (!presente) return;
        rec[k] = figli[k].merge === 'replace' ? [] : ((vecchio && Array.isArray(vecchio[k])) ? vecchio[k] : []);
      });
      if (i != null) arr[i] = rec; else { indice.set(rec.id, arr.length); arr.push(rec); }
      n++;
    });
    Object.keys(figli).forEach(k => {
      const cdef = figli[k];
      ordinaPerPos(loc[cdef.table] || []).forEach(rr => {
        const i = indice.get(rr.parentId);
        const padre = i != null ? arr[i] : null;
        if (!padre) return;   // padre cancellato, o non ancora arrivato: lo porterà il suo giro
        const x = Object.assign({}, rr);
        delete x.parentId; delete x.pos;
        if (!cdef.rowId) delete x.id;
        if (!Array.isArray(padre[k])) padre[k] = [];
        if (cdef.merge === 'replace') padre[k].push(x);
        else {
          const j = padre[k].findIndex(y => y && y[cdef.rowId] === x[cdef.rowId]);
          if (j >= 0) padre[k][j] = x;
          else padre[k].splice(Math.min(Number.isFinite(rr.pos) ? rr.pos : Infinity, padre[k].length), 0, x);
        }
        n++;
      });
    });
  });
  // Il ricevuto di una riga è la somma dei suoi eventi: se ne arrivano di
  // nuovi, il numero che la riga porta in locale non vale più.
  if (lineeRicevute.size) {
    ['orders', 'workOrders'].forEach(c => (d[c] || []).forEach(o => (o && o.lines || []).forEach(l => {
      if (l && lineeRicevute.has(l.id)) delete l.received;
    })));
  }
  const tolti = (risposta && risposta.removed) || {};
  Object.keys(tolti).forEach(t => {
    const ids = new Set((tolti[t] || []).map(String));
    if (!ids.size) return;
    Object.keys(SCHEMA).forEach(c => {
      const def = SCHEMA[c];
      if (def.table === t) {
        const prima = (d[c] || []).length;
        d[c] = (d[c] || []).filter(r => !(r && ids.has(String(r.id))));
        n += prima - d[c].length;
      }
      const figli = def.children || {};
      Object.keys(figli).forEach(k => {
        if (figli[k].table !== t || !figli[k].rowId) return;
        (d[c] || []).forEach(r => {
          if (!r || !Array.isArray(r[k])) return;
          const prima = r[k].length;
          r[k] = r[k].filter(x => !(x && ids.has(String(x[figli[k].rowId]))));
          n += prima - r[k].length;
        });
      });
    });
  });
  if (risposta && risposta.settings && risposta.settings.data && typeof risposta.settings.data === 'object') {
    d.settings = risposta.settings.data;
    n++;
  }
  return n;
}

// ═══════════════════════════════════════════════════════════
//  Il giro
// ═══════════════════════════════════════════════════════════
const _cloud = {
  inCorso: false, ancora: false, timer: null, intervallo: null,
  stato: 'spento',        // spento · ok · invio · attesa · offline · errore · accesso
  messaggio: '', ultimo: null, respinti: [], baseNonSalvata: false, impostazioniAvvisate: false,
};
function cloudPronto() {
  const c = cloudConfig();
  return !!(c && c.allineato && cloudSessione() && typeof currentUser !== 'undefined' && currentUser);
}
// Si può ridisegnare la vista adesso? No se una scheda è aperta, se un
// documento ha modifiche non salvate, o se il cursore sta in un campo.
function cloudPuoApplicare() {
  if (typeof document === 'undefined') return true;
  if (typeof panelTop === 'function' && panelTop()) return false;
  if ((typeof rfqDirty !== 'undefined' && rfqDirty) || (typeof orderDirty !== 'undefined' && orderDirty)) return false;
  const a = document.activeElement;
  if (a && a.closest && a.closest('#app-main') && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return false;
  return true;
}
function cloudProgramma(ms) {
  if (!cloudPronto() || _cloud.applicando) return;
  clearTimeout(_cloud.timer);
  _cloud.timer = setTimeout(() => cloudGiro(), ms == null ? CLOUD_ATTESA_MS : ms);
}
async function cloudGiro() {
  if (!cloudPronto()) return false;
  if (_cloud.inCorso) { _cloud.ancora = true; return false; }
  _cloud.inCorso = true;
  try {
    await cloudInvia();
    if (!Store.hasPendingChanges()) await cloudRicevi();
    _cloud.ultimo = new Date();
    cloudSegna(Store.hasPendingChanges() ? 'attesa' : 'ok');
    return true;
  } catch (e) {
    cloudGestisciErrore(e);
    return false;
  } finally {
    _cloud.inCorso = false;
    if (_cloud.ancora) { _cloud.ancora = false; cloudProgramma(0); }
  }
}
async function cloudInvia() {
  let preso = Store.takeChanges();
  if (!preso.changes) {
    // Fotografia sconosciuta (un ripristino, un archivio sostituito): il
    // server non ha visto niente di questo stato, si manda tutto.
    Store.ripristinaBase({});
    preso = Store.takeChanges();
  }
  const { changes, mark } = preso;
  if (!Object.keys(changes || {}).length) return;
  const c = cloudConfig();
  const { payload, impostazioniTenute } = cloudPayload(changes, c.soglia || null, canWrite('manage'));
  const sogliaNuova = new Date(Date.now() - CLOUD_MARGINE_FIGLI_MS).toISOString();
  if (impostazioniTenute && !_cloud.impostazioniAvvisate) {
    _cloud.impostazioniAvvisate = true;
    showToast("Le impostazioni condivise le cambia solo l'amministratore: questa modifica resta su questo PC", 'error');
  }
  if (!cloudPayloadVuoto(payload)) {
    cloudSegna('invio');
    const r = await cloudRpc('push_changes', { payload });
    if (r && Array.isArray(r.rejected) && r.rejected.length) cloudAvvisaRespinti(r.rejected);
  }
  Store.markSynced(mark);
  cloudAggiornaConfig({ soglia: sogliaNuova });
  cloudSalvaBase();
}
async function cloudRicevi() {
  const c = cloudConfig();
  const since = c.since ? new Date(Date.parse(c.since) - CLOUD_MARGINE_MS).toISOString() : null;
  const r = await cloudRpc('pull_changes', { since });
  // Fra la domanda e la risposta qualcuno può aver cominciato a scrivere: si
  // applica al giro dopo, ripartendo dallo stesso punto.
  if (Store.hasPendingChanges() || !cloudPuoApplicare()) return 0;
  let n = 0;
  _cloud.applicando = true;
  try { Store.applicaRemoto(d => { n = cloudApplica(d, r); }); }
  finally { _cloud.applicando = false; }
  cloudAggiornaConfig({ since: r.now });
  cloudSalvaBase();
  if (n) cloudDopoArrivo();
  return n;
}
// Arrivato qualcosa: l'utente di sessione può essere cambiato (ruolo,
// sospensione) e la vista va ridisegnata.
function cloudDopoArrivo() {
  if (typeof currentUser === 'undefined' || !currentUser) return;
  const u = getUser(currentUser.id);
  if (!u || u.active === false) {
    showToast('Il tuo accesso è stato sospeso da un amministratore', 'error');
    cloudLogout();
    return;
  }
  currentUser = u;
  if (typeof renderUserPill === 'function') renderUserPill();
  // Si ridisegna la vista com'è: stessa riga scelta nel pannello laterale,
  // stesso punto della pagina. Chi sta guardando un elenco vede i numeri
  // cambiare, non la pagina che salta.
  if (typeof activeView !== 'undefined' && activeView && typeof setView === 'function') {
    const scelta = typeof inspSel !== 'undefined' ? inspSel : null;
    const y = typeof window !== 'undefined' ? window.scrollY : 0;
    setView(activeView);
    if (scelta && scelta.view === activeView && typeof inspectorSync === 'function') { inspSel = scelta; inspectorSync(); }
    if (y && typeof window.scrollTo === 'function') window.scrollTo(0, y);
  }
}
function cloudAvvisaRespinti(respinti) {
  _cloud.respinti = respinti;
  const n = respinti.length;
  showToast(n === 1
    ? 'Una modifica non è entrata: un collega aveva salvato una versione più recente, che ora vedi qui'
    : `${n} modifiche non sono entrate: un collega aveva salvato versioni più recenti, che ora vedi qui`, 'error');
}
function cloudGestisciErrore(e) {
  if (e && e.cloud === 'rete') { cloudSegna('offline', 'Senza rete: le modifiche partono al ritorno'); return; }
  if (e && e.cloud === 'accesso') {
    cloudSegna('accesso', 'Sessione scaduta');
    showToast('Sessione dell\'archivio condiviso scaduta: accedi di nuovo', 'error');
    cloudLogout();
    return;
  }
  console.error('Archivio condiviso:', e);
  cloudSegna('errore', (e && e.message) || String(e));
}

// ── L'indicatore nell'intestazione ──
const CLOUD_STATI = {
  ok: 'Sincronizzato', invio: 'Invio…', attesa: 'Da inviare', offline: 'Senza rete',
  errore: 'Errore di sincronizzazione', accesso: 'Accesso scaduto', spento: '',
};
function cloudSegna(stato, messaggio) {
  _cloud.stato = stato;
  _cloud.messaggio = messaggio || '';
  cloudDisegnaStato();
}
function cloudDisegnaStato() {
  if (typeof document === 'undefined') return;
  const el = document.getElementById('cloud-stato');
  if (!el) return;
  if (!cloudAttivo() || _cloud.stato === 'spento') { el.style.display = 'none'; return; }
  el.style.display = '';
  el.className = 'cloud-stato cs-' + _cloud.stato;
  const ora = _cloud.ultimo ? _cloud.ultimo.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '';
  const testo = CLOUD_STATI[_cloud.stato] || '';
  el.innerHTML = `${ico('cloud', 'tinted', '')}<span class="cs-testo">${esc(testo)}</span>`;
  el.title = [testo + (_cloud.stato === 'ok' && ora ? ' alle ' + ora : ''), _cloud.messaggio].filter(Boolean).join(' — ');
  el.setAttribute('aria-label', 'Archivio condiviso: ' + el.title);
}

// ── Avvio e arresto ──
// Dopo Store.load(): rimette la fotografia salvata, così le modifiche rimaste
// in coda alla chiusura risultano ancora da mandare.
function cloudAvvio() {
  const c = cloudConfig();
  if (!c) return;
  if (c.allineato) Store.ripristinaBase(cloudLeggi(CLOUD_BASE_KEY) || {});
  Store.dopoCommit = () => cloudProgramma();
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function' && !_cloud.ascolta) {
    _cloud.ascolta = true;
    window.addEventListener('online', () => cloudProgramma(0));
    window.addEventListener('focus', () => cloudProgramma(0));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') cloudProgramma(0); });
  }
}
function cloudParti() {
  clearInterval(_cloud.intervallo);
  _cloud.intervallo = setInterval(() => cloudGiro(), CLOUD_GIRO_MS);
  cloudSegna(Store.hasPendingChanges() ? 'attesa' : 'ok');
  cloudProgramma(0);
}
function cloudFerma() {
  clearInterval(_cloud.intervallo); _cloud.intervallo = null;
  clearTimeout(_cloud.timer); _cloud.timer = null;
  cloudSegna('spento');
}
// Uscita dall'app per una sessione finita: i dati locali restano, la coda
// anche — partirà al prossimo accesso.
function cloudLogout() {
  cloudFerma();
  cloudEsci();
  if (typeof logout === 'function') logout(true);
}

// ═══════════════════════════════════════════════════════════
//  Accesso
// ═══════════════════════════════════════════════════════════
// Dalla schermata d'accesso. Il primo collegamento di un PC (archivio non
// ancora allineato) passa dalla scelta fra caricare e scaricare.
async function cloudLogin(email, password) {
  await cloudAccediConPassword(email, password);
  return cloudDopoAccesso();
}
async function cloudDopoAccesso() {
  const st = await cloudRpc('archivio_stato', {});
  const p = st && st.profilo;
  if (!p) { await cloudEsci(); throw cloudErrore('server', 'Il tuo utente non ha un profilo: chiedi all\'amministratore di rieseguire lo schema'); }
  if (p.active === false) { await cloudEsci(); throw cloudErrore('permesso', 'Il tuo accesso non è ancora attivo: chiedi a un amministratore di attivarti in Gestione → Utenti'); }
  // La sessione arrivata da un invito non sa chi è: lo dice il profilo.
  const s = cloudSessione();
  if (s && !s.user) cloudSalvaSessione(Object.assign({}, s, { user: { id: p.id, email: p.email } }));
  const c = cloudConfig();
  if (!c.allineato) return { primo: true, stato: st };
  // Già allineato: si scarica quello che è cambiato e si entra.
  if (!getUser(p.id)) await cloudRiceviForzato();
  return { primo: false, stato: st };
}
// Un pull applicato comunque (all'accesso nessuno sta scrivendo).
async function cloudRiceviForzato() {
  const c = cloudConfig();
  const since = c.since ? new Date(Date.parse(c.since) - CLOUD_MARGINE_MS).toISOString() : null;
  const r = await cloudRpc('pull_changes', { since });
  if (Store.hasPendingChanges()) await cloudInvia();
  Store.applicaRemoto(d => { cloudApplica(d, r); });
  cloudAggiornaConfig({ since: r.now });
  cloudSalvaBase();
}
// Entrare nell'app con il profilo del server.
function cloudEntra(id) {
  const u = getUser(id);
  if (!u) throw cloudErrore('server', 'Profilo non trovato nell\'archivio');
  if (u.active === false) throw cloudErrore('permesso', 'Il tuo accesso è sospeso');
  doLogin(u, false);
  cloudParti();
}

// ═══════════════════════════════════════════════════════════
//  Primo collegamento: caricare o scaricare
// ═══════════════════════════════════════════════════════════
// Carica l'archivio di questo PC nel server vuoto. Gli utenti locali
// diventano i profili di Supabase con la stessa email (invitati prima, o
// creati a mano): l'id cambia — è quello di Supabase Auth — e con lui ogni
// campo di audit (remapIds). Chi non ha un utente su Supabase resta fuori:
// i record che ha creato restano, con il suo vecchio riferimento.
async function cloudCaricaArchivio(stato) {
  const io = stato.profilo;
  if (io.role !== 'admin') throw cloudErrore('permesso', 'Il primo caricamento lo fa un amministratore');
  // Un caricamento interrotto a metà (la rete, una finestra chiusa) lascia il
  // server non più vuoto: chi lo aveva cominciato lo può riprendere. Gli
  // invii sono idempotenti, le righe già arrivate tornano uguali.
  const ripresa = !!(cloudConfig() || {}).caricamento;
  if (!stato.vuoto && !ripresa) throw cloudErrore('server', 'L\'archivio condiviso contiene già dei dati: scaricalo invece di caricare');
  cloudAggiornaConfig({ caricamento: true });
  const iniziale = await cloudRpc('pull_changes', { since: null });
  const profili = righeLocali({ profiles: (iniziale.tables && iniziale.tables.profiles) || [] }).profiles;
  const perEmail = new Map(profili.filter(p => p.email).map(p => [String(p.email).toLowerCase(), p]));
  const mappa = {}, fuori = [];
  const utenti = (Store.getAll('users') || []).slice();
  utenti.forEach(u => {
    const p = perEmail.get(String(u.email || '').toLowerCase());
    if (p) mappa[u.id] = p.id; else fuori.push(u);
  });
  const ioLocale = utenti.find(u => mappa[u.id] === io.id);
  Store.applicaRemoto(d => {
    remapIds({ user: mappa });
    d.users = (d.users || []).filter(u => Object.values(mappa).includes(u.id));
    // Chi carica entra comunque, da amministratore: se in locale non c'era
    // (o aveva un'altra email) lo si aggiunge dal suo profilo.
    if (!ioLocale) d.users.push(stampNew({ id: io.id, name: io.name || io.email, username: '', email: io.email, role: 'admin', color: '#3A7BE8', active: true }));
    else { const me = d.users.find(u => u.id === io.id); me.role = 'admin'; me.active = true; }
    // Più recenti del profilo che il trigger ha creato all'invito.
    d.users.forEach(u => { delete u.passwordHash; delete u.passwordSalt; touch(u); });
  });
  Store.ripristinaBase({});
  const { changes, mark } = Store.takeChanges();
  const { payload } = cloudPayload(changes, null, true);
  // A gruppi, nell'ordine delle dipendenze: un archivio di qualche anno può
  // pesare megabyte, e un invio solo rischia il limite della richiesta. Ogni
  // gruppo cita solo sé stesso e quelli prima.
  const GRUPPI = [
    ['profiles', 'suppliers', 'customers', 'families', 'sub_families', 'work_centers', 'work_center_suppliers', 'jobs'],
    ['items', 'item_components', 'item_operations', 'item_cycle_rows', 'item_prices',
      'rfqs', 'rfq_lines', 'production_plans', 'production_plan_lines'],   // i listini citano le richieste d'offerta
  ];
  const usati = new Set();
  const invii = GRUPPI.map(g => g.filter(t => payload.upsert && payload.upsert[t]).map(t => (usati.add(t), t)))
    .map(ts => ({ upsert: Object.fromEntries(ts.map(t => [t, payload.upsert[t]])) }));
  const resto = Object.keys(payload.upsert || {}).filter(t => !usati.has(t));
  invii.push({ upsert: Object.fromEntries(resto.map(t => [t, payload.upsert[t]])), settings: payload.settings });
  for (const p of invii) {
    if (!Object.keys(p.upsert).length && !p.settings) continue;
    if (!p.settings) delete p.settings;
    await cloudRpc('push_changes', { payload: p });
  }
  Store.markSynced(mark);
  const dopo = await cloudRpc('archivio_stato', {});
  cloudAggiornaConfig({ allineato: true, caricamento: false, since: dopo.ora, soglia: new Date(Date.now() - CLOUD_MARGINE_FIGLI_MS).toISOString() });
  cloudSalvaBase();
  return { fuori };
}
// Sostituisce l'archivio di questo PC con quello condiviso.
async function cloudScaricaArchivio() {
  const r = await cloudRpc('pull_changes', { since: null });
  const settings = (r.settings && r.settings.data) || {};
  const nuovo = dbDaCloud(r.tables || {}, { settings, schemaVersion: SCHEMA_VERSION });
  Store.sostituisciDaRemoto(nuovo);
  cloudAggiornaConfig({ allineato: true, since: r.now, soglia: new Date(Date.now() - CLOUD_MARGINE_FIGLI_MS).toISOString() });
  cloudSalvaBase();
}

// ═══════════════════════════════════════════════════════════
//  Collegare e scollegare questo PC
// ═══════════════════════════════════════════════════════════
// Il link di collegamento porta indirizzo e chiave pubblica: chi lo apre si
// ritrova l'app già puntata al progetto. È anche l'indirizzo da mettere come
// «Site URL» in Supabase, così gli inviti e i recuperi password tornano qui.
function cloudLinkCollegamento(c) {
  if (!c || typeof location === 'undefined') return '';
  const base = location.origin && location.origin !== 'null' ? location.origin + location.pathname : location.href.split(/[?#]/)[0];
  return base + '?supabase=' + encodeURIComponent(c.url) + '&chiave=' + encodeURIComponent(c.chiave);
}
function cloudCollega(url, chiave) {
  const u = cloudNormalizzaUrl(url);
  if (!u) throw cloudErrore('config', 'Indirizzo del progetto non valido');
  if (!String(chiave || '').trim()) throw cloudErrore('config', 'Manca la chiave pubblica');
  cloudScrivi(CLOUD_KEY, { url: u, chiave: String(chiave).trim(), allineato: false, since: null, soglia: null });
  cloudScrivi(CLOUD_SESS_KEY, null);
  cloudScrivi(CLOUD_BASE_KEY, null);
}
async function cloudProva(url, chiave) {
  const u = cloudNormalizzaUrl(url);
  if (!u) throw cloudErrore('config', 'Indirizzo del progetto non valido');
  let r;
  try { r = await fetch(u + '/auth/v1/settings', { headers: { apikey: String(chiave || '').trim() } }); }
  catch (e) { throw cloudErrore('rete', 'Server non raggiungibile: controlla l\'indirizzo'); }
  if (r.status === 401 || r.status === 403) throw cloudErrore('config', 'Chiave rifiutata dal progetto');
  if (!r.ok) throw cloudErrore('server', 'Il progetto risponde con un errore (HTTP ' + r.status + ')');
  return true;
}
function cloudScollega() {
  cloudFerma();
  cloudEsci();
  cloudScrivi(CLOUD_KEY, null);
  cloudScrivi(CLOUD_BASE_KEY, null);
}

// ═══════════════════════════════════════════════════════════
//  Interfaccia
// ═══════════════════════════════════════════════════════════
function cloudMsgErrore(e) { return (e && e.message) || String(e); }

// Ripristinare un backup, rimettere i dati d'esempio, azzerare: in locale
// toccano un PC, con l'archivio condiviso toccherebbero tutti — l'archivio
// sostituito risulterebbe da mandare per intero. Si scollega prima.
function cloudBlocca(ev) {
  if (!cloudAttivo()) return false;
  if (ev && ev.target) ev.target.value = '';
  showToast('Con l\'archivio condiviso questa operazione toccherebbe tutti i colleghi: scollega prima questo PC (Gestione → Backup → Archivio condiviso)', 'error');
  return true;
}

// La scheda dell'archivio condiviso: dall'intestazione, da Gestione e dalla
// schermata d'accesso (per collegare un PC prima di entrare).
function cloudPannello() {
  const c = cloudConfig();
  const dentro = typeof currentUser !== 'undefined' && !!currentUser;
  const admin = dentro && canWrite('manage');
  if (!c) {
    if (dentro && !admin) { showToast('Il collegamento all\'archivio condiviso lo configura un amministratore', 'error'); return; }
    openModal(`<h3>${ico('cloud', 'tinted pill', '')} Collega l'archivio condiviso</h3>
      <p>Inserisci i dati del progetto Supabase: li trovi nel pannello di Supabase, in <strong>Project Settings → API</strong>. La chiave è quella <strong>pubblica</strong> (<em>anon</em> o <em>publishable</em>), mai quella di servizio.</p>
      <div class="modal-field"><label>Indirizzo del progetto</label><input id="cl-url" placeholder="https://xxxx.supabase.co" autocomplete="off"></div>
      <div class="modal-field"><label>Chiave pubblica</label><input id="cl-chiave" placeholder="eyJ… oppure sb_publishable_…" autocomplete="off"></div>
      <p class="cl-esito" id="cl-esito"></p>
      <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
        <button class="btn-outline" onclick="cloudPannelloProva()">Prova</button>
        <button class="add-btn-sm" onclick="cloudPannelloCollega()">Collega questo PC</button></div>`);
    return;
  }
  const s = cloudSessione();
  const da = Store.hasPendingChanges() ? 'Ci sono modifiche non ancora inviate.' : 'Niente in attesa di invio.';
  const link = cloudLinkCollegamento(c);
  openModal(`<h3>${ico('cloud', 'tinted pill', '')} Archivio condiviso</h3>
    <p><strong>Progetto</strong>: ${esc(c.url)}<br>
      <strong>Accesso</strong>: ${esc((s && s.user && s.user.email) || 'nessuno')}<br>
      <strong>Stato</strong>: ${esc(CLOUD_STATI[_cloud.stato] || 'non attivo')}${_cloud.ultimo ? ' · ultimo giro alle ' + esc(_cloud.ultimo.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })) : ''}<br>
      ${esc(da)}${_cloud.messaggio ? '<br><span class="cl-err">' + esc(_cloud.messaggio) + '</span>' : ''}
      ${_cloud.baseNonSalvata ? '<br><span class="cl-err">Spazio esaurito su questo PC: le cancellazioni fatte senza rete potrebbero non partire.</span>' : ''}</p>
    ${admin ? `<div class="modal-field"><label>Link di collegamento per i colleghi</label>
      <div style="display:flex;gap:6px"><input id="cl-link" readonly value="${esc(link)}" style="flex:1">
      <button class="btn-outline" onclick="cloudCopiaLink()">${ico('copy', 'tinted', '')} Copia</button></div></div>
      <p class="cl-nota">Mettilo anche in Supabase come <strong>Site URL</strong> (Authentication → URL Configuration): gli inviti e il recupero password riportano qui.</p>` : ''}
    <div class="modal-actions">
      ${dentro ? `<button class="btn-outline" onclick="cloudPannelloRiscarica()">Scarta e riscarica</button>` : ''}
      <button class="btn-outline" style="color:var(--red);border-color:var(--red)" onclick="cloudPannelloScollega()">Scollega questo PC</button>
      ${dentro ? `<button class="add-btn-sm" onclick="cloudPannelloSincronizza()">${ico('refresh', 'tinted', '')} Sincronizza ora</button>` : `<button class="add-btn-sm" onclick="closeModal()">Chiudi</button>`}
    </div>`);
}
function cloudEsito(msg, errore) {
  const el = document.getElementById('cl-esito');
  if (el) { el.textContent = msg; el.className = 'cl-esito' + (errore ? ' cl-err' : ' cl-ok'); }
}
async function cloudPannelloProva() {
  cloudEsito('Prova in corso…');
  try { await cloudProva(val('cl-url'), val('cl-chiave')); cloudEsito('Il progetto risponde: puoi collegare questo PC.'); }
  catch (e) { cloudEsito(cloudMsgErrore(e), true); }
}
async function cloudPannelloCollega() {
  try {
    await cloudProva(val('cl-url'), val('cl-chiave'));
    cloudCollega(val('cl-url'), val('cl-chiave'));
  } catch (e) { cloudEsito(cloudMsgErrore(e), true); return; }
  // Il modo condiviso si accende al caricamento dell'archivio: si riparte.
  location.reload();
}
function cloudCopiaLink() {
  const el = document.getElementById('cl-link'); if (!el) return;
  el.select();
  const fatto = () => showToast('Link copiato');
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(el.value).then(fatto, () => { document.execCommand('copy'); fatto(); });
  else { document.execCommand('copy'); fatto(); }
}
async function cloudPannelloSincronizza() {
  closeModal();
  const ok = await cloudGiro();
  if (ok) showToast(Store.hasPendingChanges() ? 'Restano modifiche da inviare' : 'Archivio sincronizzato');
  else if (_cloud.stato === 'errore') showToast(_cloud.messaggio || 'Errore di sincronizzazione', 'error');
}
function cloudPannelloRiscarica() {
  askConfirm('Riscaricare l\'archivio condiviso? Le modifiche di questo PC non ancora inviate vanno perse. Serve quando il server rifiuta un invio e non c\'è altro modo di uscirne.', async () => {
    try {
      cloudFerma();
      await cloudScaricaArchivio();
      cloudEntra(currentUser.id);
      showToast('Archivio riscaricato');
    } catch (e) { cloudGestisciErrore(e); showToast(cloudMsgErrore(e), 'error'); }
  });
}
function cloudPannelloScollega() {
  askConfirm('Scollegare questo PC dall\'archivio condiviso? I dati restano qui, ma da adesso sono una copia locale: le modifiche non arrivano più ai colleghi e quelle dei colleghi non arrivano qui.', () => {
    cloudScollega();
    location.reload();
  });
}

// ── Il primo collegamento, dopo l'accesso ──
function cloudConteggio(d) {
  return ['items', 'suppliers', 'orders', 'rfqs'].reduce((n, c) => n + ((d && d[c]) || []).length, 0);
}
function cloudPrimoCollegamento(stato) {
  const p = stato.profilo;
  const localeHa = cloudConteggio(db) > 0;
  // Un caricamento rimasto a metà si riprende: per questo PC il server è
  // ancora «da riempire».
  const st = Object.assign({}, stato, { vuoto: stato.vuoto || (p.role === 'admin' && !!(cloudConfig() || {}).caricamento) });
  if (st.vuoto && p.role !== 'admin') {
    return _loginError('L\'archivio condiviso è ancora vuoto: il primo caricamento lo fa un amministratore.');
  }
  const corpo = st.vuoto
    ? `<p>L'archivio condiviso è <strong>vuoto</strong>. Puoi caricarci l'archivio di questo PC: diventerà quello di tutti.</p>
       <p>Gli utenti passano se hanno su Supabase un utente con la <strong>stessa email</strong> (invitali prima, se vuoi che arrivino già con il loro ruolo). Chi non ce l'ha resta fuori, e si invita dopo. Le password non passano: ognuno usa quella di Supabase.</p>
       <p>Prima conviene esportare un backup.</p>`
    : `<p>L'archivio condiviso contiene già dei dati. Questo PC lo <strong>scarica</strong> e da adesso lavora su quello.</p>
       ${localeHa ? '<p><strong>I dati che ci sono adesso su questo PC vengono sostituiti.</strong> Se contengono lavoro che non è nell\'archivio condiviso, esporta prima un backup.</p>' : ''}`;
  openModal(`<h3>${ico('cloud', 'tinted pill', '')} Primo collegamento</h3>${corpo}
    <p class="cl-esito" id="cl-esito"></p>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="cloudPrimoAnnulla()">Annulla</button>
      ${localeHa && p.role === 'admin' ? `<button class="btn-outline" onclick="cloudPrimoBackup()">${ico('download', 'tinted', '')} Esporta backup</button>` : ''}
      <button class="add-btn-sm" id="cl-primo-ok" onclick="cloudPrimoProcedi(${st.vuoto ? 'true' : 'false'})">${st.vuoto ? 'Carica questo archivio' : 'Scarica l\'archivio condiviso'}</button>
    </div>`);
  _cloud.statoPrimo = st;
}
// Il backup prima di entrare: exportBackup() chiede un amministratore di
// sessione, e qui non c'è ancora nessuno. Lo si fa direttamente.
function cloudPrimoBackup() {
  const blob = new Blob([Store.exportSnapshot()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `bomtrack_backup_${oggiISO()}.json`;
  a.click(); URL.revokeObjectURL(a.href);
  showToast('Backup esportato');
}
function cloudPrimoAnnulla() { closeModal(); cloudEsci(); }
async function cloudPrimoProcedi(carica) {
  const st = _cloud.statoPrimo;
  const btn = document.getElementById('cl-primo-ok');
  if (btn) btn.disabled = true;
  cloudEsito(carica ? 'Caricamento in corso…' : 'Scaricamento in corso…');
  try {
    let fuori = [];
    if (carica) fuori = (await cloudCaricaArchivio(st)).fuori;
    else await cloudScaricaArchivio();
    closeModal();
    cloudEntra(st.profilo.id);
    if (fuori.length) showToast(`Caricato. Restano fuori ${fuori.length} utenti senza account Supabase: ${fuori.map(u => u.name).join(', ')}`, 'error');
    else showToast(carica ? 'Archivio caricato: da adesso è condiviso' : 'Archivio scaricato');
  } catch (e) {
    if (btn) btn.disabled = false;
    cloudEsito(cloudMsgErrore(e), true);
  }
}

// ── Inviti e recupero password ──
// Il link dell'email di Supabase torna all'app con la sessione nel frammento
// (#access_token=…&type=invite|recovery). La si prende, si pulisce
// l'indirizzo e si chiede la password nuova.
function cloudDaIndirizzo() {
  if (typeof location === 'undefined') return null;
  const q = new URLSearchParams(location.search || '');
  const h = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
  const out = {};
  if (q.get('supabase') && q.get('chiave')) out.config = { url: q.get('supabase'), chiave: q.get('chiave') };
  if (h.get('access_token')) out.sessione = {
    access_token: h.get('access_token'), refresh_token: h.get('refresh_token'),
    expires_at: Number(h.get('expires_at')) || null, expires_in: Number(h.get('expires_in')) || 3600, tipo: h.get('type') || '',
  };
  if (h.get('error_description')) out.errore = h.get('error_description');
  return (out.config || out.sessione || out.errore) ? out : null;
}
function cloudPulisciIndirizzo() {
  try { history.replaceState(null, '', location.pathname); } catch (e) { /* resta com'è */ }
}
// Chiamata da init(), prima della sessione: true se ha preso in mano lei la
// schermata d'accesso.
function cloudAllAvvio() {
  const x = cloudDaIndirizzo();
  if (!x) return false;
  cloudPulisciIndirizzo();
  if (x.errore) { setTimeout(() => _loginError('Link non valido o scaduto: ' + x.errore), 60); }
  if (x.config) {
    const c = cloudConfig();
    const stesso = c && c.url === cloudNormalizzaUrl(x.config.url) && c.chiave === x.config.chiave;
    if (!stesso) {
      // Un link può puntare l'app a un server qualsiasi: si chiede prima, e si
      // mostra a quale. Chi lo conferma deve riconoscere il proprio progetto.
      const host = (() => { try { return new URL(cloudNormalizzaUrl(x.config.url)).host; } catch (e) { return x.config.url; } })();
      setTimeout(() => askConfirm(`Collegare questo PC all'archivio condiviso su ${host}?` +
        (cloudConteggio(db) ? ' I dati che ci sono ora su questo PC verranno sostituiti al primo accesso, se l\'archivio condiviso ne contiene già.' : ''), () => {
        try { cloudCollega(x.config.url, x.config.chiave); } catch (e) { showToast(cloudMsgErrore(e), 'error'); return; }
        if (x.sessione) cloudSalvaSessione(Object.assign({}, x.sessione, { user: null }));
        if (x.sessione) cloudScrivi('bomtrack_cloud_nuovapassword', x.sessione.tipo || 'invite');
        location.reload();
      }, { title: 'Archivio condiviso', ok: 'Collega', safe: true }), 60);
      return true;
    }
  }
  if (x.sessione && cloudAttivo()) {
    cloudSalvaSessione(x.sessione);
    setTimeout(() => cloudNuovaPassword(x.sessione.tipo), 60);
    return true;
  }
  return false;
}
// Dopo un invito o un recupero: si sceglie la password, poi si entra.
function cloudNuovaPassword(tipo) {
  cloudScrivi('bomtrack_cloud_nuovapassword', null);
  openModal(`<h3>${ico('key', 'tinted pill', '')} ${tipo === 'recovery' ? 'Nuova password' : 'Benvenuto: scegli la tua password'}</h3>
    <div class="modal-field"><label>Password</label><input type="password" id="cl-pw1" autocomplete="new-password"></div>
    <div class="modal-field"><label>Ripeti la password</label><input type="password" id="cl-pw2" autocomplete="new-password"></div>
    <p class="cl-esito" id="cl-esito"></p>
    <div class="modal-actions"><button class="add-btn-sm" onclick="cloudSalvaNuovaPassword()">Salva ed entra</button></div>`);
}
async function cloudSalvaNuovaPassword() {
  const a = document.getElementById('cl-pw1').value, b = document.getElementById('cl-pw2').value;
  if (a.length < 8) return cloudEsito('Almeno 8 caratteri', true);
  if (a !== b) return cloudEsito('Le due password non coincidono', true);
  try {
    await cloudAggiornaPassword(a);
    closeModal();
    await cloudLoginCompleta();
  } catch (e) { cloudEsito(cloudMsgErrore(e), true); }
}
// Dopo che la sessione c'è: o il primo collegamento, o si entra.
async function cloudLoginCompleta() {
  const esito = await cloudDopoAccesso();
  if (esito.primo) cloudPrimoCollegamento(esito.stato);
  else cloudEntra(esito.stato.profilo.id);
}
// Il ritorno con una sessione salvata: si entra dallo specchio locale anche
// senza rete, e il giro allinea appena può.
function cloudRipristinaSessione() {
  const c = cloudConfig(), s = cloudSessione();
  if (!c || !s) return false;
  const nuova = cloudLeggi('bomtrack_cloud_nuovapassword');
  if (nuova) { renderLogin(); setTimeout(() => cloudNuovaPassword(nuova), 60); return true; }
  if (!c.allineato || !s.user) { renderLogin(); setTimeout(() => cloudLoginCompleta().catch(e => _loginError(cloudMsgErrore(e))), 60); return true; }
  const u = getUser(s.user.id);
  if (!u || u.active === false) return false;
  doLogin(u, false);
  cloudParti();
  return true;
}
