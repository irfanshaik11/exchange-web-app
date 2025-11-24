import WebSocket from "ws";

console.log("🧪 Testing Frontend Migrated Token Processing...");

const ws = new WebSocket("ws://localhost:8080/v1/stream");

// Simulate the frontend state
let httpMigrated = [];
let httpMigratedTick = 0;

// Simulate the onMigratedToken callback from the frontend
const onMigratedToken = (token) => {
  console.log(
    `[Frontend] 🔄 Migrated token transition: adding to top of Migrated section`,
  );
  console.log(`[Frontend] 🔄 Received migrated token:`, token);
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
      normalizedToken.symbol,
    );
    console.log(
      `[Frontend] ⚡ Current httpMigrated count: ${httpMigrated.length}`,
    );
    console.log(`[Frontend] ⚡ httpMigratedTick: ${httpMigratedTick}`);
  }
};

// Simulate the buildMigrated function
const buildMigrated = () => {
  console.log(
    `[Frontend] 🔧 buildMigrated called - httpMigrated length: ${httpMigrated.length}`,
  );
  console.log(
    `[Frontend] 🔧 buildMigrated httpMigrated tokens:`,
    httpMigrated.map((t) => ({ mint: t.mint, name: t.name, status: t.status })),
  );

  if (!Array.isArray(httpMigrated) || httpMigrated.length === 0) {
    console.log(`[Frontend] 🔧 buildMigrated returning empty array`);
    return [];
  }

  return httpMigrated;
};

ws.on("open", () => {
  console.log("✅ Connected to WebSocket");
});

ws.on("message", (data) => {
  try {
    const message = JSON.parse(data.toString());
    console.log(`📨 Message received:`, message.type);

    if (message.type === "migrated_token") {
      console.log(`🔄 Processing migrated token:`, message.data.name);
      onMigratedToken(message.data);

      // Test the buildMigrated function
      const migratedToShow = buildMigrated();
      console.log(
        `[Frontend] 🎯 Migrated UI Data - migratedToShow: ${migratedToShow.length}, httpMigrated: ${httpMigrated.length}, httpMigratedTick: ${httpMigratedTick}`,
      );

      if (migratedToShow.length > 0) {
        console.log(
          `[Frontend] 🎯 First migrated token in UI:`,
          migratedToShow[0]?.name || "none",
        );
      }
    }
  } catch (error) {
    console.error("Error parsing message:", error);
  }
});

ws.on("close", () => {
  console.log("🔌 WebSocket closed");
});

ws.on("error", (error) => {
  console.error("WebSocket error:", error);
});

// Close after 30 seconds
setTimeout(() => {
  console.log("⏰ Test completed");
  ws.close();
}, 30000);
