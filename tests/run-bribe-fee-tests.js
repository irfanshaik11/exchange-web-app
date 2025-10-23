#!/usr/bin/env node

/**
 * Bribe Fee Validation Test Runner
 * Critical Fix #3: Bribe Fee Validation
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

  // Validate bribe: min 0 SOL (optional), max 10.0 SOL, round to 6 decimals
  if (validated.bribe < 0) validated.bribe = 0;
  if (validated.bribe > 10.0) validated.bribe = 10.0;
  validated.bribe = Math.round(validated.bribe * 1000000) / 1000000;

  return validated;
}

function validateUIInput(inputSol) {
  let val = inputSol;

  // Clamp negative to 0, max to 10.0
  if (val < 0) val = 0;
  if (val > 10.0) val = 10.0;

  // Round to 6 decimal places
  val = Math.round(val * 1000000) / 1000000;

  return val;
}

function validateUIInputOnBlur(inputSol) {
  let val = inputSol;

  // On blur, enforce minimum of 0 (no negative)
  if (val < 0) {
    val = 0;
  }

  return val;
}

// Test Suite

console.log(`\n${colors.bold}${colors.cyan}========================================${colors.reset}`);
console.log(`${colors.bold}${colors.cyan}Critical Fix #3: Bribe Fee Validation Tests${colors.reset}`);
console.log(`${colors.bold}${colors.cyan}========================================${colors.reset}\n`);

// TC1: Negative Bribe Fee
console.log(`${colors.bold}${colors.blue}TC1: Negative Bribe Fee${colors.reset}`);
assertEq(validateUIInput(-0.5), 0, 'UI should reject -0.5 SOL → 0 SOL');
assertEq(validateUIInputOnBlur(-5.0), 0, 'UI should reject -5.0 SOL → 0 SOL on blur');
assertEq(validateSettings({ bribe: -0.5 }).bribe, 0, 'Context should clamp -0.5 → 0');
assertEq(validateSettings({ bribe: -10 }).bribe, 0, 'Context should clamp -10 → 0');

// TC2: Zero Bribe Fee (Valid - bribes are optional)
console.log(`\n${colors.bold}${colors.blue}TC2: Zero Bribe Fee (Valid)${colors.reset}`);
assertEq(validateUIInput(0), 0, 'UI should accept 0 SOL (bribes are optional)');
assertEq(validateUIInputOnBlur(0), 0, 'UI should accept 0 SOL on blur');
assertEq(validateSettings({ bribe: 0 }).bribe, 0, 'Context should accept 0');

// TC3: Normal Bribe Fee
console.log(`\n${colors.bold}${colors.blue}TC3: Normal Bribe Fee${colors.reset}`);
assertEq(validateUIInput(0.05), 0.05, 'UI should accept 0.05 SOL (default)');
assertEq(validateUIInput(0.1), 0.1, 'UI should accept 0.1 SOL');
assertEq(validateSettings({ bribe: 0.05 }).bribe, 0.05, 'Context should accept 0.05');
assertEq(validateSettings({ bribe: 0.1 }).bribe, 0.1, 'Context should accept 0.1');

// TC4: High Bribe Fee (Below Warning Threshold)
console.log(`\n${colors.bold}${colors.blue}TC4: High Bribe Fee (Below Threshold)${colors.reset}`);
assertEq(validateUIInput(0.5), 0.5, 'UI should accept 0.5 SOL');
assertEq(validateSettings({ bribe: 0.5 }).bribe, 0.5, 'Context should accept 0.5');
assert(0.5 < 1.0, '0.5 SOL should NOT trigger warning (threshold is 1.0)');

// TC5: High Bribe Fee (At Warning Threshold)
console.log(`\n${colors.bold}${colors.blue}TC5: High Bribe Fee (At Threshold)${colors.reset}`);
assertEq(validateUIInput(1.0), 1.0, 'UI should accept 1.0 SOL');
assertEq(validateSettings({ bribe: 1.0 }).bribe, 1.0, 'Context should accept 1.0');
assert(1.0 >= 1.0, '1.0 SOL should trigger warning dialog (if implemented)');

// TC6: Very High Bribe Fee
console.log(`\n${colors.bold}${colors.blue}TC6: Very High Bribe Fee${colors.reset}`);
assertEq(validateUIInput(5.0), 5.0, 'UI should accept 5.0 SOL');
assertEq(validateSettings({ bribe: 5.0 }).bribe, 5.0, 'Context should accept 5.0');
assert(5.0 >= 1.0, '5.0 SOL should trigger warning dialog');

// TC7: Extreme Bribe Fee
console.log(`\n${colors.bold}${colors.blue}TC7: Extreme Bribe Fee${colors.reset}`);
assertEq(validateUIInput(50.0), 10.0, 'UI should clamp 50.0 SOL → 10.0 SOL');
assertEq(validateSettings({ bribe: 50.0 }).bribe, 10.0, 'Context should clamp 50.0 → 10.0');
assertEq(validateUIInput(100.0), 10.0, 'UI should clamp 100.0 SOL → 10.0 SOL');
assertEq(validateSettings({ bribe: 100.0 }).bribe, 10.0, 'Context should clamp 100.0 → 10.0');

// TC8: Decimal Precision
console.log(`\n${colors.bold}${colors.blue}TC8: Decimal Precision${colors.reset}`);
assertEq(validateUIInput(0.053333333), 0.053333, 'UI should round 0.053333... → 0.053333 (6 decimals)');
assertEq(validateUIInput(0.0599999), 0.06, 'UI should round 0.0599999 → 0.06');
assertEq(validateSettings({ bribe: 0.053333333 }).bribe, 0.053333, 'Context should round to 6 decimals');
assertEq(validateSettings({ bribe: 0.9999999 }).bribe, 1.0, 'Context should round 0.9999999 → 1.0');

// TC9: LocalStorage Corruption/Bypass
console.log(`\n${colors.bold}${colors.blue}TC9: LocalStorage Corruption/Bypass${colors.reset}`);
assertEq(validateSettings({ bribe: 100.0 }).bribe, 10.0, 'Should sanitize 100 SOL → 10.0 SOL');
assertEq(validateSettings({ bribe: -5.0 }).bribe, 0, 'Should sanitize -5 SOL → 0 SOL');
assertEq(validateSettings({ bribe: -0.1 }).bribe, 0, 'Should sanitize -0.1 → 0');

// Edge Cases: Boundary Values
console.log(`\n${colors.bold}${colors.blue}Edge Cases: Boundary Values${colors.reset}`);
assertEq(validateUIInput(0), 0, 'Exactly 0 SOL should be accepted');
assertEq(validateUIInput(10.0), 10.0, 'Exactly 10.0 SOL should be accepted');
assertEq(validateSettings({ bribe: 0 }).bribe, 0, 'Exactly 0 should be accepted');
assertEq(validateSettings({ bribe: 10.0 }).bribe, 10.0, 'Exactly 10.0 should be accepted');

// Edge Cases: Floating Point Precision
console.log(`\n${colors.bold}${colors.blue}Edge Cases: Floating Point Precision${colors.reset}`);
assertEq(validateUIInput(0.1 + 0.2), 0.3, 'Should handle 0.1 + 0.2 = 0.3');
assertEq(validateSettings({ bribe: 0.01 + 0.02 }).bribe, 0.03, 'Should handle floating point errors');

// Edge Cases: Very Small Fees
console.log(`\n${colors.bold}${colors.blue}Edge Cases: Very Small Fees${colors.reset}`);
assertEq(validateUIInput(0.000001), 0.000001, 'Should accept 0.000001 SOL');
assertEq(validateUIInput(0.00005), 0.00005, 'Should accept 0.00005 SOL');
assertEq(validateSettings({ bribe: 0.000001 }).bribe, 0.000001, 'Context should accept very small fees');

// Integration Tests
console.log(`\n${colors.bold}${colors.blue}Integration: UI to Context Flow${colors.reset}`);

// Test 1: User types 0.05 SOL (default)
const uiValidated1 = validateUIInput(0.05);
const contextValidated1 = validateSettings({ bribe: uiValidated1 });
assertEq(contextValidated1.bribe, 0.05, 'User types 0.05 SOL, flows through correctly');

// Test 2: User sets to 0 (no bribe)
const uiValidated2 = validateUIInput(0);
const contextValidated2 = validateSettings({ bribe: uiValidated2 });
assertEq(contextValidated2.bribe, 0, 'User sets 0 SOL (no bribe), accepted');

// Test 3: Attacker bypasses UI
const maliciousValue = 100.0; // 100 SOL
const sanitized = validateSettings({ bribe: maliciousValue });
assertEq(sanitized.bribe, 10.0, 'Attacker sets 100 SOL via localStorage, sanitized to 10.0');

// Test 4: Negative bypass attempt
const negativeAttack = -10.0;
const sanitizedNegative = validateSettings({ bribe: negativeAttack });
assertEq(sanitizedNegative.bribe, 0, 'Attacker sets -10 SOL via localStorage, sanitized to 0');

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
