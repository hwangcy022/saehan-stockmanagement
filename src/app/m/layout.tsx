import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/types";

export default async function MobileLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-2.5" style={{ paddingTop: "max(0.625rem, env(safe-area-inset-top))" }}>
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-sm font-bold text-white">재</span>
        <span className="font-bold text-brand">실제재고</span>
        <span className="ml-auto truncate text-xs text-slate-500">
          {session.profile.display_name || session.email} · {ROLE_LABEL[session.profile.role]}
        </span>
        <Link href="/board" className="text-xs text-slate-500 underline">
          PC
        </Link>
        <form action="/auth/signout" method="post">
          <button type="submit" className="text-xs text-slate-500 underline">
            로그아웃
          </button>
        </form>
      </header>
      <main className="flex-1 px-4 py-3">{children}</main>
    </div>
  );
}
