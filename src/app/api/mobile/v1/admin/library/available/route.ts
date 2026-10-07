import { NextResponse } from "next/server";

import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/** GET /api/mobile/v1/admin/library/available — copies free to issue. */
export async function GET(req: Request) {
  const guard = await requireMobile(req, ["library.circulate", "library.manage", "library.read"]);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const db = scopedDb(session.schoolId);
  const copies = await db.bookCopy.findMany({
    where: { status: "AVAILABLE", book: { schoolId: session.schoolId } },
    orderBy: { accessionNo: "asc" },
    take: 150,
    select: { id: true, accessionNo: true, book: { select: { title: true, author: true } } },
  });

  return cors(NextResponse.json({
    items: copies.map((c) => ({
      id: c.id,
      accessionNo: c.accessionNo,
      title: c.book.title,
      author: c.book.author,
    })),
  }));
}
