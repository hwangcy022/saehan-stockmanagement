-- =============================================================================
-- 샘플 데이터 (로컬 supabase db reset 시 자동 적용 / 호스팅은 SQL Editor 에서 실행)
--   - 계정 2개: 관리자 admin@saehan.local / admin1234,  조회자 viewer@saehan.local / viewer1234
--   - 품목 30개, ERP 기준 1건, 그 이후 거래 150건(그중 3건은 취소 처리 예시)
-- 여러 번 실행해도 계정·품목은 중복 생성되지 않지만, 기준·거래는 실행할 때마다 추가됩니다.
-- 2·3번의 업로드자/입력자는 "현재 존재하는 첫 번째 관리자 계정"을 자동으로 사용하므로
-- 호스팅(supabase.com)에서 0번을 건너뛰고 대시보드로 계정을 만든 경우에도 그대로 실행됩니다. (관리자가 없으면 NULL)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. 계정 생성
--    로컬(supabase start)에서는 아래처럼 auth.users 에 직접 넣어도 됩니다.
--    호스팅(supabase.com)에서는 Dashboard > Authentication > Users > "Add user" 로 만든 뒤
--    아래 "역할 지정" UPDATE 문만 실행하세요. (auth.users 직접 INSERT 도 동작은 하지만 권장되지 않습니다)
-- -----------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated',
   'admin@saehan.local', crypt('admin1234', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"생산지원 관리자"}', now(), now(),
   '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated',
   'viewer@saehan.local', crypt('viewer1234', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"영업팀 조회자"}', now(), now(),
   '', '', '', '', '', '', '', '')
on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
   '{"sub":"11111111-1111-1111-1111-111111111111","email":"admin@saehan.local","email_verified":true}', 'email', now(), now(), now()),
  ('22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222',
   '{"sub":"22222222-2222-2222-2222-222222222222","email":"viewer@saehan.local","email_verified":true}', 'email', now(), now(), now())
on conflict (provider_id, provider) do nothing;

-- profiles 는 auth.users 트리거가 자동 생성. 역할을 명시적으로 지정:
insert into public.profiles (id, email, display_name, role)
values
  ('11111111-1111-1111-1111-111111111111', 'admin@saehan.local',  '생산지원 관리자', 'admin'),
  ('22222222-2222-2222-2222-222222222222', 'viewer@saehan.local', '영업팀 조회자',   'viewer')
on conflict (id) do update set role = excluded.role, display_name = excluded.display_name;

-- 호스팅에서 Dashboard 로 계정을 만들었다면, 이메일로 역할 지정:
-- update public.profiles set role = 'admin'  where email = 'admin@saehan.local';
-- update public.profiles set role = 'viewer' where email = 'viewer@saehan.local';

-- -----------------------------------------------------------------------------
-- 1. 품목 30개
-- -----------------------------------------------------------------------------
insert into public.items (item_code, item_name, unit, qty_per_box) values
  ('PF-500-28',  '프리폼 500ml 28파이',     'EA', 2000),
  ('PF-500-30',  '프리폼 500ml 30파이',     'EA', 2000),
  ('PF-330-28',  '프리폼 330ml 28파이',     'EA', 2400),
  ('PF-1000-28', '프리폼 1L 28파이',        'EA', 1200),
  ('PF-1500-28', '프리폼 1.5L 28파이',      'EA', 900),
  ('PF-2000-28', '프리폼 2L 28파이',        'EA', 600),
  ('BT-500-W',   'PET병 500ml 생수용',      'EA', 240),
  ('BT-500-C',   'PET병 500ml 탄산용',      'EA', 240),
  ('BT-330-W',   'PET병 330ml 생수용',      'EA', 300),
  ('BT-1000-W',  'PET병 1L 생수용',         'EA', 120),
  ('BT-1500-W',  'PET병 1.5L 생수용',       'EA', 80),
  ('BT-2000-W',  'PET병 2L 생수용',         'EA', 60),
  ('BT-350-J',   'PET병 350ml 음료용',      'EA', 300),
  ('BT-500-S',   'PET병 500ml 소스용',      'EA', 200),
  ('PE-300-M',   'PE용기 300g 마요네즈',    'EA', 180),
  ('PE-500-M',   'PE용기 500g 마요네즈',    'EA', 120),
  ('PE-1000-M',  'PE용기 1kg 마요네즈',     'EA', 60),
  ('PE-250-K',   'PE용기 250g 케첩',        'EA', 200),
  ('PE-500-K',   'PE용기 500g 케첩',        'EA', 120),
  ('PP-200-Y',   'PP용기 200ml 요거트',     'EA', 400),
  ('PP-500-Y',   'PP용기 500ml 요거트',     'EA', 200),
  ('PP-1000-C',  'PP용기 1L 김치',          'EA', 100),
  ('CP-28-W',    '캡 28파이 생수용',        'EA', 5000),
  ('CP-28-C',    '캡 28파이 탄산용',        'EA', 5000),
  ('CP-30-W',    '캡 30파이 생수용',        'EA', 4000),
  ('CP-38-F',    '캡 38파이 플립형',        'EA', 3000),
  ('LB-500-W',   '라벨 500ml 생수',         'ROLL', 1),
  ('LB-2000-W',  '라벨 2L 생수',            'ROLL', 1),
  ('HD-500',     '손잡이 500ml',            'EA', 1000),
  ('TR-24',      '트레이 24입',             'EA', 50)
on conflict (item_code) do nothing;

-- -----------------------------------------------------------------------------
-- 2. ERP 기준 1건 (15일 전 업로드로 가정)
-- -----------------------------------------------------------------------------
with b as (
  insert into public.baselines (uploaded_at, uploaded_by, file_name, note, line_count)
  values (now() - interval '15 days', (select id from public.profiles where role = 'admin' order by created_at limit 1), 'erp_stock_sample.csv', '샘플 기준', 30)
  returning id
)
insert into public.baseline_lines (baseline_id, item_code, erp_qty, web_qty_before)
select b.id, v.item_code, v.erp_qty, null
from b, (values
  ('PF-500-28',  120000), ('PF-500-30', 64000), ('PF-330-28', 48000), ('PF-1000-28', 36000),
  ('PF-1500-28', 27000),  ('PF-2000-28', 18000), ('BT-500-W', 9600), ('BT-500-C', 7200),
  ('BT-330-W',   6000),   ('BT-1000-W', 4800), ('BT-1500-W', 2400), ('BT-2000-W', 1800),
  ('BT-350-J',   4500),   ('BT-500-S', 3000), ('PE-300-M', 5400), ('PE-500-M', 3600),
  ('PE-1000-M',  1200),   ('PE-250-K', 4000), ('PE-500-K', 2400), ('PP-200-Y', 12000),
  ('PP-500-Y',   6000),   ('PP-1000-C', 2000), ('CP-28-W', 250000), ('CP-28-C', 150000),
  ('CP-30-W',    80000),  ('CP-38-F', 45000), ('LB-500-W', 40), ('LB-2000-W', 25),
  ('HD-500',     20000),  ('TR-24', 1500)
) as v(item_code, erp_qty);

-- -----------------------------------------------------------------------------
-- 3. 기준 이후 거래 150건 (출고 60% / 입고 30% / 조정 10%, 최근 14일에 분산)
--    baseline_id 는 트리거가 최신 기준으로 자동 지정
-- -----------------------------------------------------------------------------
select setseed(0.42);

insert into public.transactions (occurred_at, tx_type, item_code, qty, note, created_by)
select
  ts,
  tx_type,
  item_code,
  case tx_type
    when 'IN'  then  boxes * qty_per_box
    when 'OUT' then -boxes * qty_per_box
    else (case when r3 < 0.5 then -1 else 1 end) * greatest(1, round(qty_per_box * 0.1))
  end as qty,
  case tx_type
    when 'IN'  then '생산 입고'
    when 'OUT' then (array['A사 납품', 'B사 납품', 'C사 납품', '원남공장 이관'])[1 + floor(r3 * 4)::int]
    else '실사 조정'
  end as note,
  (select id from public.profiles where role = 'admin' order by created_at limit 1)
from (
  select
    now() - (random() * 14) * interval '1 day' as ts,
    case when r1 < 0.6 then 'OUT' when r1 < 0.9 then 'IN' else 'ADJ' end as tx_type,
    i.item_code,
    i.qty_per_box,
    1 + floor(random() * 10)::int as boxes,
    r3
  from (
    select g, random() as r1, random() as r2, random() as r3 from generate_series(1, 150) g
  ) s
  join lateral (
    select item_code, qty_per_box
    from (select item_code, qty_per_box, row_number() over (order by item_code) rn from public.items) x
    where rn = 1 + floor(s.r2 * 30)::int
  ) i on true
) t
order by ts;

-- 취소 처리 예시 3건: 가장 최근 거래 3건을 취소 거래로 상쇄
insert into public.transactions (occurred_at, tx_type, item_code, qty, note, created_by, baseline_id, reversal_of)
select now(), tx_type, item_code, -qty, '취소: #' || id || ' (입력 오류)', (select id from public.profiles where role = 'admin' order by created_at limit 1), baseline_id, id
from (
  select * from public.transactions where reversal_of is null order by id desc limit 3
) last3;
