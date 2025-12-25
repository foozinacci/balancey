// Core enums
export type Quality = 'REGULAR' | 'PREMIUM';
export type SellMode = 'WEIGHT' | 'UNIT' | 'BOTH';
export type OrderStatus = 'OPEN' | 'PARTIAL' | 'CLOSED' | 'CANCELLED';
export type FulfillmentMethod = 'PICKUP' | 'DELIVERY';
export type FulfillmentEvent = 'READY' | 'OUT_FOR_DELIVERY' | 'PICKED_UP' | 'DELIVERED';
export type PaymentMethod = 'CASH' | 'CARD' | 'OTHER';
export type CustomerTag = 'LATE' | 'DO_NOT_ADVANCE' | 'VIP' | 'RELIABLE' | 'NEW';
export type WeightUnit = 'g' | 'kg' | 'oz' | 'lb';
export type InventoryAdjustmentType = 'RESTOCK' | 'WASTE' | 'CORRECTION';

// Customer
export interface Customer {
  id: string;
  name: string;
  createdAt: number;
  isActive: boolean;
  defaultFulfillmentMethod?: FulfillmentMethod;
  defaultAddress?: string;
  notes?: string;
}

export interface CustomerTagRecord {
  id: string;
  customerId: string;
  tag: CustomerTag;
  createdAt: number;
  expiresAt?: number;
  reason?: string;
}

// Product
export interface Product {
  id: string;
  name: string;
  quality: Quality;
  sellMode: SellMode;
  pricePerGramCents?: number;
  unitName?: string;
  pricePerUnitCents?: number;
  isActive: boolean;
}

// Inventory
export interface Inventory {
  productId: string;
  onHandGrams: number;
  reservedGrams: number;
  onHandUnits: number;
  reservedUnits: number;
  updatedAt: number;
}

export interface InventoryAdjustment {
  id: string;
  productId: string;
  type: InventoryAdjustmentType;
  gramsAdjustment: number;
  unitsAdjustment: number;
  note: string;
  createdAt: number;
}

// Order
export interface Order {
  id: string;
  customerId: string;
  createdAt: number;
  status: OrderStatus;
  fulfillmentMethod: FulfillmentMethod;
  deliveryAddress?: string;
  deliveryFeeCents: number;
  dueAt?: number;
  lateAt?: number;
  notes?: string;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  quantityGrams?: number;
  quantityUnits?: number;
  pricePerGramCentsSnapshot?: number;
  pricePerUnitCentsSnapshot?: number;
  lineTotalCents: number;
}

export interface Payment {
  id: string;
  orderId: string;
  createdAt: number;
  amountCents: number;
  method: PaymentMethod;
  note?: string;
}

export interface Fulfillment {
  id: string;
  orderId: string;
  createdAt: number;
  deliveredGrams?: number;
  deliveredUnits?: number;
  event: FulfillmentEvent;
  note?: string;
}

// Order Policy Snapshot
export interface OrderPolicy {
  orderId: string;
  computedTypicalGrams?: number;
  computedTypicalUnits?: number;
  computedUpperNormalGrams?: number;
  computedUpperNormalUnits?: number;
  isOverTypical: boolean;
  appliedHoldbackPct: number;
  appliedDepositMinPct: number;
  computedDeliverNowGrams?: number;
  computedDeliverNowUnits?: number;
  computedWithheldGrams?: number;
  computedWithheldUnits?: number;
}

// Settings
export interface Settings {
  id: string;
  // Monthly goal tracking
  monthlyGoalCents?: number;
  monthlyClearedCents?: number; // Accumulated total from cleared paid orders
  currentMonthStart?: number; // Timestamp of current month start
  // Policy defaults
  depositMinPctNormal: number;
  holdbackPctNormal: number;
  depositMinPctOverTypical: number;
  holdbackPctOverTypical: number;
  depositMinPctLate: number;
  holdbackPctLate: number;
  // Premium pricing
  premiumCostPct?: number; // % extra that premium costs you (your cost)
  premiumSalePct?: number; // % extra to charge customers for premium
  // Behavior
  doNotAdvanceBlocksOrder: boolean;
  maxAdvanceGrams?: number;
  maxOutstandingCents?: number;
  // Presets
  presetWeights: number[];
  // Display
  defaultWeightUnit: WeightUnit;
  gramsDecimalPlaces: number;
  timezone?: string; // IANA timezone, e.g. "America/New_York"
  // Due date
  defaultDueDays: number;
  // Typical order
  typicalOrderHistoryCount: number;
  typicalOrderIncludePartial: boolean;
  // Legacy (deprecated)
  dailyGoalCents?: number;
}

// Backup format
export interface BackupData {
  schemaVersion: number;
  exportedAt: number;
  customers: Customer[];
  customerTags: CustomerTagRecord[];
  products: Product[];
  inventory: Inventory[];
  inventoryAdjustments: InventoryAdjustment[];
  orders: Order[];
  orderItems: OrderItem[];
  payments: Payment[];
  fulfillments: Fulfillment[];
  orderPolicies: OrderPolicy[];
  settings: Settings;
}

// Computed types for UI
export interface CustomerWithBalance extends Customer {
  balanceDueCents: number;
  tags: CustomerTagRecord[];
  typicalGrams?: number;
  upperNormalGrams?: number;
  lastActivityAt?: number;
  isLate: boolean;
  orderCount: number; // Number of orders for this client
}

export interface OrderWithDetails extends Order {
  items: OrderItem[];
  payments: Payment[];
  fulfillments: Fulfillment[];
  policy?: OrderPolicy;
  orderSubtotalCents: number;
  paidTotalCents: number;
  balanceDueCents: number;
  requestedTotalGrams: number;
  requestedTotalUnits: number;
  deliveredTotalGrams: number;
  deliveredTotalUnits: number;
  owedRemainingGrams: number;
  owedRemainingUnits: number;
}

export interface ProductWithInventory extends Product {
  inventory: Inventory;
  availableGrams: number;
  availableUnits: number;
}
