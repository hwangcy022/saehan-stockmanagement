import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DiffTable } from "@/components/DiffTable";
import { requireAdmin } from "@/lib/auth";
import { fmtDateTime, fmtNum } from "@/lib/format";
import type { DiffRow } from "@/lib/stock";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "기준 차이 표" };

export default async function BaselineDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const baselineId = Number(id);
  if (!Number.isInteger(baselineId)) notFound();

  const supabase = await createClient();
  const [{ data: baseline }, { data: lines }, { data: items }] = await Promise.all([
    supabase.from("baselines").select("*").eq("id", baselineId).maybeSingle(),
    supabase.from("baseline_lines").select("*").eq("baseline_id", baselineId).order("item_code"),
    supabase.from("items").select("item_code, item_name"),
  ]);
  if (!baseline) notFound();

  const names = new Map((items ?? []).map((i) => [i.item_code, i.item_name]));
  const rows: DiffRow[] = (lines ?? []).map((l) => {
    const web = l.web_qty_before === null ? null : Number(l.web_qty_before);
    const erp = Number(l.erp_qty);
    const diff = Math.round((erp - (web ?? 0)) * 1000) / 1000;
    const isNew = baseline.new_item_codes.includes(l.item_code);
    return {
      item_code: l.item_code,
      item_name: names.get(l.item_code) ?? "",
      web_qty: web ?? 0,
      erp_qty: erp,
      diff,
      status: isNew ? (erp === 0 ? "match" : "erp_only") : diff === 0 ? "match" : web !== null && erp === 0 && web !== 0 ? "web_only" : "mismatch",
    };
  });

  return (
    <div className="space-y-4">
      <div>
        <Link href="/upload" className="text-sm text-brand hover:underline">
          ← 업로드 이력
        </Link>
        <h1 className="mt-1 text-xl font-bold">기준 #{baseline.id} 차이 표</h1>
        <p className="text-sm text-slate-600">
          {fmtDateTime(baseline.uploaded_at)} · {baseline.file_name} · {fmtNum(baseline.line_count)}행 {baseline.note && <>· {baseline.note}</>}
        </p>
        {baseline.new_item_codes.length > 0 && (
          <p className="mt-1 text-sm text-sky-800">
            이 업로드로 자동 추가된 품목 {baseline.new_item_codes.length}건: <span className="font-mono text-xs">{baseline.new_item_codes.join(", ")}</span>
          </p>
        )}
      </div>
      <DiffTable rows={rows} webLabel="업로드 직전 웹 재고" erpLabel="ERP 수량" downloadName={`ERP기준${baseline.id}_차이`} />
    </div>
  );
}
