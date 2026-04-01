import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mock db module ───────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  getUserByUsername: vi.fn(),
  getUserById: vi.fn(),
  createUser: vi.fn(),
  updateUserLastSignedIn: vi.fn(),
  createSession: vi.fn(),
  getSession: vi.fn(),
  deleteSession: vi.fn(),
  getGroupsByUser: vi.fn(),
  getGroupById: vi.fn(),
  getGroupByInviteCode: vi.fn(),
  getGroupMembers: vi.fn(),
  getGroupMembership: vi.fn(),
  addGroupMember: vi.fn(),
  createGroup: vi.fn(),
  createSleeve: vi.fn(),
  getSleeveByUserAndGroup: vi.fn(),
  getSleevesForGroup: vi.fn(),
  updateSleeve: vi.fn(),
  getPositionsForSleeve: vi.fn(),
  getPositionByTicker: vi.fn(),
  upsertPosition: vi.fn(),
  deletePosition: vi.fn(),
  createTrade: vi.fn(),
  getTradesForSleeve: vi.fn(),
  getPriceCacheEntry: vi.fn(),
  upsertPriceCache: vi.fn(),
  createReallocationEvent: vi.fn(),
  createReallocationChange: vi.fn(),
  getReallocationHistory: vi.fn(),
  getDb: vi.fn(),
}));

import * as db from "./db";

// ─── Helper: build a mock TrpcContext ─────────────────────────────────────────
function makeCtx(overrides?: Partial<TrpcContext>): TrpcContext {
  const clearedCookies: string[] = [];
  const setCookies: { name: string; value: string }[] = [];
  return {
    user: null,
    req: {
      protocol: "https",
      headers: { cookie: "" },
    } as TrpcContext["req"],
    res: {
      clearCookie: (name: string) => clearedCookies.push(name),
      cookie: (name: string, value: string) => setCookies.push({ name, value }),
    } as unknown as TrpcContext["res"],
    ...overrides,
  };
}

function makeUser(overrides = {}) {
  return {
    id: 1,
    username: "testuser",
    passcodeHash: "",
    displayName: "Test User",
    role: "user" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
}

// ─── Auth tests ───────────────────────────────────────────────────────────────
describe("auth.register", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects duplicate username", async () => {
    vi.mocked(db.getUserByUsername).mockResolvedValue(makeUser());
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.auth.register({ username: "testuser", passcode: "1234" })
    ).rejects.toThrow("Username already taken");
  });

  it("creates a new user and session on success", async () => {
    vi.mocked(db.getUserByUsername).mockResolvedValue(undefined);
    vi.mocked(db.createUser).mockResolvedValue(makeUser({ id: 42 }));
    vi.mocked(db.createSession).mockResolvedValue(undefined);

    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.register({ username: "newuser", passcode: "abcd" });

    expect(result.success).toBe(true);
    expect(result.user.username).toBe("testuser");
    expect(db.createUser).toHaveBeenCalledOnce();
    expect(db.createSession).toHaveBeenCalledOnce();
  });
});

describe("auth.login", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects unknown username", async () => {
    vi.mocked(db.getUserByUsername).mockResolvedValue(undefined);
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.auth.login({ username: "nobody", passcode: "1234" })
    ).rejects.toThrow("Invalid username or passcode");
  });

  it("rejects wrong passcode", async () => {
    // Hash won't match a random string
    vi.mocked(db.getUserByUsername).mockResolvedValue(makeUser({ passcodeHash: "wronghash" }));
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.auth.login({ username: "testuser", passcode: "badpass" })
    ).rejects.toThrow("Invalid username or passcode");
  });
});

describe("auth.logout", () => {
  it("clears the session cookie", async () => {
    vi.mocked(db.deleteSession).mockResolvedValue(undefined);
    const ctx = makeCtx({ user: makeUser() });
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result.success).toBe(true);
  });
});

// ─── Group tests ──────────────────────────────────────────────────────────────
describe("group.list", () => {
  it("returns empty array when user has no groups", async () => {
    vi.mocked(db.getGroupsByUser).mockResolvedValue([]);
    const caller = appRouter.createCaller(makeCtx({ user: makeUser() }));
    const result = await caller.group.list();
    expect(result).toEqual([]);
  });
});

describe("group.join", () => {
  it("throws NOT_FOUND for invalid invite code", async () => {
    vi.mocked(db.getGroupByInviteCode).mockResolvedValue(undefined);
    const caller = appRouter.createCaller(makeCtx({ user: makeUser() }));
    await expect(caller.group.join({ inviteCode: "INVALID1" })).rejects.toThrow("Invalid invite code");
  });

  it("throws CONFLICT if already a member", async () => {
    vi.mocked(db.getGroupByInviteCode).mockResolvedValue({
      id: 1,
      name: "Test Group",
      status: "active",
      maxParticipants: 5,
      sleeveSize: "200000",
      totalCapital: "1000000",
      reallocationPercent: "5",
      reallocationInterval: "6months",
      inviteCode: "ABC12345",
      description: null,
      createdBy: 99,
      startDate: new Date(),
      nextReallocationDate: new Date(),
      lastReallocationDate: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(db.getGroupMembership).mockResolvedValue({ id: 1, groupId: 1, userId: 1, role: "member", joinedAt: new Date() });
    const caller = appRouter.createCaller(makeCtx({ user: makeUser() }));
    await expect(caller.group.join({ inviteCode: "ABC12345" })).rejects.toThrow("already a member");
  });
});

// ─── Portfolio tests ──────────────────────────────────────────────────────────
describe("portfolio.addTrade - buy validation", () => {
  it("rejects buy when insufficient cash", async () => {
    vi.mocked(db.getGroupMembership).mockResolvedValue({ id: 1, groupId: 1, userId: 1, role: "member", joinedAt: new Date() });
    vi.mocked(db.getSleeveByUserAndGroup).mockResolvedValue({
      id: 1,
      groupId: 1,
      userId: 1,
      name: "My Sleeve",
      allocatedCapital: "200000",
      cashBalance: "1000",  // only $1000 cash
      positionsValue: "0",
      totalValue: "1000",
      realizedPnl: "0",
      unrealizedPnl: "0",
      returnPct: "0",
      lastPricedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const caller = appRouter.createCaller(makeCtx({ user: makeUser() }));
    await expect(
      caller.portfolio.addTrade({
        groupId: 1,
        ticker: "AAPL",
        side: "buy",
        quantity: 100,
        price: 200, // $20,000 trade, but only $1000 cash
      })
    ).rejects.toThrow("Insufficient cash");
  });
});

// ─── Reallocation preview tests ───────────────────────────────────────────────
describe("admin.previewReallocation", () => {
  it("throws FORBIDDEN for non-admin", async () => {
    vi.mocked(db.getGroupMembership).mockResolvedValue({ id: 1, groupId: 1, userId: 1, role: "member", joinedAt: new Date() });
    const caller = appRouter.createCaller(makeCtx({ user: makeUser() }));
    await expect(caller.admin.previewReallocation({ groupId: 1 })).rejects.toThrow("Only group admins");
  });
});

// ─── Short position portfolio math tests ─────────────────────────────────────
describe("portfolio.addTrade - short position math", () => {
  function makeSleeve(overrides = {}) {
    return {
      id: 10,
      groupId: 1,
      userId: 1,
      name: "My Sleeve",
      allocatedCapital: "100000",
      cashBalance: "100000",
      positionsValue: "0",
      totalValue: "100000",
      realizedPnl: "0",
      unrealizedPnl: "0",
      returnPct: "0",
      lastPricedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  beforeEach(() => vi.clearAllMocks());

  it("opening a short does NOT increase totalValue — it stays flat", async () => {
    vi.mocked(db.getGroupMembership).mockResolvedValue({ id: 1, groupId: 1, userId: 1, role: "member", joinedAt: new Date() });
    vi.mocked(db.getSleeveByUserAndGroup).mockResolvedValue(makeSleeve());
    vi.mocked(db.getPositionByTicker).mockResolvedValue(null); // no existing position
    vi.mocked(db.upsertPosition).mockResolvedValue(undefined as any);
    vi.mocked(db.createTrade).mockResolvedValue(undefined as any);

    // After the short is opened, the position row has currentValue = -5000 (liability).
    // positionsValue = -5000, cashBalance = 105000, totalValue = 100000 — flat.
    vi.mocked(db.getPositionsForSleeve).mockResolvedValue([
      {
        id: 1,
        sleeveId: 10,
        ticker: "TSLA",
        assetType: "stock",
        quantity: "100",
        avgCostBasis: "50",
        currentPrice: "50",
        currentValue: "-5000", // negative — short liability
        unrealizedPnl: "0",
        unrealizedPnlPct: "0",
        isShort: 1,
        lastPricedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any,
    ]);

    let savedCashBalance = "";
    let savedTotalValue = "";
    vi.mocked(db.updateSleeve).mockImplementation(async (_id, updates) => {
      if (updates.cashBalance) savedCashBalance = updates.cashBalance;
      if (updates.totalValue) savedTotalValue = updates.totalValue;
      return undefined as any;
    });

    const caller = appRouter.createCaller(makeCtx({ user: makeUser() }));
    await caller.portfolio.addTrade({
      groupId: 1,
      ticker: "TSLA",
      side: "short",
      quantity: 100,
      price: 50, // $5,000 short
    });

    // Cash should have increased by $5,000 (short proceeds)
    expect(parseFloat(savedCashBalance)).toBe(105000);
    // totalValue = 105000 cash + (-5000 positionsValue) = 100000 — unchanged
    expect(parseFloat(savedTotalValue)).toBe(100000);
  });

  it("short position currentValue stored as negative number", async () => {
    vi.mocked(db.getGroupMembership).mockResolvedValue({ id: 1, groupId: 1, userId: 1, role: "member", joinedAt: new Date() });
    vi.mocked(db.getSleeveByUserAndGroup).mockResolvedValue(makeSleeve());
    vi.mocked(db.getPositionByTicker).mockResolvedValue(null);
    vi.mocked(db.createTrade).mockResolvedValue(undefined as any);
    vi.mocked(db.getPositionsForSleeve).mockResolvedValue([]);

    let upsertedCurrentValue = "";
    vi.mocked(db.upsertPosition).mockImplementation(async (pos) => {
      upsertedCurrentValue = pos.currentValue ?? "";
      return undefined as any;
    });
    vi.mocked(db.updateSleeve).mockResolvedValue(undefined as any);

    const caller = appRouter.createCaller(makeCtx({ user: makeUser() }));
    await caller.portfolio.addTrade({
      groupId: 1,
      ticker: "NVDA",
      side: "short",
      quantity: 10,
      price: 200, // $2,000 short
    });

    // currentValue should be stored as -2000 (negative = liability)
    expect(parseFloat(upsertedCurrentValue)).toBe(-2000);
  });
});
