import { getCurrentUser } from "@/lib/auth";
import { getInvoice, getProposal, buildSnapshot } from "@/lib/business/documents";
import { renderDocumentPdf } from "@/lib/pdf/document";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Owner-only PDF. Issued/sent documents render from their frozen snapshot so
 * later edits never change what was sent. Drafts render from current values
 * and are watermarked in the file name.
 */
export async function GET(req: Request, ctx: { params: Promise<{ type: string; id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  const { type, id } = await ctx.params;
  const url = new URL(req.url);
  const download = url.searchParams.get("download") === "1";
  let snap;
  let name = "document";
  if (type === "proposal") {
    const p = await getProposal(user.id, id);
    if (!p) return new Response("Not found", { status: 404 });
    snap = p.snapshot && p.status !== "draft" ? p.snapshot : buildSnapshot(p, p.client, p.project, "proposal");
    name = `${p.number}-${p.client.company}${p.status === "draft" ? "-DRAFT" : ""}`;
  } else if (type === "invoice") {
    const i = await getInvoice(user.id, id);
    if (!i) return new Response("Not found", { status: 404 });
    snap = i.snapshot && i.status !== "draft" ? i.snapshot : buildSnapshot({ ...i, installments: [] }, i.client, i.project, "invoice");
    name = `${i.number}-${i.client.company}${i.status === "draft" ? "-DRAFT" : ""}`;
  } else return new Response("Unknown document type", { status: 400 });
  const pdf = await renderDocumentPdf(snap);
  const safe = name.replace(/[^a-zA-Z0-9._-]+/g, "-");
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${safe}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
