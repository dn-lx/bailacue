-- Add structured BailaCue practice metadata while retaining legacy labels and ratings for backup compatibility.
create or replace function public.bailacue_valid_web_metadata(p_value jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare item record; element jsonb; text_value text;
begin
  if jsonb_typeof(p_value) is distinct from 'object' or octet_length(p_value::text) > 24000 then return false; end if;
  for item in select * from jsonb_each(p_value) loop
    if item.key not in ('title','notes','labelIds','artistIds','recordedAt','event','location','rating','moves','danceStyles','moveIds','styleTimingIds','level') then return false; end if;
    if item.value = 'null'::jsonb then continue; end if;
    if item.key in ('title','notes','event','location','recordedAt') then
      if jsonb_typeof(item.value) is distinct from 'string' then return false; end if;
      text_value := item.value #>> '{}';
      if length(text_value) > (case when item.key='notes' then 10000 else 160 end) then return false; end if;
      if item.key='recordedAt' and text_value <> '' then
        if text_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return false; end if;
        begin perform text_value::date; exception when others then return false; end;
      end if;
    elsif item.key='rating' then
      if jsonb_typeof(item.value) is distinct from 'number' then return false; end if;
      if (item.value::text)::numeric not between 1 and 10 or (item.value::text)::numeric <> trunc((item.value::text)::numeric) then return false; end if;
    elsif item.key='level' then
      if jsonb_typeof(item.value) is distinct from 'string' or item.value #>> '{}' not in ('Basic','Intermediate','Advanced') then return false; end if;
    else
      if jsonb_typeof(item.value) is distinct from 'array' or jsonb_array_length(item.value) > 100 then return false; end if;
      for element in select * from jsonb_array_elements(item.value) loop
        if jsonb_typeof(element) is distinct from 'string' then return false; end if;
        if item.key in ('moves','danceStyles') then
          if length(btrim(element #>> '{}')) not between 1 and 80 then return false; end if;
        else
          if (element #>> '{}') !~ '^[A-Za-z0-9_-]{1,100}$' then return false; end if;
        end if;
      end loop;
    end if;
  end loop;
  return true;
end; $$;

create or replace function public.bailacue_valid_web_labels(p_value jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare item jsonb;
begin
  if jsonb_typeof(p_value) is distinct from 'object' or p_value - 'items' <> '{}'::jsonb or jsonb_typeof(p_value->'items') is distinct from 'array' then return false; end if;
  if jsonb_array_length(p_value->'items') > 2000 or octet_length(p_value::text) > 500000 then return false; end if;
  for item in select * from jsonb_array_elements(p_value->'items') loop
    if jsonb_typeof(item) is distinct from 'object' or item - array['id','name','type','dance'] <> '{}'::jsonb then return false; end if;
    if jsonb_typeof(item->'id') is distinct from 'string' or item->>'id' !~ '^[A-Za-z0-9_-]{1,100}$' then return false; end if;
    if jsonb_typeof(item->'name') is distinct from 'string' or length(btrim(item->>'name')) not between 1 and 80 then return false; end if;
    if coalesce(item->>'type','') not in ('Moves','Style & timing','Style','Technique','Video type','Level','Artist') or coalesce(item->>'dance','') not in ('Both','Salsa','Bachata') then return false; end if;
  end loop;
  if exists (select 1 from jsonb_array_elements(p_value->'items') x group by x->>'id' having count(*) > 1) then return false; end if;
  if exists (select 1 from jsonb_array_elements(p_value->'items') x group by x->>'type', lower(regexp_replace(btrim(normalize(x->>'name', NFKC)), '\s+', ' ', 'g')) having count(*) > 1) then return false; end if;
  return true;
end; $$;

create or replace function public.bailacue_add_web_label(p_name text, p_type text, p_dance text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare directory jsonb; item jsonb; label_name text;
begin
  label_name := regexp_replace(btrim(normalize(p_name, NFKC)), '\s+', ' ', 'g');
  if label_name is null or length(label_name) not between 1 and 80 or coalesce(p_type,'') not in ('Moves','Style & timing','Style','Technique','Video type','Level','Artist') or coalesce(p_dance,'') not in ('Both','Salsa','Bachata') then
    raise exception 'Invalid label or artist' using errcode='22023';
  end if;
  select payload into directory from public.bailacue_web_content where key='labels' for update;
  if directory is null then raise exception 'Shared labels are unavailable' using errcode='55000'; end if;
  for item in select * from jsonb_array_elements(directory->'items') loop
    if item->>'type'=p_type and lower(regexp_replace(btrim(normalize(item->>'name', NFKC)), '\s+', ' ', 'g'))=lower(label_name) then return item; end if;
  end loop;
  item := jsonb_build_object('id','custom-'||gen_random_uuid()::text,'name',label_name,'type',p_type,'dance',p_dance);
  update public.bailacue_web_content set payload=jsonb_set(directory,'{items}',(directory->'items')||jsonb_build_array(item)),updated_at=now() where key='labels';
  return item;
end; $$;
