import React from 'react';
import { cn } from '../../utils/cn';

export interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  badge?: {
    text: string;
    variant: 'success' | 'warning' | 'danger' | 'info' | 'default';
  };
  onClick?: () => void;
  className?: string;
}

export function KpiCard({
  title,
  value,
  subtitle,
  icon,
  badge,
  onClick,
  className,
}: KpiCardProps) {
  const badgeVariants = {
    success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    warning: 'bg-amber-50 text-amber-800 border-amber-200',
    danger: 'bg-red-50 text-red-800 border-red-200',
    info: 'bg-blue-50 text-blue-800 border-blue-200',
    default: 'bg-ink-100 text-ink-700 border-ink-200',
  };

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={cn(
        'bg-white rounded-card border border-ink-200 p-5 shadow-soft transition-all duration-200 relative overflow-hidden',
        onClick && 'cursor-pointer hover:shadow-card hover:border-ink-300 active:scale-[0.99]',
        className
      )}
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className="text-xs font-semibold text-ink-500 uppercase tracking-wider">{title}</span>
        <div className="p-2 rounded-lg bg-ink-50 text-ink-600 border border-ink-100">{icon}</div>
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <div className="text-2xl sm:text-3xl font-extrabold font-heading text-ink-900 tracking-tight">
          {value}
        </div>
        {badge && (
          <span
            className={cn(
              'text-[11px] font-medium px-2 py-0.5 rounded-full border',
              badgeVariants[badge.variant]
            )}
          >
            {badge.text}
          </span>
        )}
      </div>

      {subtitle && <p className="text-xs text-ink-500 mt-2">{subtitle}</p>}
    </div>
  );
}
