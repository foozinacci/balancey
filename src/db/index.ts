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
  }
}

export const db = new BalanceyDB();

// Default settings
export const DEFAULT_SETTINGS: Settings = {
  id: 'default',
  depositMinPctNormal: 0.40,
  holdbackPctNormal: 0.10,
  depositMinPctOverTypical: 0.60,
  holdbackPctOverTypical: 0.20,
  depositMinPctLate: 0.80,
  holdbackPctLate: 0.30,
  doNotAdvanceBlocksOrder: true,
  presetWeights: [1, 2, 3.5, 7, 14, 28],
  defaultWeightUnit: 'g',
  gramsDecimalPlaces: 1,
  defaultDueDays: 7,
  typicalOrderHistoryCount: 10,
  typicalOrderIncludePartial: true,
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
