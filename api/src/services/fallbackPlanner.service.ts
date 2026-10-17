import { RulesService, HOSPITAL_NAMES, FeasibilityCandidate } from './rules.service';
import { Component, BloodGroup } from '../models/unit.model';

export function formatExpiryMargin(minutes: number): string {
  if (minutes < 0) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours >= 48) {
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return `${days}d ${remHours}h`;
  }
  return `${hours}h ${remainingMinutes}m`;
}

const URGENCY_RANK: Record<string, number> = {
  CRITICAL: 0,
  URGENT: 1,
  ROUTINE: 2,
};

export class FallbackPlannerService {
  static plan(
    units: Array<{
      id: string;
      component: Component;
      group: BloodGroup;
      hospitalId: string;
      expiresAt: Date;
      status: string;
      reservedForRequestId?: string | null;
    }>,
    requests: Array<{
      id: string;
      component: Component;
      group: BloodGroup;
      hospitalId: string;
      unitsNeeded: number;
      neededBy: Date;
      urgency: string;
    }>,
    routes: Array<{
      fromId: string;
      toId: string;
      baseMinutes: number;
      status: string;
      delayMinutes: number;
    }>,
    now: Date
  ) {
    // 1. Sort requests by urgency (CRITICAL > URGENT > ROUTINE), then neededBy, then id
    const sortedRequests = [...requests].sort((a, b) => {
      const rankA = URGENCY_RANK[a.urgency] ?? 3;
      const rankB = URGENCY_RANK[b.urgency] ?? 3;
      if (rankA !== rankB) return rankA - rankB;
      const timeDiff = a.neededBy.getTime() - b.neededBy.getTime();
      if (timeDiff !== 0) return timeDiff;
      return a.id.localeCompare(b.id);
    });

    const assignedUnits = new Set<string>();
    const unitToAllocatedReq = new Map<string, string>();
    const allocatedByReq = new Map<string, string[]>();
    const optionsByReq = new Map<string, FeasibilityCandidate[]>();
    const assignments: any[] = [];
    const unfulfilledList: any[] = [];
    const candidatesByUnitReq = new Map<string, FeasibilityCandidate>();

    for (const r of sortedRequests) {
      const allCandidates: FeasibilityCandidate[] = [];
      for (const u of units) {
        const cand = RulesService.evaluateCandidate(u, r, routes, now);
        allCandidates.push(cand);
        candidatesByUnitReq.set(`${cand.unitId}:${r.id}`, cand);
      }
      optionsByReq.set(r.id, allCandidates);

      const feasibleAvailable = allCandidates.filter(
        (c) => c.feasible && !assignedUnits.has(c.unitId)
      );

      // Baseline greedy order: nearest transit first, then FEFO (expiresAt), then unitId
      const unitMap = new Map(units.map((u) => [u.id, u]));
      feasibleAvailable.sort((a, b) => {
        if (a.transitMinutes !== b.transitMinutes) {
          return a.transitMinutes - b.transitMinutes;
        }
        const uA = unitMap.get(a.unitId)!;
        const uB = unitMap.get(b.unitId)!;
        const expDiff = uA.expiresAt.getTime() - uB.expiresAt.getTime();
        if (expDiff !== 0) return expDiff;
        return a.unitId.localeCompare(b.unitId);
      });

      const allocatedIds: string[] = [];
      for (const c of feasibleAvailable.slice(0, r.unitsNeeded)) {
        allocatedIds.push(c.unitId);
        assignedUnits.add(c.unitId);
        unitToAllocatedReq.set(c.unitId, r.id);
      }
      allocatedByReq.set(r.id, allocatedIds);
    }

    for (const r of sortedRequests) {
      const allocatedIds = allocatedByReq.get(r.id) || [];
      const allCandidates = optionsByReq.get(r.id) || [];

      const finalOptions = allCandidates.map((c) => {
        const allocatedToReq = unitToAllocatedReq.get(c.unitId);
        if (c.feasible && allocatedToReq && allocatedToReq !== r.id) {
          return {
            ...c,
            feasible: false,
            blockingReasons: [...c.blockingReasons, `Allocated to ${allocatedToReq} in this plan`],
          };
        }
        return c;
      });

      const isComplete = allocatedIds.length >= r.unitsNeeded;
      if (!isComplete) {
        const shortfall = r.unitsNeeded - allocatedIds.length;
        unfulfilledList.push({
          requestId: r.id,
          reasons: [`Missing ${shortfall} compatible unit(s) meeting transit & 30m safety margin`],
        });
      }

      let explanation = '';
      if (allocatedIds.length === 0) {
        explanation = `No feasible units found for ${r.urgency} request ${r.id}.`;
      } else if (allocatedIds.length === 1) {
        const chosen = allCandidates.find((c) => c.unitId === allocatedIds[0])!;
        const fromName = HOSPITAL_NAMES[chosen.fromHospitalId] || chosen.fromHospitalId;
        const toName = HOSPITAL_NAMES[chosen.toHospitalId] || chosen.toHospitalId;
        const timeStr = formatExpiryMargin(chosen.expiryMarginMinutes);

        const nearerRejected = allCandidates.filter(
          (c) =>
            c.transitMinutes < chosen.transitMinutes &&
            !c.feasible &&
            !c.blockingReasons.some((br) => br.includes('Incompatible'))
        );
        nearerRejected.sort((a, b) => a.transitMinutes - b.transitMinutes);

        let reasonPrefix = '';
        if (nearerRejected.length > 0) {
          const nearer = nearerRejected[0]!;
          const blockStr = nearer.blockingReasons[0] || 'infeasible';
          reasonPrefix = `Chosen over nearer unit ${nearer.unitId} because that unit ${blockStr.toLowerCase()}. `;
        }

        const transferStr =
          chosen.fromHospitalId === chosen.toHospitalId
            ? `Local stock at ${fromName}, no transfer needed`
            : `from ${fromName} to ${toName} (transit ${chosen.transitMinutes}m)`;

        explanation = `${reasonPrefix}Baseline nearest-available: ${transferStr}. ${timeStr} safety margin, fulfills ${r.urgency} request.`;
      } else {
        const allocatedCands = allCandidates.filter((c) => allocatedIds.includes(c.unitId));
        const hospitalsInvolved: string[] = [];
        for (const c of allocatedCands) {
          const hname = HOSPITAL_NAMES[c.fromHospitalId] || c.fromHospitalId;
          if (!hospitalsInvolved.includes(hname)) {
            hospitalsInvolved.push(hname);
          }
        }

        let locationStr = '';
        if (hospitalsInvolved.length === 1) {
          if (allocatedCands[0] && allocatedCands[0].fromHospitalId === r.hospitalId) {
            locationStr = `Local stock at ${hospitalsInvolved[0]}, no transfer needed`;
          } else {
            locationStr = `${allocatedCands.length} units from ${hospitalsInvolved[0]}`;
          }
        } else if (hospitalsInvolved.length === 2) {
          locationStr = `${allocatedCands.length} units from ${hospitalsInvolved[0]} and ${hospitalsInvolved[1]}`;
        } else {
          locationStr = `${allocatedCands.length} units from ${hospitalsInvolved.slice(0, -1).join(', ')} and ${hospitalsInvolved[hospitalsInvolved.length - 1]}`;
        }

        const details = allocatedCands.map(
          (c) => `${c.unitId} (${formatExpiryMargin(c.expiryMarginMinutes)} margin)`
        );

        explanation = `Baseline nearest-available: ${locationStr} [${details.join(', ')}]. Fulfills ${allocatedCands.length} of ${r.unitsNeeded} units for ${r.urgency} request.`;
      }

      assignments.push({
        requestId: r.id,
        allocatedUnitIds: allocatedIds,
        options: finalOptions,
        explanation,
        isComplete,
      });
    }

    // Metrics calculation
    let satisfied = 0;
    let partial = 0;
    let unfulfilled = 0;
    let totalTransportMinutes = 0;
    const allMargins: number[] = [];

    for (const a of assignments) {
      const req = requests.find((r) => r.id === a.requestId);
      const needed = req?.unitsNeeded ?? 1;
      const count = a.allocatedUnitIds.length;

      if (count >= needed) satisfied++;
      else if (count > 0) partial++;
      else unfulfilled++;

      for (const uid of a.allocatedUnitIds) {
        const cand = candidatesByUnitReq.get(`${uid}:${a.requestId}`);
        if (cand) {
          totalTransportMinutes += cand.transitMinutes;
          allMargins.push(cand.expiryMarginMinutes);
        }
      }
    }

    const horizon72h = new Date(now.getTime() + 72 * 3600000);
    const wastedUnits = units.filter(
      (u) =>
        u.status === 'AVAILABLE' &&
        !assignedUnits.has(u.id) &&
        u.expiresAt.getTime() <= horizon72h.getTime()
    ).length;

    const avgExpiryMarginMinutes =
      allMargins.length > 0
        ? Math.round((allMargins.reduce((a, b) => a + b, 0) / allMargins.length) * 10) / 10
        : 0;

    return {
      assignments,
      unfulfilled: unfulfilledList,
      metrics: {
        satisfied,
        partial,
        unfulfilled,
        wastedUnits,
        totalTransportMinutes,
        avgExpiryMarginMinutes,
      },
      source: 'fallback-baseline',
      disclaimer: 'Planning support only - not a clinical decision. Synthetic data.',
    };
  }
}
