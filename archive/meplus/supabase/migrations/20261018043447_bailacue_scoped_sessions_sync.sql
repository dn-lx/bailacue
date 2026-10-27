-- BailaCue-only API state. No Me+ objects or authentication settings are changed.
begin;
create table public.bailacue_app_sessions (
 token_hash text primary key check(length(token_hash)=64), user_id uuid not null references auth.users(id) on delete cascade,
 expires_at timestamptz not null, created_at timestamptz not null default now()
);
create index bailacue_app_sessions_owner on public.bailacue_app_sessions(user_id);
create index bailacue_app_sessions_expiry on public.bailacue_app_sessions(expires_at);
create table public.bailacue_sync_snapshots (
 user_id uuid primary key references auth.users(id) on delete cascade, revision bigint not null default 0 check(revision>=0),
 payload jsonb not null default '{}'::jsonb check(pg_column_size(payload)<=2097152), updated_at timestamptz not null default now()
);
create table public.bailacue_api_rate_limits (
 key_hash text primary key, window_number bigint not null, attempts integer not null default 1, updated_at timestamptz not null default now()
);
alter table public.bailacue_app_sessions enable row level security;
alter table public.bailacue_sync_snapshots enable row level security;
alter table public.bailacue_api_rate_limits enable row level security;
revoke all on public.bailacue_app_sessions, public.bailacue_sync_snapshots, public.bailacue_api_rate_limits from public,anon,authenticated;
grant all on public.bailacue_app_sessions, public.bailacue_sync_snapshots, public.bailacue_api_rate_limits to service_role;
create function public.bailacue_rate_limit(p_key text, p_limit integer) returns boolean
language plpgsql security invoker set search_path='' as $$
declare n integer; w bigint := floor(extract(epoch from now())/900);
begin
 insert into public.bailacue_api_rate_limits as r(key_hash,window_number) values(p_key,w)
 on conflict(key_hash) do update set window_number=w, attempts=case when r.window_number=w then r.attempts+1 else 1 end, updated_at=now()
 returning attempts into n;
 return n<=p_limit;
end; $$;
revoke all on function public.bailacue_rate_limit(text,integer) from public,anon,authenticated;
grant execute on function public.bailacue_rate_limit(text,integer) to service_role;
create table public.bailacue_collection_shares (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 recipient_id uuid not null references auth.users(id) on delete cascade, sender_name text not null, recipient_name text not null,
 payload jsonb not null check(pg_column_size(payload)<=262144), revoked_at timestamptz, created_at timestamptz not null default now(),
 check(user_id<>recipient_id)
);
create index bailacue_collection_shares_sender on public.bailacue_collection_shares(user_id);
create index bailacue_collection_shares_recipient on public.bailacue_collection_shares(recipient_id);
alter table public.bailacue_collection_shares enable row level security;
revoke all on public.bailacue_collection_shares from public,anon,authenticated;
grant all on public.bailacue_collection_shares to service_role;
create function public.bailacue_delete_app_data(p_user_id uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare t text;
begin
 delete from public.bailacue_collection_shares where recipient_id=p_user_id;
 foreach t in array array['collection_shares','app_sessions','sync_snapshots','share_grants','push_devices','notification_preferences','upload_jobs','feedback','daily_pick_items','daily_picks','recommendation_preferences','goals','sessions','segments','bookmarks','notes','playlist_items','playlists','video_labels','labels','video_state','video_sources','videos','sources','connections','profiles'] loop
  execute format('delete from public.%I where user_id=$1','bailacue_'||t) using p_user_id;
 end loop;
end; $$;
revoke all on function public.bailacue_delete_app_data(uuid) from public,anon,authenticated;
grant execute on function public.bailacue_delete_app_data(uuid) to service_role;
commit;
