# Changelog

Le revisioni seguono il versionamento semantico `0.MINOR.PATCH`: **MINOR** per nuove funzionalità, **PATCH** per correzioni. La versione in cima è quella in `APP_VERSION` (`core.js`) e mostrata nell'header dell'app.

### 0.73.0 — 2026-09-09

**Manuale d'uso**
Nasce `MANUALE.md`: il manuale operativo dell'app, scritto per chi la usa invece che per chi la sviluppa. Trentaquattro capitoli più un'appendice tecnica, con indice cliccabile.

Il README raccontava già quasi ogni funzione, ma la raccontava **per funzione e per motivo**: perché il passaggio di lavorazione non muove la giacenza, perché il netto non si applica alle lavorazioni. Chi arriva nuovo ha però un'altra domanda — *da dove comincio, e poi cosa faccio* — e a quella il README non rispondeva da nessuna parte. Il manuale è organizzato **per compito**, e il suo capitolo portante è il **flusso di lavoro**: lo schema del giro completo, dagli archivi di Gestione alla merce che entra a magazzino, e ogni tappa in prosa con il rimando al capitolo di dettaglio (preparare gli archivi → costruire il prodotto dal basso → costificare → commessa e piano → comprare → far lavorare fuori → chiudere il giro).

Ogni capitolo di schermata segue la stessa griglia — *a cosa serve, come ci si arriva, cosa si vede, comandi, filtri, finestre, da sapere* — così la risposta sta sempre nello stesso punto della pagina. I pulsanti sono chiamati **con il nome esatto che hanno a video**: un manuale che li chiama in un altro modo è peggio di nessun manuale.

Sono documentati per esteso i punti su cui si sbaglia davvero: i **sei tipi di movimento** con il loro effetto sulla giacenza, i **due soli punti in cui il conto lavoro muove il magazzino** (e perché gli estremi sono quelli del ciclo, non quelli del documento), la differenza fra *Rientrati* su un ODL e il carico vero, la tabella di **cosa resta modificabile in ciascuno stato** con le transizioni automatiche, e i quattro avvertimenti del Carico centri. Chiudono un **glossario** di trenta voci (tratta, passata, impegnato, libero, saturazione, concetto…) e una sezione di **domande frequenti** che parte dai sintomi — «il costo di una parte è zero», «non trovo un fornitore nel menu», «ho perso i dati».

L'**appendice tecnica** raccoglie quello che serve a chi installa, sposta o sviluppa: stack e assenza di build, le chiavi di `localStorage` con la distinzione fra archivio e preferenze personali, le collezioni del modello dati, la mappa dei file sorgente, i test e i limiti architetturali.

I limiti dichiarati stanno **nel primo capitolo**, non in fondo: nessuna schedulazione, nessun avanzamento di produzione, un archivio per browser, e i ruoli che separano le responsabilità senza essere sicurezza. Un manuale che li nasconde in appendice fa cercare per mezz'ora una funzione che non esiste.

**Il manuale dice già come si lavorerà con l'archivio condiviso**
Nuovo capitolo 30, «Quando l'archivio è condiviso (Supabase)», in fondo alla parte Amministrazione. Si apre dichiarando che **non è ancora attivo** — chi legge il resto del manuale non deve cercare funzioni che non troverà — e poi risponde alle domande che si fanno prima di passare, non dopo.

Il cuore del capitolo è **chi vince quando due persone toccano la stessa cosa**, perché in squadra è l'unica domanda che conta e la risposta non è la stessa dappertutto: due quotazioni sullo stesso articolo **convivono**, una distinta salvata da due persone no — l'ultimo sostituisce l'insieme, perché metà distinta di uno e metà dell'altro è un prodotto che nessuno ha progettato. Da lì la regola pratica: sulle righe di un listino o di un ordine si lavora insieme senza pensarci, su una distinta ci si mette d'accordo.

Poi le cose che vanno **decise prima e preparate adesso**: un solo archivio di verità (due archivi divergenti non si fondono, e uno dei due lavori va rifatto), le password che non migrano, i codici duplicati da ripulire finché sono un fastidio di uno solo, il backup fuori sede — che il piano gratuito non fa — e il ping contro la sospensione dopo sette giorni d'inattività, da predisporre prima di agosto e non il 25 agosto. Chiude con quanto regge il piano gratuito (il primo limite è la banda, non lo spazio) e con l'avviso che **gli allegati cambiano il conto di colpo**: 1 GB sono circa mille PDF da 1 MB.

Una sezione dice **cosa non cambia**, ed è quasi tutto: schermate, comandi, flusso di lavoro, codici, ruoli, cestino, export. È il motivo per cui il manuale non andrà riscritto.

Sei rimandi nei punti dove l'uso cambia davvero — i limiti dichiarati al capitolo 1, l'avviso sui dati nel browser, i ruoli che non sono sicurezza, il backup, le domande frequenti e l'appendice tecnica — più tre voci di glossario. La parte Riferimenti scala di uno.

**Il manuale sta dentro l'app**
Un pulsante 📖 nell'intestazione, accanto a Stampa, apre `manuale.html` in una scheda sua. Il manuale si consulta **mentre** si lavora — chi cerca come si registra un rientro da conto lavoro ha l'ordine di lavoro aperto davanti, e non deve perderlo per leggere come si fa.

`manuale.html` sta nella cartella accanto a `index.html` e **non chiede niente alla rete**: il markdown è già impaginato nel file, indice e ancore compresi, quindi la pagina resta leggibile e navigabile anche **senza JavaScript** — che aggiunge soltanto il filtro dei capitoli, l'evidenziazione di dove si è e il cassetto dell'indice sugli schermi stretti. Come tutto il resto dell'app viaggia con la cartella, quindi il manuale c'è anche sul PC in officina che la rete non ce l'ha. Usa i token di tema e i font di Bomtrack, e legge `bomtrack_theme`: chi ha scelto il chiaro nell'app apre il manuale in chiaro.

`genera-manuale.py` rigenera `manuale.html` da `MANUALE.md` con un comando solo (`python genera-manuale.py`), guscio della pagina incluso nello script. Il markdown resta **l'unica fonte**: due copie da aggiornare a mano avrebbero cominciato a divergere il giorno dopo. Nuova icona `book`, tracciata sulla stessa griglia 24×24 delle altre.

Il README rimanda al manuale in testa, e resta quello che era: la documentazione funzionale, orientata al perché delle scelte.

### 0.72.1 — 2026-09-08

Controllo mirato sul conto lavoro e sugli ordini di lavoro, dopo la segnalazione di una tabella disallineata in Gestione (già corretta a parte). Tre punti rimasti aperti da quel controllo, tutti chiusi qui.

**Corretto: una fase interna mandata fuori apposta non muoveva mai il magazzino**
L'app permette di mettere in un ordine di lavoro anche una fase che il ciclo fa in casa ("il ciclo la fa in casa: mettendola qui la si manda fuori questa volta") — un caso vero, non un errore da impedire. Ma quella fase non coincideva mai con la prima o l'ultima tratta **esterna del ciclo**, semplicemente perché non lo è: restava sempre un passaggio, e né la spedizione né il rientro toccavano mai la giacenza. Ora una fase così, non incatenata alle tratte esterne che il ciclo dichiara, esce e rientra ai suoi due estremi come qualunque lavorazione esterna — senza cambiare nulla per le tratte che il ciclo dichiara davvero esterne, singole o a più passate.

**Corretto: cambiare Interna/Conto lavoro su una fase di ciclo poteva azzerare ore o giorni**
Il tempo di una fase si misura in due unità diverse — ore su una interna, giorni di attraversamento su una in conto lavoro — e i due campi non stanno mai a video insieme. Cambiando il fornitore, la riga si ridisegna un istante dopo il salvataggio: il salvataggio guardava però il fornitore **appena scritto** invece di quello che il campo a video rifletteva ancora, leggeva quindi un input che non c'era e azzerava in silenzio ore o giorni già inseriti. Stesso meccanismo, un'ora mai digitata da nessuno finiva su una fase esterna a costo fisso appena creata, perché il campo Ore (nascosto, a costo fisso su un centro esterno) nasceva con un valore proposto di serie invece che a zero.

**Corretto: nella scheda di un piano, il dettaglio del carico centri mostrava un altro conto**
La tavola "Carico dei centri" dentro la scheda di un piano dichiara esplicitamente di contare solo quel piano — c'è la frase sopra la tavola che lo dice. Cliccando una cella, però, il dettaglio veniva ricalcolato sui filtri globali della vista Carico centri (di norma: tutti i piani aperti insieme), un numero diverso da quello appena letto in tabella; se il piano era chiuso, poteva anche non trovare nulla. Ora il dettaglio aperto da dentro un piano usa lo stesso conto della tavola che lo ha aperto; dalla vista Carico centri il comportamento resta quello di sempre. Anche il nome del centro, dentro la scheda di un piano, ha smesso di essere un link che cambiava un filtro di un'altra vista senza muovere nulla a video.

**Copertura di test**
21 casi nuovi fra `test/contolavoro.test.js`, `test/cycle-op.test.js` e `test/carico.test.js`: la fase interna mandata fuori scarica e carica come una vera esterna senza toccare le tratte genuinamente esterne (singole o a più passate); ore e giorni sopravvivono al cambio di fornitore in entrambe le direzioni, e una fase esterna a costo fisso non nasce più con un'ora fantasma; il dettaglio di una cella nella scheda di un piano risponde con lo stesso conto della tavola, un piano cancellato non apre nulla, e la vista Carico centri conserva link e somma su tutti i piani.

### 0.72.0 — 2026-09-08

**Un ordine di lavoro è una tratta, non una fase — e il magazzino si muove ai due estremi del ciclo, non a quelli del documento.**

**Corretto: il magazzino si muoveva alla fase sbagliata**
Gli ancoraggi del conto lavoro guardavano **le righe del documento**. Una parte con fasi 10 interna, 20 Beta, 30 interna, 40 Beta ha **due** ordini di lavoro da Beta, e ciascuno — essendo prima e ultima riga di sé stesso — offriva sia lo scarico sia il carico: il materiale usciva due volte e il pezzo finito si caricava due volte. Ora gli estremi che contano sono quelli del **ciclo**:
- alla **prima tratta esterna** esce il **materiale del ciclo**, e scarica;
- all'**ultima tratta esterna** entra il **pezzo finito**, e carica;
- a ogni altro estremo si sposta il **pezzo stesso**, e non carica né scarica.

**Un terzo tipo di movimento: il passaggio di lavorazione**
Il pezzo che torna da un terzista per andarne a un altro non entra e non esce dal magazzino: **cambia luogo a quantità invariata**. Il movimento `clStep` lo dice, e porta due estremi — da chi arriva, a chi va — uno dei quali nullo, perché fra due terzisti il pezzo passa sempre da noi. È l'**unica eccezione** alla regola dell'esistente, scritta in un predicato solo (`movimentoToccaMagazzino`) invece che in un `if` sparso in ogni punto che somma movimenti:

> esistente = Σ ricevuto + Σ movimenti **che toccano il magazzino**

Fra due tratte i pezzi compaiono nel prospetto sotto **«in casa, fra due fasi»**: esistono, non sono a scaffale e non sono da nessun terzista, e questo è l'unico posto che li conta. Il filtro di magazzino diventa *presso terzi o in lavorazione* — la domanda che lo apre è la stessa, «cosa ho in giro?».

**Una riga per tratta, e un documento per passata**
- Le fasi **consecutive** dello stesso terzista sono **una** lavorazione da commissionare, non due righe da spuntare: stanno in una riga sola — «fasi 20-30» — con prezzo e giorni sommati e il dettaglio di ciascuna nella nota. Spuntarne una e non l'altra produceva un ordine che non stava in piedi.
- Le fasi dello stesso terzista **non** consecutive vanno in **ordini di lavoro distinti**: fra le due il pezzo torna da noi, e chiedergliele insieme era un ordine che il terzista non poteva eseguire di seguito. Il criterio è la *passata*, e nella scheda di generazione il secondo gruppo si chiama per nome — «Beta — seconda passata» — o due gruppi identici non si distinguerebbero.
- La **richiesta d'offerta** invece le tiene insieme, ed è voluto: chiedere non è commissionare, e a un preventivo si risponde una volta. Alla conversione in ordine si separano.
- La riga di documento porta ora `phaseKeys`, l'elenco di **tutte** le fasi che copre. Indicizzando solo la prima, le fasi in mezzo risultavano ancora da documentare e il fabbisogno le riproponeva — in un ordine che le conteneva già.

**Una volta sola, per davvero**
Niente impediva di registrare due volte la stessa uscita. Il conto si legge dai movimenti, che l'ordine e la riga li portano già: la scheda propone il **residuo**, e a residuo zero lo dice invece di riproporre il modulo come se niente fosse. Superarlo resta possibile — una rispedizione dopo uno scarto è legittima — perché vietarlo avrebbe trasformato un caso vero in un motivo per registrare fuori dall'app.

**Un ordine di lavoro scritto a mano**
Fin qui un ODL nasceva solo da un piano: l'unico modo di riempirne uno vuoto era la riga manuale, testo libero senza tariffa dal ciclo e senza nessuno dei comandi del conto lavoro. Ora **+ Lavorazione da ciclo** fa scegliere la parte fra quelle che un ciclo ce l'hanno, poi la tratta e i pezzi. Si vedono **tutte** le fasi — anche quelle di un altro terzista e quelle interne, marcate in elenco — perché mandare fuori una lavorazione che di solito si fa in casa è un caso vero, e l'app lo segnala invece di impedirlo. La riga che ne esce passa dalla **stessa fabbrica** di quella generata dal fabbisogno, e un caso lo verifica campo per campo. L'ordine però non è legato a nessun piano, ed è detto in pagina: lì la fase continuerà a risultare da ordinare.

**Carico centri: i codici, e il grafico**
- Sotto la tavola, **i codici da produrre**: codice, pezzi, settimana e le fasi interne con ore per pezzo e ore totali, ordinati per settimana e per ore decrescenti — la domanda che ci si fa guardandoli è «cosa lancio per primo». «62 ore alla tornitura» senza sapere su quanti pezzi era un numero da credere sulla parola. I **pezzi** non si sommano fra le fasi di uno stesso codice (ogni fase lavora gli stessi pezzi); le **ore** sì.
- Sopra, un **grafico a barre** per centro: una barra per settimana, la capacità come linea tratteggiata, gli stessi colori della tavola — neutro fino all'85%, arancio fino al 100%, rosso sopra. Un centro senza capacità dichiarata disegna le barre e nient'altro. Il grafico serve a dire **dove guardare**, non sostituisce i numeri: ogni barra porta il suo, e la tavola resta la lettura esatta.
- SVG scritto a mano, nessuna libreria nuova: le tre in `vendor/` ci sono perché un PDF e un foglio Excel non si scrivono a mano, un grafico a barre sì — e una libreria in più sarebbe un file in più da riverificare a ogni aggiornamento. Ogni blocco porta un `aria-label` che riassume il centro, per chi il disegno non lo vede.
- Cliccando il nome di un centro le due letture si restringono a quello, e il filtro entra anche nell'intestazione dell'export. L'export ha ora **due sezioni**, in forma lunga.

**Un saldo che si legge in ordine di data**
Emerso provando il giro con **lo stesso** terzista due volte: il saldo del presso-terzi era la differenza fra due totali, e la prima volta che i perni tornavano da Beta *uscivano* dal suo registro senza esserci mai entrati — da lui erano arrivati come tondo, e la trasformazione non la scrive nessuno. Quella partenza senza arrivo annullava il ritorno vero della seconda tratta, e il prospetto diceva che da Beta non c'era niente mentre i pezzi erano là. Il saldo si calcola ora **in ordine di data**, azzerando a ogni passo quel che andrebbe sotto zero: è la stessa regola già scritta — un saldo negativo è una trasformazione, non un debito — applicata a ogni passaggio invece che al totale.

**Note**
- **57 casi nuovi**, e i due che portano il peso sono il giro completo delle quattro tratte (il materiale esce **una** volta, il pezzo si carica **una** volta, e i due gesti in mezzo non toccano la giacenza) e il confronto campo per campo fra una riga scritta a mano e una generata dal piano. Poi le tratte e le passate, il residuo che si azzera, l'ordine di lavoro vecchio a una riga per fase che **conserva gli ancoraggi di prima** senza nessuna migrazione, i codici da produrre, e il grafico verificato contro la tavola invece che contro sé stesso. La suite passa da 1550 a **1607** casi.
- `README.md` e `docs/cloud-schema.md` aggiornati: la regola dell'esistente è riscritta con la sua eccezione, non lasciata in contraddizione.

### 0.71.0 — 2026-09-07

**Corretto: il materiale usciva una volta per fase invece che una volta per pezzo.**
Un ordine di lavoro ha una riga per fase, e ogni riga offriva *spedisci materiale* e *registra rientro*. Ma le fasi di un ciclo sono lavorazioni sullo **stesso** pezzo: due fasi dallo stesso terzista per quattro pezzi facevano uscire otto materiali e rientrare otto pezzi. L'app non sbagliava un conto — invitava a registrarne uno sbagliato, e il magazzino ci credeva.

**Il materiale esce una volta, e non è una scelta libera**
- Lo *spedisci materiale* sta ora sulla **prima fase** di ogni parte presente nel documento, il *registra rientro* sull'**ultima**. L'ordine è quello delle fasi del ciclo, non quello delle righe nel documento.
- Le fasi in mezzo non restano mute: dicono **dove** sono i comandi — «materiale in uscita alla fase 10, rientro alla fase 30» — perché la loro assenza somiglierebbe a un difetto.
- Ogni parte del documento ha i **propri** ancoraggi: due parti diverse escono e rientrano ciascuna per conto suo, e una parte con una fase sola esce e rientra sulla stessa riga.
- Il materiale che esce **non si sceglie più da un elenco di tutti gli articoli**: viene dal **ciclo della parte**, con le quantità già calcolate — *q.tà del ciclo × pezzi dell'ordine* — e correggibili. È lo stesso materiale che il fabbisogno ha già fatto comprare, ed è il senso della frase «il materiale in uscita è quello contenuto nel ciclo di lavorazione». La scheda registra un movimento per riga, e una quantità lasciata a zero non ne registra nessuno.
- Un ciclo **senza** materiale a magazzino lo dice invece di offrire una scheda vuota: quel materiale lo mette il terzista, e non c'è niente da scaricare.

**Un saldo negativo non è merce mancante**
Emerso provando il giro completo: rientrando **perni** dopo aver spedito **tondo**, il prospetto *presso terzi* mostrava «PERNO −4» — un pezzo che dal terzista non c'era mai stato. Un saldo negativo su un codice è come si vede una **trasformazione**, non un debito: il prospetto ora mostra i soli saldi positivi, e il filtro di magazzino «presso terzi» somma solo quelli. Sommare i negativi scalava da un articolo quello che sta fuori come un altro.

**Note**
- **11 casi nuovi** in `test/contolavoro.test.js`, e il primo è lo scenario che ha fatto vedere il difetto: due fasi allo stesso terzista per 4 pezzi, dove ora **escono 8 kg di tondo e rientrano 4 perni**, non 8 e 8. Poi gli ancoraggi (compreso quello che verifica che conti l'ordine delle **fasi** e non quello delle righe), il disegno a video con i comandi che compaiono una volta sola e la fase in mezzo che lo spiega, due parti nello stesso ODL, il materiale ricavato dal ciclo con i suoi casi limite, e la quantità a zero che non registra niente. La suite passa da 1539 a **1550** casi.
- Le righe di conto lavoro rimaste in un ordine d'acquisto da prima della separazione fra ODA e ODL passano dalla stessa scheda: hanno la stessa forma, e la stessa regola.

### 0.70.1 — 2026-09-07

**Corretto**
- **I due comandi di conto lavoro sotto una riga di ordine di lavoro si accavallavano alla descrizione della riga sopra.** La causa non è di misura ma di natura: `plandoc-link` disegna un riquadro (bordo più 6px di padding verticale) su uno `<span>`, e **un elemento inline con padding verticale non allarga la riga di testo che lo contiene** — il riquadro deborda sopra e sotto, e finisce addosso ai vicini. Nell'elenco dei documenti generati da un piano non si vedeva, perché lì quei riquadri stanno in un contenitore flex, dove diventano blocchi da soli. Sotto una riga di documento non c'era nessun flex a salvarli.
- La classe dichiara ora `display:inline-block`, e i due comandi hanno una **riga propria** (`line-cl-actions`, disposta in flex) invece di stare dentro `line-note`, che è un blocco pensato per una nota di testo. Il punto di separazione fra i due passa dallo spazio, non più da un `·` in mezzo ai riquadri.

**Lo stesso difetto, altrove**
Il controllo scritto per impedire il ritorno ne ha trovate **altre sei** con la stessa forma, latenti: `picker-type`, `rfq-pick-type`, `doc-badge`, `home-chip` e le due etichette di riga `rfq-manual-tag` e `rfq-clavoro-tag`. Nessuna si vedeva rotta oggi — vivono quasi sempre dentro contenitori flex, dove il difetto non si manifesta — ma bastava usarne una in mezzo al testo per ritrovare lo stesso accavallamento. Corrette tutte allo stesso modo: dove la classe sta in un flex la dichiarazione non cambia niente, dove sta inline la salva.

**Note**
- **3 casi nuovi** in `test/theme.test.js`. Il controllo non prova il disegno — la suite non ha un motore di layout — ma il **contratto fra i due file**: le classi che disegnano un riquadro si ricavano da `style.css` (bordo più padding verticale non nullo), gli `<span>` che le portano si ricavano dalle viste, e ognuna deve dichiarare un `display` che il riquadro lo contenga. L'elenco non è scritto a mano: se domani nasce un'altra classe con la stessa forma, la trova questo controllo invece dello schermo. C'è anche il caso che verifica che il controllo **stia provando qualcosa** — se `plandoc-link` smettesse di essere un riquadro, l'altro passerebbe a vuoto.
- Verificato che il controllo riconosca il difetto rimettendolo per un attimo: togliendo `display:inline-block` da `plandoc-link` la suite fallisce nominando la classe. La suite passa da 1536 a **1539** casi.

### 0.70.0 — 2026-09-07

**Il tempo di una lavorazione esterna si misura in giorni, non in ore.** Una fase interna occupa una macchina, e le sue ore sono quelle che alimentano il *Carico centri*. Una fase in conto lavoro non occupa niente di nostro: il pezzo esce, sta dal terzista, e torna. Contarla in ore rispondeva alla domanda sbagliata — di quante ore ci metta il terzista non importa a nessuno, importa **quando ripresenta il pezzo**.

**Nel ciclo di lavorazione**
- La colonna delle ore diventa **Tempo**, e cambia unità con la natura della fase: **ore (h)** su una lavorazione interna, **giorni (gg)** su una in conto lavoro. Si passa dall'una all'altra scegliendo o togliendo il fornitore, e la riga si ridisegna: cambia proprio cosa quel campo misura, e lasciarlo com'era avrebbe fatto scrivere il numero nel posto sbagliato.
- Le ore di una fase esterna **a costo orario** non spariscono: si spostano accanto alla tariffa, nella cella del costo. Lì sono **le ore che il terzista fattura**, cioè un pezzo del prezzo, non il nostro tempo — ed è l'unico punto in cui ha senso vederle.
- Le due grandezze restano **due colonne** nell'export del ciclo, con i rispettivi totali: una colonna che cambia unità riga per riga non si può né sommare né filtrare in un foglio di calcolo.

**Nel fabbisogno, ed è il motivo per cui esistono**
- I giorni di attraversamento diventano il **tempo di consegna** della fase: se il pezzo serve pronto il 30 settembre e il terzista ci mette cinque giorni, **l'ordine di lavoro deve uscire entro il 25**. È la stessa aritmetica dei giorni di consegna a listino per il materiale, e la stessa risposta quando il dato manca — nessun anticipo, non un anticipo inventato.
- La sezione **Da far lavorare fuori** ha una colonna **Ordinare entro** accanto a *Serve per*, con i giorni sottratti in chiaro e il badge di urgenza che finalmente significa qualcosa: prima era sempre calcolato sulla data in cui serve, come se un conto lavoro si potesse mandare l'ultimo giorno.
- Giorni e data d'ordine entrano nel foglio **Conto lavoro** dell'export Excel e nel blocco del PDF.

**Note**
- **12 casi nuovi** fra `test/cycle-op.test.js` e `test/mrp-cl.test.js`: la fase esterna che nasce con i giorni, l'aggiornamento che non azzera le ore fatturate a costo orario, i giorni che restano zero su una fase interna, la sopravvivenza al ricaricamento a due giri, e l'anticipo — compreso quello che **attraversa il cambio di mese**, il valore negativo che non anticipa al contrario, e la data mancante che non ne fa inventare una. Più il caso che tiene ferma la separazione: **i giorni non toccano il costo**. La suite passa da 1524 a **1536** casi.
- Una fase creata prima di questa revisione prende `days: 0`: nessun anticipo, che è il comportamento che aveva. Chi vuole la data d'ordine giusta scrive i giorni sulle fasi che gli interessano, quando gli interessa.
- **Scelta da conoscere**: i giorni sostituiscono le ore come *tempo* di una fase esterna, ma non le sostituiscono come *costo* — a modo orario servono ancora, e restano. L'alternativa sarebbe stata vietare il costo orario sul conto lavoro, che avrebbe fatto perdere le tariffe già registrate sui centri.

### 0.69.0 — 2026-09-07

**Ordini d'acquisto e ordini di lavoro sono due documenti diversi, e adesso lo sono anche nell'app.** Dalla 0.66.0 le lavorazioni in conto lavoro finivano come righe dentro un ordine d'acquisto: funzionava, ma metteva nello stesso documento due cose che nella realtà non lo sono — uno **compra della merce**, l'altro **manda dei pezzi a lavorare**. Al telefono con un terzista, «l'ordine 47» non bastava più a dire di cosa si stesse parlando.

**Ordini di lavoro (ODL)**, voce nuova nel gruppo Documenti
- Numerazione **sua**: `ODL-<anno>-NNN`, indipendente dagli `ODA-<anno>-NNN`. Elenco suo, filtri suoi, stampa sua — PDF ed Excel bilingui, intestati *Committente / Terzista* invece di *Richiedente / Fornitore*.
- Colonne pensate per una lavorazione e non per della merce: **Parte**, **Lavorazione**, **Pezzi**, **Tariffa (€/pz)**, data richiesta e confermata, **Rientrati / Ancora fuori**.
- Niente «+ Da catalogo»: un articolo non è una lavorazione, e la voce non c'è perché non avrebbe senso premerla.
- Stati, blocchi per stato, salvataggio differito, sblocco per modifica, guardie di ruolo: **tutto riusato** dal registro dei documenti, dove ODA e RDO vivono già. Dove il comportamento coincide davvero, due copie divergono.
- I due comandi del conto lavoro — *spedisci materiale* e *registra rientro* — stanno sotto ogni riga dell'ODL, dove terzista e ordine sono già decisi.

**Dal fabbisogno: tre pulsanti, tre documenti**
- «Genera ordini» prende **solo la merce**, «Genera ordini di lavoro» **solo le lavorazioni**. Un ordine d'acquisto non può più contenere una fase, e un ordine di lavoro non può contenere un articolo: lo decide un filtro per tipo di documento, in un punto solo.
- Un ODL per **terzista**: tutte le fasi affidate allo stesso, anche di parti diverse, in un documento — è la forma con cui si spedisce e con cui il terzista lo legge.
- «Genera richieste» invece li tiene **insieme**, e non è un'incoerenza: chiedere a un fornitore quanto costa il materiale **e** quanto costa lavorarlo è una domanda sola, ed è la richiesta d'offerta a farla.

**La richiesta si divide, e non perde niente**
Convertendo una richiesta che contiene sia merce sia lavorazioni nascono **due documenti** — un ODA e un ODL, entrambi che citano la richiesta e ne portano le condizioni — e la richiesta si chiude una volta sola. Una richiesta di sola merce si comporta come sempre; una di sole lavorazioni genera il solo ODL. Una richiesta **vuota** continua a produrre un ordine d'acquisto vuoto, com'è sempre stato: l'ODA resta il ripiego.

**Dove la separazione si vede**
- **Magazzino**: nessuna differenza, ed è il punto. Le righe di un ODL non hanno un articolo — la migrazione lo impone a ogni caricamento, non lo lascia alla disciplina di chi scrive — quindi non caricano niente da sé. Il rientro dei pezzi resta un movimento, e il prospetto *presso terzi* riconosce l'ODL come documento di riferimento.
- **Commesse**: la scheda ha un elenco **Ordini di lavoro** accanto a quello degli ordini, e l'impegnato somma i due — la domanda «quanto costa questa commessa» è una sola, e leggerla in due cifre da mettere insieme a mano non aiuta nessuno. Una commessa che regge un ODL non si elimina.
- **Riepilogo**: gli ordini confermati in ritardo comprendono gli ODL, in un avviso solo. Il tipo si legge dal numero e il click porta ciascuno nel suo elenco.
- **Ricerca globale**: sigla `ODL` accanto a `ODA` e `RDO`.

**Note**
- **21 casi nuovi** in `test/odl.test.js`, e non provano che l'ODL funzioni — quello lo prova la macchina che riusa — ma che le due cose restino **separate**: la numerazione che non continua la serie degli ODA, quali righe possono finire in quale documento, la richiesta mista che si divide senza perdere righe, il giro verso la forma normalizzata e ritorno, e il vincolo `itemId` nullo imposto dalla migrazione. Con gli aggiornamenti a `test/mrp-cl.test.js` la suite passa da 1497 a **1520** casi.
- Le righe di conto lavoro finite in un ordine d'acquisto **prima** di questa revisione restano dove sono, si riconoscono ancora come tali e conservano i due comandi per muovere il materiale. Non c'è una migrazione che le sposti: spostarle vorrebbe dire spezzare documenti già numerati, e ne varrebbe la pena solo se ce ne fossero — questa separazione arriva tre revisioni dopo che il conto lavoro è nato.
- `docs/cloud-schema.md` descrive le due tabelle nuove e **perché sono due e non una con un flag**, con la nota che la forma va tenuta allineata e che in cloud conviene una vista che le unisca per le domande che riguardano entrambe.

### 0.68.0 — 2026-09-07

**Il carico dei centri di lavoro.** Ultima parte del lavoro sulle lavorazioni: dopo l'approvvigionamento del conto lavoro (0.66.0) e il materiale presso i terzisti (0.67.0), restava la domanda che riguarda quello che si fa in casa — *le ore che ho promesso, il reparto le regge?* Fino a ieri `cycle[].workCenterId` e `cycle[].hours` non li leggeva nessuno fuori dalla costificazione: le ore c'erano scritte e non servivano a niente.

**Carico centri**, voce nuova nel gruppo *Cicli di lavorazione*
- Tavola **centro × settimana**: le ore che i piani chiedono a ciascun centro, contro una **capacità** dichiarata sul centro in ore/settimana. Saturazione in percentuale, neutra fino all'85%, arancio fino al 100%, **rossa sopra**, più il riepilogo in testa delle settimane sfondate **con i centri nominati**.
- Da ogni cella si apre il **dettaglio di chi ha portato quelle ore** — parte, fase, piano, ore. Non è un vezzo: vale la regola già scritta per il materiale impegnato, un numero che non dice da dove viene non si può contestare, e quindi neanche credere.
- Somma tutti i **piani aperti**, perché il centro è condiviso e «la tornitura regge?» non ha risposta guardando un piano per volta — stessa regola con cui si calcola il materiale impegnato. Si può restringere a un piano solo, e la stessa tavola sta in fondo alla scheda di ogni piano.
- Le ore si raccolgono da due posti: le **fasi interne** del ciclo di una parte prodotta in casa, e le **lavorazioni degli assiemi**. Le fasi in **conto lavoro** non caricano nessun centro interno: quelle si comprano, e stanno nel fabbisogno sotto «Da far lavorare fuori». Una parte acquistata non carica niente: quelle ore le fa il fornitore.
- Export Excel e PDF **in forma lunga**, una riga per coppia centro/settimana: un foglio con trenta colonne di settimane è illeggibile, in forma lunga si pivota in Excel in dieci secondi e si filtra per data — che è la promessa già scritta sugli export degli elenchi.

**Capacità sul centro di lavoro**
- Campo nuovo in *Gestione → Centri di lavoro*, in ore a settimana, con la sua colonna nell'export/import Excel delle impostazioni.
- **Zero significa «non dichiarata», non «nessuna capacità»**: un centro senza capacità mostra le ore e non il sovraccarico. Senza questa distinzione ogni centro esistente sarebbe risultato sfondato al primo caricamento, e il prospetto sarebbe nato già da ignorare. La vista lo dice, contando quanti centri sono in quello stato.

**Due promesse, e perché sono credibili**
Il motore del fabbisogno dichiara da sempre, in un commento, che **il time-phasing non si fa**: un fabbisogno *materiale* spezzato per periodi prometterebbe un MRP che non c'è. Quel commento è stato **riscritto**, non lasciato a contraddire il codice, con i tre motivi per cui il carico è l'eccezione.

1. **Non tocca il netting.** Le funzioni del fabbisogno netto restano identiche: il carico è un prospetto derivato in sola lettura, da cui non nasce nessun documento e nessuna quantità. Se domani lo si cancellasse, il resto dell'app non se ne accorgerebbe — e c'è un caso di prova apposta, che confronta i numeri del netto prima e dopo averlo letto.
2. **La domanda è diversa.** Sul materiale il periodo servirebbe a decidere *quando ordinare*, e a quello risponde già la data d'ordine senza secchielli. Sulla capacità il periodo **è** la domanda: la capacità è una portata, non uno stock.
3. **Non si promette nulla che non si dia.** Capacità infinita, dichiarata in pagina: il sovraccarico si vede, non si sposta. Nessuna schedulazione, nessun calendario, nessuna data di avvio di una fase. E le ore stanno nella settimana in cui **il pezzo serve pronto**, non in quella in cui si lavora — anche questo scritto in pagina, perché una data che sembra un piano di lavoro senza esserlo è peggio di nessuna data.

**Note**
- **25 casi nuovi** in `test/carico.test.js`, e i primi sei sono sull'aritmetica delle settimane ISO — che una implementazione ingenua sbaglia una volta l'anno e in silenzio: il 1° gennaio di un anno che comincia di venerdì sta nella settimana 53 dell'anno prima, il 31 dicembre può stare nella prima dell'anno dopo, e il lunedì si calcola **in UTC** o a est di Greenwich scivola al giorno prima — cioè in un'altra colonna del prospetto. È la lezione già pagata una volta sulle date d'ordine, e le nuove funzioni nascono con la stessa disciplina. Poi la raccolta delle ore, gli scarti che entrano nel moltiplicatore, i secchielli (comprese le righe **senza data**, che finiscono in una colonna dichiarata invece di sparire), capacità e sovraccarico, l'export, e i due casi che fanno valere il patto del punto 1. La suite passa da 1471 a **1497** casi.
- Due casi di `test/nav.test.js` usavano i Cicli come esempio di gruppo a voce singola, che ora non lo è più. Il comportamento provato non cambia: cambia l'esempio, e se n'è aggiunto uno sul caso opposto.
- **Difetto trovato e non corretto**, scritto in `docs/cloud-schema.md` per non riscoprirlo: `workCenters[].suppliers` — i fornitori conto lavoro aggiunti nella 0.64.0 — non è dichiarato nel registro dello schema né in quello dei riferimenti. Finisce in una colonna-array invece che in una tabella normalizzata, e la rimappatura degli id non lo attraversa. Stessa famiglia di `plans.jobId`. Non fa parte di questo lavoro ed è una decisione a sé.

### 0.67.0 — 2026-09-07

**Il materiale che sta dai terzisti.** La revisione scorsa ha portato le lavorazioni esterne dentro gli ordini; restava fuori la merce che si manda al terzista perché possa farle. Finché non era tracciata, spariva due volte: non era più a scaffale e non era in nessun conto, quindi il magazzino diceva zero e nessuno sapeva che venti chili di tondo stavano da Beta.

**Due movimenti nuovi**
- **Uscita a conto lavoro** e **Rientro da conto lavoro**, con il terzista (obbligatorio) e l'ordine che li giustifica (facoltativo). Si registrano dal **Magazzino**, come le rettifiche, oppure — ed è il posto naturale — **dalla riga d'ordine di conto lavoro**, dove terzista e ordine sono già decisi e resta da dire solo cosa esce e quanto.
- **L'uscita è negativa**: il materiale che parte esce dal magazzino, perché allo scaffale non c'è più. È lo stesso gesto del consumo di produzione, e non contraddice la regola per cui *la giacenza non è una colonna*: un movimento negativo è un addendo di quella somma, non un saldo scritto da qualche parte.
- I due movimenti portano l'articolo **che si muove davvero**: quello che esce e quello che rientra. Quando coincidono — grezzo fuori, lavorato dentro — il conto va a zero da sé; quando differiscono — materiale fuori, pezzi finiti dentro — il consumo del materiale è implicito nella coppia. Nessuna logica speciale in nessuno dei due casi, ed è il motivo per cui questo modello è stato preferito a uno che chiudesse il conto con un rientro fittizio compensato da uno scarico: due scritture per la stessa cosa, che nessuno terrebbe allineate.

**Il prospetto «presso terzi»**
- Non una vista nuova: il Magazzino elenca già gli stessi articoli. C'è un **filtro di stato** *Presso terzi*, un pulsante in toolbar che compare **solo se c'è qualcosa fuori**, e una scheda di dettaglio **per fornitore e per ordine** — che il filtro non può dare, perché la riga del magazzino è per articolo.
- Il saldo è per **coppia (fornitore, articolo)**, non per articolo soltanto: con codici diversi in uscita e in entrata, un saldo unico non significherebbe niente.
- **Calcolato dai soli movimenti**, come la giacenza. Nessun campo `presso terzi` da tenere allineato, e quindi niente che possa divergere: è la stessa regola per cui non esiste `onHand`, applicata a un secondo numero.
- Export Excel e PDF in forma piatta, una riga per coppia: terzista, codice, articolo, uscito, rientrato, ancora fuori, ordini, ultimo movimento.
- Lo storico dei movimenti di un articolo mostra ora il **terzista e l'ordine** accanto alla nota.

**Nessun doppio conteggio, e perché**
La garanzia è **strutturale, non aritmetica**: le righe d'ordine con un articolo caricano il magazzino via *ricevuto*, quelle senza caricano via movimento, e **una riga non può essere di entrambi i tipi**. Per questo la riga di conto lavoro deve avere `itemId` nullo — se qualcuno ce ne mettesse uno *e* registrasse il rientro, i pezzi risulterebbero il doppio. Il giro completo (tondo ordinato, ricevuto, spedito a Beta, perni rientrati) è verificato passo per passo, e c'è anche il caso per assurdo che dimostra cosa succederebbe violando il vincolo.

**Note**
- **14 casi nuovi** in `test/contolavoro.test.js`: i due tipi, i campi del movimento con e senza contorno, il movimento vecchio che prende i campi nulli e resta stabile a due giri, l'uscita che fa calare la giacenza, il prospetto per fornitore, il conto che si chiude, il filtro di magazzino, l'eliminazione che rimette dentro il materiale, l'export, il **giro completo in sei passi** e la prova per assurdo del vincolo. La suite passa da 1457 a **1471** casi.
- Nel registro dello schema, il commento su `stock_movements` diceva che i carichi da ordine non stanno lì. Resta vero, ed è stato spiegato perché i due movimenti nuovi possono portare un `orderId` senza violarlo: la riga d'ordine che li giustifica non ha un articolo, quindi non carica niente da sé. Senza la nota, il prossimo lettore avrebbe pensato che la regola fosse saltata.
- `REFS` sa ora seguire `movements.supplierId`. `orderId` e `lineId` restano fuori, perché `REFS` non ha una destinazione per gli ordini e gli ordini non sono mai stati rimappati: scritto in un commento invece di lasciare il buco muto.

### 0.66.0 — 2026-09-07

**Le lavorazioni in conto lavoro entrano nell'approvvigionamento.** Fino a ieri il fabbisogno rispondeva bene a una domanda sola — cosa comprare — e per le parti prodotte in casa si fermava a metà: scendeva nel ciclo a prendere il materiale e **scartava le fasi**, con un commento che diceva il vero a metà («le lavorazioni non si comprano a magazzino»: quelle esterne si comprano eccome, solo non finiscono a scaffale). Il risultato era che una zincatura da mille euro affidata a un terzista non compariva in nessun documento, e la si ordinava a memoria.

**Da far lavorare fuori**
- Una fase del ciclo con un **fornitore** è una lavorazione in conto lavoro, e ora entra nel fabbisogno accanto al materiale, in una **sezione propria** della scheda del piano: fase, centro, parte, terzista, data in cui serve, pezzi, ore totali, prezzo per pezzo e importo. Le fasi **senza** fornitore sono interne e restano fuori: non si comprano, si fanno.
- La quantità sono i **pezzi della parte**, con i moltiplicatori di distinta già applicati. Il prezzo è **per pezzo**: la tariffa scritta nel ciclo se la fase è a costo fisso, *ore per pezzo × tariffa* se è a costo orario.
- La tariffa è quella **congelata sulla riga** quando la fase è stata scritta, non quella che il centro ha oggi: ripescarla adesso cambierebbe da sé il prezzo di una fase che qualcuno aveva già deciso.
- Nuovo riquadro **Conto lavoro** fra i totali del piano, foglio **Conto lavoro** nell'export Excel e blocco nel PDF.

**Dal fabbisogno al documento**
- Le fasi entrano nella scheda «Genera richieste / Genera ordini» **nel gruppo del loro terzista**, accanto al materiale dello stesso fornitore: un documento solo, perché il fornitore è uno e la consegna è una. Si riconoscono a colpo d'occhio dal numero di fase e dalla chiave inglese.
- La riga di documento porta il **codice della parte** — è il pezzo che il terzista riceve, lavora e rispedisce, ed è il codice che cercherà sulla sua bolla — la descrizione della lavorazione, i pezzi come quantità e, a costo orario, *ore/pezzo × tariffa* nella nota, che la stampa mostra sotto la descrizione.
- Nel documento la riga è marcata **conto lavoro**, non più «manuale»: chiamare manuale ciò che l'app ha generato faceva sembrare improvvisato il contrario di quello che è. Il *ricevuto* su quella riga significa **pezzi rientrati dal terzista**: porta l'ordine a parziale o evaso, e **non carica il magazzino** — lo dice il suggerimento della cella.
- **Il fabbisogno netto non si applica alle lavorazioni**, ed è scritto in pagina invece che lasciato scoprire. Nettarle richiederebbe di sapere quanti pezzi sono già stati lavorati, cioè un avanzamento di produzione che Bomtrack non ha: fingere di saperlo produrrebbe quantità che nessuno può spiegare.

**Come si riconosce una fase già ordinata**
Il problema vero di questa revisione, e vale la pena dire come è stato risolto e come può sbagliare.

- La riga di documento di una fase ha **`itemId` nullo**, e deve averlo: è la garanzia *strutturale* contro il doppio conteggio di magazzino. L'esistente si calcola come *ricevuto sulle righe con articolo + movimenti*; il rientro dei pezzi sarà un movimento. Con un `itemId` le due strade si sommerebbero e i pezzi risulterebbero il doppio.
- Non potendo cercarla per articolo, la riga porta una **chiave di fase** congelata alla generazione — come già lo sono il codice e la descrizione, che pure sono copie. L'indice dentro la chiave conta **fra le sole lavorazioni**, non nell'array del ciclo: aggiungere una materia prima alla distinta parte è la modifica più frequente, e con l'indice assoluto avrebbe spostato la chiave di ogni fase successiva.
- **Come può sbagliare**: chi riordina le fasi dopo aver generato il documento vede la fase **riproposta**. È un falso negativo, e si vede — il documento è lì nell'elenco di quelli generati dal piano. L'alternativa avrebbe bloccato la fase *sbagliata*, e quello non si sarebbe visto. Fra i due modi di sbagliare si è scelto quello visibile, ed è scritto accanto alla funzione.
- **Non si è dato un id proprio alle righe di ciclo**, che sarebbe la strada apparentemente pulita: costringerebbe a cambiare il registro dello schema, la traduzione verso il database condiviso, la firma dei record e la politica di merge di quelle righe — che è *sostituzione dell'insieme* proprio perché un'identità di riga lì non esiste. Costo alto per un beneficio che la chiave dà senza toccare nulla.

**Note**
- **28 casi nuovi** in `test/mrp-cl.test.js`: l'esplosione (quantità lungo i livelli, fase interna esclusa, parte acquistata che non genera fasi, diamante che somma sulla stessa chiave, data più vicina, due fasi sullo stesso centro che restano due, anello troncato), la chiave e i suoi due comportamenti — quello che regge e quello dichiarato —, la riga di fabbisogno con i suoi campi *assenti*, la generazione dei documenti e la prova che una riga di conto lavoro ricevuta **non tocca il magazzino**. La suite passa da 1429 a **1457** casi.
- `planDocumentedItems` si chiama ora `planDocumentedKeys` e indicizza per articolo **o** per fase. La copertura di commessa continua a cercare per articolo: le voci di fase restano nella mappa e non le trova nessuno, innocue. Estendere il semaforo della commessa alle lavorazioni è una decisione a sé, non un effetto collaterale di questa.
- Scritti in `store.js`, accanto a `REFS`, i **due riferimenti che la rimappatura degli id non copre**: `plans.jobId` (innocuo, le commesse sono nate dopo) e la chiave di fase, che contiene un id articolo *dentro una stringa* e che nessuna sostituzione di campo saprebbe seguire. Meglio scritti che riscoperti.

### 0.65.0 — 2026-09-07

Primo passo verso l'approvvigionamento e la programmazione delle lavorazioni: prima di poterle ordinare o schedulare, le ore di una fase devono **esistere**. Fino a ieri non sopravvivevano a un riavvio.

**Corretto**
- **Le fasi a costo orario perdevano le ore a ogni caricamento, e valevano zero.** Una normalizzazione di `migrateDB()` — scritta prima che il modo di costo esistesse, e mai aggiornata quando è arrivato — cancellava `hours` da ogni riga di lavorazione priva di `cost`, cioè da **tutte** quelle a costo orario, che il costo non ce l'hanno per definizione. Si inseriva una fase da 2 h × 60 €/h, si riapriva l'app, e quella fase costava **zero**. Il difetto era silenzioso due volte: la riga restava a video con la sua tariffa, e il costo della parte scendeva senza che niente lo dicesse. Il valore scritto al suo posto usava per giunta la tariffa del **centro** invece di quella del **fornitore**, quindi sbagliava anche per chi se ne fosse accorto.
- **Le righe già danneggiate si recuperano**, dividendo il costo per la stessa tariffa con cui era stato moltiplicato — quella del centro, non quella del fornitore, perché è quella che il difetto usava: dividere per l'altra sbaglierebbe proprio dove il terzista ha una tariffa propria. **Il recupero cambia i costi mostrati** a chi era danneggiato, da zero al valore vero. È l'effetto voluto, ma i numeri si muovono.
- Dove il centro **manca o ha tariffa zero** le ore non sono ricostruibili, e non si inventano: restano a zero e finiscono fra gli avvisi del **Riepilogo** — «fasi a costo orario senza ore», con il codice della parte, il numero della fase e il centro, e il click che porta al ciclo. Un costo sparito non si scopre guardando il totale, che resta un numero plausibile.

**Le ore si separano dal costo**

Su una riga di lavorazione le ore e il costo rispondono a due domande diverse, e da questa revisione sono due campi indipendenti.

- **Le ore ci sono sempre**, anche su una fase a costo fisso, e hanno una **colonna propria** nella tabella del ciclo. Erano dentro la cella del costo, e comparivano solo in modo orario.
- **A costo fisso le ore non entrano nel costo**, ed è deliberato: un prezzo concordato con un terzista è quello, e farlo diventare *ore × tariffa* lo cambierebbe da sé. Ma quella fase il centro lo occupa lo stesso, e senza le ore il **carico dei centri di lavoro** non si potrebbe calcolare su metà delle fasi. È il pezzo che mancava, ed è il motivo di questa revisione.
- Cambiare il modo di costo non tocca più le ore: il tempo di una fase non cambia perché è cambiato il modo in cui la si paga.
- Le ore entrano nell'**export del ciclo**, con il loro totale.

**Note**
- **26 casi nuovi** in `test/cycle-op.test.js`: la regressione del difetto (una fase oraria che sopravvive al ricaricamento), il recupero e i suoi due limiti dichiarati, l'idempotenza a due giri, le righe precedenti al modo di costo, la separazione fra ore e costo, la fase nuova che nasce con le ore, e gli avvisi del riepilogo — con la fase numerata **fra le sole lavorazioni** e non nell'array intero, che è il numero che si legge a video. La suite passa da 1412 a **1429** casi.
- Un caso di `test/migrate.test.js` **codificava il difetto**: pretendeva che le ore sparissero. Ora pretende il contrario, con il perché scritto accanto.
- `docs/cloud-schema.md` descriveva `item_cycle_rows` com'era prima del modo di costo: niente `cost_mode`, niente `hours`, niente `rate`. Riscritta, con la distinzione fra riga articolo e riga lavorazione e il vincolo che tiene separate le due domande.

### 0.64.3 — 2026-09-07

Nessuna modifica all'app: si aggiunge il documento che mancava accanto al contratto cloud.

**Documentazione**
- **`docs/sostenibilita-free-tier.md`** — `cloud-schema.md` dice *come* i dati diventano tabelle, e non diceva *quanto occupano*. Ora il conto c'è, tabella per tabella, su tre scenari, con il modello di calcolo in fondo perché sia contestabile invece che creduto.
- Il verdetto è che il piano gratuito regge con margine ampio — **25% dello spazio a tre anni** nello scenario realistico — ma i tre numeri che contano non sono quelli che ci si aspetta:
  - **il budget non è 500 MB ma ~430**: un progetto Supabase vuoto ne occupa già 50–70 di cataloghi ed estensioni, e oltre il limite il progetto passa in sola lettura, cioè l'app smette di salvare;
  - **a stringere per primo è l'egress, non il disco**: un pull completo è ~5 MB compressi, e il polling ogni 20–30 s previsto dal percorso è sostenibile **solo incrementale** — a lettura piena sarebbero decine di GB al giorno contro un tetto di 5 GB al mese;
  - **crescono col tempo, non col catalogo**: `stock_movements` e gli snapshot delle revisioni sono da soli i due terzi dell'occupazione, e nessuno dei due dipende da quanti articoli ci sono.
- Detto anche cosa **non** serve, perché è l'ottimizzazione che viene in mente per prima: togliere le colonne di audit dalle tre tabelle a sostituzione d'insieme e sostituire l'id sintetico con una chiave `(item_id, pos)` risparmia il 4,6%. Va fatto per igiene — quell'id non è un'identità e non merita un indice unico — ma la capienza la decide la **retention dei movimenti**, non lo schema.

**Note**
- Restano segnati due rischi del piano gratuito che non riguardano lo spazio e che oggi non hanno risposta: la **sospensione dopo 7 giorni di inattività** (un'officina chiude due settimane ad agosto) e l'**assenza di backup automatici**. Costano entrambi poco da prevenire e molto da scoprire tardi.
- Il modello di calcolo nel documento è eseguibile con `node` senza dipendenze, e i numeri delle tabelle sono i suoi. Il giorno in cui il database esisterà, la query per confrontare previsione e realtà è nell'ultima riga del file.

### 0.64.2 — 2026-09-06

**Corretto**
- **La data «Serve per» nelle righe del piano di fabbisogno era l'unico campo data disegnato dal browser invece che dall'app**: fondo bianco, spigoli vivi, fuori tema — e proprio accanto alla quantità della cella di fianco, che invece era a posto. Era l'unico `<input type="date">` senza una classe, dentro una cella nuda, e nessuna regola del foglio di stile lo raggiungeva. Ora usa `rfq-date-input`, la stessa classe che le righe di richieste e ordini adoperano per lo stesso campo.

**Note**
- Controllati **tutti e dodici i campi data dell'app**, uno per uno e nei loro cinque contesti — testata documento, righe di richiesta e ordine, listino fornitori, filtro per periodo, righe di piano — a schermo e nei due temi. Gli altri undici erano a posto: stanno dentro `.modal-field`, che veste i suoi campi, oppure portano già una classe che il foglio di stile conosce.
- **Un controllo nuovo impedisce che ricapiti** (`test/theme.test.js`): ogni campo data deve avere una classe che il foglio di stile disegna davvero — l'elenco si ricava da `style.css`, non è scritto a mano — oppure stare in un contenitore che li veste. Verificato che il controllo riconosca il difetto rimettendolo per un attimo: un campo aggiunto domani in una cella si dimentica la classe, non il colore, ed è lì che va fermato.
- Verificato anche che l'icona del calendario segua il tema in tutti e tre gli stati (scuro, chiaro, «come il sistema»): su fondo scuro quella di serie è nera e sparirebbe.

### 0.64.1 — 2026-09-06

**Corretto**
- **Gli spazi digitati per sbaglio nei campi di commesse, richieste, ordini e piani finivano nel dato.** I form passano da `val()`, che li toglie da sempre; i campi di questi quattro documenti scrivevano invece il valore grezzo dentro il proprio setter. Su una descrizione è cosmesi; sul **Cliente di una commessa** no, perché quel testo **è la chiave** verso l'anagrafica: « Rossi Srl » con gli spazi coincide con il cliente registrato solo perché ogni confronto, altrove, si ricorda di ripulirlo — e basta che uno se ne dimentichi. La pulizia avviene all'uscita dal campo, non mentre si scrive, quindi il cursore non ne risente.

**Note**
- **25 casi nuovi in `test/customers.test.js`** sul giro completo del campo Cliente: l'elenco che si propone in ordine alfabetico, il cliente sospeso che sparisce dai suggerimenti, il nome fuori anagrafica che si scrive lo stesso (suggerire non è vincolare), la rinomina che allinea le commesse anche quando erano state scritte con altre maiuscole, il cliente citato che non si elimina, la ricerca e l'export dell'elenco.
- Verificato anche **in un browser vero**, che è l'unica cosa che la suite non può fare: il `datalist` viene davvero associato al campo, il browser offre le quattro voci attive delle cinque registrate, e il nome di un cliente scritto come un tag resta un **valore di testo** — zero elementi `script` finiti nella pagina. La suite passa da 1381 a 1399.

### 0.64.0 — 2026-09-06

Coda del controllo generale: le cose rimaste aperte, chiuse. Niente di quello che c'è qui si vede usando l'app — è tutta manutenzione, e serve a far durare quello che c'è.

**Unificate le griglie di Anagrafica e Magazzino**
Le due viste disegnavano lo stesso oggetto — gruppi con un titolo che conta, le prime 200 righe, un piede che offre di vederne altre — in due copie parallele. Ogni correzione andava fatta due volte, e la seconda prima o poi si dimentica: il `.table-wrap` mancante della revisione scorsa mancava **a tutte e due**, ed è la prova. Ora la griglia è una sola (`itemGrid`), e quello che le due viste hanno davvero di diverso resta fuori e si passa: le colonne, il disegno della riga, il limite corrente, i comandi del piede e cosa dire quando non c'è niente da mostrare — perché anche lì il Magazzino distingue «non c'è nulla a magazzino» da «i tuoi filtri non pescano niente», e sono due situazioni diverse.

Prima di toccare le due viste più usate è stata scritta la rete: **18 casi in `test/grid.test.js`** che descrivono il comportamento condiviso — la paginazione, il titolo che nomina il totale anche quando taglia, il taglio che riempie i gruppi in ordine invece di prendere un po' da ognuno — verificati sul codice di prima e ancora verdi su quello di dopo. Restano, perché è quel comportamento a dover valere in entrambe.

**Corretto**
- **Le chiavi dell'archivio locale seguono una convenzione sola.** Due preferenze usavano il punto (`bomtrack.columns`, `bomtrack.inspector`) e quattro l'underscore, senza che niente distinguesse i due gruppi: nessuna pulizia o diagnostica poteva raccoglierle per prefisso. Le due vecchie si **travasano** alla prima lettura invece di essere buttate: le colonne nascoste a mano in Anagrafica sono una scelta di qualcuno, e ricomparire tutte senza spiegazione sarebbe stato peggio del disordine.
- **`jobId` non era normalizzato** su richieste e ordini mentre `planId` sì: sui documenti creati prima delle commesse il campo mancava del tutto, e la traduzione per il cloud avrebbe prodotto righe con e senza quella colonna — l'incoerenza che tutte le altre normalizzazioni esistono per evitare.
- `THEME_KEY` è ripetuto, cablato, nello script in testa a `index.html`, e rinominarlo da una parte sola non produce **nessun errore**: il tema smette solo di applicarsi in anticipo e torna il lampo scuro. Ora i due punti se lo dicono.

**Copertura di test**
Quindici funzioni avevano zero test, ed erano quelle che toccano più dati in una volta: **`test/backup.test.js`**, nuovo, ne copre il blocco intero con 47 casi.

- **`validateSnapshot`** — la guardia scritta apposta per il file troncato, e la sola che nessuno provava. Ora ha i suoi otto casi: il file di un altro programma, la collezione che non è un elenco (e dice quale), la versione di schema illeggibile, il backup che viene da una revisione più recente.
- **Backup da file, come lo vive chi lo usa**: il file illeggibile, il JSON valido ma non nostro e il backup buono sono tre problemi diversi e vanno detti diversi; la conferma che mostra in numeri cosa entra e cosa si perde; l'annullamento che non tocca niente.
- **Azzeramenti**: `Store.reset`, `Store.clearAll`, `wipeAllConfirm` che pretende la parola esatta, i seed una-tantum che non devono ripopolare un database appena svuotato, chi azzera che resta dentro come amministratore.
- **`reconcileSession`**, cioè cosa succede alla sessione quando il database cambia sotto i piedi: il proprio utente che c'è ancora, il database senza utenti che riaccoglie chi sta lavorando, quello con altri utenti che chiede di rientrare.
- **Cestino e diagnostica**: ripristino, eliminazione definitiva, svuotamento, l'annullamento della conferma, i codici duplicati che vengono elencati e **non** corretti d'ufficio, lo spazio occupato che avvisa prima di sbatterci contro.
- **I fogli delle impostazioni**, uno per uno invece che di rimbalzo: la riga senza nome, la colonna assente contro la cella vuota (che sono due istruzioni diverse), la provincia in minuscolo, il booleano che deve poter dire «no», la tariffa con la virgola italiana.
- **I template**: che le colonne del template distinte siano davvero quelle che l'import rilegge — un template che l'import non sa rileggere è un contratto rotto — e che nell'export delle impostazioni non finisca nessuna password.

**L'attrezzatura**
- Il DOM finto dell'harness ha ora **l'elemento radice** (dove `theme.js` scrive il tema) e **le API dei file**: `FileReader`, `Blob`, `URL.createObjectURL`. Erano l'ultimo pezzo di piattaforma che mancava, e senza restavano fuori dalla suite tutte le porte d'ingresso dell'app — l'import distinte, quello delle impostazioni, il ripristino di un backup — cioè proprio le funzioni che toccano più dati in una volta. La lettura è sincrona, a differenza del browser: un test che debba aspettare un evento è un test che a volte passa.
- Tolte le `const` dichiarate dentro `eval` in `test/families.test.js`: in un contesto `vm` restano nel global lessicale, e funzionavano solo perché ogni caso crea un'app nuova.

**Note**
- La suite passa da 1287 a **1381 casi**. Il file dei test del backup è più lungo del codice che prova, ed è giusto così: sono i gesti che nessuno rifà a mano per verificarli, perché azzerare il database per vedere se funziona significa azzerarlo davvero.
- Resta una cosa che **non è un difetto ma una decisione**: all'import, un articolo che non aveva nessuna quotazione e ne riceve una sola se la vede attivare d'ufficio. È un ripiego voluto e commentato; l'effetto collaterale è che «prezzo deliberatamente non applicato» non sopravvive a un giro export→import su un database vuoto. Va deciso, non corretto di nascosto.

### 0.63.0 — 2026-09-06

Ultima parte del controllo generale: coerenza, duplicazioni, codice morto, prestazioni, documentazione allineata al codice.

**Aggiunto**
- **Sospendere una voce di anagrafica** (⏸), per fornitori, clienti e centri di lavoro. Il campo `active` era migrato, documentato nello schema cloud, esportato in Excel e **letto** in mezza app — i fornitori attivi nel menu dell'import, i clienti attivi nei suggerimenti della commessa, i centri attivi nella scelta della lavorazione — ma nessun comando lo poteva mettere a «no»: solo gli utenti avevano il pulsante. Era una promessa che l'app non manteneva. Sospendere non è eliminare, ed è la ragione per cui serve: un fornitore citato da ordini di tre anni fa non si può cancellare, ma non deve nemmeno continuare a comparire in ogni menu.

**Corretto**
- **Le date negli export degli elenchi erano testo.** In Excel non si ordinavano né si filtravano per periodo — proprio negli elenchi dove la domanda è «cosa è passato a settembre». Ora una colonna può dichiararsi di tipo data: le righe portano la data ISO e ciascun traduttore la scrive a modo suo, l'Excel come cella di data in formato `gg/mm/aaaa`, il PDF come testo all'italiana.
- **Un .csv in UTF-8 senza BOM entrava storpiato**: «Perché» diventava «PerchÃ©», e l'articolo finiva a catalogo così. Le altre due codifiche — la CP1252 di Excel italiano e l'UTF-8 con BOM — erano già gestite dalla libreria; questa no, e adesso si riconosce dai byte. Verificato passando dalla libreria vera, non per ipotesi.
- **«Oggi» si calcolava in quattro modi diversi**, e tre erano in orario di Greenwich: fra mezzanotte e le due davano **ieri**. Su un nome di file è una seccatura; sulla data di una quotazione no, perché quella data **è l'identità della riga** — una quotazione datata ieri è una riga nuova al posto di un aggiornamento. Ora passano tutti da `oggiISO()`, che guarda il calendario di chi lavora.
- **Sei schede di modifica in Gestione si aprivano senza chiedere il ruolo**: il dato era comunque protetto, ma chi è in sola lettura compilava tutto e scopriva il rifiuto solo su Salva — mentre le altre due glielo dicevano subito.
- **Quattro schede diverse condividevano gli stessi id di campo**: `eu-` era insieme «utente» e «unità di misura», `ec-` insieme «cliente» e «concetto». Non collidevano solo perché tutte e quattro usano la chiave pannello di serie e se ne apre una per volta: il giorno in cui a una si desse una chiave propria, il salvataggio dell'utente avrebbe letto il campo dell'unità di misura.
- **Le colonne di Acquisti e Progetto erano lo stesso array**, non una copia: la separazione che il commento descriveva valeva per le colonne nascoste, non per la definizione — aggiungerne una a Progetto l'avrebbe aggiunta anche ad Acquisti, senza un errore da nessuna parte.
- Tolte le **emoji rimaste** dove l'icona esisteva già, compresa quella che stava nella stessa lista che l'icona la usa, due righe più su. `icons.js` spiega da tempo perché: non ereditano il colore, cambiano forma da un sistema all'altro, si siedono sulla linea di base in modo diverso.
- La classe `muted` non esiste nel foglio di stile: il messaggio d'errore dell'app si stampava a colore pieno invece che attenuato.

**Prestazioni**
- **La generazione dei codici articolo era quadratica.** Per ogni codice si compilava una espressione regolare e la si provava su **ogni** articolo in archivio; durante un import è una volta per riga. Misurato su 4000 articoli e 2000 codici: **3339 ms → 5 ms**. È lo stesso costo che l'indice dei codici toglie alla *ricerca* e che era rimasto intatto sulla *generazione*.
- **Famiglie, concetti e autori hanno ora un indice**, come già articoli, fornitori e centri di lavoro: `getFamily` la chiamano l'elenco del catalogo per ogni riga e la codifica per ogni codice generato. Con la stessa guardia di freschezza degli altri, perché gli import creano famiglie dentro il ciclo e chiedono il codice subito dopo.
- `genItemCode()` **non parla più all'interfaccia**: durante un import sparava un toast per riga esaurita. Dice perché non ce l'ha fatta, e chi ha davanti una persona lo mostra, chi legge un file lo scrive nel report.

**Pulizia**
- Unificate le funzioni gemelle: le due letture di un file Excel (differivano di tre righe e ripetevano identiche le due gestioni d'errore), i due contatori dei report, i quattro modi di dire «oggi».
- `addressOneLine()` non era chiamata da nessuna parte, test compresi: eliminata. `toAltUom()` e `tablesForChanges()` invece **restano**, e ora lo dicono: non sono dimenticanze, sono metà di un contratto e il seam del futuro adapter, con i loro test.
- Tolta la variabile CSS `--wl-w`, manopola di un ridimensionamento mai implementato: il valore vero era da sempre il suo ripiego.
- `flattenDB()` si appropria dei nomi `pos` e `childSets` per tradurre: ora se ne accorge invece di rompere in silenzio il giro completo che `test/cloudmap.test.js` verifica.
- L'unico `confirm()` nativo rimasto — dentro `openModal` — resta, e ora è scritto perché: `openModal` è sincrona e ottanta chiamanti ci scrivono dentro subito dopo, mentre `askConfirm` risponde con una richiamata. Sostituirlo vorrebbe dire rendere asincrona l'apertura di ogni scheda dell'app.

**Documentazione**
- `docs/cloud-schema.md` allineato al codice: il conteggio delle collezioni (fermo a «nove» da quattro collezioni fa, e ora non più scritto), il nuovo registro `REFS`, il contratto `takeChanges()`/`markSynced(mark)`, il `touch()` del ripristino dal cestino, `orders.requested_delivery` che il client cancella a ogni caricamento, e il fatto che `settings` non è in `SCHEMA` — quindi nessuna tabella la genera, e l'adapter deve trattarla a parte.

**Note**
- 25 casi nuovi fra `test/codes.test.js` e `test/vendor-xlsx.test.js`, compreso il confronto dell'indice dei progressivi con l'implementazione precedente, presa verbatim da git, su sette casi limite. La suite passa da 1270 a 1287.
- **Non fatto, e vale la pena saperlo**: la griglia dell'Anagrafica e quella del Magazzino restano due implementazioni parallele della stessa cosa — stessa struttura, stessa paginazione, già divergenti sulla firma di una funzione. Unificarle è un lavoro a sé, e farlo di sfuggita dentro un controllo generale avrebbe toccato le due viste più usate senza una rete di test all'altezza.

### 0.62.0 — 2026-09-06

Terza parte del controllo generale: quello che l'app diceva a chi non guarda lo schermo, e a chi lo guarda stretto.

**Corretto**
- **Tutta la validazione era muta.** Ogni messaggio dell'app passa dal toast — «Nome richiesto», «Codice già in uso», «La quantità non può essere negativa», e le decine di altri — ma il toast non era una *live region*: per un lettore di schermo quei messaggi non esistevano, e il salvataggio semplicemente «non faceva niente» senza che si potesse sapere perché. Ora l'elemento si annuncia, e distingue le due urgenze: un errore interrompe (`assertive`), una conferma aspetta il proprio turno (`polite`).
- **La schermata di accesso non aveva etichette.** I tre campi vivevano sul solo `placeholder`, e `a11yFields()` — che ripara le etichette delle schede — non ci passa mai, perché cerca `.modal-field` e l'accesso usa un'altra classe. È l'unica schermata che ogni utente attraversa per forza. Le etichette sono ora vere e riservate ai lettori di schermo (`.sr-only`): il disegno della scheda non cambia di un pixel. Anche l'errore di credenziali viene annunciato.
- **99 intestazioni di tabella non dichiaravano di essere colonne.** Su griglie da 12-16 colonne, senza `scope` un lettore di schermo non associa la cella alla sua intestazione: la navigazione per celle diventa una sequenza di numeri senza etichetta.
- **Anagrafica e Magazzino sfondavano il viewport.** Erano le due sole griglie a emettere una tabella nuda, senza il `.table-wrap` che documenti, fabbisogno, listino e scheda articolo usano da sempre: su schermo stretto trascinavano in scorrimento orizzontale **l'intera pagina**, intestazione e navigazione comprese. Ora scorre la tabella, dentro sé stessa.
- **I pulsanti di navigazione perdevano il nome sotto i 1330px.** Lì la media query nasconde l'etichetta, e `display:none` toglie quel testo anche all'albero di accessibilità: restava solo il `title` come ripiego. Ora ogni gruppo porta il proprio nome esplicito, e la seconda riga dichiara quale vista è quella aperta (`aria-current`).
- **Il pannello laterale non si ridimensionava col dito.** Gli ascoltatori erano `mouse*`: su tablet la maniglia era inerte e il pannello restava largo quanto nasce, rubando spazio all'elenco per sempre. Ora sono `pointer*` — sostituzione uno a uno — con `touch-action:none` sulla maniglia, altrimenti il dito farebbe scorrere la pagina invece di trascinare.

**Note**
- **Il DOM finto della suite ora ricorda gli attributi.** `setAttribute` era un no-op e `getAttribute` non esisteva: tutto ciò che l'app scrive in un attributo — i ruoli dei pannelli, le etichette che `a11yFields` ripara, l'urgenza del toast — si poteva provare solo per il fatto che non lanciava, non per quello che diceva. È una lacuna dell'attrezzatura, non di una funzione, e apre alla verifica un'intera classe di comportamenti.
- 14 casi nuovi in `test/a11y.test.js`, fra cui uno che rifiuta qualsiasi `<th>` senza `scope` in tutte le viste: la regola non si può più dimenticare aggiungendo una colonna. La suite passa da 1256 a 1270.

### 0.61.0 — 2026-09-06

Seconda parte del controllo generale: una regressione appena introdotta, e i punti in cui l'app accettava di salvare qualcosa che poi non sapeva più leggere.

**Corretto**
- **Nel tema scuro erano sparite le ombre** di schede, toast e pannello laterale. La riga che definiva i due token diceva `--shadow:var(--shadow)`: una variabile che cita sé stessa è invalida, e ogni regola che la usa viene scartata senza che il browser protesti. Introdotta con i temi della 0.58.0 e invisibile rileggendo il foglio, perché sembra una riga come le altre — ora un test rifiuta qualsiasi token che si autodefinisca, e verifica che le variabili usate senza valore di scorta esistano davvero.
- **«Salva» poteva svuotare un nome che «Aggiungi» pretendeva.** `saveSupplier` e `saveWc` accettavano il campo vuoto — un fornitore senza nome è una riga bianca in Gestione, e ogni richiesta e ordine intestati a lui stampano «senza fornitore» in PDF senza che niente lo segnali. `saveFamily` e `saveSubFamily` facevano di peggio: tenevano il nome di prima e annunciavano lo stesso «Aggiornata», così chi aveva svuotato il campo credeva di aver rinominato. I quattro passano ora da `requireVal()`, che è lo stesso controllo del ramo «aggiungi».
- **La modifica di un componente di distinta poteva salvarlo senza articolo.** Il controllo c'era su «aggiungi» e non su «modifica»: con il selettore lasciato vuoto la riga restava in distinta puntando al nulla, e il report la stampava vuota.
- **Sottogruppi e parti si contendevano gli stessi codici.** Dentro `MAC-GRP-###` i sottogruppi scendono da 999 e le parti salgono da 1, ma il calcolo del prossimo numero guardava solo i pari tipo: quando i due blocchi si incontravano l'app proponeva un codice **già in uso**, e poi lo rifiutava da sé con «codice già in uso» — sempre lo stesso, a ogni tentativo. Un vicolo cieco da cui si usciva solo scrivendo il codice a mano. Ora la numerazione salta i numeri dell'altro blocco, e quando lo spazio è davvero finito lo dice invece di proporre un doppione.
- **`kg` e `KG` convivevano come due unità di misura distinte**, contate separate e rinominate una per volta, lasciando le altre righe appese al codice vecchio.
- **La sessione scadeva dal primo accesso, non dall'ultimo.** Chi usa l'app tutti i giorni veniva comunque rimandato alla password al trentesimo giorno — mentre la ragione per cui la scadenza esiste è la postazione condivisa lasciata aperta, cioè quella dove nessuno entra da settimane. Ora rientrare rinnova.
- **Un avviso d'import poteva eseguire codice.** Il messaggio «sigla già in uso» interpolava il nome preso da una cella Excel senza passarlo da `esc()`, e i due report d'import lo stampano in `innerHTML`: bastava una macrofamiglia chiamata come un tag. Tutti gli altri avvisi del progetto escapavano già; questo era l'unico che se n'era dimenticato, ed è ora l'unica convenzione, scritta accanto a dove si stampa.
- **`esc()` non copriva l'apice singolo.** Nessun exploit vivo — gli attributi `onclick="fn('…')"` ricevono solo identificatori generati — ma il primo che ci passasse il nome di un articolo si sarebbe rotto su «L'albero», e su qualcosa di peggio avrebbe fatto altro.
- **Una vista senza il suo pannello lasciava l'app completamente vuota**: le viste erano già state spente, e l'eccezione fermava il resto. Ora non si cambia vista e l'errore viene registrato.
- **Lo stato delle schede non si spegneva alla chiusura.** Chiuso il listino, la variabile che ricorda su quale articolo si stava lavorando continuava a puntare lì, e un ridisegno arrivato da altrove scriveva sull'articolo sbagliato. Ogni scheda dichiara ora come si ripulisce (`onPanelClose`), accanto a dove quello stato viene creato.
- **`newId()` poteva lanciare proprio dove serviva il ripiego**: il fallback usava `crypto` fuori dalla guardia che stava verificandone l'esistenza — cioè nei contesti datati su `file://` per cui il fallback è stato scritto.
- **`resetViewState()` azzerava i filtri dei documenti con la forma precedente**, senza i due estremi del filtro per periodo: rimasti fuori il giorno stesso in cui sono nati. Ora si azzerano dalla funzione che li definisce.
- Ripulita `toggleItemFields()`, che dereferenziava dodici nodi senza guardia e due con: il giorno in cui un campo esce dal template, la scheda articolo smetteva di aprirsi del tutto.

**Note**
- `saveOwnPassword` passa ora da `Store.update` come tutto il resto: era rimasta l'unica scrittura sugli utenti che scavalcava la porta dello Store, cioè quella che l'adapter cloud intercetterà.
- 18 casi nuovi fra `test/theme.test.js`, `test/validate.test.js`, `test/codes.test.js` e `test/families.test.js`. La suite passa da 1238 a 1256.

### 0.60.0 — 2026-09-06

Controllo generale del codice. Questa revisione non aggiunge niente che si veda: chiude i punti in cui l'app **perdeva o falsava dati senza dirlo**. Sono difetti vecchi, trovati leggendo, e ognuno ha ora un test che impedisce che tornino.

**Corretto — dati**
- **La migrazione dai dati v1 rimappava quattro riferimenti su tredici.** Convertendo gli id vecchi in UUID seguiva fornitore, famiglia, sottofamiglia dell'articolo, componenti e lavorazioni; **lasciava indietro** le quotazioni a listino, macchina e gruppo di una parte, il fornitore di richieste e ordini, l'articolo delle loro righe, le righe dei piani, i movimenti di magazzino e le revisioni. Chi apriva l'app con un archivio v1 trovava ordini senza fornitore, righe senza articolo e movimenti orfani — con la migrazione già salvata. I riferimenti stanno adesso in un registro unico (`REFS`, accanto a `SCHEMA`), e le mappe di conversione sono **una per tipo**: gli id vecchi degli articoli erano numeri nudi, e una mappa sola poteva scambiare l'articolo 3 per il fornitore 3.
- **Ogni installazione nuova nasceva con tre quotazioni intestate a un fornitore inesistente.** Il seed del listino gira prima delle migrazioni e scriveva l'id vecchio del fornitore nella riga di listino, che nessuno rimappava più: in Gestione comparivano come «senza fornitore». Era una delle nove classi dimenticate, e si è chiusa con loro.
- **Un archivio locale illeggibile veniva sostituito dai dati di esempio e salvato sopra.** Un JSON interrotto — scrittura a metà, spazio finito, chiavetta sfilata — è quasi tutto ancora lì, e un recupero a mano ne salva la maggior parte: cancellarlo era l'unica cosa da non fare. Ora il blob resta dov'è, **una copia va da parte** (`bomtrack_v1_illeggibile`), non si salva niente sopra finché l'utente non lo decide, e una scheda spiega cos'è successo e che i dati non sono persi. Prima c'era solo una riga in console.
- **Un import distinte poteva svuotare una distinta e non rimetterla.** Il padre veniva azzerato alla prima riga valida e il controllo dei cicli arrivava dopo: un file la cui unica riga per quel padre creava un ciclo lasciava la distinta vuota, con un messaggio d'errore al posto dei componenti. Ora, se per un padre non entra nemmeno una riga, **la sua distinta torna quella di prima** e il report lo dichiara.
- **«1.234,56» entrava come 1,23.** `numOr` sostituiva la prima virgola e lasciava i punti — un prezzo plausibile, e falso — nelle quantità di distinta, nei parametri delle impostazioni e nelle tariffe orarie. Il parser giusto era già scritto per lo stesso difetto (`catNumOf`), e ora lo usano entrambi.
- **Le date a due cifre sbagliavano di 120 anni.** «31/01/26» non passava la regola italiana, cadeva nel ramo del seriale Excel dove `parseFloat` si ferma alla barra e legge 31, e diventava **30 gennaio 1900**; «2026-1-5» diventava 1905. E siccome la data è l'**identità** di una quotazione, nasceva un doppione datato 1900 che il confronto prezzi considerava vecchissimo. Ora si leggono anno a due cifre e mesi non impaginati, e il ramo del seriale si prende solo le celle che sono davvero un numero.

**Corretto — sincronizzazione** (nessun effetto oggi, che l'app è locale; sono le fondamenta su cui poggerà il database condiviso)
- **Il conto delle modifiche era cieco alle righe figlie.** Confrontava il solo timbro del record radice: rinominare una sottofamiglia tocca la sottofamiglia, non la famiglia, e quella rinomina risultava **«niente da mandare»**. Ora la firma di un record comprende i figli con identità propria — sottofamiglie, quotazioni, righe di documento — e non dipende più dalla disciplina di quaranta punti di chiamata.
- **Il conto e la fotografia che lo azzera si prendono ora insieme** (`Store.takeChanges()`). Fotografare al ritorno dalla rete marcava come già inviato tutto ciò che era stato scritto **durante** l'invio: modifiche perse in silenzio.
- **Ripristinare un backup, azzerare o svuotare il database non lascia più credere che sia tutto allineato**: la fotografia si dichiara non valida, e il riallineamento tocca a chi può confrontare le due parti.
- **Un ripristino dal cestino ridata il record.** Rientrando col timbro che aveva prima di essere eliminato sarebbe stato più vecchio della lapide, e il primo scarico dal server l'avrebbe ricancellato — che è esattamente ciò che `docs/cloud-schema.md` chiedeva di evitare.

**Corretto — quello che il file Excel si portava via**
- **Preferito e Obsoleto non si potevano più spegnere da file**: l'export scriveva la cella vuota per «no», e l'import legge la cella vuota come «non toccare». Ora il no è scritto.
- **La nota di una quotazione in linea non finiva in nessuna cella** (colonna «Note prezzo»): un articolo con una sola quotazione la perdeva al primo giro su una postazione nuova.
- **«Attivo» dei centri di lavoro non veniva esportato né riletto**, e il nome non si aggiornava mai: un centro sospeso rinasceva attivo, e le sue ore tornavano a costare.
- **Ricaricare lo stesso file senza la colonna «Fornitore» creava un doppione di quotazione** a ogni giro, contro la regola dichiarata nei template — «una colonna cancellata lascia il campo com'era».
- **Un refuso nel «Fattore» cancellava la doppia unità in silenzio**, e il costo d'acquisto cambiava senza traccia. Ora è un errore di riga, come già era venti righe più giù.

**Corretto — interfaccia**
- **Il toast verde «Salvato» non compare più quando il salvataggio non è avvenuto.** Con l'archivio pieno o in navigazione privata si vedeva la conferma verde e, sopra, la scheda rossa che diceva il contrario: due messaggi opposti sullo stesso gesto. Quaranta conferme passano ora da `savedToast()`, che tace se i byte non sono arrivati.

**Note**
- Le righe d'ordine restano **sempre nell'unità di gestione**, col prezzo convertito: una barra gestita a metri e quotata a chilo si ordina in metri a *(kg per metro) × (prezzo al chilo)*. Era già il comportamento dell'app da due revisioni, ma **un test era rimasto sulla regola opposta** e la suite era rossa da allora — cioè la verifica automatica non guardava più nessuno. È tornata verde, e `docUomFor()`, rimasta in giro con il commento della regola vecchia, è stata tolta: un lettore che avesse trovato quella prima avrebbe capito il sistema al rovescio.
- 34 casi nuovi fra `test/migrate.test.js`, `test/import.test.js` e `test/sync.test.js`. La suite passa da 1204 a 1238.
- Nota di metodo emersa dai test: i timbri hanno **risoluzione al millisecondo**, quindi due scritture nello stesso millesimo sono indistinguibili per il conto delle modifiche. Oggi non ha effetto — l'app è locale e salva tutto — ma è il limite del protocollo, e va saputo prima di appoggiarci il backend.

### 0.59.0 — 2026-09-06

**Aggiunto**
- **Anagrafica clienti** (*Gestione → 📇 Clienti*), accanto a quella dei fornitori e con gli stessi campi: nome, referente, email, telefono, P.IVA / C.F., indirizzo completo e note. Fino a ieri il cliente esisteva solo come **testo dentro la commessa**, riscritto a mano ogni volta: lo stesso cliente diventava «Rossi Srl», «Rossi S.r.l.» e «rossi», e nessun elenco lo rimetteva insieme.
- **I nomi dell'anagrafica si propongono nel campo Cliente della commessa.** È un suggerimento, non un vincolo: la commessa di un cliente che in anagrafica non c'è ancora si scrive lo stesso, e il cliente si registra dopo. I clienti sospesi non si propongono.
- **Il foglio Clienti entra nell'export e nell'import delle impostazioni di Gestione**, con le stesse regole degli altri: chiave il nome, additivo, non cancella niente.

**Note**
- **Il campo Cliente della commessa resta testo, e non è una scorciatoia.** Trasformarlo in un riferimento all'anagrafica vorrebbe dire riscrivere elenco, ricerca ed export delle commesse — e soprattutto **lasciare senza cliente le commesse già scritte**, che un cliente in anagrafica non ce l'hanno per definizione. Il legame resta quindi il nome, e da lì discendono le tre regole che lo tengono in piedi: il nome è **unico** (due omonimi renderebbero ambigua la citazione), **rinominare un cliente allinea le commesse** che portavano il vecchio nome — altrimenti resterebbero appese a un nome che in anagrafica non esiste più — e **un cliente citato da una commessa non si elimina**, come per i fornitori usati da un articolo. Il giorno in cui la commessa prendesse un riferimento vero, la migrazione sarà un abbinamento per nome: è la ragione per cui il nome si tiene unico da adesso.
- Il rename allinea confrontando i nomi **ignorando spazi e maiuscole**: una commessa scritta « bianchi » non deve restare indietro proprio perché qualcuno aveva battuto uno spazio di troppo.
- I clienti sono una collezione come le altre — cestino con ripristino, timbri di modifica, tabella `customers` nella mappa cloud: non un elenco a parte da ricordarsi di trattare a mano.
- 18 casi in `test/customers.test.js`.

### 0.58.1 — 2026-09-06

**Corretto**
- **Sette contrasti sotto la soglia di leggibilità, sei dei quali c'erano da sempre nel tema scuro.** I peggiori: il pulsante **Salva** quando ci sono modifiche non salvate (bianco su ambra, **2.2:1**) e il toast di conferma (bianco su verde, **2.8:1**). Più il blu d'accento sia come testo (4.24:1) sia come fondo dei pulsanti pieni (4.06:1), il rosso del badge «non salvato» (3.5:1) e il rosso Acrobat del pulsante PDF (4.0:1). La soglia è 4.5:1 — quella del testo normale, che vale anche per le scritte dei pulsanti: sono in grassetto ma a 12-13px, molto sotto i 18.66px da cui il testo conta come «grande».

**Note**
- **Un colore ha due mestieri, e non può farli con lo stesso valore.** Uno lo si **legge** — testo, bordi, icone — e deve staccare dal fondo della scheda; sull'altro ci si **scrive sopra** — i pulsanti pieni — e deve staccare dall'inchiostro. Sul tema scuro i due vincoli tirano in direzioni opposte: perché il blu si legga sulla scheda serve luminanza ≥ 0.225, perché regga il bianco serve ≤ 0.183. **La finestra è vuota: nessun blu può fare entrambe le cose**, e quello di prima stava esattamente nel mezzo, mancandole tutte e due di poco. Da qui `--accent` per il primo mestiere e `--accent-solid` per il secondo, e lo stesso per rosso e verde. Sul tema chiaro il fondo bianco allarga la finestra e i due valori coincidono, ma i nomi restano: il foglio di stile non deve sapere quale tema è in corso.
- **L'ambra fa eccezione e cambia inchiostro invece che tinta.** Scurirla fino a reggere il bianco la spegnerebbe proprio dove serve gridare — è il pulsante che dice «hai modifiche non salvate». Resta accesa e la scritta diventa scura: 8.1:1 invece di 2.2:1. Sul tema chiaro l'ambra è già scura e l'inchiostro torna bianco, e questo lo decide un token (`--on-orange`), non una regola in più.
- Gli spostamenti sono piccoli e la faccia dell'app non cambia: il blu d'accento va da `#3A7BE8` a `#4583E9`, il fondo dei pulsanti a `#2A70E6`. Il rosso Acrobat scende a `#E41C1C`, che resta il rosso di quel formato.
- **7 casi nuovi in `test/theme.test.js` che non provano codice, provano numeri** — ed è il motivo per cui servono. Un colore si sposta di due punti perché «si vedeva meglio» e la leggibilità se ne va senza che niente si rompa: nessuna schermata sbaglia, nessun test fallisce, semplicemente qualcuno in officina fatica a leggere. Ora la soglia è scritta, la palette si rilegge dal foglio di stile vero — non da una copia nel test, che si direbbe d'accordo con sé stessa — e un contrasto che scende fa fallire la suite nominando il colore.

### 0.58.0 — 2026-09-06

**Aggiunto**
- **Tema chiaro, oltre a quello scuro.** Il pulsante è nell'intestazione, accanto a stampa e ricerca, e gira su **tre** stati: *come il sistema*, *chiaro*, *scuro*. Il primo è quello di partenza ed è anche il più utile — il PC sa già se fuori è giorno, e in officina lo schermo si guarda alle sette del mattino e alle sette di sera. Chi sceglie esplicitamente vince sul sistema, e la scelta resta al riavvio.

**Note**
- **Il colore stava già tutto in dodici variabili**, usate ~340 volte: il tema non ha richiesto di riscrivere il foglio di stile, ma di scrivere una seconda palette e di sistemare **45 righe** che avevano ancora un colore fisso. La prova che l'impianto reggeva c'era da sempre in fondo al file — il blocco di stampa ridefinisce gli stessi token in chiaro, e non ha mai avuto bisogno di una regola in più.
- **Il chiaro non è lo scuro invertito.** Le tinte d'accento leggibili su fondo scuro su bianco non lo sono: l'arancio `#E8A33A` su bianco dà 1.9:1, illeggibile, e va portato all'ambra. Blu, rosso e verde sono anche testo, non solo bordi, e sono stati scuriti per la stessa ragione. Sulla carta bianca del tema chiaro ogni colore sta ora fra 5.3:1 e 17:1.
- **Le tinte tenui sono derivate, non riscritte**: i fondi degli avvisi, le pastiglie di tipo, le righe selezionate nascono da `color-mix` sui colori di base, quindi esistono una volta sola e seguono il tema da sé. Un `rgba()` fisso è invece un colore pensato per un fondo solo — ed era il motivo per cui quelle 45 righe non potevano cambiare tema.
- **Il tema si applica prima che la pagina si disegni**, con quattro righe in testa a `index.html`: `theme.js` sta in fondo al body, e aspettarlo significherebbe un lampo scuro in faccia a chi ha scelto il chiaro.
- **«Come il sistema» si esprime togliendo l'attributo**, non scrivendo `data-theme="auto"`: è l'assenza a restituire la decisione alla media query. È il punto su cui è facile sbagliare senza accorgersene — il tema resterebbe bloccato a metà — ed è quello che i test coprono per primo.
- **La preferenza vive nel browser di chi lavora, non nel database.** È una comodità personale, come la larghezza dell'ispettore: sincronizzarla imporrebbe il proprio tema ai colleghi. Per la stessa ragione il comando sta nell'intestazione e non in Gestione, che scrive solo l'amministratore: il tema lo sceglie chi guarda lo schermo, qualunque ruolo abbia.
- **Stampare col tema scuro attivo non annerisce la pagina.** Il blocco di stampa ora ripete il selettore con l'attributo: senza, `:root[data-theme=dark]` vinceva per specificità e usciva un foglio nero. La carta resta bianca in tutti e tre gli stati.
- Rosso Acrobat e verde Excel restano fissi: sono i colori dei due formati, non del tema, e cambiarli col fondo li renderebbe irriconoscibili proprio dove distinguono due pulsanti gemelli.
- 13 casi in `test/theme.test.js`. Il colore non si prova senza un motore di rendering; si prova il **contratto** fra i due pezzi — quale attributo `theme.js` scrive e quando lo toglie — che è esattamente ciò che non si vede rileggendo il CSS.

### 0.57.0 — 2026-09-06

**Aggiunto**
- **La sigla di una macrofamiglia non si può più ripetere nel suo ambito, e quella di una sottofamiglia dentro la sua macrofamiglia.** La sigla non è un'etichetta: compone il codice articolo — `CMM-MEC-CUS-007` — e ripetuta lo rende ambiguo, perché da quel codice non si risale più a quale delle due famiglie `MEC` venga il pezzo. Un codice costruito a segmenti che non identifica più la sua famiglia ha perso la ragione per cui è fatto così. Il controllo scatta in Gestione su tutti e quattro i punti in cui una sigla si scrive: nuova macrofamiglia, modifica, nuova sottofamiglia, modifica.
- **Le sigle già ripetute si vedono**, in un riquadro in testa alla scheda famiglie del loro ambito e in rosso accanto alla riga che le porta. L'elenco dice che il problema esiste, il rosso dice quale riga aprire.

**Note**
- **Il campo di gara è quello che il codice non ha già fissato da sé.** Per una macrofamiglia è il suo ambito, perché il prefisso `CMM`/`MAT`/`PRT` separa già i tre: `CMM-MEC` e `MAT-MEC` non si confondono, e vietare anche quello esaurirebbe presto le sigle di tre lettere per nulla. Per una sottofamiglia è la macrofamiglia che la contiene, perché il segmento precedente l'ha già scelta: `CMM-IDR-GUA` e `CMM-MEC-GUA` sono due codici distinti. La regola vieta esattamente ciò che crea ambiguità, e niente di più.
- **Le sigle duplicate già in archivio restano**, e non bloccano il lavoro: si impedisce di introdurne di nuove, non si punisce chi c'era già. Riscriverle d'ufficio cambierebbe di nascosto il prefisso dei codici futuri di una famiglia, e a decidere quale delle due cambiare è una persona. È la stessa scelta, e lo stesso riquadro, dei codici articolo duplicati in Gestione › Backup. I codici già assegnati non cambiano in nessun caso.
- **Chi lascia il campo sigla vuoto è soggetto alla stessa regola**, ma il messaggio lo dice: la sigla dedotta dal nome («Meccanismi» → `MEC`) altrimenti sembrerebbe arrivare dal nulla. Le sigle automatiche sono le prime tre lettere del nome, quindi le collisioni non sono un caso di scuola: «Meccanico» e «Meccanica» danno entrambe `MEC`.
- **Negli import la sigla si scosta da sola** — le famiglie lì si creano senza nessuno davanti, e un file di 500 articoli non deve fallire per tre lettere in comune. Si cerca la prima libera allungando prima sul nome, che resta leggibile (`MEC` → `MECC` → `MECCA`), e solo dopo numerando (`MEC2`); il tetto è 6 caratteri, quanto il campo accetta. Ogni scostamento finisce scritto nel report: l'import impostazioni ha ora una sezione avvisi in arancio, distinta dagli errori in rosso, perché quelle righe sono entrate — solo non esattamente come erano scritte.
- 29 casi nuovi in `test/families.test.js`, dove i due test che contano di più sono quelli che dicono *ammesso*: stessa sigla in un altro ambito, stessa sigla in un'altra macrofamiglia. Sono loro a distinguere questa regola da un'unicità globale, ed è su uno di loro che la prima stesura sbagliava.

### 0.56.0 — 2026-09-06

**Aggiunto**
- **Filtro per periodo in tutti e quattro gli elenchi**: richieste, ordini, commesse e piani di fabbisogno. Un intervallo *dal … al …*, che si può lasciare aperto da un lato solo (*dal 1 settembre* in poi, oppure *fino al 30 giugno*). Vale sulla data del documento — per le commesse è la **data di apertura**, quella che risponde a «cosa abbiamo preso in carico a settembre», non la consegna. Entra nel conteggio, nel pulsante **Azzera filtri** dove c'è, e nell'intestazione dell'export, che dichiara il periodo a parole — «dal 1/9/2026 al 30/9/2026» — perché un elenco stampato senza dire su cosa è filtrato è un elenco che qualcuno leggerà come completo.

**Cambiato**
- **Le testate dei documenti sono più compatte, e ora si somigliano davvero.** Gli otto campi di un ordine (titolo, fornitore, data, stato, resa, pagamento, conferma d'ordine, note) occupavano quasi uno schermo pieno per via di spazi vuoti che si sommavano fra loro, e le righe cominciavano sotto la piega. Ora la scheda entra in un colpo d'occhio. Lo stesso ritmo verticale vale per **richieste, ordini, commesse e piani di fabbisogno**: sono quattro volte lo stesso gesto — i dati di intestazione di un documento — e ora hanno la stessa forma, campi dentro una scheda riquadrata sotto la barra dei comandi. Prima commesse e piani li tenevano nudi sullo sfondo, e le quattro pagine si somigliavano solo a metà.

**Note**
- Il filtro è **uno solo per quattro elenchi** (`dateRangeFilter`, `inDateRange`, `dateRangeText` in `worklist.js`, dove sta già il telaio comune): quattro copie della stessa coppia di caselle divergerebbero al primo ritocco, e il filtro dello schermo e quello dell'export devono restare lo stesso codice — altrimenti il file e la schermata raccontano due storie diverse dello stesso periodo.
- Le date si confrontano come stringhe `AAAA-MM-GG`, che è già l'ordine del calendario: nessuna conversione, nessun fuso orario di mezzo. I documenti più vecchi che portavano l'istante completo invece del solo giorno vengono tagliati prima del confronto, e un documento senza data resta fuori quando un intervallo è impostato — non avendo data, non si può dire che ci cada dentro.
- Lo spazio recuperato non viene da campi più piccoli ma da margini contati due volte: `manage-wrap` distanzia già i blocchi col suo `gap`, e il gap dei flex **non** si fonde coi margini — ogni blocco che ne portava uno apriva una fascia in più. Stessa cosa dentro la scheda, dove `modal-field` (nato per le finestre modali, dove è lui a distanziare) si sommava al `gap` della griglia: 24px fra una riga e l'altra invece di 12. Le regole stanno in `style.css` sotto `manage-wrap`, `rfq-head` e `modal-grid`, e valgono per le quattro pagine insieme.
- Il riquadro su commessa e piano si ottiene dallo stile, non riscrivendo il markup: la regola guarda le griglie di campi **in pagina** (`.manage-wrap > .modal-grid`) e non tocca quelle dentro le finestre modali, dove la scheda è già la finestra e un riquadro dentro il riquadro non direbbe niente.

### 0.55.0 — 2026-09-05

**Aggiunto**
- **Mettere una commessa «In produzione» adesso controlla se il materiale c'è.** Prima non controllava niente: si scriveva lo stato e basta, e che mancassero dieci articoli lo si scopriva in officina — quando il lead time era già perso e la data al cliente era già stata data. Ora compare una domanda che nomina i codici mancanti e la data di consegna, con due vie: *Metti in produzione lo stesso* oppure *Non ancora*. **Non blocca**: l'app avvisa e lascia decidere, perché chi ha un'urgenza vera deve poter andare avanti senza barare sui dati — dati falsi, poi, restano.
- **Sezione «Copertura materiale» nella scheda della commessa**, sempre leggibile, più un KPI in cima. I codici sono le stesse pastiglie del riepilogo, e ognuna porta al piano che genera quella riga: è lì che si emette la richiesta o l'ordine.
- **In Riepilogo → «Richiede attenzione»**: le commesse **già in produzione** a cui manca materiale da ordinare, gravità alta come una consegna sforata. La conferma la vede una persona sola, una volta; se dopo l'avvio un ordine slitta o un piano cresce, il riepilogo è l'unico posto che rilegge il presente.
- Il magazzino sa ora anche **quando** arriva la merce ordinata, non solo che arriva: `incomingEntro(itemId, data)` divide ciò che arriva in tempo da ciò che arriva dopo. La data è quella confermata dal fornitore se l'ha data, altrimenti quella che gli abbiamo chiesto — la stessa coppia che legge `orderWorstDelay`.
- `test/job-coverage.test.js` (25 casi), più i casi su `incomingEntro` e `commitsOn` in `test/stock.test.js` e il nuovo segnale in `test/home.test.js`.

**Note**
- **Quattro livelli, perché sono quattro telefonate diverse.** *Da ordinare*: non è ordinato, si compra — l'unico che costa un lead time. *In un documento non ancora inviato*: la richiesta o l'ordine esistono già in bozza; dire «ordina» a chi il documento l'ha scritto è falso, gli manca di premere Invia (e una bozza, giustamente, non conta come merce in arrivo). *In arrivo dopo la data in cui serve*: non c'è niente da comprare, c'è un fornitore da sollecitare — confonderlo con «da ordinare» farebbe ricomprare merce già pagata. *Coperto*. Un semaforo rosso solo li appiattirebbe, e un avviso che dice «manca» anche a chi ha già ordinato si impara a chiudere senza leggerlo.
- **Una commessa senza piani di fabbisogno aperti non è «tutto ok»: è «non lo so»**, e la commessa lo dice così, sia nella scheda sia nella domanda. Una spunta verde lì sarebbe una bugia comoda, detta proprio a chi sta per avviare il lavoro.
- **La commessa è una domanda sola, non N piani.** Le righe di tutti i suoi piani aperti si sommano prima di guardare il magazzino: due piani della stessa commessa che chiedono 100 pz con 100 a scaffale non devono vedersi scoperti a vicenda. Da qui `commitsOn()` che accetta anche un insieme di piani da escludere — la concorrenza sono gli **altri**, non noi. I piani di altre commesse restano concorrenza, come prima.
- Nessun calcolo nuovo: si riusano `mrpExplode`, `mrpBuyRow` (con il netto forzato, come fa il riepilogo — il conteggio non deve dipendere dall'interruttore della vista Fabbisogno), `netRequirement` e `planDocumentedItems`. Nessun campo salvato, nessuna prenotazione: la copertura è calcolata, e cambia da sola quando arriva la merce.
- **Nessun flag «avviso già visto»**: la domanda si fa solo entrando in produzione, e solo se non ci si è già. Un ritocco a una nota non la fa ricomparire, e uscire dalla produzione non chiede niente. Un flag salvato congelerebbe una risposta data ieri e contraddirebbe la sezione Copertura.
- I piani **chiusi** restano fuori, come già per gli impegni: chiuderli è il modo di dire «questo lavoro non c'è più». Se le distinte contengono un anello, l'esplosione è troncata e la copertura non si dichiara mai «coperta»: sarebbe una promessa che non si può mantenere.

### 0.54.0 — 2026-09-05

**Cambiato**
- **Le righe di richieste e ordini stanno su due piani.** Una riga d'ordine aveva dodici colonne, e dodici colonne su uno schermo normale vogliono dire testo minuscolo o scorrimento orizzontale — e con lo scorrimento il codice, che è l'identità della riga, esce dallo schermo. Le colonne però non erano dodici cose diverse: erano **sei coppie**, e adesso stanno una sopra l'altra dentro la stessa cella.

  | | sopra | sotto |
  |---|---|---|
  | 1 | codice | descrizione |
  | 2 | quantità | unità di misura |
  | 3 | prezzo unitario | importo di riga |
  | 4 | data richiesta | data confermata |
  | 5 | ricevuto | residuo |
  | 6 | modifica riga / nota | togli la riga |

  Sopra sta il dato che si compila, sotto quello che lo spiega o ne consegue. Le richieste di offerta hanno le stesse coppie meno quelle che una richiesta non ha: niente ricevuto e niente data confermata.
- Il vantaggio non è solo lo spazio: **le due metà si leggono insieme**. «10 pz» e «120,00 €» stanno una sotto l'altra invece che a mezzo schermo di distanza, e il residuo sta sotto il ricevuto che lo produce.

**Aggiunto**
- La richiesta di offerta mostra ora l'**importo di riga** (quantità × prezzo offerto), che prima si vedeva solo nel confronto offerte.
- `test/doc-rows.test.js`: le colonne dichiarate in testata, le celle di ogni riga e i `colspan` del totale e della riga vuota devono raccontare la stessa tabella — sbagliarne uno solo storce l'intestazione rispetto ai dati. E ogni coppia deve stare nella sua cella, con il campo giusto sopra e il suo esito sotto.

**Note**
- Una riga di documento resta **un solo `<tr>`**: i due piani sono due righe dentro ogni cella, non due righe di tabella. Così l'ordinamento, il blocco dei campi e la selezione continuano a valere su una riga sola, e nessuno può separarne le metà.
- Il blocco dei documenti inviati vale come prima su entrambi i piani: quantità e prezzo restano contratto, ricevuto e data confermata restano ricevimento.
- La riga manuale continua a dichiararsi, e la nota di riga, il codice del fornitore e gli avvisi (lotto, non a listino) restano sotto la descrizione, dove stavano.

### 0.53.0 — 2026-09-05

**Aggiunto**
- **«Richiede attenzione» dice adesso chi lo ha fatto scattare.** Sotto ogni riga compaiono i codici e i numeri che la riguardano: le commesse in ritardo per numero, gli articoli sotto scorta o senza prezzo per codice, le richieste in attesa e gli ordini confermati tardi per numero di documento. Prima si leggeva «7 articoli sotto la scorta minima» e per sapere **quali** bisognava aprire il magazzino e rifare a mano il filtro — cioè rifare il lavoro che l'avviso aveva già fatto.
- **Ogni voce porta dove si risolve**, non alla vista in generale: la commessa alla sua commessa, la riga di fabbisogno al piano che la genera (è lì che si emette la richiesta o l'ordine), l'articolo alla sua scheda. La riga di intestazione continua a portare alla vista.
- Il **suggerimento di ogni voce dice perché è lì**: il cliente e la data della commessa, l'esistente contro la scorta minima, i giorni di ritardo confermati dal fornitore, il piano e la quantità da ordinare.
- Le voci sono **in ordine di urgenza**: la commessa più vecchia per prima, l'ordine con il ritardo peggiore per primo, le righe di fabbisogno per data entro cui ordinare.
- Oltre **otto voci** si scrive quante ne restano («+4 altri in Acquisti»): il conteggio in testa resta il totale vero, e l'elenco resta un dettaglio invece di diventare la vista.
- `test/home.test.js`: ogni avviso deve nominare chi lo ha fatto scattare, ogni voce deve portare dove si risolve, e il conteggio deve restare quello vero anche quando le voci scritte sono meno.

**Note**
- I **codici duplicati** si nominano ma non si aprono: aprire uno dei due non direbbe quale dei due è quello sbagliato, e si sbrogliano in Gestione. La pastiglia resta testo, con il bordo tratteggiato, e il suggerimento elenca gli articoli che se lo contendono.
- Le voci stanno **fuori** dal bersaglio della riga: un pulsante dentro un pulsante non si sa più cosa apre, né col mouse né da tastiera.
- Nessun conteggio è cambiato: gli avvisi sono gli stessi di prima, con la stessa provenienza. Cambia solo che adesso si spiegano.

### 0.52.1 — 2026-09-05

**Corretto**
- **La pagina si ricentra quando il pannello laterale si chiude.** Lo spazio del pannello veniva preso con un `margin-right` su `#app-main`, che però spegneva l'`auto` responsabile del centraggio: con il sinistro `auto` e il destro fisso, tutto lo spazio libero finiva a sinistra e il contenuto si schiacciava contro il pannello — su uno schermo largo, spostato di centinaia di pixel fuori asse. Restava storto anche a pannello chiuso, per via della striscia da 38px.
- Ora la scatola si allarga di quanto è largo il pannello e si imbottisce a destra di altrettanto: i margini restano `auto` e il contenuto si centra da sé **in ciò che si vede**, sia a pannello aperto sia a pannello chiuso. La larghezza utile del contenuto non cambia di un pixel rispetto a prima.

### 0.52.0 — 2026-09-05

**Cambiato**
- **Commesse, Fabbisogno, Richieste di offerta e Ordini hanno la stessa forma**: l'elenco vive in una colonna a destra e non se ne va mai, il documento scelto sta al centro. Prima erano quattro pagine-elenco a tutta larghezza, e aprire un documento faceva sparire l'elenco: per passare al successivo si tornava indietro, si ritrovava la riga, si riapriva. Confrontare due ordini o passare in rassegna dieci richieste voleva dire fare quel giro dieci volte.
- I **filtri stanno con l'elenco**, impilati nella sua colonna: sono il modo per restringerlo, non un'intestazione della pagina. Gli stessi di prima — testo, stato, fornitore per i documenti; testo per commesse e piani — con il conteggio sotto.
- La **riga aperta resta marcata** nell'elenco, e i documenti chiusi, annullati o non più attivi si vedono spenti invece di sparire.
- Il pulsante **← Elenco** è diventato **Chiudi**: l'elenco non è più un altrove in cui tornare.

**Aggiunto**
- I comandi che stavano nelle righe sono ora nella **testata del documento aperto**, scritti per esteso: *Crea ordine* ed *Elimina* sulla richiesta, *Elimina* sull'ordine, *Duplica* ed *Elimina* sul piano (che già aveva chiudi/riapri). In una colonna da 360px non ci stanno sei icone per riga, e un comando che agisce su un documento ha senso dove quel documento si vede.
- Con nessun documento scelto, al centro compare **cosa fa quella vista** e il pulsante per creare il primo documento, invece di una pagina bianca.
- `test/worklist.test.js`: le quattro viste devono disegnare lo stesso telaio, l'elenco deve restare visibile a documento aperto, la riga aperta deve essere una sola e i comandi spostati devono esistere ancora.

**Corretto**
- **Saltare da un documento all'altro non perde più le modifiche in sospeso.** Il salvataggio differito di richieste e ordini lo faceva l'uscita verso l'elenco; con l'elenco sempre presente quel passaggio non c'era più, e un click sulla riga accanto avrebbe buttato via quel che si era appena scritto. Ora ogni apertura chiude il documento precedente come faceva l'uscita: salva, e lascia decadere l'eventuale sblocco — che vale per un documento solo. Vale anche per i salti da un'altra vista (dalla commessa alla sua richiesta, dal piano ai documenti che ne sono nati).
- La ricerca di **Commesse** e **Fabbisogno** ridisegna solo l'elenco: prima rifaceva la vista intera e il campo perdeva il focus a ogni lettera.

**Note**
- Il telaio sta in `worklist.js`, ed è **solo un disegno**: prende dati e restituisce HTML, non tiene stato. Le viste che non lo chiamano non se ne accorgono.
- Nessuna funzione è stata tolta: stesse guardie di ruolo, stesso blocco dei documenti inviati (i filtri dell'elenco non hanno classi `lock-*` e restano manovrabili anche a documento protetto), stessi export.
- In stampa esce il documento, non lo strumento per sceglierlo: la colonna dell'elenco non finisce su carta. Sotto i 1100px le due colonne si impilano, con l'elenco sopra.

### 0.51.1 — 2026-09-05

**Corretto**
- **All’avvio l’app segnalava un errore** («Script error.»). `columns.js` e `inspector.js` erano stati messi **dopo** `import-export.js`, che in fondo contiene `init()`: quando l’avvio disegnava la prima vista quei due file non erano ancora stati letti, e la chiamata a `inspectorClear()` dentro `setView()` trovava il vuoto. La vista si disegnava lo stesso — l’eccezione arriva in coda — ma il pannello non si popolava e partiva l’avviso. I due script ora stanno prima, e `import-export.js` è tornato l’ultimo, com’è scritto nella sua stessa intestazione.
- Il messaggio era muto («Script error.», senza riga né stack) perché aprendo `index.html` con un doppio click gli script arrivano da `file://`, che per il browser è un’origine opaca: dei propri script non racconta niente. Vale la pena saperlo per la prossima volta: un «Script error.» secco, in locale, è quasi sempre un’eccezione vera in uno degli script dell’app.

**Aggiunto**
- Tre controlli in `test/scripts.test.js` che rendono impossibile ripeterlo: `import-export.js` deve restare l’ultimo script, la sequenza caricata dalla suite deve essere **identica** a quella di `index.html`, e ogni script dichiarato deve esistere. La suite non se n’era accorta perché nel suo contesto il `document` finto si installa **dopo** il caricamento: `init()` non parte, e l’ordine sbagliato non si vedeva.

### 0.51.0 — 2026-09-05

**Aggiunto**
- **Selezione multipla e azioni di massa** negli elenchi con il pannello. `Ctrl+click` aggiunge una riga, `Maiusc+click` prende tutto quello che sta in mezzo, `Maiusc+freccia` fa lo stesso da tastiera. Con più righe scelte il pannello cambia mestiere: mostra quanti sono e di che tipo, e offre le azioni che hanno senso su un mucchio di articoli qualsiasi.
- Le azioni: **segna come non più utilizzabili** (o il contrario), **preferiti**, **esporta la selezione** in Excel e PDF, **elimina**. Marcare obsoleti quaranta codici uno per uno è il lavoro che si rimanda per sempre, e l’anagrafica resta sporca.
- Il pannello **elenca le righe scelte**: agire su venti articoli senza vederne l’elenco è firmare senza leggere.

**Note**
- Le regole non cambiano perché il gesto è uno solo: stesse guardie di ruolo, stesso `touch()` sull’autore, stesso cestino. Chi è in sola lettura vede solo gli export.
- Chi è **usato in una distinta non si elimina**, come da sempre: la conferma dice prima quanti resteranno fuori, invece di lasciarlo scoprire a gesto fatto. E il conto di quanti sono cambiati **davvero** viene detto sempre: chi ne sceglie quaranta e ne vede cambiare trentotto deve sapere che due non si potevano toccare.
- Il ripristino è uno solo per tutto il gesto: chi si pente si pente dell’intero blocco, non di una riga.
- L’export della selezione riusa la specifica della vista con la scelta come filtro in più, e lo scrive nell’intestazione del file («Selezione: 12 righe scelte a mano»): fra un mese, chi apre quel foglio deve sapere perché contiene quelle righe e non altre.
- Un filtro più stretto non butta via la scelta: cadono le righe che spariscono, restano le altre.

### 0.50.0 — 2026-09-05

**Aggiunto**
- **Colonne a scelta** negli elenchi di Acquisti, Progetto e Magazzino. Il pannello laterale aveva tolto dalle righe i comandi; qui si tolgono le colonne che a una certa persona, in un certo lavoro, non servono — chi compra non guarda il lotto, chi controlla il magazzino non guarda la famiglia. Nascondere non è perdere: l’articolo scelto ha tutto nel pannello, che di spazio ne ha.
- Il pulsante **Colonne** dice quante ne mancano («Colonne (2 nascoste)»): un elenco a cui manca una colonna, senza che nulla lo dica, sembra un elenco rotto. Dentro la scheda le caselle si spuntano e l’effetto è immediato, senza chiuderla.
- Codice e nome **non si nascondono**: sono l’identità della riga, e senza di loro l’elenco non è più pulito, è illeggibile. Restano visibili nella scheda, spenti e spiegati, invece di sparire senza motivo.
- Ogni elenco tiene la **sua** scelta: Acquisti e Progetto disegnano le righe con la stessa funzione, ma sono due elenchi che si guardano per motivi diversi.

**Note**
- Il meccanismo è deliberatamente stupido: ogni cella porta la classe della sua colonna e nascondere è una regola CSS. Nessun ridisegno, nessun conteggio di `<td>` da tenere allineato con i `<th>` — la stessa classe sta su entrambi.
- Una preferenza salvata mesi fa non sopravvive a una colonna tolta dal codice o diventata fissa: al caricamento si scarta ciò che non esiste più.
- **L’export Excel e PDF resta completo**: esporta l’elenco, non la vista. Chi nasconde una colonna per lavorare più comodo non deve ritrovarsi un file monco.
- I due interruttori del fabbisogno («Fabbisogno netto», «Raggruppa per fornitore») usavano già la classe `active` senza che nessuna regola la disegnasse: ora, come il pulsante Colonne, da accesi si vedono azzurri.

### 0.49.0 — 2026-09-05

**Aggiunto**
- **Pannello laterale** (Ctrl+I): una colonna a destra, ridimensionabile trascinandone il bordo, che mostra i comandi eseguibili sulla riga scelta e le schede da consultare. Gli elenchi erano arrivati a nove colonne più una di pulsanti — sei icone mute per riga, che rubavano larghezza ai dati e si spiegavano solo passandoci sopra. Ora quei comandi hanno un posto fisso, con l’etichetta scritta per esteso, e l’elenco torna a essere dati.
- In cima al pannello un **riepilogo** — tipo, costo unitario, giacenza, quanti impieghi diretti — che risponde alle domande veloci senza aprire niente.
- **Selezione da tastiera**: ↑ e ↓ scorrono le righe, Invio apre la scheda completa, Esc deseleziona. Valgono solo mentre si guarda l’elenco: dentro un campo la freccia resta al cursore.
- Larghezza (fra 260 e 720px), apertura e scheda attiva **restano fra una sessione e l’altra**, nel browser di chi lavora.

**Cambiato**
- Con il pannello aperto **la colonna dei pulsanti sparisce** da Acquisti, Progetto e Magazzino: i suoi comandi sono nel pannello. Chiudendo il pannello torna dov’era — nessuna funzione è stata tolta, è cambiato dove si trova.

**Note**
- Il pannello non aggiunge comandi: sono le stesse chiamate che stavano nelle righe, alle stesse condizioni (il listino solo per ciò che si compra, il ciclo solo per le parti). In sola lettura i comandi che modificano non vengono nemmeno disegnati, come già accade nella vista.
- Le schede riusano i corpi che esistono già (`itemInfoBody`, `priceListBody`, `usageBody`): due copie della stessa scheda divergerebbero al primo ritocco.
- Le viste non ancora coperte non hanno pannello e non se ne accorgono. Restano da fare, in ordine: selezione multipla con azioni di massa, scelta delle colonne per vista, selezione nell’indirizzo.

### 0.48.3 — 2026-09-05

**Cambiato**
- Nelle barre di sezione **Esporta Excel** ed **Esporta PDF** vanno a destra, staccati dal titolo e dai comandi che agiscono sui dati: sono l’uscita, non un’azione di lavoro, e da appaiati al titolo sembravano il gesto principale della pagina. Vale per Acquisti, Progetto, Magazzino, Cicli, Costificazione e la testata di un piano di fabbisogno — tutte le barre `.bom-toolbar`. La barra del documento nelle richieste e negli ordini resta com’era: lì i due pulsanti seguono la loro etichetta.

### 0.48.2 — 2026-09-05

**Cambiato**
- Le icone arrivano **in tutta l’app**: Documenti, Fabbisogno, Magazzino, Commesse, Revisioni, Riepilogo, scheda articolo, Gestione, import ed export, e i titoli di sezione di `index.html`. Il set è salito a 50 disegni (aggiunti fabbisogno, ordine, bilancia, azienda, cartella, pagamento, pausa). Anche il logo del login viene ora dallo sprite: nel repo non resta più un solo tracciato scritto a mano fuori da `icons.js`.

**Aggiunto**
- **Ogni icona dice il proprio nome al passaggio del mouse.** Un disegno è muto: chi non lo riconosce non ha modo di scoprire cosa fa se non provandolo, ed è esattamente quello che le emoji non hanno mai offerto. I nomi dicono l’azione e non il disegno — «Elimina», non «cestino» — e dentro un pulsante prendono il testo del pulsante, che è sempre più preciso: «Distinta parte e ciclo di lavorazione» invece di «Lavorazione». Accanto a una parola che già la spiega il suggerimento tace: ripetere lo stesso nome due volte è rumore, non aiuto.
- I pulsanti a sola icona che non avevano un `title` ora ce l’hanno: senza, `a11yFields` non aveva da dove prendere l’etichetta accessibile.

**Note**
- Restano emoji una trentina di simboli che **non possono** diventare icone: i messaggi del toast e i titoli delle conferme (passano da `esc()`), i `title` assegnati via JavaScript, il marchio di obsoleto dentro i `<option>`, le etichette che finiscono in PDF ed Excel, e le caselle ☑/☐ dei due interruttori del fabbisogno — da spente un’icona sparirebbe e la riga ballerebbe a ogni click.

### 0.48.1 — 2026-09-05

**Cambiato**
- Le icone nuove arrivano dove si usano di più: **albero della distinta** (espansione del nodo, dove è usato, ciclo, modifica, elimina, il ⚠ del riferimento ciclico e dell’articolo mancante), **righe delle anagrafiche** (listino, ciclo, dove è usato, modifica, duplica, elimina, i marchi obsoleto e parte acquistata) e **vista Cicli di lavorazione**. Nelle righe la tinta è nuda, senza pastiglia: un pulsante ha già il suo bordo, e la pastiglia dentro sarebbe una scatola in una scatola.
- I titoli delle schede (aggiungi componente, lavorazione, nuova macchina, listino fornitori, dove è usato, nuovo articolo…) portano l’icona in pastiglia: lì lo spazio c’è e serve a riconoscere la scheda prima di leggerne il titolo.
- Le frasi che rimandano a una voce di menu («si gestiscono nella vista Cicli di lavorazione») mostrano ora la stessa icona che si vede nella barra, invece di un’emoji che non le somigliava più.

Restano emoji: le viste Documenti, Fabbisogno, Magazzino, Gestione, Riepilogo e la scheda articolo — il giro successivo. Una resta emoji per forza: il marchio di articolo obsoleto dentro i menu a tendina, perché in un `<option>` non entra né HTML né un’icona.

### 0.48.0 — 2026-09-05

**Aggiunto**
- Un set di icone nostro (`icons.js`): 43 disegni su griglia 24×24, uno sprite SVG unico e `ico(nome)` come solo punto in cui un nome diventa un disegno. Le emoji le disegnava il font di sistema — forma diversa su ogni computer, colore proprio impossibile da cambiare, allineamento a caso; questi sono tracciati, prendono il colore del testo che li circonda e la misura in `em`.
- Ogni icona ha una **tinta di categoria** presa dalle variabili già esistenti: rosso ciò che cancella, verde ciò che produce o conferma, arancio merce e avvisi, viola lavorazioni e tempo, azzurro navigazione. Il colore è mostrato in **pastiglia**, cioè sul fondo dello stesso colore al 15%: un tratto da 1.8 su sedici pixel è poco da distinguere di sfuggita, il fondo dà alla tinta la superficie per farsi leggere.
- `icons-preview.html`, la galleria per giudicare il set: ogni icona accanto all’emoji che sostituisce, le misure da 13 a 32px, le tre varianti di colore e la barra di navigazione in posa. Non fa parte dell’app.

**Cambiato**
- Barra di navigazione, i tre pulsanti dell’header (cerca, stampa, password) e la lente delle dodici caselle di ricerca passano alle icone nuove. Logo e pulsante Esci, che erano già SVG scritti a mano dentro `index.html`, ora vengono dallo sprite come tutti gli altri.
- La lente non sta più dentro il `placeholder`: un placeholder è testo, e quell’emoji finiva nella traduzione e in ciò che leggono gli screen reader. Ora è un disegno di sfondo, che è quello che è sempre stata.
- Lo stato batte la categoria: dentro un pulsante che ha già un colore suo — la voce di menu attiva, un `.mini-btn.danger` — l’icona eredita quello. Lì il colore dice *cosa sta succedendo*, e vince su *di che si tratta*.

Le icone dentro le viste (albero distinta, schede, titoli) sono ancora emoji: `ico()` e le emoji convivono, la sostituzione prosegue a scaglioni.

### 0.47.12 — 2026-09-05

**Cambiato**
- Nei riquadri di costo l'unità di misura appesa al numero (`/pz`) va ora in piccolo, in uno `span` a parte: liberata quella larghezza, la cifra torna grande — anzi un filo più grande di prima (fino a 26px, `clamp(16px, 13cqi, 26px)`).

### 0.47.11 — 2026-09-05

**Corretto**
- I riquadri di costo (Distinta base e Costificazione) sforavano il loro contenitore: il valore era fisso a 24px e con l'unità appesa (`€8951.50/pz`) su sette riquadri in fila non ci stava. Ora il riquadro è un contenitore di query e il valore scala con la sua larghezza (`clamp(14px, 11cqi, 24px)`), restando su una riga sola; padding orizzontale ridotto a 12px e etichetta troncata con i puntini invece di allargare la card.

### 0.47.10 — 2026-08-24

**Corretto**
- Codice e descrizione fornitore erano andati a capo (0.47.9) invece di stare sulla stessa riga come prima. Ora colonna e menu fornitore sono un po' più larghi (330px) e codice/descrizione un po' più stretti (130/170px): ci stanno affiancati su una riga sola, senza sforare né lasciare vuoti.

### 0.47.9 — 2026-08-24

**Corretto**
- Il vuoto fra il menu fornitore e la colonna Prezzo: la colonna Fornitore aveva solo un `min-width`, e con `table-layout` automatico si prendeva parte dello spazio in eccesso della tabella, allargandosi ben oltre il menu al suo interno. Ora ha un `width` fisso (240px) che il browser rispetta; codice e descrizione, insieme più larghi della colonna, vanno a capo su una riga propria invece di sforare.

### 0.47.8 — 2026-08-24

**Corretto**
- Il tentativo precedente (0.47.7) aveva reso la classe `.pl-sub` — condivisa tra la riga codice/descrizione fornitore e la riga unità/costo convertito della cella Prezzo — bersaglio delle stesse regole di larghezza, nascondendo UM e costo calcolato. Codice e descrizione fornitore hanno ora una classe propria (`pl-code`, `pl-desc`), separata da quella riga: si allargano senza più toccare nulla nella cella Prezzo.

### 0.47.7 — 2026-08-24

**Corretto**
- Il menu fornitore, più stretto della riga codice+descrizione sotto di lui, lasciava vuoto a destra fino al bordo della colonna (che si allarga sul contenuto più largo). Ora codice e descrizione vanno a capo invece di stare in fila, così non sforano oltre la larghezza del menu, e il vuoto a destra sparisce.

### 0.47.6 — 2026-08-24

**Corretto**
- Il `min-width` della colonna (0.47.5) non bastava: la tabella si dimensiona sul contenuto più largo, e i campi codice/descrizione sotto sono comunque più larghi di 240px — trascinavano con sé anche il menu fornitore, che eredita `width:100%` dalla cella. Ora il menu ha un tetto proprio (220px), indipendente da quanto si allarga la colonna sotto di lui.

### 0.47.5 — 2026-08-24

**Corretto**
- Allargare i campi «codice»/«descrizione» fornitore (0.47.4) aveva allargato di riflesso anche il menu del fornitore sopra di loro, condividendo lo stesso `min-width` di colonna. Il menu fornitore torna alla larghezza di prima; i due campi sotto restano larghi.

### 0.47.4 — 2026-08-24

**Corretto**
- La correzione precedente (0.47.3) non si vedeva: avevo alzato solo il `max-width` dei campi «codice fornitore»/«descrizione fornitore», ma senza una `width` esplicita restavano fermi alla larghezza predefinita del browser — più stretta sia del limite vecchio che di quello nuovo, quindi il tetto più alto non veniva mai raggiunto. Ora hanno una `width` propria (190px e 260px) e si vedono davvero più larghi.

### 0.47.2 — 2026-08-24

**Corretto**
- Nel listino fornitori, la seconda riga di ogni quotazione (codice fornitore, descrizione, unità di quotazione) era in un carattere più piccolo (11px) di quella sopra (12px). Uniformato: stessa dimensione su entrambe le righe.

### 0.47.1 — 2026-08-24

**Corretto**
- Nel listino fornitori, il selettore dell'unità di quotazione (accanto al prezzo, quando l'articolo ha una doppia unità) era **invisibile**: si vedeva solo la freccina, senza il testo «m»/«kg». Il `<select>` ereditava `width:100%` dentro la riga flessibile che lo contiene insieme al totale convertito, e si schiacciava fino a non lasciare spazio al testo. Ora ha una larghezza propria, come gli altri campi della stessa riga.

### 0.47.0 — 2026-08-24

**Corretto**
- Le righe di **Richiesta d'offerta** e **Ordine**, quando nascono da catalogo (a mano o generate da un piano di fabbisogno), ora sono sempre nell'**unità dell'articolo** — quella con cui si ordina e si riceve davvero (mt, m², pz…) — e mai in quella con cui un fornitore valorizza il listino (es. a chilo). Il prezzo di riga è già il costo **convertito** in quell'unità, non il prezzo grezzo del listino: una barra gestita in metri ma quotata a chilo genera una riga in metri, al prezzo al metro. Prima la riga nasceva nell'unità del fornitore col prezzo grezzo, in contraddizione con quanto l'app stessa dichiarava ("U.M. seguono l'anagrafica articolo"). I documenti già emessi non cambiano.

### 0.46.0 — 2026-08-24

**Aggiunto**
- Il **lotto di riordino** ora sa se è un **multiplo esatto** (una barra da 6 m si compra a 6, 12, 18… — comportamento di sempre, resta il predefinito) oppure una **quantità minima** (es. minimo 50 pezzi, poi liberamente 51, 52…). Si sceglie nella scheda articolo, accanto al lotto. Gli articoli già configurati non cambiano comportamento: senza scelta esplicita restano a multiplo esatto.
- Le righe di **Richiesta d'offerta** e **Ordine** — anche scritte a mano — segnalano ora quando la quantità non rispetta il lotto dell'articolo (badge «↑ lotto» o «↑ minimo», nella tabella e nella modale di modifica riga). È solo un avviso: non blocca né arrotonda da sola la quantità inserita.

### 0.45.3 — 2026-08-23

**Rimosso**
- Il campo **«Consegna richiesta»** nei dati generali dell'ordine a fornitore. Era una data scritta a mano, senza nessun legame con la logica dell'app: gli avvisi di ritardo, il confronto con la conferma del fornitore e il segnale nel Riepilogo si basano tutti sulla data di consegna **di riga**, articolo per articolo — non su questa. Tenerla accanto generava equivoci: sembrava la data che comandava, e non lo era mai stata. Restano invariate la data di riga e tutto ciò che ne dipende.

### 0.45.2 — 2026-08-23

**Corretto**
- L'icona del calendario nei campi data era **nera su sfondo nero**: invisibile, perché il tema dell'app è sempre scuro e l'icona nativa del browser non lo sapeva. Ora è invertita in chiaro nei campi a schermo (torna nera in stampa, dove lo sfondo è bianco).

### 0.45.1 — 2026-08-23

**Cambiato**
- Il pulsante che apre il congelamento della distinta (o del ciclo, per le parti) ora si chiama **📌 Nuova revisione** invece di «Rilascia revisione». Il comportamento non cambia — resta il congelamento della revisione in lavorazione, col costo del giorno, e l'apertura della successiva — ma il nome vecchio suggeriva un'azione verso l'esterno (una pubblicazione, un invio), mentre qui si sta solo aprendo un nuovo capitolo di lavoro sullo stesso articolo.

### 0.45.0 — 2026-08-06

**Gli elenchi si portano via.** Si esportava un *documento* per volta — una distinta, un piano, una richiesta, un ordine — e nessuna *lista*. Chi filtrava il magazzino su «sotto la scorta minima» vedeva la risposta a schermo e non aveva modo di portarsela in officina o di allegarla a una mail. L'unico export di articoli che esisteva è il template d'import, che è un'altra cosa: tutte le colonne, tutti gli articoli, tre fogli di contorno.

**Aggiunto**
- 📗 **Esporta Excel** e 📄 **Esporta PDF** su otto elenchi: **Magazzino**, **Anagrafica Acquisti**, **Anagrafica Progetto**, **Cicli di lavorazione**, **Commesse**, **Richieste di offerta**, **Ordini** e **piani di Fabbisogno**.
- Si esporta **quello che si vede**: filtri attivi applicati, stesse colonne e stesso ordine della tabella. I filtri finiscono scritti nel file — nell'Excel su un foglio **Estrazione** (azienda, data, utente, filtri, righe), nel PDF sotto il titolo. Senza, dopo una settimana nessuno sa più cosa contenga quel foglio.
- Il PDF ha **testata azienda e numero di pagina, su ogni pagina**. Nessun PDF dell'app numerava le pagine: un elenco di trecento righe stampato e poi fatto cadere non si rimette in ordine. Orizzontale sopra le sette colonne.
- Nell'Excel **autofiltro** sull'intestazione e larghezze di colonna, come già faceva l'export del catalogo.

**Cambiato**
- Le viste che filtravano dentro il disegno ora dichiarano la selezione a parte (`stockFilteredRows`, `catalogFilteredRows`, `jobFilteredList`, `planFilteredList`): schermo ed export leggono la **stessa** funzione. Con il filtro scritto due volte, prima o poi il file esportato conterrebbe righe diverse da quelle guardate.
- La paginazione a schermo («Mostra altri 200») **non** limita l'export: difende il ridisegno, non il contenuto. Esportare 200 righe di 900 senza dirlo è il modo più silenzioso di far prendere una decisione su dati monchi.

**Non cambiato, di proposito**
- **Gli otto export che c'erano restano identici.** Distinta, fabbisogno, RFQ e ordini sono documenti già impaginati apposta, alcuni verso i fornitori: funzionano, e riscriverli per uniformarli avrebbe cambiato l'aspetto di quello che esce di qui.
- **Nessun `roleGuard`**: esportare è una lettura, ed è la regola già seguita da tutti gli export tranne quello delle impostazioni, guardato perché elenca nomi ed email degli utenti. Nessuno di questi elenchi contiene dati di utenti.

**Verifica**
- 41 nuovi controlli (suite da 948 a 989). Il grosso sta sulla **specifica** che ogni vista produce, che è la parte pura: ogni riga ha tante celle quante intestazioni, i filtri restringono davvero anche l'export, i numeri restano numeri e la valuta non entra mai in una cella.
- PDF ed Excel avevano **zero copertura** in tutta la storia dell'app. Ora un doppio finto delle due librerie registra come vengono chiamate: ha già colto un difetto che a occhio non si vedeva — con due sezioni sulla stessa pagina la testata veniva scritta due volte sopra sé stessa — e tiene fermi il numero di pagina e l'autofiltro, che si ferma prima della riga dei totali.

### 0.44.0 — 2026-08-06

**Il magazzino ha una pagina.** I numeri c'erano già tutti — esistente, in arrivo, impegnato, libero — ma si vedevano **un articolo per volta**: nella sua scheda, o dentro una riga di fabbisogno. Per rispondere a «cosa è sotto scorta?» bisognava aprire gli articoli a uno a uno, cioè non lo si chiedeva mai. Il riepilogo lo segnalava e mandava all'anagrafica, dove quel dato non compare.

**Aggiunto**
- **📦 Magazzino**, nuovo gruppo in barra e pulsante nel Riepilogo. Una lista sola per **commerciali, materie prime e parti**: il magazzino non conosce la divisione fra acquisti e progetto — sullo stesso scaffale ci sono viti comprate e parti lavorate, e chi fa l'inventario le conta nello stesso giro. Gli assiemi restano fuori: un gruppo si produce, non si stocca, e la sua giacenza sarebbe quella dei componenti contata due volte.
- Per riga: **esistente, in arrivo, impegnato, libero, scorta minima, lotto**, con il ⚠ su chi è sotto scorta e il libero in rosso quando i piani aperti hanno promesso più merce di quanta ne esista. Dalla riga si registra una **rettifica** (⚖) o si apre lo **storico dei movimenti** (🕘), col codice cliccabile e la modifica dell'articolo dove stanno in tutte le altre tabelle.
- **Filtri dell'anagrafica** (testo, tipo, famiglia, sottofamiglia) più uno di **stato**: sotto la scorta minima, giacenza a zero, con giacenza, libero negativo. In testa quattro conteggi che parlano di **tutto** il magazzino e non del filtro attivo — sono lì per dire se c'è qualcosa da guardare, e un numero che cambia col filtro non risponderebbe più a quella domanda.

**Cambiato**
- Il segnale «articoli sotto la scorta minima» del Riepilogo porta al Magazzino invece che all'anagrafica Acquisti: adesso c'è la vista dove quel numero si vede e si corregge.
- Filtri famiglia/sottofamiglia, raggruppamento per famiglia e costo unitario erano scritti dentro `renderCatalog`: sono diventati `syncFamilyFilters`, `catalogGroups` e `itemUnitCost`, usati da anagrafica e magazzino. Nessun cambio di comportamento — due copie della stessa logica si sarebbero disallineate alla prima modifica.

**Non cambiato, di proposito**
- **Nessun campo nuovo sull'articolo.** L'esistente resta *ricevuto sugli ordini + movimenti*, e l'impegnato resta calcolato dai piani aperti: la vista li mette in tabella, non li duplica. Una colonna scrivibile qui darebbe due numeri per la stessa giacenza, e un test verifica che il conteggio dei sotto scorta sia lo stesso del Riepilogo.

**Verifica**
- 15 nuovi controlli (suite da 933 a 948): chi entra nell'elenco e chi no, che il filtro «sotto scorta» selezioni **le stesse righe** che portano il ⚠ (un filtro che ne seleziona altre fa credere di aver guardato), i quattro stati, i conteggi in testa indipendenti dal filtro, e che una rettifica fatta da qui aggiorni la riga senza far cambiare pagina.

### 0.43.2 — 2026-08-03

**Corretto**
- **La protezione aggiunta nella 0.43.1 non funzionava.** In `.gitattributes` vince **l'ultima** regola che corrisponde al file, e la riga generica (`* text=auto`) era scritta sotto quella specifica su `vendor/`: la sovrascriveva senza che niente lo segnalasse, e i file di terze parti sarebbero stati normalizzati lo stesso. Trovato con `git check-attr`, che è il modo di verificarlo invece di crederci. Ordine invertito, con il perché scritto accanto alla riga.

### 0.43.1 — 2026-08-03

**Corretto**
- **Le librerie in `vendor/` restano identiche a quelle pubblicate.** Su Windows un clone le avrebbe riscritte con le fini riga native: avrebbero funzionato lo stesso, ma le impronte scritte in `vendor/LEGGIMI.md` non sarebbero più corrisposte, e una libreria di terze parti che non si può riverificare è il contrario del motivo per cui la si tiene nel repo. Un `.gitattributes` esclude quella cartella dalla normalizzazione. *(La regola era scritta nell'ordine sbagliato e non aveva effetto: vedi 0.43.2.)*

### 0.43.0 — 2026-08-03

**Le librerie di export stanno nella cartella dell'app, e SheetJS è aggiornata.** Erano su un CDN: la versione in uso aveva due vulnerabilità corrette a monte, e i pulsanti di export non funzionavano su un PC senza rete — cioè proprio dove l'app dichiara di funzionare.

**Cambiato**
- **SheetJS dalla 0.18.5 alla 0.20.3.** Le due falle (prototype pollution, corretta nella 0.19.3; ReDoS, nella 0.20.2) stavano su quello che è **input non fidato**: un file Excel arriva da un fornitore, da un cliente, da una mail. L'aggiornamento era rimandato perché SheetJS dopo la 0.18 non pubblica più su cdnjs — non era un cambio di numero e basta.
- **Anche jsPDF entra nel repo**, alla stessa versione di prima: verificata **bit per bit** confrontandone l'impronta con la firma `integrity` che stava nella pagina. Non è «dovrebbe essere la stessa»: è la stessa.
- **Niente più rete.** Copiando la cartella su un altro PC funziona tutto subito, export compresi. Prima serviva un primo caricamento con la connessione, e su una postazione d'officina scollegata i pulsanti erano muti. Non c'è più un terzo dominio da cui l'app dipenda.
- `vendor/LEGGIMI.md` dice versioni, provenienza, impronte e come si aggiornano.

**Verifica**
- 5 nuovi controlli (suite da 928 a 933) su un **file .xlsx vero**: è il buco che tutti gli altri test sull'import lasciavano aperto per scelta — lavorano su righe già lette, perché il binario non è nostro. Ora il giro completo gira nella suite: si esporta come fa l'app, si scrive il file, lo si rilegge con le stesse due chiamate di `readWorkbook()` e lo si reimporta. Accenti, virgolette e trattini lunghi tornano identici, i numeri restano numeri (se tornassero testo, un foglio con la virgola decimale entrerebbe a zero), le celle vuote restano vuote e reimportare lo stesso file non duplica niente.
- Resta da provare a mano un file prodotto **da Excel stesso**: quello nessun test può fabbricarlo.

### 0.42.0 — 2026-08-03

**L'app si usa anche senza mouse, e i campi hanno un nome.** Erano centocinquanta etichette che il browser non sapeva collegare al proprio campo, duecento pulsanti-icona senza nome e una decina di righe cliccabili invisibili alla tastiera. Niente di tutto questo si vedeva usando l'app col mouse — ed è esattamente il motivo per cui era rimasto lì.

**Cambiato**
- **Le etichette sono collegate ai campi.** Cliccare «Fornitore» mette a fuoco il menu, e un lettore di schermo annuncia il campo col suo nome invece di dire «casella di testo». Il collegamento si fa **sulla struttura**, in un punto solo (`a11yFields`): centocinquanta modifiche a mano sarebbero state centocinquanta occasioni di sbagliare un id, e i form che verranno sarebbero ripartiti da zero.
- **I pulsanti a sola icona** (✏ 🗑 🔗 🔧 ★) prendono il nome dal `title` che avevano già: quello che si legge passando il mouse è lo stesso che sente chi il mouse non lo usa.
- **Le schede sono dialoghi dichiarati**: `role="dialog"`, il titolo come nome, il **focus che entra** sul primo campo da compilare — o, nelle conferme, sul pulsante che *non* fa danni — e che **torna da dov'era** alla chiusura. Chi apre una scheda dal ✏ di una riga si ritrova su quel ✏, non a inizio pagina.
- **Le righe cliccabili sono raggiungibili col tabulatore** e rispondono a Invio e alla barra spaziatrice: i segnali del riepilogo, le commesse in elenco, i documenti generati dal fabbisogno, i risultati dei selettori articolo e le lavorazioni in distinta. È lo stesso patto che i codici articolo rispettavano già. Il triangolino che apre un ramo di distinta dice anche se il ramo è aperto o chiuso.

**Verifica**
- 9 nuovi controlli (suite da 919 a 928): il patto degli elementi cliccabili (pulsante, tabulatore, Invio e spazio con la stessa azione, etichetta escapata), le righe reali di riepilogo, commesse e albero distinta, e la garanzia che il collegamento delle etichette non possa mai far fallire un disegno.

### 0.41.0 — 2026-08-03

**Richieste d'offerta e ordini erano due copie quasi identiche: ora ogni regola è scritta una volta sola.** Sono lo stesso oggetto — una testata con un fornitore, delle righe, uno stato e un blocco che dipende dallo stato — e per molte versioni sono stati due elenchi paralleli di funzioni gemelle. Correggere qualcosa significava ricordarsi di correggerlo due volte, e le differenze vere fra i due documenti erano sparse nel codice invece di essere dichiarate.

**Cambiato**
- **Un registro dei due tipi di documento** (`DOC_KINDS`) che dice in un elenco leggibile in cosa differiscono: sulla richiesta il prezzo è la risposta attesa e resta compilabile dopo l'invio, sull'ordine è concordato e dopo l'invio arrivano invece le merci; lo stato della richiesta deriva dai prezzi, quello dell'ordine dai ricevimenti.
- **Una funzione sola per ogni regola**: guardie e blocchi, sblocco, modifica di campi e righe, riga manuale, aggiunta da catalogo, salvataggio, eliminazione, uscita dall'editor. I nomi di sempre (`rfqSetLine`, `ordSetLine`…) restano come adattatori di una riga — sono citati in centinaia di `onclick` nei template e rinominarli avrebbe aggiunto solo rischio.
- **`docPartyLines()`**: l'intestazione «chi ordina / chi riceve» che i quattro export ripetevano identica, con la partita IVA bilingue sui documenti stampati e le righe vuote che cadono da sole.

**Come funziona, e perché così**
- **Il file non si è accorciato** (1063 → 1072 righe di codice) e non era quello lo scopo: il registro documentato costa quanto le copie tolte. Il guadagno è che una modifica si fa in un punto invece che in due, e che le differenze fra i due documenti si leggono in un elenco invece di doverle cercare confrontando venti funzioni a mano.
- **La presentazione resta duplicata di proposito**: i due editor e i quattro export PDF/Excel non hanno un test, ed è esattamente il motivo per cui questo lavoro era rimandato. Si toccheranno dopo aver scritto i test, non prima.

**Verifica**
- 7 nuovi controlli (suite da 912 a 919), sopra i 29 della versione precedente che facevano da rete: il registro conosce entrambi i tipi (e un tipo inventato non fa esplodere niente), lo stesso campo è governato da blocchi diversi nei due documenti, la guardia respinge allo stesso modo su entrambi, l'intestazione salta le righe vuote ed è bilingue sui documenti stampati.
- Tutti i 29 controlli su stati, ricevimenti e blocchi passano **senza essere stati toccati**: è la prova che il comportamento non è cambiato.

### 0.40.0 — 2026-08-03

**La rete sotto i documenti.** `views-docs.js` è il file più lungo dell'app e il più duplicato, e proprio le sue tre cose più delicate — stati, ricevimenti e blocchi — non avevano un solo test. Finché è così, qualunque riordino di quel file è un salto senza rete: adesso la rete c'è, e la prossima versione può riscriverlo.

**Verifica**
- Nuovo `test/docs-state.test.js`: **29 controlli** (suite da 883 a 912). Coprono cosa deve continuare a succedere, non com'è scritto oggi.
  - **Stato derivato dell'ordine**: ricevuto in parte → Parziale, ricevuto tutto → Evaso, ricevimenti azzerati → si torna a Inviato o a Confermato secondo che la conferma del fornitore sia arrivata; non si riceve più di quanto ordinato (si tronca); «ricevi tutto» chiude in un gesto; Bozza e Annullato restano scelte di chi scrive e non si derivano mai.
  - **Stato derivato della richiesta**: tutte le righe con prezzo → Offerta ricevuta, un prezzo tolto → torna Inviata; una bozza non diventa «ricevuta» solo perché ha i prezzi, e una richiesta senza righe non è un'offerta tornata.
  - **Blocchi**: a richiesta inviata la quantità è chiusa e il prezzo aperto; a ordine inviato il prezzo è chiuso e i ricevimenti aperti; note e stato restano sempre modificabili; un documento annullato o chiuso è sola lettura; lo sblocco vale per un documento solo e si perde tornando all'elenco; il ruolo viene prima del blocco di stato.
  - **Numerazione**: progressiva per anno e per tipo, riprende dal massimo (i buchi delle eliminazioni non si riusano) e gli anni precedenti non la spostano.
  - **Richiesta → ordine**: eredita fornitore, condizioni, righe e prezzi offerti, azzera i ricevimenti, tiene la tracciabilità, nasce in bozza; la richiesta uscita si chiude da sé, una bozza no.
- Due comportamenti che i test hanno reso espliciti (erano già così, non erano scritti da nessuna parte): su un ordine già uscito **quantità e righe sono protette** — modificarle richiede lo sblocco esplicito — e la **data confermata dal fornitore** si registra a ordine inviato, perché arriva dopo l'invio per definizione.

### 0.39.0 — 2026-08-03

**Ridisegnare senza far perdere il posto, con una regola sola.** Ogni gesto nell'app riscrive per intero l'HTML della vista, e un ridisegno integrale butta via tre cose che l'utente sta usando: la posizione dello scroll, il campo a fuoco e il punto in cui stava scrivendo. Quattro viste si erano scritte da sole la stessa toppa, ognuna diversa; ora la regola sta in un punto e le quattro la usano.

**Cambiato**
- **Nuovo `renderInto(contenitore, htmlFn)`** in `core.js`: ridisegna preservando scroll, campo a fuoco (ritrovato per id), valore digitato e punto di inserimento. Se a fuoco c'è un **menu a tendina**, non ridisegna affatto e lo dice al chiamante — un elenco che si rimescola mentre lo si sta aprendo non si può "ripristinare", si può solo non rompere.
- **I quattro punti che lo facevano a mano ora passano da lì**: la lista dei documenti sotto i filtri, il corpo della finestra «Dove è usato» durante la simulazione di costo, il menu prodotti della costificazione e il filtro macchine della distinta. Comportamento uguale o migliore, un terzo del codice.

**Come funziona, e perché così**
- Il campo a fuoco si ritrova **per id**: un input senza id non è ripristinabile e il ridisegno glielo toglie, come prima. È il patto da conoscere per usare l'helper in una vista nuova.
- Il DOM finto della suite ha ora un focus coerente (`document.activeElement`, `contains`, selezione): serviva a poter verificare queste cose senza jsdom e senza dipendenze, com'è per tutto il resto.

**Verifica**
- 7 nuovi controlli (suite da 876 a 883): il ridisegno normale, il menu a fuoco che resta intatto, il campo di testo che conserva valore-focus-cursore, lo scroll che non torna in cima, il focus fuori dal contenitore che non viene toccato, più i due casi reali — la costificazione che non rimescola il menu mentre lo si usa e il filtro documenti che ridisegna la lista senza toccare la barra.

### 0.38.0 — 2026-08-03

**Prestazioni sui percorsi caldi: stessi numeri, molto meno lavoro.** Quattro punti riesplodevano distinte o rifacevano cloni dentro cicli; ora il lavoro pesante si fa una volta e si riusa. Nessun valore mostrato cambia — è la proprietà verificata dai test.

**Cambiato**
- **La home ricava le righe di fabbisogno da `commitIndex()`**, che ha già esploso tutti i piani aperti per calcolare gli impegni: prima li riesplodeva una seconda volta con `mrpBuyRows`, raddoppiando il costo della schermata mostrata a ogni accesso.
- **La simulazione di costo entra ed esce una sola volta**: con N assiemi di testa impattati faceva 2N azzeramenti delle cache globali e 2N rollup da zero — a ogni carattere digitato. Ora un solo `withTempCost` attorno a tutte le cime.
- **Lo storico revisioni fotografa la distinta attuale una volta**, non tre deep-clone e un rollup di costo per ogni revisione in elenco.
- **La scheda articolo usa un indice articolo → piani** (`planUseIndex`, stesso ciclo di vita degli altri indici) invece di riesplodere ogni piano a ogni apertura — ed è il gesto più frequente dell'app. L'indice copre anche i piani chiusi: la domanda della scheda è storica, e i piani chiusi ne fanno parte.

**Verifica**
- 2 nuovi controlli (suite da 874 a 876): la simulazione in blocco dà gli stessi costi di una chiamata per cima (e fuori dalla simulazione il costo vero torna), e la scheda articolo continua a elencare i piani chiusi in cui l'articolo compare esploso. Il benchmark (`node test/bench.js`) resta invariato: guadagno 82× sulla risalita.

### 0.37.0 — 2026-08-03

**Correttezza e guardie: quattro difetti trovati da un controllo generale del codice.** Nessuna funzionalità nuova; cambia che alcuni numeri ora sono giusti per costruzione e alcune porte che sembravano chiuse ora lo sono davvero.

**Corretto**
- **La Gestione è protetta nei mutatori, non solo nel menu.** Venti funzioni (termini di trasporto e pagamento, dati azienda, fornitori, famiglie e sottofamiglie, centri di lavoro, unità di misura) modificavano i dati senza chiedere `roleGuard('manage')`: un pannello rimasto aperto mentre il ruolo cambiava scriveva lo stesso. Ora rifiutano e lo dicono, come già facevano le funzioni sugli utenti. Anche `releaseRevision` è guardata dentro (`bom`): era globale e contava sui chiamanti.
- **La home conta il fabbisogno sempre al netto** di giacenza e impegni. Prima leggeva il toggle lordo/netto lasciato acceso nella vista Fabbisogno: due utenti sulla stessa base dati leggevano numeri diversi, e nessuno dei due se ne accorgeva. Il netto è il numero azionabile — cosa manca davvero da ordinare.
- **«Da dove viene questo costo» risolve gli articoli per id, non per codice.** Con due articoli dallo stesso codice (esistono, e la Gestione li elenca apposta) la finestra fondeva voci distinte o scartava una foglia scambiandola per l'assieme omonimo. Ora ogni articolo conta per sé; le righe di lavorazione (🔧) non compaiono più tra i contributi — stanno nelle barre di incidenza, come la finestra ha sempre dichiarato — e una parte prodotta in casa conta con le righe del suo ciclo, non due volte.
- **La scheda articolo escapa i valori per costruzione.** `itemInfoRows` era l'unico helper del repo con il contratto rovesciato («il chiamante escapa»): una voce nuova aggiunta senza pensarci diventava un'iniezione HTML silenziosa. Ora il testo si escapa dentro l'helper e i valori che sono davvero HTML lo dichiarano (`rawHtml`). Stesso principio sul banner di sblocco documenti: il gestore del click si compone da un tipo noto, non arriva più come JavaScript grezzo dal chiamante.

**Verifica**
- 11 nuovi controlli (suite da 863 a 874): i ruoli non-admin respinti dai mutatori di Gestione e l'admin che passa, il rilascio revisione negato al lettore e concesso alla progettazione, la home identica con il toggle in entrambe le posizioni (e muta quando il magazzino copre il piano), la foglia col codice di un assieme che non sparisce dal conto e i due omonimi che restano due voci.

### 0.36.1 — 2026-08-03

**Il changelog vive in un file suo.** Il README era diventato per l'80% storico delle versioni (oltre 100 KB): la parte descrittiva — avvio, funzionalità, modello di costo — era sommersa. Ora `README.md` descrive l'app e rimanda qui; questo file, `CHANGELOG.md`, tiene lo storico completo. Nessuna voce è andata persa e la convenzione non cambia: versione in cima allineata ad `APP_VERSION`, `0.MINOR.PATCH`, voci datate.

### 0.36.0 — 2026-08-03

**Nei documenti verso i fornitori si applica sempre il listino applicabile: la quotazione più recente del fornitore a cui il documento è intestato.** Prima si applicava la quotazione **in uso** — quella scelta per la costificazione — a prescindere da chi fosse l'intestatario. Un ordine a Bianchi partiva col prezzo di Rossi, nell'unità di Rossi: un numero sbagliato dall'aria giusta, che si scopre alla fattura.

**Cambiato**
- **Prezzo, unità di misura, codice e descrizione vengono tutti dalla stessa riga di listino**: la quotazione più recente di quel fornitore. Se quota a chilo, l'ordine parte in chili al suo €/kg. A parità di data vince l'ultima registrata.
- **Se quel fornitore non ha l'articolo a listino non si applica niente.** La riga nasce senza prezzo, nell'unità di gestione, e lo dice: badge **⚠ non a listino** in riga, e il toast dell'aggiunta da catalogo conta quante righe sono partite vuote e perché. Una casella vuota si vede; il prezzo di un altro no.
- **Vale per tutte e quattro le strade**: «+ Da catalogo» su ordine e su richiesta, e i documenti generati dal fabbisogno. La richiesta d'offerta continua a non portare prezzo — è la domanda, non la risposta — ma ora lo chiede nell'unità in cui quel fornitore quota.
- **Anche i giorni di consegna** seguono la stessa riga: sono termini del fornitore come il prezzo. Se a febbraio ha detto 90 giorni, pianificare sui 21 di gennaio è pianificare su termini scaduti, e la commessa slitta senza che nessuno l'abbia vista arrivare.
- **Il fornitore cambiato a documento avviato si segnala in riga.** I prezzi non si riscrivono da soli — nessun prezzo cambia da sé, in quest'app, ed è la regola su cui poggia tutto il resto — ma una riga rimasta col listino di un altro porta un **⚠** che dice quanto quota il fornitore attuale.
- **Nel fabbisogno**, quando il listino applicabile dice un prezzo diverso da quello di costificazione, il pannello di generazione lo mostra (**⇄ a listino …**) e l'anteprima dell'importo è quella che il documento porterà davvero. La costificazione non si tocca: risponde a un'altra domanda — quanto vale l'articolo nei nostri conti, non quanto ce lo fa oggi quel fornitore.

**Come funziona, e perché così**
- Una porta sola, `supplierPriceRow(it, fornitore)`, e da lì passano documenti, unità, minimi di riga, tempi di consegna e riferimenti. Il fornitore da cui si compra lo decide ancora la quotazione **in uso** — è la scelta che qualcuno ha fatto — ma il *listino* che gli si applica è il suo più recente.
- **La quotazione in uso non ha privilegio nei documenti.** Riguarda la costificazione, che è un'altra domanda; confonderle è ciò che mandava fuori il prezzo di un fornitore diverso.
- La forma «fornitore e prezzo sui campi dell'articolo, listino vuoto» è quella dei database precedenti al listino: `migrateDB()` la converte in una quotazione all'avvio, quindi un database vecchio genera ordini col prezzo giusto. C'è un test che parte proprio da lì.

**Verifica**
- 9 nuovi controlli (suite da 854 a 863) e due riscritti sulla regola nuova: il prezzo e l'unità di ciascun fornitore sul proprio documento, la quotazione più recente che vince anche su una sua più vecchia in uso, il fornitore senza listino che non eredita niente, i tempi di consegna che seguono il fornitore giusto e non l'ultima quotazione di chiunque, i tre stati del segnale quando l'intestatario cambia, e un ordine generato da un database vecchio migrato all'avvio.

### 0.35.2 — 2026-08-03

**Codice e descrizione «presso il fornitore» escono sul documento del fornitore giusto, e sono quelli aggiornati.** Non sono dati dell'articolo: sono il modo in cui *quel* fornitore lo chiama. Rossi lo chiama `ROSSI-1`, Bianchi lo chiama `BIA-9`, e la stessa riga d'ordine deve stampare l'uno o l'altro a seconda di a chi è intestata. Sbagliarli non è un dettaglio estetico: è un codice d'ordine che il fornitore prende per buono, e su cui spedisce il pezzo di qualcun altro.

**Corretto**
- **Un ordine al secondo fornitore lasciava la casella vuota** pur avendo il dato a listino. La ricerca guardava solo la quotazione **in uso**: rispondeva a «come lo chiama il fornitore da cui compro di solito?» invece che a «come lo chiama questo qui?». Ora la coincidenza si verifica dentro il listino, sulla quotazione di quel fornitore.
- **Correggere un refuso nel codice fornitore non arrivava ai documenti.** L'articolo ne tiene una copia — è il "prezzo in uso" — e si riallineava solo quando cambiava il prezzo o l'unità. Un codice corretto nel listino restava vecchio sull'ordine, e in giro c'erano due codici di cui uno sbagliato che nessuna schermata mostrava come tale.
- **Nella scheda articolo la tabella del listino mostrava il solo codice**, non la descrizione: ora entrambi, riga per riga, con l'intestazione che dice di chi sono.

**Come funziona, e perché così**
- `supplierPriceRow(it, fornitore)` è l'unica porta: cerca fra le quotazioni quella di **quel** fornitore. Se ne ha più d'una vince quella in uso; fra le altre, la più recente — è l'ultima volta che ci si è parlati.
- La regola resta quella di prima, applicata sul serio: **se il fornitore non coincide non esce niente**. Nessuna quotazione sua, nessun riferimento — meglio una casella vuota di un codice di qualcun altro. Vale anche per un documento senza fornitore e per le righe manuali.
- Codice e descrizione si leggono ora **dalla quotazione** anche nella scheda articolo e nel riepilogo prezzo: gli stessi valori di prima, ma da un posto solo. I campi `supplierCode`/`supplierDesc` restano sull'articolo (sono nello schema cloud) e continuano a seguire la quotazione in uso, ora anche quando la si corregge.

**Verifica**
- 15 nuovi controlli (suite da 839 a 854): il riferimento di ciascun fornitore sul proprio documento, il silenzio su quello di un altro, le quotazioni multiple dello stesso fornitore, la correzione che arriva fino all'ordine, e i tre casi in cui non deve uscire niente (nessun fornitore, riga manuale, articolo cancellato).

### 0.35.1 — 2026-08-03

**Ogni numero a schermo dice di cosa parla.** Le unità c'erano dove capitava: la scheda articolo scriveva la giacenza in chilogrammi ma la scorta minima nuda, il fabbisogno metteva la colonna U.M. e poi segnalava «impegnato 40» senza dire quaranta di cosa, la modale «Aggiungi componente» chiedeva una «Quantità» che poteva essere di pezzi o di metri a seconda dell'articolo che si stava per scegliere. Un numero senza unità non è ambiguo per chi lo scrive — è ambiguo per chi lo legge tre settimane dopo, o per il fornitore che riceve il PDF, e l'errore che ne segue è di un fattore, plausibile, e non se ne accorge nessuno.

**Cambiato**
- **Quantità, costi ed etichette portano l'unità.** Giacenze, impegni, movimenti, scorta minima, lotto di riordino, quantità minima del listino, righe di distinta, ciclo, confronto revisioni: dove non c'è una colonna `U.M.` accanto, l'unità sta nel numero. I costi unitari portano il denominatore (`€10.00/kg`), quelli che sono totali no.
- **Le etichette dei campi seguono l'unità che si sta scegliendo.** Nella scheda articolo «Scorta minima» diventa «Scorta minima (kg)» appena si sceglie l'U.M., e cambia se la si cambia; il «Fattore di conversione» diventa «Fattore di conversione (kg in 1 m)». Nella modale di componente l'etichetta della quantità si completa quando si sceglie l'articolo. Nelle righe di richiesta e ordine, «Quantità (m)» e «Prezzo unitario (€/m)».
- **Le intestazioni dicono la valuta.** `Prezzo unit. (€/U.M.)`, `Importo (€)`, `Costo un. (€/U.M.)` nelle tabelle di anagrafica, listino, fabbisogno, richieste e ordini.
- **Sui documenti che escono di qui** — PDF e Excel di richieste e ordini — il prezzo unitario esce con il suo denominatore, e nei fogli la valuta si dichiara in intestazione (i numeri restano numeri, sommabili).
- **Corretto: il confronto offerte scriveva «pz» su ogni riga**, letteralmente, anche per una barra quotata al chilo. Ora usa l'unità della riga d'offerta — confrontare `€/kg` con `€/m` senza dirlo è peggio che non confrontare.
- **Corretto: nella scheda articolo il prezzo d'acquisto usciva come `€12.00 €/pz`**, con il simbolo due volte.

**Come funziona, e perché così**
- Le tre forme stanno in `core.js`, una volta sola: `fmtUom(15,'m')` → `15 m`, `fmtPer(3.2,'kg')` → `€3.20/kg`, `labelUom('Scorta minima','kg')` → `Scorta minima (kg)`. Con loro è rientrata a casa anche `fmtQty`, che viveva in due copie identiche per caso in `views-mrp.js` e `views-docs.js`.
- **Un articolo senza U.M. resta un numero nudo**: niente `15 ` con lo spazio in fondo, niente `Scorta minima ()`. L'unità assente non si finge.
- **Le intestazioni dei fogli d'import non cambiano.** Sono la chiave con cui l'import riconosce le colonne (`normHeader` toglie tutto ciò che non è lettera o cifra): scriverci dentro `(€/h)` renderebbe illeggibile ogni file già in giro. L'unità si dichiara nel foglio **Istruzioni**, che è dove si guarda prima di compilare.
- Dove una colonna `U.M.` è già in tabella — righe d'ordine, fabbisogno, albero di distinta — l'unità non si ripete su ogni cella: si dice in intestazione. Ripeterla renderebbe illeggibile proprio la colonna dei numeri.

**Verifica**
- 10 nuovi controlli (suite da 829 a 839): le tre forme e il caso dell'unità vuota, la scheda articolo che porta l'unità su giacenze e costi, e il confronto offerte che non scrive più «pz».

### 0.35.0 — 2026-08-02

**Gli articoli si esportano e si importano in due file, uno per mestiere: Acquisti e Progetto.** Il foglio era uno solo per tutti e sei i tipi, con una colonna `Tipo` da indovinare e una trentina di colonne di cui la maggior parte non riguardava la tua riga. Chi compilava doveva sapere quali celle valessero per cosa; chi caricava scopriva gli errori a database già scritto. E dell'export non esisteva niente: il catalogo non si portava via, quindi non c'era nemmeno un file da cui partire.

**Cambiato**
- **Due file, la stessa divisione dell'Anagrafica.** `Acquisti` (fogli `Commerciali`, `Materie prime`) e `Progetto` (fogli `Macchine`, `Gruppi`, `Sottogruppi`, `Parti`). Sono due mestieri diversi — l'ufficio acquisti compila fornitori e prezzi, la progettazione compila sigle e appartenenze — e due file si mandano a due persone senza spiegare quali fogli non toccare.
- **Il tipo è il foglio.** Niente colonna `Tipo`, e ogni foglio ha **solo le colonne del suo tipo**: una macchina non ha più accanto le celle del listino, un commerciale non ha più quelle della codifica gerarchica.
- **Dal foglio si costruisce una macchina.** Sigla, schema di codifica, macchina e gruppo di appartenenza sono finalmente colonne: prima nessuna delle due cose era importabile, e una parte caricata da Excel restava fuori da ogni macchina e da ogni numerazione. I fogli si applicano **in ordine** — Macchine → Gruppi → Sottogruppi → Parti — così un gruppo può puntare a una macchina definita nello stesso file, e il codice si genera dallo schema di quella macchina appena creata.
- **🔍 Verifica senza importare.** Fa l'import per intero, mostra il report — creati, aggiornati, avvisi, errori con foglio e riga, e l'elenco dei codici che nascerebbero — e poi **annulla tutto**. Dal report si procede con «Importa davvero», senza rifar scegliere il file.
- **L'export è il template.** Si esporta il catalogo vero, si modifica in Excel, si ricarica. Ogni file porta un foglio **Liste** con tutti i valori ammessi (unità, fornitori, coppie famiglia/sottofamiglia, macchine e gruppi coi loro codici, concetti, approvvigionamento) e un foglio **Istruzioni**.
- **Anche da Excel un prezzo nasce nel listino.** Fornitore e prezzo creano o aggiornano una **quotazione** e la rendono quella in uso, invece di scrivere il prezzo sull'articolo come faceva l'import fino a ieri. Un articolo con più quotazioni le porta nel foglio `Listino`, e la riga articolo le lascia vuote: il giro export → import → export non perde e non duplica niente.
- **Nel file delle impostazioni le famiglie si dividono in tre fogli** — `Famiglie commerciali`, `Famiglie materie prime`, `Famiglie parti` — per la stessa ragione: l'ambito è il foglio, non una colonna da sbagliare.

**Come funziona, e perché così**
- **Menu a tendina veri non ce ne sono**, e non è una dimenticanza: la libreria Excel dell'app (edizione community) non sa scrivere le convalide dati. Il foglio `Liste` tiene gli elenchi contigui, pronti per `Dati → Convalida → Elenco → =Liste!$B$2:$B$40`, ed è il posto a cui rimandano i messaggi d'errore: «concetto "PIASTRA " non in elenco — vedi foglio Liste, colonna Concetti». Un errore che dice dove sta la risposta vale più di una tendina.
- **L'import non cancella mai niente**: né articoli né quotazioni. Una riga tolta dal foglio e un foglio compilato a metà sono indistinguibili, e la differenza la pagherebbero articoli e listini ancora referenziati. Si elimina dall'app, che sa dire se una voce è ancora in uso.
- **Colonna assente ≠ colonna vuota**: la prima lascia il campo com'era, la seconda lo svuota. Così un foglio ridotto alle due colonne che interessano non azzera indirizzi, scorte e note di tutto il catalogo. E una scorta svuotata torna «non impostata», non zero.
- **I concetti non si creano dall'import.** Fornitori, famiglie e unità di misura sì (le U.M. nuove finiscono elencate nel report: è quasi sempre un refuso), ma il concetto finisce *dentro* il nome della parte e da lì in poi è congelato — un refuso resterebbe per sempre.
- Le **regole della scheda articolo valgono anche da un foglio**: sigla macchina unica, sigla gruppo conforme allo schema della sua macchina e unica su quella macchina, codice univoco. Un gruppo senza sigla e senza codice **non nasce** con un codice inventato: si segnala.
- La **🔍 Verifica** annulla ripristinando il database e azzerando gli indici, con l'adapter di persistenza staccato: nemmeno un salvataggio dimenticato può toccare il disco. E non dichiara sincronizzato niente, che sarebbe un errore invisibile e permanente.
- I file nel **formato precedente** (foglio unico con colonna `Tipo`) si leggono ancora, e passano dallo stesso lettore: ereditano gratis la regola nuova sui prezzi. Le righe dell'altro mestiere si saltano con **un avviso**, non con cinquecento righe rosse.

**Verifica**
- 68 nuovi controlli (suite da 761 a 829), fra cui: che l'export contenga solo le colonne del tipo di ogni foglio, che il file esportato reimportato su un database vuoto ricostruisca lo stesso catalogo — listino, doppia unità e costo convertito compresi — che **reimportarlo due volte non duplichi niente**, che un gruppo trovi la macchina definita nello stesso file, che la 🔍 Verifica lasci il database **identico byte per byte** e non scriva su localStorage, e che dopo l'annullamento nessun indice punti più agli oggetti del giro annullato.

### 0.34.0 — 2026-08-02

**Le impostazioni di Gestione si portano via in un foglio Excel, una scheda per foglio.** Fornitori, famiglie, centri di lavoro, unità di misura, concetti, condizioni d'offerta, dati azienda, parametri e utenti si rifacevano a mano a ogni installazione nuova. Il backup JSON li portava tutti, ma è tutto o niente: sovrascrive anche articoli, distinte, richieste e ordini — inutilizzabile per allestire una seconda postazione senza cancellarne i dati.

**Cambiato**
- **⬇ Esporta impostazioni** in *Gestione → ⬆ Import* produce un file con **nove fogli**: `Azienda`, `Utenti`, `Fornitori`, `Condizioni offerta`, `Famiglie`, `Concetti`, `Centri di lavoro`, `Unità di misura`, `Impostazioni`, più `Istruzioni`. Contiene ciò che c'è davvero, non un esempio.
- **⬆ Carica impostazioni** rilegge lo stesso file: l'export **è** il template. Si esporta, si modifica in Excel — anche solo per aggiungere trenta fornitori in blocco — e si ricarica.
- **Report di esito** come per articoli e distinte: creati, aggiornati, invariati **per foglio**, fogli assenti dichiarati, e l'elenco delle righe rifiutate con il motivo.

**Come funziona, e perché così**
- **L'import è additivo: non cancella mai niente.** Una voce assente dal foglio non viene eliminata, perché «riga tolta apposta» e «foglio compilato a metà» sono indistinguibili — e la differenza la pagherebbero fornitori e famiglie ancora referenziati dagli articoli. Chi vuole eliminare lo fa dalla scheda di Gestione, dove l'app sa dire se la voce è ancora in uso.
- **Un foglio assente viene saltato**, non trattato come vuoto: si può caricare anche una sola scheda. Allo stesso modo, una **colonna assente** lascia il campo com'è, mentre una colonna **presente ma vuota** lo svuota — così un foglio ridotto alle due colonne che interessano non azzera indirizzi e condizioni di tutti i fornitori.
- **Le password non entrano e non escono.** Nel foglio non c'è nulla da cui ricavarle: un utente creato dall'import nasce **senza**, e non accede finché un amministratore non gliene imposta una (*Utenti → 🔑*). Le due invarianti della scheda Utenti valgono riga per riga anche qui: **deve restare almeno un amministratore attivo**, e **ruolo e stato del proprio account non si cambiano da un foglio** — un file Excel non è un buon posto da cui chiudersi fuori dall'app.
- Le **chiavi di riconoscimento** sono quelle naturali, non gli id interni: email per gli utenti, nome per fornitori e centri di lavoro, ambito + nome per le famiglie, codice per le unità di misura, il nome stesso per i concetti. Un file scritto a mano funziona quanto uno esportato.
- Il **codice di un'unità di misura non si rinomina da qui**: un codice diverso crea un'unità nuova. La rinomina resta in Gestione, che propaga il nuovo codice ad articoli e documenti — cosa che un foglio non può fare.
- I nomi dei fogli e delle colonne si riconoscono **ignorando accenti, maiuscole e punteggiatura**, con i sinonimi più probabili; i fogli sconosciuti (`Istruzioni` compreso) si ignorano in silenzio.

**Verifica**
- 37 nuovi controlli (suite da 747 a 784), fra cui: che l'export contenga tutte le schede e **nessuna traccia di hash o salt**, che il file esportato reimportato su un database vuoto ricostruisca lo stesso stato, che **reimportarlo due volte non duplichi niente**, che una colonna assente non cancelli un campo, che l'ultimo amministratore attivo non si declassi da un foglio e che i messaggi d'errore siano escapati (nel foglio ci può stare qualunque cosa).

### 0.33.0 — 2026-08-02

**Ogni codice è cliccabile, e apre la scheda completa dell'articolo.** Le informazioni c'erano tutte, ma sparse in sei posti e raggiungibili solo passando dalla vista giusta: il costo in costificazione, il prezzo nel listino, la giacenza nell'anagrafica, gli impieghi in *Dove è usato*, la composizione nell'albero, i documenti negli elenchi. Chi leggeva un codice in una lista d'acquisto o in un ordine e si chiedeva «ma questo cos'è?» doveva ricordarsi dove andare, uscire da dove stava lavorando e poi tornarci.

**Cambiato**
- **Un click su un codice — in qualunque tabella — apre la scheda 🔎.** Vale nella distinta base, nella costificazione, nel fabbisogno (righe di piano, da acquistare, da fabbricare), nelle anagrafiche, nelle righe di richieste e ordini, nel confronto offerte, in *Dove è usato*, in *Da dove viene il costo* e nella scheda di generazione documenti. Il codice si riconosce dalla sottolineatura punteggiata, e si raggiunge anche da tastiera.
- **La scheda dice tutto in una finestra**: anagrafica e codifica · acquisto, fornitore e **listino completo** (con la quotazione in uso evidenziata e la più bassa segnalata) · ripartizione del **costo** e prezzo di vendita · **magazzino** con esistente, in arrivo, impegnato e libero · **composizione** (componenti di un assieme, oppure distinta parte e ciclo) · **dove è usato**, fino alle macchine impattate · **documenti e piani** in cui l'articolo compare · **revisioni** rilasciate col costo congelato · e chi l'ha creato e aggiornato.
- **Non modifica niente**, e non è una limitazione da togliere più avanti: è la ragione per cui la si può aprire senza pensarci, in mezzo a qualunque lavoro, anche mentre un form è aperto dietro. Una scheda che non scrive non ha uno stato da salvare, non chiede conferme all'uscita e non può rovinare niente per un click di troppo. Le modifiche restano dove stanno — anagrafica, listino, distinta — dove chi le fa ci è arrivato apposta.
- **Si naviga come in un browser**: cliccare un codice *dentro* la scheda la sostituisce invece di impilare finestre, e **← Indietro** riporta da dove si veniva. Chiudendo, la strada percorsa si dimentica.

**Come funziona, e perché così**
- I codici nascono tutti da una funzione sola (`codeLink`): cambiare cosa fa un click su un codice è una modifica sola, e nessuna tabella ripete lo stile o il gesto.
- Il click **non fa scattare anche il gesto della riga** che lo contiene — nella distinta la riga si espande, nella scheda documenti la riga si spunta — perché altrimenti un click ne farebbe due, di cui uno indesiderato.
- Un codice **senza articolo a catalogo resta testo**: le righe manuali dei documenti hanno un codice che non punta a niente, e un link che non porta da nessuna parte è peggio di nessun link. Vale anche per gli articoli cancellati.
- La ricerca globale (Ctrl+K) resta com'era: lì il codice **naviga** alla vista, ed è un gesto diverso da «fammi vedere cos'è».

**Verifica**
- 26 nuovi controlli (suite da 721 a 747), fra cui: che la scheda non contenga nessun campo di inserimento su nessun tipo di articolo, che le uniche azioni siano chiudere/indietro/aprire un altro codice, che aprirla e navigarci dentro **non tocchi il database**, che navigare non impili finestre, che un codice senza articolo resti testo e che quel testo sia escapato (i codici arrivano anche dai fogli importati).

### 0.32.0 — 2026-08-02

**La giacenza che vedi non è tutta tua.** Il fabbisogno netto sottraeva esistente e in arrivo, ma non sapeva nulla degli altri piani: con 100 pezzi a magazzino e due piani aperti che ne chiedevano 80 ciascuno, **entrambi si dichiaravano coperti** — con la stessa merce. Nessuno dei due sbagliava un conto; semplicemente nessuno dei due sapeva dell'altro, e l'errore si scopriva quando il secondo andava in produzione e il materiale non c'era.

**Cambiato**
- **Colonna «Impegnato»** nella lista d'acquisto in modalità netta, fra *Esistente* e *In arrivo*, con sotto il **libero** (`esistente + in arrivo − impegnato`). Il conto diventa **lordo + scorta minima + impegnato − esistente − in arrivo**, sempre arrotondato al lotto di riordino.
- **Badge 🔒 su ogni riga contesa**, anche col netto spento: il tooltip elenca **quali piani** se la sono presa e per quanto. Un numero che toglie merce senza dire chi se l'è presa non si può contestare, e quindi neanche credere. Col netto spento l'impegno non si applica — ma si vede, perché è un fatto vero sull'articolo a prescindere da come si sta guardando la lista.
- **Il piano non fa concorrenza a sé stesso**: si conta solo ciò che hanno promesso gli *altri* piani. Sottrargli il proprio fabbisogno gli farebbe comprare tutto due volte.
- **I piani si aprono e si chiudono** (🔓/🔒, dall'elenco o dalla testata). È l'unico stato che un piano ha, ed esiste per una ragione sola: **un piano aperto impegna materiale, uno chiuso no.** Senza l'interruttore ogni piano mai creato continuerebbe a promettere merce per sempre, e dopo qualche mese nessun articolo risulterebbe più disponibile. Chiudere non cancella e non blocca niente — il piano resta leggibile ed esportabile — e i piani chiusi spariscono anche dai segnali della home, dove erano allarmi che nessuno poteva più spegnere.
- **Nella scheda articolo** compaiono i riquadri *Impegnato* e *Libero*, con l'elenco dei piani che lo impegnano; il libero **può andare sotto zero** e in quel caso è scritto in rosso: i piani aperti hanno promesso più merce di quanta ne esista, e nasconderlo non la fa comparire.
- **L'export Excel porta la colonna Impegnato** in modalità netta: il conto è cambiato, e un foglio che non lo mostra non permette più di rifarlo.

**Come funziona, e perché così**
- L'impegno è **calcolato**, come l'esistente e per la stessa ragione: si esplodono le distinte dei piani aperti e si somma. Nessun campo `impegnato` da tenere allineato a mano, nessuna prenotazione da ricordarsi di sciogliere — un piano che si chiude libera la sua merce da sé, e uno che si elimina pure.
- Nel conto l'impegnato sta **dalla parte del fabbisogno**, accanto alla scorta minima, non dalla parte del magazzino. Il numero sarebbe lo stesso; la domanda no — «quanto me ne serve» invece di «quanto ne ho».
- I piani già salvati si aprono **aperti**: sono i piani in corso di chi aggiorna, e dichiararli chiusi lascerebbe promettere due volte la stessa merce proprio nel momento del passaggio di versione.

**Verifica**
- 20 nuovi controlli (suite da 701 a 721): che due piani non si dichiarino coperti entrambi, che il secondo compri davvero quando la merce non basta per due, che un piano non impegni sé stesso, che chiudere e riaprire liberi e riprenda la quota, che l'indice si aggiorni quando cambia *l'altro* piano (altrimenti sarebbe un campo scrivibile travestito da calcolo), che il libero possa andare negativo, che il documento generato porti la quantità giusta, e che un piano salvato prima di questa versione risulti aperto.

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
