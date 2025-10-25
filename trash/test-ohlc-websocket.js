import WebSocket from 'ws';

const pairAddress = 'C7QuhpPVQ3KFchBYg26e44STcqrHKXSxQbvqJrRwMBbS';
const timeframe = '1m';

const wsUrl = `ws://34.47.209.237:8080/v1/trade/ohlc?pair_address=${pairAddress}&timeframe=${timeframe}`;

console.log(`Connecting to OHLC WebSocket: ${wsUrl}`);

const ws = new WebSocket(wsUrl);

ws.on('open', function() {
  console.log('✅ OHLC WebSocket connected successfully!');
  console.log(`Pair: ${pairAddress}`);
  console.log(`Timeframe: ${timeframe}`);
  console.log('Waiting for data...\n');
});

ws.on('message', function(data) {
  try {
    const message = JSON.parse(data.toString());
    console.log('📊 OHLC Data received:');
    console.log(JSON.stringify(message, null, 2));
    console.log('---\n');
  } catch (error) {
    console.error('❌ Error parsing message:', error);
    console.log('Raw data:', data.toString());
  }
});

ws.on('error', function(error) {
  console.error('❌ WebSocket error:', error);
});

ws.on('close', function(code, reason) {
  console.log(`🔌 WebSocket closed. Code: ${code}, Reason: ${reason}`);
});

// Keep the script running
console.log('Press Ctrl+C to exit...');
