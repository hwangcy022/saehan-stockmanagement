import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "로그인" };
// 환경변수 안내를 실행 시점에 판단하도록 동적 렌더링
export const dynamic = "force-dynamic";

export default function LoginPage() {
  const envMissing = !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="card w-full max-w-sm p-6">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-lg font-bold text-white">재</div>
          <h1 className="text-xl font-bold">실제재고</h1>
          <p className="mt-1 text-sm text-slate-500">새한프라텍 생산지원팀</p>
        </div>
        {envMissing ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            Supabase 환경변수가 설정되지 않았습니다. 프로젝트 루트의 <code>.env.example</code> 을 복사해 <code>.env.local</code> 을
            만들고 값을 채운 뒤 서버를 다시 시작해 주세요.
          </div>
        ) : (
          <LoginForm />
        )}
      </div>
    </main>
  );
}
