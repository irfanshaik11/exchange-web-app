const WebSocket = require('ws');

const ws = new WebSocket('wss://token-stage.narrative.trade/v1/stream?channel=new');

ws.on('open', () => console.log('Connected'));

ws.on('message', (data) => {
  const messages = data.toString().split('\n').filter(m => m.trim());
  for (const msgStr of messages) {
    try {
      const msg = JSON.parse(msgStr);
      if (msg.type === 'price_update') {
        console.log('\n📊 price_update fields:', Object.keys(msg.data).sort().join(', '));
        console.log('Sample values:', JSON.stringify(msg.data, null, 2));
        ws.close();
        process.exit(0);
      }
    } catch (e) {}
  }
});

setTimeout(() => { console.log('Timeout'); process.exit(1); }, 10000);
