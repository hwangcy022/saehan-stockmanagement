import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { ReconcileScreen } from "./ReconcileScreen";

export const metadata: Metadata = { title: "ERP 대사 점검" };

export default async function ReconcilePage() {
  await requireAdmin();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">ERP 대사 점검</h1>
        <p className="mt-1 text-sm text-slate-600">
          현재 ERP 재고 CSV 를 올리면 <b>기준을 바꾸지 않고</b> 웹 현재고와 비교만 합니다. 주 1회 점검용. 불일치 행을 xlsx 로 내려받을 수 있습니다.
        </p>
      </div>
      <ReconcileScreen />
    </div>
  );
}
