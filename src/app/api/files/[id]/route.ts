import { getCurrentUser } from "@/lib/auth";
import { readOwnedFile } from "@/lib/files";

export const dynamic = "force-dynamic";

/** Private file download: only the owner can read their files. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  const { id } = await ctx.params;
  const hit = await readOwnedFile(user.id, id);
  if (!hit) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(hit.data), {
    headers: {
      "Content-Type": hit.row.mime,
      "Content-Disposition": `inline; filename="${encodeURIComponent(hit.row.filename)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
