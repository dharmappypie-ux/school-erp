import { NextResponse } from "next/server";

import { toNumber } from "@/lib/format";
import {
  cors,
  passwordChangeRequired,
  resolveMobileSession,
} from "@/lib/mobile-auth";
import { scopedDb, type ScopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

type Item = {
  title: string;
  subtitle?: string;
  trailing?: string;
  badge?: "good" | "warn" | "danger" | "muted";
};

const cap = (s: string) => (s ? s[0] + s.slice(1).toLowerCase().replace(/_/g, " ") : s);
const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
const shortDate = (d: Date | null | undefined) =>
  d ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(d) : "";
const DAY_ORDER = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];

const TITLES: Record<string, string> = {
  timetable: "Timetable", notices: "Notices", messages: "Messages", quizzes: "Quizzes",
  library: "Library", transport: "Transport", reportcards: "Report cards", fees: "Fees",
  results: "Results", homework: "Homework", attendance: "Attendance",
};

/**
 * GET /api/mobile/v1/parent/module/[name]
 *
 * Read surfaces for the parent app's extra module screens. Everything is scoped
 * to the signed-in guardian's child (or the student's own account), mirroring
 * the snapshot endpoint's access rules — no permission beyond a valid session is
 * required because a guardian only ever sees their own child's data.
 */
export async function GET(req: Request, ctx: { params: Promise<{ name: string }> }) {
  const session = await resolveMobileSession(req);
  if (!session) return cors(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  // A temporary password blocks the API, exactly as it blocks the web app.
  if (session.mustChangePassword) return passwordChangeRequired();

  const { name } = await ctx.params;
  const db = scopedDb(session.schoolId);
  const yearId = session.academicYearId;

  // Resolve the child this account is about.
  let studentId = session.studentId;
  if (!studentId && session.guardianId) {
    const link = await db.studentGuardian.findFirst({
      where: { guardianId: session.guardianId },
      orderBy: { isPrimary: "desc" },
      select: { studentId: true },
    });
    studentId = link?.studentId ?? null;
  }

  const title = TITLES[name] ?? cap(name);
  try {
    const items = await load(name, db, yearId, studentId, session.userId);
    return cors(NextResponse.json({ title, items, note: items.length === 0 ? "Nothing here yet." : undefined }));
  } catch (e) {
    return cors(NextResponse.json({
      title, items: [] as Item[], note: "Nothing to show yet.",
      error: process.env.NODE_ENV === "development" ? String(e) : undefined,
    }));
  }
}

async function load(
  name: string, db: ScopedDb, yearId: string | null, studentId: string | null, userId: string,
): Promise<Item[]> {
  // Shared reads don't need the child.
  if (name === "library") {
    const rows = await db.book.findMany({ orderBy: { title: "asc" }, take: 100, select: { title: true, author: true, category: true } });
    return rows.map((r) => ({ title: r.title, subtitle: r.author ?? "—", trailing: r.category ?? "", badge: "muted" }));
  }
  if (name === "notices") {
    const rows = await db.notice.findMany({
      where: { publishedAt: { not: null }, audience: { hasSome: ["ALL", "PARENTS", "STUDENTS"] } },
      orderBy: { publishedAt: "desc" }, take: 100,
      select: { title: true, body: true, isPinned: true },
    });
    return rows.map((r) => ({ title: r.title, subtitle: r.body.length > 70 ? `${r.body.slice(0, 70)}…` : r.body, trailing: r.isPinned ? "Pinned" : "", badge: "muted" }));
  }
  if (name === "messages") {
    const rows = await db.messageThread.findMany({
      where: { members: { some: { userId } } }, orderBy: { lastMessageAt: "desc" }, take: 100,
      select: { subject: true, kind: true, lastMessageAt: true, _count: { select: { messages: true } } },
    });
    return rows.map((r) => ({ title: r.subject ?? cap(r.kind), subtitle: `${r._count.messages} messages`, trailing: shortDate(r.lastMessageAt), badge: "muted" }));
  }

  if (!studentId) return [];

  // Child's current section / class.
  const enrollment = await db.enrollment.findFirst({
    where: { studentId, isActive: true, ...(yearId ? { academicYearId: yearId } : {}) },
    select: { sectionId: true, section: { select: { classLevelId: true } } },
  });
  const sectionId = enrollment?.sectionId ?? null;
  const classLevelId = enrollment?.section?.classLevelId ?? null;

  switch (name) {
    case "timetable": {
      if (!sectionId) return [];
      const rows = await db.timetableSlot.findMany({
        where: { sectionId },
        select: {
          dayOfWeek: true, roomNumber: true,
          period: { select: { startTime: true, endTime: true, sequence: true } },
          subject: { select: { name: true } },
        },
      });
      rows.sort((a, b) => (DAY_ORDER.indexOf(a.dayOfWeek) - DAY_ORDER.indexOf(b.dayOfWeek)) || (a.period.sequence - b.period.sequence));
      return rows.map((r) => ({
        title: `${cap(r.dayOfWeek)} · ${r.period.startTime}–${r.period.endTime}`,
        subtitle: r.subject?.name ?? "—", trailing: r.roomNumber ?? "", badge: "muted",
      }));
    }
    case "fees": {
      const rows = await db.invoice.findMany({
        where: { studentId, status: { notIn: ["CANCELLED", "DRAFT"] } },
        orderBy: { dueDate: "asc" }, take: 100,
        select: { invoiceNo: true, period: true, total: true, amountDue: true, dueDate: true, status: true },
      });
      return rows.map((r) => ({
        title: r.period ?? r.invoiceNo,
        subtitle: `${inr(toNumber(r.total))} · due ${shortDate(r.dueDate)}`,
        trailing: toNumber(r.amountDue) > 0 ? `Due ${inr(toNumber(r.amountDue))}` : "Paid",
        badge: r.status === "PAID" ? "good" : r.status === "OVERDUE" ? "danger" : "warn",
      }));
    }
    case "results": {
      const rows = await db.markEntry.findMany({
        where: { studentId }, take: 100,
        select: {
          marksObtained: true, grade: true, isAbsent: true,
          exam: { select: { name: true, maxMarks: true, subject: { select: { name: true } } } },
        },
      });
      return rows.map((r) => ({
        title: r.exam.subject.name,
        subtitle: `${r.exam.name}${r.isAbsent ? " · absent" : ` · ${toNumber(r.marksObtained)}/${toNumber(r.exam.maxMarks)}`}`,
        trailing: r.grade ?? "", badge: "muted",
      }));
    }
    case "reportcards": {
      const rows = await db.reportCard.findMany({
        where: { studentId, isPublished: true }, orderBy: { createdAt: "desc" }, take: 50,
        select: { grade: true, percentage: true, rank: true, term: { select: { name: true } } },
      });
      return rows.map((r) => ({
        title: r.term.name,
        subtitle: `${r.percentage != null ? `${toNumber(r.percentage)}%` : "—"}${r.rank != null ? ` · rank ${r.rank}` : ""}`,
        trailing: r.grade ?? "", badge: "good",
      }));
    }
    case "homework": {
      const rows = await db.homeworkSubmission.findMany({
        where: { studentId }, orderBy: { homework: { dueOn: "desc" } }, take: 100,
        select: {
          status: true,
          homework: { select: { title: true, dueOn: true, subject: { select: { name: true } } } },
        },
      });
      return rows.map((r) => ({
        title: r.homework.title,
        subtitle: `${r.homework.subject.name} · due ${shortDate(r.homework.dueOn)}`,
        trailing: cap(r.status),
        badge: r.status === "GRADED" || r.status === "SUBMITTED" ? "good" : r.status === "MISSING" ? "danger" : "muted",
      }));
    }
    case "attendance": {
      const rows = await db.attendanceRecord.findMany({
        where: { studentId }, orderBy: { date: "desc" }, take: 60,
        select: { date: true, status: true },
      });
      return rows.map((r) => ({
        title: new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short" }).format(r.date),
        trailing: cap(r.status),
        badge: r.status === "PRESENT" ? "good" : r.status === "ABSENT" ? "danger" : r.status === "HOLIDAY" ? "muted" : "warn",
      }));
    }
    case "quizzes": {
      const rows = await db.quiz.findMany({
        where: { status: "PUBLISHED", ...(classLevelId ? { classLevelId } : {}) },
        orderBy: { publishedAt: "desc" }, take: 100,
        select: { title: true, subject: { select: { name: true } }, timeLimitMinutes: true },
      });
      return rows.map((r) => ({
        title: r.title, subtitle: r.subject?.name ?? "—",
        trailing: r.timeLimitMinutes != null ? `${r.timeLimitMinutes} min` : "", badge: "good",
      }));
    }
    case "transport": {
      const rows = await db.transportAssignment.findMany({
        where: { studentId, isActive: true }, take: 10,
        select: { direction: true, route: { select: { name: true, startPoint: true, endPoint: true } } },
      });
      if (rows.length === 0) return [{ title: "No transport assigned", subtitle: "Your child isn't on a bus route", badge: "muted" }];
      return rows.map((r) => ({
        title: r.route.name,
        subtitle: [r.route.startPoint, r.route.endPoint].filter(Boolean).join(" → "),
        trailing: cap(r.direction), badge: "good",
      }));
    }
    default:
      return [];
  }
}
