import WebSocket from "ws";

console.log("🧪 Testing WebSocket for Rich Data...");

const ws = new WebSocket("ws://localhost:8080/v1/stream");
let messageCount = 0;

ws.onopen = () => {
  console.log("✅ Connected");
};

ws.onmessage = (event) => {
  messageCount++;
  const msg = JSON.parse(event.data);
  console.log(`📨 Message ${messageCount}:`);
  console.log(`   Type: ${msg.type}`);
  console.log(`   Token: ${msg.data.name} (${msg.data.symbol})`);
  console.log(`   Rich data fields:`);
  console.log(`     total_buy_volume_5m: ${msg.data.total_buy_volume_5m || 'N/A'}`);
  console.log(`     total_buyers_5m: ${msg.data.total_buyers_5m || 'N/A'}`);
  console.log(`     price_percent_change_5m: ${msg.data.price_percent_change_5m || 'N/A'}`);
  console.log(`     launch_time: ${msg.data.launch_time || 'N/A'}`);
  console.log(`     migrated_time: ${msg.data.migrated_time || 'N/A'}`);
  console.log(`     links: ${msg.data.links || 'N/A'}`);
  console.log(`     launchpad_protocol: ${msg.data.launchpad_protocol || 'N/A'}`);
  
  if (messageCount >= 3) {
    ws.close();
    console.log("✅ Test completed");
    process.exit(0);
  }
};

setTimeout(() => {
  console.log("⏰ Timeout");
  ws.close();
  process.exit(0);
}, 10000);




















