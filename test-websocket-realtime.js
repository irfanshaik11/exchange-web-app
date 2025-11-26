import WebSocket from "ws";

console.log("🧪 Testing WebSocket for Real-time Migrated Token Events...");

const ws = new WebSocket("ws://localhost:8080/v1/stream");

let messageCount = 0;
let migratedTokenCount = 0;
let newTokenCount = 0;

ws.on("open", () => {
  console.log("✅ Connected to WebSocket");
  console.log("⏳ Listening for real-time events...");
});

ws.on("message", (data) => {
  try {
    const message = JSON.parse(data.toString());
    messageCount++;

    console.log(`📨 Message ${messageCount}: ${message.type}`);

    if (message.type === "new_token") {
      newTokenCount++;
      console.log(`🆕 New token: ${message.data.name}`);
    } else if (message.type === "migrated_token") {
      migratedTokenCount++;
      console.log(
        `🔄 Migrated token: ${message.data.name} (${message.data.status})`,
      );
      console.log(`   Bonding: ${message.data.bonding_pct}%`);
    } else if (message.type === "final_stretch_token") {
      console.log(`🏁 Final stretch token: ${message.data.name}`);
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

// Run for 30 seconds to catch real-time events
setTimeout(() => {
  console.log("\n📊 Test Results:");
  console.log(`📨 Total messages: ${messageCount}`);
  console.log(`🆕 New tokens: ${newTokenCount}`);
  console.log(`🔄 Migrated tokens: ${migratedTokenCount}`);

  if (migratedTokenCount > 0) {
    console.log("✅ SUCCESS: Real-time migrated token events are being sent!");
  } else {
    console.log("⚠️  WARNING: No real-time migrated token events received");
    console.log("   This could mean:");
    console.log("   1. No tokens are migrating in real-time");
    console.log("   2. WebSocket is not sending migrated_token events");
    console.log("   3. Backend filter is blocking migrated events");
  }

  ws.close();
}, 30000);
























