import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import * as db from "../db";
import { challenges, challengeEntries } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { getQuote } from "../yahooFinance";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function assertGroupAdmin(groupId: number, userId: number) {
  const membership = await db.getGroupMembership(groupId, userId);
  if (!membership || membership.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Group admin only" });
  }
}

async function assertGroupMember(groupId: number, userId: number) {
  const membership = await db.getGroupMembership(groupId, userId);
  if (!membership) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this group" });
  }
}

function computeChallengeStatus(
  c: { startDate: Date | string; pickWindowEnd: Date | string | null; endDate: Date | string; type: string },
  now: Date
): "upcoming" | "picking" | "active" | "scoring" | "completed" {
  const start = new Date(c.startDate);
  const end = new Date(c.endDate);
  const pickEnd = c.pickWindowEnd ? new Date(c.pickWindowEnd) : null;
  if (now < start) return "upcoming";
  if (c.type === "conviction" && pickEnd && now < pickEnd) return "picking";
  if (now < end) return "active";
  return "scoring"; // scoring until admin marks completed
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const challengesRouter = router({
  // ── List all challenges for a group ──────────────────────────────────────
  list: protectedProcedure
    .input(z.object({ groupId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertGroupMember(input.groupId, ctx.user.id);
      const { getDb } = await import("../db");
      const drizzle = await getDb();
      if (!drizzle) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const rows = await drizzle
        .select()
        .from(challenges)
        .where(eq(challenges.groupId, input.groupId))
        .orderBy(challenges.startDate);

      const now = new Date();
      const mySleeve = await db.getSleeveByUserAndGroup(ctx.user.id, input.groupId);

      return Promise.all(
        rows.map(async (c) => {
          const liveStatus = computeChallengeStatus(c, now);
          // During pick window, tickers are hidden from competitors
          const picksHidden = liveStatus === "picking";

          // My own entry
          let myEntry = null;
          if (mySleeve) {
            const entries = await drizzle
              .select()
              .from(challengeEntries)
              .where(and(eq(challengeEntries.challengeId, c.id), eq(challengeEntries.sleeveId, mySleeve.id)));
            myEntry = entries[0] ?? null;
          }

          // All entries — enriched with display names, picks redacted during pick window
          const allEntries = await drizzle
            .select()
            .from(challengeEntries)
            .where(eq(challengeEntries.challengeId, c.id));

          const enrichedEntries = await Promise.all(
            allEntries.map(async (e) => {
              const entryUser = await db.getUserById(e.userId);
              const entrySleeve = await db.getSleeveById(e.sleeveId);
              const isMe = e.userId === ctx.user.id;
              return {
                id: e.id,
                sleeveId: e.sleeveId,
                userId: e.userId,
                displayName: entryUser?.displayName || entryUser?.username || "Unknown",
                isMe,
                // Conviction: hide ticker from competitors during pick window (but show own pick)
                ticker: picksHidden && !isMe ? null : e.ticker,
                assetName: picksHidden && !isMe ? null : e.assetName,
                entryPrice: picksHidden && !isMe ? null : e.entryPrice,
                exitPrice: e.exitPrice,
                returnPct: e.returnPct,
                rank: e.rank,
                isWinner: e.isWinner,
                // Sprint: show current sleeve value vs start
                startValue: e.startValue,
                currentValue: entrySleeve ? entrySleeve.totalValue : null,
                enteredAt: e.enteredAt,
              };
            })
          );

          // Sort: ranked entries first (by rank asc), then unranked
          enrichedEntries.sort((a, b) => {
            if (a.rank !== null && b.rank !== null) return a.rank - b.rank;
            if (a.rank !== null) return -1;
            if (b.rank !== null) return 1;
            return 0;
          });

          return { ...c, liveStatus, picksHidden, myEntry, entries: enrichedEntries, entryCount: allEntries.length };
        })
      );
    }),

  // ── Get a single challenge with all entries ───────────────────────────────
  get: protectedProcedure
    .input(z.object({ challengeId: z.number() }))
    .query(async ({ input, ctx }) => {
      const { getDb } = await import("../db");
      const drizzle = await getDb();
      if (!drizzle) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const [challenge] = await drizzle
        .select()
        .from(challenges)
        .where(eq(challenges.id, input.challengeId));
      if (!challenge) throw new TRPCError({ code: "NOT_FOUND" });
      await assertGroupMember(challenge.groupId, ctx.user.id);

      const entries = await drizzle
        .select()
        .from(challengeEntries)
        .where(eq(challengeEntries.challengeId, input.challengeId));

      // Enrich entries with user display names
      const enriched = await Promise.all(
        entries.map(async (e) => {
          const user = await db.getUserById(e.userId);
          const sleeve = await db.getSleeveById(e.sleeveId);
          return {
            ...e,
            displayName: user?.displayName || user?.username || "Unknown",
            isMe: e.userId === ctx.user.id,
            allocatedCapital: sleeve ? parseFloat(sleeve.allocatedCapital) : 0,
          };
        })
      );

      const now = new Date();
      const liveStatus = computeChallengeStatus(challenge, now);

      return { ...challenge, liveStatus, entries: enriched };
    }),

  // ── Create a challenge (admin only) ──────────────────────────────────────
  create: protectedProcedure
    .input(
      z.object({
        groupId: z.number(),
        name: z.string().min(1).max(128),
        description: z.string().optional(),
        type: z.enum(["conviction", "sprint"]),
        startDate: z.string(), // ISO string
        pickWindowEnd: z.string().optional(), // conviction only
        endDate: z.string(),
        allocationBump: z.number().positive(),
        recurring: z.boolean().default(false),
        recurringInterval: z.enum(["weekly", "monthly"]).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await assertGroupAdmin(input.groupId, ctx.user.id);
      const { getDb } = await import("../db");
      const drizzle = await getDb();
      if (!drizzle) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const start = new Date(input.startDate);
      const end = new Date(input.endDate);
      if (end <= start) throw new TRPCError({ code: "BAD_REQUEST", message: "End date must be after start date" });

      let pickWindowEnd: Date | null = null;
      if (input.type === "conviction") {
        if (!input.pickWindowEnd) throw new TRPCError({ code: "BAD_REQUEST", message: "Conviction challenges require a pick window end date" });
        pickWindowEnd = new Date(input.pickWindowEnd);
        if (pickWindowEnd <= start || pickWindowEnd >= end) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Pick window end must be between start and end dates" });
        }
      }

      const now = new Date();
      const liveStatus = computeChallengeStatus({ startDate: start, pickWindowEnd, endDate: end, type: input.type }, now);

      const [result] = await drizzle.insert(challenges).values({
        groupId: input.groupId,
        name: input.name,
        description: input.description ?? null,
        type: input.type,
        startDate: start,
        pickWindowEnd,
        endDate: end,
        allocationBump: String(input.allocationBump),
        recurring: input.recurring ? 1 : 0,
        recurringInterval: input.recurringInterval ?? null,
        status: liveStatus,
        createdBy: ctx.user.id,
      });

      return { success: true, challengeId: (result as any).insertId };
    }),

  // ── Delete a challenge (admin only) ──────────────────────────────────────
  delete: protectedProcedure
    .input(z.object({ challengeId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const { getDb } = await import("../db");
      const drizzle = await getDb();
      if (!drizzle) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const [challenge] = await drizzle.select().from(challenges).where(eq(challenges.id, input.challengeId));
      if (!challenge) throw new TRPCError({ code: "NOT_FOUND" });
      await assertGroupAdmin(challenge.groupId, ctx.user.id);

      await drizzle.delete(challengeEntries).where(eq(challengeEntries.challengeId, input.challengeId));
      await drizzle.delete(challenges).where(eq(challenges.id, input.challengeId));
      return { success: true };
    }),

  // ── Enter a conviction challenge (submit ticker pick) ─────────────────────
  enterConviction: protectedProcedure
    .input(
      z.object({
        challengeId: z.number(),
        ticker: z.string().min(1).max(32),
        assetName: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { getDb } = await import("../db");
      const drizzle = await getDb();
      if (!drizzle) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const [challenge] = await drizzle.select().from(challenges).where(eq(challenges.id, input.challengeId));
      if (!challenge) throw new TRPCError({ code: "NOT_FOUND" });
      await assertGroupMember(challenge.groupId, ctx.user.id);

      if (challenge.type !== "conviction") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This is not a conviction challenge" });
      }

      const now = new Date();
      const liveStatus = computeChallengeStatus(challenge, now);
      if (liveStatus !== "picking") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Pick window is not open" });
      }

      const sleeve = await db.getSleeveByUserAndGroup(ctx.user.id, challenge.groupId);
      if (!sleeve) throw new TRPCError({ code: "NOT_FOUND", message: "No sleeve in this group" });

      // Check if already entered
      const existing = await drizzle
        .select()
        .from(challengeEntries)
        .where(and(eq(challengeEntries.challengeId, input.challengeId), eq(challengeEntries.sleeveId, sleeve.id)));
      if (existing.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "You have already submitted a pick for this challenge" });
      }

      // Fetch live price as entry price
      const ticker = input.ticker.toUpperCase();
      let entryPrice: number | null = null;
      try {
        const quote = await getQuote(ticker);
        entryPrice = quote?.price ?? null;
      } catch {
        // If price fetch fails, still allow entry — will be scored later
      }

      await drizzle.insert(challengeEntries).values({
        challengeId: input.challengeId,
        sleeveId: sleeve.id,
        userId: ctx.user.id,
        ticker,
        assetName: input.assetName ?? ticker,
        entryPrice: entryPrice !== null ? String(entryPrice) : null,
        startValue: null,
        endValue: null,
        returnPct: null,
        rank: null,
        isWinner: 0,
      });

      return { success: true, ticker, entryPrice };
    }),

  // ── Auto-enroll all sleeve members in a sprint challenge ─────────────────
  // Called when sprint starts — records each sleeve's current totalValue as startValue
  enrollSprint: protectedProcedure
    .input(z.object({ challengeId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const { getDb } = await import("../db");
      const drizzle = await getDb();
      if (!drizzle) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const [challenge] = await drizzle.select().from(challenges).where(eq(challenges.id, input.challengeId));
      if (!challenge) throw new TRPCError({ code: "NOT_FOUND" });
      await assertGroupAdmin(challenge.groupId, ctx.user.id);

      if (challenge.type !== "sprint") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only sprint challenges can be enrolled" });
      }

      const sleeves = await db.getSleevesForGroup(challenge.groupId);
      let enrolled = 0;
      for (const sleeve of sleeves) {
        const existing = await drizzle
          .select()
          .from(challengeEntries)
          .where(and(eq(challengeEntries.challengeId, input.challengeId), eq(challengeEntries.sleeveId, sleeve.id)));
        if (existing.length === 0) {
          await drizzle.insert(challengeEntries).values({
            challengeId: input.challengeId,
            sleeveId: sleeve.id,
            userId: sleeve.userId,
            ticker: null,
            assetName: null,
            entryPrice: null,
            startValue: sleeve.totalValue,
            endValue: null,
            returnPct: null,
            rank: null,
            isWinner: 0,
          });
          enrolled++;
        }
      }
      return { success: true, enrolled };
    }),

  // ── Score a challenge (admin only) ────────────────────────────────────────
  // Fetches live prices for conviction picks or reads current sleeve values for sprint
  // Ranks entries, marks winner, awards allocation bump
  score: protectedProcedure
    .input(z.object({ challengeId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const { getDb } = await import("../db");
      const drizzle = await getDb();
      if (!drizzle) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const [challenge] = await drizzle.select().from(challenges).where(eq(challenges.id, input.challengeId));
      if (!challenge) throw new TRPCError({ code: "NOT_FOUND" });
      await assertGroupAdmin(challenge.groupId, ctx.user.id);

      const entries = await drizzle
        .select()
        .from(challengeEntries)
        .where(eq(challengeEntries.challengeId, input.challengeId));

      if (entries.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No entries to score" });
      }

      const now = new Date();
      const scored: Array<{ entry: typeof entries[0]; returnPct: number }> = [];

      if (challenge.type === "conviction") {
        // Fetch exit prices for all tickers
        for (const entry of entries) {
          if (!entry.ticker || !entry.entryPrice) {
            scored.push({ entry, returnPct: 0 });
            continue;
          }
          let exitPrice = parseFloat(entry.entryPrice);
          try {
            const quote = await getQuote(entry.ticker);
            if (quote?.price) exitPrice = quote.price;
          } catch {
            // Use entry price as fallback
          }
          const entryP = parseFloat(entry.entryPrice);
          const returnPct = entryP > 0 ? ((exitPrice - entryP) / entryP) * 100 : 0;
          await drizzle
            .update(challengeEntries)
            .set({ exitPrice: String(exitPrice), returnPct: String(returnPct), scoredAt: now })
            .where(eq(challengeEntries.id, entry.id));
          scored.push({ entry, returnPct });
        }
      } else {
        // Sprint: compare current sleeve totalValue vs startValue
        for (const entry of entries) {
          const sleeve = await db.getSleeveById(entry.sleeveId);
          if (!sleeve || !entry.startValue) {
            scored.push({ entry, returnPct: 0 });
            continue;
          }
          const endValue = parseFloat(sleeve.totalValue);
          const startValue = parseFloat(entry.startValue);
          const returnPct = startValue > 0 ? ((endValue - startValue) / startValue) * 100 : 0;
          await drizzle
            .update(challengeEntries)
            .set({ endValue: String(endValue), returnPct: String(returnPct), scoredAt: now })
            .where(eq(challengeEntries.id, entry.id));
          scored.push({ entry, returnPct });
        }
      }

      // Rank by returnPct descending
      scored.sort((a, b) => b.returnPct - a.returnPct);
      for (let i = 0; i < scored.length; i++) {
        const isWinner = i === 0 ? 1 : 0;
        await drizzle
          .update(challengeEntries)
          .set({ rank: i + 1, isWinner })
          .where(eq(challengeEntries.id, scored[i].entry.id));
      }

      const winner = scored[0];
      const bump = parseFloat(challenge.allocationBump);

      // Award allocation bump to winner
      if (winner && bump > 0) {
        const winnerSleeve = await db.getSleeveById(winner.entry.sleeveId);
        if (winnerSleeve) {
          const newAlloc = parseFloat(winnerSleeve.allocatedCapital) + bump;
          const newCash = parseFloat(winnerSleeve.cashBalance) + bump;
          const newTotal = parseFloat(winnerSleeve.totalValue) + bump;
          await db.updateSleeve(winnerSleeve.id, {
            allocatedCapital: String(newAlloc),
            cashBalance: String(newCash),
            totalValue: String(newTotal),
          });
        }
      }

      // Mark challenge as completed and record winner
      await drizzle
        .update(challenges)
        .set({ status: "completed", winnerId: winner?.entry.sleeveId ?? null })
        .where(eq(challenges.id, input.challengeId));

      // If recurring, create next challenge
      if (challenge.recurring && challenge.recurringInterval) {
        const nextStart = new Date(challenge.endDate);
        const nextEnd = new Date(challenge.endDate);
        let nextPickEnd: Date | null = null;

        if (challenge.recurringInterval === "weekly") {
          nextEnd.setDate(nextEnd.getDate() + 7);
          if (challenge.type === "conviction" && challenge.pickWindowEnd) {
            const pickDuration = challenge.pickWindowEnd.getTime() - challenge.startDate.getTime();
            nextPickEnd = new Date(nextStart.getTime() + pickDuration);
          }
        } else {
          nextEnd.setMonth(nextEnd.getMonth() + 1);
          if (challenge.type === "conviction" && challenge.pickWindowEnd) {
            const pickDuration = challenge.pickWindowEnd.getTime() - challenge.startDate.getTime();
            nextPickEnd = new Date(nextStart.getTime() + pickDuration);
          }
        }

        const nextLiveStatus = computeChallengeStatus(
          { startDate: nextStart, pickWindowEnd: nextPickEnd, endDate: nextEnd, type: challenge.type! },
          now
        );

        await drizzle.insert(challenges).values({
          groupId: challenge.groupId,
          name: challenge.name,
          description: challenge.description,
          type: challenge.type,
          startDate: nextStart,
          pickWindowEnd: nextPickEnd,
          endDate: nextEnd,
          allocationBump: challenge.allocationBump,
          recurring: challenge.recurring,
          recurringInterval: challenge.recurringInterval,
          status: nextLiveStatus,
          createdBy: challenge.createdBy,
        });
      }

      return {
        success: true,
        winner: winner ? { sleeveId: winner.entry.sleeveId, returnPct: winner.returnPct, bump } : null,
        ranked: scored.map((s, i) => ({ sleeveId: s.entry.sleeveId, rank: i + 1, returnPct: s.returnPct })),
      };
    }),
});
