import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { audio } from '../utils/audio';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  useEffect(() => {
    if (isOpen) {
      audio.playPop();
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop with blur */}
      <div
        className="absolute inset-0 bg-surface-900/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal content */}
      <div className="glass-card relative w-full max-w-md p-6 animate-fade-in-up border-lime/20">
        {/* Glow accent */}
        <div className="absolute -inset-px bg-gradient-to-r from-lime/20 via-transparent to-magenta/20 rounded-2xl -z-10 blur-sm" />

        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-text-primary">{title}</h2>
          <button
            onClick={() => {
              audio.playClick();
              onClose();
            }}
            className="text-silver hover:text-silver-light transition-colors p-1"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
