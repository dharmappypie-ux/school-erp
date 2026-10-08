import { NextResponse } from "next/server";

import { APPLICATION_FLOW, STATUS_LABEL } from "@/lib/admissions";
import { toNumber } from "@/lib/format";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/**
 * GET /api/mobile/v1/admin/admissions/[id]
 *
 * One admission application: full applicant + guardian detail, the event
 * timeline, documents, the stages it can move to next, and — when ACCEPTED —
 * the sections of its class with remaining seats, for the enrol picker. Mirrors
 * the web /admissions/[id] page.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireMobile(req, ["admissions.read", "admissions.manage"]);
  if (guard instanceof NextResponse) return guard;
  const session = guard;
  const { id } = await ctx.params;

  const db = scopedDb(session.schoolId);
  const yearId = session.academicYearId;

  const a = await db.admissionApplication.findUnique({
    where: { id },
    include: {
      classLevel: { select: { id: true, name: true } },
      academicYear: { select: { name: true } },
      student: { select: { id: true, admissionNo: true } },
      documents: { orderBy: { createdAt: "desc" }, select: { id: true, title: true, fileUrl: true, isVerified: true } },
      events: {
        orderBy: { createdAt: "desc" },
        select: { id: true, fromStatus: true, toStatus: true, note: true, createdAt: true },
      },
    },
  });
  if (!a) return cors(NextResponse.json({ error: "Application not found." }, { status: 404 }));

  const sections = yearId && a.status === "ACCEPTED"
    ? await db.section.findMany({
        where: { academicYearId: yearId, classLevelId: a.classLevelId },
        orderBy: { name: "asc" },
        select: {
          id: true, name: true, capacity: true,
          classLevel: { select: { name: true } },
          _count: { select: { enrollments: { where: { isActive: true } } } },
        },
      })
    : [];

  const canManage = guard.permissions.includes("*") ||
    guard.permissions.includes("admissions.manage") || guard.permissions.includes("admissions.*");
  const allowedNext = (APPLICATION_FLOW[a.status] ?? []).filter((s) => s !== "ENROLLED");

  return cors(NextResponse.json({
    id: a.id,
    applicationNo: a.applicationNo,
    name: `${a.firstName} ${a.middleName ?? ""} ${a.lastName ?? ""}`.replace(/\s+/g, " ").trim(),
    status: a.status,
    statusLabel: STATUS_LABEL[a.status],
    classLevel: a.classLevel.name,
    academicYear: a.academicYear.name,
    canManage,
    allowedNext: allowedNext.map((s) => ({ status: s, label: STATUS_LABEL[s] })),
    enrolledStudentId: a.student?.id ?? null,
    enrolledAdmissionNo: a.student?.admissionNo ?? null,
    applicant: {
      dateOfBirth: a.dateOfBirth?.toISOString() ?? null,
      gender: a.gender,
      address: [a.addressLine1, a.city, a.state, a.postalCode].filter(Boolean).join(", ") || null,
      previousSchool: a.previousSchool,
      previousClass: a.previousClass,
      previousPercentage: a.previousPercentage != null ? toNumber(a.previousPercentage) : null,
      score: a.score != null ? toNumber(a.score) : null,
      rank: a.rank,
      testDate: a.testDate?.toISOString() ?? null,
      interviewDate: a.interviewDate?.toISOString() ?? null,
      applicationFeePaid: a.applicationFeePaid,
      rejectionReason: a.rejectionReason,
      source: a.source,
    },
    guardian: {
      name: a.guardianName,
      phone: a.guardianPhone,
      email: a.guardianEmail,
      relationship: a.relationship,
    },
    documents: a.documents.map((d) => ({ id: d.id, title: d.title, url: d.fileUrl, verified: d.isVerified })),
    events: a.events.map((e) => ({
      id: e.id,
      from: e.fromStatus ? STATUS_LABEL[e.fromStatus] : null,
      to: STATUS_LABEL[e.toStatus],
      note: e.note,
      at: e.createdAt.toISOString(),
    })),
    sections: sections.map((s) => ({
      id: s.id,
      name: `${s.classLevel.name} · ${s.name}`,
      seatsLeft: Math.max(0, s.capacity - s._count.enrollments),
      full: s._count.enrollments >= s.capacity,
    })),
  }));
}
