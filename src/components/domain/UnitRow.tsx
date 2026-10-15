import { getHospitalShortName } from '../../data/hospitals';
import { formatSimDateTime } from '../../engine/clock';
import { Unit } from '../../types/domain';
import { cn } from '../../utils/cn';
import { BloodGroupPill } from './BloodGroupPill';
import { ExpiryChip } from './ExpiryChip';
import { StatusChip } from './StatusChip';

export interface UnitRowProps {
  unit: Unit;
  simTime: string;
  onClick?: () => void;
  className?: string;
}

export function UnitRow({ unit, simTime, onClick, className }: UnitRowProps) {
  const isExpired = unit.status === 'EXPIRED';

  const componentLabels: Record<string, string> = {
    RED_CELLS: 'Packed Red Cells',
    PLATELETS: 'Platelets (Single Donor)',
    PLASMA: 'Fresh Frozen Plasma',
  };

  return (
    <tr
      onClick={onClick}
      className={cn(
        'group border-b border-ink-100 transition-colors cursor-pointer select-none',
        isExpired
          ? 'bg-ink-50/60 opacity-70 hover:opacity-100 hover:bg-ink-100/50'
          : 'hover:bg-crimson-50/20 active:bg-crimson-50/40',
        className
      )}
      tabIndex={0}
      role="button"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
    >
      {/* Unit ID */}
      <td className="py-3 px-4">
        <span
          className={cn(
            'font-mono font-semibold text-xs text-ink-900 group-hover:text-crimson-700 transition-colors',
            isExpired && 'line-through text-ink-400'
          )}
        >
          {unit.id}
        </span>
      </td>

      {/* Component */}
      <td className="py-3 px-4">
        <div className="flex flex-col">
          <span className="text-xs font-medium text-ink-900">{componentLabels[unit.component] || unit.component}</span>
          <span className="text-[11px] text-ink-500 font-mono">{unit.component}</span>
        </div>
      </td>

      {/* Blood Group */}
      <td className="py-3 px-4">
        <BloodGroupPill group={unit.group} size="sm" />
      </td>

      {/* Hospital Location */}
      <td className="py-3 px-4">
        <span className="text-xs text-ink-700 font-medium">{getHospitalShortName(unit.hospitalId)}</span>
      </td>

      {/* Collected At */}
      <td className="py-3 px-4 hidden md:table-cell">
        <span className="text-xs text-ink-500 font-mono">{formatSimDateTime(unit.collectedAt)}</span>
      </td>

      {/* Expiry Countdown */}
      <td className="py-3 px-4">
        <ExpiryChip expiresAt={unit.expiresAt} simTime={simTime} />
      </td>

      {/* Status */}
      <td className="py-3 px-4 text-right">
        <StatusChip status={unit.status} size="sm" />
      </td>
    </tr>
  );
}
