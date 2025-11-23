import WebSocket from "ws";

console.log("🧪 Testing Frontend WebSocket Processing...");

// Simulate the frontend state
let httpMigrated = [];
let httpMigratedTick = 0;

// Simulate the onMigratedToken callback
const onMigratedToken = (token) => {
  console.log(`[Frontend] 🔄 Migrated token callback called:`, token.name);
  console.log(`[Frontend] 🔄 Token status:`, token.status);
  console.log(`[Frontend] 🔄 Token bonding_pct:`, token.bonding_pct);

  // Simulate the frontend logic
  const normalizedToken = {
    ...token,
    pair_address: token.pair_address || token.migrated_pool_address,
    created_at: new Date().toISOString(),
    timestamp: Date.now(),
    logo: token.logo || token.image || null,
    uri: token.uri || null,
    image: token.image || token.logo || null,
  };

  // Add to MIGRATED column at the TOP
  const existingMints = new Set(httpMigrated.map((t) => t.mint));
  if (!existingMints.has(normalizedToken.mint)) {
    httpMigrated = [normalizedToken, ...httpMigrated];
    httpMigratedTick++;
    console.log(
      `[Frontend] ⚡ Added token to httpMigrated:`,
      normalizedToken.name,
    );
    console.log(
      `[Frontend] ⚡ Current httpMigrated count: ${httpMigrated.length}`,
    );
    console.log(`[Frontend] ⚡ httpMigratedTick: ${httpMigratedTick}`);
  } else {
    console.log(`[Frontend] ⚠️ Token already exists:`, normalizedToken.name);
  }
};

// Test WebSocket connection
const ws = new WebSocket("ws://localhost:8080/v1/stream");

ws.on("open", () => {
  console.log("✅ Connected to WebSocket");
});

ws.on("message", (data) => {
  try {
    const message = JSON.parse(data.toString());
    console.log(`📨 Message received: ${message.type}`);

    if (message.type === "migrated_token") {
      console.log(`🔄 Processing migrated token: ${message.data.name}`);
      onMigratedToken(message.data);
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

// Run for 20 seconds
setTimeout(() => {
  console.log("\n📊 Test Results:");
  console.log(`📨 httpMigrated count: ${httpMigrated.length}`);
  console.log(`📨 httpMigratedTick: ${httpMigratedTick}`);

  if (httpMigrated.length > 0) {
    console.log(
      `✅ SUCCESS: Frontend would display ${httpMigrated.length} migrated tokens`,
    );
    console.log(`📋 Tokens:`, httpMigrated.map((t) => t.name).join(", "));
  } else {
    console.log(`⚠️ WARNING: No migrated tokens processed`);
  }

  ws.close();
}, 20000);




















