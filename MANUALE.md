# Bomtrack — Manuale d'uso

**Versione dell'app documentata: 0.73.0**

📖 **[Leggilo come pagina web](https://claude.ai/code/artifact/726a0963-2db0-4947-999b-d7b5beb91a0b)** — stesso testo, con indice laterale, filtro dei capitoli e tema chiaro/scuro. Comodo da tenere aperto di fianco all'app.

Questo è il manuale operativo di Bomtrack: cosa fa ogni schermata, come si compilano i campi,
quali comandi ci sono e — soprattutto — **in che ordine si lavora**, dalla commessa del cliente
fino alla merce che entra a magazzino.

Se è il primo giorno che usi Bomtrack, leggi nell'ordine il capitolo **1**, il **2** e poi tutto
il **4**: il capitolo 4 è il giro completo del lavoro, e gli altri capitoli sono il dettaglio di
ciascuna sua tappa.

---

## Indice

**Parte I — Iniziare**
1. [Che cos'è Bomtrack](#1-che-cosè-bomtrack)
2. [Avvio e primo accesso](#2-avvio-e-primo-accesso)
3. [L'interfaccia](#3-linterfaccia)

**Parte II — Il flusso di lavoro**

4. [Come si lavora con Bomtrack — il giro completo](#4-come-si-lavora-con-bomtrack--il-giro-completo)
5. [Riepilogo — «Richiede attenzione»](#5-riepilogo--richiede-attenzione)

**Parte III — Archivi**

6. [Anagrafica → Acquisti](#6-anagrafica--acquisti)
7. [Anagrafica → Progetto](#7-anagrafica--progetto)
8. [La scheda articolo, campo per campo](#8-la-scheda-articolo-campo-per-campo)
9. [I codici automatici](#9-i-codici-automatici)
10. [Listino fornitori](#10-listino-fornitori)
11. [Dove è usato e simulazione del costo](#11-dove-è-usato-e-simulazione-del-costo)
12. [Pannello laterale e selezione multipla](#12-pannello-laterale-e-selezione-multipla)

**Parte IV — Il prodotto**

13. [Distinta base → Gestione DB](#13-distinta-base--gestione-db)
14. [Cicli di lavorazione](#14-cicli-di-lavorazione)
15. [Revisioni](#15-revisioni)
16. [Costificazione — Visualizza DB](#16-costificazione--visualizza-db)

**Parte V — Le operazioni**

17. [Magazzino](#17-magazzino)
18. [Commesse](#18-commesse)
19. [Fabbisogno materiali](#19-fabbisogno-materiali)
20. [Richieste di offerta (RFQ)](#20-richieste-di-offerta-rfq)
21. [Ordini a fornitore (ODA)](#21-ordini-a-fornitore-oda)
22. [Ordini di lavoro (ODL) e conto lavoro](#22-ordini-di-lavoro-odl-e-conto-lavoro)
23. [Carico dei centri di lavoro](#23-carico-dei-centri-di-lavoro)

**Parte VI — Amministrazione**

24. [Gestione](#24-gestione)
25. [Utenti e ruoli](#25-utenti-e-ruoli)
26. [Import ed export da Excel](#26-import-ed-export-da-excel)
27. [Export di elenchi e documenti](#27-export-di-elenchi-e-documenti)
28. [Stampa](#28-stampa)
29. [Backup e manutenzione](#29-backup-e-manutenzione)
30. [Quando l'archivio è condiviso (Supabase)](#30-quando-larchivio-è-condiviso-supabase)

**Parte VII — Riferimenti**

31. [Scorciatoie da tastiera](#31-scorciatoie-da-tastiera)
32. [Stati dei documenti](#32-stati-dei-documenti)
33. [Glossario](#33-glossario)
34. [Domande frequenti](#34-domande-frequenti)
- [Appendice A — Come funziona sotto](#appendice-a--come-funziona-sotto)

---

# Parte I — Iniziare

## 1. Che cos'è Bomtrack

Bomtrack è l'applicazione con cui si tiene il **prodotto** e il **lavoro che ci gira intorno**
in un'officina meccanica:

- le **distinte base multi-livello** delle macchine — macchina, gruppi, sottogruppi, parti,
  senza limite di profondità;
- la **costificazione automatica** di ogni assieme, dalla vite alla macchina finita;
- il **magazzino** di quello che si tiene a scaffale;
- i **cicli di lavorazione** delle parti, con le fasi interne e quelle affidate fuori;
- il **fabbisogno materiali** che nasce dalle commesse dei clienti;
- il ciclo acquisti completo: **richieste di offerta**, **ordini a fornitore**,
  **ordini di lavoro** al terzista, ricevimenti e **conto lavoro**.

È pensata per chi progetta, chi compra e chi manda in produzione, e tiene queste tre viste sullo
stesso archivio: la parte che il progettista disegna è la stessa che l'ufficio acquisti ordina ed
è la stessa che il magazziniere trova sullo scaffale.

### Cosa Bomtrack non fa

Vale la pena dirlo subito, perché evita di cercare funzioni che non ci sono.

- **Non schedula la produzione.** Il *Carico centri* mostra le ore che i piani chiedono a ciascun
  centro settimana per settimana, e segnala il sovraccarico. Non lo risolve: non c'è calendario,
  non c'è data di avvio di una fase, la capacità è **infinita**.
- **Non ha l'avanzamento di produzione.** Non si dichiara «pezzo fatto». Il magazzino si muove con
  i movimenti e con i ricevimenti degli ordini, non con dei versamenti di produzione.
- **Non è un gestionale amministrativo.** Niente fatture, niente contabilità, niente DDT.
- **Non è multi-utente in tempo reale.** Ogni PC ha il suo archivio. Due colleghi che lavorano su
  due PC lavorano su due copie diverse: si allineano con un backup
  (→ [cap. 29](#29-backup-e-manutenzione)). L'archivio condiviso è progettato ma non ancora
  attivo: cosa cambierà, e cosa conviene già fare adesso, sta nel
  [cap. 30](#30-quando-larchivio-è-condiviso-supabase).
- **I ruoli non sono sicurezza.** Servono a separare le responsabilità tra colleghi, non a
  proteggere i dati (→ [cap. 25](#25-utenti-e-ruoli)).

> ⚠️ **I dati risiedono in questo browser, su questo PC.** Non c'è un server. Svuotare i dati del
> sito, cambiare browser o cambiare PC significa non trovare più l'archivio. Fai backup regolari:
> *Gestione → Backup → Esporta JSON*. È l'unica cosa di questo manuale che, se la salti, ti costa
> davvero cara — e resterà vera anche il giorno in cui l'archivio sarà condiviso
> (→ [cap. 30](#30-quando-larchivio-è-condiviso-supabase)).

---

## 2. Avvio e primo accesso

### Aprire l'app

Bomtrack è una cartella di file. Si apre facendo **doppio click su `index.html`**, oppure — se
lavori in VS Code — con l'estensione *Live Server*. Non c'è nulla da installare e nulla da
compilare.

**Non serve la rete, mai.** Le librerie che generano i PDF e gli Excel stanno dentro la cartella
dell'app: copiando la cartella su un altro PC funziona tutto, export compresi.

### Il primo avvio

La prima volta Bomtrack chiede di creare l'**amministratore**: nome e cognome, email e password.
Quello che si scrive lì è il primo utente, ed è l'unico che all'inizio può entrare in *Gestione*.

Insieme all'amministratore l'app carica dei **dati di esempio** — la macchina «Nastro Trasportatore
NT-100» con i suoi gruppi, le sue parti e qualche fornitore. Servono a guardarsi intorno senza
partire dal vuoto. Quando si comincia a lavorare sul serio si azzerano da
*Gestione → Backup → AZZERA TUTTO*.

### Gli avvii successivi

Si entra con **email e password**. La casella **Ricordami su questo PC** conserva l'email e tiene
la sessione aperta fino a **Esci**; quanto duri lo decide l'amministratore in
*Gestione → Impostazioni → Accesso* (0 giorni = non scade mai).

### La versione

Il numero di versione si legge **accanto al logo, in alto a sinistra** (es. `v0.73.0`).
Corrisponde alla voce in cima al changelog: serve quando si segnala un problema.

### Dove sta questo manuale

Il pulsante 📖 **Manuale d'uso** nell'intestazione lo apre in una scheda nuova, da qualunque
schermata. È il file `manuale.html`, che sta nella cartella dell'app accanto a `index.html`:
funziona **senza rete** come tutto il resto, e viaggia con la cartella quando la si copia su un
altro PC. Si apre nel tema scelto nell'app, e si stampa con `Ctrl+P`.

Nella cartella c'è anche `MANUALE.md`, lo stesso testo in formato Markdown: è la versione che si
legge in un editor o su GitHub.

### Portare l'app su un altro PC

1. Sul PC di partenza: *Gestione → Backup → **Esporta JSON***. Si scarica un file.
2. Copia l'intera cartella di Bomtrack sul PC di arrivo.
3. Apri `index.html`, crea l'amministratore, poi *Gestione → Backup → **Importa JSON***.

> ⚠️ **Importa JSON sovrascrive l'archivio corrente.** Se sul PC di arrivo c'era già del lavoro,
> esportalo prima.

---

## 3. L'interfaccia

### L'intestazione

In alto, da sinistra a destra:

| Elemento | A cosa serve |
|---|---|
| **Logo e versione** | Identità dell'app e revisione in esecuzione |
| **Barra di navigazione** | I sette gruppi di funzioni (vedi sotto) |
| **Badge modifiche non salvate** | Compare quando un documento aperto ha modifiche in sospeso |
| **Orologio** | Data e ora correnti |
| **Pillola utente** | Chi è connesso, con il suo colore |
| 🔎 **Cerca ovunque** | Ricerca globale — `Ctrl+K` |
| 🖨 **Stampa questa vista** | Stampa pulita della schermata — `Ctrl+P` |
| 📖 **Manuale d'uso** | **Questo manuale.** Si apre in una scheda nuova, così resta consultabile mentre si lavora, senza perdere il documento aperto |
| 🌗 **Cambia tema** | Gira su tre stati: *come il sistema*, *chiaro*, *scuro* |
| 🔑 **Cambia password** | La propria password |
| **Esci** | Chiude la sessione |

### La navigazione a due livelli

La barra dei comandi ha **sette gruppi**. Cliccando un gruppo, le sue voci compaiono su una
seconda riga; il gruppo con una voce sola non mostra la seconda riga. **Ogni gruppo ricorda
l'ultima voce usata**: tornando su *Documenti* si riapre dove si era rimasti.

| Gruppo | Voci |
|---|---|
| 🏠 **Riepilogo** | *(voce unica)* |
| 📇 **Anagrafica** | Acquisti · Progetto |
| 📦 **Magazzino** | *(voce unica)* |
| 🔧 **Cicli di lavorazione** | Cicli di lavorazione · Carico centri |
| 🌳 **Distinta base** | Gestione DB · Visualizza DB |
| 📨 **Documenti** | Commesse · Fabbisogno · Richieste offerta · Ordini · Ordini di lavoro |
| ⚙️ **Gestione** | *(voce unica — solo amministratori)* |

La vista aperta finisce **nell'indirizzo del browser** (`…index.html#mrp`). Ne segue che i tasti
*Indietro* e *Avanti* del browser funzionano, e che un indirizzo si può salvare tra i preferiti o
mandare a un collega che ha la stessa app.

### Le due forme di schermata

Bomtrack usa due impaginazioni, e riconoscerle aiuta a orientarsi.

**Elenco a tutta pagina** — Anagrafiche, Magazzino, Cicli, Distinta base, Carico centri.
Toolbar in alto, barra dei filtri sotto, elenco al centro. A destra si può aprire il
**pannello laterale** (`Ctrl+I`, → [cap. 12](#12-pannello-laterale-e-selezione-multipla)).

**Elenco a destra, documento al centro** — Commesse, Fabbisogno, Richieste, Ordini, Ordini di
lavoro. L'elenco sta in una colonna a destra e **resta visibile mentre si lavora un documento**,
che occupa il centro. Si passa da un documento all'altro con un click, senza tornare indietro e
ricercare la riga; la riga aperta resta marcata e i documenti chiusi o annullati si vedono spenti.
I filtri stanno impilati nella colonna dell'elenco, e i comandi che agiscono sul documento stanno
nella sua testata. **Le modifiche in sospeso si salvano da sole** quando si apre un altro
documento. In stampa esce il documento, non l'elenco.

### Le schede mobili

Le finestre di dialogo **non bloccano la pagina**: si spostano trascinandole per il titolo, si
ridimensionano dall'angolo in basso a destra e si chiudono con ✕ o con `Esc`. Dietro si continua a
navigare, e più schede possono restare aperte insieme — per esempio il listino di un articolo e
*Dove è usato* dello stesso, per confrontarli.

### Il tema

Il pulsante 🌗 nell'intestazione gira su tre stati: **come il sistema** (quello di partenza),
**chiaro**, **scuro**. La scelta resta su questo browser e non viene condivisa con i colleghi:
è una preferenza personale, non un dato aziendale. **In stampa la carta resta bianca** in tutti e
tre i casi.

---

# Parte II — Il flusso di lavoro

## 4. Come si lavora con Bomtrack — il giro completo

Questo è il capitolo che dà senso a tutti gli altri. Bomtrack non è un insieme di schermate
indipendenti: è **una catena**, e ogni anello ha bisogno di quello prima.

### Lo schema

```
    ┌──────────────────────────────────────────────────────────────┐
 0. │  GESTIONE — gli archivi di base                              │
    │  U.M. · famiglie · concetti · fornitori · clienti            │
    │  centri di lavoro · impostazioni (costi, codifica)           │
    └────────────────────────────┬─────────────────────────────────┘
                                 │
    ┌────────────────────────────▼─────────────────────────────────┐
 1. │  ANAGRAFICA ACQUISTI          ANAGRAFICA PROGETTO            │
    │  commerciali, materie prime   macchine, gruppi, sottogruppi, │
    │  + LISTINO FORNITORI          parti                          │
    └──────────┬────────────────────────────┬──────────────────────┘
               │                            │
               ▼                            ▼
 2.   CICLI DI LAVORAZIONE          DISTINTA BASE (albero)
      distinta parte + fasi   ────▶  macchina › gruppi › parti
               │                            │
               └────────────┬───────────────┘
                            ▼
 3.                  COSTIFICAZIONE
                  «quanto costa la macchina»
                            │
    ────────────────────────┼────────────────────────────────────────
                            │
 4.   COMMESSA CLIENTE ─────▶ PIANO DI FABBISOGNO
      (chi, cosa, quando)     (quante macchine, per quando)
                                       │
                    ┌──────────────────┼───────────────────┐
                    ▼                  ▼                   ▼
 5.        DA ACQUISTARE      DA FAR LAVORARE      DA FABBRICARE
                    │            FUORI                     │
                    │                  │                   ▼
                    │                  │            CARICO CENTRI
                    │                  │            (ore interne)
         ┌──────────┴──────┐           │
         ▼                 ▼           ▼
 6.  RICHIESTA         ORDINE      ORDINE DI LAVORO
     OFFERTA (RFQ)     (ODA)       (ODL)
         │                 │           │
         │ prezzi          │ ricevi    │ conto lavoro
         ▼                 ▼           ▼
     LISTINO ──────▶  MAGAZZINO ◀──────┘
```

### 4.1 Prima di tutto: preparare gli archivi

*(→ [cap. 24](#24-gestione))*

Si comincia da **⚙️ Gestione**, e conviene farlo in quest'ordine, perché ogni voce serve a
compilare la successiva:

1. **Unità di misura** — pz, kg, m, h… Con una ★ predefinita, proposta alle nuove righe.
2. **Famiglie** — tre elenchi separati (commerciali, materie prime, parti), ciascuno con
   macrofamiglie e sottofamiglie. Le sigle delle famiglie entrano nei codici automatici.
3. **Concetti** — la nomenclatura delle parti: `ALBERO`, `FLANGIA`, `STAFFA`… Il nome di una
   parte non è testo libero, è **concetto + descrizione**.
4. **Fornitori** — con pagamento e trasporto predefiniti, che si riproporranno su ogni documento.
5. **Clienti** — l'anagrafica a monte delle commesse.
6. **Centri di lavoro** — nome, **tariffa €/h** e **capacità in ore/settimana**; sotto ciascuno,
   i **fornitori di conto lavoro** che sanno fare quella lavorazione, con la loro tariffa.
7. **Impostazioni** — spese generali %, margine %, valuta, approvvigionamento predefinito delle
   parti, e i prefissi della codifica automatica.

> Saltare questo passo non blocca niente, ma costringe a tornare indietro: si scopre di non poter
> scegliere l'unità di misura mentre si crea il primo articolo, o di non avere il centro di
> lavoro mentre si scrive la prima fase di ciclo.

### 4.2 Costruire il prodotto

*(→ capitoli [6](#6-anagrafica--acquisti), [7](#7-anagrafica--progetto),
[14](#14-cicli-di-lavorazione), [13](#13-distinta-base--gestione-db))*

Si costruisce **dal basso verso l'alto**, perché il costo di un assieme è la somma di ciò che
contiene: finché le foglie non hanno un prezzo, il ramo non ha un costo.

**a) Quello che si compra** — *Anagrafica → Acquisti*. Materie prime (barra d'acciaio a €/kg,
lamiera a €/kg) e componenti commerciali (cuscinetti, motori, viteria). Per ognuno, il prezzo si
inserisce **dal listino fornitori** (→ [cap. 10](#10-listino-fornitori)): è l'unico posto dove
nasce un prezzo d'acquisto, e il campo nella scheda articolo è di sola lettura apposta.

**b) Le parti** — *Anagrafica → Progetto*, tipo **Parte**. Ogni parte dichiara il suo
**approvvigionamento**:

- **Acquisto da fornitore** — la parte si compra già fatta. Il suo costo è il prezzo a listino, e
  nel fabbisogno è una foglia d'acquisto come un commerciale.
- **Produzione interna** — la parte si fa in casa. Il suo costo è la somma della **distinta parte**
  (il materiale) più il **ciclo di lavorazione** (le fasi), e nel fabbisogno l'app scende dentro e
  compra il materiale invece della parte.

**c) I cicli** — *Cicli di lavorazione*. Per ogni parte a produzione interna: la **distinta parte**
(cosa serve: 2,4 kg di quella barra) e il **ciclo** (fasi 10, 20, 30…: tornitura al centro Torni,
2 ore; zincatura da Beta, 5 giorni). Una fase **senza fornitore** è interna e carica un centro;
una fase **con fornitore** è conto lavoro e diventerà un ordine di lavoro.

**d) Gli assiemi** — *Distinta base → Gestione DB*. Si apre la macchina e le si appendono i gruppi,
ai gruppi i sottogruppi, ai sottogruppi le parti e i commerciali. Ogni riga ha una **quantità** e
una **percentuale di scarto**. Gli assiemi possono avere anche lavorazioni proprie (il montaggio).

### 4.3 Sapere quanto costa

*(→ [cap. 16](#16-costificazione--visualizza-db))*

*Distinta base → **Visualizza DB***: si sceglie la macchina e si legge il costo, diviso per voci
(materiale, commerciali, parti, lavorazioni, spese generali) con l'**incidenza** di ciascuna e il
**prezzo di vendita** che ne segue. Il pulsante **Da dove viene questo costo** apre l'elenco degli
articoli che pesano di più: è la risposta alla domanda «perché costa così tanto».

Da qui si esce con il PDF e l'Excel della distinta esplosa, che è quello che si manda a chi fa
il preventivo.

### 4.4 Dal cliente al fabbisogno

*(→ capitoli [18](#18-commesse) e [19](#19-fabbisogno-materiali))*

Fin qui si è descritto **il prodotto**. Da qui in poi si lavora su **un lavoro concreto**.

**a) La commessa** — *Documenti → Commesse → **+ Nuova commessa***. Cliente, descrizione,
riferimento del cliente, data di apertura e **consegna al cliente**. La commessa è il contenitore:
ci si agganciano i piani, le richieste e gli ordini, e la sua scheda dirà in ogni momento se il
materiale c'è.

**b) Il piano di fabbisogno** — *Documenti → Fabbisogno → **+ Nuovo piano***. Si mette il piano
sotto la sua commessa, si dichiara la **consegna richiesta**, e nella sezione **Da produrre** si
scrive cosa e quanto: *3 × Nastro NT-100*, *2 × Nastro NT-200*.

**c) L'esplosione** — l'app scende in tutte le distinte, moltiplica per le quantità, somma gli
articoli che ricorrono in più punti e produce quattro sezioni:

- **Da acquistare** — la lista d'acquisto consolidata;
- **Da far lavorare fuori** — le fasi di ciclo affidate a un terzista;
- **Da fabbricare** — le parti che si fanno in casa;
- **Carico dei centri** — le ore che le fasi interne chiedono ai centri.

**d) Il netto** — con la casella **Fabbisogno netto** attiva, l'app toglie da ogni riga quello che
è già a magazzino, quello già ordinato, e aggiunge quello che gli **altri piani aperti** hanno già
impegnato:

```
netto = lordo + scorta minima + impegnato − esistente − in arrivo
```

arrotondato al **lotto di riordino** dell'articolo. Così due piani non si dichiarano coperti con
la stessa merce. **Il netto non si applica alle lavorazioni**: una fase non sta a scaffale.

### 4.5 Comprare

*(→ capitoli [20](#20-richieste-di-offerta-rfq) e [21](#21-ordini-a-fornitore-oda))*

Dal piano, tre pulsanti: **Genera richieste**, **Genera ordini**, **Genera ordini di lavoro**.
Ognuno apre una finestra con le righe raggruppate per fornitore e le caselle per scegliere cosa
includere; ne esce **un documento per fornitore**.

**Il percorso lungo — quando il prezzo non c'è:**

1. **Genera richieste** → nascono le RFQ (`RFQ-2026-001`…), una per fornitore.
2. Si genera il **documento PDF** (bilingue italiano/inglese) e lo si manda. Alla generazione
   l'app propone di passare lo stato a *Inviata*.
3. Torna l'offerta: si scrivono i **prezzi** nelle righe. Quando ci sono tutti, lo stato passa da
   solo a *Offerta ricevuta*.
4. **Registra a listino** trasforma quei prezzi in **quotazioni** nel listino degli articoli: da
   quel momento la costificazione li conosce.
5. Con più richieste sullo stesso materiale, **Confronta offerte** le mette a fianco.
6. **Crea ordine** converte la richiesta in ordine. La richiesta passa a *Chiusa*.

**Il percorso corto — quando il prezzo c'è già:** dal piano, **Genera ordini** direttamente.

**Poi, quando la merce arriva:** si apre l'ordine e si scrive quanto è arrivato nella colonna
**Ricevuto** (o si usa **✓ Segna tutto ricevuto**). Il ricevimento **carica il magazzino da solo**:
non serve registrare anche un movimento. Lo stato dell'ordine passa a *Parziale* o a *Evaso*.

> ⚠️ Ne segue una conseguenza da conoscere: **cancellare un ordine già ricevuto toglie la sua
> merce dal magazzino.** È coerente — quel carico esisteva perché esisteva quell'ordine — ma chi
> cancella un ordine vecchio deve saperlo.

### 4.6 Far lavorare fuori

*(→ [cap. 22](#22-ordini-di-lavoro-odl-e-conto-lavoro))*

Le fasi di ciclo affidate a un terzista sono denaro che esce come qualunque acquisto, e hanno il
loro documento: l'**ordine di lavoro** (`ODL-2026-001`).

1. Dal piano, **Genera ordini di lavoro**: un ODL per terzista **e per passata** (se un pezzo
   torna dallo stesso terzista una seconda volta, dopo essere passato altrove, sono due ODL —
   fra le due il pezzo torna da noi).
2. Ogni riga è una **tratta**: le fasi *consecutive* dello stesso terzista stanno insieme
   («fasi 20-30»), col prezzo e i giorni sommati.
3. **Si spedisce il materiale** — dalla riga dell'ODL, il comando di uscita a conto lavoro. Esce
   il materiale scritto nel ciclo della parte, con le quantità proposte in automatico
   (*q.tà del ciclo × pezzi dell'ordine*). Il magazzino **scarica**.
4. **Fra due terzisti** — se il pezzo passa da Beta a Gamma, si registra un **passaggio di
   lavorazione**: cambia il luogo, **la giacenza non si muove**.
5. **Rientrano i pezzi** — all'ultima fase, il rientro da conto lavoro **carica** il pezzo finito.

**Il magazzino si muove in due punti soli**, e sono i due estremi del *ciclo*, non quelli del
documento: esce il materiale alla prima fase esterna, entra il pezzo finito all'ultima. Ogni altro
estremo è un passaggio. Senza questa distinzione, una parte lavorata due volte dallo stesso
terzista farebbe uscire il materiale due volte e caricare il pezzo due volte.

Il campo **Rientrati** sull'ODL significa *pezzi tornati*: porta l'ordine a evaso, **non carica il
magazzino** — quello lo fanno i movimenti di conto lavoro.

In ogni momento, il pulsante **Presso terzi** in Magazzino dice cosa sta fuori e da chi.

### 4.7 Guardare la produzione interna

*(→ [cap. 23](#23-carico-dei-centri-di-lavoro))*

*Cicli di lavorazione → **Carico centri***: le ore che i piani aperti chiedono a ciascun centro,
settimana per settimana, contro la capacità dichiarata. Il sovraccarico si vede in rosso, con le
settimane e i centri nominati. Sotto, **i codici da produrre** ordinati per settimana e per ore:
la risposta a «cosa lancio per primo».

### 4.8 Chiudere il giro

- Quando la commessa parte, la si mette **In produzione**: l'app chiede conferma nominando i
  codici ancora mancanti e la data di consegna. **Avvisa, non blocca.**
- Un piano che non serve più si **chiude**: la sua quota di merce impegnata torna libera per gli
  altri piani. Un piano chiuso non sparisce, smette solo di impegnare.
- La commessa finita si mette **Chiusa**.

### 4.9 Il ciclo quotidiano

Ogni mattina si apre il **🏠 Riepilogo**: commesse in ritardo, righe da ordinare che scadono,
ordini confermati oltre la data, richieste senza risposta, articoli sotto scorta o senza prezzo.
Ogni voce è cliccabile e porta esattamente dove si risolve.

---

## 5. Riepilogo — «Richiede attenzione»

**A cosa serve.** È la pagina di atterraggio: cosa c'è da fare *adesso*.

**Come ci si arriva.** 🏠 *Riepilogo*. È la vista che si apre al primo accesso.

**Cosa si vede.** Un elenco di segnali ordinati per gravità — **alta**, **media**, **informativa**.
Ogni segnale **nomina i codici e i numeri che lo riguardano** (fino a otto, poi «+N altri in
*sezione*»), spiega il perché nel suggerimento, e ogni voce è cliccabile e porta dove si risolve.

| # | Segnale | Gravità | Dove porta |
|---|---|---|---|
| 1 | Commesse oltre la data di consegna | 🔴 alta | alla commessa |
| 2 | Commesse in produzione con materiale da ordinare | 🔴 alta | alla commessa |
| 3 | Righe di fabbisogno da ordinare, **già oltre la data** | 🔴 alta | al piano |
| 4 | Righe di fabbisogno da ordinare **entro 7 giorni** | 🟠 media | al piano |
| 5 | Ordini confermati oltre la data richiesta (ODA e ODL) | 🟠 media | all'ordine |
| 6 | Richieste inviate in attesa di risposta | 🔵 info | alla richiesta |
| 7 | Articoli sotto la scorta minima | 🟠 media | alla scheda articolo |
| 8 | Articoli d'acquisto senza prezzo | 🟠 media | alla scheda articolo |
| 9 | Fasi a costo orario senza ore dichiarate | 🟠 media | al ciclo |
| 10 | Codici articolo duplicati | 🟠 media | a Gestione |

**Il risparmio potenziale.** In fondo la pagina calcola quanto si risparmierebbe scegliendo
ovunque la quotazione più bassa già presente a listino. Non cambia niente da solo: è un invito a
rivedere i prezzi in uso.

**Da sapere.** Il Riepilogo è **derivato**: non c'è niente da compilare e niente da spuntare. Un
segnale sparisce quando sparisce la sua causa.

---

# Parte III — Gli archivi

I capitoli di questa parte e delle due successive seguono tutti la stessa griglia:
*A cosa serve* → *Come ci si arriva* → *Cosa si vede* → *Comandi* → *Filtri* → *Finestre* →
*Da sapere*.

## 6. Anagrafica → Acquisti

**A cosa serve.** L'archivio di **ciò che si compra**: componenti commerciali (cuscinetti, motori,
viteria) e materie prime (barre, lamiere, profilati). La schermata si intitola
**«Commerciali & Materie prime»**.

**Come ci si arriva.** 📇 *Anagrafica → Acquisti*.

**Cosa si vede.** L'elenco degli articoli, **200 per volta** (in fondo, *Mostra altri* e
*Mostra tutti*: i cataloghi grandi restano scorrevoli).

**Comandi.** In alto a destra la coppia **Esporta Excel** / **Esporta PDF**.
Nella barra dei filtri, a destra: **Colonne** e **+ Nuovo articolo**.

**Filtri.**

| Filtro | Valori |
|---|---|
| Ricerca | «Cerca codice o nome…» |
| Tipo | Tutti i tipi · Componente commerciale · Materia prima |
| Famiglia | Tutte le famiglie · *(le macrofamiglie definite)* |
| Sottofamiglia | Tutte le sottofamiglie · *(quelle della famiglia scelta)* |
| ★ Solo preferiti | Interruttore: mostra solo gli articoli marcati preferiti |

**Colonne disponibili** (pulsante **Colonne**): Indicatori, **Codice**, **Nome**, Tipo, Famiglia,
U.M., Costo unitario, Dettaglio. Codice e nome non si nascondono: sono l'identità della riga.
La scelta resta anche domani, ed è **separata** da quella di *Progetto* — le due anagrafiche hanno
le stesse colonne ma si guardano per motivi diversi.

**Da sapere.**

- **★ Preferito** marca gli articoli che si usano spesso, e ha un filtro dedicato.
- **⛔ Obsoleto** marca quelli che non si devono più usare: restano negli archivi e nei documenti
  che li citano, ma si vedono spenti.
- **Fornitore e prezzo non si scrivono qui.** La scheda li mostra in sola lettura e rimanda al
  **listino fornitori** (→ [cap. 10](#10-listino-fornitori)).
- L'export **esporta l'elenco, non la vista**: le colonne nascoste ci sono comunque, e la
  paginazione non taglia niente.

---

## 7. Anagrafica → Progetto

**A cosa serve.** L'archivio di **ciò che si costruisce**. La schermata si intitola
**«Macchine, Gruppi & Parti»**.

**Come ci si arriva.** 📇 *Anagrafica → Progetto*.

**I quattro tipi.**

| Tipo | Che cos'è | Ha una distinta? |
|---|---|---|
| **Macchina** | Il prodotto finito | Sì, l'albero completo |
| **Gruppo** | Un assieme di primo livello | Sì |
| **Sottogruppo** | Un assieme dentro un gruppo; può contenerne altri, senza limite | Sì |
| **Parte (lavorato)** | La foglia: il pezzo che si fa o si compra | Sì: **distinta parte + ciclo** |

**Comandi.** **Esporta Excel** / **Esporta PDF**; nella barra filtri, **Colonne** e
**+ Nuovo articolo**.

**Filtri.** Ricerca, tipo (i quattro qui sopra), famiglia, sottofamiglia.

**Da sapere — l'approvvigionamento delle parti.** Ogni parte dichiara come si ottiene, e la scelta
cambia due cose insieme:

| Approvvigionamento | Il costo viene da… | Nel fabbisogno… |
|---|---|---|
| **Produzione interna** | distinta parte + ciclo di lavorazione | l'app **scende dentro** e compra il materiale |
| **Acquisto da fornitore** | il prezzo scelto a listino | la parte è una **foglia d'acquisto**, la distinta non si esplode |

Le parti **nuove** nascono con l'impostazione predefinita (*Gestione → Impostazioni →
Approvvigionamento parte*; di serie: *Acquisto da fornitore*). Cambiare quell'impostazione vale
**solo per le prossime**: le parti già a catalogo restano come sono, perché cambiare
retroattivamente riscriverebbe il fabbisogno di lavori già avviati.

Una parte a *Produzione interna* **senza righe di ciclo** vale il prezzo a listino: non si finge
un costo che non c'è.

---

## 8. La scheda articolo, campo per campo

**Come ci si arriva.** **+ Nuovo articolo** in una delle due anagrafiche, oppure il comando
*Modifica articolo* su una riga esistente.

### I campi

| Campo | Quando serve | Note |
|---|---|---|
| **Parti da** | solo in creazione | Ricerca live: si sceglie un articolo esistente e la scheda si precompila con i suoi dati. Facoltativo. |
| **Tipo** | sempre | **Bloccato in modifica**: un commerciale non diventa una parte. |
| **Codice** | sempre | Proposto automaticamente (→ [cap. 9](#9-i-codici-automatici)). **Appena lo si edita a mano, l'app smette di rigenerarlo.** |
| **Nome** | tutti i tipi tranne le parti | Testo libero. |
| **Concetto** + **Descrizione** | **solo parti** | Il nome di una parte è composto: `ALBERO` + `motore 20×100` → `ALBERO motore 20×100`. Il concetto è **obbligatorio** e si sceglie dall'elenco di *Gestione → Concetti*. Sotto i due campi c'è l'anteprima del nome che ne esce. |
| **Unità di misura** | sempre | Dall'elenco di *Gestione → Unità di misura*. |
| **Approvvigionamento** | solo parti | *Produzione interna* / *Acquisto da fornitore* (→ [cap. 7](#7-anagrafica--progetto)). |
| **Fornitore e prezzo d'acquisto** | — | **Riquadro in sola lettura.** Mostra la quotazione in uso; il pulsante accanto apre il **listino**. |
| **Macrofamiglia** / **Sottofamiglia** | consigliato | Servono ai filtri, ai raggruppamenti e ai codici automatici. |
| **Macchina di appartenenza** / **Gruppo** / **Sigla** | codifica gerarchica | Dicono dove sta l'articolo nella struttura di prodotto, e da lì nasce il suo codice. |
| **Distinta parte e ciclo** | solo parti | Non si compila qui: c'è la nota e il pulsante **Apri il ciclo**. |
| **★ Preferito** | facoltativo | Ha un filtro dedicato nelle anagrafiche. |
| **⛔ Obsoleto** | facoltativo | Non più utilizzabile; resta visibile, spento. |
| **U.M. d'acquisto (se diversa)** + **Fattore di conversione** | quando si compra in un'unità e si usa in un'altra | Si compra la barra a pezzi da 6 m e la si consuma a metri. |
| **Scorta minima** | magazzino | Sotto questa quantità l'articolo compare fra i segnali del Riepilogo, e il netto la ricostituisce. |
| **Lotto di riordino** | magazzino | La quantità a cui si arrotondano gli acquisti. |
| **Il lotto è** | magazzino | *un multiplo esatto* (si ordina 100, 200, 300) oppure *una quantità minima* (sotto 100 non si ordina, sopra si ordina il fabbisogno esatto). |
| **Note** | facoltativo | Testo libero interno. |

In modifica, la scheda mostra anche un **pannello giacenza** con la situazione a magazzino, e in
fondo la **riga autore**: chi ha creato il record e chi l'ha aggiornato per ultimo, con data e ora.

### Le finestre che si aprono da qui

| Finestra | Cosa fa |
|---|---|
| **Listino fornitori** | Le quotazioni dell'articolo (→ [cap. 10](#10-listino-fornitori)) |
| **Dove è usato** | Chi lo contiene, con simulazione del costo (→ [cap. 11](#11-dove-è-usato-e-simulazione-del-costo)) |
| **Scheda completa** | La scheda di sola lettura, tutto insieme |
| **Duplica** | Crea un nuovo articolo copiando questo |

---

## 9. I codici automatici

Bomtrack propone il codice di ogni nuovo articolo. Il codice proposto **resta modificabile**: si
può scrivere il proprio, e appena lo si tocca l'app smette di rigenerarlo mentre si compila il
resto della scheda.

Gli schemi sono due.

### Schema gerarchico — la struttura di prodotto

Si usa per macchine, gruppi, sottogruppi e parti che appartengono a una macchina. Ogni macchina ha
una **sigla** e definisce lo schema dei codici sotto di sé.

```
Macchina:      TRN-S00        progressivo a SALIRE da 0
Gruppo:        TRN-BAS-S00    progressivo a SALIRE da 0
Sottogruppo:   TRN-BAS-999    a SCENDERE da 999
Parte:         TRN-BAS-001    a SALIRE da 001
```

Sottogruppi e parti condividono lo stesso spazio di numerazione ma partono dai due estremi: i
sottogruppi scendono da 999, le parti salgono da 001. Così non si scontrano mai, e a colpo d'occhio
si distinguono.

Le **sigle sono univoche** nel loro ambito: due gruppi della stessa macchina non possono chiamarsi
entrambi `BAS`.

### Schema per famiglia — quello che si compra

Si usa per materie prime, commerciali, e per le parti non legate a una macchina.

```
MAT-ACC-LAM-001     materia prima · famiglia ACC(iaio) · sottofamiglia LAM(iere)
CMM-MEC-CUS-001     commerciale   · famiglia MEC(canica) · sottofamiglia CUS(cinetti)
PRT-…               parte non legata a una macchina
```

I **prefissi** e il **numero di cifre** si cambiano in *Gestione → Impostazioni → Codifica
automatica articoli*: di serie `CMM` per i commerciali, `MAT` per le materie prime, `PRT` per le
parti, con 3 cifre.

---

## 10. Listino fornitori

**A cosa serve.** È **l'unico posto dove nasce un prezzo d'acquisto**. Non si scrive un prezzo
nella scheda articolo: si registra una **quotazione** nel listino, e poi si sceglie quale delle
quotazioni è quella in uso.

**Come ci si arriva.** Dal pulsante nel riquadro *Fornitore e prezzo d'acquisto* della scheda
articolo, dal pannello laterale (*Listino fornitori*), o dalla scheda di sola lettura.

**Cosa si vede.** Le quotazioni dell'articolo, una per riga:

| Campo | Significato |
|---|---|
| **Fornitore** | Chi la offre |
| **Codice presso il fornitore** | Come lo chiama lui: serve a scriverlo giusto sull'ordine |
| **Descrizione presso il fornitore** | Idem |
| **Prezzo** | L'importo |
| **U.M. del prezzo** | A che unità si riferisce |
| **Q.tà minima** | Sotto la quale il prezzo non vale |
| **Giorni di consegna** | Il lead time dichiarato |
| **Data** | Quando la quotazione è stata raccolta |

**Da sapere.**

- **Vale per tutto**: commerciali, materie prime **e parti** acquistate.
- **Le richieste di offerta alimentano il listino**: il pulsante **Registra a listino** di una RFQ
  trasforma i prezzi tornati in quotazioni, con il riferimento alla richiesta da cui vengono.
- **Il prezzo che entra nella costificazione si sceglie esplicitamente.** Più quotazioni possono
  convivere; una sola è quella in uso. Il Riepilogo segnala quanto si risparmierebbe scegliendo
  ovunque la più bassa.
- Un articolo senza nessuna quotazione compare fra i segnali «articoli d'acquisto senza prezzo».

---

## 11. Dove è usato e simulazione del costo

**A cosa serve.** Rispondere a due domande: «se cambio questo articolo, chi ne risente?» e
«se questo prezzo cambiasse, quanto costerebbe la macchina?».

**Come ci si arriva.** Dal pannello laterale (*Dove è usato e impatto costi*), dalla scheda
articolo, o dalla scheda di sola lettura.

**Cosa si vede.** L'elenco degli assiemi che contengono l'articolo, e sopra di quelli le
**macchine impattate**, con il costo attuale di ciascuna.

**La simulazione.** Il campo **Simula un costo diverso**: si scrive un prezzo e si vede subito
l'effetto sul costo delle macchine, riga per riga.

> **Non salva niente.** Chiudendo la finestra il costo simulato sparisce e l'articolo resta al suo
> prezzo. È esattamente il motivo per cui si può aprire in mezzo a qualunque lavoro.

---

## 12. Pannello laterale e selezione multipla

**A cosa serve.** Tenere sotto mano i comandi e le schede dell'articolo scelto nell'elenco, senza
aprire e chiudere finestre.

**Come ci si arriva.** `Ctrl+I` (⌘I), oppure il comando nell'intestazione dell'elenco.
Vale per **Acquisti, Progetto e Magazzino**.

**Cosa si vede.** Una colonna a destra, **ridimensionabile trascinandone il bordo**, con un
riepilogo dell'articolo scelto (costo, giacenza, impieghi) e sotto i comandi e le schede.

**I comandi — su un articolo (Acquisti, Progetto):**

- Modifica articolo · Duplica · Listino fornitori · **Distinta parte e ciclo** (solo parti) ·
  Dove è usato e impatto costi · Scheda completa · Elimina articolo.

**I comandi — su una giacenza (Magazzino):**

- Rettifica giacenza · Movimenti (N) · Dove è usato e impatto costi · Modifica articolo ·
  Scheda completa.

**Le schede:** **Scheda** (l'anagrafica) · **Listino** · **Dove è usato**.

**La selezione multipla.**

| Gesto | Effetto |
|---|---|
| Click | Sceglie una riga |
| **Ctrl+click** | Aggiunge una riga alla scelta |
| **Maiusc+click** | Prende tutto quello che sta in mezzo |
| **↑ ↓** | Scorre le righe |
| **Maiusc+↑ ↓** | Estende la scelta |
| **Invio** | Apre la scheda completa |
| **Esc** | Deseleziona |

Con **più righe scelte** il pannello passa alle **azioni di massa**, e mostra l'elenco di ciò su
cui sta per agire:

- *Segna come non più utilizzabili* / *Rendi di nuovo utilizzabili*
- *Segna preferiti (N)* / *Togli dai preferiti*
- Esporta la selezione in **Excel** o **PDF**
- *Elimina N articoli*

**Da sapere.** Con il pannello aperto **la colonna dei pulsanti sparisce dall'elenco**: i suoi
comandi sono nel pannello, scritti per esteso invece che a icone. Chiudendolo torna dov'era.
Larghezza, apertura e scheda scelta restano fra una sessione e l'altra.

---

# Parte IV — Il prodotto

## 13. Distinta base → Gestione DB

**A cosa serve.** Costruire l'albero della macchina: cosa contiene, in che quantità, con quali
lavorazioni. La schermata si intitola **«Distinta Base & Costificazione»**.

**Come ci si arriva.** 🌳 *Distinta base → Gestione DB*.

**Cosa si vede.**

- In alto la **barra revisioni**: il badge `Rev. X · N rilasciate`, **Nuova revisione**,
  **Storico revisioni** (→ [cap. 15](#15-revisioni)).
- Le **card di costo** unitario: Materiale · Commerciali · Parti · Lavorazioni · Spese generali ·
  **Costo totale** · **Prezzo vendita**.
- L'**albero** multi-livello, con la **numerazione di posizione**: `1`, `1.1`, `1.1.1`, `1.2`,
  `2`… Colonne: Articolo, Q.tà, U.M., Costo un., **Scarto %**, Costo riga, Azioni.

**Comandi.**

| Comando | Cosa fa |
|---|---|
| **Modifica testata** | Le proprietà della distinta (vedi sotto) |
| **Elimina** | Cancella la distinta |
| **+ Aggiungi componenti** | Apre il pannello laterale ridimensionabile per pescare dagli archivi |
| **+ Aggiungi lavorazione** | Aggiunge una fase all'assieme (il montaggio) |
| **⊞ Espandi tutto** / **⊟ Comprimi tutto** | Apre e chiude tutti i rami |

**Filtri.** Ricerca «Cerca codice o nome distinta…»; **livello** (Tutti i livelli · Macchine ·
Gruppi · Sottogruppi); **macchina di appartenenza**; il menu della distinta aperta; il contatore.

> **La distinta aperta resta sempre raggiungibile**, anche quando il filtro la escluderebbe: non
> sparisce sotto le mani mentre ci si lavora.

**La finestra «Modifica testata».**

| Campo | Note |
|---|---|
| Codice · U.M. · Nome | **Bloccati**: si modificano in *Anagrafica → Progetto* |
| **Spese generali % (override)** | Sostituisce la percentuale globale, solo per questa macchina |
| **Margine % (override)** | Idem |
| Note | Testo libero |

**Da sapere.**

- I sottogruppi possono contenere altri sottogruppi, **senza limite di profondità**.
- La **percentuale di scarto** di una riga aumenta la quantità che serve davvero: 10 pezzi con
  5% di scarto sono 10,5 pezzi di materiale.
- I **riferimenti ciclici** (A contiene B che contiene A) sono rilevati e impediti, sia nella
  distinta sia nel ciclo. Se ne resta uno, un **avviso rosso** nomina l'articolo coinvolto invece
  di far comparire un costo tronco che sembrerebbe buono.

---

## 14. Cicli di lavorazione

**A cosa serve.** Dire come si fa una **parte**: che materiale consuma e quali fasi attraversa.
È da qui che nasce il costo di una parte a produzione interna, il carico dei centri e gli ordini
di lavoro ai terzisti.

**Come ci si arriva.** 🔧 *Cicli di lavorazione → Cicli di lavorazione*.

**Cosa si vede.**

- I filtri e il **menu di scelta della parte**;
- la **barra revisioni** della parte;
- le card: *Distinta parte* · *Lavorazioni* · *Costo unitario a mano* · **Costo parte**;
- una nota in testa che dice **da dove viene il costo** di quella parte, secondo il suo
  approvvigionamento;
- le due sezioni: **Distinta parte** e **Ciclo di lavorazione**.

**Filtri.** Ricerca, famiglia, sottofamiglia, e il menu della parte.

### La distinta parte

Il materiale e i commerciali che servono a fare il pezzo. Pulsante **+ Articolo**.

| Colonna | Note |
|---|---|
| Voce | L'articolo |
| Fornitore | Da chi si compra |
| U.M. · Q.tà | Quanto ne serve per **un** pezzo |
| **Costo (€/U.M.)** | Il costo a listino, **sovrascrivibile** sulla riga |
| Costo riga | Q.tà × costo |

### Il ciclo di lavorazione

Le fasi, numerate **10, 20, 30…** e riordinabili con le frecce ↑ ↓ (la numerazione a decine lascia
posto per infilarne una in mezzo).

| Campo della fase | Note |
|---|---|
| **Centro di lavoro** | Dall'elenco di *Gestione → Centri di lavoro* |
| **Interna / Conto lavoro** | Se conto lavoro, si sceglie il **fornitore** |
| **Costo** | *Fisso* oppure *Orario* |
| **Ore (h)** | Fase **interna**: le ore che il pezzo occupa il centro |
| **Giorni (gg)** | Fase in **conto lavoro**: i giorni di attraversamento dal terzista |
| **Costo (€)** o **Tariffa (€/h)** | Secondo il modo scelto |
| Nota | Testo libero, finisce sull'ordine di lavoro |

**Da sapere — la differenza che conta di più.**

| | Fase **interna** (senza fornitore) | Fase in **conto lavoro** (con fornitore) |
|---|---|---|
| Si dichiara | **ore** | **giorni di attraversamento** |
| Nel costo | ore × tariffa del centro | il prezzo del terzista |
| Nel fabbisogno | non compare: non si compra | compare in *Da far lavorare fuori* |
| Nel Carico centri | **carica il centro** | non carica nessun centro |
| Genera | — | un **ordine di lavoro** |

Una fase interna a **costo fisso** dichiara comunque le ore, e quelle ore caricano il centro: il
prezzo è una cosa, l'occupazione della macchina è un'altra. Una fase in conto lavoro a **costo
orario** dichiara anche le ore, che lì sono le ore che il terzista fattura.

**Ogni modifica si salva subito.** Non c'è un pulsante Salva in questa vista.

---

## 15. Revisioni

**A cosa serve.** Congelare com'era una distinta in un certo momento, e poterci tornare.

**Come ci si arriva.** Dalla barra revisioni, in cima a *Gestione DB* (per gli assiemi) e a
*Cicli di lavorazione* (per le parti).

**Come funziona.** Ogni assieme e ogni parte ha una **revisione in lavorazione**, identificata da
una lettera che parte da `A`. Ci si lavora liberamente.

**Rilascia revisione** (pulsante **Nuova revisione**) fa tre cose:

1. chiede il **motivo** del rilascio;
2. **congela** la distinta com'è adesso, con il costo di oggi;
3. passa alla lettera successiva, che diventa quella in lavorazione.

**Storico revisioni** mostra le revisioni rilasciate, con data, autore e motivo.
**Confronta revisioni** mette due revisioni a fianco e dice cosa è **aggiunto**, cosa **rimosso** e
cosa **modificato**.

**Da sapere.** Se dall'ultimo rilascio non è cambiato niente, l'app lo dice invece di creare una
revisione identica alla precedente.

---

## 16. Costificazione — Visualizza DB

**A cosa serve.** Leggere quanto costa una macchina e perché. La schermata si intitola
**«Costificazione & Report»**.

**Come ci si arriva.** 🌳 *Distinta base → Visualizza DB*.

**Comandi.** Il menu **Macchina / Prodotto** per scegliere cosa costificare; **Esporta Excel** e
**Esporta PDF**.

**Cosa si vede.**

1. Le **card di costo**: Materiale · Commerciali · Parti · Lavorazioni · Spese generali ·
   **Costo totale** · **Prezzo vendita**.
2. **Incidenza voci di costo** — barre proporzionali con importo e percentuale, e il pulsante
   **Da dove viene questo costo**, che apre l'elenco degli articoli che pesano di più, sommati per
   articolo.
3. **Distinta base esplosa** — Pos. · Codice · Articolo · Tipo · Q.tà · Costo un. · Costo riga.

### La formula

```
costo         = Σ (componenti × q.tà × (1 + scarto%))     ← materiale, commerciali, sotto-assiemi
              + Σ (lavorazioni: ore × tariffa €/h)        ← manodopera interna
              + Σ (lavorazioni in conto lavoro)           ← quello che si paga fuori

costo totale  = costo + spese generali (overhead %)

prezzo vendita = costo totale × (1 + margine %)
```

Le due percentuali stanno in *Gestione → Impostazioni* (di serie: **12%** di spese generali,
**20%** di margine), e si possono sovrascrivere per singola macchina da *Modifica testata*.
Sono ammessi valori da 0 a 1000%.

**Il costo si calcola per ricorsione**: il costo di un gruppo è la somma dei suoi figli, e il costo
di una parte è la somma della sua distinta parte più il suo ciclo. Non ci sono costi «congelati» da
aggiornare a mano: cambiando il prezzo di una vite, il costo della macchina cambia subito.

---

# Parte V — Le operazioni

## 17. Magazzino

**A cosa serve.** Lo stato delle giacenze di tutto ciò che si tiene a scaffale.

**Come ci si arriva.** 📦 *Magazzino*.

**Cosa si vede.** **Commerciali, materie prime e parti insieme, in una lista sola**: il magazzino
non conosce la divisione fra acquisti e progetto. Gli **assiemi restano fuori** — si producono,
non si stoccano.

In testa quattro **KPI**: *Articoli a magazzino* · *Sotto scorta minima* · *Con merce in arrivo* ·
**Valore giacenza (€)**.

**Le colonne, e come si calcolano.**

| Colonna | Significato | Da dove viene |
|---|---|---|
| **Esistente** | Quello che c'è adesso a scaffale | ricevuto sugli ordini **+** movimenti |
| **In arrivo** | Ordinato e non ancora entrato | ordini aperti |
| **Impegnato** | Promesso ai piani aperti | fabbisogno dei piani aperti |
| **Libero** | Quello di cui si può davvero disporre | `esistente + in arrivo − impegnato` |
| **Scorta min.** | La soglia sotto cui si avvisa | dalla scheda articolo |
| **Lotto** | Il lotto di riordino | dalla scheda articolo |

> **Nessuno di questi campi è scrivibile.** Sono tutti calcolati. Per cambiare l'esistente si
> registra un **movimento**.

**Comandi.** **Presso terzi (N)** (compare solo se c'è qualcosa fuori) · **Esporta Excel** ·
**Esporta PDF**. Nella barra filtri, **Colonne**.

**Filtri.** Ricerca, tipo (Componente commerciale · Materia prima · Parte), famiglia,
sottofamiglia, e il filtro di **stato**:

- *Sotto la scorta minima*
- *Giacenza a zero*
- *Con giacenza*
- *Libero negativo* — si è promesso più di quanto si abbia e si aspetti
- *Presso terzi o in lavorazione*

### I movimenti

**La finestra «Rettifica giacenza»** — dalla riga o dal pannello laterale. Campi: **Tipo
movimento**, **Quantità**, (per il conto lavoro) **Terzista** e **Ordine di conto lavoro**,
**Nota**, e il pulsante **Registra**. Ogni tipo porta il suo suggerimento contestuale.

**I sei tipi di movimento:**

| Tipo | Effetto sulla giacenza | Quando si usa |
|---|---|---|
| **Rettifica inventario** | si scrive la quantità **contata**, l'app registra la differenza | dopo l'inventario |
| **Carico manuale** | **+** somma | merce entrata senza un ordine |
| **Consumo di produzione** | **−** sottrae | materiale prelevato per produrre |
| **Uscita a conto lavoro** | **−** sottrae | materiale spedito a un terzista |
| **Rientro da conto lavoro** | **+** somma | il pezzo finito che torna |
| **Passaggio di lavorazione** | **nessuno** | il pezzo va da un terzista al successivo |

**Perché il passaggio non muove niente.** Un pezzo che torna da Beta per andare da Gamma **cambia
luogo a quantità invariata**. Contarlo come carico e poi come scarico farebbe comparire a scaffale
un semilavorato che a scaffale non c'è mai stato, e il codice prodotto si caricherebbe una volta
per ogni terzista che l'ha toccato. Il passaggio si registra solo dalla riga di un ODL, e porta
due fornitori: *dove va* e *da dove viene*.

**La finestra «Movimenti»** mostra lo storico dell'articolo, con la possibilità di eliminare una
riga sbagliata.

### Materiale presso terzi

Il pulsante **Presso terzi (N)** apre il prospetto di cosa sta fuori, **raggruppato per
fornitore**, con *Uscito* / *Rientrato* / **Ancora fuori** e il riferimento all'ordine.
Ha il suo export Excel e PDF.

In fondo c'è il blocco **«in casa, fra due fasi»**: i pezzi tornati da un terzista e non ancora
ripartiti per il successivo. È **un luogo a sé** — esistono, non sono a scaffale, e non sono da
nessuno.

> Anche questo prospetto è **calcolato dai movimenti**, non un saldo scritto da qualche parte.

### I ricevimenti

Attenzione a una cosa: **il magazzino si carica anche dai ricevimenti degli ordini**, senza
movimenti. Quando si scrive *ricevuto 50* su una riga d'ordine, quei 50 entrano nell'esistente.
È comodo — un ricevimento sbagliato si corregge in un posto solo — e ha una conseguenza:

> ⚠️ **Cancellare un ordine già ricevuto toglie la sua merce dal magazzino.** È coerente, ma chi
> cancella un ordine vecchio va avvisato.

---

## 18. Commesse

**A cosa serve.** La commessa è **il cliente e la data a monte del lavoro**. Ci si agganciano
piani di fabbisogno, richieste e ordini, e la sua scheda dice in ogni momento se il materiale c'è.

**Come ci si arriva.** 📨 *Documenti → Commesse*.

**Comandi dell'elenco.** **+ Nuova commessa** · **Esporta Excel** · **Esporta PDF**.

**Filtri.** Ricerca «Numero, cliente o descrizione…»; **filtro per periodo** sulla data di
apertura (*dal … al …*, aperto anche da un lato solo); il contatore.

**I campi della commessa.**

| Campo | Note |
|---|---|
| **Cliente** | Con i suggerimenti dall'anagrafica di *Gestione → Clienti*: due commesse dello stesso cliente non si chiamano più «Rossi Srl» e «Rossi S.r.l.» |
| **Descrizione** | Che lavoro è |
| **Riferimento cliente** | Il numero d'ordine del cliente |
| **Stato** | I quattro qui sotto |
| **Data apertura** | Quando è entrata |
| **Consegna al cliente** | La data che conta |
| **Note** | Testo libero |

**I quattro stati.**

| Stato | Significato |
|---|---|
| **Aperta** | Acquisita, non ancora avviata |
| **In produzione** | Si sta facendo |
| **Chiusa** | Consegnata |
| **Annullata** | Non si fa più |

Mettendola **In produzione**, l'app chiede conferma **nominando i codici mancanti e la data di
consegna**. Avvisa, non blocca: la decisione resta a chi la prende.

**Cosa si vede nella scheda.**

- I **KPI**: Ordinato · Già ricevuto · Ancora atteso · Piani di fabbisogno · l'indicatore di
  copertura.
- **Copertura materiale** — la sezione che risponde a «il materiale c'è?», divisa in tre:
  cosa è ancora **da ordinare**, cosa sta in un documento **non ancora inviato**, cosa
  **arriva dopo la data in cui serve**.
- **Fabbisogni**, **Richieste di offerta**, **Ordini a fornitore**, **Ordini di lavoro** — le
  quattro liste di quello che pende sotto la commessa, ogni riga con **Apri →**.

**Da sapere.** I piani della stessa commessa **si sommano prima di guardare il magazzino**: due
piani della stessa commessa non si contendono la stessa merce. Se non ci sono piani aperti, la
scheda lo dice, invece di dichiarare tutto coperto.

---

## 19. Fabbisogno materiali

**A cosa serve.** Trasformare «tre macchine per il 15 marzo» in una lista d'acquisto, un elenco di
parti da fare e un elenco di lavorazioni da commissionare.

**Come ci si arriva.** 📨 *Documenti → Fabbisogno*.

**Comandi dell'elenco.** **+ Nuovo piano** · **Esporta Excel** · **Esporta PDF**.
I badge di riga dicono `aperto` o `chiuso`.

**Filtri.** Ricerca «Numero o titolo…»; periodo; contatore.

**La toolbar del piano.**

| A sinistra | A destra |
|---|---|
| chiudi · numero del piano · **Aperto — chiudi** / **Chiuso — riapri** · **Duplica** · **Elimina** | **Genera richieste (N)** · **Genera ordini (N)** · **Genera ordini di lavoro (N)** · **Esporta Excel** · **Esporta PDF** |

**I campi di testata.** Titolo · Data · **Consegna richiesta** · **Commessa** · Note.

### Le sezioni

**Da produrre** — quello che si chiede al piano. Pulsante **+ Aggiungi al piano**; colonne Codice,
Articolo, U.M., **Q.tà**, **Serve per** (la data), elimina.

**I KPI** — Totale acquisti · Articoli da comprare · Fornitori coinvolti · Parti da fabbricare ·
Conto lavoro.

**Da acquistare** — la lista consolidata, con due interruttori:

- **☑ Fabbisogno netto** — toglie quello che c'è già (vedi sotto);
- **☑ Raggruppa per fornitore** — riordina la lista per chi la deve vendere.

Gli **indicatori di riga**:

| Indicatore | Significato |
|---|---|
| `↓ risparmio` | Esiste a listino una quotazione più bassa di quella in uso |
| `⚠ sotto il minimo` | La quantità è sotto la q.tà minima del fornitore |
| `⚠ senza prezzo` | L'articolo non ha nessuna quotazione |
| `↑ lotto` / `↑ minimo` | La quantità è stata alzata al lotto di riordino |
| `✓ coperto` | Non serve ordinare niente |
| *(impegno)* | Quanta parte è impegnata da altri piani |

**Da far lavorare fuori** — le fasi di ciclo affidate a un terzista. **Il netto non si applica
qui**, ed è dichiarato in pagina: una fase non sta a scaffale, e sapere quanti pezzi sono già stati
lavorati richiederebbe un avanzamento di produzione che l'app non ha.

**Da fabbricare** — le parti a produzione interna che il piano richiede.

**Carico dei centri** — la stessa tavola del [cap. 23](#23-carico-dei-centri-di-lavoro), ristretta
a questo piano.

In fondo, l'elenco dei **documenti generati** dal piano.

### Il fabbisogno netto

```
netto = lordo + scorta minima + impegnato − esistente − in arrivo
```

poi arrotondato al **lotto di riordino** dell'articolo, secondo il suo modo (*multiplo esatto* o
*quantità minima*).

Il termine **impegnato** è quello che fa la differenza: è la merce che **gli altri piani aperti**
hanno già promesso a sé. Senza quel termine, due piani si dichiarerebbero coperti con lo stesso
pezzo, e uno dei due resterebbe a mani vuote.

**Piano aperto e piano chiuso.** Finché un piano è **aperto**, impegna. Un piano che non serve più
si **chiude**, e la sua quota torna libera per gli altri. Un piano chiuso non sparisce: resta
consultabile, smette solo di impegnare. Si riapre quando serve.

### Generare i documenti

I tre pulsanti **Genera richieste / ordini / ordini di lavoro** aprono la stessa finestra: le righe
**raggruppate per fornitore**, ciascuna con la sua casella di selezione e la quantità — dichiarata
come netta o lorda secondo l'interruttore attivo. Si spunta cosa includere e si conferma. Ne esce
**un documento per fornitore**.

---

## 20. Richieste di offerta (RFQ)

**A cosa serve.** Chiedere un prezzo. Numerazione **`RFQ-<anno>-NNN`**.

**Come ci si arriva.** 📨 *Documenti → Richieste offerta*.

**Comandi dell'elenco.** **+ Nuova richiesta** · **Confronta offerte** · **Esporta Excel** ·
**Esporta PDF**.

**Filtri.** Ricerca «Cerca numero, oggetto, fornitore o riga…» (cerca **anche dentro le righe** del
documento); **Tutti gli stati**; **Tutti i fornitori** (con la voce «senza fornitore»); **periodo**;
contatore; **✕ Azzera filtri**, che compare solo quando c'è un filtro attivo.

**La toolbar del documento.**

| A sinistra | A destra |
|---|---|
| chiudi · numero · badge di stato · **Salva** · **Elimina** | **Crea ordine** |

**I campi di testata.**

| Campo | Note |
|---|---|
| **Titolo / oggetto** | Di cosa si tratta |
| **Fornitore** | A chi si chiede |
| **Data** | Del documento |
| **Stato** | Bozza · Inviata · Offerta ricevuta · Chiusa |
| **Tipo di trasporto / resa** | Con i suggerimenti da *Gestione → Condizioni offerta*; si precompila con quello predefinito del fornitore |
| **Tipo di pagamento** | Idem |
| **Note per il fornitore** | Escono sul documento |
| 🔒 **Note interne** | **Non compaiono mai su PDF ed Excel.** Restano nell'app, passano alla richiesta convertita in ordine, e sono modificabili in qualunque stato |

**Le righe.** Pulsanti **+ Da catalogo** (con i filtri per tipo e famiglia) e **+ Riga manuale**
(Descrizione, Codice opzionale, U.M., Quantità, Nota — per quello che non è a catalogo).

La tabella è **a due piani**: le colonne sono coppie, una sopra l'altra —
Codice/Descrizione · Q.tà/U.M. · Prezzo unit./Importo · Data consegna · Modifica/Elimina.
Dodici colonne su una riga sola costringerebbero a scorrere in orizzontale, e il codice uscirebbe
di vista; così le due metà si leggono insieme. **Una riga di documento resta un solo rigo.**

**Il documento.** La barra **Documento di richiesta** ha **Genera documento PDF** e
**Genera documento Excel**. Sono **disabilitati finché ci sono modifiche non salvate**: non si
manda a un fornitore un documento diverso da quello che si ha in archivio. Il **PDF è bilingue
italiano/inglese**.

**I prezzi di ritorno.** Quando arriva l'offerta si scrivono i prezzi nelle righe. La barra
**Prezzi d'offerta** ha il pulsante **Registra a listino (N)**, che trasforma quei prezzi in
quotazioni negli articoli (→ [cap. 10](#10-listino-fornitori)).

**Confronta offerte.** Sotto-vista che mette a fianco i prezzi di più richieste sullo stesso
materiale.

**Da sapere.** Una richiesta può contenere **insieme materiale e lavorazioni** dello stesso
fornitore — chiedere quanto costa il pezzo e quanto costa lavorarlo è una domanda sola.
Convertendola, la richiesta **si divide** nei due ordini: l'ODA per la merce, l'ODL per le
lavorazioni.

---

## 21. Ordini a fornitore (ODA)

**A cosa serve.** Comprare merce. **Gli ODA non contengono lavorazioni**: quelle stanno negli ODL.

**Come ci si arriva.** 📨 *Documenti → Ordini*.

**Da dove nasce un ordine.** Da una **richiesta di offerta** (pulsante *Crea ordine*), da un
**piano di fabbisogno** (*Genera ordini*), oppure **da zero** con **+ Nuovo ordine**.

**Comandi dell'elenco.** **+ Nuovo ordine** · **Esporta Excel** · **Esporta PDF**.
Stessi filtri delle richieste.

**La toolbar del documento.** chiudi · numero · badge di stato · **Salva** · **Elimina**.

**I campi di testata.** Come la richiesta, più:

| Campo | Note |
|---|---|
| **N° conferma d'ordine fornitore** | Il numero che il fornitore restituisce. **Compilandolo, lo stato passa a *Confermato*.** |

**Le righe.** **+ Da catalogo** · **+ Riga manuale** · **✓ Segna tutto ricevuto**.
Tabella a due piani: # · Codice/Descrizione · Q.tà/U.M. · Prezzo unit./Importo ·
**Richiesta/Confermata** (le due date) · **Ricevuto/Residuo** · azioni.
In fondo il **Totale imponibile**.

**Il documento.** La barra **Documento d'ordine**: **Genera documento PDF** /
**Genera documento Excel**.

**Da sapere.**

- Se il fornitore conferma una data **oltre** quella richiesta, l'app lo dice **in rosso** sulla
  riga, con i giorni di ritardo.
- **Il ricevimento carica il magazzino.** Non serve registrare anche un movimento; anzi, farlo
  raddoppierebbe la merce.
- Lo stato passa da solo a **Parziale** e poi a **Evaso** man mano che si registrano i ricevimenti.

---

## 22. Ordini di lavoro (ODL) e conto lavoro

Questo è il capitolo più delicato, e conviene leggerlo per intero prima di registrare il primo
movimento di conto lavoro. Numerazione **`ODL-<anno>-NNN`**.

**A cosa serve.** Una fase del ciclo con un **fornitore** è una lavorazione affidata a un terzista,
ed è denaro che esce come qualunque acquisto. L'ODL è il suo documento: elenco proprio, numerazione
propria, stampa propria.

**Come ci si arriva.** 📨 *Documenti → Ordini di lavoro*.

### Uno per terzista *e per passata*

Le fasi affidate a Beta finiscono in un ODL solo, anche se sono di parti diverse. Ma un pezzo che
torna da Beta una **seconda** volta — fasi 20 e 40, con la 30 in mezzo altrove — finisce in un
**secondo** ODL: fra le due il pezzo torna da noi, e chiedergliele insieme sarebbe un ordine che
non si può eseguire di seguito.

*(La **richiesta d'offerta** invece le tiene insieme: chiedere non è commissionare.)*

### La tratta

Una riga di ODL è una **tratta**: le fasi **consecutive** dello stesso terzista stanno insieme —
«fasi 20-30» — perché sono **una** lavorazione da commissionare e non due. Prezzo e giorni sono
sommati, e il dettaglio di ciascuna fase sta nella nota.

La riga porta il **codice della parte** (è il pezzo che il terzista riceve e rispedisce), i
**pezzi** come quantità, e la tariffa del ciclo come prezzo. A costo orario la nota dice
*ore/pezzo × tariffa*.

### I campi

**Testata**: Titolo/oggetto · **Terzista** · Data ordine · Stato · Trasporto · Pagamento ·
**N° conferma del terzista** · Note · 🔒 Note interne.

**Righe — «Lavorazioni»**: **+ Lavorazione da ciclo** · **+ Riga manuale** ·
**✓ Segna tutto rientrato**.
Tabella a due piani: # · **Parte/Lavorazione** · **Pezzi/U.M.** · **Tariffa (€/pz)/Importo** ·
**Richiesta/Confermata** · **Rientrati/Ancora fuori**.

**Scrivere un ODL a mano.** *+ Lavorazione da ciclo* fa scegliere la parte fra quelle che un ciclo
ce l'hanno, poi la tratta, poi i pezzi. Si vedono **tutte** le fasi — anche quelle di un altro
terzista e quelle interne, marcate — perché mandare fuori una lavorazione che di solito si fa in
casa è un caso vero. La riga che ne esce è identica a quella generata dal fabbisogno; l'ordine però
**non è legato a nessun piano**, e lì la fase continuerà a risultare da ordinare.

Le fasi **senza** fornitore sono interne e restano fuori dagli ODL: non si comprano, si vedono nel
Carico centri.

### Il magazzino si muove in due punti soli

E sono i **due estremi del ciclo**, non quelli del documento.

```
   MAGAZZINO                                                    MAGAZZINO
       │                                                            ▲
       │ ── SCARICO ──▶  Beta  ──passaggio──▶  Gamma  ── CARICO ────┘
       │  materiale del    fase 20            fase 30    pezzo finito
       │  ciclo                                          (in casa)
   (fase 10 interna)
```

| Momento | Movimento | Effetto |
|---|---|---|
| **Prima tratta esterna** | Uscita a conto lavoro | **−** esce il materiale del ciclo |
| **Ogni estremo in mezzo** | Passaggio di lavorazione | **nessuno**: cambia il luogo |
| **Ultima tratta** | Rientro da conto lavoro | **+** entra il pezzo finito |

**Perché.** Senza questa distinzione, una parte lavorata due volte dallo stesso terzista farebbe
uscire il materiale due volte e caricare il pezzo due volte. Due fasi dallo stesso terzista sono
**due lavorazioni sullo stesso pezzo**, non due pezzi.

**Il materiale esce una volta sola**, alla prima fase di ogni parte, ed è quello scritto nel suo
**ciclo di lavorazione** — le stesse righe che il fabbisogno ha già fatto comprare — con le
quantità proposte in automatico: *q.tà del ciclo × pezzi dell'ordine*.
**I pezzi rientrano una volta**, all'ultima fase. Le fasi in mezzo **non muovono il magazzino e lo
dicono**, invece di offrire un comando che farebbe uscire la stessa merce due volte.

La scheda propone sempre il **residuo** — quanto resta da spedire o da far rientrare — e a residuo
zero lo dice, invece di riproporre il modulo come se niente fosse.

### Rientrati ≠ caricato

> Il campo **Rientrati** sull'ODL significa **pezzi tornati**: porta l'ordine a *Parziale* e poi a
> *Evaso*, ma **non carica il magazzino**. Quello lo fanno i movimenti di conto lavoro.
> Sono due domande diverse — «l'ordine è finito?» e «il pezzo è a scaffale?» — e hanno due
> risposte diverse.

---

## 23. Carico dei centri di lavoro

**A cosa serve.** Sapere quante ore i piani stanno chiedendo a ciascun centro, settimana per
settimana, e se il centro regge. La schermata si intitola **«Carico centri di lavoro»**.

**Come ci si arriva.** 🔧 *Cicli di lavorazione → Carico centri*.
La stessa tavola, ristretta a un solo piano, sta anche in fondo alla scheda di ogni piano.

**È un prospetto derivato, in sola lettura.** Non c'è niente da compilare.

**Comandi.** **Esporta Excel** · **Esporta PDF**.

**Filtri.** **Tutti i piani aperti (N)** oppure un piano solo; **Tutti i centri** oppure un centro
solo. Cliccando il nome di un centro, le letture si restringono a quello.

**Cosa si vede.**

1. **L'avviso di sovraccarico** in testa, con le settimane sfondate e i centri nominati.
2. Il **grafico a barre** per centro — una barra per settimana, la capacità come linea:

   | Colore | Saturazione |
   |---|---|
   | neutro | sotto l'85% |
   | arancio | 85–100% |
   | rosso | oltre il 100% |

   Il grafico serve a dire **dove guardare**: ogni barra porta comunque il suo numero, e la tavola
   resta la lettura esatta.
3. La **tavola centro × settimana** con la saturazione in percentuale.
4. **I codici da produrre**: codice, pezzi, settimana, e le fasi interne con ore/pezzo e ore
   totali, ordinati per settimana e per ore decrescenti. È la risposta a «cosa lancio per primo».

**Il dettaglio di cella.** Cliccando una cella si apre **chi** ha portato quelle ore: parte, fase,
piano.

**Da sapere — quattro avvertimenti**, perché il prospetto non prometta più di quel che dà:

1. **La capacità è infinita.** Il sovraccarico **si vede, non si sposta**: non c'è schedulazione,
   né calendario, né data di avvio di una fase.
2. **Le ore stanno nella settimana in cui il pezzo serve pronto**, non in quella in cui si lavora.
   È una lettura della **domanda**, non una programmazione.
3. **Le fasi in conto lavoro non caricano nessun centro interno**: quelle si comprano, e stanno nel
   fabbisogno.
4. **Capacità 0 = «non dichiarata»**, non «nessuna capacità». Un centro senza capacità mostra le
   ore e non il sovraccarico.

E una regola di lettura: **i pezzi di un codice non si sommano fra le sue fasi** — ogni fase lavora
gli stessi pezzi — **mentre le ore sì**.

---

# Parte VI — Amministrazione

## 24. Gestione

**Come ci si arriva.** ⚙️ *Gestione*. **La voce è visibile ai soli amministratori.**

Quattordici schede. Sono gli archivi che alimentano i menu a tendina di tutto il resto dell'app.

### 👥 Utenti

Elenco con nome, email, ruolo e stato *Attivo / Sospeso*. Azioni per riga: **Modifica**,
**Imposta password**, **Sospendi / Riattiva**, **Elimina**.
Form del nuovo utente: Nome e cognome · Email · Username (facoltativo) · **Ruolo** · **Colore** ·
Password iniziale. → [cap. 25](#25-utenti-e-ruoli)

### 🏢 Dati azienda

Ragione sociale · Referente · Email · Telefono · P.IVA/C.F. · indirizzo.
**Vengono stampati come intestazione su tutti i documenti** e su tutti gli export PDF.

### 🏭 Fornitori

Nome · Referente · Email · Telefono · P.IVA/C.F. · **Pagamento predefinito** ·
**Trasporto predefinito** · indirizzo.
I due predefiniti si riproporranno su ogni richiesta e ogni ordine a quel fornitore.
Si possono **sospendere** (⏸).

### 📇 Clienti

Nome (**unico**) · Referente · Email · Telefono · P.IVA/C.F. · indirizzo · Note.
I nomi si **propongono nel campo Cliente della commessa**.
**Rinominare un cliente allinea le commesse** che lo citavano; un cliente citato da una commessa
**non si elimina**.

### 🚚 Condizioni offerta

Due elenchi: **Tipi di trasporto / resa** e **Tipi di pagamento**, ciascuno con una ★ predefinita.
Sono i valori proposti nei campi omonimi di richieste e ordini.

### 🛒 Famiglie commerciali · 📦 Famiglie materie prime · 🔧 Famiglie parti

Tre elenchi separati, ciascuno con **macrofamiglie** e le loro **sottofamiglie**, con **sigla**.
Le sigle entrano nei codici automatici (→ [cap. 9](#9-i-codici-automatici)).

### 🏷 Concetti

La nomenclatura delle parti: `ALBERO`, `FLANGIA`, `STAFFA`, `PIASTRA`, `DISTANZIALE`, `PERNO`,
`BOCCOLA`, `COPERCHIO`, `SUPPORTO`, `GHIERA`… **Sempre in maiuscolo.**

Un concetto **in uso non si rinomina né si elimina** (il pannello mostra quante parti lo usano),
così i nomi già composti non cambiano da soli.

### 🔧 Centri di lavoro

| Campo | Note |
|---|---|
| **Nome** | Torni, Fresatura, Saldatura… |
| **Tariffa (€/h)** | Entra nel costo delle fasi interne a costo orario |
| **Capacità (h/settimana)** | Il metro del Carico centri. **0 = non dichiarata** |

Sotto ogni centro, il sotto-elenco **Fornitori conto lavoro**: fornitore, tariffa, nota — chi sa
fare quella lavorazione fuori, e a quanto. Si possono sospendere.

### 📏 Unità di misura

Codice + descrizione, con una ★ **predefinita** proposta alle nuove righe.
Di serie: `pz, n, set, conf, kg, g, t, m, mm, m2, m3, l, h`.

**Rinominare un codice propaga** la modifica a tutti gli articoli e documenti che lo usano; una
U.M. **in uso non si elimina** (il pannello mostra il numero di utilizzi). Le U.M. incontrate
nell'import da Excel vengono registrate automaticamente.

### ⚙️ Impostazioni

**Costi e margini**

| Campo | Di serie |
|---|---|
| Spese generali / overhead (%) | 12 |
| Margine / markup (%) | 20 |
| Simbolo valuta | € |
| Approvvigionamento parte (predefinito) | Acquisto da fornitore |

**Codifica automatica articoli**

| Campo | Di serie |
|---|---|
| Cifre della parte incrementale | 3 |
| Prefisso Commerciali | `CMM` |
| Prefisso Materie prime | `MAT` |
| Prefisso Parti | `PRT` |

**Accesso**

| Campo | Di serie |
|---|---|
| Durata della sessione salvata (giorni) | 30 — **0 = non scade mai** |

### ⬆️ Import · 💾 Backup

→ [cap. 26](#26-import-ed-export-da-excel) e [cap. 29](#29-backup-e-manutenzione).

### Sospendere invece di eliminare

Fornitori, clienti e centri di lavoro si possono **sospendere** (⏸) invece di cancellarli:
restano negli archivi e nei documenti che li citano, ma **spariscono dai menu a tendina e dai
suggerimenti**. È la risposta a chi non si può cancellare — un fornitore citato da ordini di tre
anni fa — ma non deve nemmeno continuare a comparire ovunque.

Il riquadro accanto al nome dice sempre se una voce è attiva o sospesa, e lo stato viaggia
nell'export e nell'import Excel.

---

## 25. Utenti e ruoli

Ogni persona ha un utente, con nome, email, ruolo, colore e stato attivo/sospeso.

**I ruoli limitano la scrittura, non la lettura: tutti vedono tutto.**

| Ruolo | Articoli | Distinte | Richieste e ordini | Gestione |
|---|:--:|:--:|:--:|:--:|
| **Amministratore** | ✔ | ✔ | ✔ | ✔ |
| **Ufficio acquisti** | — | — | ✔ | — |
| **Progettazione** | ✔ | ✔ | — | — |
| **Lettore** | — | — | — | — |

Nelle sezioni non scrivibili compare un **banner di sola lettura** e i pulsanti di creazione ed
eliminazione spariscono; ogni tentativo di modifica viene comunque fermato con un messaggio.
La voce **Gestione** — e con essa il backup — è visibile ai soli amministratori.

**Deve restare almeno un amministratore attivo.** L'app impedisce di declassare, sospendere o
eliminare l'ultimo, e impedisce di agire su se stessi.

**Le password** si conservano come **hash SHA-256 con salt**. L'amministratore non le legge: le
può solo reimpostare (*Imposta password*). Ciascuno cambia la propria dall'intestazione
(🔑 *Cambia password*).

**La riga autore.** In fondo a schede articolo, richieste, ordini e piani si legge **chi ha creato
il record e chi l'ha aggiornato per ultimo**, con data e ora.

> ⚠️ **Questa non è sicurezza.** Finché i dati stanno nel browser, chiunque apra gli strumenti di
> sviluppo può leggere l'archivio, cambiarsi ruolo o saltare l'accesso: il controllo è tutto sul
> PC dell'utente. Serve a **separare le responsabilità tra colleghi che si fidano**, non a
> proteggere i dati da chi non si fida.
>
> Di conseguenza: **il backup JSON contiene gli utenti con i loro hash.** Trattalo come un file
> riservato.
>
> I permessi diventeranno reali quando l'archivio sarà condiviso, perché lì vivranno sul server
> e non su questo PC. La matrice qui sopra è già quella che verrà applicata: assegnare i ruoli
> con criterio adesso non è un esercizio a vuoto
> (→ [cap. 30](#30-quando-larchivio-è-condiviso-supabase)).

---

## 26. Import ed export da Excel

**Come ci si arriva.** ⚙️ *Gestione → Import*.

Quattro blocchi. **In tutti, l'export è anche il template**: si esporta quello che c'è, si
modifica il file, lo si ricarica. Ogni file porta un foglio **Istruzioni** e un foglio **Liste**
con i valori ammessi.

### I quattro blocchi

**1. Articoli — Acquisti**
Fogli: `Commerciali` · `Materie prime` · `Listino`.
Pulsanti: *Esporta Acquisti* · *🔍 Verifica un file* · *Carica Acquisti*.

**2. Articoli — Progetto**
Fogli: `Macchine` · `Gruppi` · `Sottogruppi` · `Parti` · `Listino`.
**Il tipo è il foglio**: non c'è una colonna «tipo». I fogli si applicano in quest'ordine, così i
padri esistono prima dei figli.
**La distinta non è in questi file** — sta nel blocco 3.

**3. Import Distinte**
Un foglio padre-figlio, colonne: `CodicePadre` · `CodiceFiglio` · `Qta` · `Scarto%`.
Gli articoli **devono già esistere**. Per ogni padre i componenti vengono **sostituiti** — quindi
ricaricare lo stesso file due volte dà lo stesso risultato. Le relazioni cicliche sono segnalate e
saltate.
Pulsanti: *Scarica template Distinte* · *Carica file Distinte*.

**4. Impostazioni di Gestione**
Un foglio per scheda: `Azienda` · `Utenti` · `Fornitori` · `Clienti` · `Condizioni offerta` ·
`Famiglie commerciali` · `Famiglie materie prime` · `Famiglie parti` · `Concetti` ·
`Centri di lavoro` · `Unità di misura` · `Impostazioni`.
**Le password non sono nel file.**

### Le regole comuni

| Regola | Dettaglio |
|---|---|
| **Il Codice è la chiave** | Esiste → **aggiorna**. Non esiste → **crea**. Vuoto → **genera** il codice automatico |
| **L'import è additivo** | Non cancella mai niente. Quello che non è nel file resta com'è |
| **Fornitori e famiglie mancanti si creano al volo** | I **concetti no**: quelli si aggiungono a mano, perché la nomenclatura non deve crescere per distrazione |
| **Fornitore + prezzo** | Creano una **quotazione a listino**, che diventa il prezzo in uso |
| **U.M. sconosciute** | Vengono registrate automaticamente nell'elenco |
| **CSV** | I `.csv` in UTF-8 nudo vengono riconosciuti da soli |

### 🔍 Verifica un file

**Esegue l'import per intero, mostra il report, e poi annulla tutto.** È il modo di sapere cosa
succederebbe senza che succeda. Da usare sempre, la prima volta che si carica un file nuovo.

Il **report** è per foglio, e dice quanti record sono stati *creati*, *aggiornati*, *invariati*,
con gli **avvisi** e gli **errori**, ciascuno con il foglio e il numero di riga.

---

## 27. Export di elenchi e documenti

Bomtrack ha due famiglie di export, e vale la pena distinguerle.

### Gli export di elenco

Hanno i pulsanti **Esporta Excel** ed **Esporta PDF**: Magazzino · Acquisti · Progetto · Cicli ·
Carico centri · Commesse · Richieste · Ordini · Ordini di lavoro · elenco Piani ·
Materiale presso terzi.

**Si esporta quello che si vede**: i filtri attivi sono applicati e le colonne sono le stesse.
La paginazione a schermo (i 200 articoli per volta) **non taglia niente**.

**I filtri finiscono scritti nel file** — un foglio **Estrazione** nell'Excel (Estrazione, Azienda,
Data, filtri attivi), una riga sotto il titolo nel PDF — così a distanza di tempo si sa ancora cosa
contiene quel file.

| Formato | Cosa porta |
|---|---|
| **PDF** | Testata azienda e numero di pagina su ogni pagina |
| **Excel** | **Autofiltro** sull'intestazione, i numeri come numeri e **le date come date** — quindi si ordinano e si filtrano per periodo dentro Excel, non come testo |

Nome del file: `bomtrack_<sezione>_<data>.xlsx` o `.pdf`.

> Il pannello laterale, con più righe selezionate, esporta **solo la selezione**.

### Gli export di documento

Sono i documenti veri e propri: la **richiesta di offerta** (PDF bilingue IT/EN), l'**ordine**,
l'**ordine di lavoro**, il **piano di fabbisogno**, la **distinta esplosa**. Hanno il pulsante
**Genera documento PDF** / **Genera documento Excel** nella loro barra dedicata.

Per richieste e ordini, quei pulsanti sono **disabilitati finché ci sono modifiche non salvate**, e
alla generazione l'app propone di far passare lo stato da *Bozza* a *Inviata* / *Inviato*.
Rifiutando, il file si scarica lo stesso e lo stato non cambia.

---

## 28. Stampa

`Ctrl+P`, o il pulsante 🖨 nell'intestazione. Anche il `Ctrl+P` del browser è agganciato: si
ottiene la stampa pulita, non la pagina grezza.

Esce **la vista aperta** — distinta, costificazione, fabbisogno, richiesta, ordine — ripulita di
navigazione, filtri e pulsanti, con intestazione, data e autore. Nelle viste a documento **esce il
documento, non l'elenco**.

**La carta resta bianca** anche con il tema scuro attivo.

---

## 29. Backup e manutenzione

**Come ci si arriva.** ⚙️ *Gestione → Backup*. **Solo amministratori.**

### Backup locale

| Comando | Cosa fa |
|---|---|
| *(in testa)* | La **dimensione** dell'archivio |
| **Esporta JSON** | Scarica l'intero archivio in un file |
| **Importa JSON** | Carica un file **sovrascrivendo i dati attuali** |
| **↺ Ripristina dati esempio** | Rimette la macchina dimostrativa |

> ⚠️ **Fai backup regolari.** I dati stanno in questo browser: non esiste una copia da nessun'altra
> parte. Un backup a fine giornata costa dieci secondi.
>
> ⚠️ **Il backup contiene gli utenti con i loro hash di password.** È un file riservato.

I backup di versioni vecchie si **migrano da soli** all'import: un file esportato mesi fa si
ricarica senza conversioni.

Questo comando non andrà in pensione con l'archivio condiviso: lì servirà a tenere una copia
**fuori** dal servizio che ospita i dati, che è l'unico backup che protegga davvero
(→ [cap. 30](#30-quando-larchivio-è-condiviso-supabase)).

### Cestino

Le eliminazioni restano recuperabili **30 giorni**. Per ogni riga: **↶ Ripristina** e
**Elimina definitivamente**; in fondo **Svuota il cestino**. Passata la finestra dei 30 giorni,
le voci spariscono da sole al caricamento successivo.

Cosa ci finisce: Articolo · Fornitore · Cliente · Centro di lavoro · Macrofamiglia · Richiesta ·
Ordine · Ordine di lavoro · Piano · Utente · Commessa · Movimento · Revisione.

### Codici articolo duplicati

Un controllo dati che elenca i codici assegnati a più di un articolo — di solito il residuo di un
import fatto male. Lo stesso controllo alimenta un segnale del Riepilogo.

### Registro errori

Gli errori imprevisti incontrati **in questa sessione** (si azzera ricaricando la pagina), con
**Scarica registro errori**: è il file da allegare quando si segnala un problema.

### AZZERA TUTTO

Svuota completamente l'archivio, dati di esempio compresi.

> ⚠️ **Irreversibile.** Non passa dal cestino. Esporta un backup prima, sempre.

---

## 30. Quando l'archivio è condiviso (Supabase)

> ⚠️ **Questo capitolo descrive una condizione che non è ancora attiva.** Oggi Bomtrack lavora
> **solo in locale**: ogni PC ha il suo archivio, e non c'è nessun collegamento a un server.
> Sta qui perché quello che si fa adesso conta già: i codici puliti, i ruoli assegnati davvero,
> l'abitudine al backup e la disciplina dei piani aperti sono le stesse cose che reggeranno il
> lavoro in squadra. Chi legge il resto del manuale non deve cercare queste funzioni: non le
> troverà.

### Cosa cambia

| | Oggi (locale) | Con l'archivio condiviso |
|---|---|---|
| **Dove stanno i dati** | Nel browser di questo PC | In un database condiviso, uno per azienda |
| **I colleghi** | Ognuno la sua copia; ci si allinea passandosi il backup | Tutti sullo stesso archivio, ciascuno dal suo PC |
| **L'accesso** | Separa le responsabilità, non protegge i dati | Autenticazione vera; i permessi vivono **sul server** |
| **I ruoli** | Chi apre gli strumenti di sviluppo li aggira | Il server rifiuta la scrittura, e non c'è modo di convincerlo |
| **Le password** | Conservate qui come hash | Le possiede il servizio di autenticazione |
| **Nuovo utente** | L'amministratore digita una password iniziale | L'amministratore **invita**, e la password se la fa la persona |
| **Il backup** | L'unica copia che esiste | Resta, e serve ancora: fuori sede |
| **Senza rete** | Non serve mai | Si continua a lavorare; le modifiche partono al ritorno |

### Come si lavorerà

**L'app non diventa più lenta.** Si continua a scrivere sul proprio PC e il salvataggio parte da
solo, in sottofondo: nessuna schermata che aspetta la rete. Il badge **modifiche non salvate**
nell'intestazione dice se c'è ancora qualcosa da mandare.

**Le modifiche dei colleghi arrivano da sole**, ogni venti o trenta secondi e quando si torna
sulla finestra. Non arrivano mai in mezzo a una scheda aperta a metà: se stai compilando un
ordine, l'aggiornamento aspetta che tu abbia finito.

**Senza rete si continua a lavorare.** L'archivio locale non sparisce: diventa lo specchio di
quello condiviso e la coda di quello che non è ancora partito. Tornata la linea, parte tutto.

### Chi vince quando due persone toccano la stessa cosa

È la domanda che conta davvero in una squadra, e la risposta non è la stessa dappertutto.

| Cosa | Cosa succede |
|---|---|
| **Aggiunte a un elenco** — quotazioni di listino, righe di documento, movimenti, righe di piano, sottofamiglie | **Convivono.** Due colleghi che registrano due quotazioni sullo stesso articolo non sono in conflitto: restano entrambe |
| **Distinta base, ciclo e lavorazioni di un articolo** | **L'ultimo che salva sostituisce tutto**, e l'altro viene avvisato. Metà distinta di uno e metà dell'altro sarebbe un prodotto che nessuno ha progettato |
| **Il prezzo in uso di un articolo** | Vince l'ultimo che salva, e **l'app avvisa**: cambiando il prezzo in uso cambia il costo di ogni macchina che lo contiene |
| **Cancellazione contro modifica** | Vince la **cancellazione**: un articolo mezzo cancellato non esiste |

> **La regola pratica**: mettersi d'accordo su chi tiene in mano una distinta. Non perché l'app si
> rompa — non si rompe, e avvisa — ma perché su una distinta il lavoro di due persone non si somma.
> Sulle righe di un listino o di un ordine sì, e lì si può lavorare insieme senza pensarci.

### Cosa non cambia

Quasi tutto. Vale la pena dirlo, perché è il motivo per cui questo manuale non andrà riscritto:

- **Le schermate, i comandi e il flusso di lavoro** sono gli stessi. Tutto quello che sta nei
  capitoli da 1 a 29 continua a valere parola per parola.
- **I codici articolo, le famiglie, i concetti, le unità di misura**: restano quelli. Niente si
  rinumera.
- **I quattro ruoli** — Amministratore, Ufficio acquisti, Progettazione, Lettore — restano quelli,
  con la stessa matrice di permessi. Cambia solo che diventano veri.
- **Il cestino a 30 giorni**, l'export JSON, gli export Excel e PDF, la stampa.
- **La giacenza e il materiale presso terzi restano calcolati**, non scritti da nessuna parte:
  è la stessa regola, applicata su un database invece che su un file.

### Quello che va deciso prima di passare

Sono cinque cose, e quattro si possono già preparare oggi.

1. **Un archivio solo.** Si sceglie quale PC porta i dati buoni, si esporta il suo JSON, e da lì
   si riparte. **Due archivi divergenti non si fondono**: se in due officine si è lavorato in
   parallelo per mesi, uno dei due lavori va rifatto. Meglio saperlo prima.
2. **Le password non migrano.** Ognuno rifà la sua al primo accesso, su invito. Gli utenti, i
   nomi, le email e i ruoli invece passano.
3. **I codici duplicati vanno ripuliti prima.** *Gestione → Backup → Codici articolo duplicati*.
   Su un PC solo sono un fastidio; in condivisione diventano il problema di tutti.
4. **Il backup fuori sede.** Il piano gratuito **non ha backup automatici**: se il progetto si
   perde, si perde. L'export JSON resta l'unica risposta, e va fatto con regolarità **fuori** dal
   servizio che si sta cercando di proteggere.
5. **La chiusura estiva.** Un progetto lasciato inattivo sette giorni viene sospeso, e va
   riacceso a mano. Un'officina che chiude due settimane ad agosto lo scopre il 25 agosto, con
   l'app che non risponde. Si predispone prima.

### Quanto regge il piano gratuito

| | |
|---|---|
| **Spazio utile** | ~430 MB dei 500 dichiarati (il resto lo occupa il servizio) |
| **Officina piccola, 3 anni** | ~25% dello spazio: sta larga |
| **Il primo limite che si incontra** | Non è lo spazio, è la **banda**. Si risolve scaricando a ogni giro solo quello che è cambiato, non tutto |
| **Cosa cresce davvero** | I **movimenti di magazzino** e le **revisioni** rilasciate. Il catalogo, per quanto grande, pesa poco |

> ⚠️ **Gli allegati cambiano il conto di colpo.** Oggi l'app non ha disegni, PDF né foto. Il
> giorno in cui una richiesta d'offerta portasse con sé il disegno, 1 GB sono circa **mille PDF da
> 1 MB**: poche centinaia di articoli con un disegno e due revisioni. È la funzione che, più di
> ogni crescita del catalogo, porta Bomtrack fuori dal piano gratuito.

### Fino ad allora

Quattro abitudini che valgono già adesso e che il giorno del passaggio si riveleranno le uniche
che contavano:

- **un PC solo è quello «di verità»**, e gli altri lo consultano;
- **l'export JSON a fine giornata**, tenuto fuori da quel PC;
- **i ruoli assegnati davvero**, non tutti amministratori;
- **i codici puliti**, controllati ogni tanto dal pannello dei duplicati.

---

# Parte VII — Riferimenti

## 31. Scorciatoie da tastiera

| Tasti | Effetto |
|---|---|
| **Ctrl+K** (⌘K) | **Ricerca globale** — articoli, richieste, ordini, ordini di lavoro, piani. Si scrive un codice o un numero e si salta dove serve, senza passare dalla vista giusta e dai suoi filtri |
| **Ctrl+I** (⌘I) | Apre e chiude il **pannello laterale** |
| **Ctrl+P** | **Stampa** della vista aperta |
| **Esc** | Chiude la finestra in cima; nell'elenco con pannello aperto, deseleziona |
| **↑ ↓** | Scorre le righe dell'elenco, o i risultati della ricerca globale |
| **Invio** | Apre la scheda completa dell'articolo scelto, o il risultato della ricerca |
| **Ctrl+click** | Aggiunge una riga alla selezione |
| **Maiusc+click** | Seleziona l'intervallo fra la riga corrente e quella cliccata |
| **Maiusc+↑ ↓** | Estende la selezione |

---

## 32. Stati dei documenti

### Gli stati

| Documento | Stati |
|---|---|
| **Richiesta di offerta** | Bozza · Inviata · Offerta ricevuta · Chiusa |
| **Ordine** (ODA) e **Ordine di lavoro** (ODL) | Bozza · Inviato · Confermato · Parziale · Evaso · Annullato |
| **Commessa** | Aperta · In produzione · Chiusa · Annullata |
| **Piano di fabbisogno** | Aperto · Chiuso |

### Cosa resta modificabile

| Documento | Stato | Modificabile |
|---|---|---|
| RFQ | **Bozza** | tutto |
| RFQ | **Inviata** · **Offerta ricevuta** | prezzo unitario e data di consegna |
| RFQ | **Chiusa** | nulla |
| ODA / ODL | **Bozza** | tutto |
| ODA / ODL | **Inviato** · **Confermato** · **Parziale** · **Evaso** | la colonna Ricevuto (Rientrati) |
| ODA / ODL | **Annullato** | nulla |

**In ogni stato** restano sempre modificabili: le note del documento, le 🔒 note interne, le note
di riga, e **lo stato stesso**.

**🔓 Sblocca per modifica** riapre un documento bloccato. Lo sblocco vale **finché si resta
dentro**: uscendo e rientrando, il documento torna bloccato.

### Le transizioni automatiche

| Da | A | Quando |
|---|---|---|
| Bozza | Inviata / Inviato | alla **generazione del PDF o dell'Excel** (previa conferma; rifiutando, il file si scarica e lo stato non cambia) |
| Inviata | Offerta ricevuta | quando **tutte** le righe hanno un prezzo *(torna indietro se un prezzo si svuota)* |
| *(RFQ)* | Chiusa | quando dalla richiesta **nasce un ordine** |
| Inviato | Confermato | quando si compila il **n° di conferma** del fornitore |
| Confermato | Parziale → Evaso | man mano che si registrano i **ricevimenti** (o i rientri) |

> **Bozza e Annullato non vengono mai toccati automaticamente.**

---

## 33. Glossario

| Termine | Significato |
|---|---|
| **BOM** | *Bill of Materials*, distinta base: l'elenco di cosa contiene un prodotto |
| **RFQ** / RDO | *Request For Quotation*, richiesta di offerta: si chiede un prezzo, non si compra |
| **ODA** | Ordine d'acquisto: si compra **merce** |
| **ODL** | Ordine di lavoro: si commissiona una **lavorazione** a un terzista |
| **Conto lavoro** | Mandare un pezzo fuori a lavorare e riaverlo indietro. La merce resta nostra |
| **Terzista** | Il fornitore che esegue una lavorazione in conto lavoro |
| **Tratta** | Le fasi **consecutive** dello stesso terzista, commissionate come una sola lavorazione |
| **Passata** | Un giro di uscita e rientro dallo stesso terzista. Due passate dallo stesso terzista = due ODL |
| **Fase** | Un passo del ciclo di lavorazione (10, 20, 30…) |
| **Ciclo di lavorazione** | La sequenza di fasi che trasforma il materiale in una parte |
| **Distinta parte** | Il materiale che una parte consuma (non i suoi sotto-assiemi: una parte è una foglia) |
| **Concetto** | L'oggetto nel nome di una parte: `ALBERO`, `FLANGIA`. Sempre maiuscolo, scelto da un elenco |
| **Sigla** | L'abbreviazione di una macchina o di un gruppo, che entra nei codici |
| **Approvvigionamento** | Come si ottiene una parte: *Produzione interna* o *Acquisto da fornitore* |
| **Quotazione** | Un prezzo offerto da un fornitore per un articolo. Più quotazioni per articolo; una sola è quella in uso |
| **Scarto %** | La quota di materiale che si perde: 10 pezzi con 5% di scarto consumano materiale per 10,5 |
| **Overhead / spese generali** | La percentuale che si aggiunge al costo per coprire i costi non diretti |
| **Margine / markup** | La percentuale che si aggiunge al costo totale per ottenere il prezzo di vendita |
| **Fabbisogno lordo** | Quanto serve, senza guardare cosa c'è |
| **Fabbisogno netto** | Quanto serve **comprare**: lordo + scorta minima + impegnato − esistente − in arrivo |
| **Esistente** | Quello che c'è adesso a scaffale |
| **In arrivo** | Ordinato e non ancora entrato |
| **Impegnato** | Promesso ai piani aperti |
| **Libero** | esistente + in arrivo − impegnato |
| **Scorta minima** | La soglia sotto cui si avvisa, e che il netto ricostituisce |
| **Lotto di riordino** | La quantità a cui si arrotondano gli acquisti (multiplo esatto o quantità minima) |
| **Saturazione** | La percentuale di capacità di un centro occupata in una settimana |
| **Capacità** | Le ore che un centro può fare in una settimana. **0 = non dichiarata** |
| **Revisione** | Una fotografia congelata di una distinta, identificata da una lettera |
| **Archivio condiviso** | Il database unico su cui lavorano tutti i colleghi, al posto di una copia per PC. Progettato, non ancora attivo (→ [cap. 30](#30-quando-larchivio-è-condiviso-supabase)) |
| **Supabase** | Il servizio scelto per ospitare l'archivio condiviso: database, autenticazione e permessi |
| **Permessi sul server** | I ruoli applicati dal database invece che dall'app. È la differenza fra separare le responsabilità e proteggere davvero i dati |

---

## 34. Domande frequenti

**Non trovo un fornitore (o un cliente, o un centro) nel menu a tendina.**
Probabilmente è **sospeso**. *Gestione →* la sua scheda *→ Riattiva*. Le voci sospese restano negli
archivi e nei documenti che le citano, ma spariscono dai menu.

**Non riesco a modificare una riga di un ordine.**
Dipende dallo **stato** (→ [cap. 32](#32-stati-dei-documenti)). Un ordine *Inviato* lascia
modificare solo la colonna Ricevuto. Se serve davvero, **🔓 Sblocca per modifica**.

**Il costo di una parte è zero.**
Tre possibilità: (a) è a *Acquisto da fornitore* e non ha nessuna quotazione a listino →
[cap. 10](#10-listino-fornitori); (b) è a *Produzione interna* e non ha né distinta parte né ciclo
→ [cap. 14](#14-cicli-di-lavorazione); (c) i suoi componenti non hanno prezzo.
Il Riepilogo elenca gli «articoli d'acquisto senza prezzo».

**Il costo della macchina non torna / compare un avviso rosso.**
C'è un **riferimento ciclico**: un assieme che, scendendo, contiene se stesso. L'avviso nomina
l'articolo coinvolto. Si corregge togliendo la riga che chiude l'anello.

**Un articolo non entra nel fabbisogno.**
Se è una **parte a *Acquisto da fornitore***, la sua distinta non viene esplosa: si compra la parte,
non il suo materiale. È il comportamento voluto. Per far comprare il materiale, la parte va messa a
*Produzione interna*.

**Ho registrato il ricevimento ma la giacenza non è cambiata (o è cambiata due volte).**
Il ricevimento di un **ODA carica il magazzino da solo**: non serve anche un movimento di carico.
Il campo **Rientrati** di un **ODL** invece **non carica**: lì il carico lo fa il movimento di
*rientro da conto lavoro* (→ [cap. 22](#22-ordini-di-lavoro-odl-e-conto-lavoro)).

**Ho mandato un pezzo da Beta a Gamma e la giacenza non si muove.**
È corretto: è un **passaggio di lavorazione**, un cambio di luogo a quantità invariata. Il pezzo
non è mai stato a scaffale.

**Il fabbisogno mi dice di comprare roba che ho già.**
Attiva la casella **Fabbisogno netto**. Senza, la lista è **lorda**: quanto serve, senza guardare
cosa c'è.

**Due piani mi chiedono lo stesso materiale.**
È il termine **impegnato** che li tiene separati: finché entrambi sono **aperti**, ciascuno vede
la quota dell'altro come già promessa. Il piano che non serve più va **chiuso**: la sua quota torna
libera.

**Il Carico centri dice che sono in sovraccarico. Cosa faccio?**
Bomtrack te lo dice, non lo risolve: **non c'è schedulazione**. La decisione — anticipare, mandare
fuori una fase, spostare una consegna — resta a chi la prende.

**Un centro non mostra mai il sovraccarico.**
Ha la **capacità a 0**, che significa «non dichiarata». *Gestione → Centri di lavoro*.

**Ho perso i dati.**
I dati stanno **in questo browser, su questo PC**. Controlla: stai usando lo stesso browser? Lo
stesso profilo? Sono stati puliti i dati del sito? Se hai un backup JSON, *Gestione → Backup →
Importa JSON*. Se hai eliminato qualcosa per errore negli ultimi **30 giorni**, guarda nel
**Cestino** prima di disperare.

**Come lavoriamo in due sullo stesso archivio?**
Oggi non si può in tempo reale: ogni PC ha la sua copia. Ci si allinea passandosi il **backup
JSON**. Gli utenti e i ruoli servono a separare le responsabilità su uno stesso PC. L'archivio
condiviso è progettato — come funzionerà, e cosa conviene preparare da ora, sta nel
[cap. 30](#30-quando-larchivio-è-condiviso-supabase).

**L'app non genera il PDF.**
I pulsanti **Genera documento** sono **disabilitati finché ci sono modifiche non salvate**: premi
**Salva** prima. Se invece non succede proprio niente, guarda *Gestione → Backup → Registro errori*.

---

# Appendice A — Come funziona sotto

Questa appendice serve a chi deve installare, spostare, salvare o sviluppare Bomtrack. Chi la usa
e basta può fermarsi al capitolo 33.

## A.1 Lo stack

Bomtrack è **vanilla JavaScript + HTML + CSS**. Nessun framework, nessun modulo ES, nessun
bundler, **nessun passo di build**, nessun `package.json`. Gli script sono caricati in sequenza da
`index.html` e condividono lo scope globale.

Le librerie di terze parti sono **incluse nella cartella**, in `vendor/`:

| Libreria | A cosa serve |
|---|---|
| `jspdf.umd.min.js` + `jspdf.plugin.autotable.min.js` | Generazione dei PDF |
| `xlsx.full.min.js` (SheetJS) | Lettura e scrittura degli Excel |

Sono lì apposta: l'app deve funzionare **completamente offline**, anche aperta da `file://`.
L'unica risorsa di rete sono i font di Google Fonts, e senza di quelli l'app funziona lo stesso.

Non c'è backend e non c'è database remoto.

## A.2 Dove risiedono i dati

Tutto sta nel **`localStorage` del browser**, sotto la chiave **`bomtrack_v1`**: un unico documento
JSON.

| Chiave | Contenuto |
|---|---|
| `bomtrack_v1` | **L'archivio.** Tutto il lavoro sta qui |
| `bomtrack_v1_illeggibile` | Dove finisce un archivio che non si riesce più a leggere, invece di essere sovrascritto dai dati di esempio |
| `bomtrack_theme` | Il tema scelto |
| `bomtrack_session` | La sessione aperta |
| `bomtrack_columns` | Le colonne nascoste, per vista |
| *(chiave email)* | L'email ricordata da «Ricordami su questo PC» |

Le ultime quattro sono **preferenze personali**, non dati aziendali: non entrano nel backup e non
si condividono.

**Lo schema è versionato** (`SCHEMA_VERSION = 2`; la v1 usava id interi, la v2 usa UUID e
timestamp). Le migrazioni sono **idempotenti**: un backup vecchio si auto-migra all'import.

**Il cestino** trattiene le eliminazioni per **30 giorni** (`TRASH_DAYS`).

## A.3 Le collezioni

| Collezione | Contiene | Figli annidati |
|---|---|---|
| `items` | **Gli articoli** — tutti e sei i tipi | `components`, `operations`, `cycle`, `priceList` |
| `revisions` | Le revisioni congelate | — |
| `movements` | I movimenti di magazzino | — |
| `suppliers` · `customers` | Fornitori e clienti | — |
| `workCenters` | I centri di lavoro | `suppliers` (fornitori conto lavoro) |
| `families` | Le famiglie articolo | `subs` (sottofamiglie) |
| `rfqs` · `orders` · `workOrders` | Richieste, ordini, ordini di lavoro | `lines` |
| `plans` | I piani di fabbisogno | `lines` |
| `jobs` | Le commesse | — |
| `users` | Gli utenti (con `passwordHash` e `passwordSalt`) | — |
| `trash` | Il cestino | — |

Ogni record porta `id` (UUID), `createdAt` / `updatedAt`, `createdBy` / `updatedBy` e `active`.

**I sei tipi di articolo** stanno tutti in `items`, distinti dal campo `type`:
`macchina` · `gruppo` · `sottogruppo` · `parte` · `materiale` (materia prima) ·
`acquistato` (commerciale).

**Le righe di ciclo** (`cycle[]`) hanno due forme: `kind: 'item'` (una riga di distinta parte, con
`itemId`, `qty`, `costOverride`) e `kind: 'op'` (una fase, con `workCenterId`, `supplierId`,
`costMode`, `hours`, `days`, `rate` o `cost`).

**I movimenti** portano `kind` (uno dei sei tipi), `qty` con segno, e per il conto lavoro
`supplierId` (dove va) e `fromSupplierId` (da dove viene).

## A.4 I file sorgente

| File | Contenuto |
|---|---|
| `index.html` | Struttura della pagina, navigazione, barre filtri statiche, caricamento script |
| `style.css` | Foglio di stile unico, tema chiaro/scuro, regole di stampa |
| `icons.js` | Le icone SVG |
| `theme.js` | Il tema |
| `store.js` | **Il layer dati**: schema, migrazioni, API, persistenza, hash password, cestino |
| `core.js` | Stato applicativo, utility, ruoli e permessi, `APP_VERSION`, scorciatoie |
| `auth.js` | Accesso, sessione, primo amministratore |
| `costing.js` | **Il motore di costificazione** (rollup ricorsivo) e i modi di approvvigionamento |
| `shell.js` | Ricerca globale, stampa, definizione della navigazione, routing |
| `worklist.js` | Il telaio delle viste a documento |
| `columns.js` · `inspector.js` | Scelta colonne · pannello laterale |
| `views-bom.js` · `views-rev.js` | Distinte e revisioni |
| `views-stock.js` | Magazzino, movimenti, conto lavoro |
| `views-catalog.js` | Anagrafiche, listino, scheda articolo, cicli |
| `views-report.js` · `views-item.js` · `views-home.js` | Costificazione · scheda di sola lettura · Riepilogo |
| `views-mrp.js` | Fabbisogno e Carico centri |
| `views-jobs.js` · `views-docs.js` | Commesse · RFQ, ODA, ODL |
| `views-manage.js` | Gestione |
| `export-lists.js` · `import-catalog.js` · `import-export.js` | Export elenchi · import articoli · import distinte, backup, avvio |
| `cloud-map.js` | Traduzione della forma dati verso un futuro backend. Funzioni pure, nessun codice di rete |
| `vendor/` | jsPDF, jsPDF-AutoTable, SheetJS |
| `docs/` | Analisi tecnica, schema cloud, sostenibilità |
| `test/` | La suite di test |

## A.5 I test

Non servono all'app, servono a chi la modifica. Richiedono **Node 18+** e nessuna installazione:

```
node test/run.js      # la suite completa
node test/bench.js    # benchmark del motore di costificazione
```

La suite gira anche in CI a ogni push.

## A.6 I limiti architetturali

- **Un archivio per browser.** Niente concorrenza, niente sincronizzazione, niente storico
  condiviso. Ci si allinea con i backup JSON.
- **Il controllo dei permessi è sul client.** Chi apre gli strumenti di sviluppo lo aggira.
- **La dimensione dell'archivio è limitata** da quanto `localStorage` concede al browser (in genere
  qualche megabyte). *Gestione → Backup* mostra la dimensione corrente.

La direzione presa per superarli è un backend con autenticazione e permessi sul server;
`cloud-map.js` e `docs/cloud-schema.md` sono la preparazione a quel passaggio, e **non**
contengono codice di rete. Il [cap. 30](#30-quando-larchivio-è-condiviso-supabase) racconta la
stessa cosa dal lato di chi userà l'app; qui sotto, cosa esiste già nel codice per arrivarci:
gli id sono UUID e non contatori locali, ogni record porta `createdAt`/`updatedAt` e
`createdBy`/`updatedBy`, il registro dello schema dichiara per ogni collezione come andrà
fusa, e il punto in cui si sostituisce la destinazione dei dati è uno solo.

---

*Manuale di Bomtrack — aggiornato alla versione 0.73.0.*
*Le funzioni descritte qui corrispondono a quella revisione; il changelog dell'app elenca le
differenze rispetto alle versioni successive.*
