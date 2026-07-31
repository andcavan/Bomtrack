# Analisi tecnica — luglio 2026

Controllo generale del codice fatto insieme al lavoro della 0.21.0. Diviso in
**risolto in questa versione** e **aperto**, con il motivo per cui una cosa è
stata rimandata. Ogni voce porta file e riga: se il codice si sposta, il
riferimento va aggiornato o la voce va chiusa.

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

## Aperto

### A. Sicurezza

**A1 — `xlsx@0.18.5` con CVE note e nessun SRI.** `index.html:10-12` carica tre
librerie da CDN senza `integrity`. La versione di SheetJS in uso ha due
vulnerabilità corrette a monte (prototype pollution, corretta in 0.19.3; ReDoS,
corretta in 0.20.2), e il file Excel importato è input non fidato. *Rimandato:*
aggiornare la libreria va verificato su file d'importazione reali, e SheetJS ha
cambiato canale di distribuzione dopo la 0.18 — non è un cambio di numero di
versione e basta.

**A2 — `hashPassword` è uno SHA-256 a singolo giro** (`store.js:211`), senza KDF
né iterazioni, e il backup JSON esporta gli hash. Il limite è documentato
onestamente (`store.js:161-166`, `README.md:57-59`) e l'app è locale e
monoutente, ma va ricordato prima di metterla su un database condiviso.

**A3 — la sessione non scade mai.** `restoreSession()` (`auth.js:113`) scrive un
`ts` (`auth.js:98`) che poi non legge nessuno.

**A4 — `Store.importSnapshot()` valida solo `Array.isArray(data.items)`**
(`store.js`), poi assegna il blob a `db`. Un backup troncato passa la guardia e
`migrateDB()` lavora su strutture che nessuno ha verificato.

**A5 — `unescape()`**, deprecato, dentro la conversione UTF-8 di `sha256Hex()`
(`store.js:180`).

### B. Prestazioni

**B1 — `importItems`/`importBom` fanno un `db.items.find` per riga.**
`import-export.js:125` e `:171`; `importBom` ne fa due (padre e figlio) più una
DFS completa in `createsCycle()`. Un foglio da 5.000 righe su un catalogo da
5.000 articoli sono ~50 milioni di confronti. Serve una `Map` codice → articolo
costruita una volta a inizio import. *Rimandato:* è l'unico modulo senza un solo
test (vedi C3), e toccarlo senza rete di sicurezza è la parte rischiosa.

**B2 — `mrpDescend` non memoizza.** Su una distinta con sottoassiemi molto
condivisi lo stesso ramo si riesplode per ogni percorso. Meno grave di quanto
sembri: le quantità dipendono dal percorso, quindi la memoizzazione va fatta sul
*profilo* del sottoalbero, non sul risultato — non è un `Map` e basta.

### C. Manutenibilità

**C1 — RFQ e ODA sono due copie quasi identiche** in `views-docs.js`: quattordici
coppie speculari (`rfqGuard`/`ordGuard`, `rfqSetLine`/`ordSetLine`,
`exportRfqPDF`/`exportOrderPDF`…). L'astrazione condivisa esiste già a metà
(`docFilterBar`, `applyDocLock`, `lineIdentityFields`, `catalogPickerModal`).
*Rimandato:* è il refactor più grosso del repo e non ha rete — vedi C3.

**C2 — nessuna gestione degli errori fuori da `store.js`.** Non esiste un
`window.onerror` né un `unhandledrejection`: un errore dentro un `render*` lascia
la vista a metà senza dire niente. Sarebbe il primo intervento da fare fra quelli
aperti: costa poco e rende visibile tutto il resto.

**C3 — buchi di copertura.** `import-export.js` (437 righe) e `auth.js` (180) non
hanno un solo test; `views-manage.js` è scoperto; `views-docs.js` è coperto solo
per i filtri di lista, non per le transizioni di stato, i ricevimenti o il lock
dei documenti. Scoperte in particolare: `genItemCode`, `importItems`, `importBom`,
`verifyPassword`, `rfqAutoStatus`/`ordAutoStatus`, `renameUom`, `addUser`.

**C4 — file lunghi con scope globale piatto:** `views-catalog.js` ~1200 righe,
`views-docs.js` ~1100, `views-manage.js` 640, `store.js` 620, `core.js` 640.
Senza moduli, ogni nome è globale e una collisione non dà errore: vince l'ultimo
caricato.

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
