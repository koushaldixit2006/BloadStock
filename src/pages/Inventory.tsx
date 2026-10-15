import { useMemo, useState } from 'react';
import {
  Filter,
  History,
  RotateCcw,
} from 'lucide-react';
import { HOSPITALS } from '../data/hospitals';
import { formatSimDateTime, getMinutesBetween } from '../engine/clock';
import { useSimStore } from '../store/useSimStore';
import { Unit } from '../types/domain';
import { cn } from '../utils/cn';
import { BloodGroupPill } from '../components/domain/BloodGroupPill';
import { ExpiryChip } from '../components/domain/ExpiryChip';
import { StatusChip } from '../components/domain/StatusChip';
import { UnitRow } from '../components/domain/UnitRow';
import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';
import { Drawer } from '../components/ui/Drawer';
import { EmptyState } from '../components/ui/EmptyState';

export function Inventory() {
  const { units, reservations, events, simTime, searchQuery, setSearchQuery } = useSimStore();

  // Filters state
  const [hospitalFilter, setHospitalFilter] = useState<string>('ALL');
  const [componentFilter, setComponentFilter] = useState<string>('ALL');
  const [groupFilter, setGroupFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [expiryWindowFilter, setExpiryWindowFilter] = useState<'ALL' | '6h' | '24h' | '72h'>('ALL');

  // Sorting
  const [sortBy, setSortBy] = useState<'id' | 'expiry' | 'collected'>('expiry');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Selected unit for detail drawer
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);

  // Mobile filter sheet
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  // Filter application
  const filteredUnits = useMemo(() => {
    return units.filter((u) => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesId = u.id.toLowerCase().includes(q);
        const matchesGroup = u.group.toLowerCase().includes(q);
        const matchesComponent = u.component.toLowerCase().includes(q);
        if (!matchesId && !matchesGroup && !matchesComponent) return false;
      }

      // Hospital
      if (hospitalFilter !== 'ALL' && u.hospitalId !== hospitalFilter) return false;

      // Component
      if (componentFilter !== 'ALL' && u.component !== componentFilter) return false;

      // Group
      if (groupFilter !== 'ALL' && u.group !== groupFilter) return false;

      // Status
      if (statusFilter !== 'ALL' && u.status !== statusFilter) return false;

      // Expiry Window
      if (expiryWindowFilter !== 'ALL') {
        const mins = getMinutesBetween(simTime, u.expiresAt);
        if (expiryWindowFilter === '6h' && (mins <= 0 || mins > 6 * 60)) return false;
        if (expiryWindowFilter === '24h' && (mins <= 0 || mins > 24 * 60)) return false;
        if (expiryWindowFilter === '72h' && (mins <= 0 || mins > 72 * 60)) return false;
      }

      return true;
    });
  }, [units, searchQuery, hospitalFilter, componentFilter, groupFilter, statusFilter, expiryWindowFilter, simTime]);

  // Sort application
  const sortedUnits = useMemo(() => {
    return [...filteredUnits].sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'id') {
        cmp = a.id.localeCompare(b.id);
      } else if (sortBy === 'expiry') {
        cmp = new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime();
      } else if (sortBy === 'collected') {
        cmp = new Date(a.collectedAt).getTime() - new Date(b.collectedAt).getTime();
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });
  }, [filteredUnits, sortBy, sortOrder]);

  // Pagination slice
  const paginatedUnits = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedUnits.slice(start, start + pageSize);
  }, [sortedUnits, currentPage, pageSize]);

  const totalPages = Math.ceil(sortedUnits.length / pageSize);

  // Summary strip metrics
  const availableCount = units.filter((u) => u.status === 'AVAILABLE').length;
  const reservedCount = units.filter((u) => u.status === 'RESERVED').length;
  const inTransitCount = units.filter((u) => u.status === 'IN_TRANSIT').length;
  const expiredCount = units.filter((u) => u.status === 'EXPIRED').length;

  const handleResetFilters = () => {
    setHospitalFilter('ALL');
    setComponentFilter('ALL');
    setGroupFilter('ALL');
    setStatusFilter('ALL');
    setExpiryWindowFilter('ALL');
    setSearchQuery('');
    setCurrentPage(1);
  };

  // Unit Timeline events
  const unitHistory = useMemo(() => {
    if (!selectedUnit) return [];
    return events.filter(
      (e) =>
        e.description.includes(selectedUnit.id) ||
        (e.payload && (e.payload.unitId === selectedUnit.id || e.payload.id === selectedUnit.id))
    );
  }, [selectedUnit, events]);

  const unitActiveReservation = useMemo(() => {
    if (!selectedUnit) return undefined;
    return reservations.find(
      (r) => r.unitId === selectedUnit.id && (r.status === 'RESERVED' || r.status === 'IN_TRANSIT')
    );
  }, [selectedUnit, reservations]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-heading text-ink-950 tracking-tight">
            Multi-Hospital Inventory
          </h1>
          <p className="text-sm text-ink-500 mt-1">
            Complete synthetic stock registry across 5 facilities with perishable shelf-life countdowns.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsMobileFilterOpen(true)}
            className="md:hidden"
            leftIcon={<Filter className="w-4 h-4" />}
          >
            Filters
          </Button>
          {(hospitalFilter !== 'ALL' ||
            componentFilter !== 'ALL' ||
            groupFilter !== 'ALL' ||
            statusFilter !== 'ALL' ||
            expiryWindowFilter !== 'ALL' ||
            searchQuery) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleResetFilters}
              leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
            >
              Reset Filters
            </Button>
          )}
        </div>
      </div>

      {/* Summary Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white p-3 rounded-xl border border-ink-200 shadow-soft">
        <div className="px-3 py-1.5 border-r border-ink-100 last:border-0">
          <span className="text-[11px] font-semibold text-ink-500 uppercase tracking-wider block">Available</span>
          <span className="text-xl font-bold font-mono text-emerald-700">{availableCount} units</span>
        </div>
        <div className="px-3 py-1.5 border-r border-ink-100 last:border-0">
          <span className="text-[11px] font-semibold text-ink-500 uppercase tracking-wider block">Reserved</span>
          <span className="text-xl font-bold font-mono text-blue-700">{reservedCount} units</span>
        </div>
        <div className="px-3 py-1.5 border-r border-ink-100 last:border-0">
          <span className="text-[11px] font-semibold text-ink-500 uppercase tracking-wider block">In Transit</span>
          <span className="text-xl font-bold font-mono text-purple-700">{inTransitCount} units</span>
        </div>
        <div className="px-3 py-1.5">
          <span className="text-[11px] font-semibold text-ink-500 uppercase tracking-wider block">Expired</span>
          <span className="text-xl font-bold font-mono text-red-600">{expiredCount} units</span>
        </div>
      </div>

      {/* Desktop Filter Bar */}
      <div className="hidden md:flex flex-wrap items-center gap-2.5 p-3 bg-white rounded-xl border border-ink-200 shadow-soft text-xs">
        {/* Hospital Filter */}
        <select
          value={hospitalFilter}
          onChange={(e) => {
            setHospitalFilter(e.target.value);
            setCurrentPage(1);
          }}
          className="px-3 py-1.5 rounded-lg border border-ink-200 bg-ink-50 font-medium text-ink-800 focus:outline-none focus:ring-1 focus:ring-crimson-600"
        >
          <option value="ALL">All Hospitals (5)</option>
          {HOSPITALS.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </select>

        {/* Component Filter */}
        <select
          value={componentFilter}
          onChange={(e) => {
            setComponentFilter(e.target.value);
            setCurrentPage(1);
          }}
          className="px-3 py-1.5 rounded-lg border border-ink-200 bg-ink-50 font-medium text-ink-800 focus:outline-none focus:ring-1 focus:ring-crimson-600"
        >
          <option value="ALL">All Components</option>
          <option value="RED_CELLS">Red Blood Cells</option>
          <option value="PLATELETS">Platelets</option>
          <option value="PLASMA">Plasma (FFP)</option>
        </select>

        {/* Blood Group Filter */}
        <select
          value={groupFilter}
          onChange={(e) => {
            setGroupFilter(e.target.value);
            setCurrentPage(1);
          }}
          className="px-3 py-1.5 rounded-lg border border-ink-200 bg-ink-50 font-medium text-ink-800 focus:outline-none focus:ring-1 focus:ring-crimson-600"
        >
          <option value="ALL">All Groups</option>
          <option value="O-">O Negative</option>
          <option value="O+">O Positive</option>
          <option value="A-">A Negative</option>
          <option value="A+">A Positive</option>
          <option value="B-">B Negative</option>
          <option value="B+">B Positive</option>
          <option value="AB-">AB Negative</option>
          <option value="AB+">AB Positive</option>
        </select>

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setCurrentPage(1);
          }}
          className="px-3 py-1.5 rounded-lg border border-ink-200 bg-ink-50 font-medium text-ink-800 focus:outline-none focus:ring-1 focus:ring-crimson-600"
        >
          <option value="ALL">All Statuses</option>
          <option value="AVAILABLE">Available</option>
          <option value="RESERVED">Reserved</option>
          <option value="IN_TRANSIT">In Transit</option>
          <option value="EXPIRED">Expired</option>
          <option value="USED">Used / Delivered</option>
        </select>

        {/* Expiry Window Chips */}
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-[11px] font-semibold text-ink-400 uppercase">Expiry Window:</span>
          <Chip
            selected={expiryWindowFilter === 'ALL'}
            onClick={() => {
              setExpiryWindowFilter('ALL');
              setCurrentPage(1);
            }}
          >
            All
          </Chip>
          <Chip
            selected={expiryWindowFilter === '6h'}
            onClick={() => {
              setExpiryWindowFilter('6h');
              setCurrentPage(1);
            }}
          >
            &lt;6h
          </Chip>
          <Chip
            selected={expiryWindowFilter === '24h'}
            onClick={() => {
              setExpiryWindowFilter('24h');
              setCurrentPage(1);
            }}
          >
            &lt;24h
          </Chip>
          <Chip
            selected={expiryWindowFilter === '72h'}
            onClick={() => {
              setExpiryWindowFilter('72h');
              setCurrentPage(1);
            }}
          >
            &lt;72h
          </Chip>
        </div>
      </div>

      {/* Main Inventory Table & Mobile Cards */}
      <div className="bg-white rounded-card border border-ink-200 shadow-soft overflow-hidden">
        {/* Table View (Desktop & Tablet) */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-ink-200 text-ink-500 font-semibold bg-ink-50/70 select-none">
                <th
                  className="py-3 px-4 cursor-pointer hover:text-ink-900"
                  onClick={() => {
                    setSortBy('id');
                    setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                  }}
                >
                  Unit ID {sortBy === 'id' && (sortOrder === 'asc' ? '▲' : '▼')}
                </th>
                <th className="py-3 px-4">Component</th>
                <th className="py-3 px-4">Group</th>
                <th className="py-3 px-4">Hospital Facility</th>
                <th
                  className="py-3 px-4 hidden md:table-cell cursor-pointer hover:text-ink-900"
                  onClick={() => {
                    setSortBy('collected');
                    setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                  }}
                >
                  Collected {sortBy === 'collected' && (sortOrder === 'asc' ? '▲' : '▼')}
                </th>
                <th
                  className="py-3 px-4 cursor-pointer hover:text-ink-900"
                  onClick={() => {
                    setSortBy('expiry');
                    setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                  }}
                >
                  Expires In {sortBy === 'expiry' && (sortOrder === 'asc' ? '▲' : '▼')}
                </th>
                <th className="py-3 px-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {paginatedUnits.map((unit) => (
                <UnitRow
                  key={unit.id}
                  unit={unit}
                  simTime={simTime}
                  onClick={() => setSelectedUnit(unit)}
                />
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards View */}
        <div className="sm:hidden divide-y divide-ink-150 p-2 space-y-2">
          {paginatedUnits.map((unit) => (
            <div
              key={unit.id}
              onClick={() => setSelectedUnit(unit)}
              className={cn(
                'p-3.5 rounded-xl border border-ink-100 bg-white transition-colors cursor-pointer active:bg-ink-50',
                unit.status === 'EXPIRED' && 'opacity-60 bg-ink-50/50'
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-sm font-bold text-ink-900">{unit.id}</span>
                <StatusChip status={unit.status} size="sm" />
              </div>

              <div className="flex items-center justify-between text-xs mb-2">
                <span className="text-ink-600">{unit.component}</span>
                <BloodGroupPill group={unit.group} size="sm" />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-ink-100 text-[11px]">
                <span className="text-ink-500">{HOSPITALS.find((h) => h.id === unit.hospitalId)?.shortName}</span>
                <ExpiryChip expiresAt={unit.expiresAt} simTime={simTime} />
              </div>
            </div>
          ))}
        </div>

        {/* Empty state if 0 results */}
        {sortedUnits.length === 0 && (
          <div className="p-8">
            <EmptyState
              title="No units found"
              description="No inventory matches the selected filters and search query. Try broadening your criteria."
              action={
                <Button size="sm" variant="outline" onClick={handleResetFilters}>
                  Clear All Filters
                </Button>
              }
            />
          </div>
        )}

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-ink-100 bg-ink-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-ink-600">
            <span>
              Showing {(currentPage - 1) * pageSize + 1} to{' '}
              {Math.min(currentPage * pageSize, sortedUnits.length)} of {sortedUnits.length} total units
            </span>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="font-mono font-medium px-2">
                {currentPage} / {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Unit Detail & Audit Timeline Drawer */}
      <Drawer
        isOpen={selectedUnit !== null}
        onClose={() => setSelectedUnit(null)}
        title={selectedUnit ? `Unit Audit: ${selectedUnit.id}` : ''}
        subtitle="Clinical chain of custody, shelf-life verification, and reservation history"
      >
        {selectedUnit && (
          <div className="space-y-6 text-xs">
            {/* Quick summary card */}
            <div className="p-4 rounded-xl bg-ink-50 border border-ink-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-ink-500 uppercase tracking-wider text-[10px] font-semibold">Classification</span>
                <StatusChip status={selectedUnit.status} size="sm" />
              </div>

              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm text-ink-900">{selectedUnit.component}</span>
                <BloodGroupPill group={selectedUnit.group} size="md" />
              </div>

              <div className="pt-2 border-t border-ink-200/80 flex items-center justify-between">
                <span className="text-ink-500">Current Storage</span>
                <span className="font-medium text-ink-900">
                  {HOSPITALS.find((h) => h.id === selectedUnit.hospitalId)?.name}
                </span>
              </div>
            </div>

            {/* Time stamps */}
            <div className="space-y-2 border-y border-ink-150 py-3">
              <div className="flex justify-between">
                <span className="text-ink-500">Collected Timestamp:</span>
                <span className="font-mono text-ink-800">{formatSimDateTime(selectedUnit.collectedAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-500">Expiry Deadline:</span>
                <span className="font-mono text-ink-800">{formatSimDateTime(selectedUnit.expiresAt)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-ink-500">Shelf-Life Remaining:</span>
                <ExpiryChip expiresAt={selectedUnit.expiresAt} simTime={simTime} />
              </div>
            </div>

            {/* Reservation Attachment if any */}
            {unitActiveReservation && (
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg text-blue-950">
                <span className="font-semibold block mb-1">Active Transfer Reservation:</span>
                <p className="text-[11px] leading-relaxed">
                  Allocated to request <strong>{unitActiveReservation.requestId}</strong>. ETA:{' '}
                  {new Date(unitActiveReservation.eta).toUTCString()}. Status: {unitActiveReservation.status}.
                </p>
              </div>
            )}

            {/* Lifecycle Timeline */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-ink-600 mb-3 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-ink-400" />
                <span>Unit Provenance & Event History</span>
              </h4>

              {unitHistory.length === 0 ? (
                <p className="text-ink-500 italic text-[11px]">
                  No reservation or transfer events logged for this unit. Status has remained steady since initial intake.
                </p>
              ) : (
                <div className="space-y-3 pl-3 border-l-2 border-ink-200">
                  {unitHistory.map((ev) => (
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

      {/* Mobile Filter Sheet */}
      <Drawer
        isOpen={isMobileFilterOpen}
        onClose={() => setIsMobileFilterOpen(false)}
        title="Filter Inventory"
        subtitle="Narrow blood component records"
        footer={
          <Button
            size="md"
            variant="primary"
            className="w-full"
            onClick={() => setIsMobileFilterOpen(false)}
          >
            Apply Filters ({filteredUnits.length} Results)
          </Button>
        }
      >
        <div className="space-y-4 text-xs">
          <div>
            <label className="font-semibold text-ink-700 block mb-1.5">Facility Location</label>
            <select
              value={hospitalFilter}
              onChange={(e) => setHospitalFilter(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-ink-200 bg-white"
            >
              <option value="ALL">All Hospitals</option>
              {HOSPITALS.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="font-semibold text-ink-700 block mb-1.5">Blood Component</label>
            <select
              value={componentFilter}
              onChange={(e) => setComponentFilter(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-ink-200 bg-white"
            >
              <option value="ALL">All Components</option>
              <option value="RED_CELLS">Red Blood Cells</option>
              <option value="PLATELETS">Platelets</option>
              <option value="PLASMA">Plasma (FFP)</option>
            </select>
          </div>

          <div>
            <label className="font-semibold text-ink-700 block mb-1.5">Blood Group</label>
            <select
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-ink-200 bg-white"
            >
              <option value="ALL">All Groups</option>
              <option value="O-">O Negative</option>
              <option value="O+">O Positive</option>
              <option value="A-">A Negative</option>
              <option value="A+">A Positive</option>
              <option value="B-">B Negative</option>
              <option value="B+">B Positive</option>
              <option value="AB-">AB Negative</option>
              <option value="AB+">AB Positive</option>
            </select>
          </div>

          <div>
            <label className="font-semibold text-ink-700 block mb-1.5">Expiry Window</label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                variant={expiryWindowFilter === 'ALL' ? 'primary' : 'outline'}
                onClick={() => setExpiryWindowFilter('ALL')}
              >
                All Expiries
              </Button>
              <Button
                size="sm"
                variant={expiryWindowFilter === '6h' ? 'primary' : 'outline'}
                onClick={() => setExpiryWindowFilter('6h')}
              >
                &lt; 6 Hours
              </Button>
              <Button
                size="sm"
                variant={expiryWindowFilter === '24h' ? 'primary' : 'outline'}
                onClick={() => setExpiryWindowFilter('24h')}
              >
                &lt; 24 Hours
              </Button>
              <Button
                size="sm"
                variant={expiryWindowFilter === '72h' ? 'primary' : 'outline'}
                onClick={() => setExpiryWindowFilter('72h')}
              >
                &lt; 72 Hours
              </Button>
            </div>
          </div>
        </div>
      </Drawer>
    </div>
  );
}
