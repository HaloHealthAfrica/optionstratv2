/**
 * Health Check Service
 * Provides health check endpoints for system components
 * Implements Requirement 17.4
 */

import { ContextCache } from '../cache/context-cache.ts';
import { DegradedModeTracker } from './degraded-mode-tracker.ts';

export interface HealthCheckResult {
  healthy: boolean;
  status: 'healthy' | 'degraded' | 'unhealthy';
  message: string;
  timestamp: Date;
  details?: Record<string, any>;
}

export interface SystemHealthResult extends HealthCheckResult {
  components: {
    context: HealthCheckResult;
    gex: HealthCheckResult;
    database: HealthCheckResult;
  };
}

export class HealthCheckService {
  constructor(
    private contextCache: ContextCache,
    private degradedModeTracker: DegradedModeTracker,
    private checkDatabaseConnection: () => Promise<boolean>
  ) {}

  /**
   * Check overall system health
   * Requirement: 17.4
   */
  async checkSystemHealth(): Promise<SystemHealthResult> {
    const [contextHealth, gexHealth, dbHealth] = await Promise.all([
      this.checkContextHealth(),
      this.checkGexHealth(),
      this.checkDatabaseHealth(),
    ]);

    const allHealthy = contextHealth.healthy && gexHealth.healthy && dbHealth.healthy;
    const anyUnhealthy = !contextHealth.healthy || !gexHealth.healthy || !dbHealth.healthy;

    let status: 'healthy' | 'degraded' | 'unhealthy';
    let message: string;

    if (allHealthy) {
      status = 'healthy';
      message = 'All systems operational';
    } else if (anyUnhealthy) {
      const unhealthyComponents = [];
      if (!contextHealth.healthy) unhealthyComponents.push('context');
      if (!gexHealth.healthy) unhealthyComponents.push('gex');
      if (!dbHealth.healthy) unhealthyComponents.push('database');
      
      status = 'degraded';
      message = `System degraded: ${unhealthyComponents.join(', ')} unhealthy`;
    } else {
      status = 'healthy';
      message = 'All systems operational';
    }

    return {
      healthy: allHealthy,
      status,
      message,
      timestamp: new Date(),
      components: {
        context: contextHealth,
        gex: gexHealth,
        database: dbHealth,
      },
    };
  }

  /**
   * Check Context Cache health
   * Requirement: 17.4
   */
  async checkContextHealth(): Promise<HealthCheckResult> {
    try {
      const hasFreshCache = this.contextCache.hasFreshCache();
      const cacheAge = this.contextCache.getCacheAge();
      const isHealthy = this.degradedModeTracker.isServiceHealthy('CONTEXT');

      if (!isHealthy) {
        return {
          healthy: false,
          status: 'unhealthy',
          message: 'Context service experiencing issues',
          timestamp: new Date(),
          details: {
            hasFreshCache,
            cacheAgeMs: cacheAge,
          },
        };
      }

      return {
        healthy: true,
        status: 'healthy',
        message: 'Context cache operational',
        timestamp: new Date(),
        details: {
          hasFreshCache,
          cacheAgeMs: cacheAge,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        status: 'unhealthy',
        message: `Context health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Check GEX Service health
   * Requirement: 17.4
   */
  async checkGexHealth(): Promise<HealthCheckResult> {
    try {
      const isHealthy = this.degradedModeTracker.isServiceHealthy('GEX');

      if (!isHealthy) {
        return {
          healthy: false,
          status: 'unhealthy',
          message: 'GEX service experiencing issues',
          timestamp: new Date(),
        };
      }

      return {
        healthy: true,
        status: 'healthy',
        message: 'GEX service operational',
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        healthy: false,
        status: 'unhealthy',
        message: `GEX health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Check Database health
   * Requirement: 17.4
   */
  async checkDatabaseHealth(): Promise<HealthCheckResult> {
    try {
      const isConnected = await this.checkDatabaseConnection();
      const isHealthy = this.degradedModeTracker.isServiceHealthy('DATABASE');

      if (!isConnected || !isHealthy) {
        return {
          healthy: false,
          status: 'unhealthy',
          message: 'Database connection issues',
          timestamp: new Date(),
          details: {
            connected: isConnected,
          },
        };
      }

      return {
        healthy: true,
        status: 'healthy',
        message: 'Database operational',
        timestamp: new Date(),
        details: {
          connected: true,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        status: 'unhealthy',
        message: `Database health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
      };
    }
  }
}
