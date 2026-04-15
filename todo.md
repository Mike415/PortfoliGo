# PortfoliGo — Todo

## Authentication
- [x] Custom username/passcode auth (no OAuth)
- [x] Invite code system for joining groups
- [x] Session management with JWT

## Database Schema
- [x] Users table (username, hashed passcode, role)
- [x] Groups table (name, total capital, start date, reallocation interval)
- [x] Sleeves table (group, user, allocated capital, current value)
- [x] Positions table (sleeve, ticker, asset type, quantity, avg cost)
- [x] Trades table (sleeve, ticker, side, quantity, price, timestamp)
- [x] Reallocation history table
- [x] Price cache table (ticker, price, last updated)

## Backend Procedures
- [x] auth.register / auth.login / auth.logout
- [x] group.create / group.get / group.join (invite code)
- [x] sleeve.get / sleeve.getAll (leaderboard)
- [x] trade.add / trade.list
- [x] position.list / position.getWithPrices
- [x] pricing.getQuote (Yahoo Finance API)
- [x] pricing.batchQuote (multiple tickers)
- [x] pricing.getHistory (chart data)
- [x] admin.configureGroup / admin.triggerReallocation
- [x] admin.getReallocationPreview

## Frontend Pages
- [x] Landing / login page
- [x] Register page
- [x] Group dashboard (aggregate view)
- [x] My Sleeve page (positions + P&L)
- [x] Trade entry form
- [x] Leaderboard page
- [x] Admin panel (group config + reallocation)
- [ ] Performance charts (historical) — positions chart placeholder ready

## Live Pricing
- [x] Fetch real-time prices for all positions
- [x] Mark-to-market P&L calculation
- [x] Auto-refresh pricing on dashboard
- [x] Support stocks, ETFs, crypto (BTC-USD format)

## Reallocation Engine
- [x] Calculate sleeve rankings by return %
- [x] Bottom performer loses 5% of sleeve
- [x] Top performer gains 5% of sleeve
- [x] Admin preview before confirming
- [x] Reallocation history log

## UI Polish
- [x] Dark financial theme (Bloomberg-inspired)
- [x] Responsive design
- [x] Loading states and error handling
- [ ] Performance charts with Recharts (historical sleeve P&L over time)
- [x] Fix: displayName validation rejects empty string on registration
- [x] Add electric blue upward arrow favicon (growing portfolio chart)

## Testing
- [x] 11 vitest tests passing (auth, portfolio, reallocation logic)
- [x] TypeScript strict mode, zero errors

## GitHub
- [x] Push to https://github.com/Mike415/PortfoliGo

## Ticker Search & Auto-Detection
- [x] Backend: ticker search endpoint using Yahoo Finance symbol search API
- [x] Backend: auto-detect asset type (stock/ETF/crypto) from quote data
- [x] Frontend: autocomplete dropdown in trade form as user types
- [x] Frontend: remove manual asset type selector — auto-filled from search result
- [x] Frontend: show company/asset name alongside ticker in search results

## Railway Deployment
- [ ] Replace Manus data API with direct Yahoo Finance public endpoint (crumb/cookie auth)
- [ ] Swap pricing.ts and portfolio.ts to use new Yahoo client
- [ ] Add railway.toml deployment config
- [ ] Add Dockerfile for Railway build
- [ ] Document environment variables needed on Railway
- [ ] Push Railway-ready build to GitHub

## Mini-Competitions (Round 5)
- [x] Schema: challenges table (type: conviction|sprint, pickWindowEnd, holdWindowEnd, recurring, allocationBump)
- [x] Schema: challenge_entries table (challengeId, sleeveId, ticker, entryPrice, exitPrice, returnPct, rank)
- [x] Backend: createChallenge, listChallenges, enterChallenge, scoreChallenge, awardChallengeBump procedures
- [x] Frontend: Admin challenge creator form (conviction play + sprint types)
- [x] Frontend: Challenges tab on GroupDashboard (active challenges, enter/view, leaderboard)
- [x] Cron: auto-score challenges when holdWindowEnd passes (manual Score & Award button for admin control)

## Competitor Visibility (Round 6)
- [x] Backend: list endpoint returns ALL entries per challenge (not just myEntry), with picks hidden during pick window
- [x] Backend: conviction picks revealed (ticker shown) once pick window closes; hidden as "Submitted ✓" during pick window
- [x] Frontend: ChallengeCard shows live leaderboard table of all competitors during active/scoring/completed phases
- [x] Frontend: Sprint leaderboard shows all managers' current return % vs start value
- [x] Frontend: Conviction leaderboard shows all picks + current return % once pick window closes
- [x] Frontend: During pick window, show "X of N managers have submitted" count (no names/tickers revealed)
- [x] Frontend: Completed challenges show full podium (1st/2nd/3rd) with winner highlighted

## Audit Fixes (Round 4)
- [x] Audit Fix: 3months reallocation interval not handled in executeReallocation next-date calc — now correctly adds 3 months
- [x] Audit Fix: returnPct on sleeve not recalculated after reallocation — now recalculated immediately using new allocatedCapital
- [x] Audit Fix: Performance chart dates not sorted chronologically — backend now emits ISO YYYY-MM-DD, frontend sorts lexicographically
- [x] Audit Fix: Header subtitle now shows group.totalCapital (fixed at creation) not startingCapital (which changes after reallocation)
- [x] Audit Fix: Cash Available % now shows cashBalance/totalValue (% of current portfolio) instead of % of allocatedCapital

## Bug Fixes
- [x] Fix: New positions start at $0 value until manual refresh — seed currentPrice/currentValue from trade price at execution time; sleeve positionsValue/totalValue recalculated immediately after every trade
- [x] Fix: Portfolio Value card shows -80% total return — was dividing by group.totalCapital ($500K) instead of sum of sleeve allocatedCapitals
- [x] Fix: Leaderboard Portfolio Value incorrect after Refresh (shows wrong total/return %)
- [x] Fix: Prices not being picked up automatically (switched to query2.finance.yahoo.com with 429 retry backoff)
- [x] Fix: Portfolio Value on leaderboard doesn't sum all sleeve totalValues correctly (was correct, staleness fixed by cron)
- [x] Fix: Clicking another player's sleeve on leaderboard loads own sleeve instead of theirs (getSleeveById by URL param)
- [x] Fix: S2Cap sleeve shows $200K totalValue but should show $100K (totalValue now initialized to allocatedCapital on join)
- [x] Fix: Existing S2Cap sleeve still shows $200K in DB — fixed directly in DB (allocatedCapital + totalValue + cashBalance all set to 100K, stale snapshots cleared)
- [x] Fix: Proper URL routing — each view has a bookmarkable URL, browser back/forward works throughout
- [x] Fix: Tickers HCOW, HIMX, LNG, EQT (and similar MLP/small-cap) not resolving in search or quote (confirmed working via query2)
- [x] Remove manual price entry from trade form — price is now read-only, auto-filled from live Yahoo Finance quote
- [x] Clickable position rows that open a pre-filled trade dialog (buy more / sell / short / cover)
- [x] Server-side cron: snapshot all active groups at 4:05 PM ET Mon–Fri (node-cron)
- [x] Add 3-month reallocation interval option (schema + UI)
- [x] Leaderboard multi-line equity curve: all participants' portfolio value over time on one chart
- [x] In-kind reallocation: confirmed already implemented (allocatedCapital only, no cash debit/credit)
- [x] One-step invite link: /join/:code shows group preview + combined register+join form for new users, one-click join for logged-in users

## New Features (Round 3)
- [x] Delete competition (admin only, cascades all sleeves/positions/trades)
- [x] P&L equity curve chart on Sleeve Manager (Recharts area chart from portfolio_snapshots)
- [x] Last-refreshed timestamp badge on leaderboard
- [x] Short-selling: trade form toggle, inverted P&L logic, short position indicator

## New Features (Round 2)
- [ ] DB: portfolio_snapshots table (sleeveId, totalValue, positionsValue, cashBalance, returnPct, snapshotAt)
- [ ] Backend: save snapshot on every price refresh (single-sleeve and all-sleeves)
- [ ] Backend: getSnapshots procedure returning time-series for a sleeve
- [ ] Frontend: Recharts equity curve (area chart) on Sleeve Manager showing total value over time
- [ ] Frontend: "Last refreshed" timestamp badge on leaderboard header
- [ ] DB: isShort flag on positions and trades tables
- [ ] Backend: short trade logic (sell-to-open increases cash, buy-to-cover reduces cash, P&L inverted)
- [ ] Frontend: Short toggle in trade form with visual indicator on position rows

## Mobile Fixes (Round 7)
- [x] Fix: GroupDashboard tab bar clips Challenges tab on mobile — tabs overflow horizontally and the 4th tab is not reachable
- [x] Conviction pick form: add ticker autocomplete search (same as trade form)
- [x] Conviction pick form: show live price confirmation before locking in pick
- [x] Backend: deletePick procedure — allows manager to delete their own pick while liveStatus === 'picking'
- [x] Frontend: show 'Change Pick' button on myEntry card during pick window (deletes current pick, reopens submit dialog)

## Earnings Play Competition (Round 8)
- [ ] Schema: earningsPicks table (challengeId, sleeveId, userId, ticker, direction up/down, prevClose, openPrice, result correct/wrong/pending, points)
- [ ] Schema: challenges.type enum extended to include 'earnings'
- [ ] Backend: enterEarningsPick — add/update a pick (ticker + direction) during pick window
- [ ] Backend: deleteEarningsPick — remove a single pick during pick window
- [ ] Backend: scoreEarnings — fetch open price for each pick, compare to prevClose, assign +1/-1, rank by total points, award bump
- [ ] Backend: list procedure returns earningsPicks per challenge
- [ ] Frontend: EarningsCard — ticker search + Up/Down toggle, pick list with edit/delete, submit button
- [ ] Frontend: Leaderboard shows each manager's picks + points during active/scoring/completed
- [ ] Frontend: CreateChallengeDialog — add Earnings Play type option

## Reallocation Intervals (Round 9)
- [x] Schema: extend reallocationInterval enum to include '1week', '2weeks', '1month' alongside existing '3months', '6months', '12months'
- [x] Backend: update nextReallocationDate calculation to handle new intervals
- [x] Frontend: update group creation form to show all 6 interval options
- [x] Frontend: update group settings to show all 6 interval options

## Competition End Date (Round 10)
- [x] Schema: add endDate (nullable timestamp) to groups table
- [x] Backend: group.create accepts endDate; group.update allows admin to set/change endDate; leaderboard returns endDate
- [x] Frontend: CreateGroup — add optional end date picker
- [x] Frontend: AdminPanel — add end date field with edit/save; show current end date
- [x] Frontend: GroupDashboard — show countdown to end date; show "Competition Ended" winner banner when past end date

## Earnings Calendar Integration (Round 11)
- [ ] Backend: add getEarningsCalendar(from, to) helper using Finnhub free API
- [ ] Backend: earningsCalendar tRPC procedure returning upcoming earnings for a date range
- [ ] Frontend: EarningsCard pick form shows live calendar of upcoming earnings grouped by date
- [ ] Frontend: one-click pick from calendar row (auto-fills ticker + prompts up/down)

## Earnings Calendar Integration v2 (Round 12)
- [x] Fix: Earnings Play type missing from Create Mini-Competition dialog
- [x] Build yfinance Python microservice for earnings calendar (Flask, port 5001)
- [x] Backend: earningsCalendar tRPC procedure calling Python service
- [x] Frontend: EarningsCard pick form shows live calendar grouped by date with one-click pick

## Earnings Date Visibility (Round 13)
- [x] Schema: add reportDate (text, nullable) to earningsPicks table; push migration
- [x] Backend: enterEarningsPick accepts optional reportDate; fetches it from yfinance service if not provided
- [x] Backend: list procedure returns reportDate on each earningsPick row
- [x] Frontend: submitted picks list shows earnings date next to ticker
- [x] Frontend: competitor leaderboard shows each pick's earnings date
- [x] Frontend: calendar quick-pick buttons show the date label inline

## Railway Earnings Calendar Fix (Round 14)
- [x] Add nixpacks.toml to start both Node.js and Python yfinance service on Railway
- [x] Add requirements.txt with yfinance and flask for Railway Python install
- [x] Backend: static fallback calendar (earningsFallback.ts) for 60+ major tickers
- [x] Backend: earningsCalendar procedure merges live data with fallback; uses fallback-only when service unreachable
- [x] Backend: enterEarningsPick auto-resolves reportDate from fallback if service unavailable
- [x] Frontend: existing picks show reportDate even when fetched without calendar (auto-fetch on submit)

## Earnings Modal Fix (Round 15)
- [x] Fix: EarningsPickDialog shows "No tracked earnings" — root cause was Python service timing out due to sequential API calls
- [x] Fix: Rewrote Python service to pre-warm cache in parallel on startup; requests now return instantly from cache
- [x] Fix: Static fallback calendar always shown when Python service is unavailable (Railway before redeploy)

## Railway Deploy Fix (Round 16)
- [x] Fix: nixpacks.toml causing Railway build failure — replaced with Dockerfile using node:22-slim + python3 + pip3
- [x] Added .dockerignore to exclude node_modules, dist, .git from build context

## Railway Dockerfile Fix Round 2 (Round 17)
- [x] Fix: Dockerfile missing COPY patches/ before pnpm install — caused ENOENT on wouter@3.7.1.patch

## Railway Deploy Fix Round 3 (Round 18)
- [x] Fix: Railway overriding Dockerfile CMD with pnpm start — added railway.json to force Dockerfile builder and explicit startCommand

## Railway Deploy Fix Round 4 (Round 19)
- [x] Fix: install pnpm in runtime stage so Railway's default pnpm start works
- [x] Fix: update package.json start script to also launch Python earnings service

## Short Position Bug Fix (Round 20)
- [x] Fix: opening a short position incorrectly adds to portfolio value (should be neutral / reduce cash margin)

## Short Position Bug Fix Round 2 (Round 21)
- [x] Fix: portfolio value still shows too high after short open — stale fallback path in all 3 refresh locations was reading raw DB value without sign correction

## Extended Hours Pricing (Round 22)
- [x] Backend: use preMarketPrice / postMarketPrice from Yahoo Finance when market is closed
- [x] Backend: return marketState and priceSource (regular/pre/post) alongside price
- [x] Frontend: show "PRE" or "AH" badge on position rows and price cards when using extended hours price

## Extended Hours Header Indicator + Auto-Score Earnings (Round 23)
- [x] Frontend: show PRE/AH chip on sleeve header Total Value card when any position uses extended hours price
- [x] Backend: 9:35am ET cron to auto-score earnings picks at open price (day after earnings date)
- [x] Backend: store settlement price on earnings_picks when auto-scored

## Portfolio Value History Chart Sort (Round 24)
- [x] Fix: chart x-axis shows Apr 1 on left and Mar 31 on right — removed erroneous .reverse() call in SleeveManager.tsx chartData

## Username Validation + Error Display (Round 25)
- [x] Fix: username regex rejects spaces — updated regex to allow spaces, trim on input
- [x] Fix: raw Zod JSON error shown in create account form — now parses JSON and shows first human-readable message

## Wrong Snapshot on View-Only Sleeve (Round 26)
- [x] Fix: viewing another competitor's sleeve shows the viewer's own chart — getSnapshots now accepts sleeveId param and fetches the correct sleeve's snapshots

## Ticker Company Name on Positions (Round 27)
- [x] Backend: store shortName/longName from Yahoo Finance quote in price_cache (already done)
- [x] Backend: return companyName alongside positions in getSleeveById and getSleeve
- [x] Frontend: show company name below ticker on each position row

## After-Hours Price Debug (Round 28)
- [x] Fix: after-hours prices not showing — v8/chart 1d endpoint doesn't return marketState/postMarketPrice; switched to 1m+includePrePost=true and classify price source from last candle timestamp vs currentTradingPeriod boundaries

## Broad UI/UX/Engagement Improvements (Round 29)
- [x] Home: GroupCard shows user's sleeve return % and rank (already implemented)
- [x] Home: GroupCard shows actual manager count (already implemented)
- [x] Leaderboard: add 7-day mini sparkline per manager row
- [ ] Leaderboard: rank change indicator vs yesterday
- [x] SleeveManager: show unrealized P&L on mobile (removed hidden md:block)
- [x] SleeveManager: loading skeleton instead of spinner
- [x] SleeveManager: stale price banner if lastPricedAt > 30 min
- [x] SleeveManager: intraday snapshot on every Refresh (already implemented)
- [x] TradeForm: "Max shares" quick-fill button
- [x] TradeForm: confirmation dialog for large trades (>20% of portfolio)
- [x] JoinGroup: fix stale username hint text (done in Round 25)
- [x] ErrorBoundary: friendly error message instead of raw stack trace
- [x] TradeRow: show total trade value and time in trade history
- [x] Fix: formatPct double-plus in P&L display

## Email Collection + Auth Audit (Round 30)
- [x] Schema: add email column (nullable) to users table
- [x] Backend: update register procedure to accept and store email (optional, with uniqueness check)
- [x] Backend: add updateUserEmail protected procedure for existing-user migration
- [x] Backend: return email field in auth.me response
- [x] Frontend: add email field to Create Account form in Login.tsx
- [x] Frontend: add email field to JoinGroup.tsx inline registration
- [x] Frontend: show "Complete your profile" email prompt after login if user.email is null (EmailMigrationPrompt.tsx)
- [x] Frontend: email prompt dismissible with localStorage flag to avoid re-showing on every page load

## Max Button Enhancement (Round 31)
- [x] Fix: Max button now works for all sides — buy/cover (Max based on cash), sell (All held qty), short (Max based on cash)

## Admin Players & Ledger (Round N)
- [x] Schema: cash_adjustments table (sleeveId, groupId, userId, adminId, amount, reason, createdAt)
- [x] Backend: admin.adjustCash — add/deduct cash from a sleeve with audit record; blocks negative cash
- [x] Backend: admin.getActivityLedger — unified feed of trades, challenge awards, reallocations, cash adjustments per sleeve
- [x] Backend: admin.getPlayers — sleeves + displayName/email for admin overview
- [x] Frontend: AdminLedger page (/group/:id/admin/ledger) — player cards with cash adjustment form + collapsible ledger tabs
- [x] Frontend: AdminPanel header — "Players & Ledger" button linking to new page
