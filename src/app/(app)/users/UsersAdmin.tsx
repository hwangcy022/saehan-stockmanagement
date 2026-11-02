"use client";

import { useState } from "react";
import { fmtDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { ROLE_LABEL, type Profile, type Role } from "@/lib/types";

export function UsersAdmin({ initialProfiles, myId }: { initialProfiles: Profile[]; myId: string }) {
  const [profiles, setProfiles] = useState(initialProfiles);
  const [msg, setMsg] = useState<string | null>(null);

  async function setRole(p: Profile, role: Role) {
    if (p.id === myId) return;
    if (!confirm(`${p.display_name || p.email} 의 역할을 "${ROLE_LABEL[role]}" 로 바꿀까요?`)) return;
    const supabase = createClient();
    const { data, error } = await supabase.from("profiles").update({ role }).eq("id", p.id).select("*").single();
    if (error) return setMsg(`변경 실패: ${error.message}`);
    setProfiles((prev) => prev.map((x) => (x.id === p.id ? data : x)));
    setMsg(`${p.email} → ${ROLE_LABEL[role]}`);
  }

  async function setName(p: Profile, display_name: string) {
    const supabase = createClient();
    const { data, error } = await supabase.from("profiles").update({ display_name }).eq("id", p.id).select("*").single();
    if (error) return setMsg(`변경 실패: ${error.message}`);
    setProfiles((prev) => prev.map((x) => (x.id === p.id ? data : x)));
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">사용자 관리</h1>
      <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
        계정 생성은 Supabase 대시보드 <b>Authentication → Users → Add user</b> 에서 이메일·비밀번호로 만듭니다(자동 확인 체크). 생성된 계정은 기본
        <b> 조회자</b> 이며, 여기서 역할을 바꿀 수 있습니다. 가장 먼저 만들어진 계정은 자동으로 관리자가 됩니다.
      </div>
      {msg && <div className="rounded-md border border-slate-200 bg-white p-2 text-sm">{msg}</div>}
      <div className="card overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="th">이메일</th>
              <th className="th">표시 이름</th>
              <th className="th">역할</th>
              <th className="th">생성일</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {profiles.map((p) => (
              <tr key={p.id}>
                <td className="td">
                  {p.email} {p.id === myId && <span className="badge bg-slate-100 text-slate-600">나</span>}
                </td>
                <td className="td w-56">
                  <NameInput value={p.display_name ?? ""} onCommit={(v) => void setName(p, v)} />
                </td>
                <td className="td w-40">
                  <select className="input py-1" value={p.role} disabled={p.id === myId} onChange={(e) => void setRole(p, e.target.value as Role)}>
                    <option value="admin">관리자 (입력·수정·업로드)</option>
                    <option value="viewer">조회자 (읽기 전용)</option>
                  </select>
                </td>
                <td className="td tabular text-xs text-slate-500">{fmtDateTime(p.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">자기 자신의 역할은 바꿀 수 없습니다 (관리자가 한 명도 없어지는 것을 방지).</p>
    </div>
  );
}

function NameInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value);
  return (
    <input
      className="input py-1"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        if (v.trim() !== value) onCommit(v.trim());
      }}
    />
  );
}
