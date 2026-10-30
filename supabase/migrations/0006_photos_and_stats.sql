-- Jama'ah Beacon: one photo per beacon, and anonymous daily usage counts.
-- Run after 0005. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Photos. Stored in Postgres (not Storage) so they're deleted with their beacon by the
-- same cascade. Images are re-encoded JPEGs of ~100–200 KB, capped at 400 KB.
-- ---------------------------------------------------------------------------

-- Null = no photo. Changes when the photo does, so clients know to refetch.
alter table public.prayers add column if not exists photo_updated_at timestamptz;

create table if not exists public.prayer_photos (
    prayer_id uuid primary key references public.prayers (id) on delete cascade,
    image bytea not null check (octet_length(image) <= 400000),
    content_type text not null check (content_type in ('image/jpeg', 'image/webp')),
    created_at timestamptz not null default now()
);
alter table public.prayer_photos enable row level security;
-- No policies on purpose: read through get_prayer_photo(), written through set_prayer_photo().
revoke all on public.prayer_photos from anon, authenticated;

-- Regular prayers keep a copy so each day's beacon gets the photo too.
alter table public.regular_prayers add column if not exists photo bytea;
alter table public.regular_prayers add column if not exists photo_type text;

-- Host-only. Pass null to remove the photo. Returns true on success.
create or replace function public.set_prayer_photo(prayer_id uuid, token text, image_base64 text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    img bytea;
    img_type text;
    target_regular uuid;
begin
    perform private.hit_rate_limit('photo', 20, interval '1 hour');

    if not private.is_host(set_prayer_photo.prayer_id, set_prayer_photo.token) then
        raise exception 'Only the host can change the photo.';
    end if;
    select p.regular_id into target_regular from public.prayers p where p.id = set_prayer_photo.prayer_id;

    if image_base64 is null then
        delete from public.prayer_photos ph where ph.prayer_id = set_prayer_photo.prayer_id;
        update public.prayers p set photo_updated_at = null where p.id = set_prayer_photo.prayer_id;
        update public.regular_prayers r set photo = null, photo_type = null where r.id = target_regular;
        return true;
    end if;

    img := decode(image_base64, 'base64');
    if octet_length(img) > 400000 then
        raise exception 'That photo is too large.';
    end if;
    -- Trust the bytes, not a client-supplied type.
    if substring(img from 1 for 3) = '\xffd8ff'::bytea then
        img_type := 'image/jpeg';
    elsif substring(img from 1 for 4) = '\x52494646'::bytea and substring(img from 9 for 4) = '\x57454250'::bytea then
        img_type := 'image/webp';
    else
        raise exception 'Unsupported image format.';
    end if;

    insert into public.prayer_photos (prayer_id, image, content_type)
    values (set_prayer_photo.prayer_id, img, img_type)
    on conflict on constraint prayer_photos_pkey
    do update set image = excluded.image, content_type = excluded.content_type, created_at = now();

    update public.prayers p set photo_updated_at = now() where p.id = set_prayer_photo.prayer_id;
    update public.regular_prayers r set photo = img, photo_type = img_type where r.id = target_regular;
    return true;
end;
$$;

-- A data: URL, or null. Same visibility as the beacon itself (not hidden, started within the hour).
create or replace function public.get_prayer_photo(prayer_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
    select 'data:' || ph.content_type || ';base64,' || translate(encode(ph.image, 'base64'), E'\n', '')
      from public.prayer_photos ph
      join public.prayers p on p.id = ph.prayer_id
     where ph.prayer_id = get_prayer_photo.prayer_id
       and p.hidden_at is null
       and p.iqamah_time >= now() - interval '1 hour';
$$;

revoke all on function public.set_prayer_photo(uuid, text, text) from public;
revoke all on function public.get_prayer_photo(uuid) from public;
grant execute on function public.set_prayer_photo(uuid, text, text) to anon, authenticated;
grant execute on function public.get_prayer_photo(uuid) to anon, authenticated;

-- Same as 0005, plus copying the template's photo onto each day's beacon.
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
             sisters_friendly, wudu_nearby, regular_id, occurrence_date, repeat_days, photo_updated_at)
        select r.salah_name, r.latitude, r.longitude, r.location_name, r.location_notes, occ.starts_at,
               r.sisters_friendly, r.wudu_nearby, r.id, occ.local_day, r.days,
               case when r.photo is not null then now() end
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
    )
    select count(*) into created_count from created;

    return created_count;
end;
$$;


-- ---------------------------------------------------------------------------
-- Usage stats: one counter per metric per (UTC) day. No identifiers of any kind.
-- ---------------------------------------------------------------------------

create table if not exists private.daily_stats (
    day date not null default current_date,
    metric text not null,
    count bigint not null default 0,
    constraint daily_stats_pkey primary key (day, metric)
);
alter table private.daily_stats enable row level security;

create or replace function private.bump(metric_name text, amount integer default 1)
returns void
language sql
security definer
set search_path = ''
as $$
    insert into private.daily_stats as s (day, metric, count)
    values (current_date, metric_name, amount)
    on conflict on constraint daily_stats_pkey do update set count = s.count + excluded.count;
$$;

-- Server-side events come from triggers, so they're counted however they happen.
create or replace function private.track_prayer_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if tg_op = 'INSERT' then
        perform private.bump(case when new.regular_id is null then 'beacon_created' else 'regular_day_created' end);
    elsif tg_op = 'UPDATE' then
        if new.attendee_count > old.attendee_count then
            perform private.bump('join', new.attendee_count - old.attendee_count);
        elsif new.attendee_count < old.attendee_count then
            perform private.bump('leave', old.attendee_count - new.attendee_count);
        end if;
        if new.updated_at is distinct from old.updated_at then perform private.bump('edit'); end if;
        if old.hidden_at is null and new.hidden_at is not null then perform private.bump('hidden'); end if;
        if new.photo_updated_at is not null and new.photo_updated_at is distinct from old.photo_updated_at then
            perform private.bump('photo_set');
        end if;
    elsif tg_op = 'DELETE' then
        -- Recent deletions are host cancels; the hourly cleanup only removes day-old rows.
        if old.iqamah_time > now() - interval '1 day' and old.hidden_at is null then
            perform private.bump('cancel');
        end if;
    end if;
    return null;
end;
$$;

drop trigger if exists track_prayer_changes on public.prayers;
create trigger track_prayer_changes
    after insert or update or delete on public.prayers
    for each row execute function private.track_prayer_changes();

create or replace function private.track_simple_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    perform private.bump(tg_argv[0]);
    return null;
end;
$$;

drop trigger if exists track_reports on public.prayer_reports;
create trigger track_reports after insert on public.prayer_reports
    for each row execute function private.track_simple_insert('report');

drop trigger if exists track_regular_created on public.regular_prayers;
create trigger track_regular_created after insert on public.regular_prayers
    for each row execute function private.track_simple_insert('regular_created');

-- Client-side events. Only these names are accepted; rate limited like everything else.
create or replace function public.track_event(event text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if event not in ('app_open', 'beacon_view', 'share', 'list_open') then
        return;
    end if;
    perform private.hit_rate_limit('track', 300, interval '10 minutes');
    perform private.bump(event);
end;
$$;

revoke all on function public.track_event(text) from public;
grant execute on function public.track_event(text) to anon, authenticated;

-- Run in the SQL editor: select * from private.daily_summary;
create or replace view private.daily_summary as
select day,
       coalesce(sum(count) filter (where metric = 'app_open'), 0)            as app_opens,
       coalesce(sum(count) filter (where metric = 'beacon_view'), 0)         as beacon_views,
       coalesce(sum(count) filter (where metric = 'list_open'), 0)           as list_opens,
       coalesce(sum(count) filter (where metric = 'beacon_created'), 0)      as beacons_created,
       coalesce(sum(count) filter (where metric = 'regular_created'), 0)     as regulars_created,
       coalesce(sum(count) filter (where metric = 'regular_day_created'), 0) as regular_days,
       coalesce(sum(count) filter (where metric = 'join'), 0)                as joins,
       coalesce(sum(count) filter (where metric = 'leave'), 0)               as undos,
       coalesce(sum(count) filter (where metric = 'share'), 0)               as shares,
       coalesce(sum(count) filter (where metric = 'edit'), 0)                as edits,
       coalesce(sum(count) filter (where metric = 'photo_set'), 0)           as photos,
       coalesce(sum(count) filter (where metric = 'cancel'), 0)              as cancels,
       coalesce(sum(count) filter (where metric = 'report'), 0)              as reports,
       coalesce(sum(count) filter (where metric = 'hidden'), 0)              as hidden
  from private.daily_stats
 group by day
 order by day desc;
