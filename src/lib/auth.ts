import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type { Profile } from "./types";

export interface SessionInfo {
  userId: string;
  email: string;
  profile: Profile;
}

/** 서버 컴포넌트에서 현재 로그인 사용자 + 프로필. 미로그인 시 /login 으로. */
export async function requireSession(): Promise<SessionInfo> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  const p: Profile = profile ?? {
    id: user.id,
    email: user.email ?? null,
    display_name: user.email?.split("@")[0] ?? null,
    role: "viewer",
    created_at: new Date().toISOString(),
  };
  return { userId: user.id, email: user.email ?? "", profile: p };
}

/** 관리자 전용 페이지 가드. 조회자는 재고 보드로 보냅니다. */
export async function requireAdmin(): Promise<SessionInfo> {
  const s = await requireSession();
  if (s.profile.role !== "admin") redirect("/board?denied=1");
  return s;
}
