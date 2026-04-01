import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { z } from "zod";
import { getQuote, getHistory as yahooGetHistory, searchTickers, type AssetType } from "../yahooFinance";

const PRICE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function fetchLivePrice(ticker: string): Promise<{
  ticker: string;
  price: number;
  change: number | null;
  changePct: number | null;
  name: string | null;
  assetType: AssetType;
  priceSource: "regular" | "pre" | "post";
} | null> {
  try {
    const q = await getQuote(ticker);
    return {
      ticker: q.ticker,
      price: q.price,
      change: q.change,
      changePct: q.changePct,
      name: q.name,
      assetType: q.assetType,
      priceSource: q.priceSource,
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
            assetType: cached.assetType as AssetType,
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
            assetType: cached.assetType as AssetType,
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
        live.name,
        live.priceSource
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
                  assetType: cached.assetType as AssetType,
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
                live.name,
                live.priceSource
              );
              results[ticker] = { ...live, fromCache: false };
            } else if (cached) {
              results[ticker] = {
                ticker: cached.ticker,
                price: parseFloat(cached.price),
                change: cached.change ? parseFloat(cached.change) : null,
                changePct: cached.changePct ? parseFloat(cached.changePct) : null,
                name: cached.name,
                assetType: cached.assetType as AssetType,
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
        const history = await yahooGetHistory(ticker, input.range, input.interval);

        const dataPoints = history.timestamps
          .map((ts, i) => ({
            date: ts,
            close: history.closes[i] ?? null,
          }))
          .filter((d) => d.close !== null);

        // Get name from cache or a fresh quote
        let name = ticker;
        const cached = await db.getPriceCacheEntry(ticker);
        if (cached?.name) {
          name = cached.name;
        }

        return {
          ticker,
          range: input.range,
          data: dataPoints,
          meta: { name, currency: "USD" },
        };
      } catch (err) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Failed to fetch history for ${ticker}` });
      }
    }),

  // Search for a ticker symbol — live Yahoo Finance search + curated fallback
  search: protectedProcedure
    .input(z.object({ query: z.string().min(1).max(30) }))
    .query(async ({ input }) => {
      const q = input.query.trim();
      if (!q) return [];

      // Curated list of popular tickers for instant offline matching
      const POPULAR: { ticker: string; name: string; assetType: AssetType }[] = [
        // Large-cap stocks
        { ticker: "AAPL", name: "Apple Inc.", assetType: "stock" },
        { ticker: "MSFT", name: "Microsoft Corporation", assetType: "stock" },
        { ticker: "GOOGL", name: "Alphabet Inc. (Google)", assetType: "stock" },
        { ticker: "AMZN", name: "Amazon.com Inc.", assetType: "stock" },
        { ticker: "NVDA", name: "NVIDIA Corporation", assetType: "stock" },
        { ticker: "META", name: "Meta Platforms Inc.", assetType: "stock" },
        { ticker: "TSLA", name: "Tesla Inc.", assetType: "stock" },
        { ticker: "BRK-B", name: "Berkshire Hathaway Inc.", assetType: "stock" },
        { ticker: "JPM", name: "JPMorgan Chase & Co.", assetType: "stock" },
        { ticker: "V", name: "Visa Inc.", assetType: "stock" },
        { ticker: "UNH", name: "UnitedHealth Group Inc.", assetType: "stock" },
        { ticker: "JNJ", name: "Johnson & Johnson", assetType: "stock" },
        { ticker: "WMT", name: "Walmart Inc.", assetType: "stock" },
        { ticker: "XOM", name: "Exxon Mobil Corporation", assetType: "stock" },
        { ticker: "MA", name: "Mastercard Inc.", assetType: "stock" },
        { ticker: "PG", name: "Procter & Gamble Co.", assetType: "stock" },
        { ticker: "HD", name: "The Home Depot Inc.", assetType: "stock" },
        { ticker: "CVX", name: "Chevron Corporation", assetType: "stock" },
        { ticker: "ABBV", name: "AbbVie Inc.", assetType: "stock" },
        { ticker: "BAC", name: "Bank of America Corp.", assetType: "stock" },
        { ticker: "KO", name: "The Coca-Cola Company", assetType: "stock" },
        { ticker: "AVGO", name: "Broadcom Inc.", assetType: "stock" },
        { ticker: "PFE", name: "Pfizer Inc.", assetType: "stock" },
        { ticker: "COST", name: "Costco Wholesale Corp.", assetType: "stock" },
        { ticker: "MRK", name: "Merck & Co. Inc.", assetType: "stock" },
        { ticker: "DIS", name: "The Walt Disney Company", assetType: "stock" },
        { ticker: "NFLX", name: "Netflix Inc.", assetType: "stock" },
        { ticker: "AMD", name: "Advanced Micro Devices Inc.", assetType: "stock" },
        { ticker: "INTC", name: "Intel Corporation", assetType: "stock" },
        { ticker: "PYPL", name: "PayPal Holdings Inc.", assetType: "stock" },
        { ticker: "ADBE", name: "Adobe Inc.", assetType: "stock" },
        { ticker: "CRM", name: "Salesforce Inc.", assetType: "stock" },
        { ticker: "ORCL", name: "Oracle Corporation", assetType: "stock" },
        { ticker: "IBM", name: "International Business Machines", assetType: "stock" },
        { ticker: "QCOM", name: "Qualcomm Inc.", assetType: "stock" },
        { ticker: "GS", name: "Goldman Sachs Group Inc.", assetType: "stock" },
        { ticker: "MS", name: "Morgan Stanley", assetType: "stock" },
        { ticker: "BA", name: "Boeing Company", assetType: "stock" },
        { ticker: "CAT", name: "Caterpillar Inc.", assetType: "stock" },
        { ticker: "GE", name: "GE Aerospace", assetType: "stock" },
        { ticker: "F", name: "Ford Motor Company", assetType: "stock" },
        { ticker: "GM", name: "General Motors Company", assetType: "stock" },
        { ticker: "T", name: "AT&T Inc.", assetType: "stock" },
        { ticker: "VZ", name: "Verizon Communications Inc.", assetType: "stock" },
        { ticker: "UBER", name: "Uber Technologies Inc.", assetType: "stock" },
        { ticker: "LYFT", name: "Lyft Inc.", assetType: "stock" },
        { ticker: "SPOT", name: "Spotify Technology S.A.", assetType: "stock" },
        { ticker: "SNAP", name: "Snap Inc.", assetType: "stock" },
        { ticker: "TWTR", name: "Twitter / X Corp.", assetType: "stock" },
        { ticker: "COIN", name: "Coinbase Global Inc.", assetType: "stock" },
        { ticker: "HOOD", name: "Robinhood Markets Inc.", assetType: "stock" },
        { ticker: "PLTR", name: "Palantir Technologies Inc.", assetType: "stock" },
        { ticker: "RBLX", name: "Roblox Corporation", assetType: "stock" },
        { ticker: "RIVN", name: "Rivian Automotive Inc.", assetType: "stock" },
        { ticker: "LCID", name: "Lucid Group Inc.", assetType: "stock" },
        // ETFs
        { ticker: "SPY", name: "SPDR S&P 500 ETF Trust", assetType: "etf" },
        { ticker: "QQQ", name: "Invesco QQQ Trust (Nasdaq 100)", assetType: "etf" },
        { ticker: "IWM", name: "iShares Russell 2000 ETF", assetType: "etf" },
        { ticker: "VTI", name: "Vanguard Total Stock Market ETF", assetType: "etf" },
        { ticker: "VOO", name: "Vanguard S&P 500 ETF", assetType: "etf" },
        { ticker: "GLD", name: "SPDR Gold Shares ETF", assetType: "etf" },
        { ticker: "SLV", name: "iShares Silver Trust ETF", assetType: "etf" },
        { ticker: "TLT", name: "iShares 20+ Year Treasury Bond ETF", assetType: "etf" },
        { ticker: "XLF", name: "Financial Select Sector SPDR Fund", assetType: "etf" },
        { ticker: "XLK", name: "Technology Select Sector SPDR Fund", assetType: "etf" },
        { ticker: "XLE", name: "Energy Select Sector SPDR Fund", assetType: "etf" },
        { ticker: "ARKK", name: "ARK Innovation ETF", assetType: "etf" },
        { ticker: "SQQQ", name: "ProShares UltraPro Short QQQ", assetType: "etf" },
        { ticker: "TQQQ", name: "ProShares UltraPro QQQ", assetType: "etf" },
        { ticker: "VXX", name: "iPath Series B S&P 500 VIX ETN", assetType: "etf" },
        // Crypto
        { ticker: "BTC-USD", name: "Bitcoin", assetType: "crypto" },
        { ticker: "ETH-USD", name: "Ethereum", assetType: "crypto" },
        { ticker: "SOL-USD", name: "Solana", assetType: "crypto" },
        { ticker: "BNB-USD", name: "BNB (Binance Coin)", assetType: "crypto" },
        { ticker: "XRP-USD", name: "XRP (Ripple)", assetType: "crypto" },
        { ticker: "ADA-USD", name: "Cardano", assetType: "crypto" },
        { ticker: "DOGE-USD", name: "Dogecoin", assetType: "crypto" },
        { ticker: "AVAX-USD", name: "Avalanche", assetType: "crypto" },
        { ticker: "DOT-USD", name: "Polkadot", assetType: "crypto" },
        { ticker: "MATIC-USD", name: "Polygon (MATIC)", assetType: "crypto" },
        { ticker: "LINK-USD", name: "Chainlink", assetType: "crypto" },
        { ticker: "LTC-USD", name: "Litecoin", assetType: "crypto" },
        { ticker: "UNI-USD", name: "Uniswap", assetType: "crypto" },
        { ticker: "ATOM-USD", name: "Cosmos", assetType: "crypto" },
        { ticker: "SHIB-USD", name: "Shiba Inu", assetType: "crypto" },
      ];

      const qUpper = q.toUpperCase();

      // 1. Match from curated list first (instant, no API call)
      const curatedMatches = POPULAR.filter(
        (p) =>
          p.ticker.startsWith(qUpper) ||
          p.name.toUpperCase().includes(qUpper) ||
          p.ticker === qUpper
      ).slice(0, 5);

      // 2. Try live Yahoo Finance search for anything not fully covered
      let liveResults: { ticker: string; name: string; assetType: AssetType }[] = [];
      try {
        const yahooResults = await searchTickers(q, 8);
        // Merge: add live results not already in curated matches
        const curatedTickers = new Set(curatedMatches.map((c) => c.ticker));
        liveResults = yahooResults
          .filter((r) => !curatedTickers.has(r.ticker))
          .slice(0, 5);
      } catch (err) {
        // Live search failure is non-fatal — curated results still work
        console.warn("[Pricing] Live search failed, using curated only:", (err as Error).message);
      }

      return [...curatedMatches, ...liveResults].slice(0, 8);
    }),
});
