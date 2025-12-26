import Dexie, { type EntityTable } from 'dexie';
import type {
  Customer,
  CustomerTagRecord,
  Product,
  Inventory,
  InventoryAdjustment,
  Order,
  OrderItem,
  Payment,
  Fulfillment,
  OrderPolicy,
  Settings,
  Tip,
} from '../types';

class BalanceyDB extends Dexie {
  customers!: EntityTable<Customer, 'id'>;
  customerTags!: EntityTable<CustomerTagRecord, 'id'>;
  products!: EntityTable<Product, 'id'>;
  inventory!: EntityTable<Inventory, 'productId'>;
  inventoryAdjustments!: EntityTable<InventoryAdjustment, 'id'>;
  orders!: EntityTable<Order, 'id'>;
  orderItems!: EntityTable<OrderItem, 'id'>;
  payments!: EntityTable<Payment, 'id'>;
  fulfillments!: EntityTable<Fulfillment, 'id'>;
  orderPolicies!: EntityTable<OrderPolicy, 'orderId'>;
  settings!: EntityTable<Settings, 'id'>;
  tips!: EntityTable<Tip, 'id'>;

  constructor() {
    super('balancey');

    this.version(1).stores({
      customers: 'id, name, createdAt, isActive',
      customerTags: 'id, customerId, tag, createdAt',
      products: 'id, name, quality, isActive',
      inventory: 'productId, updatedAt',
      inventoryAdjustments: 'id, productId, createdAt',
      orders: 'id, customerId, createdAt, status, dueAt',
      orderItems: 'id, orderId, productId',
      payments: 'id, orderId, createdAt',
      fulfillments: 'id, orderId, createdAt',
      orderPolicies: 'orderId',
      settings: 'id',
    });

    // Version 2: Add tips table
    this.version(2).stores({
      tips: 'id, createdAt',
    });
  }
}

export const db = new BalanceyDB();

// Default settings
export const DEFAULT_SETTINGS: Settings = {
  id: 'default',
  // Monthly goal
  monthlyGoalCents: 0,
  monthlyClearedCents: 0,
  // Pricing - base rates per gram
  baseCostCentsPerGram: 0,
  baseSaleCentsPerGram: 0,
  premiumCostPct: 20, // Premium costs 20% more
  premiumSalePct: 30, // Premium sells 30% more
  // Price tiers start empty - users add their own custom price points
  priceTiers: [],
  // Policies
  depositMinPctNormal: 0,
  holdbackPctNormal: 0,
  depositMinPctOverTypical: 0,
  holdbackPctOverTypical: 0,
  depositMinPctLate: 0,
  holdbackPctLate: 0,
  doNotAdvanceBlocksOrder: true,
  // Display
  defaultWeightUnit: 'g',
  gramsDecimalPlaces: 1,
  defaultDueDays: 7,
  // Order history
  typicalOrderHistoryCount: 10,
  typicalOrderIncludePartial: true,
  // Delivery
  deliveryFeeMethod: 'gas',
  vehicleType: 'sedan',
};

// Initialize settings if not present
export async function initializeSettings(): Promise<Settings> {
  const existing = await db.settings.get('default');
  if (existing) return existing;

  await db.settings.add(DEFAULT_SETTINGS);
  return DEFAULT_SETTINGS;
}

// Get current settings
export async function getSettings(): Promise<Settings> {
  const settings = await db.settings.get('default');
  return settings || DEFAULT_SETTINGS;
}

// Update settings
export async function updateSettings(updates: Partial<Settings>): Promise<Settings> {
  await db.settings.update('default', updates);
  return (await db.settings.get('default'))!;
}

// Add a tip
export async function addTip(amountCents: number, note?: string): Promise<string> {
  const id = crypto.randomUUID();
  await db.tips.add({
    id,
    createdAt: Date.now(),
    amountCents,
    note,
  });
  return id;
}
