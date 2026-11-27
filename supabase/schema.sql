-- Stylo schema: run once in Supabase → SQL Editor.
-- Every table is private per user (Row Level Security), and photos go to a private storage bucket.

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text,
  height_cm numeric,
  anchors jsonb default '{}'::jsonb,   -- optional: weight, usual jeans waist, usual top size
  body jsonb,                          -- computed measurements + sizes + confidence
  color jsonb,                         -- skin tone, season, palette
  prefs jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  path text not null,                  -- storage: stylo/{user_id}/photos/...
  kind text check (kind in ('front','side')),
  analysis jsonb,                      -- on-device measurement output (keypoints, scan lines, widths, skin LAB)
  created_at timestamptz default now()
);

create table if not exists public.saved_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  path text,                           -- screenshot
  source_url text,                     -- Myntra/Ajio/... link
  data jsonb,                          -- Gemini extraction + verdict
  created_at timestamptz default now()
);

create table if not exists public.tryons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  path text not null,
  item jsonb,
  rating int check (rating between 1 and 5),
  created_at timestamptz default now()
);

create table if not exists public.interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  kind text not null,                  -- like | dislike | pick | reject | shop | rate
  item_id text,
  payload jsonb,
  created_at timestamptz default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  role text check (role in ('user','model')),
  content text,
  created_at timestamptz default now()
);

create index if not exists photos_user_idx on public.photos (user_id, created_at desc);
create index if not exists saved_user_idx on public.saved_items (user_id, created_at desc);
create index if not exists tryons_user_idx on public.tryons (user_id, created_at desc);
create index if not exists interactions_user_idx on public.interactions (user_id, created_at desc);
create index if not exists chat_user_idx on public.chat_messages (user_id, created_at desc);

-- Row Level Security: users only ever see their own rows
alter table public.profiles enable row level security;
alter table public.photos enable row level security;
alter table public.saved_items enable row level security;
alter table public.tryons enable row level security;
alter table public.interactions enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());
do $$ declare t text; begin
  foreach t in array array['photos','saved_items','tryons','interactions','chat_messages'] loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- Private storage bucket; files live under {user_id}/...
insert into storage.buckets (id, name, public, file_size_limit)
values ('stylo', 'stylo', false, 10485760)
on conflict (id) do nothing;

drop policy if exists "stylo own files read" on storage.objects;
drop policy if exists "stylo own files write" on storage.objects;
drop policy if exists "stylo own files delete" on storage.objects;
create policy "stylo own files read" on storage.objects for select
  using (bucket_id = 'stylo' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "stylo own files write" on storage.objects for insert
  with check (bucket_id = 'stylo' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "stylo own files delete" on storage.objects for delete
  using (bucket_id = 'stylo' and (storage.foldername(name))[1] = auth.uid()::text);
