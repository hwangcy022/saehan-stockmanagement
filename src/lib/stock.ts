// 핵심 재고 계산 (순수 함수). supabase/schema.sql 의 current_stock 뷰와 같은 규칙을 따릅니다.
//   현재고 = 최신 기준의 ERP수량 + 그 기준 이후 거래 합
//   출고는 음수로 저장, 취소 거래는 원거래와 같은 구분·반대 부호

import type { TxType } from "./types";

export interface TxLike {
  id?: number;
  item_code: string;
  tx_type: TxType;
  qty: number;
  baseline_id: number | null;
  reversal_of?: number | null;
  created_at?: string;
}

export interface BaselineLike {
  id: number;
  uploaded_at: string;
}

export interface BaselineLineLike {
  baseline_id: number;
  item_code: string;
  erp_qty: number;
}

export interface StockSummary {
  item_code: string;
  erp_qty: number;
  in_sum: number;
  out_sum: number;
  adj_sum: number;
  tx_count: number;
  current_qty: number;
}

/** 입력 수량(항상 양수로 입력)을 구분에 맞는 부호로 변환. 조정은 입력 부호 그대로. */
export function signedQty(txType: TxType, inputQty: number): number {
  const q = Number(inputQty);
  if (!Number.isFinite(q)) throw new Error("수량이 숫자가 아닙니다");
  if (txType === "IN") return Math.abs(q);
  if (txType === "OUT") return -Math.abs(q);
  return q;
}

/** 박스 수 × 박스당수량 → 수량 */
export function boxesToQty(boxes: number, qtyPerBox: number): number {
  return round3(Number(boxes) * Number(qtyPerBox));
}

/** 수량 → 박스 환산 (소수 1자리) */
export function qtyToBoxes(qty: number, qtyPerBox: number): number {
  if (!qtyPerBox || qtyPerBox <= 0) return 0;
  return Math.round((Number(qty) / Number(qtyPerBox)) * 10) / 10;
}

export function latestBaseline<T extends BaselineLike>(baselines: T[]): T | null {
  if (baselines.length === 0) return null;
  return baselines.reduce((a, b) => (b.id > a.id ? b : a));
}

/**
 * 품목별 현재고 계산.
 * - 최신 기준(id 최대)의 ERP수량을 시작값으로 사용
 * - 거래는 baseline_id 가 최신 기준과 같은 것만 합산 (기준이 없으면 baseline_id null 인 거래만)
 */
export function computeCurrentStock(
  itemCodes: string[],
  baselines: BaselineLike[],
  lines: BaselineLineLike[],
  txs: TxLike[],
): Map<string, StockSummary> {
  const latest = latestBaseline(baselines);
  const latestId = latest ? latest.id : null;
  const out = new Map<string, StockSummary>();
  for (const code of itemCodes) {
    out.set(code, { item_code: code, erp_qty: 0, in_sum: 0, out_sum: 0, adj_sum: 0, tx_count: 0, current_qty: 0 });
  }
  const ensure = (code: string) => {
    let s = out.get(code);
    if (!s) {
      s = { item_code: code, erp_qty: 0, in_sum: 0, out_sum: 0, adj_sum: 0, tx_count: 0, current_qty: 0 };
      out.set(code, s);
    }
    return s;
  };
  if (latestId !== null) {
    for (const l of lines) {
      if (l.baseline_id !== latestId) continue;
      ensure(l.item_code).erp_qty += Number(l.erp_qty);
    }
  }
  for (const t of txs) {
    if ((t.baseline_id ?? null) !== latestId) continue;
    const s = ensure(t.item_code);
    const q = Number(t.qty);
    s.tx_count += 1;
    if (t.tx_type === "IN") s.in_sum += q;
    else if (t.tx_type === "OUT") s.out_sum += -q;
    else s.adj_sum += q;
  }
  for (const s of out.values()) {
    s.current_qty = round3(s.erp_qty + s.in_sum - s.out_sum + s.adj_sum);
  }
  return out;
}

/** 취소 거래 생성 규칙: 같은 품목·구분·기준, 반대 부호, reversal_of = 원거래 id */
export function makeReversal<T extends TxLike & { id: number }>(original: T, note?: string): TxLike & { note: string } {
  if (original.reversal_of) throw new Error("취소 거래는 다시 취소할 수 없습니다");
  return {
    item_code: original.item_code,
    tx_type: original.tx_type,
    qty: -Number(original.qty),
    baseline_id: original.baseline_id,
    reversal_of: original.id,
    note: note && note.trim() ? note.trim() : `취소: #${original.id}`,
  };
}

export type DiffStatus = "match" | "mismatch" | "erp_only" | "web_only";

export interface DiffRow {
  item_code: string;
  item_name: string;
  web_qty: number;
  erp_qty: number;
  diff: number; // erp - web
  status: DiffStatus;
}

/** 웹 현재고 vs ERP 수량 비교 (업로드 미리보기, 대사 점검 공용) */
export function diffStock(
  web: Array<{ item_code: string; item_name: string; current_qty: number }>,
  erp: Array<{ itemCode: string; itemName: string; qty: number }>,
): DiffRow[] {
  const erpMap = new Map<string, { itemName: string; qty: number }>();
  for (const r of erp) {
    const code = r.itemCode.trim();
    const prev = erpMap.get(code);
    erpMap.set(code, { itemName: r.itemName || prev?.itemName || "", qty: (prev?.qty ?? 0) + Number(r.qty || 0) });
  }
  const rows: DiffRow[] = [];
  const seen = new Set<string>();
  for (const w of web) {
    seen.add(w.item_code);
    const e = erpMap.get(w.item_code);
    const webQty = Number(w.current_qty);
    const erpQty = e ? e.qty : 0;
    const diff = round3(erpQty - webQty);
    let status: DiffStatus;
    if (!e) status = webQty === 0 ? "match" : "web_only";
    else status = diff === 0 ? "match" : "mismatch";
    rows.push({ item_code: w.item_code, item_name: w.item_name || e?.itemName || "", web_qty: webQty, erp_qty: erpQty, diff, status });
  }
  for (const [code, e] of erpMap) {
    if (seen.has(code)) continue;
    rows.push({ item_code: code, item_name: e.itemName, web_qty: 0, erp_qty: e.qty, diff: round3(e.qty), status: e.qty === 0 ? "match" : "erp_only" });
  }
  rows.sort((a, b) => {
    const pa = a.status === "match" ? 1 : 0;
    const pb = b.status === "match" ? 1 : 0;
    if (pa !== pb) return pa - pb;
    return a.item_code.localeCompare(b.item_code);
  });
  return rows;
}

export const DIFF_STATUS_LABEL: Record<DiffStatus, string> = {
  match: "일치",
  mismatch: "불일치",
  erp_only: "ERP에만 있음(신규)",
  web_only: "웹에만 있음(ERP 0)",
};

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
