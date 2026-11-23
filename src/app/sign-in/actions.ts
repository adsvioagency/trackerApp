"use server";

import { redirect } from "next/navigation";
import { requestSignInCode, signInDemoOwner, signInWithAccessKey, verifySignInCode } from "@/lib/auth";
import { env } from "@/lib/env";

export type SignInState = { error?: string; sent?: boolean; devCode?: string; email?: string } | null;

export async function accessKeyAction(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "");
  const key = String(formData.get("accessKey") ?? "").trim();
  if (!(await signInWithAccessKey(email, key))) {
    return { error: "Check your email and access key and try again.", email };
  }
  const next = String(formData.get("next") ?? "");
  redirect(next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "/today");
}

export async function requestCodeAction(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "");
  const res = await requestSignInCode(email);
  if (!res.ok) return { error: res.error, email };
  const params = new URLSearchParams({ email: email.trim().toLowerCase() });
  if (res.devCode) params.set("dev", res.devCode);
  const next = String(formData.get("next") ?? "");
  if (next.startsWith("/")) params.set("next", next);
  redirect(`/sign-in/verify?${params.toString()}`);
}

export async function verifyCodeAction(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "");
  const code = String(formData.get("code") ?? "");
  const res = await verifySignInCode(email, code);
  if (!res.ok) return { error: res.error, email };
  const next = String(formData.get("next") ?? "");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/today");
}

export async function demoSignInAction() {
  if (!env.isDemo) return;
  await signInDemoOwner();
  redirect("/today");
}
