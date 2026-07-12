# Bomtrack — Distinte Base & Costificazione

App per creare e gestire **distinte base (BOM) multi-livello** di macchine meccaniche e ottenere la **costificazione automatica**.

Costruita con lo stesso stile di TimeTrack: vanilla JavaScript + HTML + CSS, nessun build, tema dark. **Database solo locale** (`localStorage`) — nessun server, nessun Supabase.

## Avvio

Aprire `index.html` in un browser (doppio click, oppure usare l'estensione "Live Server" di VS Code). Al primo avvio vengono caricati dei dati di esempio (macchina "Nastro Trasportatore NT-100").

## Funzionalità

- **🌳 Distinte base** — albero multi-livello espandibile della macchina selezionata, con costo unitario e di riga per ogni componente, lavorazioni interne e card di riepilogo costi. Aggiunta/modifica/eliminazione di componenti e lavorazioni.
- **📦 Catalogo** — gestione degli articoli riutilizzabili in 3 tipi:
  - **Materia prima** (`materiale`): costo unitario per unità di misura (es. €/kg).
  - **Componente commerciale** (`acquistato`): prezzo d'acquisto da fornitore.
  - **Prodotto / Assieme** (`prodotto`): fabbricato internamente, con propria distinta (componenti) e lavorazioni. Una macchina è un prodotto con flag *"È una macchina"*.
- **💶 Costificazione** — incidenza delle voci di costo e distinta esplosa; **export PDF ed Excel**.
- **⚙ Gestione** — fornitori, centri di lavoro (tariffe €/h), impostazioni globali (spese generali %, margine %, valuta), **import massivo da Excel** e backup JSON (esporta/importa/ripristina).

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

Le percentuali di spese generali e margine sono globali (Impostazioni) e sovrascrivibili per singola macchina dalla *Modifica testata*. I riferimenti ciclici nella distinta sono rilevati e impediti.

## File

- `index.html` — struttura, navigazione, CDN (jsPDF, SheetJS).
- `app.js` — modello dati, persistenza locale, motore di costificazione, viste, CRUD, export.
- `style.css` — tema dark.

## Note

I dati risiedono nel browser. Per trasferirli su un altro PC usare **Gestione → Backup → Esporta/Importa JSON**. Reintrodurre la sincronizzazione cloud (Supabase) è previsto come passo successivo.
