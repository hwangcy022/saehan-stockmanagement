import type { Metadata } from "next";
import { requireSession } from "@/lib/auth";
import { nowMs } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { StockBoard } from "./StockBoard";

export const metadata: Metadata = { title: "재고 보드" };

export default async function BoardPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const session = await requireSession();
  const supabase = await createClient();
  const { data: rows, error } = await supabase.from("current_stock").select("*").order("item_code");
  const sp = await searchParams;

  return (
    <div className="space-y-4">
      {sp.denied && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          해당 화면은 관리자(생산지원팀)만 사용할 수 있습니다.
        </div>
      )}
      {error && <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">재고를 불러오지 못했습니다: {error.message}</div>}
      <StockBoard initialRows={rows ?? []} initialFetchedAt={nowMs()} isAdmin={session.profile.role === "admin"} />
    </div>
  );
}
