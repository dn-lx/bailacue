-- Add structured BailaCue practice metadata while retaining legacy labels and ratings for backup compatibility.
create or replace function public.bailacue_valid_web_metadata(p_value jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare item record; element jsonb; text_value text;
begin
  if jsonb_typeof(p_value) is distinct from 'object' or octet_length(p_value::text) > 24000 then return false; end if;
  for item in select * from jsonb_each(p_value) loop
    if item.key not in ('title','notes','labelIds','artistIds','recordedAt','event','location','rating','moves','danceStyles','level') then return false; end if;
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
