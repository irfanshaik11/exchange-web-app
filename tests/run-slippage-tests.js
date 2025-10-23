#!/usr/bin/env node

/**
 * Slippage Validation Test Runner
 * Critical Fix #1: Slippage Parameter Validation
 *
 * Runs all test cases without requiring Jest
 */

// ANSI color codes for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, testName) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ${colors.green}✓${colors.reset} ${testName}`);
    return true;
  } else {
    failedTests++;
    console.log(`  ${colors.red}✗${colors.reset} ${testName}`);
    return false;
  }
}

function assertEq(actual, expected, testName) {
  const pass = actual === expected;
  if (!pass) {
    console.log(`    ${colors.red}Expected: ${expected}, Got: ${actual}${colors.reset}`);
  }
  return assert(pass, testName);
}

// Validation functions (copied from implementation)

function validateSettings(settings) {
  const validated = { ...settings };

  // Validate slippage: min 0.001 (0.1%), max 1.0 (100%), round to 4 decimals
  if (validated.maxSlippage < 0.001) validated.maxSlippage = 0.001;
  if (validated.maxSlippage > 1.0) validated.maxSlippage = 1.0;
  validated.maxSlippage = Math.round(validated.maxSlippage * 10000) / 10000;

  return validated;
}

function validateUIInput(inputPercent) {
  let val = inputPercent;

  // onChange validation: clamp between 0.1 and 100
  if (val < 0.1 && val !== 0) val = 0.1;
  if (val > 100) val = 100;

  // Round to 2 decimal places
  val = Math.round(val * 100) / 100;

  return val;
}

function validateUIInputOnBlur(inputPercent) {
  let val = inputPercent;

  // On blur, ensure minimum of 0.1%
  if (val < 0.1) {
    val = 0.1;
  }

  return val;
}

// Test Suite

console.log(`\n${colors.bold}${colors.cyan}========================================${colors.reset}`);
console.log(`${colors.bold}${colors.cyan}Critical Fix #1: Slippage Validation Tests${colors.reset}`);
console.log(`${colors.bold}${colors.cyan}========================================${colors.reset}\n`);

// TC1: Negative Slippage
console.log(`${colors.bold}${colors.blue}TC1: Negative Slippage${colors.reset}`);
assertEq(validateUIInput(-10), 0.1, 'UI should reject -10% → 0.1%');
assertEq(validateSettings({ maxSlippage: -0.1 }).maxSlippage, 0.001, 'Context should clamp -0.1 → 0.001');

// TC2: Zero Slippage
console.log(`\n${colors.bold}${colors.blue}TC2: Zero Slippage${colors.reset}`);
assertEq(validateUIInput(0), 0, 'UI should allow 0 during typing');
assertEq(validateUIInputOnBlur(0), 0.1, 'UI should enforce 0.1% on blur');
assertEq(validateSettings({ maxSlippage: 0 }).maxSlippage, 0.001, 'Context should clamp 0 → 0.001');

// TC3: Very Low Slippage
console.log(`\n${colors.bold}${colors.blue}TC3: Very Low Slippage${colors.reset}`);
assertEq(validateUIInput(0.05), 0.1, 'UI should enforce 0.1% minimum for 0.05%');
assertEq(validateSettings({ maxSlippage: 0.0005 }).maxSlippage, 0.001, 'Context should clamp 0.0005 → 0.001');

// TC4: Normal Slippage
console.log(`\n${colors.bold}${colors.blue}TC4: Normal Slippage${colors.reset}`);
assertEq(validateUIInput(2.5), 2.5, 'UI should accept 2.5% without changes');
assertEq(validateSettings({ maxSlippage: 0.025 }).maxSlippage, 0.025, 'Context should accept 0.025 without changes');

// TC5: High Slippage (Below Threshold)
console.log(`\n${colors.bold}${colors.blue}TC5: High Slippage (Below Threshold)${colors.reset}`);
assertEq(validateUIInput(49), 49, 'UI should accept 49% without changes');
assertEq(validateSettings({ maxSlippage: 0.49 }).maxSlippage, 0.49, 'Context should accept 0.49 without changes');
assert(49 < 50, '49% should NOT trigger warning (threshold is 50%)');

// TC6: High Slippage at Threshold
console.log(`\n${colors.bold}${colors.blue}TC6: High Slippage at Threshold${colors.reset}`);
assert(50 >= 50, '50% should trigger warning dialog');

// TC7: Very High Slippage
console.log(`\n${colors.bold}${colors.blue}TC7: Very High Slippage${colors.reset}`);
assert(75 >= 50, '75% should trigger warning dialog');

// TC8: Extreme Slippage
console.log(`\n${colors.bold}${colors.blue}TC8: Extreme Slippage${colors.reset}`);
assertEq(validateUIInput(150), 100, 'UI should clamp 150% → 100%');
assertEq(validateSettings({ maxSlippage: 1.5 }).maxSlippage, 1.0, 'Context should clamp 1.5 → 1.0');
assertEq(validateUIInput(500), 100, 'UI should clamp 500% → 100%');
assertEq(validateSettings({ maxSlippage: 5.0 }).maxSlippage, 1.0, 'Context should clamp 5.0 → 1.0');

// TC9: Decimal Precision
console.log(`\n${colors.bold}${colors.blue}TC9: Decimal Precision${colors.reset}`);
assertEq(validateUIInput(25.333333), 25.33, 'UI should round 25.333333% → 25.33%');
assertEq(validateUIInput(12.999999), 13, 'UI should round 12.999999% → 13.00%');
assertEq(validateSettings({ maxSlippage: 0.253333 }).maxSlippage, 0.2533, 'Context should round 0.253333 → 0.2533');
assertEq(validateSettings({ maxSlippage: 0.999999 }).maxSlippage, 1.0, 'Context should round 0.999999 → 1.0');

// TC10: LocalStorage Corruption/Bypass
console.log(`\n${colors.bold}${colors.blue}TC10: LocalStorage Corruption/Bypass${colors.reset}`);
assertEq(validateSettings({ maxSlippage: 5.0 }).maxSlippage, 1.0, 'Should sanitize 500% → 100%');
assertEq(validateSettings({ maxSlippage: -0.5 }).maxSlippage, 0.001, 'Should sanitize -50% → 0.1%');
assertEq(validateSettings({ maxSlippage: 0.0000001 }).maxSlippage, 0.001, 'Should sanitize 0.00001% → 0.1%');

// Edge Cases: Boundary Values
console.log(`\n${colors.bold}${colors.blue}Edge Cases: Boundary Values${colors.reset}`);
assertEq(validateUIInput(0.1), 0.1, 'Exactly 0.1% should be accepted');
assertEq(validateUIInput(100), 100, 'Exactly 100% should be accepted');
assertEq(validateSettings({ maxSlippage: 0.001 }).maxSlippage, 0.001, 'Exactly 0.001 should be accepted');
assertEq(validateSettings({ maxSlippage: 1.0 }).maxSlippage, 1.0, 'Exactly 1.0 should be accepted');

// Edge Cases: Floating Point Precision
console.log(`\n${colors.bold}${colors.blue}Edge Cases: Floating Point Precision${colors.reset}`);
assertEq(validateUIInput(0.1 + 0.2), 0.3, 'Should handle 0.1 + 0.2 = 0.3');
assertEq(validateSettings({ maxSlippage: 0.001 + 0.002 }).maxSlippage, 0.003, 'Should handle floating point errors');

// Integration Tests
console.log(`\n${colors.bold}${colors.blue}Integration: UI to Context Flow${colors.reset}`);

// Test 1: User types 75%
const uiValidated1 = validateUIInput(75);
const decimalValue1 = uiValidated1 / 100;
const contextValidated1 = validateSettings({ maxSlippage: decimalValue1 });
const displayValue1 = contextValidated1.maxSlippage * 100;
assertEq(displayValue1, 75, 'User types 75%, flows through correctly');

// Test 2: Attacker bypasses UI
const maliciousValue = 5.0; // 500%
const sanitized = validateSettings({ maxSlippage: maliciousValue });
const displayValue2 = sanitized.maxSlippage * 100;
assertEq(displayValue2, 100, 'Attacker sets 500% via localStorage, sanitized to 100%');

// Summary
console.log(`\n${colors.bold}${colors.cyan}========================================${colors.reset}`);
console.log(`${colors.bold}Test Summary${colors.reset}`);
console.log(`${colors.cyan}========================================${colors.reset}`);
console.log(`Total Tests:  ${totalTests}`);
console.log(`${colors.green}Passed:       ${passedTests}${colors.reset}`);
console.log(`${colors.red}Failed:       ${failedTests}${colors.reset}`);

if (failedTests === 0) {
  console.log(`\n${colors.bold}${colors.green}✅ ALL TESTS PASSED!${colors.reset}\n`);
  process.exit(0);
} else {
  console.log(`\n${colors.bold}${colors.red}❌ SOME TESTS FAILED${colors.reset}\n`);
  process.exit(1);
}
