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

- **🌳 Distinta base → Gestione DB** — albero multi-livello espandibile della macchina selezionata, con costo unitario e di riga per ogni componente, lavorazioni interne e card di riepilogo costi. Aggiunta/modifica/eliminazione di componenti e lavorazioni. I sottogruppi possono contenere altri sottogruppi, senza limite di profondità.
- **📇 Anagrafica → Acquisti** — anagrafica di ciò che si compra: **materie prime** (costo unitario per U.M., es. €/kg) e **componenti commerciali** (prezzo d'acquisto da fornitore), con flag **preferito ★** (e filtro dedicato) e flag **obsoleto ⛔**.
- **📇 Anagrafica → Progetto** — anagrafica di ciò che si costruisce: **macchina**, **gruppo**, **sottogruppo** (assiemi, con propria distinta e lavorazioni) e **parte** (foglia con distinta parte e ciclo di lavorazione, con flag **obsoleto ⛔**).
- **🔧 Cicli di lavorazione** — vista dedicata alle parti: in alto la scelta della parte con i filtri per famiglia, sottofamiglia e testo; sotto la **distinta parte** (materie prime e commerciali necessari) e il **ciclo di lavorazione** (fasi 10, 20, 30… riordinabili con ↑ ↓). Ogni modifica si salva subito.
- **🌳 Distinta base → Visualizza DB** — costificazione: incidenza delle voci di costo e distinta esplosa; **export PDF ed Excel**.
- **📨 Documenti → Fabbisogno materiali** — piani di produzione salvati (3 × macchina A, 2 × macchina B): le distinte si esplodono e si sommano in una **lista d'acquisto consolidata**, raggruppabile per fornitore, più l'elenco delle **parti da fabbricare**. Export Excel e PDF.
- **💶 Listino fornitori** — più quotazioni per articolo (fornitore, prezzo, q.tà minima, giorni di consegna, data), alimentate anche dai prezzi tornati con le richieste di offerta. Il prezzo che entra nella costificazione si sceglie esplicitamente dal listino.
- **🔗 Dove è usato** — da ogni articolo si risale a chi lo contiene e alle macchine impattate, con **simulazione del costo**: si prova un prezzo diverso e si vede subito l'effetto sul costo delle macchine, senza salvare nulla.
- **📨 Richieste di offerta (RFQ)** — una richiesta per fornitore, righe da catalogo o manuali, documento bilingue IT/EN in PDF ed Excel, compilazione dei prezzi al ritorno dell'offerta e **confronto offerte** tra più richieste.
- **🧾 Ordini a fornitore (ODA)** — generabili da una richiesta o da zero, con prezzi, importi, consegne e **registrazione dei ricevimenti** (ricevuto/residuo per riga).
- Gli elenchi di richieste e ordini si filtrano per **stato**, **fornitore** e **testo** (numero, oggetto, fornitore, note e righe del documento).
- **🔎 Ricerca globale (Ctrl+K)** — un campo solo per articoli, richieste, ordini e piani: si scrive un codice o un numero e si salta dove serve, senza passare dalla vista giusta e dai suoi filtri.
- **🖨 Stampa della vista aperta (Ctrl+P)** — distinta, costificazione, fabbisogno, richiesta o ordine escono su carta ripuliti di navigazione, filtri e pulsanti, con intestazione, data e autore.
- **Autore delle modifiche** — in fondo a schede articolo, richieste, ordini e piani si legge chi ha creato il record e chi l'ha aggiornato per ultimo, con data e ora.
- **Schede mobili** — le finestre di dialogo non bloccano più la pagina: si spostano trascinandole per il titolo, si ridimensionano dall'angolo e si chiudono con ✕ o Esc. Dietro si continua a navigare, e listino, *Dove è usato* e un form possono restare aperti insieme.
- Le anagrafiche mostrano **200 articoli per volta** (*Mostra altri* / *Mostra tutti* in fondo all'elenco): i cataloghi grandi restano scorrevoli.
- **🔒 Note interne** su richieste e ordini: restano nell'app, non compaiono mai su PDF ed Excel. Passano dalla richiesta all'ordine generato e sono modificabili in qualunque stato del documento.
- **⚙ Gestione** — dati azienda, fornitori, condizioni di offerta (trasporto/pagamento), famiglie articolo, **concetti** (nomenclatura delle parti), centri di lavoro (tariffe €/h), **unità di misura**, impostazioni globali (spese generali %, margine %, valuta, calcolo costo parte), **import massivo da Excel** e backup JSON (esporta/importa/ripristina/**azzera tutto**).

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

Gli articoli di tipo **parte** fanno eccezione: oltre al costo unitario a mano possono avere una **distinta parte** (materie prime e commerciali) e un **ciclo di lavorazione** (fasi a costo fisso), gestiti nella vista *🔧 Cicli di lavorazione*. Ogni parte sceglie lì come combinare le due cose:

| Calcolo | Costo della parte |
|---|---|
| Solo costo unitario | il campo manuale; distinta e ciclo restano documentali e non entrano nel costo |
| Solo valore ciclo | la somma delle righe di distinta parte e ciclo (il campo manuale si disabilita) |
| Costo unitario + valore ciclo | la somma dei due |

Il **fabbisogno materiali** scende nelle distinte con queste stesse regole (scarto compreso, e distinta parte esplosa solo quando concorre al costo): quantità e importi della lista d'acquisto tornano con la costificazione della stessa macchina.

L'ordine delle fasi è documentale: riordinarle non cambia il costo. Il modo proposto alle nuove parti si imposta in *Gestione → Impostazioni*. Le parti già esistenti conservano il comportamento precedente (ciclo se ne avevano uno, altrimenti costo manuale).

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
| `views-catalog.js` | anagrafiche, listino fornitori, scheda articolo, cicli di lavorazione |
| `views-report.js` | costificazione e report |
| `views-mrp.js` | fabbisogno materiali |
| `views-docs.js` | richieste di offerta e ordini |
| `views-manage.js` | gestione (utenti, anagrafiche di servizio, impostazioni) |
| `import-export.js` | import da Excel, backup JSON e avvio dell'app |
- `style.css` — tema dark.
- `docs/cloud-schema.md` — contratto per il futuro backend condiviso (mappatura tabelle, adapter).
- `test/` — suite di verifica del motore di costo, delle migrazioni e del salvataggio. **Non serve all'app**: `index.html` non la carica, e copiando la cartella su un altro PC si può anche omettere.

### Test

```
node test/run.js      # suite completa
node test/bench.js    # benchmark del motore di costificazione
```

Richiede solo **Node 18 o superiore** — nessun `npm install`, nessuna dipendenza: la suite usa i moduli core e carica `store.js` e `app.js` in un contesto isolato, esattamente come li carica `index.html`.

## Changelog

Le revisioni seguono il versionamento semantico `0.MINOR.PATCH`: **MINOR** per nuove funzionalità, **PATCH** per correzioni. La versione in cima è quella in `APP_VERSION` (`app.js`) e mostrata nell'header dell'app.

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
