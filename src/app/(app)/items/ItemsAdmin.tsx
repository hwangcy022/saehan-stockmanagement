"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Item } from "@/lib/types";

export function ItemsAdmin({ initialItems }: { initialItems: Item[] }) {
  const [items, setItems] = useState<Item[]>(initialItems);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [draft, setDraft] = useState({ item_code: "", item_name: "", unit: "EA", qty_per_box: "1" });

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return items.filter((i) => !n || i.item_code.toLowerCase().includes(n) || i.item_name.toLowerCase().includes(n));
  }, [items, q]);

  async function save(code: string, patch: Partial<Item>) {
    const supabase = createClient();
    const { data, error } = await supabase.from("items").update(patch).eq("item_code", code).select("*").single();
    if (error) return setMsg(`저장 실패: ${error.message}`);
    setItems((prev) => prev.map((i) => (i.item_code === code ? data : i)));
    setMsg(`${code} 저장됨`);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const code = draft.item_code.trim();
    if (!code) return;
    const qpb = Number(draft.qty_per_box);
    if (!(qpb > 0)) return setMsg("박스당수량은 0 보다 커야 합니다.");
    const supabase = createClient();
    const { data, error } = await supabase
      .from("items")
      .insert({ item_code: code, item_name: draft.item_name.trim(), unit: draft.unit.trim() || "EA", qty_per_box: qpb })
      .select("*")
      .single();
    if (error) return setMsg(`추가 실패: ${error.message}`);
    setItems((prev) => [...prev, data].sort((a, b) => a.item_code.localeCompare(b.item_code)));
    setDraft({ item_code: "", item_name: "", unit: "EA", qty_per_box: "1" });
    setMsg(`${code} 추가됨`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">품목 관리</h1>
        <input className="input max-w-xs" placeholder="검색" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {msg && <div className="rounded-md border border-slate-200 bg-white p-2 text-sm text-slate-700">{msg}</div>}

      <form onSubmit={add} className="card grid grid-cols-2 gap-2 p-3 md:grid-cols-6">
        <input className="input" placeholder="품목코드 *" required value={draft.item_code} onChange={(e) => setDraft({ ...draft, item_code: e.target.value })} />
        <input className="input md:col-span-2" placeholder="품목명" value={draft.item_name} onChange={(e) => setDraft({ ...draft, item_name: e.target.value })} />
        <input className="input" placeholder="단위" value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} />
        <input className="input" type="number" step="any" min={0} placeholder="박스당수량" value={draft.qty_per_box} onChange={(e) => setDraft({ ...draft, qty_per_box: e.target.value })} />
        <button type="submit" className="btn-primary">
          품목 추가
        </button>
      </form>

      <div className="card overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="th">품목코드</th>
              <th className="th">품목명</th>
              <th className="th">단위</th>
              <th className="th">박스당수량</th>
              <th className="th">활성</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((i) => (
              <Row key={i.item_code} item={i} onSave={save} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        ERP 업로드 시 파일에만 있는 품목코드는 자동으로 추가되며, 박스당수량은 여기서 지정합니다. 비활성 품목은 보드·모바일 기본 목록에서 숨겨집니다. (삭제는 하지 않습니다)
      </p>
    </div>
  );
}

function Row({ item, onSave }: { item: Item; onSave: (code: string, patch: Partial<Item>) => Promise<void> }) {
  const [name, setName] = useState(item.item_name);
  const [unit, setUnit] = useState(item.unit);
  const [qpb, setQpb] = useState(String(item.qty_per_box));
  const dirty = name !== item.item_name || unit !== item.unit || Number(qpb) !== Number(item.qty_per_box);
  return (
    <tr className={item.is_active ? "" : "opacity-60"}>
      <td className="td font-mono text-xs">{item.item_code}</td>
      <td className="td">
        <input className="input py-1" value={name} onChange={(e) => setName(e.target.value)} />
      </td>
      <td className="td w-24">
        <input className="input py-1" value={unit} onChange={(e) => setUnit(e.target.value)} />
      </td>
      <td className="td w-32">
        <input className="input py-1 text-right" type="number" step="any" min={0} value={qpb} onChange={(e) => setQpb(e.target.value)} />
      </td>
      <td className="td whitespace-nowrap">
        <label className="mr-3 inline-flex items-center gap-1 text-sm">
          <input type="checkbox" checked={item.is_active} onChange={(e) => void onSave(item.item_code, { is_active: e.target.checked })} />
          활성
        </label>
        <button
          type="button"
          className="btn-primary py-1 text-xs"
          disabled={!dirty || !(Number(qpb) > 0)}
          onClick={() => void onSave(item.item_code, { item_name: name, unit, qty_per_box: Number(qpb) })}
        >
          저장
        </button>
      </td>
    </tr>
  );
}
