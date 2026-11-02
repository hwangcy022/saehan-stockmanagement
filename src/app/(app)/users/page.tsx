import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { UsersAdmin } from "./UsersAdmin";

export const metadata: Metadata = { title: "사용자 관리" };

export default async function UsersPage() {
  const session = await requireAdmin();
  const supabase = await createClient();
  const { data: profiles } = await supabase.from("profiles").select("*").order("created_at");
  return <UsersAdmin initialProfiles={profiles ?? []} myId={session.userId} />;
}
