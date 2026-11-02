// Next.js 16 Proxy (구 middleware): 세션 쿠키 갱신 + 로그인 가드 + 첫 화면 분기
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/manifest.webmanifest", "/sw.js", "/offline"];

function isMobileUA(ua: string): boolean {
  return /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(ua);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response; // 환경변수 미설정 시 페이지에서 안내

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  // getUser() 는 토큰을 서버에서 검증하고, 만료 시 쿠키를 갱신합니다.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (!user && !isPublic) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
    return NextResponse.redirect(loginUrl);
  }

  if (user && (pathname === "/" || pathname === "/login")) {
    const dest = request.nextUrl.clone();
    dest.search = "";
    const next = request.nextUrl.searchParams.get("next");
    dest.pathname = next && next.startsWith("/") ? next : isMobileUA(request.headers.get("user-agent") ?? "") ? "/m" : "/board";
    return NextResponse.redirect(dest);
  }

  return response;
}

export const config = {
  matcher: [
    // 정적 파일·이미지·아이콘 제외
    "/((?!_next/static|_next/image|favicon.ico|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
