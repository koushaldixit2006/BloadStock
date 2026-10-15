import { OptimizerClient, CircuitState, CircuitBreakerOpenError } from '../src/services/optimizerClient';

describe('Circuit Breaker Test Suite', () => {
  beforeEach(() => {
    OptimizerClient.resetCircuitBreaker();
  });

  it('1. Circuit breaker starts in CLOSED state', () => {
    expect(OptimizerClient.getState()).toBe(CircuitState.CLOSED);
    expect(OptimizerClient.isAvailable()).toBe(true);
  });

  it('2. Repeated failures trip circuit breaker to OPEN', () => {
    expect(OptimizerClient.getState()).toBe(CircuitState.CLOSED);

    // Record 3 failures
    OptimizerClient.recordFailure();
    OptimizerClient.recordFailure();
    expect(OptimizerClient.getState()).toBe(CircuitState.CLOSED);

    OptimizerClient.recordFailure(); // 3rd failure trips the breaker
    expect(OptimizerClient.getState()).toBe(CircuitState.OPEN);
    expect(OptimizerClient.isAvailable()).toBe(false);
  });

  it('3. In OPEN state, requests reject immediately with CircuitBreakerOpenError', async () => {
    // Trip breaker
    OptimizerClient.recordFailure();
    OptimizerClient.recordFailure();
    OptimizerClient.recordFailure();
    expect(OptimizerClient.getState()).toBe(CircuitState.OPEN);

    // Call request
    await expect(OptimizerClient.request('/health')).rejects.toThrow(CircuitBreakerOpenError);
  });

  it('4. After cool-off period, circuit transitions to HALF_OPEN and recovers on success', () => {
    // Trip breaker
    OptimizerClient.recordFailure();
    OptimizerClient.recordFailure();
    OptimizerClient.recordFailure();
    expect(OptimizerClient.getState()).toBe(CircuitState.OPEN);

    // Fast-forward lastStateChange time by 11 seconds
    (OptimizerClient as any).lastStateChange = Date.now() - 11000;

    // Check transition
    expect(OptimizerClient.getState()).toBe(CircuitState.HALF_OPEN);
    expect(OptimizerClient.isAvailable()).toBe(true);

    // Successful response resets to CLOSED
    OptimizerClient.recordSuccess();
    expect(OptimizerClient.getState()).toBe(CircuitState.CLOSED);
  });
});
