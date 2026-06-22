-- ==========================================
-- SKINBRIDGE SUPABASE DATABASE SCHEMA SETUP
-- ==========================================

-- 1. Table: shares_roblox (Roblox clothing shares)
create table if not exists shares_roblox (
  slug text primary key,
  skin_url text not null,
  shirt_url text not null,
  pants_url text not null,
  preview_url text,
  arm_type text not null check (arm_type in ('steve', 'alex')),
  creator_name text,
  description text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS on shares_roblox
alter table shares_roblox enable row level security;

-- Policies for shares_roblox
create policy "Permitir lectura publica en shares_roblox" 
  on shares_roblox for select 
  using (true);

create policy "shares_roblox_insert_v3" 
  on shares_roblox for insert 
  with check (slug is not null);


-- 2. Table: shares_head3d (3D Head shares)
create table if not exists shares_head3d (
  slug text primary key,
  preview_url text not null,
  skin_url text not null,
  face_urls jsonb not null,
  creator_name text,
  description text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS on shares_head3d
alter table shares_head3d enable row level security;

-- Policies for shares_head3d
create policy "Permitir lectura publica en shares_head3d" 
  on shares_head3d for select 
  using (true);

create policy "shares_head3d_insert_v3" 
  on shares_head3d for insert 
  with check (slug is not null);


-- 3. Table: rate_limits (Server-side IP rate limiting)
create table if not exists rate_limits (
  id uuid primary key default gen_random_uuid(),
  ip text not null,
  workspace text not null check (workspace in ('roblox', 'head3d')),
  created_at timestamptz not null default now()
);

-- Composite index for quick rate limit evaluations
create index if not exists idx_rate_limits_ip_workspace_time
  on rate_limits (ip, workspace, created_at desc);

-- Enable RLS on rate_limits (no public policies, accessible only via service_role by Edge Functions)
alter table rate_limits enable row level security;


-- 4. Unified View: shares_all (Merges shares & filters for last 7 days)
create or replace view shares_all as
select 
  slug,
  creator_name,
  description,
  preview_url,
  created_at,
  'roblox' as type,
  skin_url
from shares_roblox
where created_at >= now() - interval '7 days'
union all
select 
  slug,
  creator_name,
  description,
  preview_url,
  created_at,
  'head3d' as type,
  skin_url
from shares_head3d
where created_at >= now() - interval '7 days';

-- Grant access to the view for anonymous/public users
grant select on table shares_all to anon;
grant select on table shares_all to authenticated;


-- 5. Storage Bucket Setup (Guidelines)
-- Note: Create a public storage bucket named 'conversions' in your Supabase console.
-- Then run the following policy to allow anonymous uploads (INSERT):
--
-- CREATE POLICY "Permitir subida publica a conversions"
-- ON storage.objects
-- FOR INSERT
-- WITH CHECK (bucket_id = 'conversions');


-- 6. Auto-Deletion Cleanup Job (Requires pg_cron extension)
-- Enable pg_cron in Supabase under Database -> Extensions -> pg_cron
create extension if not exists pg_cron;

select cron.schedule(
  'cleanup-expired-shares',
  '0 0 * * *', -- Runs every day at midnight UTC
  $$
    delete from shares_roblox where created_at < now() - interval '7 days';
    delete from shares_head3d where created_at < now() - interval '7 days';
  $$
);
