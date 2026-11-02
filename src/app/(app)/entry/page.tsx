import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { seoulTodayStartIso } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { EntryScreen } from "./EntryScreen";

export const metadata: Metadata = { title: "수불 입력" };

export default async function EntryPage({ searchParams }: { searchParams: Promise<{ item?: string }> }) {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: items }, { data: history }] = await Promise.all([
    supabase.from("items").select("*").eq("is_active", true).order("item_code"),
    supabase.from("transaction_history").select("*").gte("created_at", seoulTodayStartIso()).order("created_at", { ascending: false }),
  ]);
  const sp = await searchParams;
  return <EntryScreen items={items ?? []} initialHistory={history ?? []} presetItem={sp.item ?? ""} />;
}
