import { AppNav } from "@/components/AppNav";
import { requireSession } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  return (
    <>
      <AppNav profile={session.profile} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5">{children}</main>
    </>
  );
}
