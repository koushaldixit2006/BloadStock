import { useState } from 'react';
import { HOSPITALS } from '../../data/hospitals';
import { Reservation, Route, Unit } from '../../types/domain';
import { cn } from '../../utils/cn';

export interface MapViewProps {
  units: Unit[];
  routes: Route[];
  reservations: Reservation[];
  selectedHospitalId?: string;
  onSelectHospital?: (hospitalId: string) => void;
  className?: string;
}

export function MapView({
  units,
  routes,
  reservations,
  selectedHospitalId,
  onSelectHospital,
  className,
}: MapViewProps) {
  const [hoveredHospitalId, setHoveredHospitalId] = useState<string | null>(null);

  // Group units by hospital
  const stockByHospital = new Map<string, { total: number; available: number; red: number; plt: number; pls: number }>();
  for (const h of HOSPITALS) {
    const hUnits = units.filter((u) => u.hospitalId === h.id);
    const available = hUnits.filter((u) => u.status === 'AVAILABLE').length;
    const red = hUnits.filter((u) => u.status === 'AVAILABLE' && u.component === 'RED_CELLS').length;
    const plt = hUnits.filter((u) => u.status === 'AVAILABLE' && u.component === 'PLATELETS').length;
    const pls = hUnits.filter((u) => u.status === 'AVAILABLE' && u.component === 'PLASMA').length;

    stockByHospital.set(h.id, {
      total: hUnits.length,
      available,
      red,
      plt,
      pls,
    });
  }

  // Active in-transit deliveries
  const inTransitReservations = reservations.filter((r) => r.status === 'IN_TRANSIT');

  // Pair routes (bidirectional edges without duplicate drawing)
  const drawnEdges: { from: string; to: string; x1: number; y1: number; x2: number; y2: number; route?: Route; hasInTransit: boolean }[] = [];
  const processedPairs = new Set<string>();

  for (let i = 0; i < HOSPITALS.length; i++) {
    for (let j = i + 1; j < HOSPITALS.length; j++) {
      const h1 = HOSPITALS[i];
      const h2 = HOSPITALS[j];
      const pairKey = [h1.id, h2.id].sort().join('-');

      if (!processedPairs.has(pairKey)) {
        processedPairs.add(pairKey);
        const route = routes.find((r) => (r.fromId === h1.id && r.toId === h2.id) || (r.fromId === h2.id && r.toId === h1.id));
        const hasInTransit = inTransitReservations.some(
          (r) =>
            (r.fromHospitalId === h1.id && r.toHospitalId === h2.id) ||
            (r.fromHospitalId === h2.id && r.toHospitalId === h1.id)
        );

        drawnEdges.push({
          from: h1.id,
          to: h2.id,
          x1: h1.coords.x,
          y1: h1.coords.y,
          x2: h2.coords.x,
          y2: h2.coords.y,
          route,
          hasInTransit,
        });
      }
    }
  }

  return (
    <div className={cn('relative bg-white rounded-card border border-ink-200 overflow-hidden p-4 shadow-soft', className)}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
        <div>
          <h3 className="text-base font-semibold text-ink-900 flex items-center gap-2">
            <span>Regional Hospital Supply Schematic</span>
            <span className="text-[11px] font-mono text-ink-500 bg-ink-100 px-2 py-0.5 rounded">
              5 Facilities &bull; {inTransitReservations.length} In-Transit
            </span>
          </h3>
          <p className="text-xs text-ink-500">
            Interactive route topology. Green = Route operational, Red = Roadway down, Violet pulse = Live blood transport.
          </p>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-ink-600 bg-ink-50/80 px-3 py-1.5 rounded-lg border border-ink-100">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-200" />
            <span>Optimal Stock (&gt;15)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-amber-200" />
            <span>Moderate (&le;15)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-red-200" />
            <span>Critical (&le;5)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-purple-600 inline-block" />
            <span className="text-purple-700 font-medium">In-Transit</span>
          </div>
        </div>
      </div>

      <div className="w-full aspect-[16/10] sm:aspect-[16/9] bg-gradient-to-br from-ink-50/40 via-white to-ink-50/20 rounded-xl relative border border-ink-100">
        <svg
          viewBox="0 0 800 480"
          className="w-full h-full select-none"
          aria-label="Schematic map of regional hospital network"
        >
          <defs>
            {/* Grid pattern */}
            <pattern id="grid-pattern" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#E2E8F0" strokeWidth="0.75" strokeOpacity="0.5" />
            </pattern>

            {/* Glowing filter for nodes */}
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Background grid */}
          <rect width="800" height="480" fill="url(#grid-pattern)" />

          {/* Transport Routes */}
          {drawnEdges.map((edge) => {
            const isDown = edge.route?.status === 'DOWN';
            const hasDelay = (edge.route?.delayMinutes ?? 0) > 0;
            const midX = (edge.x1 + edge.x2) / 2;
            const midY = (edge.y1 + edge.y2) / 2;

            return (
              <g key={`${edge.from}-${edge.to}`}>
                {/* Base Route Line */}
                <line
                  x1={edge.x1}
                  y1={edge.y1}
                  x2={edge.x2}
                  y2={edge.y2}
                  stroke={isDown ? '#EF4444' : hasDelay ? '#F59E0B' : '#CBD5E1'}
                  strokeWidth={isDown ? 3 : 2}
                  strokeDasharray={isDown ? '6 4' : undefined}
                />

                {/* Animated in-transit line if dispatch active */}
                {edge.hasInTransit && !isDown && (
                  <line
                    x1={edge.x1}
                    y1={edge.y1}
                    x2={edge.x2}
                    y2={edge.y2}
                    stroke="#7C3AED"
                    strokeWidth="3.5"
                    strokeDasharray="8 6"
                    className="animate-route-flow"
                  />
                )}

                {/* Midpoint Route Badge */}
                <g transform={`translate(${midX}, ${midY})`}>
                  <rect
                    x="-24"
                    y="-11"
                    width="48"
                    height="22"
                    rx="11"
                    fill={isDown ? '#FEE2E2' : hasDelay ? '#FEF3C7' : '#F8FAFC'}
                    stroke={isDown ? '#EF4444' : hasDelay ? '#F59E0B' : '#CBD5E1'}
                    strokeWidth="1"
                  />
                  <text
                    textAnchor="middle"
                    y="4"
                    fill={isDown ? '#991B1B' : hasDelay ? '#92400E' : '#475569'}
                    fontSize="10"
                    fontFamily="JetBrains Mono, monospace"
                    fontWeight="600"
                  >
                    {isDown ? 'DOWN' : `${(edge.route?.baseMinutes ?? 30) + (edge.route?.delayMinutes ?? 0)}m`}
                  </text>
                </g>
              </g>
            );
          })}

          {/* Hospital Nodes */}
          {HOSPITALS.map((hospital) => {
            const stock = stockByHospital.get(hospital.id) || { total: 0, available: 0, red: 0, plt: 0, pls: 0 };
            const isSelected = selectedHospitalId === hospital.id;
            const isHovered = hoveredHospitalId === hospital.id;

            let healthColor = '#10B981'; // emerald
            let ringColor = '#A7F3D0';
            if (stock.available <= 5) {
              healthColor = '#EF4444'; // red
              ringColor = '#FECACA';
            } else if (stock.available <= 15) {
              healthColor = '#F59E0B'; // amber
              ringColor = '#FDE68A';
            }

            return (
              <g
                key={hospital.id}
                transform={`translate(${hospital.coords.x}, ${hospital.coords.y})`}
                className="cursor-pointer transition-transform duration-200"
                onClick={() => onSelectHospital?.(hospital.id)}
                onMouseEnter={() => setHoveredHospitalId(hospital.id)}
                onMouseLeave={() => setHoveredHospitalId(null)}
              >
                {/* Outer Glow Halo when selected/hovered */}
                {(isSelected || isHovered) && (
                  <circle r="36" fill={healthColor} fillOpacity="0.15" className="animate-pulse" />
                )}

                {/* Stock Health Ring */}
                <circle r="22" fill="#FFFFFF" stroke={ringColor} strokeWidth="6" />
                <circle r="18" fill="#FFFFFF" stroke={healthColor} strokeWidth="3" />

                {/* Center Available Units Badge */}
                <text
                  textAnchor="middle"
                  y="5"
                  fill="#0F172A"
                  fontSize="12"
                  fontFamily="JetBrains Mono, monospace"
                  fontWeight="bold"
                >
                  {stock.available}
                </text>

                {/* Hospital Label */}
                <g transform="translate(0, 34)">
                  <rect
                    x="-75"
                    y="-10"
                    width="150"
                    height="24"
                    rx="6"
                    fill="#0F172A"
                    fillOpacity={isSelected ? 0.95 : 0.85}
                  />
                  <text
                    textAnchor="middle"
                    y="6"
                    fill="#FFFFFF"
                    fontSize="11"
                    fontFamily="Plus Jakarta Sans, sans-serif"
                    fontWeight="600"
                  >
                    {hospital.shortName}
                  </text>
                </g>

                {/* Tooltip on hover */}
                {isHovered && (
                  <g transform="translate(0, -58)" className="pointer-events-none">
                    <rect
                      x="-85"
                      y="-28"
                      width="170"
                      height="56"
                      rx="8"
                      fill="#FFFFFF"
                      stroke="#CBD5E1"
                      strokeWidth="1"
                      filter="url(#glow)"
                    />
                    <text textAnchor="middle" y="-12" fill="#0F172A" fontSize="11" fontWeight="bold">
                      {hospital.name}
                    </text>
                    <text textAnchor="middle" y="4" fill="#64748B" fontSize="10">
                      Tier: {hospital.tier}
                    </text>
                    <text textAnchor="middle" y="18" fill="#334155" fontSize="10" fontFamily="JetBrains Mono">
                      RBC: {stock.red} | PLT: {stock.plt} | FFP: {stock.pls}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>

        {/* Selected Hospital Quick Inspector Overlay */}
        {selectedHospitalId && (
          <div className="absolute bottom-3 left-3 bg-white/95 backdrop-blur-md border border-ink-200 rounded-lg p-3 shadow-card text-xs flex items-center gap-4">
            <div>
              <span className="font-semibold text-ink-900 block">
                {HOSPITALS.find((h) => h.id === selectedHospitalId)?.name}
              </span>
              <span className="text-ink-500 text-[11px]">
                {stockByHospital.get(selectedHospitalId)?.available} units available in blood bank
              </span>
            </div>
            <button
              onClick={() => onSelectHospital?.('')}
              className="text-ink-400 hover:text-ink-700 font-bold px-1"
              aria-label="Clear selection"
            >
              &times;
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
