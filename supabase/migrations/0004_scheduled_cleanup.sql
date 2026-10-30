-- Jama'ah Beacon: hourly cleanup of expired beacons. Run after 0003. Safe to re-run.
--
-- The app never shows beacons more than 40 minutes after they start, and the API stops
-- returning them after an hour. This deletes the rows for good once they're a day old
-- (the extra time leaves room to look into reports or problems).
-- Deleting a beacon also deletes its tokens and reports (on delete cascade).

create extension if not exists pg_cron with schema pg_catalog;

-- Returns how many beacons were deleted.
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

    delete from private.rate_limits where window_start < now() - interval '2 days';

    return deleted;
end;
$$;

-- Every hour at :17. Scheduling under the same name again replaces the job, so re-running is safe.
select cron.schedule('prune-expired-beacons', '17 * * * *', $$select private.prune_expired_beacons()$$);
