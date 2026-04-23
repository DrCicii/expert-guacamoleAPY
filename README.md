# DeFi APY Tracker (static)

A zero-dependency on-site web app to track **APY**, **deposits**, and a live **money earned** counter (default update every **3 seconds**).

## Run it

### Option A: open directly

Open `index.html` in your browser.

> Note: Some browsers may restrict file imports/exports when opened directly. If that happens, use Option B.

### Option B: run the bundled Node server (recommended)

```bash
cd /path/to/Projekat
set TELEGRAM_BOT_TOKEN=your_bot_token_here
set TELEGRAM_CHAT_ID=your_chat_id_here
node server.mjs
```

Then open `http://localhost:5173`.

> If you do not need Telegram notifications, you can omit the two `TELEGRAM_*` variables.

## Features

- Add multiple DeFi platforms (name, optional token symbol, deposit, APY, start time)
- Live earnings + total value, updating on a timer (default `3000ms`)
- 4 decimals by default (configurable)
- Persisted locally in your browser (`localStorage`)
- Export / Import JSON
- **Solana wallet sync (public address)**: pulls supported DeFi deposits and APY automatically
- **Telegram notifications**:
  - sends a message each time total earned crosses the next whole `$1` milestone
  - sends an alert when any tracked platform APY drops by `>= 1.0` percentage point

## Interest models

- **APY as effective annual yield** (default): value grows by \((1 + apy)^{t / 1year}\)
- **Simple interest**: value grows by \(1 + apy \cdot t\) (APR-like)

## Solana wallet sync

In the app, use **“Sync from wallet (Solana)”**:

- Paste your **public Solana address (base58)**
- (Optional) set a **Solana RPC URL** (recommended for reliability)
- Click **Sync now**

### What’s supported (Solana-only)

- **Kamino Earn (KVaults)**: detects your vault positions and pulls vault APY via Kamino’s public API (`api.kamino.finance`).
- **Jupiter Lend Earn**: detects your Earn positions via Jupiter’s public API (`api.jup.ag`) and pulls live supply rates via your Solana RPC.

### Notes / limitations

- This is **read-only**: it does not connect to your wallet and can’t move funds.
- APY values are **cached** and refreshed in the background (default ~60s) to avoid spamming RPC/providers.
- Deposit USD values depend on upstream pricing from the protocol APIs (and may differ slightly from other dashboards).

