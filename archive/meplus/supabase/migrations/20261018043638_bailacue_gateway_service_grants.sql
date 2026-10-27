-- BailaCue-only gateway privileges. Me+ default privileges do not grant service access to new tables.
begin;
grant select, delete on public.bailacue_profiles, public.bailacue_connections, public.bailacue_sources, public.bailacue_videos, public.bailacue_video_sources, public.bailacue_video_state, public.bailacue_labels, public.bailacue_video_labels, public.bailacue_playlists, public.bailacue_playlist_items, public.bailacue_notes, public.bailacue_bookmarks, public.bailacue_segments, public.bailacue_sessions, public.bailacue_goals, public.bailacue_recommendation_preferences, public.bailacue_daily_picks, public.bailacue_daily_pick_items, public.bailacue_feedback, public.bailacue_upload_jobs, public.bailacue_notification_preferences, public.bailacue_push_devices, public.bailacue_share_grants to service_role;
grant insert on public.bailacue_profiles to service_role;
commit;
