/**
 * Yahoo Finance direct client — no API key required.
 *
 * Yahoo's public API requires a crumb + session cookie obtained by first
 * visiting finance.yahoo.com. The crumb is valid for the lifetime of the
 * cookie (typically several hours). We cache both in memory and refresh
 * automatically when a 401/403 is returned.
 */

import axios, { AxiosInstance } from "axios";

const BASE_CHART = "https://query1.finance.yahoo.com/v8/finance/chart";
const BASE_SEARCH = "https://query1.finance.yahoo.com/v1/finance/search";
const CRUMB_URL = "https://query1.finance.yahoo.com/v1/test/getcrumb";
const CONSENT_URL = "https://finance.yahoo.com";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ── In-memory session state ──────────────────────────────────────────────────

let _crumb: string | null = null;
let _cookies: string | null = null;
let _crumbFetchedAt = 0;
const CRUMB_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

// ── Axios instance ───────────────────────────────────────────────────────────

const http: AxiosInstance = axios.create({
  timeout: 15_000,
  headers: {
    "User-Agent": USER_AGENT,
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
  },
});

// ── Crumb / cookie management ────────────────────────────────────────────────

async function refreshSession(): Promise<void> {
  // 1. Visit finance.yahoo.com to get session cookies
  const consentResp = await http.get(CONSENT_URL, {
    maxRedirects: 5,
    validateStatus: () => true,
  });

  // Collect Set-Cookie headers
  const rawCookies = consentResp.headers["set-cookie"] ?? [];
  _cookies = rawCookies
    .map((c: string) => c.split(";")[0])
    .filter(Boolean)
    .join("; ");

  // 2. Fetch crumb using the session cookie
  const crumbResp = await http.get(CRUMB_URL, {
    headers: { Cookie: _cookies },
    validateStatus: () => true,
  });

  if (crumbResp.status !== 200 || !crumbResp.data) {
    throw new Error(`[YahooFinance] Failed to obtain crumb (${crumbResp.status})`);
  }

  _crumb = String(crumbResp.data).trim();
  _crumbFetchedAt = Date.now();
  console.log(`[YahooFinance] Session refreshed. Crumb: ${_crumb.slice(0, 8)}...`);
}

async function ensureSession(force = false): Promise<{ crumb: string; cookies: string }> {
  const expired = Date.now() - _crumbFetchedAt > CRUMB_TTL_MS;
  if (force || !_crumb || !_cookies || expired) {
    await refreshSession();
  }
  return { crumb: _crumb!, cookies: _cookies! };
}

// ── Types ────────────────────────────────────────────────────────────────────

export type AssetType = "stock" | "etf" | "crypto";

export interface QuoteResult {
  ticker: string;
  price: number;
  previousClose: number;
  change: number;
  changePct: number;
  name: string | null;
  assetType: AssetType;
  currency: string | null;
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
    // Fallback heuristic
    if (ticker.endsWith("-USD") || ticker.endsWith("-BTC") || ticker.endsWith("-ETH")) return "crypto";
    return "stock";
  }
  const t = instrumentType.toUpperCase();
  if (t === "CRYPTOCURRENCY") return "crypto";
  if (t === "ETF" || t === "MUTUALFUND") return "etf";
  return "stock";
}

// ── Core API calls ───────────────────────────────────────────────────────────

/**
 * Fetch a real-time quote for a single ticker.
 * Automatically retries once with a fresh session on auth failure.
 */
export async function getQuote(ticker: string, retry = true): Promise<QuoteResult> {
  const { crumb, cookies } = await ensureSession();

  const resp = await http.get(`${BASE_CHART}/${encodeURIComponent(ticker)}`, {
    params: { interval: "1d", range: "5d", crumb },
    headers: { Cookie: cookies },
    validateStatus: () => true,
  });

  // Auth expired — refresh and retry once
  if ((resp.status === 401 || resp.status === 403) && retry) {
    await ensureSession(true);
    return getQuote(ticker, false);
  }

  if (resp.status !== 200) {
    throw new Error(`[YahooFinance] getQuote(${ticker}) failed: HTTP ${resp.status}`);
  }

  const chartResult = resp.data?.chart?.result?.[0];
  if (!chartResult) {
    throw new Error(`[YahooFinance] No data returned for ${ticker}`);
  }

  const meta = chartResult.meta ?? {};
  const price: number = meta.regularMarketPrice ?? meta.chartPreviousClose ?? 0;
  const previousClose: number = meta.chartPreviousClose ?? meta.previousClose ?? price;
  const change = price - previousClose;
  const changePct = previousClose !== 0 ? (change / previousClose) * 100 : 0;

  return {
    ticker: ticker.toUpperCase(),
    price,
    previousClose,
    change,
    changePct,
    name: meta.longName || meta.shortName || null,
    assetType: mapInstrumentType(meta.instrumentType, ticker),
    currency: meta.currency || null,
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
  interval = "1d",
  retry = true
): Promise<HistoryResult> {
  const { crumb, cookies } = await ensureSession();

  const resp = await http.get(`${BASE_CHART}/${encodeURIComponent(ticker)}`, {
    params: { interval, range, crumb },
    headers: { Cookie: cookies },
    validateStatus: () => true,
  });

  if ((resp.status === 401 || resp.status === 403) && retry) {
    await ensureSession(true);
    return getHistory(ticker, range, interval, false);
  }

  if (resp.status !== 200) {
    throw new Error(`[YahooFinance] getHistory(${ticker}) failed: HTTP ${resp.status}`);
  }

  const chartResult = resp.data?.chart?.result?.[0];
  if (!chartResult) throw new Error(`[YahooFinance] No history for ${ticker}`);

  const timestamps: number[] = (chartResult.timestamp ?? []).map((t: number) => t * 1000);
  const closes: number[] = chartResult.indicators?.quote?.[0]?.close ?? [];

  return { ticker: ticker.toUpperCase(), timestamps, closes };
}

/**
 * Search for tickers by query string.
 * Returns up to `limit` results across stocks, ETFs, and crypto.
 */
export async function searchTickers(query: string, limit = 8, retry = true): Promise<SearchResult[]> {
  const { crumb, cookies } = await ensureSession();

  const resp = await http.get(BASE_SEARCH, {
    params: { q: query, quotesCount: limit, newsCount: 0, crumb },
    headers: { Cookie: cookies },
    validateStatus: () => true,
  });

  if ((resp.status === 401 || resp.status === 403) && retry) {
    await ensureSession(true);
    return searchTickers(query, limit, false);
  }

  if (resp.status !== 200) return [];

  const quotes: any[] = resp.data?.quotes ?? [];
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
