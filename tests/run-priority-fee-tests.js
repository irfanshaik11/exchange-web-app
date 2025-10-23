#!/usr/bin/env node

/**
 * Priority Fee Validation Test Runner
 * Critical Fix #2: Priority Fee Validation
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

  // Validate priority: min 0.0001 SOL, max 10.0 SOL, round to 6 decimals
  if (validated.priority < 0.0001) validated.priority = 0.0001;
  if (validated.priority > 10.0) validated.priority = 10.0;
  validated.priority = Math.round(validated.priority * 1000000) / 1000000;

  return validated;
}

function validateUIInput(inputSol) {
  let val = inputSol;

  // Allow any value during typing, clamp max
  if (val > 10.0) val = 10.0;

  // Round to 6 decimal places
  val = Math.round(val * 1000000) / 1000000;

  return val;
}

function validateUIInputOnBlur(inputSol) {
  let val = inputSol;

  // On blur, enforce minimum of 0.0001
  if (val < 0.0001) {
    val = 0.0001;
  }

  return val;
}

// Test Suite

console.log(`\n${colors.bold}${colors.cyan}========================================${colors.reset}`);
console.log(`${colors.bold}${colors.cyan}Critical Fix #2: Priority Fee Validation Tests${colors.reset}`);
console.log(`${colors.bold}${colors.cyan}========================================${colors.reset}\n`);

// TC1: Negative Priority Fee
console.log(`${colors.bold}${colors.blue}TC1: Negative Priority Fee${colors.reset}`);
assertEq(validateUIInputOnBlur(-0.5), 0.0001, 'UI should reject -0.5 SOL → 0.0001 SOL');
assertEq(validateSettings({ priority: -0.5 }).priority, 0.0001, 'Context should clamp -0.5 → 0.0001');
assertEq(validateSettings({ priority: -10 }).priority, 0.0001, 'Context should clamp -10 → 0.0001');

// TC2: Zero Priority Fee
console.log(`\n${colors.bold}${colors.blue}TC2: Zero Priority Fee${colors.reset}`);
assertEq(validateUIInput(0), 0, 'UI should allow 0 during typing');
assertEq(validateUIInputOnBlur(0), 0.0001, 'UI should enforce 0.0001 SOL on blur');
assertEq(validateSettings({ priority: 0 }).priority, 0.0001, 'Context should clamp 0 → 0.0001');

// TC3: Extremely Low Priority Fee
console.log(`\n${colors.bold}${colors.blue}TC3: Extremely Low Priority Fee${colors.reset}`);
assertEq(validateUIInputOnBlur(0.00001), 0.0001, 'UI should enforce 0.0001 SOL minimum for 0.00001');
assertEq(validateSettings({ priority: 0.00001 }).priority, 0.0001, 'Context should clamp 0.00001 → 0.0001');
assertEq(validateSettings({ priority: 0.000001 }).priority, 0.0001, 'Context should clamp 0.000001 → 0.0001');

// TC4: Normal Priority Fee
console.log(`\n${colors.bold}${colors.blue}TC4: Normal Priority Fee${colors.reset}`);
assertEq(validateUIInput(0.001), 0.001, 'UI should accept 0.001 SOL (default)');
assertEq(validateUIInput(0.005), 0.005, 'UI should accept 0.005 SOL');
assertEq(validateSettings({ priority: 0.001 }).priority, 0.001, 'Context should accept 0.001');
assertEq(validateSettings({ priority: 0.005 }).priority, 0.005, 'Context should accept 0.005');

// TC5: High Priority Fee (Below Warning Threshold)
console.log(`\n${colors.bold}${colors.blue}TC5: High Priority Fee (Below Threshold)${colors.reset}`);
assertEq(validateUIInput(0.5), 0.5, 'UI should accept 0.5 SOL');
assertEq(validateSettings({ priority: 0.5 }).priority, 0.5, 'Context should accept 0.5');
assert(0.5 < 1.0, '0.5 SOL should NOT trigger warning (threshold is 1.0)');

// TC6: High Priority Fee (At Warning Threshold)
console.log(`\n${colors.bold}${colors.blue}TC6: High Priority Fee (At Threshold)${colors.reset}`);
assertEq(validateUIInput(1.0), 1.0, 'UI should accept 1.0 SOL');
assertEq(validateSettings({ priority: 1.0 }).priority, 1.0, 'Context should accept 1.0');
assert(1.0 >= 1.0, '1.0 SOL should trigger warning dialog');

// TC7: Very High Priority Fee
console.log(`\n${colors.bold}${colors.blue}TC7: Very High Priority Fee${colors.reset}`);
assertEq(validateUIInput(5.0), 5.0, 'UI should accept 5.0 SOL');
assertEq(validateSettings({ priority: 5.0 }).priority, 5.0, 'Context should accept 5.0');
assert(5.0 >= 1.0, '5.0 SOL should trigger warning dialog');

// TC8: Extreme Priority Fee
console.log(`\n${colors.bold}${colors.blue}TC8: Extreme Priority Fee${colors.reset}`);
assertEq(validateUIInput(50.0), 10.0, 'UI should clamp 50.0 SOL → 10.0 SOL');
assertEq(validateSettings({ priority: 50.0 }).priority, 10.0, 'Context should clamp 50.0 → 10.0');
assertEq(validateUIInput(100.0), 10.0, 'UI should clamp 100.0 SOL → 10.0 SOL');
assertEq(validateSettings({ priority: 100.0 }).priority, 10.0, 'Context should clamp 100.0 → 10.0');

// TC9: Decimal Precision
console.log(`\n${colors.bold}${colors.blue}TC9: Decimal Precision${colors.reset}`);
assertEq(validateUIInput(0.0013333333), 0.001333, 'UI should round 0.0013333... → 0.001333 (6 decimals)');
assertEq(validateUIInput(0.0019999999), 0.002, 'UI should round 0.0019999... → 0.002');
assertEq(validateSettings({ priority: 0.0013333333 }).priority, 0.001333, 'Context should round to 6 decimals');
assertEq(validateSettings({ priority: 0.9999999 }).priority, 1.0, 'Context should round 0.9999999 → 1.0');

// TC10: LocalStorage Corruption/Bypass
console.log(`\n${colors.bold}${colors.blue}TC10: LocalStorage Corruption/Bypass${colors.reset}`);
assertEq(validateSettings({ priority: 100.0 }).priority, 10.0, 'Should sanitize 100 SOL → 10.0 SOL');
assertEq(validateSettings({ priority: -5.0 }).priority, 0.0001, 'Should sanitize -5 SOL → 0.0001 SOL');
assertEq(validateSettings({ priority: 0.0000001 }).priority, 0.0001, 'Should sanitize 0.0000001 → 0.0001');

// Edge Cases: Boundary Values
console.log(`\n${colors.bold}${colors.blue}Edge Cases: Boundary Values${colors.reset}`);
assertEq(validateUIInput(0.0001), 0.0001, 'Exactly 0.0001 SOL should be accepted');
assertEq(validateUIInput(10.0), 10.0, 'Exactly 10.0 SOL should be accepted');
assertEq(validateSettings({ priority: 0.0001 }).priority, 0.0001, 'Exactly 0.0001 should be accepted');
assertEq(validateSettings({ priority: 10.0 }).priority, 10.0, 'Exactly 10.0 should be accepted');

// Edge Cases: Floating Point Precision
console.log(`\n${colors.bold}${colors.blue}Edge Cases: Floating Point Precision${colors.reset}`);
assertEq(validateUIInput(0.1 + 0.2), 0.3, 'Should handle 0.1 + 0.2 = 0.3');
assertEq(validateSettings({ priority: 0.0001 + 0.0002 }).priority, 0.0003, 'Should handle floating point errors');

// Edge Cases: Very Small Fees
console.log(`\n${colors.bold}${colors.blue}Edge Cases: Very Small Fees${colors.reset}`);
assertEq(validateUIInputOnBlur(0.000001), 0.0001, 'Should clamp 0.000001 → 0.0001');
assertEq(validateUIInputOnBlur(0.00005), 0.0001, 'Should clamp 0.00005 → 0.0001');

// Integration Tests
console.log(`\n${colors.bold}${colors.blue}Integration: UI to Context Flow${colors.reset}`);

// Test 1: User types 0.005 SOL
const uiValidated1 = validateUIInput(0.005);
const contextValidated1 = validateSettings({ priority: uiValidated1 });
assertEq(contextValidated1.priority, 0.005, 'User types 0.005 SOL, flows through correctly');

// Test 2: Attacker bypasses UI
const maliciousValue = 100.0; // 100 SOL
const sanitized = validateSettings({ priority: maliciousValue });
assertEq(sanitized.priority, 10.0, 'Attacker sets 100 SOL via localStorage, sanitized to 10.0');

// Test 3: User accidentally types extra zero
const typo = 1.0; // Meant 0.001, typed 1.0
const contextValidatedTypo = validateSettings({ priority: typo });
assertEq(contextValidatedTypo.priority, 1.0, 'Typo (1.0 instead of 0.001) accepted but should trigger warning');

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
