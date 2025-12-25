import { v4 as uuid } from 'uuid';
import { db, getSettings } from './index';
import { reserveInventory, releaseReservedInventory, fulfillInventory } from './products';
import { getCustomerTags } from './customers';
import { computeTypicalOrderStats, isOverTypical } from '../utils/typicalOrder';
import { determinePolicy, computeDeliverNow } from '../utils/policyEngine';
import { getDefaultDueDate } from '../utils/units';
import type {
  Order,
  OrderItem,
  Payment,
  Fulfillment,
  OrderPolicy,
  OrderWithDetails,
  FulfillmentMethod,
  PaymentMethod,
  FulfillmentEvent,
} from '../types';

// Create a new order
export interface CreateOrderInput {
  customerId: string;
  items: Array<{
    productId: string;
    quantityGrams?: number;
    quantityUnits?: number;
    pricePerGramCents?: number;
    pricePerUnitCents?: number;
  }>;
  fulfillmentMethod: FulfillmentMethod;
  deliveryAddress?: string;
  deliveryFeeCents?: number;
  initialPaymentCents?: number;
  paymentMethod?: PaymentMethod;
  notes?: string;
}

export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const settings = await getSettings();
  const now = Date.now();

  // Calculate totals
  let subtotalCents = 0;
  const orderItems: Omit<OrderItem, 'id'>[] = [];

  for (const item of input.items) {
    let lineTotalCents = 0;

    if (item.quantityGrams && item.pricePerGramCents) {
      lineTotalCents = Math.round(item.quantityGrams * item.pricePerGramCents);
    } else if (item.quantityUnits && item.pricePerUnitCents) {
      lineTotalCents = Math.round(item.quantityUnits * item.pricePerUnitCents);
    }

    subtotalCents += lineTotalCents;

    orderItems.push({
      orderId: '', // Will be set after order is created
      productId: item.productId,
      quantityGrams: item.quantityGrams,
      quantityUnits: item.quantityUnits,
      pricePerGramCentsSnapshot: item.pricePerGramCents,
      pricePerUnitCentsSnapshot: item.pricePerUnitCents,
      lineTotalCents,
    });
  }

  const orderTotal = subtotalCents + (input.deliveryFeeCents ?? 0);
  const paidNow = input.initialPaymentCents ?? 0;
  const balanceDue = orderTotal - paidNow;

  // Create order
  const order: Order = {
    id: uuid(),
    customerId: input.customerId,
    createdAt: now,
    status: balanceDue <= 0 ? 'CLOSED' : 'OPEN',
    fulfillmentMethod: input.fulfillmentMethod,
    deliveryAddress: input.deliveryAddress,
    deliveryFeeCents: input.deliveryFeeCents ?? 0,
    dueAt: balanceDue > 0 ? getDefaultDueDate(settings.defaultDueDays) : undefined,
    notes: input.notes,
  };

  await db.orders.add(order);

  // Create order items
  for (const itemData of orderItems) {
    const item: OrderItem = {
      ...itemData,
      id: uuid(),
      orderId: order.id,
    };
    await db.orderItems.add(item);

    // Reserve inventory
    await reserveInventory(
      item.productId,
      item.quantityGrams ?? 0,
      item.quantityUnits ?? 0
    );
  }

  // Create initial payment if provided
  if (paidNow > 0 && input.paymentMethod) {
    const payment: Payment = {
      id: uuid(),
      orderId: order.id,
      createdAt: now,
      amountCents: paidNow,
      method: input.paymentMethod,
    };
    await db.payments.add(payment);
  }

  // Compute and store policy snapshot
  await saveOrderPolicy(order.id, input.customerId, orderItems, paidNow, settings);

  return order;
}

// Save order policy snapshot
async function saveOrderPolicy(
  orderId: string,
  customerId: string,
  items: Omit<OrderItem, 'id'>[],
  paidNowCents: number,
  settings: Awaited<ReturnType<typeof getSettings>>
): Promise<void> {
  const tags = await getCustomerTags(customerId);
  const typicalStats = await computeTypicalOrderStats(customerId, undefined, settings);

  const totalGrams = items.reduce((sum, i) => sum + (i.quantityGrams ?? 0), 0);
  const totalUnits = items.reduce((sum, i) => sum + (i.quantityUnits ?? 0), 0);
  const subtotal = items.reduce((sum, i) => sum + i.lineTotalCents, 0);

  const overTypical = isOverTypical(totalGrams, typicalStats);
  const policy = determinePolicy(tags, overTypical, settings);

  // Get average price per gram/unit for delivery calculation
  const avgPricePerGram =
    totalGrams > 0 ? Math.round(subtotal / totalGrams) : undefined;
  const avgPricePerUnit =
    totalUnits > 0 ? Math.round(subtotal / totalUnits) : undefined;

  const deliverNow = computeDeliverNow(
    paidNowCents,
    subtotal,
    totalGrams,
    totalUnits,
    avgPricePerGram,
    avgPricePerUnit,
    policy
  );

  const orderPolicy: OrderPolicy = {
    orderId,
    computedTypicalGrams: typicalStats?.medianGrams,
    computedTypicalUnits: undefined,
    computedUpperNormalGrams: typicalStats?.upperNormal,
    computedUpperNormalUnits: undefined,
    isOverTypical: overTypical,
    appliedHoldbackPct: policy.holdbackPct,
    appliedDepositMinPct: policy.depositMinPct,
    computedDeliverNowGrams: deliverNow.deliverNowGrams,
    computedDeliverNowUnits: deliverNow.deliverNowUnits,
    computedWithheldGrams: deliverNow.withheldGrams,
    computedWithheldUnits: deliverNow.withheldUnits,
  };

  await db.orderPolicies.put(orderPolicy);
}

// Add payment to an order
export async function addPayment(
  orderId: string,
  amountCents: number,
  method: PaymentMethod,
  note?: string
): Promise<Payment> {
  const payment: Payment = {
    id: uuid(),
    orderId,
    createdAt: Date.now(),
    amountCents,
    method,
    note,
  };

  await db.payments.add(payment);

  // Update order status
  await updateOrderStatus(orderId);

  return payment;
}

// Add fulfillment to an order
export async function addFulfillment(
  orderId: string,
  event: FulfillmentEvent,
  deliveredGrams?: number,
  deliveredUnits?: number,
  note?: string
): Promise<Fulfillment> {
  const fulfillment: Fulfillment = {
    id: uuid(),
    orderId,
    createdAt: Date.now(),
    deliveredGrams,
    deliveredUnits,
    event,
    note,
  };

  await db.fulfillments.add(fulfillment);

  // If this is a pickup or delivery completion, update inventory
  if (event === 'PICKED_UP' || event === 'DELIVERED') {
    const items = await db.orderItems.where('orderId').equals(orderId).toArray();

    for (const item of items) {
      // For now, use proportional fulfillment based on what was delivered
      const itemGrams = item.quantityGrams ?? 0;
      const itemUnits = item.quantityUnits ?? 0;

      // Simple approach: fulfill the entire item when any fulfillment happens
      // In a more complex system, we'd track per-item fulfillment
      await fulfillInventory(item.productId, itemGrams, itemUnits);
    }
  }

  // Update order status
  await updateOrderStatus(orderId);

  return fulfillment;
}

// Update order status based on payments and fulfillments
async function updateOrderStatus(orderId: string): Promise<void> {
  const order = await db.orders.get(orderId);
  if (!order || order.status === 'CANCELLED') return;

  const items = await db.orderItems.where('orderId').equals(orderId).toArray();
  const payments = await db.payments.where('orderId').equals(orderId).toArray();
  const fulfillments = await db.fulfillments.where('orderId').equals(orderId).toArray();

  const subtotal = items.reduce((sum, i) => sum + i.lineTotalCents, 0);
  const orderTotal = subtotal + order.deliveryFeeCents;
  const paidTotal = payments.reduce((sum, p) => sum + p.amountCents, 0);
  const balanceDue = orderTotal - paidTotal;

  const requestedGrams = items.reduce((sum, i) => sum + (i.quantityGrams ?? 0), 0);
  const requestedUnits = items.reduce((sum, i) => sum + (i.quantityUnits ?? 0), 0);
  const deliveredGrams = fulfillments.reduce(
    (sum, f) => sum + (f.deliveredGrams ?? 0),
    0
  );
  const deliveredUnits = fulfillments.reduce(
    (sum, f) => sum + (f.deliveredUnits ?? 0),
    0
  );

  const fullyPaid = balanceDue <= 0;
  const fullyDelivered =
    deliveredGrams >= requestedGrams && deliveredUnits >= requestedUnits;

  let newStatus = order.status;

  if (fullyPaid && fullyDelivered) {
    newStatus = 'CLOSED';
  } else if (paidTotal > 0 || deliveredGrams > 0 || deliveredUnits > 0) {
    newStatus = 'PARTIAL';
  } else {
    newStatus = 'OPEN';
  }

  if (newStatus !== order.status) {
    await db.orders.update(orderId, { status: newStatus });
  }
}

// Cancel an order
export async function cancelOrder(orderId: string): Promise<void> {
  const order = await db.orders.get(orderId);
  if (!order) return;

  // Release reserved inventory
  const items = await db.orderItems.where('orderId').equals(orderId).toArray();
  for (const item of items) {
    await releaseReservedInventory(
      item.productId,
      item.quantityGrams ?? 0,
      item.quantityUnits ?? 0
    );
  }

  await db.orders.update(orderId, { status: 'CANCELLED' });
}

// Get order with full details
export async function getOrderWithDetails(
  orderId: string
): Promise<OrderWithDetails | null> {
  const order = await db.orders.get(orderId);
  if (!order) return null;

  const [items, payments, fulfillments, policy] = await Promise.all([
    db.orderItems.where('orderId').equals(orderId).toArray(),
    db.payments.where('orderId').equals(orderId).toArray(),
    db.fulfillments.where('orderId').equals(orderId).toArray(),
    db.orderPolicies.get(orderId),
  ]);

  const subtotal = items.reduce((sum, i) => sum + i.lineTotalCents, 0);
  const orderSubtotalCents = subtotal + order.deliveryFeeCents;
  const paidTotalCents = payments.reduce((sum, p) => sum + p.amountCents, 0);

  const requestedTotalGrams = items.reduce((sum, i) => sum + (i.quantityGrams ?? 0), 0);
  const requestedTotalUnits = items.reduce((sum, i) => sum + (i.quantityUnits ?? 0), 0);
  const deliveredTotalGrams = fulfillments.reduce(
    (sum, f) => sum + (f.deliveredGrams ?? 0),
    0
  );
  const deliveredTotalUnits = fulfillments.reduce(
    (sum, f) => sum + (f.deliveredUnits ?? 0),
    0
  );

  return {
    ...order,
    items,
    payments,
    fulfillments,
    policy: policy ?? undefined,
    orderSubtotalCents,
    paidTotalCents,
    balanceDueCents: Math.max(0, orderSubtotalCents - paidTotalCents),
    requestedTotalGrams,
    requestedTotalUnits,
    deliveredTotalGrams,
    deliveredTotalUnits,
    owedRemainingGrams: Math.max(0, requestedTotalGrams - deliveredTotalGrams),
    owedRemainingUnits: Math.max(0, requestedTotalUnits - deliveredTotalUnits),
  };
}

// Get orders for a customer
export async function getCustomerOrders(
  customerId: string
): Promise<OrderWithDetails[]> {
  const orders = await db.orders
    .where('customerId')
    .equals(customerId)
    .reverse()
    .sortBy('createdAt');

  const details = await Promise.all(
    orders.map((o) => getOrderWithDetails(o.id))
  );

  return details.filter((d): d is OrderWithDetails => d !== null);
}

// Get all open orders
export async function getOpenOrders(): Promise<OrderWithDetails[]> {
  const orders = await db.orders
    .filter((o) => o.status === 'OPEN' || o.status === 'PARTIAL')
    .toArray();

  const details = await Promise.all(
    orders.map((o) => getOrderWithDetails(o.id))
  );

  return details.filter((d): d is OrderWithDetails => d !== null);
}

// Create a balance carryover (for migrating from notepad)
export async function createBalanceCarryover(
  customerId: string,
  amountCents: number,
  note?: string
): Promise<Order> {
  const now = Date.now();
  const settings = await getSettings();

  const order: Order = {
    id: uuid(),
    customerId,
    createdAt: now,
    status: 'OPEN',
    fulfillmentMethod: 'PICKUP',
    deliveryFeeCents: 0,
    dueAt: getDefaultDueDate(settings.defaultDueDays),
    notes: note ?? 'Balance carryover from previous system',
  };

  await db.orders.add(order);

  // Create a virtual order item for the balance
  const item: OrderItem = {
    id: uuid(),
    orderId: order.id,
    productId: 'CARRYOVER',
    quantityGrams: 0,
    quantityUnits: 0,
    lineTotalCents: amountCents,
  };

  await db.orderItems.add(item);

  return order;
}
