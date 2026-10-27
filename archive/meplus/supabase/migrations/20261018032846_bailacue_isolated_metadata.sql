-- ADDITIVE ONLY. Shared Me+ target explicitly authorised by the owner on 2026-10-18.
-- Reuse auth.users. No Me+ domain/health table is read or altered.
begin;
create table public.bailacue_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (username ~ '^[a-zA-Z0-9_]{3,30}$'),
  created_at timestamptz not null default now(),
  unique (username)
);
create unique index bailacue_username_folded on public.bailacue_profiles(lower(username));
create table public.bailacue_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google-drive','dropbox','webdav','s3')),
  account_ref text not null, display_name text not null,
  revoked_at timestamptz, created_at timestamptz not null default now(),
  unique(user_id,id), unique(user_id,provider,account_ref)
  -- Tokens belong in a server-side vault, not a client-readable table.
);
create table public.bailacue_sources (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null, folder_id text not null, name text not null,
  default_style text check(default_style in ('Salsa','Bachata','Other')), default_labels text[] not null default '{}',
  writable boolean not null default false, sync_cursor text, last_synced_at timestamptz,
  sync_state text not null default 'idle' check(sync_state in ('idle','syncing','reauth','failed')),
  error_code text, created_at timestamptz not null default now(), unique(user_id,id),
  unique(user_id,connection_id,folder_id),
  foreign key(user_id,connection_id) references public.bailacue_connections(user_id,id) on delete cascade
);
create table public.bailacue_videos (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null, provider_file_id text not null, original_name text not null,
  mime_type text not null check(mime_type like 'video/%'), size_bytes bigint not null default 0 check(size_bytes>=0),
  duration_seconds double precision not null default 0 check(duration_seconds>=0 and duration_seconds<'Infinity'::float8),
  thumbnail_ref text, available boolean not null default true, can_download boolean not null default false,
  modified_at timestamptz, created_at timestamptz not null default now(), unique(user_id,id),
  unique(user_id,connection_id,provider_file_id),
  foreign key(user_id,connection_id) references public.bailacue_connections(user_id,id) on delete cascade
);
create table public.bailacue_video_sources (
  user_id uuid not null references auth.users(id) on delete cascade, video_id uuid not null, source_id uuid not null,
  primary key(user_id,video_id,source_id),
  foreign key(user_id,video_id) references public.bailacue_videos(user_id,id) on delete cascade,
  foreign key(user_id,source_id) references public.bailacue_sources(user_id,id) on delete cascade
);
create table public.bailacue_video_state (
  user_id uuid not null references auth.users(id) on delete cascade, video_id uuid not null,
  title text not null, style text not null default 'Other' check(style in ('Salsa','Bachata','Other')),
  importance smallint not null default 3 check(importance between 1 and 5),
  learning_status text not null default 'To learn' check(learning_status in ('To learn','Practising','Learned')),
  teacher text, class_name text, location text, lesson_date date,
  resume_seconds double precision not null default 0 check(resume_seconds>=0 and resume_seconds<'Infinity'::float8),
  last_practised_at timestamptz, revision bigint not null default 1,
  updated_at timestamptz not null default now(), primary key(user_id,video_id),
  foreign key(user_id,video_id) references public.bailacue_videos(user_id,id) on delete cascade
);
create table public.bailacue_labels (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check(length(trim(name)) between 1 and 100), unique(user_id,id)
);
create unique index bailacue_label_names on public.bailacue_labels(user_id,lower(name));
create table public.bailacue_video_labels (
  user_id uuid not null references auth.users(id) on delete cascade, video_id uuid not null, label_id uuid not null,
  primary key(user_id,video_id,label_id),
  foreign key(user_id,video_id) references public.bailacue_videos(user_id,id) on delete cascade,
  foreign key(user_id,label_id) references public.bailacue_labels(user_id,id) on delete cascade
);
create table public.bailacue_playlists (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check(length(trim(name)) between 1 and 200), created_at timestamptz not null default now(), unique(user_id,id)
);
create table public.bailacue_playlist_items (
  user_id uuid not null references auth.users(id) on delete cascade, playlist_id uuid not null, video_id uuid not null,
  position integer not null check(position>=0), primary key(user_id,playlist_id,video_id),
  unique(user_id,playlist_id,position) deferrable initially deferred,
  foreign key(user_id,playlist_id) references public.bailacue_playlists(user_id,id) on delete cascade,
  foreign key(user_id,video_id) references public.bailacue_videos(user_id,id) on delete cascade
);
create table public.bailacue_notes (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  video_id uuid not null, text text not null check(length(trim(text)) between 1 and 20000),
  at_seconds double precision check(at_seconds>=0 and at_seconds<'Infinity'::float8),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), revision bigint not null default 1,
  foreign key(user_id,video_id) references public.bailacue_videos(user_id,id) on delete cascade
);
create table public.bailacue_bookmarks (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  video_id uuid not null, name text not null, at_seconds double precision not null check(at_seconds>=0 and at_seconds<'Infinity'::float8),
  foreign key(user_id,video_id) references public.bailacue_videos(user_id,id) on delete cascade
);
create table public.bailacue_segments (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  video_id uuid not null, name text not null, start_seconds double precision not null check(start_seconds>=0),
  end_seconds double precision not null check(end_seconds>start_seconds and end_seconds-start_seconds>=0.25 and end_seconds<'Infinity'::float8),
  foreign key(user_id,video_id) references public.bailacue_videos(user_id,id) on delete cascade
);
create table public.bailacue_sessions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  video_id uuid, started_at timestamptz not null, duration_seconds integer not null check(duration_seconds>0),
  foreign key(user_id,video_id) references public.bailacue_videos(user_id,id)
);
create table public.bailacue_goals (
  user_id uuid primary key references auth.users(id) on delete cascade,
  weekly_minutes integer not null default 60 check(weekly_minutes between 1 and 10080)
);
create table public.bailacue_recommendation_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true, labels text[] not null default '{}', styles text[] not null default '{}',
  levels text[] not null default '{}', teachers text[] not null default '{}',
  videos_per_day integer not null default 1 check(videos_per_day between 1 and 10),
  cooldown_days integer not null default 3 check(cooldown_days between 0 and 365),
  weekdays integer[] not null default '{1,2,3,4,5,6,0}', timezone text not null default 'UTC'
);
create table public.bailacue_daily_picks (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  local_day date not null, skipped boolean not null default false, created_at timestamptz not null default now(),
  unique(user_id,id), unique(user_id,local_day)
);
create table public.bailacue_daily_pick_items (
  user_id uuid not null references auth.users(id) on delete cascade, pick_id uuid not null, video_id uuid not null,
  position integer not null check(position>=0), reason text not null,
  primary key(user_id,pick_id,video_id), unique(user_id,pick_id,position),
  foreign key(user_id,pick_id) references public.bailacue_daily_picks(user_id,id) on delete cascade,
  foreign key(user_id,video_id) references public.bailacue_videos(user_id,id) on delete cascade
);
create table public.bailacue_feedback (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  video_id uuid not null, kind text not null check(kind in ('more','less','learned')), created_at timestamptz not null default now(),
  foreign key(user_id,video_id) references public.bailacue_videos(user_id,id) on delete cascade
);
create table public.bailacue_upload_jobs (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade, source_id uuid not null,
  provider_file_id text not null, status text not null default 'queued' check(status in ('queued','uploading','processing','ready','failed','cancelled')),
  total_bytes bigint not null check(total_bytes>=0), confirmed_bytes bigint not null default 0 check(confirmed_bytes>=0 and confirmed_bytes<=total_bytes),
  updated_at timestamptz not null default now(), unique(user_id,id),
  foreign key(user_id,source_id) references public.bailacue_sources(user_id,id) on delete cascade
  -- Resumable session URLs can contain credentials: keep them in secure device/server storage.
);
create table public.bailacue_notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  practice_enabled boolean not null default false, picks_enabled boolean not null default false,
  local_time time not null default '19:00', quiet_start time not null default '22:00', quiet_end time not null default '08:00',
  timezone text not null default 'UTC', weekdays integer[] not null default '{1,2,3,4,5,6,0}'
);
create table public.bailacue_push_devices (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique, platform text not null check(platform in ('android','ios')), revoked_at timestamptz,
  last_seen_at timestamptz not null default now()
);
create table public.bailacue_share_grants (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  playlist_id uuid not null, recipient_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(), revoked_at timestamptz,
  check(recipient_id<>user_id), unique(playlist_id,recipient_id),
  foreign key(user_id,playlist_id) references public.bailacue_playlists(user_id,id) on delete cascade
  -- Grants are owner-only until the provider-permission-aware sharing endpoint exists.
);
-- All client-facing tables: explicit grants plus owner isolation for every operation.
-- Composite owner FKs prevent a user from attaching their rows to another user's IDs.
do $$
declare t text;
begin
  foreach t in array array['profiles','connections','sources','videos','video_sources','video_state','labels','video_labels','playlists','playlist_items','notes','bookmarks','segments','sessions','goals','recommendation_preferences','daily_picks','daily_pick_items','feedback','upload_jobs','notification_preferences','push_devices','share_grants'] loop
    execute format('alter table public.bailacue_%I enable row level security',t);
    execute format('revoke all on table public.bailacue_%I from public, anon',t);
    execute format('grant select,insert,update,delete on table public.bailacue_%I to authenticated',t);
    execute format('create policy owner_access on public.bailacue_%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',t);
  end loop;
end $$;
-- Validate bounds against provider duration on writes, not merely in the client.
create function public.bailacue_validate_video_time() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare video_duration double precision;
begin
  select duration_seconds into video_duration from public.bailacue_videos where id=new.video_id and user_id=new.user_id;
  if video_duration is null or video_duration<=0 then raise exception 'Video duration is unavailable'; end if;
  if tg_table_name='bailacue_segments' then
    if new.end_seconds>video_duration then raise exception 'Section exceeds video duration'; end if;
  elsif new.at_seconds is not null and new.at_seconds>video_duration then raise exception 'Timestamp exceeds video duration'; end if;
  return new;
end $$;
revoke all on function public.bailacue_validate_video_time() from public;
create trigger bailacue_segment_bounds before insert or update on public.bailacue_segments for each row execute function public.bailacue_validate_video_time();
create trigger bailacue_bookmark_bounds before insert or update on public.bailacue_bookmarks for each row execute function public.bailacue_validate_video_time();
create trigger bailacue_note_bounds before insert or update on public.bailacue_notes for each row execute function public.bailacue_validate_video_time();
create index bailacue_sources_owner on public.bailacue_sources(user_id);
create index bailacue_videos_owner on public.bailacue_videos(user_id);
create index bailacue_videos_connection on public.bailacue_videos(user_id,connection_id);
create index bailacue_notes_video on public.bailacue_notes(user_id,video_id);
create index bailacue_sessions_owner_date on public.bailacue_sessions(user_id,started_at desc);
create index bailacue_video_sources_source on public.bailacue_video_sources(user_id,source_id);
create index bailacue_video_labels_label on public.bailacue_video_labels(user_id,label_id);
create index bailacue_playlist_items_video on public.bailacue_playlist_items(user_id,video_id);
create index bailacue_bookmarks_video on public.bailacue_bookmarks(user_id,video_id);
create index bailacue_segments_video on public.bailacue_segments(user_id,video_id);
create index bailacue_sessions_video on public.bailacue_sessions(user_id,video_id);
create index bailacue_pick_items_video on public.bailacue_daily_pick_items(user_id,video_id);
create index bailacue_feedback_video on public.bailacue_feedback(user_id,video_id);
create index bailacue_upload_jobs_source on public.bailacue_upload_jobs(user_id,source_id);
create index bailacue_push_devices_owner on public.bailacue_push_devices(user_id);
create index bailacue_share_grants_playlist on public.bailacue_share_grants(user_id,playlist_id);
create index bailacue_share_grants_recipient on public.bailacue_share_grants(recipient_id);
commit;
