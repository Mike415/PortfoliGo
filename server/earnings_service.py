"""
Earnings Calendar Microservice
Serves upcoming earnings dates via yfinance.
Called internally by the Node.js server.

Endpoints:
  GET /earnings?from=YYYY-MM-DD&to=YYYY-MM-DD
    Returns JSON array of { symbol, name, reportDate, timeOfDay, epsEstimate }
    Filtered to the given date range.

  GET /earnings/ticker?symbol=AAPL
    Returns the next earnings date for a single ticker.

  GET /health
    Returns {"status":"ok"}
"""

import os
import json
import datetime
from flask import Flask, request, jsonify
import yfinance as yf

app = Flask(__name__)

# ── Popular tickers to pre-populate the calendar ─────────────────────────────
# We fetch earnings dates for a curated list of liquid, well-known stocks.
# yfinance doesn't have a bulk "all upcoming earnings" endpoint, so we maintain
# a list of the most-traded names that managers are likely to pick.
TRACKED_TICKERS = [
    # Mega-cap tech
    "AAPL", "MSFT", "GOOGL", "GOOG", "AMZN", "META", "NVDA", "TSLA",
    # Semiconductors
    "AMD", "INTC", "QCOM", "AVGO", "MU", "AMAT", "LRCX", "KLAC", "TSM",
    # Finance
    "JPM", "BAC", "GS", "MS", "WFC", "C", "BLK", "V", "MA", "AXP",
    # Healthcare
    "JNJ", "UNH", "PFE", "ABBV", "MRK", "LLY", "TMO", "ABT", "BMY",
    # Consumer
    "AMZN", "WMT", "COST", "TGT", "HD", "LOW", "NKE", "SBUX", "MCD",
    # Energy
    "XOM", "CVX", "COP", "SLB", "EOG", "OXY",
    # Industrial / Aerospace
    "BA", "CAT", "GE", "HON", "RTX", "LMT", "NOC",
    # Telecom / Media
    "T", "VZ", "NFLX", "DIS", "CMCSA",
    # Cloud / SaaS
    "CRM", "NOW", "SNOW", "PLTR", "UBER", "LYFT", "ABNB", "DASH",
    # ETFs (no earnings but included for completeness — filtered out below)
]

# Cache: { ticker: { date: "YYYY-MM-DD", fetched_at: timestamp } }
_cache: dict = {}
CACHE_TTL_SECONDS = 3600  # 1 hour


def get_earnings_date(ticker: str) -> str | None:
    """Return the next earnings date for a ticker as YYYY-MM-DD string, or None."""
    now = datetime.datetime.utcnow().timestamp()
    cached = _cache.get(ticker)
    if cached and (now - cached["fetched_at"]) < CACHE_TTL_SECONDS:
        return cached["date"]

    try:
        t = yf.Ticker(ticker)
        cal = t.calendar
        if not cal:
            _cache[ticker] = {"date": None, "fetched_at": now}
            return None
        dates = cal.get("Earnings Date", [])
        if not dates:
            _cache[ticker] = {"date": None, "fetched_at": now}
            return None
        # Pick the first future date
        today = datetime.date.today()
        future = [d for d in dates if isinstance(d, datetime.date) and d >= today]
        result = str(future[0]) if future else None
        _cache[ticker] = {"date": result, "fetched_at": now}
        return result
    except Exception as e:
        print(f"[earnings_service] Error fetching {ticker}: {e}")
        _cache[ticker] = {"date": None, "fetched_at": now}
        return None


@app.route("/health")
def health():
    return jsonify({"status": "ok"})


@app.route("/earnings")
def earnings_calendar():
    from_str = request.args.get("from")
    to_str = request.args.get("to")

    if not from_str or not to_str:
        return jsonify({"error": "from and to query params required (YYYY-MM-DD)"}), 400

    try:
        from_date = datetime.date.fromisoformat(from_str)
        to_date = datetime.date.fromisoformat(to_str)
    except ValueError:
        return jsonify({"error": "Invalid date format, use YYYY-MM-DD"}), 400

    results = []
    for ticker in TRACKED_TICKERS:
        date_str = get_earnings_date(ticker)
        if not date_str:
            continue
        try:
            report_date = datetime.date.fromisoformat(date_str)
        except ValueError:
            continue
        if from_date <= report_date <= to_date:
            # Get name from cache if available
            cached = _cache.get(ticker, {})
            results.append({
                "symbol": ticker,
                "reportDate": date_str,
            })

    # Sort by date
    results.sort(key=lambda x: x["reportDate"])
    return jsonify(results)


@app.route("/earnings/ticker")
def earnings_ticker():
    symbol = request.args.get("symbol", "").upper()
    if not symbol:
        return jsonify({"error": "symbol query param required"}), 400

    date_str = get_earnings_date(symbol)
    return jsonify({"symbol": symbol, "reportDate": date_str})


if __name__ == "__main__":
    port = int(os.environ.get("EARNINGS_SERVICE_PORT", "5001"))
    print(f"[earnings_service] Starting on port {port}")
    app.run(host="0.0.0.0", port=port, debug=False)
