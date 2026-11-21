-- BailaCue structured classification. Applied to Me+ Supabase on 2026-11-21.
-- The legacy bailacue_web_content.labels directory remains the compatibility source.
create table if not exists public.bailacue_taxonomy_terms (
 id text primary key check (id ~ '^[A-Za-z0-9_-]{1,100}$'),
 name text not null check(length(btrim(name)) between 1 and 80),
 category text not null check(category in ('Style','Moves','Position','Technique','Musicality','Video type','Artist')),
 dance text not null default 'Both' check(dance in ('Both','Salsa','Bachata')),
 legacy_type text,
 created_at timestamptz not null default now(),
 unique(category,dance,name)
);
create table if not exists public.bailacue_taxonomy_aliases (
 id bigint generated always as identity primary key,
 term_id text not null references public.bailacue_taxonomy_terms(id) on delete cascade,
 alias text not null check(length(btrim(alias)) between 1 and 80),
 unique(term_id,alias)
);
create table if not exists public.bailacue_taxonomy_relations (
 source_id text not null references public.bailacue_taxonomy_terms(id) on delete cascade,
 target_id text not null references public.bailacue_taxonomy_terms(id) on delete cascade,
 relation text not null check(relation in ('prerequisite','variation','related')),
 primary key(source_id,target_id,relation),
 check(source_id <> target_id)
);
create table if not exists public.bailacue_video_cues (
 id uuid primary key default gen_random_uuid(),
 video_key text not null check(length(video_key) between 5 and 200),
 term_id text not null references public.bailacue_taxonomy_terms(id) on delete restrict,
 start_seconds numeric(10,2) not null check(start_seconds >= 0),
 end_seconds numeric(10,2) check(end_seconds is null or end_seconds > start_seconds),
 notes text not null default '' check(length(notes)<=500),
 created_at timestamptz not null default now()
);
create index if not exists bailacue_video_cues_lookup on public.bailacue_video_cues(video_key,start_seconds);
create index if not exists bailacue_terms_category on public.bailacue_taxonomy_terms(category,dance);
alter table public.bailacue_taxonomy_terms enable row level security;
alter table public.bailacue_taxonomy_aliases enable row level security;
alter table public.bailacue_taxonomy_relations enable row level security;
alter table public.bailacue_video_cues enable row level security;
-- No broad anon/authenticated write policies.
insert into public.bailacue_taxonomy_terms(id,name,category,dance,legacy_type)
select item->>'id',item->>'name',
case when item->>'type'='Style & timing' then 'Style' else item->>'type' end,
item->>'dance',item->>'type'
from public.bailacue_web_content c cross join lateral jsonb_array_elements(c.payload->'items') item
where c.key='labels' and item->>'type' <> 'Level'
on conflict(id) do nothing;
