import Link from "next/link";

import { AddBook, IssueBook } from "@/app/(app)/library/manage-panels";
import { ReturnButton } from "@/app/(app)/library/return-button";
import { SearchBox } from "@/components/data-controls";
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  StatTile,
  Table,
  Td,
  Th,

} from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { formatDate, formatMoney, relativeDays } from "@/lib/format";
import {
  availability,
  computeFine,
  DEFAULT_LOAN_POLICY,
  type CopyState,
} from "@/lib/library";
import { hasPermission } from "@/lib/permissions";
import { scopedDb } from "@/lib/tenant";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Library" };

export default async function LibraryPage({ searchParams }: PageProps<"/library">) {
  const session = await requirePermission("library.read");
  const db = scopedDb(session.schoolId);
  const canManage = hasPermission(session.permissions, "library.manage");

  // Only what the panels need: available copies, and possible borrowers.
  const [availableCopies, borrowerStudents, borrowerStaff] = canManage
    ? await Promise.all([
        // tenant-safe: copies are reached through their book's schoolId.
        db.bookCopy.findMany({
          where: { status: "AVAILABLE", book: { schoolId: session.schoolId } },
          orderBy: { accessionNo: "asc" },
          take: 200,
          select: { id: true, accessionNo: true, book: { select: { title: true } } },
        }),
        db.student.findMany({
          where: { status: "ACTIVE", deletedAt: null },
          orderBy: { firstName: "asc" },
          take: 400,
          select: { id: true, firstName: true, lastName: true, admissionNo: true },
        }),
        db.staffMember.findMany({
          where: { employmentStatus: "ACTIVE", deletedAt: null },
          orderBy: { firstName: "asc" },
          take: 200,
          select: { id: true, firstName: true, lastName: true, employeeId: true },
        }),
      ])
    : [[], [], []];
  const params = await searchParams;
  const currency = session.school.currency;

  const query = typeof params.q === "string" ? params.q.trim() : "";

  const where: Prisma.BookWhereInput = query
    ? {
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { author: { contains: query, mode: "insensitive" } },
          { isbn: { contains: query } },
          { category: { contains: query, mode: "insensitive" } },
        ],
      }
    : {};

  const [books, openLoans, copyCounts, totalTitles] = await Promise.all([
    db.book.findMany({
      where,
      orderBy: { title: "asc" },
      take: 40,
      select: {
        id: true,
        title: true,
        author: true,
        category: true,
        rackNumber: true,
        copies: { select: { status: true } },
      },
    }),
    db.bookIssue.findMany({
      where: { returnedOn: null },
      orderBy: { dueOn: "asc" },
      select: {
        id: true,
        issuedOn: true,
        dueOn: true,
        renewCount: true,
        copy: {
          select: {
            accessionNo: true,
            book: { select: { id: true, title: true } },
          },
        },
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            admissionNo: true,
            enrollments: {
              take: 1,
              orderBy: { enrolledOn: "desc" },
              select: {
                section: { select: { name: true, classLevel: { select: { name: true } } } },
              },
            },
          },
        },
        staff: { select: { firstName: true, lastName: true, employeeId: true } },
      },
    }),
    // tenant-safe: filtered by book.schoolId below.
    db.bookCopy.groupBy({
      by: ["status"],
      where: { book: { schoolId: session.schoolId } },
      _count: { _all: true },
    }),
    db.book.count(),
  ]);

  const copyTotals = Object.fromEntries(
    copyCounts.map((row) => [row.status, row._count._all]),
  ) as Record<string, number>;
  const totalCopies = copyCounts.reduce((sum, row) => sum + row._count._all, 0);

  // Fines are recomputed live rather than read from the row, so an overdue
  // book's debt keeps growing until it is actually returned.
  const loansWithFine = openLoans.map((loan) => ({
    loan,
    fine: computeFine({ dueOn: loan.dueOn }, DEFAULT_LOAN_POLICY),
  }));
  const overdue = loansWithFine.filter((entry) => entry.fine.daysOverdue > 0);
  const finesOwed = overdue.reduce((sum, entry) => sum + entry.fine.amount, 0);

  const canCirculate = hasPermission(session.permissions, "library.circulate");

  return (
    <>
      <PageHeader
        title="Library"
        description={`${totalTitles} titles · ${totalCopies} copies · ${openLoans.length} on loan`}
      />

      {overdue.length > 0 ? (
        <div className="mb-4">
          <Alert tone="warning" title={`${overdue.length} overdue ${overdue.length === 1 ? "loan" : "loans"}`}>
            {formatMoney(finesOwed, currency)} in fines has accrued. Fines are
            capped at {formatMoney(DEFAULT_LOAN_POLICY.maxFine, currency)} per
            loan and stop growing once the book is returned.
          </Alert>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Titles"
          value={String(totalTitles)}
          sublabel={`${totalCopies} physical copies`}
        />
        <StatTile
          label="Available"
          value={String(copyTotals.AVAILABLE ?? 0)}
          sublabel="on the shelf"
          tone="success"
        />
        <StatTile
          label="On loan"
          value={String(openLoans.length)}
          sublabel={`${overdue.length} overdue`}
          tone={overdue.length > 0 ? "warning" : "info"}
        />
        <StatTile
          label="Fines outstanding"
          value={formatMoney(finesOwed, currency)}
          sublabel={
            (copyTotals.LOST ?? 0) + (copyTotals.DAMAGED ?? 0) > 0
              ? `${(copyTotals.LOST ?? 0) + (copyTotals.DAMAGED ?? 0)} copies lost or damaged`
              : "no copies written off"
          }
          tone={finesOwed > 0 ? "danger" : "success"}
        />
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Books on loan"
          description="Soonest due first; overdue loans at the top"
        />
        {openLoans.length === 0 ? (
          <EmptyState title="Nothing is on loan" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Title</Th>
                <Th>Borrower</Th>
                <Th>Issued</Th>
                <Th>Due</Th>
                <Th className="text-right">Fine</Th>
                {canCirculate ? <Th /> : null}
              </tr>
            </thead>
            <tbody>
              {loansWithFine.map(({ loan, fine }) => {
                const enrollment = loan.student?.enrollments[0];
                return (
                  <tr key={loan.id} className="hover:bg-surface-hover">
                    <Td>
                      <span className="font-medium">{loan.copy.book.title}</span>
                      <span className="block font-mono text-[11px] text-muted">
                        {loan.copy.accessionNo}
                        {loan.renewCount > 0 ? ` · renewed ${loan.renewCount}×` : ""}
                      </span>
                    </Td>
                    <Td className="text-muted-strong">
                      {loan.student ? (
                        <>
                          <Link
                            href={`/students/${loan.student.id}`}
                            className="font-medium hover:text-brand"
                          >
                            {loan.student.firstName} {loan.student.lastName}
                          </Link>
                          <span className="block text-xs text-muted">
                            {enrollment
                              ? `${enrollment.section.classLevel.name} ${enrollment.section.name}`
                              : loan.student.admissionNo}
                          </span>
                        </>
                      ) : loan.staff ? (
                        <>
                          {loan.staff.firstName} {loan.staff.lastName}
                          <span className="block text-xs text-muted">
                            {loan.staff.employeeId}
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td className="text-muted-strong">{formatDate(loan.issuedOn)}</Td>
                    <Td>
                      <span
                        className={
                          fine.daysOverdue > 0 ? "text-danger" : "text-muted-strong"
                        }
                      >
                        {formatDate(loan.dueOn)}
                      </span>
                      <span className="block text-[11px] text-muted">
                        {relativeDays(loan.dueOn)}
                      </span>
                    </Td>
                    <Td className="numeric text-right">
                      {fine.amount > 0 ? (
                        <Badge tone="danger">
                          {formatMoney(fine.amount, currency)}
                          {fine.isCapped ? " (max)" : ""}
                        </Badge>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </Td>
                    {canCirculate ? (
                      <Td className="text-right">
                        <ReturnButton issueId={loan.id} />
                      </Td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <Card className="mt-4">
        <CardHeader title="Catalogue" description={`${books.length} shown`} />
        <div className="border-b border-border px-5 py-3">
          <SearchBox placeholder="Search title, author, ISBN, category…" />
        </div>
        {books.length === 0 ? (
          <EmptyState title="No titles match that search" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Title</Th>
                <Th>Author</Th>
                <Th>Category</Th>
                <Th>Rack</Th>
                <Th className="text-right">Copies</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {books.map((book) => {
                const stock = availability(
                  book.copies.map((copy) => copy.status as CopyState),
                );
                return (
                  <tr key={book.id} className="hover:bg-surface-hover">
                    <Td className="font-medium">{book.title}</Td>
                    <Td className="text-muted-strong">{book.author ?? "—"}</Td>
                    <Td className="text-muted-strong">{book.category ?? "—"}</Td>
                    <Td className="font-mono text-xs text-muted">
                      {book.rackNumber ?? "—"}
                    </Td>
                    <Td className="numeric text-right">
                      {stock.available} / {stock.total}
                      {stock.outOfCirculation > 0 ? (
                        <span className="block text-[11px] text-danger">
                          {stock.outOfCirculation} out of circulation
                        </span>
                      ) : null}
                    </Td>
                    <Td>
                      <Badge tone={stock.canIssue ? "success" : "warning"}>
                        {stock.canIssue ? "available" : "all on loan"}
                      </Badge>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <p className="mt-3 text-xs text-muted">
        Loans run {DEFAULT_LOAN_POLICY.loanDays} days with up to{" "}
        {DEFAULT_LOAN_POLICY.maxRenewals} renewals. Overdue books cannot be
        renewed — renewing one would erase the fine already owed.
        {(copyTotals.WITHDRAWN ?? 0) > 0
          ? ` ${copyTotals.WITHDRAWN} copies have been withdrawn from stock.`
          : ""}
      </p>
      {canManage ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <AddBook />
          <IssueBook
            copies={availableCopies.map((copy) => ({
              value: copy.id,
              label: `${copy.accessionNo} · ${copy.book.title}`,
            }))}
            students={borrowerStudents.map((student) => ({
              value: student.id,
              label: `${student.firstName} ${student.lastName} (${student.admissionNo})`,
            }))}
            staff={borrowerStaff.map((member) => ({
              value: member.id,
              label: `${member.firstName} ${member.lastName} (${member.employeeId})`,
            }))}
          />
        </div>
      ) : null}

    </>
  );
}
