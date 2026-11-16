"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import type { ActionState } from "@/components/forms";
import { bool, errorMessage, isoDate, money, opt, str, workspaceOf } from "@/lib/form";
import { createTransaction, createTransfer } from "@/lib/money/transactions";
import { createTask } from "@/lib/tasks";
import { createNote } from "@/lib/notes";
import { createEvent } from "@/lib/events";
import { recordPayment } from "@/lib/business/payments";
import { createClient } from "@/lib/business/clients";
import { createProject } from "@/lib/business/projects";
import { todayInTz, zonedDateTimeToUtc } from "@/lib/dates";
import { storeUpload } from "@/lib/files";
import type { Recurrence } from "@/db/schema";

function ok(message: string, id?: string): ActionState {
  revalidatePath("/", "layout");
  return { ok: true, message, id };
}

export async function addExpenseAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const amount = money(fd, "amount");
    if (!amount || amount <= 0) return { error: "Enter an amount greater than zero." };
    const splitsRaw = str(fd, "splits");
    let splits: { categoryId: string | null; amountMinor: number; note?: string | null }[] | undefined;
    if (splitsRaw) {
      const parsed = JSON.parse(splitsRaw) as { categoryId: string; amount: string; note?: string }[];
      splits = parsed.filter((s) => s.amount).map((s) => ({ categoryId: s.categoryId || null, amountMinor: Math.round(Number(String(s.amount).replace(/,/g, "")) * 100), note: s.note ?? null }));
      if (!splits.length) splits = undefined;
    }
    let receiptFileId: string | null = null;
    const file = fd.get("receipt");
    if (file instanceof File && file.size > 0) receiptFileId = (await storeUpload(user.id, file, "receipts")).id;
    const kind = str(fd, "kind") === "refund" ? "refund" : str(fd, "kind") === "owner_draw" ? "owner_draw" : "expense";
    const tx = await createTransaction(user.id, {
      workspace: workspaceOf(fd),
      kind,
      date: isoDate(fd, "date") ?? todayInTz(user.timezone),
      accountId: str(fd, "accountId"),
      amountMinor: amount,
      dopEquivalentMinor: money(fd, "dopEquivalent"),
      categoryId: opt(fd, "categoryId"),
      merchant: opt(fd, "merchant"),
      note: opt(fd, "note"),
      clientId: opt(fd, "clientId"),
      projectId: opt(fd, "projectId"),
      refundOfId: opt(fd, "refundOfId"),
      receiptFileId,
      splits,
      idempotencyKey: opt(fd, "idempotencyKey"),
    });
    return ok(kind === "refund" ? "Refund recorded." : kind === "owner_draw" ? "Owner draw recorded (outside operating expenses)." : "Expense saved.", tx.id);
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function addIncomeAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const amount = money(fd, "amount");
    if (!amount || amount <= 0) return { error: "Enter an amount greater than zero." };
    const kind = str(fd, "kind") === "owner_contribution" ? "owner_contribution" : "income";
    const tx = await createTransaction(user.id, {
      workspace: workspaceOf(fd),
      kind,
      date: isoDate(fd, "date") ?? todayInTz(user.timezone),
      accountId: str(fd, "accountId"),
      amountMinor: amount,
      dopEquivalentMinor: money(fd, "dopEquivalent"),
      categoryId: opt(fd, "categoryId"),
      merchant: opt(fd, "merchant"),
      note: opt(fd, "note"),
      clientId: opt(fd, "clientId"),
      projectId: opt(fd, "projectId"),
      idempotencyKey: opt(fd, "idempotencyKey"),
    });
    return ok(kind === "owner_contribution" ? "Owner contribution recorded (outside operating income)." : "Income saved.", tx.id);
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function addTransferAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const amount = money(fd, "amount");
    if (!amount || amount <= 0) return { error: "Enter an amount greater than zero." };
    const r = await createTransfer(user.id, {
      date: isoDate(fd, "date") ?? todayInTz(user.timezone),
      fromAccountId: str(fd, "fromAccountId"),
      toAccountId: str(fd, "toAccountId"),
      amountMinor: amount,
      toAmountMinor: money(fd, "toAmount"),
      dopEquivalentMinor: money(fd, "dopEquivalent"),
      note: opt(fd, "note"),
      goalId: opt(fd, "goalId"),
      idempotencyKey: opt(fd, "idempotencyKey"),
    });
    return ok("Transfer recorded. Both accounts are updated and nothing was counted as spending.", r.out.id);
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function addTaskAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const title = str(fd, "title");
    if (!title) return { error: "Give the task a title." };
    const freq = str(fd, "recurrence");
    const recurrence: Recurrence = freq && freq !== "none" ? { frequency: freq as "daily", interval: 1 } : null;
    const t = await createTask(user.id, {
      workspace: workspaceOf(fd),
      title,
      notes: opt(fd, "notes"),
      dueDate: isoDate(fd, "dueDate"),
      dueTime: opt(fd, "dueTime"),
      priority: (str(fd, "priority") || "normal") as "normal",
      checklist: str(fd, "checklist")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      recurrence,
      clientId: opt(fd, "clientId"),
      projectId: opt(fd, "projectId"),
      noteId: opt(fd, "noteId"),
      billId: opt(fd, "billId"),
      invoiceId: opt(fd, "invoiceId"),
    });
    return ok("Task added.", t.id);
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function addNoteAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const body = str(fd, "body");
    if (!body) return { error: "Write something first." };
    const n = await createNote(user.id, { workspace: workspaceOf(fd), title: opt(fd, "title"), body, tags: str(fd, "tags").split(/[,\s]+/).filter(Boolean), pinned: bool(fd, "pinned"), isPrivate: bool(fd, "isPrivate"), clientId: opt(fd, "clientId"), projectId: opt(fd, "projectId") });
    return ok("Note saved.", n.id);
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function addEventAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const title = str(fd, "title");
    const date = isoDate(fd, "date");
    if (!title) return { error: "Give it a title." };
    if (!date) return { error: "Pick a date." };
    const allDay = bool(fd, "allDay");
    const start = zonedDateTimeToUtc(date, allDay ? "00:00" : str(fd, "startTime") || "09:00", user.timezone);
    const end = allDay ? null : str(fd, "endTime") ? zonedDateTimeToUtc(date, str(fd, "endTime"), user.timezone) : null;
    const e = await createEvent(user.id, { workspace: workspaceOf(fd), title, startAt: start, endAt: end, allDay, location: opt(fd, "location"), notes: opt(fd, "notes"), clientId: opt(fd, "clientId"), projectId: opt(fd, "projectId") });
    return ok("Added to your calendar.", e.id);
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function addPaymentAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const amount = money(fd, "amount");
    if (!amount || amount <= 0) return { error: "Enter an amount greater than zero." };
    const p = await recordPayment(user.id, {
      clientId: str(fd, "clientId"),
      projectId: opt(fd, "projectId"),
      invoiceId: opt(fd, "invoiceId"),
      date: isoDate(fd, "date") ?? todayInTz(user.timezone),
      amountMinor: amount,
      currency: str(fd, "currency") || "USD",
      dopEquivalentMinor: money(fd, "dopEquivalent"),
      accountId: str(fd, "accountId"),
      method: opt(fd, "method"),
      note: opt(fd, "note"),
      idempotencyKey: opt(fd, "idempotencyKey"),
    });
    return ok("Payment recorded once in the ledger. Invoice, project and reports are updated.", p.id);
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function addClientAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const company = str(fd, "company");
    if (!company) return { error: "Enter the company or client name." };
    const c = await createClient(user.id, {
      company,
      contactName: opt(fd, "contactName"),
      email: opt(fd, "email"),
      phone: opt(fd, "phone"),
      website: opt(fd, "website"),
      billingAddress: opt(fd, "billingAddress"),
      preferredContact: opt(fd, "preferredContact"),
      notes: opt(fd, "notes"),
      status: (str(fd, "status") || "prospect") as "prospect",
      pipelineStage: (str(fd, "pipelineStage") || "inquiry") as "inquiry",
      estimateMinor: money(fd, "estimate"),
      estimateCurrency: str(fd, "estimateCurrency") || "USD",
      followUpDate: isoDate(fd, "followUpDate"),
    });
    return ok(`Added ${c.company}.`, c.id);
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function addProjectAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const name = str(fd, "name");
    if (!name) return { error: "Give the project a name." };
    if (!str(fd, "clientId")) return { error: "Choose a client." };
    const p = await createProject(user.id, {
      clientId: str(fd, "clientId"),
      name,
      brief: opt(fd, "brief"),
      scope: opt(fd, "scope"),
      startDate: isoDate(fd, "startDate"),
      targetDate: isoDate(fd, "targetDate"),
      agreedValueMinor: money(fd, "agreed") ?? 0,
      currency: str(fd, "currency") || "USD",
      nextAction: opt(fd, "nextAction"),
      phases: str(fd, "phases")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    });
    return ok(`Created ${p.name}.`, p.id);
  } catch (e) {
    return { error: errorMessage(e) };
  }
}
