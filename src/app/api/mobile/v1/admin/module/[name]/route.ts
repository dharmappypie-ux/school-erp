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

const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);

const shortDate = (d: Date | null | undefined) =>
  d ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(d) : "";

const cap = (s: string) =>
  s ? s[0] + s.slice(1).toLowerCase().replace(/_/g, " ") : s;

/**
 * GET /api/mobile/v1/admin/module/[name]
 *
 * One generic reader behind every admin "module" screen. Each case is a small,
 * tenant-scoped query normalised into `{ title, items[] }`, so the mobile app
 * can surface every service the web console has without a bespoke endpoint per
 * module. Unknown or failing modules return an empty list rather than erroring.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ name: string }> },
) {
  const guard = await requireMobile(req, [
    "analytics.read",
    "students.read",
    "staff.read",
    "school.read",
    "settings.read",
  ]);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const { name } = await ctx.params;
  const db = scopedDb(session.schoolId);
  const yearId = session.academicYearId;

  try {
    const result = await load(name, db, yearId);
    return cors(NextResponse.json(result));
  } catch (e) {
    return cors(NextResponse.json({
      title: titleFor(name),
      items: [] as Item[],
      note: "Nothing to show yet.",
      // Surface the reason only in dev logs; keep the client message clean.
      error: process.env.NODE_ENV === "development" ? String(e) : undefined,
    }));
  }
}

function titleFor(name: string): string {
  return TITLES[name] ?? cap(name);
}

const TITLES: Record<string, string> = {
  admissions: "Admissions",
  classes: "Classes & subjects",
  subjects: "Subjects",
  attendance: "Attendance — today",
  exams: "Examinations",
  homework: "Homework",
  timetable: "Timetable",
  reportcards: "Report cards",
  courses: "Courses",
  quizzes: "Quizzes",
  fees: "Fees — invoices",
  expenses: "Expenses",
  payroll: "Payroll",
  transport: "Transport",
  library: "Library",
  hostel: "Hostel",
  inventory: "Inventory",
  leave: "Leave requests",
  notices: "Notices",
  messages: "Messages",
  broadcasts: "Broadcasts",
  analytics: "Analytics",
  aiinsights: "AI insights",
  reports: "Reports",
  users: "Users",
  roles: "Roles & permissions",
};

async function load(
  name: string,
  db: ScopedDb,
  yearId: string | null,
): Promise<{ title: string; items: Item[]; note?: string }> {
  const title = titleFor(name);
  let items: Item[] = [];

  switch (name) {
    case "students": {
      const rows = await db.student.findMany({
        where: { status: "ACTIVE" }, orderBy: { admissionNo: "desc" }, take: 100,
        select: {
          firstName: true, lastName: true, admissionNo: true,
          enrollments: {
            where: yearId ? { academicYearId: yearId } : undefined, take: 1,
            select: { section: { select: { name: true, classLevel: { select: { name: true } } } } },
          },
        },
      });
      items = rows.map((r) => {
        const sec = r.enrollments[0]?.section;
        return {
          title: `${r.firstName} ${r.lastName ?? ""}`.trim(),
          subtitle: sec ? `${sec.classLevel.name} · ${sec.name}` : "—",
          trailing: r.admissionNo, badge: "good" as const,
        };
      });
      break;
    }
    case "staff": {
      const rows = await db.staffMember.findMany({
        where: { employmentStatus: "ACTIVE" }, orderBy: { employeeId: "desc" }, take: 100,
        select: {
          firstName: true, lastName: true, employeeId: true, staffType: true,
          user: { select: { roles: { select: { name: true } } } },
        },
      });
      items = rows.map((r) => ({
        title: `${r.firstName} ${r.lastName ?? ""}`.trim(),
        subtitle: `${r.user?.roles[0]?.name ?? cap(r.staffType)} · ${r.employeeId}`,
        trailing: cap(r.staffType), badge: "good" as const,
      }));
      break;
    }
    case "admissions": {
      const rows = await db.admissionApplication.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          firstName: true, lastName: true, applicationNo: true, status: true,
          classLevel: { select: { name: true } },
        },
      });
      items = rows.map((r) => ({
        title: `${r.firstName} ${r.lastName ?? ""}`.trim(),
        subtitle: `${r.applicationNo} · ${r.classLevel?.name ?? "—"}`,
        trailing: cap(r.status),
        badge: r.status === "ENROLLED" || r.status === "ACCEPTED" || r.status === "OFFERED" ? "good"
          : r.status === "REJECTED" || r.status === "WITHDRAWN" ? "danger" : "muted",
      }));
      break;
    }
    case "classes": {
      const rows = await db.section.findMany({
        where: yearId ? { academicYearId: yearId } : {},
        orderBy: [{ classLevel: { numericOrder: "asc" } }, { name: "asc" }],
        take: 100,
        select: {
          name: true, capacity: true, roomNumber: true,
          classLevel: { select: { name: true } },
          _count: { select: { enrollments: { where: { isActive: true } } } },
        },
      });
      items = rows.map((r) => ({
        title: `${r.classLevel.name} · ${r.name}`,
        subtitle: `${r._count.enrollments}/${r.capacity} students${r.roomNumber ? ` · Room ${r.roomNumber}` : ""}`,
        trailing: `${r._count.enrollments}`,
        badge: r._count.enrollments >= r.capacity ? "warn" : "good",
      }));
      break;
    }
    case "subjects": {
      const rows = await db.subject.findMany({
        orderBy: { name: "asc" }, take: 100,
        select: { name: true, code: true, isElective: true },
      });
      items = rows.map((r) => ({
        title: r.name,
        subtitle: r.code,
        trailing: r.isElective ? "Elective" : "Core",
        badge: "muted",
      }));
      break;
    }
    case "attendance": {
      const today = new Date();
      const dayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
      const rows = await db.attendanceRecord.groupBy({
        by: ["status"], where: { date: dayStart }, _count: { _all: true },
      });
      if (rows.length === 0) {
        items = [{ title: "No attendance marked today", subtitle: "Marks appear here as classes submit", badge: "muted" }];
      } else {
        items = rows.map((r) => ({
          title: cap(r.status),
          trailing: `${r._count._all}`,
          badge: r.status === "PRESENT" ? "good" : r.status === "ABSENT" ? "danger" : "warn",
        }));
      }
      break;
    }
    case "exams": {
      const rows = await db.exam.findMany({
        orderBy: { createdAt: "desc" }, take: 100,
        select: {
          name: true, status: true,
          classLevel: { select: { name: true } }, subject: { select: { name: true } },
        },
      });
      items = rows.map((r) => ({
        title: r.name,
        subtitle: `${r.classLevel.name} · ${r.subject.name}`,
        trailing: cap(r.status),
        badge: r.status === "PUBLISHED" || r.status === "COMPLETED" ? "good" : "muted",
      }));
      break;
    }
    case "homework": {
      const rows = await db.homework.findMany({
        orderBy: { assignedOn: "desc" }, take: 100,
        select: {
          title: true, dueOn: true,
          subject: { select: { name: true } },
          section: { select: { name: true, classLevel: { select: { name: true } } } },
          _count: { select: { submissions: true } },
        },
      });
      items = rows.map((r) => ({
        title: r.title,
        subtitle: `${r.section.classLevel.name} · ${r.section.name} · ${r.subject.name}`,
        trailing: `Due ${shortDate(r.dueOn)}`,
        badge: "muted",
      }));
      break;
    }
    case "courses": {
      const rows = await db.course.findMany({
        orderBy: { createdAt: "desc" }, take: 100,
        select: { title: true, status: true, subject: { select: { name: true } } },
      });
      items = rows.map((r) => ({
        title: r.title, subtitle: r.subject?.name ?? "—",
        trailing: cap(r.status), badge: r.status === "PUBLISHED" ? "good" : "muted",
      }));
      break;
    }
    case "quizzes": {
      const rows = await db.quiz.findMany({
        orderBy: { createdAt: "desc" }, take: 100,
        select: { title: true, status: true, subject: { select: { name: true } } },
      });
      items = rows.map((r) => ({
        title: r.title, subtitle: r.subject?.name ?? "—",
        trailing: cap(r.status), badge: r.status === "PUBLISHED" ? "good" : "muted",
      }));
      break;
    }
    case "fees": {
      const rows = await db.invoice.findMany({
        where: { status: { notIn: ["CANCELLED", "DRAFT"] } },
        orderBy: { dueDate: "asc" }, take: 100,
        select: {
          invoiceNo: true, period: true, total: true, amountDue: true, status: true,
          student: { select: { firstName: true, lastName: true } },
        },
      });
      items = rows.map((r) => ({
        title: `${r.student.firstName} ${r.student.lastName ?? ""}`.trim(),
        subtitle: `${r.period ?? r.invoiceNo} · ${inr(toNumber(r.total))}`,
        trailing: toNumber(r.amountDue) > 0 ? `Due ${inr(toNumber(r.amountDue))}` : "Paid",
        badge: r.status === "PAID" ? "good" : r.status === "OVERDUE" ? "danger" : "warn",
      }));
      break;
    }
    case "expenses": {
      const rows = await db.expense.findMany({
        orderBy: { paidAt: "desc" }, take: 100,
        select: { category: true, voucherNo: true, paidTo: true, amount: true, paidAt: true },
      });
      items = rows.map((r) => ({
        title: r.category,
        subtitle: `${r.voucherNo}${r.paidTo ? ` · ${r.paidTo}` : ""} · ${shortDate(r.paidAt)}`,
        trailing: inr(toNumber(r.amount)), badge: "muted",
      }));
      break;
    }
    case "payroll": {
      const rows = await db.payslip.findMany({
        orderBy: [{ year: "desc" }, { month: "desc" }], take: 100,
        select: {
          month: true, year: true, netPay: true, status: true,
          staff: { select: { firstName: true, lastName: true } },
        },
      });
      items = rows.map((r) => ({
        title: `${r.staff.firstName} ${r.staff.lastName ?? ""}`.trim(),
        subtitle: `${r.month}/${r.year} · ${r.status}`,
        trailing: inr(toNumber(r.netPay)),
        badge: r.status === "PAID" ? "good" : "muted",
      }));
      break;
    }
    case "transport": {
      const rows = await db.vehicle.findMany({
        orderBy: { registrationNo: "asc" }, take: 100,
        select: { registrationNo: true, vehicleType: true, driverName: true, capacity: true, isActive: true },
      });
      items = rows.map((r) => ({
        title: r.registrationNo,
        subtitle: `${cap(r.vehicleType)}${r.driverName ? ` · ${r.driverName}` : ""}`,
        trailing: `${r.capacity} seats`,
        badge: r.isActive ? "good" : "muted",
      }));
      break;
    }
    case "library": {
      const rows = await db.book.findMany({
        orderBy: { title: "asc" }, take: 100,
        select: { title: true, author: true, category: true },
      });
      items = rows.map((r) => ({
        title: r.title, subtitle: r.author ?? "—",
        trailing: r.category ?? "", badge: "muted",
      }));
      break;
    }
    case "hostel": {
      const rows = await db.hostel.findMany({
        orderBy: { name: "asc" }, take: 100,
        select: { name: true, type: true, capacity: true },
      });
      items = rows.map((r) => ({
        title: r.name, subtitle: cap(r.type),
        trailing: `${r.capacity} beds`, badge: "muted",
      }));
      break;
    }
    case "inventory": {
      const rows = await db.inventoryItem.findMany({
        orderBy: { name: "asc" }, take: 100,
        select: { name: true, quantity: true, unit: true, reorderLevel: true },
      });
      items = rows.map((r) => ({
        title: r.name,
        subtitle: `${r.quantity} ${r.unit}`,
        trailing: r.quantity <= r.reorderLevel ? "Low stock" : "In stock",
        badge: r.quantity <= r.reorderLevel ? "danger" : "good",
      }));
      break;
    }
    case "leave": {
      const rows = await db.leaveRequest.findMany({
        orderBy: { createdAt: "desc" }, take: 100,
        select: {
          fromDate: true, toDate: true, status: true, days: true,
          staff: { select: { firstName: true, lastName: true } },
        },
      });
      items = rows.map((r) => ({
        title: `${r.staff.firstName} ${r.staff.lastName ?? ""}`.trim(),
        subtitle: `${shortDate(r.fromDate)}–${shortDate(r.toDate)} · ${toNumber(r.days)} days`,
        trailing: cap(r.status),
        badge: r.status === "APPROVED" ? "good" : r.status === "REJECTED" ? "danger" : "warn",
      }));
      break;
    }
    case "notices": {
      const rows = await db.notice.findMany({
        orderBy: { createdAt: "desc" }, take: 100,
        select: { title: true, body: true, publishedAt: true, isPinned: true },
      });
      items = rows.map((r) => ({
        title: r.title,
        subtitle: r.body.length > 70 ? `${r.body.slice(0, 70)}…` : r.body,
        trailing: r.publishedAt ? "Published" : "Draft",
        badge: r.publishedAt ? "good" : "muted",
      }));
      break;
    }
    case "messages": {
      const rows = await db.messageThread.findMany({
        orderBy: { lastMessageAt: "desc" }, take: 100,
        select: {
          subject: true, kind: true, lastMessageAt: true,
          _count: { select: { members: true, messages: true } },
        },
      });
      items = rows.map((r) => ({
        title: r.subject ?? cap(r.kind),
        subtitle: `${r._count.members} people · ${r._count.messages} messages`,
        trailing: shortDate(r.lastMessageAt), badge: "muted",
      }));
      break;
    }
    case "broadcasts": {
      const rows = await db.notificationLog.findMany({
        orderBy: { createdAt: "desc" }, take: 100,
        select: { subject: true, channel: true, recipient: true, status: true, createdAt: true },
      });
      items = rows.map((r) => ({
        title: r.subject ?? cap(r.channel),
        subtitle: `${r.recipient} · ${shortDate(r.createdAt)}`,
        trailing: cap(r.status),
        badge: r.status === "SENT" || r.status === "DELIVERED" ? "good"
          : r.status === "FAILED" ? "danger" : "muted",
      }));
      break;
    }
    case "analytics": {
      const [students, staff, sections, feeAgg] = await Promise.all([
        db.student.count({ where: { status: "ACTIVE" } }),
        db.staffMember.count({ where: { employmentStatus: "ACTIVE" } }),
        db.section.count({ where: yearId ? { academicYearId: yearId } : {} }),
        db.invoice.aggregate({
          where: { status: { notIn: ["CANCELLED", "DRAFT"] } },
          _sum: { amountPaid: true, amountDue: true },
        }),
      ]);
      items = [
        { title: "Active students", trailing: `${students}`, badge: "good" },
        { title: "Active staff", trailing: `${staff}`, badge: "good" },
        { title: "Sections", trailing: `${sections}`, badge: "muted" },
        { title: "Fees collected", trailing: inr(toNumber(feeAgg._sum.amountPaid ?? 0)), badge: "good" },
        { title: "Fees outstanding", trailing: inr(toNumber(feeAgg._sum.amountDue ?? 0)), badge: "warn" },
      ];
      break;
    }
    case "aiinsights": {
      const rows = await db.aiInsight.findMany({
        where: { isDismissed: false }, orderBy: { createdAt: "desc" }, take: 100,
        select: { title: true, body: true, severity: true },
      });
      items = rows.map((r) => ({
        title: r.title,
        subtitle: r.body.length > 70 ? `${r.body.slice(0, 70)}…` : r.body,
        trailing: cap(r.severity),
        badge: r.severity === "HIGH" || r.severity === "CRITICAL" ? "danger"
          : r.severity === "MEDIUM" ? "warn" : "muted",
      }));
      if (items.length === 0) items = [{ title: "No active insights", subtitle: "AI insights appear here as they're generated", badge: "muted" }];
      break;
    }
    case "reports": {
      const rows = await db.savedReport.findMany({
        orderBy: { createdAt: "desc" }, take: 100,
        select: { name: true, description: true, isShared: true },
      });
      items = rows.map((r) => ({
        title: r.name, subtitle: r.description ?? "—",
        trailing: r.isShared ? "Shared" : "Private", badge: "muted",
      }));
      if (items.length === 0) items = [{ title: "No saved reports", subtitle: "Build reports in the web console", badge: "muted" }];
      break;
    }
    case "users": {
      const rows = await db.user.findMany({
        where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 100,
        select: {
          firstName: true, lastName: true, email: true, status: true,
          roles: { select: { name: true } },
        },
      });
      items = rows.map((r) => ({
        title: `${r.firstName} ${r.lastName ?? ""}`.trim(),
        subtitle: r.email,
        trailing: r.roles[0]?.name ?? "—",
        badge: r.status === "ACTIVE" ? "good" : "muted",
      }));
      break;
    }
    case "roles": {
      const rows = await db.role.findMany({
        orderBy: { name: "asc" }, take: 100,
        select: { name: true, key: true, permissions: true },
      });
      items = rows.map((r) => ({
        title: r.name, subtitle: r.key,
        trailing: r.permissions.includes("*") ? "All access" : `${r.permissions.length} perms`,
        badge: "muted",
      }));
      break;
    }
    case "timetable": {
      const rows = await db.period.findMany({
        orderBy: { sequence: "asc" }, take: 100,
        select: { name: true, startTime: true, endTime: true, isBreak: true },
      });
      items = rows.map((r) => ({
        title: r.name,
        subtitle: `${r.startTime} – ${r.endTime}`,
        trailing: r.isBreak ? "Break" : "Class",
        badge: r.isBreak ? "muted" : "good",
      }));
      break;
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
      items = rows.map((r) => ({
        title: `${r.student.firstName} ${r.student.lastName ?? ""}`.trim(),
        subtitle: `${r.term.name}${r.percentage != null ? ` · ${toNumber(r.percentage)}%` : ""}`,
        trailing: r.grade ?? "", badge: "good",
      }));
      break;
    }
    default:
      return { title, items: [], note: "This module isn't available in the app yet." };
  }

  return {
    title,
    items,
    note: items.length === 0 ? "Nothing here yet." : undefined,
  };
}
