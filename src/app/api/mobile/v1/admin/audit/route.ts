import { NextResponse } from "next/server";

import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const PAGE_SIZE = 50;

/**
 * GET /api/mobile/v1/admin/audit?entityType=&action=&page=1
 *
 * The school's audit trail — who changed what, when. Paged, because a busy
 * school writes thousands of rows a term and a phone should not pull them all.
 */
export async function GET(req: Request) {
  const guard = await requireMobile(req, "audit.read");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const db = scopedDb(session.schoolId);
  const url = new URL(req.url);
  const entityType = url.searchParams.get("entityType")?.trim() || null;
  const action = url.searchParams.get("action")?.trim() || null;
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);

  const where = {
    ...(entityType ? { entityType } : {}),
    ...(action ? { action: { contains: action, mode: "insensitive" as const } } : {}),
  };

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [rows, total, byType, today] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true, action: true, entityType: true, entityId: true,
        ipAddress: true, createdAt: true,
        user: { select: { firstName: true, lastName: true, email: true } },
      },
    }),
    db.auditLog.count({ where }),
    db.auditLog.groupBy({ by: ["entityType"], _count: { _all: true } }),
    db.auditLog.count({ where: { createdAt: { gte: dayAgo } } }),
  ]);

  return cors(NextResponse.json({
    total,
    page,
    pageSize: PAGE_SIZE,
    hasMore: page * PAGE_SIZE < total,
    today,
    entityTypes: byType
      .map((t) => ({ entityType: t.entityType, count: t._count._all }))
      .sort((a, b) => b.count - a.count),
    entries: rows.map((r) => ({
      id: r.id,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      ipAddress: r.ipAddress,
      at: r.createdAt.toISOString(),
      by: r.user ? `${r.user.firstName} ${r.user.lastName ?? ""}`.trim() : "System",
      byEmail: r.user?.email ?? null,
    })),
  }));
}
