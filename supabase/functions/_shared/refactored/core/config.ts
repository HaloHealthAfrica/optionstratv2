/**
 * Configuration management for the refactored trading system
 */

import { Config } from './types.ts';

export const defaultConfig: Config = {
  validation: {
    cooldownSeconds: 300,
    marketHoursStart: '09:30',
    marketHoursEnd: '15:30',
    maxSignalAgeMinutes: 5,
  },
  risk: {
    maxVixForEntry: 50,
    vixPositionSizeReduction: 0.5,
    maxPositionSize: 10,
    maxTotalExposure: 50000,
  },
  sizing: {
    baseSize: 1,
    kellyFraction: 0.25,
    minSize: 1,
    maxSize: 10,
  },
  confidence: {
    baseConfidence: 50,
    contextAdjustmentRange: 20,
    positioningAdjustmentRange: 15,
    gexAdjustmentRange: 15,
  },
  cache: {
    contextTTLSeconds: 60,
    deduplicationTTLSeconds: 60,
  },
  gex: {
    maxStaleMinutes: 240,
    staleWeightReduction: 0.5,
  },
  exit: {
    profitTargetPercent: 50,
    stopLossPercent: -30,
  },
};

/**
 * Validate configuration
 * Requirements: 16.2, 16.3
 */
export function validateConfig(config: Config): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check required fields exist
  if (!config.validation) {
    errors.push('validation configuration is required');
    return { valid: false, errors };
  }
  if (!config.risk) {
    errors.push('risk configuration is required');
    return { valid: false, errors };
  }
  if (!config.sizing) {
    errors.push('sizing configuration is required');
    return { valid: false, errors };
  }
  if (!config.confidence) {
    errors.push('confidence configuration is required');
    return { valid: false, errors };
  }
  if (!config.cache) {
    errors.push('cache configuration is required');
    return { valid: false, errors };
  }
  if (!config.gex) {
    errors.push('gex configuration is required');
    return { valid: false, errors };
  }

  // Validate validation config
  if (typeof config.validation.cooldownSeconds !== 'number') {
    errors.push('validation.cooldownSeconds must be a number');
  } else if (config.validation.cooldownSeconds < 0) {
    errors.push('validation.cooldownSeconds must be non-negative');
  }
  
  if (typeof config.validation.maxSignalAgeMinutes !== 'number') {
    errors.push('validation.maxSignalAgeMinutes must be a number');
  } else if (config.validation.maxSignalAgeMinutes < 0) {
    errors.push('validation.maxSignalAgeMinutes must be non-negative');
  }
  
  if (typeof config.validation.marketHoursStart !== 'string' || !config.validation.marketHoursStart) {
    errors.push('validation.marketHoursStart must be a non-empty string');
  } else if (!/^\d{2}:\d{2}$/.test(config.validation.marketHoursStart)) {
    errors.push('validation.marketHoursStart must be in HH:MM format');
  }
  
  if (typeof config.validation.marketHoursEnd !== 'string' || !config.validation.marketHoursEnd) {
    errors.push('validation.marketHoursEnd must be a non-empty string');
  } else if (!/^\d{2}:\d{2}$/.test(config.validation.marketHoursEnd)) {
    errors.push('validation.marketHoursEnd must be in HH:MM format');
  }

  // Validate risk config
  if (typeof config.risk.maxVixForEntry !== 'number') {
    errors.push('risk.maxVixForEntry must be a number');
  } else if (config.risk.maxVixForEntry < 0) {
    errors.push('risk.maxVixForEntry must be non-negative');
  }
  
  if (typeof config.risk.vixPositionSizeReduction !== 'number') {
    errors.push('risk.vixPositionSizeReduction must be a number');
  } else if (config.risk.vixPositionSizeReduction < 0 || config.risk.vixPositionSizeReduction > 1) {
    errors.push('risk.vixPositionSizeReduction must be between 0 and 1');
  }
  
  if (typeof config.risk.maxPositionSize !== 'number') {
    errors.push('risk.maxPositionSize must be a number');
  } else if (config.risk.maxPositionSize < 1) {
    errors.push('risk.maxPositionSize must be at least 1');
  }
  
  if (typeof config.risk.maxTotalExposure !== 'number') {
    errors.push('risk.maxTotalExposure must be a number');
  } else if (config.risk.maxTotalExposure < 0) {
    errors.push('risk.maxTotalExposure must be non-negative');
  }

  // Validate sizing config
  if (typeof config.sizing.baseSize !== 'number') {
    errors.push('sizing.baseSize must be a number');
  } else if (config.sizing.baseSize < 0) {
    errors.push('sizing.baseSize must be non-negative');
  }
  
  if (typeof config.sizing.kellyFraction !== 'number') {
    errors.push('sizing.kellyFraction must be a number');
  } else if (config.sizing.kellyFraction < 0 || config.sizing.kellyFraction > 1) {
    errors.push('sizing.kellyFraction must be between 0 and 1');
  }
  
  if (typeof config.sizing.minSize !== 'number') {
    errors.push('sizing.minSize must be a number');
  } else if (config.sizing.minSize < 0) {
    errors.push('sizing.minSize must be non-negative');
  }
  
  if (typeof config.sizing.maxSize !== 'number') {
    errors.push('sizing.maxSize must be a number');
  } else if (config.sizing.maxSize < config.sizing.minSize) {
    errors.push('sizing.maxSize must be greater than or equal to minSize');
  }

  // Validate confidence config
  if (typeof config.confidence.baseConfidence !== 'number') {
    errors.push('confidence.baseConfidence must be a number');
  } else if (config.confidence.baseConfidence < 0 || config.confidence.baseConfidence > 100) {
    errors.push('confidence.baseConfidence must be between 0 and 100');
  }
  
  if (typeof config.confidence.contextAdjustmentRange !== 'number') {
    errors.push('confidence.contextAdjustmentRange must be a number');
  }
  
  if (typeof config.confidence.positioningAdjustmentRange !== 'number') {
    errors.push('confidence.positioningAdjustmentRange must be a number');
  }
  
  if (typeof config.confidence.gexAdjustmentRange !== 'number') {
    errors.push('confidence.gexAdjustmentRange must be a number');
  }

  // Validate cache config
  if (typeof config.cache.contextTTLSeconds !== 'number') {
    errors.push('cache.contextTTLSeconds must be a number');
  } else if (config.cache.contextTTLSeconds < 0) {
    errors.push('cache.contextTTLSeconds must be non-negative');
  }
  
  if (typeof config.cache.deduplicationTTLSeconds !== 'number') {
    errors.push('cache.deduplicationTTLSeconds must be a number');
  } else if (config.cache.deduplicationTTLSeconds < 0) {
    errors.push('cache.deduplicationTTLSeconds must be non-negative');
  }

  // Validate GEX config
  if (typeof config.gex.maxStaleMinutes !== 'number') {
    errors.push('gex.maxStaleMinutes must be a number');
  } else if (config.gex.maxStaleMinutes < 0) {
    errors.push('gex.maxStaleMinutes must be non-negative');
  }
  
  if (typeof config.gex.staleWeightReduction !== 'number') {
    errors.push('gex.staleWeightReduction must be a number');
  } else if (config.gex.staleWeightReduction < 0 || config.gex.staleWeightReduction > 1) {
    errors.push('gex.staleWeightReduction must be between 0 and 1');
  }
  
  // Validate exit config (optional)
  if (config.exit) {
    if (typeof config.exit.profitTargetPercent !== 'number') {
      errors.push('exit.profitTargetPercent must be a number');
    }
    if (typeof config.exit.stopLossPercent !== 'number') {
      errors.push('exit.stopLossPercent must be a number');
    } else if (config.exit.stopLossPercent > 0) {
      errors.push('exit.stopLossPercent must be negative or zero');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Configuration validation error
 * Requirement: 16.3
 */
export class ConfigValidationError extends Error {
  constructor(
    message: string,
    public errors: string[]
  ) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}

/**
 * Load configuration based on environment
 * Requirement: 16.4, 16.5
 */
export function loadConfig(environment?: string): Config {
  const env = environment || Deno.env.get('NODE_ENV') || 'development';
  
  console.log(`[Config] Loading configuration for environment: ${env}`);
  
  // Start with default config
  let config = { ...defaultConfig };
  
  // Load environment-specific overrides
  if (env === 'production') {
    config = loadProductionConfig(config);
  } else if (env === 'staging') {
    config = loadStagingConfig(config);
  } else {
    config = loadDevelopmentConfig(config);
  }
  
  // Apply environment variable overrides
  config = applyEnvironmentVariables(config);
  
  // Validate configuration (Requirement 16.2)
  const validation = validateConfig(config);
  if (!validation.valid) {
    // Fail startup on invalid configuration (Requirement 16.3)
    throw new ConfigValidationError(
      `Invalid configuration for environment '${env}': ${validation.errors.join(', ')}`,
      validation.errors
    );
  }
  
  // Log active configuration (Requirement 16.5)
  console.log('[Config] Active configuration:', JSON.stringify(config, null, 2));
  
  return config;
}

/**
 * Load production configuration overrides
 */
function loadProductionConfig(baseConfig: Config): Config {
  return {
    ...baseConfig,
    validation: {
      ...baseConfig.validation,
      cooldownSeconds: 180, // 3 minutes in production
    },
    risk: {
      ...baseConfig.risk,
      maxVixForEntry: 40, // More conservative in production
      maxPositionSize: 5, // Smaller positions in production
    },
    cache: {
      ...baseConfig.cache,
      contextTTLSeconds: 30, // Shorter TTL in production for fresher data
    },
  };
}

/**
 * Load staging configuration overrides
 */
function loadStagingConfig(baseConfig: Config): Config {
  return {
    ...baseConfig,
    validation: {
      ...baseConfig.validation,
      cooldownSeconds: 120, // 2 minutes in staging
    },
    risk: {
      ...baseConfig.risk,
      maxPositionSize: 3, // Small positions in staging
    },
  };
}

/**
 * Load development configuration overrides
 */
function loadDevelopmentConfig(baseConfig: Config): Config {
  return {
    ...baseConfig,
    validation: {
      ...baseConfig.validation,
      cooldownSeconds: 60, // 1 minute in development for faster testing
    },
    risk: {
      ...baseConfig.risk,
      maxPositionSize: 10, // Allow larger positions in development
    },
  };
}

/**
 * Apply environment variable overrides
 */
function applyEnvironmentVariables(config: Config): Config {
  const result = { ...config };
  
  // Validation overrides
  const cooldownSeconds = Deno.env.get('COOLDOWN_SECONDS');
  if (cooldownSeconds) {
    result.validation.cooldownSeconds = parseInt(cooldownSeconds, 10);
  }
  
  const maxSignalAge = Deno.env.get('MAX_SIGNAL_AGE_MINUTES');
  if (maxSignalAge) {
    result.validation.maxSignalAgeMinutes = parseInt(maxSignalAge, 10);
  }
  
  // Risk overrides
  const maxVix = Deno.env.get('MAX_VIX_FOR_ENTRY');
  if (maxVix) {
    result.risk.maxVixForEntry = parseFloat(maxVix);
  }
  
  const maxPositionSize = Deno.env.get('MAX_POSITION_SIZE');
  if (maxPositionSize) {
    result.risk.maxPositionSize = parseInt(maxPositionSize, 10);
  }
  
  const maxExposure = Deno.env.get('MAX_TOTAL_EXPOSURE');
  if (maxExposure) {
    result.risk.maxTotalExposure = parseFloat(maxExposure);
  }
  
  // Sizing overrides
  const baseSize = Deno.env.get('BASE_SIZE');
  if (baseSize) {
    result.sizing.baseSize = parseInt(baseSize, 10);
  }
  
  const kellyFraction = Deno.env.get('KELLY_FRACTION');
  if (kellyFraction) {
    result.sizing.kellyFraction = parseFloat(kellyFraction);
  }
  
  // Cache overrides
  const contextTTL = Deno.env.get('CONTEXT_TTL_SECONDS');
  if (contextTTL) {
    result.cache.contextTTLSeconds = parseInt(contextTTL, 10);
  }
  
  return result;
}

/**
 * Get configuration summary for logging
 */
export function getConfigSummary(config: Config): Record<string, any> {
  return {
    validation: {
      cooldownSeconds: config.validation.cooldownSeconds,
      marketHours: `${config.validation.marketHoursStart} - ${config.validation.marketHoursEnd}`,
      maxSignalAgeMinutes: config.validation.maxSignalAgeMinutes,
    },
    risk: {
      maxVixForEntry: config.risk.maxVixForEntry,
      maxPositionSize: config.risk.maxPositionSize,
      maxTotalExposure: config.risk.maxTotalExposure,
    },
    sizing: {
      baseSize: config.sizing.baseSize,
      range: `${config.sizing.minSize} - ${config.sizing.maxSize}`,
    },
    cache: {
      contextTTL: `${config.cache.contextTTLSeconds}s`,
      deduplicationTTL: `${config.cache.deduplicationTTLSeconds}s`,
    },
  };
}
