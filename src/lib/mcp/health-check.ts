/**
 * MCP Health Check & Circuit Breaker System
 *
 * Monitors MCP server health and implements circuit breaker pattern
 * to prevent cascading failures from repeatedly failing servers.
 */

export type ServerHealth = "healthy" | "degraded" | "unhealthy" | "circuit_open";

export interface HealthStatus {
  serverId: string;
  health: ServerHealth;
  lastCheck: Date;
  consecutiveFailures: number;
  successRate: number;
  averageLatency: number;
}

export interface CircuitBreakerConfig {
  failureThreshold: number; // Number of consecutive failures before opening circuit
  timeout: number; // Time in ms before attempting to close circuit
  successThreshold: number; // Number of successes needed to fully close circuit
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 3,
  timeout: 30000, // 30 seconds
  successThreshold: 2,
};

class CircuitBreaker {
  private state: "closed" | "open" | "half_open" = "closed";
  private consecutiveFailures = 0;
  private consecutiveSuccesses = 0;
  private lastFailureTime?: Date;
  private totalCalls = 0;
  private successfulCalls = 0;
  private latencies: number[] = [];

  constructor(
    public serverId: string,
    private config: CircuitBreakerConfig = DEFAULT_CONFIG,
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      if (this.shouldAttemptReset()) {
        this.state = "half_open";
      } else {
        throw new Error(
          `Circuit breaker open for ${this.serverId} - too many failures`,
        );
      }
    }

    const startTime = Date.now();
    this.totalCalls++;

    try {
      const result = await operation();
      const latency = Date.now() - startTime;
      this.recordSuccess(latency);
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  private recordSuccess(latency: number): void {
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses++;
    this.successfulCalls++;
    this.latencies.push(latency);

    // Keep only last 100 latencies
    if (this.latencies.length > 100) {
      this.latencies.shift();
    }

    if (this.state === "half_open" && this.consecutiveSuccesses >= this.config.successThreshold) {
      this.state = "closed";
      this.consecutiveSuccesses = 0;
    }
  }

  private recordFailure(): void {
    this.consecutiveSuccesses = 0;
    this.consecutiveFailures++;
    this.lastFailureTime = new Date();

    if (this.consecutiveFailures >= this.config.failureThreshold) {
      this.state = "open";
    }
  }

  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) return false;
    const timeSinceFailure = Date.now() - this.lastFailureTime.getTime();
    return timeSinceFailure >= this.config.timeout;
  }

  getHealth(): HealthStatus {
    const successRate = this.totalCalls > 0 ? this.successfulCalls / this.totalCalls : 1;
    const averageLatency =
      this.latencies.length > 0
        ? this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length
        : 0;

    let health: ServerHealth = "healthy";
    if (this.state === "open") {
      health = "circuit_open";
    } else if (successRate < 0.5) {
      health = "unhealthy";
    } else if (successRate < 0.8 || averageLatency > 5000) {
      health = "degraded";
    }

    return {
      serverId: this.serverId,
      health,
      lastCheck: new Date(),
      consecutiveFailures: this.consecutiveFailures,
      successRate,
      averageLatency,
    };
  }

  reset(): void {
    this.state = "closed";
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.lastFailureTime = undefined;
  }
}

/**
 * Global circuit breaker registry
 */
class CircuitBreakerRegistry {
  private breakers = new Map<string, CircuitBreaker>();

  getBreaker(serverId: string, config?: CircuitBreakerConfig): CircuitBreaker {
    if (!this.breakers.has(serverId)) {
      this.breakers.set(serverId, new CircuitBreaker(serverId, config));
    }
    return this.breakers.get(serverId)!;
  }

  getAllHealth(): HealthStatus[] {
    return Array.from(this.breakers.values()).map((b) => b.getHealth());
  }

  resetAll(): void {
    this.breakers.forEach((b) => b.reset());
  }
}

export const circuitBreakerRegistry = new CircuitBreakerRegistry();

/**
 * Execute an MCP operation with circuit breaker protection
 */
export async function withCircuitBreaker<T>(
  serverId: string,
  operation: () => Promise<T>,
  config?: CircuitBreakerConfig,
): Promise<T> {
  const breaker = circuitBreakerRegistry.getBreaker(serverId, config);
  return breaker.execute(operation);
}

/**
 * Get health status for all MCP servers
 */
export function getAllServerHealth(): HealthStatus[] {
  return circuitBreakerRegistry.getAllHealth();
}

/**
 * Reset all circuit breakers (useful for testing or manual recovery)
 */
export function resetAllCircuitBreakers(): void {
  circuitBreakerRegistry.resetAll();
}
