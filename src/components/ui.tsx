import { useEffect } from 'react';
import type { MouseEvent, ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: (event: MouseEvent<HTMLDivElement>) => void;
}

export function Card({ children, className = '', onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={`bg-bg-card border border-border-subtle rounded-xl ${className}`}
    >
      {children}
    </div>
  );
}

interface ModalProps {
  children: ReactNode;
  onClose: () => void;
  className?: string;
}

export function Modal({ children, onClose, className = '' }: ModalProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <Card
        onClick={(event) => event.stopPropagation()}
        className={`w-full p-6 animate-slide-up max-h-[90vh] overflow-y-auto ${className}`}
      >
        {children}
      </Card>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  icon?: ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  subtitle?: string;
}

export function StatCard({ label, value, icon, trend, subtitle }: StatCardProps) {
  const trendColor =
    trend === 'up'
      ? 'text-success-text'
      : trend === 'down'
      ? 'text-danger-text'
      : 'text-text-primary';

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-text-secondary text-sm font-medium">{label}</span>
        {icon && <span className="text-text-muted">{icon}</span>}
      </div>
      <div className={`text-2xl font-bold font-mono ${trendColor}`}>{value}</div>
      {subtitle && <div className="text-text-muted text-xs mt-1">{subtitle}</div>}
    </Card>
  );
}

interface BadgeProps {
  children: ReactNode;
  variant?: 'success' | 'danger' | 'warning' | 'info' | 'neutral';
  dot?: boolean;
}

export function Badge({ children, variant = 'neutral', dot = false }: BadgeProps) {
  const colors = {
    success: 'bg-success-muted/40 text-success-text border-success/30',
    danger: 'bg-danger-muted/40 text-danger-text border-danger/30',
    warning: 'bg-warning-muted/40 text-warning-text border-warning/30',
    info: 'bg-accent-muted/40 text-accent-primary border-accent-primary/30',
    neutral: 'bg-bg-tertiary text-text-secondary border-border-subtle',
  };
  const dotColor = {
    success: 'bg-success',
    danger: 'bg-danger',
    warning: 'bg-warning',
    info: 'bg-accent-primary',
    neutral: 'bg-text-muted',
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${colors[variant]}`}
    >
      {dot && (
        <span className={`w-1.5 h-1.5 rounded-full ${dotColor[variant]} animate-pulse-slow`} />
      )}
      {children}
    </span>
  );
}

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
}

export function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
          checked ? 'bg-accent-primary' : 'bg-border'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform duration-200 ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
      {label && <span className="text-text-primary text-sm">{label}</span>}
    </label>
  );
}

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'danger' | 'success' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  className?: string;
  type?: 'button' | 'submit';
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  disabled = false,
  className = '',
  type = 'button',
}: ButtonProps) {
  const variants = {
    primary: 'bg-accent-primary hover:bg-accent-hover text-white',
    danger: 'bg-danger hover:bg-danger/80 text-white',
    success: 'bg-success hover:bg-success/80 text-white',
    ghost: 'bg-transparent hover:bg-bg-hover text-text-secondary hover:text-text-primary border border-border',
  };
  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center whitespace-nowrap rounded-lg font-medium transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {children}
    </button>
  );
}
