#!/usr/bin/env node

/**
 * Comprehensive Query Performance Profiler
 * 
 * This script runs all performance tests in sequence to provide a complete
 * overview of query performance across the entire application.
 * 
 * Usage:
 *   node profile-all-queries.js
 *   node profile-all-queries.js --quick
 *   node profile-all-queries.js --verbose
 */

const { spawn } = require('child_process');
const path = require('path');

// Configuration
const CONFIG = {
  SCRIPTS: [
    {
      name: 'OHLC Queries',
      script: 'profile-ohlc-queries.js',
      args: ['--interval=1m', '--timeframe=24h']
    },
    {
      name: 'Token Queries', 
      script: 'profile-token-queries.js',
      args: ['--endpoint=pulse']
    },
    {
      name: 'Market Data Queries',
      script: 'profile-market-data.js', 
      args: ['--no-websocket'] // Skip WebSocket for faster testing
    }
  ],
  
  QUICK_SCRIPTS: [
    {
      name: 'OHLC Queries (Quick)',
      script: 'profile-ohlc-queries.js',
      args: ['--interval=1m', '--timeframe=1h']
    },
    {
      name: 'Token Queries (Quick)',
      script: 'profile-token-queries.js', 
      args: ['--endpoint=pulse', '--limit=10']
    }
  ]
};

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    quick: false,
    verbose: false,
    help: false
  };
  
  for (const arg of args) {
    if (arg === '--quick') {
      options.quick = true;
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    }
  }
  
  return options;
}

// Run a single profiling script
async function runScript(scriptConfig, verbose = false) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, scriptConfig.script);
    const args = scriptConfig.args || [];
    
    if (verbose) {
      console.log(`\n🔧 Running: node ${scriptConfig.script} ${args.join(' ')}`);
    }
    
    const child = spawn('node', [scriptPath, ...args], {
      stdio: verbose ? 'inherit' : 'pipe',
      cwd: __dirname
    });
    
    let stdout = '';
    let stderr = '';
    
    if (!verbose) {
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });
    }
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve({
          success: true,
          stdout,
          stderr,
          name: scriptConfig.name
        });
      } else {
        reject({
          success: false,
          stdout,
          stderr,
          name: scriptConfig.name,
          code
        });
      }
    });
    
    child.on('error', (error) => {
      reject({
        success: false,
        error: error.message,
        name: scriptConfig.name
      });
    });
  });
}

// Run all profiling scripts
async function runAllTests(options) {
  console.log('🚀 Starting Comprehensive Query Performance Tests\n');
  console.log(`Mode: ${options.quick ? 'Quick' : 'Full'}`);
  console.log(`Verbose: ${options.verbose ? 'Yes' : 'No'}\n`);
  
  const scripts = options.quick ? CONFIG.QUICK_SCRIPTS : CONFIG.SCRIPTS;
  const results = [];
  
  for (const scriptConfig of scripts) {
    console.log(`📊 Running ${scriptConfig.name}...`);
    
    try {
      const result = await runScript(scriptConfig, options.verbose);
      results.push(result);
      console.log(`✅ ${scriptConfig.name} completed successfully`);
    } catch (error) {
      console.log(`❌ ${scriptConfig.name} failed: ${error.error || error.message || 'Unknown error'}`);
      results.push({
        success: false,
        name: scriptConfig.name,
        error: error.error || error.message || 'Unknown error'
      });
    }
  }
  
  return results;
}

// Generate summary report
function generateSummaryReport(results) {
  console.log('\n📋 Performance Test Summary Report\n');
  console.log('=' * 50);
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`✅ Successful tests: ${successful.length}/${results.length}`);
  console.log(`❌ Failed tests: ${failed.length}/${results.length}\n`);
  
  if (successful.length > 0) {
    console.log('🎉 Successful Tests:');
    successful.forEach(result => {
      console.log(`  ✅ ${result.name}`);
    });
    console.log('');
  }
  
  if (failed.length > 0) {
    console.log('⚠️  Failed Tests:');
    failed.forEach(result => {
      console.log(`  ❌ ${result.name}: ${result.error}`);
    });
    console.log('');
  }
  
  // Performance recommendations based on results
  console.log('💡 Overall Performance Recommendations:\n');
  
  if (failed.length === 0) {
    console.log('  🎉 All tests passed! Your query performance is excellent.');
    console.log('  📈 Continue monitoring performance as your application scales.');
    console.log('  🔄 Consider setting up automated performance monitoring.');
  } else if (failed.length < results.length / 2) {
    console.log('  ⚠️  Some tests failed. Review the failed components:');
    failed.forEach(result => {
      console.log(`    • ${result.name}: ${result.error}`);
    });
    console.log('  🔧 Focus on optimizing the failing components first.');
  } else {
    console.log('  🚨 Multiple tests failed. This indicates significant performance issues:');
    console.log('  🔍 Investigate backend connectivity and configuration.');
    console.log('  📊 Check database performance and query optimization.');
    console.log('  🛠️  Consider infrastructure scaling or optimization.');
  }
  
  console.log('\n🔧 Next Steps:');
  console.log('  1. Review individual test results above');
  console.log('  2. Run specific tests with --verbose for detailed analysis');
  console.log('  3. Monitor performance in production');
  console.log('  4. Set up automated performance monitoring');
  console.log('  5. Consider implementing caching strategies');
  
  console.log('\n📚 Available Individual Tests:');
  console.log('  • node profile-ohlc-queries.js --help');
  console.log('  • node profile-token-queries.js --help');
  console.log('  • node profile-market-data.js --help');
}

// Main execution
async function main() {
  const options = parseArgs();
  
  if (options.help) {
    console.log(`
Comprehensive Query Performance Profiler

Usage:
  node profile-all-queries.js [options]

Options:
  --quick               Run quick tests only (faster, less comprehensive)
  --verbose, -v         Show detailed output from individual tests
  --help, -h            Show this help

Examples:
  node profile-all-queries.js
  node profile-all-queries.js --quick
  node profile-all-queries.js --verbose
  node profile-all-queries.js --quick --verbose

This script runs all performance tests in sequence:
  • OHLC Query Performance Tests
  • Token Query Performance Tests  
  • Market Data Query Performance Tests

For individual test options, run:
  node profile-ohlc-queries.js --help
  node profile-token-queries.js --help
  node profile-market-data.js --help
    `);
    return;
  }
  
  try {
    const results = await runAllTests(options);
    generateSummaryReport(results);
  } catch (error) {
    console.error('❌ Comprehensive profiling failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  runAllTests,
  generateSummaryReport,
  CONFIG
};
