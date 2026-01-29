/**
 * Unit tests for Degraded Mode Tracker
 * Tests Requirement 19.5
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DegradedModeTracker } from './degraded-mode-tracker.ts';

describe('Degraded Mode Tracker Unit Tests', () => {
  let tracker: DegradedModeTracker;

  beforeEach(() => {
    tracker = new DegradedModeTracker();
  });

  it('should initialize with all services healthy', () => {
    const status = tracker.getStatus();
    
    expect(status.degraded).toBe(false);
    expect(status.message).toBe('All services operational');
    expect(status.services).toHaveLength(3);
    
    for (const service of status.services) {
      expect(service.healthy).toBe(true);
    }
  });

  it('should record service failures and update degraded status', () => {
    // Record GEX service failure
    tracker.recordFailure('GEX', 'Connection timeout');
    
    const status = tracker.getStatus();
    
    expect(status.degraded).toBe(true);
    expect(status.message).toContain('GEX');
    expect(status.message).toContain('impaired');
    
    const gexService = status.services.find(s => s.name === 'GEX');
    expect(gexService?.healthy).toBe(false);
    expect(gexService?.lastError).toBe('Connection timeout');
    expect(gexService?.lastErrorTime).toBeInstanceOf(Date);
  });

  it('should record service success and restore healthy status', () => {
    // Record failure then success
    tracker.recordFailure('CONTEXT', 'API error');
    tracker.recordSuccess('CONTEXT');
    
    const status = tracker.getStatus();
    
    expect(status.degraded).toBe(false);
    expect(status.message).toBe('All services operational');
    
    const contextService = status.services.find(s => s.name === 'CONTEXT');
    expect(contextService?.healthy).toBe(true);
    expect(contextService?.lastError).toBeUndefined();
    expect(contextService?.lastErrorTime).toBeUndefined();
    expect(contextService?.lastSuccessTime).toBeInstanceOf(Date);
  });

  it('should track multiple service failures', () => {
    tracker.recordFailure('GEX', 'GEX error');
    tracker.recordFailure('DATABASE', 'DB error');
    
    const status = tracker.getStatus();
    
    expect(status.degraded).toBe(true);
    expect(status.message).toContain('GEX');
    expect(status.message).toContain('DATABASE');
    
    const unhealthyServices = status.services.filter(s => !s.healthy);
    expect(unhealthyServices).toHaveLength(2);
  });

  it('should check individual service health', () => {
    expect(tracker.isServiceHealthy('GEX')).toBe(true);
    
    tracker.recordFailure('GEX', 'Error');
    
    expect(tracker.isServiceHealthy('GEX')).toBe(false);
    expect(tracker.isServiceHealthy('CONTEXT')).toBe(true);
    expect(tracker.isServiceHealthy('DATABASE')).toBe(true);
  });

  it('should reset all services to healthy', () => {
    // Fail all services
    tracker.recordFailure('GEX', 'Error 1');
    tracker.recordFailure('CONTEXT', 'Error 2');
    tracker.recordFailure('DATABASE', 'Error 3');
    
    expect(tracker.getStatus().degraded).toBe(true);
    
    // Reset
    tracker.reset();
    
    const status = tracker.getStatus();
    expect(status.degraded).toBe(false);
    expect(status.message).toBe('All services operational');
    
    for (const service of status.services) {
      expect(service.healthy).toBe(true);
    }
  });

  it('should maintain separate state for each service', () => {
    tracker.recordFailure('GEX', 'GEX specific error');
    tracker.recordFailure('CONTEXT', 'Context specific error');
    
    const status = tracker.getStatus();
    
    const gexService = status.services.find(s => s.name === 'GEX');
    const contextService = status.services.find(s => s.name === 'CONTEXT');
    const dbService = status.services.find(s => s.name === 'DATABASE');
    
    expect(gexService?.lastError).toBe('GEX specific error');
    expect(contextService?.lastError).toBe('Context specific error');
    expect(dbService?.healthy).toBe(true);
    expect(dbService?.lastError).toBeUndefined();
  });

  it('should update timestamps correctly', () => {
    const beforeFailure = new Date();
    
    tracker.recordFailure('GEX', 'Error');
    
    const afterFailure = new Date();
    const status = tracker.getStatus();
    const gexService = status.services.find(s => s.name === 'GEX');
    
    expect(gexService?.lastErrorTime).toBeDefined();
    expect(gexService!.lastErrorTime!.getTime()).toBeGreaterThanOrEqual(beforeFailure.getTime());
    expect(gexService!.lastErrorTime!.getTime()).toBeLessThanOrEqual(afterFailure.getTime());
  });
});
