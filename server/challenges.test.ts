/**
 * Unit tests for the Challenges feature:
 *  - computeChallengeStatus phase transitions
 *  - Pick visibility rules (hidden during pick window, revealed after)
 *  - Sprint live return calculation
 *  - Entry ranking sort order
 */

import { describe, it, expect } from "vitest";

// ─── Inline the pure helper so we don't import the full router ────────────────

function computeChallengeStatus(
  c: {
    startDate: Date | string;
    pickWindowEnd: Date | string | null;
    endDate: Date | string;
    type: string;
  },
  now: Date
): "upcoming" | "picking" | "active" | "scoring" | "completed" {
  const start = new Date(c.startDate);
  const end = new Date(c.endDate);
  const pickEnd = c.pickWindowEnd ? new Date(c.pickWindowEnd) : null;
  if (now < start) return "upcoming";
  if (c.type === "conviction" && pickEnd && now < pickEnd) return "picking";
  if (now < end) return "active";
  return "scoring";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeConviction(
  startOffset: number,
  pickOffset: number,
  endOffset: number,
  now = new Date()
) {
  const base = now.getTime();
  return {
    type: "conviction",
    startDate: new Date(base + startOffset),
    pickWindowEnd: new Date(base + pickOffset),
    endDate: new Date(base + endOffset),
  };
}

function makeSprint(startOffset: number, endOffset: number, now = new Date()) {
  const base = now.getTime();
  return {
    type: "sprint",
    startDate: new Date(base + startOffset),
    pickWindowEnd: null,
    endDate: new Date(base + endOffset),
  };
}

const MS = {
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
};

// ─── computeChallengeStatus ───────────────────────────────────────────────────

describe("computeChallengeStatus — conviction", () => {
  it("returns 'upcoming' before start", () => {
    const c = makeConviction(MS.day, 2 * MS.day, 7 * MS.day);
    expect(computeChallengeStatus(c, new Date())).toBe("upcoming");
  });

  it("returns 'picking' after start but before pick window end", () => {
    const c = makeConviction(-MS.hour, MS.day, 7 * MS.day);
    expect(computeChallengeStatus(c, new Date())).toBe("picking");
  });

  it("returns 'active' after pick window closes but before end", () => {
    const c = makeConviction(-2 * MS.day, -MS.hour, MS.day);
    expect(computeChallengeStatus(c, new Date())).toBe("active");
  });

  it("returns 'scoring' after end date", () => {
    const c = makeConviction(-7 * MS.day, -5 * MS.day, -MS.day);
    expect(computeChallengeStatus(c, new Date())).toBe("scoring");
  });
});

describe("computeChallengeStatus — sprint", () => {
  it("returns 'upcoming' before start", () => {
    const c = makeSprint(MS.day, 7 * MS.day);
    expect(computeChallengeStatus(c, new Date())).toBe("upcoming");
  });

  it("returns 'active' after start and before end", () => {
    const c = makeSprint(-MS.day, MS.day);
    expect(computeChallengeStatus(c, new Date())).toBe("active");
  });

  it("returns 'scoring' after end date", () => {
    const c = makeSprint(-7 * MS.day, -MS.day);
    expect(computeChallengeStatus(c, new Date())).toBe("scoring");
  });

  it("never returns 'picking' for a sprint (no pick window)", () => {
    const c = makeSprint(-MS.hour, MS.day);
    expect(computeChallengeStatus(c, new Date())).not.toBe("picking");
  });
});

// ─── Pick visibility rules ────────────────────────────────────────────────────

describe("Pick visibility — conviction challenge", () => {
  /**
   * Simulate the backend redaction logic:
   * During 'picking' phase, competitors see ticker=null; own pick is always visible.
   */
  function applyVisibility(
    entries: Array<{ userId: number; ticker: string | null }>,
    viewerUserId: number,
    picksHidden: boolean
  ) {
    return entries.map((e) => ({
      ...e,
      ticker: picksHidden && e.userId !== viewerUserId ? null : e.ticker,
    }));
  }

  const entries = [
    { userId: 1, ticker: "NVDA" },
    { userId: 2, ticker: "AAPL" },
    { userId: 3, ticker: "TSLA" },
  ];

  it("hides all competitors' tickers during pick window", () => {
    const result = applyVisibility(entries, 1, true);
    // Own pick visible
    expect(result.find((e) => e.userId === 1)?.ticker).toBe("NVDA");
    // Competitors hidden
    expect(result.find((e) => e.userId === 2)?.ticker).toBeNull();
    expect(result.find((e) => e.userId === 3)?.ticker).toBeNull();
  });

  it("reveals all tickers once pick window closes", () => {
    const result = applyVisibility(entries, 1, false);
    expect(result.find((e) => e.userId === 1)?.ticker).toBe("NVDA");
    expect(result.find((e) => e.userId === 2)?.ticker).toBe("AAPL");
    expect(result.find((e) => e.userId === 3)?.ticker).toBe("TSLA");
  });

  it("viewer who hasn't submitted sees all nulls during pick window", () => {
    const result = applyVisibility(entries, 99, true); // userId 99 has no entry
    expect(result.every((e) => e.ticker === null)).toBe(true);
  });
});

// ─── Sprint live return calculation ──────────────────────────────────────────

describe("Sprint live return calculation", () => {
  function sprintReturn(startValue: number, currentValue: number): number | null {
    if (startValue <= 0) return null;
    return ((currentValue - startValue) / startValue) * 100;
  }

  it("calculates positive return correctly", () => {
    expect(sprintReturn(100_000, 110_000)).toBeCloseTo(10.0);
  });

  it("calculates negative return correctly", () => {
    expect(sprintReturn(100_000, 90_000)).toBeCloseTo(-10.0);
  });

  it("returns 0 when value is unchanged", () => {
    expect(sprintReturn(100_000, 100_000)).toBeCloseTo(0);
  });

  it("returns null for zero start value (avoids division by zero)", () => {
    expect(sprintReturn(0, 50_000)).toBeNull();
  });
});

// ─── Entry ranking sort ───────────────────────────────────────────────────────

describe("Entry ranking sort order", () => {
  /**
   * Ranked entries (rank !== null) should sort ascending by rank.
   * Unranked entries (rank === null) sort by liveReturn descending.
   * Entries with no return go last.
   */
  function sortEntries(
    entries: Array<{ id: number; rank: number | null; liveReturn: number | null }>
  ) {
    return [...entries].sort((a, b) => {
      if (a.rank !== null && b.rank !== null) return a.rank - b.rank;
      if (a.rank !== null) return -1;
      if (b.rank !== null) return 1;
      if (a.liveReturn !== null && b.liveReturn !== null) return b.liveReturn - a.liveReturn;
      if (a.liveReturn !== null) return -1;
      if (b.liveReturn !== null) return 1;
      return 0;
    });
  }

  it("sorts ranked entries by rank ascending", () => {
    const entries = [
      { id: 3, rank: 3, liveReturn: 5 },
      { id: 1, rank: 1, liveReturn: 25 },
      { id: 2, rank: 2, liveReturn: 15 },
    ];
    const sorted = sortEntries(entries);
    expect(sorted.map((e) => e.id)).toEqual([1, 2, 3]);
  });

  it("puts ranked entries before unranked", () => {
    const entries = [
      { id: 1, rank: null, liveReturn: 30 },
      { id: 2, rank: 1,    liveReturn: 10 },
    ];
    const sorted = sortEntries(entries);
    expect(sorted[0].id).toBe(2); // ranked first
    expect(sorted[1].id).toBe(1); // unranked second
  });

  it("sorts unranked entries by liveReturn descending", () => {
    const entries = [
      { id: 1, rank: null, liveReturn: 5 },
      { id: 2, rank: null, liveReturn: 20 },
      { id: 3, rank: null, liveReturn: -3 },
    ];
    const sorted = sortEntries(entries);
    expect(sorted.map((e) => e.id)).toEqual([2, 1, 3]);
  });

  it("puts null-return entries last", () => {
    const entries = [
      { id: 1, rank: null, liveReturn: null },
      { id: 2, rank: null, liveReturn: 10 },
    ];
    const sorted = sortEntries(entries);
    expect(sorted[0].id).toBe(2);
    expect(sorted[1].id).toBe(1);
  });
});

// ─── Conviction return calculation ───────────────────────────────────────────

describe("Conviction pick return calculation", () => {
  function convictionReturn(entryPrice: number, exitPrice: number): number {
    return entryPrice > 0 ? ((exitPrice - entryPrice) / entryPrice) * 100 : 0;
  }

  it("calculates gain correctly", () => {
    expect(convictionReturn(100, 150)).toBeCloseTo(50.0);
  });

  it("calculates loss correctly", () => {
    expect(convictionReturn(100, 80)).toBeCloseTo(-20.0);
  });

  it("returns 0 for zero entry price", () => {
    expect(convictionReturn(0, 100)).toBe(0);
  });
});
