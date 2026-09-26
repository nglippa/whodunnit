-- Whodunnit initial schema.
-- Every row belongs to one auth user; row-level security enforces it.
-- Records are stored as validated JSON payloads keyed by id, which keeps the
-- schema stable while the domain model is young. Promote hot fields to
-- columns when queries need them.

create table if not exists public.documents (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.revisions (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  document_id text not null references public.documents (id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.voiceprints (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.writing_samples (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  voiceprint_id text not null references public.voiceprints (id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists revisions_document_idx on public.revisions (document_id);
create index if not exists samples_voiceprint_idx on public.writing_samples (voiceprint_id);

alter table public.documents enable row level security;
alter table public.revisions enable row level security;
alter table public.voiceprints enable row level security;
alter table public.writing_samples enable row level security;

create policy "own documents" on public.documents for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own revisions" on public.revisions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own voiceprints" on public.voiceprints for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own samples" on public.writing_samples for all using (user_id = auth.uid()) with check (user_id = auth.uid());
