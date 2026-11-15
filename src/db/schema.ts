/**
 * Database schema · Personal Assistant System
 *
 * Conventions
 * - Money is stored as integer minor units (centavos / cents) in `*_minor` columns.
 * - `currency` is an ISO code: "DOP" (reporting currency) or "USD".
 * - `dop_equivalent_minor` holds the owner-entered DOP value for a non-DOP amount.
 *   Reports use it; when it is missing the report is flagged incomplete.
 * - Calendar dates (bills, tasks, transactions) are plain `date` strings (YYYY-MM-DD)
 *   in the owner's configured timezone. Instants are `timestamptz`.
 * - Every owner-scoped table carries `user_id`; server code always filters by it.
 */
import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  bigint,
  date,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";

// ─── Enums ────────────────────────────────────────────────────────────────────
export const workspaceEnum = pgEnum("workspace", ["personal", "business"]);
export const accountTypeEnum = pgEnum("account_type", [
  "cash",
  "checking",
  "savings",
  "credit_card",
  "loan",
  "other",
]);
export const categoryKindEnum = pgEnum("category_kind", [
  "income",
  "savings",
  "bills",
  "expenses",
  "debt",
]);
export const txKindEnum = pgEnum("tx_kind", [
  "expense",
  "income",
  "transfer_out",
  "transfer_in",
  "refund",
  "owner_contribution",
  "owner_draw",
  "debt_payment",
]);
export const occurrenceStatusEnum = pgEnum("occurrence_status", ["unpaid", "paid", "skipped"]);
export const paydayStatusEnum = pgEnum("payday_status", ["expected", "received", "skipped"]);
export const clientStatusEnum = pgEnum("client_status", ["prospect", "active", "inactive", "archived"]);
export const pipelineStageEnum = pgEnum("pipeline_stage", [
  "inquiry",
  "discussion",
  "proposal_sent",
  "won",
  "lost",
]);
export const projectStatusEnum = pgEnum("project_status", [
  "planning",
  "active",
  "waiting_client",
  "on_hold",
  "completed",
  "cancelled",
]);
export const installmentStatusEnum = pgEnum("installment_status", ["planned", "invoiced", "paid"]);
export const proposalStatusEnum = pgEnum("proposal_status", [
  "draft",
  "sent",
  "approved",
  "declined",
  "expired",
]);
export const invoiceStatusEnum = pgEnum("invoice_status", ["draft", "issued", "paid", "void"]);
export const invoiceKindEnum = pgEnum("invoice_kind", ["deposit", "milestone", "final", "full", "custom"]);
export const taskStatusEnum = pgEnum("task_status", ["open", "done", "cancelled"]);
export const priorityEnum = pgEnum("priority", ["low", "normal", "high"]);
export const notificationStatusEnum = pgEnum("notification_status", ["queued", "sent", "failed", "skipped"]);
export const changeStatusEnum = pgEnum("change_status", ["proposed", "applied", "rejected"]);

// ─── Identity & access ───────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  timezone: text("timezone").notNull().default("America/Santo_Domingo"),
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const authCodes = pgTable(
  "auth_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("auth_codes_email_idx").on(t.email)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    userAgent: text("user_agent"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** Key/value settings per owner (reminders config, spending accounts, last workspace, ...). */
export const userSettings = pgTable(
  "user_settings",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("user_settings_pk").on(t.userId, t.key)],
);

export const activityLog = pgTable(
  "activity_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    workspace: workspaceEnum("workspace"),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    action: text("action").notNull(),
    summary: text("summary").notNull(),
    details: jsonb("details"),
    source: text("source").notNull().default("user"), // user | assistant | system | import
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("activity_user_created_idx").on(t.userId, t.createdAt)],
);

// ─── Files ───────────────────────────────────────────────────────────────────
export const files = pgTable("files", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  storageKey: text("storage_key").notNull(),
  filename: text("filename").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Money: accounts & categories ────────────────────────────────────────────
export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    workspace: workspaceEnum("workspace").notNull(),
    name: text("name").notNull(),
    type: accountTypeEnum("type").notNull(),
    currency: text("currency").notNull().default("DOP"),
    openingBalanceMinor: bigint("opening_balance_minor", { mode: "number" }).notNull().default(0),
    openingDate: date("opening_date", { mode: "string" }).notNull(),
    /** Counts toward "recorded spending cash" and "available after commitments". */
    isSpending: boolean("is_spending").notNull().default(true),
    /** Owner-entered DOP valuation for a non-DOP account (used only when present). */
    manualDopValuationMinor: bigint("manual_dop_valuation_minor", { mode: "number" }),
    manualDopValuationDate: date("manual_dop_valuation_date", { mode: "string" }),
    creditLimitMinor: bigint("credit_limit_minor", { mode: "number" }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    sort: integer("sort").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("accounts_user_ws_idx").on(t.userId, t.workspace)],
);

export const categoryGroups = pgTable(
  "category_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    workspace: workspaceEnum("workspace").notNull(),
    kind: categoryKindEnum("kind").notNull(),
    name: text("name").notNull(),
    sort: integer("sort").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [index("category_groups_user_idx").on(t.userId, t.workspace)],
);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    groupId: uuid("group_id").notNull().references(() => categoryGroups.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"),
    name: text("name").notNull(),
    sort: integer("sort").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [index("categories_user_idx").on(t.userId), index("categories_group_idx").on(t.groupId)],
);

// ─── Money: transactions ─────────────────────────────────────────────────────
export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    workspace: workspaceEnum("workspace").notNull(),
    kind: txKindEnum("kind").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    accountId: uuid("account_id").notNull().references(() => accounts.id),
    /** Always positive; `kind` decides the direction. */
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull(),
    dopEquivalentMinor: bigint("dop_equivalent_minor", { mode: "number" }),
    categoryId: uuid("category_id").references(() => categories.id),
    merchant: text("merchant"),
    note: text("note"),
    receiptFileId: uuid("receipt_file_id").references(() => files.id),
    clientId: uuid("client_id"),
    projectId: uuid("project_id"),
    /** Both legs of a transfer (or a debt payment) share this id. */
    transferGroupId: uuid("transfer_group_id"),
    refundOfId: uuid("refund_of_id"),
    billOccurrenceId: uuid("bill_occurrence_id"),
    paymentId: uuid("payment_id"),
    goalId: uuid("goal_id"),
    debtId: uuid("debt_id"),
    principalMinor: bigint("principal_minor", { mode: "number" }),
    interestMinor: bigint("interest_minor", { mode: "number" }),
    feesMinor: bigint("fees_minor", { mode: "number" }),
    importBatchId: uuid("import_batch_id"),
    importHash: text("import_hash"),
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tx_user_date_idx").on(t.userId, t.date),
    index("tx_account_idx").on(t.accountId),
    index("tx_category_idx").on(t.categoryId),
    index("tx_transfer_idx").on(t.transferGroupId),
    uniqueIndex("tx_idempotency_idx").on(t.userId, t.idempotencyKey),
    index("tx_import_hash_idx").on(t.userId, t.importHash),
  ],
);

/** Allocation lines for a split transaction; they sum to the parent amount. */
export const transactionSplits = pgTable(
  "transaction_splits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transactionId: uuid("transaction_id").notNull().references(() => transactions.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => categories.id),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    note: text("note"),
    clientId: uuid("client_id"),
    projectId: uuid("project_id"),
  },
  (t) => [index("splits_tx_idx").on(t.transactionId)],
);

// ─── Money: bills, paydays, budgets ──────────────────────────────────────────
export const bills = pgTable(
  "bills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    workspace: workspaceEnum("workspace").notNull(),
    name: text("name").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("DOP"),
    categoryId: uuid("category_id").references(() => categories.id),
    accountId: uuid("account_id").references(() => accounts.id),
    /** monthly | weekly | biweekly | yearly | once */
    frequency: text("frequency").notNull().default("monthly"),
    interval: integer("interval").notNull().default(1),
    /** Anchor date; for monthly bills the day of month comes from this date. */
    anchorDate: date("anchor_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }),
    isSubscription: boolean("is_subscription").notNull().default(false),
    autopay: boolean("autopay").notNull().default(false),
    notes: text("notes"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("bills_user_idx").on(t.userId, t.workspace)],
);

export const billOccurrences = pgTable(
  "bill_occurrences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    billId: uuid("bill_id").notNull().references(() => bills.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    /** The nominal date before clamping to the month's last valid day. */
    scheduledDate: date("scheduled_date", { mode: "string" }).notNull(),
    clamped: boolean("clamped").notNull().default(false),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    status: occurrenceStatusEnum("status").notNull().default("unpaid"),
    paidTransactionId: uuid("paid_transaction_id"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("bill_occ_unique").on(t.billId, t.scheduledDate),
    index("bill_occ_user_due_idx").on(t.userId, t.dueDate),
  ],
);

export const incomeSchedules = pgTable(
  "income_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    workspace: workspaceEnum("workspace").notNull(),
    name: text("name").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("DOP"),
    accountId: uuid("account_id").references(() => accounts.id),
    categoryId: uuid("category_id").references(() => categories.id),
    /** monthly | semimonthly | biweekly | weekly */
    frequency: text("frequency").notNull().default("semimonthly"),
    /** For semimonthly: two days of month, e.g. [15, 31] (31 = last day). */
    daysOfMonth: jsonb("days_of_month").$type<number[]>(),
    anchorDate: date("anchor_date", { mode: "string" }).notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("income_schedules_user_idx").on(t.userId)],
);

export const paydayOccurrences = pgTable(
  "payday_occurrences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scheduleId: uuid("schedule_id").notNull().references(() => incomeSchedules.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    scheduledDate: date("scheduled_date", { mode: "string" }).notNull(),
    clamped: boolean("clamped").notNull().default(false),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    status: paydayStatusEnum("status").notNull().default("expected"),
    transactionId: uuid("transaction_id"),
  },
  (t) => [
    uniqueIndex("payday_occ_unique").on(t.scheduleId, t.scheduledDate),
    index("payday_occ_user_date_idx").on(t.userId, t.date),
  ],
);

/**
 * Budget plan lines. A category's monthly target is the month line plus the
 * sum of its paycheck lines for paydays inside that month, so each paycheck
 * allocation is part of the monthly plan.
 */
export const budgetLines = pgTable(
  "budget_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    workspace: workspaceEnum("workspace").notNull(),
    categoryId: uuid("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
    /** "month" | "paycheck" */
    periodType: text("period_type").notNull(),
    /** YYYY-MM for month lines; payday occurrence id for paycheck lines. */
    periodKey: text("period_key").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
  },
  (t) => [
    uniqueIndex("budget_lines_unique").on(t.userId, t.categoryId, t.periodType, t.periodKey),
    index("budget_lines_period_idx").on(t.userId, t.periodType, t.periodKey),
  ],
);

export const rolloverSettings = pgTable(
  "rollover_settings",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(false),
    /** First month (YYYY-MM) from which the carry is computed. */
    sinceMonth: text("since_month"),
  },
  (t) => [uniqueIndex("rollover_settings_pk").on(t.userId, t.categoryId)],
);

/** Explicit positive or negative rollover adjustments, visible in the plan. */
export const rolloverAdjustments = pgTable(
  "rollover_adjustments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
    month: text("month").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("rollover_adj_idx").on(t.userId, t.categoryId, t.month)],
);

export const goals = pgTable(
  "goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    workspace: workspaceEnum("workspace").notNull(),
    name: text("name").notNull(),
    targetMinor: bigint("target_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("DOP"),
    /** Account where the saved money sits. If that account is a spending account the saved amount is reserved. */
    accountId: uuid("account_id").references(() => accounts.id),
    startingMinor: bigint("starting_minor", { mode: "number" }).notNull().default(0),
    targetDate: date("target_date", { mode: "string" }),
    notes: text("notes"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("goals_user_idx").on(t.userId, t.workspace)],
);

export const debts = pgTable(
  "debts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    workspace: workspaceEnum("workspace").notNull(),
    name: text("name").notNull(),
    /** credit_card | loan | other */
    kind: text("kind").notNull().default("loan"),
    /** Liability account whose balance is the amount owed. */
    accountId: uuid("account_id").notNull().references(() => accounts.id),
    interestCategoryId: uuid("interest_category_id").references(() => categories.id),
    aprBasisPoints: integer("apr_basis_points"),
    minimumPaymentMinor: bigint("minimum_payment_minor", { mode: "number" }),
    dueDay: integer("due_day"),
    notes: text("notes"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("debts_user_idx").on(t.userId, t.workspace)],
);

export const importBatches = pgTable("import_batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  workspace: workspaceEnum("workspace").notNull(),
  filename: text("filename").notNull(),
  mapping: jsonb("mapping").notNull(),
  imported: integer("imported").notNull().default(0),
  skippedDuplicates: integer("skipped_duplicates").notNull().default(0),
  errors: integer("errors").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Business: CRM ───────────────────────────────────────────────────────────
export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    company: text("company").notNull(),
    contactName: text("contact_name"),
    email: text("email"),
    phone: text("phone"),
    website: text("website"),
    billingAddress: text("billing_address"),
    /** email | phone | whatsapp | other */
    preferredContact: text("preferred_contact"),
    notes: text("notes"),
    status: clientStatusEnum("status").notNull().default("prospect"),
    pipelineStage: pipelineStageEnum("pipeline_stage").notNull().default("inquiry"),
    estimateMinor: bigint("estimate_minor", { mode: "number" }),
    estimateCurrency: text("estimate_currency").default("USD"),
    followUpDate: date("follow_up_date", { mode: "string" }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("clients_user_idx").on(t.userId)],
);

export const clientContacts = pgTable("client_contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  role: text("role"),
  email: text("email"),
  phone: text("phone"),
});

export const clientActivities = pgTable(
  "client_activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    /** note | call | email | meeting | stage | system */
    kind: text("kind").notNull().default("note"),
    body: text("body").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("client_activities_idx").on(t.clientId, t.occurredAt)],
);

// ─── Business: projects ──────────────────────────────────────────────────────
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull().references(() => clients.id),
    name: text("name").notNull(),
    brief: text("brief"),
    scope: text("scope"),
    status: projectStatusEnum("status").notNull().default("planning"),
    currentPhaseId: uuid("current_phase_id"),
    startDate: date("start_date", { mode: "string" }),
    targetDate: date("target_date", { mode: "string" }),
    agreedValueMinor: bigint("agreed_value_minor", { mode: "number" }).notNull().default(0),
    currency: text("currency").notNull().default("USD"),
    nextAction: text("next_action"),
    waitingOnClient: boolean("waiting_on_client").notNull().default(false),
    waitingSince: date("waiting_since", { mode: "string" }),
    waitingNote: text("waiting_note"),
    followUpDate: date("follow_up_date", { mode: "string" }),
    notes: text("notes"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("projects_user_idx").on(t.userId), index("projects_client_idx").on(t.clientId)],
);

export const projectPhases = pgTable(
  "project_phases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sort: integer("sort").notNull().default(0),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    targetDate: date("target_date", { mode: "string" }),
  },
  (t) => [index("project_phases_idx").on(t.projectId, t.sort)],
);

export const projectDeliverables = pgTable("project_deliverables", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  done: boolean("done").notNull().default(false),
  sort: integer("sort").notNull().default(0),
});

/** Things the client must provide (content, access, approvals). */
export const projectDependencies = pgTable("project_dependencies", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  /** pending | received */
  status: text("status").notNull().default("pending"),
  requestedOn: date("requested_on", { mode: "string" }),
  dueDate: date("due_date", { mode: "string" }),
  receivedOn: date("received_on", { mode: "string" }),
});

export const projectFiles = pgTable("project_files", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  fileId: uuid("file_id").notNull().references(() => files.id, { onDelete: "cascade" }),
  label: text("label"),
});

/**
 * Planned payment schedule for a project (deposit, milestones, final balance).
 * An installment moves planned → invoiced → paid and appears once in totals.
 */
export const projectInstallments = pgTable(
  "project_installments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("USD"),
    dueDate: date("due_date", { mode: "string" }),
    status: installmentStatusEnum("status").notNull().default("planned"),
    invoiceId: uuid("invoice_id"),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [index("installments_project_idx").on(t.projectId)],
);

// ─── Business: proposals & invoices ──────────────────────────────────────────
export const serviceTemplates = pgTable("service_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  unitPriceMinor: bigint("unit_price_minor", { mode: "number" }).notNull(),
  currency: text("currency").notNull().default("USD"),
  unit: text("unit").notNull().default("project"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

export type DocLine = {
  id: string;
  kind: "service" | "third_party" | "maintenance";
  title: string;
  description?: string;
  quantity: number; // supports decimals like 1.5 hours
  rateMinor: number;
  standardRateMinor?: number | null; // standard vs agreed pricing
  discountMinor?: number; // line discount
  optional?: boolean; // optional maintenance etc.
  selected?: boolean; // included in billing when optional
  period?: string; // e.g. "month" for maintenance
  sort: number;
};

export type DocTax = { label: string; rateBasisPoints: number };

export type DocInstallment = {
  id: string;
  label: string;
  kind: "deposit" | "milestone" | "final" | "full";
  mode: "percent" | "fixed";
  value: number; // percent (e.g. 50) or minor amount
  dueDate?: string | null;
  dueLabel?: string | null;
};

export type DocTotals = {
  standardSubtotalMinor: number;
  servicesSubtotalMinor: number; // after line discounts, before project discount
  lineDiscountsMinor: number;
  projectDiscountMinor: number;
  servicesTotalMinor: number; // agency amount before tax
  taxMinor: number;
  totalMinor: number; // agency amount due incl. tax
  maintenanceMinor: number; // selected optional maintenance (per period) included in total if selected
  thirdPartyMinor: number; // informational; paid directly to providers
  includedLineIds: string[];
};

export type DocSnapshot = {
  docType: "proposal" | "invoice";
  number: string;
  issueDate: string;
  currency: string;
  title: string;
  subtitle?: string | null;
  intro?: string | null;
  client: { company: string; contactName?: string | null; email?: string | null; billingAddress?: string | null };
  project?: { name: string } | null;
  lines: DocLine[];
  projectDiscountMinor: number;
  taxes: DocTax[];
  exclusions?: string | null;
  revisionLimit?: string | null;
  paymentTerms?: string | null;
  paymentInstructions?: string | null;
  timingNotes?: string | null;
  installments?: DocInstallment[];
  totals: DocTotals;
  validUntil?: string | null;
  dueDate?: string | null;
  amountDueMinor?: number;
  footerNote?: string | null;
};

export const proposals = pgTable(
  "proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull().references(() => clients.id),
    projectId: uuid("project_id").references(() => projects.id),
    number: text("number").notNull(),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    intro: text("intro"),
    status: proposalStatusEnum("status").notNull().default("draft"),
    issueDate: date("issue_date", { mode: "string" }).notNull(),
    validUntil: date("valid_until", { mode: "string" }),
    currency: text("currency").notNull().default("USD"),
    lines: jsonb("lines").$type<DocLine[]>().notNull().default([]),
    projectDiscountMinor: bigint("project_discount_minor", { mode: "number" }).notNull().default(0),
    taxes: jsonb("taxes").$type<DocTax[]>().notNull().default([]),
    exclusions: text("exclusions"),
    revisionLimit: text("revision_limit"),
    paymentTerms: text("payment_terms"),
    paymentInstructions: text("payment_instructions"),
    timingNotes: text("timing_notes"),
    installments: jsonb("installments").$type<DocInstallment[]>().notNull().default([]),
    /** Frozen values from the moment the proposal was sent/approved. */
    snapshot: jsonb("snapshot").$type<DocSnapshot | null>(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("proposals_user_idx").on(t.userId), uniqueIndex("proposals_number_idx").on(t.userId, t.number)],
);

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull().references(() => clients.id),
    projectId: uuid("project_id").references(() => projects.id),
    proposalId: uuid("proposal_id").references(() => proposals.id),
    installmentId: uuid("installment_id"),
    number: text("number").notNull(),
    kind: invoiceKindEnum("kind").notNull().default("custom"),
    title: text("title").notNull(),
    status: invoiceStatusEnum("status").notNull().default("draft"),
    issueDate: date("issue_date", { mode: "string" }).notNull(),
    dueDate: date("due_date", { mode: "string" }),
    currency: text("currency").notNull().default("USD"),
    lines: jsonb("lines").$type<DocLine[]>().notNull().default([]),
    projectDiscountMinor: bigint("project_discount_minor", { mode: "number" }).notNull().default(0),
    taxes: jsonb("taxes").$type<DocTax[]>().notNull().default([]),
    paymentTerms: text("payment_terms"),
    paymentInstructions: text("payment_instructions"),
    notes: text("notes"),
    /** Amount requested by this invoice (frozen at issue). */
    totalMinor: bigint("total_minor", { mode: "number" }).notNull().default(0),
    snapshot: jsonb("snapshot").$type<DocSnapshot | null>(),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("invoices_user_idx").on(t.userId),
    index("invoices_project_idx").on(t.projectId),
    uniqueIndex("invoices_number_idx").on(t.userId, t.number),
  ],
);

/** A client payment. Creates exactly one ledger transaction (income). */
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull().references(() => clients.id),
    projectId: uuid("project_id").references(() => projects.id),
    invoiceId: uuid("invoice_id").references(() => invoices.id),
    date: date("date", { mode: "string" }).notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull(),
    dopEquivalentMinor: bigint("dop_equivalent_minor", { mode: "number" }),
    method: text("method"),
    accountId: uuid("account_id").notNull().references(() => accounts.id),
    transactionId: uuid("transaction_id"),
    note: text("note"),
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("payments_invoice_idx").on(t.invoiceId),
    index("payments_project_idx").on(t.projectId),
    uniqueIndex("payments_idempotency_idx").on(t.userId, t.idempotencyKey),
  ],
);

// ─── Tasks, notes, calendar ──────────────────────────────────────────────────
export type ChecklistItem = { id: string; text: string; done: boolean };
export type Recurrence = { frequency: "daily" | "weekly" | "monthly" | "yearly"; interval: number } | null;

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    workspace: workspaceEnum("workspace").notNull(),
    title: text("title").notNull(),
    notes: text("notes"),
    dueDate: date("due_date", { mode: "string" }),
    dueTime: text("due_time"), // HH:MM in the owner's timezone
    status: taskStatusEnum("status").notNull().default("open"),
    priority: priorityEnum("priority").notNull().default("normal"),
    checklist: jsonb("checklist").$type<ChecklistItem[]>().notNull().default([]),
    recurrence: jsonb("recurrence").$type<Recurrence>(),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    noteId: uuid("note_id"),
    billId: uuid("bill_id").references(() => bills.id, { onDelete: "set null" }),
    invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
    proposalId: uuid("proposal_id").references(() => proposals.id, { onDelete: "set null" }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    sort: integer("sort").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tasks_user_due_idx").on(t.userId, t.dueDate), index("tasks_project_idx").on(t.projectId)],
);

export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    workspace: workspaceEnum("workspace").notNull(),
    title: text("title"),
    body: text("body").notNull().default(""),
    pinned: boolean("pinned").notNull().default(false),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    /** Private notes stay out of assistant context unless explicitly attached. */
    isPrivate: boolean("is_private").notNull().default(false),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notes_user_idx").on(t.userId, t.workspace)],
);

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    workspace: workspaceEnum("workspace").notNull(),
    title: text("title").notNull(),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }),
    allDay: boolean("all_day").notNull().default(false),
    location: text("location"),
    notes: text("notes"),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("events_user_start_idx").on(t.userId, t.startAt)],
);

// ─── Reminders & notifications ───────────────────────────────────────────────
/** Per-item reminder state: dedupes sends, tracks 24h repeats, snooze and mute. */
export const reminderStates = pgTable(
  "reminder_states",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    /** bill_occurrence | task | invoice | project_followup | client_followup */
    itemType: text("item_type").notNull(),
    itemId: uuid("item_id").notNull(),
    firstSentAt: timestamp("first_sent_at", { withTimezone: true }),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
    timesSent: integer("times_sent").notNull().default(0),
    snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
    muted: boolean("muted").notNull().default(false),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("reminder_states_unique").on(t.userId, t.itemType, t.itemId)],
);

export type NotificationItem = { itemType: string; itemId: string; title: string; due: string | null; href: string };

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    channel: text("channel").notNull().default("email"), // email | in_app
    kind: text("kind").notNull().default("digest"), // digest | single | test
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    items: jsonb("items").$type<NotificationItem[]>().notNull().default([]),
    /** Unique per logical delivery; retries reuse the same key and never send twice. */
    dedupeKey: text("dedupe_key").notNull(),
    status: notificationStatusEnum("status").notNull().default("queued"),
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    isTest: boolean("is_test").notNull().default(false),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("notifications_dedupe_idx").on(t.userId, t.dedupeKey),
    index("notifications_user_idx").on(t.userId, t.createdAt),
  ],
);

// ─── Assistant ───────────────────────────────────────────────────────────────
export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title"),
  /** Notes the owner explicitly attached to this conversation. */
  attachedNoteIds: jsonb("attached_note_ids").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // user | assistant
    content: text("content").notNull(),
    /** Structured facts and links the answer was built from. */
    meta: jsonb("meta"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("messages_conv_idx").on(t.conversationId, t.createdAt)],
);

export type ChangePreview = { field: string; from: string | null; to: string | null };

export const proposedChanges = pgTable("proposed_changes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "cascade" }),
  messageId: uuid("message_id"),
  /** e.g. task.create, task.complete, project.update, transaction.create */
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id"),
  summary: text("summary").notNull(),
  payload: jsonb("payload").notNull(),
  preview: jsonb("preview").$type<ChangePreview[]>().notNull().default([]),
  status: changeStatusEnum("status").notNull().default("proposed"),
  appliedAt: timestamp("applied_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
