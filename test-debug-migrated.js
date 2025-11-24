import WebSocket from "ws";

console.log("🔍 DEBUGGING: Migrated Token Processing...");

// Test 1: Check if WebSocket is sending migrated_token events
console.log("\n📡 Test 1: WebSocket migrated_token events");
const ws = new WebSocket("ws://localhost:8080/v1/stream");

let messageCount = 0;
let migratedEvents = [];

ws.on("open", () => {
  console.log("✅ WebSocket connected");
});

ws.on("message", (data) => {
  try {
    const message = JSON.parse(data.toString());
    messageCount++;
    
    if (message.type === "migrated_token") {
      migratedEvents.push(message.data);
      console.log(`🔄 MIGRATED EVENT ${migratedEvents.length}:`, {
        name: message.data.name,
        status: message.data.status,
        bonding_pct: message.data.bonding_pct,
        mint: message.data.mint
      });
    }
  } catch (error) {
    console.error("❌ Error parsing message:", error);
  }
});

ws.on("error", (error) => {
  console.error("❌ WebSocket error:", error);
});

ws.on("close", () => {
  console.log("🔌 WebSocket closed");
});

// Test 2: Simulate the exact frontend logic
console.log("\n🧪 Test 2: Simulating frontend onMigratedToken callback");

const simulateFrontendCallback = (token) => {
  console.log(`[Frontend] 🔄 onMigratedToken called with:`, token.name);
  
  // Simulate the exact frontend logic
  const normalizedToken = {
    ...token,
    pair_address: token.pair_address || token.migrated_pool_address,
    created_at: new Date().toISOString(),
    timestamp: Date.now(),
    logo: token.logo || token.image || null,
    uri: token.uri || null,
    image: token.image || token.logo || null
  };
  
  console.log(`[Frontend] 🔄 Normalized token:`, {
    name: normalizedToken.name,
    mint: normalizedToken.mint,
    pair_address: normalizedToken.pair_address,
    timestamp: normalizedToken.timestamp
  });
  
  return normalizedToken;
};

// Test 3: Check if the issue is in the callback reference
console.log("\n🔧 Test 3: Callback reference test");

let callbackRef = null;
const setCallback = (callback) => {
  callbackRef = callback;
  console.log("✅ Callback set:", typeof callback);
};

const callCallback = (token) => {
  if (callbackRef) {
    console.log("✅ Calling callback with token:", token.name);
    callbackRef(token);
  } else {
    console.log("❌ Callback is null");
  }
};

// Set up the callback
setCallback(simulateFrontendCallback);

// Run for 20 seconds
setTimeout(() => {
  console.log("\n📊 DEBUG RESULTS:");
  console.log(`📨 Total messages: ${messageCount}`);
  console.log(`🔄 Migrated events: ${migratedEvents.length}`);
  
  if (migratedEvents.length > 0) {
    console.log("✅ WebSocket is sending migrated_token events");
    console.log("📋 Events received:", migratedEvents.map(e => e.name));
    
    // Test the callback with the first migrated event
    if (migratedEvents[0]) {
      console.log("\n🧪 Testing callback with first migrated event:");
      callCallback(migratedEvents[0]);
    }
  } else {
    console.log("❌ No migrated_token events received");
    console.log("   This means either:");
    console.log("   1. No tokens are migrating in real-time");
    console.log("   2. WebSocket is not sending migrated_token events");
    console.log("   3. Backend filter is blocking migrated events");
  }
  
  ws.close();
}, 20000);




















