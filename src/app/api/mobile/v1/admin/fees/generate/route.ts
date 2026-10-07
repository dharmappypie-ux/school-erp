import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { Prisma, prisma } from "@/lib/db";
import { nextDocumentNumber } from "@/lib/fees";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({
  structureId: z.string().min(1, "Choose a fee structure"),
  dueDate: z.string().optional(),
  period: z.string().trim().max(40).optional(),
});

/**
 * POST /api/mobile/v1/admin/fees/generate — bill every active student covered by
 * a fee structure (one invoice each, skipping those already billed). Mirrors the
 * web `generateInvoices`.
 */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "fees.invoice");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const yearId = session.academicYearId;
  if (!yearId) return cors(NextResponse.json({ error: "Set up a current academic year first." }, { status: 409 }));

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 }));
  }

  const db = scopedDb(session.schoolId);
  const structure = await db.feeStructure.findUnique({
    where: { id: parsed.data.structureId },
    select: {
      id: true, name: true, classLevelId: true, academicYearId: true,
      items: {
        select: {
          amount: true, installment: true, label: true, dueDate: true,
          feeCategory: { select: { id: true, name: true, taxRate: true, isTaxable: true } },
        },
      },
    },
  });
  if (!structure) return cors(NextResponse.json({ error: "That fee structure does not exist." }, { status: 404 }));
  if (structure.academicYearId !== yearId) {
    return cors(NextResponse.json({ error: `"${structure.name}" belongs to a different academic year.` }, { status: 409 }));
  }
  if (structure.items.length === 0) {
    return cors(NextResponse.json({ error: `"${structure.name}" has no fee heads to bill.` }, { status: 409 }));
  }

  const enrollments = await db.enrollment.findMany({
    where: {
      academicYearId: yearId, isActive: true,
      ...(structure.classLevelId ? { section: { classLevelId: structure.classLevelId } } : {}),
    },
    select: { studentId: true },
  });
  const candidateIds = [...new Set(enrollments.map((r) => r.studentId))];
  if (candidateIds.length === 0) {
    return cors(NextResponse.json({ error: "No active students match this structure." }, { status: 409 }));
  }

  const alreadyBilled = await db.invoice.findMany({
    where: { structureId: structure.id, studentId: { in: candidateIds } },
    select: { studentId: true },
  });
  const billedSet = new Set(alreadyBilled.map((r) => r.studentId));
  const targetIds = candidateIds.filter((id) => !billedSet.has(id));
  if (targetIds.length === 0) {
    return cors(NextResponse.json({ error: `Every matching student already has an invoice from "${structure.name}".` }, { status: 409 }));
  }

  const round2 = (v: InstanceType<typeof Prisma.Decimal>) => v.toDecimalPlaces(2);
  const lineTemplates = structure.items.map((item) => {
    const amount = round2(new Prisma.Decimal(item.amount));
    const taxRate = item.feeCategory.isTaxable ? new Prisma.Decimal(item.feeCategory.taxRate ?? 0) : new Prisma.Decimal(0);
    const taxAmount = round2(amount.times(taxRate).dividedBy(100));
    return {
      feeCategoryId: item.feeCategory.id,
      description: item.label || item.feeCategory.name,
      amount, taxRate, taxAmount, lineTotal: amount.plus(taxAmount), installment: item.installment,
    };
  });
  const subtotal = lineTemplates.reduce((s, l) => s.plus(l.amount), new Prisma.Decimal(0));
  const taxTotal = lineTemplates.reduce((s, l) => s.plus(l.taxAmount), new Prisma.Decimal(0));
  const total = subtotal.plus(taxTotal);

  const dueDate = parsed.data.dueDate && parsed.data.dueDate.trim()
    ? new Date(parsed.data.dueDate)
    : (structure.items.map((i) => i.dueDate).filter((d): d is Date => d !== null).sort((a, b) => a.getTime() - b.getTime())[0]
        ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
  if (Number.isNaN(dueDate.getTime())) {
    return cors(NextResponse.json({ error: "The due date could not be read." }, { status: 400 }));
  }

  const school = await prisma.school.findUnique({ where: { id: session.schoolId }, select: { slug: true } });
  const prefix = `INV${(school?.slug ?? "sch").slice(0, 3).toUpperCase()}`;
  const width = 5;

  try {
    await db.$transaction(async (tx) => {
      const first = await nextDocumentNumber(tx as typeof db, "invoice", prefix, width);
      const startNum = Number.parseInt(first.slice(prefix.length), 10) || 1;
      for (let i = 0; i < targetIds.length; i += 1) {
        const invoiceNo = `${prefix}${String(startNum + i).padStart(width, "0")}`;
        await tx.invoice.create({
          data: {
            schoolId: session.schoolId, studentId: targetIds[i], academicYearId: yearId,
            structureId: structure.id, invoiceNo, dueDate, period: parsed.data.period || null,
            subtotal, taxTotal, total, amountPaid: new Prisma.Decimal(0), amountDue: total, status: "ISSUED",
            lines: { create: lineTemplates.map((l) => ({
              feeCategoryId: l.feeCategoryId, description: l.description, amount: l.amount,
              taxRate: l.taxRate, taxAmount: l.taxAmount, lineTotal: l.lineTotal, installment: l.installment,
            })) },
          },
        });
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return cors(NextResponse.json({ error: "Another invoice run happened at the same time — please try again." }, { status: 409 }));
    }
    throw error;
  }

  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: "fees.invoice.generate", entityType: "FeeStructure", entityId: structure.id,
    after: { structure: structure.name, count: targetIds.length, via: "mobile" },
  });

  return cors(NextResponse.json({
    ok: true,
    message: `${targetIds.length} invoice(s) issued from "${structure.name}"${billedSet.size > 0 ? ` (${billedSet.size} already billed, skipped)` : ""}.`,
  }));
}
