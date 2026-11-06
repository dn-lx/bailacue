-- Isolated public BailaCue web content. No existing Me+ tables changed.
create table public.bailacue_web_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.bailacue_web_admins enable row level security;
revoke all on public.bailacue_web_admins from anon, authenticated;
grant select on public.bailacue_web_admins to authenticated;
create policy bailacue_web_admin_select_self on public.bailacue_web_admins
  for select to authenticated using (user_id = (select auth.uid()));

create table public.bailacue_web_content (
  key text primary key check (length(key) between 1 and 200),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 2000000),
  updated_at timestamptz not null default now()
);
alter table public.bailacue_web_content enable row level security;
revoke all on public.bailacue_web_content from anon, authenticated;
grant select on public.bailacue_web_content to anon, authenticated;
grant insert, update, delete on public.bailacue_web_content to authenticated;
create policy bailacue_web_public_read on public.bailacue_web_content
  for select to anon, authenticated using (true);
create policy bailacue_web_admin_insert on public.bailacue_web_content
  for insert to authenticated
  with check (exists (select 1 from public.bailacue_web_admins where user_id = (select auth.uid())));
create policy bailacue_web_admin_update on public.bailacue_web_content
  for update to authenticated
  using (exists (select 1 from public.bailacue_web_admins where user_id = (select auth.uid())))
  with check (exists (select 1 from public.bailacue_web_admins where user_id = (select auth.uid())));
create policy bailacue_web_admin_delete on public.bailacue_web_content
  for delete to authenticated
  using (exists (select 1 from public.bailacue_web_admins where user_id = (select auth.uid())));

-- Provision the single authorized account in Supabase: insert into public.bailacue_web_admins(user_id) values ('<owner auth.users.id>');
