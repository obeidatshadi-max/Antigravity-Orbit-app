-- ═══════════════════════════════════════════════════════════════
-- ANTIGRAVITY FIELD INTELLIGENCE SYSTEM — SUPABASE SCHEMA
-- Run this entire file in your Supabase SQL Editor
-- Project: https://supabase.com → SQL Editor → New Query → Paste → Run
-- ═══════════════════════════════════════════════════════════════

-- Enable UUID extension (already enabled in most Supabase projects)
create extension if not exists "uuid-ossp";

-- ── TABLE 1: PROFILES ──────────────────────────────────────────
-- One row per user. Created after auth, updated on onboarding.
create table if not exists public.profiles (
  id              uuid references auth.users(id) on delete cascade primary key,
  name            text not null default '',
  role            text not null default '',
  sector          text not null default '',
  orbit           text not null default '',  -- Desired Orbit statement
  block           text not null default '',  -- Primary gravitational block
  domain_think    int  not null default 5,   -- Baseline self-rating 1-10
  domain_emot     int  not null default 5,
  domain_behav    int  not null default 5,
  domain_body     int  not null default 5,
  onboarded       boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── TABLE 2: MOMENTS ───────────────────────────────────────────
-- Field Mode (ORBIT) captures — one row per captured moment
create table if not exists public.moments (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  trigger     text not null,
  emotion     text not null,
  thought     text not null,
  insight     text not null default '',   -- AI-generated insight
  persona     text not null default '',   -- Analyst|Achiever|Avoider|Pleaser|Rebel|Controller
  domain      text not null default '',   -- Thinking|Emotional|Behavioral|Physical
  stop_signal text not null default '',   -- Personalized stop signal question
  desire_link text not null default '',   -- Connection to Desired Orbit
  created_at  timestamptz not null default now()
);

-- ── TABLE 3: VOICE SESSIONS ────────────────────────────────────
-- Mirror Mode (Verbal Mirror) sessions — one row per voice analysis
create table if not exists public.voice_sessions (
  id               uuid primary key default uuid_generate_v4(),
  user_id          uuid references auth.users(id) on delete cascade not null,
  transcript       text not null,
  gravity_score    numeric(4,1) not null default 0,  -- 0.0 – 10.0
  mask_score       int not null default 0,            -- 0 – 100
  patterns         jsonb not null default '[]',        -- [{type, example, question}]
  coach_msg        text not null default '',
  dominant_domain  text not null default '',
  gravity_desc     text not null default '',
  mask_desc        text not null default '',
  created_at       timestamptz not null default now()
);

-- ── TABLE 4: STOP SIGNAL LOG ───────────────────────────────────
-- Track which signals fired, which were acted on
create table if not exists public.stop_signals (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  domain      text not null,
  question    text not null,
  acted_on    boolean not null default false,  -- true if user tapped "Log this moment"
  created_at  timestamptz not null default now()
);

-- ═══════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY — users see only their own data
-- ═══════════════════════════════════════════════════════════════

alter table public.profiles      enable row level security;
alter table public.moments       enable row level security;
alter table public.voice_sessions enable row level security;
alter table public.stop_signals  enable row level security;

-- PROFILES policies
create policy "Users can view their own profile"
  on public.profiles for select using (auth.uid() = id);

create policy "Users can insert their own profile"
  on public.profiles for insert with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update using (auth.uid() = id);

-- MOMENTS policies
create policy "Users can view their own moments"
  on public.moments for select using (auth.uid() = user_id);

create policy "Users can insert their own moments"
  on public.moments for insert with check (auth.uid() = user_id);

create policy "Users can delete their own moments"
  on public.moments for delete using (auth.uid() = user_id);

-- VOICE SESSIONS policies
create policy "Users can view their own voice sessions"
  on public.voice_sessions for select using (auth.uid() = user_id);

create policy "Users can insert their own voice sessions"
  on public.voice_sessions for insert with check (auth.uid() = user_id);

-- STOP SIGNALS policies
create policy "Users can view their own stop signals"
  on public.stop_signals for select using (auth.uid() = user_id);

create policy "Users can insert their own stop signals"
  on public.stop_signals for insert with check (auth.uid() = user_id);

create policy "Users can update their own stop signals"
  on public.stop_signals for update using (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════
-- INDEXES — for fast per-user queries sorted by date
-- ═══════════════════════════════════════════════════════════════

create index if not exists moments_user_created
  on public.moments(user_id, created_at desc);

create index if not exists voice_sessions_user_created
  on public.voice_sessions(user_id, created_at desc);

create index if not exists stop_signals_user_created
  on public.stop_signals(user_id, created_at desc);

-- ═══════════════════════════════════════════════════════════════
-- AUTO-UPDATE updated_at ON PROFILES
-- ═══════════════════════════════════════════════════════════════

create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.handle_updated_at();

-- ═══════════════════════════════════════════════════════════════
-- AUTO-CREATE PROFILE ON NEW USER SIGNUP
-- Runs whenever a new user signs up via Supabase Auth
-- ═══════════════════════════════════════════════════════════════

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles(id)
  values(new.id)
  on conflict(id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ═══════════════════════════════════════════════════════════════
-- DONE ✓
-- After running this, go to:
-- Supabase Dashboard → Settings → API
-- Copy: Project URL and anon/public key
-- Paste both into the app settings screen
-- ═══════════════════════════════════════════════════════════════
