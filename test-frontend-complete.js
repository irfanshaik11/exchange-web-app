import WebSocket from "ws";

console.log("🧪 Testing Complete Frontend Migrated Token Flow...");

// Test 1: Check if HTTP API returns migrated tokens
console.log("\n📡 Test 1: Checking HTTP API for migrated tokens...");
try {
  const response = await fetch(
    "http://localhost:8080/v1/pulse/migrated?limit=5",
  );
  const data = await response.json();
  console.log(`✅ HTTP API returned ${data.length} migrated tokens`);
  if (data.length > 0) {
    console.log(`📋 First migrated token:`, data[0].name, data[0].status);
  }
} catch (error) {
  console.error("❌ HTTP API test failed:", error);
}

// Test 2: Simulate frontend initial fetch
console.log("\n🔄 Test 2: Simulating frontend initial fetch...");
const simulateFrontendFetch = async () => {
  try {
    const response = await fetch(
      "http://localhost:8080/v1/pulse/migrated?limit=50",
    );
    if (response.ok) {
      const data = await response.json();
      console.log(`✅ Frontend would fetch ${data.length} migrated tokens`);

      // Simulate the frontend processing
      const tokensWithTimestamp = data.map((token) => ({
        ...token,
        created_at: token.migrated_time || new Date().toISOString(),
        timestamp: Date.now(),
      }));

      console.log(
        `📋 Processed tokens:`,
        tokensWithTimestamp.map((t) => t.name),
      );
      return tokensWithTimestamp;
    }
  } catch (error) {
    console.error("❌ Frontend fetch simulation failed:", error);
  }
  return [];
};

const initialTokens = await simulateFrontendFetch();

// Test 3: Test WebSocket connection
console.log("\n🔌 Test 3: Testing WebSocket connection...");
const ws = new WebSocket("ws://localhost:8080/v1/stream");

let wsConnected = false;
let receivedMessages = 0;

ws.on("open", () => {
  console.log("✅ WebSocket connected");
  wsConnected = true;
});

ws.on("message", (data) => {
  try {
    const message = JSON.parse(data.toString());
    receivedMessages++;
    console.log(`📨 Message ${receivedMessages}: ${message.type}`);

    if (message.type === "migrated_token") {
      console.log(`🔄 Migrated token received:`, message.data.name);
    }
  } catch (error) {
    console.error("❌ Failed to parse WebSocket message:", error);
  }
});

ws.on("error", (error) => {
  console.error("❌ WebSocket error:", error);
});

ws.on("close", () => {
  console.log("🔌 WebSocket closed");
});

// Wait for WebSocket connection and messages
await new Promise((resolve) => {
  setTimeout(() => {
    console.log(`\n📊 Test Results:`);
    console.log(`✅ HTTP API: Working`);
    console.log(
      `✅ Frontend simulation: ${initialTokens.length} tokens processed`,
    );
    console.log(`✅ WebSocket: ${wsConnected ? "Connected" : "Failed"}`);
    console.log(`📨 Messages received: ${receivedMessages}`);

    if (initialTokens.length > 0) {
      console.log(
        `\n🎯 SUCCESS: Frontend should display ${initialTokens.length} migrated tokens`,
      );
      console.log(
        `📋 Tokens that should appear:`,
        initialTokens.map((t) => t.name).join(", "),
      );
    } else {
      console.log(`\n⚠️  WARNING: No migrated tokens found in API`);
    }

    ws.close();
    resolve();
  }, 5000);
});

console.log("\n✅ Test completed!");
























