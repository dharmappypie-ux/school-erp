import { type NextRequest } from "next/server";

import { readUpload } from "@/lib/storage";

/**
 * Serves uploaded files (photos, homework attachments) from the database.
 *
 * Uploads are stored as rows by `@/lib/storage`, so this route reads the bytes
 * by key and returns them. It works identically in every environment — local
 * dev and Cloudflare Workers alike — with nothing on the filesystem.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const key = (Array.isArray(path) ? path : [path]).join("/");

  // Defence in depth against a traversal key reaching object storage.
  if (!key || key.includes("..")) {
    return new Response("Not found", { status: 404 });
  }

  const object = await readUpload(key);
  if (!object) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(object.body, {
    headers: {
      "Content-Type": object.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
