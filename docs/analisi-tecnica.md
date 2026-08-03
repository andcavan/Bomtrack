# Analisi tecnica — luglio 2026

Controllo generale del codice fatto insieme al lavoro della 0.21.0. Diviso in
**risolto in questa versione** e **aperto**, con il motivo per cui una cosa è
stata rimandata. Ogni voce porta file e riga: se il codice si sposta, il
riferimento va aggiornato o la voce va chiusa.

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

## Risolto fra la 0.37.0 e la 0.41.0

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

## Aperto

### A. Sicurezza

**A1 — `xlsx@0.18.5` con CVE note.** *(SRI risolto nella 0.22.0, vedi §9.)* La
versione di SheetJS in uso ha due vulnerabilità corrette a monte (prototype
pollution, corretta in 0.19.3; ReDoS, corretta in 0.20.2), e il file Excel
importato è input non fidato. *Rimandato:* SheetJS ha cambiato canale di
distribuzione dopo la 0.18 — non è un cambio di numero di versione e basta, e
l'aggiornamento va verificato su file d'importazione reali. Da fare ora c'è però
una cosa che prima mancava: `test/import.test.js` copre la logica a valle del
parsing, quindi si può cambiare libreria sapendo se qualcosa si rompe.

**A2 — `hashPassword` è uno SHA-256 a singolo giro** (`store.js`), senza KDF
né iterazioni, e il backup JSON esporta gli hash. Il limite è documentato
onestamente (`store.js:161-166`, `README.md`) e l'app è locale e monoutente. Non
ha senso risolverlo in locale: si chiude passando a Supabase Auth, dove
`passwordHash`/`passwordSalt` vanno **cancellati** in migrazione.

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
export PDF/Excel, circa 300 righe. Il motivo per cui non è stata toccata è lo
stesso di sempre: **gli export non hanno un test**. Serve prima quello — un
export si verifica sui dati che produce, non sul PDF — e poi il refactor.

**C3 residuo — buchi di copertura** *(ridotto nella 0.22.0 §8, e di nuovo nella
0.40.0 con `test/docs-state.test.js`)*. Restano scoperti gli **export PDF/Excel**
(nessuna delle quattro funzioni ha un test, vedi C1 residuo) e parte di
`views-manage.js` (`renameUom` e le anagrafiche di servizio; le guardie di ruolo
sono ora coperte da `test/guards.test.js`).

**C4 — file lunghi con scope globale piatto:** `views-catalog.js` ~1400 righe,
`views-docs.js` ~1270, `core.js` ~930, `store.js` ~900, `views-manage.js` ~670.
Senza moduli, ogni nome è globale e una collisione non dà errore: vince l'ultimo
caricato. Nota: la deduplica della 0.41.0 non ha accorciato `views-docs.js` e
non doveva — sono due problemi diversi, e questo si chiude solo con i moduli,
cioè rinunciando all'apertura da `file://`.

---

## Note in positivo

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
