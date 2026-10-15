import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  PackagePlus,
  Play,
  RefreshCw,
  RotateCcw,
  Truck,
  XCircle,
} from 'lucide-react';
import { HOSPITALS } from '../data/hospitals';
import { useSimStore } from '../store/useSimStore';
import { BloodGroup, Component } from '../types/domain';
import { cn } from '../utils/cn';
import { Timeline } from '../components/domain/Timeline';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { useToast } from '../components/ui/useToast';

export function Simulator() {
  const {
    requests,
    routes,
    events,
    lastDiff,
    applyScenario,
    getInvariants,
    restoreRoute,
  } = useSimStore();

  const { addToast } = useToast();
  const [selectedScenarioTab, setSelectedScenarioTab] = useState<
    'transport' | 'demand' | 'cancel' | 'stock'
  >('transport');

  // Scenario 1: Transport Failure Form State
  const [transFrom, setTransFrom] = useState<string>('H1');
  const [transTo, setTransTo] = useState<string>('H4');
  const [transAction, setTransAction] = useState<'SET_DOWN' | 'ADD_DELAY'>('SET_DOWN');
  const [transDelay, setTransDelay] = useState<number>(30);

  // Scenario 2: Demand Spike Form State
  const [spikeHospital, setSpikeHospital] = useState<string>('H5');
  const [spikeComponent, setSpikeComponent] = useState<Component>('RED_CELLS');
  const [spikeGroup, setSpikeGroup] = useState<BloodGroup>('O-');
  const [spikeUnits, setSpikeUnits] = useState<number>(2);
  const spikeUrgency = 'CRITICAL' as const;
  const [spikeMinsNeeded, setSpikeMinsNeeded] = useState<number>(45);

  // Scenario 3: Cancellation Form State
  const [cancelRequestId, setCancelRequestId] = useState<string>(requests[0]?.id || '');

  // Scenario 4: New Stock Form State
  const [stockHospital, setStockHospital] = useState<string>('H1');
  const [stockComponent, setStockComponent] = useState<Component>('PLATELETS');
  const [stockGroup, setStockGroup] = useState<BloodGroup>('O-');
  const [stockCount, setStockCount] = useState<number>(3);
  const [stockShelfHours, setStockShelfHours] = useState<number>(72);

  // Live invariants check
  const liveInvariants = getInvariants();

  const handleRunScenario = async () => {
    let result;

    if (selectedScenarioTab === 'transport') {
      result = await applyScenario({
        type: 'TRANSPORT_FAILURE',
        params: {
          fromId: transFrom,
          toId: transTo,
          action: transAction,
          delayMinutes: transAction === 'ADD_DELAY' ? transDelay : 0,
        },
      });
    } else if (selectedScenarioTab === 'demand') {
      result = await applyScenario({
        type: 'DEMAND_SPIKE',
        params: {
          hospitalId: spikeHospital,
          component: spikeComponent,
          group: spikeGroup,
          unitsNeeded: spikeUnits,
          urgency: spikeUrgency,
          minutesNeededIn: spikeMinsNeeded,
        },
      });
    } else if (selectedScenarioTab === 'cancel') {
      result = await applyScenario({
        type: 'CANCELLATION',
        params: {
          requestId: cancelRequestId,
        },
      });
    } else {
      result = await applyScenario({
        type: 'NEW_STOCK',
        params: {
          hospitalId: stockHospital,
          component: stockComponent,
          group: stockGroup,
          count: stockCount,
          shelfLifeHours: stockShelfHours,
        },
      });
    }

    if (result.success) {
      addToast({
        type: 'success',
        title: 'Scenario Injected & Plan Re-optimized',
        message: 'Diff computed, in-transit deliveries locked, and all clinical invariants strictly verified.',
      });
    } else {
      addToast({
        type: 'error',
        title: 'Scenario Execution Error',
        message: result.error || 'Invariant violation detected.',
      });
    }
  };

  const handleManualReplan = async () => {
    const res = await applyScenario({ type: 'MANUAL_REPLAN' });
    if (res.success) {
      addToast({
        type: 'info',
        title: 'Global Replan Executed',
        message: 'Solver recalculated all open assignments against current network status.',
      });
    }
  };

  // Find currently disrupted routes
  const disruptedRoutes = routes.filter((r) => r.status === 'DOWN' || r.delayMinutes > 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-heading text-ink-950 tracking-tight">
            Stress-Test Scenario Simulator
          </h1>
          <p className="text-sm text-ink-500 mt-1">
            Inject transport disruptions, trauma surges, cancellations, and stock arrivals to verify reactive replanning.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            size="md"
            variant="outline"
            onClick={handleManualReplan}
            leftIcon={<RefreshCw className="w-4 h-4 text-purple-600" />}
          >
            Run Replan
          </Button>
        </div>
      </div>

      {/* Disrupted Routes Active Alert if any */}
      {disruptedRoutes.length > 0 && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block">Active Logistics Route Disruptions ({disruptedRoutes.length})</span>
              <div className="flex flex-wrap gap-2 mt-1">
                {disruptedRoutes.map((r) => (
                  <span
                    key={`${r.fromId}-${r.toId}`}
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-white rounded border border-amber-300 font-mono"
                  >
                    <span>
                      {HOSPITALS.find((h) => h.id === r.fromId)?.shortName} ↔{' '}
                      {HOSPITALS.find((h) => h.id === r.toId)?.shortName}:
                    </span>
                    <strong className={r.status === 'DOWN' ? 'text-red-700' : 'text-amber-800'}>
                      {r.status === 'DOWN' ? 'DOWN' : `+${r.delayMinutes}m delay`}
                    </strong>
                    <button
                      type="button"
                      onClick={() => restoreRoute(r.fromId, r.toId)}
                      className="ml-1 text-ink-400 hover:text-ink-800 underline font-sans text-[10px]"
                    >
                      Restore
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4 Interactive Scenario Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Scenario Control Panel */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader
              title="Scenario Event Configuration"
              subtitle="Select event type and parameters to test system resilience"
            />

            {/* Scenario Type Selection Tabs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
              {[
                { id: 'transport', label: '1. Transport Failure', icon: <Truck className="w-4 h-4" /> },
                { id: 'demand', label: '2. Demand Spike', icon: <AlertTriangle className="w-4 h-4" /> },
                { id: 'cancel', label: '3. Cancellation', icon: <RotateCcw className="w-4 h-4" /> },
                { id: 'stock', label: '4. New Stock', icon: <PackagePlus className="w-4 h-4" /> },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSelectedScenarioTab(tab.id as typeof selectedScenarioTab)}
                  className={cn(
                    'p-3 rounded-xl border text-left flex flex-col justify-between transition-all min-h-[58px]',
                    selectedScenarioTab === tab.id
                      ? 'bg-crimson-50 border-crimson-500 ring-1 ring-crimson-500 text-crimson-950 font-bold'
                      : 'bg-white border-ink-200 text-ink-700 hover:bg-ink-50'
                  )}
                >
                  <span className="shrink-0 mb-1">{tab.icon}</span>
                  <span className="text-xs">{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Parameter Form for Selected Scenario */}
            <div className="space-y-4 p-4 rounded-xl bg-ink-50/60 border border-ink-150 text-xs">
              {/* Scenario 1: Transport Failure */}
              {selectedScenarioTab === 'transport' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-semibold text-ink-700 block mb-1">Source Hospital</label>
                      <select
                        value={transFrom}
                        onChange={(e) => setTransFrom(e.target.value)}
                        className="w-full p-2.5 rounded-lg border border-ink-200 bg-white"
                      >
                        {HOSPITALS.map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="font-semibold text-ink-700 block mb-1">Destination Hospital</label>
                      <select
                        value={transTo}
                        onChange={(e) => setTransTo(e.target.value)}
                        className="w-full p-2.5 rounded-lg border border-ink-200 bg-white"
                      >
                        {HOSPITALS.filter((h) => h.id !== transFrom).map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-semibold text-ink-700 block mb-1">Disruption Type</label>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant={transAction === 'SET_DOWN' ? 'primary' : 'outline'}
                          onClick={() => setTransAction('SET_DOWN')}
                        >
                          Mark Route DOWN
                        </Button>
                        <Button
                          size="sm"
                          variant={transAction === 'ADD_DELAY' ? 'primary' : 'outline'}
                          onClick={() => setTransAction('ADD_DELAY')}
                        >
                          Add Transit Delay
                        </Button>
                      </div>
                    </div>

                    {transAction === 'ADD_DELAY' && (
                      <div>
                        <label className="font-semibold text-ink-700 block mb-1">
                          Delay Duration (Minutes): {transDelay}m
                        </label>
                        <input
                          type="range"
                          min={15}
                          max={90}
                          step={15}
                          value={transDelay}
                          onChange={(e) => setTransDelay(Number(e.target.value))}
                          className="w-full accent-crimson-600"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Scenario 2: Demand Spike */}
              {selectedScenarioTab === 'demand' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="font-semibold text-ink-700 block mb-1">Emergency Facility</label>
                      <select
                        value={spikeHospital}
                        onChange={(e) => setSpikeHospital(e.target.value)}
                        className="w-full p-2.5 rounded-lg border border-ink-200 bg-white"
                      >
                        {HOSPITALS.map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="font-semibold text-ink-700 block mb-1">Component</label>
                      <select
                        value={spikeComponent}
                        onChange={(e) => setSpikeComponent(e.target.value as Component)}
                        className="w-full p-2.5 rounded-lg border border-ink-200 bg-white"
                      >
                        <option value="RED_CELLS">Red Blood Cells</option>
                        <option value="PLATELETS">Platelets</option>
                        <option value="PLASMA">Plasma (FFP)</option>
                      </select>
                    </div>

                    <div>
                      <label className="font-semibold text-ink-700 block mb-1">Blood Group</label>
                      <select
                        value={spikeGroup}
                        onChange={(e) => setSpikeGroup(e.target.value as BloodGroup)}
                        className="w-full p-2.5 rounded-lg border border-ink-200 bg-white"
                      >
                        <option value="O-">O- (Universal Red Cells)</option>
                        <option value="O+">O+</option>
                        <option value="A-">A-</option>
                        <option value="A+">A+</option>
                        <option value="B-">B-</option>
                        <option value="B+">B+</option>
                        <option value="AB-">AB-</option>
                        <option value="AB+">AB+</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-semibold text-ink-700 block mb-1">Units Demanded: {spikeUnits}</label>
                      <input
                        type="range"
                        min={1}
                        max={4}
                        value={spikeUnits}
                        onChange={(e) => setSpikeUnits(Number(e.target.value))}
                        className="w-full accent-crimson-600"
                      />
                    </div>

                    <div>
                      <label className="font-semibold text-ink-700 block mb-1">Needed In: {spikeMinsNeeded} min</label>
                      <input
                        type="range"
                        min={30}
                        max={180}
                        step={15}
                        value={spikeMinsNeeded}
                        onChange={(e) => setSpikeMinsNeeded(Number(e.target.value))}
                        className="w-full accent-crimson-600"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Scenario 3: Cancellation */}
              {selectedScenarioTab === 'cancel' && (
                <div className="space-y-4">
                  <div>
                    <label className="font-semibold text-ink-700 block mb-1">Select Request to Cancel</label>
                    <select
                      value={cancelRequestId}
                      onChange={(e) => setCancelRequestId(e.target.value)}
                      className="w-full p-2.5 rounded-lg border border-ink-200 bg-white"
                    >
                      {requests.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.id}: {r.unitsNeeded}x {r.group} {r.component} ({HOSPITALS.find((h) => h.id === r.hospitalId)?.shortName}) - {r.status}
                        </option>
                      ))}
                    </select>
                    <span className="text-[11px] text-ink-500 mt-1 block">
                      Cancelling releases any RESERVED units back to AVAILABLE inventory immediately. In-transit units remain protected.
                    </span>
                  </div>
                </div>
              )}

              {/* Scenario 4: New Stock */}
              {selectedScenarioTab === 'stock' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="font-semibold text-ink-700 block mb-1">Receiving Hospital</label>
                      <select
                        value={stockHospital}
                        onChange={(e) => setStockHospital(e.target.value)}
                        className="w-full p-2.5 rounded-lg border border-ink-200 bg-white"
                      >
                        {HOSPITALS.map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="font-semibold text-ink-700 block mb-1">Component</label>
                      <select
                        value={stockComponent}
                        onChange={(e) => setStockComponent(e.target.value as Component)}
                        className="w-full p-2.5 rounded-lg border border-ink-200 bg-white"
                      >
                        <option value="PLATELETS">Platelets</option>
                        <option value="RED_CELLS">Red Blood Cells</option>
                        <option value="PLASMA">Plasma (FFP)</option>
                      </select>
                    </div>

                    <div>
                      <label className="font-semibold text-ink-700 block mb-1">Group</label>
                      <select
                        value={stockGroup}
                        onChange={(e) => setStockGroup(e.target.value as BloodGroup)}
                        className="w-full p-2.5 rounded-lg border border-ink-200 bg-white"
                      >
                        <option value="O-">O-</option>
                        <option value="O+">O+</option>
                        <option value="A-">A-</option>
                        <option value="A+">A+</option>
                        <option value="B-">B-</option>
                        <option value="B+">B+</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-semibold text-ink-700 block mb-1">Batch Count: {stockCount} units</label>
                      <input
                        type="range"
                        min={1}
                        max={6}
                        value={stockCount}
                        onChange={(e) => setStockCount(Number(e.target.value))}
                        className="w-full accent-crimson-600"
                      />
                    </div>

                    <div>
                      <label className="font-semibold text-ink-700 block mb-1">
                        Fresh Shelf-Life: {stockShelfHours} hours
                      </label>
                      <input
                        type="range"
                        min={24}
                        max={168}
                        step={24}
                        value={stockShelfHours}
                        onChange={(e) => setStockShelfHours(Number(e.target.value))}
                        className="w-full accent-crimson-600"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Action Button */}
              <div className="pt-2 flex justify-end">
                <Button
                  size="md"
                  variant="primary"
                  onClick={handleRunScenario}
                  leftIcon={<Play className="w-4 h-4 fill-current" />}
                >
                  Inject Scenario & Replan
                </Button>
              </div>
            </div>
          </Card>

          {/* Before / After Diff Summary */}
          {lastDiff && (
            <Card>
              <CardHeader
                title="Replan Plan Diff Analysis"
                subtitle="Transparent tracking of allocations modified by the latest event"
              />

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-center">
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                  <span className="text-[11px] font-semibold text-emerald-800 uppercase block">Added</span>
                  <span className="text-xl font-bold font-mono text-emerald-700">+{lastDiff.added.length}</span>
                </div>

                <div className="p-3 bg-red-50 rounded-xl border border-red-200">
                  <span className="text-[11px] font-semibold text-red-800 uppercase block">Removed</span>
                  <span className="text-xl font-bold font-mono text-red-700">-{lastDiff.removed.length}</span>
                </div>

                <div className="p-3 bg-purple-50 rounded-xl border border-purple-200">
                  <span className="text-[11px] font-semibold text-purple-800 uppercase block">Rerouted</span>
                  <span className="text-xl font-bold font-mono text-purple-700">{lastDiff.rerouted.length}</span>
                </div>

                <div className="p-3 bg-ink-50 rounded-xl border border-ink-200">
                  <span className="text-[11px] font-semibold text-ink-600 uppercase block">Unchanged</span>
                  <span className="text-xl font-bold font-mono text-ink-800">{lastDiff.unchanged.length}</span>
                </div>
              </div>

              {/* Detailed Diff Breakdown */}
              <div className="space-y-2 text-xs">
                {lastDiff.added.map((add, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded bg-emerald-50/50 border border-emerald-200 text-emerald-950 font-medium">
                    <span>+ Allocated Unit <strong>{add.unitId}</strong> for Request <strong>{add.requestId}</strong></span>
                    <span className="text-[11px] font-mono text-emerald-800">
                      {HOSPITALS.find((h) => h.id === add.from)?.shortName} &rarr; {HOSPITALS.find((h) => h.id === add.to)?.shortName}
                    </span>
                  </div>
                ))}

                {lastDiff.removed.map((rem, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded bg-red-50/50 border border-red-200 text-red-950 font-medium">
                    <span>- Unit <strong>{rem.unitId}</strong> released from Request <strong>{rem.requestId}</strong></span>
                    <span className="text-[11px] text-red-800">{rem.reason}</span>
                  </div>
                ))}

                {lastDiff.rerouted.map((rr, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded bg-purple-50/50 border border-purple-200 text-purple-950 font-medium">
                    <span>&bull; Request <strong>{rr.requestId}</strong> rerouted unit <strong>{rr.unitId}</strong></span>
                    <span className="text-[11px] font-mono text-purple-800">
                      from {HOSPITALS.find((h) => h.id === rr.oldFrom)?.shortName} &rarr; now from {HOSPITALS.find((h) => h.id === rr.newFrom)?.shortName}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Right Column: Live Invariant Checks & Event Log */}
        <div className="space-y-6">
          {/* Live Invariant Compliance Panel */}
          <Card>
            <CardHeader
              title="Live Invariant Checks"
              subtitle="Continuous hard constraint verification"
            />

            <div className="space-y-3">
              {liveInvariants.map((inv, idx) => (
                <div
                  key={idx}
                  className={cn(
                    'p-3 rounded-xl border flex items-start gap-2.5 text-xs transition-colors',
                    inv.passed
                      ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950'
                      : 'bg-red-50 border-red-300 text-red-950 animate-pulse'
                  )}
                >
                  <div className="shrink-0 mt-0.5">
                    {inv.passed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-600" />
                    )}
                  </div>
                  <div>
                    <span className="font-bold block">{inv.name}</span>
                    <span className="text-[11px] text-ink-600 block mt-0.5">{inv.details}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Append-Only Simulation Event Log */}
          <Card>
            <CardHeader
              title="Simulation Audit Log"
              subtitle="Append-only timeline of scenario events"
            />
            <div className="max-h-96 overflow-y-auto pr-1">
              <Timeline events={events} maxItems={15} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
