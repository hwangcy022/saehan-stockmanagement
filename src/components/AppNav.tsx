"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ROLE_LABEL, type Profile } from "@/lib/types";

interface NavItem {
  href: string;
  label: string;
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { href: "/board", label: "재고 보드" },
  { href: "/entry", label: "수불 입력", adminOnly: true },
  { href: "/upload", label: "ERP 업로드", adminOnly: true },
  { href: "/reconcile", label: "대사 점검", adminOnly: true },
  { href: "/items", label: "품목", adminOnly: true },
  { href: "/users", label: "사용자", adminOnly: true },
  { href: "/m", label: "모바일 보기" },
];

export function AppNav({ profile }: { profile: Profile }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isAdmin = profile.role === "admin";
  const items = NAV.filter((n) => !n.adminOnly || isAdmin);

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
        <Link href="/board" className="flex items-center gap-2 font-bold text-brand">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-sm text-white">재</span>
          <span className="hidden sm:inline">실제재고</span>
        </Link>
        <nav className="hidden flex-1 items-center gap-1 md:flex">
          {items.map((n) => {
            const active = pathname === n.href || pathname.startsWith(n.href + "/");
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${active ? "bg-brand/10 text-brand" : "text-slate-600 hover:bg-slate-100"}`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-sm text-slate-600 sm:inline">
            {profile.display_name || profile.email}
            <span className={`badge ml-1 ${isAdmin ? "bg-brand/10 text-brand" : "bg-slate-100 text-slate-600"}`}>{ROLE_LABEL[profile.role]}</span>
          </span>
          <form action="/auth/signout" method="post">
            <button type="submit" className="btn-secondary px-2.5 py-1.5 text-xs">
              로그아웃
            </button>
          </form>
          <button
            type="button"
            className="btn-secondary px-2.5 py-1.5 text-xs md:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label="메뉴"
          >
            메뉴
          </button>
        </div>
      </div>
      {open && (
        <nav className="border-t border-slate-200 bg-white px-2 py-2 md:hidden">
          {items.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => setOpen(false)}
              className={`block rounded-md px-3 py-2 text-sm ${pathname.startsWith(n.href) ? "bg-brand/10 text-brand" : "text-slate-700"}`}
            >
              {n.label}
            </Link>
          ))}
          <div className="px-3 pt-2 text-xs text-slate-500">
            {profile.display_name || profile.email} · {ROLE_LABEL[profile.role]}
          </div>
        </nav>
      )}
    </header>
  );
}
