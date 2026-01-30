/**
 * Database Client Wrapper
 * Uses direct PostgreSQL connection to Neon instead of Supabase.
 */

import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

// Global client instance
let globalClient: Client | null = null;

/**
 * Get or create PostgreSQL client
 */
async function getClient(): Promise<Client> {
  if (globalClient) {
    return globalClient;
  }

  const databaseUrl = Deno.env.get("DATABASE_URL");

  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  globalClient = new Client(databaseUrl);
  await globalClient.connect();

  return globalClient;
}

/**
 * Simple query builder that mimics Supabase interface
 */
class QueryBuilder {
  private tableName: string;
  private selectFields: string = "*";
  private whereConditions: string[] = [];
  private orderByClause: string = "";
  private limitValue: number | null = null;
  private singleResult: boolean = false;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  select(fields: string = "*") {
    this.selectFields = fields;
    return this;
  }

  eq(column: string, value: any) {
    const escapedValue = typeof value === 'string' ? `'${value.replace(/'/g, "''")}'` : value;
    this.whereConditions.push(`${column} = ${escapedValue}`);
    return this;
  }

  gte(column: string, value: any) {
    const escapedValue = typeof value === 'string' ? `'${value.replace(/'/g, "''")}'` : value;
    this.whereConditions.push(`${column} >= ${escapedValue}`);
    return this;
  }

  lte(column: string, value: any) {
    const escapedValue = typeof value === 'string' ? `'${value.replace(/'/g, "''")}'` : value;
    this.whereConditions.push(`${column} <= ${escapedValue}`);
    return this;
  }

  gt(column: string, value: any) {
    const escapedValue = typeof value === 'string' ? `'${value.replace(/'/g, "''")}'` : value;
    this.whereConditions.push(`${column} > ${escapedValue}`);
    return this;
  }

  lt(column: string, value: any) {
    const escapedValue = typeof value === 'string' ? `'${value.replace(/'/g, "''")}'` : value;
    this.whereConditions.push(`${column} < ${escapedValue}`);
    return this;
  }

  neq(column: string, value: any) {
    const escapedValue = typeof value === 'string' ? `'${value.replace(/'/g, "''")}'` : value;
    this.whereConditions.push(`${column} != ${escapedValue}`);
    return this;
  }

  in(column: string, values: any[]) {
    const escaped = values.map(value => {
      if (value === null || value === undefined) return "NULL";
      if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
      return value;
    });
    this.whereConditions.push(`${column} IN (${escaped.join(", ")})`);
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    const direction = options?.ascending === false ? "DESC" : "ASC";
    this.orderByClause = `ORDER BY ${column} ${direction}`;
    return this;
  }

  limit(count: number) {
    this.limitValue = count;
    return this;
  }

  single() {
    this.singleResult = true;
    this.limitValue = 1;
    return this;
  }

  maybeSingle() {
    return this.single();
  }

  async execute() {
    const client = await getClient();
    let query = `SELECT ${this.selectFields} FROM ${this.tableName}`;

    if (this.whereConditions.length > 0) {
      query += ` WHERE ${this.whereConditions.join(" AND ")}`;
    }

    if (this.orderByClause) {
      query += ` ${this.orderByClause}`;
    }

    if (this.limitValue) {
      query += ` LIMIT ${this.limitValue}`;
    }

    try {
      const result = await client.queryObject(query);

      if (this.singleResult) {
        return {
          data: result.rows[0] || null,
          error: null,
        };
      }

      return {
        data: result.rows,
        error: null,
      };
    } catch (error) {
      console.error("Query error:", error);
      return {
        data: null,
        error: {
          message: error.message,
          details: error,
        },
      };
    }
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

/**
 * Database client that mimics Supabase interface
 */
export function createDbClient() {
  return {
    from: (tableName: string) => {
      return {
        select: (fields?: string) => {
          const builder = new QueryBuilder(tableName);
          if (fields) {
            builder.select(fields);
          }
          return builder;
        },
        insert: async (data: any | any[]) => {
          const client = await getClient();
          const records = Array.isArray(data) ? data : [data];

          if (records.length === 0) {
            return { data: null, error: { message: "No data to insert" } };
          }

          const columns = Object.keys(records[0]);
          const values = records.map(record =>
            `(${columns.map(col => {
              const value = record[col];
              if (value === null || value === undefined) return "NULL";
              if (typeof value === "object") return `'${JSON.stringify(value)}'::jsonb`;
              if (typeof value === "string") return `'${value.replace(/'/g, "''")}'`;
              return value;
            }).join(", ")})`
          ).join(", ");

          const query = `
            INSERT INTO ${tableName} (${columns.join(", ")})
            VALUES ${values}
            RETURNING *
          `;

          try {
            const result = await client.queryObject(query);
            return {
              data: Array.isArray(data) ? result.rows : result.rows[0],
              error: null,
            };
          } catch (error) {
            console.error("Insert error:", error);
            return {
              data: null,
              error: {
                message: error.message,
                details: error,
              },
            };
          }
        },
        update: (data: any) => {
          return {
            eq: async (column: string, value: any) => {
              const client = await getClient();
              const setClauses = Object.keys(data).map(key => {
                const val = data[key];
                if (val === null || val === undefined) return `${key} = NULL`;
                if (typeof val === "object") return `${key} = '${JSON.stringify(val)}'::jsonb`;
                if (typeof val === "string") return `${key} = '${val.replace(/'/g, "''")}'`;
                return `${key} = ${val}`;
              }).join(", ");

              const escapedValue = typeof value === 'string' ? `'${value.replace(/'/g, "''")}'` : value;
              const query = `
                UPDATE ${tableName}
                SET ${setClauses}
                WHERE ${column} = ${escapedValue}
                RETURNING *
              `;

              try {
                const result = await client.queryObject(query);
                return {
                  data: result.rows,
                  error: null,
                };
              } catch (error) {
                console.error("Update error:", error);
                return {
                  data: null,
                  error: {
                    message: error.message,
                    details: error,
                  },
                };
              }
            },
          };
        },
      };
    },
  };
}
