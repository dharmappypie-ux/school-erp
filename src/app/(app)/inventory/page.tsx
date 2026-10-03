import Link from "next/link";

import { AddCategory, AddItem, RecordMovement } from "@/app/(app)/inventory/manage-panels";
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
import { requireAnyPermission } from "@/lib/auth";
import { formatMoney, toNumber } from "@/lib/format";
import {
  STOCK_STATUS_LABEL,
  STOCK_STATUS_TONE,
  itemValue,
  stockStatus,
} from "@/lib/inventory";
import { hasPermission } from "@/lib/permissions";
import { scopedDb } from "@/lib/tenant";

export const metadata = { title: "Inventory" };

export default async function InventoryPage() {
  const session = await requireAnyPermission(["inventory.read", "inventory.manage"]);
  const db = scopedDb(session.schoolId);

  const [items, categories] = await Promise.all([
    db.inventoryItem.findMany({
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        sku: true,
        unit: true,
        quantity: true,
        reorderLevel: true,
        location: true,
        unitCost: true,
        category: { select: { name: true } },
      },
    }),
    db.inventoryCategory.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const withStatus = items.map((item) => ({
    ...item,
    status: stockStatus(item.quantity, item.reorderLevel),
    value: itemValue(item.quantity, item.unitCost),
  }));

  const lowOrOut = withStatus.filter((i) => i.status !== "OK");
  const outCount = withStatus.filter((i) => i.status === "OUT").length;
  const totalValue = withStatus.reduce((sum, i) => sum + i.value, 0);

  const canManage = hasPermission(session.permissions, "inventory.manage");
  const canMove = hasPermission(session.permissions, "inventory.movement");
  const currency = session.school.currency;

  return (
    <>
      <PageHeader
        title="Inventory"
        description={`${items.length} items · ${categories.length} categories`}
        action={
          <div className="flex flex-wrap gap-2">
            {canMove && items.length > 0 ? (
              <RecordMovement
                items={items.map((i) => ({ value: i.id, label: `${i.name} (${i.quantity} ${i.unit})` }))}
              />
            ) : null}
            {canManage ? <AddCategory /> : null}
            {canManage ? <AddItem categories={categories.map((c) => ({ value: c.id, label: c.name }))} /> : null}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Total items" value={String(items.length)} sublabel="tracked SKUs" />
        <StatTile
          label="Low / out of stock"
          value={String(lowOrOut.length)}
          sublabel={outCount > 0 ? `${outCount} out of stock` : "need reordering"}
          tone={lowOrOut.length > 0 ? "warning" : "success"}
        />
        <StatTile label="Stock value" value={formatMoney(totalValue, currency)} sublabel="at unit cost" />
        <StatTile label="Categories" value={String(categories.length)} sublabel="groupings" />
      </div>

      {lowOrOut.length > 0 ? (
        <div className="mt-4">
          <Alert tone="warning" title={`${lowOrOut.length} item(s) at or below reorder level`}>
            {lowOrOut
              .slice(0, 6)
              .map((i) => `${i.name} (${i.quantity}/${i.reorderLevel})`)
              .join("; ")}
            {lowOrOut.length > 6 ? ` and ${lowOrOut.length - 6} more` : ""}.
          </Alert>
        </div>
      ) : null}

      <Card className="mt-4">
        <CardHeader title="Stock on hand" description="All tracked items, alphabetically" />
        {withStatus.length === 0 ? (
          <EmptyState
            title="No inventory items yet"
            description={
              canManage
                ? "Add a category, then add the items you want to track stock for."
                : "Items your school tracks will appear here."
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Item</Th>
                <Th>Category</Th>
                <Th className="text-right">On hand</Th>
                <Th className="text-right">Reorder</Th>
                <Th>Status</Th>
                <Th className="text-right">Value</Th>
              </tr>
            </thead>
            <tbody>
              {withStatus.map((item) => (
                <tr key={item.id} className="hover:bg-surface-hover">
                  <Td>
                    <Link href={`/inventory/${item.id}`} className="font-medium hover:text-brand">
                      {item.name}
                    </Link>
                    <div className="text-[11px] text-muted">
                      {item.sku ? `${item.sku} · ` : ""}
                      {item.location ?? "no location"}
                    </div>
                  </Td>
                  <Td className="text-muted-strong">{item.category?.name ?? "—"}</Td>
                  <Td className="numeric text-right">
                    {item.quantity} <span className="text-muted">{item.unit}</span>
                  </Td>
                  <Td className="numeric text-right text-muted-strong">{item.reorderLevel}</Td>
                  <Td>
                    <Badge tone={STOCK_STATUS_TONE[item.status]}>{STOCK_STATUS_LABEL[item.status]}</Badge>
                  </Td>
                  <Td className="numeric text-right text-muted-strong">
                    {toNumber(item.unitCost) > 0 ? formatMoney(item.value, currency) : "—"}
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
