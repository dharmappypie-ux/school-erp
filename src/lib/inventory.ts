import type { StockMovementType } from "@/generated/prisma/enums";

import type { Tone } from "@/components/ui";
import { toNumber } from "@/lib/format";

/**
 * Inventory helpers shared by the stock screens. Pure functions only — no
 * Prisma access — so the labels and calculations work on both the server pages
 * and the client panels.
 */

export type StockStatus = "OUT" | "LOW" | "OK";

/**
 * Where an item sits against its reorder level. An item at or below its reorder
 * level (but above zero) is LOW; zero on hand is OUT. A reorder level of 0
 * means "no threshold set", so such an item is only ever OUT or OK.
 */
export function stockStatus(quantity: number, reorderLevel: number): StockStatus {
  if (quantity <= 0) return "OUT";
  if (reorderLevel > 0 && quantity <= reorderLevel) return "LOW";
  return "OK";
}

export const STOCK_STATUS_LABEL: Record<StockStatus, string> = {
  OUT: "Out of stock",
  LOW: "Low stock",
  OK: "In stock",
};

export const STOCK_STATUS_TONE: Record<StockStatus, Tone> = {
  OUT: "danger",
  LOW: "warning",
  OK: "success",
};

export const MOVEMENT_TYPE_LABEL: Record<StockMovementType, string> = {
  IN: "Received",
  OUT: "Issued",
  ADJUST: "Adjusted",
};

export const MOVEMENT_TYPE_TONE: Record<StockMovementType, Tone> = {
  IN: "success",
  OUT: "info",
  ADJUST: "warning",
};

export const MOVEMENT_TYPES: StockMovementType[] = ["IN", "OUT", "ADJUST"];

/** Value of the stock on hand for one item. */
export function itemValue(
  quantity: number,
  unitCost: number | string | { toString(): string } | null | undefined,
): number {
  return quantity * toNumber(unitCost);
}

/**
 * Applies a movement to a current on-hand quantity and returns the new balance,
 * or an error the caller can surface. Centralised so the server action and any
 * preview use identical arithmetic.
 *
 * IN adds, OUT subtracts (never below zero), ADJUST sets the counted total.
 */
export function applyMovement(
  current: number,
  type: StockMovementType,
  quantity: number,
): { ok: true; balance: number } | { ok: false; reason: string } {
  if (!Number.isInteger(quantity) || quantity < 0) {
    return { ok: false, reason: "Quantity must be a whole number of 0 or more." };
  }
  if (type === "IN") return { ok: true, balance: current + quantity };
  if (type === "OUT") {
    if (quantity > current) {
      return { ok: false, reason: `Cannot issue ${quantity} — only ${current} in stock.` };
    }
    return { ok: true, balance: current - quantity };
  }
  // ADJUST: the entered quantity is the new counted total.
  return { ok: true, balance: quantity };
}
