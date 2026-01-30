/**
 * Database Schema Extraction Script
 * 
 * Extracts database schema from Supabase migrations and generates
 * TypeScript type definitions for comparison with existing types.
 * 
 * Task: 2.1 Extract database schema from Supabase
 * Requirements: 3.1, 3.2, 3.3, 3.4
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface ColumnDefinition {
  name: string;
  type: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  foreignKeyReference?: {
    table: string;
    column: string;
  };
  checkConstraint?: string;
  defaultValue?: string;
}

interface TableDefinition {
  name: string;
  columns: ColumnDefinition[];
  indexes: string[];
  constraints: string[];
  comment?: string;
}

interface DatabaseSchema {
  tables: TableDefinition[];
  enums: Record<string, string[]>;
}

/**
 * Parse SQL type to TypeScript type
 */
function sqlTypeToTypeScript(sqlType: string, nullable: boolean): string {
  let tsType: string;

  // Normalize SQL type
  const normalizedType = sqlType.toUpperCase();

  if (normalizedType.includes('VARCHAR') || normalizedType.includes('TEXT')) {
    tsType = 'string';
  } else if (normalizedType.includes('INTEGER') || normalizedType.includes('BIGINT')) {
    tsType = 'number';
  } else if (normalizedType.includes('DECIMAL') || normalizedType.includes('NUMERIC')) {
    tsType = 'number';
  } else if (normalizedType.includes('BOOLEAN')) {
    tsType = 'boolean';
  } else if (normalizedType.includes('TIMESTAMPTZ') || normalizedType.includes('TIMESTAMP')) {
    tsType = 'Date';
  } else if (normalizedType.includes('JSONB') || normalizedType.includes('JSON')) {
    tsType = 'Record<string, any>';
  } else {
    tsType = 'unknown';
  }

  return nullable ? `${tsType} | null` : tsType;
}

/**
 * Extract enum values from CHECK constraints
 */
function extractEnumFromCheck(checkConstraint: string): string[] | null {
  // Match patterns like: column IN ('VALUE1', 'VALUE2', 'VALUE3')
  // The constraint might be: "direction IN ('CALL', 'PUT')" or just "direction IN ('CALL', 'PUT'"
  const match = checkConstraint.match(/IN\s*\((.*?)(?:\)|$)/i);
  if (!match) return null;

  const valuesStr = match[1];
  const values = valuesStr
    .split(',')
    .map(v => v.trim().replace(/^'|'$/g, ''))
    .filter(v => v.length > 0);

  return values.length > 0 ? values : null;
}

/**
 * Parse CREATE TABLE statement
 */
function parseCreateTable(sql: string): TableDefinition | null {
  // Extract table name
  const tableMatch = sql.match(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(\w+)\s*\(/i);
  if (!tableMatch) return null;

  const tableName = tableMatch[1];
  const columns: ColumnDefinition[] = [];
  const constraints: string[] = [];

  // Split by lines and process each column definition
  const lines = sql.split('\n');
  let inTableDef = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.includes('CREATE TABLE')) {
      inTableDef = true;
      continue;
    }

    if (!inTableDef) continue;
    if (trimmed.startsWith(')')) break;
    if (trimmed.startsWith('--')) continue;
    if (trimmed.length === 0) continue;

    // Skip constraint definitions
    if (trimmed.toUpperCase().startsWith('CONSTRAINT')) {
      constraints.push(trimmed);
      continue;
    }

    // Parse column definition - handle multi-line definitions
    const columnMatch = trimmed.match(/^(\w+)\s+([A-Z]+(?:\([^)]+\))?)/i);
    if (!columnMatch) continue;

    const columnName = columnMatch[1];
    const columnType = columnMatch[2];

    // Check for constraints
    const isPrimaryKey = /PRIMARY KEY/i.test(trimmed);
    const nullable = !/NOT NULL/i.test(trimmed);
    const isForeignKey = /REFERENCES/i.test(trimmed);

    let foreignKeyReference: ColumnDefinition['foreignKeyReference'];
    if (isForeignKey) {
      const fkMatch = trimmed.match(/REFERENCES\s+(\w+)\((\w+)\)/i);
      if (fkMatch) {
        foreignKeyReference = {
          table: fkMatch[1],
          column: fkMatch[2],
        };
      }
    }

    // Extract CHECK constraint - improved to handle inline checks
    let checkConstraint: string | undefined;
    const checkMatch = trimmed.match(/CHECK\s*\(([^)]+(?:\([^)]*\))?[^)]*)\)/i);
    if (checkMatch) {
      checkConstraint = checkMatch[1].trim();
    }

    // Extract DEFAULT value
    let defaultValue: string | undefined;
    const defaultMatch = trimmed.match(/DEFAULT\s+([^,\s]+(?:\([^)]*\))?)/i);
    if (defaultMatch) {
      defaultValue = defaultMatch[1];
    }

    columns.push({
      name: columnName,
      type: columnType,
      nullable,
      isPrimaryKey,
      isForeignKey,
      foreignKeyReference,
      checkConstraint,
      defaultValue,
    });
  }

  return {
    name: tableName,
    columns,
    indexes: [],
    constraints,
  };
}

/**
 * Parse CREATE INDEX statement
 */
function parseCreateIndex(sql: string): { table: string; index: string } | null {
  const match = sql.match(/CREATE INDEX\s+(?:IF NOT EXISTS\s+)?(\w+)\s+ON\s+(\w+)/i);
  if (!match) return null;

  return {
    table: match[2],
    index: match[1],
  };
}

/**
 * Parse COMMENT ON TABLE statement
 */
function parseTableComment(sql: string): { table: string; comment: string } | null {
  const match = sql.match(/COMMENT ON TABLE\s+(\w+)\s+IS\s+'([^']+)'/i);
  if (!match) return null;

  return {
    table: match[1],
    comment: match[2],
  };
}

/**
 * Extract database schema from migration file
 */
function extractSchemaFromMigration(migrationPath: string): DatabaseSchema {
  const sql = readFileSync(migrationPath, 'utf-8');
  const tables: TableDefinition[] = [];
  const enums: Record<string, string[]> = {};

  // Split by statements (rough approximation)
  const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);

  for (const statement of statements) {
    // Parse CREATE TABLE
    if (statement.toUpperCase().includes('CREATE TABLE')) {
      const table = parseCreateTable(statement);
      if (table) {
        tables.push(table);

        // Extract enums from CHECK constraints
        for (const column of table.columns) {
          if (column.checkConstraint) {
            const enumValues = extractEnumFromCheck(column.checkConstraint);
            if (enumValues) {
              const enumName = `${table.name}_${column.name}`;
              enums[enumName] = enumValues;
            }
          }
        }
      }
    }

    // Parse CREATE INDEX
    if (statement.toUpperCase().includes('CREATE INDEX')) {
      const indexInfo = parseCreateIndex(statement);
      if (indexInfo) {
        const table = tables.find(t => t.name === indexInfo.table);
        if (table) {
          table.indexes.push(indexInfo.index);
        }
      }
    }

    // Parse COMMENT ON TABLE
    if (statement.toUpperCase().includes('COMMENT ON TABLE')) {
      const commentInfo = parseTableComment(statement);
      if (commentInfo) {
        const table = tables.find(t => t.name === commentInfo.table);
        if (table) {
          table.comment = commentInfo.comment;
        }
      }
    }
  }

  return { tables, enums };
}

/**
 * Generate TypeScript interface from table definition
 */
function generateTypeScriptInterface(table: TableDefinition, enums: Record<string, string[]>): string {
  let output = '';

  // Add comment if available
  if (table.comment) {
    output += `/**\n * ${table.comment}\n */\n`;
  }

  output += `export interface ${toPascalCase(table.name)} {\n`;

  for (const column of table.columns) {
    // Check if this column has an enum
    const enumName = `${table.name}_${column.name}`;
    let columnType: string;

    if (enums[enumName]) {
      // Use enum type
      columnType = enums[enumName].map(v => `'${v}'`).join(' | ');
      if (column.nullable) {
        columnType = `${columnType} | null`;
      }
    } else {
      columnType = sqlTypeToTypeScript(column.type, column.nullable);
    }

    // Add JSDoc comment for foreign keys
    if (column.isForeignKey && column.foreignKeyReference) {
      output += `  /** Foreign key to ${column.foreignKeyReference.table}.${column.foreignKeyReference.column} */\n`;
    }

    // Convert snake_case to camelCase
    const propertyName = toCamelCase(column.name);
    output += `  ${propertyName}: ${columnType};\n`;
  }

  output += '}\n';

  return output;
}

/**
 * Generate TypeScript enum from enum values
 */
function generateTypeScriptEnum(enumName: string, values: string[]): string {
  const pascalName = toPascalCase(enumName);
  let output = `export type ${pascalName} = ${values.map(v => `'${v}'`).join(' | ')};\n`;
  return output;
}

/**
 * Convert snake_case to camelCase
 */
function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Convert snake_case to PascalCase
 */
function toPascalCase(str: string): string {
  const camel = toCamelCase(str);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

/**
 * Generate complete TypeScript schema file
 */
function generateSchemaFile(schema: DatabaseSchema): string {
  let output = '/**\n';
  output += ' * Database Schema Type Definitions\n';
  output += ' * \n';
  output += ' * Auto-generated from Supabase migration files\n';
  output += ' * Task: 2.1 Extract database schema from Supabase\n';
  output += ' * Requirements: 3.1, 3.2, 3.3, 3.4\n';
  output += ' * \n';
  output += ` * Generated: ${new Date().toISOString()}\n`;
  output += ' */\n\n';

  // Generate enums first
  output += '// ============================================================================\n';
  output += '// ENUM TYPES\n';
  output += '// ============================================================================\n\n';

  for (const [enumName, values] of Object.entries(schema.enums)) {
    output += generateTypeScriptEnum(enumName, values);
    output += '\n';
  }

  // Generate interfaces
  output += '// ============================================================================\n';
  output += '// TABLE INTERFACES\n';
  output += '// ============================================================================\n\n';

  for (const table of schema.tables) {
    output += generateTypeScriptInterface(table, schema.enums);
    output += '\n';
  }

  // Generate summary
  output += '// ============================================================================\n';
  output += '// SCHEMA SUMMARY\n';
  output += '// ============================================================================\n\n';
  output += `// Total tables: ${schema.tables.length}\n`;
  output += `// Total enums: ${Object.keys(schema.enums).length}\n`;
  output += '// Tables:\n';
  for (const table of schema.tables) {
    output += `//   - ${table.name} (${table.columns.length} columns, ${table.indexes.length} indexes)\n`;
  }

  return output;
}

/**
 * Main execution
 */
function main() {
  const migrationPath = join(
    __dirname,
    '..',
    'supabase',
    'migrations',
    '20260130000000_refactored_schema_alignment.sql'
  );

  const outputPath = join(
    __dirname,
    '..',
    '.kiro',
    'specs',
    'trading-system-review',
    'extracted-database-schema.ts'
  );

  console.log('Extracting database schema from:', migrationPath);

  const schema = extractSchemaFromMigration(migrationPath);

  console.log(`Found ${schema.tables.length} tables:`);
  for (const table of schema.tables) {
    console.log(`  - ${table.name} (${table.columns.length} columns)`);
  }

  console.log(`\nFound ${Object.keys(schema.enums).length} enum types`);

  const typeScriptSchema = generateSchemaFile(schema);

  // Ensure output directory exists
  const outputDir = dirname(outputPath);
  mkdirSync(outputDir, { recursive: true });

  writeFileSync(outputPath, typeScriptSchema, 'utf-8');

  console.log('\nGenerated TypeScript schema at:', outputPath);
  console.log('\nSchema extraction complete!');
}

// Run if executed directly
main();

export { extractSchemaFromMigration, generateSchemaFile };
