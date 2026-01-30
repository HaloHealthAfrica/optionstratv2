/**
 * PostgreSQL Client for Neon Database
 * Replaces Supabase client with direct Postgres connection
 */

import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

let globalClient: Client | null = null;

/**
 * Create or reuse a PostgreSQL client connection
 */
export async function getPostgresClient(): Promise<Client> {
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
 * Query builder helper to mimic Supabase's query interface
 */
export class QueryBuilder {
  private client: Client;
  private tableName: string;
  private selectFields: string = "*";
  private whereConditions: string[] = [];
  private orderByClause: string = "";
  private limitValue: number | null = null;
  private singleResult: boolean = false;

  constructor(client: Client, tableName: string) {
    this.client = client;
    this.tableName = tableName;
  }

  select(fields: string = "*") {
    this.selectFields = fields;
    return this;
  }

  eq(column: string, value: any) {
    this.whereConditions.push(`${column} = '${value}'`);
    return this;
  }

  neq(column: string, value: any) {
    this.whereConditions.push(`${column} != '${value}'`);
    return this;
  }

  gt(column: string, value: any) {
    this.whereConditions.push(`${column} > ${value}`);
    return this;
  }

  gte(column: string, value: any) {
    this.whereConditions.push(`${column} >= ${value}`);
    return this;
  }

  lt(column: string, value: any) {
    this.whereConditions.push(`${column} < ${value}`);
    return this;
  }

  lte(column: string, value: any) {
    this.whereConditions.push(`${column} <= ${value}`);
    return this;
  }

  in(column: string, values: any[]) {
    const valuesList = values.map(v => `'${v}'`).join(", ");
    this.whereConditions.push(`${column} IN (${valuesList})`);
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
    this.singleResult = true;
    this.limitValue = 1;
    return this;
  }

  async execute() {
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
      const result = await this.client.queryObject(query);
      
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
      return {
        data: null,
        error: {
          message: error.message,
          details: error,
        },
      };
    }
  }

  // Alias for execute to match Supabase API
  then(resolve: any, reject: any) {
    return this.execute().then(resolve, reject);
  }
}

/**
 * Database helper that mimics Supabase client interface
 */
export class DatabaseClient {
  private client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  from(tableName: string) {
    return {
      select: (fields?: string) => {
        const builder = new QueryBuilder(this.client, tableName);
        if (fields) {
          builder.select(fields);
        }
        return builder;
      },
      insert: async (data: any | any[]) => {
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
          const result = await this.client.queryObject(query);
          return {
            data: Array.isArray(data) ? result.rows : result.rows[0],
            error: null,
          };
        } catch (error) {
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
            const setClauses = Object.keys(data).map(key => {
              const val = data[key];
              if (val === null || val === undefined) return `${key} = NULL`;
              if (typeof val === "object") return `${key} = '${JSON.stringify(val)}'::jsonb`;
              if (typeof val === "string") return `${key} = '${val.replace(/'/g, "''")}'`;
              return `${key} = ${val}`;
            }).join(", ");

            const query = `
              UPDATE ${tableName}
              SET ${setClauses}
              WHERE ${column} = '${value}'
              RETURNING *
            `;

            try {
              const result = await this.client.queryObject(query);
              return {
                data: result.rows,
                error: null,
              };
            } catch (error) {
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
      delete: () => {
        return {
          eq: async (column: string, value: any) => {
            const query = `DELETE FROM ${tableName} WHERE ${column} = '${value}' RETURNING *`;

            try {
              const result = await this.client.queryObject(query);
              return {
                data: result.rows,
                error: null,
              };
            } catch (error) {
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
  }

  async query(sql: string, params?: any[]) {
    try {
      const result = await this.client.queryObject(sql, params);
      return {
        data: result.rows,
        error: null,
      };
    } catch (error) {
      return {
        data: null,
        error: {
          message: error.message,
          details: error,
        },
      };
    }
  }
}

/**
 * Create a database client that mimics Supabase interface
 */
export async function createDatabaseClient(): Promise<DatabaseClient> {
  const client = await getPostgresClient();
  return new DatabaseClient(client);
}
