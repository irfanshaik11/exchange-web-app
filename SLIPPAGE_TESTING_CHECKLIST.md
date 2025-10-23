# Slippage Validation Testing Checklist

**Date**: 2025-10-21
**Tester**: [Your Name]
**Critical Fix**: #1 - Slippage Parameter Validation

---

## Test Environment Setup

- [ ] Frontend server running on: http://localhost:3000 (or your port)
- [ ] Backend server running
- [ ] Wallet connected
- [ ] Test token selected for trading

---

## Part 1: Input Validation Tests (QuickBuy Settings)

### TC1: Negative Slippage ❌ → ✅ 0.1%
**Steps**:
1. Open QuickBuy settings (gear icon)
2. Find "Max Slippage" input field
3. Type `-10` in the slippage field
4. Observe the behavior

**Expected Result**: Value should auto-correct to `0.1` (cannot enter negative)

**Actual Result**:
- [ ] ✅ PASS - Auto-corrected to 0.1%
- [ ] ❌ FAIL - (describe what happened): _______________

---

### TC2: Zero Slippage 0% → ✅ 0.1%
**Steps**:
1. In QuickBuy settings, clear the slippage field
2. Type `0`
3. Click outside the field (blur event)
4. Observe the final value

**Expected Result**: After blur, value should become `0.1`

**Actual Result**:
- [ ] ✅ PASS - Changed to 0.1% on blur
- [ ] ❌ FAIL - (describe what happened): _______________

---

### TC3: Very Low Slippage 0.05% → ✅ 0.1%
**Steps**:
1. In QuickBuy settings, type `0.05` in slippage field
2. Click outside the field (blur event)
3. Observe the final value

**Expected Result**: After blur, value should become `0.1`

**Actual Result**:
- [ ] ✅ PASS - Changed to 0.1% on blur
- [ ] ❌ FAIL - (describe what happened): _______________

---

### TC4: Normal Slippage 2.5% ✅
**Steps**:
1. In QuickBuy settings, type `2.5` in slippage field
2. Click outside the field
3. Verify value stays as `2.5`

**Expected Result**: Value accepted as `2.5%`, no changes

**Actual Result**:
- [ ] ✅ PASS - Accepted 2.5%
- [ ] ❌ FAIL - (describe what happened): _______________

---

### TC5: High Slippage (Below Threshold) 49% ✅
**Steps**:
1. In QuickBuy settings, type `49` in slippage field
2. Click outside the field
3. Verify value stays as `49`
4. Try to execute a trade (should NOT show warning)

**Expected Result**: Value accepted as `49%`, NO warning dialog

**Actual Result**:
- [ ] ✅ PASS - Accepted 49%, no warning when trading
- [ ] ❌ FAIL - (describe what happened): _______________

---

### TC8: Extreme Slippage 150% → ✅ 100%
**Steps**:
1. In QuickBuy settings, type `150` in slippage field
2. Observe the behavior immediately

**Expected Result**: Value should be clamped to `100` (cannot exceed 100%)

**Actual Result**:
- [ ] ✅ PASS - Clamped to 100%
- [ ] ❌ FAIL - (describe what happened): _______________

---

### TC9: Decimal Precision 25.333333% → ✅ 25.33%
**Steps**:
1. In QuickBuy settings, type `25.333333` in slippage field
2. Click outside the field
3. Check the displayed value

**Expected Result**: Value should be rounded to `25.33%` (2 decimal places)

**Actual Result**:
- [ ] ✅ PASS - Rounded to 25.33%
- [ ] ❌ FAIL - (describe what happened): _______________

---

## Part 2: Warning Dialog Tests (50%+ Slippage)

### TC6: High Slippage at Threshold (50%) - Shows Warning ⚠️
**Steps**:
1. In QuickBuy settings, set slippage to `50`
2. Close settings panel
3. Select a token to trade
4. Enter a valid amount (e.g., 0.1 SOL for buy)
5. Click "Buy" button
6. **Observe if warning dialog appears**

**Expected Result**:
- Warning dialog should appear
- Dialog shows "50.0%" in large red text
- Shows 3 risk warnings
- Has "Go Back" and "Continue Anyway" buttons

**Actual Result**:
- [ ] ✅ PASS - Warning dialog appeared correctly
- [ ] ❌ FAIL - (describe what happened): _______________

**Screenshot**: (Optional - take screenshot of warning dialog)

---

### TC7: Very High Slippage (75%) - Shows Warning ⚠️
**Steps**:
1. In QuickBuy settings, set slippage to `75`
2. Close settings panel
3. Enter a valid amount
4. Click "Buy" button
5. **Observe if warning dialog appears**

**Expected Result**: Warning dialog shows "75.0%" in large red text

**Actual Result**:
- [ ] ✅ PASS - Warning dialog appeared with 75.0%
- [ ] ❌ FAIL - (describe what happened): _______________

---

### TC11: Warning Dialog - Cancel (Go Back) ❌
**Steps**:
1. Set slippage to `75%`
2. Enter a valid trade amount
3. Click "Buy" button → warning dialog appears
4. Click **"Go Back"** button
5. Observe behavior

**Expected Result**:
- Dialog closes
- Trade is cancelled (nothing happens)
- Slippage remains at 75%
- Can still adjust settings and try again

**Actual Result**:
- [ ] ✅ PASS - Trade cancelled, dialog closed, slippage still 75%
- [ ] ❌ FAIL - (describe what happened): _______________

---

### TC12: Warning Dialog - Continue Anyway ✅
**Steps**:
1. Set slippage to `75%`
2. Enter a valid trade amount
3. Click "Buy" button → warning dialog appears
4. Click **"Continue Anyway"** button
5. Observe behavior

**Expected Result**:
- Dialog closes
- Trade proceeds with 75% slippage
- (If backend is running) Transaction should be submitted

**Actual Result**:
- [ ] ✅ PASS - Dialog closed, trade proceeded
- [ ] ⚠️ PARTIAL - Dialog closed but trade failed due to: _______________
- [ ] ❌ FAIL - (describe what happened): _______________

---

## Part 3: Security & Context Validation Tests

### TC10: Dev Tools Bypass Prevention 🔒
**Steps**:
1. Open browser DevTools (F12)
2. Go to Console tab
3. Type and execute:
   ```javascript
   localStorage.setItem('quickBuySettings', JSON.stringify({
     presets: [{
       name: 'P1',
       quickBuySettings: { maxSlippage: 5.0 },  // Invalid: 500%
       quickSellSettings: { maxSlippage: -0.5 }  // Invalid: negative
     }],
     activePreset: 0
   }))
   ```
4. Refresh the page (F5)
5. Open QuickBuy settings and check slippage value

**Expected Result**:
- Invalid values should be sanitized on load
- `5.0` (500%) should be clamped to `1.0` (100%)
- `-0.5` (-50%) should be clamped to `0.001` (0.1%)

**Actual Result**:
- [ ] ✅ PASS - Invalid values were sanitized correctly
- [ ] ❌ FAIL - (describe what happened): _______________

---

## Part 4: Trade Execution Tests (Requires Backend)

### TC13: Limit Order - No Warning ✅
**Steps**:
1. Set slippage to `75%`
2. Switch to **"Limit"** tab (not Market)
3. Enter amount and target market cap
4. Click "Buy" button

**Expected Result**:
- NO warning dialog should appear (limit orders don't trigger warning)
- Limit order should be created normally

**Actual Result**:
- [ ] ✅ PASS - No warning, limit order created
- [ ] ❌ FAIL - (describe what happened): _______________

---

### TC14: Sell with High Slippage ⚠️ (SellPopup)
**Steps**:
1. Set slippage to `75%` in QuickSell settings
2. Go to Portfolio page (must have token holdings)
3. Click "Sell" on a token position → SellPopup opens
4. Enter a sell percentage (e.g., 25%)
5. Click "Sell" button

**Expected Result**:
- Warning dialog should appear showing "75.0%"
- Same behavior as TC11/TC12 (can cancel or continue)

**Actual Result**:
- [ ] ✅ PASS - Warning dialog appeared in SellPopup
- [ ] ❌ FAIL - (describe what happened): _______________

---

## Test Summary

**Total Tests**: 14
**Passed**: ___ / 14
**Failed**: ___ / 14
**Partial**: ___ / 14

---

## Issues Found

| Test Case | Issue Description | Severity | Fix Required |
|-----------|------------------|----------|--------------|
| TC___ | | 🔴 Critical / 🟡 Medium / 🟢 Low | Yes / No |

---

## Notes & Observations

(Add any additional observations, edge cases discovered, or suggestions here)

---

**Testing Completed**: [ ] Yes [ ] No
**Date Completed**: __________
**Approved By**: __________
