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
