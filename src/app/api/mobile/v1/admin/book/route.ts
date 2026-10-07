import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({
  title: z.string().trim().min(1, "Give the book a title").max(300),
  author: z.string().trim().max(200).optional(),
  category: z.string().trim().max(100).optional(),
  isbn: z.string().trim().max(40).optional(),
  publisher: z.string().trim().max(200).optional(),
});

/** POST /api/mobile/v1/admin/book — add a library book. */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "library.manage");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 }));
  }

  const db = scopedDb(session.schoolId);
  const book = await db.book.create({
    data: {
      schoolId: session.schoolId,
      title: parsed.data.title,
      author: parsed.data.author || null,
      category: parsed.data.category || null,
      isbn: parsed.data.isbn || null,
      publisher: parsed.data.publisher || null,
    },
    select: { id: true, title: true },
  });

  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: "library.create", entityType: "Book", entityId: book.id,
    after: { title: book.title, via: "mobile" },
  });

  return cors(NextResponse.json({ ok: true, id: book.id, message: `“${book.title}” added to the library.` }));
}
