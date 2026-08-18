import { NewExpense } from "@/app/(app)/expenses/new-expense";
import { FilterSelect, SearchBox } from "@/components/data-controls";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  ProgressBar,
  StatTile,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { requireAnyPermission } from "@/lib/auth";
import { formatDate, formatMoney, toNumber } from "@/lib/format";
import { hasPermission } from "@/lib/permissions";
import { scopedDb } from "@/lib/tenant";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Expenses" };

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export default async function ExpensesPage({ searchParams }: PageProps<"/expenses">) {
  const session = await requireAnyPermission(["expenses.read", "expenses.manage"]);
  const db = scopedDb(session.schoolId);
  const params = await searchParams;
  const currency = session.school.currency;
  const canManage = hasPermission(session.permissions, "expenses.manage");

  const search = typeof params.q === "string" ? params.q.trim() : "";
  const category = typeof params.category === "string" ? params.category : "";

  const where: Prisma.ExpenseWhereInput = {
    ...(category ? { category } : {}),
    ...(search
      ? {
          OR: [
            { voucherNo: { contains: search, mode: "insensitive" } },
            { paidTo: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const monthStart = startOfMonth(new Date());

  const [expenses, byCategory, monthTotal, allTime] = await Promise.all([
    db.expense.findMany({
      where,
      orderBy: { paidAt: "desc" },
      take: 60,
      select: {
        id: true, voucherNo: true, category: true, description: true,
        amount: true, taxAmount: true, paidTo: true, paidAt: true,
        mode: true, referenceNo: true,
      },
    }),
    db.expense.groupBy({
      by: ["category"],
      _sum: { amount: true, taxAmount: true },
      _count: { _all: true },
    }),
    db.expense.aggregate({
      where: { paidAt: { gte: monthStart } },
      _sum: { amount: true, taxAmount: true },
      _count: { _all: true },
    }),
    db.expense.aggregate({ _sum: { amount: true, taxAmount: true } }),
  ]);

  const categories = byCategory
    .map((row) => ({
      name: row.category,
      total: toNumber(row._sum.amount) + toNumber(row._sum.taxAmount),
      count: row._count._all,
    }))
    .sort((a, b) => b.total - a.total);

  const grandTotal = categories.reduce((sum, c) => sum + c.total, 0);
  const monthSpend = toNumber(monthTotal._sum.amount) + toNumber(monthTotal._sum.taxAmount);

  return (
    <>
      <PageHeader title="Expenses" description="Vouchers recorded against the school" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="This month"
          value={formatMoney(monthSpend, currency)}
          sublabel={`${monthTotal._count._all} vouchers`}
        />
        <StatTile
          label="All time"
          value={formatMoney(
            toNumber(allTime._sum.amount) + toNumber(allTime._sum.taxAmount),
            currency,
          )}
        />
        <StatTile label="Categories" value={String(categories.length)} />
        <StatTile
          label="Tax recorded"
          value={formatMoney(toNumber(allTime._sum.taxAmount), currency)}
          sublabel="included in the totals above"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className={canManage ? "lg:col-span-2" : "lg:col-span-3"}>
          <CardHeader
            title="Vouchers"
            description="Most recent first"
            action={
              <span className="flex gap-2">
                <SearchBox placeholder="Voucher, payee…" />
                <FilterSelect
                  paramName="category"
                  label="Category"
                  allLabel="All categories"
                  options={categories.map((c) => ({ value: c.name, label: c.name }))}
                />
              </span>
            }
          />
          {expenses.length === 0 ? (
            <EmptyState title="No expenses recorded" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Voucher</Th>
                  <Th>Category</Th>
                  <Th>Paid to</Th>
                  <Th>Date</Th>
                  <Th className="text-right">Amount</Th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((expense) => (
                  <tr key={expense.id} className="hover:bg-surface-hover">
                    <Td>
                      <span className="font-mono text-xs font-medium">{expense.voucherNo}</span>
                      {expense.description ? (
                        <span className="block max-w-xs truncate text-[11px] text-muted">
                          {expense.description}
                        </span>
                      ) : null}
                    </Td>
                    <Td>
                      <Badge tone="neutral">{expense.category}</Badge>
                    </Td>
                    <Td className="text-muted-strong">
                      {expense.paidTo ?? <span className="text-muted">—</span>}
                      <span className="block text-[11px] text-muted">
                        {expense.mode.replace("_", " ").toLowerCase()}
                        {expense.referenceNo ? ` · ${expense.referenceNo}` : ""}
                      </span>
                    </Td>
                    <Td className="text-muted-strong">{formatDate(expense.paidAt)}</Td>
                    <Td className="numeric text-right font-semibold">
                      {formatMoney(
                        toNumber(expense.amount) + toNumber(expense.taxAmount),
                        currency,
                      )}
                      {toNumber(expense.taxAmount) > 0 ? (
                        <span className="block text-[11px] text-muted">
                          incl. {formatMoney(expense.taxAmount, currency)} tax
                        </span>
                      ) : null}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        {canManage ? (
          <NewExpense knownCategories={categories.map((c) => c.name)} />
        ) : null}
      </div>

      <Card className="mt-4">
        <CardHeader title="Spend by category" description="All vouchers" />
        {categories.length === 0 ? (
          <EmptyState title="Nothing to summarise" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Category</Th>
                <Th className="text-right">Vouchers</Th>
                <Th className="text-right">Total</Th>
                <Th className="w-48">Share</Th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => (
                <tr key={cat.name}>
                  <Td className="font-medium">{cat.name}</Td>
                  <Td className="numeric text-right">{cat.count}</Td>
                  <Td className="numeric text-right">{formatMoney(cat.total, currency)}</Td>
                  <Td>
                    <ProgressBar
                      value={grandTotal > 0 ? (cat.total / grandTotal) * 100 : 0}
                      tone="brand"
                    />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
