# Deploying PortfoliGo on Railway

This guide walks you through deploying PortfoliGo on [Railway](https://railway.app) — no Manus account required for your friends.

---

## Prerequisites

- A [Railway](https://railway.app) account (free tier works)
- The code pushed to `Mike415/PortfoliGo` on GitHub ✓

---

## Step 1 — Create a New Railway Project

1. Go to [railway.app/new](https://railway.app/new)
2. Click **Deploy from GitHub repo**
3. Authorize Railway to access your GitHub account if prompted
4. Select **Mike415/PortfoliGo**
5. Railway will detect it as a Node.js app via `nixpacks` automatically

---

## Step 2 — Add a MySQL Database

1. In your Railway project dashboard, click **+ New**
2. Select **Database → MySQL**
3. Railway provisions a MySQL 8 instance and automatically creates a `DATABASE_URL` variable

---

## Step 3 — Set Environment Variables

In your Railway app service → **Variables** tab, add:

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | *(auto-linked from MySQL service)* | Railway links this automatically |
| `JWT_SECRET` | Any long random string | Generate with: `openssl rand -hex 32` |
| `NODE_ENV` | `production` | Required for production build |

> **Note:** The Manus OAuth variables (`VITE_APP_ID`, `OAUTH_SERVER_URL`, `VITE_OAUTH_PORTAL_URL`, etc.) are **not needed** — PortfoliGo uses its own username/passcode authentication system.

---

## Step 4 — Run the Database Migration

After the first deploy, open the Railway **Shell** for your app service and run:

```bash
pnpm db:push
```

This creates all 10 database tables. You only need to do this once (or after schema changes).

Alternatively, use the Railway CLI:

```bash
railway run pnpm db:push
```

---

## Step 5 — Access Your App

Railway provides a public URL like:
```
https://portfoligo-production.up.railway.app
```

Share this with your friends. They can:
1. Register with a username and passcode
2. You (as admin) create the competition group
3. Share the invite code from the Admin Panel
4. Friends join using the invite code

---

## Environment Variables Reference

Only these two are required on Railway:

```env
DATABASE_URL=mysql://user:password@host:port/dbname   # Auto-provided by Railway MySQL
JWT_SECRET=your-random-secret-here                     # Session signing key
NODE_ENV=production
```

---

## Pricing

PortfoliGo uses the **Yahoo Finance public API** directly — no API key required. It handles the crumb/cookie session automatically. The 5-minute price cache keeps requests well within Yahoo's rate limits for a 5-person competition.

---

## Troubleshooting

**App crashes on startup:**
- Check that `DATABASE_URL` is set and the MySQL service is running
- Run `pnpm db:push` to ensure tables exist

**Prices not loading:**
- Yahoo Finance occasionally blocks cloud IPs temporarily. Prices will retry automatically.
- The app falls back to cached prices if a live fetch fails.

**Login not working:**
- Ensure `JWT_SECRET` is set in Railway environment variables
