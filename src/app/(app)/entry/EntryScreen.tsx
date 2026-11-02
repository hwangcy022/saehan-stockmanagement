"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ItemCombobox } from "@/components/ItemCombobox";
import { fmtBoxes, fmtDateTime, fmtNum, fmtSigned, fmtTime, parseNumber, seoulInputToIso, seoulTodayStartIso, toSeoulInputValue } from "@/lib/format";
import { boxesToQty, qtyToBoxes, signedQty } from "@/lib/stock";
import { createClient } from "@/lib/supabase/client";
import { TX_TYPE_LABEL, type Item, type StockRow, type TransactionHistoryRow, type TransactionInsert, type TxType } from "@/lib/types";

type Mode = "single" | "bulk";

export function EntryScreen({ items, initialHistory, presetItem }: { items: Item[]; initialHistory: TransactionHistoryRow[]; presetItem: string }) {
  const [mode, setMode] = useState<Mode>("single");
  const [history, setHistory] = useState<TransactionHistoryRow[]>(initialHistory);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const showToast = useCallback((kind: "ok" | "err", text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), kind === "ok" ? 4000 : 8000);
  }, []);

  const refreshHistory = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("transaction_history")
      .select("*")
      .gte("created_at", seoulTodayStartIso())
      .order("created_at", { ascending: false });
    if (data) setHistory(data);
  }, []);

  // 다른 관리자가 입력한 내역도 바로 반영
  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel("entry-history")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "transactions" }, () => void refreshHistory())
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [refreshHistory]);

  async function reverse(row: TransactionHistoryRow) {
    if (!confirm(`#${row.id} ${TX_TYPE_LABEL[row.tx_type]} ${row.item_code} ${fmtSigned(row.qty)} 을(를) 취소할까요?\n반대 부호의 취소 거래가 생성되고 원래 행은 이력으로 남습니다.`)) return;
    const supabase = createClient();
    const { error } = await supabase.rpc("reverse_transaction", { p_tx_id: row.id });
    if (error) showToast("err", `취소 실패: ${error.message}`);
    else {
      showToast("ok", `#${row.id} 취소 거래를 생성했습니다.`);
      await refreshHistory();
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">수불 입력</h1>
        <div className="flex rounded-md border border-slate-300 bg-white p-0.5 text-sm">
          <button type="button" className={`rounded px-3 py-1 ${mode === "single" ? "bg-brand text-white" : "text-slate-600"}`} onClick={() => setMode("single")}>
            건별 입력
          </button>
          <button type="button" className={`rounded px-3 py-1 ${mode === "bulk" ? "bg-brand text-white" : "text-slate-600"}`} onClick={() => setMode("bulk")}>
            일괄 입력 (붙여넣기)
          </button>
        </div>
      </div>

      {toast && (
        <div className={`rounded-md p-3 text-sm ${toast.kind === "ok" ? "border border-emerald-300 bg-emerald-50 text-emerald-800" : "border border-red-300 bg-red-50 text-red-700"}`}>
          {toast.text}
        </div>
      )}

      {mode === "single" ? (
        <SingleForm items={items} presetItem={presetItem} onSaved={refreshHistory} toast={showToast} />
      ) : (
        <BulkForm items={items} onSaved={refreshHistory} toast={showToast} />
      )}

      <section className="card">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
          <h2 className="font-semibold">오늘 입력 내역 ({history.length}건)</h2>
          <button type="button" className="btn-secondary py-1 text-xs" onClick={() => void refreshHistory()}>
            새로고침
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="th">#</th>
                <th className="th">입력시각</th>
                <th className="th">일시</th>
                <th className="th">구분</th>
                <th className="th">품목</th>
                <th className="th text-right">수량</th>
                <th className="th">비고</th>
                <th className="th">입력자</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {history.length === 0 && (
                <tr>
                  <td colSpan={9} className="td py-6 text-center text-slate-500">
                    오늘 입력한 내역이 없습니다.
                  </td>
                </tr>
              )}
              {history.map((r) => {
                const reversed = r.reversed_by_id !== null;
                const isReversal = r.reversal_of !== null;
                return (
                  <tr key={r.id} className={reversed ? "text-slate-400 line-through" : isReversal ? "bg-slate-50 text-slate-600" : ""}>
                    <td className="td tabular text-xs">{r.id}</td>
                    <td className="td tabular text-xs">{fmtTime(r.created_at)}</td>
                    <td className="td tabular whitespace-nowrap text-xs">{fmtDateTime(r.occurred_at)}</td>
                    <td className="td">
                      <TypeBadge t={r.tx_type} />
                      {isReversal && <span className="badge ml-1 bg-slate-200 text-slate-700 no-underline">취소거래</span>}
                    </td>
                    <td className="td">
                      <span className="font-mono text-xs">{r.item_code}</span> <span>{r.item_name}</span>
                    </td>
                    <td className={`td tabular text-right font-semibold ${Number(r.qty) < 0 ? "text-rose-700" : "text-emerald-700"}`}>{fmtSigned(r.qty)}</td>
                    <td className="td max-w-xs truncate text-slate-600">{r.note}</td>
                    <td className="td text-xs text-slate-600">{r.created_by_name}</td>
                    <td className="td text-right">
                      {!reversed && !isReversal && (
                        <button type="button" className="text-xs font-medium text-red-600 hover:underline" onClick={() => void reverse(r)}>
                          취소
                        </button>
                      )}
                      {reversed && <span className="text-xs no-underline">취소됨 (#{r.reversed_by_id})</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function TypeBadge({ t }: { t: TxType }) {
  const cls = t === "IN" ? "bg-emerald-100 text-emerald-800" : t === "OUT" ? "bg-rose-100 text-rose-800" : "bg-sky-100 text-sky-800";
  return <span className={`badge ${cls}`}>{TX_TYPE_LABEL[t]}</span>;
}

// ---------------------------------------------------------------------------
// 건별 입력
// ---------------------------------------------------------------------------
function SingleForm({
  items,
  presetItem,
  onSaved,
  toast,
}: {
  items: Item[];
  presetItem: string;
  onSaved: () => Promise<void>;
  toast: (k: "ok" | "err", t: string) => void;
}) {
  const [when, setWhen] = useState(toSeoulInputValue());
  const [type, setType] = useState<TxType>("OUT");
  const [code, setCode] = useState(presetItem);
  const [item, setItem] = useState<Item | null>(() => items.find((i) => i.item_code === presetItem) ?? null);
  const [qtyMode, setQtyMode] = useState<"qty" | "box">("qty");
  const [qtyText, setQtyText] = useState("");
  const [boxText, setBoxText] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [stockState, setStockState] = useState<{ code: string; row: StockRow | null } | null>(null);
  const stockRow = item && stockState && stockState.code === item.item_code ? stockState.row : null;
  const qtyRef = useRef<HTMLInputElement>(null);

  const qty = useMemo(() => {
    if (qtyMode === "box") {
      const b = parseNumber(boxText);
      return b === null || !item ? null : boxesToQty(b, item.qty_per_box);
    }
    return parseNumber(qtyText);
  }, [qtyMode, qtyText, boxText, item]);

  // 선택 품목의 현재고 표시
  useEffect(() => {
    if (!item) return;
    let alive = true;
    const code = item.item_code;
    const supabase = createClient();
    supabase
      .from("current_stock")
      .select("*")
      .eq("item_code", code)
      .maybeSingle()
      .then(({ data }) => {
        if (alive) setStockState({ code, row: data ?? null });
      });
    return () => {
      alive = false;
    };
  }, [item]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!item) return toast("err", "품목을 목록에서 선택해 주세요.");
    if (qty === null || qty === 0) return toast("err", "수량을 입력해 주세요.");
    if (type !== "ADJ" && qty < 0) return toast("err", "입고/출고 수량은 양수로 입력하세요. (출고는 자동으로 음수 저장)");
    setBusy(true);
    try {
      const supabase = createClient();
      const row: TransactionInsert = {
        occurred_at: seoulInputToIso(when),
        tx_type: type,
        item_code: item.item_code,
        qty: signedQty(type, qty),
        note: note.trim() || null,
      };
      const { error } = await supabase.from("transactions").insert(row);
      if (error) throw error;
      const { data: after } = await supabase.from("current_stock").select("*").eq("item_code", item.item_code).maybeSingle();
      setStockState({ code: item.item_code, row: after ?? null });
      toast("ok", `${TX_TYPE_LABEL[type]} ${item.item_code} ${fmtSigned(row.qty)} 저장. 현재고 ${after ? fmtNum(after.current_qty) : "-"} ${item.unit}`);
      setQtyText("");
      setBoxText("");
      setNote("");
      qtyRef.current?.focus();
      await onSaved();
    } catch (err) {
      toast("err", `저장 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card grid grid-cols-1 gap-3 p-4 md:grid-cols-12">
      <div className="md:col-span-3">
        <label className="mb-1 block text-xs font-medium text-slate-600">일시</label>
        <input type="datetime-local" className="input" value={when} onChange={(e) => setWhen(e.target.value)} required />
      </div>
      <div className="md:col-span-2">
        <label className="mb-1 block text-xs font-medium text-slate-600">구분</label>
        <div className="flex rounded-md border border-slate-300 bg-white p-0.5">
          {(["IN", "OUT", "ADJ"] as TxType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`flex-1 rounded px-2 py-1.5 text-sm ${type === t ? (t === "IN" ? "bg-emerald-600 text-white" : t === "OUT" ? "bg-rose-600 text-white" : "bg-sky-600 text-white") : "text-slate-600"}`}
            >
              {TX_TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      </div>
      <div className="md:col-span-7">
        <label className="mb-1 block text-xs font-medium text-slate-600">품목코드</label>
        <ItemCombobox
          items={items}
          value={code}
          autoFocus={!presetItem}
          onChange={(c, it) => {
            setCode(c);
            setItem(it);
          }}
        />
        <div className="mt-1 min-h-5 text-xs text-slate-600">
          {item ? (
            <>
              <b className="text-slate-800">{item.item_name}</b> · {item.unit} · 박스당 {fmtNum(item.qty_per_box)}
              {stockRow && (
                <>
                  {" "}
                  · 현재고 <b className={Number(stockRow.current_qty) <= 0 ? "text-red-700" : "text-slate-800"}>{fmtNum(stockRow.current_qty)}</b> (
                  {fmtBoxes(qtyToBoxes(stockRow.current_qty, item.qty_per_box))} 박스)
                </>
              )}
            </>
          ) : code ? (
            <span className="text-amber-700">목록에 없는 품목코드입니다. 품목 화면에서 먼저 등록하거나 ERP 업로드로 추가하세요.</span>
          ) : (
            "코드나 품목명 일부를 입력하면 자동완성됩니다."
          )}
        </div>
      </div>

      <div className="md:col-span-4">
        <div className="mb-1 flex items-center justify-between">
          <label className="text-xs font-medium text-slate-600">수량</label>
          <label className="flex items-center gap-1 text-xs text-slate-600">
            <input type="checkbox" checked={qtyMode === "box"} onChange={(e) => setQtyMode(e.target.checked ? "box" : "qty")} />
            박스 수로 입력
          </label>
        </div>
        {qtyMode === "box" ? (
          <div className="flex items-center gap-2">
            <input
              ref={qtyRef}
              type="number"
              step="any"
              min={type === "ADJ" ? undefined : 0}
              className="input"
              placeholder="박스 수"
              value={boxText}
              onChange={(e) => setBoxText(e.target.value)}
            />
            <span className="whitespace-nowrap text-sm text-slate-600">
              × {item ? fmtNum(item.qty_per_box) : "?"} = <b className="tabular">{qty === null ? "-" : fmtNum(qty)}</b>
            </span>
          </div>
        ) : (
          <input
            ref={qtyRef}
            type="number"
            step="any"
            min={type === "ADJ" ? undefined : 0}
            className="input"
            placeholder={type === "ADJ" ? "± 수량 (예: -50)" : "수량"}
            value={qtyText}
            onChange={(e) => setQtyText(e.target.value)}
          />
        )}
        {type === "OUT" && qty !== null && qty > 0 && <p className="mt-1 text-xs text-slate-500">출고는 {fmtNum(-qty)} 으로 저장됩니다.</p>}
      </div>
      <div className="md:col-span-6">
        <label className="mb-1 block text-xs font-medium text-slate-600">비고</label>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="거래처, 사유 등" />
      </div>
      <div className="flex items-end md:col-span-2">
        <button type="submit" className="btn-primary w-full py-2.5" disabled={busy || !item || qty === null}>
          {busy ? "저장 중..." : "저장"}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// 일괄 입력 (엑셀 붙여넣기: 품목코드 / 구분 / 수량 / 비고)
// ---------------------------------------------------------------------------
interface BulkRow {
  key: number;
  code: string;
  type: string;
  qty: string;
  note: string;
}

function normType(s: string): TxType | null {
  const t = s.trim().toUpperCase();
  if (["입고", "IN", "I", "+"].includes(t)) return "IN";
  if (["출고", "OUT", "O", "-"].includes(t)) return "OUT";
  if (["조정", "ADJ", "A", "ADJUST", "실사"].includes(t)) return "ADJ";
  return null;
}

function BulkForm({ items, onSaved, toast }: { items: Item[]; onSaved: () => Promise<void>; toast: (k: "ok" | "err", t: string) => void }) {
  const [when, setWhen] = useState(toSeoulInputValue());
  const [text, setText] = useState("");
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [busy, setBusy] = useState(false);
  const itemMap = useMemo(() => new Map(items.map((i) => [i.item_code.toLowerCase(), i])), [items]);

  function parse() {
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
    const parsed: BulkRow[] = [];
    lines.forEach((line, idx) => {
      const cells = (line.includes("\t") ? line.split("\t") : line.split(",")).map((c) => c.trim());
      if (idx === 0 && /품목\s*코드|item/i.test(cells[0] ?? "")) return; // 헤더 행 건너뜀
      parsed.push({ key: Date.now() + idx, code: cells[0] ?? "", type: cells[1] ?? "", qty: cells[2] ?? "", note: cells[3] ?? "" });
    });
    setRows(parsed);
  }

  const validated = rows.map((r) => {
    const item = itemMap.get(r.code.trim().toLowerCase()) ?? null;
    const type = normType(r.type);
    const q = parseNumber(r.qty);
    const errors: string[] = [];
    if (!item) errors.push("품목 없음");
    if (!type) errors.push("구분(입고/출고/조정)");
    if (q === null || q === 0) errors.push("수량");
    else if (type && type !== "ADJ" && q < 0) errors.push("음수 불가");
    return { r, item, type, q, errors };
  });
  const invalid = validated.filter((v) => v.errors.length > 0).length;

  function update(key: number, patch: Partial<BulkRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function saveAll() {
    if (rows.length === 0 || invalid > 0) return;
    if (!confirm(`${rows.length}건을 저장할까요?`)) return;
    setBusy(true);
    try {
      const supabase = createClient();
      const occurred_at = seoulInputToIso(when);
      const payload: TransactionInsert[] = validated.map((v) => ({
        occurred_at,
        tx_type: v.type as TxType,
        item_code: (v.item as Item).item_code,
        qty: signedQty(v.type as TxType, v.q as number),
        note: v.r.note.trim() || null,
      }));
      const { error } = await supabase.from("transactions").insert(payload);
      if (error) throw error;
      toast("ok", `${payload.length}건을 저장했습니다.`);
      setRows([]);
      setText("");
      await onSaved();
    } catch (err) {
      toast("err", `저장 실패 (전체 취소됨): ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-3 p-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
        <div className="md:col-span-3">
          <label className="mb-1 block text-xs font-medium text-slate-600">일시 (전체 공통)</label>
          <input type="datetime-local" className="input" value={when} onChange={(e) => setWhen(e.target.value)} />
        </div>
        <div className="md:col-span-9">
          <label className="mb-1 block text-xs font-medium text-slate-600">
            엑셀에서 4열(품목코드, 구분, 수량, 비고)을 복사해 붙여 넣으세요. 구분은 입고/출고/조정 또는 IN/OUT/ADJ.
          </label>
          <textarea
            className="input h-28 font-mono text-xs"
            placeholder={"PF-500-28\t출고\t4000\tA사 납품\nBT-500-W\t입고\t2400\t생산"}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="mt-2 flex gap-2">
            <button type="button" className="btn-secondary" onClick={parse} disabled={!text.trim()}>
              표로 불러오기
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setRows((p) => [...p, { key: Date.now(), code: "", type: "출고", qty: "", note: "" }])}
            >
              행 추가
            </button>
          </div>
        </div>
      </div>

      {rows.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th w-8">#</th>
                  <th className="th">품목코드</th>
                  <th className="th">품목명</th>
                  <th className="th">구분</th>
                  <th className="th">수량</th>
                  <th className="th">비고</th>
                  <th className="th">상태</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {validated.map((v, idx) => (
                  <tr key={v.r.key} className={v.errors.length ? "bg-red-50" : ""}>
                    <td className="td text-xs text-slate-500">{idx + 1}</td>
                    <td className="td w-44">
                      <ItemCombobox items={items} value={v.r.code} inputClassName="input py-1 font-mono text-xs" onChange={(c) => update(v.r.key, { code: c })} />
                    </td>
                    <td className="td text-xs">{v.item?.item_name ?? <span className="text-red-600">—</span>}</td>
                    <td className="td w-28">
                      <select className="input py-1" value={v.type ?? ""} onChange={(e) => update(v.r.key, { type: e.target.value })}>
                        <option value="">선택</option>
                        <option value="IN">입고</option>
                        <option value="OUT">출고</option>
                        <option value="ADJ">조정</option>
                      </select>
                    </td>
                    <td className="td w-32">
                      <input className="input py-1 text-right" value={v.r.qty} onChange={(e) => update(v.r.key, { qty: e.target.value })} />
                    </td>
                    <td className="td">
                      <input className="input py-1" value={v.r.note} onChange={(e) => update(v.r.key, { note: e.target.value })} />
                    </td>
                    <td className="td text-xs">
                      {v.errors.length ? <span className="text-red-600">{v.errors.join(", ")}</span> : <span className="text-emerald-700">OK {fmtSigned(signedQty(v.type as TxType, v.q as number))}</span>}
                    </td>
                    <td className="td">
                      <button type="button" className="text-xs text-slate-500 hover:text-red-600" onClick={() => setRows((p) => p.filter((r) => r.key !== v.r.key))}>
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">
              총 {rows.length}건 {invalid > 0 && <span className="text-red-600">· 오류 {invalid}건 (수정하거나 삭제해야 저장됩니다)</span>}
            </span>
            <button type="button" className="btn-primary" disabled={busy || invalid > 0 || rows.length === 0} onClick={() => void saveAll()}>
              {busy ? "저장 중..." : `${rows.length}건 한 번에 저장`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
