-- Jama'ah Beacon: Jumu'ah, per-IP rate limits, and community reports.
-- Run after 0002. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Jumu'ah
-- ---------------------------------------------------------------------------

alter table public.prayers drop constraint if exists prayers_salah_name_check;
alter table public.prayers add constraint prayers_salah_name_check
    check (salah_name in ('Fajr', 'Dhuhr', 'Jumuah', 'Asr', 'Maghrib', 'Isha'));


-- ---------------------------------------------------------------------------
-- Rate limiting (fixed windows per client IP). Lives in a schema the API doesn't expose.
-- ---------------------------------------------------------------------------

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.rate_limits (
    bucket text not null,
    ip text not null,
    window_start timestamptz not null,
    hits integer not null,
    constraint rate_limits_pkey primary key (bucket, ip, window_start)
);

-- Not reachable through the API anyway; enabled so the dashboard doesn't flag it.
-- The functions below run as the table owner, which bypasses RLS.
alter table private.rate_limits enable row level security;

-- Supabase's edge sets these headers itself; a client-supplied value doesn't override them.
create or replace function private.client_ip()
returns text
language sql
stable
set search_path = ''
as $$
    with h as (select nullif(current_setting('request.headers', true), '')::json as headers)
    select coalesce(
        nullif(h.headers ->> 'cf-connecting-ip', ''),
        nullif(btrim(split_part(h.headers ->> 'x-forwarded-for', ',', 1)), ''),
        'unknown'
    )
    from h;
$$;

-- Counts one hit for the caller's IP and raises once the window's allowance is used up.
-- The raise rolls back the hit too, so blocked attempts don't extend the block.
create or replace function private.hit_rate_limit(bucket_name text, max_hits integer, per_window interval)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    window_secs double precision := extract(epoch from per_window);
    current_window timestamptz := to_timestamp(floor(extract(epoch from now()) / window_secs) * window_secs);
    hit_count integer;
begin
    insert into private.rate_limits as r (bucket, ip, window_start, hits)
    values (bucket_name, private.client_ip(), current_window, 1)
    on conflict on constraint rate_limits_pkey do update set hits = r.hits + 1
    returning r.hits into hit_count;

    if hit_count > max_hits then
        raise exception 'Too many requests from your network. Please wait a few minutes and try again.';
    end if;

    -- Opportunistic cleanup instead of a cron job.
    if random() < 0.01 then
        delete from private.rate_limits where window_start < now() - interval '2 days';
    end if;
end;
$$;


-- ---------------------------------------------------------------------------
-- Reports: a beacon is hidden once 3 different devices report it.
-- ---------------------------------------------------------------------------

alter table public.prayers add column if not exists hidden_at timestamptz;

create table if not exists public.prayer_reports (
    prayer_id uuid not null references public.prayers (id) on delete cascade,
    device_id text not null check (char_length(device_id) between 8 and 64),
    reason text not null check (reason in ('not_real', 'wrong_location', 'inappropriate')),
    created_at timestamptz not null default now(),
    primary key (prayer_id, device_id)
);

alter table public.prayer_reports enable row level security;
-- No policies on purpose: only report_prayer() writes here.
revoke all on public.prayer_reports from anon, authenticated;

-- Returns true if this report caused the beacon to be hidden.
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
        return found;
    end if;
    return false;
end;
$$;

revoke all on function public.report_prayer(uuid, text, text) from public;
grant execute on function public.report_prayer(uuid, text, text) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- create / join, now rate limited (same signatures, so 0002's grants still apply).
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
        (salah_name, latitude, longitude, location_name, location_notes, iqamah_time, sisters_friendly, wudu_nearby)
    select r.salah_name, r.latitude, r.longitude, btrim(r.location_name), nullif(btrim(r.location_notes), ''),
           r.iqamah_time, coalesce(r.sisters_friendly, false), coalesce(r.wudu_nearby, false)
      from jsonb_populate_record(null::public.prayers, beacon) r
    returning * into new_row;

    if new_row.iqamah_time not between now() - interval '5 minutes' and now() + interval '125 minutes' then
        raise exception 'Iqamah must be within the next 2 hours.' using errcode = '22023';
    end if;

    insert into public.prayer_tokens (token_hash, prayer_id, role)
    values (encode(sha256(convert_to(host_token, 'UTF8')), 'hex'), new_row.id, 'host');

    return json_build_object('prayer', to_json(new_row), 'host_token', host_token);
end;
$$;

-- Joins stay open 45 minutes after the start time, to cover Jumu'ah khutbahs.
create or replace function public.join_prayer(prayer_id uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
    new_count integer;
    attendee_token text := gen_random_uuid()::text;
begin
    perform private.hit_rate_limit('join', 120, interval '10 minutes');

    update public.prayers p
       set attendee_count = p.attendee_count + 1
     where p.id = join_prayer.prayer_id
       and p.hidden_at is null
       and p.iqamah_time >= now() - interval '45 minutes'
    returning p.attendee_count into new_count;

    if new_count is null then
        return null;
    end if;

    insert into public.prayer_tokens (token_hash, prayer_id, role)
    values (encode(sha256(convert_to(attendee_token, 'UTF8')), 'hex'), join_prayer.prayer_id, 'attendee');

    return json_build_object('attendee_count', new_count, 'token', attendee_token);
end;
$$;
