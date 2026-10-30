-- Jama'ah Beacon: hosts can edit beacons; regular (weekly repeating) jama'ahs.
-- Run after 0004. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Regular prayers: a template the scheduler turns into an ordinary beacon each day.
-- ---------------------------------------------------------------------------

create table if not exists public.regular_prayers (
    id uuid primary key default gen_random_uuid(),
    salah_name text not null check (salah_name in ('Fajr', 'Dhuhr', 'Jumuah', 'Asr', 'Maghrib', 'Isha')),
    latitude double precision not null check (latitude between -90 and 90),
    longitude double precision not null check (longitude between -180 and 180),
    location_name text not null check (char_length(btrim(location_name)) between 1 and 80),
    location_notes text check (location_notes is null or char_length(location_notes) <= 280),
    sisters_friendly boolean not null default false,
    wudu_nearby boolean not null default false,
    time_of_day time not null,                 -- local time in `timezone`
    timezone text not null,                    -- IANA name, e.g. Europe/London
    days smallint[] not null                   -- 0 = Sunday … 6 = Saturday
        check (cardinality(days) between 1 and 7 and days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
    host_token_hash text not null,
    active boolean not null default true,
    -- Pushed back 30 days whenever someone joins, so abandoned spots stop on their own.
    expires_at timestamptz not null default now() + interval '30 days',
    created_at timestamptz not null default now()
);

alter table public.regular_prayers enable row level security;
-- No policies on purpose: everything clients need is copied onto each day's beacon.
revoke all on public.regular_prayers from anon, authenticated;

alter table public.prayers add column if not exists updated_at timestamptz;
alter table public.prayers add column if not exists regular_id uuid references public.regular_prayers (id) on delete set null;
alter table public.prayers add column if not exists occurrence_date date;   -- local date, for regular beacons
alter table public.prayers add column if not exists repeat_days smallint[]; -- copied from the template, for display

-- One beacon per regular prayer per day, however its time gets edited.
create unique index if not exists idx_prayers_regular_occurrence on public.prayers (regular_id, occurrence_date);

-- Days a host cancelled, so the scheduler doesn't recreate them.
create table if not exists private.regular_skips (
    regular_id uuid not null references public.regular_prayers (id) on delete cascade,
    occurrence_date date not null,
    primary key (regular_id, occurrence_date)
);
alter table private.regular_skips enable row level security;


-- ---------------------------------------------------------------------------
-- Host check: the beacon's own host token, or the token of the regular prayer it came from.
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
                  and r.host_token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex'));
$$;


-- ---------------------------------------------------------------------------
-- Editing
-- ---------------------------------------------------------------------------

-- Applies the fields present in `changes`. Returns the updated beacon.
create or replace function public.update_prayer(prayer_id uuid, token text, changes jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
    updated public.prayers;
begin
    perform private.hit_rate_limit('update', 30, interval '10 minutes');

    if not private.is_host(update_prayer.prayer_id, update_prayer.token) then
        raise exception 'Only the host can edit this jama''ah.';
    end if;

    update public.prayers p
       set salah_name       = coalesce(changes ->> 'salah_name', p.salah_name),
           latitude         = coalesce((changes ->> 'latitude')::double precision, p.latitude),
           longitude        = coalesce((changes ->> 'longitude')::double precision, p.longitude),
           location_name    = coalesce(btrim(changes ->> 'location_name'), p.location_name),
           location_notes   = case when changes ? 'location_notes'
                                   then nullif(btrim(changes ->> 'location_notes'), '')
                                   else p.location_notes end,
           iqamah_time      = coalesce((changes ->> 'iqamah_time')::timestamptz, p.iqamah_time),
           sisters_friendly = coalesce((changes ->> 'sisters_friendly')::boolean, p.sisters_friendly),
           wudu_nearby      = coalesce((changes ->> 'wudu_nearby')::boolean, p.wudu_nearby),
           updated_at       = now()
     where p.id = update_prayer.prayer_id
       and p.hidden_at is null
    returning * into updated;

    if updated.id is null then
        raise exception 'This jama''ah no longer exists.';
    end if;
    if changes ? 'iqamah_time'
       and updated.iqamah_time not between now() - interval '5 minutes' and now() + interval '125 minutes' then
        raise exception 'The new time must be within the next 2 hours.';
    end if;

    return to_json(updated);
end;
$$;

-- Cancelling a day of a regular prayer records a skip so the scheduler doesn't bring it back.
create or replace function public.cancel_prayer(prayer_id uuid, token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
    if not private.is_host(cancel_prayer.prayer_id, cancel_prayer.token) then
        return false;
    end if;

    insert into private.regular_skips (regular_id, occurrence_date)
    select p.regular_id, p.occurrence_date
      from public.prayers p
     where p.id = cancel_prayer.prayer_id and p.regular_id is not null and p.occurrence_date is not null
    on conflict do nothing;

    delete from public.prayers p where p.id = cancel_prayer.prayer_id;
    return found;
end;
$$;


-- ---------------------------------------------------------------------------
-- Regular prayers
-- ---------------------------------------------------------------------------

-- Creates today's beacon plus the repeating template; one token controls both.
-- Returns { prayer, host_token, regular_id }.
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

    -- Whole minutes, so the template's time of day matches today's beacon exactly.
    created := public.create_prayer(
        beacon || jsonb_build_object('iqamah_time', date_trunc('minute', (beacon ->> 'iqamah_time')::timestamptz))
    );
    first_id := (created -> 'prayer' ->> 'id')::uuid;
    host_token := created ->> 'host_token';

    insert into public.regular_prayers
        (salah_name, latitude, longitude, location_name, location_notes, sisters_friendly, wudu_nearby,
         time_of_day, timezone, days, host_token_hash)
    select p.salah_name, p.latitude, p.longitude, p.location_name, p.location_notes, p.sisters_friendly, p.wudu_nearby,
           (p.iqamah_time at time zone create_regular_prayer.tz)::time, create_regular_prayer.tz, clean_days,
           encode(sha256(convert_to(host_token, 'UTF8')), 'hex')
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

-- Stops future days. Today's beacon stays (and can still be cancelled with the same token).
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
       and r.host_token_hash = encode(sha256(convert_to(stop_regular_prayer.token, 'UTF8')), 'hex');
    if not found then
        return false;
    end if;

    -- Drop the "Regular" label from beacons people can still see.
    update public.prayers p
       set repeat_days = null
     where p.regular_id = stop_regular_prayer.regular_id
       and p.iqamah_time >= now() - interval '1 hour';
    return true;
end;
$$;

-- Creates beacons for regular prayers starting within the next 2 hours (today or tomorrow, local time).
create or replace function private.materialize_regular_prayers()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    created integer;
begin
    insert into public.prayers
        (salah_name, latitude, longitude, location_name, location_notes, iqamah_time,
         sisters_friendly, wudu_nearby, regular_id, occurrence_date, repeat_days)
    select r.salah_name, r.latitude, r.longitude, r.location_name, r.location_notes, occ.starts_at,
           r.sisters_friendly, r.wudu_nearby, r.id, occ.local_day, r.days
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
    on conflict (regular_id, occurrence_date) do nothing;

    get diagnostics created = row_count;
    return created;
end;
$$;

revoke all on function public.update_prayer(uuid, text, jsonb) from public;
revoke all on function public.create_regular_prayer(jsonb, smallint[], text) from public;
revoke all on function public.stop_regular_prayer(uuid, text) from public;
grant execute on function public.update_prayer(uuid, text, jsonb) to anon, authenticated;
grant execute on function public.create_regular_prayer(jsonb, smallint[], text) to anon, authenticated;
grant execute on function public.stop_regular_prayer(uuid, text) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- Joining keeps a regular prayer alive; a hidden (reported) day stops the whole series.
-- ---------------------------------------------------------------------------

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

    update public.prayers p
       set attendee_count = p.attendee_count + 1
     where p.id = join_prayer.prayer_id
       and p.hidden_at is null
       and p.iqamah_time >= now() - interval '45 minutes'
    returning p.attendee_count, p.regular_id into new_count, joined_regular;

    if new_count is null then
        return null;
    end if;

    insert into public.prayer_tokens (token_hash, prayer_id, role)
    values (encode(sha256(convert_to(attendee_token, 'UTF8')), 'hex'), join_prayer.prayer_id, 'attendee');

    if joined_regular is not null then
        update public.regular_prayers r
           set expires_at = greatest(r.expires_at, now() + interval '30 days')
         where r.id = joined_regular;
    end if;

    return json_build_object('attendee_count', new_count, 'token', attendee_token);
end;
$$;

create or replace function public.report_prayer(prayer_id uuid, device_id text, reason text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    report_count integer;
begin
    perform private.hit_rate_limit('report', 20, interval '1 hour');

    insert into public.prayer_reports (prayer_id, device_id, reason)
    select p.id, report_prayer.device_id, report_prayer.reason
      from public.prayers p
     where p.id = report_prayer.prayer_id and p.hidden_at is null
    on conflict do nothing;

    select count(*) into report_count from public.prayer_reports r where r.prayer_id = report_prayer.prayer_id;

    if report_count >= 3 then
        update public.prayers p set hidden_at = now() where p.id = report_prayer.prayer_id and p.hidden_at is null;
        if found then
            update public.regular_prayers r
               set active = false
             where r.id = (select p.regular_id from public.prayers p where p.id = report_prayer.prayer_id);
            return true;
        end if;
    end if;
    return false;
end;
$$;


-- ---------------------------------------------------------------------------
-- Scheduling
-- ---------------------------------------------------------------------------

create or replace function private.prune_expired_beacons()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    deleted integer;
begin
    delete from public.prayers
     where iqamah_time < now() - interval '1 day'
        or hidden_at < now() - interval '1 day';
    get diagnostics deleted = row_count;

    -- Stopped or expired regular prayers, once none of their beacons are recent.
    delete from public.regular_prayers r
     where (not r.active or r.expires_at < now())
       and not exists (
           select 1 from public.prayers p
            where p.regular_id = r.id and p.iqamah_time > now() - interval '1 day');

    delete from private.regular_skips where occurrence_date < current_date - 2;
    delete from private.rate_limits where window_start < now() - interval '2 days';

    return deleted;
end;
$$;

select cron.schedule('materialize-regular-prayers', '*/5 * * * *', $$select private.materialize_regular_prayers()$$);
