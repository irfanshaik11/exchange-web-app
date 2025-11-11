# Interstate Edge Cases – Manual Test Case Suite

> Extracted from `EDGE_CASES_MANUAL_TESTING_GUIDE.pdf` (Solana Trading Platform – Interstate)

This document consolidates all manual edge-case test cases defined in the guide.

Each test case includes:

- **ID**
- **Title**
- **Prerequisites**
- **Location**
- **Steps**
- **Expected Results**
- **Pass Criteria**

---

## Fix #1 – High Slippage Warning

### TC-1.1 — Slippage = 0
- **Prerequisites:** None
- **Location:** Settings → Quick Buy Settings
- **Steps:**
  - Open Quick Buy Settings.
  - Find **Max Slippage**.
  - Enter `0`.
  - Press Enter / blur the field.
- **Expected Results:**
  - Auto-corrects to `0.1`.
  - Toast: `Slippage cannot be 0. Set to minimum: 0.1%`.
  - Field shows `0.1`.
- **Pass Criteria:** All occur.

### TC-1.2 — Slippage < 0.1%
- **Prerequisites:** None
- **Location:** Settings → Quick Buy Settings
- **Steps:**
  - Open Quick Buy Settings.
  - Set **Max Slippage** to `0.05`.
- **Expected Results:**
  - Auto-corrects to `0.1`.
  - Toast: minimum slippage 0.1%.
  - Field shows `0.1`.
- **Pass Criteria:** All occur.

### TC-1.3 — Slippage > 100%
- **Prerequisites:** None
- **Location:** Settings → Quick Buy Settings
- **Steps:**
  - Set **Max Slippage** to `150`.
- **Expected Results:**
  - Auto-corrects to `100`.
  - Toast: maximum slippage 100%.
  - Field shows `100`.
- **Pass Criteria:** All occur.

### TC-1.4 — Slippage ≥ 50% (High Slippage Modal)
- **Prerequisites:** Wallet connected; valid tradeable token; slippage saved ≥ 50%.
- **Location:** Trade page → Buy tab
- **Steps:**
  - In settings, set **Max Slippage** to `50` or higher and save.
  - Go to any token trade page.
  - Enter valid buy amount.
  - Click **Buy**.
- **Expected Results:**
  - High Slippage warning modal appears.
  - Message explains extreme risk and high slippage.
  - **Cancel** → closes modal, no tx.
  - **Continue Anyway** → proceeds with tx.
- **Pass Criteria:** Modal shows + both branches work.

### TC-1.5 — Non-numeric Slippage
- **Prerequisites:** None
- **Location:** Settings → Quick Buy Settings
- **Steps:**
  - Enter `abc` / special chars in **Max Slippage**.
- **Expected Results:**
  - Input rejected.
  - Toast indicates slippage must be numeric.
  - Field reverts to last valid value.
- **Pass Criteria:** Invalid input never saved.

### TC-1.6 — NaN Slippage
- **Prerequisites:** Browser DevTools
- **Location:** Settings → Quick Buy Settings
- **Steps:**
  - Via DevTools set slippage value to `NaN`.
  - Trigger validation (blur / Enter).
- **Expected Results:**
  - Auto-resets to safe default (e.g. 20% or last valid).
  - No crash.
- **Pass Criteria:** NaN handled safely.

---

## Fix #2 – Priority Fee Validation

### TC-2.1 — Priority Fee = 0
- **Prerequisites:** None
- **Location:** Settings → Quick Buy Settings
- **Steps:**
  - Set **Priority Fee** to `0`.
- **Expected Results:**
  - Auto-corrects to `0.0001`.
  - Toast: minimum priority fee.
- **Pass Criteria:** All occur.

### TC-2.2 — Priority Fee < 0.0001
- **Prerequisites:** None
- **Location:** Settings → Quick Buy Settings
- **Steps:**
  - Set **Priority Fee** to `0.00005`.
- **Expected Results:**
  - Auto-corrects to `0.0001`.
  - Toast indicates minimum.
- **Pass Criteria:** All occur.

### TC-2.3 — Priority Fee > 10.0
- **Prerequisites:** None
- **Location:** Settings → Quick Buy Settings
- **Steps:**
  - Set **Priority Fee** to `15`.
- **Expected Results:**
  - Auto-corrects to `10`.
  - Toast: maximum priority fee is 10 SOL.
- **Pass Criteria:** All occur.

### TC-2.4 — Negative Priority Fee
- **Prerequisites:** None
- **Location:** Settings → Quick Buy Settings
- **Steps:**
  - Enter `-0.5`.
- **Expected Results:**
  - Auto-corrects to minimum `0.0001`.
  - Error toast explaining cannot be negative.
- **Pass Criteria:** Negative rejected.

### TC-2.5 — Non-numeric Priority Fee
- **Prerequisites:** None
- **Location:** Settings → Quick Buy Settings
- **Steps:**
  - Enter `abc` / non-numeric.
- **Expected Results:**
  - Rejected.
  - Error toast: must be a number.
  - Reverts to last valid.
- **Pass Criteria:** Invalid input rejected.

---

## Fix #3 – Bribe Fee Validation

### TC-3.1 — Bribe Fee = 0
- **Prerequisites:** None
- **Location:** Settings → Quick Buy Settings (or relevant)
- **Steps:**
  - Enter `0` in bribe fee.
- **Expected Results:**
  - Accepted as 0 (if allowed by spec) OR
  - Auto-correct if doc specifies min.
- **Pass Criteria:** Matches documented rule.

### TC-3.2 — Bribe Fee > 10.0
- **Prerequisites:** None
- **Location:** Bribe Fee input
- **Steps:**
  - Enter value above `10`.
- **Expected Results:**
  - Clamped to `10`.
  - Warning toast about max.
- **Pass Criteria:** Enforced.

### TC-3.3 — Negative Bribe Fee
- **Steps:**
  - Enter `-1`.
- **Expected Results:**
  - Rejected or reset to minimum.
  - Error toast.
- **Pass Criteria:** Negative not stored.

### TC-3.4 — Non-numeric Bribe Fee
- **Steps:**
  - Enter `xyz`.
- **Expected Results:**
  - Rejected.
  - Error: must be number.
- **Pass Criteria:** No invalid persisted.

---

## Fix #4 – Balance Check Before Trade

### TC-4.1 — Balance < Amount
- **Prerequisites:** Wallet with insufficient SOL/token.
- **Location:** Trade → Buy or Sell
- **Steps:**
  - Enter amount greater than wallet balance.
  - Click **Buy/Sell**.
- **Expected Results:**
  - Validation error.
  - No tx sent.
- **Pass Criteria:** Cannot overspend.

### TC-4.2 — Balance < (Amount + Fees)
- **Prerequisites:** Low balance near threshold.
- **Steps:**
  - Enter amount that fits raw balance but not when fees included.
- **Expected Results:**
  - Error: insufficient balance after fees.
  - No tx.
- **Pass Criteria:** Fees considered.

### TC-4.6 — Clear Error Message
- **Prerequisites:** Trigger any insufficient balance scenario.
- **Steps:**
  - Observe error UI.
- **Expected Results:**
  - Human-readable error explaining shortage.
- **Pass Criteria:** Message is clear & accurate.

---

## Fix #5 – No Holdings Check

### TC-5.1 — Zero Balance (Selling Token You Don’t Own)
- **Prerequisites:** No holdings of token.
- **Location:** Trade → Sell
- **Steps:**
  - Select token with 0 balance.
  - Try to sell.
- **Expected Results:**
  - Blocked.
  - Error: you have no holdings.
- **Pass Criteria:** No phantom sells.

### TC-5.2 — Wrong Token vs Holdings
- **Prerequisites:** Hold Token A, not Token B.
- **Steps:**
  - Attempt to sell Token B.
- **Expected Results:**
  - Error: no holdings for Token B.
- **Pass Criteria:** Correct token checked.

### TC-5.3 — Standard SPL Token Detection
- **Prerequisites:** Have SPL token balance.
- **Steps:**
  - Go to Sell.
- **Expected Results:**
  - UI reads correct balance.
- **Pass Criteria:** Accurate.

### TC-5.4 — TOKEN_2022 Program
- **Prerequisites:** Holdings in TOKEN_2022 mint.
- **Steps:**
  - Sell via platform.
- **Expected Results:**
  - Correct balance detection and validation.
- **Pass Criteria:** No regressions for new program.

---

## Fix #6 – Empty Pool Type Validation

### TC-6.1 — Empty String (Auto-detect Succeeds)
- **Prerequisites:** Backend able to infer pool type.
- **Steps:**
  - Call with `poolType: ""`.
- **Expected Results:**
  - Type inferred; trade proceeds.
- **Pass Criteria:** Works.

### TC-6.2 — Empty String (Auto-detect Fails)
- **Steps:**
  - `poolType: ""` with unknown pool.
- **Expected Results:**
  - Validation error.
- **Pass Criteria:** No blind execution.

### TC-6.3 — Null Pool Type
- **Steps:**
  - Send `poolType: null`.
- **Expected Results:**
  - Validation error with clear message.
- **Pass Criteria:** Null rejected.

### TC-6.4 — Unsupported Type
- **Steps:**
  - Use invalid type, e.g. `XYZ_POOL`.
- **Expected Results:**
  - HTTP 400 + error: unsupported type.
- **Pass Criteria:** Not accepted.

### TC-6.5 — Malformed Type
- **Steps:**
  - Send random string/garbage.
- **Expected Results:**
  - Validation error.
- **Pass Criteria:** Defensive.

### TC-6.6 — Missing Type Field
- **Steps:**
  - Omit `poolType` completely.
- **Expected Results:**
  - Validation error or safe default as per guide.
- **Pass Criteria:** No silent failure.

### TC-6.7 — Wrong Type (Number/Object)
- **Steps:**
  - `poolType: 123` or `{}`.
- **Expected Results:**
  - Validation error.
- **Pass Criteria:** Type-safe.

### TC-6.8 — Valid Type
- **Steps:**
  - Use supported type (`PUMP`, etc).
- **Expected Results:**
  - Normal execution.
- **Pass Criteria:** Happy path intact.

---

## Fix #7 – Minimum Trade Amount

### TC-7.1 — Amount = 0
- **Prerequisites:** Wallet connected
- **Location:** Trade → Buy
- **Steps:**
  - Enter `0`.
- **Expected Results:**
  - Error: enter valid amount.
- **Pass Criteria:** Zero blocked.

### TC-7.2 — Negative Amount
- **Prerequisites:** DevTools / API
- **Steps:**
  - Force `-1`.
- **Expected Results:**
  - Rejected; 400 or validation UI.
- **Pass Criteria:** Negative blocked.

### TC-7.3 — Below Minimum Threshold
- **Steps:**
  - Enter less than configured min (from guide, e.g. too tiny).
- **Expected Results:**
  - Error: amount too small.
- **Pass Criteria:** Enforced.

### TC-7.4 — Exactly Minimum
- **Steps:**
  - Enter exact minimum.
- **Expected Results:**
  - Accepted.
- **Pass Criteria:** Boundary correct.

### TC-7.5 — Just Above Minimum
- **Steps:**
  - Slightly above minimum.
- **Expected Results:**
  - Accepted.
- **Pass Criteria:** Valid.

### TC-7.6 — Extremely Small Decimal
- **Steps:**
  - Enter very small decimal (e.g. 0.00000001).
- **Expected Results:**
  - Either normalized or rejected per min rules.
- **Pass Criteria:** No precision bug.

### TC-7.7 — Large but Valid Amount
- **Steps:**
  - Enter high but allowed amount.
- **Expected Results:**
  - Works if balance ok.
- **Pass Criteria:** No false block.

### TC-7.8 — Too Large (Exceeds Limit)
- **Steps:**
  - Enter more than max allowed by business logic.
- **Expected Results:**
  - Error: amount exceeds limit.
- **Pass Criteria:** Enforced.

### TC-7.9 — Decimal Precision Handling
- **Steps:**
  - Use many decimal places.
- **Expected Results:**
  - Correct rounding / validation.
- **Pass Criteria:** No float glitch.

### TC-7.10 — Too Large (1000+ SOL)
- **Steps:**
  - Enter > documented cap (e.g. 1000 SOL).
- **Expected Results:**
  - 400 + clear error.
- **Pass Criteria:** Cap respected.

### TC-7.11 — Non-numeric
- **Steps:**
  - Set `abc`.
- **Expected Results:**
  - Rejected; error shown.
- **Pass Criteria:** Invalid blocked.

---

## Fix #9 – Sell Percentage Rounding

### TC-9.1 — Sell Exactly 100%
- Steps:
  - Click 100% sell.
- Expected:
  - Uses full balance; tx succeeds.

### TC-9.2 — Sell 99.99%
- Expected:
  - Leaves tiny dust correctly; no negative.

### TC-9.3 — Small Percentages (e.g. 1%, 0.1%)
- Expected:
  - Correct amount; no zeroing out incorrectly.

### TC-9.4 — 3-way Split (e.g. 33.33% x3)
- Expected:
  - Sum <= 100%; final dust handled.

### TC-9.5 — High-Precision Token (18 Decimals)
- Expected:
  - Proper rounding; no overflow/underflow.

### TC-9.6 — Very Low Balance
- Expected:
  - 100% button still works or explains min-amount failure.

### TC-9.7 — Rounding Down vs Up
- Expected:
  - Uses safe rounding (never exceeds balance).

### TC-9.8 — Edge Dust Scenario
- Expected:
  - Remaining dust not negative/invalid.

### TC-9.9 — With Fees Applied
- Expected:
  - Percentage calc respects fees; no overdraw.

### TC-9.10 — Complex Floating-Point Balance
- Expected:
  - Stable; no NaN/Infinity.

(All above: **Pass Criteria:** correct math, no invalid tx.)

---

## Fix #10 – Network Timeout Handling

### TC-10.1 — Fast Transaction (5s)
- Expected:
  - Completes normally; no timeout UI.

### TC-10.2 — Slow but Within Timeout
- Expected:
  - Shows "pending" state; resolves successfully.

### TC-10.3 — Exceeds Timeout
- Expected:
  - Timeout message.
  - User sees safe retry/abort options.

### TC-10.4 — RPC Fallback
- Expected:
  - On primary RPC failure, falls back to secondary.

### TC-10.5 — RPC Error with Partial Info
- Expected:
  - Clear error; no infinite spinner.

### TC-10.6 — Cancel While Pending
- Expected:
  - UI recovers; no stuck loading.

### TC-10.7 — Timeout Error Handling
- Expected:
  - Logged; surfaced cleanly.

### TC-10.8 — Retry on Network Error
- Expected:
  - Retry logic works; no duplicate sends.

---

## Fix #11 – Stale Pool Data Detection

### TC-11.1 — Pool Data Stale (> Threshold)
- Expected:
  - Stale warning banner / indicator.

### TC-11.2 — Fresh Data
- Expected:
  - No stale warning.

### TC-11.3 — Manual Refresh Works
- Expected:
  - Refresh button refetches; clears stale state.

### TC-11.4 — Stale + Price Changed
- Expected:
  - User warned; must confirm based on new data.

### TC-11.5 — Stale from Backend Error
- Expected:
  - Clear error message; no silent use of bad data.

### TC-11.6 — Rapid Refresh Spam
- Expected:
  - Debounced; no crash.

### TC-11.7 — Slow Network
- Expected:
  - Loading indicator; no stale mislabel.

### TC-11.8 — Price Changed Significantly
- Expected:
  - Prompt to reconfirm before executing.
- **Pass Criteria (all):** No trades on silently stale data.

---

## Fix #12 – Stuck Loading State

### TC-12.1 — Amount Too Small Error
- Steps:
  - Trigger "too small" validation.
- Expected:
  - Error shown; spinner cleared.

### TC-12.2 — No Holdings (Sell)
- Expected:
  - Error shown; no infinite loader.

### TC-12.3 — Invalid Sell Percentage
- Expected:
  - Validation error; UI recovers.

### TC-12.4 — Over 100% Percentage (Defensive)
- Expected:
  - Rejected; no stuck state.

### TC-12.5 — Percentage > 100% (Defensive Path)
- Expected:
  - Same as above; safe handling.

---

_End of test suite._
