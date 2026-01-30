/**
 * Type-Schema Comparison Report Generator
 * 
 * Task: 2.2 Compare TypeScript types with database schema
 * Requirements: 3.1, 3.2
 */

// Database schema fields (from extracted-database-schema.ts)
const dbSchema = {
  refactored_signals: {
    id: { type: 'string', nullable: true },
    source: { type: 'string', nullable: false },
    symbol: { type: 'string', nullable: false },
    direction: { type: 'CALL | PUT', nullable: false },
    timeframe: { type: 'string', nullable: false },
    timestamp: { type: 'Date', nullable: false },
    metadata: { type: 'Record<string, any>', nullable: true },
    validationResult: { type: 'Record<string, any>', nullable: true },
    createdAt: { type: 'Date', nullable: true },
  },
  refactored_positions: {
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
  },
  refactored_decisions: {
    id: { type: 'string', nullable: true },
    signalId: { type: 'string', nullable: false },
    decisionType: { type: 'ENTRY | EXIT', nullable: false },
    decision: { type: 'ENTER | REJECT | EXIT | HOLD', nullable: false },
    confidence: { type: 'number', nullable: true },
    positionSize: { type: 'number', nullable: true },
    reasoning: { type: 'Record<string, any>', nullable: false },
    calculations: { type: 'Record<string, any>', nullable: false },
    contextData: { type: 'Record<string, any>', nullable: true },
    gexData: { type: 'Record<string, any>', nullable: true },
    createdAt: { type: 'Date', nullable: true },
  },
  refactored_gex_signals: {
    id: { type: 'string', nullable: true },
    symbol: { type: 'string', nullable: false },
    timeframe: { type: 'string', nullable: false },
    strength: { type: 'number', nullable: false },
    direction: { type: 'CALL | PUT', nullable: false },
    timestamp: { type: 'Date', nullable: false },
    age: { type: 'number', nullable: true },
    metadata: { type: 'Record<string, any>', nullable: true },
    createdAt: { type: 'Date', nullable: true },
  },
  refactored_context_snapshots: {
    id: { type: 'string', nullable: true },
    vix: { type: 'number', nullable: false },
    trend: { type: 'BULLISH | BEARISH | NEUTRAL', nullable: false },
    bias: { type: 'number', nullable: false },
    regime: { type: 'LOW_VOL | HIGH_VOL | NORMAL', nullable: false },
    timestamp: { type: 'Date', nullable: false },
    createdAt: { type: 'Date', nullable: true },
  },
  refactored_pipeline_failures: {
    id: { type: 'string', nullable: true },
    trackingId: { type: 'string', nullable: false },
    signalId: { type: 'string', nullable: true },
    stage: { type: 'RECEPTION | NORMALIZATION | VALIDATION | DEDUPLICATION | DECISION | EXECUTION', nullable: false },
    reason: { type: 'string', nullable: false },
    signalData: { type: 'Record<string, any>', nullable: true },
    timestamp: { type: 'Date', nullable: false },
    createdAt: { type: 'Date', nullable: true },
  },
  refactored_processing_errors: {
    id: { type: 'string', nullable: true },
    correlationId: { type: 'string', nullable: false },
    errorMessage: { type: 'string', nullable: false },
    errorStack: { type: 'string', nullable: true },
    rawPayload: { type: 'Record<string, any>', nullable: true },
    createdAt: { type: 'Date', nullable: true },
  },
};

// TypeScript types (from core/types.ts)
const tsTypes = {
  Signal: {
    id: { type: 'string', nullable: false },
    source: { type: 'string', nullable: false },
    symbol: { type: 'string', nullable: false },
    direction: { type: 'CALL | PUT', nullable: false },
    timeframe: { type: 'string', nullable: false },
    timestamp: { type: 'Date', nullable: false },
    metadata: { type: 'Record<string, any>', nullable: false },
  },
  Position: {
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
  },
  ContextData: {
    vix: { type: 'number', nullable: false },
    trend: { type: 'BULLISH | BEARISH | NEUTRAL', nullable: false },
    bias: { type: 'number', nullable: false },
    regime: { type: 'LOW_VOL | HIGH_VOL | NORMAL', nullable: false },
    timestamp: { type: 'Date', nullable: false },
  },
  GEXSignal: {
    symbol: { type: 'string', nullable: false },
    timeframe: { type: 'string', nullable: false },
    strength: { type: 'number', nullable: false },
    direction: { type: 'CALL | PUT', nullable: false },
    timestamp: { type: 'Date', nullable: false },
    age: { type: 'number', nullable: false },
  },
};

// Entity types (from database/entity-validation.ts)
const entityTypes = {
  SignalEntity: {
    id: { type: 'string', nullable: false },
    source: { type: 'string', nullable: false },
    symbol: { type: 'string', nullable: false },
    direction: { type: 'string', nullable: false },
    timeframe: { type: 'string', nullable: false },
    timestamp: { type: 'string | Date', nullable: false },
    metadata: { type: 'Record<string, any>', nullable: true },
    validation_result: { type: 'Record<string, any>', nullable: true },
    created_at: { type: 'string | Date', nullable: false },
  },
  PositionEntity: {
    id: { type: 'string', nullable: false },
    signal_id: { type: 'string', nullable: false },
    symbol: { type: 'string', nullable: false },
    direction: { type: 'string', nullable: false },
    quantity: { type: 'number', nullable: false },
    entry_price: { type: 'number', nullable: false },
    entry_time: { type: 'string | Date', nullable: false },
    current_price: { type: 'number', nullable: true },
    unrealized_pnl: { type: 'number', nullable: true },
    exit_price: { type: 'number', nullable: true },
    exit_time: { type: 'string | Date', nullable: true },
    realized_pnl: { type: 'number', nullable: true },
    status: { type: 'string', nullable: false },
    created_at: { type: 'string | Date', nullable: false },
    updated_at: { type: 'string | Date', nullable: false },
  },
  GEXSignalEntity: {
    id: { type: 'string', nullable: false },
    symbol: { type: 'string', nullable: false },
    timeframe: { type: 'string', nullable: false },
    strength: { type: 'number', nullable: false },
    direction: { type: 'string', nullable: false },
    timestamp: { type: 'string | Date', nullable: false },
    age: { type: 'number', nullable: true },
    metadata: { type: 'Record<string, any>', nullable: true },
    created_at: { type: 'string | Date', nullable: false },
  },
  ContextSnapshotEntity: {
    id: { type: 'string', nullable: false },
    vix: { type: 'number', nullable: false },
    trend: { type: 'string', nullable: false },
    bias: { type: 'number', nullable: false },
    regime: { type: 'string', nullable: false },
    timestamp: { type: 'string | Date', nullable: false },
    created_at: { type: 'string | Date', nullable: false },
  },
};

// Mapping between database tables and TypeScript types
const tableMapping = [
  { dbTable: 'refactored_signals', tsType: 'Signal', entityType: 'SignalEntity', name: 'Signals' },
  { dbTable: 'refactored_positions', tsType: 'Position', entityType: 'PositionEntity', name: 'Positions' },
  { dbTable: 'refactored_context_snapshots', tsType: 'ContextData', entityType: 'ContextSnapshotEntity', name: 'ContextSnapshots' },
  { dbTable: 'refactored_gex_signals', tsType: 'GEXSignal', entityType: 'GEXSignalEntity', name: 'GEXSignals' },
];

function compareTable(mapping) {
  const dbFields = dbSchema[mapping.dbTable];
  const tsFields = tsTypes[mapping.tsType];
  const entityFields = entityTypes[mapping.entityType];

  const allFields = new Set([
    ...Object.keys(dbFields),
    ...Object.keys(tsFields || {}),
  ]);

  const comparisons = [];
  const missingInTS = [];
  const missingInDB = [];

  for (const field of allFields) {
    const dbField = dbFields[field];
    const tsField = tsFields?.[field];

    if (!dbField) {
      missingInDB.push(field);
      comparisons.push({
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
      missingInTS.push(field);
      comparisons.push({
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

    let issue = undefined;
    if (!match) {
      const issues = [];
      if (!typeMatch) issues.push('types differ');
      if (!nullableMatch) issues.push('nullability differs');
      issue = `Type mismatch: ${issues.join(', ')}`;
    }

    comparisons.push({
      field,
      dbType: dbField.type,
      dbNullable: dbField.nullable,
      tsType: tsField.type,
      tsNullable: tsField.nullable,
      match,
      issue,
    });
  }

  return {
    ...mapping,
    comparisons,
    missingInTS,
    missingInDB,
    summary: {
      totalFields: comparisons.length,
      matchingFields: comparisons.filter(c => c.match).length,
      mismatchedFields: comparisons.filter(c => !c.match).length,
      missingInTS: missingInTS.length,
      missingInDB: missingInDB.length,
    },
  };
}

function generateReport() {
  const results = tableMapping.map(compareTable);
  
  const tablesWithIssues = results.filter(r => 
    r.summary.mismatchedFields > 0 || 
    r.summary.missingInTS > 0 || 
    r.summary.missingInDB > 0
  );
  
  const totalMismatches = results.reduce((sum, r) => sum + r.summary.mismatchedFields, 0);
  const criticalIssues = results.reduce((sum, r) => sum + r.summary.missingInTS, 0);

  let output = '# Type-Schema Comparison Report\n\n';
  output += `**Generated:** ${new Date().toISOString()}\n\n`;
  output += `**Task:** 2.2 Compare TypeScript types with database schema\n`;
  output += `**Requirements:** 3.1, 3.2\n\n`;

  output += '## Executive Summary\n\n';
  output += `- **Total Tables Analyzed:** ${results.length}\n`;
  output += `- **Tables with Issues:** ${tablesWithIssues.length}\n`;
  output += `- **Total Mismatches:** ${totalMismatches}\n`;
  output += `- **Critical Issues (Missing in TS):** ${criticalIssues}\n\n`;

  if (tablesWithIssues.length === 0) {
    output += '✅ **All types match the database schema!**\n\n';
  } else {
    output += '⚠️ **Issues found - see details below**\n\n';
  }

  output += '## Detailed Comparison\n\n';

  for (const result of results) {
    output += `### ${result.name}\n\n`;
    output += `- **Database Table:** \`${result.dbTable}\`\n`;
    output += `- **TypeScript Type:** \`${result.tsType}\`\n`;
    output += `- **Entity Type:** \`${result.entityType}\`\n\n`;

    output += '**Summary:**\n';
    output += `- Total Fields: ${result.summary.totalFields}\n`;
    output += `- Matching: ${result.summary.matchingFields}\n`;
    output += `- Mismatched: ${result.summary.mismatchedFields}\n`;
    output += `- Missing in TypeScript: ${result.summary.missingInTS}\n`;
    output += `- Missing in Database: ${result.summary.missingInDB}\n\n`;

    if (result.summary.mismatchedFields > 0 || result.summary.missingInTS > 0 || result.summary.missingInDB > 0) {
      output += '**Issues:**\n\n';
      output += '| Field | Database Type | DB Nullable | TypeScript Type | TS Nullable | Match | Issue |\n';
      output += '|-------|---------------|-------------|-----------------|-------------|-------|-------|\n';

      for (const comp of result.comparisons.filter(c => !c.match)) {
        output += `| ${comp.field} | ${comp.dbType} | ${comp.dbNullable ? 'Yes' : 'No'} | ${comp.tsType} | ${comp.tsNullable ? 'Yes' : 'No'} | ❌ | ${comp.issue || ''} |\n`;
      }

      output += '\n';
    } else {
      output += '✅ **All fields match!**\n\n';
    }
  }

  output += '## Analysis\n\n';

  output += '### Architecture Pattern\n\n';
  output += 'The codebase uses a **three-layer type system**:\n\n';
  output += '1. **Database Schema Types** (`extracted-database-schema.ts`): Direct representation of database tables with snake_case naming\n';
  output += '2. **Entity Types** (`database/entity-validation.ts`): Bridge layer that maps database rows to application types with snake_case field names\n';
  output += '3. **Application Types** (`core/types.ts`): Clean domain types with camelCase naming used throughout the application\n\n';
  output += 'This architecture provides:\n';
  output += '- **Type safety** at the database boundary through entity validation\n';
  output += '- **Clean domain models** for business logic\n';
  output += '- **Explicit null handling** to prevent runtime errors\n\n';

  output += '### Key Findings\n\n';

  if (criticalIssues > 0) {
    output += '#### Critical Issues\n\n';
    output += 'The following fields exist in the database but are missing from application types:\n\n';

    for (const result of results) {
      if (result.missingInTS.length > 0) {
        output += `**${result.name}:**\n`;
        for (const field of result.missingInTS) {
          const dbField = dbSchema[result.dbTable][field];
          output += `- \`${field}\` (${dbField.type}, ${dbField.nullable ? 'nullable' : 'required'})\n`;
        }
        output += '\n';
      }
    }

    output += '**Impact:** These fields are stored in the database but not accessible in the application. This could lead to:\n';
    output += '- Data loss if these fields contain important information\n';
    output += '- Incomplete data models\n';
    output += '- Potential runtime errors if code tries to access these fields\n\n';
  }

  if (totalMismatches > 0) {
    output += '#### Type Mismatches\n\n';
    output += 'The following fields have type or nullability differences:\n\n';

    for (const result of results) {
      const mismatches = result.comparisons.filter(c => !c.match && c.dbType !== 'N/A' && c.tsType !== 'N/A');
      if (mismatches.length > 0) {
        output += `**${result.name}:**\n`;
        for (const comp of mismatches) {
          output += `- \`${comp.field}\`: ${comp.issue}\n`;
          output += `  - Database: ${comp.dbType} (${comp.dbNullable ? 'nullable' : 'required'})\n`;
          output += `  - TypeScript: ${comp.tsType} (${comp.tsNullable ? 'nullable' : 'required'})\n`;
        }
        output += '\n';
      }
    }

    output += '**Impact:** Type mismatches can cause:\n';
    output += '- Runtime type errors\n';
    output += '- Null pointer exceptions\n';
    output += '- Data validation failures\n\n';
  }

  output += '### Positive Findings\n\n';
  output += '1. **Entity Validation Layer**: The `entity-validation.ts` module provides runtime validation that catches schema mismatches\n';
  output += '2. **Explicit Null Handling**: Entity types explicitly handle null values from the database\n';
  output += '3. **Type Transformation**: The validation layer transforms snake_case database fields to camelCase application fields\n';
  output += '4. **Error Reporting**: `SchemaValidationError` provides detailed error messages for debugging\n\n';

  output += '## Recommendations\n\n';

  output += '### Immediate Actions\n\n';

  if (criticalIssues > 0) {
    output += '1. **Add Missing Fields to Application Types**\n';
    output += '   - Review each missing field to determine if it should be included in application types\n';
    output += '   - Add fields that are needed for business logic\n';
    output += '   - Document why fields are excluded if they are intentionally omitted\n\n';
  }

  if (totalMismatches > 0) {
    output += '2. **Resolve Type Mismatches**\n';
    output += '   - For nullability differences: Update TypeScript types to match database nullability\n';
    output += '   - For type differences: Verify which type is correct and update accordingly\n';
    output += '   - Add runtime validation to catch type mismatches early\n\n';
  }

  output += '3. **Verify Entity Validation**\n';
  output += '   - Ensure entity validation functions handle all database fields\n';
  output += '   - Add tests for entity validation with various input scenarios\n';
  output += '   - Verify null handling matches database schema\n\n';

  output += '### Long-term Improvements\n\n';
  output += '1. **Automated Schema Sync**\n';
  output += '   - Generate TypeScript types from database schema automatically\n';
  output += '   - Use Supabase CLI to generate types: `supabase gen types typescript`\n';
  output += '   - Add CI check to detect schema drift\n\n';

  output += '2. **Property-Based Testing**\n';
  output += '   - Write property tests to verify type-schema alignment (Task 2.3)\n';
  output += '   - Test entity validation with random database rows\n';
  output += '   - Verify all database fields are handled correctly\n\n';

  output += '3. **Documentation**\n';
  output += '   - Document the three-layer type system architecture\n';
  output += '   - Explain when to use each type layer\n';
  output += '   - Provide examples of proper type usage\n\n';

  output += '## Next Steps\n\n';
  output += '1. Review this report with the team\n';
  output += '2. Prioritize and fix critical issues\n';
  output += '3. Update TypeScript types to match database schema\n';
  output += '4. Add missing fields to application types where needed\n';
  output += '5. Proceed to Task 2.3: Write property test for type-schema alignment\n';
  output += '6. Continue with Task 2.4: Verify enum consistency\n';

  return output;
}

// Generate and output the report
const report = generateReport();
console.log(report);
