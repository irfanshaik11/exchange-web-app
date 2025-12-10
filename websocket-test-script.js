#!/usr/bin/env node

/**
 * WebSocket Test Script for Pulse Page
 * This script tests the websocket connection and verifies data flow
 */

import WebSocket from "ws";

console.log("🧪 Testing WebSocket Connection for Pulse Page...\n");

const ws = new WebSocket("ws://localhost:8080/v1/stream");
let messageCount = 0;
let startTime = Date.now();

ws.on("open", () => {
  console.log("✅ WebSocket connected successfully");
  console.log("📡 Listening for token data...\n");
});

ws.on("message", (data) => {
  messageCount++;
  const message = JSON.parse(data.toString());

  console.log(`📨 Message ${messageCount}:`);
  console.log(`   Type: ${message.type}`);
  console.log(
    `   Token: ${message.data?.name || "Unknown"} (${message.data?.symbol || "N/A"})`,
  );
  console.log(`   Mint: ${message.data?.mint?.substring(0, 8)}...`);
  console.log(`   Status: ${message.data?.status || "N/A"}`);
  console.log(`   Image fields:`);
  console.log(`     logo: ${message.data?.logo || "none"}`);
  console.log(`     image: ${message.data?.image || "none"}`);
  console.log(`     uri: ${message.data?.uri || "none"}`);
  console.log(`   Full data:`, JSON.stringify(message.data, null, 2));
  console.log("");

  if (messageCount >= 5) {
    const duration = Date.now() - startTime;
    console.log("✅ Test completed successfully!");
    console.log(`📊 Received ${messageCount} messages in ${duration}ms`);
    console.log("🔌 Closing connection...");
    ws.close();
  }
});

ws.on("error", (err) => {
  console.error("❌ WebSocket error:", err.message);
  process.exit(1);
});

ws.on("close", () => {
  console.log("🔌 WebSocket connection closed");
  process.exit(0);
});

// Timeout after 15 seconds
setTimeout(() => {
  console.log("⏰ Test timeout - closing connection");
  ws.close();
}, 15000);
