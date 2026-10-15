import { useMemo, useState } from 'react';
import {
  Award,
  Layers,
  Sparkles,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getHospitalShortName } from '../data/hospitals';
import { formatDurationMinutes } from '../engine/clock';
import { planningService } from '../services/planningService';
import { useSimStore } from '../store/useSimStore';
import { cn } from '../utils/cn';
import { BloodGroupPill } from '../components/domain/BloodGroupPill';
import { StatusChip } from '../components/domain/StatusChip';
import { Card, CardHeader } from '../components/ui/Card';
import { Tabs } from '../components/ui/Tabs';

export function ComparePlans() {
  const { units, requests, routes, simTime } = useSimStore();
  const [mobileTab, setMobileTab] = useState<'optimized' | 'baseline'>('optimized');

  // Compute both plans simultaneously
  const baselinePlan = useMemo(() => {
    return planningService.getBaselinePlan(units, requests, routes, simTime);
  }, [units, requests, routes, simTime]);

  const optimizedPlan = useMemo(() => {
    return planningService.getOptimizedPlan(units, requests, routes, simTime);
  }, [units, requests, routes, simTime]);

  // Compute comparison deltas
  const bMetrics = baselinePlan.metrics;
  const oMetrics = optimizedPlan.metrics;

  const satisfiedDelta = oMetrics.satisfiedRequests - bMetrics.satisfiedRequests;
  const unfulfilledDelta = oMetrics.unfulfilledRequests - bMetrics.unfulfilledRequests;
  const wasteDelta = oMetrics.wastedUnits72h - bMetrics.wastedUnits72h;
  const marginDelta = oMetrics.avgExpiryMarginMinutes - bMetrics.avgExpiryMarginMinutes;
  const transitDelta = oMetrics.totalTransportMinutes - bMetrics.totalTransportMinutes;

  // Identify differing assignments between baseline and optimized
  const comparisonRows = useMemo(() => {
    return requests
      .filter((r) => r.status === 'OPEN' || r.status === 'PARTIAL')
      .map((req) => {
        const bAssign = baselinePlan.assignments.find((a) => a.requestId === req.id);
        const oAssign = optimizedPlan.assignments.find((a) => a.requestId === req.id);

        const bUnits = (bAssign?.allocatedUnitIds || []).sort().join(',');
        const oUnits = (oAssign?.allocatedUnitIds || []).sort().join(',');
        const isDifferent = bUnits !== oUnits;

        return {
          request: req,
          baseline: bAssign,
          optimized: oAssign,
          isDifferent,
        };
      });
  }, [requests, baselinePlan, optimizedPlan]);

  // Chart metrics for Recharts visualization
  const chartData = [
    {
      metric: 'Satisfied Requests',
      Baseline: bMetrics.satisfiedRequests,
      Optimized: oMetrics.satisfiedRequests,
    },
    {
      metric: 'Unfulfilled Demands',
      Baseline: bMetrics.unfulfilledRequests,
      Optimized: oMetrics.unfulfilledRequests,
    },
    {
      metric: 'Units Wasted (72h)',
      Baseline: bMetrics.wastedUnits72h,
      Optimized: oMetrics.wastedUnits72h,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold font-heading text-ink-950 tracking-tight flex items-center gap-2">
          <span>Compare Planning Algorithms</span>
        </h1>
        <p className="text-sm text-ink-500 mt-1">
          Evaluating the local <strong>Nearest-Available Baseline</strong> heuristic against the global{' '}
          <strong>Min-Cost Multi-Hospital Flow Solver</strong>.
        </p>
      </div>

      {/* High Level KPI Metrics Row with Delta Badges */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Satisfied Requests */}
        <div className="bg-white p-4 rounded-xl border border-ink-200 shadow-soft">
          <span className="text-[11px] font-semibold text-ink-500 uppercase tracking-wider block mb-1">
            Satisfied Demands
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-ink-900">{oMetrics.satisfiedRequests}</span>
            <span
              className={cn(
                'text-xs font-mono font-bold px-2 py-0.5 rounded-full border',
                satisfiedDelta >= 0
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-red-50 text-red-800 border-red-200'
              )}
            >
              {satisfiedDelta >= 0 ? `+${satisfiedDelta}` : satisfiedDelta} vs base
            </span>
          </div>
          <span className="text-[11px] text-ink-400 mt-1 block">Baseline: {bMetrics.satisfiedRequests}</span>
        </div>

        {/* Unfulfilled Demands */}
        <div className="bg-white p-4 rounded-xl border border-ink-200 shadow-soft">
          <span className="text-[11px] font-semibold text-ink-500 uppercase tracking-wider block mb-1">
            Unfulfilled Demands
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-ink-900">{oMetrics.unfulfilledRequests}</span>
            <span
              className={cn(
                'text-xs font-mono font-bold px-2 py-0.5 rounded-full border',
                unfulfilledDelta <= 0
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-red-50 text-red-800 border-red-200'
              )}
            >
              {unfulfilledDelta <= 0 ? `${unfulfilledDelta}` : `+${unfulfilledDelta}`}
            </span>
          </div>
          <span className="text-[11px] text-ink-400 mt-1 block">Baseline: {bMetrics.unfulfilledRequests}</span>
        </div>

        {/* Spoilage / Waste */}
        <div className="bg-white p-4 rounded-xl border border-ink-200 shadow-soft">
          <span className="text-[11px] font-semibold text-ink-500 uppercase tracking-wider block mb-1">
            72h Spoilage Waste
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-ink-900">{oMetrics.wastedUnits72h}</span>
            <span
              className={cn(
                'text-xs font-mono font-bold px-2 py-0.5 rounded-full border',
                wasteDelta <= 0
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border-amber-200'
              )}
            >
              {wasteDelta <= 0 ? `${wasteDelta} saved` : `+${wasteDelta}`}
            </span>
          </div>
          <span className="text-[11px] text-ink-400 mt-1 block">Baseline: {bMetrics.wastedUnits72h} units</span>
        </div>

        {/* Average Expiry Margin */}
        <div className="bg-white p-4 rounded-xl border border-ink-200 shadow-soft">
          <span className="text-[11px] font-semibold text-ink-500 uppercase tracking-wider block mb-1">
            Avg Expiry Safety
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-ink-900">
              {formatDurationMinutes(oMetrics.avgExpiryMarginMinutes)}
            </span>
            <span
              className={cn(
                'text-xs font-mono font-bold px-2 py-0.5 rounded-full border',
                marginDelta >= 0
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-ink-100 text-ink-600 border-ink-200'
              )}
            >
              {marginDelta >= 0 ? `+${marginDelta}m` : `${marginDelta}m`}
            </span>
          </div>
          <span className="text-[11px] text-ink-400 mt-1 block">
            Baseline: {formatDurationMinutes(bMetrics.avgExpiryMarginMinutes)}
          </span>
        </div>

        {/* Total Transit Minutes */}
        <div className="bg-white p-4 rounded-xl border border-ink-200 shadow-soft col-span-2 lg:col-span-1">
          <span className="text-[11px] font-semibold text-ink-500 uppercase tracking-wider block mb-1">
            Total Transit Time
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-ink-900">
              {oMetrics.totalTransportMinutes}m
            </span>
            <span className="text-xs font-mono text-ink-500">
              {transitDelta > 0 ? `+${transitDelta}m (trade-off)` : `${transitDelta}m`}
            </span>
          </div>
          <span className="text-[11px] text-ink-400 mt-1 block">Baseline: {bMetrics.totalTransportMinutes}m</span>
        </div>
      </div>

      {/* "What Changed and Why" Plain Language Analysis Card */}
      <Card className="bg-crimson-50/40 border-crimson-200">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-crimson-100 text-crimson-800 rounded-lg shrink-0 mt-0.5">
            <Award className="w-5 h-5 text-crimson-700" />
          </div>
          <div className="space-y-1.5 text-xs text-ink-800 leading-relaxed">
            <h3 className="text-sm font-bold font-heading text-crimson-950">
              Operational Impact: What Changed and Why?
            </h3>
            <p>
              The <strong>Nearest-Available Baseline</strong> greedily assigns the closest feasible unit to the first
              urgent request in line. While intuitive, this local myopia can exhaust universal donor stock (like O-),
              leaving subsequent critical patients with zero feasible alternatives.
            </p>
            <p>
              In contrast, the <strong>Global Optimized Solver</strong> coordinates reservations simultaneously across all facilities.
              By applying a First-Expired-First-Out (FEFO) reward and an urgency-weighted penalty matrix, it successfully{' '}
              <strong>satisfied {oMetrics.satisfiedRequests} requests</strong>, averting spoilage of near-expiry components
              and ensuring higher-urgency trauma patients are never blocked.
            </p>
          </div>
        </div>
      </Card>

      {/* Recharts Comparison Chart */}
      <Card>
        <CardHeader
          title="Performance Metric Comparison"
          subtitle="Baseline greedy heuristic vs Global min-cost solver"
        />
        <div className="h-64 w-full text-xs">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="metric" stroke="#64748B" tick={{ fontSize: 11 }} />
              <YAxis stroke="#64748B" tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '8px',
                  border: '1px solid #E2E8F0',
                  fontSize: '12px',
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
              <Bar dataKey="Baseline" fill="#94A3B8" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Optimized" fill="#B42318" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Mobile Tab Switcher */}
      <div className="lg:hidden">
        <Tabs
          tabs={[
            { id: 'optimized', label: 'Optimized Plan (Recommended)', count: oMetrics.satisfiedRequests },
            { id: 'baseline', label: 'Nearest-Available Baseline', count: bMetrics.satisfiedRequests },
          ]}
          activeTab={mobileTab}
          onChange={(id) => setMobileTab(id as 'optimized' | 'baseline')}
        />
      </div>

      {/* Two Column Side-by-Side Comparison (Desktop) / Tabbed (Mobile) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Optimized Column */}
        <div className={cn('space-y-4', mobileTab !== 'optimized' && 'hidden lg:block')}>
          <div className="flex items-center justify-between p-3 rounded-xl bg-crimson-600 text-white shadow-soft">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-300" />
              <span className="font-bold text-sm">Global Optimized Solver</span>
            </div>
            <span className="text-xs font-mono font-semibold bg-white/20 px-2.5 py-0.5 rounded-full">
              Recommended Plan
            </span>
          </div>

          <div className="space-y-3">
            {comparisonRows.map(({ request, optimized, isDifferent }) => (
              <div
                key={request.id}
                className={cn(
                  'p-4 rounded-xl border transition-all text-xs space-y-2',
                  isDifferent
                    ? 'bg-crimson-50/50 border-crimson-300 shadow-sm ring-1 ring-crimson-200'
                    : 'bg-white border-ink-200'
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-ink-900">{request.id}</span>
                    <BloodGroupPill group={request.group} size="sm" />
                    <span className="text-ink-600 font-medium">
                      {request.unitsNeeded}x {request.component}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {isDifferent && (
                      <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                        REROUTED / DIFF
                      </span>
                    )}
                    <StatusChip status={optimized?.isComplete ? 'FEASIBLE' : 'INFEASIBLE'} size="sm" />
                  </div>
                </div>

                <div className="pt-2 border-t border-ink-150 text-ink-700 leading-relaxed">
                  {optimized?.options && optimized.options.length > 0 ? (
                    <div className="space-y-1.5">
                      {optimized.options.map((opt) => (
                        <div key={opt.unitId} className="flex items-center justify-between">
                          <span className="font-mono text-[11px] font-semibold text-ink-900">
                            Unit: {opt.unitId} ({getHospitalShortName(opt.fromHospitalId)})
                          </span>
                          <span className="text-[11px] text-ink-500 font-mono">
                            {opt.transitMinutes}m transit &bull; {formatDurationMinutes(opt.expiryMarginMinutes)} margin
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-red-700 font-medium">{optimized?.explanation}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Baseline Column */}
        <div className={cn('space-y-4', mobileTab !== 'baseline' && 'hidden lg:block')}>
          <div className="flex items-center justify-between p-3 rounded-xl bg-ink-800 text-white shadow-soft">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-ink-300" />
              <span className="font-bold text-sm">Nearest-Available Baseline</span>
            </div>
            <span className="text-xs font-mono font-semibold bg-white/20 px-2.5 py-0.5 rounded-full">
              Greedy Baseline
            </span>
          </div>

          <div className="space-y-3">
            {comparisonRows.map(({ request, baseline, isDifferent }) => (
              <div
                key={request.id}
                className={cn(
                  'p-4 rounded-xl border transition-all text-xs space-y-2',
                  isDifferent ? 'bg-amber-50/40 border-amber-200' : 'bg-white border-ink-200'
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-ink-900">{request.id}</span>
                    <BloodGroupPill group={request.group} size="sm" />
                    <span className="text-ink-600 font-medium">
                      {request.unitsNeeded}x {request.component}
                    </span>
                  </div>
                  <StatusChip status={baseline?.isComplete ? 'FEASIBLE' : 'INFEASIBLE'} size="sm" />
                </div>

                <div className="pt-2 border-t border-ink-150 text-ink-700 leading-relaxed">
                  {baseline?.options && baseline.options.length > 0 ? (
                    <div className="space-y-1.5">
                      {baseline.options.map((opt) => (
                        <div key={opt.unitId} className="flex items-center justify-between">
                          <span className="font-mono text-[11px] font-semibold text-ink-900">
                            Unit: {opt.unitId} ({getHospitalShortName(opt.fromHospitalId)})
                          </span>
                          <span className="text-[11px] text-ink-500 font-mono">
                            {opt.transitMinutes}m transit &bull; {formatDurationMinutes(opt.expiryMarginMinutes)} margin
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-red-700 font-medium">{baseline?.explanation}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
