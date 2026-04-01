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
          const totalValue = cashBalance + totalPositionsValue;
          const returnPct =
            allocatedCapital !== 0
              ? ((totalValue - allocatedCapital) / allocatedCapital) * 100
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
 * Register all cron jobs. Call once from server startup.
 */
export function registerCronJobs() {
  // 4:05 PM Eastern Time, Mon–Fri
  // Cron fields: second minute hour day month weekday
  const schedule = "0 5 16 * * 1-5";

  cron.schedule(schedule, snapshotAllGroups, {
    timezone: "America/New_York",
  });

  console.log("[Cron] End-of-day snapshot scheduled: 4:05 PM ET, Mon–Fri");
}
