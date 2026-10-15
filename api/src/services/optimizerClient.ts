import { config } from '../config';
import { logger } from '../utils/logger';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export class CircuitBreakerOpenError extends Error {
  constructor(message = 'Circuit breaker is OPEN: optimizer service unavailable') {
    super(message);
    this.name = 'CircuitBreakerOpenError';
  }
}

export class OptimizerClient {
  private static state: CircuitState = CircuitState.CLOSED;
  private static failureCount = 0;
  private static lastStateChange = Date.now();
  private static readonly FAILURE_THRESHOLD = 3;
  private static readonly RESET_TIMEOUT_MS = 10000; // 10s cool-down

  static getState(): CircuitState {
    this.checkStateTransition();
    return this.state;
  }

  static isAvailable(): boolean {
    return this.getState() !== CircuitState.OPEN;
  }

  static resetCircuitBreaker(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.lastStateChange = Date.now();
  }

  static recordSuccess(): void {
    this.failureCount = 0;
    this.state = CircuitState.CLOSED;
    this.lastStateChange = Date.now();
  }

  static recordFailure(): void {
    this.failureCount++;
    this.lastStateChange = Date.now();
    if (this.state === CircuitState.HALF_OPEN || this.failureCount >= this.FAILURE_THRESHOLD) {
      this.state = CircuitState.OPEN;
      logger.warn(
        { failures: this.failureCount, state: this.state },
        'Optimizer circuit breaker tripped to OPEN'
      );
    }
  }

  private static checkStateTransition(): void {
    if (this.state === CircuitState.OPEN) {
      const now = Date.now();
      if (now - this.lastStateChange >= this.RESET_TIMEOUT_MS) {
        this.state = CircuitState.HALF_OPEN;
        this.lastStateChange = now;
        logger.info('Optimizer circuit breaker entered HALF_OPEN state (probing)');
      }
    }
  }

  static async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    if (!this.isAvailable()) {
      throw new CircuitBreakerOpenError();
    }

    const url = `${config.optimizerUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      'X-Internal-Secret': config.internalSecret,
      ...(options.headers || {}),
    };

    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt < 2) {
      attempt++;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

        const response = await fetch(url, {
          ...options,
          headers,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          if (response.status >= 500) {
            throw new Error(`Optimizer returned HTTP ${response.status}: ${response.statusText}`);
          }
          const errBody = await response.text();
          throw new Error(`Optimizer HTTP ${response.status}: ${errBody}`);
        }

        const data = (await response.json()) as T;
        this.recordSuccess();
        return data;
      } catch (err: any) {
        lastError = err;
        const isAbort = err.name === 'AbortError';
        logger.warn(
          { attempt, url, err: isAbort ? 'Request timed out after 5s' : err.message },
          'Optimizer request attempt failed'
        );

        // Only retry once on network error or 5xx, not on client abort if final attempt
        if (attempt >= 2) {
          break;
        }
      }
    }

    this.recordFailure();
    throw lastError || new Error('Optimizer request failed after retries');
  }

  static async getHealth(): Promise<{ status: string; service: string }> {
    return this.request<{ status: string; service: string }>('/health', { method: 'GET' });
  }

  static async getFeasibility(payload: any): Promise<any[]> {
    return this.request<any[]>('/v1/feasibility', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  static async getPlan(payload: any): Promise<any> {
    return this.request<any>('/v1/plan', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  static async validate(payload: any): Promise<any[]> {
    return this.request<any[]>('/v1/validate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }
}
