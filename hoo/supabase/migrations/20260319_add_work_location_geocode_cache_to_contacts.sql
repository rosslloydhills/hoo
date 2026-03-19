alter table public.contacts
add column if not exists work_location_lat double precision,
add column if not exists work_location_lng double precision,
add column if not exists work_location_geocoded_at timestamp with time zone;

