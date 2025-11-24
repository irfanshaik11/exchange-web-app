import WebSocket from 'ws';

console.log('🧪 Testing WebSocket for Migrated Tokens in Frontend...');

const ws = new WebSocket('ws://localhost:8080/v1/stream');

ws.on('open', () => {
  console.log('✅ Connected to WebSocket');
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());
    console.log(`📨 Message received:`);
    console.log(`   Type: ${message.type}`);
    
    if (message.type === 'migrated_token') {
      console.log(`   Token: ${message.data.name} (${message.data.symbol})`);
      console.log(`   Status: ${message.data.status}`);
      console.log(`   Bonding: ${message.data.bonding_pct}%`);
      console.log(`   Market Cap: $${message.data.market_cap_usd}`);
      console.log(`   Protocol: ${message.data.launchpad_protocol}`);
      console.log(`   Migrated Pool: ${message.data.migrated_pool_address || 'N/A'}`);
      console.log(`   Pair Address: ${message.data.pair_address || 'N/A'}`);
      console.log('   Full data:', JSON.stringify(message.data, null, 2));
    }
  } catch (error) {
    console.error('❌ Failed to parse message:', error);
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error);
});

ws.on('close', () => {
  console.log('🔌 WebSocket closed');
});

// Keep the connection open for 30 seconds
setTimeout(() => {
  console.log('⏰ Test completed');
  ws.close();
}, 30000);
