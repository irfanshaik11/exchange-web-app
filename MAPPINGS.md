# Pulse WebSocket Field Mappings Documentation

This document provides a comprehensive reference for all field mappings between the backend WebSocket data and the frontend PulseToken interface.

---
## Table of Contents:

1. [Overview](#overview)
2. [Data Flow Architecture](#data-flow-architecture)
3. [Message Types](#message-types)
4. [Field Mappings by Category](#field-mappings-by-category)
   - [Core Identifiers](#core-identifiers)
   - [Basic Info](#basic-info)
   - [Timestamps](#timestamps)
   - [Price Data](#price-data)
   - [Market Metrics](#market-metrics)
   - [Holder & Wallet Counts](#holder--wallet-counts)
   - [Transaction Counts](#transaction-counts)
   - [Buyer/Seller Counts](#buyerseller-counts)
   - [Volume Data](#volume-data)
   - [Percentage Holdings](#percentage-holdings)
   - [Bonding Curve](#bonding-curve)
   - [Pro Traders & Smart Money](#pro-traders--smart-money)
   - [Fees & Gas](#fees--gas)
   - [Trade Info](#trade-info)
   - [Migration Data](#migration-data)
5. [Data Type Conversions](#data-type-conversions)
6. [Price Update vs New Token Fields](#price-update-vs-new-token-fields)
7. [Error Handling](#error-handling)
8. [Source Files Reference](#source-files-reference)

---

## Overview

The Pulse feature displays real-time token data from WebSocket connections. Data flows from the Go backend through a Web Worker to React components. Due to historical reasons and different API versions, many fields have multiple name variants that must all be supported.

### Key Principles

1. **Backend sends strings for numeric values** - Always use `parseFloat()` or `toNum()` helper
2. **Price updates are partial** - Only update fields that exist in the update, preserve others
3. **Support all field name variants** - Both snake_case and camelCase versions
4. **Timestamps can be ISO strings or Unix milliseconds** - Handle both formats
5. **Error handling is critical** - Malformed messages should be logged and skipped, not crash

---

## Data Flow Architecture

```
┌─────────────────────┐
│   Go Backend        │
│   (WebSocket)       │
│                     │
│ pulse_realtime_     │
│ pusher.go           │
│                     │
│ price_update_       │
│ broadcaster.go      │
└─────────┬───────────┘
          │ JSON (snake_case)
          ▼
┌─────────────────────┐
│   Web Worker        │
│   pulseWorker.js    │
│                     │
│ handleMessage()     │
│ normalizeToken()    │
│ updateTokenInArray()│
└─────────┬───────────┘
          │ Normalized PulseToken
          ▼
┌─────────────────────┐
│   Bridge            │
│   pulseWorkerBridge │
│   .ts               │
│                     │
│ handlePriceUpdate() │
│ normalizeToken()    │
└─────────┬───────────┘
          │ PulseToken
          ▼
┌─────────────────────┐
│   React Components  │
│   PulseTable.tsx    │
│   ErrorBoundary.tsx │
└─────────────────────┘
```

---

## Message Types

The worker handles multiple message type variants for each category to ensure compatibility with different backend versions.

### 1. New Token Messages

Sent when a new token is created. Contains ALL fields.

**Supported message types:**
- `new_token` (primary)
- `newToken`
- `new`
- `token_new`

```json
{
  "type": "new_token",
  "channel": "new",
  "data": { /* full PulseToken */ }
}
```

**Alternative formats supported:**
```json
// Token wrapped in data
{ "type": "new_token", "data": { "mint": "...", ... } }

// Token in token field
{ "type": "new_token", "token": { "mint": "...", ... } }

// Array of tokens
{ "type": "new_token", "data": [{ "mint": "..." }, { "mint": "..." }] }

// Direct token (no type, inferred from channel)
{ "mint": "...", "name": "..." }
```

### 2. Final Stretch Messages

Sent when a token reaches >85% bonding curve.

**Supported message types:**
- `final_stretch_token` (primary)
- `finalStretch`
- `final_stretch`
- `completing`
- `token_final_stretch`

```json
{
  "type": "final_stretch_token",
  "channel": "final_stretch",
  "data": { /* full PulseToken */ }
}
```

### 3. Migrated Messages

Sent when a token migrates to Raydium/AMM.

**Supported message types:**
- `migrated_token` (primary)
- `migrated`
- `migration`
- `completed`
- `token_migrated`

```json
{
  "type": "migrated_token",
  "channel": "migrated",
  "data": { /* full PulseToken */ }
}
```

### 4. Price Update Messages

Sent periodically with PARTIAL data. **Only contains subset of fields!**

**Supported message types:**
- `price_update` (primary)
- `priceUpdate`
- `price`

```json
{
  "type": "price_update",
  "data": [{ /* partial token data */ }]
}
```

### 5. Token Info Update Messages

Updates token metadata without price changes.

**Supported message types:**
- `token_info_update` (primary)
- `tokenInfo`
- `token_info`
- `info`

```json
{
  "type": "token_info_update",
  "data": { /* token info fields */ }
}
```

### 6. Batch Messages

Contains multiple updates in a single message.

**Supported message types:**
- `batch` (primary)
- `bulk`

```json
{
  "type": "batch",
  "updates": [{ "type": "price_update", "data": {...} }, ...]
}
```

### 7. System Messages (Ignored)

These message types are silently ignored:
- `ping`
- `pong`
- `heartbeat`
- `connected`

---

## Field Mappings by Category

### Core Identifiers

| Backend Field | Frontend Fields | Type | Notes |
|---------------|-----------------|------|-------|
| `mint` | `mint`, `mint_address` | string | Primary token identifier (Solana address) |
| `address` | `mint`, `mint_address` | string | Alternative identifier |
| `mint_address` | `mint`, `mint_address` | string | Alternative identifier |
| `token_address` | `mint` | string | Alternative identifier |
| `contract_address` | `mint` | string | Alternative identifier |

**Normalization:**
```javascript
const mint = rawToken.mint || rawToken.address || rawToken.mint_address || rawToken.token_address || rawToken.contract_address;
```

---

### Basic Info

| Backend Field | Frontend Fields | Type | Notes |
|---------------|-----------------|------|-------|
| `name` | `name` | string | Token name |
| `token_name` | `name` | string | Alternative field |
| `symbol` | `symbol` | string | Token symbol (ticker) |
| `token_symbol` | `symbol` | string | Alternative field |
| `image` | `image`, `logo` | string | Token image URL |
| `image_uri` | `image`, `logo` | string | Alternative field |
| `imageUrl` | `image`, `logo` | string | Alternative field |
| `logo` | `logo`, `image` | string | Alternative field |
| `uri` | `uri`, `image` | string | Metadata URI |
| `status` | `status` | string | Token status (default: "active") |
| `launchpad_protocol` | `launchpad_protocol` | string | Protocol (e.g., "pumpfun") |
| `protocol` | `launchpad_protocol` | string | Alternative field |
| `LaunchpadProtocol` | `launchpad_protocol` | string | Go export variant |
| `pair_address` | `pair_address` | string | DEX pair address |
| `PairAddress` | `pair_address` | string | Go export variant |
| `links` | `links` | object | Social links |
| `Links` | `links` | object | Go export variant |

**Normalization:**
```javascript
name: rawToken.name || rawToken.token_name || 'Unknown',
symbol: rawToken.symbol || rawToken.token_symbol || '???',
image: rawToken.image || rawToken.image_uri || rawToken.imageUrl || rawToken.logo || rawToken.uri || null,
launchpad_protocol: rawToken.launchpad_protocol || rawToken.protocol || rawToken.LaunchpadProtocol || 'pumpfun',
```

---

### Timestamps

| Backend Field | Frontend Fields | Type | Notes |
|---------------|-----------------|------|-------|
| `launch_time` | `created_at`, `launch_time` | string (ISO) | **Primary** - When token was created |
| `created_at` | `created_at` | string/number | ISO string or Unix timestamp |
| `createdAt` | `created_at` | number | camelCase variant |
| `LaunchTime` | `created_at`, `launch_time` | string | Go export variant |
| `updated_at` | `updated_at` | string | Last update time |
| `migrated_time` | `migrated_time` | string | When token migrated |
| `MigratedTime` | `migrated_time` | string | Go export variant |

**CRITICAL:** Backend sends `launch_time` as ISO 8601 string (e.g., `"2025-01-22T10:30:00Z"`).
Must convert to Unix timestamp for age calculations.

**Normalization:**
```javascript
const createdAtValue = rawToken.launch_time || rawToken.created_at || rawToken.createdAt || rawToken.LaunchTime || Date.now();

// In component, parse to timestamp:
const timestamp = typeof createdAtValue === 'string'
  ? new Date(createdAtValue).getTime()
  : createdAtValue;
```

---

### Price Data

| Backend Field | Frontend Fields | Type | Notes |
|---------------|-----------------|------|-------|
| `price_usd` | `price`, `price_usd`, `usd_price` | string/number | **Primary** - Current USD price |
| `priceUSD` | `priceUSD` | string | String version |
| `usd_price` | `usd_price`, `price` | string/number | Alternative field |
| `price` | `price` | number | Normalized numeric value |
| `price_percent_change_5m` | `price_change_5m`, `priceChange5m`, `price_percent_change_5m` | string/number | 5-minute price change % |
| `price_change_5m` | `price_change_5m` | string/number | Alternative field |
| `priceChange5m` | `priceChange5m` | number | camelCase variant |
| `price_percent_change_1h` | `price_change_1h`, `price_percent_change_1h` | string/number | 1-hour price change % |
| `price_change_1h` | `price_change_1h` | string/number | Alternative field |
| `priceChange1h` | `priceChange1h` | number | camelCase variant |
| `price_percent_change_6h` | `price_change_6h`, `price_percent_change_6h` | string/number | 6-hour price change % |
| `price_change_6h` | `price_change_6h` | string/number | Alternative field |
| `priceChange6h` | `priceChange6h` | number | camelCase variant |
| `price_percent_change_24h` | `price_change_24h`, `price_percent_change_24h` | string/number | 24-hour price change % |
| `price_change_24h` | `price_change_24h` | string/number | Alternative field |
| `priceChange24h` | `priceChange24h` | number | camelCase variant |

**CRITICAL:** Backend may send price as STRING. Must use `parseFloat()`.

**Normalization:**
```javascript
const priceValue = parseFloat(rawToken.price_usd) || parseFloat(rawToken.priceUSD) || parseFloat(rawToken.usd_price) || parseFloat(rawToken.price) || 0;
const priceChange5mValue = parseFloat(rawToken.price_percent_change_5m) || parseFloat(rawToken.price_change_5m) || parseFloat(rawToken.priceChange5m) || 0;
```

---

### Market Metrics

| Backend Field | Frontend Fields | Type | Notes |
|---------------|-----------------|------|-------|
| `market_cap_usd` | `marketCap`, `market_cap_usd`, `fully_diluted_value` | string/number | **Primary** - Market cap in USD |
| `marketCapUSD` | `marketCapUSD` | string | String version |
| `fully_diluted_value` | `fully_diluted_value`, `marketCap` | string/number | FDV (same as mcap for memecoins) |
| `marketCap` | `marketCap` | number | camelCase variant |
| `fdv` | `marketCap` | number | Alternative field |
| `mcap` | `marketCap` | number | Alternative field |
| `volume_24h` | `volume`, `volume_24h` | string/number | **Primary** - 24h trading volume |
| `volume24h` | `volume24h` | string | String version |
| `volume` | `volume` | number | Normalized numeric value |
| `liquidity_usd` | `liquidity`, `liquidity_usd`, `total_liquidity_usd` | string/number | **Primary** - Liquidity in USD |
| `liquidityUSD` | `liquidityUSD` | string | String version |
| `total_liquidity_usd` | `total_liquidity_usd`, `liquidity` | string/number | Alternative field |
| `liquidity` | `liquidity` | number | Normalized numeric value |

**Normalization:**
```javascript
const marketCapValue = parseFloat(rawToken.market_cap_usd) || parseFloat(rawToken.marketCapUSD) || parseFloat(rawToken.fully_diluted_value) || parseFloat(rawToken.marketCap) || parseFloat(rawToken.fdv) || 0;
const volumeValue = parseFloat(rawToken.volume_24h) || parseFloat(rawToken.volume24h) || parseFloat(rawToken.volume) || 0;
const liquidityValue = parseFloat(rawToken.liquidity_usd) || parseFloat(rawToken.liquidityUSD) || parseFloat(rawToken.total_liquidity_usd) || parseFloat(rawToken.liquidity) || 0;
```

---

### Holder & Wallet Counts

| Backend Field | Frontend Fields | Type | Notes |
|---------------|-----------------|------|-------|
| `holder_count` | `holders`, `holder_count`, `total_holders` | number | **Primary** - Total holder count |
| `holders` | `holders` | number | Alternative field |
| `total_holders` | `total_holders`, `holders` | number | Alternative field |
| `unique_wallets_24h` | `unique_wallets_24h` | number | Unique wallets in 24h |
| `unique_wallets_6h` | `unique_wallets_6h` | number | Unique wallets in 6h |
| `unique_wallets_1h` | `unique_wallets_1h` | number | Unique wallets in 1h |
| `unique_wallets_5m` | `unique_wallets_5m` | number | Unique wallets in 5m |

**Normalization:**
```javascript
const holderValue = rawToken.holder_count ?? rawToken.holders ?? rawToken.total_holders ?? rawToken.unique_wallets_24h ?? 0;
```

---

### Transaction Counts

These represent the NUMBER OF TRANSACTIONS (not unique wallets).

| Backend Field | Frontend Fields | Type | Notes |
|---------------|-----------------|------|-------|
| `total_buys_5m` | `total_buys_5m` | number | Buy transactions in 5 minutes |
| `total_sells_5m` | `total_sells_5m` | number | Sell transactions in 5 minutes |
| `total_buys_1h` | `total_buys_1h` | number | Buy transactions in 1 hour |
| `total_sells_1h` | `total_sells_1h` | number | Sell transactions in 1 hour |
| `total_buys_6h` | `total_buys_6h` | number | Buy transactions in 6 hours |
| `total_sells_6h` | `total_sells_6h` | number | Sell transactions in 6 hours |
| `total_buys_24h` | `total_buys_24h` | number | Buy transactions in 24 hours |
| `total_sells_24h` | `total_sells_24h` | number | Sell transactions in 24 hours |
| `txns` | `txns` | object | `{ buys: number, sells: number }` |

**Normalization:**
```javascript
total_buys_5m: rawToken.total_buys_5m ?? 0,
total_sells_5m: rawToken.total_sells_5m ?? 0,
txns: rawToken.txns || { buys: 0, sells: 0 },
```

---

### Buyer/Seller Counts

**IMPORTANT:** These are DIFFERENT from transaction counts! These represent UNIQUE WALLETS.

| Backend Field | Frontend Fields | Type | Notes |
|---------------|-----------------|------|-------|
| `total_buyers_5m` | `total_buyers_5m` | number | Unique buyer wallets in 5 minutes |
| `total_sellers_5m` | `total_sellers_5m` | number | Unique seller wallets in 5 minutes |
| `total_buyers_1h` | `total_buyers_1h` | number | Unique buyer wallets in 1 hour |
| `total_sellers_1h` | `total_sellers_1h` | number | Unique seller wallets in 1 hour |
| `total_buyers_6h` | `total_buyers_6h` | number | Unique buyer wallets in 6 hours |
| `total_sellers_6h` | `total_sellers_6h` | number | Unique seller wallets in 6 hours |
| `total_buyers_24h` | `total_buyers_24h` | number | Unique buyer wallets in 24 hours |
| `total_sellers_24h` | `total_sellers_24h` | number | Unique seller wallets in 24 hours |

**Difference Explanation:**
- `total_buys_5m = 100` means 100 buy transactions happened
- `total_buyers_5m = 50` means 50 unique wallets made those buys (some wallets bought multiple times)

---

### Volume Data

| Backend Field | Frontend Fields | Type | Notes |
|---------------|-----------------|------|-------|
| `total_buy_volume_5m` | `total_buy_volume_5m` | string/number | Buy volume in 5 minutes (USD) |
| `total_sell_volume_5m` | `total_sell_volume_5m` | string/number | Sell volume in 5 minutes (USD) |
| `total_buy_volume_1h` | `total_buy_volume_1h` | string/number | Buy volume in 1 hour (USD) |
| `total_sell_volume_1h` | `total_sell_volume_1h` | string/number | Sell volume in 1 hour (USD) |
| `total_buy_volume_6h` | `total_buy_volume_6h` | string/number | Buy volume in 6 hours (USD) |
| `total_sell_volume_6h` | `total_sell_volume_6h` | string/number | Sell volume in 6 hours (USD) |
| `total_buy_volume_24h` | `total_buy_volume_24h` | string/number | Buy volume in 24 hours (USD) |
| `total_sell_volume_24h` | `total_sell_volume_24h` | string/number | Sell volume in 24 hours (USD) |

**CRITICAL:** Backend sends volume as STRING. Must use `parseFloat()`.

**Normalization:**
```javascript
total_buy_volume_5m: parseFloat(rawToken.total_buy_volume_5m) || 0,
total_sell_volume_5m: parseFloat(rawToken.total_sell_volume_5m) || 0,
```

---

### Percentage Holdings

| Backend Field | Frontend Fields | Type | Notes |
|---------------|-----------------|------|-------|
| `dev_percent` | `dev_percent`, `dev_held_percentage` | number | **Primary** - Developer holding % |
| `dev_held_percentage` | `dev_held_percentage`, `dev_percent` | number | Alternative field |
| `sniper_percent` | `sniper_percent`, `sniper_held_percentage` | number | **Primary** - Sniper holding % |
| `sniper_held_percentage` | `sniper_held_percentage`, `sniper_percent` | number | Alternative field |
| `total_snipers` | `total_snipers` | number | Count of sniper wallets |
| `insider_percent` | `insider_percent`, `insider_held_percentage` | number | **Primary** - Insider holding % |
| `insider_held_percentage` | `insider_held_percentage`, `insider_percent` | number | Alternative field |
| `bundle_percent` | `bundle_percent`, `bundled_percentage`, `bundler_held_percentage` | number | **Primary** - Bundle holding % |
| `bundled_percentage` | `bundled_percentage`, `bundle_percent` | number | Alternative field |
| `bundler_held_percentage` | `bundler_held_percentage` | number | Alternative field |
| `bundle_wallet_count` | `bundle_wallet_count`, `bundler_count` | number | Count of bundle wallets |
| `bundler_count` | `bundler_count` | number | Alternative field |
| `top10_holders_pct` | `top10_holders_pct` | number | Top 10 holders % |
| `top_10_holders_percent` | `top10_holders_pct` | number | Alternative field |

**Normalization:**
```javascript
const devPercentValue = rawToken.dev_percent ?? rawToken.dev_held_percentage ?? 0;
const sniperPercentValue = rawToken.sniper_percent ?? rawToken.sniper_held_percentage ?? 0;
const insiderPercentValue = rawToken.insider_percent ?? rawToken.insider_held_percentage ?? 0;
const bundlePercentValue = rawToken.bundle_percent ?? rawToken.bundled_percentage ?? 0;
```

---

### Bonding Curve

| Backend Field | Frontend Fields | Type | Notes |
|---------------|-----------------|------|-------|
| `bonding_pct` | `bondingCurveProgress`, `bonding_curve_progress`, `bonding_pct` | string/number | **Primary** - Bonding curve % |
| `bonding_curve_progress` | `bonding_curve_progress`, `bondingCurveProgress` | string/number | Alternative field |
| `bondingCurveProgress` | `bondingCurveProgress` | number | camelCase variant |
| `bonding_percent` | `bonding_pct` | number | Alternative field |
| `graduation_percent` | `graduation_percent` | number | Same as bonding % |

**CRITICAL:** Backend may send as STRING. Must use `parseFloat()`.

**Normalization:**
```javascript
const bondingValue = parseFloat(rawToken.bonding_pct) || parseFloat(rawToken.bonding_curve_progress) || parseFloat(rawToken.bondingCurveProgress) || parseFloat(rawToken.bonding_percent) || 0;
```

---

### Pro Traders & Smart Money

| Backend Field | Frontend Fields | Type | Notes |
|---------------|-----------------|------|-------|
| `kol_count` | `kol_count` | number | Key Opinion Leader count |
| `pro_traders_count` | `pro_traders_count` | number | Pro trader count |
| `pro_traders` | `pro_traders_count` | number | Alternative field |
| `smart_money_count` | `smart_money_count` | number | Smart money wallet count |

**Normalization:**
```javascript
kol_count: rawToken.kol_count ?? 0,
pro_traders_count: rawToken.pro_traders_count ?? rawToken.pro_traders ?? 0,
smart_money_count: rawToken.smart_money_count ?? 0,
```

---

### Fees & Gas

| Backend Field | Frontend Fields | Type | Notes |
|---------------|-----------------|------|-------|
| `total_fees_lamports` | `total_fees_lamports` | number | Total fees in lamports |
| `global_fees_paid` | `global_fees_paid`, `globalFeesPaid` | number | Global fees in USD |
| `globalFeesPaid` | `globalFeesPaid`, `global_fees_paid` | number | camelCase variant |

**Normalization:**
```javascript
total_fees_lamports: rawToken.total_fees_lamports ?? 0,
global_fees_paid: rawToken.global_fees_paid ?? rawToken.globalFeesPaid ?? 0,
globalFeesPaid: rawToken.globalFeesPaid ?? rawToken.global_fees_paid ?? 0,
```

---

### Trade Info

| Backend Field | Frontend Fields | Type | Notes |
|---------------|-----------------|------|-------|
| `trade_type` | `trade_type` | string | "buy" or "sell" |
| `sol_amount` | `sol_amount` | number | SOL amount in trade |
| `token_amount` | `token_amount` | number | Token amount in trade |

---

### Dev Activity Stats

| Backend Field | Frontend Fields | Type | Notes |
|---------------|-----------------|------|-------|
| `dev_tokens_created` | `dev_tokens_created` | number | Tokens created by dev |
| `dev_tokens_migrated` | `dev_tokens_migrated` | number | Tokens migrated by dev |

---

### Migration Data

| Backend Field | Frontend Fields | Type | Notes |
|---------------|-----------------|------|-------|
| `migrated_pool_address` | `migrated_pool_address` | string | Raydium pool address |
| `MigratedPoolAddress` | `migrated_pool_address` | string | Go export variant |
| `migrated_time` | `migrated_time` | string | When token migrated |
| `MigratedTime` | `migrated_time` | string | Go export variant |

---

## Data Type Conversions

### The `toNum` Helper (for normalizeToken)

Used when creating new tokens. Returns `0` for missing values (new tokens need defaults).

```javascript
const toNum = (val) => {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const parsed = parseFloat(val);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};
```

### The `getNum` Helper (for handlePriceUpdate)

Used when updating existing tokens. Returns `null` for missing values (preserve existing data).

```javascript
const getNum = (val) => {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const parsed = parseFloat(val);
    return isNaN(parsed) ? null : parsed;
  }
  return null;
};

// Usage: Only update if value exists, otherwise keep token's value
const priceValue = getNum(update.price_usd) ?? token.price;
```

### Why Two Helpers?

| Scenario | Helper | Behavior | Reason |
|----------|--------|----------|--------|
| New token | `toNum` | Returns `0` for missing | New tokens need default values |
| Price update | `getNum` | Returns `null` for missing | Preserve existing token data |

**Example Problem Without `getNum`:**
```javascript
// Price update only sends: { mint, price_usd, volume_24h }
// It does NOT send: bonding_pct, total_buys_1h, etc.

// BAD: This would set bonding to 0!
bonding_pct: toNum(update.bonding_pct),  // Returns 0 if undefined

// GOOD: This preserves existing value
bonding_pct: getNum(update.bonding_pct) ?? token.bonding_pct,  // Returns null, falls back to existing
```

---

## Price Update vs New Token Fields

### Fields Sent in Price Updates (PARTIAL)

From `price_update_broadcaster.go`:

```go
// Price updates only send these fields:
- mint
- symbol
- image
- pair_address
- price_usd
- market_cap_usd
- liquidity_usd
- volume_24h
- total_buys_5m
- total_sells_5m
- total_buyers_5m
- total_sellers_5m
- unique_wallets_5m
- total_buy_volume_5m
- total_sell_volume_5m
```

### Fields NOT Sent in Price Updates

These fields are only sent with new tokens and must be PRESERVED during updates:

```
- created_at / launch_time
- bonding_pct / bonding_curve_progress
- dev_percent / sniper_percent / insider_percent / bundle_percent
- total_buys_1h, total_buys_6h, total_buys_24h (and sells)
- total_buyers_1h, total_buyers_6h, total_buyers_24h (and sellers)
- total_buy_volume_1h, total_buy_volume_6h, total_buy_volume_24h (and sell)
- unique_wallets_1h, unique_wallets_6h, unique_wallets_24h
- kol_count, pro_traders_count, smart_money_count
- dev_tokens_created, dev_tokens_migrated
- top10_holders_pct
- all percentage holdings except those in 5m
```

---

## Error Handling

### Worker Error Handling

The worker wraps all message processing in try-catch to prevent crashes:

```javascript
ws.onmessage = (event) => {
  try {
    const messages = event.data.split('\n').filter(msg => msg.trim());
    for (const msgStr of messages) {
      try {
        const data = JSON.parse(msgStr);
        handleMessage(channel, data);
      } catch (parseErr) {
        // Skip malformed JSON but don't crash
        console.warn(`[PulseWorker] JSON parse error on ${channel}:`, parseErr.message);
      }
    }
  } catch (err) {
    console.error(`[PulseWorker] Message processing error on ${channel}:`, err);
  }
};

function handleMessage(channel, data) {
  try {
    // ... message handling logic
  } catch (err) {
    console.error(`[PulseWorker] handleMessage error on ${channel}:`, err);
  }
}
```

### React Error Boundary

An `ErrorBoundary` component wraps the main app to catch rendering errors:

```typescript
// src/components/ErrorBoundary.tsx
class ErrorBoundary extends Component<Props, State> {
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error);
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallbackUI onRetry={...} onReload={...} />;
    }
    return this.props.children;
  }
}
```

### Token Extraction Helper

The `extractTokens` helper handles various message formats gracefully:

```javascript
const extractTokens = (msg) => {
  if (msg.data) {
    return Array.isArray(msg.data) ? msg.data : [msg.data];
  }
  if (msg.token) {
    return [msg.token];
  }
  if (msg.tokens) {
    return Array.isArray(msg.tokens) ? msg.tokens : [msg.tokens];
  }
  // If the message itself has a mint, it might BE the token
  if (msg.mint || msg.address || msg.mint_address) {
    return [msg];
  }
  return [];
};
```

---

## Source Files Reference

### Backend (Go)

| File | Purpose |
|------|---------|
| `exchange-token-service/internal/contracts/contracts.go` | PulseToken struct definition with JSON tags |
| `exchange-token-service/internal/core/services/pulse_realtime_pusher.go` | Sends new/final_stretch/migrated tokens |
| `exchange-token-service/internal/core/services/price_update_broadcaster.go` | Sends periodic price updates (partial data) |

### Frontend (TypeScript/JavaScript)

| File | Purpose |
|------|---------|
| `public/workers/pulseWorker.js` | Web Worker - `normalizeToken()`, `updateTokenInArray()`, `handleMessage()` |
| `src/utils/pulseWorkerBridge.ts` | Bridge - `normalizeToken()`, `handlePriceUpdate()`, `handleFallbackMessage()` |
| `src/utils/pulseCache.ts` | `PulseToken` interface definition |
| `src/components/PulseTable.tsx` | React component consuming PulseToken data |
| `src/components/ErrorBoundary.tsx` | Error boundary for crash protection |
| `src/hooks/usePulseFromQueryCache.ts` | React hook for subscribing to pulse data |

---

## Common Issues & Solutions

### Issue: Values Turning to 0

**Cause:** Backend sends strings, frontend doesn't parse them.

**Solution:** Always use `parseFloat()` or `toNum()` helper.

```javascript
// BAD
price: rawToken.price_usd,  // "0.00001234" is truthy but not a number

// GOOD
price: parseFloat(rawToken.price_usd) || 0,
```

### Issue: Age Not Displaying

**Cause:** Backend sends `launch_time` as ISO string, not `created_at` as timestamp.

**Solution:** Check for `launch_time` first and parse ISO strings.

```javascript
// BAD
created_at: rawToken.created_at || Date.now(),

// GOOD
const createdAtValue = rawToken.launch_time || rawToken.created_at || rawToken.createdAt || rawToken.LaunchTime || Date.now();
```

### Issue: Data Lost After Price Update

**Cause:** Price update doesn't include all fields, overwriting with `undefined` or `0`.

**Solution:** Use `getNum()` helper that returns `null` for missing fields.

```javascript
// BAD - overwrites with 0 if not in update
bonding_pct: toNum(update.bonding_pct),

// GOOD - preserves existing value if not in update
bonding_pct: getNum(update.bonding_pct) ?? token.bonding_pct,
```

### Issue: Buy/Sell Bar Not Showing

**Cause:** Using `total_buys_*` (transaction count) instead of `total_buyers_*` (unique wallets).

**Solution:** Use the correct field based on what you're displaying.

```javascript
// For transaction count display
const buyCount = token.total_buys_5m;

// For unique wallet count display
const uniqueBuyers = token.total_buyers_5m;
```

### Issue: Tokens Sometimes Appearing, Sometimes Not

**Cause:** Backend may send messages with different formats or types.

**Solution:** Support multiple message type variants and extraction methods.

```javascript
// Worker now handles:
// - Different message types: new_token, newToken, new, token_new
// - Different data locations: data, token, tokens, or direct
// - Fallback to channel name for inference
```

### Issue: App Crashes After Running

**Cause:** Unhandled exceptions from malformed WebSocket data.

**Solution:** Wrap all message processing in try-catch and use ErrorBoundary.

---

## Version History

| Date | Changes |
|------|---------|
| 2025-01-22 | Initial documentation created |
| 2025-01-22 | Added `launch_time` mapping for age display |
| 2025-01-22 | Added `total_buyers_*` and `total_sellers_*` fields |
| 2025-01-22 | Added `unique_wallets_5m/1h/6h` fields |
| 2025-01-22 | Added string versions: `priceUSD`, `marketCapUSD`, `volume24h`, `liquidityUSD` |
| 2025-01-22 | Added `toNum` vs `getNum` helper explanation |
| 2025-01-22 | Added additional message type variants: `final_stretch`, `completed`, `completing`, etc. |
| 2025-01-22 | Added `extractTokens` helper for flexible message parsing |
| 2025-01-22 | Added Error Handling section with worker try-catch and ErrorBoundary |
| 2025-01-22 | Added Go export variants: `LaunchpadProtocol`, `PairAddress`, `Links` |
| 2025-01-22 | Added additional identifier fields: `token_address`, `contract_address` |
