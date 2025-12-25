import { db } from '../db';
import type { Quality, Settings } from '../types';

interface TypicalOrderStats {
  medianGrams: number;
  mad: number; // median absolute deviation
  upperNormal: number;
  orderCount: number;
  isLowConfidence: boolean;
}

// Get median of an array
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Compute MAD (Median Absolute Deviation)
function computeMAD(values: number[], med: number): number {
  if (values.length === 0) return 0;
  const deviations = values.map((v) => Math.abs(v - med));
  return median(deviations);
}

// Compute typical order stats for a customer
export async function computeTypicalOrderStats(
  customerId: string,
  quality?: Quality,
  settings?: Settings
): Promise<TypicalOrderStats | null> {
  const historyCount = settings?.typicalOrderHistoryCount ?? 10;
  const includePartial = settings?.typicalOrderIncludePartial ?? true;
  const minSpreadGrams = 1.0;

  // Get recent orders for this customer
  const statuses = includePartial ? ['PARTIAL', 'CLOSED'] : ['CLOSED'];
  const orders = await db.orders
    .where('customerId')
    .equals(customerId)
    .filter((o) => statuses.includes(o.status))
    .reverse()
    .sortBy('createdAt');

  const recentOrders = orders.slice(0, historyCount);

  if (recentOrders.length === 0) {
    return null;
  }

  // Get order items for each order
  const orderIds = recentOrders.map((o) => o.id);
  const allItems = await db.orderItems.where('orderId').anyOf(orderIds).toArray();

  // Filter by quality if specified
  let filteredItems = allItems;
  if (quality) {
    const products = await db.products.toArray();
    const qualityProductIds = products
      .filter((p) => p.quality === quality)
      .map((p) => p.id);
    filteredItems = allItems.filter((item) =>
      qualityProductIds.includes(item.productId)
    );
  }

  // Calculate total grams per order
  const orderTotals: number[] = [];
  for (const order of recentOrders) {
    const items = filteredItems.filter((i) => i.orderId === order.id);
    const totalGrams = items.reduce((sum, item) => sum + (item.quantityGrams ?? 0), 0);
    if (totalGrams > 0) {
      orderTotals.push(totalGrams);
    }
  }

  if (orderTotals.length === 0) {
    return null;
  }

  const med = median(orderTotals);
  const mad = computeMAD(orderTotals, med);
  const spread = Math.max(mad, minSpreadGrams);
  const upperNormal = med + 2 * spread;

  return {
    medianGrams: med,
    mad,
    upperNormal,
    orderCount: orderTotals.length,
    isLowConfidence: orderTotals.length < 3,
  };
}

// Check if a requested amount is over typical
export function isOverTypical(
  requestedGrams: number,
  stats: TypicalOrderStats | null
): boolean {
  if (!stats || stats.isLowConfidence) {
    return false; // Don't flag if low confidence
  }
  return requestedGrams > stats.upperNormal;
}
