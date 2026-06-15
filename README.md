# SpinAds (working name)

Ad marketplace for AI-agent wait states. When a coding agent (Antigravity, Claude
Code, etc.) is "thinking", the extension shows a paid ad line. Advertisers bid in
a live auction; **60% of revenue goes to the developer** whose machine showed the
ad, 40% to the platform.

> Rename `spinads` to whatever brand you pick.

## Build status

| # | Piece | State |
|---|-------|-------|
| 1 | **Auction engine** (`packages/auction`) | ✅ done — eCPM ranking + second-price (GSP) + micros accounting. 10/10 tests pass. |
| 2 | **Ad server** (`packages/server`) | ✅ done — Fastify; `/register` `/serve` `/event`; HMAC device sigs + signed serve tokens; replay & rate-limit fraud guards; 40/60 ledger. 7/7 tests pass. Boots & serves live HTTP. |
| 3 | Extension client (Antigravity/VS Code) | ✅ done — busy-state → webview ad → signed impression/click; earnings status bar. Installable `.vsix`. |
| 4 | **Advertiser portal** (`/portal/advertiser`) | ✅ done — self-serve account + API key, campaign create, top-up, **live leaderboard**. |
| 5 | **Developer dashboard** (`/portal/developer`) | ✅ done — earnings lookup + payout request (moves to pending). |
| 6 | **Payments** (Stripe + Razorpay) | ⚙️ code-complete — top-up checkout + webhook + payout. Needs your live keys; server runs without them. |

## Portals & API

- Advertiser portal: `GET /portal/advertiser`
- Developer dashboard: `GET /portal/developer`
- API: `/v1/advertisers`, `/v1/campaigns`, `/v1/leaderboard`, `/v1/advertiser/topup`,
  `/v1/webhooks/stripe`, `/v1/developer/earnings`, `/v1/developer/payout`

## Enabling payments (#6)

In the server, set these env vars (and `npm i stripe razorpay` in `packages/server`):

```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
RAZORPAY_KEY_ID=rzp_live_...
RAZORPAY_KEY_SECRET=...
PUBLIC_BASE_URL=https://your-railway-domain
```

Point your Stripe webhook at `POST /v1/webhooks/stripe`. Developer payouts require
each developer to connect a Stripe Connect account / RazorpayX fund account first.

## Run it

```bash
# 1. auction engine
cd packages/auction && npm install && npm run build && node --test dist/auction.test.js

# 2. ad server
cd ../server && npm install && npm test          # build + integration tests
SERVER_SECRET=$(openssl rand -base64 24) npm start   # boots on :8080
```

Health: `GET /v1/health` → `{ "ok": true }`

## Fraud model (why earnings stay clean)

- Each device gets a **per-device secret** at `/register`; every call is HMAC-signed.
- `/serve` issues a **server-signed serveToken** binding {campaign, device, price}.
  The client cannot invent impressions for arbitrary campaigns or inflate price.
- Impressions are **replay-protected** (one per token); a click must follow its
  impression; per-device **rate limiting** drops floods. Bot traffic never settles.

## Production notes

- DB is `node:sqlite` for single-node simplicity. For scale, implement the same
  `Db` method surface against Postgres (every query is portable SQL). Railway
  Singapore region per the infra plan.
- Money is integer **micros** internally (1 paisa = 10,000 micros); settle to
  whole paise at payout. No float drift.
