"use client";

import { useMemo, useState } from "react";
import type { ColumnMapping } from "@/lib/erp/csv";
import { createErpSource, type ErpFilePreview, type ErpSnapshot } from "@/lib/erp/source";
import { fmtNum } from "@/lib/format";

function MappingSelect({
  k,
  label,
  required,
  headers,
  mapping,
  onChange,
}: {
  k: keyof ColumnMapping;
  label: string;
  required?: boolean;
  headers: string[];
  mapping: ColumnMapping;
  onChange: (m: ColumnMapping) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium text-slate-600">
        {label} {required && <span className="text-red-600">*</span>}
      </span>
      <select
        className="input"
        value={mapping[k] === null ? "" : String(mapping[k])}
        onChange={(e) => onChange({ ...mapping, [k]: e.target.value === "" ? null : Number(e.target.value) })}
      >
        <option value="">{required ? "(선택하세요)" : "(없음)"}</option>
        {headers.map((h, i) => (
          <option key={i} value={i}>
            {h || `(${i + 1}번째 열)`}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * ERP CSV 선택 → 인코딩/헤더 확인 → 컬럼 매핑 드롭다운 → 스냅샷 확정.
 * 화면 A(업로드)·E(대사 점검) 공용. ERP 공급원은 lib/erp/source.ts 의 createErpSource() 하나만 사용.
 */
export function ErpFilePicker({ onSnapshot, disabled }: { onSnapshot: (s: ErpSnapshot) => void; disabled?: boolean }) {
  const source = useMemo(() => createErpSource(), []);
  const [preview, setPreview] = useState<ErpFilePreview | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({ code: null, name: null, qty: null });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const p = await source.inspectFile(file);
      setPreview(p);
      setMapping(p.mapping);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPreview(null);
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  function confirm() {
    if (!preview) return;
    try {
      onSnapshot(source.toSnapshot(preview, mapping));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const sel = { headers: preview?.headers ?? [], mapping, onChange: setMapping };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className={`btn-secondary cursor-pointer ${disabled ? "pointer-events-none opacity-50" : ""}`}>
          CSV 파일 선택
          <input type="file" accept=".csv,.txt,text/csv" className="hidden" onChange={onFile} disabled={disabled || busy} />
        </label>
        {preview && (
          <span className="text-sm text-slate-600">
            <b>{preview.fileName}</b> · {fmtNum(preview.rows.length)}행 ·{" "}
            <span className="badge bg-slate-100 text-slate-700">{preview.encoding === "euc-kr" ? "EUC-KR(CP949) 자동 판별" : "UTF-8"}</span>
          </span>
        )}
        {busy && <span className="text-sm text-slate-500">읽는 중...</span>}
      </div>
      {error && <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {preview && (
        <div className="card space-y-3 p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <MappingSelect k="code" label="품목코드 컬럼" required {...sel} />
            <MappingSelect k="name" label="품목명 컬럼" {...sel} />
            <MappingSelect k="qty" label="재고수량 컬럼" required {...sel} />
          </div>
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50">
                <tr>
                  {preview.headers.map((h, i) => (
                    <th
                      key={i}
                      className={`px-2 py-1 text-left font-semibold ${i === mapping.code ? "bg-brand/10 text-brand" : i === mapping.qty ? "bg-emerald-50 text-emerald-800" : i === mapping.name ? "bg-amber-50 text-amber-800" : "text-slate-600"}`}
                    >
                      {h || `(${i + 1})`}
                      {i === mapping.code && " ← 코드"}
                      {i === mapping.name && " ← 품목명"}
                      {i === mapping.qty && " ← 수량"}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 5).map((r, ri) => (
                  <tr key={ri} className="border-t border-slate-100">
                    {preview.headers.map((_, ci) => (
                      <td key={ci} className="px-2 py-1 text-slate-700">
                        {r[ci]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">상위 5행 미리보기. 컬럼명이 달라도 위 드롭다운으로 지정하면 됩니다.</span>
            <button type="button" className="btn-primary" onClick={confirm} disabled={mapping.code === null || mapping.qty === null}>
              이 매핑으로 읽기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
