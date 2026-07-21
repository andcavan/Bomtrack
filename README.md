# Bomtrack — Distinte Base & Costificazione

App per creare e gestire **distinte base (BOM) multi-livello** di macchine meccaniche, ottenere la **costificazione automatica** e gestire il ciclo acquisti (**richieste di offerta** e **ordini a fornitore**).

Costruita con lo stesso stile di TimeTrack: vanilla JavaScript + HTML + CSS, nessun build, tema dark. **Database solo locale** (`localStorage`) — nessun server, nessun Supabase.

## Avvio

Aprire `index.html` in un browser (doppio click, oppure usare l'estensione "Live Server" di VS Code). Al primo avvio vengono caricati dei dati di esempio (macchina "Nastro Trasportatore NT-100").

La revisione in esecuzione è mostrata accanto al logo, in alto a sinistra (es. `v0.6.0`), e corrisponde alla voce in cima al [changelog](#changelog).

## Funzionalità

- **🌳 Distinte base** — albero multi-livello espandibile della macchina selezionata, con costo unitario e di riga per ogni componente, lavorazioni interne e card di riepilogo costi. Aggiunta/modifica/eliminazione di componenti e lavorazioni.
- **📦 Catalogo** — gestione degli articoli riutilizzabili, tipizzati su 6 livelli: **macchina**, **gruppo**, **sottogruppo** (assiemi, con propria distinta e lavorazioni), **parte** (foglia con ciclo di lavorazione), **materia prima** (costo unitario per U.M., es. €/kg) e **componente commerciale** (prezzo d'acquisto da fornitore).
- **💶 Costificazione** — incidenza delle voci di costo e distinta esplosa; **export PDF ed Excel**.
- **📨 Richieste di offerta (RFQ)** — una richiesta per fornitore, righe da catalogo o manuali, documento bilingue IT/EN in PDF ed Excel, compilazione dei prezzi al ritorno dell'offerta e **confronto offerte** tra più richieste.
- **🧾 Ordini a fornitore (ODA)** — generabili da una richiesta o da zero, con prezzi, importi, consegne e **registrazione dei ricevimenti** (ricevuto/residuo per riga).
- **⚙ Gestione** — dati azienda, fornitori, condizioni di offerta (trasporto/pagamento), famiglie articolo, centri di lavoro (tariffe €/h), **unità di misura**, impostazioni globali (spese generali %, margine %, valuta), **import massivo da Excel** e backup JSON (esporta/importa/ripristina).

### Unità di misura

L'elenco delle U.M. selezionabili si gestisce in *Gestione → 📏 Unità di misura* (codice + descrizione, con una **predefinita** ★ proposta per le nuove righe). Le U.M. sono usate ovunque tramite menu a tendina: anagrafica articolo, testata macchina, righe di richieste e ordini.

Rinominare un codice propaga la modifica a tutti gli articoli e documenti che lo usano; un'U.M. in uso non può essere eliminata (il pannello mostra il numero di utilizzi). Le U.M. incontrate nell'import da Excel vengono registrate automaticamente in elenco.

### Stati dei documenti e blocco modifiche

Richieste e ordini hanno uno **stato** che l'app aggiorna da sé quando può dedurlo da un fatto oggettivo, e che protegge il documento dalle modifiche accidentali una volta uscito verso il fornitore.

| Documento | Stato | Cosa resta modificabile |
|---|---|---|
| RFQ | Bozza | tutto |
| RFQ | Inviata / Offerta ricevuta | prezzo unitario e data consegna |
| RFQ | Chiusa | nulla (sola lettura) |
| ODA | Bozza | tutto |
| ODA | Inviato / Confermato / Parziale / Evaso | colonna Ricevuto |
| ODA | Annullato | nulla (sola lettura) |

In **ogni** stato restano sempre modificabili le note del documento, le note di riga e lo stato stesso. Quando serve correggere il resto, il pulsante **🔓 Sblocca per modifica** riapre il documento: lo sblocco vale finché resti dentro e si richiude tornando all'elenco.

Le transizioni automatiche:

- **Bozza → Inviata/Inviato** — alla generazione del PDF o dell'Excel, previa conferma (rifiutando, il file si scarica e lo stato non cambia: le bozze di controllo non sporcano l'archivio).
- **Inviata → Offerta ricevuta** — quando tutte le righe hanno un prezzo; torna indietro se un prezzo viene svuotato.
- **RFQ → Chiusa** — quando da quella richiesta si genera un ordine (solo se era già inviata).
- **Inviato → Confermato** — quando si compila il n° di conferma d'ordine del fornitore.
- **→ Parziale / Evaso** — derivati dai ricevimenti; azzerando i ricevimenti l'ordine torna a Confermato o Inviato. Anche modificare una quantità ricalcola la soglia.

Bozza e Annullato non vengono mai toccati dagli automatismi.

### Codifica automatica degli articoli

Due schemi convivono, scelti in base al tipo di articolo:

- **Codifica gerarchica** (macchina › gruppo › sottogruppo/parte). Ogni macchina ha una **sigla** (es. `TRN`) e definisce il proprio schema: numero e tipo di caratteri della sigla gruppo, cifre del progressivo `S##` e cifre della numerazione `###`. I codici si generano così:

  ```
  Macchina:     TRN-S00        progressivo a salire da 0
  Gruppo:       TRN-BAS-S00    progressivo a salire da 0
  Sottogruppo:  TRN-BAS-999    a SCENDERE da 999
  Parte:        TRN-BAS-001    a SALIRE da 001
  ```

  Nella modale articolo si sceglie la macchina (e il gruppo) di appartenenza e il codice viene proposto automaticamente; sottogruppi e parti sono numerati indipendentemente pur condividendo il prefisso. Le sigle sono validate contro lo schema della macchina e devono essere univoche.

- **Codifica per famiglia** — materie prime e commerciali (`MAT-ACC-LAM-001`, `CMM-MEC-CUS-001`), con prefissi e numero di cifre configurabili in *Gestione → Impostazioni*. Vale anche per le **parti non legate a una macchina**.

Il codice proposto resta modificabile a mano: appena lo si edita, l'app smette di rigenerarlo.

### Import massivo da Excel (Gestione → ⬆ Import)

- **Articoli** — carica un foglio con colonne `Tipo, Codice, Nome, UM, CostoUnitario, PrezzoAcquisto, Fornitore, Macrofamiglia, Sottofamiglia, Note`. Se il codice esiste l'articolo viene **aggiornato**, altrimenti creato (codice auto per materie prime/commerciali). Fornitori e famiglie mancanti vengono creati al volo.
- **Distinte** — carica un foglio padre-figlio (`CodicePadre, CodiceFiglio, Qta, Scarto%`). Gli articoli devono già esistere (importali prima). Per ogni padre i componenti vengono **sostituiti** (reimport idempotente); relazioni non ammesse o cicliche vengono segnalate e saltate.
- Entrambe le sezioni offrono un **template Excel** scaricabile (con foglio "Istruzioni") e un **report di esito** (creati / aggiornati / saltati / errori).

## Modello di costo

Per ogni prodotto il costo è calcolato ricorsivamente (rollup):

```
costo = Σ (componenti × q.tà × (1 + scarto%))    // materiale + commerciali + costo sotto-assiemi
      + Σ (lavorazioni: ore × tariffa €/h)        // manodopera
costo totale = costo + spese generali (overhead %)
prezzo vendita = costo totale × (1 + margine %)
```

Le percentuali di spese generali e margine sono globali (Impostazioni) e sovrascrivibili per singola macchina dalla *Modifica testata*. I riferimenti ciclici nella distinta sono rilevati e impediti.

Gli articoli di tipo **parte** fanno eccezione: se hanno un **ciclo di lavorazione** (righe di materiale/commerciali più righe di lavorazione a costo fisso) il costo unitario è derivato dal ciclo e il campo manuale non viene più usato.

## File

- `index.html` — struttura, navigazione, CDN (jsPDF, SheetJS).
- `store.js` — layer dati: schema, migrazioni versionate, `Store` (API repository) su localStorage.
- `app.js` — motore di costificazione, viste, CRUD, export. La costante `APP_VERSION` in cima è la revisione mostrata nell'header.
- `style.css` — tema dark.
- `docs/cloud-schema.md` — contratto per il futuro backend condiviso (mappatura tabelle, adapter).

## Changelog

Le revisioni seguono il versionamento semantico `0.MINOR.PATCH`: **MINOR** per nuove funzionalità, **PATCH** per correzioni. La versione in cima è quella in `APP_VERSION` (`app.js`) e mostrata nell'header dell'app.

### 0.6.0 — 2026-07-21

**Aggiunto**
- **Unità di misura gestite** — nuovo pannello *Gestione → 📏 Unità di misura* con elenco di codici e descrizioni, U.M. predefinita ★, conteggio degli utilizzi e rinomina propagata ad articoli e documenti. Tutti i campi U.M. dell'app (anagrafica articolo, testata macchina, righe RFQ e ODA) sono passati da testo libero a menu a tendina. Le U.M. già presenti nei dati e quelle incontrate nell'import Excel entrano automaticamente in elenco, così nessun valore storico va perso.
- **Note di riga** in richieste di offerta e ordini, compilabili all'inserimento della riga e stampate sui documenti: nel PDF sotto la descrizione, nell'Excel in una colonna *Nota*. Le note viaggiano dalla richiesta all'ordine generato.
- **Modifica delle righe** già inserite, con il pulsante ✏ su ogni riga: sulle righe manuali si correggono codice, descrizione, U.M., quantità e prezzo; sulle righe da catalogo restano modificabili quantità, prezzo e nota (codice e descrizione seguono l'anagrafica).
- **Stati automatici** per RFQ e ODA e **blocco delle modifiche** sui documenti già inviati, con sblocco a un click — vedi [Stati dei documenti](#stati-dei-documenti-e-blocco-modifiche). Nuovo stato RFQ *Offerta ricevuta*.
- **Badge di stato** colorato nell'elenco e nell'editor di richieste e ordini, e **versione dell'app** nell'header.

**Modificato**
- Il totale dell'ordine, gli importi di riga e il residuo si aggiornano subito alla modifica di quantità, prezzo o ricevuto (prima restavano fermi fino al salvataggio).
- L'eliminazione di una richiesta o di un ordine non in bozza avverte dello stato nel messaggio di conferma, segnalando anche le quantità già ricevute.

### 0.5.0 — 2026-07-21

- **Ordini a fornitore (ODA)** — nuova vista con numerazione progressiva per anno, generazione da una richiesta di offerta, righe con prezzo/importo/consegna, registrazione dei ricevimenti (ricevuto e residuo per riga, "segna tutto ricevuto"), totale imponibile ed export PDF/Excel bilingue.

### 0.4.0 — 2026-07-20

- **Richieste di offerta (RFQ)** — modello a fornitore singolo, righe da catalogo (con filtri per tipo/famiglia/fornitore) o manuali, condizioni di trasporto e pagamento precompilabili, documento bilingue IT/EN in PDF ed Excel, compilazione di prezzi e date al ritorno dell'offerta e **confronto offerte** tra più richieste.
- **Dati azienda** e anagrafica fornitori estesa (indirizzo strutturato, P.IVA, referente, condizioni predefinite), stampati come intestazione sui documenti.

### 0.3.0 — 2026-07-12

- **Codifica gerarchica** macchina › gruppo › sottogruppo/parte, con schema configurabile per singola macchina (lunghezza e tipo della sigla gruppo, cifre dei progressivi).
- *Gestione → Impostazioni*: separazione tra **Costi e margini** e **Codifica automatica articoli**.
- **Catalogo**: filtri famiglia/sottofamiglia dipendenti dal tipo di articolo selezionato.

### 0.2.0 — 2026-07-12

- Estrazione del layer dati in `store.js` (`Store` come API repository) e **migrazione schema v2**: ID UUID al posto degli interi legacy, timestamp `createdAt`/`updatedAt` su ogni record, migrazioni idempotenti.
- Contratto per il futuro backend condiviso documentato in `docs/cloud-schema.md`.

### 0.1.0 — 2026-07-12

- Prima versione: distinte base multi-livello, catalogo articoli, costificazione con rollup ricorsivo, export PDF/Excel, import massivo da Excel, backup JSON. App monolitica su localStorage.

## Note

I dati risiedono nel browser. Per trasferirli su un altro PC usare **Gestione → Backup → Esporta/Importa JSON**.

Il layer dati è già **predisposto al cloud** (schema v2): ID UUID, timestamp `createdAt`/`updatedAt` su ogni record, versioning dello schema con migrazioni idempotenti (i backup vecchi si auto-migrano all'import). Il passo successivo — sincronizzazione condivisa per un piccolo team via Supabase o Cloudflare D1 — si aggancia al solo `Store` di `store.js`; il disegno è in `docs/cloud-schema.md`. Il frontend è statico e pubblicabile così com'è su GitHub Pages / Cloudflare Pages.
