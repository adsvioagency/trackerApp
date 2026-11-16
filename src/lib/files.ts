import "server-only";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb, schema } from "@/db";
import { getStorage } from "@/lib/storage";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf", "text/plain", "text/csv"];

export async function storeUpload(userId: string, file: File, folder = "uploads") {
  if (file.size === 0) throw new Error("The file is empty.");
  if (file.size > MAX_BYTES) throw new Error("Files up to 10 MB are supported.");
  const mime = file.type || "application/octet-stream";
  if (!ALLOWED.includes(mime)) throw new Error("Use an image, PDF, text or CSV file.");
  const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase() : "";
  const key = `${userId}/${folder}/${randomUUID()}${ext}`;
  const data = Buffer.from(await file.arrayBuffer());
  await getStorage().put(key, data, mime);
  const db = await getDb();
  const [row] = await db.insert(schema.files).values({ userId, storageKey: key, filename: file.name, mime, size: file.size }).returning();
  return row;
}

export async function readOwnedFile(userId: string, fileId: string) {
  const db = await getDb();
  const row = await db.query.files.findFirst({ where: and(eq(schema.files.id, fileId), eq(schema.files.userId, userId)) });
  if (!row) return null;
  const data = await getStorage().get(row.storageKey);
  if (!data) return null;
  return { row, data };
}

export async function deleteOwnedFile(userId: string, fileId: string) {
  const db = await getDb();
  const row = await db.query.files.findFirst({ where: and(eq(schema.files.id, fileId), eq(schema.files.userId, userId)) });
  if (!row) return;
  await getStorage().remove(row.storageKey);
  await db.delete(schema.files).where(eq(schema.files.id, fileId));
}
