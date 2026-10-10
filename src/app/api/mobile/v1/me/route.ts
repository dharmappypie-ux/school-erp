import { NextResponse } from "next/server";

import { cors, resolveMobileSession, passwordChangeRequired }
  from "@/lib/mobile-auth";

export { OPTIONS } from "@/lib/mobile-auth";

/**
 * GET /api/mobile/v1/me
 *
 * The signed-in user's identity and capabilities, so the app can pick the
 * right experience (parent / teacher / admin) and show/hide actions by
 * permission. Cheap and role-agnostic — every authenticated client calls it
 * once after sign-in / restore.
 */
export async function GET(req: Request) {
  const session = await resolveMobileSession(req);
  if (!session) {
  return cors(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  }
  // A temporary password blocks the API, exactly as it blocks the web app.
  if (session.mustChangePassword) return passwordChangeRequired();
  return cors(NextResponse.json({
    userId: session.userId,
    name: session.name,
    email: session.email,
    schoolName: session.schoolName,
    roleKeys: session.roleKeys,
    permissions: session.permissions,
    isStaff: session.staffId != null,
    isGuardian: session.guardianId != null,
    isStudent: session.studentId != null,
  }));
}
