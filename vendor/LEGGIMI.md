# Librerie di terze parti

Le tre librerie che servono agli export, tenute qui dentro invece che su un CDN.
Nessuna è modificata: sono i file ufficiali, scaricati e committati così com'erano.

| File | Versione | Origine |
|---|---|---|
| `xlsx.full.min.js` | **0.20.3** | `https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js` |
| `jspdf.umd.min.js` | 2.5.1 | `https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js` |
| `jspdf.plugin.autotable.min.js` | 3.8.2 | `https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js` |

Impronte SHA-256 dei file, per poterli riverificare:

```
xlsx.full.min.js                cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41
```

I due file jsPDF sono **bit per bit** quelli che l'app caricava da cdnjs fino alla
0.42.0: le loro impronte SHA-512 coincidono con gli attributi `integrity` che
stavano in `index.html`, e questo è il modo in cui è stato verificato il
travaso — non «sembrano uguali», sono gli stessi.

## Perché stanno qui

**SheetJS.** Dalla 0.18 non pubblica più su npm né su cdnjs, ma solo sul proprio
CDN. La 0.18.5 che l'app usava ha due vulnerabilità corrette a monte
(prototype pollution, risolta nella 0.19.3; ReDoS, risolta nella 0.20.2), e un
file Excel importato è **input non fidato**: arriva da un fornitore, da un
cliente, da una mail. Restare indietro non era una scelta sostenibile.

**Tutte e tre.** L'app dichiara di aprirsi con un doppio click su `index.html` e
di funzionare offline. Con le librerie su un CDN questo era vero solo dopo che
qualcuno l'aveva aperta almeno una volta con la rete: su un PC in officina senza
collegamento i pulsanti di export erano muti. Dentro il repo non c'è più un
terzo dominio da cui dipendere né di cui fidarsi.

## Come si aggiornano

Non c'è `npm`, non c'è un build: si scarica il file e si sostituisce.

1. Scaricare la nuova versione dall'indirizzo qui sopra.
2. Sostituire il file in questa cartella e aggiornare la tabella e l'impronta.
3. `node test/run.js` — la suite copre la logica **a valle** del parsing
   (`test/import.test.js`, `test/catalog-xlsx.test.js`), quindi dice subito se
   qualcosa che l'app usa è cambiato.
4. Provare a mano **un import e un export veri**, con un file Excel di quelli
   che girano davvero. I test usano fogli costruiti in memoria: il parsing di un
   `.xlsx` prodotto da Excel è l'unica cosa che non verificano.
