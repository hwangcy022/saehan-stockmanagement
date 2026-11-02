-- =============================================================================
-- 새한프라텍 생산지원팀 "실제재고" 스키마
-- Supabase SQL Editor 에 그대로 붙여 넣어 실행하거나,
-- 로컬에서는 supabase/migrations/20261103000000_init.sql(동일 내용)이 `supabase db reset` 시 적용됩니다.
-- 여러 번 실행해도 안전하도록 if not exists / or replace 를 사용합니다.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 1. 사용자 프로필 / 역할
--    role: 'admin'(생산지원팀: 입력·수정·업로드) | 'viewer'(영업팀 등: 읽기 전용)
--    가장 먼저 가입(생성)된 사용자는 자동으로 admin 이 됩니다. (초기 부트스트랩용)
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text,
  display_name text,
  role         text not null default 'viewer' check (role in ('admin', 'viewer')),
  created_at   timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, ''), '@', 1)),
    case when not exists (select 1 from public.profiles) then 'admin' else 'viewer' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 현재 로그인 사용자가 관리자인지 (RLS 정책과 RPC 에서 사용)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.role = 'admin' from public.profiles p where p.id = auth.uid()), false);
$$;

-- -----------------------------------------------------------------------------
-- 2. 품목
-- -----------------------------------------------------------------------------
create table if not exists public.items (
  item_code   text primary key,
  item_name   text not null default '',
  unit        text not null default 'EA',
  qty_per_box numeric not null default 1 check (qty_per_box > 0),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists items_set_updated_at on public.items;
create trigger items_set_updated_at
  before update on public.items
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 3. ERP 기준(스냅샷) 업로드 이력
-- -----------------------------------------------------------------------------
create table if not exists public.baselines (
  id             bigint generated always as identity primary key,
  uploaded_at    timestamptz not null default now(),
  uploaded_by    uuid references public.profiles (id),
  file_name      text not null default '',
  note           text,
  line_count     integer not null default 0,
  new_item_codes text[] not null default '{}'   -- 이 업로드로 자동 추가된 품목코드
);

create table if not exists public.baseline_lines (
  baseline_id    bigint not null references public.baselines (id) on delete cascade,
  item_code      text   not null references public.items (item_code),
  erp_qty        numeric not null default 0,
  web_qty_before numeric,                      -- 업로드 직전의 웹 현재고 (차이 표 재조회용 스냅샷)
  primary key (baseline_id, item_code)
);

-- -----------------------------------------------------------------------------
-- 4. 수불 거래 (삭제·수정 없음. 잘못 넣은 행은 취소 거래로 상쇄)
--    tx_type: 'IN'(입고, qty>0) | 'OUT'(출고, qty<0 로 저장) | 'ADJ'(조정, 부호 자유)
--    reversal_of: 취소 거래이면 원거래 id (수량은 원거래의 반대 부호, 구분은 동일)
-- -----------------------------------------------------------------------------
create table if not exists public.transactions (
  id          bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  tx_type     text not null check (tx_type in ('IN', 'OUT', 'ADJ')),
  item_code   text not null references public.items (item_code),
  qty         numeric not null check (qty <> 0),
  note        text,
  created_by  uuid references public.profiles (id),
  baseline_id bigint references public.baselines (id),
  reversal_of bigint references public.transactions (id),
  created_at  timestamptz not null default now(),
  constraint tx_sign_check check (
    reversal_of is not null
    or (tx_type = 'IN'  and qty > 0)
    or (tx_type = 'OUT' and qty < 0)
    or (tx_type = 'ADJ')
  ),
  constraint tx_reversal_unique unique (reversal_of)   -- 한 거래는 한 번만 취소
);

create index if not exists transactions_baseline_item_idx on public.transactions (baseline_id, item_code);
create index if not exists transactions_created_at_idx   on public.transactions (created_at desc);
create index if not exists transactions_occurred_at_idx  on public.transactions (occurred_at desc);

-- 입력 시 기준ID(최신 기준)와 입력자를 자동으로 채움
create or replace function public.transactions_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 일반 거래는 항상 최신 기준에 귀속. 취소 거래(reversal_of)는 원거래의 기준을 그대로 사용.
  if new.reversal_of is null then
    select max(id) into new.baseline_id from public.baselines;
  end if;
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists transactions_before_insert on public.transactions;
create trigger transactions_before_insert
  before insert on public.transactions
  for each row execute function public.transactions_before_insert();

-- -----------------------------------------------------------------------------
-- 5. 현재고 뷰
--    현재고 = 최신 기준의 ERP수량 + (그 기준 이후 거래 합)
--    기준이 하나도 없으면 baseline_id 가 null 인 거래만 합산합니다.
-- -----------------------------------------------------------------------------
create or replace view public.current_stock
with (security_invoker = true)
as
with latest as (
  select id, uploaded_at
  from public.baselines
  order by id desc
  limit 1
),
tx as (
  select
    t.item_code,
    sum(t.qty)                                              as tx_sum,
    sum(case when t.tx_type = 'IN'  then  t.qty else 0 end) as in_sum,
    sum(case when t.tx_type = 'OUT' then -t.qty else 0 end) as out_sum,
    sum(case when t.tx_type = 'ADJ' then  t.qty else 0 end) as adj_sum,
    max(t.created_at)                                       as last_tx_at,
    count(*)                                                as tx_count
  from public.transactions t
  left join latest l on true
  where t.baseline_id is not distinct from l.id
  group by t.item_code
)
select
  i.item_code,
  i.item_name,
  i.unit,
  i.qty_per_box,
  i.is_active,
  l.id                                               as baseline_id,
  l.uploaded_at                                      as baseline_at,
  coalesce(bl.erp_qty, 0)                            as erp_qty,
  coalesce(tx.in_sum, 0)                             as in_sum,
  coalesce(tx.out_sum, 0)                            as out_sum,
  coalesce(tx.adj_sum, 0)                            as adj_sum,
  coalesce(tx.tx_count, 0)                           as tx_count,
  coalesce(bl.erp_qty, 0) + coalesce(tx.tx_sum, 0)   as current_qty,
  coalesce(greatest(tx.last_tx_at, l.uploaded_at), i.updated_at) as last_changed_at
from public.items i
left join latest l on true
left join public.baseline_lines bl on bl.baseline_id = l.id and bl.item_code = i.item_code
left join tx on tx.item_code = i.item_code;

-- 거래 이력 뷰 (품목명·입력자·취소 여부 포함)
create or replace view public.transaction_history
with (security_invoker = true)
as
select
  t.id, t.occurred_at, t.tx_type, t.item_code, t.qty, t.note,
  t.created_by, t.baseline_id, t.reversal_of, t.created_at,
  i.item_name, i.qty_per_box, i.unit,
  p.display_name as created_by_name,
  r.id           as reversed_by_id
from public.transactions t
join public.items i on i.item_code = t.item_code
left join public.profiles p on p.id = t.created_by
left join public.transactions r on r.reversal_of = t.id;

-- -----------------------------------------------------------------------------
-- 6. RPC: ERP 기준 적용 (품목 자동 추가 + 기준 생성 + 라인 저장을 한 트랜잭션으로)
--    p_lines: [{"item_code":"...","item_name":"...","qty":123}, ...]
-- -----------------------------------------------------------------------------
create or replace function public.apply_baseline(p_file_name text, p_note text, p_lines jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id        bigint;
  v_new_codes text[];
  v_prev      jsonb;
begin
  if not public.is_admin() then
    raise exception '관리자만 ERP 기준을 적용할 수 있습니다' using errcode = '42501';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception '적용할 행이 없습니다';
  end if;

  -- 6-1. items 에 없는 품목코드 자동 추가
  with incoming as (
    select distinct on (btrim(x.item_code)) btrim(x.item_code) as item_code, coalesce(x.item_name, '') as item_name
    from jsonb_to_recordset(p_lines) as x(item_code text, item_name text, qty numeric)
    where x.item_code is not null and btrim(x.item_code) <> ''
  ),
  ins as (
    insert into public.items (item_code, item_name)
    select item_code, item_name from incoming
    on conflict (item_code) do nothing
    returning item_code
  )
  select coalesce(array_agg(item_code order by item_code), '{}') into v_new_codes from ins;

  -- 6-2. ERP 품목명이 있으면 품목명 최신화
  update public.items i
     set item_name = x.item_name
    from (
      select distinct on (btrim(item_code)) btrim(item_code) as item_code, item_name
      from jsonb_to_recordset(p_lines) as x(item_code text, item_name text, qty numeric)
      where item_name is not null and btrim(item_name) <> ''
    ) x
   where i.item_code = x.item_code and i.item_name is distinct from x.item_name;

  -- 6-3. 적용 직전 웹 현재고 스냅샷
  select coalesce(jsonb_object_agg(item_code, current_qty), '{}'::jsonb) into v_prev
  from public.current_stock;

  -- 6-4. 기준 생성
  insert into public.baselines (file_name, note, uploaded_by, line_count, new_item_codes)
  values (coalesce(p_file_name, ''), nullif(btrim(coalesce(p_note, '')), ''), auth.uid(), jsonb_array_length(p_lines), v_new_codes)
  returning id into v_id;

  -- 6-5. 기준 라인 (같은 품목코드가 여러 행이면 합산)
  insert into public.baseline_lines (baseline_id, item_code, erp_qty, web_qty_before)
  select v_id, btrim(x.item_code), sum(coalesce(x.qty, 0)), (v_prev ->> btrim(x.item_code))::numeric
  from jsonb_to_recordset(p_lines) as x(item_code text, item_name text, qty numeric)
  where x.item_code is not null and btrim(x.item_code) <> ''
  group by btrim(x.item_code);

  -- 6-6. ERP 파일에 없지만 웹에 재고가 있던 품목은 ERP수량 0 으로 기록 (차이 표에서 보이도록)
  insert into public.baseline_lines (baseline_id, item_code, erp_qty, web_qty_before)
  select v_id, i.item_code, 0, (v_prev ->> i.item_code)::numeric
  from public.items i
  where not exists (select 1 from public.baseline_lines b where b.baseline_id = v_id and b.item_code = i.item_code)
    and coalesce((v_prev ->> i.item_code)::numeric, 0) <> 0;

  return jsonb_build_object('baseline_id', v_id, 'new_item_codes', to_jsonb(v_new_codes));
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. RPC: 거래 취소 (반대 부호의 취소 거래 생성, 원거래는 보존)
-- -----------------------------------------------------------------------------
create or replace function public.reverse_transaction(p_tx_id bigint, p_note text default null)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  o    public.transactions%rowtype;
  v_id bigint;
begin
  if not public.is_admin() then
    raise exception '관리자만 거래를 취소할 수 있습니다' using errcode = '42501';
  end if;
  select * into o from public.transactions where id = p_tx_id;
  if not found then
    raise exception '거래를 찾을 수 없습니다: %', p_tx_id;
  end if;
  if o.reversal_of is not null then
    raise exception '취소 거래는 다시 취소할 수 없습니다';
  end if;
  if exists (select 1 from public.transactions where reversal_of = p_tx_id) then
    raise exception '이미 취소된 거래입니다';
  end if;

  insert into public.transactions (occurred_at, tx_type, item_code, qty, note, created_by, baseline_id, reversal_of)
  values (now(), o.tx_type, o.item_code, -o.qty,
          coalesce(nullif(btrim(coalesce(p_note, '')), ''), '취소: #' || o.id::text),
          auth.uid(), o.baseline_id, o.id)
  returning id into v_id;
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. 권한 / Row Level Security
--    - 로그인(authenticated) 사용자: 모든 테이블·뷰 읽기
--    - admin: items / baselines / baseline_lines / transactions 쓰기, profiles.role 변경
--    - viewer: 어떤 테이블도 쓰기 불가 (쓰기 정책 없음)
--    - transactions: 누구도 update/delete 불가 (정책 없음) → 이력 보존
-- -----------------------------------------------------------------------------
alter table public.profiles       enable row level security;
alter table public.items          enable row level security;
alter table public.baselines      enable row level security;
alter table public.baseline_lines enable row level security;
alter table public.transactions   enable row level security;

-- 익명(anon) 접근 차단
revoke all on all tables    in schema public from anon;
revoke all on all functions in schema public from anon;

grant usage on schema public to authenticated;
grant select on public.profiles, public.items, public.baselines, public.baseline_lines, public.transactions,
                public.current_stock, public.transaction_history to authenticated;
grant insert, update on public.items to authenticated;
grant update on public.profiles to authenticated;
grant insert on public.baselines, public.baseline_lines, public.transactions to authenticated;
grant usage, select on all sequences in schema public to authenticated;

revoke execute on function public.apply_baseline(text, text, jsonb)   from public, anon;
revoke execute on function public.reverse_transaction(bigint, text)   from public, anon;
revoke execute on function public.is_admin()                          from public, anon;
grant  execute on function public.apply_baseline(text, text, jsonb)   to authenticated;
grant  execute on function public.reverse_transaction(bigint, text)   to authenticated;
grant  execute on function public.is_admin()                          to authenticated;

-- profiles
drop policy if exists profiles_select       on public.profiles;
drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_select       on public.profiles for select to authenticated using (true);
create policy profiles_update_admin on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- items
drop policy if exists items_select       on public.items;
drop policy if exists items_insert_admin on public.items;
drop policy if exists items_update_admin on public.items;
create policy items_select       on public.items for select to authenticated using (true);
create policy items_insert_admin on public.items for insert to authenticated with check (public.is_admin());
create policy items_update_admin on public.items for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- baselines / baseline_lines (직접 insert 는 허용하되 보통은 apply_baseline RPC 사용)
drop policy if exists baselines_select       on public.baselines;
drop policy if exists baselines_insert_admin on public.baselines;
create policy baselines_select       on public.baselines for select to authenticated using (true);
create policy baselines_insert_admin on public.baselines for insert to authenticated with check (public.is_admin());

drop policy if exists baseline_lines_select       on public.baseline_lines;
drop policy if exists baseline_lines_insert_admin on public.baseline_lines;
create policy baseline_lines_select       on public.baseline_lines for select to authenticated using (true);
create policy baseline_lines_insert_admin on public.baseline_lines for insert to authenticated with check (public.is_admin());

-- transactions (취소 거래는 reverse_transaction RPC 로만 생성 가능, 기준ID 는 트리거가 채움)
drop policy if exists transactions_select       on public.transactions;
drop policy if exists transactions_insert_admin on public.transactions;
create policy transactions_select       on public.transactions for select to authenticated using (true);
create policy transactions_insert_admin on public.transactions for insert to authenticated
  with check (public.is_admin() and reversal_of is null);

-- -----------------------------------------------------------------------------
-- 9. Realtime: 거래·기준·품목 변경을 구독할 수 있게 publication 에 추가
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'transactions') then
      alter publication supabase_realtime add table public.transactions;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'baselines') then
      alter publication supabase_realtime add table public.baselines;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'items') then
      alter publication supabase_realtime add table public.items;
    end if;
  end if;
end;
$$;
