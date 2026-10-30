-- Mock beacons around central London. Times are relative to now(), so these show up
-- immediately and age out within ~2 hours. Re-run whenever you need fresh demo data.
-- (The SQL editor runs as postgres and bypasses RLS, so attendee_count > 1 is allowed here.)

insert into public.prayers
    (salah_name, latitude, longitude, location_name, location_notes, iqamah_time, sisters_friendly, wudu_nearby, attendee_count)
values
    ('Dhuhr', 51.51150, -0.11600, 'King''s College Strand, multi-faith room',
     'Ground floor, east wing. Follow the signs past the café.',
     now() - interval '3 minutes', true, true, 6),
    ('Dhuhr', 51.50800, -0.12250, 'Victoria Embankment Gardens',
     'On the grass behind the bandstand. Look for the green prayer mats.',
     now() + interval '8 minutes', false, false, 2),
    ('Asr', 51.51060, -0.12900, 'Charing Cross Library, 2nd floor',
     'Quiet study room 2B, at the far end past the periodicals.',
     now() + interval '95 minutes', true, true, 1);
