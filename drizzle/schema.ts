import {
  bigint,
  decimal,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

// ─── Users ────────────────────────────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  username: varchar("username", { length: 64 }).notNull().unique(),
  passcodeHash: varchar("passcodeHash", { length: 255 }).notNull(),
  displayName: varchar("displayName", { length: 128 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Groups ───────────────────────────────────────────────────────────────────
export const groups = mysqlTable("groups", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  inviteCode: varchar("inviteCode", { length: 32 }).notNull().unique(),
  totalCapital: decimal("totalCapital", { precision: 18, scale: 2 }).notNull().default("1000000.00"),
  sleeveSize: decimal("sleeveSize", { precision: 18, scale: 2 }).notNull().default("200000.00"),
  maxParticipants: int("maxParticipants").notNull().default(5),
  reallocationInterval: mysqlEnum("reallocationInterval", ["1week", "2weeks", "1month", "3months", "6months", "12months"]).notNull().default("3months"),
  reallocationPercent: decimal("reallocationPercent", { precision: 5, scale: 2 }).notNull().default("5.00"),
  startDate: timestamp("startDate").defaultNow().notNull(),
  nextReallocationDate: timestamp("nextReallocationDate"),
  lastReallocationDate: timestamp("lastReallocationDate"),
  status: mysqlEnum("status", ["active", "paused", "completed"]).default("active").notNull(),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Group = typeof groups.$inferSelect;
export type InsertGroup = typeof groups.$inferInsert;

// ─── Group Members ────────────────────────────────────────────────────────────
export const groupMembers = mysqlTable("group_members", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").notNull(),
  userId: int("userId").notNull(),
  role: mysqlEnum("role", ["admin", "member"]).default("member").notNull(),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
});

export type GroupMember = typeof groupMembers.$inferSelect;
export type InsertGroupMember = typeof groupMembers.$inferInsert;

// ─── Sleeves ──────────────────────────────────────────────────────────────────
export const sleeves = mysqlTable("sleeves", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").notNull(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 128 }),
  allocatedCapital: decimal("allocatedCapital", { precision: 18, scale: 2 }).notNull().default("200000.00"),
  cashBalance: decimal("cashBalance", { precision: 18, scale: 2 }).notNull().default("200000.00"),
  // Computed/cached fields updated on price refresh
  positionsValue: decimal("positionsValue", { precision: 18, scale: 2 }).notNull().default("0.00"),
  totalValue: decimal("totalValue", { precision: 18, scale: 2 }).notNull().default("200000.00"),
  realizedPnl: decimal("realizedPnl", { precision: 18, scale: 2 }).notNull().default("0.00"),
  unrealizedPnl: decimal("unrealizedPnl", { precision: 18, scale: 2 }).notNull().default("0.00"),
  returnPct: decimal("returnPct", { precision: 10, scale: 4 }).notNull().default("0.0000"),
  lastPricedAt: timestamp("lastPricedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Sleeve = typeof sleeves.$inferSelect;
export type InsertSleeve = typeof sleeves.$inferInsert;

// ─── Positions ────────────────────────────────────────────────────────────────
export const positions = mysqlTable("positions", {
  id: int("id").autoincrement().primaryKey(),
  sleeveId: int("sleeveId").notNull(),
  ticker: varchar("ticker", { length: 32 }).notNull(),
  assetType: mysqlEnum("assetType", ["stock", "etf", "crypto"]).notNull().default("stock"),
  quantity: decimal("quantity", { precision: 20, scale: 8 }).notNull(),
  avgCostBasis: decimal("avgCostBasis", { precision: 18, scale: 6 }).notNull(),
  currentPrice: decimal("currentPrice", { precision: 18, scale: 6 }).default("0.000000"),
  currentValue: decimal("currentValue", { precision: 18, scale: 2 }).default("0.00"),
  unrealizedPnl: decimal("unrealizedPnl", { precision: 18, scale: 2 }).default("0.00"),
  unrealizedPnlPct: decimal("unrealizedPnlPct", { precision: 10, scale: 4 }).default("0.0000"),
  isShort: int("isShort").notNull().default(0), // 1 = short position
  lastPricedAt: timestamp("lastPricedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Position = typeof positions.$inferSelect;
export type InsertPosition = typeof positions.$inferInsert;

// ─── Trades ───────────────────────────────────────────────────────────────────
export const trades = mysqlTable("trades", {
  id: int("id").autoincrement().primaryKey(),
  sleeveId: int("sleeveId").notNull(),
  ticker: varchar("ticker", { length: 32 }).notNull(),
  assetType: mysqlEnum("assetType", ["stock", "etf", "crypto"]).notNull().default("stock"),
  side: mysqlEnum("side", ["buy", "sell", "short", "cover"]).notNull(),
  quantity: decimal("quantity", { precision: 20, scale: 8 }).notNull(),
  price: decimal("price", { precision: 18, scale: 6 }).notNull(),
  totalValue: decimal("totalValue", { precision: 18, scale: 2 }).notNull(),
  realizedPnl: decimal("realizedPnl", { precision: 18, scale: 2 }).default("0.00"),
  notes: text("notes"),
  executedAt: timestamp("executedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Trade = typeof trades.$inferSelect;
export type InsertTrade = typeof trades.$inferInsert;

// ─── Reallocation Events ──────────────────────────────────────────────────────
export const reallocationEvents = mysqlTable("reallocation_events", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").notNull(),
  triggeredBy: int("triggeredBy").notNull(),
  status: mysqlEnum("status", ["preview", "confirmed", "rolled_back"]).default("confirmed").notNull(),
  notes: text("notes"),
  executedAt: timestamp("executedAt").defaultNow().notNull(),
});

export type ReallocationEvent = typeof reallocationEvents.$inferSelect;

// ─── Reallocation Changes ─────────────────────────────────────────────────────
export const reallocationChanges = mysqlTable("reallocation_changes", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull(),
  sleeveId: int("sleeveId").notNull(),
  userId: int("userId").notNull(),
  previousAllocation: decimal("previousAllocation", { precision: 18, scale: 2 }).notNull(),
  newAllocation: decimal("newAllocation", { precision: 18, scale: 2 }).notNull(),
  changeAmount: decimal("changeAmount", { precision: 18, scale: 2 }).notNull(),
  returnPctAtTime: decimal("returnPctAtTime", { precision: 10, scale: 4 }).notNull(),
  rank: int("rank").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ReallocationChange = typeof reallocationChanges.$inferSelect;

// ─── Price Cache ──────────────────────────────────────────────────────────────
export const priceCache = mysqlTable("price_cache", {
  id: int("id").autoincrement().primaryKey(),
  ticker: varchar("ticker", { length: 32 }).notNull().unique(),
  assetType: mysqlEnum("assetType", ["stock", "etf", "crypto"]).notNull().default("stock"),
  price: decimal("price", { precision: 18, scale: 6 }).notNull(),
  change: decimal("change", { precision: 18, scale: 6 }),
  changePct: decimal("changePct", { precision: 10, scale: 4 }),
  name: varchar("name", { length: 256 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PriceCache = typeof priceCache.$inferSelect;

// ─── Portfolio Snapshots ────────────────────────────────────────────────────────
export const portfolioSnapshots = mysqlTable("portfolio_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  sleeveId: int("sleeveId").notNull(),
  totalValue: decimal("totalValue", { precision: 18, scale: 2 }).notNull(),
  positionsValue: decimal("positionsValue", { precision: 18, scale: 2 }).notNull(),
  cashBalance: decimal("cashBalance", { precision: 18, scale: 2 }).notNull(),
  returnPct: decimal("returnPct", { precision: 10, scale: 4 }).notNull().default("0.0000"),
  snapshotAt: timestamp("snapshotAt").defaultNow().notNull(),
});

export type PortfolioSnapshot = typeof portfolioSnapshots.$inferSelect;
export type InsertPortfolioSnapshot = typeof portfolioSnapshots.$inferInsert;

// ─── Challenges ─────────────────────────────────────────────────────────────────
// Two types:
//   conviction  — managers pick ONE ticker during pickWindowEnd, then hold until holdWindowEnd
//   sprint      — best portfolio return over a date range wins an allocation bump
export const challenges = mysqlTable("challenges", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  type: mysqlEnum("type", ["conviction", "sprint", "earnings"]).notNull().default("sprint"),
  // conviction: managers pick a ticker before pickWindowEnd, then hold until holdWindowEnd
  // sprint: best sleeve return between startDate and endDate wins
  startDate: timestamp("startDate").notNull(),
  pickWindowEnd: timestamp("pickWindowEnd"),   // conviction only: deadline to submit pick
  endDate: timestamp("endDate").notNull(),      // when scoring happens
  // Prize: allocation bump awarded to winner (in dollars)
  allocationBump: decimal("allocationBump", { precision: 18, scale: 2 }).notNull().default("5000.00"),
  // Recurrence
  recurring: int("recurring").notNull().default(0),  // 1 = auto-recreate after endDate
  recurringInterval: mysqlEnum("recurringInterval", ["weekly", "monthly"]),
  status: mysqlEnum("status", ["upcoming", "picking", "active", "scoring", "completed"]).notNull().default("upcoming"),
  winnerId: int("winnerId"),   // sleeveId of winner, set after scoring
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Challenge = typeof challenges.$inferSelect;
export type InsertChallenge = typeof challenges.$inferInsert;

// ─── Challenge Entries ────────────────────────────────────────────────────────
export const challengeEntries = mysqlTable("challenge_entries", {
  id: int("id").autoincrement().primaryKey(),
  challengeId: int("challengeId").notNull(),
  sleeveId: int("sleeveId").notNull(),
  userId: int("userId").notNull(),
  // conviction: the ticker they picked and prices at pick/score time
  ticker: varchar("ticker", { length: 32 }),
  assetName: varchar("assetName", { length: 128 }),
  entryPrice: decimal("entryPrice", { precision: 18, scale: 6 }),
  exitPrice: decimal("exitPrice", { precision: 18, scale: 6 }),
  // sprint: sleeve totalValue at start and end
  startValue: decimal("startValue", { precision: 18, scale: 2 }),
  endValue: decimal("endValue", { precision: 18, scale: 2 }),
  returnPct: decimal("returnPct", { precision: 10, scale: 4 }),
  rank: int("rank"),
  isWinner: int("isWinner").notNull().default(0),
  enteredAt: timestamp("enteredAt").defaultNow().notNull(),
  scoredAt: timestamp("scoredAt"),
});

export type ChallengeEntry = typeof challengeEntries.$inferSelect;
export type InsertChallengeEntry = typeof challengeEntries.$inferInsert;

// ─── Earnings Picks ─────────────────────────────────────────────────────────────────────────────────
// One row per (challenge, sleeve, ticker). Managers can add as many picks as they want.
// direction: 'up' = stock opens higher than prevClose, 'down' = opens lower.
// result: 'pending' until admin scores, then 'correct' or 'wrong'.
export const earningsPicks = mysqlTable("earnings_picks", {
  id: int("id").autoincrement().primaryKey(),
  challengeId: int("challengeId").notNull(),
  sleeveId: int("sleeveId").notNull(),
  userId: int("userId").notNull(),
  ticker: varchar("ticker", { length: 32 }).notNull(),
  assetName: varchar("assetName", { length: 128 }),
  direction: mysqlEnum("direction", ["up", "down"]).notNull(),
  prevClose: decimal("prevClose", { precision: 18, scale: 6 }),   // price at pick time (pre-earnings close)
  openPrice: decimal("openPrice", { precision: 18, scale: 6 }),   // next-open price fetched at scoring
  result: mysqlEnum("result", ["pending", "correct", "wrong"]).notNull().default("pending"),
  points: int("points").notNull().default(0),                     // +1 correct, -1 wrong
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  scoredAt: timestamp("scoredAt"),
});

export type EarningsPick = typeof earningsPicks.$inferSelect;
export type InsertEarningsPick = typeof earningsPicks.$inferInsert;

// ─── Sessions ─────────────────────────────────────────────────────────────────
export const sessions = mysqlTable("sessions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: int("userId").notNull(),
  expiresAt: bigint("expiresAt", { mode: "number" }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Session = typeof sessions.$inferSelect;
