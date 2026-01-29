/**
 * Unit tests for Health Check Service
 * Tests Requirement 17.4
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HealthCheckService } from './health-check-service.ts';
import { ContextCache } from '../cache/context-cache.ts';
import { DegradedModeTracker } from './degraded-mode-tracker.ts';
import { defaultConfig } from '../core/config.ts';

describe('Health Check Service Unit Tests', () => {
  let healthCheckService: HealthCheckService;
  let mockContextCache: ContextCache;
  let degradedModeTracker: DegradedModeTracker;
  let mockCheckDb: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Create mock context cache
    const mockFetch = vi.fn();
    mockContextCache = new ContextCache(defaultConfig, mockFetch);
    
    // Create degraded mode tracker
    degradedModeTracker = new DegradedModeTracker();
    
    // Create mock database check
    mockCheckDb = vi.fn().mockResolvedValue(true);
    
    // Create health check service
    healthCheckService = new HealthCheckService(
      mockContextCache,
      degradedModeTracker,
      mockCheckDb
    );
  });

  it('should return healthy status when all components are healthy', async () => {
    const result = await healthCheckService.checkSystemHealth();
    
    expect(result.healthy).toBe(true);
    expect(result.status).toBe('healthy');
    expect(result.message).toBe('All systems operational');
    expect(result.components.context.healthy).toBe(true);
    expect(result.components.gex.healthy).toBe(true);
    expect(result.components.database.healthy).toBe(true);
  });

  it('should return degraded status when context service is unhealthy', async () => {
    degradedModeTracker.recordFailure('CONTEXT', 'API timeout');
    
    const result = await healthCheckService.checkSystemHealth();
    
    expect(result.healthy).toBe(false);
    expect(result.status).toBe('degraded');
    expect(result.message).toContain('context');
    expect(result.components.context.healthy).toBe(false);
  });

  it('should return degraded status when GEX service is unhealthy', async () => {
    degradedModeTracker.recordFailure('GEX', 'Connection error');
    
    const result = await healthCheckService.checkSystemHealth();
    
    expect(result.healthy).toBe(false);
    expect(result.status).toBe('degraded');
    expect(result.message).toContain('gex');
    expect(result.components.gex.healthy).toBe(false);
  });

  it('should return degraded status when database is unhealthy', async () => {
    mockCheckDb.mockResolvedValue(false);
    
    const result = await healthCheckService.checkSystemHealth();
    
    expect(result.healthy).toBe(false);
    expect(result.status).toBe('degraded');
    expect(result.message).toContain('database');
    expect(result.components.database.healthy).toBe(false);
  });

  it('should return degraded status when multiple services are unhealthy', async () => {
    degradedModeTracker.recordFailure('CONTEXT', 'Error 1');
    degradedModeTracker.recordFailure('GEX', 'Error 2');
    
    const result = await healthCheckService.checkSystemHealth();
    
    expect(result.healthy).toBe(false);
    expect(result.status).toBe('degraded');
    expect(result.message).toContain('context');
    expect(result.message).toContain('gex');
  });

  it('should check context health with cache details', async () => {
    const result = await healthCheckService.checkContextHealth();
    
    expect(result.healthy).toBe(true);
    expect(result.status).toBe('healthy');
    expect(result.message).toContain('Context cache operational');
    expect(result.details).toBeDefined();
    expect(result.details?.hasFreshCache).toBeDefined();
  });

  it('should check GEX health', async () => {
    const result = await healthCheckService.checkGexHealth();
    
    expect(result.healthy).toBe(true);
    expect(result.status).toBe('healthy');
    expect(result.message).toContain('GEX service operational');
  });

  it('should check database health with connection status', async () => {
    const result = await healthCheckService.checkDatabaseHealth();
    
    expect(result.healthy).toBe(true);
    expect(result.status).toBe('healthy');
    expect(result.message).toContain('Database operational');
    expect(result.details?.connected).toBe(true);
  });

  it('should handle database connection check errors', async () => {
    mockCheckDb.mockRejectedValue(new Error('Connection timeout'));
    
    const result = await healthCheckService.checkDatabaseHealth();
    
    expect(result.healthy).toBe(false);
    expect(result.status).toBe('unhealthy');
    expect(result.message).toContain('failed');
  });

  it('should include timestamps in health check results', async () => {
    const before = new Date();
    const result = await healthCheckService.checkSystemHealth();
    const after = new Date();
    
    expect(result.timestamp).toBeInstanceOf(Date);
    expect(result.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(result.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('should check all components independently', async () => {
    // Make only GEX unhealthy
    degradedModeTracker.recordFailure('GEX', 'Error');
    
    const contextResult = await healthCheckService.checkContextHealth();
    const gexResult = await healthCheckService.checkGexHealth();
    const dbResult = await healthCheckService.checkDatabaseHealth();
    
    expect(contextResult.healthy).toBe(true);
    expect(gexResult.healthy).toBe(false);
    expect(dbResult.healthy).toBe(true);
  });
});
