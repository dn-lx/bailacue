-- Public collaborative annotations, explicitly requested by the site owner.
-- Existing source/admin policies remain in place. All functions are invokers.
create or replace function public.bailacue_valid_web_metadata(p_value jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare item record; element jsonb; text_value text;
begin
  if jsonb_typeof(p_value) is distinct from 'object' or octet_length(p_value::text) > 24000 then return false; end if;
  for item in select * from jsonb_each(p_value) loop
    if item.key not in ('title','notes','labelIds','artistIds','recordedAt','event','location','rating') then return false; end if;
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
    else
      if jsonb_typeof(item.value) is distinct from 'array' then return false; end if;
      if jsonb_array_length(item.value) > 100 then return false; end if;
      for element in select * from jsonb_array_elements(item.value) loop
        if jsonb_typeof(element) is distinct from 'string' or (element #>> '{}') !~ '^[A-Za-z0-9_-]{1,100}$' then return false; end if;
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
    if coalesce(item->>'type','') not in ('Style','Technique','Video type','Level','Artist') or coalesce(item->>'dance','') not in ('Both','Salsa','Bachata') then return false; end if;
  end loop;
  if exists (select 1 from jsonb_array_elements(p_value->'items') x group by x->>'id' having count(*) > 1) then return false; end if;
  if exists (select 1 from jsonb_array_elements(p_value->'items') x group by x->>'type', lower(regexp_replace(btrim(normalize(x->>'name', NFKC)), '\s+', ' ', 'g')) having count(*) > 1) then return false; end if;
  return true;
end; $$;

create or replace function public.bailacue_known_web_video(p_video_id text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select p_video_id = any(array['drive:1Cx4u_egH_JHw94bwY8ct-Cy8dLbyXN1_',
'drive:19nr8z0wHiZATj9XQtXswqwhy6SNjrgNH',
'drive:1p5GTA8FvmQh_9OmaOPe3Ql4U6r0e8DBy',
'drive:14_r0APhy1uf_j6Md3RrgGVmpVgVqgr87',
'drive:1Zi8lt0eve5vGtuHpfwz4Am7EdaNgkR7Q',
'drive:13Wr9uj0fvkcZWQ99VhXZIsemcA_PV-dt',
'drive:1EBTKLlXyIrWER1eFckgaedZ5OwNu9HrH',
'drive:1ldidAfGs1QPk94whQ16_hJRe6r2ogAaM',
'drive:1QOuF2CLb0seIREsc7Lt2EuMFgvjjzvMq',
'drive:1DJ1C8V3D9R1evu308YfTNXV4R93_zH8F',
'drive:1Hut55rEGWcylKdRyKmlsBubccZ4ZH_iE',
'drive:1Y3C9Sy3ndBvNKvhOCD9I1Kmb2hq69OH7',
'drive:1RHVDBkne3RqcHDefw01g4zkxnD0a4ur6',
'drive:18VkH5hDhEe1XF-ShUQknjpwkvlkHgMno',
'drive:1TuCeX8eviA-pHsbGuQW8CBinnmcfGf9f',
'drive:1dqvoPS_tUci8BDJion1hungGbGM6J2eb',
'drive:197ht8h9GjwtsGDiPofV74W9E2X5puQVH',
'drive:1GTGirjA1oGWSXWMtJOaLa5JYqRZPCRuL',
'drive:1-ItRZqB2NqiKBd0LvG4DPgMHqQOTLhTe',
'drive:1tueqUGHkhT64-JKni0xZH540tDd8hQqw',
'drive:1a06BbbJY51c-2Gu8AYCJ86vhgtNfx9hw',
'drive:1_159SWmhorpleAQBPR3RkD9md-38t1d_',
'drive:1S6wKMG3kCTBgIa9FkG_ynFV6cZFovvtr',
'drive:1BAUnPtthBwpCxlwXRYR-_NZhLlonsPu5',
'drive:10PzuU3CQOllFJq4dP5Z_lLUzRCqAGZmD',
'drive:1QSDkjCiIYcK-rw5E3k8x0SIHykIEkmSd',
'drive:1usdXmfFVGKlr-ZH0pHU2-LCDl8oS_SX6',
'drive:15yP4f02QiJ6pkHq-a-qs78RKyaJK4tar',
'drive:1jt5vMrvZnNua9vBYuCYo0eVzqlpPl8xe',
'drive:1TFUCXECuT6MH3xDkGzoaJVaqnlZkh3iq',
'drive:1QlH3Tyi18U3FV_KYf2Qoa7_Alr29I9eH',
'drive:1NCY9N_maTffTqcmZ0EXtTceObgyJOdxO',
'drive:15lFpRxPwJU_kEDAvXvqRo59Jo0NstVzK',
'drive:1XYURcgHSpGqU28RWpyD9nGKDBvrxEwPR',
'drive:1exA9wWbvn4SlbMeI1KnxLD28YSRjOCpR',
'drive:1_WCfIRQTDnuTf9yIDECU-6hVQRBNwjMj',
'drive:1agoPxD-jeaxqDSTBRp1CCE4nkVA7Zf6u',
'drive:130-owJ3cTWo9Sf3Fn4-VcAU4r1PP2hiZ',
'drive:1ms-Gv2IfhL7xJRxAmHZqhPR2BHglf5Sv',
'drive:1f58wtIvISmwBYtOKDJS7yXkAtonQo6y9',
'drive:1npSxIa9RtbVBjWyKwwUGb0gXSvDJMQ7d',
'drive:1bLyibSEUDDvj49vsyizxRKctj3nbjBGR',
'drive:1bAlDZep8Xy8DYwBQ9phbxHtaoLwgwzlf',
'drive:1sDYbiw0pXHndLpGPuERCgfNm7igZd7FR',
'drive:1z4vt6MsXPHWT9ved71BpdQ6dac63n_-5',
'drive:1k_YuLxE_tTsBKsFs4-GnP_5QcyCacouh',
'drive:1oLY-lCmL-AbPBwmPVxlEA6L_iPJJqjMI',
'drive:1bxmTEDMh_4TRMbGCxACgT_V1AtAccJ29',
'drive:16RzpP7h9IYv2Iz4xAo5QDSJ76oSOJLSs',
'drive:1gPMYqvV12ADGAUf6_cNLwjSZP-0EkQnC',
'drive:1v2iSL3ER7WLPqLNQadeoy4IifN3lIknS',
'drive:10H_6rQS1G0K3rT3MySN2nNYwaMtJHpsA',
'drive:1qCewh-0u5EHRuPUkH65H-3H2x_ddoYPb',
'drive:1qNU5Lo3YAlZywLDQupfVEFE_vACIxZIN',
'drive:1WucnfvfYc8_rPpKtHpygmLzmOH81941i',
'drive:1aH4Av66ZNoU2l1pLT87coG2iMZWbHIqy',
'drive:1C3VLevWmNJV6YevsjIYDZxloAObSZ8Ek',
'drive:1S_epWqnUeiWMYqcaoGymcy6eNg1_oWPj',
'drive:1WtAuOpJBSHfEDFS0L7eiW_-0PVJRgSV9',
'drive:1qW6kUt9IGx0o6jjcVKk6l1fwRlE_3huV',
'drive:147ohIkPsQFWSgy_5ZKoFeGvPeVVb7r90',
'drive:1PV37Us2EhhUwofZ-k4LRE1teojHelb0Q',
'drive:13YENT3iaBWolGgudu1uYPscxLZADicQ-',
'drive:1rIUrrwe6kT4-3c5STXfwwaSGBu_GuEp0',
'drive:15CK4yq3_bcys0g_0Gd8GfKXyh2xKR_Dd',
'drive:1unq3bnLA7XpTUr1Fh68fyTkOg5NkOSys',
'drive:16Ze_oOQpFvd4E97rp6beY_WkNAeGOhS0',
'drive:17JVSE_eubtiQnsHBpC8A-dlUu6dOLqeR',
'drive:1Hr2GZTuzCf0KhP2kjdxzmG3lPhA0WUxZ',
'drive:1ZJf4DQJX1Rs9wqV7zFd5qg6BW0H199yt',
'drive:1Sk_BXSG-u_uYxC4HerusIhUE6dO0aJnV',
'drive:1ayZrmtfeiot_aONTl3y4NaF34K5Vj1zq',
'drive:1wM313wRB8c8A2UzDTS-0BECAEvW9Yf-O',
'drive:1qG3AXcOwjjvE6yR1O4_y1bFwQRmwpBRg',
'drive:1hCwAZJilPVAPLtpoQrraQAsBrc3pQS8v',
'drive:18yX9ILvIJhBt6APGUhqP-D8rwWZYssTh',
'drive:12brZwCPc6JSgMNpm1rkGmMrg02Ynmp4l',
'drive:1OM08GvZPS9Yep9mZfHnYfT1Zesz9dZkS',
'drive:1kV2efF2Y7TMJbVKadEUEXR09dXAJiLnf',
'drive:1cKf8Zss9DoPZ2mjlHEy8lBI4Wv_yOagS',
'drive:1_p5nuUdlLNHvimmDPKHXEKKkQrda8JtC',
'drive:14Fv3y1PwreL8m7TXZdF9Xw0mA3ftTXpa',
'drive:1nN1JP3inDG1gufJluVrgJ2-SAawMEpNA',
'drive:1l3pxvuag7J5-cxJDDTeGgv2MkHCu_www',
'drive:12kigSyX9t8FpRjM1ir0zpcOGrBA3doOi',
'drive:1CTkZiKFp_JDSulDMcgjOLzFrsoDMWHfz',
'drive:1wi5N-7kPjHsNTB22DFDw87EODW-0FeuC',
'drive:1ARvC2GJD9Kzgs7ohbOYpXpFcKydLAdrz',
'drive:1nmeiB_cR-YkP_TE3uBPv8EhT9RweXW_B',
'drive:1AqI-1q2gkgdmTdjL8b8BBiJ1Q-t1FFZ1',
'drive:1LHrEyCpOBZZglREse-2vTv_HcYAZDlC4',
'drive:1x4CNG-wxy-L7Y1N4I8HfMJ5EKwQulNQF',
'drive:1fMlRtd3ajCRpqDwCgcH4wPg47jHMTq7l',
'drive:11ULVYbYSYPm89kkU2hx0SK-dt7eyeuVH',
'drive:14OldQVsCxmSN6s-mUKzlzX_wuVZlrXFr',
'drive:1ig0OYUh_yteUQ_fXJhIoBGjBEFG6HE8o',
'drive:1QKAqJuJnWq2drrdEJm6Q1W0Wt7QnoHGU',
'drive:1ZUNQuq7OcYuWLfKPb-oKap39NkgLqBQJ',
'drive:1KkEpWux755vFAUCt4EL63nW7GEmmljL_',
'drive:12WJHgA31g-otKrByK12aGQ-Lne3GraiU',
'drive:182o5-5wzm0ZO1m63GxbxIWImnsukto63',
'drive:1OAgkXpmOh0aPo3e1CgwYdKPkdJ-rY8ga',
'drive:1FFqvOulzLqF0A260jtD2wddn6-AM5Zlz',
'drive:1WppFZjnyWcfvBse9s97dHeSnbEmV_HOV',
'drive:1gReNKA5Js1cnkRV1rJp6OafjNmcQgzsr',
'drive:1q8fIxUG_h9KGb12pZPowTqrsoaLREqxE',
'drive:1_cbVFl3uE0uVqG7xYeXj1TyiZezEND6V',
'drive:10HfDCKqMLjaBah3xE_dDQ04xggli2ZGQ',
'drive:18MiQy9XIgCB7gn0NMxGvnLeNxmY6m-Ck',
'drive:1mvQQ-w0990G8RxvU06KI9i4t7oPFlkMg',
'drive:1mCn6rg2z00oZMTQnozuOQ1WCxWxODEGs',
'drive:18sUmEgxvSX-T06eOOmzz_MnT1uw2W4rd',
'drive:1ujQuLFsyg9dxUjEVpHfFh63yQFpfriKr',
'drive:1Bo856rfGLyGM_JOlxQNI2e2d_RltAclm',
'drive:1BUQiDP5Uxy7w6a8NegFAdrgxLBRj8JHs',
'drive:1n9PHEUHanvrxymajNwyKtfP16eSaDAEw',
'drive:1s7A2f_n9Strot4PQU7PGUfxl-UP-tlmt',
'drive:1KNkV11ZImBX6hgWKfbJ_7Hj0VTGibcOb',
'drive:1_SxL3G63pgf0aBzk6fcPfQ2unzPg_LcK',
'drive:1aqhEvhAatuZe43BIUqvKVUD1Jd8DkSvE',
'drive:1qCqXooJ6eTyrnMg8exG63M-VtLfcyLkh',
'drive:1nbBMAhc_40FySb-BxbB9p3COS3KvWN-u',
'drive:1-Dtxad6c81VEKTJR2moEVYEoTVZdK0PP',
'drive:1R0MYEo1cNNVRaXLMeKNkpXTU546xRhv5',
'drive:1lJyUpLcGKjwFF-gbqs-FvKaKPmTHCUzc',
'drive:1bpoFE4g9E8WhiE4Uac7HIU8tw4WEtUmB',
'drive:10A64QyVTF7PXYRDJP9adWk5Ib8ga-nlV',
'drive:1fee2Oj60ki3GCtqSXKIFHgtrBQC7v45o',
'drive:1LKhlwGJzKvq45CdkYGza1mub_7iZsnG-',
'drive:16idj1MVTvUX7cL8GiS63UvLAAp5IIyel',
'drive:1bhz-rQJTD1jNYf05nLcISkXHB4UGiLV7',
'drive:1MSNA5SJKJuo_d5DRT32j01BhPluyvxEw',
'drive:1nDUUTvk-IPixm8lbowkjHrE7TEKegpbv',
'drive:1KRKSJQP9pH0Bvm8blvQQcE8weiNE_SFE',
'drive:1AAph-ivfOiP0MmmUN1P2C49TlaUdkUur',
'drive:1GD9PUTzyuUGDWGo_JUYigjBTxqiNZqyJ',
'drive:1k55THQTwOQq5lJYze78zszKzK6EuchOx',
'drive:1F0m1aSZqiMvpEoud2-2NT_cyzJFDYEUR',
'drive:1_R_sfpAstipxW3RzDdvKvgjCfoEwN4Xy',
'drive:1ysHYgmaAimFagrx1WNGFMqGe9de0SkNL',
'drive:1-JqtR0M2ySSZUAyyEPnGDuZwPdDqlTmG',
'drive:14V0OivuG76VgIMOXVe-DbM27yFKH2pQo',
'drive:1jiw2YN3aTFub7wdzpr-C2qsjuVCdRt7z',
'drive:1A89VNPPS73uFViyjwRBcMQ9l9qdVDeow',
'drive:1xIGrSC_Z8KLxB5PAqclKnhksAO_HxANn',
'drive:1JSnGlVxYKIBGpQC3jJikhWsDTY1_kq63',
'drive:19i_nCj6p6B4xoQbC0UWYHRqybHsTwBdt',
'drive:1Nv8UWqxUlGI0D586YttV4S6Ss_Beym6V',
'drive:1uhakG-w8ewHX853LKLIWslKklHdQnCvQ',
'drive:1sF6AMrrRajrL-hAI1XKUWk3qgeDSwPdK',
'drive:1eNQhMAsQcmrWBY7kMGLB_ACqZlcQWV-G',
'drive:1yIbCsS-xtTFhfX0kfSLbo1JNcAhpOL_5',
'drive:1NLRLksuek3mf4NUKvdrbiONC6zebZTQW',
'drive:1-NpRidkMTyjp5REhFU8hXprZMCLYLOd6',
'drive:1jaMXSdtM-FqrgjDTrphHLeCnOcuFbvM1',
'drive:1Mm-AdGyYVWgmHZWJuh8D8dPf25h7LcHC',
'drive:17ybsNke2JZHAugGjsa-dHxxlQb_53Oss',
'drive:19W1m0ftIS4kpNhCAd3-seKXzWnpSby-_',
'drive:1eFGMHVBbnFOjJlK3vtawEbVYT0ljoOLD',
'drive:13MTIJxFzEXhabqsb-yJw6jPyOewcObsH',
'drive:19FHhx_hP-vHpP2iFz78-_oDR6vK91pA5',
'drive:1kfumfbTlwu_7vRB4iYT70mpKs_cOxHxl',
'drive:1HvX6W3ZE_cccvEXu_DOOG-B4p13gIQX7',
'drive:1fAzqYWvEh2bzZBs-fvk4hWTdLH1HBVcX',
'drive:1yi_muQRd884_5jj3lNUoPx-DC5Ij0wHV',
'drive:19Ke9WisJj_azXRe7HmzTIlwrCmGdKNLi',
'drive:1b1UbsA26jsSe9G1NbcecTT7pEkjbktDV',
'drive:1P34YgTKVbn5PwDIkjPr1C9b1s4I6z7SS',
'drive:1c8H6dss5PO49agDI2EGjv0rYgTiUPJwr',
'drive:1TT1ruv7mTe3ozWBv_w107AzqcR6vvki3',
'drive:1erUA-JrTVV9UlbATrpRGFh6WPrDoEwiR',
'drive:1MGu3LJZQney7AjsM_2CtmMCxPsgCJxA4',
'drive:1n09OCZoznUD8rohJUdbbGnfWbIgX9syS',
'drive:16eKbjVSvNUr7Qvpwhw-P4hkYYpC1adqV',
'drive:1u-lYdS_1j5PPuK0wwz6BTdsTs_dFqUTJ',
'drive:1ovKGoaHyQtpYM6AwlhMuKFRx70qVY3hF',
'drive:1pZjSkB4LbcqEYxAQax9bgCqIknOnnqmz',
'drive:16kBIt7zmEywx_lQhZ_UzbHb6fQs6m2mQ',
'drive:1IscP1lCF67fkZNfg5wkyGwKdQH-HX91T',
'drive:1umzLkzCxMfen_pSi_CtbuyieL6po1Rkj',
'drive:1V58hyfYHBYiWD4cTWih1X6WYHGwDzQlc',
'drive:1BrqQYa0uQvSmyG7d5TyNkTWuFIMgxKzf',
'drive:1IvbJNYTHmhX75xSsbq-m9ijNFK-MP1sE',
'drive:185wmqXPHjn9r6jv7AgWjoewD3u9PJgTQ',
'drive:1b971q5ylLlgcQHmVmZIoOxjwL4cPFZmm',
'drive:1R8NO6NuRh9OLV7nZNR0MY8yeOJojGTKY',
'drive:1XNgDotMkK_H2gYyej8btmfv5jXz8odTS',
'drive:1YRFMXis-QYBnHMWSWVLfX7fERVm-wN0U',
'drive:1EdQNrLZ_S4PiyWkiXYhaS_5CIi7Xczam',
'drive:1ULbihiQPc5ZF4hB13EYpzLJW2Nov20oi',
'drive:1PXsaoKgpLfqijGkHv4bFHvLlLucieceB',
'drive:10BOYcaSlEu6z7vMRHCq0uJ7ZjLb6Tngv',
'drive:1Yo0O6LZB6e5ZKgToFyJDIj3LdVQfOet1',
'drive:1pi0Vo78putvJoZG05_SOM0s4D7Ue7VNF',
'drive:1NNX_AfQE4oAl3RE8amcx3B4f3CCCO44j',
'drive:1yfSArXp9UUFbQ7mCWz1iBqytrWTt79I4',
'drive:1L0Wcau9tVsrLue6-ygEhC2TxsS2KYwoL',
'drive:1Emz7p3iaVO7AQg7PlqDDrDrIQdPFEWO9',
'drive:16DhITgmlFT76q4LduCNLJfgKazCYQ4QU',
'drive:1c-MTkEpfTnSNpfdIzdXVLu2IXFKZbuN5',
'drive:1BWMcHBCNJKzdFKjdtqoFiK9g9ofbBlK7',
'drive:1FCBO_2qRRt5FJzw-rzU74dR7ooH8Wv49',
'drive:16mtsum9DHiSh2hzeophnzA72F_RXYZwa',
'drive:1jS0xuyT-KNKs94cDOxqIvLVSMGSYTkHs',
'drive:1tn7XmoOQ3bb4OvTcPLupeQwDy658VrLN',
'drive:1AJHN3qB7DXkblt0kRs7I3KmePubaqrsk',
'drive:1w0s_oCue8ys6kg9YxrB1y9l9iOuzGRGk',
'drive:1KJ_zM1lriTlRYrcO0G6VCUeaGRlt1Bha',
'drive:1T_Si2L6unzgm15C10XmPZVKff12DZdIK',
'drive:1AzFnlxAPh5H_NUOdsHrToms_eNVGP5wD',
'drive:1AxeqMFDuSecEnnfb6wiDCX27dkUPqZIa',
'drive:1VknY3JY-cFMC9ufYha5nH_FCBrnAI3yJ',
'drive:1y6vSZ1R_4tkvetydc6nyv7n2ZCHbQqsF',
'drive:1Dhok79D5LdUCdW1X0mq1POrUcnO8jfIC',
'drive:11b35Gofk_KaEL0Sf4QAtbLFsPpvJupB2',
'drive:1fHyy4MahHXHTJIH7bYACCEQfajksrSfL',
'drive:1wxDmNm-nE6gJY8aB3jlRBhDG9ahM5eF5',
'drive:17D1LIpYoz1qUoaZI_Ec1pIBhCvytSIRI',
'drive:1m4SwlMaabgy-jdZnGKFKa0jAHWWd0gm_',
'drive:1ye_cxaRi7gmyCFhtk7BnAVgEjo4yOMvg',
'drive:1Mk2eE_L2KhvqaSUBelFPuKDcqTep378E',
'drive:1HsralUyiCm2D2SDDKN8tb3HmsU8TSJQ-',
'drive:1OjydgKhw0b4sYnrlR5wDID9t5VOB30G1',
'drive:1M_tHARpz9alDM3Is06HC9EGDInGFsWWj',
'drive:1jFJk4yKwXTbMPXG1yGN9iUQhnPovjZ9f',
'drive:1RpULhxauSNNZ5RKMUCOLTBlUtjoSBv82',
'drive:1sVPP-Dm3ZYlxmKJ62FCsO4A1PLVYA0FI',
'drive:1olMA3qSNn24_A-ABmo3gQ9twUJZumodD',
'drive:1gFyMH3Grn3TZfmpdvCf7ycuNUTTYpXle',
'drive:1scaTn8kBvdr6AHOK4HKjae4br11T_WYF',
'drive:1KH1owY8alraoGHrFzVy6h1JrY205zrj8',
'drive:1Wyt9gc6Jqej7wlC2FrUTciwwenGGOkbf',
'drive:1uJpymJozJ1g_RchnS0nnL4dIcGfKk_Xp',
'drive:14yTbBhk_kT6jDUxSJHb7mZYiyjJiSwUJ',
'drive:1p3kARQ5vPkMjLMOxrzX91W7oqNqN096s',
'drive:1q2dEE-V5T1o2cKpZeFPvowQzaFd1lrhj',
'drive:1xK7vrl8laz2g_rb8MXJkegzTUWiYbo89',
'drive:1CldmgzCjt4R-SQcCEmDUM0SLgLs3CInT',
'drive:1ChHB9M8NBjaMbQZiIOq3N6cKNc57sT7L',
'drive:1IsWYal4kvn-4JP1yYwnqVycBj6zEmWuQ',
'drive:1r40z2xesHpMa68hSZHQCaM8jbY-mPgij',
'drive:1jM7dHOj2-oHzD2zikimRHuiVmPK8pHtU',
'drive:1ae-hkqcPYEn_jGoKIPUqskWC3QUI_Tst',
'drive:1rJp7AVM4PqY_iPzkm_3PUiur_c4F_frd',
'drive:1ZFxKbyFV1FvzP3SCdcOGrB-xhuPColhl',
'drive:1YCfaOv6izauWkA9DgoOZeAfCpBMqxxgX',
'drive:1mj5tulX4aMYqU3_mPPIH9iXn0-hCd3JV',
'drive:1toWmyrXdHWnGfCh6YB3WwhYo6HbWVdDs',
'drive:1LlWakQPS_ls3BE1uJ2YaBWv5Upu-G5x0',
'drive:1Ua6iDNnX-n_8X5vpgHOA4MHPl1qBG2bK',
'drive:1alcLUSlviY0uUoSvGNVunWhebEk8jSV1',
'drive:1wGelA8mQvC74Wr6yxZLIQlznxSdtpNeV',
'drive:1ZjLg0jJPo5_t52GEDh7gIFH0_72T2lF8',
'drive:1nqsMtYVcl0wp1OOuYKewUsvL22yf6OnK',
'drive:1rNOzrFD7oe5UWiNvLtgOSyiiLsuieriL',
'drive:1aUOmkVFTH1aJ9dPRRFB6P_GJyKZOZxh-',
'drive:13BE_PwJfrUoGtERqoRcKTFuv5GnaS5d6',
'drive:13m2hNdESsCoadEIT2wL0AIGemhtIZ6qV',
'drive:1nUJoag0FxpLsxruZCI1qBjMo5zpGhirC',
'drive:1HMF8tUuDHc1nF4k42n-z2yUSKGiCyT49',
'drive:1yZ-eFVQ_AOjjioNU0CYh6z5QqhOwfVeI',
'drive:1TRI36RQbOPDbWIg1w-BUCY9xbMjNqVtQ',
'drive:103ybOhVO9da9m2VsgCsRzueDeFdW4if1',
'drive:1YvPB1BtzKV7AB-X10oQJj8aYw0TgXR7M',
'drive:1BCTa3eeTwXZ3ltoO5Tf4tpUtlf57JpN1',
'drive:1bRbmfsakY2PZersiA0GEHK5_ZluPL1Qf']::text[])
  or exists (
    select 1 from public.bailacue_web_content c
    where (c.key='drive:'||p_video_id and p_video_id ~ '^drive:[A-Za-z0-9_-]{10,100}$'
      and c.payload->>'id'=p_video_id and c.payload->>'provider'='drive'
      and p_video_id='drive:'||(c.payload->>'providerId')
      and ((c.payload->>'dance'='Salsa' and c.payload->>'folderId'='1lVR5Pc-6SupJOfLIhcRE-oo69FUDM5Sm')
        or (c.payload->>'dance'='Bachata' and c.payload->>'folderId'='17CFKIazhQJTGXvlHP5sa1mqlvu9p-2i1')))
    or (c.key='youtube:'||p_video_id and p_video_id ~ '^youtube:(video:[A-Za-z0-9_-]{11}|playlist:[A-Za-z0-9_-]{10,100})$'
      and c.payload->>'id'=p_video_id and c.payload->>'provider'='youtube'
      and c.payload->>'dance' in ('Salsa','Bachata')
      and p_video_id='youtube:'||(c.payload->>'kind')||':'||(c.payload->>'providerId'))
  );
$$;

-- Preserve the existing shared directory if it exists; otherwise publish the
-- same 22 starter labels already shown by the web application.
insert into public.bailacue_web_content(key,payload)
values ('labels', '{"items":[{"id":"label-1","name":"Salsa On1","type":"Style","dance":"Salsa"},{"id":"label-2","name":"Salsa On2","type":"Style","dance":"Salsa"},{"id":"label-3","name":"Cuban / Casino","type":"Style","dance":"Salsa"},{"id":"label-4","name":"Rueda de Casino","type":"Style","dance":"Salsa"},{"id":"label-5","name":"Colombian / Cali","type":"Style","dance":"Salsa"},{"id":"label-6","name":"Sensual Bachata","type":"Style","dance":"Bachata"},{"id":"label-7","name":"Dominican Bachata","type":"Style","dance":"Bachata"},{"id":"label-8","name":"Modern Bachata","type":"Style","dance":"Bachata"},{"id":"label-9","name":"Bachata Fusion","type":"Style","dance":"Bachata"},{"id":"label-10","name":"Footwork / Shines","type":"Technique","dance":"Both"},{"id":"label-11","name":"Partnerwork","type":"Technique","dance":"Both"},{"id":"label-12","name":"Body movement","type":"Technique","dance":"Both"},{"id":"label-13","name":"Turns","type":"Technique","dance":"Both"},{"id":"label-14","name":"Musicality","type":"Technique","dance":"Both"},{"id":"label-15","name":"Class","type":"Video type","dance":"Both"},{"id":"label-16","name":"Tutorial","type":"Video type","dance":"Both"},{"id":"label-17","name":"Social dance","type":"Video type","dance":"Both"},{"id":"label-18","name":"Demo","type":"Video type","dance":"Both"},{"id":"label-19","name":"Performance","type":"Video type","dance":"Both"},{"id":"label-20","name":"Beginner","type":"Level","dance":"Both"},{"id":"label-21","name":"Intermediate","type":"Level","dance":"Both"},{"id":"label-22","name":"Advanced","type":"Level","dance":"Both"}]}'::jsonb) on conflict(key) do nothing;

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
    if not public.bailacue_valid_web_labels(new.payload) or not (new.payload->'items' @> old.payload->'items') then
      raise exception 'Existing shared labels cannot be changed or removed' using errcode='42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end; $$;

create trigger bailacue_guard_public_web_edit
before insert or update on public.bailacue_web_content
for each row execute function public.bailacue_guard_public_web_edit();

grant insert, update on public.bailacue_web_content to anon;
create policy bailacue_web_public_metadata_insert on public.bailacue_web_content
for insert to anon, authenticated with check (
  key like 'meta:%' and public.bailacue_known_web_video(substr(key,6))
  and public.bailacue_valid_web_metadata(payload)
);
create policy bailacue_web_public_metadata_update on public.bailacue_web_content
for update to anon, authenticated
using (key like 'meta:%' and public.bailacue_known_web_video(substr(key,6)))
with check (key like 'meta:%' and public.bailacue_known_web_video(substr(key,6)) and public.bailacue_valid_web_metadata(payload));
create policy bailacue_web_public_label_append on public.bailacue_web_content
for update to anon, authenticated using (key='labels')
with check (key='labels' and public.bailacue_valid_web_labels(payload));

create or replace function public.bailacue_patch_web_metadata(p_video_id text, p_patch jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare saved jsonb;
begin
  if not coalesce(public.bailacue_known_web_video(p_video_id),false) then raise exception 'Unknown video' using errcode='22023'; end if;
  if not public.bailacue_valid_web_metadata(p_patch) or p_patch='{}'::jsonb then raise exception 'Invalid video metadata' using errcode='22023'; end if;
  insert into public.bailacue_web_content as c (key,payload)
  values ('meta:'||p_video_id,p_patch)
  on conflict(key) do update set payload=c.payload||p_patch, updated_at=now()
  returning payload into saved;
  return saved;
end; $$;

create or replace function public.bailacue_add_web_label(p_name text, p_type text, p_dance text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare directory jsonb; item jsonb; label_name text;
begin
  label_name := regexp_replace(btrim(normalize(p_name, NFKC)), '\s+', ' ', 'g');
  if label_name is null or length(label_name) not between 1 and 80 or coalesce(p_type,'') not in ('Style','Technique','Video type','Level','Artist') or coalesce(p_dance,'') not in ('Both','Salsa','Bachata') then
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

revoke all on function public.bailacue_valid_web_metadata(jsonb),public.bailacue_valid_web_labels(jsonb),public.bailacue_known_web_video(text),public.bailacue_guard_public_web_edit(),public.bailacue_patch_web_metadata(text,jsonb),public.bailacue_add_web_label(text,text,text) from public;
grant execute on function public.bailacue_valid_web_metadata(jsonb),public.bailacue_valid_web_labels(jsonb),public.bailacue_known_web_video(text),public.bailacue_patch_web_metadata(text,jsonb),public.bailacue_add_web_label(text,text,text) to anon,authenticated,service_role;

comment on function public.bailacue_patch_web_metadata(text,jsonb) is 'Public collaborative video annotations, intentionally available without sign-in. Invoker rights and BailaCue-scoped RLS only.';
