// ═══════════════════════════════════════════════════════════
//  BOMTRACK — cloud-map.js
// ═══════════════════════════════════════════════════════════
// Traduzione fra la forma locale (un documento annidato per collezione) e la
// forma normalizzata del database condiviso (una riga per tabella).
// Funzioni pure: nessun DOM, nessuna rete, nessun accesso a `db`. Si ricevono i
// dati e si restituiscono dati — è ciò che le rende verificabili per intero
// senza un backend, ed è il pezzo con più probabilità di bug silenziosi.
//
// Classic script, scope globale condiviso con gli altri: nessun modulo e
// nessun build, così index.html continua ad aprirsi con un doppio click.
//
// ── Perché serve `pos` ──
// Gli array JSON sono ordinati, le righe di una tabella no. Senza una colonna
// di posizione, l'ordine dei componenti di una distinta e delle righe di un
// ordine si rimescolerebbe a ogni lettura dal server. Su una richiesta di
// offerta stampata in PDF è un difetto che si vede subito; in una distinta è
// peggio, perché non si vede.
//
// ── Perché serve un id anche dove non c'era ──
// `components`, `operations` e le righe di ciclo non hanno un id proprio: in
// locale la loro identità è la posizione nell'array. Una tabella ha bisogno di
// una chiave primaria, e viene costruita qui in modo deterministico
// (`itemId#nomeArray#posizione`): stesso dato, stessa chiave, a ogni giro. Non
// è un'identità stabile nel tempo — spostare una riga ne cambia la chiave — e
// non pretende di esserlo: quelle tre tabelle si sincronizzano sostituendo
// l'insieme intero (`merge: 'replace'` nel registro dello schema), proprio
// perché un'identità di riga lì non esiste.

// ── Perché serve `childSets` ──
// In una tabella, «nessuna riga» è l'unica rappresentazione possibile del
// vuoto: un array figlio vuoto e un array figlio assente diventano la stessa
// cosa. Sembra una sfumatura e non lo è. Un assieme la cui distinta è stata
// svuotata a mano ha `components: []`; un commerciale non ha `components`
// affatto. Se al ritorno dal server l'assieme si ritrovasse senza il campo,
// `saveNewComponent()` — che fa `it.components.push(...)` — lancerebbe.
// La riga padre porta quindi l'elenco degli array che aveva davvero. È una
// colonna di testo in più, e risparmia di dover indovinare.
const CHILD_KEY_SEP = '#';
function childRowId(parentId, arrayName, pos) {
  return String(parentId) + CHILD_KEY_SEP + arrayName + CHILD_KEY_SEP + pos;
}

// db annidato → { tabella: [righe] }.
// Ogni riga figlia porta la chiave del padre, la posizione e il proprio id.
// `opts.stripSecrets` toglie i campi che non devono lasciare il browser (gli
// hash delle password): il backend ha la propria autenticazione, e un hash
// spedito è un hash in più in giro per niente.
function flattenDB(source, opts) {
  const o = opts || {};
  const out = {};
  const schema = (typeof SCHEMA !== 'undefined') ? SCHEMA : {};
  Object.keys(schema).forEach(coll => {
    const def = schema[coll];
    const figli = def.children || {};
    out[def.table] = [];
    Object.keys(figli).forEach(a => { out[figli[a].table] = []; });

    (source[coll] || []).forEach((rec, i) => {
      if (!rec || rec.id == null) return;
      const riga = {};
      const presenti = [];
      Object.keys(rec).forEach(k => {
        if (figli[k]) { if (Array.isArray(rec[k])) presenti.push(k); return; }   // gli array figli vanno nelle loro tabelle
        if (o.stripSecrets && (def.secret || []).includes(k)) return;
        riga[k] = rec[k];
      });
      // `pos` e `childSets` sono nomi che questa traduzione si prende: servono a
      // nestDB() per rimettere le righe nell'ordine e per sapere quali array
      // ricostruire, e nestDB() poi li toglie. Se un record di dominio arrivasse
      // a portare un campo con uno di questi due nomi, il giro completo —
      // nestDB(flattenDB(x)) === x, che test/cloudmap.test.js verifica — smetterebbe
      // di valere in silenzio. Meglio accorgersene qui che dalle righe sbagliate.
      if (rec.pos !== undefined || rec.childSets !== undefined) {
        throw new Error('flattenDB: il record ' + coll + '/' + rec.id
          + ' usa un nome riservato alla traduzione (pos, childSets)');
      }
      riga.pos = i;
      if (presenti.length) riga.childSets = presenti.join(',');
      out[def.table].push(riga);

      Object.keys(figli).forEach(a => {
        const cdef = figli[a];
        (rec[a] || []).forEach((child, j) => {
          if (!child) return;
          const r = Object.assign({}, child);
          r.parentId = rec.id;
          r.pos = j;
          // Con un id proprio si conserva quello: è l'identità che il merge per
          // riga userà. Senza, se ne costruisce una deterministica.
          if (!(cdef.rowId && r[cdef.rowId] != null)) r.id = childRowId(rec.id, a, j);
          out[cdef.table].push(r);
        });
      });
    });
  });
  return out;
}

// { tabella: [righe] } → db annidato.
// Inverso esatto di flattenDB: `nestDB(flattenDB(x))` deve ridare `x`, ed è la
// proprietà che la suite verifica su tutte le fixture. `pos` decide l'ordine e
// poi sparisce, perché in locale l'ordine è già quello dell'array e tenersi la
// colonna significherebbe due fonti di verità per la stessa cosa.
function nestDB(tables, extra) {
  const out = Object.assign({}, extra || {});
  const schema = (typeof SCHEMA !== 'undefined') ? SCHEMA : {};
  Object.keys(schema).forEach(coll => {
    const def = schema[coll];
    const figli = def.children || {};

    // Righe figlie raggruppate per padre, ordinate per posizione.
    const perPadre = {};
    Object.keys(figli).forEach(a => {
      const cdef = figli[a];
      const gruppi = new Map();
      ordinaPerPos(tables[cdef.table] || []).forEach(r => {
        let l = gruppi.get(r.parentId);
        if (!l) { l = []; gruppi.set(r.parentId, l); }
        const pulita = Object.assign({}, r);
        delete pulita.parentId; delete pulita.pos;
        // L'id costruito da flattenDB non esisteva nel documento locale: si
        // toglie, altrimenti il round-trip aggiungerebbe un campo che prima non
        // c'era e ogni confronto direbbe "cambiato".
        if (!cdef.rowId) delete pulita.id;
        l.push(pulita);
      });
      perPadre[a] = gruppi;
    });

    out[coll] = ordinaPerPos(tables[def.table] || []).map(riga => {
      const rec = Object.assign({}, riga);
      delete rec.pos; delete rec.childSets;
      // Solo gli array che il padre aveva davvero: un articolo commerciale non
      // ha `components`, e inventarglielo vuoto lo farebbe risultare modificato
      // a ogni lettura. `childSets` distingue il vuoto dall'assente; se manca
      // (righe scritte a mano, o da una versione precedente) si ricade sulla
      // presenza di righe figlie, che è l'informazione che resta.
      const dichiarati = riga.childSets != null ? String(riga.childSets).split(',').filter(Boolean) : null;
      Object.keys(figli).forEach(a => {
        const l = perPadre[a].get(riga.id);
        if (dichiarati ? dichiarati.includes(a) : !!l) rec[a] = l || [];
      });
      return rec;
    });
  });
  return out;
}

// Ordinamento stabile per `pos`. Le righe senza posizione (scritte da una
// versione precedente, o da una mano umana) restano nell'ordine in cui sono
// arrivate, in coda: meglio un ordine arbitrario ma ripetibile che uno che
// cambia a ogni lettura.
function ordinaPerPos(righe) {
  return righe.map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const pa = Number.isFinite(a.r.pos) ? a.r.pos : Infinity;
      const pb = Number.isFinite(b.r.pos) ? b.r.pos : Infinity;
      return pa === pb ? a.i - b.i : pa - pb;
    })
    .map(x => x.r);
}

// Le tabelle toccate da un insieme di modifiche (l'esito di Store.pendingChanges()).
// Serve all'adapter per sapere cosa mandare senza rispedire tutto.
//
// Nell'app non la chiama nessuno, e non è una dimenticanza: è il seam del futuro
// adapter cloud, come pendingChanges() e takeChanges(). Sta qui provata e pronta
// perché il giorno in cui il backend arriva non si debba anche inventarla.
function tablesForChanges(changes) {
  const out = [];
  const schema = (typeof SCHEMA !== 'undefined') ? SCHEMA : {};
  Object.keys(changes || {}).forEach(coll => {
    const def = schema[coll];
    if (!def) return;
    out.push(def.table);
    Object.keys(def.children || {}).forEach(a => out.push(def.children[a].table));
  });
  return out;
}
