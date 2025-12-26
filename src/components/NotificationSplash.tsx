/**
 * In-app notification splash that auto-opens for payment reminders
 * - Auto-opens when there are due/overdue orders
 * - Auto-fades after 5 seconds
 * - Tap anywhere to dismiss
 */

import { useState, useEffect } from 'react';
import { usePaymentReminders } from '../hooks/usePaymentReminders';
import { formatTimeUntilDue } from '../utils/notifications';
import { formatMoney } from '../utils/units';

export function NotificationSplash() {
    const { overdueOrders, dueSoonOrders } = usePaymentReminders();
    const [isVisible, setIsVisible] = useState(false);
    const [hasShownThisSession, setHasShownThisSession] = useState(false);

    const totalReminders = overdueOrders.length + dueSoonOrders.length;

    // Auto-show on first load if there are reminders
    useEffect(() => {
        if (totalReminders > 0 && !hasShownThisSession) {
            // Small delay for smoother entrance
            const showTimeout = setTimeout(() => {
                setIsVisible(true);
                setHasShownThisSession(true);
            }, 500);

            return () => clearTimeout(showTimeout);
        }
    }, [totalReminders, hasShownThisSession]);

    // Auto-fade after 5 seconds
    useEffect(() => {
        if (isVisible) {
            const fadeTimeout = setTimeout(() => {
                setIsVisible(false);
            }, 5000);

            return () => clearTimeout(fadeTimeout);
        }
    }, [isVisible]);

    const handleDismiss = () => {
        setIsVisible(false);
    };

    if (!isVisible || totalReminders === 0) return null;

    const hasOverdue = overdueOrders.length > 0;
    const primaryOrder = hasOverdue ? overdueOrders[0] : dueSoonOrders[0];
    const balanceCents = primaryOrder.totalCents - primaryOrder.paidCents;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={handleDismiss}
        >
            <div
                className={`mx-4 p-6 rounded-2xl max-w-sm w-full text-center shadow-2xl animate-scale-in ${hasOverdue
                        ? 'bg-gradient-to-br from-magenta/20 to-magenta/5 border border-magenta/30'
                        : 'bg-gradient-to-br from-gold/20 to-gold/5 border border-gold/30'
                    }`}
                style={{
                    boxShadow: hasOverdue
                        ? '0 0 40px rgba(255, 0, 128, 0.3)'
                        : '0 0 40px rgba(201, 160, 80, 0.3)',
                }}
            >
                {/* Icon */}
                <div className={`text-5xl mb-3 ${hasOverdue ? 'animate-pulse' : ''}`}>
                    {hasOverdue ? '⚠️' : '📅'}
                </div>

                {/* Title */}
                <h2 className={`text-xl font-bold mb-2 ${hasOverdue ? 'text-magenta' : 'text-gold'}`}>
                    {hasOverdue ? 'Overdue Payment' : 'Payment Due Soon'}
                </h2>

                {/* Primary message */}
                <p className="text-text-primary font-semibold text-lg mb-1">
                    {primaryOrder.customerName}
                </p>
                <p className="text-silver mb-2">
                    owes <span className={hasOverdue ? 'text-magenta' : 'text-lime'}>{formatMoney(balanceCents)}</span>
                </p>
                <p className={`text-sm font-medium ${hasOverdue ? 'text-magenta' : 'text-gold'}`}>
                    {primaryOrder.dueAt && formatTimeUntilDue(primaryOrder.dueAt)}
                </p>

                {/* Additional reminders count */}
                {totalReminders > 1 && (
                    <p className="text-silver text-sm mt-3">
                        + {totalReminders - 1} more reminder{totalReminders > 2 ? 's' : ''}
                    </p>
                )}

                {/* Dismiss hint */}
                <p className="text-silver/50 text-xs mt-4">
                    Tap anywhere to dismiss
                </p>
            </div>
        </div>
    );
}
