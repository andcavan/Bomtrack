# Bomtrack — Distinte Base & Costificazione

App per creare e gestire **distinte base (BOM) multi-livello** di macchine meccaniche, ottenere la **costificazione automatica** e gestire il ciclo acquisti (**richieste di offerta** e **ordini a fornitore**).

Costruita con lo stesso stile di TimeTrack: vanilla JavaScript + HTML + CSS, nessun build, tema dark. **Database solo locale** (`localStorage`) — nessun server, nessun Supabase.

## Avvio

Aprire `index.html` in un browser (doppio click, oppure usare l'estensione "Live Server" di VS Code). Al primo avvio l'app chiede di creare l'**amministratore** (nome, email, password) e carica dei dati di esempio (macchina "Nastro Trasportatore NT-100"). Agli avvii successivi si entra con email e password; "Ricordami" conserva l'email e la sessione resta aperta fino a **Esci**.

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
- **📨 Documenti → Fabbisogno materiali** — piani di produzione salvati (3 × macchina A, 2 × macchina B): le distinte si esplodono e si sommano in una **lista d'acquisto consolidata**, raggruppabile per fornitore, più l'elenco delle **parti da fabbricare**. Da qui si **generano richieste di offerta e ordini**, un documento per fornitore, scegliendo quali righe includere. Export Excel e PDF.
- **💶 Listino fornitori** — l'unico posto dove nasce un prezzo d'acquisto. Più quotazioni per articolo (fornitore, codice e descrizione presso il fornitore, prezzo, q.tà minima, giorni di consegna, data), alimentate anche dai prezzi tornati con le richieste di offerta. Vale per commerciali, materie prime **e parti**. Il prezzo che entra nella costificazione si sceglie esplicitamente dal listino.
- **🔗 Dove è usato** — da ogni articolo si risale a chi lo contiene e alle macchine impattate, con **simulazione del costo**: si prova un prezzo diverso e si vede subito l'effetto sul costo delle macchine, senza salvare nulla.
- **📨 Richieste di offerta (RFQ)** — una richiesta per fornitore, righe da catalogo o manuali, documento bilingue IT/EN in PDF ed Excel, compilazione dei prezzi al ritorno dell'offerta e **confronto offerte** tra più richieste.
- **🧾 Ordini a fornitore (ODA)** — generabili da una richiesta, da un piano di fabbisogno o da zero, con prezzi, importi, consegne e **registrazione dei ricevimenti** (ricevuto/residuo per riga).
- Gli elenchi di richieste e ordini si filtrano per **stato**, **fornitore** e **testo** (numero, oggetto, fornitore, note e righe del documento).
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

- `index.html` — struttura, navigazione, barre filtri delle due anagrafiche, CDN (jsPDF, SheetJS).
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
| `views-stock.js` | giacenze, movimenti di magazzino e calcolo del fabbisogno netto |
| `views-jobs.js` | commesse cliente e tracciabilità commessa → fabbisogno → richiesta → ordine |
| `views-home.js` | riepilogo: cosa richiede attenzione, con il collegamento a dove si risolve |
| `views-catalog.js` | anagrafiche, listino fornitori, scheda articolo, cicli di lavorazione |
| `views-report.js` | costificazione e report |
| `views-mrp.js` | fabbisogno materiali |
| `views-docs.js` | richieste di offerta e ordini |
| `views-manage.js` | gestione (utenti, anagrafiche di servizio, impostazioni) |
| `cloud-map.js` | traduzione fra la forma annidata locale e quella normalizzata del futuro database condiviso. Funzioni pure, **nessun codice di rete**: l'app resta locale |
| `import-export.js` | import da Excel, backup JSON e avvio dell'app |
- `style.css` — tema dark.
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

### 0.31.0 — 2026-08-01

**Nel fabbisogno il pulsante «Genera documenti» diventa due:** *📨 Genera richieste* e *🧾 Genera ordini*.

**Cambiato**
- Il tipo di documento si sceglie **prima**, dal pulsante che si preme, e il menu a tendina dentro la scheda sparisce. Sono due gesti diversi — «chiedo quanto costa» e «compro» — e metterli in un menu li faceva sembrare la stessa cosa scelta due volte, con la scelta più impegnativa a un click di distanza da quella innocua.
- **La scheda si apre già giusta.** Con il tipo deciso, le righe finite in un documento *di quel tipo* risultano bloccate fin dall'apertura: prima bisognava cambiare il selettore per scoprire quali fossero, e l'elenco si riscriveva sotto gli occhi.
- **Ogni pulsante porta il numero di righe che restano da mettere** in quel tipo di documento — *Genera ordini (2)* — e si **spegne** quando non ne restano. Quanto lavoro c'è da fare si vede prima di aprire la scheda; e un pulsante che si può premere ma non fa niente è peggio di uno spento, perché costringe a scoprirlo aprendo.

**Verifica**
- 4 nuovi controlli (suite da 697 a 701): che ciascun pulsante conti il proprio lavoro rimasto in modo indipendente (generare un ordine non consuma la strada delle richieste), che si spenga a lavoro finito, e che il tipo generato sia quello del pulsante premuto.

### 0.30.0 — 2026-08-01

**Dallo stesso fabbisogno non si ordina due volte la stessa cosa.** Era l'errore facile: si sceglie un fornitore, si genera l'ordine, si torna indietro per il fornitore successivo — e le righe di prima sono ancora lì, spuntate, identiche. Il doppio ordine si scopriva alla consegna.

**Cambiato**
- **Gli articoli già finiti in un documento del piano sono segnalati e non si riselezionano.** Nella scheda *Genera documenti* restano visibili — sapere che c'è già è un'informazione, nasconderli no — ma in grigio, con 🔒 e il numero del documento, e la spunta disabilitata. Il gruppo del fornitore dice «tutto già documentato» quando non resta niente.
- **Nella lista del fabbisogno ogni riga mostra dove è già finita** (📄 con il numero del documento): la domanda «l'ho già ordinato?» si risponde dove si guarda per primo, senza aprire la generazione.
- Il blocco vale **per tipo di documento**, e la distinzione non è un dettaglio: chiedere un'offerta e *poi* ordinare è il flusso normale, quello che l'app accompagna dalla 0.21.0. Bloccare l'ordine perché esiste già una richiesta renderebbe impossibile proprio il percorso che si vuole incoraggiare. Si impedisce di rifare **lo stesso tipo** di documento; l'altro resta consentito, e l'articolo mostra comunque dove è già finito.

**Come funziona, e perché così**
- Il conto si fa **leggendo i documenti del piano**, non contrassegnando gli articoli: nessun campo nuovo, nessuna divergenza possibile fra ciò che è segnato e ciò che esiste davvero.
- Ne discende il comportamento giusto senza doverlo programmare: un ordine **eliminato** o **annullato** libera le sue righe da solo — quell'ordine non esiste più, e quel materiale è di nuovo da comprare. Non c'è nessun contrassegno da ricordarsi di ripulire.
- Le righe **manuali** di un documento (quelle senza articolo a catalogo) non bloccano niente: non vengono dal fabbisogno.
- Per cambiare quantità o fornitore di qualcosa di già documentato si modifica quel documento, oppure lo si elimina e si rigenera. L'app lo dice quando non resta più niente da selezionare.

**Verifica**
- 11 nuovi controlli (suite da 686 a 697), fra cui che la guardia stia **anche accanto alla scrittura** e non solo nell'interfaccia: forzando la selezione di un articolo già ordinato non nasce nessun documento, mentre le righe ancora libere presenti nella stessa selezione passano regolarmente.

### 0.29.0 — 2026-08-01

**Quattro cose che non cambiano un numero**, ma cambiano quanto costa capire cosa si sta guardando e rimediare a uno sbaglio.

**Aggiunto**
- **Riepilogo** come schermata iniziale. Si atterrava sulla distinta base, cioè su uno strumento: l'app diceva «ecco gli attrezzi», non «ecco cosa c'è da fare». Eppure i segnali li aveva già tutti — commesse oltre la data, righe di fabbisogno da ordinare subito, ordini confermati in ritardo, articoli senza prezzo, sotto scorta, codici duplicati — sparsi in cinque viste, ognuno visibile solo a chi andava a cercarlo.
  - Non calcola niente di nuovo: mette in fila quello che le altre viste già sanno, e **ogni riga porta dove si risolve**. Un riepilogo che chiede di essere letto e basta non serve a nessuno.
  - Le voci a zero **non si mostrano**: un elenco pieno di zeri rassicuranti nasconde le due righe che contano.
  - In fondo, il **risparmio possibile**: su quanti articoli il listino contiene una quotazione più bassa di quella in uso. Come sempre, non si applica niente da solo.
- **L'indirizzo segue la vista aperta.** Il tasto Indietro del browser usciva dall'app, un refresh riportava sempre alla stessa schermata, e non c'era modo di mandare a un collega il punto in cui si sta guardando. Ora Indietro/Avanti funzionano, un link porta dove deve, e ricaricando si resta dov'eravamo.
- **Cestino.** Le eliminazioni non spariscono più: restano **30 giorni** e si rimettono a posto da *Gestione → Backup*. Passata quella finestra se ne vanno da sole al caricamento successivo — il cestino non deve diventare il posto dove il database cresce senza che nessuno guardi.
  - È una collezione a parte, non un contrassegno sul record: un contrassegno obbligherebbe **ogni** lettura del database a ricordarsi di escluderlo, e chi se ne dimenticasse farebbe ricomparire un articolo cancellato dentro una distinta.
- **«↶ Annulla» nell'avviso** subito dopo un'eliminazione. È l'unico momento in cui l'undo serve davvero, perché è l'unico in cui si sa ancora cosa si è appena fatto. Andarlo a cercare nel cestino domani mattina è un'altra cosa, e infatti il cestino c'è lo stesso.
- **«🔍 Da dove viene questo costo»** nella Costificazione. I riquadri dicono *quanto* costa e le barre *di che tipo* è la spesa, ma non **chi** la fa: su una distinta a cinque livelli la risposta andava cercata a mano nella tabella esplosa. Ora si vedono i dieci articoli che pesano di più, sommati su tutta la distinta — lo stesso componente in tre rami conta una volta sola, con la somma — ciascuno con la sua quota.

**Verifica**
- 35 nuovi controlli (suite da 651 a 686). Sul cestino in particolare: che l'eliminato esca davvero da indici ed elenchi, che ripristinare due volte non duplichi, che si ripristini **quello giusto** e non l'ultimo per data (due eliminazioni nello stesso millisecondo hanno la stessa data), e che le voci scadute si svuotino da sole. Sulla spiegazione del costo: che la somma dei contributi torni al totale — se non torna, o si conta due volte o si perde qualcosa.

### 0.28.0 — 2026-08-01

**L'app impara le date.** Sapeva *cosa* serve e *quanto*, mai *per quando* — e i giorni di consegna, scritti a listino da versioni, non entravano in nessun conto: c'era scritto che il fornitore ci mette 21 giorni e nessuno se ne faceva niente.

**Aggiunto**
- **Ogni riga di piano dice quando deve essere pronta**, e la data scende lungo la distinta: se una macchina serve per il 30 settembre, i suoi componenti servono per il 30 settembre. La testata del piano propone la data alle righe nuove, che restano modificabili una per una.
  - Quando lo stesso articolo arriva da più righe con date diverse si tiene **la più vicina**: ordinare per la data più stretta copre anche le altre, il contrario no.
  - Volutamente **niente time-phasing**: nessun fabbisogno diviso per settimane. Sarebbe un altro strumento, e prometterlo a metà è peggio che non averlo.
- **«Ordinare entro»**: la data in cui serve meno i giorni di consegna del fornitore in uso. È l'unica data su cui si può ancora fare qualcosa, ed è quella su cui si misura l'urgenza — non quella in cui serve. Un materiale che serve fra 30 giorni da un fornitore che ne impiega 60 **è già in ritardo oggi**, e adesso l'app lo dice.
- **Semaforo sulle righe del fabbisogno**: ⚠ in ritardo, ⏱ da ordinare (meno di 7 giorni di margine), oppure niente. Le due date stanno in colonna accanto ai giorni di consegna.
- **La consegna richiesta finisce sulle righe dei documenti.** Era sempre vuota: chi generava un ordine dal fabbisogno doveva riscriverla a mano su ogni riga, cioè non la scriveva.
- **Data confermata dal fornitore** sulle righe d'ordine, accanto a quella richiesta, con lo scarto in giorni. La risposta del fornitore restava in una mail; ora sta sull'ordine, e in testata compare il **ritardo peggiore** — perché è quello a decidere se la commessa slitta.
- **Commesse** (nuova voce in *Documenti*). Numerate `COM-2026-001`, con cliente, riferimento cliente, stato e data di consegna. Un piano ne dichiara una, e da lì la citazione **scende su richieste e ordini**: la scheda della commessa elenca fabbisogni, richieste e ordini collegati, con ordinato / già ricevuto / ancora atteso, e si apre ciascuno con un click.
  - L'app sapeva già collegare fabbisogno → richiesta → ordine; mancava l'anello a monte, cioè **per chi** e **per quando**. Alla domanda «cosa abbiamo ordinato per la commessa 240?» si rispondeva aprendo gli ordini a uno a uno.
  - Una commessa che regge piani o documenti **non si cancella**: lascerebbe riferimenti a un numero inesistente. Le commesse chiuse spariscono dal menu di scelta ma restano visibili a chi le aveva già collegate.

**Corretto**
- **Le date d'ordine erano anticipate di un giorno.** Il calcolo partiva dalla mezzanotte *locale* e tornava in UTC: a est di Greenwich si perdeva un giorno a ogni operazione, e `addDays(data, 0)` restituiva il giorno prima. Uno sbaglio che guardando lo schermo non si nota — la data c'è, è plausibile, ed è sbagliata. Ora i conti sono in UTC: qui non esistono orari, sono date, e le date non hanno fuso. Trovato dai test alla prima esecuzione.

**Verifica**
- 40 nuovi controlli (suite da 611 a 651): aritmetica delle date (mesi, anni bisestili, valori illeggibili), propagazione lungo la distinta, lead time preso dalla quotazione **in uso** e non dalla migliore, semaforo misurato sulla data d'ordine, confronto richiesta/confermata col ritardo peggiore, e la catena commessa → piano → ordine percorsa nei due versi.

### 0.27.0 — 2026-08-01

**Si gestisce in metri, si compra a chilo.** Capita su barre, lamiere, profilati: l'articolo va in distinta e a magazzino in un'unità, ma il fornitore quota in un'altra. Fino a ieri il prezzo del listino finiva tale e quale nel costo, che risultava in €/kg mentre le quantità erano in metri: **il costo era sbagliato di un fattore, in silenzio.** È l'errore peggiore che questa app potesse fare — il numero c'era, era plausibile, ed era falso.

**Aggiunto**
- **U.M. d'acquisto e fattore di conversione** nella scheda di commerciali, materie prime e parti. Il fattore dice quante unità d'acquisto stanno in una di gestione: una barra in <span style="font-family:monospace">m</span> che pesa 5,55 kg al metro ha U.M. d'acquisto <span style="font-family:monospace">kg</span> e fattore <span style="font-family:monospace">5,55</span>.
  - Stanno **sull'articolo** perché sono fisica, non commercio: una barra pesa quel che pesa, uguale per tutti i fornitori. Duplicare il fattore su ogni quotazione vorrebbe dire poterlo sbagliare in un posto solo su cinque.
- **Ogni riga di listino dichiara la propria unità**, perché quella sì è una scelta del fornitore: due fornitori possono quotare lo stesso articolo diversamente, e accanto al prezzo si legge il costo convertito.
- **La conversione avviene in un punto solo**, dove una quotazione diventa il costo dell'articolo. Il motore di costo non sa niente di unità di misura: riceve già tutto nell'unità di gestione e continua a moltiplicare un costo per una quantità. Nessuna regola di costificazione è stata toccata.
- **Richieste e ordini nascono nell'unità del fornitore**, col suo prezzo: 20 m di barra diventano 111 kg a 1,80 €/kg. Un ordine di «20 m» a chi vende a chilo è un ordine da rifare al telefono. L'importo è lo stesso da entrambe le parti.
- **I ricevimenti tornano indietro convertiti**: il fornitore consegna 111 kg, il magazzino carica 20 m. Senza, la giacenza — e con lei il fabbisogno netto della 0.26.0 — sarebbe sbagliata di un fattore.
- **Import Excel**: colonne `UMAcquisto` e `Fattore`, con una riga d'esempio nel template. Valgono solo insieme: un'unità senza fattore non converte niente, un fattore senza unità non si applica a niente, e nel dubbio è meglio nessuna conversione che una inventata.

**Corretto**
- **Il confronto fra quotazioni ignorava le unità.** «2 €/kg» risultava più conveniente di «5 €/m» su una barra che pesa 8 kg/m, e la segnalazione di risparmio nel fabbisogno **consigliava il fornitore più caro** — errore silenzioso e per giunta a effetto opposto. Ora il confronto è sui costi convertiti.
- **Il minimo d'ordine del fornitore** è espresso nella sua unità: confrontarlo con i metri quando lui vende a chili faceva scattare l'allarme «sotto il minimo» in entrambi i versi sbagliati.

**Compatibilità**
- **Nessuna migrazione, nessun dato cambia.** Articoli senza U.M. d'acquisto e righe senza unità si comportano esattamente come prima: fattore 1, nessuna conversione. Le righe d'ordine scritte prima della 0.27.0, che non portano l'unità, valgono come unità di gestione.
- Fuori portata, dichiarato: il fornitore che quota «a barra da 6 m», cioè una terza unità di confezionamento. Il modello non lo impedisce, semplicemente non lo copre ancora.

**Verifica**
- 38 nuovi controlli (suite da 573 a 611), fra cui il giro completo del caso reale: si dichiara il peso al metro, si registra la quotazione al chilo, si verifica il costo in costificazione, si genera l'ordine, lo si riceve e si controlla che il magazzino conti metri e che il piano risulti coperto.

### 0.26.0 — 2026-08-01

**Il fabbisogno smette di essere solo lordo.** Diceva quanto serve, non quanto serve *comprare*: chi lo usava riordinava materiale che era già a magazzino o già in arrivo da un ordine mandato la settimana prima, e se ne accorgeva alla consegna.

**Aggiunto**
- **Fabbisogno netto**, dal pulsante ☐ nella lista d'acquisto. Il conto è in chiaro: **lordo + scorta minima − esistente − in arrivo**, arrotondato al lotto di riordino.
  - Il **lordo non sparisce mai**: nel netto resta in colonna, accanto a esistente e in arrivo. Vedere «servono 40, ne hai 25, ne compri 15» è tutt'altra cosa che vedere 15 e doversi fidare. Il lordo serve a capire il prodotto, il netto a capire cosa comprare — sono due domande diverse e l'app risponde a entrambe.
  - Le righe **già coperte** restano visibili, in grigio e marcate ✓, invece di sparire: che una cosa non serva comprarla è un'informazione, non un vuoto.
  - I documenti generati dal piano portano la quantità **che è stata mostrata**, e la scheda di generazione dice quale delle due sta usando.
- **Giacenze e movimenti.** Nella scheda di un articolo compaiono esistente, in arrivo e scorta minima, con **✏ Rettifica giacenza** e **🕘 Movimenti**.
  - **L'esistente non è un campo che qualcuno aggiorna: è calcolato.** È lo stesso errore già corretto una volta con i prezzi nella 0.21.0 — se lo stesso numero si può scrivere in due posti, prima o poi i due posti dicono cose diverse e non si sa a quale credere. Qui esistente = **ricevuto sugli ordini + movimenti**, e ogni pezzo ha un padrone solo: il ricevuto vive sull'ordine, dove già viveva, quindi correggere un ricevimento sbagliato corregge anche la giacenza senza doversi ricordare di farlo due volte.
  - La **rettifica d'inventario** si inserisce come quantità *contata* e viene registrata come **differenza**: lo storico deve dire cosa è cambiato, non cosa c'era.
  - Una conseguenza da conoscere: **cancellare un ordine ricevuto toglie la sua merce dal magazzino.** È coerente — quel carico esisteva perché esisteva quell'ordine — ma va saputo prima, non dopo.
- **Scorta minima** e **lotto di riordino** per articolo. La scorta minima è quanto si vuole lasciare a magazzino *dopo* aver coperto il piano; il lotto arrotonda per eccesso quello che si compra, perché mezzo lotto non lo vende nessuno. Solo su ciò che si tiene a scorta: un assieme si produce, e la sua giacenza sarebbe quella dei componenti contata due volte.
- **Export coerenti**: in modalità netta l'Excel porta anche le colonne Lordo / Esistente / In arrivo, e il PDF mette il lordo fra parentesi. Chi riceve il foglio deve poter rifare il conto senza tornare all'app.

**Verifica**
- 39 nuovi controlli (suite da 534 a 573): il conto del netto isolato dai dati intorno (compreso l'arrotondamento al lotto, che con i float sbaglia facilmente per eccesso), la provenienza dell'esistente ordine per ordine e stato per stato — una **bozza non è in arrivo**, un ordine annullato non porta niente, un evaso non è più atteso ma la sua merce resta — e la corrispondenza fra la quantità mostrata e quella che finisce nel documento.

### 0.25.0 — 2026-08-01

**Le distinte hanno una storia.** Fino a ieri modificarne una riscriveva il passato: un costo calcolato tre mesi fa non era più riproducibile, e un ordine emesso su una distinta poi cambiata non era più giustificabile — restava il documento, ma non ciò su cui era stato deciso.

**Aggiunto**
- **Rilascio di una revisione.** Nella vista Distinta (e nei Cicli, per le parti) compare la revisione in lavorazione — **Rev. A** su tutto ciò che c'è già, senza toccare i dati — con il pulsante **📌 Rilascia revisione**. Rilasciare congela la distinta com'è, **col costo di quel giorno**, e apre la successiva: la A resta consultabile e non cambia più, si continua a lavorare sulla B.
  - Il verso è deliberato. La strada ovvia sarebbe bloccare la distinta rilasciata e obbligare ad aprirne una nuova per modificarla: blocca il lavoro di tutti i giorni per un beneficio che si vede una volta ogni tanto, e chi lavora impara a evitarla. Qui **quella su cui si lavora è sempre modificabile**, e la revisione rilasciata è immutabile perché è una fotografia, non perché un lucchetto lo impedisce.
  - Al rilascio si scrive il **motivo**: è quello che si legge fra un anno per capire perché la distinta è cambiata.
  - Se dall'ultimo rilascio non è cambiato niente, l'app lo dice invece di lasciar creare una revisione identica alla precedente.
- **🕘 Storico revisioni**: l'elenco dei rilasci con data, autore, motivo e il costo di allora.
- **⇄ Confronto** fra una revisione e la distinta attuale: righe **aggiunte**, **rimosse** e **quantità cambiate** (con il valore di prima accanto a quello di adesso), più il **delta di costo**. Se la distinta non è cambiata ma il costo sì, lo dice esplicitamente — è cambiato un prezzo, non il prodotto.
  - Le righe si confrontano per articolo, sommando le quantità quando lo stesso componente compare più volte: è la domanda che ci si fa davvero guardando due revisioni («di questo, quanti ne servono adesso?»), non «la terza riga è cambiata».
- **Anche le parti**: il ciclo di lavorazione definisce il costo quanto una distinta, e congelare l'una senza l'altro lascerebbe metà storico.

**Verifica**
- 32 nuovi controlli (suite da 502 a 534). Il più importante, che da solo giustifica la funzionalità: **modificare la distinta domani non cambia la revisione di ieri** — se cambiasse, lo storico sarebbe peggio del niente, perché racconterebbe una cosa falsa con l'aria di essere autorevole. Verificato anche che cambiare un prezzo dopo il rilascio non tocca il costo registrato, e che una revisione resta leggibile quando l'articolo che citava è stato eliminato dal catalogo.
- Le revisioni sono una collezione come le altre nel registro dello schema, e sopravvivono al giro verso la forma normalizzata. La fotografia però **resta un blocco unico**: normalizzarla vorrebbe dire darle la stessa forma dei dati vivi, cioè invitare qualcuno a modificarla.

### 0.24.0 — 2026-08-01

Terza tappa verso il database condiviso: le **fondamenta della migrazione**. A schermo non cambia niente e non c'è una riga di rete — l'app resta locale e si apre ancora con un doppio click. Cambia che le domande difficili della condivisione hanno adesso una risposta scritta e verificata, presa con calma invece che di corsa a metà migrazione.

**Aggiunto**
- **Registro dello schema** (`store.js`): le nove collezioni, i loro array annidati e come ciascuno va trattato quando i dati saranno condivisi, in un posto solo. Prima quei nomi erano cablati in sei punti diversi — migrazioni, validazione, azzeramento, backup — e ogni aggiunta ne dimenticava qualcuno.
  - La decisione che porta con sé non è tecnica ma di merito: **il listino e le righe dei documenti si fondono riga per riga**, perché due colleghi che registrano una quotazione sullo stesso articolo stanno lavorando, non litigando; **distinte, lavorazioni e cicli si sostituiscono per intero**, perché metà distinta di uno e metà dell'altro è un prodotto che nessuno ha progettato.
- **Conto delle modifiche non ancora inviate** (`Store.pendingChanges()`): quali record sono nati, cambiati o spariti dall'ultimo allineamento. Serve a mandare al server solo ciò che si è toccato — mandare tutto significa cancellare il lavoro degli altri in silenzio. Guarda **lo stato, non le chiamate**: copre anche l'import massivo e le migrazioni, che nessuno si ricorderebbe di strumentare.
- **`cloud-map.js`**: traduzione fra la forma annidata locale e le tabelle del futuro database. Funzioni pure, nessuna rete, verificabili per intero senza un server.
- **Seam dell'adapter** (`Store.adapter`): dove finiscono i byte è ora un oggetto sostituibile. Nessuna vista sa dove vanno i dati, e nessuna deve saperlo.

**Cambiato**
- Le creazioni e le eliminazioni di articoli, fornitori, famiglie, centri di lavoro, utenti, piani, richieste e ordini passano da `Store.insert` / `Store.remove` invece di modificare le liste a mano. Comportamento identico; l'intenzione, però, adesso è scritta. Gli inserimenti in blocco (import massivo, generazione documenti da un piano) restano come sono di proposito: passare di lì significherebbe un salvataggio per riga, e su cinquemila righe è un'altra cosa.

**Verifica**
- 39 nuovi controlli (suite da 463 a 502), di cui il più importante è **«due client, un server»**: due copie dell'app contro un server finto, sui tre casi veri — due quotazioni sullo stesso articolo, due documenti creati nello stesso minuto, uno che cancella ciò che l'altro sta modificando. Nessuna riga di rete coinvolta.
- Il giro completo annidato → tabelle → annidato è verificato campo per campo su un database che tocca tutte le forme, e **sui dati di esempio che l'app crea da sola**.
- Due difetti trovati proprio da questi test, prima che costassero qualcosa: l'ordine degli array (senza una colonna di posizione, i componenti di una distinta e le righe di un ordine si rimescolano a ogni lettura dal server) e la differenza fra un array figlio **vuoto** e uno **assente** — che in una tabella non esiste, e che avrebbe fatto sparire il campo `components` da un assieme con la distinta svuotata, mandando in errore l'aggiunta del componente successivo.

### 0.23.0 — 2026-08-01

Seconda tappa verso il database condiviso: **l'integrità dei dati**. Sono le cose che oggi passano inosservate e che, il giorno in cui i dati stanno su un server, diventano vincoli che fanno fallire salvataggi che ieri funzionavano — su dati che nel frattempo si sono sporcati. Vanno chiuse adesso, non dopo.

**Cambiato**
- **Il codice articolo non si può più duplicare.** Non lo controllava nessuno, ma tutto ciò che cerca un articolo per codice — l'import massivo per primo — dà per scontato che sia unico e risolve **sul primo trovato, in silenzio**: reimportando un foglio, le righe di un codice doppio finivano tutte sullo stesso articolo e le altre restavano indietro senza una segnalazione. Ora salvando una scheda con un codice già in uso l'app dice **quale articolo lo occupa**.
  - La regola è precisa: si impedisce di *introdurre* un duplicato, **non** si blocca chi sta correggendo altro su un articolo che era già duplicato prima. Chi ha dati sporchi può continuare a lavorare mentre li ripulisce.
- **Importando un backup si vede cosa sta per entrare** prima di confermare: articoli, fornitori, richieste, ordini, piani e utenti del file, accanto a quello che c'è adesso. Dai numeri si riconosce al volo un backup sbagliato o vecchio di mesi.

**Aggiunto**
- **Controllo dati in *Gestione → Backup*: i codici duplicati già a catalogo.** Li elenca raggruppati, con il pulsante per aprire ciascun articolo. L'app **non li rinomina da sola**: quel codice sta su disegni e ordini già emessi, e sceglierne uno al posto tuo sarebbe peggio del problema.

**Corretto**
- **Un backup danneggiato non entra più.** La guardia controllava solo che ci fosse l'elenco articoli: un file troncato a metà — download interrotto, chiavetta estratta — o il JSON di tutt'altro programma passava, **sostituiva l'intero database**, e l'errore usciva molto dopo in una vista a caso, quando i dati veri erano già stati sovrascritti. Ora si verifica la forma di tutte le collezioni e la versione dello schema, e il messaggio dice cosa non va. Un file prodotto da una **revisione più recente dell'app** viene fermato invece di essere degradato in silenzio: le migrazioni sanno salire, non scendere.
- **Il controllo anti-ciclo copre anche la distinta parte.** Guardava solo i componenti degli assiemi e si fermava sulle parti; la vista *Cicli di lavorazione* non aveva alcun controllo. Non era sfruttabile — nella distinta parte entrano solo commerciali e materie prime, che non contengono nulla — ma era una difesa che nessuno aveva scritto, e sarebbe caduta il giorno in cui si fosse allargato quell'elenco. Un anello in distinta manda il calcolo del costo in ricorsione.
- **Un codice generato automaticamente non sovrascrive più un articolo esistente.** La generazione guarda solo i codici che seguono il proprio schema: se qualcuno ne aveva inserito a mano uno che coincideva, l'import successivo risolveva sull'articolo sbagliato. Ora la collisione viene rilevata, si assegna un codice provvisorio e lo si segnala nel report di import.

**Prestazioni**
- **Import massivo: eliminata la scansione lineare per riga.** Ogni riga cercava il proprio articolo scorrendo tutto il catalogo: un foglio da 5.000 righe su 5.000 articoli erano ~50 milioni di confronti, e il costo cresceva col quadrato. Ora c'è un indice per codice, che l'import aggiorna mano a mano che crea articoli — così anche le righe successive ritrovano ciò che le precedenti hanno appena inserito. Lo stesso indice regge il controllo di unicità, che altrimenti sarebbe costato una scansione a ogni salvataggio.

**Verifica**
- 39 nuovi controlli (suite da 424 a 463): indice per codice e sua invalidazione, raggruppamento dei duplicati, la regola del «non introdurre nuovi duplicati», rifiuto di nove forme diverse di backup danneggiato, anelli che passano per la distinta parte, e una rete sui tempi di import (400 righe su 400 articoli) che fallisce se l'indice smette di funzionare.

### 0.22.0 — 2026-08-01

Prima tappa del percorso verso il database condiviso: **niente di nuovo a schermo, si guadagna la capacità di accorgersi dei guasti**. Fuori da `store.js` non esisteva nessuna rete — un errore dentro un disegno lasciava mezza tabella e nessun messaggio — e i due file che decidono chi entra e che riscrivono il catalogo in blocco non avevano un solo test.

**Aggiunto**
- **Gli errori non previsti si vedono.** Prima un'eccezione dentro il disegno di una vista lasciava la pagina a metà in silenzio: l'app sembrava ferma e non c'era modo di sapere cos'era successo, né di raccontarlo a chi doveva ripararla. Ora compare un avviso che dice chiaramente **che quello a schermo può essere incompleto e che i dati salvati non sono stati toccati**, con il pulsante per ricaricare. La finestra si mostra una volta sola, poi restano il messaggio breve e il registro.
- **Registro errori scaricabile**, in *Gestione → Backup*: gli ultimi 20 errori della sessione con data, vista aperta e revisione dell'app. Si azzera ricaricando la pagina, quindi va scaricato prima di ricaricare.
- **La sessione salvata può scadere.** «Ricordami su questo PC» valeva per sempre: su una postazione condivisa in officina restava aperta sull'utente di chi l'aveva usata mesi prima. Nuova impostazione **Durata della sessione salvata**, in *Gestione → Impostazioni*, **30 giorni** di serie; **0 = non scade mai**, come si comportava fino alla 0.21.0.
- **Verifica automatica a ogni modifica** (GitHub Actions): la suite gira da sola su ogni push, invece di dipendere dal ricordarsi di lanciarla.

**Sicurezza**
- **Le tre librerie caricate da CDN ora sono verificate** (`integrity`/SRI): il browser controlla l'impronta del file e lo rifiuta se non corrisponde. Un CDN compromesso non può più iniettare codice in un'app che maneggia listini e ordini. Cambiando versione di una libreria va rigenerato anche l'hash, altrimenti non si carica — e l'app lo dice, invece di tacere.
- Tolto `unescape()`, deprecato, dal calcolo dell'hash delle password. **Gli hash restano identici**: nessuno deve rifare la propria password.

**Corretto**
- **Il template di import Articoli proponeva una dicitura che l'import stesso rifiutava.** La riga di esempio scaricabile dice *Componente commerciale*, ma erano ammessi solo *Commerciale*, *Commerciali* e *Comm*: chi compilava il template partendo dall'esempio si vedeva rifiutare le righe senza capire perché. Ora sono accettate entrambe, insieme al plurale *Materie prime*.

**Verifica**
- **80 nuovi test** su import Excel e accesso — i due file che ne erano completamente privi. La suite passa da 340 a 424 controlli. Coperti: risoluzione dei tipi e delle colonne del foglio, upsert per codice e sua idempotenza, creazione al volo di fornitori e famiglie, rifiuto delle righe che romperebbero la distinta (tipo non ammesso, padre o figlio inesistenti, anelli); hash e salt delle password, primo amministratore, messaggio unico per email inesistente e password errata, scadenza e recupero della sessione, matrice dei ruoli.

### 0.21.0 — 2026-07-31

**Cambiato**
- **Il calcolo del costo di una parte non è più una scelta a parte.** C'erano due interruttori che rispondevano alla stessa domanda per metà: il *modo di calcolo* nella vista Cicli (solo costo unitario / solo ciclo / la somma dei due) e, da questa versione, l'*approvvigionamento* nella scheda articolo. Potevano contraddirsi — comprare la parte da un terzista ma continuare a costificarla dal ciclo interno — e tenerli d'accordo era un lavoro a mano. Ora la domanda è una sola: **la parte la facciamo o la compriamo?**
  - **Produzione interna** → il costo lo determinano distinta parte e ciclo di lavorazione (se sono vuoti, vale il prezzo a listino).
  - **Acquisto da fornitore** → il costo è il prezzo scelto nel listino, e la distinta non si esplode nel fabbisogno.
  - Il selettore *Calcolo del costo della parte* sparisce dalla vista Cicli, che al suo posto **dice da dove viene il costo** e rimanda alla scheda articolo. Distinta e ciclo di una parte acquistata restano salvati e consultabili.
- **Fornitore e prezzo d'acquisto escono dalla scheda articolo.** Prima lo stesso dato si poteva scrivere in due posti — nella scheda e nel listino — e un prezzo corretto a mano nella scheda spariva senza lasciare traccia: lo storico aveva buchi proprio dove serviva. Ora c'è **una porta sola, il listino 💶**. La scheda mostra prezzo, fornitore, codice e descrizione presso il fornitore **in sola lettura**, con un pulsante che apre il listino; creando un articolo che si compra, il listino si apre da solo. Un prezzo senza fornitore resta possibile: è una quotazione con il fornitore vuoto, marcata *a mano*.
- **Nel listino si può scrivere anche la descrizione presso il fornitore**, accanto al codice: è il campo che prima stava nella scheda articolo. Ora vive dove sta il resto della quotazione, e cambia insieme al fornitore invece di restare quello dell'ultimo.
- **Il costo unitario di una materia prima o di una parte si imposta dal listino**, come il prezzo di un commerciale. Un articolo già esistente col suo costo se lo ritrova come prima quotazione, senza perdere niente.

**Aggiunto**
- **Le parti hanno il listino, come i commerciali.** Molte si comprano già lavorate da terzi: adesso si possono registrare più fornitori, confrontare le quotazioni e tenerne lo storico, **senza toccare i cicli di lavorazione**, che restano come sono. Su una parte prodotta in casa, scegliere una quotazione **chiede prima di segnarla come acquistata**: il costo non si sposta mai di nascosto.
- **Ogni parte dichiara se si produce o si compra.** Nuovo campo *Approvvigionamento* nella scheda parte. Con *Acquisto da fornitore* la parte finisce nel **fabbisogno fra le cose da acquistare**, col suo fornitore, e la sua distinta non viene esplosa — quel materiale e quelle lavorazioni li mette il fornitore. Il ciclo resta salvato: serve a confrontare quanto costerebbe farla in casa. In elenco la parte acquistata si riconosce dal segno 🛒.
  - Le parti **nuove nascono da acquisto**; il valore proposto si cambia in *Gestione → Impostazioni*. Le parti **già a catalogo non si toccano**, così nessun fabbisogno già calcolato si muove da solo.
- **Dal fabbisogno si generano richieste di offerta e ordini.** Il piano sapeva già cosa comprare e da chi, ma la lista si riscriveva a mano nei documenti. Il pulsante **📄 Genera documenti** apre una scheda con le righe raggruppate per fornitore: si spuntano fornitori e singole righe, si sceglie *richiesta* o *ordine*, e nasce **un documento per fornitore**. Le righe senza fornitore fanno gruppo a sé, «Da assegnare».
  - Le **richieste nascono senza prezzo** — è quello che si sta chiedendo. Gli **ordini portano il prezzo in uso** nella costificazione.
  - Prima di generare si vedono i problemi: righe **senza prezzo** e quantità **sotto il minimo** del fornitore sono segnalate nella scheda, non dopo aver mandato l'ordine.
  - Il legame resta scritto: il piano elenca i documenti che ha generato, e ogni documento dice da quale fabbisogno viene. Un ordine generato da una richiesta nata da un piano conserva la catena intera.
- **Filtri nella distinta base.** La vista aveva solo un menu a tendina, inservibile oltre il centinaio di assiemi. Ora una barra filtra per **testo**, **livello** (macchine / gruppi / sottogruppi) e **macchina di appartenenza**, con il conteggio «N di M». La distinta aperta resta sempre nel menu anche se il filtro la escluderebbe: restringere la ricerca non chiude più l'albero sotto le mani.

**Corretto**
- **La finestra *Dove è usato* era lentissima sui cataloghi grandi**: per ogni articolo ricontrollava l'intero catalogo, e la simulazione del costo lo rifaceva a ogni riga. Ora la risalita usa un indice: sul banco di prova (700 articoli) è passata da **8 secondi a un decimo di secondo**. Stesso trattamento per fornitori e centri di lavoro, cercati fin qui uno per uno a ogni riga disegnata.
- **Un fornitore si poteva cancellare anche se citato solo nei listini, nei cicli o nei documenti**, lasciando uno storico prezzi che puntava nel vuoto. Ora l'app controlla tutti i posti e dice esattamente dove è ancora usato.
- **Gli export PDF ed Excel morivano in silenzio senza connessione.** Le librerie arrivano da internet al primo caricamento: senza, il pulsante sembrava semplicemente non funzionare. Ora compare un messaggio che spiega cosa manca. Stessa cosa per un file d'importazione illeggibile.
- Nell'albero della distinta e in *Dove è usato*, una riga di ciclo salvata **senza tipo esplicito** ora conta come articolo, come già faceva il motore di costo: le due letture non possono più divergere.

**Per chi aggiorna**
- Non serve fare nulla: i dati esistenti si adeguano da soli al primo avvio. Costi e prezzi già inseriti diventano la prima quotazione a listino e restano quelli in uso nella costificazione.
- Il vecchio modo di calcolo di ogni parte diventa il suo approvvigionamento, **conservando insieme il costo e il comportamento nel fabbisogno**:

  | Modo di calcolo (prima) | Approvvigionamento (ora) | Cosa cambia |
  |---|---|---|
  | Solo costo unitario | 🛒 Acquisto da fornitore | nulla: costava già il campo manuale e la distinta non si esplodeva |
  | Solo valore ciclo | 🏭 Produzione interna | nulla |
  | Costo unitario + valore ciclo | 🏭 Produzione interna | **il costo scende**: resta il valore del ciclo, si perde la quota manuale che ci si sommava |

  L'ultima riga è l'unico caso in cui un numero si muove. Se avevi parti impostate sulla somma, controllale: ora il ciclo è il costo del farle, e quello che prima era la quota aggiuntiva va portato in una riga di ciclo, oppure la parte va segnata come acquistata.
- Le parti **già a catalogo mantengono il comportamento di prima**: solo le nuove nascono da acquisto.

### 0.20.0 — 2026-07-30

**Aggiunto**
- **Ogni riga della distinta ha il suo numero di posizione**: `1`, `1.1`, `1.1.1`, `1.2`, `2`… Prima il livello si leggeva solo dal rientro, e su una distinta profonda — o peggio, su un foglio stampato — non si riusciva a citare una riga né a capire da chi dipendesse. Ora si dice «guarda la 1.2.1» e si guarda tutti la stessa cosa.
  - La numerazione **riparte da 1 sotto ogni padre**, senza limite di profondità. La macchina in testa all'albero resta senza numero: i suoi componenti sono `1`, `2`, `3`…
  - Quando si apre una **parte**, gli articoli della sua distinta parte continuano la numerazione del padre (`2.1`, `2.2`…); con il calcolo «costo unitario + ciclo» la quota manuale chiude la serie. Le **fasi di lavorazione 🔧 restano senza numero** — sono operazioni, non pezzi da citare in distinta — e non consumano una posizione: la serie degli articoli prosegue senza buchi anche quando una fase sta in mezzo.
  - Lo stesso numero compare **ovunque**: nell'albero di *Gestione DB*, nella colonna **Pos.** della distinta esplosa in *Visualizza DB*, negli **export Excel e PDF** (dove diventa la prima colonna, accanto al Livello già presente) e in stampa. Una riga si chiama allo stesso modo in ufficio tecnico e dal fornitore.

**Cambiato**
- Nella distinta esplosa di *Visualizza DB* il **rientro dei livelli è passato dalla descrizione al codice** — a video, in Excel e in PDF. I codici disegnano l'albero, le descrizioni ripartono tutte dallo stesso margine e si leggono in colonna invece che a scalini.

### 0.19.0 — 2026-07-29

**Cambiato**
- **La barra dei comandi passa da nove pulsanti a cinque gruppi.** Le voci del gruppo aperto compaiono su una **seconda riga** sotto l'intestazione, sempre visibili: si cambia vista con un clic solo, senza menu da aprire e chiudere.

  | Gruppo | Contiene |
  |---|---|
  | 📇 Anagrafica | Acquisti · Progetto |
  | 🔧 Cicli di lavorazione | — |
  | 🌳 Distinta base | **Gestione DB** (la distinta di prima) · **Visualizza DB** (la costificazione di prima) |
  | 📨 Documenti | Fabbisogno · Richieste offerta · Ordini |
  | ⚙ Gestione | — |

- **Dov'è finita la Costificazione**: in *Distinta base → Visualizza DB*. Le *Distinte base* sono *Distinta base → Gestione DB*. Nessuna vista è cambiata dentro: è cambiato solo come ci si arriva.
- Ogni gruppo **ricorda l'ultima voce usata**: se stavi sugli Ordini e passi in Anagrafica, tornando su Documenti ritrovi gli Ordini. Vale per la sessione, non si salva.
- I gruppi con una voce sola (Cicli, Gestione) non mostrano la seconda riga, e l'intestazione stampata ora dice da dove viene il foglio (*Distinta base › Visualizza DB*).

### 0.18.1 — 2026-07-29

**Cambiato**
- Il codice dell'app, arrivato a 5.400 righe in un file solo, è stato **diviso in undici file** per area (motore di costo, distinte, anagrafiche, documenti, gestione, import/export…). Nell'app non cambia nulla: nessuna funzione è stata riscritta, le righe sono solo state spostate, e le 261 verifiche automatiche passano invariate.
- **Se copi l'app su un altro PC**, copia l'intera cartella: ora `index.html` carica più file, non più solo `app.js`. Non serve installare nulla, si apre sempre con un doppio click.

### 0.18.0 — 2026-07-29

**Aggiunto**
- **🔎 Cerca ovunque, con Ctrl+K** (o il pulsante nell'intestazione): un campo solo che cerca tra **articoli, richieste, ordini e piani**. Si scorre con ↑ ↓ e si apre con Invio; ogni risultato porta dove ha senso guardarlo — un assieme nella sua distinta, un articolo nella sua scheda, un documento nel suo editor. Chi sta scrivendo un codice se lo ritrova in cima all'elenco.
- **🖨 Stampa della vista aperta** dal pulsante nell'intestazione o con il **Ctrl+P** del browser: esce quello che si sta guardando, senza barra di navigazione, filtri e pulsanti, con intestazione (azienda, sezione, documento aperto, data e chi ha stampato) e righe che non si spezzano tra due fogli.
- **Chi ha modificato cosa**: in fondo alla scheda articolo e agli editor di richieste, ordini e piani compare *Creato da … il … · aggiornato da … il …*. Il dato era registrato da sempre, ma non si era mai potuto vedere.

**Cambiato**
- **Le conferme non sono più finestre del browser.** «Eliminare questo componente?» e le altre venti domande sono ora schede dell'app, con un titolo che dice di cosa si tratta e un pulsante che dice cosa succede (*Elimina*, *Sblocca*, *Importa e sovrascrivi*) invece di un OK generico.
- L'**azzeramento totale** mostra cosa sta per cancellare (quanti articoli, documenti e piani, quanti MB), offre il pulsante per esportare subito un backup e chiede di scrivere **AZZERA** nella scheda stessa.

### 0.17.0 — 2026-07-29

**Aggiunto**
- **📋 Fabbisogno materiali** — nuova voce di menu. Si crea un **piano di produzione** (3 × una macchina, 2 × un'altra) e l'app esplode le distinte fino alle foglie, sommando lo stesso articolo ovunque compaia: ne esce la **lista di ciò che serve comprare**, con quantità totale, fornitore, prezzo in uso e importo. Prima l'unico modo era aprire le distinte e sommare a mano, sapendo che lo stesso cuscinetto sta in tre gruppi diversi.
- **Raggruppa per fornitore** — la lista si riordina per fornitore con il subtotale di ciascuno: è la forma in cui si passa a chiedere i prezzi.
- **🏭 Da fabbricare** — elenco a parte delle parti richieste dal piano, con quantità, costo unitario e importo: quello che va in officina.
- **Segnalazione del risparmio** — dove a listino esiste una quotazione più bassa di quella in uso, la riga mostra ↓ con la differenza sulla quantità di piano, e in cima si legge quanto scenderebbe il totale. Nessun prezzo cambia da sé: si sceglie sempre dal listino dell'articolo.
- Avviso ⚠ quando la quantità richiesta è **sotto la quantità minima** del fornitore.
- **Export Excel** (due fogli, Acquisti e Produzione) e **PDF** del fabbisogno.
- I piani si **salvano**, si riaprono e si **duplicano** (📋): rifare il piano del mese prima è un click.

**Come si comporta**

Il fabbisogno usa le stesse regole della costificazione: lo scarto entra nelle quantità, e distinta parte e ciclo di una parte si esplodono solo quando concorrono al costo (col calcolo *solo costo unitario* restano documentali). Su un riferimento ciclico si ferma e lo segnala, invece di dare numeri troncati per buoni.

### 0.16.0 — 2026-07-29

**Aggiunto**
- **🔧 Cicli di lavorazione** — nuova voce di menu, dedicata alle parti. In alto si sceglie la parte, filtrando per **famiglia**, **sottofamiglia** e testo; sotto ci sono due elenchi distinti: la **distinta parte** (le materie prime e i commerciali che servono) e il **ciclo di lavorazione** (le fasi). Prima erano un elenco solo, dentro una scatoletta in fondo alla scheda articolo, e per passare da una parte all'altra bisognava chiudere e riaprire la scheda.
- **Riordino delle lavorazioni** con le frecce **↑ ↓** e numerazione di **fase 10, 20, 30…** ricalcolata dall'ordine. L'ordine è documentale: spostare una fase non cambia di un centesimo il costo della parte.
- Pulsante **🔧** sulle parti, nel catalogo *Progetto* e nell'albero delle distinte: apre direttamente la parte nella nuova vista.
- Il riepilogo in cima separa **quanto pesa la distinta parte** e **quanto pesano le lavorazioni**, oltre al costo della parte.

**Cambiato**
- La scheda articolo di una parte non contiene più l'editor del ciclo: al suo posto c'è il riassunto del contenuto e il pulsante per aprire la vista. Anche la scelta del **calcolo del costo della parte** si è spostata lì, accanto a ciò che governa.
- Nella nuova vista **ogni modifica si salva subito**, come nelle Distinte base: non c'è più un *Salva* dell'articolo da ricordarsi di premere perché il ciclo non vada perso.
- Nulla da rifare sui dati esistenti: distinta e ciclo restano la stessa cosa di prima, solo mostrata in due elenchi. Duplicando una parte (📋) la copia si porta dietro entrambi.

### 0.15.0 — 2026-07-28

**Aggiunto**
- **Schede mobili al posto delle finestre modali** — le schede non oscurano più la pagina. Si **trascinano per il titolo**, si **ridimensionano** dall'angolo in basso a destra e si chiudono con la **✕**, con *Chiudi/Annulla* o con **Esc**. Sotto, la pagina resta pienamente utilizzabile: si può tenere aperto il **listino di un articolo** mentre si sfoglia una distinta, o affiancare *Dove è usato* a un form.
- Più schede aperte insieme, una per tipo: listino, *Dove è usato*, avviso di salvataggio e form convivono. Riaprire lo **stesso** tipo di scheda riusa la finestra invece di duplicarla — lo stato di una scheda è uno solo, due listini affiancati finirebbero per scriversi addosso.
- Con un form già aperto, aprirne un altro chiede **conferma** prima di perdere le modifiche non salvate: senza il velo scuro davanti, un click su un'altra riga non deve buttare via il lavoro fatto.

Su schermi stretti (sotto 640 px) le schede occupano la pagina come prima, senza trascinamento.

### 0.14.1 — 2026-07-28

**Cambiato**
- **Listino fornitori più compatto** — la riga di una quotazione era lunga nove colonne e usciva dalla finestra. Ora i numeri stanno in colonne strette (i giorni di consegna nella colonna *GG*, quattro cifre al massimo) e **codice fornitore** e **origine** scendono sotto al nome del fornitore, su una seconda riga: stessi campi, metà larghezza.
- I giorni di consegna vengono riportati a 9999 se si digita un valore più lungo.

### 0.14.0 — 2026-07-27

**Aggiunto**
- **💶 Listino fornitori e storico prezzi** — nuovo pulsante su commerciali e materie prime. Lo stesso articolo può ora avere **più quotazioni**, ognuna con fornitore, prezzo, quantità minima, giorni di consegna, codice fornitore e data. La quotazione **più bassa** è marcata con ↓, quella **in uso** con ✓.
- **Registrazione dei prezzi dalle richieste di offerta** — nell'editor di una richiesta, il pulsante *💶 Registra a listino* trasforma i prezzi tornati con l'offerta in quotazioni degli articoli, con data e numero della richiesta di provenienza. Una riga già registrata non viene duplicata: richieste successive allo stesso fornitore costruiscono lo **storico**.
- Le anagrafiche segnalano quanti prezzi ha un articolo (es. *3 quotazioni*) nella colonna Dettaglio.

**Come si comporta**

Il listino è **memoria, non un secondo calcolo**: il prezzo che entra nella costificazione resta quello nei campi dell'articolo. Registrare un'offerta **non cambia il costo** — un prezzo si mette in uso solo premendo *✓ Usa* sulla quotazione scelta, e solo allora il costo delle macchine si aggiorna. Così un'offerta ricevuta non sposta i preventivi già fatti senza che nessuno l'abbia deciso.

Chi aveva già un fornitore sull'articolo lo ritrova come prima voce di listino, marcata in uso: nulla da rifare a mano.

### 0.13.0 — 2026-07-27

**Aggiunto**
- **🔗 Dove è usato** — nuovo pulsante su ogni riga delle anagrafiche e dell'albero di distinta. Apre una finestra che risale la distinta invece di scenderla: mostra gli **impieghi diretti** (chi contiene l'articolo, con la quantità) e le **macchine impattate**, con la quantità complessiva necessaria per una macchina, il costo attuale e il prezzo di vendita. Da ogni riga si può risalire ancora, di livello in livello.
- **Simulazione del costo (what-if)** — nella stessa finestra, per materie prime, commerciali e parti a costo manuale, un campo *"Simula un costo diverso"*: digitando un prezzo compaiono due colonne con il **costo simulato** di ogni macchina e la **differenza** rispetto a oggi (in rosso se sale, in verde se scende). Il valore **non viene salvato**: serve solo a rispondere a "se il fornitore aumenta del 10%, quanto mi costa la macchina?".
- Quando si prova a eliminare un articolo ancora in uso, ora si apre direttamente il *Dove è usato* invece di elencare i codici in un messaggio.

### 0.12.0 — 2026-07-27

**Migliorato**
- **Le anagrafiche non si impastano più durante la digitazione.** I campi di ricerca (cataloghi, elenchi di richieste e ordini, finestre di selezione articolo) aspettano una breve pausa prima di ridisegnare, invece di rifare tutto a ogni carattere.
- **Il catalogo si disegna a blocchi di 200 articoli**, con i pulsanti *Mostra altri* e *Mostra tutti* in fondo. Il titolo di ogni gruppo indica sempre quanti articoli contiene per intero (es. `Riduttori (200 di 340)`), e il limite riparte da capo a ogni cambio di filtro. Con poche centinaia di articoli non cambia nulla; con qualche migliaio evita al browser di impaginare l'intero elenco a ogni battuta.
- **Ricerca nei documenti più rapida**: il testo cercabile di ogni richiesta e ordine — righe comprese — viene ricostruito solo quando il documento cambia davvero, non a ogni carattere digitato.
- L'**orologio** dell'intestazione si aggiorna al cambio di minuto invece che ogni secondo.

### 0.11.0 — 2026-07-27

**Aggiunto**
- **Indicatore "Modifiche non salvate"** nell'header: compare quando il browser rifiuta di salvare e resta lì finché il salvataggio non riesce di nuovo. Prima l'app continuava a mostrare i dati aggiornati senza conservarli, avvisando con un messaggio che spariva dopo due secondi e mezzo: chiudendo la scheda si perdeva tutto il lavoro fatto da quel momento.
- Quando il salvataggio fallisce compare una **finestra che spiega il motivo** — spazio esaurito, navigazione privata, dati non salvabili — con il pulsante per **esportare subito un backup JSON**, che funziona anche a spazio pieno perché lavora sui dati in memoria.
- **Spazio occupato dal database** in *Gestione → 💾 Backup*, con avviso in rosso oltre i 4 MB: il limite del browser è circa 5 MB e ora lo si vede arrivare.
- **Suite di test** (`node test/run.js`, 105 verifiche) su motore di costificazione, migrazioni e salvataggio. Nessuna dipendenza da installare.

**Migliorato**
- **Costificazione molto più veloce** su distinte profonde con componenti riusati: i sotto-assiemi già calcolati non vengono più ricalcolati da capo, e la ricerca degli articoli non scorre più tutto l'elenco. Su una distinta di prova con 700 articoli e 5 livelli, disegnare il catalogo passa da circa 163 ms a 2 ms.

**Corretto**
- **Valori negativi e non numerici** nei campi numerici. Costi, prezzi, quantità, ore e tariffe negativi ora **fermano il salvataggio con un messaggio** invece di finire nei calcoli; scarto (0–100%), spese generali e margine (0–1000%) vengono riportati dentro l'intervallo.
- Nella registrazione dei ricevimenti **non si può più ricevere più di quanto ordinato**: prima l'ordine passava a "evaso" con numeri incoerenti.
- Un **riferimento ciclico nel ciclo di lavorazione di una parte** ora viene rilevato. Non è costruibile dall'interfaccia, ma poteva arrivare da un import Excel o da un backup, e produceva un costo troncato presentato come valido.
- Le **famiglie predefinite** di materie prime e parti nascevano senza sigla al primo caricamento, e la codifica automatica per famiglia (`MAT-ACC-LAM-001`) la usa subito: la sigla arrivava solo al riavvio successivo.

### 0.10.0 — 2026-07-24

**Aggiunto**
- **Flag Obsoleto** su commerciali, materie prime e parti: marca un articolo come non più utilizzabile. Nel catalogo l'articolo obsoleto è attenuato e mostra il simbolo **⛔**.
- I flag **Preferito ★** (solo commerciali e materie prime) e **Obsoleto** si impostano ora direttamente nella **scheda articolo** (in fondo, sopra le note). La stella ★ resta anche nell'elenco Acquisti come scorciatoia.
- I badge **★** e **⛔** compaiono in **ogni selezione** dell'articolo: picker dei componenti di distinta, ciclo di lavorazione, duplicazione, "Aggiungi da catalogo" di richieste e ordini, e menu a tendina (con prefisso ★/⛔).

### 0.9.0 — 2026-07-24

**Aggiunto**
- **Concetto nel nome delle parti** — il nome di un articolo di tipo **parte** si compone ora di un **concetto** in **maiuscolo** scelto da un elenco gestito (*Gestione → 🏷 Concetti*, es. `ALBERO`, `FLANGIA`, `STAFFA`) più una **descrizione libera**: concetto `ALBERO` + `motore 20×100` → nome `ALBERO motore 20×100`. Il concetto è **obbligatorio** per le parti; gli altri tipi mantengono il campo Nome libero. Nella modale è mostrata l'anteprima del nome composto.
- Nuovo pannello *Gestione → 🏷 Concetti* (elenco con conteggio utilizzi, aggiunta, modifica ed eliminazione): un concetto **in uso non può essere rinominato né eliminato**, così i nomi delle parti già composte restano stabili. Un set di concetti meccanici tipici è precaricato.
- Le parti create prima della funzione conservano il vecchio nome come descrizione libera: basta scegliere il concetto in modifica per completarle. Il nome resta il campo mostrato ovunque (cataloghi, distinte, costificazione, PDF/Excel), quindi nessuna regressione sui documenti esistenti.

### 0.8.1 — 2026-07-22

- **Barra superiore alleggerita**: via il pulsante Backup (resta in *Gestione → 💾 Backup*), cambio password 🔑 e uscita ridotti a icone. A sinistra della pill utente **data per esteso sopra e ora sotto** (ore e minuti).
- La barra resta sempre **su una riga sola**: al restringersi della finestra cede nell'ordine il ruolo nella pill, le etichette del menu (che diventa a sole icone, con la vista attiva evidenziata) e solo per ultima la data.

### 0.8.0 — 2026-07-22

**Aggiunto**
- **Utenti, accesso e ruoli** — schermata di accesso con email e password (al primo avvio crea l'amministratore, senza credenziali predefinite), sessione con "Ricordami", cambio password e pill utente nell'header. Nuovo pannello *Gestione → 👥 Utenti* con creazione, modifica, sospensione, reset password ed eliminazione, e l'invariante dell'ultimo amministratore attivo.
- **Quattro ruoli** — Amministratore, Ufficio acquisti, Progettazione, Lettore — che limitano la scrittura per area (articoli, distinte, documenti, gestione), con banner di sola lettura nelle sezioni non modificabili. Vedi [Utenti e ruoli](#utenti-e-ruoli), **avvertenza sui limiti inclusa**.
- **Tracciabilità** `createdBy`/`updatedBy` su ogni record, popolata dall'utente della sessione (nessuna UI: serve alla migrazione).
- Struttura pensata per **Supabase**: nomi e flusso (`submitLogin`/`doLogin`/`logout`) ricalcano l'app TimeTrack già migrata, così passare ad `auth.users` + `profiles` è una sostituzione localizzata — mappatura in [docs/cloud-schema.md](docs/cloud-schema.md).

**Modificato**
- `AZZERA TUTTO` conserva l'utente che lo esegue, ricreandolo come amministratore; ripristino dei dati di esempio e import di un backup riconciliano la sessione (se il backup contiene altri utenti si torna alla schermata di accesso).

### 0.7.0 — 2026-07-22

**Aggiunto**
- **Anagrafiche separate** — il Catalogo unico si divide in due viste: **📦 Acquisti** (commerciali e materie prime) e **🏗 Progetto** (macchine, gruppi, sottogruppi, parti). Ogni vista ha i propri filtri e la creazione di articoli ristretta ai tipi di sua competenza, così il menu "Tipo" non propone più sei voci di cui cinque fuori contesto.
- **Calcolo del costo parte configurabile** — solo costo unitario, solo valore del ciclo di lavorazione, o la somma dei due; per singola parte, con default in *Gestione → Impostazioni*. Vedi [Modello di costo](#modello-di-costo).
- **Preferiti ★** su commerciali e materie prime, con filtro "solo preferiti" nella vista Acquisti.
- **Note interne** su richieste di offerta e ordini: non vengono stampate su PDF ed Excel, passano dalla richiesta all'ordine generato e restano modificabili in ogni stato del documento.
- **Sottogruppi annidati** — un sottogruppo può contenere altri sottogruppi; il controllo anti-ciclo continua a impedire le auto-inclusioni.
- **Filtri negli elenchi di richieste e ordini** — per stato, per fornitore (compreso "senza fornitore") e per testo. La ricerca guarda numero, oggetto, fornitore, note e **righe del documento**, così si risale all'ordine partendo dal codice acquistato. Accanto ai filtri il conteggio dei documenti mostrati e un pulsante per azzerarli.
- **🗑 AZZERA TUTTO** in *Gestione → Backup*: svuota completamente il database (articoli, documenti, anagrafiche, famiglie, U.M. e impostazioni) senza ricaricare i dati di esempio. Doppia conferma, la seconda da digitare.

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
