"""
Earnings Calendar Microservice
Serves upcoming earnings dates via yfinance.
Called internally by the Node.js server.

Endpoints:
  GET /earnings?from=YYYY-MM-DD&to=YYYY-MM-DD
    Returns JSON array of { symbol, reportDate }
    Filtered to the given date range.

  GET /earnings/ticker?symbol=AAPL
    Returns the next earnings date for a single ticker.

  GET /health
    Returns {"status":"ok"}
"""

import os
import json
import datetime
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from flask import Flask, request, jsonify
import yfinance as yf

app = Flask(__name__)

# ── Popular tickers to pre-populate the calendar ─────────────────────────────
TRACKED_TICKERS = [
    # Mega-cap tech
    "AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA",
    # Semiconductors
    "AMD", "INTC", "QCOM", "AVGO", "MU", "AMAT", "LRCX", "TSM",
    # Finance
    "JPM", "BAC", "GS", "MS", "WFC", "C", "V", "MA",
    # Healthcare
    "JNJ", "UNH", "PFE", "ABBV", "MRK", "LLY",
    # Consumer
    "WMT", "COST", "TGT", "HD", "NKE", "SBUX", "MCD",
    # Energy
    "XOM", "CVX", "COP",
    # Industrial
    "BA", "CAT", "GE", "HON", "RTX", "LMT",
    # Telecom / Media
    "T", "NFLX", "DIS",
    # Cloud / SaaS
    "CRM", "NOW", "SNOW", "PLTR", "UBER", "ABNB",
]

# Cache: { ticker: { date: "YYYY-MM-DD" | None, fetched_at: float } }
_cache: dict = {}
_cache_lock = threading.Lock()
CACHE_TTL_SECONDS = 3600  # 1 hour


def _fetch_one(ticker: str) -> tuple[str, str | None]:
    """Fetch earnings date for a single ticker. Returns (ticker, date_str | None)."""
    now = datetime.datetime.utcnow().timestamp()
    with _cache_lock:
        cached = _cache.get(ticker)
        if cached and (now - cached["fetched_at"]) < CACHE_TTL_SECONDS:
            return ticker, cached["date"]

    try:
        t = yf.Ticker(ticker)
        cal = t.calendar
        if not cal:
            result = None
        else:
            dates = cal.get("Earnings Date", [])
            today = datetime.date.today()
            future = [d for d in dates if isinstance(d, datetime.date) and d >= today]
            result = str(future[0]) if future else None
    except Exception as e:
        print(f"[earnings_service] Error fetching {ticker}: {e}")
        result = None

    with _cache_lock:
        _cache[ticker] = {"date": result, "fetched_at": now}
    return ticker, result


def _warm_cache():
    """Pre-warm the cache in background using parallel fetching."""
    print("[earnings_service] Pre-warming cache in background...")
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(_fetch_one, t): t for t in TRACKED_TICKERS}
        count = 0
        for future in as_completed(futures):
            ticker, date = future.result()
            if date:
                count += 1
    print(f"[earnings_service] Cache warm complete: {count}/{len(TRACKED_TICKERS)} tickers have upcoming earnings")


@app.route("/health")
def health():
    with _cache_lock:
        cached_count = sum(1 for v in _cache.values() if v.get("date"))
    return jsonify({"status": "ok", "cached_tickers": len(_cache), "with_dates": cached_count})


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

    # Use cached data only (no blocking fetches during request)
    results = []
    with _cache_lock:
        snapshot = dict(_cache)

    for ticker, entry in snapshot.items():
        date_str = entry.get("date")
        if not date_str:
            continue
        try:
            report_date = datetime.date.fromisoformat(date_str)
        except ValueError:
            continue
        if from_date <= report_date <= to_date:
            results.append({"symbol": ticker, "reportDate": date_str})

    results.sort(key=lambda x: x["reportDate"])
    return jsonify(results)


@app.route("/earnings/ticker")
def earnings_ticker():
    symbol = request.args.get("symbol", "").upper()
    if not symbol:
        return jsonify({"error": "symbol query param required"}), 400

    # Check cache first
    with _cache_lock:
        cached = _cache.get(symbol)
    now = datetime.datetime.utcnow().timestamp()
    if cached and (now - cached["fetched_at"]) < CACHE_TTL_SECONDS:
        return jsonify({"symbol": symbol, "reportDate": cached["date"]})

    # Not cached — fetch synchronously (single ticker is fast)
    _, date_str = _fetch_one(symbol)
    return jsonify({"symbol": symbol, "reportDate": date_str})


if __name__ == "__main__":
    port = int(os.environ.get("EARNINGS_SERVICE_PORT", "5001"))
    print(f"[earnings_service] Starting on port {port}")
    # Pre-warm cache in background so first request is fast
    threading.Thread(target=_warm_cache, daemon=True).start()
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)
