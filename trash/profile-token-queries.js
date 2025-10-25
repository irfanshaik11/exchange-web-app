#!/usr/bin/env node

/**
 * Standalone Token Query Profiler
 * 
 * This script profiles the speed of token data queries used by the Pulse page.
 * It tests various endpoints and filters to measure performance.
 * 
 * Usage:
 *   node profile-token-queries.js
 *   node profile-token-queries.js --filter=new --limit=30
 *   node profile-token-queries.js --endpoint=pulse-new --verbose
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
  FILTERS: ['new', 'migrated', 'final-stretch', 'trending', 'marketcap'],
  LIMITS: [10, 30, 50, 100, 200],
  
  // Performance thresholds
  FAST_THRESHOLD: 500,    // ms
  SLOW_THRESHOLD: 2000,   // ms
  TIMEOUT: 10000,         // ms
};

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    filter: null,
    limit: null,
    endpoint: null,
    verbose: false,
    help: false
  };
  
  for (const arg of args) {
    if (arg.startsWith('--filter=')) {
      options.filter = arg.split('=')[1];
    } else if (arg.startsWith('--limit=')) {
      options.limit = parseInt(arg.split('=')[1]);
    } else if (arg.startsWith('--endpoint=')) {
      options.endpoint = arg.split('=')[1];
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

// Test specific endpoint
async function testEndpoint(endpoint, limit = 30) {
  const url = `${CONFIG.BACKEND_URL}${endpoint}?limit=${limit}`;
  
  try {
    const result = await makeRequest(url);
    
    return {
      success: result.status === 200,
      duration: result.duration,
      status: result.status,
      dataSize: result.size,
      itemCount: Array.isArray(result.data) ? result.data.length : 0,
      error: result.error,
      url: url,
      endpoint: endpoint
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
      endpoint: endpoint
    };
  }
}

// Test pulse endpoints
async function testPulseEndpoints() {
  const endpoints = [
    '/v1/pulse/new',
    '/v1/pulse/migrated', 
    '/v1/pulse/final-stretch'
  ];
  
  const results = [];
  
  for (const endpoint of endpoints) {
    console.log(`Testing ${endpoint}...`);
    
    // Test with different limits
    for (const limit of [10, 30, 50, 100]) {
      const result = await testEndpoint(endpoint, limit);
      results.push({
        ...result,
        limit
      });
    }
  }
  
  return results;
}

// Test launchpad endpoints
async function testLaunchpadEndpoints() {
  const endpoints = [
    '/v1/launchpad/tokens',
    '/v1/launchpad/stats'
  ];
  
  const results = [];
  
  for (const endpoint of endpoints) {
    console.log(`Testing ${endpoint}...`);
    
    const result = await testEndpoint(endpoint, 30);
    results.push(result);
  }
  
  return results;
}

// Test market data endpoints
async function testMarketDataEndpoints() {
  const endpoints = [
    '/v1/market-data',
    '/v1/tokens/dev'
  ];
  
  const results = [];
  
  for (const endpoint of endpoints) {
    console.log(`Testing ${endpoint}...`);
    
    const result = await testEndpoint(endpoint, 30);
    results.push(result);
  }
  
  return results;
}

// Run comprehensive token tests
async function runTokenTests(options) {
  console.log('🚀 Starting Token Query Performance Tests\n');
  console.log(`Backend URL: ${CONFIG.BACKEND_URL}`);
  console.log(`Test Parameters:`);
  console.log(`  Filter: ${options.filter || 'All filters'}`);
  console.log(`  Limit: ${options.limit || 'Multiple limits'}`);
  console.log(`  Endpoint: ${options.endpoint || 'All endpoints'}\n`);
  
  const results = [];
  
  // Test pulse endpoints
  if (!options.endpoint || options.endpoint === 'pulse') {
    console.log('📊 Testing Pulse Endpoints...');
    const pulseResults = await testPulseEndpoints();
    results.push(...pulseResults);
  }
  
  // Test launchpad endpoints
  if (!options.endpoint || options.endpoint === 'launchpad') {
    console.log('🚀 Testing Launchpad Endpoints...');
    const launchpadResults = await testLaunchpadEndpoints();
    results.push(...launchpadResults);
  }
  
  // Test market data endpoints
  if (!options.endpoint || options.endpoint === 'market') {
    console.log('📈 Testing Market Data Endpoints...');
    const marketResults = await testMarketDataEndpoints();
    results.push(...marketResults);
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
        console.log(`  ${r.endpoint} (limit=${r.limit || 'N/A'}): ${r.duration}ms (${r.itemCount} items)`);
      });
      console.log('');
    }
    
    // Show fastest queries
    if (fast.length > 0) {
      console.log('🚀 Fastest queries:');
      fast.sort((a, b) => a.duration - b.duration).slice(0, 5).forEach(r => {
        console.log(`  ${r.endpoint} (limit=${r.limit || 'N/A'}): ${r.duration}ms (${r.itemCount} items)`);
      });
      console.log('');
    }
    
    // Analyze by endpoint
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
    
    // Analyze by limit
    const limitStats = {};
    successful.forEach(r => {
      if (r.limit) {
        if (!limitStats[r.limit]) {
          limitStats[r.limit] = { total: 0, count: 0 };
        }
        limitStats[r.limit].total += r.duration;
        limitStats[r.limit].count += 1;
      }
    });
    
    if (Object.keys(limitStats).length > 0) {
      console.log('📊 Performance by Limit:');
      Object.entries(limitStats).forEach(([limit, stats]) => {
        const avgDuration = stats.total / stats.count;
        console.log(`  Limit ${limit}: ${avgDuration.toFixed(0)}ms avg`);
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
  console.log('  • Use appropriate limits for your use case');
  console.log('  • Consider caching for frequently accessed data');
  console.log('  • Monitor database query performance');
  console.log('  • Use pagination for large datasets');
  console.log('  • Consider data preloading for critical endpoints');
}

// Main execution
async function main() {
  const options = parseArgs();
  
  if (options.help) {
    console.log(`
Token Query Performance Profiler

Usage:
  node profile-token-queries.js [options]

Options:
  --filter=<filter>       Test specific filter (new, migrated, final-stretch, trending, marketcap)
  --limit=<number>        Test specific limit
  --endpoint=<type>       Test specific endpoint type (pulse, launchpad, market)
  --verbose, -v           Show detailed output
  --help, -h              Show this help

Examples:
  node profile-token-queries.js
  node profile-token-queries.js --endpoint=pulse --verbose
  node profile-token-queries.js --filter=new --limit=30
  node profile-token-queries.js --endpoint=launchpad
    `);
    return;
  }
  
  try {
    const results = await runTokenTests(options);
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
  testEndpoint,
  runTokenTests,
  analyzeResults,
  CONFIG
};
