/**
 * Hook to check for payment reminders and show notifications
 */

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import {
    requestNotificationPermission,
    showNotification,
    isDueSoon,
    isOverdue,
    formatTimeUntilDue
} from '../utils/notifications';
import type { Order } from '../types';

interface OrderWithCustomer extends Order {
    customerName?: string;
    totalCents: number;
    paidCents: number;
}

interface ReminderInfo {
    overdueOrders: OrderWithCustomer[];
    dueSoonOrders: OrderWithCustomer[];
    hasReminders: boolean;
}

export function usePaymentReminders(): ReminderInfo {
    const [lastNotified, setLastNotified] = useState<number>(0);

    // Get all open orders with due dates and customer names
    const ordersWithCustomers = useLiveQuery(async () => {
        const orders = await db.orders
            .filter(o => o.status === 'OPEN' && o.dueAt !== undefined)
            .toArray();

        // Fetch customer names, totals, and paid amounts for each order
        const ordersWithDetails: OrderWithCustomer[] = await Promise.all(
            orders.map(async (order) => {
                const customer = await db.customers.get(order.customerId);

                // Get order items to calculate total
                const items = await db.orderItems.filter(i => i.orderId === order.id).toArray();
                const itemsTotal = items.reduce((sum, item) => sum + item.lineTotalCents, 0);
                const totalCents = itemsTotal + (order.deliveryFeeCents ?? 0);

                // Get payments to calculate paid
                const payments = await db.payments.filter(p => p.orderId === order.id).toArray();
                const paidCents = payments.reduce((sum, p) => sum + p.amountCents, 0);

                return {
                    ...order,
                    customerName: customer?.name ?? 'Unknown',
                    totalCents,
                    paidCents,
                };
            })
        );

        return ordersWithDetails;
    }, []);

    const overdueOrders = (ordersWithCustomers ?? []).filter(o => o.dueAt && isOverdue(o.dueAt));
    const dueSoonOrders = (ordersWithCustomers ?? []).filter(o =>
        o.dueAt && isDueSoon(o.dueAt) && !isOverdue(o.dueAt)
    );

    // Request notification permission on mount
    useEffect(() => {
        requestNotificationPermission();
    }, []);

    // Show notification for overdue/due soon orders (once per hour)
    useEffect(() => {
        const now = Date.now();
        const hoursSinceLastNotification = (now - lastNotified) / (1000 * 60 * 60);

        // Only notify once per hour
        if (hoursSinceLastNotification < 1) return;

        if (overdueOrders.length > 0) {
            const first = overdueOrders[0];
            const balanceCents = first.totalCents - first.paidCents;
            const balanceStr = `$${(balanceCents / 100).toFixed(2)}`;
            const message = overdueOrders.length === 1
                ? `${first.customerName} owes ${balanceStr} - ${formatTimeUntilDue(first.dueAt!)}`
                : `${first.customerName} and ${overdueOrders.length - 1} more overdue!`;

            showNotification('⚠️ Overdue Payments', message);
            setLastNotified(now);
        } else if (dueSoonOrders.length > 0) {
            const first = dueSoonOrders[0];
            const balanceCents = first.totalCents - first.paidCents;
            const balanceStr = `$${(balanceCents / 100).toFixed(2)}`;
            const message = dueSoonOrders.length === 1
                ? `${first.customerName} owes ${balanceStr} - ${formatTimeUntilDue(first.dueAt!)}`
                : `${first.customerName} and ${dueSoonOrders.length - 1} more due soon`;

            showNotification('📅 Payment Due Soon', message);
            setLastNotified(now);
        }
    }, [overdueOrders.length, dueSoonOrders.length, lastNotified]);

    return {
        overdueOrders,
        dueSoonOrders,
        hasReminders: overdueOrders.length > 0 || dueSoonOrders.length > 0,
    };
}
