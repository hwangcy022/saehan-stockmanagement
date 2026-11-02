"use client";

import { useMemo, useState } from "react";
import { fmtDate, fmtNum, fmtSigned } from "@/lib/format";
import { DIFF_STATUS_LABEL, type DiffRow } from "@/lib/stock";

/** 웹 현재고 vs ERP 수량 차이 표 (불일치 빨간색, xlsx 다운로드) */
export function DiffTable({
  rows,
  webLabel = "웹 현재고",
  erpLabel = "ERP 수량",
  downloadName = "ERP대사",
}: {
  rows: DiffRow[];
  webLabel?: string;
  erpLabel?: string;
  downloadName?: string;
}) {
  const [onlyMismatch, setOnlyMismatch] = useState(true);
  const mismatch = useMemo(() => rows.filter((r) => r.status !== "match"), [rows]);
  const shown = onlyMismatch ? mismatch : rows;
  const totalDiff = mismatch.reduce((s, r) => s + Math.abs(r.diff), 0);

  async function download() {
    const XLSX = await import("xlsx");
    const data = rows.map((r) => ({
      품목코드: r.item_code,
      품목명: r.item_name,
      [webLabel]: r.web_qty,
      [erpLabel]: r.erp_qty,
      "차이(ERP-웹)": r.diff,
      상태: DIFF_STATUS_LABEL[r.status],
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [{ wch: 14 }, { wch: 28 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "대사");
    XLSX.writeFile(wb, `${downloadName}_${fmtDate(new Date()).replace(/-/g, "")}.xlsx`);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="badge bg-slate-100 text-slate-700">전체 {fmtNum(rows.length)}</span>
        <span className={`badge ${mismatch.length ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-800"}`}>불일치 {fmtNum(mismatch.length)}</span>
        {mismatch.length > 0 && <span className="text-xs text-slate-500">차이 절대값 합 {fmtNum(totalDiff)}</span>}
        <label className="ml-auto flex items-center gap-1 text-xs text-slate-600">
          <input type="checkbox" checked={onlyMismatch} onChange={(e) => setOnlyMismatch(e.target.checked)} />
          불일치만 보기
        </label>
        <button type="button" className="btn-secondary py-1 text-xs" onClick={() => void download()} disabled={rows.length === 0}>
          xlsx 다운로드
        </button>
      </div>
      <div className="card max-h-[60vh] overflow-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="sticky top-0 bg-slate-50">
            <tr>
              <th className="th">품목코드</th>
              <th className="th">품목명</th>
              <th className="th text-right">{webLabel}</th>
              <th className="th text-right">{erpLabel}</th>
              <th className="th text-right">차이 (ERP−웹)</th>
              <th className="th">상태</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.length === 0 && (
              <tr>
                <td colSpan={6} className="td py-6 text-center text-slate-500">
                  {rows.length === 0 ? "비교할 행이 없습니다." : "불일치 품목이 없습니다. 모두 일치합니다."}
                </td>
              </tr>
            )}
            {shown.map((r) => {
              const bad = r.status !== "match";
              return (
                <tr key={r.item_code} className={bad ? "bg-red-50" : ""}>
                  <td className="td font-mono text-xs">{r.item_code}</td>
                  <td className="td">{r.item_name}</td>
                  <td className="td tabular text-right">{fmtNum(r.web_qty)}</td>
                  <td className="td tabular text-right">{fmtNum(r.erp_qty)}</td>
                  <td className={`td tabular text-right font-semibold ${bad ? "text-red-700" : "text-slate-400"}`}>{r.diff === 0 ? "0" : fmtSigned(r.diff)}</td>
                  <td className="td">
                    <span
                      className={`badge ${r.status === "match" ? "bg-emerald-100 text-emerald-800" : r.status === "mismatch" ? "bg-red-100 text-red-700" : r.status === "erp_only" ? "bg-sky-100 text-sky-800" : "bg-amber-100 text-amber-800"}`}
                    >
                      {DIFF_STATUS_LABEL[r.status]}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
