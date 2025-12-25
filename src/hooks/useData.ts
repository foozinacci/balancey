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
  todayCollectedCents: number;
}

export function useDashboardKPIs(): DashboardKPIs {
  const kpis = useLiveQuery(async () => {
    const customers = await getAllCustomersWithBalances();
    const products = await getAllProductsWithInventory();

    // Total owed
    const totalOwedCents = customers.reduce((sum, c) => sum + c.balanceDueCents, 0);

    // Late customers
    const lateCustomerCount = customers.filter((c) => c.isLate).length;

    // Low inventory (available < 10g or < 5 units)
    const lowInventoryCount = products.filter(
      (p) => p.availableGrams < 10 || p.availableUnits < 5
    ).length;

    // Today's payments
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStart = today.getTime();

    const todayPayments = await db.payments
      .filter((p) => p.createdAt >= todayStart)
      .toArray();
    const todayCollectedCents = todayPayments.reduce(
      (sum, p) => sum + p.amountCents,
      0
    );

    return {
      totalOwedCents,
      lateCustomerCount,
      lowInventoryCount,
      todayCollectedCents,
    };
  }, []);

  return (
    kpis ?? {
      totalOwedCents: 0,
      lateCustomerCount: 0,
      lowInventoryCount: 0,
      todayCollectedCents: 0,
    }
  );
}
