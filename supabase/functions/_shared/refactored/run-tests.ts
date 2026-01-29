/**
 * Simple test runner to verify refactored components
 * Run with: deno run --allow-all run-tests.ts
 */

console.log('🧪 Running Refactored Trading System Tests\n');

// Import test files
import './core/config.test.ts';
import './cache/context-cache.test.ts';
import './cache/deduplication-cache.test.ts';
import './validation/signal-validator.test.ts';

console.log('\n✅ All test files loaded successfully');
console.log('\nTo run tests with vitest:');
console.log('  deno task test');
