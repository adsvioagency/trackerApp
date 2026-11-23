import type { Metadata } from "next";
import { SignInForm } from "./sign-in-form";
import { env } from "@/lib/env";
import { demoSignInAction } from "./actions";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const useAccessKey = !env.isDemo && !!env.ownerAccessKeyHash;
  return (
    <div className="w-full max-w-[420px]">
      <div className="eyebrow mb-2">Personal Assistant System</div>
      <h1 className="text-[32px] font-extrabold leading-[1.05]">
        {useAccessKey ? "Sign in to your tracker" : <>Sign in with your <em className="not-italic text-mango">email</em>.</>}
      </h1>
      <p className="muted mt-3 text-[15px]">{useAccessKey ? "Enter your owner email and private access key." : "We will send a six-digit code to your account email. Only invited owners can sign in."}</p>
      <div className="card mt-6 p-5">
        <SignInForm next={next} useAccessKey={useAccessKey} />
      </div>
      {env.isDemo && (
        <form action={demoSignInAction} className="mt-4">
          <button type="submit" className="btn btn-secondary w-full">
            Enter the demo as the demo owner
          </button>
          <p className="muted mt-2 text-center text-[12px]">Fictional clients and transactions. Nothing here is real.</p>
        </form>
      )}
    </div>
  );
}
