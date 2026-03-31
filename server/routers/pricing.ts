import { TRPCError } from "@trpc/server";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { callDataApi } from "../_core/dataApi";
import * as db from "../db";
import { z } from "zod";

const PRICE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

type AssetType = "stock" | "etf" | "crypto";

function detectAssetType(ticker: string, instrumentType?: string): AssetType {
  if (instrumentType === "CRYPTOCURRENCY") return "crypto";
  if (instrumentType === "ETF") return "etf";
  if (ticker.includes("-USD") || ticker.includes("-BTC") || ticker.includes("-ETH")) return "crypto";
  return "stock";
}

async function fetchLivePrice(ticker: string): Promise<{
  ticker: string;
  price: number;
  change: number | null;
  changePct: number | null;
  name: string | null;
  assetType: AssetType;
} | null> {
  try {
    const result = await callDataApi("YahooFinance/get_stock_chart", {
      query: {
        symbol: ticker,
        interval: "1d",
        range: "5d",
      },
    });

    const chartResult = (result as any)?.chart?.result?.[0];
    if (!chartResult) return null;

    const meta = chartResult.meta;
    const price = meta?.regularMarketPrice ?? meta?.chartPreviousClose ?? 0;
    const previousClose = meta?.chartPreviousClose ?? meta?.previousClose ?? price;
    const change = price - previousClose;
    const changePct = previousClose !== 0 ? (change / previousClose) * 100 : 0;
    const instrumentType = meta?.instrumentType;
    const assetType = detectAssetType(ticker, instrumentType);

    return {
      ticker,
      price,
      change,
      changePct,
      name: meta?.longName || meta?.shortName || null,
      assetType,
    };
  } catch (err) {
    console.error(`[Pricing] Failed to fetch price for ${ticker}:`, err);
    return null;
  }
}

export const pricingRouter = router({
  // Get a single quote (with cache)
  getQuote: protectedProcedure
    .input(z.object({ ticker: z.string().min(1).max(32) }))
    .query(async ({ input }) => {
      const ticker = input.ticker.toUpperCase();

      // Check cache
      const cached = await db.getPriceCacheEntry(ticker);
      if (cached) {
        const ageMs = Date.now() - cached.updatedAt.getTime();
        if (ageMs < PRICE_CACHE_TTL_MS) {
          return {
            ticker: cached.ticker,
            price: parseFloat(cached.price),
            change: cached.change ? parseFloat(cached.change) : null,
            changePct: cached.changePct ? parseFloat(cached.changePct) : null,
            name: cached.name,
            assetType: cached.assetType,
            fromCache: true,
          };
        }
      }

      const live = await fetchLivePrice(ticker);
      if (!live) {
        if (cached) {
          return {
            ticker: cached.ticker,
            price: parseFloat(cached.price),
            change: cached.change ? parseFloat(cached.change) : null,
            changePct: cached.changePct ? parseFloat(cached.changePct) : null,
            name: cached.name,
            assetType: cached.assetType,
            fromCache: true,
          };
        }
        throw new TRPCError({ code: "NOT_FOUND", message: `Could not find price for ${ticker}` });
      }

      // Update cache
      await db.upsertPriceCache(
        ticker,
        live.assetType,
        String(live.price),
        live.change !== null ? String(live.change) : null,
        live.changePct !== null ? String(live.changePct) : null,
        live.name
      );

      return { ...live, fromCache: false };
    }),

  // Batch quote for multiple tickers
  batchQuote: protectedProcedure
    .input(z.object({ tickers: z.array(z.string()).max(50) }))
    .query(async ({ input }) => {
      const results: Record<string, {
        ticker: string;
        price: number;
        change: number | null;
        changePct: number | null;
        name: string | null;
        assetType: AssetType;
        fromCache: boolean;
      }> = {};

      await Promise.all(
        input.tickers.map(async (rawTicker) => {
          const ticker = rawTicker.toUpperCase();
          try {
            const cached = await db.getPriceCacheEntry(ticker);
            if (cached) {
              const ageMs = Date.now() - cached.updatedAt.getTime();
              if (ageMs < PRICE_CACHE_TTL_MS) {
                results[ticker] = {
                  ticker: cached.ticker,
                  price: parseFloat(cached.price),
                  change: cached.change ? parseFloat(cached.change) : null,
                  changePct: cached.changePct ? parseFloat(cached.changePct) : null,
                  name: cached.name,
                  assetType: cached.assetType,
                  fromCache: true,
                };
                return;
              }
            }

            const live = await fetchLivePrice(ticker);
            if (live) {
              await db.upsertPriceCache(
                ticker,
                live.assetType,
                String(live.price),
                live.change !== null ? String(live.change) : null,
                live.changePct !== null ? String(live.changePct) : null,
                live.name
              );
              results[ticker] = { ...live, fromCache: false };
            } else if (cached) {
              results[ticker] = {
                ticker: cached.ticker,
                price: parseFloat(cached.price),
                change: cached.change ? parseFloat(cached.change) : null,
                changePct: cached.changePct ? parseFloat(cached.changePct) : null,
                name: cached.name,
                assetType: cached.assetType,
                fromCache: true,
              };
            }
          } catch (err) {
            console.error(`[Pricing] Error fetching ${ticker}:`, err);
          }
        })
      );

      return results;
    }),

  // Get historical price data for a ticker (for charts)
  getHistory: protectedProcedure
    .input(
      z.object({
        ticker: z.string().min(1).max(32),
        range: z.enum(["1mo", "3mo", "6mo", "1y", "2y", "5y"]).default("6mo"),
        interval: z.enum(["1d", "1wk", "1mo"]).default("1d"),
      })
    )
    .query(async ({ input }) => {
      const ticker = input.ticker.toUpperCase();
      try {
        const result = await callDataApi("YahooFinance/get_stock_chart", {
          query: {
            symbol: ticker,
            interval: input.interval,
            range: input.range,
          },
        });

        const chartResult = (result as any)?.chart?.result?.[0];
        if (!chartResult) throw new TRPCError({ code: "NOT_FOUND", message: "No data found" });

        const timestamps: number[] = chartResult.timestamp ?? [];
        const quotes = chartResult.indicators?.quote?.[0] ?? {};
        const closes: (number | null)[] = quotes.close ?? [];

        const dataPoints = timestamps
          .map((ts: number, i: number) => ({
            date: ts * 1000,
            close: closes[i] ?? null,
          }))
          .filter((d) => d.close !== null);

        return {
          ticker,
          range: input.range,
          data: dataPoints,
          meta: {
            name: chartResult.meta?.longName || chartResult.meta?.shortName || ticker,
            currency: chartResult.meta?.currency || "USD",
          },
        };
      } catch (err) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Failed to fetch history for ${ticker}` });
      }
    }),

  // Search for a ticker symbol
  search: publicProcedure
    .input(z.object({ query: z.string().min(1).max(20) }))
    .query(async ({ input }) => {
      // Try to get a quote directly - if it works, the ticker is valid
      const ticker = input.query.toUpperCase();
      const live = await fetchLivePrice(ticker);
      if (live) {
        return [{ ticker: live.ticker, name: live.name || ticker, assetType: live.assetType }];
      }
      return [];
    }),
});
