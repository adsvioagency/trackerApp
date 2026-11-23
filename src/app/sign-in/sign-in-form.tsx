"use client";

import { useActionState } from "react";
import { accessKeyAction, requestCodeAction, type SignInState } from "./actions";
import { SubmitButton } from "@/components/forms";

export function SignInForm({ next, useAccessKey }: { next?: string; useAccessKey: boolean }) {
  const [state, action] = useActionState<SignInState, FormData>(
    useAccessKey ? accessKeyAction : requestCodeAction, null,
  );
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        <input id="email" name="email" type="email" inputMode="email" autoComplete="email" required autoFocus className="input" placeholder="you@example.com" defaultValue={state?.email ?? ""} />
      </div>
      {useAccessKey && (
        <div>
          <label className="label" htmlFor="accessKey">Private access key</label>
          <input id="accessKey" name="accessKey" type="password" autoComplete="current-password" required className="input" />
        </div>
      )}
      {next && <input type="hidden" name="next" value={next} />}
      {state?.error && (
        <p role="alert" className="rounded-[10px] bg-danger-wash px-3 py-2 text-[13px] font-medium text-danger">
          {state.error}
        </p>
      )}
      <SubmitButton className="btn btn-primary w-full" pendingText={useAccessKey ? "Signing in…" : "Sending code…"}>
        {useAccessKey ? "Sign in" : "Email me a code"}
      </SubmitButton>
    </form>
  );
}
