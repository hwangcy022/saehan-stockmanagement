import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ItemsAdmin } from "./ItemsAdmin";

export const metadata: Metadata = { title: "품목 관리" };

export default async function ItemsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: items } = await supabase.from("items").select("*").order("item_code");
  return <ItemsAdmin initialItems={items ?? []} />;
}
