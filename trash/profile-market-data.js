#!/usr/bin/env node

/**
 * Standalone Market Data Query Profiler
 * 
 * This script profiles the speed of market data queries used by the real-time components.
 * It tests WebSocket connections, market data endpoints, and real-time updates.
 * 
 * Usage:
 *   node profile-market-data.js
 *   node profile-market-data.js --mints=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v,So11111111111111111111111111111111111111112
 *   node profile-market-data.js --endpoint=market-data --verbose
 */

const https = require('https');
const http = require('http');
const WebSocket = require('ws');
const { URL } = require('url');

// Configuration
const CONFIG = {
  // Backend URL - update this to match your environment
  BACKEND_URL: process.env.NEXT_PUBLIC_GO_SERVICE_URL || 'http://localhost:8080',
  WEBSOCKET_URL: process.env.NEXT_PUBLIC_WEBSOCKET_URL || 'ws://localhost:8080',
  API_KEY: process.env.NEXT_PUBLIC_BACKEND_API_KEY || 'test-key',
  
  // Test parameters
  DEFAULT_MINTS: [
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
    'So11111111111111111111111111111111111111112', // SOL
    'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', // Bonk
  ],
  
  // Performance thresholds
  FAST_THRESHOLD: 500,    // ms
  SLOW_THRESHOLD: 2000,   // ms
  TIMEOUT: 10000,         // ms
  WS_TIMEOUT: 5000,       // ms
};

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    mints: null,
    endpoint: null,
    testWebSocket: true,
    testHttp: true,
    verbose: false,
    help: false
  };
  
  for (const arg of args) {
    if (arg.startsWith('--mints=')) {
      options.mints = arg.split('=')[1].split(',');
    } else if (arg.startsWith('--endpoint=')) {
      options.endpoint = arg.split('=')[1];
    } else if (arg === '--no-websocket') {
      options.testWebSocket = false;
    } else if (arg === '--no-http') {
      options.testHttp = false;
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    }
  }
  
  return options;
}

// Make HTTP request with timing
async function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'accept': 'application/json',
        'Content-Type': 'application/json',
        'X-API-Key': CONFIG.API_KEY,
        ...options.headers
      },
      timeout: CONFIG.TIMEOUT
    };
    
    const req = client.request(requestOptions, (res) => {
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({
            status: res.statusCode,
            duration,
            data: jsonData,
            size: data.length,
            headers: res.headers
          });
        } catch (error) {
          resolve({
            status: res.statusCode,
            duration,
            data: data,
            size: data.length,
            error: 'Invalid JSON response',
            headers: res.headers
          });
        }
      });
    });
    
    req.on('error', (error) => {
      const endTime = Date.now();
      const duration = endTime - startTime;
      reject({
        error: error.message,
        duration,
        url
      });
    });
    
    req.on('timeout', () => {
      const endTime = Date.now();
      const duration = endTime - startTime;
      req.destroy();
      reject({
        error: 'Request timeout',
        duration,
        url
      });
    });
    
    if (options.body) {
      req.write(options.body);
    }
    
    req.end();
  });
}

// Test market data endpoint
async function testMarketDataEndpoint(mints) {
  const url = `${CONFIG.BACKEND_URL}/v1/market-data`;
  const body = JSON.stringify({ mints });
  
  try {
    const result = await makeRequest(url, {
      method: 'POST',
      body
    });
    
    return {
      success: result.status === 200,
      duration: result.duration,
      status: result.status,
      dataSize: result.size,
      itemCount: Object.keys(result.data || {}).length,
      error: result.error,
      url: url,
      endpoint: 'market-data'
    };
  } catch (error) {
    return {
      success: false,
      duration: error.duration || 0,
      status: 0,
      dataSize: 0,
      itemCount: 0,
      error: error.error || error.message || 'Unknown error',
      url: url,
      endpoint: 'market-data'
    };
  }
}

// Test individual token market data
async function testTokenMarketData(mint) {
  const url = `${CONFIG.BACKEND_URL}/v1/tokens/${mint}/market-data`;
  
  try {
    const result = await makeRequest(url);
    
    return {
      success: result.status === 200,
      duration: result.duration,
      status: result.status,
      dataSize: result.size,
      itemCount: 1,
      error: result.error,
      url: url,
      endpoint: 'token-market-data',
      mint
    };
  } catch (error) {
    return {
      success: false,
      duration: error.duration || 0,
      status: 0,
      dataSize: 0,
      itemCount: 0,
      error: error.error || error.message || 'Unknown error',
      url: url,
      endpoint: 'token-market-data',
      mint
    };
  }
}

// Test WebSocket connection
async function testWebSocketConnection(mints) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const wsUrl = `${CONFIG.WEBSOCKET_URL}/v1/ws/market-data`;
    
    const ws = new WebSocket(wsUrl);
    let connected = false;
    let messageCount = 0;
    let lastMessageTime = 0;
    
    const timeout = setTimeout(() => {
      if (!connected) {
        ws.close();
        resolve({
          success: false,
          duration: Date.now() - startTime,
          error: 'WebSocket connection timeout',
          endpoint: 'websocket',
          messageCount: 0
        });
      }
    }, CONFIG.WS_TIMEOUT);
    
    ws.on('open', () => {
      connected = true;
      clearTimeout(timeout);
      
      // Send subscription message
      ws.send(JSON.stringify({ 
        type: 'subscribe',
        mints: mints 
      }));
      
      // Set up message timeout
      const messageTimeout = setTimeout(() => {
        ws.close();
        resolve({
          success: true,
          duration: Date.now() - startTime,
          endpoint: 'websocket',
          messageCount,
          lastMessageTime: lastMessageTime - startTime
        });
      }, CONFIG.WS_TIMEOUT);
      
      ws.on('message', (data) => {
        messageCount++;
        lastMessageTime = Date.now();
        
        if (messageCount >= 3) { // Get a few messages then close
          clearTimeout(messageTimeout);
          ws.close();
          resolve({
            success: true,
            duration: Date.now() - startTime,
            endpoint: 'websocket',
            messageCount,
            lastMessageTime: lastMessageTime - startTime
          });
        }
      });
    });
    
    ws.on('error', (error) => {
      clearTimeout(timeout);
      resolve({
        success: false,
        duration: Date.now() - startTime,
        error: error.message,
        endpoint: 'websocket',
        messageCount: 0
      });
    });
    
    ws.on('close', () => {
      if (connected && messageCount > 0) {
        resolve({
          success: true,
          duration: Date.now() - startTime,
          endpoint: 'websocket',
          messageCount,
          lastMessageTime: lastMessageTime - startTime
        });
      }
    });
  });
}

// Test HTTP market data endpoints
async function testHttpEndpoints(mints) {
  const results = [];
  
  console.log('📊 Testing Market Data Endpoint...');
  const marketDataResult = await testMarketDataEndpoint(mints);
  results.push(marketDataResult);
  
  console.log('📈 Testing Individual Token Market Data...');
  for (const mint of mints.slice(0, 3)) { // Test first 3 tokens
    const tokenResult = await testTokenMarketData(mint);
    results.push(tokenResult);
  }
  
  return results;
}

// Test WebSocket market data
async function testWebSocketEndpoints(mints) {
  const results = [];
  
  console.log('🔌 Testing WebSocket Connection...');
  const wsResult = await testWebSocketConnection(mints);
  results.push(wsResult);
  
  return results;
}

// Run comprehensive market data tests
async function runMarketDataTests(options) {
  console.log('🚀 Starting Market Data Query Performance Tests\n');
  console.log(`Backend URL: ${CONFIG.BACKEND_URL}`);
  console.log(`WebSocket URL: ${CONFIG.WEBSOCKET_URL}`);
  console.log(`Test Parameters:`);
  console.log(`  Mints: ${options.mints ? options.mints.join(', ') : 'Default tokens'}`);
  console.log(`  HTTP Tests: ${options.testHttp ? 'Yes' : 'No'}`);
  console.log(`  WebSocket Tests: ${options.testWebSocket ? 'Yes' : 'No'}\n`);
  
  const results = [];
  const mints = options.mints || CONFIG.DEFAULT_MINTS;
  
  // Test HTTP endpoints
  if (options.testHttp) {
    console.log('🌐 Testing HTTP Endpoints...');
    const httpResults = await testHttpEndpoints(mints);
    results.push(...httpResults);
  }
  
  // Test WebSocket endpoints
  if (options.testWebSocket) {
    console.log('🔌 Testing WebSocket Endpoints...');
    const wsResults = await testWebSocketEndpoints(mints);
    results.push(...wsResults);
  }
  
  return results;
}

// Analyze results
function analyzeResults(results) {
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log('\n📊 Performance Analysis\n');
  
  if (successful.length > 0) {
    const durations = successful.map(r => r.duration);
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    const minDuration = Math.min(...durations);
    const maxDuration = Math.max(...durations);
    
    const fast = successful.filter(r => r.duration < CONFIG.FAST_THRESHOLD);
    const slow = successful.filter(r => r.duration > CONFIG.SLOW_THRESHOLD);
    
    console.log(`✅ Successful queries: ${successful.length}/${results.length}`);
    console.log(`⏱️  Average response time: ${avgDuration.toFixed(2)}ms`);
    console.log(`⚡ Fastest response: ${minDuration}ms`);
    console.log(`🐌 Slowest response: ${maxDuration}ms`);
    console.log(`🚀 Fast queries (<${CONFIG.FAST_THRESHOLD}ms): ${fast.length}`);
    console.log(`🐌 Slow queries (>${CONFIG.SLOW_THRESHOLD}ms): ${slow.length}\n`);
    
    // Show slowest queries
    if (slow.length > 0) {
      console.log('🐌 Slowest queries:');
      slow.sort((a, b) => b.duration - a.duration).slice(0, 5).forEach(r => {
        console.log(`  ${r.endpoint}${r.mint ? ` (${r.mint})` : ''}: ${r.duration}ms (${r.itemCount} items)`);
      });
      console.log('');
    }
    
    // Show fastest queries
    if (fast.length > 0) {
      console.log('🚀 Fastest queries:');
      fast.sort((a, b) => a.duration - b.duration).slice(0, 5).forEach(r => {
        console.log(`  ${r.endpoint}${r.mint ? ` (${r.mint})` : ''}: ${r.duration}ms (${r.itemCount} items)`);
      });
      console.log('');
    }
    
    // Analyze by endpoint type
    const endpointStats = {};
    successful.forEach(r => {
      if (!endpointStats[r.endpoint]) {
        endpointStats[r.endpoint] = { total: 0, count: 0, items: 0 };
      }
      endpointStats[r.endpoint].total += r.duration;
      endpointStats[r.endpoint].count += 1;
      endpointStats[r.endpoint].items += r.itemCount;
    });
    
    console.log('📈 Endpoint Performance:');
    Object.entries(endpointStats).forEach(([endpoint, stats]) => {
      const avgDuration = stats.total / stats.count;
      const avgItems = stats.items / stats.count;
      console.log(`  ${endpoint}: ${avgDuration.toFixed(0)}ms avg (${avgItems.toFixed(0)} items avg)`);
    });
    console.log('');
    
    // WebSocket specific analysis
    const wsResults = successful.filter(r => r.endpoint === 'websocket');
    if (wsResults.length > 0) {
      console.log('🔌 WebSocket Performance:');
      wsResults.forEach(r => {
        console.log(`  Connection: ${r.duration}ms`);
        console.log(`  Messages received: ${r.messageCount}`);
        if (r.lastMessageTime) {
          console.log(`  First message: ${r.lastMessageTime}ms`);
        }
      });
      console.log('');
    }
  }
  
  if (failed.length > 0) {
    console.log(`❌ Failed queries: ${failed.length}`);
    const errorCounts = {};
    failed.forEach(r => {
      errorCounts[r.error] = (errorCounts[r.error] || 0) + 1;
    });
    
    console.log('Error breakdown:');
    Object.entries(errorCounts).forEach(([error, count]) => {
      console.log(`  ${error}: ${count} times`);
    });
    console.log('');
  }
  
  // Performance recommendations
  console.log('💡 Performance Recommendations:');
  
  if (successful.length > 0) {
    const avgDuration = successful.reduce((sum, r) => sum + r.duration, 0) / successful.length;
    
    if (avgDuration < CONFIG.FAST_THRESHOLD) {
      console.log('  ✅ Overall performance is excellent!');
    } else if (avgDuration < CONFIG.SLOW_THRESHOLD) {
      console.log('  ⚠️  Performance is acceptable but could be improved');
    } else {
      console.log('  🚨 Performance needs attention - consider optimization');
    }
  }
  
  console.log('\n🔧 Optimization Tips:');
  console.log('  • Use WebSocket for real-time updates when possible');
  console.log('  • Batch multiple token requests together');
  console.log('  • Consider caching for frequently accessed data');
  console.log('  • Monitor WebSocket connection stability');
  console.log('  • Use appropriate update frequencies');
  console.log('  • Consider data compression for large datasets');
}

// Main execution
async function main() {
  const options = parseArgs();
  
  if (options.help) {
    console.log(`
Market Data Query Performance Profiler

Usage:
  node profile-market-data.js [options]

Options:
  --mints=<list>          Comma-separated list of mint addresses to test
  --endpoint=<type>       Test specific endpoint type (http, websocket, all)
  --no-websocket         Skip WebSocket tests
  --no-http              Skip HTTP tests
  --verbose, -v          Show detailed output
  --help, -h             Show this help

Examples:
  node profile-market-data.js
  node profile-market-data.js --mints=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v,So11111111111111111111111111111111111111112
  node profile-market-data.js --no-websocket --verbose
  node profile-market-data.js --endpoint=http
    `);
    return;
  }
  
  try {
    const results = await runMarketDataTests(options);
    analyzeResults(results);
  } catch (error) {
    console.error('❌ Profiling failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  testMarketDataEndpoint,
  testWebSocketConnection,
  runMarketDataTests,
  analyzeResults,
  CONFIG
};
