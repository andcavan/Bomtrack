# Bomtrack — Distinte Base & Costificazione

App per creare e gestire **distinte base (BOM) multi-livello** di macchine meccaniche, ottenere la **costificazione automatica** e gestire il ciclo acquisti (**richieste di offerta** e **ordini a fornitore**).

Costruita con lo stesso stile di TimeTrack: vanilla JavaScript + HTML + CSS, nessun build, tema dark. **Database solo locale** (`localStorage`) — nessun server, nessun Supabase.

## Avvio

Aprire `index.html` in un browser (doppio click, oppure usare l'estensione "Live Server" di VS Code). Al primo avvio l'app chiede di creare l'**amministratore** (nome, email, password) e carica dei dati di esempio (macchina "Nastro Trasportatore NT-100"). Agli avvii successivi si entra con email e password; "Ricordami" conserva l'email e la sessione resta aperta fino a **Esci**.

**Non serve la rete**, mai: le librerie di export stanno in `vendor/` dentro la cartella dell'app. Copiando la cartella su un altro PC funziona tutto, PDF ed Excel compresi.

La revisione in esecuzione è mostrata accanto al logo, in alto a sinistra (es. `v0.6.0`), e corrisponde alla voce in cima al [changelog](#changelog).

## Funzionalità

La barra dei comandi ha **cinque gruppi**; le voci del gruppo aperto compaiono su una seconda riga, e ogni gruppo ricorda l'ultima voce usata.

| Gruppo | Voci |
|---|---|
| 📇 **Anagrafica** | Acquisti · Progetto |
| 🔧 **Cicli di lavorazione** | — |
| 🌳 **Distinta base** | Gestione DB · Visualizza DB (costificazione) |
| 📨 **Documenti** | Fabbisogno · Richieste offerta · Ordini |
| ⚙ **Gestione** | — (solo amministratori) |

- **🌳 Distinta base → Gestione DB** — albero multi-livello espandibile della macchina selezionata, con **numerazione di posizione** (1, 1.1, 1.1.1, 1.2, 2…), costo unitario e di riga per ogni componente, lavorazioni interne e card di riepilogo costi. Aggiunta/modifica/eliminazione di componenti e lavorazioni. I sottogruppi possono contenere altri sottogruppi, senza limite di profondità. Una **barra filtri** (testo, livello, macchina di appartenenza) restringe l'elenco delle distinte; la distinta aperta resta sempre raggiungibile anche quando il filtro la escluderebbe.
- **📇 Anagrafica → Acquisti** — anagrafica di ciò che si compra: **materie prime** (costo unitario per U.M., es. €/kg) e **componenti commerciali**, con flag **preferito ★** (e filtro dedicato) e flag **obsoleto ⛔**. Fornitore e prezzo non si scrivono qui: la scheda li mostra in sola lettura e rimanda al **listino fornitori**.
- **📇 Anagrafica → Progetto** — anagrafica di ciò che si costruisce: **macchina**, **gruppo**, **sottogruppo** (assiemi, con propria distinta e lavorazioni) e **parte** (foglia con distinta parte e ciclo di lavorazione, con flag **obsoleto ⛔**). Ogni parte dichiara il proprio **approvvigionamento**: prodotta in casa oppure acquistata da un fornitore.
- **🔧 Cicli di lavorazione** — vista dedicata alle parti: in alto la scelta della parte con i filtri per famiglia, sottofamiglia e testo; sotto la **distinta parte** (materie prime e commerciali necessari) e il **ciclo di lavorazione** (fasi 10, 20, 30… riordinabili con ↑ ↓). In testa una riga dice da dove viene il costo di quella parte, secondo il suo approvvigionamento. Ogni modifica si salva subito.
- **🌳 Distinta base → Visualizza DB** — costificazione: incidenza delle voci di costo e distinta esplosa; **export PDF ed Excel**.
- **📨 Documenti → Fabbisogno materiali** — piani di produzione salvati (3 × macchina A, 2 × macchina B): le distinte si esplodono e si sommano in una **lista d'acquisto consolidata**, raggruppabile per fornitore, più l'elenco delle **parti da fabbricare**. Da qui si **generano richieste di offerta e ordini**, un documento per fornitore, scegliendo quali righe includere. Il **fabbisogno netto** toglie quello che è già a magazzino, quello già ordinato e quello **impegnato dagli altri piani aperti**, così due piani non si dichiarano coperti con la stessa merce; un piano che non serve più si **chiude** (🔓) e la sua quota torna libera. Export Excel e PDF.
- **💶 Listino fornitori** — l'unico posto dove nasce un prezzo d'acquisto. Più quotazioni per articolo (fornitore, codice e descrizione presso il fornitore, prezzo, q.tà minima, giorni di consegna, data), alimentate anche dai prezzi tornati con le richieste di offerta. Vale per commerciali, materie prime **e parti**. Il prezzo che entra nella costificazione si sceglie esplicitamente dal listino.
- **🔗 Dove è usato** — da ogni articolo si risale a chi lo contiene e alle macchine impattate, con **simulazione del costo**: si prova un prezzo diverso e si vede subito l'effetto sul costo delle macchine, senza salvare nulla.
- **📨 Richieste di offerta (RFQ)** — una richiesta per fornitore, righe da catalogo o manuali, documento bilingue IT/EN in PDF ed Excel, compilazione dei prezzi al ritorno dell'offerta e **confronto offerte** tra più richieste.
- **🧾 Ordini a fornitore (ODA)** — generabili da una richiesta, da un piano di fabbisogno o da zero, con prezzi, importi, consegne e **registrazione dei ricevimenti** (ricevuto/residuo per riga).
- Gli elenchi di richieste e ordini si filtrano per **stato**, **fornitore** e **testo** (numero, oggetto, fornitore, note e righe del documento).
- **🔎 Scheda articolo di sola lettura** — un click su un **codice**, in qualunque tabella, apre la scheda completa: anagrafica, listino, costo, magazzino (esistente, impegnato, libero), composizione, dove è usato, documenti e piani in cui compare, revisioni. Non modifica niente, e per questo si può aprire in mezzo a qualunque lavoro; dentro la scheda i codici sono a loro volta cliccabili, con il tasto ← Indietro.
- **🔎 Ricerca globale (Ctrl+K)** — un campo solo per articoli, richieste, ordini e piani: si scrive un codice o un numero e si salta dove serve, senza passare dalla vista giusta e dai suoi filtri.
- **🖨 Stampa della vista aperta (Ctrl+P)** — distinta, costificazione, fabbisogno, richiesta o ordine escono su carta ripuliti di navigazione, filtri e pulsanti, con intestazione, data e autore.
- **Autore delle modifiche** — in fondo a schede articolo, richieste, ordini e piani si legge chi ha creato il record e chi l'ha aggiornato per ultimo, con data e ora.
- **Schede mobili** — le finestre di dialogo non bloccano più la pagina: si spostano trascinandole per il titolo, si ridimensionano dall'angolo e si chiudono con ✕ o Esc. Dietro si continua a navigare, e listino, *Dove è usato* e un form possono restare aperti insieme.
- Le anagrafiche mostrano **200 articoli per volta** (*Mostra altri* / *Mostra tutti* in fondo all'elenco): i cataloghi grandi restano scorrevoli.
- **🔒 Note interne** su richieste e ordini: restano nell'app, non compaiono mai su PDF ed Excel. Passano dalla richiesta all'ordine generato e sono modificabili in qualunque stato del documento.
- **⚙ Gestione** — dati azienda, fornitori, condizioni di offerta (trasporto/pagamento), famiglie articolo, **concetti** (nomenclatura delle parti), centri di lavoro (tariffe €/h), **unità di misura**, impostazioni globali (spese generali %, margine %, valuta, approvvigionamento parte), **import massivo da Excel** e backup JSON (esporta/importa/ripristina/**azzera tutto**).

### Utenti e ruoli

Ogni persona ha un utente (*Gestione → 👥 Utenti*, riservata agli amministratori) con nome, email, ruolo, colore e stato attivo/sospeso. I ruoli limitano la **scrittura**: tutti vedono tutto.

| Ruolo | Articoli | Distinte | Richieste e ordini | Gestione |
|---|:--:|:--:|:--:|:--:|
| Amministratore | ✔ | ✔ | ✔ | ✔ |
| Ufficio acquisti | — | — | ✔ | — |
| Progettazione | ✔ | ✔ | — | — |
| Lettore | — | — | — | — |

Nelle sezioni non scrivibili compare un banner di sola lettura e i pulsanti di creazione ed eliminazione spariscono; ogni tentativo di modifica viene comunque fermato con un messaggio. La voce *Gestione* — e con essa il backup — è visibile ai soli amministratori. Deve restare **almeno un amministratore attivo**: l'app impedisce di declassare, sospendere o eliminare l'ultimo, e di agire su se stessi.

> ⚠️ **Questa non è sicurezza.** Finché i dati stanno nel browser (`localStorage`), chiunque apra gli strumenti di sviluppo può leggere il database, cambiarsi ruolo o saltare l'accesso: le password sono conservate come hash SHA-256 con salt, ma il controllo resta tutto lato client. Serve a separare le responsabilità tra colleghi che si fidano e a preparare il terreno. La protezione vera arriverà con **Supabase Auth + RLS**, dove i permessi vivranno sul server (vedi [docs/cloud-schema.md](docs/cloud-schema.md)).
>
> Di conseguenza: il **backup JSON contiene gli utenti** con i loro hash — trattalo come un file riservato.

Ogni record salva `createdBy`/`updatedBy` con l'utente che l'ha creato e modificato per ultimo: i campi non sono ancora mostrati nell'interfaccia, esistono per arrivare pronti al cloud.

### Unità di misura

L'elenco delle U.M. selezionabili si gestisce in *Gestione → 📏 Unità di misura* (codice + descrizione, con una **predefinita** ★ proposta per le nuove righe). Le U.M. sono usate ovunque tramite menu a tendina: anagrafica articolo, testata macchina, righe di richieste e ordini.

Rinominare un codice propaga la modifica a tutti gli articoli e documenti che lo usano; un'U.M. in uso non può essere eliminata (il pannello mostra il numero di utilizzi). Le U.M. incontrate nell'import da Excel vengono registrate automaticamente in elenco.

### Concetti (nome delle parti)

Il nome di una **parte** non è testo libero: si compone di un **concetto** (l'oggetto — es. `ALBERO`, `FLANGIA`, `STAFFA`, sempre in **maiuscolo**) scelto dall'elenco gestito in *Gestione → 🏷 Concetti*, seguito da una **descrizione libera**. Così `ALBERO` + `motore 20×100` diventa il nome `ALBERO motore 20×100`. Il concetto è **obbligatorio** in creazione e modifica di una parte; gli altri tipi di articolo mantengono il campo Nome libero.

Il nome composto resta salvato nel campo nome dell'articolo ed è quello mostrato ovunque (cataloghi, distinte, costificazione, PDF/Excel). Un concetto **in uso non può essere rinominato né eliminato** (il pannello mostra il conteggio delle parti che lo usano), così i nomi già composti non cambiano da soli. Le parti importate o create prima della funzione conservano il nome esistente come descrizione libera, completabile scegliendo il concetto in modifica.

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

In **ogni** stato restano sempre modificabili le note del documento, le note interne, le note di riga e lo stato stesso. Quando serve correggere il resto, il pulsante **🔓 Sblocca per modifica** riapre il documento: lo sblocco vale finché resti dentro e si richiude tornando all'elenco.

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

### Import ed export Excel (Gestione → ⬆ Import)

Quattro sezioni. In tutte l'**export è anche il template** — si esporta, si modifica, si ricarica — e ogni file porta con sé un foglio **Istruzioni**.

- **🛒 Articoli — Acquisti**: fogli `Commerciali`, `Materie prime`, `Listino`.
- **🏗 Articoli — Progetto**: fogli `Macchine`, `Gruppi`, `Sottogruppi`, `Parti`, `Listino`. **Il tipo è il foglio**: niente colonna `Tipo` da sbagliare, e ogni foglio ha solo le colonne che valgono per quel tipo. I fogli si applicano **in ordine**, così un gruppo può puntare a una macchina definita nello stesso file: si caricano sigle, appartenenze e schema di codifica gerarchica. **La distinta base non è in questi file.**
- Il **Codice** è la chiave: se esiste l'articolo viene **aggiornato**, se è vuoto viene **generato**. Fornitori e famiglie mancanti si creano al volo; i **concetti no** (finiscono dentro il nome della parte, e un refuso resterebbe per sempre). Fornitore e prezzo creano una **quotazione nel listino** dell'articolo e diventano il prezzo in uso: anche da Excel, un prezzo nasce dove nascono tutti gli altri.
- **🔍 Verifica** fa l'import per intero, mostra il report e poi **annulla tutto**: gli errori si leggono prima di scrivere, e dal report si procede con «Importa davvero».
- Ogni file ha un foglio **Liste** con tutti i valori ammessi (unità, fornitori, coppie famiglia/sottofamiglia, macchine e gruppi con i loro codici, concetti). Non sono menu a tendina — la libreria Excel dell'app non sa scriverli — ma sono elenchi pronti per `Dati → Convalida → Elenco`, e sono il posto a cui rimandano i messaggi d'errore.
- **🌳 Distinte** — carica un foglio padre-figlio (`CodicePadre, CodiceFiglio, Qta, Scarto%`). Gli articoli devono già esistere (importali prima). Per ogni padre i componenti vengono **sostituiti** (reimport idempotente); relazioni non ammesse o cicliche vengono segnalate e saltate.
- **⚙ Impostazioni di Gestione** — tutto ciò che si configura in Gestione, un foglio per scheda: `Azienda, Utenti, Fornitori, Condizioni offerta, Famiglie commerciali, Famiglie materie prime, Famiglie parti, Concetti, Centri di lavoro, Unità di misura, Impostazioni`. Le **password non sono nel file**.
- L'import è sempre **additivo**: aggiorna ciò che riconosce, crea ciò che manca, **non cancella niente**. Un foglio assente viene saltato, una colonna assente lascia il campo com'è, una colonna presente ma vuota lo svuota. Il **report di esito** conta creati / aggiornati / invariati **per foglio**, e separa gli avvisi dagli errori, ciascuno con foglio e numero di riga.

## Modello di costo

Per ogni prodotto il costo è calcolato ricorsivamente (rollup):

```
costo = Σ (componenti × q.tà × (1 + scarto%))    // materiale + commerciali + costo sotto-assiemi
      + Σ (lavorazioni: ore × tariffa €/h)        // manodopera
costo totale = costo + spese generali (overhead %)
prezzo vendita = costo totale × (1 + margine %)
```

Le percentuali di spese generali e margine sono globali (Impostazioni) e sovrascrivibili per singola macchina dalla *Modifica testata*; sono ammesse tra 0 e 1000%. I riferimenti ciclici sono rilevati e impediti sia nella distinta sia nel ciclo di lavorazione delle parti: un articolo coinvolto in un anello viene segnalato invece di restituire un costo troncato.

### Parti: una domanda sola, la facciamo o la compriamo?

Gli articoli di tipo **parte** fanno eccezione: possono avere una **distinta parte** (materie prime e commerciali) e un **ciclo di lavorazione** (fasi a costo fisso), gestiti nella vista *🔧 Cicli di lavorazione*. Da dove venga il loro costo lo decide un campo solo, l'**approvvigionamento**, nella scheda articolo:

| Approvvigionamento | Costo della parte | Nel fabbisogno |
|---|---|---|
| 🏭 Produzione interna | la somma delle righe di distinta parte e ciclo | si scende nella distinta e si compra quel che serve per farla |
| 🛒 Acquisto da fornitore | il prezzo scelto nel **listino fornitori** | è una foglia d'acquisto come un commerciale: la distinta non si esplode |

Una parte in produzione interna ma **senza righe di ciclo** non ha niente da calcolare: vale anche lì il prezzo a listino.

Costo e fabbisogno partono così dalla stessa risposta e non possono contraddirsi. La distinta e il ciclo di una parte acquistata **restano salvati** e consultabili — servono a sapere quanto costerebbe farla in casa — semplicemente non concorrono al costo.

Il **fabbisogno materiali** scende nelle distinte con queste stesse regole (scarto compreso): quantità e importi della lista d'acquisto tornano con la costificazione della stessa macchina. L'ordine delle fasi è documentale: riordinarle non cambia il costo.

Le parti nuove nascono **da acquisto** — è il caso più frequente, la parte la lavora un terzista — e chi la produce in casa lo dichiara; il valore proposto si cambia in *Gestione → Impostazioni*. Le parti **già a catalogo non si toccano**: cambiare l'impostazione vale per le prossime.

### Da dove arriva un prezzo d'acquisto

Fornitore, prezzo, codice e descrizione presso il fornitore **nascono solo nel listino**. La scheda articolo li mostra in sola lettura, con un pulsante che apre il listino; creando un articolo che si compra, il listino si apre da solo. Un prezzo senza fornitore resta possibile — è una quotazione con il fornitore vuoto, marcata *a mano*.

Il motivo è lo storico: finché lo stesso dato si poteva scrivere in due posti, un prezzo corretto nella scheda spariva senza lasciare traccia, e alla domanda «quando e da chi l'abbiamo pagato così?» non c'era risposta. Vale per commerciali, materie prime e parti; su una parte prodotta in casa, scegliere una quotazione chiede prima di segnarla come acquistata, invece di spostare il costo di nascosto.

## File

- `index.html` — struttura, navigazione, barre filtri delle due anagrafiche, caricamento degli script.
- `vendor/` — le librerie di export (SheetJS per Excel, jsPDF per i PDF), tenute nel repo invece che su un CDN. Versioni, origine e come si aggiornano: `vendor/LEGGIMI.md`.
- `store.js` — layer dati: schema, migrazioni versionate, `Store` (API repository) su localStorage, hashing delle password e autore delle modifiche.
- Il codice dell'app, diviso in **classic script caricati in sequenza** da `index.html` (nessun modulo, nessun build: la pagina si apre anche con un doppio click). Lo scope globale è condiviso, quindi restano un solo insieme di funzioni e un solo stato:

| File | Contenuto |
|---|---|
| `core.js` | stato dell'app, utility, ruoli, pannelli e conferme. `APP_VERSION` in cima è la revisione mostrata nell'header |
| `auth.js` | accesso, sessione, primo amministratore |
| `costing.js` | motore di costificazione (rollup ricorsivo, modi di calcolo delle parti) |
| `shell.js` | ricerca globale, stampa, navigazione tra le viste |
| `views-bom.js` | distinte base e *Dove è usato* |
| `views-rev.js` | revisioni della distinta: rilascio, storico e confronto |
| `views-stock.js` | giacenze, movimenti di magazzino, impegni dei piani aperti e calcolo del fabbisogno netto |
| `views-jobs.js` | commesse cliente e tracciabilità commessa → fabbisogno → richiesta → ordine |
| `views-home.js` | riepilogo: cosa richiede attenzione, con il collegamento a dove si risolve |
| `views-catalog.js` | anagrafiche, listino fornitori, scheda articolo, cicli di lavorazione |
| `views-report.js` | costificazione e report |
| `views-mrp.js` | fabbisogno materiali |
| `views-item.js` | scheda articolo di sola lettura e codice cliccabile |
| `views-docs.js` | richieste di offerta e ordini |
| `views-manage.js` | gestione (utenti, anagrafiche di servizio, impostazioni) |
| `cloud-map.js` | traduzione fra la forma annidata locale e quella normalizzata del futuro database condiviso. Funzioni pure, **nessun codice di rete**: l'app resta locale |
| `import-catalog.js` | articoli ⇄ Excel nei due file Acquisti e Progetto: colonne per tipo, foglio Liste, verifica senza importare |
| `import-export.js` | import distinte da Excel, impostazioni di Gestione ⇄ Excel, backup JSON, cestino e avvio dell'app |
- `style.css` — tema dark.
- `CHANGELOG.md` — lo storico completo delle versioni.
- `docs/cloud-schema.md` — contratto per il futuro backend condiviso (mappatura tabelle, adapter).
- `docs/analisi-tecnica.md` — controllo generale del codice: cosa è stato risolto, cosa resta aperto e perché.
- `test/` — suite di verifica del motore di costo, delle migrazioni, del salvataggio, dell'import Excel e dell'accesso. **Non serve all'app**: `index.html` non la carica, e copiando la cartella su un altro PC si può anche omettere.
- `.github/workflows/test.yml` — esegue la suite a ogni push. Come `test/`, non serve all'app.

### Test

```
node test/run.js      # suite completa
node test/bench.js    # benchmark del motore di costificazione
```

Richiede solo **Node 18 o superiore** — nessun `npm install`, nessuna dipendenza: la suite usa i moduli core e carica i sorgenti dell'app in un contesto isolato, nella stessa sequenza di `index.html`.

## Changelog

Le revisioni seguono il versionamento semantico `0.MINOR.PATCH`: **MINOR** per nuove funzionalità, **PATCH** per correzioni. La versione in cima è quella in `APP_VERSION` (`core.js`) e mostrata nell'header dell'app.

Lo storico completo delle versioni è in [CHANGELOG.md](CHANGELOG.md).

## Note

I dati risiedono nel browser. Per trasferirli su un altro PC usare **Gestione → Backup → Esporta/Importa JSON**.

Il layer dati è già **predisposto al cloud** (schema v2): ID UUID, timestamp `createdAt`/`updatedAt` su ogni record, versioning dello schema con migrazioni idempotenti (i backup vecchi si auto-migrano all'import). Il passo successivo — sincronizzazione condivisa per un piccolo team via Supabase o Cloudflare D1 — si aggancia al solo `Store` di `store.js`; il disegno è in `docs/cloud-schema.md`. Il frontend è statico e pubblicabile così com'è su GitHub Pages / Cloudflare Pages.
