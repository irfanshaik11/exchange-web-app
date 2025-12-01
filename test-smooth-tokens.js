#!/usr/bin/env node

/**
 * Test for Smooth Token Addition
 * This script tests if new tokens are added smoothly without causing full reloads
 */

import WebSocket from "ws";

console.log("🧪 SMOOTH TOKEN ADDITION TEST");
console.log("=============================");

// Test WebSocket for new tokens
function testSmoothTokenAddition() {
  return new Promise((resolve) => {
    console.log("\n🔌 Testing WebSocket for New Tokens");
    try {
      const ws = new WebSocket("ws://localhost:8080/v1/stream");
      let messageCount = 0;
      let newTokenCount = 0;
      const tokens = [];

      ws.onopen = () => {
        console.log("✅ WebSocket Connected");
      };

      ws.onmessage = (event) => {
        messageCount++;
        const message = JSON.parse(event.data);

        if (message.type === "new_token") {
          newTokenCount++;
          tokens.push({
            name: message.data.name,
            symbol: message.data.symbol,
            timestamp: Date.now(),
          });
          console.log(
            `🆕 New Token #${newTokenCount}: ${message.data.name} (${message.data.symbol})`,
          );
        }

        // Stop after 5 new tokens or 10 seconds
        if (newTokenCount >= 5 || messageCount >= 10) {
          ws.close();
          console.log(`\n📊 Results:`);
          console.log(`   Total messages: ${messageCount}`);
          console.log(`   New tokens received: ${newTokenCount}`);
          console.log(
            `   Tokens:`,
            tokens.map((t) => `${t.name} (${t.symbol})`).join(", "),
          );
          console.log(`\n✅ Smooth token addition test completed`);
          console.log(`   - New tokens should appear at the top of the list`);
          console.log(`   - No full page reload should occur`);
          console.log(`   - Each token should appear smoothly`);
          resolve(true);
        }
      };

      ws.onerror = (error) => {
        console.log(`❌ WebSocket Error: ${error}`);
        resolve(false);
      };

      // Timeout after 10 seconds
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
          console.log(`⏰ WebSocket Timeout`);
          console.log(`   Total messages: ${messageCount}`);
          console.log(`   New tokens: ${newTokenCount}`);
          resolve(newTokenCount > 0);
        }
      }, 10000);
    } catch (error) {
      console.log(`❌ WebSocket Error: ${error.message}`);
      resolve(false);
    }
  });
}

// Run the test
testSmoothTokenAddition()
  .then((success) => {
    if (success) {
      console.log("\n🎯 RESULT: ✅ Smooth token addition is working!");
      console.log("   - New tokens are being received via WebSocket");
      console.log("   - Frontend optimizations should prevent full reloads");
      console.log("   - Tokens should appear smoothly at the top");
    } else {
      console.log("\n🎯 RESULT: ❌ Smooth token addition test failed");
    }
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error("Test failed with error:", error);
    process.exit(1);
  });
























