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

  // Search for a ticker symbol — returns curated matches + live resolution
  search: protectedProcedure
    .input(z.object({ query: z.string().min(1).max(30) }))
    .query(async ({ input }) => {
      const q = input.query.trim().toUpperCase();
      if (!q) return [];

      // Curated list of popular tickers with names and types
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
        { ticker: "MMM", name: "3M Company", assetType: "stock" },
        { ticker: "GE", name: "GE Aerospace", assetType: "stock" },
        { ticker: "F", name: "Ford Motor Company", assetType: "stock" },
        { ticker: "GM", name: "General Motors Company", assetType: "stock" },
        { ticker: "T", name: "AT&T Inc.", assetType: "stock" },
        { ticker: "VZ", name: "Verizon Communications Inc.", assetType: "stock" },
        { ticker: "UBER", name: "Uber Technologies Inc.", assetType: "stock" },
        { ticker: "LYFT", name: "Lyft Inc.", assetType: "stock" },
        { ticker: "SNAP", name: "Snap Inc.", assetType: "stock" },
        { ticker: "SPOT", name: "Spotify Technology S.A.", assetType: "stock" },
        { ticker: "COIN", name: "Coinbase Global Inc.", assetType: "stock" },
        { ticker: "HOOD", name: "Robinhood Markets Inc.", assetType: "stock" },
        { ticker: "SQ", name: "Block Inc. (Square)", assetType: "stock" },
        { ticker: "SHOP", name: "Shopify Inc.", assetType: "stock" },
        { ticker: "PLTR", name: "Palantir Technologies Inc.", assetType: "stock" },
        { ticker: "RIVN", name: "Rivian Automotive Inc.", assetType: "stock" },
        { ticker: "LCID", name: "Lucid Group Inc.", assetType: "stock" },
        // Popular ETFs
        { ticker: "SPY", name: "SPDR S&P 500 ETF Trust", assetType: "etf" },
        { ticker: "QQQ", name: "Invesco QQQ Trust (Nasdaq 100)", assetType: "etf" },
        { ticker: "IWM", name: "iShares Russell 2000 ETF", assetType: "etf" },
        { ticker: "VTI", name: "Vanguard Total Stock Market ETF", assetType: "etf" },
        { ticker: "VOO", name: "Vanguard S&P 500 ETF", assetType: "etf" },
        { ticker: "VEA", name: "Vanguard FTSE Developed Markets ETF", assetType: "etf" },
        { ticker: "VWO", name: "Vanguard FTSE Emerging Markets ETF", assetType: "etf" },
        { ticker: "GLD", name: "SPDR Gold Shares ETF", assetType: "etf" },
        { ticker: "SLV", name: "iShares Silver Trust ETF", assetType: "etf" },
        { ticker: "TLT", name: "iShares 20+ Year Treasury Bond ETF", assetType: "etf" },
        { ticker: "HYG", name: "iShares iBoxx High Yield Corporate Bond ETF", assetType: "etf" },
        { ticker: "XLF", name: "Financial Select Sector SPDR ETF", assetType: "etf" },
        { ticker: "XLK", name: "Technology Select Sector SPDR ETF", assetType: "etf" },
        { ticker: "XLE", name: "Energy Select Sector SPDR ETF", assetType: "etf" },
        { ticker: "XLV", name: "Health Care Select Sector SPDR ETF", assetType: "etf" },
        { ticker: "XLI", name: "Industrial Select Sector SPDR ETF", assetType: "etf" },
        { ticker: "ARKK", name: "ARK Innovation ETF", assetType: "etf" },
        { ticker: "ARKG", name: "ARK Genomic Revolution ETF", assetType: "etf" },
        { ticker: "SQQQ", name: "ProShares UltraPro Short QQQ", assetType: "etf" },
        { ticker: "TQQQ", name: "ProShares UltraPro QQQ", assetType: "etf" },
        { ticker: "SPXS", name: "Direxion Daily S&P 500 Bear 3X ETF", assetType: "etf" },
        { ticker: "SPXL", name: "Direxion Daily S&P 500 Bull 3X ETF", assetType: "etf" },
        { ticker: "DIA", name: "SPDR Dow Jones Industrial Average ETF", assetType: "etf" },
        { ticker: "EEM", name: "iShares MSCI Emerging Markets ETF", assetType: "etf" },
        // Crypto
        { ticker: "BTC-USD", name: "Bitcoin", assetType: "crypto" },
        { ticker: "ETH-USD", name: "Ethereum", assetType: "crypto" },
        { ticker: "SOL-USD", name: "Solana", assetType: "crypto" },
        { ticker: "BNB-USD", name: "BNB (Binance Coin)", assetType: "crypto" },
        { ticker: "XRP-USD", name: "XRP (Ripple)", assetType: "crypto" },
        { ticker: "ADA-USD", name: "Cardano", assetType: "crypto" },
        { ticker: "DOGE-USD", name: "Dogecoin", assetType: "crypto" },
        { ticker: "AVAX-USD", name: "Avalanche", assetType: "crypto" },
        { ticker: "LINK-USD", name: "Chainlink", assetType: "crypto" },
        { ticker: "DOT-USD", name: "Polkadot", assetType: "crypto" },
        { ticker: "MATIC-USD", name: "Polygon (MATIC)", assetType: "crypto" },
        { ticker: "LTC-USD", name: "Litecoin", assetType: "crypto" },
        { ticker: "UNI-USD", name: "Uniswap", assetType: "crypto" },
        { ticker: "ATOM-USD", name: "Cosmos", assetType: "crypto" },
        { ticker: "NEAR-USD", name: "NEAR Protocol", assetType: "crypto" },
      ];

      // 1. Filter curated list by ticker prefix or name substring
      const curatedMatches = POPULAR.filter(
        (item) =>
          item.ticker.startsWith(q) ||
          item.name.toUpperCase().includes(q) ||
          item.ticker.includes(q)
      ).slice(0, 8);

      // 2. If the query looks like an exact ticker (short, no spaces), also try live resolution
      const looksLikeTicker = /^[A-Z0-9\-\.]{1,12}$/.test(q) && !q.includes(" ");
      const alreadyInCurated = curatedMatches.some((m) => m.ticker === q);

      if (looksLikeTicker && !alreadyInCurated) {
        // Check cache first
        const cached = await db.getPriceCacheEntry(q);
        if (cached) {
          curatedMatches.unshift({
            ticker: cached.ticker,
            name: cached.name || cached.ticker,
            assetType: cached.assetType as AssetType,
          });
        } else {
          // Try live fetch (only if query is 2+ chars to avoid noise)
          if (q.length >= 2) {
            const live = await fetchLivePrice(q);
            if (live) {
              // Cache it
              await db.upsertPriceCache(
                q,
                live.assetType,
                String(live.price),
                live.change !== null ? String(live.change) : null,
                live.changePct !== null ? String(live.changePct) : null,
                live.name
              );
              curatedMatches.unshift({
                ticker: live.ticker,
                name: live.name || live.ticker,
                assetType: live.assetType,
              });
            }
          }
        }
      }

      // Deduplicate by ticker
      const seen = new Set<string>();
      return curatedMatches.filter((m) => {
        if (seen.has(m.ticker)) return false;
        seen.add(m.ticker);
        return true;
      }).slice(0, 8);
    }),
});
