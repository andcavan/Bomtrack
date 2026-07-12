# Bomtrack — Schema dati cloud (contratto per il futuro adapter)

Stato attuale: **nessun codice di rete**. I dati vivono in `localStorage` (chiave `bomtrack_v1`)
come unico blob JSON, gestito da `store.js`. Questo documento definisce il contratto verso cui
il layer dati è già predisposto: un backend condiviso per un piccolo team (Supabase / Cloudflare D1)
con **tabelle normalizzate**.

## Predisposizioni già attive (schema v2)

- **ID**: UUID v4 (`crypto.randomUUID`) su tutte le entità — nessun contatore locale, nessuna
  collisione tra utenti diversi.
- **Timestamp**: `createdAt` / `updatedAt` (ISO 8601) su ogni record, aggiornati ad ogni modifica →
  baseline per sync **last-write-wins** su `updatedAt`.
- **Soft delete**: la convenzione è il flag `active: false` (fornitori, centri, articoli);
  in cloud mappa su tombstone/`deleted_at`.
- **Versioning**: `db.schemaVersion` dentro il blob; le migrazioni in `migrateDB()` sono
  idempotenti e girano anche sull'import di backup vecchi (v1 → v2 automatico).

## Mappatura blob → tabelle

| Collezione locale | Tabella | Colonne principali |
|---|---|---|
| `suppliers` | `suppliers` | id uuid PK, name, referente, email, active bool, created_at, updated_at |
| `workCenters` | `work_centers` | id uuid PK, name, hourly_rate numeric, active, created_at, updated_at |
| `families` | `families` | id uuid PK, name, kind ('acquistato'\|'materiale'\|'parte'), sigla, created_at, updated_at |
| `families[].subs` | `sub_families` | id uuid PK, family_id uuid FK, name, sigla, created_at, updated_at |
| `items` | `items` | id uuid PK, code, name, type enum, uom, notes, active, unit_cost, purchase_price, supplier_id FK, family_id FK, sub_family_id FK, overhead_pct_override, margin_pct_override, created_at, updated_at |
| `items[].components` | `item_components` | item_id uuid FK, child_item_id uuid FK, qty numeric, scrap_pct numeric |
| `items[].operations` | `item_operations` | item_id uuid FK, work_center_id uuid FK, hours numeric, note |
| `items[].cycle` | `item_cycle_rows` | item_id uuid FK, kind ('item'\|'op'), ref_item_id FK, work_center_id FK, supplier_id FK, qty, cost, cost_override |
| `settings` | `settings` | una riga per team (o coppie chiave/valore) |

Nota: **le sottofamiglie restano annidate** in `families[].subs` nel modello locale (scelta
deliberata per non toccare la UI). L'adapter cloud le esplode in righe `sub_families` in push
e le riannida in pull — è una pura trasformazione di forma (~15 righe).

## Interfaccia adapter

Oggi l'unico punto di persistenza è `Store` (`store.js`):

```js
Store.load()               // adapter.load() → db
Store.commit()             // adapter.save(db)  ← unico choke point di scrittura
Store.getAll / getById / insert / update / remove   // API repository per collezione
Store.exportSnapshot / importSnapshot               // backup JSON (migra i formati vecchi)
```

Fase 1 (minima): un `SupabaseAdapter` con `load()`/`save(db)` che serializza il blob su una
tabella `snapshots` per team — si aggancia sostituendo il corpo di `Store.load/commit`.

Fase 2 (normalizzata): l'adapter usa l'API repository per push/pull incrementali per collezione,
con risoluzione conflitti last-write-wins su `updated_at` e RLS Supabase per l'accesso del team.

## Deploy

Il frontend è statico (nessun build): pubblicabile così com'è su **GitHub Pages** o
**Cloudflare Pages** (branch `main`, root `/`). Il contesto HTTPS garantisce `crypto.randomUUID`.
