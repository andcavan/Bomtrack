# Bomtrack — Schema dati cloud (contratto per il futuro adapter)

Stato attuale: **nessun codice di rete**. I dati vivono in `localStorage` (chiave `bomtrack_v1`)
come unico blob JSON, gestito da `store.js`. Questo documento definisce il contratto verso cui
il layer dati è già predisposto: un backend condiviso per un piccolo team (Supabase / Cloudflare D1)
con **tabelle normalizzate**.

## Predisposizioni già attive (schema v2, aggiornate alla 0.24.0)

Dalla 0.24.0 questo documento non è più solo un'intenzione: le parti qui sotto
esistono nel codice, sono verificate dalla suite e si possono leggere invece di
immaginarle.

- **Registro dello schema** — `SCHEMA` in `store.js`: le nove collezioni, i loro
  array annidati, quali righe hanno un id proprio e la politica di merge di
  ciascuna. Chi deve percorrere il database lo legge da qui.
- **Traduzione annidato ↔ normalizzato** — `flattenDB()` / `nestDB()` in
  `cloud-map.js`, funzioni pure. Il giro completo è verificato campo per campo
  (`test/cloudmap.test.js`).
- **Conto delle modifiche** — `Store.pendingChanges()` / `Store.markSynced()`.
- **Seam dell'adapter** — `Store.adapter`, con `LocalAdapter` (localStorage) come
  implementazione attuale.
- **Comportamento atteso sui conflitti** — `test/sync.test.js`: due client
  contro un server finto, sui tre scenari reali.


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
| `revisions` | `item_revisions` | id uuid PK, item_id uuid FK, rev, date, motivo, **snapshot jsonb**, created_by, created_at |
| `trash` | `trash` | id uuid PK, coll, deleted_at, deleted_by uuid FK, **record jsonb** — le eliminazioni recuperabili, ripulite dopo `TRASH_DAYS` |
| `jobs` | `jobs` | id uuid PK, number unique per anno, customer, title, customer_ref, status ('aperta'\|'produzione'\|'chiusa'\|'annullata'), date, due_date, notes, active, created_at, updated_at |
| `movements` | `stock_movements` | id uuid PK, item_id uuid FK, kind ('rettifica'\|'carico'\|'scarico'), qty numeric **con segno**, date, note, created_by, created_at |
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
- `job_id` è l'anello a monte: sta su `production_plans`, `rfqs` e `orders`, e si
  eredita a scendere. **Nullable ovunque**: la maggior parte del lavoro non nasce
  da una commessa, e obbligarla renderebbe la funzione un ostacolo invece di uno
  strumento. `on delete restrict`: una commessa che regge documenti non si
  cancella, lascerebbe riferimenti a un numero inesistente.
- Le date sono `date`, non `timestamptz`: sono giorni di calendario e non hanno
  fuso orario. In locale la lezione è già stata pagata — calcolarle passando per
  la mezzanotte locale le anticipava di un giorno a est di Greenwich.
- **Doppia unità di misura**: `items.alt_uom` + `items.alt_factor` (fisica
  dell'articolo, uguale per tutti i fornitori) e `item_prices.price_uom` (scelta
  del singolo fornitore). Il vincolo da scrivere: `alt_uom` e `alt_factor` sono
  entrambi valorizzati o entrambi `NULL`, e `alt_factor > 0` — separatamente non
  significano niente e produrrebbero conversioni inventate. `price_uom` può
  valere solo `items.uom` o `items.alt_uom`.
  Le righe di documento (`rfq_lines`, `order_lines`) portano già la propria
  `uom`: è nell'unità del fornitore, e la conversione verso la giacenza si fa
  leggendo quella. Nessuna colonna in più.
- **La giacenza non è una colonna.** Non esiste `items.on_hand`, e non va aggiunta:
  l'esistente è `Σ order_lines.received + Σ stock_movements.qty`. Un campo
  aggiornato a parte diventerebbe una seconda verità che diverge dalla prima, ed
  è l'errore già corretto una volta con i prezzi. In cloud conviene una **vista**
  (`item_stock`) e, se i numeri crescono, una materialized view — mai una colonna
  scrivibile dal client.
- `stock_movements` è concettualmente **append-only** come le revisioni, ma qui la
  cancellazione serve davvero (una rettifica sbagliata va tolta) e resta
  permessa. Il merge è **per riga**: due persone che registrano due movimenti
  diversi sullo stesso articolo non sono in conflitto.
- `item_revisions.snapshot` resta **jsonb**, non si normalizza in tabelle figlie:
  una revisione rilasciata è una fotografia immutabile e non va mai fusa con
  niente. Darle la forma dei dati vivi significherebbe invitare qualcuno a
  modificarla, e una revisione modificabile non è una revisione. È anche l'unica
  tabella che dovrebbe essere **append-only** in RLS: inserimento sì,
  aggiornamento e cancellazione no, nemmeno all'amministratore.

Ogni altra tabella porta anche `created_by` / `updated_by` uuid → `profiles(id)`: in locale sono già
scritti da `stampNew()`/`touch()` con l'utente della sessione (`Store.setActor`).

Nota: **le sottofamiglie restano annidate** in `families[].subs` nel modello locale (scelta
deliberata per non toccare la UI). L'adapter cloud le esplode in righe `sub_families` in push
e le riannida in pull.

## Colonne che la normalizzazione impone

Non sono nel modello locale e non servono all'app: esistono perché una tabella
non è un array. Le scrive `flattenDB()` e le toglie `nestDB()`.

| Colonna | Su quali tabelle | Perché |
|---|---|---|
| `pos int` | ogni tabella figlia, e le radice | Gli array JSON sono ordinati, le righe di una tabella no. Senza, l'ordine dei componenti di una distinta e delle righe di un ordine si rimescola a ogni pull. Su una richiesta d'offerta stampata si vede subito; in una distinta è peggio, perché non si vede. |
| `parent_id uuid` | ogni tabella figlia | La chiave che riporta la riga al suo documento. |
| `id` costruito | `item_components`, `item_operations`, `item_cycle_rows` | Quelle righe non hanno un id proprio: in locale la loro identità è la posizione. La chiave si costruisce deterministica (`itemId#array#pos`) — **non è un'identità stabile nel tempo**, e non pretende di esserlo: quelle tre tabelle si sincronizzano sostituendo l'insieme intero, proprio perché un'identità di riga lì non esiste. |
| `child_sets text` | ogni tabella radice con figli | Distingue un array figlio **vuoto** da uno **assente**, differenza che «nessuna riga» non sa esprimere. Non è una sottigliezza: un assieme con la distinta svuotata a mano ha `components: []`, un commerciale non ha `components` affatto. Se al pull l'assieme si ritrovasse senza il campo, `saveNewComponent()` lancerebbe al primo componente aggiunto. |

## Politica di merge, per tabella

La decisione centrale della sincronizzazione, e non può essere la stessa per
tutti. Sta nel registro (`SCHEMA` in `store.js`) ed è verificata in
`test/sync.test.js`.

**Merge per riga** — `item_prices`, `rfq_lines`, `order_lines`,
`production_plan_lines`, `sub_families`. Righe con identità propria, dove
l'aggiunta concorrente **è lo scenario normale, non un conflitto**: due colleghi
che registrano una quotazione sullo stesso articolo hanno due id diversi e
sopravvivono entrambe. Il conflitto vero è altrove, su `items.active_price_id`:
è un campo scalare del padre, lì vince l'ultimo che salva e **l'utente va
avvisato**, perché con il prezzo in uso cambia il costo di ogni distinta a monte.

**Sostituzione dell'insieme** — `item_components`, `item_operations`,
`item_cycle_rows`. L'array *è* la definizione dell'oggetto: metà distinta di uno
e metà dell'altro è un prodotto che nessuno ha progettato, e mezzo ciclo di
lavorazione è un costo sbagliato che nessuno verifica. L'ultimo che salva
sostituisce l'insieme intero per quel padre, e l'altro riceve un avviso. Da
implementare come **una RPC transazionale** `save_item(jsonb, expected_updated_at)`
con controllo ottimistico: è il controllo ottimistico a rendere la sostituzione
sicura invece che pericolosa.

**Il cestino non è un tombstone**, e i due non vanno confusi: `trash` serve
all'utente che si è pentito, il tombstone serve al protocollo per far sapere
all'altro client che una riga è sparita. Servono entrambi, e per motivi diversi.
Ripristinare dal cestino, lato sync, è un inserimento nuovo con lo stesso id —
il che richiede che il tombstone sia superabile da un `updated_at` più recente,
altrimenti il ripristino verrebbe cancellato di nuovo al pull successivo.

## Cancellazioni: servono i tombstone

Verificato in `test/sync.test.js`: un invio di soli upsert **non può esprimere
una cancellazione** — l'assenza di una riga non è un'informazione, e ciò che un
utente cancella riappare al pull successivo. È il difetto più insidioso della
migrazione, perché non somiglia a un errore: somiglia a un collega distratto che
ha rimesso dentro qualcosa.

Serve `deleted_at` su ogni tabella sincronizzata per riga. Va deciso anche cosa
vince fra cancellazione e modifica concorrente: oggi i test fissano
**cancellazione**, perché un articolo mezzo cancellato non esiste. Che sia la
scelta giusta è discutibile; che debba essere una scelta esplicita, e non l'esito
casuale di chi arriva per primo, no.

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

Dalla 0.24.0 il seam esiste: `Store.adapter` è sostituibile, e il contratto è
volutamente minimo — leggi una stringa, scrivine una, dimmi quanto occupa —
perché è tutto ciò che `Store` usa davvero.

```js
const LocalAdapter = { name, read(), write(payload), size() };
Store.adapter = unAltroAdapter;              // unico punto da cui passa la destinazione dei dati

Store.pendingChanges()    // { items: { upsert: [id…], remove: [id…] }, …, settings: true }
Store.markSynced()        // riallinea dopo un invio riuscito
Store.schema()            // il registro: collezioni, figli, politica di merge
```

Gli errori **non** si gestiscono nell'adapter: lascia passare l'eccezione e
`Store.commit()` la classifica (quota esaurita, salvataggio non disponibile,
dati non serializzabili). Così la classificazione resta in un punto solo,
qualunque sia la destinazione dei dati.

### Sul «Fase 1: il blob su una tabella»

Era la proposta di questo documento fino alla 0.23.0. **Come sincronizzazione è
un vicolo cieco, e va detto invece che scoperto a metà strada:** con un blob
unico il last-writer-wins non è sul record ma sull'**intero database**, e la
perdita è silenziosa — chi salva per secondo non ha modo di accorgersi di aver
cancellato tre ore di lavoro di un collega. In più il salvataggio parte a ogni
gesto banale (rinominare un articolo, cambiare una quantità): sarebbero decine
di caricamenti da megabyte per sessione, per un dato che il server non può
comunque interrogare.

Resta utile con un altro nome: **backup cloud versionato**. Tabella append-only
`(team_id, version, payload, created_by, created_at)`, invio esplicito con
controllo di versione, ripristino con conferma distruttiva riusando
`Store.importSnapshot()` — che già valida il file e migra i formati vecchi. Costa
poco, dà subito una cosa che oggi non c'è (uno storico fuori dal browser) e
valida tutta la plumbing di rete. Ma non va mai presentato come «adesso
lavoriamo in squadra».

### Il vero percorso

1. **Sola lettura**: schema SQL, RLS, `CloudAdapter.read()` → `nestDB()`. Valida
   la mappatura su dati veri senza poter rompere niente.
2. **Scritture**: `db` resta la cache autorevole per l'interfaccia e
   `Store.commit()` resta sincrono — zero `async` nelle viste, nessuno dei
   `saveDB()` cambia. localStorage non viene sostituito: viene **retrocesso a
   specchio locale e coda offline**. Il salvataggio accoda, un flusher con
   debounce drena. Più tombstone, RPC `save_item` per gli insiemi atomici, e
   l'indicatore delle modifiche non inviate.
3. **Pull**: polling ogni 20-30 s, al ritorno sulla finestra e dopo ogni invio
   riuscito — prima di Realtime, che aggiunge riconnessione, rinnovo del token e
   ordinamento degli eventi per un vantaggio che in una squadra piccola non si
   percepisce. L'applicazione di un pull va rinviata finché c'è una scheda aperta
   con un form a metà.
4. **Autenticazione** (vedi sopra).

## Deploy

Il frontend è statico (nessun build): pubblicabile così com'è su **GitHub Pages** o
**Cloudflare Pages** (branch `main`, root `/`). Il contesto HTTPS garantisce `crypto.randomUUID`.
