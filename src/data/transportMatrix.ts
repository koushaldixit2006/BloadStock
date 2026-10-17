import { Route } from '../types/domain';

// Symmetric base transit durations in minutes
const BASE_MATRIX: Record<string, Record<string, number>> = {
  H1: { H1: 5,  H2: 25, H3: 20, H4: 30, H5: 35 },
  H2: { H1: 25, H2: 5,  H3: 55, H4: 40, H5: 75 },
  H3: { H1: 20, H2: 55, H3: 5,  H4: 65, H5: 45 },
  H4: { H1: 30, H2: 40, H3: 65, H4: 5,  H5: 50 },
  H5: { H1: 35, H2: 75, H3: 45, H4: 50, H5: 5  },
};

export function createInitialRoutes(): Route[] {
  const routes: Route[] = [];
  const hospitalIds = ['H1', 'H2', 'H3', 'H4', 'H5'];

  for (const fromId of hospitalIds) {
    for (const toId of hospitalIds) {
      routes.push({
        fromId,
        toId,
        baseMinutes: BASE_MATRIX[fromId]?.[toId] ?? 30,
        status: 'UP',
        delayMinutes: 0,
      });
    }
  }

  return routes;
}

export function getRouteKey(fromId: string, toId: string): string {
  return `${fromId}->${toId}`;
}

export function findRoute(routes: Route[], fromId: string, toId: string): Route | undefined {
  return routes.find((r) => r.fromId === fromId && r.toId === toId);
}

export function getTransitMinutes(routes: Route[], fromId: string, toId: string): number {
  if (fromId === toId) return 5;
  const route = findRoute(routes, fromId, toId);
  if (!route) return 60;
  return route.baseMinutes + route.delayMinutes;
}
