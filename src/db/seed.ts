/**
 * Seed script to create comprehensive test data for app integrity testing
 * 
 * Creates:
 * - 12 clients (6 pay now, 6 pay later with varied orders)
 * - 12 products: 4 regular (g), 4 premium (g), 4 specialty (oz/lb/kg)
 * - Multiple orders per client with varied configurations
 * - Delivery fees for some orders
 * - Due dates staggered for pay later orders
 */

import { db } from './index';
import { reserveInventory, fulfillInventory } from './products';
import { v4 as uuid } from 'uuid';

// Product definitions
const REGULAR_PRODUCTS = [
    { name: 'Blue Dream', weightPerItem: 3.5, pricePerGram: 1000 },
    { name: 'OG Kush', weightPerItem: 3.5, pricePerGram: 1000 },
    { name: 'Sour Diesel', weightPerItem: 3.5, pricePerGram: 1000 },
    { name: 'Girl Scout Cookies', weightPerItem: 3.5, pricePerGram: 1000 },
];

const PREMIUM_PRODUCTS = [
    { name: 'Runtz', weightPerItem: 3.5, pricePerGram: 1500 },
    { name: 'Gary Payton', weightPerItem: 3.5, pricePerGram: 1500 },
    { name: 'Gelato 41', weightPerItem: 3.5, pricePerGram: 1500 },
    { name: 'Ice Cream Cake', weightPerItem: 3.5, pricePerGram: 1500 },
];

// Regular specialty products (bulk pricing)
const REGULAR_SPECIALTY = [
    { name: 'Purple Punch (oz)', weightPerItem: 28, pricePerGram: 800 },     // $22.40/unit
    { name: 'Zkittlez (lb)', weightPerItem: 453.6, pricePerGram: 500 },       // $226.80/unit
];

// Premium specialty products (exclusive bulk with premium pricing)
const PREMIUM_SPECIALTY = [
    { name: 'Wedding Cake (half oz)', weightPerItem: 14, pricePerGram: 1400 },    // $19.60/unit
    { name: 'Mac 1 (oz)', weightPerItem: 28, pricePerGram: 1200 },                 // $33.60/unit
    { name: 'Jealousy (kg)', weightPerItem: 1000, pricePerGram: 900 },             // $900/unit (kilo)
    { name: 'Zaza (half kg)', weightPerItem: 500, pricePerGram: 950 },             // $475/unit (half kilo)
];

// Client names
const CLIENTS_PAY_NOW = ['Alex Chen', 'Jordan Smith', 'Casey Williams', 'Riley Johnson', 'Avery Thompson', 'Quinn Parker'];
const CLIENTS_PAY_LATER = ['Morgan Davis', 'Taylor Brown', 'Jamie Wilson', 'Drew Martinez', 'Skyler Reed', 'Blake Foster'];

// Delivery fee: 160 miles round trip, compact car @ $4.05/gal, 28 MPG
const DELIVERY_FEE_CENTS = 2325;

export async function seedTestData() {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    console.log('🌱 Seeding comprehensive test data...');

    // Clear existing data first
    console.log('🗑️ Clearing existing data...');
    await db.products.clear();
    await db.inventory.clear();
    await db.inventoryAdjustments.clear();
    await db.customers.clear();
    await db.customerTags.clear();
    await db.orders.clear();
    await db.orderItems.clear();
    await db.payments.clear();
    await db.fulfillments.clear();
    console.log('✓ Data cleared');

    // Update settings
    await db.settings.put({
        id: 'default',
        monthlyGoalCents: 2083400, // $20,834 monthly goal
        baseCostCentsPerGram: 500, // $5/gram cost
        baseSaleCentsPerGram: 1000, // $10/gram regular sale price
        premiumCostPct: 20, // Premium costs 20% more
        premiumSalePct: 30, // Charge 30% more for premium
        depositMinPctNormal: 0.40,      // 40% minimum deposit for normal orders
        holdbackPctNormal: 0.10,         // 10% holdback for normal orders
        depositMinPctOverTypical: 0.50,  // 50% deposit when order > typical
        holdbackPctOverTypical: 0.15,    // 15% holdback when over typical
        depositMinPctLate: 0.60,         // 60% deposit when client is late
        holdbackPctLate: 0.20,           // 20% holdback when late
        defaultWeightUnit: 'g',
        deliveryFeeMethod: 'gas',
        vehicleType: 'compact',
        monthlyClearedCents: 0,
        doNotAdvanceBlocksOrder: false,
        gramsDecimalPlaces: 1,
        defaultDueDays: 7,
        typicalOrderHistoryCount: 5,
        typicalOrderIncludePartial: false,
    });
    console.log('✓ Settings updated (Goal: $8,334)');

    // Track all products for order creation
    const allProducts: { id: string; name: string; weightPerItem: number; pricePerGram: number; quality: string }[] = [];

    // Create regular products (4 products, 10 units each)
    for (const prod of REGULAR_PRODUCTS) {
        const id = uuid();
        const quantity = 10;
        const totalGrams = prod.weightPerItem * quantity;

        await db.products.add({
            id,
            name: prod.name,
            quality: 'REGULAR',
            sellMode: 'WEIGHT',
            weightPerItemGrams: prod.weightPerItem,
            pricePerGramCents: prod.pricePerGram,
            isActive: true,
        });

        await db.inventory.add({
            productId: id,
            onHandGrams: totalGrams,
            reservedGrams: 0,
            onHandUnits: quantity,
            reservedUnits: 0,
            updatedAt: now,
        });

        await db.inventoryAdjustments.add({
            id: uuid(),
            productId: id,
            type: 'RESTOCK',
            gramsAdjustment: totalGrams,
            unitsAdjustment: quantity,
            note: 'Initial stock',
            createdAt: now,
        });

        allProducts.push({ id, name: prod.name, weightPerItem: prod.weightPerItem, pricePerGram: prod.pricePerGram, quality: 'REGULAR' });
        console.log(`✓ Regular: ${prod.name} (${quantity} units @ ${prod.weightPerItem}g each)`);
    }

    // Create premium products (4 products, 10 units each)
    for (const prod of PREMIUM_PRODUCTS) {
        const id = uuid();
        const quantity = 10;
        const totalGrams = prod.weightPerItem * quantity;

        await db.products.add({
            id,
            name: prod.name,
            quality: 'PREMIUM',
            sellMode: 'WEIGHT',
            weightPerItemGrams: prod.weightPerItem,
            pricePerGramCents: prod.pricePerGram,
            isActive: true,
        });

        await db.inventory.add({
            productId: id,
            onHandGrams: totalGrams,
            reservedGrams: 0,
            onHandUnits: quantity,
            reservedUnits: 0,
            updatedAt: now,
        });

        await db.inventoryAdjustments.add({
            id: uuid(),
            productId: id,
            type: 'RESTOCK',
            gramsAdjustment: totalGrams,
            unitsAdjustment: quantity,
            note: 'Initial stock',
            createdAt: now,
        });

        allProducts.push({ id, name: prod.name, weightPerItem: prod.weightPerItem, pricePerGram: prod.pricePerGram, quality: 'PREMIUM' });
        console.log(`✓ Premium: ${prod.name} (${quantity} units @ ${prod.weightPerItem}g each)`);
    }

    // Create regular specialty products (bulk pricing)
    for (const prod of REGULAR_SPECIALTY) {
        const id = uuid();
        const quantity = 10;
        const totalGrams = prod.weightPerItem * quantity;

        await db.products.add({
            id,
            name: prod.name,
            quality: 'REGULAR',
            sellMode: 'WEIGHT',
            weightPerItemGrams: prod.weightPerItem,
            pricePerGramCents: prod.pricePerGram,
            isActive: true,
        });

        await db.inventory.add({
            productId: id,
            onHandGrams: totalGrams,
            reservedGrams: 0,
            onHandUnits: quantity,
            reservedUnits: 0,
            updatedAt: now,
        });

        await db.inventoryAdjustments.add({
            id: uuid(),
            productId: id,
            type: 'RESTOCK',
            gramsAdjustment: totalGrams,
            unitsAdjustment: quantity,
            note: 'Initial stock (specialty)',
            createdAt: now,
        });

        allProducts.push({ id, name: prod.name, weightPerItem: prod.weightPerItem, pricePerGram: prod.pricePerGram, quality: 'REGULAR' });
        console.log(`✓ Regular Specialty: ${prod.name} (${quantity} units @ ${prod.weightPerItem}g each, $${(prod.pricePerGram / 100).toFixed(2)}/g)`);
    }

    // Create premium specialty products (exclusive bulk with premium pricing)
    for (const prod of PREMIUM_SPECIALTY) {
        const id = uuid();
        const quantity = 10;
        const totalGrams = prod.weightPerItem * quantity;

        await db.products.add({
            id,
            name: prod.name,
            quality: 'PREMIUM',
            sellMode: 'WEIGHT',
            weightPerItemGrams: prod.weightPerItem,
            pricePerGramCents: prod.pricePerGram,
            isActive: true,
        });

        await db.inventory.add({
            productId: id,
            onHandGrams: totalGrams,
            reservedGrams: 0,
            onHandUnits: quantity,
            reservedUnits: 0,
            updatedAt: now,
        });

        await db.inventoryAdjustments.add({
            id: uuid(),
            productId: id,
            type: 'RESTOCK',
            gramsAdjustment: totalGrams,
            unitsAdjustment: quantity,
            note: 'Initial stock (premium specialty)',
            createdAt: now,
        });

        allProducts.push({ id, name: prod.name, weightPerItem: prod.weightPerItem, pricePerGram: prod.pricePerGram, quality: 'PREMIUM' });
        console.log(`✓ Premium Specialty: ${prod.name} (${quantity} units @ ${prod.weightPerItem}g each, $${(prod.pricePerGram / 100).toFixed(2)}/g)`);
    }

    // Create Pay Now clients with multiple orders (6 clients)
    for (let i = 0; i < 6; i++) {
        const clientId = uuid();
        const clientName = CLIENTS_PAY_NOW[i];
        const hasDelivery = i < 2;

        await db.customers.add({
            id: clientId,
            name: clientName,
            defaultAddress: hasDelivery ? '123 Main St 14830' : undefined,
            createdAt: now,
            isActive: true,
        });

        // Each client gets 1-3 orders with different products
        const numOrders = (i % 3) + 1;
        for (let orderNum = 0; orderNum < numOrders; orderNum++) {
            const product = allProducts[(i + orderNum) % allProducts.length];
            const orderId = uuid();
            const quantityGrams = product.weightPerItem;
            const lineTotalCents = Math.round(quantityGrams * product.pricePerGram);
            const deliveryFeeCents = (hasDelivery && orderNum === 0) ? DELIVERY_FEE_CENTS : 0;
            const totalCents = lineTotalCents + deliveryFeeCents;

            await db.orders.add({
                id: orderId,
                customerId: clientId,
                createdAt: now - (orderNum * oneDay),
                status: 'CLOSED',
                fulfillmentMethod: deliveryFeeCents > 0 ? 'DELIVERY' : 'PICKUP',
                deliveryAddress: deliveryFeeCents > 0 ? '123 Main St 14830' : undefined,
                deliveryFeeCents,
            });

            await db.orderItems.add({
                id: uuid(),
                orderId,
                productId: product.id,
                quantityGrams,
                quantityUnits: 1,
                pricePerGramCentsSnapshot: product.pricePerGram,
                lineTotalCents,
            });

            await fulfillInventory(product.id, quantityGrams, 1);

            await db.payments.add({
                id: uuid(),
                orderId,
                createdAt: now - (orderNum * oneDay),
                amountCents: totalCents,
                method: 'CASH',
            });

            await db.fulfillments.add({
                id: uuid(),
                orderId,
                createdAt: now - (orderNum * oneDay),
                deliveredGrams: quantityGrams,
                deliveredUnits: 1,
                event: 'PICKED_UP',
            });
        }

        console.log(`✓ Pay Now: ${clientName} (${numOrders} order${numOrders > 1 ? 's' : ''}, fully paid)`);
    }

    // Create Pay Later clients with varied orders (6 clients)
    for (let i = 0; i < 6; i++) {
        const clientId = uuid();
        const clientName = CLIENTS_PAY_LATER[i];
        const hasDelivery = i < 2;
        const daysUntilDue = (i % 5) + 1;

        await db.customers.add({
            id: clientId,
            name: clientName,
            defaultAddress: hasDelivery ? '456 Oak Ave 14850' : undefined,
            createdAt: now,
            isActive: true,
        });

        // Each Pay Later client gets 2-4 orders with deeper catalog investment
        const numOrders = (i % 3) + 2;
        for (let orderNum = 0; orderNum < numOrders; orderNum++) {
            const product = allProducts[(i * 2 + orderNum) % allProducts.length];
            const orderId = uuid();
            const quantityGrams = product.weightPerItem * (orderNum + 1); // Increasing quantities
            const quantityUnits = orderNum + 1;
            const lineTotalCents = Math.round(quantityGrams * product.pricePerGram);
            const deliveryFeeCents = (hasDelivery && orderNum === 0) ? DELIVERY_FEE_CENTS : 0;
            const totalCents = lineTotalCents + deliveryFeeCents;
            const depositCents = Math.round(lineTotalCents * 0.4) + deliveryFeeCents;

            await db.orders.add({
                id: orderId,
                customerId: clientId,
                createdAt: now,
                status: 'OPEN',
                fulfillmentMethod: deliveryFeeCents > 0 ? 'DELIVERY' : 'PICKUP',
                deliveryAddress: deliveryFeeCents > 0 ? '456 Oak Ave 14850' : undefined,
                deliveryFeeCents,
                dueAt: now + ((daysUntilDue + orderNum) * oneDay),
            });

            await db.orderItems.add({
                id: uuid(),
                orderId,
                productId: product.id,
                quantityGrams,
                quantityUnits,
                pricePerGramCentsSnapshot: product.pricePerGram,
                lineTotalCents,
            });

            await reserveInventory(product.id, quantityGrams, quantityUnits);

            const fulfillRatio = depositCents / totalCents;
            const gramsToGive = Math.round(quantityGrams * fulfillRatio * 10) / 10;
            const unitsToGive = Math.floor(gramsToGive / product.weightPerItem);

            if (gramsToGive > 0) {
                await fulfillInventory(product.id, gramsToGive, unitsToGive);
            }

            await db.payments.add({
                id: uuid(),
                orderId,
                createdAt: now,
                amountCents: depositCents,
                method: 'CASH',
            });

            await db.fulfillments.add({
                id: uuid(),
                orderId,
                createdAt: now,
                deliveredGrams: gramsToGive,
                deliveredUnits: unitsToGive,
                event: 'PICKED_UP',
            });
        }

        const totalOrders = numOrders;
        console.log(`✓ Pay Later: ${clientName} (${totalOrders} orders, due in ${daysUntilDue}+ days)`);
    }

    console.log('\n✅ Seed complete! Created:');
    console.log('   - 6 Regular products (4 standard + 2 specialty bulk)');
    console.log('   - 8 Premium products (4 standard + 4 specialty bulk)');
    console.log('   - 6 Pay Now clients with 1-3 closed orders each');
    console.log('   - 6 Pay Later clients with 2-4 open orders each');
    console.log('   - Monthly goal: $1,000,000');
    console.log('   - Policy: 40% deposit, 10% holdback');
}

// Export for use in browser console or dev tools
(window as any).seedTestData = seedTestData;
