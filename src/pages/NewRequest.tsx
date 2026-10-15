import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Minus,
  Plus,
  Sparkles,
} from 'lucide-react';
import { HOSPITALS } from '../data/hospitals';
import { addMinutesToIso } from '../engine/clock';
import { getCompatibleDonors } from '../engine/compatibility';
import { useSimStore } from '../store/useSimStore';
import { BloodGroup, Component, UrgencyLevel } from '../types/domain';
import { cn } from '../utils/cn';
import { BloodGroupPill } from '../components/domain/BloodGroupPill';
import { ConstraintChecklist, ConstraintItem } from '../components/domain/ConstraintChecklist';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { useToast } from '../components/ui/useToast';

export function NewRequest() {
  const navigate = useNavigate();
  const { simTime, addRequest } = useSimStore();
  const { addToast } = useToast();

  // Form State
  const [hospitalId, setHospitalId] = useState<string>('H4'); // Default Sawai Care
  const [component, setComponent] = useState<Component>('PLATELETS');
  const [group, setGroup] = useState<BloodGroup>('O-');
  const [unitsNeeded, setUnitsNeeded] = useState<number>(1);
  const [urgency, setUrgency] = useState<UrgencyLevel>('CRITICAL');
  const [hoursNeededIn, setHoursNeededIn] = useState<number>(2);
  const [clinicalContext, setClinicalContext] = useState<string>(
    'Acute trauma / hemorrhage requiring immediate emergency component support.'
  );

  // Live compatible donors preview based on synthetic compatibility table
  const compatibleDonors = useMemo(() => {
    return getCompatibleDonors(component, group);
  }, [component, group]);

  // Dynamic hard constraints preview
  const constraintItems: ConstraintItem[] = useMemo(() => {
    return [
      {
        id: 'comp',
        name: 'Component & Blood Group Compatibility',
        description: `Units must strictly match or be compatible with ${group} ${component}. Acceptable donor groups: ${compatibleDonors.join(', ')}.`,
        passed: compatibleDonors.length > 0,
      },
      {
        id: 'expiry',
        name: 'Expiry Safety Margin (>=30 min)',
        description: 'Allocated units must arrive with at least 30 minutes of remaining shelf-life after dispatch + transit.',
        passed: true,
      },
      {
        id: 'route',
        name: 'Active Logistics Route (Status UP)',
        description: 'Selected hospital must have operational transport corridors (no severe highway blockage).',
        passed: true,
      },
      {
        id: 'time',
        name: 'Needed-By Urgency Deadline',
        description: `Transfer ETA must be within needed-by deadline (${hoursNeededIn}h from sim time).`,
        passed: hoursNeededIn > 0,
      },
      {
        id: 'single',
        name: 'Single Allocation Guard',
        description: 'Zero double-allocation: units already committed to another request are ineligible.',
        passed: true,
      },
    ];
  }, [component, group, compatibleDonors, hoursNeededIn]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const neededBy = addMinutesToIso(simTime, hoursNeededIn * 60);

    const created = await addRequest({
      hospitalId,
      component,
      group,
      unitsNeeded,
      neededBy,
      urgency,
      clinicalContext: clinicalContext.trim() || undefined,
    });

    addToast({
      type: 'success',
      title: 'Blood Request Registered',
      message: `Request ${created.id} logged for ${unitsNeeded}x ${group} ${component}. Running solver for feasible candidates...`,
    });

    // Navigate to Recommendations for this request
    navigate(`/recommendations?requestId=${created.id}`);
  };

  const bloodGroups: BloodGroup[] = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold font-heading text-ink-950 tracking-tight">
          New Blood Component Request
        </h1>
        <p className="text-sm text-ink-500 mt-1">
          Submit clinical transfusion needs. The planning engine will evaluate compatibility, transit times,
          and shelf-life margins to identify feasible transfers.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Request Intake Form */}
        <div className="lg:col-span-2">
          <Card>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Requesting Hospital */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-ink-700 mb-2">
                  Destination Hospital Facility
                </label>
                <select
                  value={hospitalId}
                  onChange={(e) => setHospitalId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-ink-200 bg-white font-medium text-sm text-ink-900 focus:outline-none focus:ring-2 focus:ring-crimson-600 focus:border-transparent min-h-[44px]"
                >
                  {HOSPITALS.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name} ({h.tier})
                    </option>
                  ))}
                </select>
                <span className="text-[11px] text-ink-500 mt-1 block">
                  Delivery destination for incoming transfer or local blood bank reservation.
                </span>
              </div>

              {/* Component Segmented Selector */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-ink-700 mb-2">
                  Perishable Component
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'RED_CELLS' as Component, label: 'Packed Red Cells', shelf: '42d max life' },
                    { id: 'PLATELETS' as Component, label: 'Platelets (Single)', shelf: '5d max life' },
                    { id: 'PLASMA' as Component, label: 'Fresh Frozen Plasma', shelf: '30d max life' },
                  ].map((comp) => (
                    <button
                      key={comp.id}
                      type="button"
                      onClick={() => setComponent(comp.id)}
                      className={cn(
                        'p-3 rounded-xl border text-left transition-all min-h-[56px] select-none',
                        component === comp.id
                          ? 'bg-crimson-50/70 border-crimson-500 ring-1 ring-crimson-500 text-crimson-950 font-bold'
                          : 'bg-white border-ink-200 text-ink-700 hover:bg-ink-50'
                      )}
                    >
                      <span className="text-xs block leading-tight">{comp.label}</span>
                      <span className="text-[10px] text-ink-500 font-mono font-normal block mt-1">
                        {comp.shelf}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Blood Group Pill Selector */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-ink-700 mb-2">
                  Recipient Blood Group (ABO / Rh)
                </label>
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                  {bloodGroups.map((grp) => (
                    <button
                      key={grp}
                      type="button"
                      onClick={() => setGroup(grp)}
                      className={cn(
                        'py-2.5 rounded-lg border flex flex-col items-center justify-center transition-all select-none min-h-[44px]',
                        group === grp
                          ? 'bg-crimson-600 text-white border-crimson-700 font-bold shadow-sm'
                          : 'bg-white border-ink-200 text-ink-800 hover:bg-ink-50'
                      )}
                    >
                      <span className="font-mono text-sm">{grp}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Units Stepper & Needed In Hours */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Units Needed */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-ink-700 mb-2">
                    Units Needed
                  </label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setUnitsNeeded((u) => Math.max(1, u - 1))}
                      disabled={unitsNeeded <= 1}
                      className="w-11 h-11 rounded-lg border border-ink-200 bg-white hover:bg-ink-50 active:bg-ink-100 flex items-center justify-center disabled:opacity-40"
                      aria-label="Decrease units"
                    >
                      <Minus className="w-4 h-4 text-ink-700" />
                    </button>
                    <span className="font-mono text-xl font-extrabold text-ink-950 w-12 text-center">
                      {unitsNeeded}
                    </span>
                    <button
                      type="button"
                      onClick={() => setUnitsNeeded((u) => Math.min(10, u + 1))}
                      disabled={unitsNeeded >= 10}
                      className="w-11 h-11 rounded-lg border border-ink-200 bg-white hover:bg-ink-50 active:bg-ink-100 flex items-center justify-center disabled:opacity-40"
                      aria-label="Increase units"
                    >
                      <Plus className="w-4 h-4 text-ink-700" />
                    </button>
                    <span className="text-xs text-ink-500 font-medium">unit(s)</span>
                  </div>
                </div>

                {/* Needed By Window */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-ink-700 mb-2">
                    Needed In (Hours)
                  </label>
                  <select
                    value={hoursNeededIn}
                    onChange={(e) => setHoursNeededIn(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-ink-200 bg-white font-medium text-sm text-ink-900 focus:outline-none focus:ring-2 focus:ring-crimson-600 focus:border-transparent min-h-[44px]"
                  >
                    <option value={1}>1 hour (Immediate / Stat)</option>
                    <option value={2}>2 hours (Urgent window)</option>
                    <option value={4}>4 hours (Operating theatre)</option>
                    <option value={8}>8 hours (Shift requirement)</option>
                    <option value={24}>24 hours (Elective schedule)</option>
                  </select>
                </div>
              </div>

              {/* Urgency Segmented Control */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-ink-700 mb-2">
                  Clinical Urgency Level
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'ROUTINE' as UrgencyLevel, label: 'Routine', color: 'text-ink-700' },
                    { id: 'URGENT' as UrgencyLevel, label: 'Urgent', color: 'text-amber-700 font-bold' },
                    { id: 'CRITICAL' as UrgencyLevel, label: 'Critical', color: 'text-red-700 font-extrabold' },
                  ].map((urg) => (
                    <button
                      key={urg.id}
                      type="button"
                      onClick={() => setUrgency(urg.id)}
                      className={cn(
                        'py-2.5 px-3 rounded-xl border text-center text-xs transition-all min-h-[44px] select-none',
                        urgency === urg.id
                          ? urg.id === 'CRITICAL'
                            ? 'bg-red-50 border-red-500 text-red-800 ring-1 ring-red-500 font-bold'
                            : urg.id === 'URGENT'
                            ? 'bg-amber-50 border-amber-500 text-amber-800 ring-1 ring-amber-500 font-bold'
                            : 'bg-ink-100 border-ink-400 text-ink-900 font-bold'
                          : 'bg-white border-ink-200 text-ink-600 hover:bg-ink-50'
                      )}
                    >
                      {urg.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Clinical Context / Notes */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-ink-700 mb-2">
                  Clinical Context & Indications
                </label>
                <textarea
                  value={clinicalContext}
                  onChange={(e) => setClinicalContext(e.target.value)}
                  rows={2}
                  className="w-full p-3 rounded-lg border border-ink-200 text-xs font-medium text-ink-900 focus:outline-none focus:ring-2 focus:ring-crimson-600"
                  placeholder="e.g. Aortic aneurysm surgery, massive obstetric hemorrhage..."
                />
              </div>

              {/* Submit CTA */}
              <div className="pt-4 border-t border-ink-100 flex items-center justify-end gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => navigate('/overview')}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="lg"
                  variant="primary"
                  leftIcon={<Sparkles className="w-4 h-4 text-amber-300" />}
                  rightIcon={<ArrowRight className="w-4 h-4" />}
                >
                  Find Feasible Transfers
                </Button>
              </div>
            </form>
          </Card>
        </div>

        {/* Live Compatibility & Constraints Sidebar */}
        <div className="space-y-6">
          {/* Live Compatibility Preview */}
          <Card>
            <CardHeader
              title="Compatibility Matrix Preview"
              subtitle="Synthetic ABO/Rh matching"
            />
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-ink-100">
                <span className="text-ink-600">Selected Recipient:</span>
                <div className="flex items-center gap-1.5 font-bold text-ink-900">
                  <BloodGroupPill group={group} size="sm" />
                  <span>{component}</span>
                </div>
              </div>

              <div>
                <span className="text-[11px] font-semibold text-ink-500 uppercase tracking-wider block mb-2">
                  Acceptable Donor Groups ({compatibleDonors.length}):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {compatibleDonors.map((d) => (
                    <BloodGroupPill key={d} group={d} size="sm" />
                  ))}
                </div>
              </div>

              <div className="pt-2 text-[11px] text-ink-500 leading-relaxed bg-ink-50/60 p-2.5 rounded-lg border border-ink-100">
                {component === 'RED_CELLS' && (
                  <span>
                    <strong>Red Blood Cells:</strong> Standard ABO/Rh. Universal donor is O-. Rh- recipients cannot
                    receive Rh+ red cells.
                  </span>
                )}
                {component === 'PLATELETS' && (
                  <span>
                    <strong>Platelets:</strong> Synthetic rule: ABO-identical, Rh ignored. Universal ABO match.
                  </span>
                )}
                {component === 'PLASMA' && (
                  <span>
                    <strong>Plasma:</strong> Reverse ABO table, Rh ignored. AB is universal donor; O recipient accepts all.
                  </span>
                )}
              </div>
            </div>
          </Card>

          {/* Hard Constraints Verification Checklist */}
          <ConstraintChecklist constraints={constraintItems} />
        </div>
      </div>
    </div>
  );
}
