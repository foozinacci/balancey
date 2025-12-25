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
  return settings ?? null;
}

// Dashboard KPIs
export interface DashboardKPIs {
  totalOwedCents: number;
  lateCustomerCount: number;
  lowInventoryCount: number;
  // Daily
  todayCollectedCents: number;
  dailyGoalCents: number;
  dailyMarginCents: number;
  // Monthly
  monthCollectedCents: number;
  monthlyGoalCents: number;
  monthlyMarginCents: number;
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

    // Low inventory (available < 10g or < 5 units)
    const lowInventoryCount = products.filter(
      (p) => p.availableGrams < 10 || p.availableUnits < 5
    ).length;

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

    const dailyExpectedCents = Math.round(dailyGoalCents * dayProgress);
    const dailyMarginCents = todayCollectedCents - dailyExpectedCents;

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

    // Monthly margin
    const currentDay = now.getDate();
    const monthProgress = (currentDay - 1 + currentHour / 24) / daysInMonth;
    const monthlyExpectedCents = Math.round(monthlyGoalCents * monthProgress);
    const monthlyMarginCents = totalMonthCollectedCents - monthlyExpectedCents;

    return {
      totalOwedCents,
      lateCustomerCount,
      lowInventoryCount,
      todayCollectedCents,
      dailyGoalCents,
      dailyMarginCents,
      monthCollectedCents: totalMonthCollectedCents,
      monthlyGoalCents,
      monthlyMarginCents,
    };
  }, []);

  return (
    kpis ?? {
      totalOwedCents: 0,
      lateCustomerCount: 0,
      lowInventoryCount: 0,
      todayCollectedCents: 0,
      dailyGoalCents: 0,
      dailyMarginCents: 0,
      monthCollectedCents: 0,
      monthlyGoalCents: 0,
      monthlyMarginCents: 0,
    }
  );
}
