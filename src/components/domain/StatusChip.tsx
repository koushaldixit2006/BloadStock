import { AlertCircle, AlertTriangle, CheckCircle, Clock, Truck } from 'lucide-react';
import { cn } from '../../utils/cn';

export type DomainStatus =
  | 'FEASIBLE'
  | 'AT_RISK'
  | 'INFEASIBLE'
  | 'AVAILABLE'
  | 'RESERVED'
  | 'IN_TRANSIT'
  | 'EXPIRED'
  | 'USED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'OPEN'
  | 'PLANNED'
  | 'PARTIAL'
  | 'CRITICAL'
  | 'URGENT'
  | 'ROUTINE'
  | 'UNFULFILLED';

export interface StatusChipProps {
  status: DomainStatus;
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function StatusChip({ status, label, size = 'md', className }: StatusChipProps) {
  let displayLabel = label;
  let bgClass = 'bg-ink-100 text-ink-800 border-ink-200';
  let icon = <Clock className="w-3.5 h-3.5 text-ink-500" />;

  switch (status) {
    case 'FEASIBLE':
      displayLabel = displayLabel || 'Feasible';
      bgClass = 'bg-emerald-50 text-emerald-800 border-emerald-200';
      icon = <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />;
      break;

    case 'AVAILABLE':
      displayLabel = displayLabel || 'Available';
      bgClass = 'bg-emerald-50 text-emerald-800 border-emerald-200';
      icon = <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />;
      break;

    case 'AT_RISK':
    case 'PARTIAL':
      displayLabel = displayLabel || (status === 'PARTIAL' ? 'Partial' : 'At Risk');
      bgClass = 'bg-amber-50 text-amber-800 border-amber-200';
      icon = <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />;
      break;

    case 'INFEASIBLE':
    case 'EXPIRED':
    case 'UNFULFILLED':
      displayLabel = displayLabel || (status === 'EXPIRED' ? 'Expired' : status === 'UNFULFILLED' ? 'Unfulfilled' : 'Infeasible');
      bgClass = 'bg-red-50 text-red-800 border-red-200';
      icon = <AlertCircle className="w-3.5 h-3.5 text-red-600" />;
      break;

    case 'RESERVED':
    case 'PLANNED':
      displayLabel = displayLabel || (status === 'PLANNED' ? 'Planned' : 'Reserved');
      bgClass = 'bg-blue-50 text-blue-800 border-blue-200';
      icon = <Clock className="w-3.5 h-3.5 text-blue-600" />;
      break;

    case 'IN_TRANSIT':
      displayLabel = displayLabel || 'In Transit';
      bgClass = 'bg-purple-50 text-purple-800 border-purple-200';
      icon = <Truck className="w-3.5 h-3.5 text-purple-600 animate-pulse" />;
      break;

    case 'DELIVERED':
    case 'USED':
      displayLabel = displayLabel || (status === 'DELIVERED' ? 'Delivered' : 'Used');
      bgClass = 'bg-ink-100 text-ink-700 border-ink-200';
      icon = <CheckCircle className="w-3.5 h-3.5 text-ink-500" />;
      break;

    case 'CANCELLED':
      displayLabel = displayLabel || 'Cancelled';
      bgClass = 'bg-ink-100 text-ink-500 border-ink-200 line-through';
      icon = <AlertCircle className="w-3.5 h-3.5 text-ink-400" />;
      break;

    case 'CRITICAL':
      displayLabel = displayLabel || 'Critical';
      bgClass = 'bg-red-50 text-red-800 border-red-300 font-bold';
      icon = <AlertCircle className="w-3.5 h-3.5 text-red-600 animate-bounce" />;
      break;

    case 'URGENT':
      displayLabel = displayLabel || 'Urgent';
      bgClass = 'bg-amber-50 text-amber-800 border-amber-300 font-semibold';
      icon = <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />;
      break;

    case 'ROUTINE':
    case 'OPEN':
      displayLabel = displayLabel || (status === 'OPEN' ? 'Open' : 'Routine');
      bgClass = 'bg-ink-50 text-ink-700 border-ink-200';
      icon = <Clock className="w-3.5 h-3.5 text-ink-500" />;
      break;
  }

  const sizeClasses = {
    sm: 'text-[11px] px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-1 gap-1.5',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded-md border select-none',
        bgClass,
        sizeClasses[size],
        className
      )}
    >
      <span className="shrink-0" aria-hidden="true">
        {icon}
      </span>
      <span>{displayLabel}</span>
    </span>
  );
}
