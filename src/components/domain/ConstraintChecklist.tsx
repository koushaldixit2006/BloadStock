import { CheckCircle2, ShieldAlert, XCircle } from 'lucide-react';
import { cn } from '../../utils/cn';

export interface ConstraintItem {
  id: string;
  name: string;
  description: string;
  passed: boolean;
  failureMessage?: string;
}

export interface ConstraintChecklistProps {
  constraints: ConstraintItem[];
  className?: string;
}

export function ConstraintChecklist({ constraints, className }: ConstraintChecklistProps) {
  const allPassed = constraints.every((c) => c.passed);

  return (
    <div className={cn('rounded-xl border p-4 bg-ink-50/40', allPassed ? 'border-emerald-200' : 'border-amber-200', className)}>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-ink-700 flex items-center gap-2">
          {allPassed ? (
            <ShieldAlert className="w-4 h-4 text-emerald-600" />
          ) : (
            <ShieldAlert className="w-4 h-4 text-amber-600" />
          )}
          <span>Hard Constraint Verification</span>
        </h4>
        <span
          className={cn(
            'text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full border',
            allPassed ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'
          )}
        >
          {allPassed ? 'ALL HARD CONSTRAINTS SATISFIED' : 'CONSTRAINTS BLOCKED'}
        </span>
      </div>

      <div className="space-y-2.5">
        {constraints.map((c) => (
          <div
            key={c.id}
            className={cn(
              'flex items-start gap-2.5 text-xs p-2 rounded-lg border transition-colors',
              c.passed ? 'bg-white/80 border-ink-100 text-ink-700' : 'bg-red-50/70 border-red-200 text-red-900'
            )}
          >
            <div className="shrink-0 mt-0.5">
              {c.passed ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              ) : (
                <XCircle className="w-4 h-4 text-red-600" />
              )}
            </div>
            <div className="flex-1">
              <span className="font-semibold block">{c.name}</span>
              <span className="text-[11px] text-ink-500 block">{c.description}</span>
              {!c.passed && c.failureMessage && (
                <span className="text-[11px] font-medium text-red-700 block mt-1">
                  Violation: {c.failureMessage}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
