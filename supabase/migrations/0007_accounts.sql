-- Jama'ah Beacon: optional accounts. Run after 0006. Safe to re-run.
--
-- Accounts are optional: device tokens keep working exactly as before. A signed-in user
-- additionally owns what they host (manageable from any device), can show a display name,
-- and gets a "verified host" badge. Which user hosted or joined what is kept in tables the
-- API can't read; only the chosen display name is ever shown publicly.

-- ---------------------------------------------------------------------------
-- Profiles (one per auth user). Email stays in auth.users and is never copied.
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    display_name text check (display_name is null or char_length(btrim(display_name)) between 1 and 30),
    show_name boolean not null default true,
    consented_at timestamptz not null default now(),
    created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
drop policy if exists "Users read their own profile" on public.profiles;
create policy "Users read their own profile"
    on public.profiles for select to authenticated
    using (id = (select auth.uid()));

-- Shown on beacons. Copied at creation so the profiles table never needs to be public.
alter table public.prayers add column if not exists host_name text;
alter table public.prayers add column if not exists host_verified boolean not null default false;

alter table public.regular_prayers add column if not exists owner_id uuid references auth.users (id) on delete set null;
alter table public.regular_prayers add column if not exists host_name text;
alter table public.regular_prayers add column if not exists host_verified boolean not null default false;
create index if not exists idx_regular_prayers_owner on public.regular_prayers (owner_id) where owner_id is not null;

create table if not exists private.prayer_owners (
    prayer_id uuid primary key references public.prayers (id) on delete cascade,
    user_id uuid not null references auth.users (id) on delete cascade
);
create index if not exists idx_prayer_owners_user on private.prayer_owners (user_id);
alter table private.prayer_owners enable row level security;

-- Deleting an account keeps its +1s in the counts but unlinks them from the person.
alter table public.prayer_tokens add column if not exists user_id uuid references auth.users (id) on delete set null;
create index if not exists idx_prayer_tokens_user on public.prayer_tokens (user_id) where user_id is not null;


-- ---------------------------------------------------------------------------
-- Who is the host?
-- ---------------------------------------------------------------------------

create or replace function private.is_host(target_prayer uuid, token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
               select 1 from public.prayer_tokens t
                where t.prayer_id = target_prayer
                  and t.role = 'host'
                  and t.token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex'))
        or exists (
               select 1 from public.prayers p
                 join public.regular_prayers r on r.id = p.regular_id
                where p.id = target_prayer
                  and r.host_token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex'))
        or (auth.uid() is not null and (
               exists (select 1 from private.prayer_owners o
                        where o.prayer_id = target_prayer and o.user_id = auth.uid())
            or exists (select 1 from public.prayers p
                         join public.regular_prayers r on r.id = p.regular_id
                        where p.id = target_prayer and r.owner_id = auth.uid())));
$$;

-- The public label for whoever is calling: their display name (if they chose to show it).
create or replace function private.caller_host_name()
returns text
language sql
stable
security definer
set search_path = ''
as $$
    select case when p.show_name then p.display_name end
      from public.profiles p
     where p.id = auth.uid();
$$;


-- ---------------------------------------------------------------------------
-- Creating, now recording the owner (same signatures, so existing grants apply).
-- ---------------------------------------------------------------------------

create or replace function public.create_prayer(beacon jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
    new_row public.prayers;
    host_token text := gen_random_uuid()::text;
begin
    perform private.hit_rate_limit('create_10m', 10, interval '10 minutes');
    perform private.hit_rate_limit('create_1d', 30, interval '1 day');

    insert into public.prayers
        (salah_name, latitude, longitude, location_name, location_notes, iqamah_time, sisters_friendly, wudu_nearby,
         host_name, host_verified)
    select r.salah_name, r.latitude, r.longitude, btrim(r.location_name), nullif(btrim(r.location_notes), ''),
           r.iqamah_time, coalesce(r.sisters_friendly, false), coalesce(r.wudu_nearby, false),
           private.caller_host_name(), auth.uid() is not null
      from jsonb_populate_record(null::public.prayers, beacon) r
    returning * into new_row;

    if new_row.iqamah_time not between now() - interval '5 minutes' and now() + interval '125 minutes' then
        raise exception 'Iqamah must be within the next 2 hours.' using errcode = '22023';
    end if;

    insert into public.prayer_tokens (token_hash, prayer_id, role)
    values (encode(sha256(convert_to(host_token, 'UTF8')), 'hex'), new_row.id, 'host');

    if auth.uid() is not null then
        insert into private.prayer_owners (prayer_id, user_id) values (new_row.id, auth.uid());
    end if;

    return json_build_object('prayer', to_json(new_row), 'host_token', host_token);
end;
$$;

create or replace function public.create_regular_prayer(beacon jsonb, days smallint[], tz text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
    created json;
    first_id uuid;
    host_token text;
    new_regular_id uuid;
    clean_days smallint[];
    first_row public.prayers;
begin
    perform private.hit_rate_limit('regular_1d', 5, interval '1 day');

    if not exists (select 1 from pg_catalog.pg_timezone_names where name = create_regular_prayer.tz) then
        raise exception 'Unknown time zone.';
    end if;

    select array_agg(distinct d order by d) into clean_days from unnest(create_regular_prayer.days) d;
    if beacon ->> 'salah_name' = 'Jumuah' and clean_days <> array[5]::smallint[] then
        raise exception 'Jumu''ah can only repeat on Fridays.';
    end if;

    created := public.create_prayer(
        beacon || jsonb_build_object('iqamah_time', date_trunc('minute', (beacon ->> 'iqamah_time')::timestamptz))
    );
    first_id := (created -> 'prayer' ->> 'id')::uuid;
    host_token := created ->> 'host_token';

    insert into public.regular_prayers
        (salah_name, latitude, longitude, location_name, location_notes, sisters_friendly, wudu_nearby,
         time_of_day, timezone, days, host_token_hash, owner_id, host_name, host_verified)
    select p.salah_name, p.latitude, p.longitude, p.location_name, p.location_notes, p.sisters_friendly, p.wudu_nearby,
           (p.iqamah_time at time zone create_regular_prayer.tz)::time, create_regular_prayer.tz, clean_days,
           encode(sha256(convert_to(host_token, 'UTF8')), 'hex'), auth.uid(), p.host_name, p.host_verified
      from public.prayers p
     where p.id = first_id
    returning id into new_regular_id;

    update public.prayers p
       set regular_id = new_regular_id,
           repeat_days = clean_days,
           occurrence_date = (p.iqamah_time at time zone create_regular_prayer.tz)::date
     where p.id = first_id
    returning * into first_row;

    return json_build_object('prayer', to_json(first_row), 'host_token', host_token, 'regular_id', new_regular_id);
end;
$$;

create or replace function private.materialize_regular_prayers()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    created_count integer;
begin
    with created as (
        insert into public.prayers
            (salah_name, latitude, longitude, location_name, location_notes, iqamah_time,
             sisters_friendly, wudu_nearby, regular_id, occurrence_date, repeat_days, photo_updated_at,
             host_name, host_verified)
        select r.salah_name, r.latitude, r.longitude, r.location_name, r.location_notes, occ.starts_at,
               r.sisters_friendly, r.wudu_nearby, r.id, occ.local_day, r.days,
               case when r.photo is not null then now() end,
               r.host_name, r.host_verified
          from public.regular_prayers r
         cross join lateral (
               select d.local_day, (d.local_day + r.time_of_day) at time zone r.timezone as starts_at
                 from (select (now() at time zone r.timezone)::date + i as local_day from generate_series(0, 1) i) d
         ) occ
         where r.active
           and r.expires_at > now()
           and extract(dow from occ.local_day)::smallint = any (r.days)
           and occ.starts_at between now() and now() + interval '2 hours'
           and not exists (
               select 1 from private.regular_skips s
                where s.regular_id = r.id and s.occurrence_date = occ.local_day)
        on conflict (regular_id, occurrence_date) do nothing
        returning id, regular_id
    ), photos as (
        insert into public.prayer_photos (prayer_id, image, content_type)
        select c.id, r.photo, r.photo_type
          from created c
          join public.regular_prayers r on r.id = c.regular_id
         where r.photo is not null
        returning 1
    ), owners as (
        insert into private.prayer_owners (prayer_id, user_id)
        select c.id, r.owner_id
          from created c
          join public.regular_prayers r on r.id = c.regular_id
         where r.owner_id is not null
        returning 1
    )
    select count(*) into created_count from created;

    return created_count;
end;
$$;


-- ---------------------------------------------------------------------------
-- Joining / leaving, linked to the account when signed in.
-- ---------------------------------------------------------------------------

-- Signed-in users can't be counted twice (e.g. from two devices); a repeat returns token null.
create or replace function public.join_prayer(prayer_id uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
    new_count integer;
    joined_regular uuid;
    attendee_token text := gen_random_uuid()::text;
begin
    perform private.hit_rate_limit('join', 120, interval '10 minutes');

    if auth.uid() is not null and exists (
        select 1 from public.prayer_tokens t
         where t.prayer_id = join_prayer.prayer_id and t.role = 'attendee' and t.user_id = auth.uid()) then
        return (select json_build_object('attendee_count', p.attendee_count, 'token', null)
                  from public.prayers p where p.id = join_prayer.prayer_id);
    end if;

    update public.prayers p
       set attendee_count = p.attendee_count + 1
     where p.id = join_prayer.prayer_id
       and p.hidden_at is null
       and p.iqamah_time >= now() - interval '45 minutes'
    returning p.attendee_count, p.regular_id into new_count, joined_regular;

    if new_count is null then
        return null;
    end if;

    insert into public.prayer_tokens (token_hash, prayer_id, role, user_id)
    values (encode(sha256(convert_to(attendee_token, 'UTF8')), 'hex'), join_prayer.prayer_id, 'attendee', auth.uid());

    if joined_regular is not null then
        update public.regular_prayers r
           set expires_at = greatest(r.expires_at, now() + interval '30 days')
         where r.id = joined_regular;
    end if;

    return json_build_object('attendee_count', new_count, 'token', attendee_token);
end;
$$;

-- With a token: undoes that +1. Without one, while signed in: undoes the account's +1.
create or replace function public.leave_prayer(prayer_id uuid, token text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    new_count integer;
begin
    delete from public.prayer_tokens t
     where t.token_hash = (
           select t2.token_hash from public.prayer_tokens t2
            where t2.prayer_id = leave_prayer.prayer_id
              and t2.role = 'attendee'
              and (t2.token_hash = encode(sha256(convert_to(leave_prayer.token, 'UTF8')), 'hex')
                   or (leave_prayer.token is null and auth.uid() is not null and t2.user_id = auth.uid()))
            limit 1);

    if not found then
        return null;
    end if;

    update public.prayers p
       set attendee_count = greatest(1, p.attendee_count - 1)
     where p.id = leave_prayer.prayer_id
    returning p.attendee_count into new_count;

    return new_count;
end;
$$;


-- ---------------------------------------------------------------------------
-- Regular prayers: owners can stop and restart from any device.
-- ---------------------------------------------------------------------------

create or replace function public.stop_regular_prayer(regular_id uuid, token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
    update public.regular_prayers r
       set active = false
     where r.id = stop_regular_prayer.regular_id
       and (r.host_token_hash = encode(sha256(convert_to(stop_regular_prayer.token, 'UTF8')), 'hex')
            or (auth.uid() is not null and r.owner_id = auth.uid()));
    if not found then
        return false;
    end if;

    update public.prayers p
       set repeat_days = null
     where p.regular_id = stop_regular_prayer.regular_id
       and p.iqamah_time >= now() - interval '1 hour';
    return true;
end;
$$;

create or replace function public.restart_regular_prayer(regular_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
    update public.regular_prayers r
       set active = true,
           expires_at = greatest(r.expires_at, now() + interval '30 days')
     where r.id = restart_regular_prayer.regular_id
       and auth.uid() is not null
       and r.owner_id = auth.uid();
    return found;
end;
$$;


-- ---------------------------------------------------------------------------
-- The signed-in user's own data.
-- ---------------------------------------------------------------------------

-- Roles for beacons that are still visible, so "You're hosting / counted in" works on any device.
create or replace function public.my_memberships()
returns json
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce(json_agg(m), '[]'::json)
      from (
           select o.prayer_id, 'host' as role
             from private.prayer_owners o
             join public.prayers p on p.id = o.prayer_id
            where o.user_id = auth.uid() and p.iqamah_time >= now() - interval '1 hour'
           union
           select p.id, 'host'
             from public.prayers p
             join public.regular_prayers r on r.id = p.regular_id
            where r.owner_id = auth.uid() and p.iqamah_time >= now() - interval '1 hour'
           union
           select t.prayer_id, 'attendee'
             from public.prayer_tokens t
             join public.prayers p on p.id = t.prayer_id
            where t.user_id = auth.uid() and t.role = 'attendee' and p.iqamah_time >= now() - interval '1 hour'
      ) m;
$$;

-- Everything for the "My jama'ahs" page.
create or replace function public.my_jamaahs()
returns json
language sql
stable
security definer
set search_path = ''
as $$
    select json_build_object(
        'hosting', coalesce((
            select json_agg(to_json(p) order by p.iqamah_time)
              from public.prayers p
             where p.hidden_at is null
               and p.iqamah_time >= now() - interval '45 minutes'
               and (exists (select 1 from private.prayer_owners o where o.prayer_id = p.id and o.user_id = auth.uid())
                    or exists (select 1 from public.regular_prayers r where r.id = p.regular_id and r.owner_id = auth.uid()))
        ), '[]'::json),
        'regulars', coalesce((
            select json_agg(json_build_object(
                       'id', r.id, 'salah_name', r.salah_name, 'location_name', r.location_name,
                       'time_of_day', to_char(r.time_of_day, 'HH24:MI'), 'timezone', r.timezone, 'days', r.days,
                       'active', r.active and r.expires_at > now(), 'expires_at', r.expires_at)
                   order by r.created_at desc)
              from public.regular_prayers r
             where r.owner_id = auth.uid()
        ), '[]'::json),
        'joined', coalesce((
            select json_agg(to_json(p) order by p.iqamah_time desc)
              from public.prayers p
             where p.hidden_at is null
               and exists (select 1 from public.prayer_tokens t
                            where t.prayer_id = p.id and t.role = 'attendee' and t.user_id = auth.uid())
        ), '[]'::json)
    )
    where auth.uid() is not null;
$$;

-- Creates/updates the profile and refreshes the name on beacons that are still visible.
create or replace function public.save_profile(display_name text, show_name boolean)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
    saved public.profiles;
    shown text;
begin
    if auth.uid() is null then
        raise exception 'Sign in first.';
    end if;

    insert into public.profiles as pr (id, display_name, show_name)
    values (auth.uid(), nullif(btrim(save_profile.display_name), ''), save_profile.show_name)
    on conflict (id) do update
        set display_name = excluded.display_name, show_name = excluded.show_name
    returning * into saved;

    shown := case when saved.show_name then saved.display_name end;

    update public.prayers p
       set host_name = shown
     where p.iqamah_time >= now() - interval '1 hour'
       and (exists (select 1 from private.prayer_owners o where o.prayer_id = p.id and o.user_id = auth.uid())
            or exists (select 1 from public.regular_prayers r where r.id = p.regular_id and r.owner_id = auth.uid()));
    update public.regular_prayers r set host_name = shown where r.owner_id = auth.uid();

    return to_json(saved);
end;
$$;

-- Deletes the account and everything linking it to beacons. Its regular prayers stop.
create or replace function public.delete_my_account()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    me uuid := auth.uid();
begin
    if me is null then
        raise exception 'Sign in first.';
    end if;

    update public.prayers p
       set host_name = null
     where exists (select 1 from private.prayer_owners o where o.prayer_id = p.id and o.user_id = me)
        or exists (select 1 from public.regular_prayers r where r.id = p.regular_id and r.owner_id = me);
    update public.regular_prayers r set active = false, host_name = null where r.owner_id = me;

    -- Cascades to profiles and prayer_owners; prayer_tokens and regular_prayers lose the link.
    delete from auth.users u where u.id = me;
    return true;
end;
$$;

revoke all on function public.restart_regular_prayer(uuid) from public;
revoke all on function public.my_memberships() from public;
revoke all on function public.my_jamaahs() from public;
revoke all on function public.save_profile(text, boolean) from public;
revoke all on function public.delete_my_account() from public;
grant execute on function public.restart_regular_prayer(uuid) to authenticated;
grant execute on function public.my_memberships() to authenticated;
grant execute on function public.my_jamaahs() to authenticated;
grant execute on function public.save_profile(text, boolean) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
