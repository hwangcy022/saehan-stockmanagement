"use client";

import { fmtAgo, fmtDateTime } from "@/lib/format";
import type { LiveStatus } from "@/lib/hooks/useCurrentStock";
import { useEffect, useState } from "react";

/** "마지막 ERP 기준: ..." + "실시간 반영 중" / "N분 전 데이터" 표시줄 */
export function LiveStatusBar({
  baselineAt,
  status,
  fetchedAt,
  fromCache,
  loading,
  compact = false,
}: {
  baselineAt: string | null;
  status: LiveStatus;
  fetchedAt: number | null;
  fromCache: boolean;
  loading?: boolean;
  compact?: boolean;
}) {
  // "N분 전" 을 1분마다 갱신
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((v) => v + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const stale = fromCache || status === "offline";
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${compact ? "text-xs" : "text-sm"} text-slate-600`}>
      <span>
        마지막 ERP 기준: <b className="text-slate-800">{baselineAt ? fmtDateTime(baselineAt) : "없음"}</b>
      </span>
      {stale ? (
        <span className="badge bg-amber-100 text-amber-800">
          {fetchedAt ? `${fmtAgo(fetchedAt)} 데이터` : "오프라인"}
          {fromCache ? " (오프라인)" : ""}
        </span>
      ) : status === "live" ? (
        <span className="badge bg-emerald-100 text-emerald-800">
          <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
          실시간 반영 중
        </span>
      ) : (
        <span className="badge bg-slate-100 text-slate-600">연결 중...</span>
      )}
      {loading && <span className="text-xs text-slate-400">갱신 중</span>}
    </div>
  );
}
