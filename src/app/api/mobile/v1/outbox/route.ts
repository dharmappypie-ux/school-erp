import { NextResponse } from "next/server";
import { z } from "zod";

import { cors, resolveMobileSession, passwordChangeRequired }
  from "@/lib/mobile-auth";

export { OPTIONS } from "@/lib/mobile-auth";

const ItemSchema = z.object({
  kind: z.string().min(1).max(64),
  entityId: z.string().min(1).max(128),
  payload: z.string().max(4000).optional(),
});

/**
 * POST /api/mobile/v1/outbox
 *
 * The sync "push": one queued offline edit from the device. Notification
 * preferences and read-state are device-local in this version, so recognised
 * kinds are accepted and acknowledged (letting the client clear its queue);
 * unknown kinds are rejected so nothing is silently dropped. As server-side
 * stores for these land, apply them here — the client contract stays the same.
 */
const KNOWN_KINDS = new Set(["pref.toggle", "notice.read", "homework.done"]);

export async function POST(req: Request) {
  const session = await resolveMobileSession(req);
  if (!session) {
  return cors(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  }
  // A temporary password blocks the API, exactly as it blocks the web app.
  if (session.mustChangePassword) return passwordChangeRequired();

  const parsed = ItemSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: "Invalid outbox item." }, { status: 400 }));
  }

  if (!KNOWN_KINDS.has(parsed.data.kind)) {
    return cors(NextResponse.json(
      { error: `Unknown change kind "${parsed.data.kind}".` },
      { status: 422 },
    ));
  }

  return cors(NextResponse.json({ ok: true, kind: parsed.data.kind }));
}
