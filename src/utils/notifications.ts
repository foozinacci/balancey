/**
 * Browser notification utilities for payment reminders
 */

// Request notification permission
export async function requestNotificationPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
        console.log('This browser does not support notifications');
        return false;
    }

    if (Notification.permission === 'granted') {
        return true;
    }

    if (Notification.permission !== 'denied') {
        const permission = await Notification.requestPermission();
        return permission === 'granted';
    }

    return false;
}

// Show a browser notification
export function showNotification(title: string, body: string, onClick?: () => void): void {
    if (Notification.permission !== 'granted') return;

    const notification = new Notification(title, {
        body,
        icon: '/balancey.png',
        badge: '/balancey.png',
        tag: 'payment-reminder', // Replaces existing notifications with same tag
        requireInteraction: false,
    });

    if (onClick) {
        notification.onclick = () => {
            window.focus();
            onClick();
            notification.close();
        };
    }

    // Auto-close after 10 seconds
    setTimeout(() => notification.close(), 10000);
}

// Format time until due
export function formatTimeUntilDue(dueAt: number): string {
    const now = Date.now();
    const diff = dueAt - now;

    if (diff < 0) {
        const overdue = Math.abs(diff);
        const days = Math.floor(overdue / (1000 * 60 * 60 * 24));
        if (days > 0) return `${days} day${days > 1 ? 's' : ''} overdue`;
        const hours = Math.floor(overdue / (1000 * 60 * 60));
        if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} overdue`;
        return 'Overdue';
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days > 0) return `Due in ${days} day${days > 1 ? 's' : ''}`;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours > 0) return `Due in ${hours} hour${hours > 1 ? 's' : ''}`;
    const minutes = Math.floor(diff / (1000 * 60));
    return `Due in ${minutes} minute${minutes > 1 ? 's' : ''}`;
}

// Check if order is due soon (within 24 hours) or overdue
export function isDueSoon(dueAt: number): boolean {
    const now = Date.now();
    const hoursUntilDue = (dueAt - now) / (1000 * 60 * 60);
    return hoursUntilDue <= 24;
}

export function isOverdue(dueAt: number): boolean {
    return dueAt < Date.now();
}
