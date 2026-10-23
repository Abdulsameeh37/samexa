-- SAMEXA multiplayer + owner-only editor backend (Supabase PostgreSQL)
-- Run this in Supabase SQL Editor after enabling Anonymous Sign-Ins under Authentication.
-- For owner login: create an email/password user in Supabase Auth, then run the final INSERT below
-- with that account's UUID. Never put the service-role key into client-side files.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_app_admin()
returns boolean language sql stable security definer
set search_path = public
as $$
  select exists(select 1 from public.app_admins where user_id = auth.uid());
$$;
revoke all on function public.is_app_admin() from public;
grant execute on function public.is_app_admin() to anon, authenticated;

create table if not exists public.question_bank (
  id uuid primary key default gen_random_uuid(),
  question_text text not null,
  options jsonb not null check(jsonb_typeof(options) = 'array' and jsonb_array_length(options) = 4),
  topic text not null,
  source_type text not null default 'generated_practice'
    check(source_type in ('verified_official','generated_practice','demo')),
  source_ref text,
  source_year integer check(source_year is null or source_year between 2000 and 2100),
  is_published boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep answer keys separate so players cannot query correct answers before answering.
do $$ begin
  if not exists(select 1 from pg_constraint where conname='verified_question_source_required') then
    alter table public.question_bank add constraint verified_question_source_required
      check(source_type <> 'verified_official' or (source_ref is not null and length(btrim(source_ref)) > 0));
  end if;
end $$;

create table if not exists public.question_keys (
  question_id uuid primary key references public.question_bank(id) on delete cascade,
  correct_option integer not null check(correct_option between 0 and 3),
  explanation text not null default ''
);

create table if not exists public.game_rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique,
  mode text not null check(mode in ('duel','teams')),
  status text not null default 'lobby' check(status in ('lobby','playing','finished')),
  host_id uuid not null references auth.users(id),
  current_question_id uuid references public.question_bank(id),
  question_index integer not null default -1,
  created_at timestamptz not null default now(),
  started_at timestamptz
);

create table if not exists public.game_room_secrets (
  room_id uuid primary key references public.game_rooms(id) on delete cascade,
  pin_hash text not null
);

create table if not exists public.game_teams (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  name text not null check(length(name) between 1 and 32),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(room_id, name)
);

create table if not exists public.game_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check(length(display_name) between 1 and 24),
  score integer not null default 0,
  team_id uuid references public.game_teams(id) on delete set null,
  last_answered_question_id uuid references public.question_bank(id),
  joined_at timestamptz not null default now(),
  unique(room_id, user_id)
);

create table if not exists public.game_answers (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.question_bank(id) on delete cascade,
  selected_option integer not null check(selected_option between 0 and 3),
  is_correct boolean not null,
  answered_at timestamptz not null default now(),
  unique(room_id, user_id, question_id)
);

create index if not exists game_players_room_idx on public.game_players(room_id);
create index if not exists game_answers_room_question_idx on public.game_answers(room_id, question_id);
create index if not exists question_bank_published_idx on public.question_bank(is_published, created_at);

create or replace function public.is_room_member(p_room_id uuid)
returns boolean language sql stable security definer
set search_path = public
as $$ select exists(select 1 from public.game_players where room_id=p_room_id and user_id=auth.uid()); $$;

create or replace function public.is_room_host(p_room_id uuid)
returns boolean language sql stable security definer
set search_path = public
as $$ select exists(select 1 from public.game_rooms where id=p_room_id and host_id=auth.uid()); $$;

revoke all on function public.is_room_member(uuid) from public;
revoke all on function public.is_room_host(uuid) from public;
grant execute on function public.is_room_member(uuid) to anon, authenticated;
grant execute on function public.is_room_host(uuid) to anon, authenticated;

alter table public.app_admins enable row level security;
alter table public.question_bank enable row level security;
alter table public.question_keys enable row level security;
alter table public.game_rooms enable row level security;
alter table public.game_room_secrets enable row level security;
alter table public.game_teams enable row level security;
alter table public.game_players enable row level security;
alter table public.game_answers enable row level security;

drop policy if exists admin_read_self on public.app_admins;
create policy admin_read_self on public.app_admins for select to authenticated using(user_id=auth.uid());
drop policy if exists published_questions_read on public.question_bank;
create policy published_questions_read on public.question_bank for select to anon, authenticated using(is_published=true or public.is_app_admin());
drop policy if exists admin_question_insert on public.question_bank;
create policy admin_question_insert on public.question_bank for insert to authenticated with check(public.is_app_admin());
drop policy if exists admin_question_update on public.question_bank;
create policy admin_question_update on public.question_bank for update to authenticated using(public.is_app_admin()) with check(public.is_app_admin());
drop policy if exists admin_question_delete on public.question_bank;
create policy admin_question_delete on public.question_bank for delete to authenticated using(public.is_app_admin());

drop policy if exists admin_keys_all on public.question_keys;
create policy admin_keys_all on public.question_keys for all to authenticated using(public.is_app_admin()) with check(public.is_app_admin());
drop policy if exists member_room_read on public.game_rooms;
create policy member_room_read on public.game_rooms for select to authenticated using(public.is_room_member(id) or host_id=auth.uid());
drop policy if exists member_team_read on public.game_teams;
create policy member_team_read on public.game_teams for select to authenticated using(public.is_room_member(room_id));
drop policy if exists member_player_read on public.game_players;
create policy member_player_read on public.game_players for select to authenticated using(public.is_room_member(room_id));
drop policy if exists own_answers_read on public.game_answers;
create policy own_answers_read on public.game_answers for select to authenticated using(user_id=auth.uid() or public.is_room_host(room_id));
drop policy if exists admin_secrets_read on public.game_room_secrets;
create policy admin_secrets_read on public.game_room_secrets for select to authenticated using(public.is_app_admin());

-- Publicly callable RPCs require a Supabase auth user. Enable anonymous sign-ins for guest players.
create or replace function public.create_game(p_display_name text, p_mode text, p_pin text)
returns jsonb language plpgsql security definer set search_path=public,extensions
as $$
declare v_room public.game_rooms; v_code text; v_name text;
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 v_name:=left(trim(coalesce(p_display_name,'Player')),24);
 if length(v_name)<1 then v_name:='Player'; end if;
 if p_mode not in ('duel','teams') then raise exception 'Invalid game mode'; end if;
 if length(coalesce(p_pin,''))<4 or length(p_pin)>32 then raise exception 'Password must be 4–32 characters'; end if;
 loop
   v_code:=upper(substr(encode(extensions.gen_random_bytes(5),'hex'),1,6));
   exit when not exists(select 1 from public.game_rooms where room_code=v_code);
 end loop;
 insert into public.game_rooms(room_code,mode,host_id) values(v_code,p_mode,auth.uid()) returning * into v_room;
 insert into public.game_room_secrets(room_id,pin_hash) values(v_room.id,extensions.crypt(p_pin,extensions.gen_salt('bf')));
 insert into public.game_players(room_id,user_id,display_name) values(v_room.id,auth.uid(),v_name)
 on conflict(room_id,user_id) do update set display_name=excluded.display_name;
 return jsonb_build_object('room_id',v_room.id,'room_code',v_room.room_code,'mode',v_room.mode,'host_id',v_room.host_id);
end $$;

create or replace function public.join_game(p_room_code text,p_pin text,p_display_name text)
returns jsonb language plpgsql security definer set search_path=public,extensions
as $$
declare v_room public.game_rooms; v_hash text; v_count integer; v_name text;
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 v_name:=left(trim(coalesce(p_display_name,'Player')),24); if length(v_name)<1 then v_name:='Player'; end if;
 select * into v_room from public.game_rooms where room_code=upper(trim(p_room_code)) for update;
 if not found then raise exception 'Room not found'; end if;
 if v_room.status<>'lobby' then raise exception 'This room has already started'; end if;
 select pin_hash into v_hash from public.game_room_secrets where room_id=v_room.id;
 if v_hash is null or extensions.crypt(coalesce(p_pin,''),v_hash)<>v_hash then raise exception 'Incorrect room password'; end if;
 select count(*) into v_count from public.game_players where room_id=v_room.id;
 if v_room.mode='duel' and v_count>=2 and not exists(select 1 from public.game_players where room_id=v_room.id and user_id=auth.uid()) then raise exception 'This 1v1 room is full'; end if;
 insert into public.game_players(room_id,user_id,display_name) values(v_room.id,auth.uid(),v_name)
 on conflict(room_id,user_id) do update set display_name=excluded.display_name;
 return jsonb_build_object('room_id',v_room.id,'room_code',v_room.room_code,'mode',v_room.mode,'host_id',v_room.host_id);
end $$;

create or replace function public.create_game_team(p_room_id uuid,p_team_name text)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare v_team public.game_teams;
begin
 if not public.is_room_member(p_room_id) then raise exception 'Join this room first'; end if;
 if not exists(select 1 from public.game_rooms where id=p_room_id and mode='teams' and status='lobby') then raise exception 'Teams can only be created in a team lobby'; end if;
 insert into public.game_teams(room_id,name,created_by) values(p_room_id,trim(p_team_name),auth.uid()) returning * into v_team;
 update public.game_players set team_id=v_team.id where room_id=p_room_id and user_id=auth.uid();
 return jsonb_build_object('team_id',v_team.id,'name',v_team.name);
end $$;

create or replace function public.set_game_team(p_room_id uuid,p_team_id uuid)
returns boolean language plpgsql security definer set search_path=public
as $$
begin
 if not public.is_room_member(p_room_id) then raise exception 'Join this room first'; end if;
 if not exists(select 1 from public.game_rooms where id=p_room_id and mode='teams' and status='lobby') then raise exception 'Teams can only be changed in the lobby'; end if;
 if not exists(select 1 from public.game_teams where id=p_team_id and room_id=p_room_id) then raise exception 'Team not found in this room'; end if;
 update public.game_players set team_id=p_team_id where room_id=p_room_id and user_id=auth.uid();
 return true;
end $$;

create or replace function public.start_game(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare v_room public.game_rooms; v_question uuid;
begin
 select * into v_room from public.game_rooms where id=p_room_id for update;
 if not found or v_room.host_id<>auth.uid() then raise exception 'Only the room host can start the game'; end if;
 if v_room.status<>'lobby' then raise exception 'Game has already started'; end if;
 if v_room.mode='duel' and (select count(*) from public.game_players where room_id=p_room_id)<2 then raise exception 'Invite a second player before starting a duel'; end if;
 select q.id into v_question from public.question_bank q join public.question_keys k on k.question_id=q.id where q.is_published=true order by q.created_at,q.id offset 0 limit 1;
 if v_question is null then raise exception 'No published questions with answer keys exist yet. Add questions in Owner Studio first.'; end if;
 update public.game_rooms set status='playing',current_question_id=v_question,question_index=0,started_at=now() where id=p_room_id;
 return jsonb_build_object('status','playing','question_id',v_question,'question_index',0);
end $$;

create or replace function public.next_game_question(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare v_room public.game_rooms; v_question uuid; v_next integer;
begin
 select * into v_room from public.game_rooms where id=p_room_id for update;
 if not found or v_room.host_id<>auth.uid() then raise exception 'Only the room host can advance the game'; end if;
 if v_room.status<>'playing' then raise exception 'Game is not running'; end if;
 v_next:=v_room.question_index+1;
 select q.id into v_question from public.question_bank q join public.question_keys k on k.question_id=q.id where q.is_published=true order by q.created_at,q.id offset v_next limit 1;
 if v_question is null then
   update public.game_rooms set status='finished',current_question_id=null where id=p_room_id;
   return jsonb_build_object('status','finished');
 end if;
 update public.game_rooms set current_question_id=v_question,question_index=v_next where id=p_room_id;
 return jsonb_build_object('status','playing','question_id',v_question,'question_index',v_next);
end $$;

create or replace function public.submit_game_answer(p_room_id uuid,p_selected_option integer)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare v_room public.game_rooms; v_key public.question_keys; v_prev public.game_answers; v_inserted integer; v_score integer;
begin
 if p_selected_option<0 or p_selected_option>3 then raise exception 'Invalid answer option'; end if;
 if not public.is_room_member(p_room_id) then raise exception 'Join the room first'; end if;
 select * into v_room from public.game_rooms where id=p_room_id;
 if v_room.status<>'playing' or v_room.current_question_id is null then raise exception 'No active question'; end if;
 select * into v_key from public.question_keys where question_id=v_room.current_question_id;
 if not found then raise exception 'Question answer key unavailable'; end if;
 insert into public.game_answers(room_id,user_id,question_id,selected_option,is_correct)
 values(p_room_id,auth.uid(),v_room.current_question_id,p_selected_option,p_selected_option=v_key.correct_option)
 on conflict(room_id,user_id,question_id) do nothing;
 get diagnostics v_inserted=row_count;
 if v_inserted=1 then
   update public.game_players set score=score+case when p_selected_option=v_key.correct_option then 10 else 0 end,
     last_answered_question_id=v_room.current_question_id where room_id=p_room_id and user_id=auth.uid();
 else
   select * into v_prev from public.game_answers where room_id=p_room_id and user_id=auth.uid() and question_id=v_room.current_question_id;
   p_selected_option:=v_prev.selected_option;
 end if;
 select score into v_score from public.game_players where room_id=p_room_id and user_id=auth.uid();
 return jsonb_build_object('is_correct',p_selected_option=v_key.correct_option,'correct_option',v_key.correct_option,'explanation',v_key.explanation,'score',coalesce(v_score,0));
end $$;

create or replace function public.leave_game(p_room_id uuid)
returns boolean language plpgsql security definer set search_path=public
as $$
declare v_room public.game_rooms; v_next_host uuid;
begin
 select * into v_room from public.game_rooms where id=p_room_id for update;
 if not found then return true; end if;
 delete from public.game_players where room_id=p_room_id and user_id=auth.uid();
 if v_room.host_id=auth.uid() then
   select user_id into v_next_host from public.game_players where room_id=p_room_id order by joined_at limit 1;
   if v_next_host is null then
     delete from public.game_rooms where id=p_room_id;
   else
     update public.game_rooms set host_id=v_next_host where id=p_room_id;
   end if;
 end if;
 return true;
end $$;


revoke all on function public.create_game(text,text,text) from public;
revoke all on function public.join_game(text,text,text) from public;
revoke all on function public.create_game_team(uuid,text) from public;
revoke all on function public.set_game_team(uuid,uuid) from public;
revoke all on function public.start_game(uuid) from public;
revoke all on function public.next_game_question(uuid) from public;
revoke all on function public.submit_game_answer(uuid,integer) from public;
revoke all on function public.leave_game(uuid) from public;

-- Give authenticated/anonymous roles RPC access. Table writes remain protected by RLS.
grant execute on function public.create_game(text,text,text) to authenticated;
grant execute on function public.join_game(text,text,text) to authenticated;
grant execute on function public.create_game_team(uuid,text) to authenticated;
grant execute on function public.set_game_team(uuid,uuid) to authenticated;
grant execute on function public.start_game(uuid) to authenticated;
grant execute on function public.next_game_question(uuid) to authenticated;
grant execute on function public.submit_game_answer(uuid,integer) to authenticated;
grant execute on function public.leave_game(uuid) to authenticated;


create table if not exists public.site_settings (
  id integer primary key check(id=1),
  tagline text not null default 'Your mind. Your mission. Your future.',
  exam_date date not null default date '2026-12-08',
  updated_at timestamptz not null default now()
);
insert into public.site_settings(id,tagline,exam_date)
values(1,'Your mind. Your mission. Your future.',date '2026-12-08')
on conflict(id) do nothing;
alter table public.site_settings enable row level security;
drop policy if exists public_site_settings_read on public.site_settings;
create policy public_site_settings_read on public.site_settings for select to anon, authenticated using(true);
drop policy if exists admin_site_settings_update on public.site_settings;
create policy admin_site_settings_update on public.site_settings for update to authenticated using(public.is_app_admin()) with check(public.is_app_admin());
grant select on public.site_settings to anon, authenticated;
grant update on public.site_settings to authenticated;

grant select on public.question_bank to anon, authenticated;
grant insert,update,delete on public.question_bank to authenticated;
grant select,insert,update,delete on public.question_keys to authenticated;
grant select on public.game_rooms to authenticated;
grant select on public.game_players to authenticated;
grant select on public.game_teams to authenticated;
grant select on public.game_answers to authenticated;
grant select on public.game_room_secrets to authenticated;


grant usage on schema public to anon, authenticated;

-- Opt-in learner profiles. Contact details are optional and visible to the owner only
-- when a user explicitly agrees to owner-view consent.
create table if not exists public.visitor_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check(length(display_name) between 1 and 40),
  contact_info text check(contact_info is null or length(contact_info)<=120),
  owner_view_consent boolean not null default false check(owner_view_consent=true),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create table if not exists public.visit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  page_path text not null default '/' check(length(page_path)<=160),
  visited_at timestamptz not null default now()
);
create index if not exists visit_events_visited_at_idx on public.visit_events(visited_at);
create index if not exists visitor_profiles_last_seen_idx on public.visitor_profiles(last_seen_at desc);
alter table public.visitor_profiles enable row level security;
alter table public.visit_events enable row level security;
drop policy if exists profile_read_self_or_admin on public.visitor_profiles;
create policy profile_read_self_or_admin on public.visitor_profiles for select to authenticated
  using(user_id=auth.uid() or public.is_app_admin());
drop policy if exists profile_write_self on public.visitor_profiles;
create policy profile_write_self on public.visitor_profiles for insert to authenticated
  with check(user_id=auth.uid() and owner_view_consent=true);
drop policy if exists profile_update_self on public.visitor_profiles;
create policy profile_update_self on public.visitor_profiles for update to authenticated
  using(user_id=auth.uid()) with check(user_id=auth.uid() and owner_view_consent=true);
drop policy if exists profile_delete_self_or_admin on public.visitor_profiles;
create policy profile_delete_self_or_admin on public.visitor_profiles for delete to authenticated
  using(user_id=auth.uid() or public.is_app_admin());
drop policy if exists visit_event_insert_self on public.visit_events;
create policy visit_event_insert_self on public.visit_events for insert to authenticated
  with check(user_id=auth.uid());
drop policy if exists visit_event_read_admin on public.visit_events;
create policy visit_event_read_admin on public.visit_events for select to authenticated
  using(public.is_app_admin());
grant select,insert,update,delete on public.visitor_profiles to authenticated;
grant insert,select on public.visit_events to authenticated;

create or replace function public.track_page_visit(p_page_path text default '/')
returns boolean language plpgsql security definer set search_path=public
as $$
begin
 if auth.uid() is null then return false; end if;
 insert into public.visit_events(user_id,page_path) values(auth.uid(),left(coalesce(p_page_path,'/'),160));
 update public.visitor_profiles set last_seen_at=now() where user_id=auth.uid();
 return true;
end $$;
revoke all on function public.track_page_visit(text) from public;
grant execute on function public.track_page_visit(text) to authenticated;

-- Realtime: allow clients to subscribe to rooms, players and teams they can read.
do $$
begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='game_rooms') then
    alter publication supabase_realtime add table public.game_rooms;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='game_players') then
    alter publication supabase_realtime add table public.game_players;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='game_teams') then
    alter publication supabase_realtime add table public.game_teams;
  end if;
end $$;

-- OWNER SETUP (run manually after creating your own email/password user in Supabase Auth):
-- insert into public.app_admins(user_id)
-- values ('PASTE-YOUR-AUTH-USER-UUID-HERE')
-- on conflict do nothing;
