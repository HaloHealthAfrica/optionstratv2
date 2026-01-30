/**
 * Type-Schema Comparison Tool
 * 
 * Task: 2.2 Compare TypeScript types with database schema
 * Requirements: 3.1, 3.2
 * 
 * This script compares TypeScript type definitions with the database schema
 * and generates a detailed diff report showing mismatches.
 */

import type {
  RefactoredSignals,
  RefactoredPositions,
  RefactoredDecisions,
  RefactoredGexSignals,
  RefactoredContextSnapshots,
  RefactoredPipelineFailures,
  RefactoredProcessingErrors,
} from './extracted-database-schema.ts';

// Import application types
type Signal = {
  id: string;
  source: string;
  symbol: string;
  direction: 'CALL' | 'PUT';
  timeframe: string;
  timestamp: Date;
  metadata: Record<string, any>;
};

type Position = {
  id: string;
  signalId: string;
  symbol: string;
  direction: 'CALL' | 'PUT';
  quantity: number;
  entryPrice: number;
  entryTime: Date;
  currentPrice?: number;
  unrealizedPnL?: number;
  status: 'OPEN' | 'CLOSED';
};

type ContextData = {
  vix: number;
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  bias: number;
  regime: 'LOW_VOL' | 'HIGH_VOL' | 'NORMAL';
  timestamp: Date;
};

type GEXSignal = {
  symbol: string;
  timeframe: string;
  strength: number;
  direction: 'CALL' | 'PUT';
  timestamp: Date;
  age: number;
};

// Database entity types (from entity-validation.ts)
type SignalEntity = {
  id: string;
  source: string;
  symbol: string;
  direction: string;
  timeframe: string;
  timestamp: string | Date;
  metadata: Record<string, any> | null;
  validation_result: Record<string, any> | null;
  created_at: string | Date;
};

type PositionEntity = {
  id: string;
  signal_id: string;
  symbol: string;
  direction: string;
  quantity: number;
  entry_price: number;
  entry_time: string | Date;
  current_price: number | null;
  unrealized_pnl: number | null;
  exit_price: number | null;
  exit_time: string | Date | null;
  realized_pnl: number | null;
  status: string;
  created_at: string | Date;
  updated_at: string | Date;
};

type GEXSignalEntity = {
  id: string;
  symbol: string;
  timeframe: string;
  strength: number;
  direction: string;
  timestamp: string | Date;
  age: number | null;
  metadata: Record<string, any> | null;
  created_at: string | Date;
};

type ContextSnapshotEntity = {
  id: string;
  vix: number;
  trend: string;
  bias: number;
  regime: string;
  timestamp: string | Date;
  created_at: string | Date;
};

// ============================================================================
// COMPARISON TYPES
// ============================================================================

interface FieldComparison {
  field: string;
  dbType: string;
  dbNullable: boolean;
  tsType: string;
  tsNullable: boolean;
  match: boolean;
  issue?: string;
}

interface TableComparison {
  tableName: string;
  dbTableName: string;
  tsTypeName: string;
  entityTypeName: string;
  fields: FieldComparison[];
  missingInTS: string[];
  missingInDB: string[];
  summary: {
    totalFields: number;
    matchingFields: number;
    mismatchedFields: number;
    missingInTS: number;
    missingInDB: number;
  };
}

interface ComparisonReport {
  timestamp: string;
  tables: TableComparison[];
  summary: {
    totalTables: number;
    tablesWithIssues: number;
    totalMismatches: number;
    criticalIssues: number;
  };
}

// ============================================================================
// TYPE MAPPING UTILITIES
// ============================================================================

function normalizeFieldName(name: string): string {
  // Convert snake_case to camelCase
  return name.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function getTypeString(type: string): string {
  if (type.includes('|')) {
    return type;
  }
  if (type === 'string | Date') {
    return 'Date';
  }
  return type;
}

function isNullable(type: string): boolean {
  return type.includes('| null') || type.includes('| undefined') || type.includes('?');
}

// ============================================================================
// COMPARISON FUNCTIONS
// ============================================================================

function compareSignalTypes(): TableComparison {
  const dbFields: Record<string, { type: string; nullable: boolean }> = {
    id: { type: 'string', nullable: true },
    source: { type: 'string', nullable: false },
    symbol: { type: 'string', nullable: false },
    direction: { type: 'CALL | PUT', nullable: false },
    timeframe: { type: 'string', nullable: false },
    timestamp: { type: 'Date', nullable: false },
    metadata: { type: 'Record<string, any>', nullable: true },
    validationResult: { type: 'Record<string, any>', nullable: true },
    createdAt: { type: 'Date', nullable: true },
  };

  const tsFields: Record<string, { type: string; nullable: boolean }> = {
    id: { type: 'string', nullable: false },
    source: { type: 'string', nullable: false },
    symbol: { type: 'string', nullable: false },
    direction: { type: 'CALL | PUT', nullable: false },
    timeframe: { type: 'string', nullable: false },
    timestamp: { type: 'Date', nullable: false },
    metadata: { type: 'Record<string, any>', nullable: false },
  };

  const entityFields: Record<string, { type: string; nullable: boolean }> = {
    id: { type: 'string', nullable: false },
    source: { type: 'string', nullable: false },
    symbol: { type: 'string', nullable: false },
    direction: { type: 'string', nullable: false },
    timeframe: { type: 'string', nullable: false },
    timestamp: { type: 'string | Date', nullable: false },
    metadata: { type: 'Record<string, any>', nullable: true },
    validation_result: { type: 'Record<string, any>', nullable: true },
    created_at: { type: 'string | Date', nullable: false },
  };

  const fields: FieldComparison[] = [];
  const allFields = new Set([
    ...Object.keys(dbFields),
    ...Object.keys(tsFields),
    ...Object.keys(entityFields).map(normalizeFieldName),
  ]);

  for (const field of allFields) {
    const dbField = dbFields[field];
    const tsField = tsFields[field];
    
    if (!dbField) {
      fields.push({
        field,
        dbType: 'N/A',
        dbNullable: false,
        tsType: tsField?.type || 'N/A',
        tsNullable: tsField?.nullable || false,
        match: false,
        issue: 'Field exists in TypeScript but not in database schema',
      });
      continue;
    }

    if (!tsField) {
      fields.push({
        field,
        dbType: dbField.type,
        dbNullable: dbField.nullable,
        tsType: 'N/A',
        tsNullable: false,
        match: false,
        issue: 'Field exists in database but not in TypeScript type',
      });
      continue;
    }

    const typeMatch = dbField.type === tsField.type;
    const nullableMatch = dbField.nullable === tsField.nullable;
    const match = typeMatch && nullableMatch;

    fields.push({
      field,
      dbType: dbField.type,
      dbNullable: dbField.nullable,
      tsType: tsField.type,
      tsNullable: tsField.nullable,
      match,
      issue: !match
        ? `Type mismatch: ${!typeMatch ? 'types differ' : ''} ${!nullableMatch ? 'nullability differs' : ''}`.trim()
        : undefined,
    });
  }

  const missingInTS = Object.keys(dbFields).filter(f => !tsFields[f]);
  const missingInDB = Object.keys(tsFields).filter(f => !dbFields[f]);

  return {
    tableName: 'Signals',
    dbTableName: 'refactored_signals',
    tsTypeName: 'Signal',
    entityTypeName: 'SignalEntity',
    fields,
    missingInTS,
    missingInDB,
    summary: {
      totalFields: fields.length,
      matchingFields: fields.filter(f => f.match).length,
      mismatchedFields: fields.filter(f => !f.match).length,
      missingInTS: missingInTS.length,
      missingInDB: missingInDB.length,
    },
  };
}

function comparePositionTypes(): TableComparison {
  const dbFields: Record<string, { type: string; nullable: boolean }> = {
    id: { type: 'string', nullable: true },
    signalId: { type: 'string', nullable: false },
    symbol: { type: 'string', nullable: false },
    direction: { type: 'CALL | PUT', nullable: false },
    quantity: { type: 'number', nullable: false },
    entryPrice: { type: 'number', nullable: false },
    entryTime: { type: 'Date', nullable: false },
    currentPrice: { type: 'number', nullable: true },
    unrealizedPnl: { type: 'number', nullable: true },
    exitPrice: { type: 'number', nullable: true },
    exitTime: { type: 'Date', nullable: true },
    realizedPnl: { type: 'number', nullable: true },
    status: { type: 'OPEN | CLOSED', nullable: false },
    createdAt: { type: 'Date', nullable: true },
    updatedAt: { type: 'Date', nullable: true },
  };

  const tsFields: Record<string, { type: string; nullable: boolean }> = {
    id: { type: 'string', nullable: false },
    signalId: { type: 'string', nullable: false },
    symbol: { type: 'string', nullable: false },
    direction: { type: 'CALL | PUT', nullable: false },
    quantity: { type: 'number', nullable: false },
    entryPrice: { type: 'number', nullable: false },
    entryTime: { type: 'Date', nullable: false },
    currentPrice: { type: 'number', nullable: true },
    unrealizedPnL: { type: 'number', nullable: true },
    status: { type: 'OPEN | CLOSED', nullable: false },
  };

  const fields: FieldComparison[] = [];
  const allFields = new Set([...Object.keys(dbFields), ...Object.keys(tsFields)]);

  for (const field of allFields) {
    const dbField = dbFields[field];
    const tsField = tsFields[field];
    
    if (!dbField) {
      fields.push({
        field,
        dbType: 'N/A',
        dbNullable: false,
        tsType: tsField?.type || 'N/A',
        tsNullable: tsField?.nullable || false,
        match: false,
        issue: 'Field exists in TypeScript but not in database schema',
      });
      continue;
    }

    if (!tsField) {
      fields.push({
        field,
        dbType: dbField.type,
        dbNullable: dbField.nullable,
        tsType: 'N/A',
        tsNullable: false,
        match: false,
        issue: 'Field exists in database but not in TypeScript type',
      });
      continue;
    }

    const typeMatch = dbField.type === tsField.type;
    const nullableMatch = dbField.nullable === tsField.nullable;
    const match = typeMatch && nullableMatch;

    fields.push({
      field,
      dbType: dbField.type,
      dbNullable: dbField.nullable,
      tsType: tsField.type,
      tsNullable: tsField.nullable,
      match,
      issue: !match
        ? `Type mismatch: ${!typeMatch ? 'types differ' : ''} ${!nullableMatch ? 'nullability differs' : ''}`.trim()
        : undefined,
    });
  }

  const missingInTS = Object.keys(dbFields).filter(f => !tsFields[f]);
  const missingInDB = Object.keys(tsFields).filter(f => !dbFields[f]);

  return {
    tableName: 'Positions',
    dbTableName: 'refactored_positions',
    tsTypeName: 'Position',
    entityTypeName: 'PositionEntity',
    fields,
    missingInTS,
    missingInDB,
    summary: {
      totalFields: fields.length,
      matchingFields: fields.filter(f => f.match).length,
      mismatchedFields: fields.filter(f => !f.match).length,
      missingInTS: missingInTS.length,
      missingInDB: missingInDB.length,
    },
  };
}

function compareContextTypes(): TableComparison {
  const dbFields: Record<string, { type: string; nullable: boolean }> = {
    id: { type: 'string', nullable: true },
    vix: { type: 'number', nullable: false },
    trend: { type: 'BULLISH | BEARISH | NEUTRAL', nullable: false },
    bias: { type: 'number', nullable: false },
    regime: { type: 'LOW_VOL | HIGH_VOL | NORMAL', nullable: false },
    timestamp: { type: 'Date', nullable: false },
    createdAt: { type: 'Date', nullable: true },
  };

  const tsFields: Record<string, { type: string; nullable: boolean }> = {
    vix: { type: 'number', nullable: false },
    trend: { type: 'BULLISH | BEARISH | NEUTRAL', nullable: false },
    bias: { type: 'number', nullable: false },
    regime: { type: 'LOW_VOL | HIGH_VOL | NORMAL', nullable: false },
    timestamp: { type: 'Date', nullable: false },
  };

  const fields: FieldComparison[] = [];
  const allFields = new Set([...Object.keys(dbFields), ...Object.keys(tsFields)]);

  for (const field of allFields) {
    const dbField = dbFields[field];
    const tsField = tsFields[field];
    
    if (!dbField) {
      fields.push({
        field,
        dbType: 'N/A',
        dbNullable: false,
        tsType: tsField?.type || 'N/A',
        tsNullable: tsField?.nullable || false,
        match: false,
        issue: 'Field exists in TypeScript but not in database schema',
      });
      continue;
    }

    if (!tsField) {
      fields.push({
        field,
        dbType: dbField.type,
        dbNullable: dbField.nullable,
        tsType: 'N/A',
        tsNullable: false,
        match: false,
        issue: 'Field exists in database but not in TypeScript type',
      });
      continue;
    }

    const typeMatch = dbField.type === tsField.type;
    const nullableMatch = dbField.nullable === tsField.nullable;
    const match = typeMatch && nullableMatch;

    fields.push({
      field,
      dbType: dbField.type,
      dbNullable: dbField.nullable,
      tsType: tsField.type,
      tsNullable: tsField.nullable,
      match,
      issue: !match
        ? `Type mismatch: ${!typeMatch ? 'types differ' : ''} ${!nullableMatch ? 'nullability differs' : ''}`.trim()
        : undefined,
    });
  }

  const missingInTS = Object.keys(dbFields).filter(f => !tsFields[f]);
  const missingInDB = Object.keys(tsFields).filter(f => !dbFields[f]);

  return {
    tableName: 'ContextSnapshots',
    dbTableName: 'refactored_context_snapshots',
    tsTypeName: 'ContextData',
    entityTypeName: 'ContextSnapshotEntity',
    fields,
    missingInTS,
    missingInDB,
    summary: {
      totalFields: fields.length,
      matchingFields: fields.filter(f => f.match).length,
      mismatchedFields: fields.filter(f => !f.match).length,
      missingInTS: missingInTS.length,
      missingInDB: missingInDB.length,
    },
  };
}

function compareGEXSignalTypes(): TableComparison {
  const dbFields: Record<string, { type: string; nullable: boolean }> = {
    id: { type: 'string', nullable: true },
    symbol: { type: 'string', nullable: false },
    timeframe: { type: 'string', nullable: false },
    strength: { type: 'number', nullable: false },
    direction: { type: 'CALL | PUT', nullable: false },
    timestamp: { type: 'Date', nullable: false },
    age: { type: 'number', nullable: true },
    metadata: { type: 'Record<string, any>', nullable: true },
    createdAt: { type: 'Date', nullable: true },
  };

  const tsFields: Record<string, { type: string; nullable: boolean }> = {
    symbol: { type: 'string', nullable: false },
    timeframe: { type: 'string', nullable: false },
    strength: { type: 'number', nullable: false },
    direction: { type: 'CALL | PUT', nullable: false },
    timestamp: { type: 'Date', nullable: false },
    age: { type: 'number', nullable: false },
  };

  const fields: FieldComparison[] = [];
  const allFields = new Set([...Object.keys(dbFields), ...Object.keys(tsFields)]);

  for (const field of allFields) {
    const dbField = dbFields[field];
    const tsField = tsFields[field];
    
    if (!dbField) {
      fields.push({
        field,
        dbType: 'N/A',
        dbNullable: false,
        tsType: tsField?.type || 'N/A',
        tsNullable: tsField?.nullable || false,
        match: false,
        issue: 'Field exists in TypeScript but not in database schema',
      });
      continue;
    }

    if (!tsField) {
      fields.push({
        field,
        dbType: dbField.type,
        dbNullable: dbField.nullable,
        tsType: 'N/A',
        tsNullable: false,
        match: false,
        issue: 'Field exists in database but not in TypeScript type',
      });
      continue;
    }

    const typeMatch = dbField.type === tsField.type;
    const nullableMatch = dbField.nullable === tsField.nullable;
    const match = typeMatch && nullableMatch;

    fields.push({
      field,
      dbType: dbField.type,
      dbNullable: dbField.nullable,
      tsType: tsField.type,
      tsNullable: tsField.nullable,
      match,
      issue: !match
        ? `Type mismatch: ${!typeMatch ? 'types differ' : ''} ${!nullableMatch ? 'nullability differs' : ''}`.trim()
        : undefined,
    });
  }

  const missingInTS = Object.keys(dbFields).filter(f => !tsFields[f]);
  const missingInDB = Object.keys(tsFields).filter(f => !dbFields[f]);

  return {
    tableName: 'GEXSignals',
    dbTableName: 'refactored_gex_signals',
    tsTypeName: 'GEXSignal',
    entityTypeName: 'GEXSignalEntity',
    fields,
    missingInTS,
    missingInDB,
    summary: {
      totalFields: fields.length,
      matchingFields: fields.filter(f => f.match).length,
      mismatchedFields: fields.filter(f => !f.match).length,
      missingInTS: missingInTS.length,
      missingInDB: missingInDB.length,
    },
  };
}

// ============================================================================
// MAIN COMPARISON
// ============================================================================

export function generateComparisonReport(): ComparisonReport {
  const tables: TableComparison[] = [
    compareSignalTypes(),
    comparePositionTypes(),
    compareContextTypes(),
    compareGEXSignalTypes(),
  ];

  const tablesWithIssues = tables.filter(t => t.summary.mismatchedFields > 0 || t.summary.missingInTS > 0 || t.summary.missingInDB > 0);
  const totalMismatches = tables.reduce((sum, t) => sum + t.summary.mismatchedFields, 0);
  const criticalIssues = tables.reduce((sum, t) => sum + t.summary.missingInDB, 0);

  return {
    timestamp: new Date().toISOString(),
    tables,
    summary: {
      totalTables: tables.length,
      tablesWithIssues: tablesWithIssues.length,
      totalMismatches: totalMismatches,
      criticalIssues: criticalIssues,
    },
  };
}

// ============================================================================
// REPORT GENERATION
// ============================================================================

export function formatReport(report: ComparisonReport): string {
  let output = '# Type-Schema Comparison Report\n\n';
  output += `**Generated:** ${report.timestamp}\n\n`;
  output += `**Task:** 2.2 Compare TypeScript types with database schema\n`;
  output += `**Requirements:** 3.1, 3.2\n\n`;

  output += '## Executive Summary\n\n';
  output += `- **Total Tables Analyzed:** ${report.summary.totalTables}\n`;
  output += `- **Tables with Issues:** ${report.summary.tablesWithIssues}\n`;
  output += `- **Total Mismatches:** ${report.summary.totalMismatches}\n`;
  output += `- **Critical Issues:** ${report.summary.criticalIssues}\n\n`;

  if (report.summary.tablesWithIssues === 0) {
    output += '✅ **All types match the database schema!**\n\n';
  } else {
    output += '⚠️ **Issues found - see details below**\n\n';
  }

  output += '## Detailed Comparison\n\n';

  for (const table of report.tables) {
    output += `### ${table.tableName}\n\n`;
    output += `- **Database Table:** \`${table.dbTableName}\`\n`;
    output += `- **TypeScript Type:** \`${table.tsTypeName}\`\n`;
    output += `- **Entity Type:** \`${table.entityTypeName}\`\n\n`;

    output += '**Summary:**\n';
    output += `- Total Fields: ${table.summary.totalFields}\n`;
    output += `- Matching: ${table.summary.matchingFields}\n`;
    output += `- Mismatched: ${table.summary.mismatchedFields}\n`;
    output += `- Missing in TypeScript: ${table.summary.missingInTS}\n`;
    output += `- Missing in Database: ${table.summary.missingInDB}\n\n`;

    if (table.summary.mismatchedFields > 0 || table.summary.missingInTS > 0 || table.summary.missingInDB > 0) {
      output += '**Issues:**\n\n';
      output += '| Field | Database Type | DB Nullable | TypeScript Type | TS Nullable | Match | Issue |\n';
      output += '|-------|---------------|-------------|-----------------|-------------|-------|-------|\n';

      for (const field of table.fields.filter(f => !f.match)) {
        output += `| ${field.field} | ${field.dbType} | ${field.dbNullable ? 'Yes' : 'No'} | ${field.tsType} | ${field.tsNullable ? 'Yes' : 'No'} | ❌ | ${field.issue || ''} |\n`;
      }

      output += '\n';
    } else {
      output += '✅ **All fields match!**\n\n';
    }
  }

  output += '## Recommendations\n\n';

  if (report.summary.criticalIssues > 0) {
    output += '### Critical Issues\n\n';
    output += 'The following fields exist in the database but are missing from TypeScript types. This could lead to runtime errors:\n\n';

    for (const table of report.tables) {
      if (table.missingInDB.length > 0) {
        output += `**${table.tableName}:**\n`;
        for (const field of table.missingInDB) {
          output += `- \`${field}\`: Add to \`${table.tsTypeName}\` type\n`;
        }
        output += '\n';
      }
    }
  }

  if (report.summary.totalMismatches > 0) {
    output += '### Type Mismatches\n\n';
    output += 'The following fields have type or nullability mismatches:\n\n';

    for (const table of report.tables) {
      const mismatches = table.fields.filter(f => !f.match && f.dbType !== 'N/A' && f.tsType !== 'N/A');
      if (mismatches.length > 0) {
        output += `**${table.tableName}:**\n`;
        for (const field of mismatches) {
          output += `- \`${field.field}\`: ${field.issue}\n`;
        }
        output += '\n';
      }
    }
  }

  output += '## Next Steps\n\n';
  output += '1. Review all critical issues and missing fields\n';
  output += '2. Update TypeScript types to match database schema\n';
  output += '3. Update database schema if TypeScript types are correct\n';
  output += '4. Re-run this comparison to verify fixes\n';
  output += '5. Proceed to task 2.3: Write property test for type-schema alignment\n';

  return output;
}

// Run the comparison if executed directly
if (import.meta.main) {
  const report = generateComparisonReport();
  const formatted = formatReport(report);
  console.log(formatted);
}
