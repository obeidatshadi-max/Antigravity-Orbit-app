-- Additive storage for the approved ORBIT report. Existing tables/data are unchanged.
begin;

create table public.orbit_checkins (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  version text not null check (version = 'orbit-checkin-v1'),
  answers smallint[] not null check (
    array_ndims(answers) = 1 and array_lower(answers,1) = 1 and cardinality(answers) = 8
    and array_position(answers,null) is null and 0 <= all(answers) and 3 >= all(answers)
  ),
  score numeric generated always as (
    ((answers[1]+answers[2])/2.0 + answers[3]+answers[4]+answers[5]+answers[6]+answers[7]+answers[8])*100.0/21.0
  ) stored,
  created_at timestamptz not null default now(),
  primary key(user_id,id)
);

create table public.orbit_actions (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  goal text not null check (length(goal) between 1 and 2000),
  text text not null check (length(btrim(text)) between 1 and 600),
  when_text text not null check (length(btrim(when_text)) between 1 and 160),
  created_at timestamptz not null default now(),
  primary key(user_id,id)
);

create table public.orbit_reviews (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  action_id uuid not null,
  outcome text not null check(outcome in ('done','partly','notyet')),
  text text not null check(length(btrim(text)) between 1 and 1000),
  created_at timestamptz not null default now(),
  primary key(user_id,id),
  foreign key(user_id,action_id) references public.orbit_actions(user_id,id) on delete cascade
);

create table public.orbit_feedback (
  user_id uuid not null references auth.users(id) on delete cascade,
  moment_id uuid not null references public.moments(id) on delete cascade,
  fit text not null check(fit in ('','fits','unsure','disagree')),
  updated_at timestamptz not null default now(),
  primary key(user_id,moment_id)
);

create table public.orbit_moment_details (
  user_id uuid not null references auth.users(id) on delete cascade,
  moment_id uuid not null references public.moments(id) on delete cascade,
  action text not null check(length(btrim(action)) between 1 and 4000),
  trigger_cat text not null default '' check(length(trigger_cat)<=100),
  action_type text not null default '' check(length(action_type)<=100),
  updated_at timestamptz not null default now(),
  primary key(user_id,moment_id)
);

create index orbit_checkins_created on public.orbit_checkins(user_id,created_at);
create index orbit_actions_created on public.orbit_actions(user_id,created_at);
create index orbit_reviews_action on public.orbit_reviews(user_id,action_id);
create index orbit_feedback_moment on public.orbit_feedback(moment_id);
create index orbit_details_moment on public.orbit_moment_details(moment_id);

alter table public.orbit_checkins enable row level security;
alter table public.orbit_actions enable row level security;
alter table public.orbit_reviews enable row level security;
alter table public.orbit_feedback enable row level security;
alter table public.orbit_moment_details enable row level security;

revoke all on public.orbit_checkins, public.orbit_actions, public.orbit_reviews,
  public.orbit_feedback, public.orbit_moment_details from public, anon, authenticated;
grant select,insert,delete on public.orbit_checkins, public.orbit_actions, public.orbit_reviews to authenticated;
grant select,insert,update,delete on public.orbit_feedback, public.orbit_moment_details to authenticated;

-- Registered accounts only. Anonymous sign-ins also use the authenticated role.
create policy orbit_checkins_owner on public.orbit_checkins to authenticated
  using(user_id=(select auth.uid()) and not coalesce((select (auth.jwt()->>'is_anonymous')::boolean),false))
  with check(user_id=(select auth.uid()) and not coalesce((select (auth.jwt()->>'is_anonymous')::boolean),false));
create policy orbit_actions_owner on public.orbit_actions to authenticated
  using(user_id=(select auth.uid()) and not coalesce((select (auth.jwt()->>'is_anonymous')::boolean),false))
  with check(user_id=(select auth.uid()) and not coalesce((select (auth.jwt()->>'is_anonymous')::boolean),false));
create policy orbit_reviews_owner on public.orbit_reviews to authenticated
  using(user_id=(select auth.uid()) and not coalesce((select (auth.jwt()->>'is_anonymous')::boolean),false))
  with check(user_id=(select auth.uid()) and not coalesce((select (auth.jwt()->>'is_anonymous')::boolean),false));
create policy orbit_feedback_owner on public.orbit_feedback to authenticated
  using(user_id=(select auth.uid()) and not coalesce((select (auth.jwt()->>'is_anonymous')::boolean),false))
  with check(user_id=(select auth.uid()) and not coalesce((select (auth.jwt()->>'is_anonymous')::boolean),false)
    and exists(select 1 from public.moments m where m.id=moment_id and m.user_id=(select auth.uid())));
create policy orbit_details_owner on public.orbit_moment_details to authenticated
  using(user_id=(select auth.uid()) and not coalesce((select (auth.jwt()->>'is_anonymous')::boolean),false))
  with check(user_id=(select auth.uid()) and not coalesce((select (auth.jwt()->>'is_anonymous')::boolean),false)
    and exists(select 1 from public.moments m where m.id=moment_id and m.user_id=(select auth.uid())));

-- This deliberately deletes only these supplemental records, not situations or accounts.
create function public.orbit_delete_personal_records() returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
    raise insufficient_privilege using message='A registered account is required';
  end if;
  delete from public.orbit_feedback where user_id=auth.uid();
  delete from public.orbit_moment_details where user_id=auth.uid();
  delete from public.orbit_reviews where user_id=auth.uid();
  delete from public.orbit_actions where user_id=auth.uid();
  delete from public.orbit_checkins where user_id=auth.uid();
end;
$$;
revoke all on function public.orbit_delete_personal_records() from public,anon;
grant execute on function public.orbit_delete_personal_records() to authenticated;
commit;
