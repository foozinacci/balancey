/**
 * Tutorial/Demo Mode Hook
 * Manages the guided demo experience that walks users through the app
 * Uses localStorage for persistence and React state for reactivity
 */

import { useState, useEffect, useCallback, createContext, useContext, type ReactNode } from 'react';

export type TutorialStep =
    | 'idle'
    | 'welcome'
    | 'settings-goal'
    | 'settings-pricing'
    | 'settings-done'
    | 'inventory-intro'
    | 'inventory-create'
    | 'inventory-done'
    | 'dashboard-intro'
    | 'order-start'
    | 'order-client'
    | 'order-items'
    | 'order-delivery'
    | 'order-payment'
    | 'order-done'
    | 'dashboard-review'
    | 'cleanup'
    | 'complete';

interface TutorialState {
    isActive: boolean;
    currentStep: TutorialStep;
    createdProductIds: string[];
    createdCustomerId: string | null;
    createdOrderId: string | null;
}

interface TutorialContextType extends TutorialState {
    startTutorial: () => void;
    nextStep: () => void;
    setStep: (step: TutorialStep) => void;
    trackProduct: (id: string) => void;
    trackCustomer: (id: string) => void;
    trackOrder: (id: string) => void;
    endTutorial: () => void;
}

const STORAGE_KEY = 'balancey-tutorial';

const STEP_ORDER: TutorialStep[] = [
    'idle',
    'welcome',
    'settings-goal',
    'settings-pricing',
    'settings-done',
    'inventory-intro',
    'inventory-create',
    'inventory-done',
    'dashboard-intro',
    'order-start',
    'order-client',
    'order-items',
    'order-delivery',
    'order-payment',
    'order-done',
    'dashboard-review',
    'cleanup',
    'complete',
];

const defaultState: TutorialState = {
    isActive: false,
    currentStep: 'idle',
    createdProductIds: [],
    createdCustomerId: null,
    createdOrderId: null,
};

function loadState(): TutorialState {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch {
        // Ignore parse errors
    }
    return defaultState;
}

function saveState(state: TutorialState): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

const TutorialContext = createContext<TutorialContextType | null>(null);

export function TutorialProvider({ children }: { children: ReactNode }): ReactNode {
    const [state, setState] = useState<TutorialState>(loadState);

    // Persist to localStorage on change
    useEffect(() => {
        saveState(state);
    }, [state]);

    const startTutorial = useCallback(() => {
        setState({
            isActive: true,
            currentStep: 'welcome',
            createdProductIds: [],
            createdCustomerId: null,
            createdOrderId: null,
        });
    }, []);

    const nextStep = useCallback(() => {
        setState((prev) => {
            const currentIndex = STEP_ORDER.indexOf(prev.currentStep);
            if (currentIndex < STEP_ORDER.length - 1) {
                return { ...prev, currentStep: STEP_ORDER[currentIndex + 1] };
            }
            return prev;
        });
    }, []);

    const setStep = useCallback((step: TutorialStep) => {
        setState((prev) => ({ ...prev, currentStep: step }));
    }, []);

    const trackProduct = useCallback((id: string) => {
        setState((prev) => ({
            ...prev,
            createdProductIds: [...prev.createdProductIds, id],
        }));
    }, []);

    const trackCustomer = useCallback((id: string) => {
        setState((prev) => ({ ...prev, createdCustomerId: id }));
    }, []);

    const trackOrder = useCallback((id: string) => {
        setState((prev) => ({ ...prev, createdOrderId: id }));
    }, []);

    const endTutorial = useCallback(() => {
        setState(defaultState);
        localStorage.removeItem(STORAGE_KEY);
    }, []);

    const contextValue: TutorialContextType = {
        ...state,
        startTutorial,
        nextStep,
        setStep,
        trackProduct,
        trackCustomer,
        trackOrder,
        endTutorial,
    };

    return (
        <TutorialContext.Provider value={contextValue}>
            {children}
        </TutorialContext.Provider>
    );
}

export function useTutorial(): TutorialContextType {
    const context = useContext(TutorialContext);
    if (!context) {
        throw new Error('useTutorial must be used within TutorialProvider');
    }
    return context;
}

// Helper messages for each step
export const TUTORIAL_MESSAGES: Record<TutorialStep, { title: string; message: string; action?: string }> = {
    idle: { title: '', message: '' },
    welcome: {
        title: '👋 Welcome to Balancey!',
        message: "Let's take a quick tour. I'll guide you through setting up your first order.",
        action: "Let's Go!",
    },
    'settings-goal': {
        title: '🎯 Set Your Monthly Goal',
        message: 'First, set a monthly revenue goal. Try $3,000 to start.',
        action: 'Next',
    },
    'settings-pricing': {
        title: '💰 Set Base Pricing',
        message: 'Set your cost at $5/g and sale price at $10/g.',
        action: 'Next',
    },
    'settings-done': {
        title: '✅ Settings Complete!',
        message: "Great! Now let's add some products to your inventory.",
        action: 'Go to Inventory',
    },
    'inventory-intro': {
        title: '📦 Your Inventory',
        message: "This is where you manage your products. Let's create something to sell.",
        action: "Let's Create",
    },
    'inventory-create': {
        title: '🥚 Create a Product',
        message: 'Create a product called "Eggs" - 1g per item at $10/g. Stock 12 units.',
        action: 'Created? Next →',
    },
    'inventory-done': {
        title: '✅ Product Created!',
        message: "Your inventory is ready. Let's create your first order!",
        action: 'Go to Dashboard',
    },
    'dashboard-intro': {
        title: '🏠 Your Dashboard',
        message: 'This shows your clients and KPIs. Let\'s create a new order!',
        action: 'Create Order',
    },
    'order-start': {
        title: '📝 New Order',
        message: "Click 'Create + Order' to add a new client with an order.",
        action: 'Tap when ready',
    },
    'order-client': {
        title: '👤 Create Client',
        message: 'Name your client and add an address with a 5-digit ZIP code.',
        action: 'Client ready? Next →',
    },
    'order-items': {
        title: '🛒 Add Items',
        message: 'Select 3 Eggs from your inventory.',
        action: 'Items added? Next →',
    },
    'order-delivery': {
        title: '🚗 Setup Delivery',
        message: 'Choose delivery and enter an address about 15 miles away.',
        action: 'Delivery set? Next →',
    },
    'order-payment': {
        title: '💵 Payment Terms',
        message: 'Set due date to 01/01/2026 and add a small deposit now.',
        action: 'Payment set? Next →',
    },
    'order-done': {
        title: '✅ Order Created!',
        message: 'Create the order, then come back to the dashboard!',
        action: 'View Dashboard',
    },
    'dashboard-review': {
        title: '📊 See Your Progress',
        message: 'Check out your updated KPIs and pending balance!',
        action: 'Finish Tutorial',
    },
    cleanup: {
        title: '🧹 Clean Up Demo',
        message: 'Ready to clear the demo data and start fresh?',
        action: 'Clear & Exit Demo',
    },
    complete: {
        title: '🎉 Tutorial Complete!',
        message: "You're all set to use Balancey! Data has been cleared.",
        action: 'Get Started',
    },
};
