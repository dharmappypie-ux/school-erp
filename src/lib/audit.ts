import "server-only";

import { headers } from "next/headers";

import { prisma } from "@/lib/db";

/**
 * Appends an entry to the tenant's audit trail.
 *
 * Deliberately never throws: an audit write failing must not roll back or block
 * the business operation it describes. Failures are logged to the server
 * console instead.
 */
export async function recordAudit(input: {
  schoolId: string;
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  try {
    const requestHeaders = await headers();
    await prisma.auditLog.create({
      data: {
        schoolId: input.schoolId,
        userId: input.userId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        before: (input.before ?? undefined) as never,
        after: (input.after ?? undefined) as never,
        ipAddress:
          requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
        userAgent: requestHeaders.get("user-agent") ?? undefined,
      },
    });
  } catch (error) {
    console.error("[audit] failed to record entry", input.action, error);
  }
}
