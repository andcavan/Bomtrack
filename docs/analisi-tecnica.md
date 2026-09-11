# Analisi tecnica — luglio 2026

Controllo generale del codice fatto insieme al lavoro della 0.21.0. Diviso in
**risolto in questa versione** e **aperto**, con il motivo per cui una cosa è
stata rimandata. Ogni voce porta file e riga: se il codice si sposta, il
riferimento va aggiornato o la voce va chiusa.

> **Nota di lettura (0.76.0).** Questo documento è nato col lavoro della 0.21.0
> e le sue sezioni «Risolto» arrivano fino alla 0.43.0. Fra la 0.44.0 e la
> 0.75.0 l'app è cresciuta parecchio (conto lavoro, ODL, carico centri, barra
> filtri, manuale) senza che il documento la seguisse: le voci di quel tratto
> **non sono qui**, stanno in `CHANGELOG.md`. La sezione «Aperto» è invece
> aggiornata alla 0.76.0, ed è la parte che conta — è la mappa di ciò che resta
> da fare.

> **Nota di lettura (0.35.0).** Le voci che nominano `importItems` descrivono
> lavoro fatto quando l'import articoli era un foglio unico in
> `import-export.js`. Quella funzione non esiste più: dalla 0.35.0 l'import e
> l'export degli articoli stanno in `import-catalog.js`, divisi nei due file
> Acquisti e Progetto. Le conclusioni restano valide e valgono per
> `importCatalogSheets` — indice dei codici compreso, che è ancora
> `codeIndex()`/`codeIndexAdd()`.

---

## Risolto nella 0.21.0

### 1. `usedBy()` scansionava tutto il catalogo, due volte per riga
`views-bom.js` — la funzione filtrava `db.items` a ogni chiamata, ed era invocata
ricorsivamente da `ancestorTotals()` **e una seconda volta dentro il `.filter()`
di `impactedTops()`**. Su un catalogo grande la finestra "Dove è usato" e ogni
ricalcolo della simulazione costavano O(articoli × antenati).

Sostituita da `parentIndex()` in `core.js`: un indice figlio → padri costruito
una volta per giro di disegno e azzerato da `invalidateCaches()`, come già
`itemIndex()`. Misurato con `node test/bench.js`: risalita su 700 articoli da
**8200 ms a 120 ms, 68 volte più veloce**.

Effetto collaterale voluto: l'indice considera figlio ogni riga di ciclo con
`kind !== 'op'`, mentre prima serviva `kind === 'item'` esatto. È la regola che
usa il motore di costo (`costing.js:62`), quindi ora le due strade concordano;
`usageQty()` è stata allineata.

### 2. `db.suppliers.find` e `db.workCenters.find` dentro i cicli di disegno
Dodici punti per i fornitori, sei per i centri di lavoro, alcuni nel rollup
(`costing.js:87`) e nel disegno di ogni riga di elenco. Aggiunti `supplierIndex()`
/ `getSupplier()` e `workCenterIndex()` / `getWorkCenter()` in `core.js`, con lo
stesso ciclo di vita degli altri indici. Restano volutamente lineari due casi:
la migrazione in `store.js` (gira prima che gli indici abbiano senso) e la
ricerca per nome in `import-export.js:83`.

### 3. Un fornitore si poteva cancellare lasciando riferimenti orfani
`delSupplier()` (`views-manage.js`) controllava solo `db.items.supplierId`. Un
fornitore citato unicamente in `priceList[].supplierId`, in una lavorazione
esterna di ciclo o in un documento spariva, e lo storico prezzi puntava nel
vuoto. Ora `supplierUses()` guarda tutti e cinque i posti e dice quali.

### 4. Gli export PDF/Excel morivano in silenzio senza rete
`const { jsPDF } = window.jspdf;` senza guardia in quattro punti. L'app è fatta
per aprirsi con un doppio click su `file://` e girare offline: senza CDN quella
riga lanciava un `TypeError` che nessuno intercettava, e all'utente sembrava che
il pulsante non funzionasse. Aggiunti `requirePdf()` e `requireXlsx()` in
`core.js`, con un messaggio che dice cosa è successo. Aggiunto anche
`reader.onerror` in `readSheet()`, che prima taceva.

### 5. `mrpDescend`: antenati in un array
`ancestors.includes()` era una ricerca lineare a ogni livello di discesa. Ora è
un `Set`. Piccolo, ma la funzione ha appena guadagnato un ramo in più (le parti
acquistate) ed è il punto più caldo del fabbisogno.

### 6. Documentazione disallineata
`docs/cloud-schema.md` non mappava `items[].priceList`, `rfqs` né `orders`;
`README.md` citava `app.js`, che non esiste più dallo split nei `views-*.js`.

---

## Risolto nella 0.22.0

Prima tappa del percorso verso il database condiviso: si chiudono le voci che
servono ad **accorgersi** dei guasti e a **non toccare il codice al buio**. Le
voci che riguardano l'integrità dei dati (unicità dei codici, numerazione dei
documenti, cicli lato server) restano aperte e vanno chiuse *prima* che i dati
diventino condivisi, non dopo.

### 7. C2 — nessuna gestione degli errori fuori da `store.js`
Era la voce indicata come «il primo intervento da fare fra quelli aperti: costa
poco e rende visibile tutto il resto», ed è stata fatta per prima proprio per
quello. `window.onerror` e `unhandledrejection` in `core.js`, che riusano lo
stampo già collaudato di `showPersistErrorModal()`: toast breve, finestra
esplicativa **una volta sola** (un render che fallisce in ciclo renderebbe l'app
inutilizzabile), e un registro circolare degli ultimi `ERROR_LOG_MAX` errori con
data, vista aperta e revisione, scaricabile da *Gestione → Backup*.

Nessun tentativo di recupero, deliberatamente: un errore dentro un `render*`
lascia comunque uno stato incerto, e fingere che sia tutto a posto è peggio che
dirlo. L'avviso dice due cose e basta — quello a schermo può essere incompleto,
i dati salvati non sono stati toccati — e offre il ricaricamento.

### 8. C3 — i due file senza un solo test
`import-export.js` e `auth.js` erano scoperti al 100%. Aggiunti
`test/import.test.js` e `test/auth.test.js`: **80 nuovi controlli**, la suite
passa da 340 a 424. Coperte tutte le funzioni elencate come scoperte tranne
`renameUom` e `addUser` (`views-manage.js`, ancora aperto) e `rfqAutoStatus`/
`ordAutoStatus` (vedi C3 residuo).

Il valore non è il numero: `importItems`/`importBom` sono il punto in cui un
foglio sbagliato riscrive mezzo catalogo, e ora è fissato per iscritto che
l'upsert è idempotente, che una riga sbagliata non ferma quelle buone, e che un
padre citato solo in righe *errate* **non perde la distinta che aveva** —
l'azzeramento avviene alla prima riga valida, non alla prima riga.

I test hanno subito trovato un difetto reale: il template Articoli scaricabile
propone la dicitura *Componente commerciale*, che `resolveType()` non accettava.
Chi compilava il template partendo dall'esempio si vedeva rifiutare le proprie
righe. Aggiunti quel sinonimo e il plurale *Materie prime*.

Aggiunta anche una GitHub Action che esegue `node test/run.js` a ogni push: la
suite esisteva già, ma girava solo quando qualcuno si ricordava di lanciarla.

### 9. A1 (metà) — nessun SRI sui CDN
`index.html` carica le tre librerie con `integrity` e `crossorigin`: un CDN
compromesso non può più iniettare codice. Cambiando versione va rigenerato anche
l'hash — se non corrisponde la libreria non si carica, e `requirePdf()`/
`requireXlsx()` lo dicono all'utente invece di tacere.

**Resta aperta l'altra metà**: l'aggiornamento di `xlsx@0.18.5`, che è la parte
con le CVE. Vedi A1 sotto.

### 10. A3 — la sessione non scadeva mai
Il `ts` scritto da `doLogin()` ora viene letto da `sessionExpired()`.
Configurabile in *Gestione → Impostazioni* (`settings.sessionDays`, 30 giorni di
serie, **0 = non scade**, com'era prima). Una data illeggibile conta come
scaduta: meglio richiedere la password che tenere aperta una sessione di cui non
si sa più l'età.

### 11. A5 — `unescape()` deprecato
Sostituito da `TextEncoder` in `sha256Hex()`. Gli hash restano **bit per bit
identici** — `unescape(encodeURIComponent(s))` produceva già i byte UTF-8 — e i
test che confrontano l'implementazione a mano con `node:crypto` lo verificano ad
ogni giro: nessuno deve rifare la password. In più `TextEncoder` non lancia sui
surrogati spaiati, dove `encodeURIComponent` lanciava.

Effetto collaterale: `TextEncoder` è un globale della piattaforma assente nei
contesti `node:vm`, quindi è stato aggiunto al sandbox di `test/harness.js`.
La suite ha intercettato la modifica al primo giro — che è esattamente il
motivo per cui quei test esistono.

---

## Risolto nella 0.23.0

Seconda tappa: **integrità dei dati**. Sono le voci che oggi passano inosservate
e che in cloud diventano vincoli del database — vincoli che fanno fallire
salvataggi funzionanti, su dati che nel frattempo si sono sporcati. L'ordine
seguito è quello obbligato: prima il validatore locale, poi lo strumento per
ripulire ciò che c'è già, e solo dopo (in fase cloud) il vincolo SQL.

### 12. A6 — nessun controllo di unicità su `items.code`
`validateItemCode()` (`views-catalog.js`) in `saveNewItem` e `saveItemEdit`, più
il report dei duplicati esistenti in *Gestione › Backup* (`renderDuplicateCodes`,
`import-export.js`).

La regola che rende la validazione vivibile su dati già sporchi: si impedisce di
**introdurre** un duplicato, non si blocca chi sta correggendo altro su un
articolo che era già duplicato prima. Un validatore che blocca ogni salvataggio
su dati storici viene aggirato, non rispettato.

Il report **non rinomina niente in automatico**, deliberatamente: il codice
articolo sta su disegni e ordini già emessi, e sceglierlo al posto dell'utente
sarebbe peggio del problema. Elenca i gruppi e apre le schede.

Coperto anche il caso indiretto: `genItemCode()` guarda solo i codici che
seguono il proprio schema, quindi poteva generarne uno già occupato da un codice
inserito a mano fuori pattern. Ora l'import rileva la collisione, ripiega
sull'id e lo segnala.

### 13. B1 — `importItems`/`importBom` quadratici
Aggiunti `codeIndex()` / `getItemByCode()` / `codeIndexAdd()` in `core.js`, con
lo stesso ciclo di vita degli altri indici (azzerati da `invalidateCaches()`).

Il dettaglio che conta e che l'analisi non aveva previsto: la ricostruzione
automatica dell'indice scatta al cambio di lunghezza di `db.items`, e l'import
**aggiunge una riga per volta**. Con la sola auto-ricostruzione ogni riga avrebbe
rifatto l'indice da capo e il costo sarebbe rimasto quadratico. Da qui
`codeIndexAdd()`: registrazione incrementale dell'articolo appena creato.
Chi dimentica di chiamarla non rompe niente — la ricostruzione successiva rimette
tutto a posto, semplicemente costa.

`test/import.test.js` ha una rete sui tempi (400 righe su 400 articoli) che
fallisce se l'indice smette di funzionare.

### 14. A4 — `Store.importSnapshot()` validava solo `Array.isArray(data.items)`
`validateSnapshot()` in `store.js` verifica la forma di tutte le collezioni
radice, il tipo di `settings` e la versione dello schema. Un file prodotto da una
revisione **più recente** viene fermato invece di essere degradato in silenzio:
le migrazioni sanno salire, non scendere.

`importBackup()` mostra ora il **contenuto del file prima di sovrascrivere**
(`snapshotCounts()`), accanto a quello che c'è adesso, e distingue due errori che
prima erano lo stesso toast «File non valido»: JSON illeggibile e JSON valido ma
non nostro.

### 15. A8 — cicli non verificati sulle righe di ciclo delle parti
`createsCycle()` (`views-bom.js`) percorre ora entrambe le strade con cui un
articolo ne contiene un altro: i `components` degli assiemi e le righe di
distinta nel `cycle` di una parte (`kind !== 'op'`). È la stessa regola di
`parentIndex()` e del motore di costo: le tre discese ricorsive ora concordano
davvero, invece di concordare per caso.

Aggiunte a `pickCycleItem()` (`views-catalog.js`) le due guardie che aveva la
distinta base e che lì mancavano del tutto: tipo ammesso e ciclicità. Nessuna
delle due può scattare oggi — `CYCLE_CHILD_TYPES` ammette le sole foglie — e
sono lì proprio per questo: la regola deve stare accanto alla scrittura che la
rispetta, non nel filtro di un elenco.

**Resta aperto il lato server** (trigger ricorsivo su `item_components`): in
cloud due client possono creare congiuntamente un anello che nessuno dei due
vede, e nessun controllo JS può accorgersene. Vedi A8 sotto.

---

## Risolto fra la 0.37.0 e la 0.43.0

Controllo generale ripetuto sull'intero codice (agosto 2026). Le voci qui sotto
non erano tutte in questo documento: metà sono difetti trovati in quel giro.

### 16. Venti mutatori della Gestione senza `roleGuard` *(0.37.0)*
`views-manage.js`: termini di trasporto e pagamento, dati azienda, fornitori,
famiglie e sottofamiglie, centri di lavoro e unità di misura scrivevano senza
chiedere il permesso, mentre le funzioni sugli utenti nello stesso file lo
chiedevano. La protezione era la sola navigazione: un pannello lasciato aperto
mentre il ruolo cambiava scriveva lo stesso. Aggiunta anche a `releaseRevision`
(`views-rev.js`), che è globale e contava sui chiamanti.

La regola dichiarata in `core.js` — «le guardie stanno nei mutatori, non nella
UI» — vale solo se non ha eccezioni: un'eccezione la trasforma in una
convenzione, e le convenzioni si dimenticano.

### 17. La home leggeva il toggle lordo/netto di un'altra vista *(0.37.0)*
`renderHome` passava `mrpNet` a `mrpBuyRows`. Il conteggio delle righe da
ordinare cambiava a seconda di come qualcuno aveva lasciato la vista
Fabbisogno, e due persone sulla stessa base dati leggevano numeri diversi senza
avere modo di accorgersene. Ora è sempre il **netto**, che è il numero
azionabile. `views-mrp.js` documentava già che `netMode` è un parametro e non
una lettura del toggle: la home era l'unico punto che lo violava.

### 18. `costContributors` risolveva gli articoli per codice *(0.37.0)*
`views-report.js` usava `getItemByCode(r.code)` avendo `r.itemId` sulla riga.
I codici duplicati esistono per scelta (§12), e `codeIndex()` risolve sempre sul
primo: una foglia omonima di un assieme veniva scartata come «assieme» e la sua
spesa spariva dal conto, oppure due articoli distinti si fondevano in una voce
sola. Ora si risolve e si aggrega per id. Corretti nello stesso giro due casi
che nessuno aveva notato: le righe di lavorazione comparivano tra i contributi
(la finestra dichiara che stanno nelle barre di incidenza) e una parte prodotta
in casa contava sia per sé sia per le righe del proprio ciclo.

### 19. `itemInfoRows` aveva il contratto di escaping rovesciato *(0.37.0)*
Era l'unico helper del repo in cui l'escaping toccava al chiamante: funzionava
per disciplina, e una voce aggiunta senza pensarci sarebbe diventata
un'iniezione HTML silenziosa. Ora escapa dentro e i valori che sono davvero
HTML lo dichiarano (`rawHtml`). Stessa correzione sul banner di sblocco
documenti, che riceveva il gestore del click come **stringa di JavaScript**.

### 20. Quattro lavori quadratici sui percorsi più caldi *(0.38.0)*
Nessuno cambiava un numero; tutti costavano.
- `renderHome` riesplodeva tutte le distinte di tutti i piani aperti, che
  `commitIndex()` aveva già esploso per calcolare gli impegni. È la schermata di
  ogni accesso.
- La simulazione di costo chiamava `withTempCost` **dentro** la `.map` sulle
  cime impattate: 2N azzeramenti delle cache globali e 2N rollup da zero, a ogni
  carattere digitato. Ora una volta sola attorno all'intera mappa.
- Lo storico revisioni ricalcolava `revSnapshot()` — tre copie profonde e un
  rollup — per ogni revisione in elenco, ottenendo N volte la stessa fotografia.
- La scheda articolo riesplodeva ogni piano a ogni apertura, ed è il gesto più
  frequente dell'app: ora c'è `planUseIndex()`, con lo stesso ciclo di vita
  degli altri indici. Copre anche i piani chiusi, perché la domanda della scheda
  è storica e `commitIndex()` risponde a un'altra domanda.

### 21. Quattro toppe diverse allo stesso problema *(0.39.0)*
Ogni gesto riscrive l'HTML della vista intera, e questo butta via scroll, campo
a fuoco e punto di digitazione. Quattro viste se n'erano accorte separatamente e
si erano scritte quattro rimedi diversi. Ora c'è `renderInto(contenitore, fn)`
in `core.js`, e il caso del menu a tendina a fuoco ha una risposta esplicita:
**non si ridisegna affatto**, perché un elenco che si rimescola mentre lo si sta
aprendo non è ripristinabile.

### 23. A1 — SheetJS aggiornato, e le librerie portate dentro il repo *(0.43.0)*
*(L'altra metà — l'SRI sui CDN — era chiusa nella 0.22.0, §9.)*

`xlsx@0.18.5` aveva due vulnerabilità corrette a monte (prototype pollution,
0.19.3; ReDoS, 0.20.2) su quello che è **input non fidato**: un file Excel
arriva da un fornitore o da una mail. La voce era rimandata perché SheetJS dopo
la 0.18 non pubblica più su cdnjs, quindi non era un cambio di numero e basta.

Risolto vendorizzando: `vendor/xlsx.full.min.js` alla **0.20.3**, presa dal CDN
ufficiale e committata. Nello stesso giro sono entrati anche i due file jsPDF —
stessa versione di prima, verificata **bit per bit** confrontandone l'impronta
SHA-512 con l'attributo `integrity` che stava in `index.html`.

Il secondo motivo, che vale quanto il primo: l'app dichiara di aprirsi con un
doppio click e di funzionare offline, e con le librerie su un CDN era vero solo
dopo il primo caricamento con la rete. Su una postazione d'officina scollegata i
pulsanti di export erano muti. Ora non c'è più un terzo dominio da cui dipendere.

Aggiunto `test/vendor-xlsx.test.js`, che copre il buco che *tutti* gli altri
test sull'import lasciavano aperto per scelta: il **binario**. Il giro completo
— esporta, scrive un `.xlsx` vero, lo rilegge con le stesse due chiamate di
`readWorkbook()`, reimporta — gira dentro la suite, quindi il prossimo
aggiornamento della libreria si fa sapendo subito se qualcosa si è mosso.
Restano da provare a mano i file prodotti da Excel stesso: quelli nessun test
può fabbricarli.

### 22. C1 — la duplicazione RFQ/ODA, per la parte che conta *(0.41.0)*
*(Prerequisito chiuso nella 0.40.0: `test/docs-state.test.js`, 29 controlli su
stati, ricevimenti, blocchi e numerazione — vedi C3.)*

Le due dozzine di coppie speculari sono diventate **un registro dei due tipi di
documento** (`DOC_KINDS`) più una funzione sola per ogni regola: guardie,
blocchi, sblocco, modifica di campi e righe, aggiunta manuale e da catalogo,
salvataggio, eliminazione, uscita dall'editor. I nomi storici (`rfqSetLine`,
`ordSetLine`…) restano come adattatori di una riga: sono citati in centinaia di
`onclick` nei template, e rinominarli avrebbe aggiunto rischio senza aggiungere
niente. Ne restano 37, tutti di una riga.

**Il volume del file non è cambiato** (1063 → 1072 righe di codice): il registro
e la sua documentazione costano quanto le copie tolte. Il guadagno non era
quello — è che ogni regola ha un punto solo, e che le differenze fra i due
documenti sono ora dichiarate in un elenco invece di essere sparse in venti
funzioni, dove per trovarle bisognava confrontarle a mano.

**Resta duplicata la presentazione**: `renderRfqEdit`/`renderOrderEdit` e i
quattro export PDF/Excel (~300 righe). Deliberatamente: **non hanno un test**,
e il motivo per cui C1 era rimandato era esattamente questo. Estratta però
`docPartyLines()`, l'intestazione richiedente/fornitore che i quattro export
ripetevano identica. Il prossimo passo, se si vuole chiudere anche quello, è un
test sull'export prima del refactor — non dopo.

---

## Risolto nella 0.76.0

Giro di controllo generale: si legge tutto il codice e si chiude ciò che salta
fuori. Le voci qui sotto **non erano in questo documento** — sono difetti nuovi,
trovati leggendo, e vale la pena notare dove si annidavano: non nella logica di
dominio, che è la parte più guardata e più testata, ma ai bordi — la
concorrenza fra schede, l'arrotondamento fra due rappresentazioni della stessa
cifra, i margini di un foglio PDF, il nome di un file.

### 24. Due schede si cancellavano il lavoro a vicenda
`Store.commit()` riscrive l'intera chiave con la propria fotografia in memoria, e
non esisteva **nessun** listener `storage` né controllo di versione. La seconda
scheda che salvava cancellava tutto ciò che la prima aveva fatto nel frattempo,
senza errore e senza avviso — `dbUnsaved` restava `false`, perché la `setItem`
riusciva. Su un gestionale aperto in due finestre era perdita dati certa e
invisibile, ed è il difetto più grave trovato in questo giro.

Ora un contatore di revisione vive in una chiave sua (`bomtrack_v1_rev`), letta
prima di ogni scrittura: costa la lettura di un numero, non la rilettura di
qualche megabyte di JSON. Al conflitto il salvataggio si ferma e lo dice.
**Deliberatamente non si fonde niente**: fondere due fotografie richiede di
sapere, riga per riga, quale versione vale, e quella risposta non ce l'ha
nessuno qui — ci si limita a smettere di sovrascrivere di nascosto, che è il
difetto. `Store.forzaProssimaScrittura()` è la via d'uscita esplicita, e vale
una volta sola. Coperto da `test/concorrenza.test.js`, che fa condividere un
`localStorage` a due istanze dell'app — cioè il rapporto vero fra due schede.

### 25. Il totale dei documenti non tornava con la somma delle righe
La colonna Importo arrotondava ogni riga ai centesimi (`fmtN`), il piede sommava
i prodotti a piena precisione e arrotondava alla fine. Con i prezzi a quattro
decimali che il listino ammette (`step="0.0001"`), tre righe da 1×1,005
stampavano 3,03 in colonna e 3,02 sotto. Su un documento che parte verso un
fornitore è un errore che si vede. `importoRiga()` in `core.js` arrotonda dove
l'importo nasce, e `totaleRighe()` somma ciò che il fornitore legge; i sette
punti che calcolavano `qty * price` a mano — inclusi i due Excel, che scrivevano
il valore grezzo **in cella** — passano tutti di lì.

### 26. Note e condizioni sparivano in fondo ai PDF
`splitTextToSize` e `addPage` non comparivano **in tutto il repo**. Il testo di
coda era scritto a `y` crescente: una nota lunga usciva dal margine destro, e su
un ordine con molte righe le condizioni finivano oltre il bordo del foglio. In
entrambi i casi senza un errore. `docCoda()` manda a capo, cambia pagina quando
serve, e spezza anche un blocco più alto di una pagina intera — quest'ultimo
caso l'ha trovato il test appena scritto, non l'ispezione.

### 27. Un fornitore con i nostri pezzi si poteva cancellare
Stessa classe della §3, dal lato nato dopo: `supplierUses()` copriva sette posti
ma non `db.movements`, benché `REFS` dichiari `movements.supplierId` e
`fromSupplierId`. Non era un caso di confine — la scheda del movimento
**pretende** il terzista — e il prospetto «presso terzi» restava a raggruppare
sotto «senza fornitore» materiale di proprietà fermo da qualcuno.

### 28. Altro, in breve
- **Nomi dei file di export** mai sanificati in dieci punti: «AB/123-01» è un
  codice normale in officina, e il browser davanti a un nome invalido tronca o
  rinomina senza dirlo. Un solo `nomeFileSicuro()` in `core.js`.
- **Il pannello «Aggiungi componenti»** si azzerava a ogni ridisegno, contro
  quanto promette il commento che lo governa: bastava espandere un nodo
  dell'albero per perdere le quantità messe su dieci articoli.
- **`auth.js`** aveva gli unici tre accessi a `localStorage` senza `try/catch`,
  e stavano sulla schermata d'accesso: in navigazione privata l'app non partiva
  affatto, cioè proprio nello scenario che `showLoadErrorModal` racconta.
- **Nessun `beforeunload`**, benché `isUnsaved()` e i tre flag `*Dirty`
  esistessero già e l'avviso dicesse testualmente «chiudendo questa scheda
  andrebbero persi».
- **`renameUom`/`uomUsage`** ignoravano `altUom` e `priceUom`, cioè la doppia
  unità di misura. Non corrompeva i calcoli (i due campi si guardano fra loro,
  non l'elenco) ma faceva dichiarare «non usata» l'unità che converte i prezzi.
- **Selezione multipla O(n²)** nell'Ispettore, su un percorso che gira a ogni
  carattere digitato nel filtro: tre `Set`.
- **`aria-modal`** dichiarava inerte una pagina che per scelta non lo è, e due
  schede aperte si dichiaravano entrambe «l'unica». Tolto l'attributo, tenuto
  `role="dialog"`: la pagina viva dietro è il disegno, non un difetto.
- I messaggi di `requirePdf`/`requireXlsx` parlavano ancora di **connessione a
  internet**, superata dalla vendorizzazione della 0.43.0 (§23); i caratteri di
  Google restavano l'unica dipendenza di rete, e **bloccante**, sul percorso di
  avvio.

### Una correzione annullata
«1.500» letto come 1,5 in import sembrava un difetto, e non lo è:
`test/import.test.js` documenta la lettura decimale come scelta deliberata — con
un separatore solo non si indovina, e «0.750» sono settantacinque centesimi. Il
test ha fermato la modifica. Vale la pena registrarlo: è il caso in cui la
documentazione del progetto ha avuto ragione contro chi lo stava controllando.

---

## Aggiunto nella 0.77.0, e cosa comporta

Tre funzionalità nuove. Si registrano qui perché ciascuna lascia qualcosa da
tenere d'occhio, e perché due di esse toccano il contratto del futuro backend.

**Avanzamento di produzione** (`produzione.js`, collezione `productions`). Una
dichiarazione per volta invece di un saldo riscritto — la stessa scelta dei
movimenti di magazzino, e per la stessa ragione. Da tenere d'occhio: la
collezione **cresce e non viene mai potata**. Su un uso intenso è la seconda per
numero di righe dopo i movimenti, e va contata nella stima di
`docs/sostenibilita-free-tier.md`, che non la conosce.

**Allegati** (`allegati.js`, collezione `attachments` + IndexedDB). È il primo
posto in cui l'app tiene dati **fuori** da `Store`, ed è una deroga consapevole:
in `localStorage` i file non ci stanno, e metterceli avrebbe fatto smettere di
salvare tutto il resto. Le conseguenze aperte sono due, entrambe dichiarate
all'utente ma non ancora risolte:
  - il **backup JSON non è più completo**. Porta l'elenco degli allegati e non i
    file, quindi un ripristino su un altro PC è una copia parziale. La strada
    giusta il giorno del cloud la indica già
    `docs/sostenibilita-free-tier.md` nella sezione «il giorno in cui arrivano i
    disegni»: Supabase Storage, che è fuori dal budget del database;
  - i **file orfani** non si raccolgono da soli. C'è il pulsante in Gestione, ma
    è un gesto manuale, e nessuno lo farà finché lo spazio non finisce.

**PWA** (`sw.js`, `manifest.webmanifest`). Il rischio vero non è il service
worker in sé ma il **disallineamento**: uno script aggiunto a `index.html` e
dimenticato in `sw.js` funziona online e sparisce offline, e una `VERSIONE` non
aggiornata fa servire per sempre la cache vecchia a chi ha già aperto l'app.
Sono i due difetti che si manifestano esattamente dove nessuno guarda, ed è per
questo che `test/pwa.test.js` li controlla invece di fidarsi.

---

## Aperto

### A. Sicurezza

**A2 — `hashPassword` è uno SHA-256 a singolo giro** (`store.js`), senza KDF
né iterazioni, e il backup JSON esporta gli hash. Il limite è documentato
onestamente (`store.js:161-166`, `README.md`) e l'app è locale e monoutente. Non
ha senso risolverlo in locale: si chiude passando a Supabase Auth, dove
`passwordHash`/`passwordSalt` vanno **cancellati** in migrazione.

**A10 — gli allegati sono fuori da `Store`, e il backup lo dice ma non lo
risolve.** Vedi la sezione 0.77.0 qui sopra. Non è un difetto da correggere in
locale — è una conseguenza inevitabile del tenere dei file su un browser — ma è
il primo punto in cui «esporta un backup JSON» non basta più a mettersi al
sicuro, e va chiuso insieme al backend, non dopo.

**A6 residuo — il vincolo `unique` su `items.code` va scritto in SQL.** Il lato
applicativo è chiuso (§12), ma finché il vincolo non è nel database due client
possono ancora assegnare lo stesso codice in concorrenza: nessuno dei due vede
l'altro. Prerequisito: la bonifica dei duplicati storici, che ora ha lo
strumento per essere fatta.

**A7 — numerazione documenti a `Math.max(...) + 1` su scansione**
(`nextRfqNumber`, `nextOrderNumber`, `nextPlanNumber`). In multiutente due
persone che creano una richiesta nello stesso minuto ottengono lo stesso numero,
garantito. Serve un contatore atomico lato server. Attenuante accertata: tutte le
FK usano l'`id` UUID, **mai il numero** — quindi una rinumerazione al push non
rompe nessun riferimento.

**A8 residuo — i cicli in distinta restano impediti solo lato client.** Il lato
applicativo è chiuso e ora copre anche la distinta parte (§15), ma `createsCycle()`
protegge dentro **un solo** client. In cloud due utenti possono creare
congiuntamente un anello che nessuno dei due vede, e `costOf` ricorre **per
tutti**: è l'unico vincolo la cui violazione rende l'app inutilizzabile a tutto
il team. Serve un trigger ricorsivo su `item_components`, e non è opzionale.

**A9 — `workCenters[].suppliers` non è dichiarato in `SCHEMA`.** Il difetto è
ammesso in `docs/cloud-schema.md`, non era registrato qui. `SCHEMA.workCenters`
non ha `children`, ma l'array annidato esiste ed è vivo (`views-manage.js`,
`costing.js`, `views-bom.js`): i fornitori di conto lavoro di un centro. Oggi
innocuo — nessun codice di rete esiste — ma al primo push `flattenDB()` lo
lascerebbe dentro la riga padre invece di esplodere una tabella figlia. Va
chiuso **prima** del backend, non dopo: è una riga di `SCHEMA`, e dopo sarebbe
una migrazione. Il riferimento `suppliers[].supplierId` è invece già coperto dal
lato applicativo (`supplierUses()`).

### B. Prestazioni

**B1 residuo — `findOrCreateSupplier` e `findOrCreateFamily` restano lineari per
riga.** La parte pesante è risolta (§13): erano gli articoli, che sono migliaia.
Fornitori e famiglie sono decine, quindi il prodotto resta piccolo — ma su un
foglio da 5.000 righe con centinaia di fornitori si farebbe sentire, e la
soluzione è la stessa già scritta. *Non urgente.*

**B2 — `mrpDescend` non memoizza.** Su una distinta con sottoassiemi molto
condivisi lo stesso ramo si riesplode per ogni percorso. Meno grave di quanto
sembri: le quantità dipendono dal percorso, quindi la memoizzazione va fatta sul
*profilo* del sottoalbero, non sul risultato — non è un `Map` e basta.

### C. Manutenibilità

**C1 residuo — resta duplicata la *presentazione* dei documenti** *(la logica è
chiusa nella 0.41.0, vedi §22)*: `renderRfqEdit`/`renderOrderEdit` e i quattro
export PDF/Excel, circa 300 righe. **Il prerequisito non c'è più**: dalla 0.76.0
`test/export-docs.test.js` verifica i sette export sui dati che producono — righe,
totali, piede, nome del file, condizioni in coda — sostituendo jsPDF e SheetJS con
due finti che annotano ciò che l'app passa loro. Il refactor si può fare, e ora
ha una rete sotto. *(Nella stessa versione `docCoda()` ha già unificato le tre
code identiche di richiesta, ordine e ODL.)*

**C3 residuo — buchi di copertura** *(ridotto nella 0.22.0 §8, di nuovo nella
0.40.0 con `test/docs-state.test.js`, e nella 0.76.0 con `export-docs`,
`anagrafiche` e `concorrenza`)*. Export PDF/Excel e `renameUom` sono ora coperti.
Restano scoperti `printView` (`shell.js`) e le anagrafiche di servizio minori di
`views-manage.js`.

**C4 — file lunghi con scope globale piatto:** `views-docs.js` ~1990 righe,
`views-catalog.js` ~1970, `views-mrp.js` ~1880, `core.js` ~1430, `store.js` ~1240,
`views-manage.js` ~940. Senza moduli, ogni nome è globale e una collisione non dà
errore: vince l'ultimo caricato.

*Aggiornamento 0.76.0.* La **lunghezza** resta, e resta un problema di sola
lettura del codice: si chiude coi moduli, cioè rinunciando all'apertura da
`file://`. La **collisione** invece — che è il modo in cui quel problema fa danno
davvero — è stata misurata e presidiata: i nomi globali dichiarati dai 26 script
sono **1291** e le collisioni **zero**, e `test/scripts.test.js` ora fallisce se
qualcuno ne introduce una, nominandola. Il prezzo che questa voce dava per
obbligato non c'era: per non farsi male non serviva rinunciare a niente, serviva
contare.

---

## Note in positivo

- Il fatto che questo giro di controllo abbia prodotto **quattro** difetti alti
  su diciassettemila righe, e nessuno di essi nella logica di dominio, dice
  qualcosa: costificazione, esplosione di distinta, fabbisogno netto e conto
  lavoro — la parte difficile e quella più testata — hanno retto la rilettura.
  Quello che ha ceduto stava ai bordi: due schede aperte, un arrotondamento fra
  due rappresentazioni della stessa cifra, il margine di un foglio, il nome di
  un file. Sono i posti dove nessuno guarda perché non sembrano il problema.
- `Store.commit()` è un punto di scrittura unico e ben documentato, con gestione
  esplicita di quota esaurita, storage non disponibile e dati non serializzabili,
  e un hook `onPersistError` che tiene `store.js` libero da codice d'interfaccia.
- Il ragionamento sulla cachabilità di `costOf` (`costing.js:19-30`) non è banale
  ed è corretto: i risultati con `cycle: true` dipendono dal percorso di discesa e
  non finiscono mai in cache; quelli cachati sono congelati.
- L'escaping HTML con `esc()` è applicato in modo sistematico su tutti gli
  assegnamenti a `innerHTML`.
- `test/harness.js` risolve in modo pulito il problema di testare classic script
  globali senza jsdom e senza una sola dipendenza.
