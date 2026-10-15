import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Flame,
  Plus,
  ShieldAlert,
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
import { getHospitalName, getHospitalShortName } from '../data/hospitals';
import { getMinutesBetween } from '../engine/clock';
import { planningService } from '../services/planningService';
import { useSimStore } from '../store/useSimStore';
import { BloodGroup, Unit } from '../types/domain';
import { BloodGroupPill } from '../components/domain/BloodGroupPill';
import { ExpiryChip } from '../components/domain/ExpiryChip';
import { KpiCard } from '../components/domain/KpiCard';
import { MapView } from '../components/domain/MapView';
import { StatusChip } from '../components/domain/StatusChip';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { Drawer } from '../components/ui/Drawer';

export function Overview() {
  const navigate = useNavigate();
  const { units, requests, reservations, routes, simTime } = useSimStore();
  const [selectedHospitalId, setSelectedHospitalId] = useState<string>('');
  const [inspectUnit, setInspectUnit] = useState<Unit | null>(null);

  // Compute live optimized plan for metrics
  const plan = useMemo(() => {
    return planningService.getOptimizedPlan(units, requests, routes, simTime);
  }, [units, requests, routes, simTime]);

  // Compute KPI metrics
  const unitsExpiring24h = useMemo(() => {
    return units.filter((u) => {
      if (u.status !== 'AVAILABLE') return false;
      const mins = getMinutesBetween(simTime, u.expiresAt);
      return mins > 0 && mins <= 24 * 60;
    });
  }, [units, simTime]);

  const urgentRequests = useMemo(() => {
    return requests.filter(
      (r) => (r.status === 'OPEN' || r.status === 'PARTIAL') && (r.urgency === 'URGENT' || r.urgency === 'CRITICAL')
    );
  }, [requests]);

  const openRequests = useMemo(() => {
    return requests.filter((r) => r.status === 'OPEN' || r.status === 'PARTIAL');
  }, [requests]);

  // Stock vs Demand chart data by blood group
  const chartData = useMemo(() => {
    const groups: BloodGroup[] = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'];

    return groups.map((grp) => {
      const stockCount = units.filter((u) => u.group === grp && u.status === 'AVAILABLE').length;
      const demandCount = openRequests
        .filter((r) => r.group === grp)
        .reduce((sum, r) => sum + r.unitsNeeded, 0);

      return {
        group: grp,
        Available: stockCount,
        Demand: demandCount,
      };
    });
  }, [units, openRequests]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-heading text-ink-950 tracking-tight">
            Network Operations Dashboard
          </h1>
          <p className="text-sm text-ink-500 mt-1">
            Real-time balance, perishable shelf-life countdowns, and cross-hospital transfer recommendations.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link to="/requests/new">
            <Button size="md" variant="primary" leftIcon={<Plus className="w-4 h-4" />}>
              Create Request
            </Button>
          </Link>
          <Link to="/recommendations">
            <Button size="md" variant="outline" leftIcon={<Sparkles className="w-4 h-4 text-crimson-600" />}>
              View Plan ({plan.assignments.length})
            </Button>
          </Link>
        </div>
      </div>

      {/* 4 Primary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Expiring Within 24h"
          value={unitsExpiring24h.length}
          subtitle="At risk of clinical spoilage (FEFO priority)"
          icon={<Flame className="w-5 h-5 text-amber-600" />}
          badge={{
            text: unitsExpiring24h.length > 0 ? 'HIGH PRIORITY' : 'STABLE',
            variant: unitsExpiring24h.length > 0 ? 'warning' : 'success',
          }}
          onClick={() => navigate('/inventory')}
        />

        <KpiCard
          title="Open Urgent Demands"
          value={urgentRequests.length}
          subtitle={`${openRequests.length} total active requests across network`}
          icon={<AlertTriangle className="w-5 h-5 text-red-600" />}
          badge={{
            text: urgentRequests.length > 0 ? 'REQUIRES MATCH' : 'ALL MET',
            variant: urgentRequests.length > 0 ? 'danger' : 'success',
          }}
          onClick={() => navigate('/recommendations')}
        />

        <KpiCard
          title="Feasible Transfers Found"
          value={plan.metrics.satisfiedRequests}
          subtitle={`Satisfies ${plan.metrics.satisfiedRequests} of ${openRequests.length} open requests`}
          icon={<ShieldAlert className="w-5 h-5 text-emerald-600" />}
          badge={{
            text: `${Math.round((plan.metrics.satisfiedRequests / Math.max(1, openRequests.length)) * 100)}% SATISFIED`,
            variant: 'success',
          }}
          onClick={() => navigate('/recommendations')}
        />

        <KpiCard
          title="Infeasible Demands"
          value={plan.metrics.unfulfilledRequests}
          subtitle="Blocked by compatibility or transit expiry"
          icon={<AlertCircle className="w-5 h-5 text-ink-500" />}
          badge={{
            text: plan.metrics.unfulfilledRequests > 0 ? 'CONSTRAINT BLOCKED' : '0 BLOCKED',
            variant: plan.metrics.unfulfilledRequests > 0 ? 'danger' : 'default',
          }}
          onClick={() => navigate('/recommendations')}
        />
      </div>

      {/* Central Interactive Map Schematic */}
      <MapView
        units={units}
        routes={routes}
        reservations={reservations}
        selectedHospitalId={selectedHospitalId}
        onSelectHospital={setSelectedHospitalId}
      />

      {/* Two Column Grid: Stock vs Demand & Expiring Soon Shelf-life List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Stock vs Demand by Blood Group Chart */}
        <Card>
          <CardHeader
            title="Available Inventory vs Open Demand"
            subtitle="Breakdown by ABO/Rh blood group across 5 facilities"
          />
          <div className="h-64 w-full text-xs">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="group" stroke="#64748B" tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} />
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
                <Bar dataKey="Available" fill="#059669" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Demand" fill="#B42318" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Expiring Soon Watchlist */}
        <Card>
          <CardHeader
            title="Perishable Spoilage Watchlist"
            subtitle="Units with nearest expiry requiring FEFO allocation"
            action={
              <Link to="/inventory" className="text-xs font-semibold text-crimson-600 hover:text-crimson-700">
                View all inventory &rarr;
              </Link>
            }
          />
          <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
            {unitsExpiring24h.length === 0 ? (
              <div className="text-center py-8 text-xs text-ink-500">
                No units currently expiring within 24 hours. Stock shelf-life is stable.
              </div>
            ) : (
              unitsExpiring24h.slice(0, 6).map((unit) => (
                <div
                  key={unit.id}
                  onClick={() => setInspectUnit(unit)}
                  className="flex items-center justify-between p-2.5 rounded-lg border border-ink-100 hover:bg-ink-50 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <BloodGroupPill group={unit.group} size="sm" />
                    <div>
                      <span className="font-mono text-xs font-semibold text-ink-900 block">{unit.id}</span>
                      <span className="text-[11px] text-ink-500">{unit.component} &bull; {getHospitalShortName(unit.hospitalId)}</span>
                    </div>
                  </div>
                  <ExpiryChip expiresAt={unit.expiresAt} simTime={simTime} />
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Open Blood Requests Queue */}
      <Card>
        <CardHeader
          title="Active Intake Demands"
          subtitle="Hospital blood component requests pending transfer or fulfillment"
          action={
            <Link to="/requests/new">
              <Button size="sm" variant="outline" leftIcon={<Plus className="w-3.5 h-3.5" />}>
                Add Request
              </Button>
            </Link>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-ink-200 text-ink-500 font-medium">
                <th className="py-2.5 px-3">Request ID</th>
                <th className="py-2.5 px-3">Hospital</th>
                <th className="py-2.5 px-3">Component</th>
                <th className="py-2.5 px-3">Group</th>
                <th className="py-2.5 px-3">Qty</th>
                <th className="py-2.5 px-3">Urgency</th>
                <th className="py-2.5 px-3">Needed By</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {openRequests.map((req) => {
                const assigned = plan.assignments.find((a) => a.requestId === req.id);
                return (
                  <tr key={req.id} className="border-b border-ink-100 hover:bg-ink-50/60 transition-colors">
                    <td className="py-3 px-3 font-mono font-semibold text-ink-900">{req.id}</td>
                    <td className="py-3 px-3 font-medium text-ink-800">{getHospitalShortName(req.hospitalId)}</td>
                    <td className="py-3 px-3 text-ink-600">{req.component}</td>
                    <td className="py-3 px-3">
                      <BloodGroupPill group={req.group} size="sm" />
                    </td>
                    <td className="py-3 px-3 font-mono">{req.unitsNeeded} unit(s)</td>
                    <td className="py-3 px-3">
                      <StatusChip status={req.urgency} size="sm" />
                    </td>
                    <td className="py-3 px-3 font-mono text-ink-600">
                      {new Date(req.neededBy).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })} UTC
                    </td>
                    <td className="py-3 px-3 text-right">
                      <Button
                        size="sm"
                        variant={assigned?.isComplete ? 'outline' : 'primary'}
                        onClick={() => navigate(`/recommendations?requestId=${req.id}`)}
                        rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
                      >
                        Plan Transfer
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Unit Inspection Drawer */}
      <Drawer
        isOpen={inspectUnit !== null}
        onClose={() => setInspectUnit(null)}
        title={inspectUnit ? `Unit Profile: ${inspectUnit.id}` : ''}
        subtitle="Full provenance and perishable shelf-life tracking"
      >
        {inspectUnit && (
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-ink-50 rounded-lg flex items-center justify-between border border-ink-200">
              <span className="text-ink-600">Blood Component & Group</span>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-ink-900">{inspectUnit.component}</span>
                <BloodGroupPill group={inspectUnit.group} size="sm" />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between py-1.5 border-b border-ink-100">
                <span className="text-ink-500">Current Facility</span>
                <span className="font-medium text-ink-900">{getHospitalName(inspectUnit.hospitalId)}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-ink-100">
                <span className="text-ink-500">Collected Timestamp</span>
                <span className="font-mono text-ink-800">{new Date(inspectUnit.collectedAt).toUTCString()}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-ink-100">
                <span className="text-ink-500">Expiry Deadline</span>
                <span className="font-mono text-ink-800">{new Date(inspectUnit.expiresAt).toUTCString()}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-ink-100">
                <span className="text-ink-500">Current Status</span>
                <StatusChip status={inspectUnit.status} size="sm" />
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
