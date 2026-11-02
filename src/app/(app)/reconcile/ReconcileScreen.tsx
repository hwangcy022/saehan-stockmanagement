"use client";

import Link from "next/link";
import { useState } from "react";
import { DiffTable } from "@/components/DiffTable";
import { ErpFilePicker } from "@/components/ErpFilePicker";
import type { ErpSnapshot } from "@/lib/erp/source";
import { fmtDateTime } from "@/lib/format";
import { diffStock, type DiffRow } from "@/lib/stock";
import { createClient } from "@/lib/supabase/client";

export function ReconcileScreen() {
  const [result, setResult] = useState<{ snapshot: ErpSnapshot; diff: DiffRow[]; at: Date; baselineAt: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSnapshot(snapshot: ErpSnapshot) {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: err } = await supabase.from("current_stock").select("item_code, item_name, current_qty, baseline_at");
      if (err) throw err;
      setResult({ snapshot, diff: diffStock(data ?? [], snapshot.rows), at: new Date(), baselineAt: data?.[0]?.baseline_at ?? null });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <ErpFilePicker onSnapshot={onSnapshot} disabled={busy} />
      </div>
      {error && <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {result && (
        <div className="space-y-3">
          <div className="text-sm text-slate-600">
            비교 시각 {fmtDateTime(result.at)} · 웹 기준 {result.baselineAt ? fmtDateTime(result.baselineAt) : "없음"} · 파일 {result.snapshot.sourceLabel}
          </div>
          {result.snapshot.warnings.length > 0 && (
            <ul className="list-disc rounded-md border border-amber-300 bg-amber-50 p-3 pl-7 text-sm text-amber-800">
              {result.snapshot.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
          <DiffTable rows={result.diff} downloadName="ERP대사점검" />
          <p className="text-xs text-slate-500">
            불일치가 많으면 원인(미입력 수불, ERP 미반영 등)을 확인한 뒤{" "}
            <Link href="/upload" className="text-brand underline">
              ERP 업로드
            </Link>
            에서 같은 파일을 새 기준으로 적용할 수 있습니다.
          </p>
        </div>
      )}
    </div>
  );
}
