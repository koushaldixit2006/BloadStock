import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { BloodGroup, Component } from '../models/unit.model';

export { BloodGroup, Component };

export const HOSPITAL_NAMES: Record<string, string> = {
  H1: 'Pink City General',
  H2: 'Aravali Medical Centre',
  H3: 'Amber Heart Institute',
  H4: 'Sawai Care Hospital',
  H5: 'Rampura Trauma Centre',
};

export interface FeasibilityCandidate {
  unitId: string;
  feasible: boolean;
  blockingReasons: string[];
  eta: string;
  expiryMarginMinutes: number;
  transitMinutes: number;
  fromHospitalId: string;
  toHospitalId: string;
}

export class RulesService {
  private static rulesCache: any = null;

  static loadRules(): any {
    if (this.rulesCache) return this.rulesCache;

    const possiblePaths = [
      config.sharedRulesPath,
      path.resolve(__dirname, '../../../../shared/rules.json'),
      path.resolve(__dirname, '../../../shared/rules.json'),
      path.resolve(__dirname, '../../shared/rules.json'),
      path.resolve(process.cwd(), '../shared/rules.json'),
      path.resolve(process.cwd(), 'shared/rules.json'),
    ];

    let filePath: string | null = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        filePath = p;
        break;
      }
    }

    if (!filePath) {
      throw new Error(`Rules file not found in paths: ${possiblePaths.join(', ')}`);
    }

    const data = fs.readFileSync(filePath, 'utf-8');
    this.rulesCache = JSON.parse(data);
    return this.rulesCache;
  }

  static getSafetyMarginMinutes(): number {
    const rules = this.loadRules();
    return rules.parameters?.safetyMarginMinutes ?? 30;
  }

  static getDispatchBufferMinutes(): number {
    const rules = this.loadRules();
    return rules.parameters?.dispatchBufferMinutes ?? 15;
  }

  static getShelfLifeDays(component: Component): number {
    const rules = this.loadRules();
    return rules.parameters?.shelfLifeDays?.[component] ?? (component === 'RED_CELLS' ? 42 : component === 'PLATELETS' ? 5 : 30);
  }

  static isCompatible(component: Component, donorGroup: BloodGroup, recipientGroup: BloodGroup): boolean {
    const rules = this.loadRules();
    const compRules = rules.compatibility?.[component];
    if (!compRules) return false;
    const acceptableDonors: string[] = compRules[recipientGroup] || [];
    return acceptableDonors.includes(donorGroup);
  }

  static isTimeFeasible(unitExpiresAt: Date, eta: Date, safetyMarginMinutes?: number): boolean {
    const margin = safetyMarginMinutes ?? this.getSafetyMarginMinutes();
    const diffMin = (unitExpiresAt.getTime() - eta.getTime()) / 60000;
    return diffMin >= margin;
  }

  static getRouteDetails(
    routes: Array<{ fromId: string; toId: string; baseMinutes: number; status: string; delayMinutes: number }>,
    fromId: string,
    toId: string
  ): { dispatchBuffer: number; transitMinutes: number; isUp: boolean; errorReason: string | null } {
    if (fromId === toId) {
      return { dispatchBuffer: 0, transitMinutes: 5, isUp: true, errorReason: null };
    }

    const dispatchBuffer = this.getDispatchBufferMinutes();
    const matching = routes.find((r) => r.fromId === fromId && r.toId === toId);

    if (!matching) {
      const fromName = HOSPITAL_NAMES[fromId] || fromId;
      const toName = HOSPITAL_NAMES[toId] || toId;
      return {
        dispatchBuffer,
        transitMinutes: 9999,
        isUp: false,
        errorReason: `Route ${fromName} to ${toName} not found`,
      };
    }

    if (matching.status === 'DOWN') {
      const fromName = HOSPITAL_NAMES[fromId] || fromId;
      const toName = HOSPITAL_NAMES[toId] || toId;
      return {
        dispatchBuffer,
        transitMinutes: 9999,
        isUp: false,
        errorReason: `Route ${fromName} to ${toName} is down`,
      };
    }

    const transit = matching.baseMinutes + (matching.delayMinutes || 0);
    return { dispatchBuffer, transitMinutes: transit, isUp: true, errorReason: null };
  }

  static evaluateCandidate(
    unit: { id: string; component: Component; group: BloodGroup; hospitalId: string; expiresAt: Date; status: string; reservedForRequestId?: string | null },
    request: { id: string; component: Component; group: BloodGroup; hospitalId: string; neededBy: Date; urgency: string },
    routes: Array<{ fromId: string; toId: string; baseMinutes: number; status: string; delayMinutes: number }>,
    now: Date
  ): FeasibilityCandidate {
    const blockingReasons: string[] = [];
    const safetyMargin = this.getSafetyMarginMinutes();

    // 1. Status check
    if (unit.status !== 'AVAILABLE') {
      if (unit.reservedForRequestId) {
        blockingReasons.push(`Already reserved for ${unit.reservedForRequestId}`);
      } else {
        blockingReasons.push(`Unit status is ${unit.status}`);
      }
    }

    // 2. Compatibility check
    if (unit.component !== request.component) {
      blockingReasons.push(`Incompatible component: unit is ${unit.component}, request is for ${request.component}`);
    } else if (!this.isCompatible(request.component, unit.group, request.group)) {
      blockingReasons.push(`Incompatible group: ${unit.group} cannot serve ${request.group}`);
    }

    // 3. Route check & ETA calculation
    const { dispatchBuffer, transitMinutes, isUp, errorReason } = this.getRouteDetails(
      routes,
      unit.hospitalId,
      request.hospitalId
    );

    if (!isUp && errorReason) {
      blockingReasons.push(errorReason);
    }

    const effectiveTransit = transitMinutes < 9000 ? transitMinutes : 60;
    const totalMinutes = dispatchBuffer + effectiveTransit;
    const eta = new Date(now.getTime() + totalMinutes * 60000);

    // 4. Expiry margin calculation
    const diffMs = unit.expiresAt.getTime() - eta.getTime();
    const expiryMarginMinutes = Math.floor(diffMs / 60000);

    // 5. Expiry safety margin check
    if (eta.getTime() >= unit.expiresAt.getTime()) {
      const overstayMin = Math.floor((eta.getTime() - unit.expiresAt.getTime()) / 60000);
      blockingReasons.push(`Expires ${overstayMin} min before arrival`);
    } else if (expiryMarginMinutes < safetyMargin) {
      blockingReasons.push(
        `Insufficient safety margin: arrives ${expiryMarginMinutes} min before expiry, requires at least ${safetyMargin} min`
      );
    }

    // 6. Needed-by deadline check
    if (eta.getTime() > request.neededBy.getTime()) {
      const delayMin = Math.floor((eta.getTime() - request.neededBy.getTime()) / 60000);
      blockingReasons.push(`Arrives ${delayMin} min after needed-by`);
    }

    const feasible = blockingReasons.length === 0;

    return {
      unitId: unit.id,
      feasible,
      blockingReasons,
      eta: eta.toISOString(),
      expiryMarginMinutes,
      transitMinutes: totalMinutes,
      fromHospitalId: unit.hospitalId,
      toHospitalId: request.hospitalId,
    };
  }
}
