import WebSocket from "ws";

console.log("🧪 Testing WebSocket Hook Behavior...");

// Simulate the usePulseWebSocket hook behavior
let onMigratedTokenRef = null;

const setCallback = (callback) => {
  onMigratedTokenRef = callback;
  console.log("✅ Callback set:", typeof callback);
};

const processMessage = (message) => {
  console.log(`📨 Processing message: ${message.type}`);
  
  if (message.type === 'migrated_token' && message.data) {
    console.log('[usePulseWebSocket] ✅ Migrated token received:', message.data);
    
    // Call callback immediately for instant updates
    if (onMigratedTokenRef) {
      console.log('[usePulseWebSocket] Calling onMigratedToken callback');
      console.log('[usePulseWebSocket] Callback function:', typeof onMigratedTokenRef);
      onMigratedTokenRef(message.data);
      console.log('[usePulseWebSocket] onMigratedToken callback completed');
    } else {
      console.warn('[usePulseWebSocket] onMigratedTokenRef.current is null or undefined');
    }
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
    processMessage(message);
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

// Set up the callback
const onMigratedToken = (token) => {
  console.log(`[Frontend] 🔄 onMigratedToken called with:`, token.name);
  console.log(`[Frontend] 🔄 Token status:`, token.status);
  console.log(`[Frontend] 🔄 Token bonding_pct:`, token.bonding_pct);
};

setCallback(onMigratedToken);

// Run for 20 seconds
setTimeout(() => {
  console.log("\n📊 Test Results:");
  console.log("✅ WebSocket hook simulation completed");
  ws.close();
}, 20000);


























