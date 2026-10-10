import "server-only";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { hashSessionToken } from "@/lib/session";

/**
 * The mobile API is called by native clients (no origin) and, during
 * development, by the Flutter web build from a different port — so it opts into
 * permissive CORS. Auth is by Bearer token, never by cookie/credentials, so
 * `*` here does not expose the session to other sites.
 */
const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

export function cors(res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
  return res;
}

/** Shared CORS preflight handler for the mobile routes. */
export function OPTIONS(): NextResponse {
  return cors(new NextResponse(null, { status: 204 }));
}

/**
 * Bearer-token authentication for the mobile API.
 *
 * The web app carries the session token in an httpOnly cookie; native clients
 * carry the same opaque token in an `Authorization: Bearer …` header instead.
 * The lookup is identical — only the digest is stored, so a leaked database
 * dump still can't be replayed — which is why the mobile surface needs no new
 * credential model, only this different place to read the token from.
 */
export interface MobileSession {
  userId: string;
  schoolId: string;
  studentId: string | null;
  guardianId: string | null;
  staffId: string | null;
  name: string;
  email: string;
  schoolName: string;
  academicYearId: string | null;
  roleKeys: string[];
  permissions: string[];
  /**
   * The account still holds the temporary password it was created with. The web
   * app blocks every page until it is replaced; the mobile API must refuse the
   * same way, or the app is simply the way around that.
   */
  mustChangePassword: boolean;
}

/**
 * Returned instead of data while a temporary password is still in force.
 * The client keys on `code` to send the user to its change-password screen
 * rather than showing an unexplained permission error.
 */
export function passwordChangeRequired(): NextResponse {
  return cors(
    NextResponse.json(
      {
        error: "Change your password before using the app.",
        code: "PASSWORD_CHANGE_REQUIRED",
      },
      { status: 403 },
    ),
  );
}

/**
 * Guard a mobile route by permission. Returns either the resolved session or a
 * ready-to-return CORS JSON error (401 if unauthenticated, 403 if the signed-in
 * user lacks every one of `anyOf`). Usage:
 *   const g = await requireMobile(req, "homework.manage");
 *   if (g instanceof NextResponse) return g;
 *   // g is the MobileSession
 */
export async function requireMobile(
  req: Request,
  anyOf: string | string[] = [],
): Promise<MobileSession | NextResponse> {
  const session = await resolveMobileSession(req);
  if (!session) {
    return cors(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  }
  // Enforced here rather than in the client, so a crafted request cannot skip
  // it either. The change-password route resolves the session directly and is
  // therefore exempt — otherwise there would be no way out.
  if (session.mustChangePassword) return passwordChangeRequired();

  const needed = Array.isArray(anyOf) ? anyOf : [anyOf];
  // No permission requested → any valid session is enough (child-scoped routes).
  if (needed.length === 0) return session;
  const ok = needed.some((p) => hasPermission(session.permissions, p));
  if (!ok) {
    return cors(NextResponse.json(
      { error: "You don't have permission to do that." },
      { status: 403 },
    ));
  }
  return session;
}

export function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

export async function resolveMobileSession(
  req: Request,
): Promise<MobileSession | null> {
  const token = bearerToken(req);
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: {
      user: {
        include: {
          roles: true,
          school: { select: { isActive: true, name: true } },
          student: { select: { id: true } },
          guardian: { select: { id: true } },
          staff: { select: { id: true } },
        },
      },
    },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  const { user } = session;
  if (user.status !== "ACTIVE" || user.deletedAt || !user.school.isActive) return null;

  const year = await prisma.academicYear.findFirst({
    where: { schoolId: user.schoolId, isCurrent: true },
    select: { id: true },
  });

  return {
    userId: user.id,
    schoolId: user.schoolId,
    studentId: user.student?.id ?? null,
    guardianId: user.guardian?.id ?? null,
    staffId: user.staff?.id ?? null,
    name: `${user.firstName} ${user.lastName ?? ""}`.trim(),
    email: user.email,
    schoolName: user.school.name,
    academicYearId: year?.id ?? null,
    roleKeys: user.roles.map((r) => r.key),
    permissions: [...new Set(user.roles.flatMap((r) => r.permissions))],
    mustChangePassword: user.mustChangePassword,
  };
}
