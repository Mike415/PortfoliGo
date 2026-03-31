import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { z } from "zod";
import { getQuote, type AssetType } from "../yahooFinance";

async function fetchPrice(ticker: string, forceRefresh = false): Promise<{ price: number; assetType: AssetType; name: string | null }> {
  const CACHE_TTL = 5 * 60 * 1000;

  if (!forceRefresh) {
    const cached = await db.getPriceCacheEntry(ticker);
    if (cached && Date.now() - cached.updatedAt.getTime() < CACHE_TTL) {
      return { price: parseFloat(cached.price), assetType: cached.assetType as AssetType, name: cached.name };
    }
  }

  const q = await getQuote(ticker);
  await db.upsertPriceCache(ticker, q.assetType, String(q.price), String(q.change), String(q.changePct), q.name);
  return { price: q.price, assetType: q.assetType, name: q.name };
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

      return {
        ...sleeve,
        allocatedCapital: parseFloat(sleeve.allocatedCapital),
        cashBalance: parseFloat(sleeve.cashBalance),
        positionsValue: parseFloat(sleeve.positionsValue),
        totalValue: parseFloat(sleeve.totalValue),
        realizedPnl: parseFloat(sleeve.realizedPnl),
        unrealizedPnl: parseFloat(sleeve.unrealizedPnl),
        returnPct: parseFloat(sleeve.returnPct),
        positions: positions.map((p) => ({
          ...p,
          quantity: parseFloat(p.quantity),
          avgCostBasis: parseFloat(p.avgCostBasis),
          currentPrice: p.currentPrice ? parseFloat(p.currentPrice) : 0,
          currentValue: p.currentValue ? parseFloat(p.currentValue) : 0,
          unrealizedPnl: p.unrealizedPnl ? parseFloat(p.unrealizedPnl) : 0,
          unrealizedPnlPct: p.unrealizedPnlPct ? parseFloat(p.unrealizedPnlPct) : 0,
        })),
      };
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
      // and to stay within API rate limits
      const priceResults: { posId: number; currentValue: number; unrealizedPnl: number }[] = [];

      for (const pos of positions) {
        try {
          const { price } = await fetchPrice(pos.ticker, true); // force bypass cache on manual refresh
          const qty = parseFloat(pos.quantity);
          const avgCost = parseFloat(pos.avgCostBasis);
          const currentValue = qty * price;
          const unrealizedPnl = currentValue - qty * avgCost;
          const unrealizedPnlPct = avgCost !== 0 ? ((price - avgCost) / avgCost) * 100 : 0;

          await db.upsertPosition({
            ...pos,
            currentPrice: String(price),
            currentValue: String(currentValue),
            unrealizedPnl: String(unrealizedPnl),
            unrealizedPnlPct: String(unrealizedPnlPct),
            lastPricedAt: new Date(),
          });

          priceResults.push({ posId: pos.id, currentValue, unrealizedPnl });
        } catch (err) {
          console.error(`[Portfolio] Failed to refresh price for ${pos.ticker}:`, err);
          // Use last known value so the total is still meaningful
          const lastValue = pos.currentValue ? parseFloat(pos.currentValue) : 0;
          const lastPnl = pos.unrealizedPnl ? parseFloat(pos.unrealizedPnl) : 0;
          priceResults.push({ posId: pos.id, currentValue: lastValue, unrealizedPnl: lastPnl });
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

      return { success: true, updated: positions.length, totalValue, returnPct };
    }),

  // Add a trade (buy or sell)
  addTrade: protectedProcedure
    .input(
      z.object({
        groupId: z.number(),
        ticker: z.string().min(1).max(32),
        side: z.enum(["buy", "sell"]),
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

      // Determine asset type
      // Determine asset type from input or heuristic (crypto tickers end in -USD)
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

        // Update or create position
        const existingPos = await db.getPositionByTicker(sleeve.id, ticker);
        if (existingPos) {
          const existingQty = parseFloat(existingPos.quantity);
          const existingCost = parseFloat(existingPos.avgCostBasis);
          const newQty = existingQty + input.quantity;
          const newAvgCost = (existingQty * existingCost + input.quantity * input.price) / newQty;

          await db.upsertPosition({
            ...existingPos,
            quantity: String(newQty),
            avgCostBasis: String(newAvgCost),
          });
        } else {
          await db.upsertPosition({
            sleeveId: sleeve.id,
            ticker,
            assetType,
            quantity: String(input.quantity),
            avgCostBasis: String(input.price),
          });
        }

        // Deduct cash
        await db.updateSleeve(sleeve.id, {
          cashBalance: String(cashBalance - totalValue),
        });
      } else {
        // SELL
        const existingPos = await db.getPositionByTicker(sleeve.id, ticker);
        if (!existingPos) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `No position in ${ticker}` });
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
          });
        }

        // Add cash back + realized PnL
        const cashBalance = parseFloat(sleeve.cashBalance);
        const currentRealizedPnl = parseFloat(sleeve.realizedPnl);
        await db.updateSleeve(sleeve.id, {
          cashBalance: String(cashBalance + totalValue),
          realizedPnl: String(currentRealizedPnl + realizedPnl),
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
      const startingCapital = group ? parseFloat(group.totalCapital) : 1000000;

      return {
        entries: ranked,
        totalPortfolioValue,
        startingCapital,
        portfolioReturnPct: startingCapital !== 0 ? ((totalPortfolioValue - startingCapital) / startingCapital) * 100 : 0,
        group,
      };
    }),

  // Refresh ALL sleeves in a group (for leaderboard accuracy)
  refreshAllPrices: protectedProcedure
    .input(z.object({ groupId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const membership = await db.getGroupMembership(input.groupId, ctx.user.id);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this group" });

      const sleeves = await db.getSleevesForGroup(input.groupId);

      // Process sleeves sequentially to avoid race conditions and API rate limits
      for (const sleeve of sleeves) {
        const positions = await db.getPositionsForSleeve(sleeve.id);
        if (positions.length === 0) continue;

        // Collect results sequentially — parallel accumulation causes lost updates
        const priceResults: { currentValue: number; unrealizedPnl: number }[] = [];
        for (const pos of positions) {
          try {
            const { price } = await fetchPrice(pos.ticker, true); // force fresh price
            const qty = parseFloat(pos.quantity);
            const avgCost = parseFloat(pos.avgCostBasis);
            const currentValue = qty * price;
            const unrealizedPnl = currentValue - qty * avgCost;
            const unrealizedPnlPct = avgCost !== 0 ? ((price - avgCost) / avgCost) * 100 : 0;

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
            // Fall back to last known value so totals remain meaningful
            priceResults.push({
              currentValue: pos.currentValue ? parseFloat(pos.currentValue) : 0,
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
      }

      return { success: true, sleeveCount: sleeves.length };
    }),
});
