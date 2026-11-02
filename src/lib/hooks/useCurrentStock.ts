"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "../supabase/client";
import type { StockRow } from "../types";

export type LiveStatus = "connecting" | "live" | "offline";

export interface CurrentStockState {
  rows: StockRow[];
  /** 마지막으로 서버에서 성공적으로 받아온 시각 (ms) */
  fetchedAt: number | null;
  /** 지금 보고 있는 데이터가 캐시(오프라인)인지 */
  fromCache: boolean;
  status: LiveStatus;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

interface Options {
  /** localStorage 캐시 키. 지정하면 오프라인 시 마지막 데이터를 보여줍니다. */
  cacheKey?: string;
  /** Realtime 구독 여부 (기본 true) */
  realtime?: boolean;
  /** 서버 컴포넌트가 initialRows 를 조회한 시각 (ms) */
  initialFetchedAt?: number | null;
}

interface CachePayload {
  rows: StockRow[];
  fetchedAt: number;
}

function readCache(key: string): CachePayload | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachePayload;
    if (!Array.isArray(parsed.rows)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(key: string, payload: CachePayload) {
  try {
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    /* 저장 공간 부족 등은 무시 */
  }
}

/**
 * current_stock 뷰를 읽고, transactions / baselines / items 변경을 Realtime 으로 구독해
 * 다른 사람이 입력하면 새로고침 없이 다시 조회합니다.
 */
export function useCurrentStock(initialRows: StockRow[], options: Options = {}): CurrentStockState {
  const { cacheKey, realtime = true, initialFetchedAt = null } = options;
  const [rows, setRows] = useState<StockRow[]>(initialRows);
  const [fetchedAt, setFetchedAt] = useState<number | null>(initialRows.length > 0 ? initialFetchedAt : null);
  const [fromCache, setFromCache] = useState(false);
  const [status, setStatus] = useState<LiveStatus>(realtime ? "connecting" : "offline");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error: err } = await supabase.from("current_stock").select("*").order("item_code");
      if (err) throw err;
      const now = Date.now();
      setRows(data ?? []);
      setFetchedAt(now);
      setFromCache(false);
      setError(null);
      if (cacheKey) writeCache(cacheKey, { rows: data ?? [], fetchedAt: now });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      if (cacheKey) {
        const cached = readCache(cacheKey);
        if (cached) {
          setRows(cached.rows);
          setFetchedAt(cached.fetchedAt);
          setFromCache(true);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [cacheKey]);

  // 첫 렌더: 서버가 준 데이터를 캐시에 저장. 오프라인이면 refetch 가 실패하면서 캐시로 대체됨.
  useEffect(() => {
    if (!cacheKey) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const t = setTimeout(() => void refetch(), 0);
      return () => clearTimeout(t);
    }
    if (initialRows.length > 0) writeCache(cacheKey, { rows: initialRows, fetchedAt: initialFetchedAt ?? Date.now() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  // 온라인/오프라인 전환
  useEffect(() => {
    const onOnline = () => {
      void refetch();
    };
    const onOffline = () => setStatus("offline");
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [refetch]);

  // Realtime 구독: 변경이 몰려와도 300ms 에 한 번만 재조회
  useEffect(() => {
    if (!realtime) return;
    const supabase = createClient();
    const schedule = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void refetch();
      }, 300);
    };
    const channel = supabase
      .channel("stock-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "baselines" }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "items" }, schedule)
      .subscribe((s) => {
        if (s === "SUBSCRIBED") {
          setStatus("live");
          // 구독 전에 놓친 변경을 보정
          void refetch();
        } else if (s === "CLOSED" || s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
          setStatus("offline");
        }
      });
    return () => {
      if (timer.current) clearTimeout(timer.current);
      void supabase.removeChannel(channel);
    };
  }, [realtime, refetch]);

  return { rows, fetchedAt, fromCache, status, loading, error, refetch };
}
