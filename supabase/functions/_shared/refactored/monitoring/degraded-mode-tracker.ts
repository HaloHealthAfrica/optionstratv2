/**
 * Degraded Mode Tracker
 * Tracks which services are impaired and exposes degraded mode status
 * Implements Requirement 19.5
 */

export type ServiceName = 'GEX' | 'CONTEXT' | 'DATABASE';

export interface ServiceStatus {
  name: ServiceName;
  healthy: boolean;
  lastError?: string;
  lastErrorTime?: Date;
  lastSuccessTime?: Date;
}

export interface DegradedModeStatus {
  degraded: boolean;
  services: ServiceStatus[];
  message: string;
}

export class DegradedModeTracker {
  private serviceStatuses: Map<ServiceName, ServiceStatus> = new Map();

  constructor() {
    // Initialize all services as healthy
    this.serviceStatuses.set('GEX', {
      name: 'GEX',
      healthy: true,
    });
    this.serviceStatuses.set('CONTEXT', {
      name: 'CONTEXT',
      healthy: true,
    });
    this.serviceStatuses.set('DATABASE', {
      name: 'DATABASE',
      healthy: true,
    });
  }

  /**
   * Record a service failure
   */
  recordFailure(service: ServiceName, error: string): void {
    const status = this.serviceStatuses.get(service);
    if (status) {
      status.healthy = false;
      status.lastError = error;
      status.lastErrorTime = new Date();
      this.serviceStatuses.set(service, status);
    }
  }

  /**
   * Record a service success
   */
  recordSuccess(service: ServiceName): void {
    const status = this.serviceStatuses.get(service);
    if (status) {
      status.healthy = true;
      status.lastSuccessTime = new Date();
      status.lastError = undefined;
      status.lastErrorTime = undefined;
      this.serviceStatuses.set(service, status);
    }
  }

  /**
   * Get current degraded mode status
   */
  getStatus(): DegradedModeStatus {
    const services = Array.from(this.serviceStatuses.values());
    const unhealthyServices = services.filter(s => !s.healthy);
    const degraded = unhealthyServices.length > 0;

    let message = 'All services operational';
    if (degraded) {
      const serviceNames = unhealthyServices.map(s => s.name).join(', ');
      message = `System degraded: ${serviceNames} service(s) impaired`;
    }

    return {
      degraded,
      services,
      message,
    };
  }

  /**
   * Check if a specific service is healthy
   */
  isServiceHealthy(service: ServiceName): boolean {
    const status = this.serviceStatuses.get(service);
    return status?.healthy ?? false;
  }

  /**
   * Reset all services to healthy (for testing)
   */
  reset(): void {
    for (const service of this.serviceStatuses.keys()) {
      this.recordSuccess(service);
    }
  }
}
