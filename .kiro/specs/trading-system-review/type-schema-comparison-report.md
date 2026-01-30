# Type-Schema Comparison Report

**Generated:** 2026-01-29T23:20:18.492Z

**Task:** 2.2 Compare TypeScript types with database schema
**Requirements:** 3.1, 3.2

## Executive Summary

- **Total Tables Analyzed:** 4
- **Tables with Issues:** 4
- **Total Mismatches:** 18
- **Critical Issues (Missing in TS):** 13

⚠️ **Issues found - see details below**

## Detailed Comparison

### Signals

- **Database Table:** `refactored_signals`
- **TypeScript Type:** `Signal`
- **Entity Type:** `SignalEntity`

**Summary:**
- Total Fields: 9
- Matching: 5
- Mismatched: 4
- Missing in TypeScript: 2
- Missing in Database: 0

**Issues:**

| Field | Database Type | DB Nullable | TypeScript Type | TS Nullable | Match | Issue |
|-------|---------------|-------------|-----------------|-------------|-------|-------|
| id | string | Yes | string | No | ❌ | Type mismatch: nullability differs |
| metadata | Record<string, any> | Yes | Record<string, any> | No | ❌ | Type mismatch: nullability differs |
| validationResult | Record<string, any> | Yes | N/A | No | ❌ | Field exists in database but not in TypeScript type |
| createdAt | Date | Yes | N/A | No | ❌ | Field exists in database but not in TypeScript type |

### Positions

- **Database Table:** `refactored_positions`
- **TypeScript Type:** `Position`
- **Entity Type:** `PositionEntity`

**Summary:**
- Total Fields: 16
- Matching: 8
- Mismatched: 8
- Missing in TypeScript: 6
- Missing in Database: 1

**Issues:**

| Field | Database Type | DB Nullable | TypeScript Type | TS Nullable | Match | Issue |
|-------|---------------|-------------|-----------------|-------------|-------|-------|
| id | string | Yes | string | No | ❌ | Type mismatch: nullability differs |
| unrealizedPnl | number | Yes | N/A | No | ❌ | Field exists in database but not in TypeScript type |
| exitPrice | number | Yes | N/A | No | ❌ | Field exists in database but not in TypeScript type |
| exitTime | Date | Yes | N/A | No | ❌ | Field exists in database but not in TypeScript type |
| realizedPnl | number | Yes | N/A | No | ❌ | Field exists in database but not in TypeScript type |
| createdAt | Date | Yes | N/A | No | ❌ | Field exists in database but not in TypeScript type |
| updatedAt | Date | Yes | N/A | No | ❌ | Field exists in database but not in TypeScript type |
| unrealizedPnL | N/A | No | number | Yes | ❌ | Field exists in TypeScript but not in database schema |

### ContextSnapshots

- **Database Table:** `refactored_context_snapshots`
- **TypeScript Type:** `ContextData`
- **Entity Type:** `ContextSnapshotEntity`

**Summary:**
- Total Fields: 7
- Matching: 5
- Mismatched: 2
- Missing in TypeScript: 2
- Missing in Database: 0

**Issues:**

| Field | Database Type | DB Nullable | TypeScript Type | TS Nullable | Match | Issue |
|-------|---------------|-------------|-----------------|-------------|-------|-------|
| id | string | Yes | N/A | No | ❌ | Field exists in database but not in TypeScript type |
| createdAt | Date | Yes | N/A | No | ❌ | Field exists in database but not in TypeScript type |

### GEXSignals

- **Database Table:** `refactored_gex_signals`
- **TypeScript Type:** `GEXSignal`
- **Entity Type:** `GEXSignalEntity`

**Summary:**
- Total Fields: 9
- Matching: 5
- Mismatched: 4
- Missing in TypeScript: 3
- Missing in Database: 0

**Issues:**

| Field | Database Type | DB Nullable | TypeScript Type | TS Nullable | Match | Issue |
|-------|---------------|-------------|-----------------|-------------|-------|-------|
| id | string | Yes | N/A | No | ❌ | Field exists in database but not in TypeScript type |
| age | number | Yes | number | No | ❌ | Type mismatch: nullability differs |
| metadata | Record<string, any> | Yes | N/A | No | ❌ | Field exists in database but not in TypeScript type |
| createdAt | Date | Yes | N/A | No | ❌ | Field exists in database but not in TypeScript type |

## Analysis

### Architecture Pattern

The codebase uses a **three-layer type system**:

1. **Database Schema Types** (`extracted-database-schema.ts`): Direct representation of database tables with snake_case naming
2. **Entity Types** (`database/entity-validation.ts`): Bridge layer that maps database rows to application types with snake_case field names
3. **Application Types** (`core/types.ts`): Clean domain types with camelCase naming used throughout the application

This architecture provides:
- **Type safety** at the database boundary through entity validation
- **Clean domain models** for business logic
- **Explicit null handling** to prevent runtime errors

### Key Findings

#### Critical Issues

The following fields exist in the database but are missing from application types:

**Signals:**
- `validationResult` (Record<string, any>, nullable)
- `createdAt` (Date, nullable)

**Positions:**
- `unrealizedPnl` (number, nullable)
- `exitPrice` (number, nullable)
- `exitTime` (Date, nullable)
- `realizedPnl` (number, nullable)
- `createdAt` (Date, nullable)
- `updatedAt` (Date, nullable)

**ContextSnapshots:**
- `id` (string, nullable)
- `createdAt` (Date, nullable)

**GEXSignals:**
- `id` (string, nullable)
- `metadata` (Record<string, any>, nullable)
- `createdAt` (Date, nullable)

**Impact:** These fields are stored in the database but not accessible in the application. This could lead to:
- Data loss if these fields contain important information
- Incomplete data models
- Potential runtime errors if code tries to access these fields

#### Type Mismatches

The following fields have type or nullability differences:

**Signals:**
- `id`: Type mismatch: nullability differs
  - Database: string (nullable)
  - TypeScript: string (required)
- `metadata`: Type mismatch: nullability differs
  - Database: Record<string, any> (nullable)
  - TypeScript: Record<string, any> (required)

**Positions:**
- `id`: Type mismatch: nullability differs
  - Database: string (nullable)
  - TypeScript: string (required)

**GEXSignals:**
- `age`: Type mismatch: nullability differs
  - Database: number (nullable)
  - TypeScript: number (required)

**Impact:** Type mismatches can cause:
- Runtime type errors
- Null pointer exceptions
- Data validation failures

### Positive Findings

1. **Entity Validation Layer**: The `entity-validation.ts` module provides runtime validation that catches schema mismatches
2. **Explicit Null Handling**: Entity types explicitly handle null values from the database
3. **Type Transformation**: The validation layer transforms snake_case database fields to camelCase application fields
4. **Error Reporting**: `SchemaValidationError` provides detailed error messages for debugging

## Recommendations

### Immediate Actions

1. **Add Missing Fields to Application Types**
   - Review each missing field to determine if it should be included in application types
   - Add fields that are needed for business logic
   - Document why fields are excluded if they are intentionally omitted

2. **Resolve Type Mismatches**
   - For nullability differences: Update TypeScript types to match database nullability
   - For type differences: Verify which type is correct and update accordingly
   - Add runtime validation to catch type mismatches early

3. **Verify Entity Validation**
   - Ensure entity validation functions handle all database fields
   - Add tests for entity validation with various input scenarios
   - Verify null handling matches database schema

### Long-term Improvements

1. **Automated Schema Sync**
   - Generate TypeScript types from database schema automatically
   - Use Supabase CLI to generate types: `supabase gen types typescript`
   - Add CI check to detect schema drift

2. **Property-Based Testing**
   - Write property tests to verify type-schema alignment (Task 2.3)
   - Test entity validation with random database rows
   - Verify all database fields are handled correctly

3. **Documentation**
   - Document the three-layer type system architecture
   - Explain when to use each type layer
   - Provide examples of proper type usage

## Next Steps

1. Review this report with the team
2. Prioritize and fix critical issues
3. Update TypeScript types to match database schema
4. Add missing fields to application types where needed
5. Proceed to Task 2.3: Write property test for type-schema alignment
6. Continue with Task 2.4: Verify enum consistency

