import { v4 as uuid } from 'uuid';
import { db } from './index';
import type { Customer, CustomerTagRecord, CustomerWithBalance, CustomerTag } from '../types';
import { computeTypicalOrderStats } from '../utils/typicalOrder';

// Create a new customer
export async function createCustomer(
  data: Omit<Customer, 'id' | 'createdAt' | 'isActive'>
): Promise<Customer> {
  const customer: Customer = {
    id: uuid(),
    createdAt: Date.now(),
    isActive: true,
    ...data,
  };
  await db.customers.add(customer);

  // Add NEW tag
  await addCustomerTag(customer.id, 'NEW', 'New customer');

  return customer;
}

// Update a customer
export async function updateCustomer(
  id: string,
  updates: Partial<Customer>
): Promise<void> {
  await db.customers.update(id, updates);
}

// Get a customer by ID
export async function getCustomer(id: string): Promise<Customer | undefined> {
  return db.customers.get(id);
}

// Get all active customers
export async function getActiveCustomers(): Promise<Customer[]> {
  return db.customers.filter(c => c.isActive === true).toArray();
}

// Get all customers
export async function getAllCustomers(): Promise<Customer[]> {
  return db.customers.toArray();
}

// Add a tag to a customer
export async function addCustomerTag(
  customerId: string,
  tag: CustomerTag,
  reason?: string,
  expiresAt?: number
): Promise<CustomerTagRecord> {
  // Remove existing tag of same type first
  const existingTags = await db.customerTags
    .where('customerId')
    .equals(customerId)
    .toArray();
  const toDelete = existingTags.filter((t) => t.tag === tag).map((t) => t.id);
  if (toDelete.length > 0) {
    await db.customerTags.bulkDelete(toDelete);
  }

  const tagRecord: CustomerTagRecord = {
    id: uuid(),
    customerId,
    tag,
    createdAt: Date.now(),
    reason,
    expiresAt,
  };
  await db.customerTags.add(tagRecord);
  return tagRecord;
}

// Remove a tag from a customer
export async function removeCustomerTag(
  customerId: string,
  tag: CustomerTag
): Promise<void> {
  const existingTags = await db.customerTags
    .where('customerId')
    .equals(customerId)
    .toArray();
  const toDelete = existingTags.filter((t) => t.tag === tag).map((t) => t.id);
  if (toDelete.length > 0) {
    await db.customerTags.bulkDelete(toDelete);
  }
}

// Get tags for a customer
export async function getCustomerTags(
  customerId: string
): Promise<CustomerTagRecord[]> {
  const now = Date.now();
  const tags = await db.customerTags
    .where('customerId')
    .equals(customerId)
    .toArray();
  // Filter out expired tags
  return tags.filter((t) => !t.expiresAt || t.expiresAt > now);
}

// Calculate customer balance
export async function calculateCustomerBalance(
  customerId: string
): Promise<number> {
  // Get all open/partial orders for this customer
  const orders = await db.orders
    .where('customerId')
    .equals(customerId)
    .filter((o) => o.status === 'OPEN' || o.status === 'PARTIAL')
    .toArray();

  let totalOwed = 0;

  for (const order of orders) {
    // Get order items
    const items = await db.orderItems.where('orderId').equals(order.id).toArray();
    const subtotal = items.reduce((sum, item) => sum + item.lineTotalCents, 0);
    const orderTotal = subtotal + order.deliveryFeeCents;

    // Get payments
    const payments = await db.payments.where('orderId').equals(order.id).toArray();
    const paid = payments.reduce((sum, p) => sum + p.amountCents, 0);

    totalOwed += Math.max(0, orderTotal - paid);
  }

  return totalOwed;
}

// Get customer with balance and enriched data
export async function getCustomerWithBalance(
  customerId: string
): Promise<CustomerWithBalance | null> {
  const customer = await getCustomer(customerId);
  if (!customer) return null;

  const [balanceDueCents, tags, typicalStats, lastOrder] = await Promise.all([
    calculateCustomerBalance(customerId),
    getCustomerTags(customerId),
    computeTypicalOrderStats(customerId),
    db.orders
      .where('customerId')
      .equals(customerId)
      .reverse()
      .sortBy('createdAt')
      .then((orders) => orders[0]),
  ]);

  return {
    ...customer,
    balanceDueCents,
    tags,
    typicalGrams: typicalStats?.medianGrams,
    upperNormalGrams: typicalStats?.upperNormal,
    lastActivityAt: lastOrder?.createdAt,
    isLate: tags.some((t) => t.tag === 'LATE'),
  };
}

// Get all customers with balances
export async function getAllCustomersWithBalances(): Promise<CustomerWithBalance[]> {
  const customers = await getActiveCustomers();
  const enriched = await Promise.all(
    customers.map((c) => getCustomerWithBalance(c.id))
  );
  return enriched.filter((c): c is CustomerWithBalance => c !== null);
}

// Check and update late status for all customers
export async function updateLateStatuses(): Promise<void> {
  const now = Date.now();

  // Find all open/partial orders that are past due
  const overdueOrders = await db.orders
    .filter(
      (o) =>
        (o.status === 'OPEN' || o.status === 'PARTIAL') &&
        o.dueAt !== undefined &&
        o.dueAt < now &&
        !o.lateAt
    )
    .toArray();

  for (const order of overdueOrders) {
    // Check if balance is due
    const items = await db.orderItems.where('orderId').equals(order.id).toArray();
    const subtotal = items.reduce((sum, item) => sum + item.lineTotalCents, 0);
    const orderTotal = subtotal + order.deliveryFeeCents;
    const payments = await db.payments.where('orderId').equals(order.id).toArray();
    const paid = payments.reduce((sum, p) => sum + p.amountCents, 0);

    if (orderTotal - paid > 0) {
      // Mark order as late
      await db.orders.update(order.id, { lateAt: now });

      // Add LATE tag to customer
      await addCustomerTag(order.customerId, 'LATE', `Overdue order from ${new Date(order.createdAt).toLocaleDateString()}`);
    }
  }

  // Clear LATE tags for customers with no overdue orders
  const customers = await getActiveCustomers();
  for (const customer of customers) {
    const hasOverdue = await db.orders
      .where('customerId')
      .equals(customer.id)
      .filter(
        (o) =>
          (o.status === 'OPEN' || o.status === 'PARTIAL') &&
          o.dueAt !== undefined &&
          o.dueAt < now
      )
      .first();

    if (!hasOverdue) {
      await removeCustomerTag(customer.id, 'LATE');
    }
  }
}
