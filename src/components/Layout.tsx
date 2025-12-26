import { Link, useLocation } from 'react-router-dom';
import { useState, useEffect, type ReactNode } from 'react';
import { ThreeBackground } from './ThreeBackground';
import { Modal } from './Modal';
import { Button } from './Button';
import { NotificationSplash } from './NotificationSplash';
import { TutorialHelper } from './TutorialHelper';
import { audio } from '../utils/audio';
import { useMonthlySessionCheck } from '../hooks/useMonthlySession';
import { useSettings, useDashboardKPIs } from '../hooks/useData';
import { usePaymentReminders } from '../hooks/usePaymentReminders';

interface LayoutProps {
  children: ReactNode;
}

function LiveClock() {
  const settings = useSettings();
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const timezone = settings?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  const timeStr = time.toLocaleTimeString('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  const dateStr = time.toLocaleDateString('en-US', {
    timeZone: timezone,
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });

  return (
    <div className="text-center">
      <div className="text-lg font-mono text-lime text-glow-lime">{timeStr}</div>
      <div className="text-xs text-silver">{dateStr}</div>
    </div>
  );
}

function NotificationBell() {
  const { overdueOrders, dueSoonOrders } = usePaymentReminders();
  const [testBadge, setTestBadge] = useState(0);
  const totalReminders = overdueOrders.length + dueSoonOrders.length + testBadge;
  const hasOverdue = overdueOrders.length > 0;

  const handleClick = async () => {
    // Request permission and show test notification
    if ('Notification' in window) {
      if (Notification.permission !== 'granted') {
        await Notification.requestPermission();
      }

      if (Notification.permission === 'granted') {
        new Notification('📅 Payment Reminder Test', {
          body: 'This is how reminders will appear when orders are due!',
          icon: '/balancey.png',
        });
        // Show demo badge for 5 seconds
        setTestBadge(1);
        setTimeout(() => setTestBadge(0), 5000);
        audio.playSuccess();
      }
    }
  };

  return (
    <button
      onClick={handleClick}
      className="relative p-2 rounded-xl hover:bg-surface-600/50 transition-colors"
      title={totalReminders > 0 ? `${totalReminders} reminder${totalReminders > 1 ? 's' : ''}` : 'Tap to test notifications'}
    >
      {/* Envelope Icon */}
      <svg
        className={`w-6 h-6 ${hasOverdue ? 'text-magenta' : totalReminders > 0 ? 'text-gold' : 'text-silver'}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
        />
      </svg>
      {/* Badge */}
      {totalReminders > 0 && (
        <span
          className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center text-xs font-bold rounded-full ${hasOverdue ? 'bg-magenta text-white' : 'bg-gold text-black'
            }`}
        >
          {totalReminders > 9 ? '9+' : totalReminders}
        </span>
      )}
    </button>
  );
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const settings = useSettings();
  const kpis = useDashboardKPIs();
  const { overdueOrders } = usePaymentReminders();
  const { showPrompt, handleStartNewSession, handleContinueSession } = useMonthlySessionCheck();

  // Calculate goal progress for hyperspace background
  const goalProgress = settings?.monthlyGoalCents && settings.monthlyGoalCents > 0
    ? Math.min((settings.monthlyClearedCents ?? 0) / settings.monthlyGoalCents, 1)
    : 0.5;

  const navItems = [
    { path: '/', label: 'Home', icon: HomeIcon },
    { path: '/inventory', label: 'Inventory', icon: BoxIcon },
    { path: '/clients', label: 'Clients', icon: UsersIcon },
    { path: '/settings', label: 'Settings', icon: SettingsIcon },
  ];

  const handleNavClick = () => {
    audio.playNavigate();
  };

  return (
    <div className="h-[100dvh] w-full relative overflow-hidden">
      {/* Three.js hyperspace background - driven by goal progress */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        <ThreeBackground
          goalProgress={goalProgress}
          overdueCount={overdueOrders.length}
          goalAmountCents={settings?.monthlyGoalCents ?? 100000}
          dailyCollectedCents={kpis.todayCollectedCents}
          tipsCents={kpis.monthlyTipsCents}
        />
      </div>

      {/* Notification splash overlay */}
      <NotificationSplash />

      {/* Tutorial/Demo helper overlay */}
      <TutorialHelper />

      {/* App container - centered for desktop, full width for mobile */}
      <div className="h-full w-full max-w-md mx-auto flex flex-col relative" style={{ zIndex: 10 }}>

        {/* FIXED HEADER */}
        <header className="shrink-0 glass-card rounded-none border-x-0 border-t-0 px-4 py-1 flex items-center justify-between relative" style={{ zIndex: 20 }}>
          <div className="w-24 flex items-center">
            <NotificationBell />
          </div>
          <Link to="/" onClick={handleNavClick} className="flex items-center justify-center">
            <img
              src="https://i.ibb.co/cSgYrmf9/ei-1766675949085-removebg-preview.png"
              alt="Balancey"
              className="h-14 w-auto"
              style={{ filter: 'drop-shadow(0 0 15px rgba(127, 255, 0, 0.4))' }}
            />
          </Link>
          <div className="w-24">
            <LiveClock />
          </div>
        </header>

        {/* SCROLLABLE CONTENT AREA */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden relative" style={{ zIndex: 15 }}>
          {children}
        </main>

        {/* FIXED FOOTER NAV */}
        <nav className="shrink-0 glass-card rounded-t-2xl border-x-0 border-b-0 safe-bottom relative" style={{ zIndex: 20 }}>
          <div className="flex items-center justify-around h-16">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              const Icon = item.icon;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={handleNavClick}
                  className={`flex flex-col items-center justify-center w-full h-full transition-all duration-300 ${isActive ? 'text-lime text-glow-lime' : 'text-silver hover:text-silver-light'
                    }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-xs mt-0.5 font-medium">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>

      {/* Monthly Session Modal */}
      <Modal
        isOpen={showPrompt}
        onClose={handleContinueSession}
        title="🗓️ New Month"
      >
        <div className="space-y-4">
          <p className="text-silver">
            It's the 1st of the month! Would you like to start a fresh session by clearing all paid orders?
          </p>
          <p className="text-sm text-silver/70">
            This will remove completed orders to keep your data clean. Open/unpaid orders will remain.
          </p>
          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={handleContinueSession}
              className="flex-1"
            >
              Keep All
            </Button>
            <Button
              onClick={handleStartNewSession}
              className="flex-1"
            >
              Clear Paid
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// Simple icon components
function HomeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
      />
    </svg>
  );
}

function BoxIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
      />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );
}
function UsersIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
      />
    </svg>
  );
}
