import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  Building2,
  Clock,
  FileQuestion,
  ShieldCheck,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { getHospitalName, getHospitalShortName, HOSPITALS } from '../data/hospitals';
import { findRoute } from '../data/transportMatrix';
import { formatDurationMinutes, formatSimDateTime, formatSimTimeOnly } from '../engine/clock';
import { evaluateCandidate, FeasibilityContext } from '../engine/feasibility';
import { useSimStore } from '../store/useSimStore';
import { PlanOption } from '../types/domain';
import { cn } from '../utils/cn';
import { BloodGroupPill } from '../components/domain/BloodGroupPill';
import { RecommendationCard } from '../components/domain/RecommendationCard';
import { StatusChip } from '../components/domain/StatusChip';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { Drawer } from '../components/ui/Drawer';
import { EmptyState } from '../components/ui/EmptyState';
import { useToast } from '../components/ui/useToast';

export function Recommendations() {
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    units,
    requests,
    reservations,
    routes,
    simTime,
    cancelReservation,
  } = useSimStore();

  const { addToast } = useToast();

  const [isWhyDrawerOpen, setIsWhyDrawerOpen] = useState(false);
  const [inspectUnitId, setInspectUnitId] = useState<string | null>(null);

  // Active request selection
  const openRequests = useMemo(() => {
    return requests.filter((r) => r.status === 'OPEN' || r.status === 'PARTIAL');
  }, [requests]);

  const activeRequestId = searchParams.get('requestId') || openRequests[0]?.id || requests[0]?.id;
  const activeRequest = useMemo(() => {
    return requests.find((r) => r.id === activeRequestId);
  }, [requests, activeRequestId]);

  // Context for evaluation
  const ctx: FeasibilityContext = useMemo(() => ({ now: simTime, routes }), [simTime, routes]);

  // Evaluate candidate units for active request
  const { feasibleCandidates, infeasibleCandidates } = useMemo(() => {
    if (!activeRequest) return { feasibleCandidates: [], infeasibleCandidates: [] };

    const evaluated: PlanOption[] = [];
    for (const unit of units) {
      const opt = evaluateCandidate(unit, activeRequest, ctx);
      evaluated.push(opt);
    }

    // Feasible candidates sorted by cost (which factors transit + FEFO + safety margin)
    const feasible = evaluated
      .filter((e) => e.feasible)
      .sort((a, b) => a.cost - b.cost)
      .map((opt, idx) => ({ ...opt, rank: idx + 1 }));

    // Infeasible candidates sorted by nearest
    const infeasible = evaluated
      .filter((e) => !e.feasible)
      .sort((a, b) => a.transitMinutes - b.transitMinutes);

    return { feasibleCandidates: feasible, infeasibleCandidates: infeasible };
  }, [units, activeRequest, ctx]);

  // Existing active allocations for this request
  const requestReservations = useMemo(() => {
    if (!activeRequest) return [];
    return reservations.filter(
      (r) => r.requestId === activeRequest.id && (r.status === 'RESERVED' || r.status === 'IN_TRANSIT')
    );
  }, [reservations, activeRequest]);

  // Handle Reserve single unit
  const handleReserveUnit = async (option: PlanOption) => {
    if (!activeRequest) return;

    const res = await useSimStore.getState().createReservation(option.unitId, activeRequest.id);

    if (res.success && res.reservation) {
      const rsvId = res.reservation.id;
      addToast({
        type: 'success',
        title: `Unit ${option.unitId} Reserved`,
        message: `Dispatch booked from ${getHospitalShortName(option.fromHospitalId)} to ${getHospitalShortName(option.toHospitalId)}. ETA: ${formatSimTimeOnly(option.eta)}.`,
        actionLabel: 'Undo Reservation',
        onAction: async () => {
          await cancelReservation(rsvId);
          addToast({
            type: 'info',
            title: 'Reservation Undone',
            message: `Unit ${option.unitId} released back to available inventory.`,
          });
        },
      });
    } else {
      addToast({
        type: 'error',
        title: 'Reservation Blocked',
        message: res.reason || 'Could not complete reservation due to constraint violation.',
      });
    }
  };

  // Handle Reserve All needed units
  const handleReserveAll = async () => {
    if (!activeRequest) return;
    const needed = activeRequest.unitsNeeded - requestReservations.length;
    const candidatesToTake = feasibleCandidates.slice(0, needed);

    let successCount = 0;
    const reservedIds: string[] = [];

    for (const cand of candidatesToTake) {
      const res = await useSimStore.getState().createReservation(cand.unitId, activeRequest.id);
      if (res.success && res.reservation) {
        successCount++;
        reservedIds.push(res.reservation.id);
      }
    }

    if (successCount > 0) {
      addToast({
        type: 'success',
        title: `${successCount} Unit(s) Reserved`,
        message: `Transfer plan confirmed for request ${activeRequest.id}.`,
        actionLabel: 'Undo All',
        onAction: async () => {
          for (const id of reservedIds) {
            await cancelReservation(id);
          }
        },
      });
    }
  };

  const inspectedUnit = useMemo(() => {
    if (!inspectUnitId) return null;
    return units.find((u) => u.id === inspectUnitId) || null;
  }, [units, inspectUnitId]);

  if (!activeRequest) {
    return (
      <EmptyState
        title="No active blood requests"
        description="There are currently no open hospital component requests. Create a new request to see recommendations."
      />
    );
  }

  const isFulfilled = requestReservations.length >= activeRequest.unitsNeeded;
  const destinationHospital = HOSPITALS.find((h) => h.id === activeRequest.hospitalId);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold font-heading text-ink-950 tracking-tight">
              Transfer Recommendations
            </h1>
            <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-crimson-100 text-crimson-800 border border-crimson-200">
              {activeRequest.id}
            </span>
          </div>
          <p className="text-sm text-ink-500 mt-1">
            Constraint-verified candidate transfers ranked by proximity, FEFO spoilage prevention, and arrival safety margin.
          </p>
        </div>

        {/* Request Selector Dropdown */}
        <div className="flex items-center gap-2">
          <label htmlFor="req-select" className="text-xs font-semibold text-ink-500 hidden sm:inline">
            Request:
          </label>
          <select
            id="req-select"
            value={activeRequestId}
            onChange={(e) => setSearchParams({ requestId: e.target.value })}
            className="px-3.5 py-2 rounded-lg border border-ink-200 bg-white font-mono text-xs font-semibold text-ink-800 focus:outline-none focus:ring-2 focus:ring-crimson-600"
          >
            {requests.map((r) => (
              <option key={r.id} value={r.id}>
                {r.id}: {r.unitsNeeded}x {r.group} {r.component} ({getHospitalShortName(r.hospitalId)}) - {r.urgency}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Hero Request Summary Banner */}
      <Card className="bg-gradient-to-r from-ink-900 to-ink-950 text-white border-ink-800 shadow-card">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded bg-white/10 text-white border border-white/20">
                INTAKE {activeRequest.id}
              </span>
              <StatusChip status={activeRequest.urgency} size="sm" />
              <StatusChip status={activeRequest.status} size="sm" />
            </div>

            <div className="flex items-baseline gap-3">
              <h2 className="text-2xl sm:text-3xl font-extrabold font-heading text-white">
                {activeRequest.unitsNeeded}x {activeRequest.component}
              </h2>
              <BloodGroupPill group={activeRequest.group} size="lg" />
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs text-ink-300">
              <span className="flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-crimson-400" />
                <span>Destination: <strong>{destinationHospital?.name}</strong></span>
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-amber-400" />
                <span>
                  Needed by: <strong>{formatSimTimeOnly(activeRequest.neededBy)}</strong> (in{' '}
                  {formatDurationMinutes(Math.max(0, (new Date(activeRequest.neededBy).getTime() - new Date(simTime).getTime()) / 60000))})
                </span>
              </span>
            </div>

            {activeRequest.clinicalContext && (
              <p className="text-xs text-ink-400 italic pt-1">
                &ldquo;{activeRequest.clinicalContext}&rdquo;
              </p>
            )}
          </div>

          {/* Allocation Progress & Action Bar */}
          <div className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/15 flex flex-col justify-between gap-3 min-w-[260px]">
            <div className="flex items-center justify-between">
              <span className="text-xs text-ink-300 font-medium">Fulfillment Status</span>
              <span className="text-xs font-mono font-bold text-white">
                {requestReservations.length} / {activeRequest.unitsNeeded} Allocated
              </span>
            </div>

            {/* Progress Bar */}
            <div className="h-2 w-full bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-400 rounded-full transition-all duration-300"
                style={{
                  width: `${Math.min(100, (requestReservations.length / activeRequest.unitsNeeded) * 100)}%`,
                }}
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              {!isFulfilled && feasibleCandidates.length > 0 && (
                <Button
                  size="sm"
                  variant="primary"
                  className="w-full bg-crimson-600 hover:bg-crimson-700"
                  onClick={handleReserveAll}
                  leftIcon={<ShieldCheck className="w-4 h-4" />}
                >
                  Reserve Feasible
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="w-full text-white border-white/30 hover:bg-white/10"
                onClick={() => setIsWhyDrawerOpen(true)}
                leftIcon={<FileQuestion className="w-4 h-4" />}
              >
                Why this plan?
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Main Grid: Feasible Recommendations & Infeasible Transparency List */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Ranked Feasible Recommendation Cards */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold font-heading text-ink-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-crimson-600" />
              <span>Ranked Transfer Candidates ({feasibleCandidates.length})</span>
            </h3>
            <span className="text-xs text-ink-500">
              Sorted by Min-Cost logistics score
            </span>
          </div>

          {feasibleCandidates.length === 0 ? (
            <Card className="p-8 text-center bg-ink-50/60 border-dashed">
              <AlertCircle className="w-10 h-10 text-amber-500 mx-auto mb-2" />
              <h4 className="text-base font-semibold text-ink-900 mb-1">No Feasible Transfers Found</h4>
              <p className="text-xs text-ink-500 max-w-md mx-auto mb-4">
                All candidates in regional inventory are blocked by incompatibility, transit route failures,
                or shelf-life expiration before arrival. See the constraint report on the right.
              </p>
            </Card>
          ) : (
            <div className="space-y-4">
              {feasibleCandidates.map((option, idx) => (
                <RecommendationCard
                  key={option.unitId}
                  option={option}
                  rank={idx + 1}
                  isRecommended={idx === 0}
                  onReserve={handleReserveUnit}
                  onInspectUnit={(uId) => setInspectUnitId(uId)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right 1 Col: Infeasible Candidates Transparency & Mini Schematic */}
        <div className="space-y-6">
          {/* Mini Route Preview Card */}
          <Card>
            <CardHeader
              title="Destination Facility Topology"
              subtitle={`Transit to ${destinationHospital?.name}`}
            />
            <div className="space-y-2.5 text-xs">
              {HOSPITALS.filter((h) => h.id !== activeRequest.hospitalId).map((source) => {
                const rt = findRoute(routes, source.id, activeRequest.hospitalId);
                const isDown = rt?.status === 'DOWN';
                const minutes = (rt?.baseMinutes ?? 30) + (rt?.delayMinutes ?? 0);

                return (
                  <div
                    key={source.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-ink-50/70 border border-ink-100"
                  >
                    <div>
                      <span className="font-semibold text-ink-900 block">{source.shortName}</span>
                      <span className="text-[11px] text-ink-500">{source.tier}</span>
                    </div>
                    <div className="text-right">
                      <span
                        className={cn(
                          'font-mono font-bold block',
                          isDown ? 'text-red-600' : 'text-ink-800'
                        )}
                      >
                        {isDown ? 'ROUTE DOWN' : `${minutes} min`}
                      </span>
                      {!isDown && (
                        <span className="text-[10px] text-ink-400 font-mono">
                          +15m dispatch buffer
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Infeasible Candidates Transparency List */}
          <Card>
            <CardHeader
              title={`Ineligible Units (${infeasibleCandidates.length})`}
              subtitle="Full transparency: why candidates were rejected"
            />
            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {infeasibleCandidates.slice(0, 10).map((cand) => (
                <div
                  key={cand.unitId}
                  className="p-3 rounded-lg border border-red-200 bg-red-50/40 text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setInspectUnitId(cand.unitId)}
                      className="font-mono font-semibold text-ink-900 hover:text-crimson-600 underline"
                    >
                      {cand.unitId}
                    </button>
                    <div className="flex items-center gap-1.5">
                      <BloodGroupPill group={cand.unit.group} size="sm" />
                      <span className="text-[11px] text-ink-500">
                        {getHospitalShortName(cand.fromHospitalId)}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    {cand.blockingReasons.map((reason, idx) => (
                      <span
                        key={idx}
                        className="text-[11px] text-red-800 font-medium block flex items-start gap-1"
                      >
                        <XCircle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
                        <span>{reason}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* "Why This Plan?" Rationale Drawer */}
      <Drawer
        isOpen={isWhyDrawerOpen}
        onClose={() => setIsWhyDrawerOpen(false)}
        title="Optimization Rationale & Trade-offs"
        subtitle={`Mathematical assignment analysis for Request ${activeRequest.id}`}
        width="lg"
      >
        <div className="space-y-5 text-xs text-ink-800 leading-relaxed">
          <div className="p-3 rounded-lg bg-crimson-50 border border-crimson-200 text-crimson-950">
            <span className="font-bold block mb-1">Solver Method: Min-Cost Bipartite Assignment</span>
            <p className="text-[11px] leading-relaxed">
              Unlike local greedy heuristic choices, the global solver evaluates the network as a multi-commodity flow.
              It optimizes transport duration while applying an explicit bonus for FEFO (soonest-expiring units)
              and a steep penalty for expiring units with slim safety margins.
            </p>
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-ink-900 mb-2">
              Key Decision Bullets for {activeRequest.id}
            </h4>
            <ul className="space-y-2.5 list-disc list-inside text-ink-700">
              <li>
                <strong>Hard Feasibility Filter:</strong> Candidates must satisfy ABO/Rh synthetic rules, route operational status (UP),
                and arrive with at least 30 minutes before expiration.
              </li>
              <li>
                <strong>Nearest Unit Trade-off:</strong> If a nearer hospital unit is rejected, it is because its shelf-life is insufficient
                to survive the 15-minute dispatch buffer and road transit duration safely.
              </li>
              <li>
                <strong>Waste Aversion (FEFO):</strong> Units expiring within 72 hours receive priority matching to avert perishable spoilage
                in storage refrigerators.
              </li>
              <li>
                <strong>Urgency Deadline:</strong> Transfer ETA is verified to guarantee arrival before the clinical needed-by deadline ({formatSimTimeOnly(activeRequest.neededBy)}).
              </li>
            </ul>
          </div>

          <div className="p-3 rounded-lg bg-ink-50 border border-ink-200">
            <span className="font-semibold text-ink-900 block mb-1">Clinical Safety Disclaimer</span>
            <p className="text-[11px] text-ink-500">
              BloodStock recommendations are computational logistics support models. Final component compatibility
              and release authority rests with qualified blood bank clinical laboratory staff.
            </p>
          </div>
        </div>
      </Drawer>

      {/* Unit Detail Drawer */}
      <Drawer
        isOpen={inspectedUnit !== null}
        onClose={() => setInspectUnitId(null)}
        title={inspectedUnit ? `Unit Record: ${inspectedUnit.id}` : ''}
        subtitle="Shelf-life and provenance inspection"
      >
        {inspectedUnit && (
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-ink-50 rounded-lg flex items-center justify-between border border-ink-200">
              <span className="text-ink-600">Component & Group</span>
              <div className="flex items-center gap-2">
                <span className="font-bold">{inspectedUnit.component}</span>
                <BloodGroupPill group={inspectedUnit.group} size="sm" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between py-1 border-b border-ink-100">
                <span className="text-ink-500">Hospital Location:</span>
                <span className="font-medium text-ink-900">{getHospitalName(inspectedUnit.hospitalId)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-ink-100">
                <span className="text-ink-500">Collected At:</span>
                <span className="font-mono text-ink-800">{formatSimDateTime(inspectedUnit.collectedAt)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-ink-100">
                <span className="text-ink-500">Expires At:</span>
                <span className="font-mono text-ink-800">{formatSimDateTime(inspectedUnit.expiresAt)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-ink-100">
                <span className="text-ink-500">Status:</span>
                <StatusChip status={inspectedUnit.status} size="sm" />
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
