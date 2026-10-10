"use server";

import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { planAllowsAnotherStudent, studentCapMessage } from "@/lib/entitlements";
import {
  buildPreview,
  parseCsv,
  type ImportIssue,
  type ParsedStudent,
} from "@/lib/student-import";
import { scopedDb } from "@/lib/tenant";
import { readXlsx } from "@/lib/xlsx-reader";

export interface ImportState {
  ok: boolean;
  message: string;
  issues?: ImportIssue[];
  unmatchedColumns?: string[];
  matchedFields?: string[];
  /** Rows that would be created, carried back so the commit needs no re-upload. */
  preview?: ParsedStudent[];
  /** Set once rows have actually been written. */
  created?: number;
}

/** 4 MB of CSV is roughly 40,000 students — well past any single school's roll. */
const MAX_BYTES = 4 * 1024 * 1024;

async function loadContext(schoolId: string, yearId: string | undefined) {
  const db = scopedDb(schoolId);

  const [students, sections] = await Promise.all([
    db.student.findMany({
      where: { deletedAt: null },
      select: { admissionNo: true },
    }),
    yearId
      ? db.section.findMany({
          where: { academicYearId: yearId },
          select: {
            id: true,
            name: true,
            capacity: true,
            classLevel: { select: { name: true } },
            _count: { select: { enrollments: { where: { isActive: true } } } },
          },
        })
      : [],
  ]);

  const sectionsByKey = new Map<string, string>();
  for (const section of sections) {
    sectionsByKey.set(
      `${section.classLevel.name.toLowerCase()}|${section.name.toLowerCase()}`,
      section.id,
    );
  }

  return {
    db,
    sections,
    context: {
      existingAdmissionNos: new Set(
        students.map((student) => student.admissionNo.toLowerCase()),
      ),
      sectionsByKey,
      // Without an open academic year there is nothing to enrol into, so the
      // class column becomes optional rather than impossible to satisfy.
      requireClass: Boolean(yearId),
    },
  };
}

/**
 * Reads the uploaded file and reports what it would do — without writing
 * anything.
 *
 * A bulk import is the one place where "just try it and see" is unaffordable,
 * so the preview is mandatory: the commit below only accepts rows this step
 * produced.
 */
export async function previewImport(
  _previous: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const session = await requirePermission("students.create");
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose a CSV file to upload." };
  }
  if (file.size > MAX_BYTES) {
    return {
      ok: false,
      message: `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 4 MB.`,
    };
  }
  // .xls (the pre-2007 binary format) is a different beast entirely and is not
  // supported; .xlsx and .csv both are.
  if (/\.xls$/i.test(file.name)) {
    return {
      ok: false,
      message:
        "That is the old .xls format. Open it in Excel and choose File → Save As → Excel Workbook (.xlsx), then upload that.",
    };
  }

  let grid: string[][];
  if (/\.xlsx$/i.test(file.name)) {
    try {
      grid = await readXlsx(await file.arrayBuffer());
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error
            ? `That workbook could not be read: ${error.message}`
            : "That workbook could not be read.",
      };
    }
  } else {
    grid = parseCsv(await file.text());
  }

  const { context } = await loadContext(session.schoolId, session.academicYear?.id);
  const preview = buildPreview(grid, context);

  if (preview.issues.length > 0) {
    return {
      ok: false,
      message: `${preview.issues.length} problem${preview.issues.length === 1 ? "" : "s"} found. Nothing has been imported.`,
      issues: preview.issues,
      unmatchedColumns: preview.unmatchedColumns,
      matchedFields: preview.matchedFields,
      preview: preview.rows,
    };
  }

  if (preview.rows.length === 0) {
    return { ok: false, message: "No student rows found in that file." };
  }

  return {
    ok: true,
    message: `${preview.rows.length} student${preview.rows.length === 1 ? "" : "s"} ready to import. Nothing has been written yet.`,
    issues: [],
    unmatchedColumns: preview.unmatchedColumns,
    matchedFields: preview.matchedFields,
    preview: preview.rows,
  };
}

/**
 * Writes the previewed rows.
 *
 * Re-validates from scratch against the database rather than trusting the
 * payload: between preview and commit someone else may have admitted a student
 * with one of these numbers.
 */
export async function commitImport(
  _previous: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const session = await requirePermission("students.create");
  const payload = String(formData.get("payload") ?? "");

  let rows: ParsedStudent[];
  try {
    const decoded: unknown = JSON.parse(payload);
    if (!Array.isArray(decoded) || decoded.length === 0) {
      return { ok: false, message: "Nothing to import. Upload the file again." };
    }
    rows = decoded as ParsedStudent[];
  } catch {
    return { ok: false, message: "That import could not be read. Upload the file again." };
  }

  const yearId = session.academicYear?.id;
  const { db, sections, context } = await loadContext(session.schoolId, yearId);

  // Admission numbers taken since the preview.
  const clashes = rows
    .filter((row) => context.existingAdmissionNos.has(row.admissionNo.toLowerCase()))
    .map((row) => ({
      row: row.row,
      column: "Admission no.",
      message: `${row.admissionNo} was added by someone else since you uploaded. Nothing has been imported.`,
    }));
  if (clashes.length > 0) {
    return { ok: false, message: "The roll changed while you were reviewing.", issues: clashes };
  }

  // Capacity, counted across the whole file rather than row by row: fifty
  // students into a forty-seat section must fail before any of them is written.
  const sectionById = new Map(sections.map((section) => [section.id, section]));
  const incoming = new Map<string, number>();
  for (const row of rows) {
    if (!row.className || !row.sectionName) continue;
    const id = context.sectionsByKey.get(
      `${row.className.toLowerCase()}|${row.sectionName.toLowerCase()}`,
    );
    if (id) incoming.set(id, (incoming.get(id) ?? 0) + 1);
  }
  const overfull: ImportIssue[] = [];
  for (const [sectionId, count] of incoming) {
    const section = sectionById.get(sectionId);
    if (!section) continue;
    const projected = section._count.enrollments + count;
    if (projected > section.capacity) {
      overfull.push({
        row: 1,
        column: "Class / Section",
        message: `${section.classLevel.name} ${section.name} would hold ${projected} of ${section.capacity} places.`,
      });
    }
  }
  if (overfull.length > 0) {
    return {
      ok: false,
      message: "Some classes would go over capacity. Nothing has been imported.",
      issues: overfull,
    };
  }

  // Plan student cap, counted across the whole file: a Trial school importing
  // past its 50-student limit must fail before any row is written.
  const existingStudents = await db.student.count({ where: { deletedAt: null } });
  if (!planAllowsAnotherStudent(session.school.plan, existingStudents + rows.length - 1)) {
    return {
      ok: false,
      message: `${studentCapMessage(session.school.plan)} This file would take you to ${existingStudents + rows.length}.`,
    };
  }

  // One transaction: a half-imported file is worse than a rejected one, because
  // nobody can tell which half landed. Timeout raised — four hundred students
  // is a lot of round trips.
  await db.$transaction(
    async (tx) => {
      for (const row of rows) {
        const student = await tx.student.create({
          data: {
            schoolId: session.schoolId,
            admissionNo: row.admissionNo,
            firstName: row.firstName,
            middleName: row.middleName,
            lastName: row.lastName,
            dateOfBirth: row.dateOfBirth ? new Date(row.dateOfBirth) : null,
            gender: row.gender,
            admissionDate: row.admissionDate ? new Date(row.admissionDate) : new Date(),
            rollNumber: row.rollNumber,
            phone: row.phone,
            email: row.email,
            addressLine1: row.addressLine1,
            city: row.city,
            state: row.state,
            postalCode: row.postalCode,
            bloodGroup: row.bloodGroup,
            religion: row.religion,
            category: row.category,
            caste: row.caste,
            aadhaarNumber: row.aadhaarNumber,
            apaarId: row.apaarId,
            penNumber: row.penNumber,
            house: row.house,
            status: "ACTIVE",
          },
          select: { id: true },
        });

        if (row.guardianName && row.guardianPhone) {
          // Siblings share a guardian; matching on phone keeps one record per
          // parent instead of one per child.
          const existing = await tx.guardian.findFirst({
            where: { phone: row.guardianPhone },
            select: { id: true },
          });
          const parts = row.guardianName.split(/\s+/);
          const guardian =
            existing ??
            (await tx.guardian.create({
              data: {
                schoolId: session.schoolId,
                firstName: parts[0],
                lastName: parts.length > 1 ? parts.slice(1).join(" ") : null,
                phone: row.guardianPhone,
              },
              select: { id: true },
            }));

          await tx.studentGuardian.create({
            data: {
              studentId: student.id,
              guardianId: guardian.id,
              relationship: row.guardianRelation,
              isPrimary: true,
              isFeePayer: true,
            },
          });
        }

        if (yearId && row.className && row.sectionName) {
          const sectionId = context.sectionsByKey.get(
            `${row.className.toLowerCase()}|${row.sectionName.toLowerCase()}`,
          );
          if (sectionId) {
            await tx.enrollment.create({
              data: {
                schoolId: session.schoolId,
                studentId: student.id,
                sectionId,
                academicYearId: yearId,
                rollNumber: row.rollNumber,
                isActive: true,
              },
            });
          }
        }
      }
    },
    { timeout: 120_000 },
  );

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "students.import",
    entityType: "Student",
    after: { created: rows.length },
  });

  revalidatePath("/students");

  return {
    ok: true,
    created: rows.length,
    message: `${rows.length} student${rows.length === 1 ? "" : "s"} imported.`,
  };
}
