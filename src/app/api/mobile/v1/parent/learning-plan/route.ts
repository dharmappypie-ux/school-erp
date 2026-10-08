import { NextResponse } from "next/server";

import { classLevelForStudent, gatherCatalog, gatherLearningSignals } from "@/lib/ai/learning";
import { buildLearningPlan } from "@/lib/ai/recommend";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { resolveStudentId } from "@/lib/mobile-portal";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/** Deterministic study tips, drawn from the plan's own recommended actions. */
function fallbackTips(recommendations: { action: string }[]): string[] {
  const tips = recommendations.map((r) => r.action);
  if (tips.length === 0) {
    return ["You're doing well across the board — keep up your routine and stay curious!"];
  }
  return tips.slice(0, 5);
}

/**
 * GET /api/mobile/v1/parent/learning-plan
 *
 * The child's personalized learning plan: headline, strengths, prioritized
 * recommendations (with linked courses/quizzes) and study tips — the mobile
 * mirror of /portal/learning-plan. The plan is a deterministic rules engine; the
 * tips are its own actions (the web's optional AI rewrite is not mirrored here).
 */
export async function GET(req: Request) {
  const guard = await requireMobile(req);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const db = scopedDb(session.schoolId);
  const yearId = session.academicYearId;
  const studentId = await resolveStudentId(db, session.studentId, session.guardianId);
  if (!studentId) return cors(NextResponse.json({ hasData: false }));

  const student = await db.student.findUnique({
    where: { id: studentId },
    select: { firstName: true, lastName: true },
  });
  const name = student ? `${student.firstName} ${student.lastName ?? ""}`.trim() : "Student";

  const classLevelId = await classLevelForStudent(db, studentId, yearId);
  const [signals, catalog] = await Promise.all([
    gatherLearningSignals(db, { id: studentId, name }, yearId, session.schoolId),
    gatherCatalog(db, classLevelId),
  ]);
  const plan = buildLearningPlan(signals, catalog.courses, catalog.quizzes);

  const hasData =
    signals.subjects.length > 0 || signals.quizzesTaken > 0 || signals.attendanceRate !== null;

  return cors(NextResponse.json({
    hasData,
    studentName: name,
    headline: plan.headline,
    strengths: plan.strengths,
    recommendations: plan.recommendations.map((r) => ({
      key: r.key,
      focus: r.focus,
      reason: r.reason,
      action: r.action,
      priority: r.priority,
      courseId: r.courseId ?? null,
      courseTitle: r.courseTitle ?? null,
      quizId: r.quizId ?? null,
      quizTitle: r.quizTitle ?? null,
    })),
    tips: fallbackTips(plan.recommendations),
  }));
}
