-- Jama'ah Beacon: host/attendee tokens (cancel beacon, undo +1) and realtime.
-- Run after 0001. Safe to re-run.
--
-- There are no accounts, so ownership is proven with a random token handed out by
-- create_prayer / join_prayer and kept in the device's localStorage. Only a SHA-256
-- hash is stored, in a table the public roles cannot read.

create table if not exists public.prayer_tokens (
    token_hash text primary key,
    prayer_id uuid not null references public.prayers (id) on delete cascade,
    role text not null check (role in ('host', 'attendee')),
    created_at timestamptz not null default now()
);

create index if not exists idx_prayer_tokens_prayer on public.prayer_tokens (prayer_id);

alter table public.prayer_tokens enable row level security;
-- No policies on purpose: only the security definer functions below touch this table.
revoke all on public.prayer_tokens from anon, authenticated;

-- All writes now go through functions, so beacons can't be created without a host token.
drop policy if exists "Public can create beacons" on public.prayers;
revoke insert on public.prayers from anon, authenticated;

-- Replaced by join_prayer, which also returns a token for leaving.
drop function if exists public.increment_attendee(uuid);


-- Creates a beacon from a JSON object of prayers columns. Returns { prayer, host_token }.
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


-- Atomic +1. Returns { attendee_count, token }, or null if the beacon doesn't exist or has ended.
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
    update public.prayers p
       set attendee_count = p.attendee_count + 1
     where p.id = join_prayer.prayer_id
       and p.iqamah_time >= now() - interval '15 minutes'
    returning p.attendee_count into new_count;

    if new_count is null then
        return null;
    end if;

    insert into public.prayer_tokens (token_hash, prayer_id, role)
    values (encode(sha256(convert_to(attendee_token, 'UTF8')), 'hex'), join_prayer.prayer_id, 'attendee');

    return json_build_object('attendee_count', new_count, 'token', attendee_token);
end;
$$;


-- Undoes one +1. The token is single-use. Returns the new count, or null if the token doesn't match.
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
     where t.token_hash = encode(sha256(convert_to(leave_prayer.token, 'UTF8')), 'hex')
       and t.prayer_id = leave_prayer.prayer_id
       and t.role = 'attendee';

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


-- Deletes the beacon if the host token matches. Returns whether anything was deleted.
create or replace function public.cancel_prayer(prayer_id uuid, token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
    delete from public.prayers p
     where p.id = cancel_prayer.prayer_id
       and exists (
           select 1
             from public.prayer_tokens t
            where t.prayer_id = p.id
              and t.role = 'host'
              and t.token_hash = encode(sha256(convert_to(cancel_prayer.token, 'UTF8')), 'hex')
       );
    return found;
end;
$$;

revoke all on function public.create_prayer(jsonb) from public;
revoke all on function public.join_prayer(uuid) from public;
revoke all on function public.leave_prayer(uuid, text) from public;
revoke all on function public.cancel_prayer(uuid, text) from public;
grant execute on function public.create_prayer(jsonb) to anon, authenticated;
grant execute on function public.join_prayer(uuid) to anon, authenticated;
grant execute on function public.leave_prayer(uuid, text) to anon, authenticated;
grant execute on function public.cancel_prayer(uuid, text) to anon, authenticated;


-- Broadcast inserts/updates/deletes on prayers to subscribed clients. Inserts and updates
-- are filtered by the select policy; deletes carry only the id.
do $$
begin
    if not exists (
        select 1 from pg_publication_tables
         where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'prayers'
    ) then
        alter publication supabase_realtime add table public.prayers;
    end if;
end;
$$;
