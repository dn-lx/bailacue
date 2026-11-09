create or replace function public.bailacue_guard_public_web_edit()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare public_editor boolean := false;
begin
  if current_user='anon' then public_editor := true;
  elsif current_user='authenticated' then
    public_editor := not exists(select 1 from public.bailacue_web_admins where user_id=(select auth.uid()));
  end if;
  if not public_editor then return new; end if;
  if tg_op='UPDATE' and new.key is distinct from old.key then raise exception 'Content keys cannot be changed' using errcode='42501'; end if;
  if new.key='labels' then
    if tg_op <> 'UPDATE' then raise exception 'Only new label entries can be added' using errcode='42501'; end if;
    if not public.bailacue_valid_web_labels(new.payload) or not ((new.payload->'items') @> (old.payload->'items')) then
      raise exception 'Existing shared labels cannot be changed or removed' using errcode='42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end; $$;
