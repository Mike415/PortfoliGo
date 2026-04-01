import { and, desc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  groups,
  groupMembers,
  portfolioSnapshots,
  positions,
  priceCache,
  reallocationChanges,
  reallocationEvents,
  sessions,
  sleeves,
  trades,
  users,
  type InsertGroup,
  type InsertGroupMember,
  type InsertPortfolioSnapshot,
  type InsertPosition,
  type InsertSleeve,
  type InsertTrade,
  type InsertUser,
} from "../drizzle/schema";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function createUser(data: InsertUser) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(users).values(data);
  const result = await db.select().from(users).where(eq(users.username, data.username)).limit(1);
  return result[0];
}

export async function getUserByUsername(username: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
  return result[0] ?? null;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0] ?? null;
}

export async function updateUserLastSignedIn(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, id));
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export async function createSession(id: string, userId: number, expiresAt: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(sessions).values({ id, userId, expiresAt });
}

export async function getSession(id: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
  return result[0] ?? null;
}

export async function deleteSession(id: string) {
  const db = await getDb();
  if (!db) return;
  await db.delete(sessions).where(eq(sessions.id, id));
}

export async function cleanExpiredSessions() {
  const db = await getDb();
  if (!db) return;
  const now = Date.now();
  // Delete sessions where expiresAt < now
  const allSessions = await db.select().from(sessions);
  const expired = allSessions.filter((s) => s.expiresAt < now).map((s) => s.id);
  if (expired.length > 0) {
    await db.delete(sessions).where(inArray(sessions.id, expired));
  }
}

// ─── Groups ───────────────────────────────────────────────────────────────────

export async function createGroup(data: InsertGroup) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(groups).values(data);
  const result = await db.select().from(groups).where(eq(groups.inviteCode, data.inviteCode)).limit(1);
  return result[0];
}

export async function getGroupById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(groups).where(eq(groups.id, id)).limit(1);
  return result[0] ?? null;
}

export async function getGroupByInviteCode(code: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(groups).where(eq(groups.inviteCode, code)).limit(1);
  return result[0] ?? null;
}

export async function getGroupsByUser(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const memberships = await db.select().from(groupMembers).where(eq(groupMembers.userId, userId));
  if (memberships.length === 0) return [];
  const groupIds = memberships.map((m) => m.groupId);
  return db.select().from(groups).where(inArray(groups.id, groupIds));
}

export async function updateGroup(id: number, data: Partial<InsertGroup>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(groups).set(data).where(eq(groups.id, id));
}

export async function deleteGroup(groupId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Get all sleeves in the group
  const groupSleeves = await db.select().from(sleeves).where(eq(sleeves.groupId, groupId));
  const sleeveIds = groupSleeves.map((s) => s.id);
  if (sleeveIds.length > 0) {
    // Delete snapshots
    await db.delete(portfolioSnapshots).where(inArray(portfolioSnapshots.sleeveId, sleeveIds));
    // Delete trades
    await db.delete(trades).where(inArray(trades.sleeveId, sleeveIds));
    // Delete positions
    await db.delete(positions).where(inArray(positions.sleeveId, sleeveIds));
    // Delete sleeves
    await db.delete(sleeves).where(eq(sleeves.groupId, groupId));
  }
  // Delete reallocation data
  const events = await db.select().from(reallocationEvents).where(eq(reallocationEvents.groupId, groupId));
  if (events.length > 0) {
    const eventIds = events.map((e) => e.id);
    await db.delete(reallocationChanges).where(inArray(reallocationChanges.eventId, eventIds));
    await db.delete(reallocationEvents).where(eq(reallocationEvents.groupId, groupId));
  }
  // Delete group members
  await db.delete(groupMembers).where(eq(groupMembers.groupId, groupId));
  // Delete the group itself
  await db.delete(groups).where(eq(groups.id, groupId));
}

// ─── Group Members ────────────────────────────────────────────────────────────

export async function addGroupMember(data: InsertGroupMember) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(groupMembers).values(data);
}

export async function getGroupMembers(groupId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(groupMembers).where(eq(groupMembers.groupId, groupId));
}

export async function getGroupMembership(groupId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db
    .select()
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
    .limit(1);
  return result[0] ?? null;
}

// ─── Sleeves ──────────────────────────────────────────────────────────────────

export async function createSleeve(data: InsertSleeve) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(sleeves).values(data);
  const result = await db
    .select()
    .from(sleeves)
    .where(and(eq(sleeves.groupId, data.groupId), eq(sleeves.userId, data.userId)))
    .limit(1);
  return result[0];
}

export async function getSleeveById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(sleeves).where(eq(sleeves.id, id)).limit(1);
  return result[0] ?? null;
}

export async function getSleeveByUserAndGroup(userId: number, groupId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db
    .select()
    .from(sleeves)
    .where(and(eq(sleeves.userId, userId), eq(sleeves.groupId, groupId)))
    .limit(1);
  return result[0] ?? null;
}

export async function getSleevesForGroup(groupId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(sleeves).where(eq(sleeves.groupId, groupId));
}

export async function updateSleeve(id: number, data: Partial<InsertSleeve>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(sleeves).set(data).where(eq(sleeves.id, id));
}

// ─── Positions ────────────────────────────────────────────────────────────────

export async function getPositionsForSleeve(sleeveId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(positions).where(eq(positions.sleeveId, sleeveId));
}

export async function getPositionByTicker(sleeveId: number, ticker: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db
    .select()
    .from(positions)
    .where(and(eq(positions.sleeveId, sleeveId), eq(positions.ticker, ticker)))
    .limit(1);
  return result[0] ?? null;
}

export async function upsertPosition(data: InsertPosition) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await getPositionByTicker(data.sleeveId, data.ticker);
  if (existing) {
    await db.update(positions).set(data).where(eq(positions.id, existing.id));
    return { ...existing, ...data };
  } else {
    await db.insert(positions).values(data);
    const result = await db
      .select()
      .from(positions)
      .where(and(eq(positions.sleeveId, data.sleeveId), eq(positions.ticker, data.ticker)))
      .limit(1);
    return result[0];
  }
}

export async function deletePosition(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(positions).where(eq(positions.id, id));
}

export async function getAllPositionTickers(groupId: number): Promise<string[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const groupSleeves = await getSleevesForGroup(groupId);
  if (groupSleeves.length === 0) return [];
  const sleeveIds = groupSleeves.map((s) => s.id);
  const allPositions = await db
    .select({ ticker: positions.ticker })
    .from(positions)
    .where(inArray(positions.sleeveId, sleeveIds));
  const tickerSet = new Set(allPositions.map((p) => p.ticker));
  return Array.from(tickerSet);
}

// ─── Trades ───────────────────────────────────────────────────────────────────

export async function createTrade(data: InsertTrade) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(trades).values(data);
}

export async function getTradesForSleeve(sleeveId: number, limit = 50) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(trades).where(eq(trades.sleeveId, sleeveId)).limit(limit);
}

// ─── Price Cache ──────────────────────────────────────────────────────────────

export async function getPriceCacheEntry(ticker: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(priceCache).where(eq(priceCache.ticker, ticker)).limit(1);
  return result[0] ?? null;
}

export async function upsertPriceCache(
  ticker: string,
  assetType: "stock" | "etf" | "crypto",
  price: string,
  change: string | null,
  changePct: string | null,
  name: string | null,
  priceSourceVal: "regular" | "pre" | "post" = "regular"
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .insert(priceCache)
    .values({ ticker, assetType, price, change, changePct, name, priceSource: priceSourceVal })
    .onDuplicateKeyUpdate({ set: { price, change, changePct, name, priceSource: priceSourceVal, updatedAt: new Date() } });
}

// ─── Reallocation ─────────────────────────────────────────────────────────────

export async function createReallocationEvent(
  groupId: number,
  triggeredBy: number,
  notes: string | null
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(reallocationEvents).values({ groupId, triggeredBy, notes });
  const result = await db
    .select()
    .from(reallocationEvents)
    .where(eq(reallocationEvents.groupId, groupId))
    .limit(1);
  // Get the latest one
  const all = await db.select().from(reallocationEvents).where(eq(reallocationEvents.groupId, groupId));
  return all[all.length - 1];
}

export async function createReallocationChange(data: {
  eventId: number;
  sleeveId: number;
  userId: number;
  previousAllocation: string;
  newAllocation: string;
  changeAmount: string;
  returnPctAtTime: string;
  rank: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(reallocationChanges).values(data);
}

export async function getReallocationHistory(groupId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const events = await db
    .select()
    .from(reallocationEvents)
    .where(eq(reallocationEvents.groupId, groupId));
  return events;
}

// ─── Portfolio Snapshots ─────────────────────────────────────────────────────

/** Return all groups with status = 'active' (used by the cron job) */
export async function getActiveGroups() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(groups).where(eq(groups.status, "active"));
}

/** Fetch snapshots for multiple sleeves in one query (for leaderboard chart) */
export async function getSnapshotsForSleeves(sleeveIds: number[], limit = 90) {
  const db = await getDb();
  if (!db) return [];
  if (sleeveIds.length === 0) return [];
  return db
    .select()
    .from(portfolioSnapshots)
    .where(inArray(portfolioSnapshots.sleeveId, sleeveIds))
    .orderBy(desc(portfolioSnapshots.snapshotAt))
    .limit(limit * sleeveIds.length);
}

export async function insertSnapshot(data: InsertPortfolioSnapshot) {
  const db = await getDb();
  if (!db) return;
  await db.insert(portfolioSnapshots).values(data);
}

export async function getSnapshotsForSleeve(sleeveId: number, limit = 90) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(portfolioSnapshots)
    .where(eq(portfolioSnapshots.sleeveId, sleeveId))
    .orderBy(desc(portfolioSnapshots.snapshotAt))
    .limit(limit);
}

// ─── OAuth SDK Compatibility Shims ───────────────────────────────────────────
// The framework's sdk.ts calls getUserByOpenId and upsertUser with openId.
// For our custom auth, we store userId as the "openId" in the JWT session.
// These shims map those calls to our username-based user table.

export async function getUserByOpenId(openId: string) {
  // openId here is actually the stringified user ID from our custom auth
  const numericId = parseInt(openId, 10);
  if (isNaN(numericId)) return null;
  return getUserById(numericId);
}

export async function upsertUser(data: {
  openId: string;
  name?: string | null;
  email?: string | null;
  loginMethod?: string | null;
  lastSignedIn?: Date;
  role?: "user" | "admin";
}) {
  // For our custom auth, upsertUser is only called to update lastSignedIn
  const numericId = parseInt(data.openId, 10);
  if (isNaN(numericId)) return;
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ lastSignedIn: data.lastSignedIn ?? new Date() }).where(eq(users.id, numericId));
}
