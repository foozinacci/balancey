/**
 * TutorialHelper - Guided demo overlay component
 * Displays contextual help messages and guides users through the app
 */

import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTutorial, TUTORIAL_MESSAGES, type TutorialStep } from '../hooks/useTutorial.tsx';
import { clearAllData } from '../db/orders';
import { audio } from '../utils/audio';

export function TutorialHelper() {
    const navigate = useNavigate();
    const location = useLocation();
    const { isActive, currentStep, nextStep, setStep, endTutorial } = useTutorial();

    // Auto-navigate based on tutorial step
    useEffect(() => {
        if (!isActive) return;

        const navigateForStep = async () => {
            switch (currentStep) {
                case 'welcome':
                case 'settings-goal':
                case 'settings-pricing':
                case 'settings-done':
                    if (location.pathname !== '/settings') {
                        navigate('/settings');
                    }
                    break;
                case 'inventory-intro':
                case 'inventory-create':
                case 'inventory-done':
                    if (location.pathname !== '/inventory') {
                        navigate('/inventory');
                    }
                    break;
                case 'dashboard-intro':
                case 'order-start':
                case 'dashboard-review':
                case 'cleanup':
                    if (location.pathname !== '/') {
                        navigate('/');
                    }
                    break;
                case 'order-client':
                case 'order-items':
                case 'order-delivery':
                case 'order-payment':
                case 'order-done':
                    if (!location.pathname.startsWith('/orders')) {
                        navigate('/orders/new');
                    }
                    break;
                case 'complete':
                    // Clean up and exit
                    break;
            }
        };

        navigateForStep();
    }, [isActive, currentStep, location.pathname, navigate]);

    if (!isActive || currentStep === 'idle') {
        return null;
    }

    const message = TUTORIAL_MESSAGES[currentStep];

    const handleAction = async () => {
        audio.playSuccess();

        switch (currentStep) {
            case 'welcome':
                setStep('settings-goal');
                break;
            case 'settings-goal':
                setStep('settings-pricing');
                break;
            case 'settings-pricing':
                setStep('settings-done');
                break;
            case 'settings-done':
                setStep('inventory-intro');
                break;
            case 'inventory-intro':
                setStep('inventory-create');
                break;
            case 'inventory-create':
                setStep('inventory-done');
                break;
            case 'inventory-done':
                setStep('dashboard-intro');
                break;
            case 'dashboard-intro':
                setStep('order-start');
                break;
            case 'order-start':
                navigate('/orders/new');
                setStep('order-client');
                break;
            case 'order-client':
                setStep('order-items');
                break;
            case 'order-items':
                setStep('order-delivery');
                break;
            case 'order-delivery':
                setStep('order-payment');
                break;
            case 'order-payment':
                setStep('order-done');
                break;
            case 'order-done':
                navigate('/');
                setStep('dashboard-review');
                break;
            case 'dashboard-review':
                setStep('cleanup');
                break;
            case 'cleanup':
                // Clear all demo data
                await clearAllData();
                setStep('complete');
                break;
            case 'complete':
                endTutorial();
                navigate('/');
                window.location.reload();
                break;
            default:
                nextStep();
        }
    };

    const handleDismiss = () => {
        // Click anywhere on backdrop to advance (for message clearing)
        // Only for certain steps that are just messages
        const advanceOnClick: TutorialStep[] = [
            'settings-goal',
            'settings-pricing',
            'inventory-create',
            'order-client',
            'order-items',
            'order-delivery',
            'order-payment',
        ];

        if (advanceOnClick.includes(currentStep)) {
            // Don't auto-advance, let user complete the action
            return;
        }
    };

    // Calculate progress
    const totalSteps = 17;
    const currentIndex = Object.keys(TUTORIAL_MESSAGES).indexOf(currentStep);
    const progress = Math.max(0, (currentIndex / totalSteps) * 100);

    return (
        <div
            className="fixed inset-0 z-[100] pointer-events-none"
            onClick={handleDismiss}
        >
            {/* Progress bar at top */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-surface-700">
                <div
                    className="h-full bg-gradient-to-r from-lime to-cyan transition-all duration-500"
                    style={{ width: `${progress}%` }}
                />
            </div>

            {/* Helper popup - positioned at bottom */}
            <div className="absolute bottom-20 left-1/2 -translate-x-1/2 w-[90%] max-w-md pointer-events-auto">
                <div className="glass-card p-4 rounded-2xl border-2 border-lime/40 shadow-lg shadow-lime/10 animate-fade-in">
                    {/* Avatar/Icon */}
                    <div className="flex items-start gap-3">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-lime/30 to-cyan/30 flex items-center justify-center text-2xl shrink-0 border border-lime/30">
                            🌱
                        </div>

                        <div className="flex-1 min-w-0">
                            {/* Title */}
                            <h3 className="text-lg font-bold text-lime text-glow-lime mb-1">
                                {message.title}
                            </h3>

                            {/* Message */}
                            <p className="text-silver text-sm leading-relaxed mb-3">
                                {message.message}
                            </p>

                            {/* Action button */}
                            {message.action && (
                                <button
                                    onClick={handleAction}
                                    className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-lime/90 to-lime text-black font-semibold text-sm transition-all duration-200 hover:from-lime hover:to-lime/80 active:scale-[0.98] shadow-lg shadow-lime/20"
                                >
                                    {message.action}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Skip tutorial option */}
                    <button
                        onClick={() => {
                            endTutorial();
                            navigate('/');
                        }}
                        className="mt-3 w-full text-center text-xs text-silver/50 hover:text-silver/80 transition-colors"
                    >
                        Skip tutorial
                    </button>
                </div>
            </div>
        </div>
    );
}
