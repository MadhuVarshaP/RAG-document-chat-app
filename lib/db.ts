import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var _pgPool: Pool | undefined;
}

// Lazily construct the Pool on first use, rather than at module-load time.
// Reading process.env.DATABASE_URL eagerly at the top level is a real
// footgun: ES module imports are hoisted, so this module can finish
// evaluating (and lock in a missing/stale DATABASE_URL) before a script's
// own env-loading code has actually run.
export function getPool(): Pool {
  if (!global._pgPool) {
    global._pgPool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return global._pgPool;
}
