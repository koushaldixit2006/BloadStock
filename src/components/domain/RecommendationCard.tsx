import { ArrowRight, Clock, MapPin, ShieldCheck, Sparkles, Truck } from 'lucide-react';
import { getHospitalShortName } from '../../data/hospitals';
import { formatDurationMinutes, formatSimTimeOnly } from '../../engine/clock';
import { PlanOption } from '../../types/domain';
import { cn } from '../../utils/cn';
import { Button } from '../ui/Button';
import { BloodGroupPill } from './BloodGroupPill';
import { StatusChip } from './StatusChip';

export interface RecommendationCardProps {
  option: PlanOption;
  rank: number;
  isRecommended?: boolean;
  onReserve?: (option: PlanOption) => void;
  onInspectUnit?: (unitId: string) => void;
  className?: string;
}

export function RecommendationCard({
  option,
  rank,
  isRecommended = false,
  onReserve,
  onInspectUnit,
  className,
}: RecommendationCardProps) {
  const isFeasible = option.feasible;
  const fromName = getHospitalShortName(option.fromHospitalId);
  const toName = getHospitalShortName(option.toHospitalId);

  // Safety margin calculation (capped 0-100% for progress bar representation)
  // 4 hours = 240m (healthy margin)
  const marginPercentage = Math.min(100, Math.max(0, (option.expiryMarginMinutes / 240) * 100));

  return (
    <div
      className={cn(
        'rounded-card border transition-all duration-200 p-5 relative overflow-hidden',
        isFeasible
          ? isRecommended
            ? 'bg-white border-crimson-200 shadow-card hover:border-crimson-300 ring-1 ring-crimson-100'
            : 'bg-white border-ink-200 shadow-soft hover:shadow-card hover:border-ink-300'
          : 'bg-ink-50/70 border-ink-200 opacity-80 hover:opacity-100',
        className
      )}
    >
      {/* Top Header Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          {/* Rank Badge */}
          <span
            className={cn(
              'px-2.5 py-1 text-xs font-mono font-bold rounded-md border flex items-center gap-1.5',
              isRecommended && isFeasible
                ? 'bg-crimson-600 text-white border-crimson-700'
                : isFeasible
                ? 'bg-ink-100 text-ink-800 border-ink-200'
                : 'bg-ink-200 text-ink-500 border-ink-300'
            )}
          >
            {isRecommended && isFeasible && <Sparkles className="w-3 h-3 text-amber-300" />}
            <span>#{rank}</span>
            {isRecommended && isFeasible && <span className="font-sans text-[11px] font-semibold">OPTIMAL</span>}
          </span>

          {/* Feasibility Status */}
          <StatusChip status={isFeasible ? 'FEASIBLE' : 'INFEASIBLE'} size="sm" />
        </div>

        {/* Unit Identifier */}
        <button
          type="button"
          onClick={() => onInspectUnit?.(option.unitId)}
          className="text-xs font-mono font-semibold text-ink-700 hover:text-crimson-700 underline flex items-center gap-1 focus-visible:outline-none"
        >
          <span>Unit: {option.unitId}</span>
          <BloodGroupPill group={option.unit.group} size="sm" />
        </button>
      </div>

      {/* Route & Logistics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 bg-ink-50/60 p-3 rounded-lg border border-ink-100">
        {/* Source -> Destination */}
        <div className="flex items-center gap-2 text-xs">
          <div className="p-1.5 bg-white rounded-md border border-ink-200 text-ink-600 shrink-0">
            <MapPin className="w-4 h-4 text-crimson-600" />
          </div>
          <div>
            <div className="flex items-center gap-1 font-semibold text-ink-900">
              <span>{fromName}</span>
              <ArrowRight className="w-3 h-3 text-ink-400" />
              <span>{toName}</span>
            </div>
            <span className="text-[11px] text-ink-500">
              {option.fromHospitalId === option.toHospitalId ? 'Internal ward dispatch' : `${option.transitMinutes}m road transit`}
            </span>
          </div>
        </div>

        {/* ETA & Travel */}
        <div className="flex items-center gap-2 text-xs">
          <div className="p-1.5 bg-white rounded-md border border-ink-200 text-ink-600 shrink-0">
            <Truck className="w-4 h-4 text-purple-600" />
          </div>
          <div>
            <div className="font-semibold text-ink-900">
              ETA: {formatSimTimeOnly(option.eta)}
            </div>
            <span className="text-[11px] text-ink-500">
              Buffer (15m) + Transit ({option.transitMinutes}m)
            </span>
          </div>
        </div>
      </div>

      {/* Expiry Safety Margin Bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-ink-600 flex items-center gap-1 font-medium">
            <Clock className="w-3.5 h-3.5 text-ink-400" />
            <span>Expiry Safety Margin</span>
          </span>
          <span
            className={cn(
              'font-mono font-semibold',
              option.expiryMarginMinutes <= 0
                ? 'text-red-700'
                : option.expiryMarginMinutes < 120
                ? 'text-amber-700'
                : 'text-emerald-700'
            )}
          >
            {formatDurationMinutes(Math.max(0, option.expiryMarginMinutes))} (Arrival to safety threshold)
          </span>
        </div>

        {/* Progress meter */}
        <div className="h-2 w-full bg-ink-100 rounded-full overflow-hidden relative">
          <div
            className={cn(
              'h-full transition-all duration-300 rounded-full',
              option.expiryMarginMinutes <= 0
                ? 'bg-red-500 w-0'
                : option.expiryMarginMinutes < 120
                ? 'bg-amber-500'
                : 'bg-emerald-500'
            )}
            style={{ width: `${marginPercentage}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-ink-400 mt-0.5 font-mono">
          <span>0m (Hard threshold)</span>
          <span>120m (Safe)</span>
          <span>240m+ (Optimal)</span>
        </div>
      </div>

      {/* Explanation / Blocking Reasons */}
      <div className="mb-4 text-xs">
        {isFeasible ? (
          <p className="text-ink-700 bg-emerald-50/50 border border-emerald-100 p-2.5 rounded-lg">
            <span className="font-semibold text-emerald-900 block mb-0.5">Rationale:</span>
            {option.explanation}
          </p>
        ) : (
          <div className="bg-red-50/70 border border-red-200 p-2.5 rounded-lg text-red-900">
            <span className="font-semibold text-red-950 block mb-0.5">Hard Constraint Blocking Reason(s):</span>
            <ul className="list-disc list-inside space-y-0.5">
              {option.blockingReasons.map((reason, i) => (
                <li key={i}>{reason}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Action Footer */}
      <div className="flex items-center justify-between gap-3 pt-3 border-t border-ink-100">
        <span className="text-[11px] text-ink-400 font-mono">
          Cost score: {option.cost.toFixed(1)}
        </span>

        {isFeasible ? (
          <Button
            size="sm"
            variant={isRecommended ? 'primary' : 'outline'}
            onClick={() => onReserve?.(option)}
            leftIcon={<ShieldCheck className="w-4 h-4" />}
          >
            Reserve Unit
          </Button>
        ) : (
          <Button size="sm" variant="ghost" disabled>
            Infeasible (Blocked)
          </Button>
        )}
      </div>
    </div>
  );
}
