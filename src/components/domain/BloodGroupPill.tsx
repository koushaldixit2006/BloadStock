import { BloodGroup } from '../../types/domain';
import { cn } from '../../utils/cn';

export interface BloodGroupPillProps {
  group: BloodGroup;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  selected?: boolean;
}

export function BloodGroupPill({
  group,
  size = 'md',
  className,
  selected = false,
}: BloodGroupPillProps) {
  const isO = group.startsWith('O');
  const isAB = group.startsWith('AB');
  const isNeg = group.endsWith('-');

  const sizeClasses = {
    sm: 'text-[11px] px-2 py-0.5 min-w-[32px]',
    md: 'text-xs px-2.5 py-1 min-w-[40px]',
    lg: 'text-sm px-3.5 py-1.5 min-w-[50px] font-bold',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center font-mono font-semibold rounded-pill tracking-tight border transition-colors select-none',
        sizeClasses[size],
        selected
          ? 'bg-crimson-600 text-white border-crimson-700 shadow-sm'
          : isO && isNeg
          ? 'bg-crimson-50 text-crimson-800 border-crimson-200'
          : isAB
          ? 'bg-purple-50 text-purple-800 border-purple-200'
          : 'bg-ink-100 text-ink-800 border-ink-200',
        className
      )}
    >
      {group}
    </span>
  );
}
