#!/usr/bin/env node

/**
 * Twitter OAuth Configuration Checker
 * 
 * Run this script to verify your Twitter OAuth setup:
 * node scripts/check-twitter-config.js
 */

const fs = require('fs');
const path = require('path');

console.log('\n🐦 Twitter OAuth Configuration Checker\n');
console.log('=' .repeat(50));

// Check if .env.local exists
const envPath = path.join(process.cwd(), '.env.local');
if (!fs.existsSync(envPath)) {
  console.log('❌ .env.local file not found!');
  console.log('   Create .env.local in your project root with:');
  console.log('   X_CLIENT_ID=your_client_id');
  console.log('   X_CLIENT_SECRET=your_client_secret');
  console.log('   X_REDIRECT_URI=http://localhost:3000/api/twitter/callback');
  process.exit(1);
}

// Read .env.local
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    const value = match[2].trim();
    envVars[key] = value;
  }
});

let hasErrors = false;
let hasWarnings = false;

// Check X_CLIENT_ID
console.log('\n✓ Checking X_CLIENT_ID...');
if (!envVars.X_CLIENT_ID) {
  console.log('  ❌ NOT SET');
  hasErrors = true;
} else {
  console.log(`  ✅ SET (${envVars.X_CLIENT_ID.length} characters)`);
  console.log(`  Preview: ${envVars.X_CLIENT_ID.substring(0, 8)}...${envVars.X_CLIENT_ID.substring(envVars.X_CLIENT_ID.length - 4)}`);
  
  if (envVars.X_CLIENT_ID.length < 20) {
    console.log('  ⚠️  Warning: Client ID seems short (expected ~25+ characters)');
    hasWarnings = true;
  }
}

// Check X_CLIENT_SECRET
console.log('\n✓ Checking X_CLIENT_SECRET...');
if (!envVars.X_CLIENT_SECRET) {
  console.log('  ❌ NOT SET');
  hasErrors = true;
} else {
  console.log(`  ✅ SET (${envVars.X_CLIENT_SECRET.length} characters)`);
  console.log(`  Preview: ${envVars.X_CLIENT_SECRET.substring(0, 8)}...${envVars.X_CLIENT_SECRET.substring(envVars.X_CLIENT_SECRET.length - 4)}`);
  
  if (envVars.X_CLIENT_SECRET.length < 40) {
    console.log('  ⚠️  Warning: Client Secret seems short (expected ~50+ characters)');
    hasWarnings = true;
  }
}

// Check X_REDIRECT_URI
console.log('\n✓ Checking X_REDIRECT_URI...');
if (!envVars.X_REDIRECT_URI) {
  console.log('  ❌ NOT SET');
  hasErrors = true;
} else {
  console.log(`  ✅ SET: ${envVars.X_REDIRECT_URI}`);
  
  // Validate format
  if (!envVars.X_REDIRECT_URI.startsWith('http://') && !envVars.X_REDIRECT_URI.startsWith('https://')) {
    console.log('  ⚠️  Warning: Should start with http:// or https://');
    hasWarnings = true;
  }
  
  if (!envVars.X_REDIRECT_URI.includes('/api/twitter/callback')) {
    console.log('  ⚠️  Warning: Should end with /api/twitter/callback');
    hasWarnings = true;
  }
  
  if (envVars.X_REDIRECT_URI.includes('localhost') && !envVars.X_REDIRECT_URI.includes(':3000')) {
    console.log('  ℹ️  Note: Using localhost without port 3000. Make sure your dev server runs on the correct port.');
  }
}

// Summary
console.log('\n' + '='.repeat(50));
console.log('\n📋 Summary:\n');

if (hasErrors) {
  console.log('❌ Configuration INCOMPLETE - Fix the errors above');
  console.log('\n📝 Next Steps:');
  console.log('1. Go to https://developer.twitter.com/en/portal/dashboard');
  console.log('2. Select your app → Keys and tokens');
  console.log('3. Find "OAuth 2.0 Client ID and Client Secret"');
  console.log('4. Copy these values to your .env.local file');
  console.log('5. Run this script again to verify');
  process.exit(1);
} else if (hasWarnings) {
  console.log('⚠️  Configuration looks mostly correct, but check warnings above');
  console.log('\n📝 Next Steps:');
  console.log('1. Review the warnings above');
  console.log('2. Verify credentials are OAuth 2.0 (not OAuth 1.0a)');
  console.log('3. Restart your Next.js dev server');
  console.log('4. Check Twitter Developer Portal settings match exactly');
} else {
  console.log('✅ Configuration looks GOOD!');
  console.log('\n📝 Next Steps:');
  console.log('1. Restart your Next.js dev server (npm run dev)');
  console.log('2. Visit: http://localhost:3000/api/twitter/test-config');
  console.log('3. Verify Twitter Developer Portal settings:');
  console.log(`   • Callback URL: ${envVars.X_REDIRECT_URI}`);
  console.log('   • OAuth 2.0 is enabled');
  console.log('   • Scopes include: tweet.read, users.read, offline.access');
  console.log('4. Try clicking "Link Your Twitter" in your app');
}

console.log('\n' + '='.repeat(50) + '\n');



