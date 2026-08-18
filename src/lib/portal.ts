import "server-only";

import { cache } from "react";
import { notFound, redirect } from "next/navigation";

import { requirePermission, type SessionContext } from "@/lib/auth";
import { scopedDb } from "@/lib/tenant";

/**
 * Portal access control.
 *
 * The portal is the one place where authorisation cannot be a permission
 * check: every parent holds the same permission, but each may only see their
 * own children. Access is therefore decided by relationship —
 * `Guardian → StudentGuardian → Student` for a parent, and the linked student
 * record for a student.
 *
 * `resolvePortalStudent` is the single gate. Portal pages must obtain a
 * student through it rather than reading an id from the URL, so a guessed or
 * tampered id cannot reach another family's data.
 */

export interface PortalChild {
  id: string;
  firstName: string;
  lastName: string | null;
  admissionNo: string;
  photoUrl: string | null;
  className: string | null;
  rollNumber: string | null;
  /** How this child relates to the viewer: "self" for a student. */
  relationship: string;
}

export interface PortalContext {
  session: SessionContext;
  children: PortalChild[];
}

/**
 * Every student the signed-in user is entitled to see. Memoised per request.
 *
 * Returns an empty list rather than throwing when a portal account has no
 * linked student — the page renders an explanatory empty state instead of a
 * crash, which is what a misconfigured account actually needs.
 */
export const getPortalContext = cache(async (): Promise<PortalContext> => {
  const session = await requirePermission("portal.access");
  const db = scopedDb(session.schoolId);
  const yearId = session.academicYear?.id;

  const enrollmentSelect = {
    where: yearId ? { academicYearId: yearId } : undefined,
    take: 1,
    select: {
      rollNumber: true,
      section: {
        select: { name: true, classLevel: { select: { name: true } } },
      },
    },
  } as const;

  const studentSelect = {
    id: true,
    firstName: true,
    lastName: true,
    admissionNo: true,
    photoUrl: true,
    enrollments: enrollmentSelect,
  } as const;

  let rows: {
    student: {
      id: string;
      firstName: string;
      lastName: string | null;
      admissionNo: string;
      photoUrl: string | null;
      enrollments: {
        rollNumber: string | null;
        section: { name: string; classLevel: { name: string } };
      }[];
    };
    relationship: string;
  }[] = [];

  if (session.guardianId) {
    // tenant-safe: filtered by session.guardianId, which is already bound to this school.
    const links = await db.studentGuardian.findMany({
      where: { guardianId: session.guardianId },
      orderBy: { isPrimary: "desc" },
      select: {
        relationship: true,
        student: { select: studentSelect },
      },
    });
    rows = links.map((link) => ({
      student: link.student,
      relationship: link.relationship.toLowerCase(),
    }));
  } else if (session.studentId) {
    const student = await db.student.findUnique({
      where: { id: session.studentId },
      select: studentSelect,
    });
    if (student) rows = [{ student, relationship: "self" }];
  }

  const children: PortalChild[] = rows.map((row) => {
    const enrollment = row.student.enrollments[0];
    return {
      id: row.student.id,
      firstName: row.student.firstName,
      lastName: row.student.lastName,
      admissionNo: row.student.admissionNo,
      photoUrl: row.student.photoUrl,
      className: enrollment
        ? `${enrollment.section.classLevel.name} ${enrollment.section.name}`
        : null,
      rollNumber: enrollment?.rollNumber ?? null,
      relationship: row.relationship,
    };
  });

  return { session, children };
});

/**
 * Resolves which child a portal page is about.
 *
 * `requestedId` comes from the query string, so it is treated as untrusted: an
 * id the viewer is not related to is rejected outright rather than quietly
 * falling back to their own child, which would hide the attempt.
 */
export async function resolvePortalStudent(
  requestedId?: string | string[] | undefined,
): Promise<{ context: PortalContext; child: PortalChild }> {
  const context = await getPortalContext();

  if (context.children.length === 0) {
    redirect("/portal?error=no-student-linked");
  }

  const wanted = typeof requestedId === "string" ? requestedId : undefined;
  if (!wanted) {
    return { context, child: context.children[0] };
  }

  const child = context.children.find((candidate) => candidate.id === wanted);
  if (!child) {
    // A parent asking for a student who is not theirs gets a 404, not a
    // redirect: confirming the id exists would leak roll membership.
    notFound();
  }

  return { context, child };
}
