"use client";

import { useActionState } from "react";
import { verifyCodeAction, type SignInState } from "../actions";
import { SubmitButton } from "@/components/forms";

export function VerifyForm({ email, next }: { email: string; next?: string }) {
  const [state, action] = useActionState<SignInState, FormData>(verifyCodeAction, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="email" value={email} />
      {next && <input type="hidden" name="next" value={next} />}
      <div>
        <label className="label" htmlFor="code">
          Code
        </label>
        <input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          autoFocus
          className="input tnum text-center text-[26px] font-bold tracking-[0.35em]"
          placeholder="••••••"
        />
      </div>
      {state?.error && (
        <p role="alert" className="rounded-[10px] bg-danger-wash px-3 py-2 text-[13px] font-medium text-danger">
          {state.error}
        </p>
      )}
      <SubmitButton className="btn btn-primary w-full" pendingText="Checking…">
        Sign in
      </SubmitButton>
    </form>
  );
}
