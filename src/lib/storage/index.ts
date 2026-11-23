/**
 * Private file storage interface.
 * - local: files under ./data/<mode>/files (never served statically; always via
 *   the authenticated /api/files route).
 * - supabase: Supabase Storage private bucket through the REST API with the
 *   service-role key (server only).
 */
import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { getStore } from "@netlify/blobs";
import { env } from "@/lib/env";

export interface StorageDriver {
  readonly name: string;
  put(key: string, data: Buffer, mime: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  remove(key: string): Promise<void>;
}

class LocalStorage implements StorageDriver {
  readonly name = "local";
  constructor(private readonly root: string) {}
  private resolve(key: string) {
    const safe = key.replace(/[^a-zA-Z0-9/_\-.]/g, "_");
    const full = path.join(this.root, safe);
    if (!full.startsWith(this.root)) throw new Error("Invalid storage key");
    return full;
  }
  async put(key: string, data: Buffer) {
    const full = this.resolve(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
  }
  async get(key: string) {
    try {
      return await fs.readFile(this.resolve(key));
    } catch {
      return null;
    }
  }
  async remove(key: string) {
    await fs.rm(this.resolve(key), { force: true });
  }
}

class SupabaseStorage implements StorageDriver {
  readonly name = "supabase";
  constructor(
    private readonly url: string,
    private readonly serviceKey: string,
    private readonly bucket: string,
  ) {}
  private endpoint(key: string) {
    return `${this.url.replace(/\/$/, "")}/storage/v1/object/${this.bucket}/${key}`;
  }
  async put(key: string, data: Buffer, mime: string) {
    const res = await fetch(this.endpoint(key), {
      method: "POST",
      headers: { Authorization: `Bearer ${this.serviceKey}`, "Content-Type": mime, "x-upsert": "true" },
      body: new Uint8Array(data),
    });
    if (!res.ok) throw new Error(`Supabase storage upload failed: ${res.status} ${await res.text()}`);
  }
  async get(key: string) {
    const res = await fetch(this.endpoint(key), { headers: { Authorization: `Bearer ${this.serviceKey}` } });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  }
  async remove(key: string) {
    await fetch(this.endpoint(key), { method: "DELETE", headers: { Authorization: `Bearer ${this.serviceKey}` } });
  }
}

class NetlifyStorage implements StorageDriver {
  readonly name = "netlify";
  private readonly store = getStore({ name: "tracker-private-files", consistency: "strong" });

  async put(key: string, data: Buffer, mime: string) {
    await this.store.set(key, new Blob([new Uint8Array(data)], { type: mime }));
  }
  async get(key: string) {
    const data = await this.store.get(key, { type: "arrayBuffer" });
    return data ? Buffer.from(data) : null;
  }
  async remove(key: string) {
    await this.store.delete(key);
  }
}

export function getStorage(): StorageDriver {
  if (env.storageDriver === "supabase" && env.supabaseUrl && env.supabaseServiceRoleKey) {
    return new SupabaseStorage(env.supabaseUrl, env.supabaseServiceRoleKey, env.supabaseBucket);
  }
  if (process.env.NETLIFY === "true" || process.env.NETLIFY_DB_URL) return new NetlifyStorage();
  return new LocalStorage(path.join(process.cwd(), env.dataDir, "files"));
}
