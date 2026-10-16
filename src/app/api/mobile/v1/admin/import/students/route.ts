import { NextResponse } from "next/server";

import {
  commitStudentImport,
  gridFromUpload,
  previewStudentImport,
} from "@/lib/import-run";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { buildTemplateCsv, type ParsedStudent } from "@/lib/student-import";

export { OPTIONS } from "@/lib/mobile-auth";

/**
 * GET /api/mobile/v1/admin/import/students
 *
 * The column template, so the app can show (and share) the exact headers the
 * importer matches instead of describing them from memory.
 */
export async function GET(req: Request) {
  const guard = await requireMobile(req, "students.create");
  if (guard instanceof NextResponse) return guard;

  return cors(NextResponse.json({ template: buildTemplateCsv() }));
}

/**
 * POST /api/mobile/v1/admin/import/students
 *
 * Two steps, as on the web:
 *   • multipart with a `file` → a preview. Nothing is written.
 *   • JSON `{ "rows": [...] }` (the preview's rows) → the commit.
 *
 * The commit re-validates everything from scratch, so a preview that has gone
 * stale (someone else admitted a student with one of these numbers) is refused
 * rather than half-applied.
 */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "students.create");
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
    const preview = await previewStudentImport(
      session.schoolId, session.academicYearId, read.grid,
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

  const result = await commitStudentImport(
    {
      schoolId: session.schoolId,
      userId: session.userId,
      yearId: session.academicYearId,
      plan: session.plan,
    },
    body.rows as ParsedStudent[],
  );
  return cors(NextResponse.json(result, { status: result.ok ? 200 : 400 }));
}
