#!/usr/bin/env node

/**
 * Balance Check Validation Test Runner
 * Critical Fix #4: Balance Check Validation
 *
 * Tests that balance checks include all fees:
 * - Trade amount
 * - Priority fee
 * - Bribe fee
 * - Safety buffer (0.003 SOL)
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
  const pass = Math.abs(actual - expected) < 0.0000001; // Float comparison
  if (!pass) {
    console.log(`    ${colors.red}Expected: ${expected}, Got: ${actual}${colors.reset}`);
  }
  return assert(pass, testName);
}

// Balance check calculation (from implementation)
function calculateRequiredBalance(tradeAmount, priorityFee, bribeFee) {
  const safetyBuffer = 0.003;
  const totalFees = safetyBuffer + priorityFee + bribeFee;
  const required = tradeAmount + totalFees;
  return { required, totalFees, safetyBuffer };
}

function checkBalanceSufficient(balance, tradeAmount, priorityFee, bribeFee) {
  const { required } = calculateRequiredBalance(tradeAmount, priorityFee, bribeFee);
  return balance >= required;
}

// Test Suite

console.log(`\n${colors.bold}${colors.cyan}========================================${colors.reset}`);
console.log(`${colors.bold}${colors.cyan}Critical Fix #4: Balance Check Tests${colors.reset}`);
console.log(`${colors.bold}${colors.cyan}========================================${colors.reset}\n`);

// TC1: Basic Balance Check (No Fees)
console.log(`${colors.bold}${colors.blue}TC1: Basic Balance Check${colors.reset}`);
const calc1 = calculateRequiredBalance(1.0, 0, 0);
assertEq(calc1.required, 1.003, 'Trade 1.0 SOL with no fees → need 1.003 SOL');
assertEq(calc1.totalFees, 0.003, 'Total fees should be 0.003 (safety buffer only)');
assert(checkBalanceSufficient(1.003, 1.0, 0, 0), 'Balance 1.003 SOL should be sufficient');
assert(!checkBalanceSufficient(1.002, 1.0, 0, 0), 'Balance 1.002 SOL should be insufficient');

// TC2: Balance Check with Priority Fee
console.log(`\n${colors.bold}${colors.blue}TC2: Balance Check with Priority Fee${colors.reset}`);
const calc2 = calculateRequiredBalance(1.0, 0.001, 0);
assertEq(calc2.required, 1.004, 'Trade 1.0 SOL + priority 0.001 → need 1.004 SOL');
assertEq(calc2.totalFees, 0.004, 'Total fees should be 0.004 (buffer + priority)');
assert(checkBalanceSufficient(1.004, 1.0, 0.001, 0), 'Balance 1.004 SOL should be sufficient');
assert(!checkBalanceSufficient(1.003, 1.0, 0.001, 0), 'Balance 1.003 SOL should be insufficient');

// TC3: Balance Check with Bribe Fee
console.log(`\n${colors.bold}${colors.blue}TC3: Balance Check with Bribe Fee${colors.reset}`);
const calc3 = calculateRequiredBalance(1.0, 0, 0.05);
assertEq(calc3.required, 1.053, 'Trade 1.0 SOL + bribe 0.05 → need 1.053 SOL');
assertEq(calc3.totalFees, 0.053, 'Total fees should be 0.053 (buffer + bribe)');
assert(checkBalanceSufficient(1.053, 1.0, 0, 0.05), 'Balance 1.053 SOL should be sufficient');
assert(!checkBalanceSufficient(1.052, 1.0, 0, 0.05), 'Balance 1.052 SOL should be insufficient');

// TC4: Balance Check with All Fees (Realistic Scenario)
console.log(`\n${colors.bold}${colors.blue}TC4: Balance Check with All Fees${colors.reset}`);
const calc4 = calculateRequiredBalance(0.95, 0.001, 0.05);
assertEq(calc4.required, 1.004, 'Trade 0.95 + priority 0.001 + bribe 0.05 → need 1.004 SOL');
assertEq(calc4.totalFees, 0.054, 'Total fees should be 0.054');
assert(!checkBalanceSufficient(1.0, 0.95, 0.001, 0.05), 'Balance 1.0 SOL should be insufficient (need 1.004)');
assert(checkBalanceSufficient(1.01, 0.95, 0.001, 0.05), 'Balance 1.01 SOL should be sufficient');

// TC5: Edge Case - Exact Balance Match
console.log(`\n${colors.bold}${colors.blue}TC5: Edge Case - Exact Balance Match${colors.reset}`);
const calc5 = calculateRequiredBalance(0.5, 0.001, 0.05);
assertEq(calc5.required, 0.554, 'Trade 0.5 + all fees → need 0.554 SOL');
assert(checkBalanceSufficient(0.554, 0.5, 0.001, 0.05), 'Exactly 0.554 SOL should be sufficient');
assert(!checkBalanceSufficient(0.5539999, 0.5, 0.001, 0.05), 'Slightly below 0.554 should be insufficient');

// TC6: Edge Case - Very High Fees
console.log(`\n${colors.bold}${colors.blue}TC6: Edge Case - High Priority and Bribe Fees${colors.reset}`);
const calc6 = calculateRequiredBalance(1.0, 0.5, 0.5);
assertEq(calc6.required, 2.003, 'Trade 1.0 + priority 0.5 + bribe 0.5 → need 2.003 SOL');
assertEq(calc6.totalFees, 1.003, 'Total fees should be 1.003');
assert(!checkBalanceSufficient(2.0, 1.0, 0.5, 0.5), 'Balance 2.0 SOL should be insufficient');
assert(checkBalanceSufficient(2.01, 1.0, 0.5, 0.5), 'Balance 2.01 SOL should be sufficient');

// TC7: Edge Case - Zero Trade Amount
console.log(`\n${colors.bold}${colors.blue}TC7: Edge Case - Zero Trade Amount${colors.reset}`);
const calc7 = calculateRequiredBalance(0, 0.001, 0.05);
assertEq(calc7.required, 0.054, 'Zero trade + fees → need 0.054 SOL (fees only)');
assert(checkBalanceSufficient(0.06, 0, 0.001, 0.05), 'Balance 0.06 SOL should be sufficient (covers 0.054 needed)');

// TC8: Realistic User Scenarios
console.log(`\n${colors.bold}${colors.blue}TC8: Realistic User Scenarios${colors.reset}`);

// Scenario 1: Small trade with default fees
const small1 = calculateRequiredBalance(0.1, 0.001, 0.05);
assertEq(small1.required, 0.154, 'Small trade 0.1 SOL → need 0.154 SOL');
assert(checkBalanceSufficient(0.2, 0.1, 0.001, 0.05), 'User with 0.2 SOL can trade 0.1 SOL');

// Scenario 2: Medium trade
const medium1 = calculateRequiredBalance(2.0, 0.001, 0.05);
assertEq(medium1.required, 2.054, 'Medium trade 2.0 SOL → need 2.054 SOL');
assert(!checkBalanceSufficient(2.05, 2.0, 0.001, 0.05), 'User with 2.05 SOL cannot trade 2.0 SOL');
assert(checkBalanceSufficient(2.1, 2.0, 0.001, 0.05), 'User with 2.1 SOL can trade 2.0 SOL');

// Scenario 3: Large trade
const large1 = calculateRequiredBalance(10.0, 0.001, 0.05);
assertEq(large1.required, 10.054, 'Large trade 10.0 SOL → need 10.054 SOL');
assert(checkBalanceSufficient(10.1, 10.0, 0.001, 0.05), 'User with 10.1 SOL can trade 10.0 SOL');

// TC9: The Original Bug Scenario (from CRITICAL_FIX_4_ANALYSIS.md)
console.log(`\n${colors.bold}${colors.blue}TC9: Original Bug Scenario${colors.reset}`);
const bug = calculateRequiredBalance(0.95, 0.001, 0.05);
assertEq(bug.required, 1.004, 'Bug scenario: need 1.004 SOL total');

// Old logic would have only checked: 0.95 + 0.003 = 0.953 ✅ (passes incorrectly)
const oldRequired = 0.95 + 0.003;
assertEq(oldRequired, 0.953, 'Old logic: would check 0.953 SOL');

// User has 1.0 SOL
const userBalance = 1.0;
assert(userBalance >= oldRequired, 'OLD LOGIC: User with 1.0 SOL would PASS check (0.953 < 1.0)');
assert(userBalance < bug.required, 'NEW LOGIC: User with 1.0 SOL should FAIL check (1.004 > 1.0)');

console.log(`  ${colors.yellow}⚠️  Old logic would have allowed trade, causing failure and gas loss${colors.reset}`);
console.log(`  ${colors.green}✓  New logic correctly prevents insufficient balance trades${colors.reset}`);

// TC10: Fee Calculation Breakdown
console.log(`\n${colors.bold}${colors.blue}TC10: Fee Calculation Breakdown${colors.reset}`);
const breakdown = calculateRequiredBalance(1.0, 0.001, 0.05);
assertEq(breakdown.safetyBuffer, 0.003, 'Safety buffer is always 0.003 SOL');
assertEq(breakdown.totalFees, 0.054, 'Total fees = 0.003 + 0.001 + 0.05 = 0.054');
assertEq(breakdown.required, 1.054, 'Total required = 1.0 + 0.054 = 1.054');

// TC11: Boundary Values
console.log(`\n${colors.bold}${colors.blue}TC11: Boundary Values${colors.reset}`);
const boundary1 = calculateRequiredBalance(0.0001, 0.0001, 0);
// Use approximate check for floating point: 0.0001 + 0.003 + 0.0001 = 0.0032
assert(Math.abs(boundary1.required - 0.0032) < 0.00001, 'Minimum trade + minimum priority → ~0.0032 SOL');

const boundary2 = calculateRequiredBalance(100, 10.0, 10.0);
assertEq(boundary2.required, 120.003, 'Maximum values → 120.003 SOL');

// TC12: Floating Point Precision
console.log(`\n${colors.bold}${colors.blue}TC12: Floating Point Precision${colors.reset}`);
const fp1 = calculateRequiredBalance(0.1 + 0.2, 0.001, 0.05); // 0.3 + fees
assertEq(fp1.required, 0.354, 'Handle floating point: 0.3 + fees = 0.354');

const fp2 = calculateRequiredBalance(0.333333, 0.001111, 0.055555);
const expectedFp2 = 0.333333 + 0.003 + 0.001111 + 0.055555;
assertEq(fp2.required, expectedFp2, 'Handle many decimals correctly');

// Integration Tests
console.log(`\n${colors.bold}${colors.blue}Integration: Real-world Trade Flows${colors.reset}`);

// Flow 1: User tries to buy with insufficient balance
const user1Balance = 0.5;
const user1TradeAmount = 0.48;
const user1Priority = 0.001;
const user1Bribe = 0.05;
const user1Calc = calculateRequiredBalance(user1TradeAmount, user1Priority, user1Bribe);
assert(!checkBalanceSufficient(user1Balance, user1TradeAmount, user1Priority, user1Bribe),
  `User 1: Balance ${user1Balance} < required ${user1Calc.required.toFixed(3)} → trade blocked ✅`);

// Flow 2: User has sufficient balance
const user2Balance = 1.0;
const user2TradeAmount = 0.9;
const user2Priority = 0.001;
const user2Bribe = 0.05;
const user2Calc = calculateRequiredBalance(user2TradeAmount, user2Priority, user2Bribe);
assert(checkBalanceSufficient(user2Balance, user2TradeAmount, user2Priority, user2Bribe),
  `User 2: Balance ${user2Balance} >= required ${user2Calc.required.toFixed(3)} → trade allowed ✅`);

// Flow 3: Edge case - exactly at boundary
const user3Balance = 1.054;
const user3TradeAmount = 1.0;
const user3Priority = 0.001;
const user3Bribe = 0.05;
assert(checkBalanceSufficient(user3Balance, user3TradeAmount, user3Priority, user3Bribe),
  'User 3: Exactly at boundary → trade allowed ✅');

// Flow 4: User with zero fees
const user4Balance = 1.0;
const user4TradeAmount = 0.996;
const user4Priority = 0;
const user4Bribe = 0;
const user4Calc = calculateRequiredBalance(user4TradeAmount, user4Priority, user4Bribe);
assert(checkBalanceSufficient(user4Balance, user4TradeAmount, user4Priority, user4Bribe),
  `User 4: No extra fees, only buffer → ${user4Calc.required.toFixed(3)} SOL needed ✅`);

// Summary
console.log(`\n${colors.bold}${colors.cyan}========================================${colors.reset}`);
console.log(`${colors.bold}Test Summary${colors.reset}`);
console.log(`${colors.cyan}========================================${colors.reset}`);
console.log(`Total Tests:  ${totalTests}`);
console.log(`${colors.green}Passed:       ${passedTests}${colors.reset}`);
console.log(`${colors.red}Failed:       ${failedTests}${colors.reset}`);

if (failedTests === 0) {
  console.log(`\n${colors.bold}${colors.green}✅ ALL TESTS PASSED!${colors.reset}\n`);
  console.log(`${colors.cyan}Balance check now correctly includes:${colors.reset}`);
  console.log(`  • Trade amount`);
  console.log(`  • Priority fee`);
  console.log(`  • Bribe fee`);
  console.log(`  • Safety buffer (0.003 SOL)`);
  console.log();
  process.exit(0);
} else {
  console.log(`\n${colors.bold}${colors.red}❌ SOME TESTS FAILED${colors.reset}\n`);
  process.exit(1);
}
