# Changelog

Le revisioni seguono il versionamento semantico `0.MINOR.PATCH`: **MINOR** per nuove funzionalità, **PATCH** per correzioni. La versione in cima è quella in `APP_VERSION` (`core.js`) e mostrata nell'header dell'app.

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
