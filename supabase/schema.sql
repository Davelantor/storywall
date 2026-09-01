-- ===========================================================================
-- NORDEEP Opportunity Wall - schema, indexes and row-level security
-- ---------------------------------------------------------------------------
-- Run this once against a fresh Supabase project:
--   Supabase Dashboard -> SQL Editor -> paste -> Run
-- or:  supabase db execute --file supabase/schema.sql
--
-- Security model
--   anon / authenticated : may SELECT only rows with status = 'approved'
--                          may INSERT only rows with status = 'pending'
--                          may not UPDATE or DELETE at all
--   service_role         : bypasses RLS; used exclusively by /admin server code
-- ===========================================================================

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists pg_trgm;    -- fast ILIKE for free-text search

-- --------------------------------------------------------------------------
-- Enums
-- --------------------------------------------------------------------------
do $$ begin
  create type public.opportunity_type as enum (
    'job_opening',
    'co_founder',
    'pilot_partnership',
    'talent_available',
    'research_collaboration'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.work_mode as enum ('on_site', 'hybrid', 'remote');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.opportunity_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

-- --------------------------------------------------------------------------
-- Table
-- --------------------------------------------------------------------------
create table if not exists public.opportunities (
  id            uuid primary key default gen_random_uuid(),

  title         text not null check (char_length(title) between 1 and 70),
  organisation  text not null check (char_length(organisation) between 1 and 50),
  type          public.opportunity_type not null,
  detail        text not null check (char_length(detail) between 1 and 280),
  tags          text[] not null default '{}'::text[]
                  check (coalesce(array_length(tags, 1), 0) <= 4),

  location      text check (location is null or char_length(location) <= 60),
  work_mode     public.work_mode,

  contact_email text check (contact_email is null or char_length(contact_email) <= 120),
  contact_url   text check (contact_url is null or contact_url ~* '^https?://'),
  contact_note  text check (contact_note is null or char_length(contact_note) <= 80),
  jd_url        text check (jd_url is null or jd_url ~* '^https?://'),

  status        public.opportunity_status not null default 'pending',
  created_at    timestamptz not null default now(),
  approved_at   timestamptz,

  -- Denormalised haystack for the Board search bar. Covers title, organisation,
  -- detail and tags in one trigram-indexed column.
  search_blob   text generated always as (
                  title || ' ' || organisation || ' ' || detail || ' ' ||
                  array_to_string(tags, ' ') || ' ' || coalesce(location, '')
                ) stored,

  -- Every post must carry at least one route back to the poster.
  constraint opportunities_contact_present check (
    contact_email is not null or contact_url is not null or contact_note is not null
  )
);

-- --------------------------------------------------------------------------
-- Indexes
-- --------------------------------------------------------------------------
create index if not exists opportunities_public_feed_idx
  on public.opportunities (status, created_at desc);

create index if not exists opportunities_organisation_idx
  on public.opportunities (status, lower(organisation));

create index if not exists opportunities_type_idx
  on public.opportunities (type);

create index if not exists opportunities_tags_idx
  on public.opportunities using gin (tags);

create index if not exists opportunities_search_idx
  on public.opportunities using gin (search_blob gin_trgm_ops);

-- --------------------------------------------------------------------------
-- Keep approved_at honest, whoever writes the row
-- --------------------------------------------------------------------------
create or replace function public.set_approved_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'approved' and (old.status is distinct from 'approved') then
    new.approved_at := now();
  elsif new.status <> 'approved' then
    new.approved_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists opportunities_set_approved_at on public.opportunities;
create trigger opportunities_set_approved_at
  before insert or update on public.opportunities
  for each row execute function public.set_approved_at();

-- --------------------------------------------------------------------------
-- Row-level security
-- --------------------------------------------------------------------------
alter table public.opportunities enable row level security;
-- Belt and braces: also applies the policies to the table owner.
alter table public.opportunities force row level security;

drop policy if exists "approved posts are world readable" on public.opportunities;
create policy "approved posts are world readable"
  on public.opportunities
  for select
  to anon, authenticated
  using (status = 'approved');

drop policy if exists "anyone may submit, always as pending" on public.opportunities;
create policy "anyone may submit, always as pending"
  on public.opportunities
  for insert
  to anon, authenticated
  with check (status = 'pending' and approved_at is null);

-- No UPDATE or DELETE policy exists for anon/authenticated, so those are denied.
-- Moderation runs through service_role, which bypasses RLS.

-- --------------------------------------------------------------------------
-- Grants. RLS narrows these further; without the grant the policy never runs.
-- --------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert on public.opportunities to anon, authenticated;

-- --------------------------------------------------------------------------
-- Realtime (optional). Lets the wall subscribe instead of polling.
-- --------------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.opportunities;
exception when duplicate_object then null; end $$;
