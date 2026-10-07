import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { dueDateFor } from "@/lib/library";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({
  copyId: z.string().min(1, "Choose a copy"),
  studentId: z.string().trim().optional(),
  staffId: z.string().trim().optional(),
}).refine((v) => v.studentId || v.staffId, { message: "Pick a borrower" });

/** POST /api/mobile/v1/admin/library/issue — lend a copy to a student (or staff). */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "library.circulate");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 }));
  }

  const db = scopedDb(session.schoolId);
  const copy = await db.bookCopy.findFirst({
    where: { id: parsed.data.copyId, book: { schoolId: session.schoolId } },
    select: { id: true, status: true, accessionNo: true, book: { select: { title: true } } },
  });
  if (!copy) return cors(NextResponse.json({ error: "Copy not found in your school." }, { status: 404 }));
  if (copy.status !== "AVAILABLE") {
    return cors(NextResponse.json({ error: `${copy.accessionNo} is currently ${copy.status.toLowerCase()}.` }, { status: 409 }));
  }

  const studentId = parsed.data.studentId || null;
  const staffId = parsed.data.staffId || null;
  if (studentId) {
    const student = await db.student.findUnique({ where: { id: studentId }, select: { id: true } });
    if (!student) return cors(NextResponse.json({ error: "Student not found in your school." }, { status: 404 }));
  } else if (staffId) {
    const staff = await db.staffMember.findUnique({ where: { id: staffId }, select: { id: true } });
    if (!staff) return cors(NextResponse.json({ error: "Staff not found in your school." }, { status: 404 }));
  }

  const dueOn = dueDateFor(new Date());
  await db.$transaction([
    db.bookIssue.create({
      data: { schoolId: session.schoolId, copyId: copy.id, studentId, staffId, dueOn, issuedBy: session.staffId ?? null },
    }),
    db.bookCopy.update({ where: { id: copy.id }, data: { status: "ISSUED" } }),
  ]);

  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: "library.issue", entityType: "BookCopy", entityId: copy.id,
    after: { title: copy.book.title, studentId, staffId, via: "mobile" },
  });

  return cors(NextResponse.json({
    ok: true,
    message: `“${copy.book.title}” (${copy.accessionNo}) issued, due ${dueOn.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}.`,
  }));
}
