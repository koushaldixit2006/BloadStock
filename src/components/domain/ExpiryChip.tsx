import { AlertCircle, Clock, Flame } from 'lucide-react';
import { getExpiryCountdown } from '../../engine/clock';
import { cn } from '../../utils/cn';

export interface ExpiryChipProps {
  expiresAt: string;
  simTime: string;
  showIcon?: boolean;
  className?: string;
}

export function ExpiryChip({
  expiresAt,
  simTime,
  showIcon = true,
  className,
}: ExpiryChipProps) {
  const { text, urgencyLevel, isExpired } = getExpiryCountdown(simTime, expiresAt);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-mono font-medium border select-none',
        isExpired && 'bg-red-50 text-red-700 border-red-200 line-through',
        !isExpired && urgencyLevel === 'critical' && 'bg-red-50 text-red-700 border-red-200 font-bold animate-pulse',
        !isExpired && urgencyLevel === 'warning' && 'bg-amber-50 text-amber-800 border-amber-200 font-semibold',
        !isExpired && urgencyLevel === 'normal' && 'bg-ink-50 text-ink-700 border-ink-200',
        className
      )}
      title={`Expires at: ${new Date(expiresAt).toUTCString()}`}
    >
      {showIcon && (
        <span className="shrink-0" aria-hidden="true">
          {isExpired ? (
            <AlertCircle className="w-3 h-3 text-red-600" />
          ) : urgencyLevel === 'critical' ? (
            <Flame className="w-3 h-3 text-red-600" />
          ) : urgencyLevel === 'warning' ? (
            <Clock className="w-3 h-3 text-amber-600" />
          ) : (
            <Clock className="w-3 h-3 text-ink-400" />
          )}
        </span>
      )}
      <span>{text}</span>
    </span>
  );
}
