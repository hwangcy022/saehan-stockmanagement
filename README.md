# 실제재고 — 새한프라텍 생산지원팀 재고 웹앱

담당자가 개인 PC 엑셀로 하던 재고 수정을 웹에서 하고, 영업팀 외근 직원이 사내망 없이 휴대폰으로 실시간 재고를 보는 앱입니다.
ERP(Mold)에는 직접 연결하지 않고, 담당자가 내보낸 **CSV 업로드**로만 ERP 수량이 들어옵니다.

| 구분 | 내용 |
| --- | --- |
| 프론트 | Next.js 16 (App Router) + TypeScript + Tailwind CSS v4, 모바일 우선 |
| 백엔드 / DB / 인증 / 실시간 | Supabase (Postgres, Auth 이메일 로그인, Realtime) |
| 배포 | Vercel |
| 테스트 | Vitest (핵심 재고 계산·취소 거래·CSV 파싱) |

## 목차

1. [화면 구성](#1-화면-구성)
2. [재고 계산 규칙](#2-재고-계산-규칙)
3. [로컬에서 먼저 돌려보기 (Supabase CLI)](#3-로컬에서-먼저-돌려보기-supabase-cli)
4. [Supabase 프로젝트 만들기 (클라우드)](#4-supabase-프로젝트-만들기-클라우드)
5. [Vercel 배포](#5-vercel-배포)
6. [사용자·역할 관리](#6-사용자역할-관리)
7. [데이터 모델](#7-데이터-모델)
8. [프로젝트 구조 / ERP DB 직결로 바꾸는 방법](#8-프로젝트-구조--erp-db-직결로-바꾸는-방법)
9. [테스트와 자동 점검](#9-테스트와-자동-점검)
10. [자주 묻는 문제](#10-자주-묻는-문제)

---

## 1. 화면 구성

| 경로 | 화면 | 권한 | 설명 |
| --- | --- | --- | --- |
| `/login` | 로그인 | 전원 | 이메일 + 비밀번호 (Supabase Auth) |
| `/board` | **C. 재고 보드** | 전원 (PC) | 품목별 현재고·박스 환산·마지막 변경·기준 이후 입고/출고합. 검색·정렬, 0 이하 상단 고정, 부족 품목 강조, Realtime 자동 갱신 |
| `/m` | **D. 모바일 보기** | 전원 (휴대폰) | 검색창 → 결과 카드(현재고 큰 글씨). 즐겨찾기 상단 고정, 오프라인 시 "N분 전 데이터" 배지, PWA 홈 화면 추가 |
| `/entry` | **B. 수불 입력** | 관리자 | 건별 입력(자동완성, 박스 환산) + 일괄 입력(엑셀 붙여넣기). 오늘 입력 내역, 취소 거래로 되돌리기 |
| `/upload` | **A. ERP 스냅샷 업로드** | 관리자 | CSV 올리기 → 컬럼 매핑 → "웹 재고 vs ERP" 차이 미리보기 → 확인 시 새 기준 적용. 업로드 이력과 과거 차이 표 재조회 |
| `/reconcile` | **E. ERP 대사 점검** | 관리자 | 기준을 바꾸지 않고 비교만. 불일치 행 + xlsx 다운로드 (주 1회 점검용) |
| `/items` | 품목 관리 | 관리자 | 품목명·단위·박스당수량·활성 여부 |
| `/users` | 사용자 관리 | 관리자 | 역할(관리자/조회자) 변경 |

- 조회자(영업팀)는 `/board` 와 `/m` 만 보이며 입력 버튼은 렌더링되지 않습니다. 관리자 페이지에 직접 접근하면 보드로 돌려보내고, DB 는 RLS 로 쓰기를 막습니다.
- 휴대폰으로 `/` 에 접속하면 자동으로 `/m` 으로, PC 는 `/board` 로 이동합니다.
- 모든 날짜는 Asia/Seoul, 숫자는 천 단위 콤마입니다.

## 2. 재고 계산 규칙

```
현재고(품목) = 최신 ERP 기준의 수량 + (그 기준 이후 입력된 거래의 합)
```

- **기준(baseline)**: ERP CSV 를 업로드해 "확인"을 누른 시점. 업로드할 때마다 새 기준이 생기고, 이전 거래는 이력으로만 남고 계산에서는 빠집니다.
- **거래(transaction)**: 입고(+), 출고(− 로 저장), 조정(±). 입력 즉시 현재고가 바뀌고 Realtime 으로 모든 화면에 반영됩니다.
- **취소**: 거래는 삭제·수정하지 않습니다. 잘못 넣은 행은 "취소" 버튼으로 **반대 부호의 취소 거래**를 자동 생성해 상쇄합니다(원거래·취소거래 모두 이력에 남음).
- 거래의 기준ID 는 입력 시점의 최신 기준으로 DB 트리거가 자동 지정합니다. 취소 거래는 원거래의 기준을 따라갑니다.
- 이 규칙은 SQL 뷰 `current_stock` (`supabase/schema.sql`) 과 TypeScript `src/lib/stock.ts` 두 곳에 같은 로직으로 구현되어 있고, Vitest 와 DB 검증 스크립트로 맞춰 둡니다.

## 3. 로컬에서 먼저 돌려보기 (Supabase CLI)

### 3-1. 준비물

| 도구 | 설치 |
| --- | --- |
| Node.js 20 이상 | https://nodejs.org |
| Docker Desktop | https://www.docker.com/products/docker-desktop/ — 로컬 Supabase 는 Docker 컨테이너로 뜹니다 |
| Supabase CLI | 별도 설치 없이 `npx supabase ...` 로 사용 (프로젝트에 포함) |

### 3-2. 실행

```bash
cd saehan-stock
npm install

# 1) 로컬 Supabase 시작 (처음엔 이미지 다운로드로 수 분 소요)
npx supabase start
```

출력에 나오는 값 두 개를 복사합니다.

```
API URL: http://127.0.0.1:54321
anon key: eyJhbGciOi...
```

```bash
# 2) 환경변수
cp .env.example .env.local
#   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
#   NEXT_PUBLIC_SUPABASE_ANON_KEY=(위 anon key)

# 3) 테이블·뷰·RLS 생성 + 샘플 데이터
#    supabase/migrations/*.sql(= schema.sql) 과 supabase/seed.sql 이 자동 적용됩니다.
npx supabase db reset

# 4) 웹앱 실행
npm run dev
```

http://localhost:3000 접속 → 아래 샘플 계정으로 로그인합니다.

| 역할 | 이메일 | 비밀번호 |
| --- | --- | --- |
| 관리자 | `admin@saehan.local` | `admin1234` |
| 조회자 | `viewer@saehan.local` | `viewer1234` |

샘플 데이터: 품목 30개, ERP 기준 1건(15일 전), 그 이후 거래 150건(취소 예시 3건 포함).

### 3-3. 직접 확인 순서

1. 관리자로 로그인 → **ERP 업로드** 에서 `supabase/samples/erp_stock_euckr.csv` 선택 (EUC-KR 자동 판별, 컬럼 자동 매핑, 창고별 중복 행 합산 확인) → 차이 표(불일치 빨간색) → **확인** → "기준 #2 적용, 신규 품목 BT-750-W 자동 추가" 메시지.
2. **수불 입력** → 품목 `TR-24` 출고 150 저장 → 현재고가 즉시 바뀌고 "오늘 입력 내역"에 표시 → 취소 버튼으로 되돌리기.
3. 다른 브라우저(또는 휴대폰, 같은 Wi-Fi 면 `http://PC-IP:3000/m`)에서 조회자로 로그인 → `/m` 에서 `TR-24` 검색 → PC 에서 수불 입력하면 새로고침 없이 숫자가 바뀌는지 확인. 상단에 "실시간 반영 중" 배지.
4. 휴대폰 비행기 모드 → `/m` 다시 열면 마지막 데이터와 "N분 전 데이터 (오프라인)" 배지.
5. `npm run smoke` 로 위 흐름(로그인 → 기준 적용 → 입력 → 조회자 Realtime 수신 → 취소)을 스크립트로 자동 점검할 수 있습니다.

로컬 Supabase Studio: http://127.0.0.1:54323 (테이블·사용자 확인). 종료는 `npx supabase stop`.

## 4. Supabase 프로젝트 만들기 (클라우드)

1. https://supabase.com 가입 → **New project** → 이름(예: `saehan-stock`), DB 비밀번호(보관), Region **Northeast Asia (Seoul)** 선택 → 생성(1~2분).
2. 왼쪽 **SQL Editor** → **New query** → `supabase/schema.sql` 내용 전체를 붙여 넣고 **Run**. (테이블·뷰·RPC·RLS·Realtime 설정이 한 번에 만들어집니다. 다시 실행해도 안전)
3. **Authentication → Providers → Email**: 켜져 있는지 확인. 직원이 직접 가입하지 못하게 하려면 **Authentication → Settings → "Allow new users to sign up"** 을 끕니다. (관리자가 대시보드에서 계정을 만들어 줍니다)
4. **Authentication → Users → Add user → Create new user**: 이메일/비밀번호 입력, **Auto Confirm User** 체크 → 생성.
   - **가장 먼저 만든 계정이 자동으로 관리자(admin)** 가 됩니다. 이후 계정은 조회자(viewer).
   - 샘플 품목·거래가 필요하면 SQL Editor 에서 `supabase/seed.sql` 의 **1번(품목) 이후 부분**을 실행하세요. 업로드자/입력자는 현재 관리자 계정을 자동으로 찾아 넣습니다. (0번 계정 생성 부분은 로컬용이지만 실행해도 동작합니다)
5. **Project Settings → API** 에서 **Project URL** 과 **anon public** 키(또는 `sb_publishable_...` 키)를 복사 → `.env.local` 또는 Vercel 환경변수에 입력.
6. **Database → Replication**(또는 Publications)에서 `supabase_realtime` 에 `transactions`, `baselines`, `items` 가 포함돼 있는지 확인. (schema.sql 이 자동 추가합니다)

로컬 대신 바로 클라우드로 개발하려면 `.env.local` 에 위 값을 넣고 `npm run dev` 만 하면 됩니다.

## 5. Vercel 배포

1. 이 폴더를 GitHub 저장소에 올립니다. (`.env.local` 은 `.gitignore` 로 제외됨)
   ```bash
   git init && git add -A && git commit -m "init"
   # GitHub 에서 빈 저장소 생성 후
   git remote add origin https://github.com/<계정>/saehan-stock.git
   git push -u origin main
   ```
2. https://vercel.com 가입(GitHub 로그인) → **Add New → Project** → 저장소 선택. Framework 는 Next.js 로 자동 인식.
3. **Environment Variables** 에 두 개 추가 → **Deploy**.
   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxx.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public 키 |
4. 배포 후 주소(예: `https://saehan-stock.vercel.app`)를 Supabase **Authentication → URL Configuration → Site URL** 에 넣습니다.
5. 이후 `git push` 할 때마다 자동 재배포됩니다. 휴대폰에서 주소를 열고 "홈 화면에 추가"하면 앱처럼 열립니다(PWA).

## 6. 사용자·역할 관리

- 역할은 `profiles.role` (`admin` | `viewer`). 계정이 만들어지면 트리거가 `profiles` 행을 자동 생성합니다.
- 관리자는 웹 **사용자** 화면에서 역할을 바꿀 수 있습니다(자기 자신은 불가).
- SQL 로 바꾸려면: `update public.profiles set role = 'admin' where email = '아무개@회사.com';`
- RLS 요약: 로그인 사용자는 모두 읽기 가능 / `admin` 만 `items`·`baselines`·`baseline_lines`·`transactions` 쓰기 / 누구도 `transactions` 수정·삭제 불가 / 익명 접근 차단.

## 7. 데이터 모델

| 테이블/뷰 | 주요 컬럼 |
| --- | --- |
| `profiles` | id(=auth.users.id), email, display_name, **role** |
| `items` | **item_code**(PK), item_name, unit, qty_per_box(박스당수량), is_active |
| `baselines` | id, uploaded_at, uploaded_by, file_name, note, line_count, new_item_codes |
| `baseline_lines` | baseline_id, item_code, erp_qty, web_qty_before(업로드 직전 웹 재고 스냅샷) |
| `transactions` | id, occurred_at, tx_type(IN/OUT/ADJ), item_code, qty(출고는 음수), note, created_by, baseline_id, reversal_of |
| `current_stock` (뷰) | 품목별 erp_qty, in_sum, out_sum, adj_sum, **current_qty**, last_changed_at, baseline_at |
| `transaction_history` (뷰) | transactions + 품목명·입력자명·취소 여부 |
| RPC `apply_baseline(file, note, lines)` | 품목 자동 추가 + 기준 생성 + 라인 저장을 한 트랜잭션으로 |
| RPC `reverse_transaction(id)` | 취소 거래 생성 (중복 취소 방지) |

## 8. 프로젝트 구조 / ERP DB 직결로 바꾸는 방법

```
src/
  proxy.ts                      세션 갱신·로그인 가드·PC/모바일 분기 (Next 16 의 middleware)
  app/
    login/                      로그인
    (app)/board, entry, upload, reconcile, items, users   PC 화면 (공통 내비 레이아웃)
    m/                          모바일 보기
    manifest.ts                 PWA manifest
  components/
    ErpFilePicker.tsx           CSV 선택 → 인코딩 판별 → 컬럼 매핑 (화면 A·E 공용)
    DiffTable.tsx               웹 vs ERP 차이 표 + xlsx 다운로드
    ItemCombobox.tsx            품목 자동완성
    LiveStatus.tsx              "마지막 ERP 기준 / 실시간 반영 중 / N분 전 데이터"
  lib/
    stock.ts                    핵심 계산 (현재고, 취소, 차이)  ← vitest 대상
    erp/source.ts               ★ ERP 스냅샷 공급원 (교체 지점)
    erp/csv.ts                  CSV 파싱 (EUC-KR/UTF-8 판별, 헤더 추정)
    hooks/useCurrentStock.ts    current_stock 조회 + Realtime 구독 + 오프라인 캐시
    supabase/{client,server}.ts Supabase 클라이언트
supabase/
  schema.sql                    테이블·뷰·RPC·RLS (SQL Editor 에 붙여넣기용)
  migrations/*_init.sql         schema.sql 과 동일 (supabase db reset 용)
  seed.sql                      샘플 데이터·계정
  samples/*.csv                 업로드 테스트용 ERP CSV (UTF-8 / EUC-KR / 영문 헤더)
scripts/smoke.mjs               자동 점검 스크립트
public/sw.js                    PWA 서비스워커 (오프라인 셸)
```

**나중에 사내에서 ERP DB 에 직접 연결하게 되면** `src/lib/erp/source.ts` 만 바꾸면 됩니다.

1. `ErpSnapshotSource` 인터페이스를 구현하는 `DbErpSource` 를 만듭니다. (예: Next.js Route Handler `/api/erp/snapshot` 이 사내 ERP DB 를 조회해 `{ itemCode, itemName, qty }[]` 를 돌려주고, `DbErpSource` 가 그것을 `ErpSnapshot` 으로 반환)
2. `createErpSource()` 가 `new DbErpSource()` 를 돌려주게 바꿉니다.
3. 화면 A·E 와 `ErpFilePicker` 는 이 인터페이스만 사용하므로 그대로 동작합니다. (파일 선택 UI 대신 "ERP 에서 가져오기" 버튼만 두면 됩니다)

## 9. 테스트와 자동 점검

```bash
npm test            # vitest: 현재고 계산, 취소 거래, 부호/박스 환산, 차이 비교, CSV 인코딩·매핑 (15개)
npm run typecheck   # tsc
npm run lint        # eslint (React 컴파일러 규칙 포함)
npm run build       # 프로덕션 빌드
npm run smoke       # Supabase 가 떠 있을 때: 로그인 → 기준 적용 → 입력 → Realtime 수신 → 취소 자동 점검
```

`schema.sql` / `seed.sql` 자체는 실제 Postgres 에서 RLS·RPC·뷰 동작까지 검증했습니다(조회자 쓰기 거부, 취소 거래 상쇄, 새 기준 적용 시 이전 거래 제외, 신규 품목 자동 추가, 중복 코드 합산 등 34개 항목).

## 10. 자주 묻는 문제

- **로그인 후 바로 다시 로그인 화면으로 옵니다** → `.env.local` 값이 틀렸거나 Supabase Site URL 설정 누락. 브라우저 콘솔/네트워크 탭에서 401 확인.
- **조회자로 로그인했는데 입력 메뉴가 안 보입니다** → 정상입니다. 관리자가 사용자 화면에서 역할을 바꿔야 합니다.
- **"실시간 반영 중"이 아니라 "연결 중..."에 머뭅니다** → Supabase Realtime publication 에 테이블이 빠졌거나(4-6 참고), 회사 방화벽이 WebSocket 을 막는 경우. 화면 데이터는 "새로고침" 버튼으로 갱신됩니다.
- **ERP CSV 가 깨져 보입니다** → 자동 판별이 실패한 경우입니다. 엑셀에서 "CSV UTF-8" 로 다시 저장하거나, 파일 선택 후 표시되는 인코딩을 확인하세요.
- **첫 계정이 관리자가 되지 않았습니다** → `schema.sql` 실행 전에 만든 계정은 트리거를 타지 않습니다. 6번의 SQL 로 직접 지정하세요.
- **Docker 없이 로컬 테스트** → 클라우드 Supabase 프로젝트를 만들고 `.env.local` 에 연결하면 됩니다(4번).
