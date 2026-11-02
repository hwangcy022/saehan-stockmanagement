import type { Metadata } from "next";
import { requireSession } from "@/lib/auth";
import { nowMs } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { MobileView } from "./MobileView";

export const metadata: Metadata = { title: "모바일 재고 조회" };

export default async function MobilePage() {
  const session = await requireSession();
  const supabase = await createClient();
  const { data: rows } = await supabase.from("current_stock").select("*").eq("is_active", true).order("item_code");
  return <MobileView initialRows={rows ?? []} initialFetchedAt={nowMs()} isAdmin={session.profile.role === "admin"} />;
}
