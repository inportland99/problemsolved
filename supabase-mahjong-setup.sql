-- ============================================================================
-- Mah Jongg Reference Card — schema + RLS
-- ============================================================================
-- Stores a personal transcription of a purchased NMJL card.
--
-- IMPORTANT: the NMJL hand list is copyrighted. Rows here are private to the
-- user who created them (enforced by RLS below) and are never exposed to
-- anonymous visitors. Do not add a public-read policy to this table.
--
-- Safe to re-run.
-- ============================================================================

create table if not exists public.mahjong_hands (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,

  -- Which year's card this hand belongs to (e.g. 2026).
  card_year    int  not null,

  -- Printed section heading, e.g. '2026', '2468', 'LIKE NUMBERS', 'QUINTS',
  -- 'CONSECUTIVE RUN', '13579', 'WINDS - DRAGONS', '369', 'SINGLES AND PAIRS'.
  category     text not null,

  -- Optional note printed under the section heading, e.g. 'Any 3 Suits'.
  category_note text,

  -- Ordering within a category, and of categories on the card.
  category_order int not null default 0,
  sort_order     int not null default 0,

  -- The hand pattern as an ordered array of blocks:
  --   [{ "text": "FF", "group": 0 }, { "text": "2222", "group": 1 }, ...]
  -- group 0 = black (neutral tiles AND the card's third suit color)
  -- group 1 = green, group 2 = red
  pattern_blocks jsonb not null default '[]'::jsonb,

  -- Many card lines print two ways to build the same hand, joined by '-or-'.
  -- When present, this holds the second pattern in the same block format.
  alt_pattern_blocks jsonb,

  -- Denormalized plain-text pattern for search; includes the alt pattern.
  pattern_text text not null default '',

  -- Printed hand value (25, 30, 35, 40, 45, 50, 55, 60, 75, ...).
  value        int  not null,

  -- true  = concealed hand (printed 'C')
  -- false = may be exposed (printed 'X')
  concealed    boolean not null default false,

  -- Personal notes: strategy, how often it has been played, etc.
  notes        text,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists mahjong_hands_user_year_idx
  on public.mahjong_hands (user_id, card_year, category_order, sort_order);

-- ─── updated_at trigger ─────────────────────────────────────────────────────

create or replace function public.mahjong_hands_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists mahjong_hands_updated_at on public.mahjong_hands;
create trigger mahjong_hands_updated_at
  before update on public.mahjong_hands
  for each row
  execute function public.mahjong_hands_set_updated_at();

-- ─── Row Level Security ─────────────────────────────────────────────────────
-- Every policy is scoped to auth.uid() = user_id. There is intentionally no
-- policy granting access to the 'anon' role.

alter table public.mahjong_hands enable row level security;

drop policy if exists "Users can view their own mahjong hands" on public.mahjong_hands;
create policy "Users can view their own mahjong hands"
  on public.mahjong_hands
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own mahjong hands" on public.mahjong_hands;
create policy "Users can insert their own mahjong hands"
  on public.mahjong_hands
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own mahjong hands" on public.mahjong_hands;
create policy "Users can update their own mahjong hands"
  on public.mahjong_hands
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own mahjong hands" on public.mahjong_hands;
create policy "Users can delete their own mahjong hands"
  on public.mahjong_hands
  for delete
  using (auth.uid() = user_id);
