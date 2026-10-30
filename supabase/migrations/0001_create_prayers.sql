-- Jama'ah Beacon: ephemeral prayer beacons.
-- Paste into the Supabase SQL editor (or run with `supabase db push`).

create table if not exists public.prayers (
    id uuid primary key default gen_random_uuid(),
    salah_name text not null check (salah_name in ('Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha')),
    latitude double precision not null check (latitude between -90 and 90),
    longitude double precision not null check (longitude between -180 and 180),
    location_name text not null check (char_length(btrim(location_name)) between 1 and 80),  -- e.g. "Canary Wharf Pier Park"
    location_notes text check (location_notes is null or char_length(location_notes) <= 280), -- e.g. "Under the canopy, look for blue prayer mat"
    iqamah_time timestamptz not null,                     -- when the prayer commences
    sisters_friendly boolean not null default false,
    wudu_nearby boolean not null default false,
    attendee_count integer not null default 1 check (attendee_count >= 1),
    created_at timestamptz not null default now()
);

-- Every read is a range scan on iqamah_time.
create index if not exists idx_prayers_iqamah on public.prayers (iqamah_time);

alter table public.prayers enable row level security;

-- No UPDATE or DELETE grants: the only write after creation is increment_attendee().
grant select, insert on public.prayers to anon, authenticated;

-- Reads are limited to recent beacons so old location history can't be scraped.
drop policy if exists "Public can read recent beacons" on public.prayers;
create policy "Public can read recent beacons"
    on public.prayers for select
    to anon, authenticated
    using (iqamah_time >= now() - interval '1 hour');

-- New beacons must start with one attendee (the host) and begin within the next ~2 hours.
drop policy if exists "Public can create beacons" on public.prayers;
create policy "Public can create beacons"
    on public.prayers for insert
    to anon, authenticated
    with check (
        attendee_count = 1
        and iqamah_time between now() - interval '5 minutes' and now() + interval '125 minutes'
    );

-- Atomic +1. Returns the new count, or null if the beacon doesn't exist or has ended.
create or replace function public.increment_attendee(prayer_id uuid)
returns integer
language sql
security definer
set search_path = ''
as $$
    update public.prayers
       set attendee_count = attendee_count + 1
     where id = prayer_id
       and iqamah_time >= now() - interval '15 minutes'
    returning attendee_count;
$$;

revoke all on function public.increment_attendee(uuid) from public;
grant execute on function public.increment_attendee(uuid) to anon, authenticated;

-- Optional housekeeping. The app never needs this (queries filter by time), but if you
-- enable the pg_cron extension you can stop dead rows piling up:
--
-- select cron.schedule('prune-prayers', '0 * * * *',
--     $$delete from public.prayers where iqamah_time < now() - interval '1 day'$$);
