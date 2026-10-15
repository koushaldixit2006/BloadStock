import {
  AlertCircle,
  AlertTriangle,
  ArrowRightLeft,
  Clock,
  PackagePlus,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Truck,
} from 'lucide-react';
import { formatSimDateTime } from '../../engine/clock';
import { SimEvent } from '../../types/domain';
import { cn } from '../../utils/cn';

export interface TimelineProps {
  events: SimEvent[];
  maxItems?: number;
  className?: string;
}

export function Timeline({ events, maxItems = 50, className }: TimelineProps) {
  const displayedEvents = events.slice(0, maxItems);

  function getEventIcon(type: SimEvent['type']) {
    switch (type) {
      case 'CLOCK_ADVANCED':
        return <Clock className="w-3.5 h-3.5 text-blue-600" />;
      case 'RESERVATION_CREATED':
        return <ShieldAlert className="w-3.5 h-3.5 text-emerald-600" />;
      case 'RESERVATION_DISPATCHED':
        return <Truck className="w-3.5 h-3.5 text-purple-600" />;
      case 'RESERVATION_DELIVERED':
        return <ShieldAlert className="w-3.5 h-3.5 text-ink-600" />;
      case 'RESERVATION_CANCELLED':
        return <AlertCircle className="w-3.5 h-3.5 text-ink-500" />;
      case 'TRANSPORT_FAILURE':
        return <AlertTriangle className="w-3.5 h-3.5 text-red-600" />;
      case 'TRANSPORT_RESTORED':
        return <RotateCcw className="w-3.5 h-3.5 text-emerald-600" />;
      case 'DEMAND_SPIKE':
        return <AlertCircle className="w-3.5 h-3.5 text-amber-600" />;
      case 'NEW_STOCK':
        return <PackagePlus className="w-3.5 h-3.5 text-emerald-600" />;
      case 'DOUBLE_ALLOCATION_PREVENTED':
        return <ShieldAlert className="w-3.5 h-3.5 text-red-600" />;
      case 'REPLAN_EXECUTED':
        return <RefreshCw className="w-3.5 h-3.5 text-purple-600" />;
      case 'RESET_DATA':
        return <RotateCcw className="w-3.5 h-3.5 text-ink-600" />;
      default:
        return <ArrowRightLeft className="w-3.5 h-3.5 text-ink-500" />;
    }
  }

  return (
    <div className={cn('relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-ink-200', className)}>
      {displayedEvents.map((event) => (
        <div key={event.id} className="relative group">
          {/* Node marker */}
          <div className="absolute -left-6 top-1 w-5 h-5 rounded-full bg-white border border-ink-200 flex items-center justify-center shadow-soft group-hover:scale-110 transition-transform">
            {getEventIcon(event.type)}
          </div>

          {/* Content */}
          <div className="bg-white rounded-lg border border-ink-150 p-3 shadow-soft hover:border-ink-300 transition-colors">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <span className="text-[11px] font-mono font-bold text-ink-500">
                {formatSimDateTime(event.ts)}
              </span>
              <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-ink-100 text-ink-700">
                {event.type.replace(/_/g, ' ')}
              </span>
            </div>
            <p className="text-xs text-ink-800 font-medium leading-relaxed">{event.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
