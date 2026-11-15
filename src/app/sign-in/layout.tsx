import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Wordmark } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { env } from "@/lib/env";

export default async function SignInLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (user) redirect("/today");
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-5 py-4 md:px-8">
        <Wordmark height={26} />
        <ThemeToggle compact />
      </header>
      {env.isDemo && (
        <div className="mx-5 rounded-[10px] bg-sun-wash px-3 py-2 text-center text-[13px] font-semibold text-warn md:mx-8">
          Demo environment · fictional data · no outbound email
        </div>
      )}
      <main className="flex flex-1 items-start justify-center px-5 py-10 md:items-center md:px-8">{children}</main>
      <footer className="muted px-5 py-4 text-center text-[12px] md:px-8">Private workspace · invite-only · Adsvio Agency</footer>
    </div>
  );
}
