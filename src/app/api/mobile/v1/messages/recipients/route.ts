import { NextResponse } from "next/server";

import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/**
 * GET /api/mobile/v1/messages/recipients — people you can start a conversation
 * with. Everyone can message staff (who hold a portal login).
 */
export async function GET(req: Request) {
  const guard = await requireMobile(req, "messages.use");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const db = scopedDb(session.schoolId);
  const staff = await db.staffMember.findMany({
    where: { employmentStatus: "ACTIVE", userId: { not: null }, user: { status: "ACTIVE" } },
    orderBy: { firstName: "asc" },
    take: 200,
    select: { firstName: true, lastName: true, staffType: true, userId: true },
  });

  return cors(NextResponse.json({
    items: staff
      .filter((s) => s.userId && s.userId !== session.userId)
      .map((s) => ({
        userId: s.userId,
        name: `${s.firstName} ${s.lastName ?? ""}`.trim(),
        role: s.staffType[0] + s.staffType.slice(1).toLowerCase().replaceAll("_", " "),
      })),
  }));
}
