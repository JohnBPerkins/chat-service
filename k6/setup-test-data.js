#!/usr/bin/env node

/**
 * Setup script for k6 load tests
 *
 * This script helps you:
 * 1. Create a test conversation for load testing
 * 2. Get your JWT token from NextAuth session
 *
 * Usage:
 *   node setup-test-data.js
 */

const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('k6 Load Test Setup');
  console.log('='.repeat(80) + '\n');

  console.log('To run load tests, you need:');
  console.log('1. A test conversation ID');
  console.log('2. JWT tokens for virtual users\n');

  console.log('Step 1: Create a test conversation');
  console.log('-'.repeat(80));
  console.log('1. Open your chat application in a browser');
  console.log('2. Sign in with your test account');
  console.log('3. Create a new conversation (or use an existing one)');
  console.log('4. Copy the conversation ID from the URL or from DevTools\n');

  const conversationId = await question('Enter the conversation ID: ');

  console.log('\nStep 2: Get your JWT token');
  console.log('-'.repeat(80));
  console.log('1. Open DevTools (F12) in your browser');
  console.log('2. Go to Application > Cookies or Storage');
  console.log('3. Find the session token cookie');
  console.log('   OR');
  console.log('4. Go to Network tab, refresh, look at a request header');
  console.log('5. Copy the JWT token from the Authorization header\n');
  console.log('Alternative: Extract from NextAuth session:');
  console.log('  - In Console: sessionStorage or localStorage');
  console.log('  - Or check Network tab for API calls with Authorization header\n');

  const jwt = await question('Enter your JWT token: ');

  console.log('\nStep 3 (Optional): For multiple VUs, create multiple users');
  console.log('-'.repeat(80));
  console.log('For best results, create multiple test accounts and add them');
  console.log('to the same conversation. Then get JWT tokens for each.\n');

  const multipleTokens = await question('Do you have multiple JWT tokens? (y/n): ');

  let tokens = [jwt];
  if (multipleTokens.toLowerCase() === 'y') {
    console.log('\nEnter additional JWT tokens (one per line, empty line to finish):');
    while (true) {
      const token = await question('JWT token: ');
      if (!token.trim()) break;
      tokens.push(token);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('Setup Complete!');
  console.log('='.repeat(80) + '\n');

  console.log('Run your load test with:');
  console.log('\nSimple test (1 token, all VUs use same user):');
  console.log(`  k6 run -e CONVERSATION_ID="${conversationId}" \\`);
  console.log(`    -e JWT_TOKEN="${jwt.substring(0, 20)}..." \\`);
  console.log(`    k6/message-throughput.js\n`);

  if (tokens.length > 1) {
    console.log('Multiple users test:');
    const envVars = tokens.map((t, i) => `-e JWT_${i + 1}="${t}"`).join(' \\\n    ');
    console.log(`  k6 run -e CONVERSATION_ID="${conversationId}" \\`);
    console.log(`    ${envVars} \\`);
    console.log(`    k6/message-throughput.js\n`);
  }

  console.log('For Grafana Cloud:');
  console.log(`  k6 cloud -e CONVERSATION_ID="${conversationId}" \\`);
  console.log(`    -e JWT_TOKEN="${jwt.substring(0, 20)}..." \\`);
  console.log(`    k6/message-throughput.js\n`);

  console.log('Stress test:');
  console.log(`  k6 run -e CONVERSATION_ID="${conversationId}" \\`);
  console.log(`    -e JWT_TOKEN="${jwt.substring(0, 20)}..." \\`);
  console.log(`    k6/simple-stress.js\n`);

  // Save to .env.k6 file
  const fs = require('fs');
  const envContent = [
    `CONVERSATION_ID=${conversationId}`,
    `JWT_TOKEN=${jwt}`,
    ...tokens.slice(1).map((t, i) => `JWT_${i + 2}=${t}`)
  ].join('\n');

  fs.writeFileSync('k6/.env.k6', envContent);
  console.log('Configuration saved to k6/.env.k6');
  console.log('\nYou can source this file before running tests:');
  console.log('  export $(cat k6/.env.k6 | xargs)\n');

  rl.close();
}

main().catch(console.error);
