alter table public.contacts
add column if not exists needs_linkedin_search boolean not null default false;
