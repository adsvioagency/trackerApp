import type { Metadata } from "next";
import Link from "next/link";
import { VerifyForm } from "./verify-form";

export const metadata: Metadata = { title: "Enter your code" };

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ email?: string; dev?: string; next?: string }> }) {
  const { email = "", dev, next } = await searchParams;
  return (
    <div className="w-full max-w-[420px]">
      <div className="eyebrow mb-2">Check your email</div>
      <h1 className="text-[32px] font-extrabold leading-[1.05]">Enter the six-digit code.</h1>
      <p className="muted mt-3 text-[15px]">
        If <span className="font-semibold text-ink">{email}</span> is an invited owner, a code is on its way. It expires in 10 minutes.
      </p>
      {dev && (
        <div className="mt-4 rounded-[10px] border border-dashed border-rule-strong bg-sun-wash px-3 py-2 text-[13px]">
          <span className="font-semibold text-warn">Local development only:</span> the email transport is set to console, so your code is{" "}
          <code className="tnum rounded bg-surface px-1.5 py-0.5 font-bold">{dev}</code>. It was also printed in the terminal.
        </div>
      )}
      <div className="card mt-6 p-5">
        <VerifyForm email={email} next={next} />
      </div>
      <p className="muted mt-4 text-[13px]">
        Wrong address or no email?{" "}
        <Link href="/sign-in" className="font-semibold text-mango-deep underline-offset-2 hover:underline">
          Start over
        </Link>
      </p>
    </div>
  );
}
