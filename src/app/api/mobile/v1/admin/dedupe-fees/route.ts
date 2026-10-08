import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/audit";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/**
 * POST /api/mobile/v1/admin/dedupe-fees — TEMPORARY. Collapses duplicate fee
 * structures (same name) in the caller's school, keeping the one that has the
 * most invoices (the billed copy) and deleting the empties. Deleting cascades
 * the structure's items and nulls any invoice's structureId. Super-admin only.
 */
export async function POST(req: Request) {
  const guard = await requireMobile(req);
  if (guard instanceof NextResponse) return guard;
  const session = guard;
  if (!session.permissions.includes("*")) {
    return cors(NextResponse.json({ error: "Super admin only." }, { status: 403 }));
  }

  const db = scopedDb(session.schoolId);
  const structures = await db.feeStructure.findMany({
    select: { id: true, name: true, createdAt: true, _count: { select: { invoices: true } } },
  });

  const byName = new Map<string, typeof structures>();
  for (const s of structures) {
    (byName.get(s.name) ?? byName.set(s.name, []).get(s.name)!).push(s);
  }

  const toDelete: string[] = [];
  let groups = 0;
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    groups += 1;
    // Keep the one with the most invoices; tie → oldest.
    const keep = [...group].sort(
      (a, b) => b._count.invoices - a._count.invoices || a.createdAt.getTime() - b.createdAt.getTime(),
    )[0];
    for (const s of group) if (s.id !== keep.id) toDelete.push(s.id);
  }

  let deleted = 0;
  if (toDelete.length) {
    deleted = (await db.feeStructure.deleteMany({ where: { id: { in: toDelete } } })).count;
    await recordAudit({
      schoolId: session.schoolId, userId: session.userId,
      action: "fees.structure.dedupe", entityType: "FeeStructure", entityId: session.schoolId,
      after: { deleted, groups, via: "mobile" },
    });
  }

  return cors(NextResponse.json({ ok: true, duplicateGroups: groups, structuresDeleted: deleted, remaining: structures.length - deleted }));
}
