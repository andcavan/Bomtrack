-- Quello che Supabase dà già e un Postgres nudo no: lo schema `auth` con la
-- tabella degli utenti, `auth.uid()` e i due ruoli delle policy. Serve solo a
-- test/schema-sql.test.js per caricare supabase/schema.sql fuori da Supabase.
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
