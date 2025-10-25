#!/usr/bin/env node

/**
 * Standalone OHLC Query Profiler
 * 
 * This script profiles the speed of OHLC data queries used by the BackendOHLCChart component.
 * It tests various intervals, timeframes, and optimization settings to measure performance.
 * 
 * Usage:
 *   node profile-ohlc-queries.js
 *   node profile-ohlc-queries.js --mint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
 *   node profile-ohlc-queries.js --pair=So11111111111111111111111111111111111111112
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

// Configuration
const CONFIG = {
  // Backend URL - update this to match your environment
  BACKEND_URL: process.env.NEXT_PUBLIC_GO_SERVICE_URL || 'http://localhost:8080',
  API_KEY: process.env.NEXT_PUBLIC_BACKEND_API_KEY || 'test-key',
  
  // Test parameters
  INTERVALS: ['1s', '5s', '15s', '30s', '1m', '5m', '15m', '1h', '4h', '1d', '7d'],
  TIMEFRAMES: ['1h', '4h', '24h', '7d', '30d', '90d', '180d', '365d'],
  
  // Test tokens (you can override with command line args)
  DEFAULT_MINT: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  DEFAULT_PAIR: 'So11111111111111111111111111111111111111112', // SOL
  
  // Performance thresholds
  FAST_THRESHOLD: 500,    // ms
  SLOW_THRESHOLD: 2000,   // ms
  TIMEOUT: 10000,         // ms
};

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    mint: null,
    pair: null,
    interval: null,
    timeframe: null,
    optimize: false,
    verbose: false,
    help: false
  };
  
  for (const arg of args) {
    if (arg.startsWith('--mint=')) {
      options.mint = arg.split('=')[1];
    } else if (arg.startsWith('--pair=')) {
      options.pair = arg.split('=')[1];
    } else if (arg.startsWith('--interval=')) {
      options.interval = arg.split('=')[1];
    } else if (arg.startsWith('--timeframe=')) {
      options.timeframe = arg.split('=')[1];
    } else if (arg === '--optimize') {
      options.optimize = true;
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
      method: 'GET',
      headers: {
        'accept': 'application/json',
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
    
    req.end();
  });
}

// Build OHLC URL
function buildOHLCUrl(mint, pairAddress, interval, timeframe, optimize) {
  const url = new URL(`${CONFIG.BACKEND_URL}/v1/trade/ohlc-data`);
  
  if (mint) url.searchParams.set('mint', mint);
  if (pairAddress) url.searchParams.set('pair_address', pairAddress);
  url.searchParams.set('interval', interval);
  url.searchParams.set('timeframe', timeframe);
  if (optimize) url.searchParams.set('optimize', 'true');
  
  return url.toString();
}

// Test single OHLC query
async function testOHLCQuery(mint, pairAddress, interval, timeframe, optimize = false) {
  const url = buildOHLCUrl(mint, pairAddress, interval, timeframe, optimize);
  
  try {
    const result = await makeRequest(url);
    
    return {
      success: result.status === 200,
      duration: result.duration,
      status: result.status,
      dataSize: result.size,
      itemCount: Array.isArray(result.data?.data?.items) ? result.data.data.items.length : 0,
      error: result.error,
      url: url
    };
  } catch (error) {
    return {
      success: false,
      duration: error.duration || 0,
      status: 0,
      dataSize: 0,
      itemCount: 0,
      error: error.error || error.message || 'Unknown error',
      url: url
    };
  }
}

// Run comprehensive OHLC tests
async function runOHLCTests(options) {
  console.log('🚀 Starting OHLC Query Performance Tests\n');
  console.log(`Backend URL: ${CONFIG.BACKEND_URL}`);
  console.log(`Test Parameters:`);
  console.log(`  Mint: ${options.mint || 'Not specified'}`);
  console.log(`  Pair: ${options.pair || 'Not specified'}`);
  console.log(`  Interval: ${options.interval || 'All intervals'}`);
  console.log(`  Timeframe: ${options.timeframe || 'All timeframes'}`);
  console.log(`  Optimize: ${options.optimize ? 'Yes' : 'No'}\n`);
  
  const results = [];
  const intervals = options.interval ? [options.interval] : CONFIG.INTERVALS;
  const timeframes = options.timeframe ? [options.timeframe] : CONFIG.TIMEFRAMES;
  
  // Test each combination
  for (const interval of intervals) {
    for (const timeframe of timeframes) {
      console.log(`Testing ${interval}/${timeframe}...`);
      
      const result = await testOHLCQuery(
        options.mint || CONFIG.DEFAULT_MINT,
        options.pair || CONFIG.DEFAULT_PAIR,
        interval,
        timeframe,
        options.optimize
      );
      
      results.push({
        interval,
        timeframe,
        ...result
      });
      
      if (options.verbose) {
        console.log(`  ${result.success ? '✅' : '❌'} ${result.duration}ms (${result.itemCount} items, ${result.dataSize} bytes)`);
        if (result.error) {
          console.log(`    Error: ${result.error}`);
        }
      }
    }
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
        console.log(`  ${r.interval}/${r.timeframe}: ${r.duration}ms (${r.itemCount} items)`);
      });
      console.log('');
    }
    
    // Show fastest queries
    if (fast.length > 0) {
      console.log('🚀 Fastest queries:');
      fast.sort((a, b) => a.duration - b.duration).slice(0, 5).forEach(r => {
        console.log(`  ${r.interval}/${r.timeframe}: ${r.duration}ms (${r.itemCount} items)`);
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
    
    // Check for patterns
    const intervalPerformance = {};
    const timeframePerformance = {};
    
    successful.forEach(r => {
      if (!intervalPerformance[r.interval]) {
        intervalPerformance[r.interval] = { total: 0, count: 0 };
      }
      intervalPerformance[r.interval].total += r.duration;
      intervalPerformance[r.interval].count += 1;
      
      if (!timeframePerformance[r.timeframe]) {
        timeframePerformance[r.timeframe] = { total: 0, count: 0 };
      }
      timeframePerformance[r.timeframe].total += r.duration;
      timeframePerformance[r.timeframe].count += 1;
    });
    
    // Find slowest intervals
    const slowestIntervals = Object.entries(intervalPerformance)
      .map(([interval, stats]) => ({ interval, avg: stats.total / stats.count }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 3);
    
    if (slowestIntervals.length > 0) {
      console.log(`  📈 Slowest intervals: ${slowestIntervals.map(s => `${s.interval} (${s.avg.toFixed(0)}ms)`).join(', ')}`);
    }
    
    // Find slowest timeframes
    const slowestTimeframes = Object.entries(timeframePerformance)
      .map(([timeframe, stats]) => ({ timeframe, avg: stats.total / stats.count }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 3);
    
    if (slowestTimeframes.length > 0) {
      console.log(`  📅 Slowest timeframes: ${slowestTimeframes.map(s => `${s.timeframe} (${s.avg.toFixed(0)}ms)`).join(', ')}`);
    }
  }
  
  console.log('\n🔧 Optimization Tips:');
  console.log('  • Use optimize=true for large datasets');
  console.log('  • Consider caching for frequently accessed data');
  console.log('  • Monitor database query performance');
  console.log('  • Use appropriate intervals for your use case');
  console.log('  • Consider data pagination for very large datasets');
}

// Main execution
async function main() {
  const options = parseArgs();
  
  if (options.help) {
    console.log(`
OHLC Query Performance Profiler

Usage:
  node profile-ohlc-queries.js [options]

Options:
  --mint=<address>        Test with specific mint address
  --pair=<address>        Test with specific pair address  
  --interval=<interval>   Test specific interval (1s, 5s, 15s, 30s, 1m, 5m, 15m, 1h, 4h, 1d, 7d)
  --timeframe=<timeframe> Test specific timeframe (1h, 4h, 24h, 7d, 30d, 90d, 180d, 365d)
  --optimize              Enable optimization flag
  --verbose, -v           Show detailed output
  --help, -h              Show this help

Examples:
  node profile-ohlc-queries.js
  node profile-ohlc-queries.js --mint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
  node profile-ohlc-queries.js --interval=1m --timeframe=24h --optimize
  node profile-ohlc-queries.js --verbose
    `);
    return;
  }
  
  try {
    const results = await runOHLCTests(options);
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
  testOHLCQuery,
  runOHLCTests,
  analyzeResults,
  CONFIG
};
