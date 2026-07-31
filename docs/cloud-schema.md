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
| `users` | `profiles` | id uuid PK → `auth.users(id)`, name, username unique, email, role (`admin`\|`acquisti`\|`progettazione`\|`lettore`), color, active bool |
| `suppliers` | `suppliers` | id uuid PK, name, referente, email, phone, vat, street, street_number, zip, city, province, country, default_transport, default_payment, active bool, created_at, updated_at |
| `workCenters` | `work_centers` | id uuid PK, name, hourly_rate numeric, active, created_at, updated_at |
| `families` | `families` | id uuid PK, name, kind ('acquistato'\|'materiale'\|'parte'), sigla, created_at, updated_at |
| `families[].subs` | `sub_families` | id uuid PK, family_id uuid FK, name, sigla, created_at, updated_at |
| `items` | `items` | id uuid PK, code, name, type enum, uom, notes, active, favorite, obsolete, unit_cost, purchase_price, supplier_id FK, supplier_code, supplier_desc, active_price_id FK → `item_prices(id)`, sourcing ('make'\|'buy'), family_id FK, sub_family_id FK, machine_item_id FK, group_item_id FK, sigla, overhead_pct_override, margin_pct_override, created_at, updated_at |
| `items[].components` | `item_components` | item_id uuid FK, child_item_id uuid FK, qty numeric, scrap_pct numeric |
| `items[].operations` | `item_operations` | item_id uuid FK, work_center_id uuid FK, hours numeric, note |
| `items[].cycle` | `item_cycle_rows` | item_id uuid FK, kind ('item'\|'op'), ref_item_id FK, work_center_id FK, supplier_id FK, qty, cost, cost_override |
| `items[].priceList` | `item_prices` | id uuid PK, item_id uuid FK, supplier_id FK **nullable** (quotazione inserita a mano), price numeric, min_qty numeric, lead_days int, code, desc, date, rfq_id FK nullable, line_id, note, created_at, updated_at |
| `rfqs` | `rfqs` | id uuid PK, number unique per anno, title, date, status ('bozza'\|'inviata'\|'ricevuta'\|'chiusa'), supplier_id FK, transport, payment, plan_id FK nullable, notes, notes_internal, active, created_at, updated_at |
| `rfqs[].lines` | `rfq_lines` | id uuid PK, rfq_id uuid FK, item_id FK nullable (riga manuale), code, description, uom, qty, price nullable, delivery_date, note |
| `orders` | `orders` | id uuid PK, number unique per anno, title, date, status ('bozza'\|'inviato'\|'confermato'\|'parziale'\|'evaso'\|'annullato'), supplier_id FK, transport, payment, requested_delivery, rfq_id FK nullable, plan_id FK nullable, supplier_confirmation, notes, notes_internal, active, created_at, updated_at |
| `orders[].lines` | `order_lines` | id uuid PK, order_id uuid FK, item_id FK nullable, code, description, uom, qty, price nullable, delivery_date, received numeric, note |
| `plans` | `production_plans` | id uuid PK, number unique per anno, title, date, notes, active, created_at, updated_at |
| `plans[].lines` | `production_plan_lines` | id uuid PK, plan_id uuid FK, item_id uuid FK, qty numeric |
| `settings` | `settings` | una riga per team (o coppie chiave/valore) |

**Vincoli che il modello locale dà per scontati** e che in cloud vanno scritti:

- `items.active_price_id` punta a una riga di `item_prices` **dello stesso
  articolo**: è il "prezzo in uso" nella costificazione. Cancellando quella riga
  il campo va a `NULL` senza toccare `unit_cost`/`purchase_price` — il costo
  resta, si sgancia solo il riferimento (`priceDelRow()`).
- `item_prices` esiste solo per `type in ('acquistato','materiale','parte')`.
- `item_prices (rfq_id, line_id)` è la chiave anti-duplicato usata da
  `rfqRecordPrices()`: registrare due volte la stessa offerta non deve creare due
  quotazioni.
- `sourcing` ha senso solo su `type = 'parte'`; per gli altri tipi è `NULL`. Il
  valore proposto alle parti nuove sta in `settings.partSourcingDefault`
  (`'buy'` di serie): è un default di creazione, **non** un fallback di lettura —
  una parte senza il campo vale `'make'`, com'era prima che esistesse.
- Da `sourcing` dipende **anche il costo**, non solo il fabbisogno: `'make'` lo
  deriva da `item_cycle_rows`, `'buy'` usa `unit_cost` (che arriva da
  `item_prices`). Ha sostituito il campo `cost_mode` delle versioni fino alla
  0.20.0 (`'unit'` → `'buy'`, `'cycle'`/`'sum'` → `'make'`): se un adapter cloud
  legge blob storici, la conversione è in `migrateDB()`.
- `plan_id` è la tracciabilità fabbisogno → documento, e `orders.plan_id` si
  eredita dalla richiesta quando un ordine nasce da una RFQ generata da un piano.

Ogni altra tabella porta anche `created_by` / `updated_by` uuid → `profiles(id)`: in locale sono già
scritti da `stampNew()`/`touch()` con l'utente della sessione (`Store.setActor`).

Nota: **le sottofamiglie restano annidate** in `families[].subs` nel modello locale (scelta
deliberata per non toccare la UI). L'adapter cloud le esplode in righe `sub_families` in push
e le riannida in pull — è una pura trasformazione di forma (~15 righe).

## Utenti e autenticazione

Il modello locale è già quello di destinazione: `db.users` è 1:1 con `profiles`, i ruoli sono
quelli che le policy dovranno riconoscere e l'app tiene un solo utente di sessione
(`currentUser`) da cui dipendono nav, guardie e campi di audit.

**Cosa non migra**: `passwordHash` e `passwordSalt`. In locale sono SHA-256(salt + password)
calcolati in `store.js`; le password vere le possiede Supabase Auth (`auth.users`) e questi due
campi vanno **cancellati** al momento della migrazione. Vale la pena ribadirlo: finché i dati
stanno nel browser l'accesso non protegge nulla — chi apre i DevTools legge il blob e si assegna
il ruolo che vuole. È RLS a rendere reali i permessi.

Punti di innesto lato app (`core.js`, `views-*.js`), pensati per essere sostituiti uno a uno — il precedente
funzionante è `timetrack-supabase` (`migrations/schema.sql`, `supabase/functions/invite-user`):

| Oggi (locale) | Domani (Supabase) |
|---|---|
| `submitLogin()` → `verifyPassword()` | `supa.auth.signInWithPassword({ email, password })` |
| `restoreSession()` su `localStorage.bomtrack_session` | `supa.auth.getSession()` |
| `logout()` | `supa.auth.signOut()` |
| `saveOwnPassword()` | `supa.auth.updateUser({ password })` |
| `addUser()` (scrive hash in locale) | edge function di invito con `service_role` (mai nel browser) |
| `db.users` da `Store.load()` | `select * from profiles` |
| `canWrite(area)` / `roleGuard(area)` | restano **invariati**, raddoppiati da policy RLS per ruolo |

Schema delle policy: lettura a tutti i profili attivi; scrittura su `items`/`item_*` ai ruoli
`admin` e `progettazione`, su `rfqs`/`orders` ad `admin` e `acquisti`, su `settings`, anagrafiche
e `profiles` al solo `admin` — la stessa matrice di `ROLE_WRITE` in `core.js`.

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
