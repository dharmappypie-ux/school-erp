import "server-only";

import { prisma } from "@/lib/db";

/**
 * Upload storage, backed by the database.
 *
 * Uploads (student/staff photos, homework attachments) are stored as rows in
 * the `uploads` table rather than on disk or in object storage. That keeps the
 * app dependency-free — it runs on Cloudflare Workers (read-only filesystem)
 * with nothing to provision beyond the Postgres it already uses — and every
 * environment behaves identically. Files are addressed by `key` (the path in
 * the `/uploads/<key>` URL) and served by the `/uploads/[...path]` route.
 *
 * Suited to a school's photos and attachments (a few MB each). If uploads ever
 * grow into the many-GB range, swap this module for an object store; nothing
 * else in the app needs to change.
 */

export interface StoredObject {
  /** ArrayBuffer-backed so it satisfies `BodyInit` for the serving route. */
  body: Uint8Array<ArrayBuffer>;
  contentType: string;
}

/** Persists bytes and returns the public URL path to serve them from. */
export async function saveUpload(
  dir: string,
  filename: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<string> {
  const key = `${dir}/${filename}`;
  // A fresh ArrayBuffer-backed copy, so the type matches Prisma's Bytes
  // (`Uint8Array<ArrayBuffer>`) regardless of how the caller built its view.
  const data = Uint8Array.from(bytes);
  // tenant-safe: uploads are public assets keyed by an unguessable path (record
  // id + timestamp), matching the prior static public/uploads behaviour; the
  // table has no tenant column.
  await prisma.upload.upsert({
    where: { key },
    create: { key, data, contentType, size: data.byteLength },
    update: { data, contentType, size: data.byteLength },
  });
  return `/uploads/${key}`;
}

/** Removes a stored object. A missing object is not an error. */
export async function deleteUpload(dir: string, filename: string): Promise<void> {
  // tenant-safe: keyed delete of a public asset; see saveUpload.
  await prisma.upload.deleteMany({ where: { key: `${dir}/${filename}` } });
}

/** Reads an object for the `/uploads/*` serving route. */
export async function readUpload(key: string): Promise<StoredObject | null> {
  // tenant-safe: keyed read of a public asset; see saveUpload.
  const row = await prisma.upload.findUnique({
    where: { key },
    select: { data: true, contentType: true },
  });
  if (!row) return null;
  return { body: Uint8Array.from(row.data), contentType: row.contentType };
}
