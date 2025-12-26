import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSettings, initializeSettings } from '../db';
import {
  getAllCustomersWithBalances,
  getCustomerWithBalance,
  updateLateStatuses,
} from '../db/customers';
import { getAllProductsWithInventory, getProductWithInventory } from '../db/products';
import { getOrderWithDetails, getCustomerOrders, getOpenOrders } from '../db/orders';
import type {
  CustomerWithBalance,
  ProductWithInventory,
  OrderWithDetails,
  Settings,
} from '../types';
import { useEffect } from 'react';

// Initialize app data
export function useInitialize() {
  useEffect(() => {
    initializeSettings();
    updateLateStatuses();
  }, []);
}

// Get all customers with balances
export function useCustomers(): CustomerWithBalance[] {
  const customers = useLiveQuery(async () => {
    await updateLateStatuses();
    return getAllCustomersWithBalances();
  }, []);

  return customers ?? [];
}

// Get a single customer with balance
export function useCustomer(customerId: string | undefined): CustomerWithBalance | null {
  const customer = useLiveQuery(async () => {
    if (!customerId) return null;
    return getCustomerWithBalance(customerId);
  }, [customerId]);

  return customer ?? null;
}

// Get all products with inventory
export function useProducts(): ProductWithInventory[] {
  const products = useLiveQuery(() => getAllProductsWithInventory(), []);
  return products ?? [];
}

// Get a single product with inventory
export function useProduct(productId: string | undefined): ProductWithInventory | null {
  const product = useLiveQuery(async () => {
    if (!productId) return null;
    return getProductWithInventory(productId);
  }, [productId]);

  return product ?? null;
}

// Get an order with details
export function useOrder(orderId: string | undefined): OrderWithDetails | null {
  const order = useLiveQuery(async () => {
    if (!orderId) return null;
    return getOrderWithDetails(orderId);
  }, [orderId]);

  return order ?? null;
}

// Get orders for a customer
export function useCustomerOrders(customerId: string | undefined): OrderWithDetails[] {
  const orders = useLiveQuery(async () => {
    if (!customerId) return [];
    return getCustomerOrders(customerId);
  }, [customerId]);

  return orders ?? [];
}

// Get all open orders
export function useOpenOrders(): OrderWithDetails[] {
  const orders = useLiveQuery(() => getOpenOrders(), []);
  return orders ?? [];
}

// Get settings
export function useSettings(): Settings | null {
  const settings = useLiveQuery(() => getSettings(), []);
  // Return actual settings, or null only while loading (undefined)
  // getSettings() returns DEFAULT_SETTINGS if none exist
  return settings === undefined ? null : settings;
}

// Waste history with product names
export interface WasteRecord {
  id: string;
  productId: string;
  productName: string;
  quality: 'REGULAR' | 'PREMIUM';
  gramsAdjustment: number;
  note: string;
  createdAt: number;
}

export function useWasteHistory(): WasteRecord[] {
  const records = useLiveQuery(async () => {
    const adjustments = await db.inventoryAdjustments
      .filter(a => a.type === 'WASTE')
      .reverse()
      .sortBy('createdAt');

    const products = await db.products.toArray();
    const productMap = new Map(products.map(p => [p.id, p]));

    return adjustments.map(a => {
      const product = productMap.get(a.productId);
      return {
        id: a.id,
        productId: a.productId,
        productName: product?.name ?? 'Unknown',
        quality: (product?.quality ?? 'REGULAR') as 'REGULAR' | 'PREMIUM',
        gramsAdjustment: Math.abs(a.gramsAdjustment),
        note: a.note,
        createdAt: a.createdAt,
      };
    });
  }, []);

  return records ?? [];
}

// Dashboard KPIs
export interface DashboardKPIs {
  totalOwedCents: number;
  lateCustomerCount: number;
  regularStockGrams: number; // Regular available inventory
  premiumStockGrams: number; // Premium available inventory
  // Daily
  todayCollectedCents: number;
  dailyGoalCents: number;
  dailyMarginCents: number;
  // Monthly
  monthCollectedCents: number;
  monthlyGoalCents: number;
  monthlyMarginCents: number;
  // Delivery extras
  monthlyDeliveryRevenueCents: number;
  monthlyTipsCents: number;
}

export function useDashboardKPIs(): DashboardKPIs {
  const kpis = useLiveQuery(async () => {
    const customers = await getAllCustomersWithBalances();
    const products = await getAllProductsWithInventory();
    const settings = await getSettings();

    // Total owed
    const totalOwedCents = customers.reduce((sum, c) => sum + c.balanceDueCents, 0);

    // Late customers
    const lateCustomerCount = customers.filter((c) => c.isLate).length;

    // Stock by quality
    const regularProducts = products.filter(p => p.quality === 'REGULAR');
    const premiumProducts = products.filter(p => p.quality === 'PREMIUM');
    const regularStockGrams = regularProducts.reduce((sum, p) => sum + p.availableGrams, 0);
    const premiumStockGrams = premiumProducts.reduce((sum, p) => sum + p.availableGrams, 0);

    const now = new Date();

    // Today's payments
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const todayPayments = await db.payments
      .filter((p) => p.createdAt >= todayStart)
      .toArray();
    const todayCollectedCents = todayPayments.reduce(
      (sum, p) => sum + p.amountCents,
      0
    );

    // Daily goal and time-prorated margin
    const monthlyGoalCents = settings.monthlyGoalCents ?? 0;
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dailyGoalCents = Math.round(monthlyGoalCents / daysInMonth);

    // Calculate what % of business day has elapsed (10am-10pm = 12 hours)
    const businessStartHour = 10;
    const businessEndHour = 22;
    const businessDayHours = businessEndHour - businessStartHour;
    const currentHour = now.getHours() + now.getMinutes() / 60;

    let dayProgress = 0;
    if (currentHour < businessStartHour) {
      dayProgress = 0;
    } else if (currentHour >= businessEndHour) {
      dayProgress = 1;
    } else {
      dayProgress = (currentHour - businessStartHour) / businessDayHours;
    }

    const dailyExpectedCents = monthlyGoalCents > 0 ? Math.round(dailyGoalCents * dayProgress) : 0;
    const dailyMarginCents = monthlyGoalCents > 0 ? (todayCollectedCents - dailyExpectedCents) : todayCollectedCents;

    // Monthly payments
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const monthPayments = await db.payments
      .filter((p) => p.createdAt >= monthStart)
      .toArray();
    const monthCollectedCents = monthPayments.reduce(
      (sum, p) => sum + p.amountCents,
      0
    );

    // Include payments from cleared orders
    const clearedCents = settings.monthlyClearedCents ?? 0;
    const totalMonthCollectedCents = monthCollectedCents + clearedCents;

    // Monthly margin - only calculate if goal exists
    const currentDay = now.getDate();
    const monthProgress = (currentDay - 1 + currentHour / 24) / daysInMonth;
    const monthlyExpectedCents = monthlyGoalCents > 0 ? Math.round(monthlyGoalCents * monthProgress) : 0;
    const monthlyMarginCents = monthlyGoalCents > 0 ? (totalMonthCollectedCents - monthlyExpectedCents) : totalMonthCollectedCents;

    // Monthly delivery revenue (from orders with delivery fees this month)
    const monthOrders = await db.orders
      .filter((o) => o.createdAt >= monthStart && o.deliveryFeeCents > 0)
      .toArray();
    const monthlyDeliveryRevenueCents = monthOrders.reduce(
      (sum, o) => sum + o.deliveryFeeCents,
      0
    );

    // Monthly tips
    const monthTips = await db.tips
      .filter((t) => t.createdAt >= monthStart)
      .toArray();
    const monthlyTipsCents = monthTips.reduce(
      (sum, t) => sum + t.amountCents,
      0
    );

    return {
      totalOwedCents,
      lateCustomerCount,
      regularStockGrams,
      premiumStockGrams,
      todayCollectedCents,
      dailyGoalCents,
      dailyMarginCents,
      monthCollectedCents: totalMonthCollectedCents,
      monthlyGoalCents,
      monthlyMarginCents,
      monthlyDeliveryRevenueCents,
      monthlyTipsCents,
    };
  }, []);

  return (
    kpis ?? {
      totalOwedCents: 0,
      lateCustomerCount: 0,
      regularStockGrams: 0,
      premiumStockGrams: 0,
      todayCollectedCents: 0,
      dailyGoalCents: 0,
      dailyMarginCents: 0,
      monthCollectedCents: 0,
      monthlyGoalCents: 0,
      monthlyMarginCents: 0,
      monthlyDeliveryRevenueCents: 0,
      monthlyTipsCents: 0,
    }
  );
}
