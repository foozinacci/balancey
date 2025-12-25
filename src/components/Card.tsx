import type { ReactNode, CSSProperties } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  style?: CSSProperties;
}

export function Card({ children, className = '', interactive = false, style }: CardProps) {
  return (
    <div
      className={`glass-card p-4 ${interactive ? 'glass-card-interactive' : ''} ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export function CardHeader({ title, subtitle, action }: CardHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <h3 className="font-semibold text-text-primary">{title}</h3>
        {subtitle && <p className="text-sm text-silver mt-0.5">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
