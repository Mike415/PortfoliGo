# PortfoliGo — Todo

## Authentication
- [ ] Custom username/passcode auth (no OAuth)
- [ ] Invite code system for joining groups
- [ ] Session management with JWT

## Database Schema
- [ ] Users table (username, hashed passcode, role)
- [ ] Groups table (name, total capital, start date, reallocation interval)
- [ ] Sleeves table (group, user, allocated capital, current value)
- [ ] Positions table (sleeve, ticker, asset type, quantity, avg cost)
- [ ] Trades table (sleeve, ticker, side, quantity, price, timestamp)
- [ ] Reallocation history table
- [ ] Price cache table (ticker, price, last updated)

## Backend Procedures
- [ ] auth.register / auth.login / auth.logout
- [ ] group.create / group.get / group.join (invite code)
- [ ] sleeve.get / sleeve.getAll (leaderboard)
- [ ] trade.add / trade.list
- [ ] position.list / position.getWithPrices
- [ ] pricing.getQuote (Yahoo Finance API)
- [ ] pricing.batchQuote (multiple tickers)
- [ ] pricing.getHistory (chart data)
- [ ] admin.configureGroup / admin.triggerReallocation
- [ ] admin.getReallocationPreview

## Frontend Pages
- [ ] Landing / login page
- [ ] Register page
- [ ] Group dashboard (aggregate view)
- [ ] My Sleeve page (positions + P&L)
- [ ] Trade entry form
- [ ] Leaderboard page
- [ ] Admin panel (group config + reallocation)
- [ ] Performance charts (historical)

## Live Pricing
- [ ] Fetch real-time prices for all positions
- [ ] Mark-to-market P&L calculation
- [ ] Auto-refresh pricing on dashboard
- [ ] Support stocks, ETFs, crypto (BTC-USD format)

## Reallocation Engine
- [ ] Calculate sleeve rankings by return %
- [ ] Bottom performer loses 5% of sleeve
- [ ] Top performer gains 5% of sleeve
- [ ] Admin preview before confirming
- [ ] Reallocation history log

## UI Polish
- [ ] Dark financial theme (Bloomberg-inspired)
- [ ] Responsive design
- [ ] Loading states and error handling
- [ ] Performance charts with Recharts

## GitHub
- [ ] Push to https://github.com/Mike415/PortfoliGo
