#!/usr/bin/env node

/**
 * Complete Test for Migrated Tokens Functionality
 * This script tests all aspects of the migrated tokens feature
 */

import WebSocket from "ws";

console.log("🧪 COMPLETE MIGRATED TOKENS TEST");
console.log("================================");

// Test 1: API Endpoint
async function testAPI() {
  console.log("\n📡 Test 1: API Endpoint");
  try {
    const response = await fetch(
      "http://localhost:3000/api/token-service/pulse-migrated?limit=5",
    );
    if (response.ok) {
      const data = await response.json();
      console.log(`✅ API Working - Found ${data.length} migrated tokens`);
      if (data.length > 0) {
        console.log(`   First token: ${data[0].name} (${data[0].symbol})`);
        console.log(`   Status: ${data[0].status}`);
        console.log(
          `   Migrated Pool Address: ${data[0].migrated_pool_address || "null"}`,
        );
        console.log(`   Migrated Time: ${data[0].migrated_time || "null"}`);
      }
      return data.length > 0;
    } else {
      console.log(`❌ API Error: ${response.status}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ API Error: ${error.message}`);
    return false;
  }
}

// Test 2: WebSocket Connection
function testWebSocket() {
  return new Promise((resolve) => {
    console.log("\n🔌 Test 2: WebSocket Connection");
    try {
      const ws = new WebSocket("ws://localhost:8080/v1/stream");
      let messageCount = 0;
      let migratedCount = 0;
      let newTokenCount = 0;

      ws.onopen = () => {
        console.log("✅ WebSocket Connected");
      };

      ws.onmessage = (event) => {
        messageCount++;
        const message = JSON.parse(event.data);

        if (message.type === "migrated_token") {
          migratedCount++;
          console.log(
            `🔄 Migrated Token: ${message.data.name} (${message.data.symbol})`,
          );
          console.log(`   Status: ${message.data.status}`);
          console.log(
            `   Migrated Pool Address: ${message.data.migrated_pool_address || "null"}`,
          );
        } else if (message.type === "new_token") {
          newTokenCount++;
        }

        // Stop after 10 messages or 15 seconds
        if (messageCount >= 10) {
          ws.close();
          console.log(`📊 WebSocket Test Complete:`);
          console.log(`   Total messages: ${messageCount}`);
          console.log(`   New tokens: ${newTokenCount}`);
          console.log(`   Migrated tokens: ${migratedCount}`);
          resolve(migratedCount > 0);
        }
      };

      ws.onerror = (error) => {
        console.log(`❌ WebSocket Error: ${error}`);
        resolve(false);
      };

      // Timeout after 15 seconds
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
          console.log(`⏰ WebSocket Timeout`);
          console.log(`   Total messages: ${messageCount}`);
          console.log(`   New tokens: ${newTokenCount}`);
          console.log(`   Migrated tokens: ${migratedCount}`);
          resolve(migratedCount > 0);
        }
      }, 15000);
    } catch (error) {
      console.log(`❌ WebSocket Error: ${error.message}`);
      resolve(false);
    }
  });
}

// Test 3: Frontend Page
async function testFrontend() {
  console.log("\n🌐 Test 3: Frontend Page");
  try {
    const response = await fetch("http://localhost:3000/pulse");
    if (response.ok) {
      const html = await response.text();
      const hasMigrated = html.includes("Migrated");
      const hasPulseTable = html.includes("PulseTable");
      const hasReact = html.includes("__NEXT_DATA__");

      console.log(`✅ Frontend Page Loaded`);
      console.log(`   Contains "Migrated": ${hasMigrated ? "✅" : "❌"}`);
      console.log(`   Contains "PulseTable": ${hasPulseTable ? "✅" : "❌"}`);
      console.log(`   React App: ${hasReact ? "✅" : "❌"}`);

      return hasMigrated && hasPulseTable && hasReact;
    } else {
      console.log(`❌ Frontend Error: ${response.status}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Frontend Error: ${error.message}`);
    return false;
  }
}

// Test 4: Backend Service
async function testBackend() {
  console.log("\n🔧 Test 4: Backend Service");
  try {
    const response = await fetch(
      "http://localhost:8080/v1/pulse/migrated?limit=3",
    );
    if (response.ok) {
      const data = await response.json();
      console.log(
        `✅ Backend Service Working - Found ${data.length} migrated tokens`,
      );
      if (data.length > 0) {
        console.log(`   First token: ${data[0].name} (${data[0].symbol})`);
        console.log(
          `   Migrated Pool Address: ${data[0].migrated_pool_address || "null"}`,
        );
      }
      return data.length > 0;
    } else {
      console.log(`❌ Backend Error: ${response.status}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Backend Error: ${error.message}`);
    return false;
  }
}

// Run all tests
async function runAllTests() {
  console.log("Starting comprehensive migrated tokens test...\n");

  const results = {
    api: await testAPI(),
    websocket: await testWebSocket(),
    frontend: await testFrontend(),
    backend: await testBackend(),
  };

  console.log("\n📊 TEST RESULTS");
  console.log("================");
  console.log(`API Endpoint: ${results.api ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`WebSocket: ${results.websocket ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`Frontend Page: ${results.frontend ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`Backend Service: ${results.backend ? "✅ PASS" : "❌ FAIL"}`);

  const allPassed = Object.values(results).every(Boolean);
  console.log(
    `\n🎯 OVERALL RESULT: ${allPassed ? "✅ ALL TESTS PASSED" : "❌ SOME TESTS FAILED"}`,
  );

  if (!allPassed) {
    console.log("\n🔍 DIAGNOSIS:");
    if (!results.api)
      console.log("   - API endpoint not returning migrated tokens");
    if (!results.websocket)
      console.log("   - WebSocket not receiving migrated token events");
    if (!results.frontend)
      console.log("   - Frontend page not loading correctly");
    if (!results.backend) console.log("   - Backend service not responding");
  }

  return allPassed;
}

// Run the tests
runAllTests()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error("Test failed with error:", error);
    process.exit(1);
  });
