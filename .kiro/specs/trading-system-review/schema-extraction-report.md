# Database Schema Extraction Report

**Task:** 2.1 Extract database schema from Supabase  
**Requirements:** 3.1, 3.2, 3.3, 3.4  
**Date:** 2026-01-29  
**Status:** ✅ Complete

## Overview

Successfully extracted the complete database schema from Supabase migrations and generated TypeScript type definitions for comparison with existing application types.

## Extraction Method

1. **Source:** Parsed the latest migration file: `supabase/migrations/20260130000000_refactored_schema_alignment.sql`
2. **Parser:** Created custom SQL parser to extract:
   - Table definitions
   - Column names, types, and constraints
   - Primary keys and foreign keys
   - CHECK constraints (for enum extraction)
   - Indexes
   - Table comments
3. **Generator:** Converted SQL schema to TypeScript interfaces with proper type mappings

## Extracted Schema Summary

### Tables (7 total)

1. **refactored_signals** (9 columns, 3 indexes)
   - Purpose: Incoming trading signals from various sources
   - Primary Key: `id` (VARCHAR)
   - Foreign Keys: None
   - Key Columns: source, symbol, direction, timeframe, timestamp

2. **refactored_positions** (15 columns, 3 indexes)
   - Purpose: Open and closed trading positions
   - Primary Key: `id` (VARCHAR)
   - Foreign Keys: `signal_id` → `refactored_signals.id`
   - Key Columns: symbol, direction, quantity, entry_price, status

3. **refactored_decisions** (11 columns, 4 indexes)
   - Purpose: Audit trail of all entry and exit decisions
   - Primary Key: `id` (VARCHAR)
   - Foreign Keys: `signal_id` → `refactored_signals.id`
   - Key Columns: decision_type, decision, confidence, position_size

4. **refactored_gex_signals** (9 columns, 2 indexes)
   - Purpose: Gamma exposure signals for market analysis
   - Primary Key: `id` (VARCHAR)
   - Foreign Keys: None
   - Key Columns: symbol, timeframe, strength, direction

5. **refactored_context_snapshots** (7 columns, 1 index)
   - Purpose: Market context data snapshots
   - Primary Key: `id` (VARCHAR)
   - Foreign Keys: None
   - Key Columns: vix, trend, bias, regime

6. **refactored_pipeline_failures** (8 columns, 3 indexes)
   - Purpose: Signal processing pipeline failures
   - Primary Key: `id` (VARCHAR)
   - Foreign Keys: `signal_id` → `refactored_signals.id` (nullable)
   - Key Columns: tracking_id, stage, reason

7. **refactored_processing_errors** (6 columns, 2 indexes)
   - Purpose: System processing errors
   - Primary Key: `id` (VARCHAR, auto-generated)
   - Foreign Keys: None
   - Key Columns: correlation_id, error_message

### Enum Types (9 total)

Extracted from CHECK constraints:

1. **RefactoredSignalsDirection**: `'CALL' | 'PUT'`
2. **RefactoredPositionsDirection**: `'CALL' | 'PUT'`
3. **RefactoredPositionsStatus**: `'OPEN' | 'CLOSED'`
4. **RefactoredDecisionsDecisionType**: `'ENTRY' | 'EXIT'`
5. **RefactoredDecisionsDecision**: `'ENTER' | 'REJECT' | 'EXIT' | 'HOLD'`
6. **RefactoredGexSignalsDirection**: `'CALL' | 'PUT'`
7. **RefactoredContextSnapshotsTrend**: `'BULLISH' | 'BEARISH' | 'NEUTRAL'`
8. **RefactoredContextSnapshotsRegime**: `'LOW_VOL' | 'HIGH_VOL' | 'NORMAL'`
9. **RefactoredPipelineFailuresStage**: `'RECEPTION' | 'NORMALIZATION' | 'VALIDATION' | 'DEDUPLICATION' | 'DECISION' | 'EXECUTION'`

### Foreign Key Relationships

```
refactored_signals (id)
  ↓
  ├─ refactored_positions (signal_id)
  ├─ refactored_decisions (signal_id)
  └─ refactored_pipeline_failures (signal_id, nullable)
```

## Type Mapping

SQL Type → TypeScript Type:

- `VARCHAR(n)`, `TEXT` → `string`
- `INTEGER`, `BIGINT` → `number`
- `DECIMAL(m,n)`, `NUMERIC` → `number`
- `BOOLEAN` → `boolean`
- `TIMESTAMPTZ`, `TIMESTAMP` → `Date`
- `JSONB`, `JSON` → `Record<string, any>`
- `CHECK (col IN (...))` → Union type of literal strings

## Nullability Handling

- Columns with `NOT NULL` constraint → Non-nullable type
- Columns without `NOT NULL` → Type union with `null` (e.g., `string | null`)
- Columns with `DEFAULT` values → Still marked as nullable if no `NOT NULL`

## Key Observations

### 1. Consistent Naming Convention
- All tables use `refactored_` prefix
- Snake_case for database columns
- Converted to camelCase in TypeScript interfaces

### 2. Audit Fields
Most tables include:
- `created_at` (TIMESTAMPTZ, default NOW())
- Some include `updated_at` for tracking modifications

### 3. JSONB Usage
Several tables use JSONB for flexible data:
- `metadata` fields for extensible data
- `validation_result`, `reasoning`, `calculations` for complex structures
- `context_data`, `gex_data` for nested objects

### 4. Constraints
- CHECK constraints enforce enum values
- Foreign key constraints maintain referential integrity
- Positive value constraints on prices and quantities
- Range constraints on percentages and ratios

### 5. Indexes
Strategic indexes on:
- Lookup columns (symbol, status, source)
- Time-based queries (timestamp DESC, created_at DESC)
- Foreign keys (signal_id)
- Composite indexes for common query patterns

## Output Files

1. **extracted-database-schema.ts**
   - Complete TypeScript type definitions
   - Enum types
   - Interface definitions for all tables
   - JSDoc comments for foreign keys
   - Schema summary

2. **schema-extraction-report.md** (this file)
   - Detailed extraction report
   - Analysis and observations
   - Next steps

## Next Steps

The extracted schema will be used in **Task 2.2** to:
1. Compare with existing TypeScript type definitions in the codebase
2. Identify mismatches in:
   - Field names (snake_case vs camelCase)
   - Field types
   - Nullability
   - Enum values
3. Generate a diff report showing all discrepancies
4. Validate Requirements 3.1, 3.2, 3.3, 3.4

## Validation

✅ All 7 tables extracted successfully  
✅ All 9 enum types identified from CHECK constraints  
✅ All foreign key relationships documented  
✅ Nullability correctly inferred from constraints  
✅ Type mappings applied consistently  
✅ Output file generated successfully  

## Requirements Traceability

- **Requirement 3.1**: Database columns match type definitions - Schema extracted for comparison
- **Requirement 3.2**: Nullable fields reflected in TypeScript - Nullability captured in schema
- **Requirement 3.3**: Enum types match database constraints - 9 enum types extracted from CHECK constraints
- **Requirement 3.4**: Foreign key relationships reflected - All FK relationships documented

---

**Task Status:** Complete ✅  
**Generated Schema File:** `.kiro/specs/trading-system-review/extracted-database-schema.ts`  
**Extraction Script:** `scripts/extract-database-schema.ts`
