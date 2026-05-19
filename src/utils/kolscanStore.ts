/**
 * DB-backed kolscan leaderboard store.
 *
 * Strict pipeline:
 *   - Writes: the cron (k8s CronJob + in-process scheduler in
 *     `src/instrumentation.ts`) calls `refreshAllTimeframes()` every 30 min.
 *     That's the only path that hits kolscan.io and writes Postgres.
 *   - Reads: `getRows()` is DB-only — it never triggers a refresh, so user
 *     traffic on the Vision page can't fan out into kolscan requests.
 *
 * If the cron hasn't run yet (cold start with an empty table), reads return
 * an empty list. The instrumentation hook fires an immediate refresh on
 * server boot so this window is short.
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — `pg` ships its own types but they're not installed as a dep.
import { Pool, type PoolClient } from "pg";
import { setTimeout as sleep } from "timers/promises";

export type KolscanTimeframeId = 1 | 7 | 30;

export const TIMEFRAME_IDS: KolscanTimeframeId[] = [1, 7, 30];

export interface KolscanApiEntry {
  wallet_address: string;
  name: string;
  telegram: string | null;
  twitter: string | null;
  profit: number;
  wins: number;
  losses: number;
  timeframe: KolscanTimeframeId;
}

export interface KolRow {
  rank: number;
  wallet_address: string;
  name: string;
  twitter: string | null;
  telegram: string | null;
  profit: number;
  wins: number;
  losses: number;
  fetched_at: Date;
}

// ── kolscan client ──────────────────────────────────────────────────────────

const KOLSCAN_URL = "https://kolscan.io/api/leaderboard";
const PAGE_SIZE = 50;
const MAX_PAGES = 200;
const PAGE_DELAY_MS = 200;
const REQUEST_TIMEOUT_MS = 15_000;

const KOLSCAN_HEADERS: Record<string, string> = {
  accept: "*/*",
  "accept-language": "en-US,en;q=0.6",
  "content-type": "application/json",
  origin: "https://kolscan.io",
  referer: "https://kolscan.io/leaderboard",
  "sec-ch-ua":
    '"Chromium";v="148", "Brave";v="148", "Not/A)Brand";v="99"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"macOS"',
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
  "sec-gpc": "1",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
  cookie:
    process.env.KOLSCAN_COOKIE ||
    "user-session=2567ad8e-2751-40d3-85f8-37910f736806",
};

async function fetchPage(
  timeframe: KolscanTimeframeId,
  page: number,
): Promise<KolscanApiEntry[]> {
  const res = await fetch(KOLSCAN_URL, {
    method: "POST",
    headers: KOLSCAN_HEADERS,
    body: JSON.stringify({ timeframe, page, pageSize: PAGE_SIZE }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(
      `kolscan ${res.status} for timeframe=${timeframe} page=${page}`,
    );
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(
      `kolscan returned non-JSON (Cloudflare challenge?) for timeframe=${timeframe} page=${page}`,
    );
  }
  const json = (await res.json()) as { data?: KolscanApiEntry[] };
  return Array.isArray(json.data) ? json.data : [];
}

export async function fetchAllPages(
  timeframe: KolscanTimeframeId,
): Promise<KolscanApiEntry[]> {
  const out: KolscanApiEntry[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    if (page > 0) await sleep(PAGE_DELAY_MS);
    const batch = await fetchPage(timeframe, page);
    if (batch.length === 0) break;
    out.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return out;
}

// ── DB / fallback mode resolution ───────────────────────────────────────────
//
// Production runs against the in-cluster Postgres; local dev / preview boxes
// often don't have it. Rather than 500ing on a missing DB, we probe once per
// process and either:
//   - persist to Postgres (production path), or
//   - keep the same data in-process (local/preview path).
//
// Either way the public API of this module is identical — callers don't see
// the storage mode.

type StoreMode = "db" | "memory";
let storeMode: StoreMode | null = null;
let modeProbe: Promise<StoreMode> | null = null;

function resolveConnectionString(): string {
  // Allow a dedicated override for kol-leaderboard so local dev can point at
  // a different Postgres than DATABASE_URL (which the existing
  // /api/tokens, /api/bonding-tokens-search routes expect to be a
  // `tokenservice`-shaped DB). In production they're usually the same DB and
  // the override is left unset.
  return (
    process.env.KOL_DATABASE_URL ||
    process.env.DATABASE_URL ||
    "postgresql://postgres:password@postgres:5432/tokenservice"
  );
}

let _pool: Pool | null = null;
function getPool(): Pool {
  if (!_pool) {
    const connStr = resolveConnectionString();
    // Neon (and other managed Postgres) require TLS. node-postgres reads
    // `sslmode=require` from the URL but won't accept publicly-trusted certs
    // unless we either pass `ssl: true` or set rejectUnauthorized=false.
    // We pass `ssl: { rejectUnauthorized: false }` only when the URL says so,
    // so local docker-compose Postgres (plain TCP) keeps working.
    const requiresSsl = /[?&]sslmode=(require|verify-ca|verify-full)/i.test(
      connStr,
    );
    _pool = new Pool({
      connectionString: connStr,
      ssl: requiresSsl ? { rejectUnauthorized: false } : undefined,
      // Short connect timeout so the probe fails fast on a missing DB instead
      // of dragging the first user-visible request out to the OS default.
      connectionTimeoutMillis: 5_000,
    });
    // Pool's "error" event fires on idle-client failures; without a handler
    // Node prints a warning and (in some versions) can crash the process when
    // the unreachable DB drops idle clients.
    _pool.on("error", (err: Error) => {
      console.warn(
        "[kolscanStore] idle pg client error:",
        err.message,
      );
    });
  }
  return _pool;
}

async function probeMode(): Promise<StoreMode> {
  if (storeMode) return storeMode;
  if (modeProbe) return modeProbe;
  modeProbe = (async () => {
    try {
      const client = await getPool().connect();
      try {
        await client.query("SELECT 1");
      } finally {
        client.release();
      }
      storeMode = "db";
      const conn = resolveConnectionString();
      // Strip password before logging so it doesn't end up in stdout/journald.
      const safe = conn.replace(/:\/\/([^:]+):[^@]*@/, "://$1:***@");
      console.log(
        `[kolscanStore] using Postgres ("KolLeaderboardRow" table) — ${safe}`,
      );
    } catch (err) {
      storeMode = "memory";
      console.warn(
        "[kolscanStore] Postgres unreachable — falling back to in-memory cache. Reason:",
        err instanceof Error ? err.message : err,
      );
    }
    return storeMode;
  })();
  return modeProbe;
}

/**
 * Schema is owned by Prisma in the wallet-tracker-backend repo (model
 * `KolLeaderboardRow`, migration 20260517045022_add_kol_leaderboard_row).
 * We only verify the table is reachable — creating it from this app would
 * race the Prisma migrate and risk a divergent column type.
 */
let schemaReady: Promise<void> | null = null;
async function ensureSchema(): Promise<void> {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    const client = await getPool().connect();
    try {
      // Cheap reachability check. If Prisma hasn't run yet this will throw
      // "relation does not exist" — surface a clear message rather than a
      // confusing error on the first INSERT.
      await client.query('SELECT 1 FROM "KolLeaderboardRow" LIMIT 1');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/relation .* does not exist/i.test(msg)) {
        throw new Error(
          '"KolLeaderboardRow" table missing — run `npm run db:migrate` ' +
            "in ../wallet-tracker-backend to apply the Prisma migration.",
        );
      }
      throw err;
    } finally {
      client.release();
    }
  })().catch((err) => {
    schemaReady = null;
    throw err;
  });
  return schemaReady;
}

// ── In-memory fallback store ────────────────────────────────────────────────

interface MemorySlot {
  rows: KolRow[];
  fetchedAt: Date;
}
const memoryStore = new Map<KolscanTimeframeId, MemorySlot>();

function entriesToRows(
  entries: KolscanApiEntry[],
  fetchedAt: Date,
): KolRow[] {
  const seen = new Set<string>();
  const rows: KolRow[] = [];
  entries.forEach((entry, idx) => {
    if (seen.has(entry.wallet_address)) return;
    seen.add(entry.wallet_address);
    rows.push({
      rank: idx + 1,
      wallet_address: entry.wallet_address,
      name: entry.name,
      twitter: entry.twitter,
      telegram: entry.telegram,
      profit: entry.profit,
      wins: entry.wins,
      losses: entry.losses,
      fetched_at: fetchedAt,
    });
  });
  return rows;
}

async function replaceTimeframe(
  client: PoolClient,
  timeframe: KolscanTimeframeId,
  entries: KolscanApiEntry[],
): Promise<number> {
  // kolscan occasionally returns the same wallet twice; the (timeframe, wallet)
  // unique index would reject the second INSERT, so dedupe in-memory and keep
  // the first (better-ranked) occurrence.
  const seen = new Set<string>();
  const deduped: { entry: KolscanApiEntry; rank: number }[] = [];
  entries.forEach((entry, idx) => {
    if (seen.has(entry.wallet_address)) return;
    seen.add(entry.wallet_address);
    deduped.push({ entry, rank: idx + 1 });
  });

  await client.query("BEGIN");
  try {
    await client.query(
      'DELETE FROM "KolLeaderboardRow" WHERE timeframe = $1',
      [timeframe],
    );
    if (deduped.length > 0) {
      const values: unknown[] = [];
      const placeholders: string[] = [];
      deduped.forEach(({ entry, rank }, i) => {
        const base = i * 9;
        placeholders.push(
          `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9})`,
        );
        values.push(
          timeframe,
          rank,
          entry.wallet_address,
          entry.name,
          entry.twitter,
          entry.telegram,
          entry.profit,
          entry.wins,
          entry.losses,
        );
      });
      await client.query(
        `INSERT INTO "KolLeaderboardRow"
           (timeframe, rank, "walletAddress", name, twitter, telegram, profit, wins, losses)
         VALUES ${placeholders.join(", ")}`,
        values,
      );
    }
    await client.query("COMMIT");
    return deduped.length;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

/** Fetch a timeframe from kolscan and persist via whichever store mode is active. */
export async function refreshTimeframe(
  timeframe: KolscanTimeframeId,
): Promise<number> {
  const mode = await probeMode();
  const entries = await fetchAllPages(timeframe);
  if (mode === "memory") {
    const fetchedAt = new Date();
    const rows = entriesToRows(entries, fetchedAt);
    memoryStore.set(timeframe, { rows, fetchedAt });
    return rows.length;
  }
  await ensureSchema();
  const client = await getPool().connect();
  try {
    return await replaceTimeframe(client, timeframe, entries);
  } finally {
    client.release();
  }
}

export interface RefreshResult {
  daily: number;
  weekly: number;
  monthly: number;
  durationMs: number;
}

/** Refresh every timeframe sequentially; per-timeframe failures don't block others. */
export async function refreshAllTimeframes(): Promise<RefreshResult> {
  const started = Date.now();
  const counts: Record<KolscanTimeframeId, number> = { 1: 0, 7: 0, 30: 0 };
  for (const tf of TIMEFRAME_IDS) {
    try {
      counts[tf] = await refreshTimeframe(tf);
    } catch (err) {
      console.error(
        `[kolscanStore] refresh failed for timeframe=${tf} — keeping prior snapshot:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return {
    daily: counts[1],
    weekly: counts[7],
    monthly: counts[30],
    durationMs: Date.now() - started,
  };
}

// ── Read path (strictly DB-only) ────────────────────────────────────────────

export interface GetRowsResult {
  rows: KolRow[];
  total: number;
  fetchedAt: Date | null;
}

/**
 * Return rows for a timeframe directly from storage. Never triggers a
 * kolscan refresh — that's the cron's job (see refreshAllTimeframes).
 * If storage is empty (cron hasn't run yet) this returns an empty page.
 */
export async function getRows(
  timeframe: KolscanTimeframeId,
  limit: number,
  offset: number,
): Promise<GetRowsResult> {
  const mode = await probeMode();

  if (mode === "memory") {
    const slot = memoryStore.get(timeframe);
    const all = slot?.rows ?? [];
    return {
      rows: all.slice(offset, offset + limit),
      total: all.length,
      fetchedAt: slot?.fetchedAt ?? null,
    };
  }

  await ensureSchema();
  const pool = getPool();

  // SELECT aliases Prisma's camelCase columns back to our KolRow shape.
  const { rows } = await pool.query<KolRow>(
    `SELECT rank,
            "walletAddress" AS wallet_address,
            name,
            twitter,
            telegram,
            profit,
            wins,
            losses,
            "fetchedAt"    AS fetched_at
       FROM "KolLeaderboardRow"
      WHERE timeframe = $1
      ORDER BY rank ASC
      LIMIT $2 OFFSET $3`,
    [timeframe, limit, offset],
  );

  const meta = await pool.query<{ count: string; latest: Date | null }>(
    `SELECT COUNT(*)::text AS count, MAX("fetchedAt") AS latest
       FROM "KolLeaderboardRow" WHERE timeframe = $1`,
    [timeframe],
  );

  return {
    rows,
    total: Number(meta.rows[0]?.count ?? rows.length),
    fetchedAt: meta.rows[0]?.latest ?? null,
  };
}
