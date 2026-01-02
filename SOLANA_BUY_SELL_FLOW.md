# Solana Buy/Sell Flow (Meteora, Pumpfun/PumpAmm, Raydium)

This file describes how the current backend executes Solana buys/sells for Meteora, Pumpfun/PumpAmm, and Raydium. Source references are in `src/controllers/trade.controller.ts` and the utils listed per section.

## Entry Points and Shared Pipeline
- **Routes**: `/buy`, `/sell_percentage`, `/sell_exactAmount` (`src/routes/trade.routes.ts`) hit `trade.controller`.
- **Auth/Signer**: Turnkey or local wallets resolved via `getUserAndSigner` (remote signing through `TurnkeySignerAdapter`, local via `LocalKeypairSigner`).
- **RPC selection**: optional `rpc` in request; runtime overrides via `applyRuntimeRpc`.
- **Validation**: `validateBuyParams` / `validateSellParams` plus pool validation (`findBestActivePool`, `validatePoolAddress`).
- **Pool discovery**: if `poolAddress` missing/invalid, derive deterministic pools (Pumpfun, Raydium Launchpad), otherwise search via `poolDiscovery` (Codex lookup for Meteora included).
- **Execution routing**: `poolType` drives the handler. Supported for Solana: Raydium CPMM/CLMM/Launchpad, Pumpfun, PumpAmm, Meteora DBC/AMM V1/AMM V2 (CPAMM)/DLMM, bags, MoonShoot.
- **Post-trade**: balances fetched to compute `tokenAmount`, `usdValue`, `marketCap`; trade history persisted with `saveTradeHistoryWithErrorHandling` (sell path also computes realized PnL).

## Meteora Flows (`src/utils/meteora.ts`)
### DBC (bonding curve)
- **Buy**: `swapBuy` (poolType `meteora dbc`/`bags`).
  1) Instantiate `DynamicBondingCurveClient` and fetch pool state; reject graduated pools (`isOnCurve === false` / Custom:6013 -> throws `POOL_GRADUATED`).
  2) Decide direction: if quote mint is WSOL/USDC, swap SOL→token; otherwise token→SOL.
  3) Build swap with `minimumAmountOut=0` (max slippage), sign+send via `signAndSendMeteoraTransaction` (supports Turnkey and local).
  4) Error helpers: fetch logs on failure; special handling for insufficient lamports and graduated pools.
- **Sell**: `swapSell` mirrors above, but uses `pool.swapQuote` to compute output and returns `sellAmount` in SOL/USDC units.

### AMM V1 (`meteora amm v1`)
- **Buy/Sell**: `swapBuyV1` / `swapSellV1` built on `@meteora-ag/dynamic-amm-sdk` (`AmmImpl.create`).
  - Detects swap direction by checking whether token A is WSOL/USDC.
  - Obtains `SwapQuote` from the pool; uses `swapQuote.minSwapOutAmount` for slippage guard.
  - Signs legacy tx via shared signer helper; sell returns `sellSolAmount` from quote.

### AMM V2 / CPAMM (`meteora amm v2`)
- **Buy**: `swapBuyV2`.
  - Uses `@meteora-ag/cp-amm-sdk` to fetch `poolState`; enforces min trade of 0.0001 SOL (`AMOUNT_TOO_SMALL` error with metadata).
  - Determines input mint (SOL/USDC vs token) and fetches decimals; warns if amount < 0.001 SOL.
  - Calls `cpAmm.getQuote` (slippage %) and builds swap with `minimumAmountOut` from quote; signed via `signAndSendMeteoraTransaction`.
  - Quote failures (assertions/insufficient liquidity) surface as explicit errors.
- **Sell**: `swapSellV2` mirrors buy; returns `{ txId, sellSolAmount }` and raises `METEORA_NO_LIQUIDITY` on empty quote.

### DLMM (`poolType` auto-routed when `@meteora-ag/dlmm` installed)
- **Buy/Sell**: `swapBuyDLMM`.
  - Creates `DLMM` pool instance and determines `swapForY` based on SOL/token placement (X/Y).
  - Fetches bin arrays around the active bin, computes quote (minOut, price impact), builds swap, and signs via shared helper.
  - Throws if SDK missing.

### Controller behavior
- Missing poolAddress with Meteora poolType triggers Codex lookup (`findBestActivePool`) before execution.
- Buy routes call the corresponding swap helpers; sells use `swapSell`/`swapSellV1`/`swapSellV2` based on poolType. Errors like `POOL_GRADUATED` trigger pool rediscovery attempts upstream.

## Pump Flows
### Pumpfun Bonding Curve (`src/utils/pumpfun.ts`)
- **Buy**: `buyPumpfunWithSol` (used in `trade.controller` buy path; returns immediately with `skipConfirmation=true`, background worker confirms/saves trade).
  1) Detect TOKEN vs TOKEN-2022 mint program.
  2) Derive PDAs (global, bonding curve, fee config, creator vault, volume accounts) and user/bonding-curve ATAs (created idempotently if missing).
  3) Fetch bonding-curve account (10s timeout); if missing/invalid -> “Bonding curve complete or invalid — trade on PumpSwap/Raydium instead.”
  4) Estimate token out via bonding-curve math; apply 1% safety and slippage to max SOL in.
  5) Build Anchor `buy` ix, compile to V0, sign via Turnkey/local, send (skip confirmation if requested). Errors parsed from Anchor logs.
- **Sell**: `sellPumpfunForSol`.
  - Detect token program, derive PDAs/ATAs, fetch bonding-curve, estimate SOL out and apply slippage to `minSolOutLamports`.
  - Build Anchor `sell` ix, compile V0, sign, send. Errors decode common Anchor issues (BondingCurveComplete, NotAuthorized for wrong fee recipient).

### PumpAmm / PumpSwap (`src/utils/pumpswap.ts`)
- **Buy**: `PumpSwapSDK.buy` (poolType `PumpAmm`).
  1) Compute `bought_token_amount` and slippage-adjusted `min_token_amount` (`calculateWithSlippageBuy`).
  2) Choose protocol fee recipient from on-chain global config; derive ATA for fee recipient.
  3) Build instruction list: compute-budget boosts, create user token ATA, ensure wSOL ATA (Turnkey adds creation ix if missing), wrap SOL transfer, random tip, PumpAmm buy ix with slippage-bounded max SOL in, treasury fee transfer.
  4) Sign V0 tx (Turnkey or local). Prod sends via Helius fast sender; devnet uses `sendRawTransaction`. Optional MEV bundle path for local wallets.
- **Sell (exact amount / percentage)**: `sell_exactAmount` and `sell_percentage`.
  - Calculate expected SOL out (`getSellSolAmount`), build PumpAmm sell ix, tip + treasury fee, compute-budget ixs, sign/send through same Helius/raw flow. Returns `{ txid, sellSolAmount }`. (Note: background job `orderChecker` still lists PumpAmm sell as TODO outside controller path.)

### Controller behavior
- Pumpfun buys return immediately; background confirmation saves trade metadata. Sells compute decimals from mint, pass human-readable amount to `sellPumpfunForSol`.
- PumpAmm buy/sell uses `PumpSwapSDK` with supplied slippage and fee/tip wiring. Pool discovery auto-derives bonding-curve PDA when frontend passes token mint as `poolAddress`.

## Raydium Flows
Primary strategy is the Raydium Trade API with SDK fallbacks per pool type.

### Trade API (`src/utils/raydiumTradeApi.ts`)
- **Buy**: `raydiumTradeApiBuy`.
  - Fetch priority fee from Raydium API (default high fallback), get quote via `/compute/swap-base-in`, serialize tx via `/transaction/swap-base-in`.
  - Handles ATA lookup/creation hints, deserializes V0 tx(s), signs (Turnkey or local), sends+confirms; returns txId.
- **Sell**: `raydiumTradeApiSell` mirrors buy, swapping token→SOL.

### SDK / direct fallbacks (`src/utils/raydium.ts`, `raydiumCpmmDirect.ts`)
- CPMM: `buySniper` / `sellSniper` (with `withTimeout` + retries in controller). Manual pool parsing exists for edge configs.
- CLMM: `clmmBuy` / `clmmSell` when Trade API fails or pool misclassified.
- Launchpad: `launchpadBuy` / `launchpadSell` derive pool from mints when not provided; pre-checks pool owner to reroute CPMM/CLMM mislabels.

### Controller behavior
- For poolTypes Raydium CPMM/CLMM/Launchpad, `trade.controller`:
  1) Auto-detect actual pool type by owner (`detectPoolTypeByOwner`) and adjust routing.
  2) Attempt Trade API; on failure, fall back to pool-type-specific SDK handler.
  3) Handles misclassified Launchpad pools by rerouting to CPMM/CLMM handlers.
  4) Detailed error responses for timeouts, pool config parsing, or dual API/SDK failure.
- Balances pre/post trade used to compute token amount; trades saved with context.

## Background Job / Limit Orders
- `src/jobs/orderChecker.ts` executes queued orders using the same helpers: Pumpfun (`buyPumpfunWithSol`/`sellPumpfunForSol`), PumpAmm (`PumpSwapSDK`), Meteora (`swapBuy/BuyV1/BuyV2`, `swapSell/SellV1/SellV2`). PumpAmm sell is marked TODO in job path.

## Notes/Edge Cases
- Meteora DBC graduation triggers rediscovery; CPAMM enforces min trade size.
- Pumpfun bonding-curve completion surfaces explicit guidance to trade on PumpSwap/Raydium instead.
- Raydium flow prioritizes API for simplicity; SDK fallback is guarded with timeouts and descriptive errors.
