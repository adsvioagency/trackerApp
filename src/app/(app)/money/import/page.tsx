import type { Metadata } from "next";
import { getCtx } from "@/lib/current";
import { PageHeader, Card } from "@/components/ui";
import { listAccounts } from "@/lib/money/accounts";
import { ImportWizard } from "./import-wizard";

export const metadata: Metadata = { title: "Import CSV" };

export default async function ImportPage() {
  const { user, view } = await getCtx();
  const accounts = await listAccounts(user.id, "combined");
  return (
    <div>
      <PageHeader title="Import transactions (CSV)" description="Map columns, confirm workspace and currency, preview, skip duplicates, then import. Nothing is written until you confirm." />
      <Card className="mb-4 text-[13px]">
        <div className="font-semibold">Exporting from your Google Sheets budget tracker</div>
        <ol className="muted mt-1 list-decimal space-y-0.5 pl-5">
          <li>Open the main transactions tab (the one the monthly tabs point to), not a copied month tab.</li>
          <li>File → Download → Comma-separated values (.csv). One tab per export.</li>
          <li>Keep the header row with Date, Merchant, Amount, Category, Subcategory, Description. The mapping below detects those names automatically.</li>
          <li>Amounts: if expenses are positive numbers in the sheet, leave “positive amounts are expenses” on. Income rows can be negative, or use a separate inflow column.</li>
        </ol>
      </Card>
      <ImportWizard accounts={accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency, type: a.type, workspace: a.workspace }))} defaultWorkspace={view === "business" ? "business" : "personal"} />
    </div>
  );
}
