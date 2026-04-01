/**
 * Yahoo Finance direct client — no API key or crumb required.
 *
 * Uses query2.finance.yahoo.com which serves public market data without
 * requiring cookie/crumb authentication. Falls back to query1 if query2
 * returns a non-200 status.
 */

import axios, { AxiosInstance } from "axios";

const BASE_Q2 = "https://query2.finance.yahoo.com";
const BASE_Q1 = "https://query1.finance.yahoo.com";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ── Axios instance ───────────────────────────────────────────────────────────

const http: AxiosInstance = axios.create({
  timeout: 15_000,
  headers: {
    "User-Agent": USER_AGENT,
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
  },
});

// ── Types ────────────────────────────────────────────────────────────────────

export type AssetType = "stock" | "etf" | "crypto";

export type MarketState = "REGULAR" | "PRE" | "POST" | "CLOSED" | "PREPRE" | "POSTPOST";
export type PriceSource = "regular" | "pre" | "post";

export interface QuoteResult {
  ticker: string;
  price: number;           // Best available price (extended hours if fresher)
  regularPrice: number;   // Last regular session close
  previousClose: number;
  change: number;
  changePct: number;
  name: string | null;
  assetType: AssetType;
  currency: string | null;
  marketState: MarketState;
  priceSource: PriceSource; // Which price is being used
}

export interface SearchResult {
  ticker: string;
  name: string;
  assetType: AssetType;
  exchange: string | null;
}

export interface HistoryResult {
  timestamps: number[];
  closes: number[];
  ticker: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapInstrumentType(instrumentType: string | undefined, ticker: string): AssetType {
  if (!instrumentType) {
    if (ticker.endsWith("-USD") || ticker.endsWith("-BTC") || ticker.endsWith("-ETH")) return "crypto";
    return "stock";
  }
  const t = instrumentType.toUpperCase();
  if (t === "CRYPTOCURRENCY") return "crypto";
  if (t === "ETF" || t === "MUTUALFUND") return "etf";
  return "stock";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** GET from query2, fallback to query1 on failure, with 429 backoff */
async function fetchChart(path: string, params: Record<string, string>): Promise<any> {
  for (const base of [BASE_Q2, BASE_Q1]) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const resp = await http.get(`${base}${path}`, { params, validateStatus: () => true });
        if (resp.status === 200) return resp.data;
        if (resp.status === 429) {
          // Rate limited — wait and retry
          const delay = (attempt + 1) * 1500;
          console.warn(`[YahooFinance] 429 rate limit on ${base}, retrying in ${delay}ms...`);
          await sleep(delay);
          continue;
        }
        console.warn(`[YahooFinance] ${base}${path} returned ${resp.status}`);
        break; // Non-retryable error, try next base
      } catch (err: any) {
        console.warn(`[YahooFinance] ${base}${path} error: ${err.message}`);
        break;
      }
    }
  }
  throw new Error(`[YahooFinance] All endpoints failed for ${path}`);
}

async function fetchSearch(query: string, limit: number): Promise<any> {
  for (const base of [BASE_Q2, BASE_Q1]) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const resp = await http.get(`${base}/v1/finance/search`, {
          params: { q: query, quotesCount: String(limit), newsCount: "0" },
          validateStatus: () => true,
        });
        if (resp.status === 200) return resp.data;
        if (resp.status === 429) {
          await sleep((attempt + 1) * 1500);
          continue;
        }
        break;
      } catch {
        break;
      }
    }
  }
  return null;
}

// ── Core API calls ───────────────────────────────────────────────────────────

/**
 * Fetch a real-time quote for a single ticker.
 */
export async function getQuote(ticker: string): Promise<QuoteResult> {
  const data = await fetchChart(`/v8/finance/chart/${encodeURIComponent(ticker)}`, {
    interval: "1d",
    range: "5d",
  });

  const chartResult = data?.chart?.result?.[0];
  if (!chartResult) {
    throw new Error(`[YahooFinance] No data returned for ${ticker}`);
  }

  const meta = chartResult.meta ?? {};
  const regularPrice: number = meta.regularMarketPrice ?? meta.chartPreviousClose ?? 0;
  const previousClose: number = meta.chartPreviousClose ?? meta.previousClose ?? regularPrice;
  const marketState: MarketState = (meta.marketState as MarketState) ?? "CLOSED";

  // Use the most recent extended hours price when it exists and is valid.
  // Yahoo Finance returns preMarketPrice / postMarketPrice alongside the regular price.
  const preMarketPrice: number | undefined = meta.preMarketPrice;
  const postMarketPrice: number | undefined = meta.postMarketPrice;

  let price = regularPrice;
  let priceSource: PriceSource = "regular";

  if (marketState === "PRE" || marketState === "PREPRE") {
    // Before market open — use pre-market price if available
    if (preMarketPrice && preMarketPrice > 0) {
      price = preMarketPrice;
      priceSource = "pre";
    }
  } else if (marketState === "POST" || marketState === "POSTPOST" || marketState === "CLOSED") {
    // After market close — prefer post-market price if available and more recent
    if (postMarketPrice && postMarketPrice > 0) {
      price = postMarketPrice;
      priceSource = "post";
    } else if (preMarketPrice && preMarketPrice > 0 && marketState === "CLOSED") {
      // Edge case: only pre-market data available (very early morning)
      price = preMarketPrice;
      priceSource = "pre";
    }
  }
  // marketState === "REGULAR": use regularPrice as-is (priceSource stays "regular")

  const change = price - previousClose;
  const changePct = previousClose !== 0 ? (change / previousClose) * 100 : 0;

  return {
    ticker: ticker.toUpperCase(),
    price,
    regularPrice,
    previousClose,
    change,
    changePct,
    name: meta.longName || meta.shortName || null,
    assetType: mapInstrumentType(meta.instrumentType, ticker),
    currency: meta.currency || null,
    marketState,
    priceSource,
  };
}

/**
 * Fetch historical OHLCV data for a ticker.
 * range: "1mo" | "3mo" | "6mo" | "1y" | "2y" | "5y"
 * interval: "1d" | "1wk" | "1mo"
 */
export async function getHistory(
  ticker: string,
  range = "6mo",
  interval = "1d"
): Promise<HistoryResult> {
  const data = await fetchChart(`/v8/finance/chart/${encodeURIComponent(ticker)}`, {
    interval,
    range,
  });

  const chartResult = data?.chart?.result?.[0];
  if (!chartResult) throw new Error(`[YahooFinance] No history for ${ticker}`);

  const timestamps: number[] = (chartResult.timestamp ?? []).map((t: number) => t * 1000);
  const closes: number[] = chartResult.indicators?.quote?.[0]?.close ?? [];

  return { ticker: ticker.toUpperCase(), timestamps, closes };
}

/**
 * Search for tickers by query string.
 * Returns up to `limit` results across stocks, ETFs, and crypto.
 */
export async function searchTickers(query: string, limit = 8): Promise<SearchResult[]> {
  const data = await fetchSearch(query, limit);
  if (!data) return [];

  const quotes: any[] = data?.quotes ?? [];
  return quotes
    .filter((q) => q.symbol && q.quoteType !== "INDEX" && q.quoteType !== "FUTURE")
    .slice(0, limit)
    .map((q) => ({
      ticker: q.symbol,
      name: q.shortname || q.longname || q.symbol,
      assetType: mapInstrumentType(q.quoteType, q.symbol),
      exchange: q.exchange || null,
    }));
}
