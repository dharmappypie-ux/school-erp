import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { validateAssignment } from "@/lib/homework";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { teacherCanAccessSection } from "@/lib/teacher-sections";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({
  sectionId: z.string().min(1, "Choose a class"),
  subjectId: z.string().min(1, "Choose a subject"),
  title: z.string().trim().min(3, "Give the assignment a title").max(200),
  description: z.string().trim().max(4000).optional(),
  dueOn: z.string().min(1, "Choose a due date"),
  maxMarks: z.union([z.string(), z.number()]).optional(),
});

/**
 * POST /api/mobile/v1/teacher/homework
 *
 * The mobile mirror of the web `createAssignment` action: creates the Homework
 * and opens an ASSIGNED submission row for every active enrollee of the section,
 * so the register is complete from day one.
 */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "homework.manage");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    ));
  }
  const input = parsed.data;

  const db = scopedDb(session.schoolId);
  const maxMarks =
    input.maxMarks != null && `${input.maxMarks}`.trim() !== "" ? Number(input.maxMarks) : null;
  const assignedOn = new Date();
  const dueOn = new Date(input.dueOn);

  const check = validateAssignment({ title: input.title, assignedOn, dueOn, maxMarks });
  if (!check.ok) {
    return cors(NextResponse.json({ error: check.reason ?? "Invalid" }, { status: 400 }));
  }

  const section = await db.section.findUnique({
    where: { id: input.sectionId },
    select: { id: true },
  });
  if (!section) {
    return cors(NextResponse.json({ error: "That class is not in your school." }, { status: 404 }));
  }
  if (!(await teacherCanAccessSection(db, session.staffId, session.permissions, input.sectionId, session.academicYearId))) {
    return cors(NextResponse.json({ error: "That class is not one of yours." }, { status: 403 }));
  }

  const enrolments = await db.enrollment.findMany({
    where: { sectionId: input.sectionId, isActive: true },
    select: { studentId: true },
  });

  const homework = await db.homework.create({
    data: {
      schoolId: session.schoolId,
      sectionId: input.sectionId,
      subjectId: input.subjectId,
      title: input.title,
      description: input.description || null,
      assignedOn,
      dueOn,
      maxMarks,
      authorId: session.staffId ?? null,
      submissions: {
        create: enrolments.map((row) => ({ studentId: row.studentId, status: "ASSIGNED" as const })),
      },
    },
    select: { id: true, title: true },
  });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "homework.create",
    entityType: "Homework",
    entityId: homework.id,
    after: { title: homework.title, students: enrolments.length, via: "mobile" },
  });

  return cors(NextResponse.json({
    ok: true,
    id: homework.id,
    message: `“${homework.title}” set for ${enrolments.length} students.`,
  }));
}
