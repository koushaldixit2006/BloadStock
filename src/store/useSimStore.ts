import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  BloodRequest,
  InvariantCheck,
  ReplanDiff,
  Reservation,
  Route,
  SimEvent,
  Unit,
} from '../types/domain';
import { getHospitalName } from '../data/hospitals';
import { createInitialRoutes, findRoute } from '../data/transportMatrix';
import { generateSeedRequests, generateSeedUnits, INITIAL_SIM_TIME } from '../data/seed';
import { addMinutesToIso, DISPATCH_BUFFER_MINUTES } from '../engine/clock';
import { evaluateCandidate } from '../engine/feasibility';
import {
  CancellationParams,
  DemandSpikeParams,
  NewStockParams,
  TransportFailureParams,
} from '../engine/scenarios';
import { planningService } from '../services/planningService';
import { apiClient, AuthUser } from '../services/apiClient';

interface SimStoreState {
  simTime: string;
  units: Unit[];
  requests: BloodRequest[];
  reservations: Reservation[];
  routes: Route[];
  events: SimEvent[];
  lastDiff: ReplanDiff | null;
  searchQuery: string;

  // Live Backend State
  isBackendConnected: boolean;
  isSyncing: boolean;
  currentUser: AuthUser | null;
  syncFromBackend: () => Promise<void>;
  loginAs: (role: 'ADMIN' | 'COORDINATOR' | 'VIEWER') => Promise<void>;

  // Actions (Async with local fallback)
  advanceClock: (hours: number) => Promise<void>;
  createReservation: (unitId: string, requestId: string) => Promise<{ success: boolean; reason?: string; reservation?: Reservation }>;
  createMultipleReservations: (pairs: { unitId: string; requestId: string }[]) => Promise<{ successCount: number; blockedCount: number; reasons: string[] }>;
  cancelReservation: (reservationId: string) => Promise<{ success: boolean; reason?: string }>;
  dispatchReservation: (reservationId: string) => Promise<{ success: boolean; reason?: string }>;
  deliverReservation: (reservationId: string) => Promise<{ success: boolean; reason?: string }>;
  addRequest: (newReq: Omit<BloodRequest, 'id' | 'createdAt' | 'status'>) => Promise<BloodRequest>;
  cancelRequest: (requestId: string) => Promise<void>;
  applyScenario: (
    scenario:
      | { type: 'TRANSPORT_FAILURE'; params: TransportFailureParams }
      | { type: 'DEMAND_SPIKE'; params: DemandSpikeParams }
      | { type: 'CANCELLATION'; params: CancellationParams }
      | { type: 'NEW_STOCK'; params: NewStockParams }
      | { type: 'MANUAL_REPLAN' }
  ) => Promise<{ success: boolean; diff: ReplanDiff; invariants: InvariantCheck[]; error?: string }>;
  restoreRoute: (fromId: string, toId: string) => Promise<void>;
  setSearchQuery: (query: string) => void;
  resetDemoData: () => Promise<void>;
  getInvariants: () => InvariantCheck[];
}

export const useSimStore = create<SimStoreState>()(
  persist(
    (set, get) => ({
      simTime: INITIAL_SIM_TIME,
      units: generateSeedUnits(INITIAL_SIM_TIME),
      requests: generateSeedRequests(INITIAL_SIM_TIME),
      reservations: [],
      routes: createInitialRoutes(),
      events: [
        {
          id: 'EVT-INIT',
          ts: INITIAL_SIM_TIME,
          type: 'INIT',
          description: 'Simulation environment initialized with 5 regional hospitals and 122 synthetic blood units.',
        },
      ],
      lastDiff: null,
      searchQuery: '',

      isBackendConnected: false,
      isSyncing: false,
      currentUser: null,

      syncFromBackend: async () => {
        set({ isSyncing: true });
        try {
          const user = await apiClient.ensureAuthenticated();
          const [backendUnits, backendRequests, backendRoutes, backendReservations, simClock] = await Promise.all([
            apiClient.getUnits(),
            apiClient.getRequests(),
            apiClient.getRoutes(),
            apiClient.getReservations(),
            apiClient.getSimClock().catch(() => null),
          ]);

          const mappedUnits: Unit[] = backendUnits.map((u: any) => ({
            id: u.id,
            component: u.component,
            group: u.group,
            hospitalId: u.hospitalId,
            collectedAt: typeof u.collectedAt === 'string' ? u.collectedAt : new Date(u.collectedAt).toISOString(),
            expiresAt: typeof u.expiresAt === 'string' ? u.expiresAt : new Date(u.expiresAt).toISOString(),
            status: u.status,
            reservedForRequestId: u.reservedForRequestId || undefined,
          }));

          const mappedRequests: BloodRequest[] = backendRequests.map((r: any) => ({
            id: r.id,
            hospitalId: r.hospitalId,
            component: r.component,
            group: r.group,
            unitsNeeded: r.unitsNeeded,
            neededBy: typeof r.neededBy === 'string' ? r.neededBy : new Date(r.neededBy).toISOString(),
            urgency: r.urgency,
            status: r.status,
            createdAt: typeof r.createdAt === 'string' ? r.createdAt : new Date(r.createdAt).toISOString(),
            clinicalContext: r.clinicalContext,
          }));

          const mappedRoutes: Route[] = backendRoutes.map((rt: any) => ({
            fromId: rt.fromId,
            toId: rt.toId,
            baseMinutes: rt.baseMinutes,
            status: rt.status,
            delayMinutes: rt.delayMinutes || 0,
          }));

          const mappedReservations: Reservation[] = backendReservations.map((r: any) => {
            const dispatchTime = new Date(r.dispatchAt).getTime();
            const etaTime = new Date(r.eta).getTime();
            const transitMinutes = Math.max(5, Math.round((etaTime - dispatchTime) / 60000));
            return {
              id: r.id,
              unitId: r.unitId,
              requestId: r.requestId,
              fromHospitalId: r.fromHospitalId,
              toHospitalId: r.toHospitalId,
              dispatchAt: typeof r.dispatchAt === 'string' ? r.dispatchAt : new Date(r.dispatchAt).toISOString(),
              eta: typeof r.eta === 'string' ? r.eta : new Date(r.eta).toISOString(),
              status: r.status,
              createdAt: typeof r.createdAt === 'string' ? r.createdAt : new Date(r.createdAt).toISOString(),
              transitMinutes,
            };
          });

          const newSimTime = simClock?.virtualNow || get().simTime;

          set({
            units: mappedUnits,
            requests: mappedRequests,
            routes: mappedRoutes,
            reservations: mappedReservations,
            simTime: newSimTime,
            currentUser: user,
            isBackendConnected: true,
            isSyncing: false,
          });
        } catch (err) {
          console.warn('Backend unavailable, running in local in-memory simulator mode:', err);
          set({ isBackendConnected: false, isSyncing: false });
        }
      },

      loginAs: async (role: 'ADMIN' | 'COORDINATOR' | 'VIEWER') => {
        let email = 'coordinator1@bloodstock.local';
        let password = 'CoordPass123!';
        if (role === 'ADMIN') {
          email = 'admin@bloodstock.local';
          password = 'AdminPass123!';
        } else if (role === 'VIEWER') {
          email = 'viewer@bloodstock.local';
          password = 'ViewerPass123!';
        }
        try {
          const res = await apiClient.login(email, password);
          set({ currentUser: res.user });
          await get().syncFromBackend();
        } catch (err) {
          console.error('Failed to login:', err);
        }
      },

      advanceClock: async (hours: number) => {
        if (get().isBackendConnected) {
          try {
            await apiClient.advanceSimClock(hours);
            await get().syncFromBackend();
            return;
          } catch (err) {
            console.warn('Backend advance clock failed, falling back to local simulation:', err);
          }
        }

        const { simTime, units, reservations, events } = get();
        const minutes = hours * 60;
        const newSimTime = addMinutesToIso(simTime, minutes);

        let updatedUnits = units.map((u) => ({ ...u }));
        const updatedReservations = reservations.map((rsv) => {
          if (rsv.status === 'IN_TRANSIT' && new Date(newSimTime) >= new Date(rsv.eta)) {
            updatedUnits = updatedUnits.map((u) =>
              u.id === rsv.unitId ? { ...u, status: 'USED' as const } : u
            );
            return { ...rsv, status: 'DELIVERED' as const };
          }
          return rsv;
        });

        updatedUnits = updatedUnits.map((u) => {
          if (u.status === 'AVAILABLE' && new Date(newSimTime) >= new Date(u.expiresAt)) {
            return { ...u, status: 'EXPIRED' as const };
          }
          return u;
        });

        const newEvent: SimEvent = {
          id: `EVT-ADV-${Date.now().toString().slice(-6)}`,
          ts: newSimTime,
          type: 'CLOCK_ADVANCED',
          description: `Simulation clock advanced by +${hours} hour(s) to ${new Date(newSimTime).toUTCString()}.`,
          payload: { hoursAdvanced: hours },
        };

        set({
          simTime: newSimTime,
          units: updatedUnits,
          reservations: updatedReservations,
          events: [newEvent, ...events],
        });
      },

      createReservation: async (unitId: string, requestId: string) => {
        const { isBackendConnected, units, requests, reservations, routes, simTime, events } = get();

        if (isBackendConnected) {
          try {
            const rec = await apiClient.getRecommendations(requestId);
            if (rec && rec.planId) {
              const idempotencyKey = `web-${requestId}-${unitId}-${Date.now()}`;
              const commitRes = await apiClient.commitReservation(rec.planId, idempotencyKey);
              await get().syncFromBackend();
              const createdRsv = (commitRes.reservations || [])[0];
              return { success: true, reservation: createdRsv };
            }
          } catch (err: any) {
            const reason = err.details?.error?.message || err.message || 'Double allocation prevented by backend';
            return { success: false, reason };
          }
        }

        // Local fallback
        const unit = units.find((u) => u.id === unitId);
        const request = requests.find((r) => r.id === requestId);

        if (!unit) {
          return { success: false, reason: `Unit ${unitId} not found in inventory.` };
        }
        if (!request) {
          return { success: false, reason: `Request ${requestId} not found.` };
        }

        if (unit.status !== 'AVAILABLE') {
          const reason = unit.reservedForRequestId
            ? `Double allocation blocked - unit ${unitId} is already reserved for ${unit.reservedForRequestId}`
            : `Double allocation blocked - unit ${unitId} is in status ${unit.status}`;

          const blockEvent: SimEvent = {
            id: `EVT-BLK-${Date.now().toString().slice(-6)}`,
            ts: simTime,
            type: 'DOUBLE_ALLOCATION_PREVENTED',
            description: reason,
            payload: { unitId, requestId, status: unit.status, existingRequest: unit.reservedForRequestId },
          };

          set({ events: [blockEvent, ...events] });
          return { success: false, reason };
        }

        const feasibility = evaluateCandidate(unit, request, { now: simTime, routes });
        if (!feasibility.feasible) {
          const reason = `Allocation rejected: ${feasibility.blockingReasons.join('; ')}`;
          return { success: false, reason };
        }

        let transitMinutes = 5;
        if (unit.hospitalId !== request.hospitalId) {
          const rt = findRoute(routes, unit.hospitalId, request.hospitalId);
          transitMinutes = rt ? rt.baseMinutes + rt.delayMinutes : 30;
        }

        const totalTravelMinutes = DISPATCH_BUFFER_MINUTES + transitMinutes;
        const eta = addMinutesToIso(simTime, totalTravelMinutes);

        const rsvId = `RSV-${Math.floor(1000 + Math.random() * 9000)}`;
        const newReservation: Reservation = {
          id: rsvId,
          unitId: unit.id,
          requestId: request.id,
          fromHospitalId: unit.hospitalId,
          toHospitalId: request.hospitalId,
          dispatchAt: addMinutesToIso(simTime, DISPATCH_BUFFER_MINUTES),
          eta,
          status: 'RESERVED',
          createdAt: simTime,
          transitMinutes,
        };

        const updatedUnits = units.map((u) =>
          u.id === unitId ? { ...u, status: 'RESERVED' as const, reservedForRequestId: requestId } : u
        );

        const currentAllocated = reservations.filter(
          (r) => r.requestId === requestId && (r.status === 'RESERVED' || r.status === 'IN_TRANSIT')
        ).length + 1;

        const updatedRequests = requests.map((r) => {
          if (r.id === requestId) {
            const newStatus = currentAllocated >= r.unitsNeeded ? ('PLANNED' as const) : ('PARTIAL' as const);
            return { ...r, status: newStatus };
          }
          return r;
        });

        const newEvent: SimEvent = {
          id: `EVT-RSV-${Date.now().toString().slice(-6)}`,
          ts: simTime,
          type: 'RESERVATION_CREATED',
          description: `Reserved unit ${unit.id} (${unit.group} ${unit.component}) from ${getHospitalName(unit.hospitalId)} for request ${request.id}. ETA: ${new Date(eta).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })} UTC.`,
          payload: { reservationId: rsvId, unitId, requestId },
        };

        set({
          units: updatedUnits,
          requests: updatedRequests,
          reservations: [newReservation, ...reservations],
          events: [newEvent, ...events],
        });

        return { success: true, reservation: newReservation };
      },

      createMultipleReservations: async (pairs) => {
        let successCount = 0;
        let blockedCount = 0;
        const reasons: string[] = [];

        for (const pair of pairs) {
          const res = await get().createReservation(pair.unitId, pair.requestId);
          if (res.success) {
            successCount++;
          } else {
            blockedCount++;
            if (res.reason) reasons.push(res.reason);
          }
        }

        return { successCount, blockedCount, reasons };
      },

      cancelReservation: async (reservationId: string) => {
        if (get().isBackendConnected) {
          try {
            await apiClient.cancelReservation(reservationId);
            await get().syncFromBackend();
            return { success: true };
          } catch (err: any) {
            return { success: false, reason: err.message };
          }
        }

        const { reservations, units, requests, simTime, events } = get();
        const rsv = reservations.find((r) => r.id === reservationId);

        if (!rsv) {
          return { success: false, reason: 'Reservation not found.' };
        }

        if (rsv.status === 'IN_TRANSIT') {
          return { success: false, reason: 'In-transit transfer cannot be cancelled while en route.' };
        }

        const updatedReservations = reservations.map((r) =>
          r.id === reservationId ? { ...r, status: 'CANCELLED' as const } : r
        );

        const updatedUnits = units.map((u) =>
          u.id === rsv.unitId ? { ...u, status: 'AVAILABLE' as const, reservedForRequestId: undefined } : u
        );

        const remainingForReq = updatedReservations.filter(
          (r) => r.requestId === rsv.requestId && (r.status === 'RESERVED' || r.status === 'IN_TRANSIT')
        ).length;

        const updatedRequests = requests.map((rq) => {
          if (rq.id === rsv.requestId) {
            if (remainingForReq === 0) return { ...rq, status: 'OPEN' as const };
            if (remainingForReq < rq.unitsNeeded) return { ...rq, status: 'PARTIAL' as const };
            return rq;
          }
          return rq;
        });

        const cancelEvent: SimEvent = {
          id: `EVT-CAN-${Date.now().toString().slice(-6)}`,
          ts: simTime,
          type: 'RESERVATION_CANCELLED',
          description: `Reservation ${reservationId} for unit ${rsv.unitId} cancelled. Unit restored to AVAILABLE inventory.`,
          payload: { reservationId, unitId: rsv.unitId, requestId: rsv.requestId },
        };

        set({
          reservations: updatedReservations,
          units: updatedUnits,
          requests: updatedRequests,
          events: [cancelEvent, ...events],
        });

        return { success: true };
      },

      dispatchReservation: async (reservationId: string) => {
        if (get().isBackendConnected) {
          try {
            await apiClient.dispatchReservation(reservationId);
            await get().syncFromBackend();
            return { success: true };
          } catch (err: any) {
            return { success: false, reason: err.message };
          }
        }

        const { reservations, units, simTime, events } = get();
        const rsv = reservations.find((r) => r.id === reservationId);

        if (!rsv || rsv.status !== 'RESERVED') {
          return { success: false, reason: 'Reservation is not in RESERVED status.' };
        }

        const updatedReservations = reservations.map((r) =>
          r.id === reservationId ? { ...r, status: 'IN_TRANSIT' as const } : r
        );

        const updatedUnits = units.map((u) =>
          u.id === rsv.unitId ? { ...u, status: 'IN_TRANSIT' as const } : u
        );

        const dispatchEvent: SimEvent = {
          id: `EVT-DSP-${Date.now().toString().slice(-6)}`,
          ts: simTime,
          type: 'RESERVATION_DISPATCHED',
          description: `Unit ${rsv.unitId} dispatched from ${getHospitalName(rsv.fromHospitalId)} to ${getHospitalName(rsv.toHospitalId)}. En route.`,
          payload: { reservationId, unitId: rsv.unitId },
        };

        set({
          reservations: updatedReservations,
          units: updatedUnits,
          events: [dispatchEvent, ...events],
        });

        return { success: true };
      },

      deliverReservation: async (reservationId: string) => {
        if (get().isBackendConnected) {
          try {
            await apiClient.deliverReservation(reservationId);
            await get().syncFromBackend();
            return { success: true };
          } catch (err: any) {
            return { success: false, reason: err.message };
          }
        }

        const { reservations, units, simTime, events } = get();
        const rsv = reservations.find((r) => r.id === reservationId);

        if (!rsv || rsv.status !== 'IN_TRANSIT') {
          return { success: false, reason: 'Reservation is not currently IN_TRANSIT.' };
        }

        const updatedReservations = reservations.map((r) =>
          r.id === reservationId ? { ...r, status: 'DELIVERED' as const } : r
        );

        const updatedUnits = units.map((u) =>
          u.id === rsv.unitId ? { ...u, status: 'USED' as const } : u
        );

        const deliveryEvent: SimEvent = {
          id: `EVT-DLV-${Date.now().toString().slice(-6)}`,
          ts: simTime,
          type: 'RESERVATION_DELIVERED',
          description: `Unit ${rsv.unitId} successfully delivered at destination ${getHospitalName(rsv.toHospitalId)}. Ready for clinical release.`,
          payload: { reservationId, unitId: rsv.unitId },
        };

        set({
          reservations: updatedReservations,
          units: updatedUnits,
          events: [deliveryEvent, ...events],
        });

        return { success: true };
      },

      addRequest: async (newReq) => {
        if (get().isBackendConnected) {
          try {
            const created = await apiClient.createRequest({
              hospitalId: newReq.hospitalId,
              component: newReq.component,
              group: newReq.group,
              unitsNeeded: newReq.unitsNeeded,
              neededBy: newReq.neededBy,
              urgency: newReq.urgency,
              clinicalContext: newReq.clinicalContext,
            });
            await get().syncFromBackend();
            return {
              id: created.id,
              hospitalId: created.hospitalId,
              component: created.component,
              group: created.group,
              unitsNeeded: created.unitsNeeded,
              neededBy: typeof created.neededBy === 'string' ? created.neededBy : new Date(created.neededBy).toISOString(),
              urgency: created.urgency,
              status: created.status,
              createdAt: typeof created.createdAt === 'string' ? created.createdAt : new Date(created.createdAt).toISOString(),
              clinicalContext: created.clinicalContext,
            };
          } catch (err) {
            console.warn('Backend create request failed, falling back to local simulation:', err);
          }
        }

        const { requests, simTime, events } = get();
        const reqId = `R-${Math.floor(1000 + Math.random() * 9000)}`;

        const createdRequest: BloodRequest = {
          ...newReq,
          id: reqId,
          createdAt: simTime,
          status: 'OPEN',
        };

        const createEvent: SimEvent = {
          id: `EVT-REQ-${Date.now().toString().slice(-6)}`,
          ts: simTime,
          type: 'REQUEST_CREATED',
          description: `New intake: ${createdRequest.unitsNeeded}x ${createdRequest.group} ${createdRequest.component} (${createdRequest.urgency}) requested at ${getHospitalName(createdRequest.hospitalId)}.`,
          payload: { requestId: reqId },
        };

        set({
          requests: [createdRequest, ...requests],
          events: [createEvent, ...events],
        });

        return createdRequest;
      },

      cancelRequest: async (requestId: string) => {
        if (get().isBackendConnected) {
          try {
            await apiClient.cancelRequest(requestId);
            await get().syncFromBackend();
            return;
          } catch (err) {
            console.warn('Backend cancel request failed, falling back to local simulation:', err);
          }
        }

        const { requests, reservations, units, simTime, events } = get();

        const updatedRequests = requests.map((r) =>
          r.id === requestId ? { ...r, status: 'CANCELLED' as const } : r
        );

        let updatedUnits = [...units];
        const updatedReservations = reservations.map((rsv) => {
          if (rsv.requestId === requestId && rsv.status === 'RESERVED') {
            updatedUnits = updatedUnits.map((u) =>
              u.id === rsv.unitId ? { ...u, status: 'AVAILABLE' as const, reservedForRequestId: undefined } : u
            );
            return { ...rsv, status: 'CANCELLED' as const };
          }
          return rsv;
        });

        const cancelEvent: SimEvent = {
          id: `EVT-RCAN-${Date.now().toString().slice(-6)}`,
          ts: simTime,
          type: 'REQUEST_CANCELLED',
          description: `Request ${requestId} cancelled. Unused reservations released.`,
          payload: { requestId },
        };

        set({
          requests: updatedRequests,
          reservations: updatedReservations,
          units: updatedUnits,
          events: [cancelEvent, ...events],
        });
      },

      applyScenario: async (scenario) => {
        if (get().isBackendConnected && scenario.type === 'TRANSPORT_FAILURE') {
          try {
            const res = await apiClient.triggerTransportFailure(
              scenario.params.fromId,
              scenario.params.toId,
              scenario.params.action === 'SET_DOWN'
            );
            await get().syncFromBackend();
            return {
              success: true,
              diff: res.diff,
              invariants: res.invariants,
            };
          } catch (err: any) {
            console.warn('Backend transport failure scenario failed, using local simulation:', err);
          }
        }

        const { units, requests, reservations, routes, simTime, events } = get();

        const result = planningService.runScenario(
          { units, requests, reservations, routes, simTime },
          scenario
        );

        if (!result.success) {
          return {
            success: false,
            diff: result.diff,
            invariants: result.invariants,
            error: result.errorMessage,
          };
        }

        set({
          units: result.nextState.units,
          requests: result.nextState.requests,
          reservations: result.nextState.reservations,
          routes: result.nextState.routes,
          lastDiff: result.diff,
          events: [result.event, ...events],
        });

        return {
          success: true,
          diff: result.diff,
          invariants: result.invariants,
        };
      },

      restoreRoute: async (fromId: string, toId: string) => {
        if (get().isBackendConnected) {
          try {
            await apiClient.triggerTransportFailure(fromId, toId, false);
            await get().syncFromBackend();
            return;
          } catch (err) {
            console.warn('Backend restore route failed, using local simulation:', err);
          }
        }

        const { routes, simTime, events } = get();
        const updatedRoutes = routes.map((rt) => {
          if ((rt.fromId === fromId && rt.toId === toId) || (rt.fromId === toId && rt.toId === fromId)) {
            return { ...rt, status: 'UP' as const, delayMinutes: 0 };
          }
          return rt;
        });

        const restoreEvent: SimEvent = {
          id: `EVT-RST-${Date.now().toString().slice(-6)}`,
          ts: simTime,
          type: 'TRANSPORT_RESTORED',
          description: `Route between ${getHospitalName(fromId)} and ${getHospitalName(toId)} restored to normal operational status (UP, 0m delay).`,
          payload: { fromId, toId },
        };

        set({
          routes: updatedRoutes,
          events: [restoreEvent, ...events],
        });
      },

      setSearchQuery: (query: string) => set({ searchQuery: query }),

      resetDemoData: async () => {
        if (get().isBackendConnected) {
          try {
            await apiClient.resetSim();
            await get().syncFromBackend();
            return;
          } catch (err) {
            console.warn('Backend reset failed, using local seed reset:', err);
          }
        }

        const initialUnits = generateSeedUnits(INITIAL_SIM_TIME);
        const initialRequests = generateSeedRequests(INITIAL_SIM_TIME);
        const initialRoutes = createInitialRoutes();

        const resetEvent: SimEvent = {
          id: `EVT-RESET-${Date.now().toString().slice(-6)}`,
          ts: INITIAL_SIM_TIME,
          type: 'RESET_DATA',
          description: 'Demo dataset restored to initial state with 122 units, 6 requests, and zero active reservations.',
        };

        set({
          simTime: INITIAL_SIM_TIME,
          units: initialUnits,
          requests: initialRequests,
          reservations: [],
          routes: initialRoutes,
          events: [resetEvent],
          lastDiff: null,
          searchQuery: '',
        });
      },

      getInvariants: () => {
        const { reservations, units, requests } = get();
        return planningService.verifyInvariants(reservations, units, requests);
      },
    }),
    {
      name: 'bloodstock-sim-storage',
      partialize: (state) => ({
        simTime: state.simTime,
        units: state.units,
        requests: state.requests,
        reservations: state.reservations,
        routes: state.routes,
        events: state.events,
        lastDiff: state.lastDiff,
        currentUser: state.currentUser,
      }),
    }
  )
);
