import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { fmtDateTime, fmtNum } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { UploadScreen } from "./UploadScreen";

export const metadata: Metadata = { title: "ERP 업로드" };

export default async function UploadPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: baselines }, { data: profiles }] = await Promise.all([
    supabase.from("baselines").select("*").order("id", { ascending: false }).limit(50),
    supabase.from("profiles").select("id, display_name, email"),
  ]);
  const who = new Map((profiles ?? []).map((p) => [p.id, p.display_name || p.email || ""]));
  const latest = baselines?.[0] ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">ERP 스냅샷 업로드</h1>
        <p className="mt-1 text-sm text-slate-600">
          ERP(Mold)에서 내보낸 재고 CSV 를 올리면 새 <b>기준</b>이 됩니다. 적용 전에 웹 현재고와의 차이를 확인하고, 확인을 눌러야 적용됩니다. 현재 기준:{" "}
          <b>{latest ? `#${latest.id} ${fmtDateTime(latest.uploaded_at)}` : "없음"}</b>
        </p>
      </div>

      <UploadScreen />

      <section className="card">
        <div className="border-b border-slate-200 px-4 py-2.5 font-semibold">업로드 이력</div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="th">기준</th>
                <th className="th">업로드 시각</th>
                <th className="th">업로드자</th>
                <th className="th">파일명</th>
                <th className="th text-right">행 수</th>
                <th className="th text-right">신규 품목</th>
                <th className="th">비고</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(baselines ?? []).length === 0 && (
                <tr>
                  <td colSpan={8} className="td py-6 text-center text-slate-500">
                    아직 업로드한 기준이 없습니다.
                  </td>
                </tr>
              )}
              {(baselines ?? []).map((b, i) => (
                <tr key={b.id} className={i === 0 ? "bg-brand/5" : ""}>
                  <td className="td font-semibold">
                    #{b.id} {i === 0 && <span className="badge bg-brand/10 text-brand">현재</span>}
                  </td>
                  <td className="td tabular whitespace-nowrap">{fmtDateTime(b.uploaded_at)}</td>
                  <td className="td">{b.uploaded_by ? who.get(b.uploaded_by) : "-"}</td>
                  <td className="td">{b.file_name}</td>
                  <td className="td tabular text-right">{fmtNum(b.line_count)}</td>
                  <td className="td tabular text-right">{b.new_item_codes.length ? fmtNum(b.new_item_codes.length) : "-"}</td>
                  <td className="td max-w-xs truncate text-slate-600">{b.note}</td>
                  <td className="td text-right">
                    <Link href={`/upload/${b.id}`} className="text-xs font-medium text-brand hover:underline">
                      차이 표 보기
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
