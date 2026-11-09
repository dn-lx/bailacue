-- Engineering assertions against the deployed policies; test writes roll back.
begin;
set local role anon;
do $$
declare video_id text := 'drive:1Cx4u_egH_JHw94bwY8ct-Cy8dLbyXN1_'; result jsonb; label jsonb; duplicate jsonb;
begin
  result := public.bailacue_patch_web_metadata(video_id,'{"notes":"Anonymous save check","rating":8,"recordedAt":"2026-11-06"}');
  assert result->>'notes'='Anonymous save check' and result->>'rating'='8';
  result := public.bailacue_patch_web_metadata(video_id,'{"title":"Shared title check"}');
  assert result->>'notes'='Anonymous save check' and result->>'title'='Shared title check';
  result := public.bailacue_patch_web_metadata(video_id,'{"rating":null,"recordedAt":"","labelIds":[],"artistIds":[]}');
  assert result->'rating'='null'::jsonb and result->>'recordedAt'='';
  assert not public.bailacue_valid_web_metadata('{"addedAt":"2026-11-01"}');
  assert not public.bailacue_valid_web_metadata('{"rating":11}');
  assert not public.bailacue_valid_web_metadata('{"recordedAt":"2026-02-30"}');
  begin
    perform public.bailacue_patch_web_metadata('drive:unknown_123456','{"notes":"Invalid source"}');
    raise exception 'Unknown source was accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.bailacue_patch_web_metadata(video_id,'{"providerId":"replacement"}');
    raise exception 'Protected source field was accepted';
  exception when invalid_parameter_value then null; end;
  begin
    insert into public.bailacue_web_content(key,payload) values ('stream:'||video_id,'{}');
    raise exception 'Anonymous source mutation was accepted';
  exception when insufficient_privilege then null; end;
  assert not has_table_privilege('anon','public.bailacue_web_content','DELETE');
  label := public.bailacue_add_web_label('BailaCue rollback test teacher','Artist','Both');
  duplicate := public.bailacue_add_web_label('  BailaCue  rollback test teacher  ','Artist','Salsa');
  assert label->>'id'=duplicate->>'id';
  result := public.bailacue_patch_web_metadata(video_id,jsonb_build_object('artistIds',jsonb_build_array(label->>'id')));
  assert result->'artistIds'=jsonb_build_array(label->>'id');
  begin
    update public.bailacue_web_content set payload='{"items":[]}' where key='labels';
    raise exception 'Existing shared labels could be removed';
  exception when insufficient_privilege then null; end;
  begin
    update public.bailacue_web_content set key='meta:drive:unknown_123456' where key='labels';
    raise exception 'Public content keys could be changed';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
do $$
declare result jsonb;
begin
  result := public.bailacue_patch_web_metadata('drive:1Cx4u_egH_JHw94bwY8ct-Cy8dLbyXN1_','{"location":"Authenticated non-owner check"}');
  assert result->>'location'='Authenticated non-owner check';
  assert result->>'title'='Shared title check';
end;
$$;
rollback;
