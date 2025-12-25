import { useEffect, useState } from 'react';
import { db } from '../db';

const LAST_SESSION_KEY = 'balancey_last_session_check';

export function useMonthlySessionCheck() {
    const [showPrompt, setShowPrompt] = useState(false);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        const checkSession = () => {
            const now = new Date();
            const currentMonth = now.getFullYear() * 12 + now.getMonth();
            const day = now.getDate();
            const hour = now.getHours();

            // Get last check from localStorage
            const lastCheck = localStorage.getItem(LAST_SESSION_KEY);
            const lastCheckMonth = lastCheck ? parseInt(lastCheck, 10) : 0;

            // If we've already handled this month, skip
            if (lastCheckMonth >= currentMonth) {
                return;
            }

            // Show prompt on the 1st at or after 12pm
            if (day === 1 && hour >= 12) {
                setShowPrompt(true);
            }

            // Auto-clear on the 2nd if not dismissed
            if (day >= 2 && lastCheckMonth < currentMonth) {
                handleAutoClear(currentMonth);
            }
        };

        checkSession();

        // Check every hour
        const interval = setInterval(checkSession, 60 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    const handleAutoClear = async (currentMonth: number) => {
        // Auto-mark session as started (don't clear data, just mark checked)
        localStorage.setItem(LAST_SESSION_KEY, currentMonth.toString());
        console.log('New month session auto-started');
    };

    const handleStartNewSession = async () => {
        const now = new Date();
        const currentMonth = now.getFullYear() * 12 + now.getMonth();

        // Clear paid orders
        const closedOrders = await db.orders
            .filter((o) => o.status === 'CLOSED')
            .toArray();

        for (const order of closedOrders) {
            await db.orderItems.where('orderId').equals(order.id).delete();
            await db.payments.where('orderId').equals(order.id).delete();
            await db.fulfillments.where('orderId').equals(order.id).delete();
            await db.orderPolicies.delete(order.id);
            await db.orders.delete(order.id);
        }

        localStorage.setItem(LAST_SESSION_KEY, currentMonth.toString());
        setShowPrompt(false);
        setDismissed(true);
    };

    const handleContinueSession = () => {
        const now = new Date();
        const currentMonth = now.getFullYear() * 12 + now.getMonth();
        localStorage.setItem(LAST_SESSION_KEY, currentMonth.toString());
        setShowPrompt(false);
        setDismissed(true);
    };

    return {
        showPrompt,
        dismissed,
        handleStartNewSession,
        handleContinueSession,
    };
}
