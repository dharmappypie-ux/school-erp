"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePermission } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { computeFine, DEFAULT_LOAN_POLICY } from "@/lib/library";
import { scopedDb } from "@/lib/tenant";

export interface ActionResult {
  ok: boolean;
  message: string;
}

const ReturnSchema = z.object({
  issueId: z.string().min(1),
  /** Set when the copy comes back damaged or is written off as lost. */
  condition: z.enum(["AVAILABLE", "DAMAGED", "LOST"]).default("AVAILABLE"),
});

/**
 * Takes a book back in.
 *
 * The fine is computed from the return date rather than from "now", so a book
 * returned on time never picks up a charge because the form was submitted
 * late, and the copy is put back into circulation in one transaction with the
 * loan being closed.
 */
export async function returnBook(
  input: z.infer<typeof ReturnSchema>,
): Promise<ActionResult> {
  const parsed = ReturnSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const session = await requirePermission("library.circulate");
  const db = scopedDb(session.schoolId);
  const { issueId, condition } = parsed.data;

  const issue = await db.bookIssue.findUnique({
    where: { id: issueId },
    select: {
      id: true,
      dueOn: true,
      returnedOn: true,
      copyId: true,
      copy: { select: { accessionNo: true, book: { select: { title: true } } } },
      student: { select: { firstName: true, lastName: true } },
      staff: { select: { firstName: true, lastName: true } },
    },
  });
  if (!issue) return { ok: false, message: "Loan not found in your school." };
  if (issue.returnedOn) {
    return { ok: false, message: "This copy has already been returned." };
  }

  const returnedOn = new Date();
  const fine = computeFine({ dueOn: issue.dueOn, returnedOn }, DEFAULT_LOAN_POLICY);

  await db.$transaction([
    db.bookIssue.update({
      where: { id: issueId },
      data: {
        returnedOn,
        fineAmount: fine.amount,
        // A lost copy keeps its fine outstanding; an on-time return has none
        // to settle, so it is closed immediately.
        finePaid: fine.amount === 0,
        remarks: condition === "AVAILABLE" ? null : `Returned ${condition.toLowerCase()}`,
      },
    }),
    // tenant-safe: copyId comes from the scoped bookIssue fetched above.
    db.bookCopy.update({
      where: { id: issue.copyId },
      data: { status: condition },
    }),
  ]);

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "library.return",
    entityType: "BookIssue",
    entityId: issueId,
    after: { condition, fine: fine.amount, daysOverdue: fine.daysOverdue },
  });

  revalidatePath("/library");

  const borrower = issue.student
    ? `${issue.student.firstName} ${issue.student.lastName ?? ""}`
    : issue.staff
      ? `${issue.staff.firstName} ${issue.staff.lastName ?? ""}`
      : "the borrower";

  if (fine.amount > 0) {
    return {
      ok: true,
      message: `“${issue.copy.book.title}” returned by ${borrower.trim()} — ${fine.daysOverdue} days overdue, fine of ${fine.amount}${fine.isCapped ? " (capped)" : ""} outstanding.`,
    };
  }

  return {
    ok: true,
    message: `“${issue.copy.book.title}” returned by ${borrower.trim()} on time.`,
  };
}

const BookSchema = z.object({
  title: z.string().trim().min(2, "Enter the title").max(300),
  author: z.string().trim().max(200).optional(),
  isbn: z.string().trim().max(20).optional(),
  publisher: z.string().trim().max(160).optional(),
  category: z.string().trim().max(80).optional(),
  language: z.string().trim().max(40).optional(),
  rackNumber: z.string().trim().max(30).optional(),
  publishYear: z.string().optional(),
  price: z.string().optional(),
  copies: z.coerce.number().int().min(1, "Add at least one copy").max(100),
});

export interface BookResult {
  ok: boolean;
  message: string;
  values?: Record<string, string>;
}

/**
 * Adds a title and its physical copies.
 *
 * Copies get accession numbers generated here rather than typed: they must be
 * unique per school, and a librarian keying them by hand is how duplicates and
 * gaps get in.
 */
export async function addBook(
  _prev: unknown,
  formData: FormData,
): Promise<BookResult> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = BookSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input", values: raw };
  }

  const session = await requirePermission("library.manage");
  const db = scopedDb(session.schoolId);

  const year = parsed.data.publishYear?.trim() ? Number(parsed.data.publishYear) : null;
  if (year !== null) {
    const thisYear = new Date().getFullYear();
    if (!Number.isInteger(year) || year < 1400 || year > thisYear + 1) {
      return { ok: false, message: `Publication year looks wrong — expected 1400 to ${thisYear + 1}.`, values: raw };
    }
  }

  const price = parsed.data.price?.trim() ? Number(parsed.data.price) : null;
  if (price !== null && (!Number.isFinite(price) || price < 0)) {
    return { ok: false, message: "Price must be zero or more.", values: raw };
  }

  // tenant-safe: counted through the parent book's schoolId, so the
  // accession sequence is per school and cannot collide across tenants.
  const existingCopies = await db.bookCopy.count({
    where: { book: { schoolId: session.schoolId } },
  });

  const book = await db.book.create({
    data: {
      schoolId: session.schoolId,
      title: parsed.data.title,
      author: parsed.data.author || null,
      isbn: parsed.data.isbn || null,
      publisher: parsed.data.publisher || null,
      category: parsed.data.category || null,
      language: parsed.data.language || null,
      rackNumber: parsed.data.rackNumber || null,
      publishYear: year,
      price,
      copies: {
        create: Array.from({ length: parsed.data.copies }, (_, index) => ({
          accessionNo: `ACC${String(existingCopies + index + 1).padStart(6, "0")}`,
          status: "AVAILABLE" as const,
          acquiredOn: new Date(),
        })),
      },
    },
    select: { id: true, title: true },
  });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "library.book.create",
    entityType: "Book",
    entityId: book.id,
    after: { title: book.title, copies: parsed.data.copies },
  });

  revalidatePath("/library");
  return {
    ok: true,
    message: `“${book.title}” added with ${parsed.data.copies} ${parsed.data.copies === 1 ? "copy" : "copies"}.`,
  };
}

const IssueSchema = z.object({
  copyId: z.string().min(1, "Choose a copy"),
  studentId: z.string().trim().optional(),
  staffId: z.string().trim().optional(),
  days: z.coerce.number().int().min(1).max(90),
});

/** Issues a copy to a student or a staff member — exactly one of the two. */
export async function issueBook(
  _prev: unknown,
  formData: FormData,
): Promise<BookResult> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = IssueSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input", values: raw };
  }

  const session = await requirePermission("library.manage");
  const db = scopedDb(session.schoolId);

  const studentId = parsed.data.studentId || null;
  const staffId = parsed.data.staffId || null;

  if (Boolean(studentId) === Boolean(staffId)) {
    // Both or neither would leave the loan belonging to nobody, or to two people.
    return { ok: false, message: "Choose either a student or a staff member.", values: raw };
  }

  // tenant-safe: the copy is reached through its book's schoolId.
  const copy = await db.bookCopy.findFirst({
    where: { id: parsed.data.copyId, book: { schoolId: session.schoolId } },
    select: { id: true, status: true, accessionNo: true, book: { select: { title: true } } },
  });
  if (!copy) return { ok: false, message: "That copy is not in your catalogue.", values: raw };
  if (copy.status !== "AVAILABLE") {
    return {
      ok: false,
      message: `${copy.accessionNo} is currently ${copy.status.toLowerCase()}.`,
      values: raw,
    };
  }

  if (studentId) {
    const student = await db.student.findUnique({ where: { id: studentId }, select: { id: true } });
    if (!student) return { ok: false, message: "Student not found in your school.", values: raw };
  }
  if (staffId) {
    const staff = await db.staffMember.findUnique({ where: { id: staffId }, select: { id: true } });
    if (!staff) return { ok: false, message: "Staff member not found in your school.", values: raw };
  }

  const dueOn = new Date();
  dueOn.setDate(dueOn.getDate() + parsed.data.days);

  await db.$transaction(async () => {
    await db.bookIssue.create({
      data: {
        schoolId: session.schoolId,
        copyId: copy.id,
        studentId,
        staffId,
        dueOn,
        issuedBy: session.staffId ?? null,
      },
    });
    // tenant-safe: copy resolved above through its book's schoolId.
    await db.bookCopy.update({ where: { id: copy.id }, data: { status: "ISSUED" } });
  });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "library.issue",
    entityType: "BookIssue",
    entityId: copy.id,
    after: { accessionNo: copy.accessionNo, dueOn: dueOn.toISOString() },
  });

  revalidatePath("/library");
  return {
    ok: true,
    message: `“${copy.book.title}” (${copy.accessionNo}) issued, due ${dueOn.toLocaleDateString("en-IN")}.`,
  };
}
