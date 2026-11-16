import type { Metadata } from "next";
import { getCtx } from "@/lib/current";
import { PageHeader } from "@/components/ui";
import { getCategoryTree } from "@/lib/money/categories";
import { CategoriesClient } from "./categories-client";

export const metadata: Metadata = { title: "Categories" };

export default async function CategoriesPage() {
  const { user, view } = await getCtx();
  const ws = view === "business" ? "business" : "personal";
  const tree = await getCategoryTree(user.id, ws, { includeArchived: true });
  return (
    <div>
      <PageHeader title={`Categories · ${ws === "business" ? "Business" : "Personal"}`} description="Groups for income, savings, bills, expenses and debt. Renaming and archiving keep every past transaction intact." />
      <CategoriesClient tree={tree} workspace={ws} />
    </div>
  );
}
