import { NextResponse } from "next/server";

import { toNumber } from "@/lib/format";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb, type ScopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

type Item = {
  title: string;
  subtitle?: string;
  trailing?: string;
  badge?: "good" | "warn" | "danger" | "muted";
};

const cap = (s: string) => (s ? s[0] + s.slice(1).toLowerCase().replace(/_/g, " ") : s);
const shortDate = (d: Date | null | undefined) =>
  d ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(d) : "";
const DAY_ORDER = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];

/**
 * GET /api/mobile/v1/teacher/module/[name]
 *
 * Read surfaces for the teacher app's module screens — scoped to the teacher's
 * StaffMember where the data is personal (their classes, assignments, timetable,
 * leave) and school-wide for shared reads (notices, library, exams, insights).
 */
export async function GET(req: Request, ctx: { params: Promise<{ name: string }> }) {
  // Teaching surface: gate on capabilities only teaching staff/admins hold, so
  // non-teaching staff (e.g. accountant, librarian) who merely have *.read on
  // academics can't read these class-scoped views.
  const guard = await requireMobile(req, [
    "attendance.mark", "marks.enter", "homework.manage", "exams.manage",
  ]);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const { name } = await ctx.params;
  const db = scopedDb(session.schoolId);
  const yearId = session.academicYearId;
  const staffId = session.staffId;

  try {
    const items = await load(name, db, yearId, staffId, session.userId, session.schoolId);
    return cors(NextResponse.json({ title: TITLES[name] ?? cap(name), items, note: items.length === 0 ? "Nothing here yet." : undefined }));
  } catch (e) {
    return cors(NextResponse.json({
      title: TITLES[name] ?? cap(name),
      items: [] as Item[],
      note: "Nothing to show yet.",
      error: process.env.NODE_ENV === "development" ? String(e) : undefined,
    }));
  }
}

const TITLES: Record<string, string> = {
  classes: "My classes", attendance: "Attendance — today", timetable: "My timetable",
  exams: "Examinations", homework: "My homework", reportcards: "Report cards",
  courses: "Courses", quizzes: "Quizzes", library: "Library", leave: "My leave",
  notices: "Notices", messages: "Messages", analytics: "Analytics", aiinsights: "AI insights",
};

async function load(
  name: string, db: ScopedDb, yearId: string | null, staffId: string | null, userId: string, schoolId: string,
): Promise<Item[]> {
  switch (name) {
    case "classes": {
      const owned = staffId
        ? await db.section.findMany({
            where: { classTeacherId: staffId, ...(yearId ? { academicYearId: yearId } : {}) },
            select: { name: true, classLevel: { select: { name: true } }, _count: { select: { enrollments: { where: { isActive: true } } } } },
          })
        : [];
      const subjectAssignments = staffId
        ? await db.classSubject.findMany({
            where: { teacherId: staffId },
            select: { subject: { select: { name: true } }, classLevel: { select: { name: true } } },
          })
        : [];
      const items: Item[] = owned.map((s) => ({
        title: `${s.classLevel.name} · ${s.name}`,
        subtitle: `Class teacher · ${s._count.enrollments} students`,
        trailing: `${s._count.enrollments}`,
        badge: "good",
      }));
      for (const a of subjectAssignments) {
        items.push({ title: `${a.classLevel.name} · ${a.subject.name}`, subtitle: "Subject teacher", badge: "muted" });
      }
      return items;
    }
    case "attendance": {
      const today = new Date();
      const dayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
      const sectionFilter = staffId
        ? { markedById: staffId }
        : {};
      const rows = await db.attendanceRecord.groupBy({
        by: ["status"], where: { date: dayStart, ...sectionFilter }, _count: { _all: true },
      });
      if (rows.length === 0) return [{ title: "No attendance marked today", subtitle: "Mark a class from My classes", badge: "muted" }];
      return rows.map((r) => ({
        title: cap(r.status), trailing: `${r._count._all}`,
        badge: r.status === "PRESENT" ? "good" : r.status === "ABSENT" ? "danger" : "warn",
      }));
    }
    case "timetable": {
      if (!staffId) return [];
      const rows = await db.timetableSlot.findMany({
        where: { teacherId: staffId, ...(yearId ? { academicYearId: yearId } : {}) },
        select: {
          dayOfWeek: true, roomNumber: true,
          period: { select: { startTime: true, endTime: true, sequence: true } },
          section: { select: { name: true, classLevel: { select: { name: true } } } },
          subject: { select: { name: true } },
        },
      });
      rows.sort((a, b) =>
        (DAY_ORDER.indexOf(a.dayOfWeek) - DAY_ORDER.indexOf(b.dayOfWeek)) ||
        (a.period.sequence - b.period.sequence));
      return rows.map((r) => ({
        title: `${cap(r.dayOfWeek)} · ${r.period.startTime}–${r.period.endTime}`,
        subtitle: `${r.section.classLevel.name} · ${r.section.name}${r.subject ? ` · ${r.subject.name}` : ""}`,
        trailing: r.roomNumber ?? "", badge: "muted",
      }));
    }
    case "exams": {
      const rows = await db.exam.findMany({
        orderBy: { createdAt: "desc" }, take: 100,
        select: { name: true, status: true, classLevel: { select: { name: true } }, subject: { select: { name: true } } },
      });
      return rows.map((r) => ({
        title: r.name, subtitle: `${r.classLevel.name} · ${r.subject.name}`,
        trailing: cap(r.status), badge: r.status === "PUBLISHED" || r.status === "COMPLETED" ? "good" : "muted",
      }));
    }
    case "homework": {
      const rows = await db.homework.findMany({
        where: staffId ? { authorId: staffId } : {},
        orderBy: { assignedOn: "desc" }, take: 100,
        select: {
          title: true, dueOn: true, subject: { select: { name: true } },
          section: { select: { name: true, classLevel: { select: { name: true } } } },
          _count: { select: { submissions: true } },
        },
      });
      return rows.map((r) => ({
        title: r.title,
        subtitle: `${r.section.classLevel.name} · ${r.section.name} · ${r.subject.name}`,
        trailing: `Due ${shortDate(r.dueOn)}`, badge: "muted",
      }));
    }
    case "reportcards": {
      const rows = await db.reportCard.findMany({
        where: { isPublished: true }, orderBy: { createdAt: "desc" }, take: 100,
        select: {
          grade: true, percentage: true,
          student: { select: { firstName: true, lastName: true } },
          term: { select: { name: true } },
        },
      });
      return rows.map((r) => ({
        title: `${r.student.firstName} ${r.student.lastName ?? ""}`.trim(),
        subtitle: `${r.term.name}${r.percentage != null ? ` · ${toNumber(r.percentage)}%` : ""}`,
        trailing: r.grade ?? "", badge: "good",
      }));
    }
    case "courses": {
      const rows = await db.course.findMany({
        orderBy: { createdAt: "desc" }, take: 100,
        select: { title: true, status: true, subject: { select: { name: true } } },
      });
      return rows.map((r) => ({ title: r.title, subtitle: r.subject?.name ?? "—", trailing: cap(r.status), badge: r.status === "PUBLISHED" ? "good" : "muted" }));
    }
    case "quizzes": {
      const rows = await db.quiz.findMany({
        orderBy: { createdAt: "desc" }, take: 100,
        select: { title: true, status: true, subject: { select: { name: true } } },
      });
      return rows.map((r) => ({ title: r.title, subtitle: r.subject?.name ?? "—", trailing: cap(r.status), badge: r.status === "PUBLISHED" ? "good" : "muted" }));
    }
    case "library": {
      const rows = await db.book.findMany({ orderBy: { title: "asc" }, take: 100, select: { title: true, author: true, category: true } });
      return rows.map((r) => ({ title: r.title, subtitle: r.author ?? "—", trailing: r.category ?? "", badge: "muted" }));
    }
    case "leave": {
      if (!staffId) return [];
      const rows = await db.leaveRequest.findMany({
        where: { staffId }, orderBy: { createdAt: "desc" }, take: 100,
        select: { fromDate: true, toDate: true, status: true, days: true, leaveType: { select: { name: true } } },
      });
      return rows.map((r) => ({
        title: r.leaveType?.name ?? "Leave",
        subtitle: `${shortDate(r.fromDate)}–${shortDate(r.toDate)} · ${toNumber(r.days)} days`,
        trailing: cap(r.status),
        badge: r.status === "APPROVED" ? "good" : r.status === "REJECTED" ? "danger" : "warn",
      }));
    }
    case "notices": {
      const rows = await db.notice.findMany({
        where: { publishedAt: { not: null } }, orderBy: { publishedAt: "desc" }, take: 100,
        select: { title: true, body: true, isPinned: true },
      });
      return rows.map((r) => ({
        title: r.title, subtitle: r.body.length > 70 ? `${r.body.slice(0, 70)}…` : r.body,
        trailing: r.isPinned ? "Pinned" : "", badge: "muted",
      }));
    }
    case "messages": {
      const rows = await db.messageThread.findMany({
        where: { members: { some: { userId } } }, orderBy: { lastMessageAt: "desc" }, take: 100,
        select: { subject: true, kind: true, lastMessageAt: true, _count: { select: { messages: true } } },
      });
      return rows.map((r) => ({
        title: r.subject ?? cap(r.kind), subtitle: `${r._count.messages} messages`,
        trailing: shortDate(r.lastMessageAt), badge: "muted",
      }));
    }
    case "analytics": {
      const sections = staffId ? await db.section.count({ where: { classTeacherId: staffId, ...(yearId ? { academicYearId: yearId } : {}) } }) : 0;
      const homework = await db.homework.count({ where: staffId ? { authorId: staffId } : {} });
      const toGrade = await db.homeworkSubmission.count({
        where: {
          status: { in: ["SUBMITTED", "LATE"] },
          homework: staffId ? { authorId: staffId, schoolId } : { schoolId },
        },
      }).catch(() => 0);
      return [
        { title: "My classes", trailing: `${sections}`, badge: "good" },
        { title: "Assignments set", trailing: `${homework}`, badge: "muted" },
        { title: "Submissions to grade", trailing: `${toGrade}`, badge: "warn" },
      ];
    }
    case "aiinsights": {
      const rows = await db.aiInsight.findMany({
        where: { isDismissed: false }, orderBy: { createdAt: "desc" }, take: 100,
        select: { title: true, body: true, severity: true },
      });
      if (rows.length === 0) return [{ title: "No active insights", subtitle: "Insights appear here as they're generated", badge: "muted" }];
      return rows.map((r) => ({
        title: r.title, subtitle: r.body.length > 70 ? `${r.body.slice(0, 70)}…` : r.body,
        trailing: cap(r.severity),
        badge: r.severity === "HIGH" || r.severity === "CRITICAL" ? "danger" : r.severity === "MEDIUM" ? "warn" : "muted",
      }));
    }
    default:
      return [];
  }
}
