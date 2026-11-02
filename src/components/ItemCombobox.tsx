"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Item } from "@/lib/types";

/** 품목코드 검색 자동완성 (코드·품목명 일부 입력) */
export function ItemCombobox({
  items,
  value,
  onChange,
  autoFocus,
  inputClassName = "input",
  placeholder = "품목코드 또는 품목명",
}: {
  items: Item[];
  value: string;
  onChange: (code: string, item: Item | null) => void;
  autoFocus?: boolean;
  inputClassName?: string;
  placeholder?: string;
}) {
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);

  // 부모가 value 를 바꾸면(예: 보드에서 "입력" 링크) 입력창 텍스트를 맞춤 (렌더 중 상태 보정 패턴)
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setText(value);
  }

  const matches = useMemo(() => {
    const n = text.trim().toLowerCase();
    if (!n) return items.slice(0, 8);
    return items
      .filter((i) => i.item_code.toLowerCase().includes(n) || i.item_name.toLowerCase().includes(n))
      .sort((a, b) => {
        const as = a.item_code.toLowerCase().startsWith(n) ? 0 : 1;
        const bs = b.item_code.toLowerCase().startsWith(n) ? 0 : 1;
        return as - bs || a.item_code.localeCompare(b.item_code);
      })
      .slice(0, 8);
  }, [items, text]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pick(i: Item) {
    setText(i.item_code);
    onChange(i.item_code, i);
    setOpen(false);
  }

  function commitText(t: string) {
    const exact = items.find((i) => i.item_code.toLowerCase() === t.trim().toLowerCase());
    onChange(t.trim(), exact ?? null);
  }

  return (
    <div ref={wrap} className="relative">
      <input
        className={inputClassName}
        value={text}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setHi(0);
          commitText(e.target.value);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) setOpen(true);
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHi((h) => Math.min(h + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHi((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter") {
            if (open && matches[hi]) {
              e.preventDefault();
              pick(matches[hi]);
            }
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && matches.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-64 w-full min-w-64 overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          {matches.map((i, idx) => (
            <li
              key={i.item_code}
              className={`cursor-pointer px-3 py-1.5 text-sm ${idx === hi ? "bg-brand/10" : "hover:bg-slate-50"}`}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(i);
              }}
              onMouseEnter={() => setHi(idx)}
            >
              <span className="font-mono text-xs text-slate-700">{i.item_code}</span>
              <span className="ml-2 text-slate-800">{i.item_name}</span>
              <span className="ml-2 text-xs text-slate-400">
                {i.unit} · 박스당 {i.qty_per_box}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
