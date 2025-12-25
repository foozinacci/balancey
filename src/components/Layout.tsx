import { Link, useLocation } from 'react-router-dom';
import { useState, useEffect, type ReactNode } from 'react';
import { ThreeBackground } from './ThreeBackground';
import { Modal } from './Modal';
import { Button } from './Button';
import { audio } from '../utils/audio';
import { useMonthlySessionCheck } from '../hooks/useMonthlySession';
import { useSettings } from '../hooks/useData';

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

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const { showPrompt, handleStartNewSession, handleContinueSession } = useMonthlySessionCheck();

  const navItems = [
    { path: '/', label: 'Home', icon: HomeIcon },
    { path: '/inventory', label: 'Inventory', icon: BoxIcon },
    { path: '/settings', label: 'Settings', icon: SettingsIcon },
  ];

  const handleNavClick = () => {
    audio.playNavigate();
  };

  return (
    <div className="flex flex-col min-h-[100dvh]">
      {/* Three.js animated background */}
      <ThreeBackground />

      {/* Header */}
      <header className="glass-card rounded-none border-x-0 border-t-0 px-4 py-1 flex items-center justify-between sticky top-0 z-10">
        <div className="w-24" /> {/* Spacer */}
        <Link
          to="/"
          onClick={handleNavClick}
          className="flex items-center justify-center"
        >
          <img
            src="https://i.ibb.co/cSgYrmf9/ei-1766675949085-removebg-preview.png"
            alt="Balancey"
            className="h-20 w-auto"
            style={{ filter: 'drop-shadow(0 0 15px rgba(127, 255, 0, 0.4))' }}
          />
        </Link>
        <div className="w-24">
          <LiveClock />
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto pb-24 relative z-0">{children}</main>

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 glass-card rounded-none border-x-0 border-b-0 safe-bottom z-10">
        <div className="flex items-center justify-around h-16">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={handleNavClick}
                className={`flex flex-col items-center justify-center w-full h-full transition-all duration-300 ${isActive
                  ? 'text-lime text-glow-lime'
                  : 'text-silver hover:text-silver-light'
                  }`}
              >
                <Icon className="w-6 h-6" />
                <span className="text-xs mt-1 font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

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
