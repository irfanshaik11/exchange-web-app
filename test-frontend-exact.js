import WebSocket from "ws";

console.log("🧪 Testing EXACT Frontend Behavior...");

// Simulate the exact frontend state
let httpMigrated = [];
let httpMigratedTick = 0;

// Simulate the exact onMigratedToken callback from the frontend
const onMigratedToken = (token) => {
  console.log(`[Pulse] 🔄 Migrated token transition: adding to top of Migrated section`);
  console.log(`[Pulse] 🔄 Received migrated token:`, token);
  console.log(`[Pulse] 🔄 Token status:`, token.status);
  console.log(`[Pulse] 🔄 Token bonding_pct:`, token.bonding_pct);
  console.log(`[Pulse] 🔄 CALLBACK CALLED - onMigratedToken is working!`);

  // CRITICAL: Normalize token - ensure pair_address is set and add current timestamp
  const normalizedToken = {
    ...token,
    pair_address: token.pair_address || token.migrated_pool_address,
    // Add current timestamp to ensure migrated tokens appear at top
    created_at: new Date().toISOString(),
    timestamp: Date.now(),
    // Add image fields for proper display
    logo: token.logo || token.image || null,
    uri: token.uri || null,
    image: token.image || token.logo || null
  };

  // Add to MIGRATED column at the TOP
  const existingMints = new Set(httpMigrated.map(t => t.mint));
  if (!existingMints.has(normalizedToken.mint)) {
    const merged = [normalizedToken, ...httpMigrated];
    console.log(`[Pulse] ⚡ INSTANT migrated token ADDED to httpMigrated:`, normalizedToken.mint, normalizedToken.name);
    console.log(`[Pulse] ⚡ Current httpMigrated count: ${httpMigrated.length}`);
    console.log(`[Pulse] ⚡ Current httpMigrated tokens:`, httpMigrated.map(t => ({ mint: t.mint, name: t.name, status: t.status })));
    console.log(`[Pulse] Updated httpMigrated count: ${merged.length}`);
    console.log(`[Pulse] ⚡ Added token to httpMigrated:`, normalizedToken.name, normalizedToken.symbol);
    console.log(`[Pulse] ⚡ New httpMigrated tokens:`, merged.map(t => ({ mint: t.mint, name: t.name, status: t.status })));
    
    httpMigrated = merged;
    httpMigratedTick++;
    console.log(`[Pulse] Incrementing httpMigratedTick: ${httpMigratedTick - 1} → ${httpMigratedTick}`);
  } else {
    console.log(`[Pulse] ⚠️ Token already exists in httpMigrated, skipping:`, normalizedToken.mint);
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

// Run for 30 seconds
setTimeout(() => {
  console.log("\n📊 Test Results:");
  console.log(`📨 httpMigrated count: ${httpMigrated.length}`);
  console.log(`📨 httpMigratedTick: ${httpMigratedTick}`);
  
  if (httpMigrated.length > 0) {
    console.log(`✅ SUCCESS: Frontend would display ${httpMigrated.length} migrated tokens`);
    console.log(`📋 Tokens:`, httpMigrated.map(t => t.name).join(", "));
  } else {
    console.log(`⚠️ WARNING: No migrated tokens processed`);
  }
  
  ws.close();
}, 15000);
