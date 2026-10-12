-- ═══════════════════════════════════════════════════════════
--  BOMTRACK — schema del database condiviso (Supabase / Postgres 15+)
-- ═══════════════════════════════════════════════════════════
-- Il contratto è docs/cloud-schema.md; i nomi e i tipi delle colonne sono
-- quelli che produce dbVersoCloud() in cloud-map.js. test/schema-sql.test.js
-- verifica che i due non si allontanino: ogni colonna che l'app invia esiste
-- qui, con un tipo compatibile, e ogni tabella del registro SCHEMA ha la sua.
-- Con un Postgres a disposizione (variabile BOMTRACK_PG) lo stesso test carica
-- questo file, ci spinge dentro un database intero e lo rilegge.
--
-- Tre decisioni reggono tutto il resto.
--
-- 1. **Le chiavi esterne sono differite** (`deferrable initially deferred`).
--    Il modello ha riferimenti circolari — `items.active_price_id` punta a
--    `item_prices`, che punta a `items`; una distinta cita articoli che
--    arrivano nello stesso invio — e con vincoli immediati l'ordine degli
--    inserimenti diventerebbe un problema da risolvere a ogni invio. Differite,
--    si controllano tutte insieme al commit: l'ordine non conta, l'integrità sì.
--
-- 2. **Si scrive solo attraverso push_changes()**, una funzione: una
--    transazione sola per tutto ciò che il client manda. Una dichiarazione di
--    produzione e i movimenti che genera, il lancio di un ODP con l'ODL e le
--    uscite di materiale, l'eliminazione di un ODP con le sue dichiarazioni: in
--    locale sono un commit(), qui sono un invio, e un invio entra intero o non
--    entra. Non servono RPC per operazione — `declare_progress`,
--    `launch_odp` — purché il client non spezzi mai un lotto di
--    Store.takeChanges(): è quel lotto l'unità atomica.
--
-- 3. **Che cosa può citare che cosa lo decide l'app.** Dove l'app impedisce di
--    eliminare un record citato (fornitori, articoli, famiglie, commesse,
--    documenti d'archivio: supplierUses, isItemUsedAnywhere…) la chiave è
--    `no action`, e una violazione è un difetto dell'app che il commit rifiuta.
--    Dove l'app elimina liberamente un documento citato da un altro per sola
--    tracciabilità (rfq_id, plan_id, odp_id…) la chiave è `set null`, come la
--    lettura locale «best effort». I riferimenti polimorfi (order_id dei
--    movimenti e dei ricevimenti: un ODA, un ODL o un ODP) non hanno chiave.

set client_min_messages = warning;   -- i «drop … if exists» di un secondo caricamento non sono notizie

-- ─── Registro delle tabelle sincronizzate ───────────────────
-- Lo specchio SQL di SCHEMA in store.js: quale tabella, figlia di chi, con che
-- politica di merge. push_changes() e pull_changes() accettano solo nomi che
-- stanno qui — sono nomi usati in SQL dinamico — e il test verifica che il
-- registro dica le stesse cose di SCHEMA.
create table if not exists public.sync_tables (
  tab text primary key,
  parent_tab text,
  parent_col text,
  merge text not null check (merge in ('root', 'row', 'replace'))
);

-- Lapidi: le cancellazioni, perché un invio di soli upsert non le sa esprimere
-- e ciò che uno cancella riapparirebbe al pull dell'altro. Una lapide cede solo
-- a un record con updated_at più recente (un ripristino dal cestino).
create table if not exists public.sync_tombstones (
  tab text not null,
  id text not null,
  deleted_at timestamptz not null default clock_timestamp(),
  deleted_by uuid,
  synced_at timestamptz not null default clock_timestamp(),
  primary key (tab, id)
);

-- Le impostazioni del team: un oggetto solo, senza updated_at proprio in
-- locale. Una riga, sovrascritta per intero.
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz,
  updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);

-- ─── Anagrafiche ────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade deferrable initially deferred,
  name text, username text, email text,
  role text check (role in ('admin', 'acquisti', 'progettazione', 'lettore')),
  color text, active boolean,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);

create table if not exists public.suppliers (
  id uuid primary key,
  name text, referente text, email text, phone text, vat text,
  street text, street_number text, zip text, city text, province text, country text,
  default_transport text, default_payment text, notes text, active boolean,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);

create table if not exists public.customers (
  id uuid primary key,
  name text, referente text, email text, phone text, vat text,
  street text, street_number text, zip text, city text, province text, country text,
  notes text, active boolean,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);

create table if not exists public.work_centers (
  id uuid primary key,
  name text, hourly_rate numeric, capacity_hours numeric, active boolean, child_sets text,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);

create table if not exists public.work_center_suppliers (
  id uuid primary key,
  work_center_id uuid not null references public.work_centers(id) on delete cascade deferrable initially deferred,
  supplier_id uuid references public.suppliers(id) deferrable initially deferred,
  rate numeric, note text,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);

create table if not exists public.families (
  id uuid primary key,
  name text, kind text, sigla text, child_sets text,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);

create table if not exists public.sub_families (
  id uuid primary key,
  family_id uuid not null references public.families(id) on delete cascade deferrable initially deferred,
  name text, sigla text,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);

create table if not exists public.jobs (
  id uuid primary key,
  number text, customer text, title text, customer_ref text, status text,
  date date, due_date date, notes text, active boolean,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);

-- ─── Articoli ───────────────────────────────────────────────
create table if not exists public.items (
  id uuid primary key,
  code text, name text, type text, uom text, notes text,
  active boolean, favorite boolean, obsolete boolean,
  unit_cost numeric, purchase_price numeric,
  supplier_id uuid references public.suppliers(id) deferrable initially deferred,
  supplier_code text, supplier_desc text,
  active_price_id uuid,   -- chiave aggiunta sotto, dopo item_prices
  sourcing text,
  family_id uuid references public.families(id) deferrable initially deferred,
  sub_family_id uuid references public.sub_families(id) deferrable initially deferred,
  machine_item_id uuid references public.items(id) deferrable initially deferred,
  group_item_id uuid references public.items(id) deferrable initially deferred,
  sigla text, overhead_pct_override numeric, margin_pct_override numeric,
  alt_uom text, alt_factor numeric,
  concept_id text, name_free text, g_code_len int, g_code_type text, incr_digits_n int, incr_digits_s int,
  rev text, lot_size numeric, lot_mode text, safety_stock numeric,
  child_sets text,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);
-- A6: `unique (code)` va aggiunto dopo la bonifica dei duplicati storici
-- (Gestione › Backup › codici duplicati). Prima, rifiuterebbe dati veri.

-- Le tre tabelle «replace»: l'insieme è la definizione dell'articolo, le righe
-- non hanno identità propria e la chiave è costruita (testo). Si riscrivono
-- in blocco per padre, e non hanno date proprie: vale quella del padre.
create table if not exists public.item_components (
  id text primary key,
  item_id uuid not null references public.items(id) on delete cascade deferrable initially deferred,
  child_item_id uuid references public.items(id) deferrable initially deferred,
  qty numeric, scrap_pct numeric, pos int,
  synced_at timestamptz not null default clock_timestamp()
);

create table if not exists public.item_operations (
  id text primary key,
  item_id uuid not null references public.items(id) on delete cascade deferrable initially deferred,
  work_center_id uuid references public.work_centers(id) deferrable initially deferred,
  hours numeric, note text, pos int,
  synced_at timestamptz not null default clock_timestamp()
);

create table if not exists public.item_cycle_rows (
  id text primary key,
  item_id uuid not null references public.items(id) on delete cascade deferrable initially deferred,
  kind text check (kind in ('item', 'op')),
  child_item_id uuid references public.items(id) deferrable initially deferred,
  qty numeric, cost_override numeric,
  work_center_id uuid references public.work_centers(id) deferrable initially deferred,
  supplier_id uuid references public.suppliers(id) deferrable initially deferred,
  cost_mode text, hours numeric, days numeric, rate numeric, cost numeric, note text, pos int,
  synced_at timestamptz not null default clock_timestamp()
);

-- ─── Documenti ──────────────────────────────────────────────
create table if not exists public.production_plans (
  id uuid primary key,
  number text, title text, date date, due_date date, notes text,
  job_id uuid references public.jobs(id) deferrable initially deferred,
  active boolean, child_sets text,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);

create table if not exists public.production_plan_lines (
  id uuid primary key,
  plan_id uuid not null references public.production_plans(id) on delete cascade deferrable initially deferred,
  item_id uuid references public.items(id) deferrable initially deferred,
  qty numeric, due_date date,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);

create table if not exists public.rfqs (
  id uuid primary key,
  number text, title text, date date, status text,
  supplier_id uuid references public.suppliers(id) deferrable initially deferred,
  transport text, payment text,
  plan_id uuid references public.production_plans(id) on delete set null deferrable initially deferred,
  job_id uuid references public.jobs(id) deferrable initially deferred,
  notes text, notes_internal text, active boolean, child_sets text,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);

create table if not exists public.rfq_lines (
  id uuid primary key,
  rfq_id uuid not null references public.rfqs(id) on delete cascade deferrable initially deferred,
  item_id uuid references public.items(id) deferrable initially deferred,
  phase_key text, phase_keys text,
  code text, description text, uom text, qty numeric, price numeric,
  delivery_date date, confirmed_date date, note text,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);

create table if not exists public.item_prices (
  id uuid primary key,
  item_id uuid not null references public.items(id) on delete cascade deferrable initially deferred,
  supplier_id uuid references public.suppliers(id) deferrable initially deferred,
  price numeric, min_qty numeric, lead_days numeric, price_uom text,
  code text, description text, date date,
  rfq_id uuid references public.rfqs(id) on delete set null deferrable initially deferred,
  line_id uuid, note text,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);
-- La stessa offerta registrata due volte non crea due quotazioni (rfqRecordPrices).
create unique index if not exists item_prices_offerta on public.item_prices (item_id, rfq_id, line_id)
  where rfq_id is not null and line_id is not null;

do $$ begin
  alter table public.items add constraint items_active_price_fk foreign key (active_price_id)
    references public.item_prices(id) on delete set null deferrable initially deferred;
exception when duplicate_object then null; end $$;

create table if not exists public.orders (
  id uuid primary key,
  number text, title text, date date, status text,
  supplier_id uuid references public.suppliers(id) deferrable initially deferred,
  transport text, payment text,
  rfq_id uuid references public.rfqs(id) on delete set null deferrable initially deferred,
  plan_id uuid references public.production_plans(id) on delete set null deferrable initially deferred,
  job_id uuid references public.jobs(id) deferrable initially deferred,
  supplier_confirmation text, notes text, notes_internal text, active boolean, child_sets text,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);

-- Nessuna colonna `received`: è la somma di order_receipts (vista più sotto).
create table if not exists public.order_lines (
  id uuid primary key,
  order_id uuid not null references public.orders(id) on delete cascade deferrable initially deferred,
  item_id uuid references public.items(id) deferrable initially deferred,
  phase_key text, phase_keys text,
  code text, description text, uom text, qty numeric, price numeric,
  delivery_date date, confirmed_date date, note text,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp(),
  -- Riga di conto lavoro: mai un articolo, o il magazzino conterebbe due volte.
  constraint order_lines_cl_senza_articolo check (phase_key is null or item_id is null)
);

create table if not exists public.production_orders (
  id uuid primary key,
  number text,
  item_id uuid references public.items(id) deferrable initially deferred,
  code text, name text, uom text, qty numeric, date date, due_date date, status text,
  title text, notes text, notes_internal text,
  plan_id uuid references public.production_plans(id) on delete set null deferrable initially deferred,
  job_id uuid references public.jobs(id) on delete set null deferrable initially deferred,
  active boolean, child_sets text,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);

create table if not exists public.production_order_phases (
  id uuid primary key,
  production_order_id uuid not null references public.production_orders(id) on delete cascade deferrable initially deferred,
  seq int, op_index int, phase_key text,
  work_center_id uuid references public.work_centers(id) deferrable initially deferred,
  wc_name text,
  supplier_id uuid references public.suppliers(id) deferrable initially deferred,
  supplier_name text, run_from int, run_to int, passata int,
  cost_mode text, hours numeric, days numeric, rate numeric, cost numeric, note text,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);

create table if not exists public.production_order_materials (
  id uuid primary key,
  production_order_id uuid not null references public.production_orders(id) on delete cascade deferrable initially deferred,
  item_id uuid references public.items(id) deferrable initially deferred,
  code text, name text, uom text, per_pezzo numeric, qty numeric,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);

create table if not exists public.work_orders (
  id uuid primary key,
  number text, title text, date date, status text,
  supplier_id uuid references public.suppliers(id) deferrable initially deferred,
  transport text, payment text,
  rfq_id uuid references public.rfqs(id) on delete set null deferrable initially deferred,
  plan_id uuid references public.production_plans(id) on delete set null deferrable initially deferred,
  job_id uuid references public.jobs(id) deferrable initially deferred,
  odp_id uuid references public.production_orders(id) on delete set null deferrable initially deferred,
  supplier_confirmation text, notes text, notes_internal text, active boolean, child_sets text,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);

create table if not exists public.work_order_lines (
  id uuid primary key,
  work_order_id uuid not null references public.work_orders(id) on delete cascade deferrable initially deferred,
  item_id uuid,
  phase_key text, phase_keys text,
  code text, description text, uom text, qty numeric, price numeric,
  delivery_date date, confirmed_date date, note text,
  odp_id uuid references public.production_orders(id) on delete set null deferrable initially deferred,
  odp_phase_id uuid references public.production_order_phases(id) on delete set null deferrable initially deferred,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp(),
  -- Un ODL manda pezzi a lavorare, non compra merce: nessuna riga ha un articolo.
  constraint work_order_lines_mai_articolo check (item_id is null)
);

-- ─── Eventi ─────────────────────────────────────────────────
-- Righe piatte, che si aggiungono e non si correggono: la giacenza, il
-- ricevuto e l'avanzamento sono somme di queste, mai colonne scrivibili.
-- `date` qui è l'istante dell'evento, non un giorno di calendario.
create table if not exists public.production_declarations (
  id uuid primary key,
  odp_id uuid references public.production_orders(id) on delete cascade deferrable initially deferred,
  phase_id uuid references public.production_order_phases(id) on delete set null deferrable initially deferred,
  kind text, date timestamptz, qty numeric, scrap numeric, note text, motivo text,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);

create table if not exists public.stock_movements (
  id uuid primary key,
  item_id uuid references public.items(id) deferrable initially deferred,
  kind text, qty numeric, date timestamptz, note text,
  supplier_id uuid references public.suppliers(id) deferrable initially deferred,
  from_supplier_id uuid references public.suppliers(id) deferrable initially deferred,
  order_id uuid,   -- ODA, ODL o ODP: polimorfo, nessuna chiave
  line_id uuid,
  decl_id uuid references public.production_declarations(id) on delete set null deferrable initially deferred,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp(),
  -- Fra due terzisti il pezzo passa sempre da noi: un passaggio ha un estremo nullo.
  constraint stock_movements_clstep check (kind is distinct from 'clStep' or supplier_id is null or from_supplier_id is null)
);

create table if not exists public.order_receipts (
  id uuid primary key,
  coll text check (coll in ('orders', 'workOrders')),
  order_id uuid,   -- un ODA o un ODL, secondo `coll`: nessuna chiave
  line_id uuid,
  qty numeric, kind text, date date, note text,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);

create table if not exists public.productions (
  id uuid primary key,
  plan_id uuid references public.production_plans(id) on delete set null deferrable initially deferred,
  item_id uuid references public.items(id) deferrable initially deferred,
  qty numeric, date timestamptz, note text,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);

create table if not exists public.item_revisions (
  id uuid primary key,
  item_id uuid references public.items(id) deferrable initially deferred,
  rev text, date timestamptz, motivo text, snapshot jsonb,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);

-- ─── Allegati, promemoria, cestino ──────────────────────────
create table if not exists public.attachment_docs (
  id uuid primary key,
  path text, description text,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);

create table if not exists public.attachments (
  id uuid primary key,
  item_id uuid references public.items(id) deferrable initially deferred,
  doc_id uuid references public.attachment_docs(id) deferrable initially deferred,
  page int, name text, mime text, size numeric,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);

create table if not exists public.reminders (
  id uuid primary key,
  date date, title text, notes text, gravita text, done boolean, done_at timestamptz,
  job_id uuid references public.jobs(id) on delete set null deferrable initially deferred,
  active boolean,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);

create table if not exists public.trash (
  id uuid primary key,
  coll text, deleted_at timestamptz, deleted_by uuid, record jsonb,
  pos int,
  synced_at timestamptz not null default clock_timestamp()
);

-- ─── Letture ricavate ───────────────────────────────────────
create or replace view public.order_line_received with (security_invoker = true) as
  select line_id, coll, sum(qty) as received from public.order_receipts group by line_id, coll;

-- ─── Registro ───────────────────────────────────────────────
insert into public.sync_tables (tab, parent_tab, parent_col, merge) values
  ('profiles', null, null, 'root'),
  ('suppliers', null, null, 'root'),
  ('customers', null, null, 'root'),
  ('work_centers', null, null, 'root'),
  ('work_center_suppliers', 'work_centers', 'work_center_id', 'row'),
  ('families', null, null, 'root'),
  ('sub_families', 'families', 'family_id', 'row'),
  ('jobs', null, null, 'root'),
  ('items', null, null, 'root'),
  ('item_components', 'items', 'item_id', 'replace'),
  ('item_operations', 'items', 'item_id', 'replace'),
  ('item_cycle_rows', 'items', 'item_id', 'replace'),
  ('item_prices', 'items', 'item_id', 'row'),
  ('production_plans', null, null, 'root'),
  ('production_plan_lines', 'production_plans', 'plan_id', 'row'),
  ('rfqs', null, null, 'root'),
  ('rfq_lines', 'rfqs', 'rfq_id', 'row'),
  ('orders', null, null, 'root'),
  ('order_lines', 'orders', 'order_id', 'row'),
  ('production_orders', null, null, 'root'),
  ('production_order_phases', 'production_orders', 'production_order_id', 'row'),
  ('production_order_materials', 'production_orders', 'production_order_id', 'row'),
  ('work_orders', null, null, 'root'),
  ('work_order_lines', 'work_orders', 'work_order_id', 'row'),
  ('production_declarations', null, null, 'root'),
  ('stock_movements', null, null, 'root'),
  ('order_receipts', null, null, 'root'),
  ('productions', null, null, 'root'),
  ('item_revisions', null, null, 'root'),
  ('attachment_docs', null, null, 'root'),
  ('attachments', null, null, 'root'),
  ('reminders', null, null, 'root'),
  ('trash', null, null, 'root')
on conflict (tab) do update set parent_tab = excluded.parent_tab, parent_col = excluded.parent_col, merge = excluded.merge;

-- ─── synced_at: l'ora del server, per il pull ───────────────
-- updated_at è l'ora del client e decide chi vince; synced_at è quella del
-- server e decide che cosa un altro client non ha ancora visto. Sono due
-- domande diverse: un client con l'orologio indietro scrive un updated_at
-- vecchio, ma la sua riga va comunque mandata a chi fa pull dopo.
create or replace function public.sync_stamp() returns trigger language plpgsql as $$
begin
  new.synced_at := clock_timestamp();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array (select array_agg(tab) from public.sync_tables) || array['settings'] loop
    execute format('drop trigger if exists sync_stamp on public.%I', t);
    execute format('create trigger sync_stamp before insert or update on public.%I for each row execute function public.sync_stamp()', t);
  end loop;
end $$;

-- ─── Invio ──────────────────────────────────────────────────
-- payload = {
--   "upsert":   { tabella: [righe di dbVersoCloud] },
--   "remove":   { tabella: [id] },
--   "settings": { "data": {...}, "updated_at": "...", "updated_by": "..." }   -- facoltativo
-- }
-- Tutto in una transazione: se una riga viola un vincolo, non entra niente.
--
-- Regole:
--  - root e row: last-write-wins su updated_at. Una riga più vecchia di quella
--    che c'è non passa, e torna in `rejected` — l'app deve dirlo all'utente.
--  - replace: per ogni padre **accettato** in questo invio, l'insieme dei figli
--    si sostituisce con quello inviato, vuoto compreso. Il client manda sempre
--    l'insieme completo di ogni padre che invia (dbVersoCloud lo fa). Un padre
--    respinto si porta dietro i suoi figli.
--  - remove: cancella e lascia una lapide. La cancellazione vince su una
--    modifica concorrente (test/sync.test.js), ma cede a un updated_at più
--    recente della lapide: è il ripristino dal cestino.
--  - un campo che la tabella non ha ferma l'invio: jsonb_populate_recordset lo
--    ignorerebbe in silenzio, e un dato perso in silenzio è il peggiore.
create or replace function public.push_changes(payload jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  reg record;
  righe jsonb;
  agg text;
  datata boolean;
  sconosciuti text;
  applicati text[];
  dati text[];
  respinti jsonb := '[]'::jsonb;
  conteggio jsonb := '{}'::jsonb;
  accettati jsonb := '{}'::jsonb;   -- tabella → [id accettati], per i figli replace
  padri text[];
  ids text[];
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'push_changes: payload mancante';
  end if;
  -- Nomi di tabella: solo quelli del registro.
  select string_agg(k, ', ') into sconosciuti
    from (select jsonb_object_keys(coalesce(payload->'upsert', '{}')) k
          union select jsonb_object_keys(coalesce(payload->'remove', '{}'))) x
    where k not in (select tab from sync_tables);
  if sconosciuti is not null then
    raise exception 'push_changes: tabelle sconosciute: %', sconosciuti;
  end if;

  -- Upsert: prima le radici, poi le figlie per riga, poi le sostituzioni.
  for reg in
    select s.* from sync_tables s
    where payload->'upsert' ? s.tab
    order by case s.merge when 'root' then 0 when 'row' then 1 else 2 end, s.tab
  loop
    righe := payload->'upsert'->reg.tab;
    if jsonb_typeof(righe) <> 'array' then
      raise exception 'push_changes: % non è un elenco', reg.tab;
    end if;

    select string_agg(distinct k, ', ') into sconosciuti
      from jsonb_array_elements(righe) e, jsonb_object_keys(e) k
      where k not in (select a.attname from pg_attribute a
                      where a.attrelid = ('public.' || reg.tab)::regclass and a.attnum > 0 and not a.attisdropped);
    if sconosciuti is not null then
      raise exception 'push_changes: %: colonne inesistenti: %', reg.tab, sconosciuti;
    end if;

    select string_agg(format('%I = excluded.%I', a.attname, a.attname), ', ' order by a.attnum),
           bool_or(a.attname = 'updated_at')
      into agg, datata
      from pg_attribute a
      where a.attrelid = ('public.' || reg.tab)::regclass and a.attnum > 0 and not a.attisdropped
        and a.attname not in ('id', 'synced_at');

    select coalesce(array_agg(e->>'id'), '{}') into dati from jsonb_array_elements(righe) e;

    if reg.merge = 'replace' then
      -- Solo i figli dei padri accettati in questo invio.
      select coalesce(array_agg(x), '{}') into padri
        from jsonb_array_elements_text(coalesce(accettati->reg.parent_tab, '[]')) x;
      execute format('delete from public.%I where %I::text = any($1)', reg.tab, reg.parent_col) using padri;
      execute format(
        'insert into public.%I select * from jsonb_populate_recordset(null::public.%I, $1) r where r.%I::text = any($2)',
        reg.tab, reg.tab, reg.parent_col)
        using righe, padri;
      execute format(
        'select coalesce(array_agg(e->>''id''), ''{}'') from jsonb_array_elements($1) e where (e->>%L) = any($2)',
        reg.parent_col) into applicati using righe, padri;
    elsif not datata then
      -- Senza updated_at (il cestino) non c'è niente da confrontare: vince chi invia.
      execute format(
        'insert into public.%I select * from jsonb_populate_recordset(null::public.%I, $1)
           on conflict (id) do update set %s',
        reg.tab, reg.tab, agg) using righe;
      applicati := dati;
    else
      execute format($q$
        insert into public.%1$I
        select s.* from jsonb_populate_recordset(null::public.%1$I, $1) s
        where not exists (select 1 from public.sync_tombstones t
                          where t.tab = %2$L and t.id = s.id::text
                            and t.deleted_at >= coalesce(s.updated_at, '-infinity'::timestamptz))
        on conflict (id) do update set %3$s
          where public.%1$I.updated_at is null
             or excluded.updated_at >= public.%1$I.updated_at
      $q$, reg.tab, reg.tab, agg)
      using righe;
      -- Chi è passato: le righe che ora portano l'updated_at inviato. Una
      -- respinta (più vecchia, o sotto una lapide) ne ha un altro, o non c'è.
      execute format(
        'select coalesce(array_agg(r.id::text), ''{}'') from jsonb_populate_recordset(null::public.%I, $1) r
           join public.%I t on t.id = r.id
          where t.updated_at is not distinct from r.updated_at',
        reg.tab, reg.tab) into applicati using righe;
      -- Un ripristino più recente della lapide la toglie.
      delete from sync_tombstones t where t.tab = reg.tab and t.id = any(applicati);
    end if;

    accettati := accettati || jsonb_build_object(reg.tab, to_jsonb(applicati));
    conteggio := conteggio || jsonb_build_object(reg.tab, coalesce(array_length(applicati, 1), 0));
    select respinti || coalesce(jsonb_agg(jsonb_build_object('tab', reg.tab, 'id', d)), '[]')
      into respinti
      from unnest(dati) d where d is not null and not (d = any(applicati));
  end loop;

  -- Cancellazioni, con la lapide.
  for reg in select s.* from sync_tables s where payload->'remove' ? s.tab loop
    select coalesce(array_agg(x), '{}') into ids from jsonb_array_elements_text(payload->'remove'->reg.tab) x;
    execute format('delete from public.%I where id::text = any($1)', reg.tab) using ids;
    insert into sync_tombstones (tab, id, deleted_by)
      select reg.tab, x, auth.uid() from unnest(ids) x
      on conflict (tab, id) do update set deleted_at = clock_timestamp(), deleted_by = excluded.deleted_by;
  end loop;

  if payload ? 'settings' then
    insert into settings (id, data, updated_at, updated_by)
      values (1, coalesce(payload->'settings'->'data', '{}'),
              (payload->'settings'->>'updated_at')::timestamptz,
              (payload->'settings'->>'updated_by')::uuid)
      on conflict (id) do update set data = excluded.data, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  end if;

  -- I vincoli differiti si controllano qui, dentro la funzione: un errore
  -- esce come eccezione di questa chiamata, e la transazione si annulla.
  set constraints all immediate;

  return jsonb_build_object('applied', conteggio, 'rejected', respinti);
end $$;

-- ─── Lettura ────────────────────────────────────────────────
-- Tutto ciò che è cambiato sul server dopo `since` (null = tutto), più le
-- lapidi. Le tabelle replace tornano per padre, intere: un padre cambiato
-- porta con sé l'insieme completo dei figli, così chi legge può sostituirlo.
-- `now` va conservato e ripassato come `since` al giro dopo, meno un margine:
-- una transazione lunga può scrivere un synced_at più vecchio di un pull già
-- fatto. Applicare due volte la stessa riga non costa niente.
create or replace function public.pull_changes(since timestamptz default null)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  reg record;
  tabelle jsonb := '{}'::jsonb;
  righe jsonb;
  lapidi jsonb;
  inizio timestamptz := clock_timestamp();
  dal timestamptz := coalesce(since, '-infinity'::timestamptz);
begin
  for reg in select * from sync_tables loop
    if reg.merge = 'replace' then
      execute format(
        'select coalesce(jsonb_agg(to_jsonb(c) - ''synced_at''), ''[]'') from public.%I c
          where c.%I in (select p.id from public.%I p where p.synced_at > $1)',
        reg.tab, reg.parent_col, reg.parent_tab) into righe using dal;
    else
      execute format(
        'select coalesce(jsonb_agg(to_jsonb(t) - ''synced_at''), ''[]'') from public.%I t where t.synced_at > $1',
        reg.tab) into righe using dal;
    end if;
    tabelle := tabelle || jsonb_build_object(reg.tab, righe);
  end loop;
  select coalesce(jsonb_object_agg(tab, ids), '{}') into lapidi
    from (select tab, jsonb_agg(id) ids from sync_tombstones where synced_at > dal group by tab) x;
  return jsonb_build_object(
    'now', inizio,
    'tables', tabelle,
    'removed', lapidi,
    'settings', (select to_jsonb(s) - 'synced_at' - 'id' from settings s where s.synced_at > dal));
end $$;

-- ─── Accesso ────────────────────────────────────────────────
-- RLS attiva ovunque: una tabella senza RLS in Supabase è leggibile da chiunque
-- abbia la chiave pubblica. La policy qui sotto è **PROVVISORIA** — chiunque
-- sia autenticato legge e scrive tutto — ed è il punto D6 di
-- docs/analisi-tecnica.md: la matrice per ruolo (ROLE_WRITE in core.js) la
-- sostituisce. Le funzioni sono `security invoker`, quindi la rispetteranno
-- senza cambiare.
do $$
declare t text;
begin
  foreach t in array (select array_agg(tab) from public.sync_tables) || array['settings', 'sync_tombstones', 'sync_tables'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists provvisoria_autenticati on public.%I', t);
    execute format('create policy provvisoria_autenticati on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
grant execute on function public.push_changes(jsonb) to authenticated;
grant execute on function public.pull_changes(timestamptz) to authenticated;
