import { NextResponse } from "next/server";

import { gridFromUpload } from "@/lib/import-run";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { buildTemplateCsv } from "@/lib/staff-import";
import {
  commitStaffRun,
  previewStaffRun,
  MAX_STAFF_IMPORT_ROWS,
} from "@/lib/staff-import-run";

export { OPTIONS } from "@/lib/mobile-auth";

/**
 * GET /api/mobile/v1/admin/import/staff
 *
 * The column template, and the per-file row cap (each row mints a login whose
 * password has to be hashed, which is deliberately slow).
 */
export async function GET(req: Request) {
  const guard = await requireMobile(req, "staff.create");
  if (guard instanceof NextResponse) return guard;

  return cors(NextResponse.json({
    template: buildTemplateCsv(),
    maxRows: MAX_STAFF_IMPORT_ROWS,
  }));
}

/**
 * POST /api/mobile/v1/admin/import/staff
 *
 * Two steps, as on the web:
 *   • multipart with a `file` → a preview. Nothing is written.
 *   • JSON `{ "rows": [...] }` (the preview's rows) → the commit, which creates
 *     a sign-in per row and returns the one-time passwords once.
 */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "staff.create");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const type = req.headers.get("content-type") ?? "";

  if (type.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) {
      return cors(NextResponse.json({ error: "Attach a .csv or .xlsx file." }, { status: 400 }));
    }
    const read = await gridFromUpload(file);
    if ("error" in read) {
      return cors(NextResponse.json({ ok: false, message: read.error }, { status: 400 }));
    }
    const preview = await previewStaffRun(
      session.schoolId, session.permissions, read.grid,
    );
    return cors(NextResponse.json(preview, { status: preview.ok ? 200 : 400 }));
  }

  const body = (await req.json().catch(() => null)) as { rows?: unknown } | null;
  if (!Array.isArray(body?.rows) || body.rows.length === 0) {
    return cors(NextResponse.json(
      { error: "Nothing to import — send the preview's rows." },
      { status: 400 },
    ));
  }

  const result = await commitStaffRun(
    {
      schoolId: session.schoolId,
      userId: session.userId,
      permissions: session.permissions,
    },
    body.rows,
  );
  return cors(NextResponse.json(result, { status: result.ok ? 200 : 400 }));
}
