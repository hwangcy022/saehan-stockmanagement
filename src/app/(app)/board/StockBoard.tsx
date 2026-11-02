"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { LiveStatusBar } from "@/components/LiveStatus";
import { fmtBoxes, fmtDateTime, fmtNum } from "@/lib/format";
import { useCurrentStock } from "@/lib/hooks/useCurrentStock";
import { useLocalStorage } from "@/lib/hooks/useLocalStorage";
import { qtyToBoxes } from "@/lib/stock";
import type { StockRow } from "@/lib/types";

type SortKey = "item_code" | "item_name" | "current_qty" | "last_changed_at" | "in_sum" | "out_sum";
const LOW_KEY = "stock.lowThreshold";

function SortTh({
  k,
  children,
  right,
  sortKey,
  sortDir,
  onToggle,
}: {
  k: SortKey;
  children: React.ReactNode;
  right?: boolean;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onToggle: (k: SortKey) => void;
}) {
  return (
    <th className={`th cursor-pointer select-none hover:text-slate-800 ${right ? "text-right" : ""}`} onClick={() => onToggle(k)}>
      {children}
      {sortKey === k && <span className="ml-1 text-brand">{sortDir === "asc" ? "▲" : "▼"}</span>}
    </th>
  );
}

export function StockBoard({ initialRows, initialFetchedAt, isAdmin }: { initialRows: StockRow[]; initialFetchedAt: number; isAdmin: boolean }) {
  const stock = useCurrentStock(initialRows, { cacheKey: "stock.cache.board", initialFetchedAt });
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("item_code");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showInactive, setShowInactive] = useState(false);
  const [low, setLow] = useLocalStorage<number>(LOW_KEY, 100);

  function updateLow(v: number) {
    setLow(Number.isFinite(v) ? v : 0);
  }

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "current_qty" || k === "last_changed_at" || k === "in_sum" || k === "out_sum" ? "desc" : "asc");
    }
  }

  const baselineAt = stock.rows.find((r) => r.baseline_at)?.baseline_at ?? null;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = stock.rows.filter((r) => showInactive || r.is_active);
    if (needle) list = list.filter((r) => r.item_code.toLowerCase().includes(needle) || r.item_name.toLowerCase().includes(needle));
    const dir = sortDir === "asc" ? 1 : -1;
    list = [...list].sort((a, b) => {
      // 0 이하 품목은 항상 상단 고정
      const az = Number(a.current_qty) <= 0 ? 0 : 1;
      const bz = Number(b.current_qty) <= 0 ? 0 : 1;
      if (az !== bz) return az - bz;
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av ?? "").localeCompare(String(bv ?? ""), "ko") * dir;
    });
    return list;
  }, [stock.rows, q, sortKey, sortDir, showInactive]);

  const zeroCount = stock.rows.filter((r) => r.is_active && Number(r.current_qty) <= 0).length;
  const lowCount = stock.rows.filter((r) => r.is_active && Number(r.current_qty) > 0 && Number(r.current_qty) <= low).length;

  const th = { sortKey, sortDir, onToggle: toggleSort };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">재고 보드</h1>
          <LiveStatusBar baselineAt={baselineAt} status={stock.status} fetchedAt={stock.fetchedAt} fromCache={stock.fromCache} loading={stock.loading} />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="badge bg-slate-100 text-slate-700">품목 {fmtNum(stock.rows.filter((r) => r.is_active).length)}</span>
          <span className={`badge ${zeroCount ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-500"}`}>0 이하 {zeroCount}</span>
          <span className={`badge ${lowCount ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500"}`}>부족 {lowCount}</span>
        </div>
      </div>

      <div className="card flex flex-wrap items-center gap-3 p-3">
        <input
          className="input max-w-xs"
          placeholder="품목코드 / 품목명 검색"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm text-slate-600">
          부족 기준 ≤
          <input
            type="number"
            className="input w-24 py-1"
            value={low}
            min={0}
            onChange={(e) => updateLow(Number(e.target.value) || 0)}
          />
        </label>
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          비활성 품목 표시
        </label>
        <button type="button" className="btn-secondary ml-auto py-1.5 text-xs" onClick={() => void stock.refetch()} disabled={stock.loading}>
          새로고침
        </button>
      </div>

      {stock.error && !stock.fromCache && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">갱신 실패: {stock.error}</div>
      )}

      <div className="card overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <SortTh k="item_code" {...th}>
                품목코드
              </SortTh>
              <SortTh k="item_name" {...th}>
                품목명
              </SortTh>
              <SortTh k="current_qty" right {...th}>
                현재고
              </SortTh>
              <th className="th text-right">박스 환산</th>
              <SortTh k="last_changed_at" {...th}>
                마지막 변경
              </SortTh>
              <SortTh k="in_sum" right {...th}>
                기준 이후 입고
              </SortTh>
              <SortTh k="out_sum" right {...th}>
                기준 이후 출고
              </SortTh>
              <th className="th text-right">조정</th>
              <th className="th text-right">ERP 기준</th>
              {isAdmin && <th className="th" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 && (
              <tr>
                <td className="td py-8 text-center text-slate-500" colSpan={isAdmin ? 10 : 9}>
                  {stock.rows.length === 0 ? "품목이 없습니다. ERP 업로드로 기준을 먼저 만들어 주세요." : "검색 결과가 없습니다."}
                </td>
              </tr>
            )}
            {filtered.map((r) => {
              const qty = Number(r.current_qty);
              const isZero = qty <= 0;
              const isLow = !isZero && qty <= low;
              return (
                <tr key={r.item_code} className={`${isZero ? "bg-red-50" : isLow ? "bg-amber-50" : ""} ${!r.is_active ? "opacity-50" : ""}`}>
                  <td className="td font-mono text-xs">{r.item_code}</td>
                  <td className="td">
                    {r.item_name}
                    {!r.is_active && <span className="badge ml-1 bg-slate-200 text-slate-600">비활성</span>}
                  </td>
                  <td className={`td tabular text-right font-semibold ${isZero ? "text-red-700" : isLow ? "text-amber-800" : ""}`}>
                    {fmtNum(qty)} <span className="text-xs font-normal text-slate-400">{r.unit}</span>
                  </td>
                  <td className="td tabular text-right text-slate-600">
                    {fmtBoxes(qtyToBoxes(qty, r.qty_per_box))} <span className="text-xs text-slate-400">박스</span>
                  </td>
                  <td className="td tabular whitespace-nowrap text-slate-600">{fmtDateTime(r.last_changed_at)}</td>
                  <td className="td tabular text-right text-emerald-700">{Number(r.in_sum) ? `+${fmtNum(r.in_sum)}` : "-"}</td>
                  <td className="td tabular text-right text-rose-700">{Number(r.out_sum) ? `-${fmtNum(r.out_sum)}` : "-"}</td>
                  <td className="td tabular text-right text-slate-600">{Number(r.adj_sum) ? fmtNum(r.adj_sum) : "-"}</td>
                  <td className="td tabular text-right text-slate-500">{fmtNum(r.erp_qty)}</td>
                  {isAdmin && (
                    <td className="td text-right">
                      <Link href={`/entry?item=${encodeURIComponent(r.item_code)}`} className="text-xs font-medium text-brand hover:underline">
                        입력
                      </Link>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        0 이하 품목은 빨간색으로 상단에 고정되고, 부족 기준 이하 품목은 노란색으로 표시됩니다. 현재고 = ERP 기준 + 기준 이후 입고 − 출고 ± 조정.
      </p>
    </div>
  );
}
