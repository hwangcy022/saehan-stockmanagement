"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DiffTable } from "@/components/DiffTable";
import { ErpFilePicker } from "@/components/ErpFilePicker";
import type { ErpSnapshot } from "@/lib/erp/source";
import { fmtNum } from "@/lib/format";
import { diffStock, type DiffRow } from "@/lib/stock";
import { createClient } from "@/lib/supabase/client";
import type { ApplyBaselineResult } from "@/lib/types";

type Step = { kind: "pick" } | { kind: "preview"; snapshot: ErpSnapshot; diff: DiffRow[] } | { kind: "done"; result: ApplyBaselineResult; snapshot: ErpSnapshot };

export function UploadScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "pick" });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSnapshot(snapshot: ErpSnapshot) {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: err } = await supabase.from("current_stock").select("item_code, item_name, current_qty");
      if (err) throw err;
      setStep({ kind: "preview", snapshot, diff: diffStock(data ?? [], snapshot.rows) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (step.kind !== "preview") return;
    const mismatch = step.diff.filter((r) => r.status !== "match").length;
    if (!confirm(`${fmtNum(step.snapshot.rows.length)}개 품목의 ERP 수량을 새 기준으로 적용합니다.\n불일치 ${mismatch}건은 ERP 값으로 덮어써지고, 이전 거래는 이력으로만 남습니다.\n계속할까요?`)) return;
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const lines = step.snapshot.rows.map((r) => ({ item_code: r.itemCode, item_name: r.itemName, qty: r.qty }));
      const { data, error: err } = await supabase.rpc("apply_baseline", { p_file_name: step.snapshot.sourceLabel, p_note: note || null, p_lines: lines });
      if (err) throw err;
      const result = data as unknown as ApplyBaselineResult;
      setStep({ kind: "done", result, snapshot: step.snapshot });
      setNote("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {step.kind === "pick" && (
        <div className="card p-4">
          <ErpFilePicker onSnapshot={onSnapshot} disabled={busy} />
          {busy && <p className="mt-2 text-sm text-slate-500">웹 현재고와 비교 중...</p>}
        </div>
      )}

      {step.kind === "preview" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-semibold">
              미리보기: 현재 웹 재고 vs 새 ERP 수량 <span className="text-sm font-normal text-slate-500">({step.snapshot.sourceLabel})</span>
            </h2>
            <button type="button" className="btn-secondary ml-auto py-1 text-xs" onClick={() => setStep({ kind: "pick" })}>
              다른 파일
            </button>
          </div>
          {step.snapshot.warnings.length > 0 && (
            <ul className="list-disc rounded-md border border-amber-300 bg-amber-50 p-3 pl-7 text-sm text-amber-800">
              {step.snapshot.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
          {step.diff.some((r) => r.status === "erp_only") && (
            <p className="text-sm text-sky-800">
              ERP 파일에만 있는 품목 {step.diff.filter((r) => r.status === "erp_only").length}건은 적용 시 품목 목록에 자동 추가됩니다. (박스당수량은 1 로 들어가니 품목 화면에서 수정)
            </p>
          )}
          <DiffTable rows={step.diff} downloadName="ERP기준_미리보기" />
          <div className="card flex flex-wrap items-end gap-3 p-4">
            <label className="flex-1">
              <span className="mb-1 block text-xs font-medium text-slate-600">비고 (선택)</span>
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 11월 1주차 ERP 마감 기준" />
            </label>
            <button type="button" className="btn-primary" onClick={() => void apply()} disabled={busy}>
              {busy ? "적용 중..." : "확인 — 이 ERP 수량을 새 기준으로 적용"}
            </button>
          </div>
        </div>
      )}

      {step.kind === "done" && (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-semibold">기준 #{step.result.baseline_id} 가 적용되었습니다. 이제부터 입력하는 거래는 이 기준 이후로 집계됩니다.</p>
          {step.result.new_item_codes.length > 0 ? (
            <p className="mt-1">
              items 에 없어 자동 추가된 품목 {step.result.new_item_codes.length}건:{" "}
              <span className="font-mono text-xs">{step.result.new_item_codes.join(", ")}</span>{" "}
              <Link href="/items" className="underline">
                품목 화면에서 박스당수량 지정
              </Link>
            </p>
          ) : (
            <p className="mt-1">새로 추가된 품목은 없습니다.</p>
          )}
          <div className="mt-2 flex gap-2">
            <Link href={`/upload/${step.result.baseline_id}`} className="btn-secondary py-1 text-xs">
              차이 표 보기
            </Link>
            <Link href="/board" className="btn-secondary py-1 text-xs">
              재고 보드
            </Link>
            <button type="button" className="btn-secondary py-1 text-xs" onClick={() => setStep({ kind: "pick" })}>
              다른 파일 업로드
            </button>
          </div>
        </div>
      )}

      {error && <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    </div>
  );
}
