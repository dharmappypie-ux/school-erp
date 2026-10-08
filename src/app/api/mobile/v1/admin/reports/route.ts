import { NextResponse } from "next/server";

import { hasPermission } from "@/lib/permissions";
import { SOURCES } from "@/lib/reports";
import { cors, requireMobile } from "@/lib/mobile-auth";

export { OPTIONS } from "@/lib/mobile-auth";

/**
 * GET /api/mobile/v1/admin/reports
 *
 * The report sources the caller may run (filtered by permission), each with its
 * selectable fields — enough for the app to build a simple report. Mirror of the
 * web reports builder's source catalogue.
 */
export async function GET(req: Request) {
  const guard = await requireMobile(req, "reports.build");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const sources = SOURCES
    .filter((s) => hasPermission(session.permissions, s.permission))
    .map((s) => ({
      key: s.key,
      label: s.label,
      description: s.description,
      fields: s.fields.map((f) => ({ key: f.key, label: f.label, type: f.type })),
    }));

  return cors(NextResponse.json({ sources }));
}
