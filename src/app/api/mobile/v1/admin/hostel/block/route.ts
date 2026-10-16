import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({
  name: z.string().trim().min(2, "Name the block").max(120),
  type: z.enum(["BOYS", "GIRLS", "MIXED"]),
  address: z.string().trim().max(200).optional(),
  contactPhone: z.string().trim().max(20).optional(),
  wardenId: z.string().trim().optional(),
});

/** POST /api/mobile/v1/admin/hostel/block — create a hostel block (mirror of web saveBlock). */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "hostel.manage", { feature: "hostel" });
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 }));
  }
  const d = parsed.data;

  const db = scopedDb(session.schoolId);
  if (d.wardenId) {
    const warden = await db.staffMember.findUnique({ where: { id: d.wardenId }, select: { id: true } });
    if (!warden) return cors(NextResponse.json({ error: "That warden is not on your staff." }, { status: 404 }));
  }

  const block = await db.hostel.create({
    data: {
      schoolId: session.schoolId,
      name: d.name,
      type: d.type,
      address: d.address || null,
      contactPhone: d.contactPhone || null,
      wardenId: d.wardenId || null,
    },
    select: { id: true, name: true },
  });

  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: "hostel.block.create", entityType: "Hostel", entityId: block.id,
    after: { name: block.name, type: d.type, via: "mobile" },
  });

  return cors(NextResponse.json({ ok: true, message: `Block “${block.name}” created.` }));
}
