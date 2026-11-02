// =============================================================================
// 자동 점검 스크립트: 로그인 → ERP 업로드(기준 적용) → 수불 입력 → 조회자 Realtime 수신 → 취소
// 실행:  npm run smoke   (.env.local 의 NEXT_PUBLIC_SUPABASE_URL / ANON_KEY 사용)
// 계정:  SMOKE_ADMIN_EMAIL / SMOKE_ADMIN_PASSWORD / SMOKE_VIEWER_EMAIL / SMOKE_VIEWER_PASSWORD
//        (없으면 seed.sql 의 admin@saehan.local / viewer@saehan.local 사용)
// =============================================================================
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

try {
  if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local");
} catch {
  /* ignore */
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!URL || !KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 가 없습니다 (.env.local)");
  process.exit(1);
}
const ADMIN = { email: process.env.SMOKE_ADMIN_EMAIL || "admin@saehan.local", password: process.env.SMOKE_ADMIN_PASSWORD || "admin1234" };
const VIEWER = { email: process.env.SMOKE_VIEWER_EMAIL || "viewer@saehan.local", password: process.env.SMOKE_VIEWER_PASSWORD || "viewer1234" };

const results = [];
const ok = (name, cond, detail = "") => {
  results.push({ name, ok: !!cond });
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  -- " + detail : ""}`);
};
const fail = (name, e) => ok(name, false, e?.message || String(e));

const admin = createClient(URL, KEY, { auth: { persistSession: false } });
const viewer = createClient(URL, KEY, { auth: { persistSession: false } });

try {
  // 1. 로그인
  const a = await admin.auth.signInWithPassword(ADMIN);
  ok("관리자 로그인", !a.error, a.error?.message);
  const v = await viewer.auth.signInWithPassword(VIEWER);
  ok("조회자 로그인", !v.error, v.error?.message);
  if (a.error || v.error) throw new Error("로그인 실패 — seed.sql 의 계정이 있는지, 비밀번호가 맞는지 확인");

  const { data: ap } = await admin.from("profiles").select("role").eq("id", a.data.user.id).single();
  const { data: vp } = await viewer.from("profiles").select("role").eq("id", v.data.user.id).single();
  ok("역할 확인 (admin / viewer)", ap?.role === "admin" && vp?.role === "viewer", `${ap?.role} / ${vp?.role}`);

  // 2. 조회자 Realtime 구독 (관리자 입력을 받는지)
  const received = [];
  const channel = viewer
    .channel("smoke")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "transactions" }, (p) => received.push(p.new))
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "baselines" }, (p) => received.push(p.new));
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Realtime 구독 타임아웃")), 10000);
    channel.subscribe((s) => {
      if (s === "SUBSCRIBED") {
        clearTimeout(t);
        resolve();
      }
      if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
        clearTimeout(t);
        reject(new Error("Realtime " + s));
      }
    });
  }).then(() => ok("조회자 Realtime 구독", true)).catch((e) => fail("조회자 Realtime 구독", e));

  // 3. ERP 업로드 (현재 웹 재고를 그대로 + TR-24 는 +7, 신규 품목 1개) → 기준 적용
  const { data: before } = await admin.from("current_stock").select("item_code,item_name,current_qty").order("item_code");
  const lines = before.map((r) => ({ item_code: r.item_code, item_name: r.item_name, qty: Number(r.current_qty) + (r.item_code === "TR-24" ? 7 : 0) }));
  lines.push({ item_code: "SMOKE-NEW", item_name: "점검용 신규 품목", qty: 12 });
  const { data: applied, error: applyErr } = await admin.rpc("apply_baseline", { p_file_name: "smoke.csv", p_note: "자동 점검", p_lines: lines });
  ok("ERP 기준 적용 (apply_baseline)", !applyErr && applied?.baseline_id, applyErr?.message || JSON.stringify(applied));
  ok("신규 품목 자동 추가 보고", applied?.new_item_codes?.includes("SMOKE-NEW") || (await admin.from("items").select("item_code").eq("item_code", "SMOKE-NEW")).data?.length === 1);
  const { data: tr0 } = await admin.from("current_stock").select("current_qty,tx_count,baseline_id").eq("item_code", "TR-24").single();
  const trBefore = Number(before.find((r) => r.item_code === "TR-24")?.current_qty ?? 0);
  ok("새 기준 후 현재고 = ERP 값, 이전 거래 제외", Number(tr0.current_qty) === trBefore + 7 && Number(tr0.tx_count) === 0, JSON.stringify(tr0));

  // 조회자는 쓰기 불가
  const vIns = await viewer.from("transactions").insert({ tx_type: "IN", item_code: "TR-24", qty: 1 });
  ok("조회자 transactions insert 거부(RLS)", !!vIns.error, vIns.error?.message);
  const vRpc = await viewer.rpc("apply_baseline", { p_file_name: "x", p_note: null, p_lines: [{ item_code: "TR-24", item_name: "", qty: 1 }] });
  ok("조회자 apply_baseline 거부", !!vRpc.error, vRpc.error?.message);

  // 4. 수불 입력 (출고 -150)
  const { data: tx, error: txErr } = await admin.from("transactions").insert({ tx_type: "OUT", item_code: "TR-24", qty: -150, note: "자동 점검 출고" }).select("*").single();
  ok("수불 입력 (출고)", !txErr && tx?.baseline_id === applied?.baseline_id, txErr?.message || `baseline_id=${tx?.baseline_id}`);
  const { data: tr1 } = await admin.from("current_stock").select("current_qty,out_sum").eq("item_code", "TR-24").single();
  ok("저장 즉시 현재고 -150", Number(tr1.current_qty) === trBefore + 7 - 150 && Number(tr1.out_sum) === 150, JSON.stringify(tr1));

  // 5. 조회자가 Realtime 으로 받았는지 (최대 8초 대기)
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline && !received.some((r) => r.id === tx?.id)) await new Promise((r) => setTimeout(r, 200));
  ok("조회자 Realtime 으로 거래 INSERT 수신", received.some((r) => r.id === tx?.id), `수신 ${received.length}건`);
  const { data: vStock } = await viewer.from("current_stock").select("current_qty").eq("item_code", "TR-24").single();
  ok("조회자 화면 재조회 값 일치", Number(vStock.current_qty) === Number(tr1.current_qty));

  // 6. 취소 거래
  const { data: revId, error: revErr } = await admin.rpc("reverse_transaction", { p_tx_id: tx.id });
  ok("취소 거래 생성 (reverse_transaction)", !revErr && revId, revErr?.message);
  const { data: tr2 } = await admin.from("current_stock").select("current_qty").eq("item_code", "TR-24").single();
  ok("취소 후 현재고 복귀", Number(tr2.current_qty) === trBefore + 7, JSON.stringify(tr2));
  const again = await admin.rpc("reverse_transaction", { p_tx_id: tx.id });
  ok("재취소 거부", !!again.error, again.error?.message);
  const del = await admin.from("transactions").delete().eq("id", tx.id).select("id");
  ok("transactions delete 불가 (0행)", !del.error && (del.data?.length ?? 0) === 0, JSON.stringify(del.data));

  await viewer.removeChannel(channel);
} catch (e) {
  fail("예외", e);
} finally {
  await admin.auth.signOut();
  await viewer.auth.signOut();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
