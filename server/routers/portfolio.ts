import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { z } from "zod";
import { getQuote, getSpxHistory, type AssetType } from "../yahooFinance";

async function fetchPrice(ticker: string, forceRefresh = false): Promise<{ price: number; assetType: AssetType; name: string | null; priceSource: "regular" | "pre" | "post" }> {
  const CACHE_TTL = 5 * 60 * 1000;

  if (!forceRefresh) {
    const cached = await db.getPriceCacheEntry(ticker);
    if (cached && Date.now() - cached.updatedAt.getTime() < CACHE_TTL) {
      return {
        price: parseFloat(cached.price),
        assetType: cached.assetType as AssetType,
        name: cached.name,
        priceSource: (cached.priceSource ?? "regular") as "regular" | "pre" | "post",
      };
    }
  }

  const q = await getQuote(ticker);
  await db.upsertPriceCache(ticker, q.assetType, String(q.price), String(q.change), String(q.changePct), q.name, q.priceSource);
  return { price: q.price, assetType: q.assetType, name: q.name, priceSource: q.priceSource };
}

/** Save a snapshot of sleeve state (called after every price refresh) */
async function saveSnapshot(sleeve: {
  id: number;
  totalValue: string;
  positionsValue: string;
  cashBalance: string;
  returnPct: string;
}) {
  try {
    await db.insertSnapshot({
      sleeveId: sleeve.id,
      totalValue: sleeve.totalValue,
      positionsValue: sleeve.positionsValue,
      cashBalance: sleeve.cashBalance,
      returnPct: sleeve.returnPct,
    });
  } catch (err) {
    // Non-fatal — don't break the refresh flow
    console.error("[Portfolio] Failed to save snapshot:", err);
  }
}

export const portfolioRouter = router({
  // Get my sleeve for a group
  getMySleeve: protectedProcedure
    .input(z.object({ groupId: z.number() }))
    .query(async ({ input, ctx }) => {
      const membership = await db.getGroupMembership(input.groupId, ctx.user.id);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this group" });

      const sleeve = await db.getSleeveByUserAndGroup(ctx.user.id, input.groupId);
      if (!sleeve) throw new TRPCError({ code: "NOT_FOUND", message: "Sleeve not found" });

      const positions = await db.getPositionsForSleeve(sleeve.id);
      // Fetch price source from cache for each position
      const priceSources = await Promise.all(
        positions.map((p) => db.getPriceCacheEntry(p.ticker))
      );

      return {
        ...sleeve,
        allocatedCapital: parseFloat(sleeve.allocatedCapital),
        cashBalance: parseFloat(sleeve.cashBalance),
        positionsValue: parseFloat(sleeve.positionsValue),
        totalValue: parseFloat(sleeve.totalValue),
        realizedPnl: parseFloat(sleeve.realizedPnl),
        unrealizedPnl: parseFloat(sleeve.unrealizedPnl),
        returnPct: parseFloat(sleeve.returnPct),
        positions: positions.map((p, i) => ({
          ...p,
          quantity: parseFloat(p.quantity),
          avgCostBasis: parseFloat(p.avgCostBasis),
          currentPrice: p.currentPrice ? parseFloat(p.currentPrice) : 0,
          currentValue: p.currentValue ? parseFloat(p.currentValue) : 0,
          unrealizedPnl: p.unrealizedPnl ? parseFloat(p.unrealizedPnl) : 0,
          unrealizedPnlPct: p.unrealizedPnlPct ? parseFloat(p.unrealizedPnlPct) : 0,
          isShort: p.isShort === 1,
          priceSource: (priceSources[i]?.priceSource ?? "regular") as "regular" | "pre" | "post",
          companyName: priceSources[i]?.name ?? null,
        })),
      };
    }),

  // Get any sleeve by ID — any group member can view (read-only for non-owners)
  getSleeveById: protectedProcedure
    .input(z.object({ sleeveId: z.number(), groupId: z.number() }))
    .query(async ({ input, ctx }) => {
      const membership = await db.getGroupMembership(input.groupId, ctx.user.id);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this group" });

      const sleeve = await db.getSleeveById(input.sleeveId);
      if (!sleeve || sleeve.groupId !== input.groupId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Sleeve not found" });
      }

      const owner = await db.getUserById(sleeve.userId);
      const positions = await db.getPositionsForSleeve(sleeve.id);
      const isOwner = sleeve.userId === ctx.user.id;
      const priceSources2 = await Promise.all(
        positions.map((p) => db.getPriceCacheEntry(p.ticker))
      );

      return {
        ...sleeve,
        allocatedCapital: parseFloat(sleeve.allocatedCapital),
        cashBalance: parseFloat(sleeve.cashBalance),
        positionsValue: parseFloat(sleeve.positionsValue),
        totalValue: parseFloat(sleeve.totalValue),
        realizedPnl: parseFloat(sleeve.realizedPnl),
        unrealizedPnl: parseFloat(sleeve.unrealizedPnl),
        returnPct: parseFloat(sleeve.returnPct),
        lastPricedAt: sleeve.lastPricedAt,
        isOwner,
        ownerDisplayName: owner?.displayName || owner?.username || "Unknown",
        positions: positions.map((p, i) => ({
          ...p,
          quantity: parseFloat(p.quantity),
          avgCostBasis: parseFloat(p.avgCostBasis),
          currentPrice: p.currentPrice ? parseFloat(p.currentPrice) : 0,
          currentValue: p.currentValue ? parseFloat(p.currentValue) : 0,
          unrealizedPnl: p.unrealizedPnl ? parseFloat(p.unrealizedPnl) : 0,
          unrealizedPnlPct: p.unrealizedPnlPct ? parseFloat(p.unrealizedPnlPct) : 0,
          isShort: p.isShort === 1,
          priceSource: (priceSources2[i]?.priceSource ?? "regular") as "regular" | "pre" | "post",
          companyName: priceSources2[i]?.name ?? null,
        })),
      };
    }),

  // Get snapshots for ALL sleeves in a group (for leaderboard multi-line chart)
  getLeaderboardSnapshots: protectedProcedure
    .input(z.object({ groupId: z.number(), limit: z.number().int().min(1).max(365).default(90) }))
    .query(async ({ input, ctx }) => {
      const membership = await db.getGroupMembership(input.groupId, ctx.user.id);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this group" });

      const sleeves = await db.getSleevesForGroup(input.groupId);
      if (sleeves.length === 0) return { series: [], dates: [] };

      const sleeveIds = sleeves.map((s) => s.id);
      const allSnaps = await db.getSnapshotsForSleeves(sleeveIds, input.limit);

      // Build a map: sleeveId → sorted snapshots (ascending)
      const bySleeveId = new Map<number, { date: string; totalValue: number }[]>();
      for (const sleeve of sleeves) {
        bySleeveId.set(sleeve.id, []);
      }
      for (const snap of allSnaps) {
        const arr = bySleeveId.get(snap.sleeveId);
        if (arr) {
          const d = new Date(snap.snapshotAt);
          // Use ISO date string YYYY-MM-DD for reliable chronological sorting on the frontend
          const isoDate = d.toISOString().slice(0, 10);
          arr.push({
            date: isoDate,
            totalValue: parseFloat(snap.totalValue),
          });
        }
      }
      // Sort each series ascending by ISO date string
      for (const arr of Array.from(bySleeveId.values())) {
        arr.sort((a: { date: string; totalValue: number }, b: { date: string; totalValue: number }) =>
          a.date.localeCompare(b.date)
        );
      }

      // Build per-sleeve series with user info
      const series = await Promise.all(
        sleeves.map(async (sleeve) => {
          const user = await db.getUserById(sleeve.userId);
          return {
            sleeveId: sleeve.id,
            userId: sleeve.userId,
            displayName: user?.displayName || user?.username || "Unknown",
            isMe: sleeve.userId === ctx.user.id,
            data: bySleeveId.get(sleeve.id) ?? [],
          };
        })
      );

      return { series };
    }),

  // Get equity curve snapshots for my sleeve
  getSnapshots: protectedProcedure
    .input(z.object({
      groupId: z.number(),
      limit: z.number().int().min(1).max(365).default(90),
      sleeveId: z.number().int().optional(), // when provided, fetch snapshots for this specific sleeve (view-only)
    }))
    .query(async ({ input, ctx }) => {
      // Verify the caller is a member of the group
      const membership = await db.getGroupMembership(input.groupId, ctx.user.id);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this group" });

      let sleeve;
      if (input.sleeveId) {
        // View-only: fetch the specific sleeve being viewed (must belong to this group)
        sleeve = await db.getSleeveById(input.sleeveId);
        if (!sleeve || sleeve.groupId !== input.groupId) return [];
      } else {
        sleeve = await db.getSleeveByUserAndGroup(ctx.user.id, input.groupId);
      }
      if (!sleeve) return [];

      const snaps = await db.getSnapshotsForSleeve(sleeve.id, input.limit);
      // Return in ascending order for charting
      return snaps
        .reverse()
        .map((s) => ({
          snapshotAt: s.snapshotAt,
          totalValue: parseFloat(s.totalValue),
          positionsValue: parseFloat(s.positionsValue),
          cashBalance: parseFloat(s.cashBalance),
          returnPct: parseFloat(s.returnPct),
        }));
    }),

  // Refresh prices for all positions in a sleeve
  refreshPrices: protectedProcedure
    .input(z.object({ groupId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const membership = await db.getGroupMembership(input.groupId, ctx.user.id);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this group" });

      const sleeve = await db.getSleeveByUserAndGroup(ctx.user.id, input.groupId);
      if (!sleeve) throw new TRPCError({ code: "NOT_FOUND", message: "Sleeve not found" });

      const positions = await db.getPositionsForSleeve(sleeve.id);
      if (positions.length === 0) return { success: true, updated: 0 };

      // Fetch prices sequentially to avoid race conditions on the accumulator
      const priceResults: { posId: number; currentValue: number; unrealizedPnl: number; priceSource: "regular" | "pre" | "post" }[] = [];

      for (const pos of positions) {
        try {
          const { price, priceSource } = await fetchPrice(pos.ticker, true);
          const qty = parseFloat(pos.quantity);
          const avgCost = parseFloat(pos.avgCostBasis);
          const isShort = pos.isShort === 1;

          // For short positions: profit when price falls below avg cost.
          // Short currentValue is NEGATIVE (it is a liability): -(qty × price).
          // This keeps totalValue = cashBalance + positionsValue correct because
          // the short proceeds were already credited to cashBalance on open.
          const currentValue = isShort ? -(qty * price) : qty * price;
          const unrealizedPnl = isShort
            ? (avgCost - price) * qty  // short: profit when price drops
            : (price - avgCost) * qty;
          const unrealizedPnlPct = avgCost !== 0
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

          priceResults.push({ posId: pos.id, currentValue, unrealizedPnl, priceSource });
        } catch (err) {
          console.error(`[Portfolio] Failed to refresh price for ${pos.ticker}:`, err);
          const isShortFallback = pos.isShort === 1;
          // Apply sign correction even on fallback — DB may have stale positive value from before the fix
          const rawLastValue = pos.currentValue ? parseFloat(pos.currentValue) : 0;
          const lastValue = isShortFallback ? -Math.abs(rawLastValue) : Math.abs(rawLastValue);
          const lastPnl = pos.unrealizedPnl ? parseFloat(pos.unrealizedPnl) : 0;
          priceResults.push({ posId: pos.id, currentValue: lastValue, unrealizedPnl: lastPnl, priceSource: "regular" });
        }
      }

      const totalPositionsValue = priceResults.reduce((sum, r) => sum + r.currentValue, 0);
      const totalUnrealizedPnl = priceResults.reduce((sum, r) => sum + r.unrealizedPnl, 0);
      const cashBalance = parseFloat(sleeve.cashBalance);
      const allocatedCapital = parseFloat(sleeve.allocatedCapital);
      const totalValue = cashBalance + totalPositionsValue;
      const realizedPnl = parseFloat(sleeve.realizedPnl);
      const returnPct = allocatedCapital !== 0 ? ((totalValue - allocatedCapital) / allocatedCapital) * 100 : 0;

      await db.updateSleeve(sleeve.id, {
        positionsValue: String(totalPositionsValue),
        totalValue: String(totalValue),
        unrealizedPnl: String(totalUnrealizedPnl),
        returnPct: String(returnPct),
        lastPricedAt: new Date(),
      });

      // Save snapshot for equity curve
      await saveSnapshot({
        id: sleeve.id,
        totalValue: String(totalValue),
        positionsValue: String(totalPositionsValue),
        cashBalance: String(cashBalance),
        returnPct: String(returnPct),
      });

      // Determine overall market state: if any position used extended hours, surface it
      const hasExtended = priceResults.some((r) => r.priceSource !== "regular");
      const dominantSource = priceResults.find((r) => r.priceSource === "post")?.priceSource
        ?? priceResults.find((r) => r.priceSource === "pre")?.priceSource
        ?? "regular";

      return { success: true, updated: positions.length, totalValue, returnPct, hasExtended, dominantSource };
    }),

  // Add a trade (buy, sell, short, or cover)
  addTrade: protectedProcedure
    .input(
      z.object({
        groupId: z.number(),
        ticker: z.string().min(1).max(32),
        side: z.enum(["buy", "sell", "short", "cover"]),
        quantity: z.number().positive(),
        price: z.number().positive(),
        assetType: z.enum(["stock", "etf", "crypto"]).optional(),
        notes: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const membership = await db.getGroupMembership(input.groupId, ctx.user.id);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this group" });

      const sleeve = await db.getSleeveByUserAndGroup(ctx.user.id, input.groupId);
      if (!sleeve) throw new TRPCError({ code: "NOT_FOUND", message: "Sleeve not found" });

      const ticker = input.ticker.toUpperCase();
      const totalValue = input.quantity * input.price;

      let assetType: AssetType = input.assetType ||
        (ticker.includes("-USD") || ticker.includes("-BTC") || ticker.includes("-ETH") ? "crypto" : "stock");

      if (input.side === "buy") {
        const cashBalance = parseFloat(sleeve.cashBalance);
        if (totalValue > cashBalance) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Insufficient cash. Available: $${cashBalance.toFixed(2)}, Required: $${totalValue.toFixed(2)}`,
          });
        }

        const existingPos = await db.getPositionByTicker(sleeve.id, ticker);
        if (existingPos) {
          if (existingPos.isShort === 1) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `You have a short position in ${ticker}. Use "Cover" to close it first.`,
            });
          }
          const existingQty = parseFloat(existingPos.quantity);
          const existingCost = parseFloat(existingPos.avgCostBasis);
          const newQty = existingQty + input.quantity;
          const newAvgCost = (existingQty * existingCost + input.quantity * input.price) / newQty;
          const newCurrentValue = newQty * input.price;

          await db.upsertPosition({
            ...existingPos,
            quantity: String(newQty),
            avgCostBasis: String(newAvgCost),
            currentPrice: String(input.price),
            currentValue: String(newCurrentValue),
          });
        } else {
          await db.upsertPosition({
            sleeveId: sleeve.id,
            ticker,
            assetType,
            quantity: String(input.quantity),
            avgCostBasis: String(input.price),
            currentPrice: String(input.price),
            currentValue: String(totalValue),
            isShort: 0,
          });
        }

        const newCash = cashBalance - totalValue;
        // Recalculate positionsValue from all positions after this trade
        // Re-fetch all positions to get updated currentValue after upsert
        const freshPositions = await db.getPositionsForSleeve(sleeve.id);
        const positionsValueCalc = freshPositions.reduce((sum, p) => sum + (p.currentValue ? parseFloat(p.currentValue) : 0), 0);
        await db.updateSleeve(sleeve.id, {
          cashBalance: String(newCash),
          positionsValue: String(positionsValueCalc),
          totalValue: String(newCash + positionsValueCalc),
        });

      } else if (input.side === "sell") {
        const existingPos = await db.getPositionByTicker(sleeve.id, ticker);
        if (!existingPos || existingPos.isShort === 1) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `No long position in ${ticker}` });
        }

        const existingQty = parseFloat(existingPos.quantity);
        if (input.quantity > existingQty) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Cannot sell ${input.quantity} shares. You only hold ${existingQty}`,
          });
        }

        const avgCost = parseFloat(existingPos.avgCostBasis);
        const realizedPnl = (input.price - avgCost) * input.quantity;
        const newQty = existingQty - input.quantity;

        if (newQty < 0.000001) {
          await db.deletePosition(existingPos.id);
        } else {
          await db.upsertPosition({
            ...existingPos,
            quantity: String(newQty),
            currentPrice: String(input.price),
            currentValue: String(newQty * input.price),
          });
        }

        const cashBalance = parseFloat(sleeve.cashBalance);
        const currentRealizedPnl = parseFloat(sleeve.realizedPnl);
        const newCashSell = cashBalance + totalValue;
        const freshPosSell = await db.getPositionsForSleeve(sleeve.id);
        const posValSell = freshPosSell.reduce((sum, p) => sum + (p.currentValue ? parseFloat(p.currentValue) : 0), 0);
        await db.updateSleeve(sleeve.id, {
          cashBalance: String(newCashSell),
          realizedPnl: String(currentRealizedPnl + realizedPnl),
          positionsValue: String(posValSell),
          totalValue: String(newCashSell + posValSell),
        });

      } else if (input.side === "short") {
        // Opening a short: receive cash proceeds, create short position
        const existingPos = await db.getPositionByTicker(sleeve.id, ticker);
        if (existingPos && existingPos.isShort === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `You have a long position in ${ticker}. Sell it before shorting.`,
          });
        }

        const cashBalance = parseFloat(sleeve.cashBalance);

        if (existingPos && existingPos.isShort === 1) {
          // Add to existing short
          const existingQty = parseFloat(existingPos.quantity);
          const existingCost = parseFloat(existingPos.avgCostBasis);
          const newQty = existingQty + input.quantity;
          const newAvgCost = (existingQty * existingCost + input.quantity * input.price) / newQty;
          // Short currentValue is NEGATIVE (liability)
          await db.upsertPosition({
            ...existingPos,
            quantity: String(newQty),
            avgCostBasis: String(newAvgCost),
            currentPrice: String(input.price),
            currentValue: String(-(newQty * input.price)),
          });
        } else {
          // Short currentValue is NEGATIVE (liability)
          await db.upsertPosition({
            sleeveId: sleeve.id,
            ticker,
            assetType,
            quantity: String(input.quantity),
            avgCostBasis: String(input.price),
            currentPrice: String(input.price),
            currentValue: String(-totalValue),
            isShort: 1,
          });
        }

        // Short proceeds credited to cash; recalculate sleeve totals.
        // positionsValue now subtracts the short liability (negative currentValue),
        // so totalValue = newCash + positionsValue stays flat vs before the short.
        const newCashShort = cashBalance + totalValue;
        const freshPosShort = await db.getPositionsForSleeve(sleeve.id);
        const posValShort = freshPosShort.reduce((sum, p) => sum + (p.currentValue ? parseFloat(p.currentValue) : 0), 0);
        await db.updateSleeve(sleeve.id, {
          cashBalance: String(newCashShort),
          positionsValue: String(posValShort),
          totalValue: String(newCashShort + posValShort),
        });

      } else if (input.side === "cover") {
        // Covering a short: pay cash to buy back
        const existingPos = await db.getPositionByTicker(sleeve.id, ticker);
        if (!existingPos || existingPos.isShort !== 1) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `No short position in ${ticker}` });
        }

        const existingQty = parseFloat(existingPos.quantity);
        if (input.quantity > existingQty) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Cannot cover ${input.quantity} shares. Short position is only ${existingQty}`,
          });
        }

        const cashBalance = parseFloat(sleeve.cashBalance);
        if (totalValue > cashBalance) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Insufficient cash to cover. Available: $${cashBalance.toFixed(2)}, Required: $${totalValue.toFixed(2)}`,
          });
        }

        const avgCost = parseFloat(existingPos.avgCostBasis);
        // Short P&L: profit = (short price - cover price) * qty
        const realizedPnl = (avgCost - input.price) * input.quantity;
        const newQty = existingQty - input.quantity;

        if (newQty < 0.000001) {
          await db.deletePosition(existingPos.id);
        } else {
          // Remaining short is still a liability (negative currentValue)
          await db.upsertPosition({
            ...existingPos,
            quantity: String(newQty),
            currentPrice: String(input.price),
            currentValue: String(-(newQty * input.price)),
          });
        }

        const currentRealizedPnl = parseFloat(sleeve.realizedPnl);
        const newCashCover = cashBalance - totalValue;
        const freshPosCover = await db.getPositionsForSleeve(sleeve.id);
        const posValCover = freshPosCover.reduce((sum, p) => sum + (p.currentValue ? parseFloat(p.currentValue) : 0), 0);
        await db.updateSleeve(sleeve.id, {
          cashBalance: String(newCashCover),
          realizedPnl: String(currentRealizedPnl + realizedPnl),
          positionsValue: String(posValCover),
          totalValue: String(newCashCover + posValCover),
        });
      }

      // Record the trade
      await db.createTrade({
        sleeveId: sleeve.id,
        ticker,
        assetType,
        side: input.side,
        quantity: String(input.quantity),
        price: String(input.price),
        totalValue: String(totalValue),
        notes: input.notes || null,
      });

      return { success: true, ticker, side: input.side, quantity: input.quantity, price: input.price, totalValue };
    }),

  // Get trade history for my sleeve
  getTrades: protectedProcedure
    .input(z.object({ groupId: z.number(), limit: z.number().int().min(1).max(200).default(50) }))
    .query(async ({ input, ctx }) => {
      const sleeve = await db.getSleeveByUserAndGroup(ctx.user.id, input.groupId);
      if (!sleeve) return [];

      const trades = await db.getTradesForSleeve(sleeve.id, input.limit);
      return trades.map((t) => ({
        ...t,
        quantity: parseFloat(t.quantity),
        price: parseFloat(t.price),
        totalValue: parseFloat(t.totalValue),
        realizedPnl: t.realizedPnl ? parseFloat(t.realizedPnl) : null,
      }));
    }),

  // Get leaderboard for a group
  getLeaderboard: protectedProcedure
    .input(z.object({ groupId: z.number() }))
    .query(async ({ input, ctx }) => {
      const membership = await db.getGroupMembership(input.groupId, ctx.user.id);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this group" });

      const sleeves = await db.getSleevesForGroup(input.groupId);
      const group = await db.getGroupById(input.groupId);

      const entries = await Promise.all(
        sleeves.map(async (sleeve) => {
          const user = await db.getUserById(sleeve.userId);
          return {
            sleeveId: sleeve.id,
            userId: sleeve.userId,
            username: user?.username || "Unknown",
            displayName: user?.displayName || user?.username || "Unknown",
            allocatedCapital: parseFloat(sleeve.allocatedCapital),
            cashBalance: parseFloat(sleeve.cashBalance),
            positionsValue: parseFloat(sleeve.positionsValue),
            totalValue: parseFloat(sleeve.totalValue),
            realizedPnl: parseFloat(sleeve.realizedPnl),
            unrealizedPnl: parseFloat(sleeve.unrealizedPnl),
            returnPct: parseFloat(sleeve.returnPct),
            lastPricedAt: sleeve.lastPricedAt,
            isMe: sleeve.userId === ctx.user.id,
          };
        })
      );

      // Sort by return % descending
      entries.sort((a, b) => b.returnPct - a.returnPct);
      const ranked = entries.map((e, i) => ({ ...e, rank: i + 1 }));

      const totalPortfolioValue = ranked.reduce((sum, e) => sum + e.totalValue, 0);
      // Use sum of actual sleeve allocatedCapitals as the baseline (not group.totalCapital which may differ)
      const startingCapital = ranked.reduce((sum, e) => sum + e.allocatedCapital, 0) || (group ? parseFloat(group.totalCapital) : 1000000);

      // Last refreshed = most recent lastPricedAt across all sleeves
      const lastRefreshed = ranked
        .map((e) => e.lastPricedAt)
        .filter((d): d is Date => d !== null && d !== undefined)
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

      return {
        entries: ranked,
        totalPortfolioValue,
        startingCapital,
        portfolioReturnPct: startingCapital !== 0 ? ((totalPortfolioValue - startingCapital) / startingCapital) * 100 : 0,
        group,
        lastRefreshed,
      };
    }),

  // Refresh ALL sleeves in a group (for leaderboard accuracy)
  refreshAllPrices: protectedProcedure
    .input(z.object({ groupId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const membership = await db.getGroupMembership(input.groupId, ctx.user.id);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this group" });

      const sleeves = await db.getSleevesForGroup(input.groupId);

      for (const sleeve of sleeves) {
        const positions = await db.getPositionsForSleeve(sleeve.id);
        if (positions.length === 0) continue;

        const priceResults: { currentValue: number; unrealizedPnl: number }[] = [];
        for (const pos of positions) {
          try {
            const { price } = await fetchPrice(pos.ticker, true);
            const qty = parseFloat(pos.quantity);
            const avgCost = parseFloat(pos.avgCostBasis);
            const isShort = pos.isShort === 1;

            // Short currentValue is NEGATIVE (liability); long is positive.
            const currentValue = isShort ? -(qty * price) : qty * price;
            const unrealizedPnl = isShort
              ? (avgCost - price) * qty
              : (price - avgCost) * qty;
            const unrealizedPnlPct = avgCost !== 0
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
          } catch (err) {
            console.error(`[Portfolio] Failed to refresh ${pos.ticker}:`, err);
            const isShortFallbackAll = pos.isShort === 1;
            const rawLastValueAll = pos.currentValue ? parseFloat(pos.currentValue) : 0;
            priceResults.push({
              // Apply sign correction even on fallback — DB may have stale positive value from before the fix
              currentValue: isShortFallbackAll ? -Math.abs(rawLastValueAll) : Math.abs(rawLastValueAll),
              unrealizedPnl: pos.unrealizedPnl ? parseFloat(pos.unrealizedPnl) : 0,
            });
          }
        }

        const totalPositionsValue = priceResults.reduce((sum, r) => sum + r.currentValue, 0);
        const totalUnrealizedPnl = priceResults.reduce((sum, r) => sum + r.unrealizedPnl, 0);
        const cashBalance = parseFloat(sleeve.cashBalance);
        const allocatedCapital = parseFloat(sleeve.allocatedCapital);
        const totalValue = cashBalance + totalPositionsValue;
        const returnPct = allocatedCapital !== 0 ? ((totalValue - allocatedCapital) / allocatedCapital) * 100 : 0;

        await db.updateSleeve(sleeve.id, {
          positionsValue: String(totalPositionsValue),
          totalValue: String(totalValue),
          unrealizedPnl: String(totalUnrealizedPnl),
          returnPct: String(returnPct),
          lastPricedAt: new Date(),
        });

        // Save snapshot for equity curve
        await saveSnapshot({
          id: sleeve.id,
          totalValue: String(totalValue),
          positionsValue: String(totalPositionsValue),
          cashBalance: String(cashBalance),
          returnPct: String(returnPct),
        });
      }

      return { success: true, sleeveCount: sleeves.length };
    }),

  /**
   * Fetch S&P 500 (^GSPC) historical closes indexed to a base date so the
   * benchmark can be overlaid on the portfolio equity curve as a % return.
   *
   * Returns an array of { date, returnPct } aligned to the snapshot dates
   * provided by the caller. If a snapshot date falls on a weekend/holiday the
   * nearest prior trading day is used.
   */
  getBenchmark: protectedProcedure
    .input(
      z.object({
        groupId: z.number(),
        /** ISO date strings of the snapshot dates we need to align to */
        dates: z.array(z.string()).min(1).max(365),
      })
    )
    .query(async ({ input, ctx }) => {
      // Verify membership
      const membership = await db.getGroupMembership(input.groupId, ctx.user.id);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "Not a member" });

      // Fetch up to 1 year of daily S&P 500 closes (server-cached for 1 hour)
      const history = await getSpxHistory("1y", "1d");

      // Build a map of date-string → close price (YYYY-MM-DD)
      const priceByDate = new Map<string, number>();
      for (let i = 0; i < history.timestamps.length; i++) {
        const close = history.closes[i];
        if (close == null || close <= 0) continue;
        const d = new Date(history.timestamps[i]);
        const key = d.toISOString().slice(0, 10);
        priceByDate.set(key, close);
      }

      // Sort all available trading-day dates ascending
      const tradingDays = Array.from(priceByDate.keys()).sort();

      /** Find the closest prior (or equal) trading day for a given date string */
      function closestPrior(dateStr: string): number | null {
        // Binary search for the largest trading day <= dateStr
        let lo = 0, hi = tradingDays.length - 1, best = -1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          if (tradingDays[mid] <= dateStr) { best = mid; lo = mid + 1; }
          else hi = mid - 1;
        }
        return best >= 0 ? (priceByDate.get(tradingDays[best]) ?? null) : null;
      }

      // Determine the base price from the earliest snapshot date
      const sortedDates = [...input.dates].sort();
      const basePrice = closestPrior(sortedDates[0]);
      if (!basePrice) return [];

      return input.dates.map((dateStr) => {
        const price = closestPrior(dateStr);
        if (price == null) return { date: dateStr, spxReturn: null };
        return {
          date: dateStr,
          spxReturn: ((price - basePrice) / basePrice) * 100,
        };
      });
    }),
});
