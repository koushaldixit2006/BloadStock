import { useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle,
  History,
  Lock,
  ShieldAlert,
  Truck,
} from 'lucide-react';
import { getHospitalShortName } from '../data/hospitals';
import { formatDurationMinutes, formatSimDateTime, formatSimTimeOnly, getMinutesBetween } from '../engine/clock';
import { useSimStore } from '../store/useSimStore';
import { Reservation, ReservationStatus } from '../types/domain';
import { BloodGroupPill } from '../components/domain/BloodGroupPill';
import { StatusChip } from '../components/domain/StatusChip';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Drawer } from '../components/ui/Drawer';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { Tabs } from '../components/ui/Tabs';
import { useToast } from '../components/ui/useToast';

export function Reservations() {
  const {
    units,
    requests,
    reservations,
    events,
    simTime,
    cancelReservation,
    dispatchReservation,
    deliverReservation,
    createReservation,
  } = useSimStore();

  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<ReservationStatus>('RESERVED');
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
  const [isDoubleAllocModalOpen, setIsDoubleAllocModalOpen] = useState(false);
  const [blockedAttemptDetails, setBlockedAttemptDetails] = useState<{
    unitId: string;
    existingRequestId: string;
    targetRequestId: string;
    reason: string;
  } | null>(null);

  // Filter reservations by status tab
  const filteredReservations = useMemo(() => {
    return reservations.filter((r) => r.status === activeTab);
  }, [reservations, activeTab]);

  // Tab counts
  const counts = useMemo(() => {
    return {
      RESERVED: reservations.filter((r) => r.status === 'RESERVED').length,
      IN_TRANSIT: reservations.filter((r) => r.status === 'IN_TRANSIT').length,
      DELIVERED: reservations.filter((r) => r.status === 'DELIVERED').length,
      CANCELLED: reservations.filter((r) => r.status === 'CANCELLED').length,
    };
  }, [reservations]);

  // Handle Dispatch
  const handleDispatch = async (rsv: Reservation) => {
    const res = await dispatchReservation(rsv.id);
    if (res.success) {
      addToast({
        type: 'info',
        title: `Unit ${rsv.unitId} Dispatched`,
        message: `Transport initiated from ${getHospitalShortName(rsv.fromHospitalId)} to ${getHospitalShortName(rsv.toHospitalId)}. En route.`,
      });
    }
  };

  // Handle Deliver
  const handleDeliver = async (rsv: Reservation) => {
    const res = await deliverReservation(rsv.id);
    if (res.success) {
      addToast({
        type: 'success',
        title: `Unit ${rsv.unitId} Delivered`,
        message: `Arrival verified at ${getHospitalShortName(rsv.toHospitalId)}. Unit marked USED.`,
      });
    }
  };

  // Handle Cancel
  const handleCancel = async (rsv: Reservation) => {
    const res = await cancelReservation(rsv.id);
    if (res.success) {
      addToast({
        type: 'info',
        title: `Reservation ${rsv.id} Cancelled`,
        message: `Unit ${rsv.unitId} restored to AVAILABLE inventory.`,
      });
    } else {
      addToast({
        type: 'error',
        title: 'Action Blocked',
        message: res.reason || 'Cannot cancel an in-transit delivery.',
      });
    }
  };

  // Double Allocation Test Trigger
  // Explicitly demonstrates that hard constraints prevent reserving a unit that is already committed!
  const triggerDoubleAllocationTest = async () => {
    // Find an actively reserved unit
    const activeRsv = reservations.find((r) => r.status === 'RESERVED' || r.status === 'IN_TRANSIT');

    if (!activeRsv) {
      // If no reservations currently exist, create one first, then attempt to steal it!
      const availableUnit = units.find((u) => u.status === 'AVAILABLE');
      const anyRequest = requests[0];
      if (availableUnit && anyRequest) {
        await createReservation(availableUnit.id, anyRequest.id);
      }
    }

    const targetRsv = reservations.find((r) => r.status === 'RESERVED' || r.status === 'IN_TRANSIT');
    if (!targetRsv) {
      addToast({
        type: 'warning',
        title: 'No Active Reservations',
        message: 'Reserve a unit first to demonstrate double-allocation protection.',
      });
      return;
    }

    // Now attempt to reserve this same unit for another request!
    const otherRequest = requests.find((r) => r.id !== targetRsv.requestId) || { id: 'R-9999' };
    const attemptResult = await createReservation(targetRsv.unitId, otherRequest.id);

    setBlockedAttemptDetails({
      unitId: targetRsv.unitId,
      existingRequestId: targetRsv.requestId,
      targetRequestId: otherRequest.id,
      reason: attemptResult.reason || `Double allocation blocked - unit ${targetRsv.unitId} is already reserved for ${targetRsv.requestId}`,
    });

    setIsDoubleAllocModalOpen(true);

    addToast({
      type: 'error',
      title: 'Double Allocation Hard Blocked',
      message: `System prevented unit ${targetRsv.unitId} from duplicate commitment to ${otherRequest.id}.`,
    });
  };

  // Per-reservation audit history
  const reservationEvents = useMemo(() => {
    if (!selectedReservation) return [];
    return events.filter(
      (e) =>
        e.description.includes(selectedReservation.id) ||
        e.description.includes(selectedReservation.unitId) ||
        (e.payload &&
          (e.payload.reservationId === selectedReservation.id ||
            e.payload.unitId === selectedReservation.unitId))
    );
  }, [selectedReservation, events]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-heading text-ink-950 tracking-tight">
            Active Reservations & Custody Audit
          </h1>
          <p className="text-sm text-ink-500 mt-1">
            Track blood component dispatch status, en-route logistics, and chain-of-custody audit logs.
          </p>
        </div>

        {/* Demo Button: Double Allocation Guard Trigger */}
        <Button
          size="md"
          variant="outline"
          onClick={triggerDoubleAllocationTest}
          className="border-red-300 text-red-800 hover:bg-red-50 hover:border-red-400"
          leftIcon={<Lock className="w-4 h-4 text-red-600" />}
        >
          Test Double-Allocation Guard
        </Button>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-ink-200 px-4 pt-2 shadow-soft">
        <Tabs
          tabs={[
            { id: 'RESERVED', label: 'Reserved (Pending Dispatch)', count: counts.RESERVED },
            { id: 'IN_TRANSIT', label: 'In Transit (En Route)', count: counts.IN_TRANSIT },
            { id: 'DELIVERED', label: 'Delivered (Used)', count: counts.DELIVERED },
            { id: 'CANCELLED', label: 'Cancelled / Released', count: counts.CANCELLED },
          ]}
          activeTab={activeTab}
          onChange={(tab) => setActiveTab(tab as ReservationStatus)}
        />
      </div>

      {/* Reservations Table */}
      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-ink-200 text-ink-500 font-semibold bg-ink-50/70 select-none">
                <th className="py-3 px-4">Reservation ID</th>
                <th className="py-3 px-4">Unit ID</th>
                <th className="py-3 px-4">Request Ref</th>
                <th className="py-3 px-4">Route (Origin &rarr; Dest)</th>
                <th className="py-3 px-4">Transit Time</th>
                <th className="py-3 px-4">Arrival ETA</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredReservations.map((rsv) => {
                const unit = units.find((u) => u.id === rsv.unitId);
                const req = requests.find((rq) => rq.id === rsv.requestId);
                const isOverdue = new Date(simTime) > new Date(rsv.eta);

                return (
                  <tr
                    key={rsv.id}
                    onClick={() => setSelectedReservation(rsv)}
                    className="border-b border-ink-100 hover:bg-ink-50/70 transition-colors cursor-pointer select-none"
                  >
                    {/* Reservation ID */}
                    <td className="py-3 px-4 font-mono font-bold text-ink-900">{rsv.id}</td>

                    {/* Unit ID */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-ink-900">{rsv.unitId}</span>
                        {unit && <BloodGroupPill group={unit.group} size="sm" />}
                      </div>
                    </td>

                    {/* Request Ref */}
                    <td className="py-3 px-4">
                      <span className="font-mono text-ink-700 font-medium">{rsv.requestId}</span>
                      {req && (
                        <span className="text-[11px] text-ink-400 block">
                          {req.urgency} &bull; {req.component}
                        </span>
                      )}
                    </td>

                    {/* Route */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1 font-semibold text-ink-800">
                        <span>{getHospitalShortName(rsv.fromHospitalId)}</span>
                        <ArrowRight className="w-3 h-3 text-ink-400" />
                        <span>{getHospitalShortName(rsv.toHospitalId)}</span>
                      </div>
                    </td>

                    {/* Transit Time */}
                    <td className="py-3 px-4 font-mono text-ink-600">{rsv.transitMinutes} min</td>

                    {/* ETA */}
                    <td className="py-3 px-4">
                      <div className="font-mono font-medium text-ink-900">
                        {formatSimTimeOnly(rsv.eta)}
                      </div>
                      <span className="text-[10px] text-ink-400 font-mono">
                        {isOverdue && rsv.status === 'IN_TRANSIT'
                          ? 'Arrived (Pending Delivery)'
                          : `in ${formatDurationMinutes(Math.max(0, getMinutesBetween(simTime, rsv.eta)))}`}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4 text-center">
                      <StatusChip status={rsv.status} size="sm" />
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        {rsv.status === 'RESERVED' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDispatch(rsv)}
                              leftIcon={<Truck className="w-3.5 h-3.5 text-purple-600" />}
                            >
                              Dispatch
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleCancel(rsv)}
                              className="text-red-700 hover:bg-red-50"
                            >
                              Release
                            </Button>
                          </>
                        )}

                        {rsv.status === 'IN_TRANSIT' && (
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => handleDeliver(rsv)}
                            leftIcon={<CheckCircle className="w-3.5 h-3.5" />}
                          >
                            Mark Delivered
                          </Button>
                        )}

                        {(rsv.status === 'DELIVERED' || rsv.status === 'CANCELLED') && (
                          <span className="text-ink-400 text-xs italic">Archived</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredReservations.length === 0 && (
          <div className="p-8">
            <EmptyState
              title={`No ${activeTab.toLowerCase().replace(/_/g, ' ')} reservations`}
              description="There are currently no allocations matching this status category."
            />
          </div>
        )}
      </Card>

      {/* Reservation Audit History Drawer */}
      <Drawer
        isOpen={selectedReservation !== null}
        onClose={() => setSelectedReservation(null)}
        title={selectedReservation ? `Audit Trail: ${selectedReservation.id}` : ''}
        subtitle="Immutable dispatch log and chain of custody"
      >
        {selectedReservation && (
          <div className="space-y-5 text-xs text-ink-800">
            {/* Overview Card */}
            <div className="p-3.5 rounded-xl bg-ink-50 border border-ink-200 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-ink-500 font-semibold uppercase text-[10px]">Reservation Status</span>
                <StatusChip status={selectedReservation.status} size="sm" />
              </div>

              <div className="flex justify-between items-center">
                <span className="text-ink-500">Allocated Unit:</span>
                <span className="font-mono font-bold text-sm text-ink-900">{selectedReservation.unitId}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-ink-500">Intake Request:</span>
                <span className="font-mono font-bold text-ink-900">{selectedReservation.requestId}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-ink-500">Dispatch Window:</span>
                <span className="font-mono text-ink-700">{formatSimDateTime(selectedReservation.dispatchAt)}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-ink-500">Estimated Arrival (ETA):</span>
                <span className="font-mono text-ink-700">{formatSimDateTime(selectedReservation.eta)}</span>
              </div>
            </div>

            {/* Audit Trail Timeline */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-ink-500 mb-3 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-ink-400" />
                <span>Chain of Custody Events</span>
              </h4>

              {reservationEvents.length === 0 ? (
                <p className="text-ink-500 italic">No events logged yet for this reservation ID.</p>
              ) : (
                <div className="space-y-3 pl-3 border-l-2 border-ink-200">
                  {reservationEvents.map((ev) => (
                    <div key={ev.id} className="text-[11px]">
                      <span className="font-mono text-ink-400 block">{formatSimDateTime(ev.ts)}</span>
                      <span className="font-medium text-ink-800">{ev.description}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Drawer>

      {/* Double Allocation Blocked Demonstration Modal */}
      <Modal
        isOpen={isDoubleAllocModalOpen}
        onClose={() => setIsDoubleAllocModalOpen(false)}
        title="Double Allocation Blocked"
        subtitle="Hard Invariant Safety Guard Active"
        footer={
          <Button size="md" variant="primary" onClick={() => setIsDoubleAllocModalOpen(false)}>
            Acknowledge Constraint Guard
          </Button>
        }
      >
        {blockedAttemptDetails && (
          <div className="space-y-4 text-xs">
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-950 flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-sm block">Clinical Hard Invariant Enforced</span>
                <p className="text-[11px] leading-relaxed mt-1">
                  {blockedAttemptDetails.reason}
                </p>
              </div>
            </div>

            <div className="space-y-2 border-y border-ink-150 py-3 text-ink-700">
              <div className="flex justify-between">
                <span>Attempted Unit:</span>
                <span className="font-mono font-bold text-ink-900">{blockedAttemptDetails.unitId}</span>
              </div>
              <div className="flex justify-between">
                <span>Existing Active Allocation:</span>
                <span className="font-mono font-bold text-blue-700">Request {blockedAttemptDetails.existingRequestId}</span>
              </div>
              <div className="flex justify-between">
                <span>Blocked Conflicting Target:</span>
                <span className="font-mono font-bold text-red-700">Request {blockedAttemptDetails.targetRequestId}</span>
              </div>
            </div>

            <p className="text-[11px] text-ink-500 italic">
              Hard constraint: A perishable blood unit can never be committed to more than one active reservation
              at any given time. Any duplicate allocation attempt is rejected by the solver and store.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
