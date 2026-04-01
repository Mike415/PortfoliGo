/**
 * Static fallback earnings calendar for major tickers.
 * Used when the Python yfinance service is unavailable.
 * Dates are Q1/Q2 2026 estimates based on historical patterns.
 * Update this list each quarter.
 */

export interface EarningsEntry {
  symbol: string;
  reportDate: string; // YYYY-MM-DD
}

// Q1 2026 earnings season (reporting April–May 2026)
const FALLBACK_CALENDAR: EarningsEntry[] = [
  // Week of Apr 14
  { symbol: "GS",    reportDate: "2026-04-14" },
  { symbol: "JPM",   reportDate: "2026-04-14" },
  { symbol: "WFC",   reportDate: "2026-04-14" },
  { symbol: "C",     reportDate: "2026-04-15" },
  { symbol: "BAC",   reportDate: "2026-04-15" },
  { symbol: "MS",    reportDate: "2026-04-16" },
  { symbol: "NFLX",  reportDate: "2026-04-16" },
  // Week of Apr 21
  { symbol: "TSLA",  reportDate: "2026-04-22" },
  { symbol: "GOOGL", reportDate: "2026-04-23" },
  { symbol: "GOOG",  reportDate: "2026-04-23" },
  { symbol: "V",     reportDate: "2026-04-23" },
  { symbol: "MA",    reportDate: "2026-04-24" },
  { symbol: "INTC",  reportDate: "2026-04-24" },
  { symbol: "T",     reportDate: "2026-04-24" },
  // Week of Apr 28
  { symbol: "META",  reportDate: "2026-04-29" },
  { symbol: "MSFT",  reportDate: "2026-04-29" },
  { symbol: "AAPL",  reportDate: "2026-04-30" },
  { symbol: "AMZN",  reportDate: "2026-04-30" },
  { symbol: "QCOM",  reportDate: "2026-04-29" },
  { symbol: "CAT",   reportDate: "2026-04-29" },
  { symbol: "HON",   reportDate: "2026-04-29" },
  { symbol: "UPS",   reportDate: "2026-04-29" },
  // Week of May 5
  { symbol: "NVDA",  reportDate: "2026-05-20" }, // NVDA typically reports late
  { symbol: "AMD",   reportDate: "2026-05-06" },
  { symbol: "UBER",  reportDate: "2026-05-07" },
  { symbol: "DIS",   reportDate: "2026-05-07" },
  { symbol: "ABNB",  reportDate: "2026-05-08" },
  { symbol: "PLTR",  reportDate: "2026-05-05" },
  { symbol: "SNOW",  reportDate: "2026-05-21" },
  { symbol: "CRM",   reportDate: "2026-05-27" },
  // Energy
  { symbol: "XOM",   reportDate: "2026-05-02" },
  { symbol: "CVX",   reportDate: "2026-05-02" },
  { symbol: "COP",   reportDate: "2026-05-08" },
  // Healthcare
  { symbol: "JNJ",   reportDate: "2026-04-15" },
  { symbol: "UNH",   reportDate: "2026-04-15" },
  { symbol: "PFE",   reportDate: "2026-04-29" },
  { symbol: "ABBV",  reportDate: "2026-04-24" },
  { symbol: "MRK",   reportDate: "2026-04-24" },
  { symbol: "LLY",   reportDate: "2026-04-24" },
  // Consumer
  { symbol: "WMT",   reportDate: "2026-05-19" },
  { symbol: "COST",  reportDate: "2026-05-28" },
  { symbol: "TGT",   reportDate: "2026-05-20" },
  { symbol: "HD",    reportDate: "2026-05-19" },
  { symbol: "NKE",   reportDate: "2026-06-25" },
  { symbol: "SBUX",  reportDate: "2026-04-29" },
  { symbol: "MCD",   reportDate: "2026-04-29" },
  // Industrial
  { symbol: "BA",    reportDate: "2026-04-22" },
  { symbol: "GE",    reportDate: "2026-04-22" },
  { symbol: "RTX",   reportDate: "2026-04-22" },
  { symbol: "LMT",   reportDate: "2026-04-22" },
  { symbol: "NOC",   reportDate: "2026-04-23" },
  // Semiconductors
  { symbol: "AVGO",  reportDate: "2026-06-04" },
  { symbol: "MU",    reportDate: "2026-06-25" },
  { symbol: "AMAT",  reportDate: "2026-05-14" },
  { symbol: "LRCX",  reportDate: "2026-04-23" },
  { symbol: "KLAC",  reportDate: "2026-04-24" },
  { symbol: "TSM",   reportDate: "2026-04-17" },
];

/**
 * Returns entries within the given date range (inclusive).
 */
export function getFallbackCalendar(from: string, to: string): EarningsEntry[] {
  return FALLBACK_CALENDAR.filter(
    (e) => e.reportDate >= from && e.reportDate <= to
  ).sort((a, b) => a.reportDate.localeCompare(b.reportDate));
}

/**
 * Returns the next earnings date for a single ticker, or null.
 */
export function getFallbackDate(symbol: string): string | null {
  const today = new Date().toISOString().slice(0, 10);
  const entry = FALLBACK_CALENDAR.find(
    (e) => e.symbol === symbol.toUpperCase() && e.reportDate >= today
  );
  return entry?.reportDate ?? null;
}
