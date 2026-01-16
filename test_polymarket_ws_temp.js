const WebSocket = require('ws');

const WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';
const SPAIN_YES_TOKEN = '4394372887385518214471608448209527405727552777602031099972143344338178308080';

console.log('Connecting to Polymarket WebSocket...');

const ws = new WebSocket(WS_URL);
let messageCount = 0;

ws.on('open', () => {
  console.log('✅ WebSocket connected!');
  
  const subscribeMsg = {
    type: 'market',
    assets_ids: [SPAIN_YES_TOKEN]
  };
  ws.send(JSON.stringify(subscribeMsg));
  console.log('📤 Subscribed to Spain YES token');
});

ws.on('message', (data) => {
  messageCount++;
  const parsed = JSON.parse(data.toString());
  const messages = Array.isArray(parsed) ? parsed : [parsed];
  
  for (const msg of messages) {
    if (msg.event_type === 'book') {
      console.log('\n📊 Order Book Update:');
      console.log('  Bids:', msg.bids?.length || 0, 'levels');
      console.log('  Asks:', msg.asks?.length || 0, 'levels');
      if (msg.bids?.length > 0) console.log('  Best Bid:', msg.bids[msg.bids.length - 1]);
      if (msg.asks?.length > 0) console.log('  Best Ask:', msg.asks[msg.asks.length - 1]);
    } else if (msg.event_type === 'price_change') {
      console.log('\n💰 Price Change:');
      for (const change of (msg.price_changes || [])) {
        console.log('  Price:', change.price, '| Bid:', change.best_bid, '| Ask:', change.best_ask);
      }
    } else {
      console.log('\n📨 Message:', msg.event_type || msg.type || JSON.stringify(msg).slice(0, 100));
    }
  }
  
  if (messageCount >= 5) {
    console.log('\n✅ Test complete!');
    ws.close();
    process.exit(0);
  }
});

ws.on('error', (err) => console.error('❌ Error:', err.message));
ws.on('close', () => console.log('Closed'));

setTimeout(() => { console.log('\n⏱️ Timeout'); ws.close(); process.exit(0); }, 15000);
