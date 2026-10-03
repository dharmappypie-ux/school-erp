import "server-only";

import type { SessionContext } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { scopedDb } from "@/lib/tenant";

export interface AccountFact {
  label: string;
  value: string;
}

export interface AccountSummary {
  /** Role-tailored facts shown in the account popover. */
  facts: AccountFact[];
  /** Where "view my profile" goes, or null when the caller has nowhere to send them. */
  profileHref: string | null;
  profileLabel: string | null;
}

/**
 * The identity facts to show in the header account popover, tailored to who is
 * signed in.
 *
 * The profile link is gated on the permission that guards its destination — a
 * teacher holds a staff record but not `staff.read`, so linking them to
 * `/staff/[id]` would land on an access-denied page. Better to show no link
 * than a broken one.
 */
export async function accountSummary(
  session: SessionContext,
): Promise<AccountSummary> {
  const db = scopedDb(session.schoolId);
  const facts: AccountFact[] = [];
  let profileHref: string | null = null;
  let profileLabel: string | null = null;

  // Students and guardians live in the portal, never on a staff/admin page.
  if (session.studentId) {
    const student = await db.student.findUnique({
      where: { id: session.studentId },
      select: {
        admissionNo: true,
        rollNumber: true,
        enrollments: {
          where: { isActive: true },
          take: 1,
          select: {
            section: {
              select: { name: true, classLevel: { select: { name: true } } },
            },
          },
        },
      },
    });
    if (student) {
      facts.push({ label: "Admission no.", value: student.admissionNo });
      const section = student.enrollments[0]?.section;
      if (section) {
        facts.push({ label: "Class", value: `${section.classLevel.name} ${section.name}` });
      }
      if (student.rollNumber) {
        facts.push({ label: "Roll no.", value: student.rollNumber });
      }
    }
    profileHref = "/portal";
    profileLabel = "Open portal";
  } else if (session.guardianId) {
    // tenant-safe: student_guardians has no schoolId, but guardianId comes from
    // the session, which is already bound to this school's user.
    const children = await db.studentGuardian.count({
      where: { guardianId: session.guardianId },
    });
    facts.push({ label: "Children", value: String(children) });
    profileHref = "/portal";
    profileLabel = "Open portal";
  } else if (session.staffId) {
    const staff = await db.staffMember.findUnique({
      where: { id: session.staffId },
      select: {
        employeeId: true,
        designation: { select: { name: true } },
        department: { select: { name: true } },
      },
    });
    if (staff) {
      facts.push({ label: "Employee ID", value: staff.employeeId });
      if (staff.designation) {
        facts.push({ label: "Designation", value: staff.designation.name });
      }
      if (staff.department) {
        facts.push({ label: "Department", value: staff.department.name });
      }
    }
    // Only link to the staff page if this person could actually open it.
    if (hasPermission(session.permissions, "staff.read")) {
      profileHref = `/staff/${session.staffId}`;
      profileLabel = "View my profile";
    }
  }

  return { facts, profileHref, profileLabel };
}
