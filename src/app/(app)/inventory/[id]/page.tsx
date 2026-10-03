import { notFound } from "next/navigation";

import { DeleteItemButton, RecordMovement } from "@/app/(app)/inventory/manage-panels";
import {
  Badge,
  ButtonLink,
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
import { formatDateTime, formatMoney, toNumber } from "@/lib/format";
import {
  MOVEMENT_TYPE_LABEL,
  MOVEMENT_TYPE_TONE,
  STOCK_STATUS_LABEL,
  STOCK_STATUS_TONE,
  itemValue,
  stockStatus,
} from "@/lib/inventory";
import { hasPermission } from "@/lib/permissions";
import { scopedDb } from "@/lib/tenant";

export const metadata = { title: "Inventory item" };

export default async function InventoryItemPage({
  params,
}: PageProps<"/inventory/[id]">) {
  const session = await requireAnyPermission(["inventory.read", "inventory.manage"]);
  const { id } = await params;
  const db = scopedDb(session.schoolId);

  const item = await db.inventoryItem.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      sku: true,
      unit: true,
      quantity: true,
      reorderLevel: true,
      location: true,
      unitCost: true,
      notes: true,
      category: { select: { name: true } },
      movements: {
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          type: true,
          quantity: true,
          balanceAfter: true,
          note: true,
          reference: true,
          createdAt: true,
        },
      },
    },
  });

  if (!item) notFound();

  const status = stockStatus(item.quantity, item.reorderLevel);
  const value = itemValue(item.quantity, item.unitCost);
  const canMove = hasPermission(session.permissions, "inventory.movement");
  const canManage = hasPermission(session.permissions, "inventory.manage");
  const currency = session.school.currency;

  return (
    <>
      <div className="mb-3">
        <ButtonLink href="/inventory" variant="ghost" size="sm">
          ← All inventory
        </ButtonLink>
      </div>

      <PageHeader
        title={item.name}
        description={[item.sku, item.category?.name, item.location].filter(Boolean).join(" · ") || undefined}
        action={
          canMove ? <RecordMovement itemId={item.id} itemName={item.name} /> : undefined
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="On hand"
          value={`${item.quantity}`}
          sublabel={item.unit}
          tone={STOCK_STATUS_TONE[status]}
        />
        <StatTile
          label="Status"
          value={<Badge tone={STOCK_STATUS_TONE[status]}>{STOCK_STATUS_LABEL[status]}</Badge>}
          sublabel={`reorder at ${item.reorderLevel}`}
        />
        <StatTile
          label="Unit cost"
          value={toNumber(item.unitCost) > 0 ? formatMoney(item.unitCost, currency) : "—"}
          sublabel={`per ${item.unit}`}
        />
        <StatTile
          label="Stock value"
          value={toNumber(item.unitCost) > 0 ? formatMoney(value, currency) : "—"}
          sublabel="on hand × unit cost"
        />
      </div>

      {item.notes ? (
        <Card className="mt-4">
          <CardHeader title="Notes" />
          <p className="whitespace-pre-wrap px-5 py-4 text-sm text-muted-strong">{item.notes}</p>
        </Card>
      ) : null}

      <Card className="mt-4">
        <CardHeader title="Movement history" description="Most recent first · newest 100 movements" />
        {item.movements.length === 0 ? (
          <EmptyState title="No movements recorded" description="Receipts, issues and adjustments will appear here." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Type</Th>
                <Th className="text-right">Qty</Th>
                <Th className="text-right">Balance</Th>
                <Th>Reference</Th>
                <Th>Note</Th>
              </tr>
            </thead>
            <tbody>
              {item.movements.map((movement) => (
                <tr key={movement.id} className="hover:bg-surface-hover">
                  <Td className="whitespace-nowrap text-muted-strong">{formatDateTime(movement.createdAt)}</Td>
                  <Td>
                    <Badge tone={MOVEMENT_TYPE_TONE[movement.type]}>{MOVEMENT_TYPE_LABEL[movement.type]}</Badge>
                  </Td>
                  <Td className="numeric text-right">
                    {movement.type === "OUT" ? "−" : movement.type === "IN" ? "+" : "="}
                    {movement.quantity}
                  </Td>
                  <Td className="numeric text-right font-medium">{movement.balanceAfter}</Td>
                  <Td className="text-muted-strong">{movement.reference ?? "—"}</Td>
                  <Td className="text-muted-strong">{movement.note ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {canManage ? (
        <div className="mt-4 flex justify-end">
          <DeleteItemButton itemId={item.id} itemName={item.name} />
        </div>
      ) : null}
    </>
  );
}
