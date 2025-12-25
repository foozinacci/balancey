/**
 * Demo Seed Data
 * Run this to populate the app with demo orders
 */

import { db } from './index';
import { createCustomer } from './customers';
import { createProduct, adjustInventory } from './products';
import { createOrder } from './orders';
import { updateSettings } from './index';
import type { PaymentMethod } from '../types';

// Get a due date for day of current month
function getDueDate(dayOfMonth: number): number {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), dayOfMonth, 23, 59, 59).getTime();
}

export async function seedDemoData() {
    console.log('🌱 Seeding demo data...');

    // Clear existing data first
    await db.orderItems.clear();
    await db.payments.clear();
    await db.fulfillments.clear();
    await db.orders.clear();
    await db.inventoryAdjustments.clear();
    await db.inventory.clear();
    await db.products.clear();
    await db.customerTags.clear();
    await db.customers.clear();

    // Set monthly goal to $3,000
    await updateSettings({ monthlyGoalCents: 300000 });

    // Create products with 500g stock each (more than 2x demand)
    console.log('Creating products...');
    const premium = await createProduct({
        name: 'Premium',
        quality: 'PREMIUM',
        sellMode: 'WEIGHT',
        pricePerGramCents: 2000, // $20/g
    });
    await adjustInventory(premium.id, 'RESTOCK', 500, 0, 'Initial stock');

    const regular = await createProduct({
        name: 'Regular',
        quality: 'REGULAR',
        sellMode: 'WEIGHT',
        pricePerGramCents: 1000, // $10/g
    });
    await adjustInventory(regular.id, 'RESTOCK', 500, 0, 'Initial stock');

    console.log('Products created:', premium.id, regular.id);

    // Create customers and their orders
    // Dates are staggered throughout the current month
    console.log('Creating customers and orders...');

    // Premium customers (15 customers, orders staggered)
    const premiumOrders: {
        name: string;
        orders: { orderDay: number; grams: number; paid: number; dueDay: number }[];
    }[] = [
            { name: 'Aiden', orders: [{ orderDay: 3, grams: 7, paid: 60, dueDay: 20 }] },
            { name: 'Bella', orders: [{ orderDay: 4, grams: 14, paid: 100, dueDay: 28 }] },
            { name: 'Carlos', orders: [{ orderDay: 4, grams: 3.5, paid: 30, dueDay: 25 }] },
            {
                name: 'Danielle', orders: [
                    { orderDay: 5, grams: 7, paid: 50, dueDay: 29 },
                    { orderDay: 22, grams: 3.5, paid: 20, dueDay: 31 },
                ]
            },
            { name: 'Eli', orders: [{ orderDay: 6, grams: 28, paid: 200, dueDay: 26 }] },
            { name: 'Fatima', orders: [{ orderDay: 7, grams: 10, paid: 80, dueDay: 27 }] },
            { name: 'Gabe', orders: [{ orderDay: 8, grams: 21, paid: 150, dueDay: 30 }] },
            { name: 'Hannah', orders: [{ orderDay: 9, grams: 14, paid: 120, dueDay: 28 }] },
            { name: 'Ivan', orders: [{ orderDay: 10, grams: 5, paid: 40, dueDay: 28 }] },
            { name: 'Jade', orders: [{ orderDay: 11, grams: 12, paid: 90, dueDay: 29 }] },
            { name: 'Khalil', orders: [{ orderDay: 12, grams: 17.5, paid: 140, dueDay: 26 }] },
            { name: 'Luna', orders: [{ orderDay: 13, grams: 7, paid: 70, dueDay: 27 }] },
            { name: 'Marcus', orders: [{ orderDay: 14, grams: 28, paid: 250, dueDay: 30 }] },
            { name: 'Nina', orders: [{ orderDay: 15, grams: 7, paid: 50, dueDay: 29 }] },
            {
                name: 'Omar', orders: [
                    { orderDay: 10, grams: 14, paid: 110, dueDay: 28 },
                    { orderDay: 20, grams: 7, paid: 60, dueDay: 30 },
                ]
            },
        ];

    for (const { name, orders } of premiumOrders) {
        const customer = await createCustomer({ name });
        for (const order of orders) {
            await createOrder({
                customerId: customer.id,
                items: [{
                    productId: premium.id,
                    quantityGrams: order.grams,
                    pricePerGramCents: 2000,
                }],
                initialPaymentCents: order.paid * 100,
                paymentMethod: 'CASH' as PaymentMethod,
                fulfillmentMethod: 'PICKUP',
                deliveryFeeCents: 0,
                dueAt: getDueDate(order.dueDay),
            });
        }
    }

    // Regular customers (5 customers)
    const regularOrders: {
        name: string;
        orders: { orderDay: number; grams: number; paid: number; dueDay: number }[];
    }[] = [
            { name: 'Paige', orders: [{ orderDay: 4, grams: 7, paid: 30, dueDay: 25 }] },
            { name: 'Quentin', orders: [{ orderDay: 8, grams: 3.5, paid: 15, dueDay: 28 }] },
            {
                name: 'Rosa', orders: [
                    { orderDay: 12, grams: 14, paid: 60, dueDay: 25 },
                    { orderDay: 18, grams: 7, paid: 20, dueDay: 31 },
                ]
            },
            { name: 'Sam', orders: [{ orderDay: 6, grams: 5, paid: 20, dueDay: 28 }] },
            { name: 'Tori', orders: [{ orderDay: 15, grams: 10, paid: 40, dueDay: 28 }] },
        ];

    for (const { name, orders } of regularOrders) {
        const customer = await createCustomer({ name });
        for (const order of orders) {
            await createOrder({
                customerId: customer.id,
                items: [{
                    productId: regular.id,
                    quantityGrams: order.grams,
                    pricePerGramCents: 1000,
                }],
                initialPaymentCents: order.paid * 100,
                paymentMethod: 'CASH' as PaymentMethod,
                fulfillmentMethod: 'PICKUP',
                deliveryFeeCents: 0,
                dueAt: getDueDate(order.dueDay),
            });
        }
    }

    console.log('✅ Demo data seeded successfully!');
    console.log('Premium customers: 15');
    console.log('Regular customers: 5');
    console.log('Total orders: 22');
    console.log('Monthly goal: $3,000');
    console.log('Inventory: 500g Premium, 500g Regular');
}
