"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { LiveStatusBar } from "@/components/LiveStatus";
import { fmtBoxes, fmtDateTime, fmtNum } from "@/lib/format";
import { useCurrentStock } from "@/lib/hooks/useCurrentStock";
import { useLocalStorage } from "@/lib/hooks/useLocalStorage";
import { qtyToBoxes } from "@/lib/stock";
import type { StockRow } from "@/lib/types";

const FAV_KEY = "stock.favorites";
const NO_FAVS: string[] = [];

export function MobileView({ initialRows, initialFetchedAt, isAdmin }: { initialRows: StockRow[]; initialFetchedAt: number; isAdmin: boolean }) {
  const stock = useCurrentStock(initialRows, { cacheKey: "stock.cache.mobile", initialFetchedAt });
  const [q, setQ] = useState("");
  const [favsRaw, setFavs] = useLocalStorage<string[]>(FAV_KEY, NO_FAVS);
  const favs = Array.isArray(favsRaw) ? favsRaw : NO_FAVS;

  function toggleFav(code: string) {
    setFavs((prev) => {
      const p = Array.isArray(prev) ? prev : [];
      return p.includes(code) ? p.filter((c) => c !== code) : [...p, code];
    });
  }

  const baselineAt = stock.rows.find((r) => r.baseline_at)?.baseline_at ?? null;
  const rows = useMemo(() => stock.rows.filter((r) => r.is_active), [stock.rows]);

  const needle = q.trim().toLowerCase();
  const results = useMemo(() => {
    if (!needle) return [];
    return rows
      .filter((r) => r.item_code.toLowerCase().includes(needle) || r.item_name.toLowerCase().includes(needle))
      .slice(0, 50);
  }, [rows, needle]);

  const favRows = useMemo(() => rows.filter((r) => favs.includes(r.item_code)), [rows, favs]);

  const Card = ({ r }: { r: StockRow }) => {
    const qty = Number(r.current_qty);
    const fav = favs.includes(r.item_code);
    return (
      <div className={`card p-3 ${qty <= 0 ? "border-red-300 bg-red-50" : ""}`}>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-semibold">{r.item_name || "(품목명 없음)"}</div>
            <div className="font-mono text-xs text-slate-500">{r.item_code}</div>
          </div>
          <button
            type="button"
            onClick={() => toggleFav(r.item_code)}
            className={`-mr-1 -mt-1 px-2 py-1 text-xl leading-none ${fav ? "text-amber-500" : "text-slate-300"}`}
            aria-label={fav ? "즐겨찾기 해제" : "즐겨찾기"}
          >
            ★
          </button>
        </div>
        <div className="mt-2 flex items-end justify-between">
          <div className={`tabular text-3xl font-bold ${qty <= 0 ? "text-red-700" : "text-slate-900"}`}>
            {fmtNum(qty)} <span className="text-sm font-normal text-slate-500">{r.unit}</span>
          </div>
          <div className="text-right text-xs text-slate-500">
            <div className="tabular">{fmtBoxes(qtyToBoxes(qty, r.qty_per_box))} 박스</div>
            <div className="tabular">변경 {fmtDateTime(r.last_changed_at)}</div>
          </div>
        </div>
        {isAdmin && (
          <div className="mt-2 text-right">
            <Link href={`/entry?item=${encodeURIComponent(r.item_code)}`} className="text-xs font-medium text-brand underline">
              수불 입력
            </Link>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <input
        className="input py-3 text-base"
        placeholder="품목코드 또는 품목명 검색"
        autoFocus
        inputMode="search"
        enterKeyHint="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <LiveStatusBar
        baselineAt={baselineAt}
        status={stock.status}
        fetchedAt={stock.fetchedAt}
        fromCache={stock.fromCache}
        loading={stock.loading}
        compact
      />

      {needle ? (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold text-slate-500">검색 결과 {results.length}건</h2>
          {results.length === 0 && <p className="py-6 text-center text-sm text-slate-500">일치하는 품목이 없습니다.</p>}
          {results.map((r) => (
            <Card key={r.item_code} r={r} />
          ))}
        </section>
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="text-xs font-semibold text-slate-500">즐겨찾기 {favRows.length}건</h2>
            {favRows.length === 0 && (
              <p className="rounded-md border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
                자주 묻는 품목을 검색한 뒤 ★ 을 누르면 여기에 고정됩니다.
              </p>
            )}
            {favRows.map((r) => (
              <Card key={r.item_code} r={r} />
            ))}
          </section>
          <section className="space-y-2">
            <h2 className="text-xs font-semibold text-slate-500">
              0 이하 품목 {rows.filter((r) => Number(r.current_qty) <= 0).length}건
            </h2>
            {rows
              .filter((r) => Number(r.current_qty) <= 0)
              .slice(0, 20)
              .map((r) => (
                <Card key={r.item_code} r={r} />
              ))}
          </section>
        </>
      )}
    </div>
  );
}
