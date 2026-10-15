import React from 'react';
import { cn } from '../../utils/cn';

export interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  onClear?: () => void;
  icon?: React.ReactNode;
}

export function Chip({
  className,
  selected = false,
  onClear,
  icon,
  children,
  onClick,
  ...props
}: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors select-none min-h-[36px]',
        selected
          ? 'bg-crimson-50 text-crimson-800 border-crimson-300 shadow-sm'
          : 'bg-white text-ink-700 border-ink-200 hover:bg-ink-50 active:bg-ink-100',
        className
      )}
      {...props}
    >
      {icon && <span className="inline-flex shrink-0">{icon}</span>}
      <span>{children}</span>
      {onClear && (
        <span
          role="button"
          tabIndex={0}
          aria-label="Clear filter"
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          className="ml-0.5 p-0.5 hover:bg-black/10 rounded-full inline-flex items-center justify-center cursor-pointer"
        >
          <svg className="w-3 h-3 text-current" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </span>
      )}
    </button>
  );
}
