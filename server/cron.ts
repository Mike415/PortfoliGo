/**
 * Scheduled jobs for PortfoliGo.
 *
 * End-of-day snapshot: fires at 4:05 PM Eastern Time (21:05 UTC) every
 * weekday (Mon–Fri). Refreshes prices for every position in every active
 * group and writes one portfolio_snapshot row per sleeve so the equity
 * curve has a clean daily data point regardless of user activity.
 *
 * node-cron v4 uses the system timezone by default; we pass
 * { timezone: "America/New_York" } to keep the schedule correct across
 * DST transitions.
 */

import cron from "node-cron";
import * as db from "./db";
import { getQuote } from "./yahooFinance";
import { notifyOwner } from "./_core/notification";
import { challenges, earningsPicks, challengeEntries } from "../drizzle/schema";
import { eq, and, lte, ne } from "drizzle-orm";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchPrice(ticker: string): Promise<{ price: number } | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const q = await getQuote(ticker);
      return { price: q.price };
    } catch (err: any) {
      if (attempt < 2) {
        await sleep((attempt + 1) * 2000);
      } else {
        console.error(`[Cron] Failed to fetch price for ${ticker}:`, err?.message);
        return null;
      }
    }
  }
  return null;
}

async function snapshotAllGroups() {
  const startedAt = Date.now();
  console.log("[Cron] End-of-day snapshot starting…");

  let groupCount = 0;
  let sleeveCount = 0;
  let errorCount = 0;

  try {
    const allGroups = await db.getActiveGroups();

    for (const group of allGroups) {
      groupCount++;
      const sleeves = await db.getSleevesForGroup(group.id);

      for (const sleeve of sleeves) {
        try {
          const positions = await db.getPositionsForSleeve(sleeve.id);

          const priceResults: { currentValue: number; unrealizedPnl: number }[] = [];

          for (const pos of positions) {
            // Small inter-request delay to avoid rate-limiting
            await sleep(300);

            const result = await fetchPrice(pos.ticker);
            const qty = parseFloat(pos.quantity);
            const avgCost = parseFloat(pos.avgCostBasis);
            const isShort = pos.isShort === 1;

            if (result) {
              const { price } = result;
              // Short currentValue is NEGATIVE (liability): -(qty × price).
              // Cash proceeds were already credited on open, so this keeps
              // totalValue = cashBalance + positionsValue correct.
              const currentValue = isShort ? -(qty * price) : qty * price;
              const unrealizedPnl = isShort
                ? (avgCost - price) * qty
                : (price - avgCost) * qty;
              const unrealizedPnlPct =
                avgCost !== 0
                  ? isShort
                    ? ((avgCost - price) / avgCost) * 100
                    : ((price - avgCost) / avgCost) * 100
                  : 0;

              await db.upsertPosition({
                ...pos,
                currentPrice: String(price),
                currentValue: String(currentValue),
                unrealizedPnl: String(unrealizedPnl),
                unrealizedPnlPct: String(unrealizedPnlPct),
                lastPricedAt: new Date(),
              });

              priceResults.push({ currentValue, unrealizedPnl });
            } else {
              // Use last known values so totals stay consistent.
              // Apply sign correction — DB may have stale positive value from before the fix.
              const rawCronFallback = pos.currentValue ? parseFloat(pos.currentValue) : 0;
              priceResults.push({
                currentValue: isShort ? -Math.abs(rawCronFallback) : Math.abs(rawCronFallback),
                unrealizedPnl: pos.unrealizedPnl ? parseFloat(pos.unrealizedPnl) : 0,
              });
            }
          }

          const totalPositionsValue = priceResults.reduce((s, r) => s + r.currentValue, 0);
          const totalUnrealizedPnl = priceResults.reduce((s, r) => s + r.unrealizedPnl, 0);
          const cashBalance = parseFloat(sleeve.cashBalance);
          const allocatedCapital = parseFloat(sleeve.allocatedCapital);
          const startingCapital = parseFloat(sleeve.startingCapital ?? sleeve.allocatedCapital);
          const totalValue = cashBalance + totalPositionsValue;
          const returnPct =
            startingCapital !== 0
              ? ((totalValue - startingCapital) / startingCapital) * 100
              : 0;

          await db.updateSleeve(sleeve.id, {
            positionsValue: String(totalPositionsValue),
            totalValue: String(totalValue),
            unrealizedPnl: String(totalUnrealizedPnl),
            returnPct: String(returnPct),
            lastPricedAt: new Date(),
          });

          // Write the daily snapshot row
          await db.insertSnapshot({
            sleeveId: sleeve.id,
            totalValue: String(totalValue),
            positionsValue: String(totalPositionsValue),
            cashBalance: String(cashBalance),
            returnPct: String(returnPct),
          });

          sleeveCount++;
        } catch (sleeveErr: any) {
          errorCount++;
          console.error(
            `[Cron] Error snapshotting sleeve ${sleeve.id} (group ${group.id}):`,
            sleeveErr?.message
          );
        }
      }
    }

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    const summary = `End-of-day snapshot complete: ${groupCount} groups, ${sleeveCount} sleeves, ${errorCount} errors — ${elapsed}s`;
    console.log(`[Cron] ${summary}`);

    // Notify owner so they can monitor job health
    await notifyOwner({
      title: "📸 Daily Snapshot Complete",
      content: summary,
    }).catch(() => {/* non-fatal */});

  } catch (err: any) {
    console.error("[Cron] Fatal error during end-of-day snapshot:", err?.message);
    await notifyOwner({
      title: "⚠️ Daily Snapshot Failed",
      content: `End-of-day snapshot job threw an unhandled error: ${err?.message}`,
    }).catch(() => {/* non-fatal */});
  }
}

/**
 * Auto-score earnings picks at 9:35 AM ET.
 *
 * Finds all earnings challenges that are not yet completed and have at least
 * one pending pick whose reportDate is on or before today (ET). Fetches the
 * current market price as the "open" settlement price, scores correct/wrong,
 * aggregates points, awards allocation bumps, and marks the challenge completed.
 *
 * Runs every weekday at 9:35 AM ET so the market has had 5 minutes to open.
 */
async function autoScoreEarnings() {
  const startedAt = Date.now();
  console.log("[Cron] Auto-score earnings starting…");

  try {
    const drizzle = await db.getDb();
    if (!drizzle) {
      console.error("[Cron] Auto-score: database not available");
      return;
    }

    // Today in ET as YYYY-MM-DD
    const todayET = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

    // Find all active/scoring earnings challenges
    const activeChallenges = await drizzle
      .select()
      .from(challenges)
      .where(
        and(
          eq(challenges.type, "earnings"),
          ne(challenges.status, "completed")
        )
      );

    let scored = 0;
    let skipped = 0;

    for (const challenge of activeChallenges) {
      // Get all pending picks for this challenge whose reportDate <= today
      const pendingPicks = await drizzle
        .select()
        .from(earningsPicks)
        .where(
          and(
            eq(earningsPicks.challengeId, challenge.id),
            eq(earningsPicks.result, "pending")
          )
        );

      // Filter to picks whose reportDate is on or before today
      const scorablePicks = pendingPicks.filter((p) => {
        if (!p.reportDate) return false;
        return p.reportDate <= todayET;
      });

      if (scorablePicks.length === 0) {
        skipped++;
        continue;
      }

      const now = new Date();
      let anyScored = false;

      for (const pick of scorablePicks) {
        let openPrice: number | null = null;
        try {
          await sleep(400); // rate-limit courtesy delay
          const quote = await getQuote(pick.ticker);
          openPrice = quote?.price ?? null;
        } catch {
          console.warn(`[Cron] Auto-score: could not fetch price for ${pick.ticker}`);
        }

        if (openPrice === null || pick.prevClose === null) continue;

        const prevClose = parseFloat(pick.prevClose);
        const movedUp = openPrice > prevClose;
        const correct = (pick.direction === "up" && movedUp) || (pick.direction === "down" && !movedUp);
        const result: "correct" | "wrong" = correct ? "correct" : "wrong";
        const points = correct ? 1 : -1;

        await drizzle
          .update(earningsPicks)
          .set({ openPrice: String(openPrice), result, points, scoredAt: now })
          .where(eq(earningsPicks.id, pick.id));

        scored++;
        anyScored = true;
      }

      if (!anyScored) continue;

      // Check if all picks for this challenge are now resolved
      const remainingPending = await drizzle
        .select()
        .from(earningsPicks)
        .where(
          and(
            eq(earningsPicks.challengeId, challenge.id),
            eq(earningsPicks.result, "pending")
          )
        );

      if (remainingPending.length > 0) {
        // Some picks still pending (future report dates) — don't close yet
        continue;
      }

      // All picks resolved — aggregate points and close the challenge
      const allPicks = await drizzle
        .select()
        .from(earningsPicks)
        .where(eq(earningsPicks.challengeId, challenge.id));

      const pointsByUser = new Map<number, { sleeveId: number; userId: number; totalPoints: number }>();
      for (const p of allPicks) {
        if (!pointsByUser.has(p.userId)) {
          pointsByUser.set(p.userId, { sleeveId: p.sleeveId, userId: p.userId, totalPoints: 0 });
        }
        pointsByUser.get(p.userId)!.totalPoints += p.points;
      }

      const ranked = Array.from(pointsByUser.values()).sort((a, b) => b.totalPoints - a.totalPoints);

      for (let i = 0; i < ranked.length; i++) {
        const { sleeveId, userId, totalPoints } = ranked[i];
        const isWinner = i === 0 ? 1 : 0;
        const existing = await drizzle
          .select()
          .from(challengeEntries)
          .where(and(eq(challengeEntries.challengeId, challenge.id), eq(challengeEntries.sleeveId, sleeveId)));

        if (existing.length > 0) {
          await drizzle
            .update(challengeEntries)
            .set({ returnPct: String(totalPoints), rank: i + 1, isWinner, scoredAt: now })
            .where(eq(challengeEntries.id, existing[0].id));
        } else {
          await drizzle.insert(challengeEntries).values({
            challengeId: challenge.id,
            sleeveId,
            userId,
            ticker: null,
            assetName: null,
            entryPrice: null,
            startValue: null,
            endValue: null,
            returnPct: String(totalPoints),
            rank: i + 1,
            isWinner,
            scoredAt: now,
          });
        }
      }

      const winner = ranked[0];
      const bump = parseFloat(challenge.allocationBump);

      if (winner && bump > 0) {
        const winnerSleeve = await db.getSleeveById(winner.sleeveId);
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

      await drizzle
        .update(challenges)
        .set({ status: "completed", winnerId: winner?.sleeveId ?? null })
        .where(eq(challenges.id, challenge.id));

      console.log(`[Cron] Auto-scored challenge ${challenge.id} ("${challenge.name}") — winner sleeveId=${winner?.sleeveId}, bump=$${bump}`);
    }

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    const summary = `Auto-score earnings complete: ${scored} picks scored, ${skipped} challenges skipped — ${elapsed}s`;
    console.log(`[Cron] ${summary}`);

    if (scored > 0) {
      await notifyOwner({
        title: "🏆 Earnings Auto-Score Complete",
        content: summary,
      }).catch(() => {/* non-fatal */});
    }
  } catch (err: any) {
    console.error("[Cron] Fatal error during auto-score earnings:", err?.message);
    await notifyOwner({
      title: "⚠️ Earnings Auto-Score Failed",
      content: `Auto-score earnings job threw an unhandled error: ${err?.message}`,
    }).catch(() => {/* non-fatal */});
  }
}

/**
 * Register all cron jobs. Call once from server startup.
 */
export function registerCronJobs() {
  // 4:05 PM Eastern Time, Mon–Fri
  // Cron fields: second minute hour day month weekday
  const schedule = "0 5 16 * * 1-5";

  cron.schedule(schedule, snapshotAllGroups, {
    timezone: "America/New_York",
  });

  // 9:35 AM Eastern Time, Mon–Fri — score earnings picks at open
  cron.schedule("0 35 9 * * 1-5", autoScoreEarnings, {
    timezone: "America/New_York",
  });

  console.log("[Cron] End-of-day snapshot scheduled: 4:05 PM ET, Mon–Fri");
  console.log("[Cron] Earnings auto-score scheduled: 9:35 AM ET, Mon–Fri");
}
