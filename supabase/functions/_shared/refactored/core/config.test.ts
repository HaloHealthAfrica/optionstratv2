/**
 * Tests for Configuration Management
 * Tests Property 31 and configuration validation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import {
  defaultConfig,
  validateConfig,
  loadConfig,
  ConfigValidationError,
  getConfigSummary,
} from './config.ts';
import { Config } from './types.ts';

describe('Configuration Management Property Tests', () => {
  /**
   * Property 31: Invalid Configuration Startup Failure
   * For any invalid configuration (missing required fields, out-of-range values, type mismatches),
   * the System SHALL fail to start and return a clear error message indicating which configuration value is invalid.
   * Validates: Requirements 16.3
   */
  it('Property 31: Invalid configuration causes startup failure with clear error', () => {
    fc.assert(
      fc.property(
        fc.record({
          invalidField: fc.constantFrom(
            'cooldownSeconds',
            'maxVixForEntry',
            'maxPositionSize',
            'kellyFraction',
            'baseConfidence',
            'contextTTLSeconds'
          ),
          invalidValue: fc.oneof(
            fc.constant(-1), // Negative value
            fc.constant(999), // Out of range
            fc.constant('invalid'), // Wrong type
            fc.constant(null), // Null
            fc.constant(undefined) // Undefined
          ),
        }),
        (data) => {
          // Create invalid config
          const invalidConfig = JSON.parse(JSON.stringify(defaultConfig));
          
          // Apply invalid value to specific field
          switch (data.invalidField) {
            case 'cooldownSeconds':
              invalidConfig.validation.cooldownSeconds = data.invalidValue;
              break;
            case 'maxVixForEntry':
              invalidConfig.risk.maxVixForEntry = data.invalidValue;
              break;
            case 'maxPositionSize':
              invalidConfig.risk.maxPositionSize = data.invalidValue;
              break;
            case 'kellyFraction':
              invalidConfig.sizing.kellyFraction = data.invalidValue;
              break;
            case 'baseConfidence':
              invalidConfig.confidence.baseConfidence = data.invalidValue;
              break;
            case 'contextTTLSeconds':
              invalidConfig.cache.contextTTLSeconds = data.invalidValue;
              break;
          }
          
          // Validation should fail
          const result = validateConfig(invalidConfig);
          
          // Must indicate failure
          expect(result.valid).toBe(false);
          
          // Must have error messages
          expect(result.errors).toBeDefined();
          expect(result.errors.length).toBeGreaterThan(0);
          
          // Error message should mention the invalid field
          const errorText = result.errors.join(' ');
          expect(errorText.toLowerCase()).toContain(data.invalidField.toLowerCase().replace('seconds', '').replace('percent', ''));
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 31: Missing required sections cause startup failure', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('validation', 'risk', 'sizing', 'confidence', 'cache', 'gex'),
        (missingSection) => {
          // Create config with missing section
          const invalidConfig: any = { ...defaultConfig };
          delete invalidConfig[missingSection];
          
          // Validation should fail
          const result = validateConfig(invalidConfig);
          
          // Must indicate failure
          expect(result.valid).toBe(false);
          
          // Must have error about missing section
          expect(result.errors.length).toBeGreaterThan(0);
          expect(result.errors[0]).toContain(missingSection);
          expect(result.errors[0]).toContain('required');
        }
      ),
      { numRuns: 10 }
    );
  });
});

describe('Configuration Management Unit Tests', () => {
  beforeEach(() => {
    // Mock Deno.env for testing
    vi.stubGlobal('Deno', {
      env: {
        get: (key: string) => {
          if (key === 'NODE_ENV') return 'test';
          return undefined;
        },
      },
    });
  });

  it('should validate default configuration successfully', () => {
    const result = validateConfig(defaultConfig);
    
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('should reject negative cooldown seconds', () => {
    const invalidConfig = {
      ...defaultConfig,
      validation: {
        ...defaultConfig.validation,
        cooldownSeconds: -10,
      },
    };
    
    const result = validateConfig(invalidConfig);
    
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('validation.cooldownSeconds must be non-negative');
  });

  it('should reject VIX reduction outside 0-1 range', () => {
    const invalidConfig = {
      ...defaultConfig,
      risk: {
        ...defaultConfig.risk,
        vixPositionSizeReduction: 1.5,
      },
    };
    
    const result = validateConfig(invalidConfig);
    
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('vixPositionSizeReduction'))).toBe(true);
  });

  it('should reject Kelly fraction outside 0-1 range', () => {
    const invalidConfig = {
      ...defaultConfig,
      sizing: {
        ...defaultConfig.sizing,
        kellyFraction: 2.0,
      },
    };
    
    const result = validateConfig(invalidConfig);
    
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('kellyFraction'))).toBe(true);
  });

  it('should reject base confidence outside 0-100 range', () => {
    const invalidConfig = {
      ...defaultConfig,
      confidence: {
        ...defaultConfig.confidence,
        baseConfidence: 150,
      },
    };
    
    const result = validateConfig(invalidConfig);
    
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('baseConfidence'))).toBe(true);
  });

  it('should reject maxSize less than minSize', () => {
    const invalidConfig = {
      ...defaultConfig,
      sizing: {
        ...defaultConfig.sizing,
        minSize: 5,
        maxSize: 3,
      },
    };
    
    const result = validateConfig(invalidConfig);
    
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('maxSize'))).toBe(true);
  });

  it('should reject invalid market hours format', () => {
    const invalidConfig = {
      ...defaultConfig,
      validation: {
        ...defaultConfig.validation,
        marketHoursStart: '9:30', // Missing leading zero
      },
    };
    
    const result = validateConfig(invalidConfig);
    
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('marketHoursStart'))).toBe(true);
  });

  it('should reject positive stop loss percent', () => {
    const invalidConfig = {
      ...defaultConfig,
      exit: {
        profitTargetPercent: 50,
        stopLossPercent: 30, // Should be negative
      },
    };
    
    const result = validateConfig(invalidConfig);
    
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('stopLossPercent'))).toBe(true);
  });

  it('should throw ConfigValidationError on loadConfig with invalid config', () => {
    // Mock environment to return invalid config
    vi.stubGlobal('Deno', {
      env: {
        get: (key: string) => {
          if (key === 'NODE_ENV') return 'test';
          if (key === 'MAX_POSITION_SIZE') return '-5'; // Invalid
          return undefined;
        },
      },
    });

    expect(() => loadConfig('test')).toThrow(ConfigValidationError);
  });

  it('should load development config correctly', () => {
    vi.stubGlobal('Deno', {
      env: {
        get: (key: string) => {
          if (key === 'NODE_ENV') return 'development';
          return undefined;
        },
      },
    });

    const config = loadConfig('development');
    
    expect(config).toBeDefined();
    expect(config.validation.cooldownSeconds).toBe(60); // Development override
  });

  it('should load production config correctly', () => {
    vi.stubGlobal('Deno', {
      env: {
        get: (key: string) => {
          if (key === 'NODE_ENV') return 'production';
          return undefined;
        },
      },
    });

    const config = loadConfig('production');
    
    expect(config).toBeDefined();
    expect(config.validation.cooldownSeconds).toBe(180); // Production override
    expect(config.risk.maxPositionSize).toBe(5); // More conservative
  });

  it('should load staging config correctly', () => {
    vi.stubGlobal('Deno', {
      env: {
        get: (key: string) => {
          if (key === 'NODE_ENV') return 'staging';
          return undefined;
        },
      },
    });

    const config = loadConfig('staging');
    
    expect(config).toBeDefined();
    expect(config.validation.cooldownSeconds).toBe(120); // Staging override
  });

  it('should apply environment variable overrides', () => {
    vi.stubGlobal('Deno', {
      env: {
        get: (key: string) => {
          if (key === 'NODE_ENV') return 'test';
          if (key === 'COOLDOWN_SECONDS') return '90';
          if (key === 'MAX_POSITION_SIZE') return '7';
          if (key === 'BASE_SIZE') return '2';
          return undefined;
        },
      },
    });

    const config = loadConfig('test');
    
    expect(config.validation.cooldownSeconds).toBe(90);
    expect(config.risk.maxPositionSize).toBe(7);
    expect(config.sizing.baseSize).toBe(2);
  });

  it('should generate config summary', () => {
    const summary = getConfigSummary(defaultConfig);
    
    expect(summary).toBeDefined();
    expect(summary.validation).toBeDefined();
    expect(summary.risk).toBeDefined();
    expect(summary.sizing).toBeDefined();
    expect(summary.cache).toBeDefined();
    expect(summary.validation.marketHours).toContain('09:30');
  });

  it('should validate all required fields exist', () => {
    const incompleteConfig: any = {
      validation: defaultConfig.validation,
      // Missing other required sections
    };
    
    const result = validateConfig(incompleteConfig);
    
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should validate type correctness', () => {
    const invalidConfig: any = {
      ...defaultConfig,
      validation: {
        ...defaultConfig.validation,
        cooldownSeconds: 'not a number', // Wrong type
      },
    };
    
    const result = validateConfig(invalidConfig);
    
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('must be a number'))).toBe(true);
  });
});
