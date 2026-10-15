/**
 * BloodStock API Client
 * Connects the React frontend directly to the Node.js API service (http://localhost:3001/api/v1).
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'COORDINATOR' | 'VIEWER';
  hospitalId?: string | null;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

class ApiClient {
  private token: string | null = null;
  private currentUser: AuthUser | null = null;

  constructor() {
    this.token = localStorage.getItem('bloodstock_access_token');
    const savedUser = localStorage.getItem('bloodstock_user');
    if (savedUser) {
      try {
        this.currentUser = JSON.parse(savedUser);
      } catch {
        this.currentUser = null;
      }
    }
  }

  public setAuth(token: string | null, user: AuthUser | null) {
    this.token = token;
    this.currentUser = user;
    if (token) {
      localStorage.setItem('bloodstock_access_token', token);
    } else {
      localStorage.removeItem('bloodstock_access_token');
    }
    if (user) {
      localStorage.setItem('bloodstock_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('bloodstock_user');
    }
  }

  public getToken(): string | null {
    return this.token;
  }

  public getCurrentUser(): AuthUser | null {
    return this.currentUser;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        credentials: 'include',
      });

      if (!response.ok) {
        let errorData: any = {};
        try {
          errorData = await response.json();
        } catch {
          errorData = { error: { message: response.statusText } };
        }
        const errorMsg = errorData.error?.message || errorData.message || `HTTP ${response.status}: ${response.statusText}`;
        const err = new Error(errorMsg);
        (err as any).status = response.status;
        (err as any).details = errorData;
        throw err;
      }

      return await response.json();
    } catch (err: any) {
      // Re-throw with clear message
      throw err;
    }
  }

  // --- Auth Endpoints ---
  async login(email: string = 'coordinator1@bloodstock.local', password: string = 'CoordPass123!'): Promise<LoginResponse> {
    const res = await this.request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    this.setAuth(res.accessToken, res.user);
    return res;
  }

  async ensureAuthenticated(): Promise<AuthUser> {
    if (this.token && this.currentUser) {
      return this.currentUser;
    }
    const res = await this.login();
    return res.user;
  }

  async getMe(): Promise<AuthUser> {
    const res = await this.request<AuthUser>('/auth/me');
    this.currentUser = res;
    localStorage.setItem('bloodstock_user', JSON.stringify(res));
    return res;
  }

  // --- Inventory & Reference ---
  async getHospitals() {
    return this.request<any[]>('/hospitals');
  }

  async getRoutes() {
    return this.request<any[]>('/routes');
  }

  async getUnits(params?: Record<string, string>) {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.request<any[]>(`/units${query}`);
  }

  async getInventorySummary() {
    return this.request<any>('/inventory/summary');
  }

  // --- Blood Requests ---
  async getRequests(params?: Record<string, string>) {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.request<any[]>(`/requests${query}`);
  }

  async createRequest(reqData: {
    hospitalId?: string;
    component: string;
    group: string;
    unitsNeeded: number;
    neededBy: string;
    urgency: string;
    clinicalContext?: string;
  }) {
    await this.ensureAuthenticated();
    return this.request<any>('/requests', {
      method: 'POST',
      body: JSON.stringify(reqData),
    });
  }

  async cancelRequest(requestId: string) {
    await this.ensureAuthenticated();
    return this.request<any>(`/requests/${requestId}/cancel`, {
      method: 'POST',
    });
  }

  // --- Recommendations ---
  async getRecommendations(requestId: string) {
    await this.ensureAuthenticated();
    return this.request<any>(`/requests/${requestId}/recommendations`, {
      method: 'POST',
    });
  }

  // --- Reservations & Atomic Commit ---
  async commitReservation(planId: string, idempotencyKey: string) {
    await this.ensureAuthenticated();
    return this.request<any>('/reservations/commit', {
      method: 'POST',
      body: JSON.stringify({ planId, idempotencyKey }),
    });
  }

  async getReservations(params?: Record<string, string>) {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.request<any[]>(`/reservations${query}`);
  }

  async dispatchReservation(reservationId: string) {
    await this.ensureAuthenticated();
    return this.request<any>(`/reservations/${reservationId}/dispatch`, {
      method: 'POST',
    });
  }

  async deliverReservation(reservationId: string) {
    await this.ensureAuthenticated();
    return this.request<any>(`/reservations/${reservationId}/deliver`, {
      method: 'POST',
    });
  }

  async cancelReservation(reservationId: string) {
    await this.ensureAuthenticated();
    return this.request<any>(`/reservations/${reservationId}/cancel`, {
      method: 'POST',
    });
  }

  // --- Plans Comparison ---
  async comparePlans(requestIds?: string[]) {
    await this.ensureAuthenticated();
    return this.request<any>('/plans/compare', {
      method: 'POST',
      body: JSON.stringify(requestIds ? { requestIds } : {}),
    });
  }

  // --- Dynamic Scenarios ---
  async triggerTransportFailure(fromId: string, toId: string, down: boolean) {
    await this.ensureAuthenticated();
    return this.request<any>('/scenarios/transport-failure', {
      method: 'POST',
      body: JSON.stringify({ fromId, toId, down }),
    });
  }

  async triggerDemandSpike(params: {
    hospitalId: string;
    component: string;
    group: string;
    unitsNeeded: number;
    minutesNeededIn: number;
  }) {
    await this.ensureAuthenticated();
    return this.request<any>('/scenarios/demand-spike', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async triggerCancellation(requestId: string) {
    await this.ensureAuthenticated();
    return this.request<any>('/scenarios/cancellation', {
      method: 'POST',
      body: JSON.stringify({ requestId }),
    });
  }

  async triggerNewStock(params: {
    hospitalId: string;
    component: string;
    group: string;
    count: number;
    shelfLifeHours: number;
  }) {
    await this.ensureAuthenticated();
    return this.request<any>('/scenarios/new-stock', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // --- Simulation Engine ---
  async getSimClock() {
    return this.request<any>('/sim/clock');
  }

  async advanceSimClock(hours: number) {
    await this.ensureAuthenticated();
    return this.request<any>('/sim/advance', {
      method: 'POST',
      body: JSON.stringify({ hours }),
    });
  }

  async resetSim() {
    await this.ensureAuthenticated();
    return this.request<any>('/sim/reset', {
      method: 'POST',
    });
  }

  // --- Invariants & Audit ---
  async getInvariants() {
    return this.request<any[]>('/invariants');
  }

  async verifyAudit() {
    return this.request<any>('/audit/verify');
  }

  async getAuditLogs(page: number = 1, limit: number = 50) {
    await this.ensureAuthenticated();
    return this.request<any>(`/audit?page=${page}&limit=${limit}`);
  }
}

export const apiClient = new ApiClient();
