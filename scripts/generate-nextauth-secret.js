#!/usr/bin/env node

/**
 * Generate a NextAuth secret for production use
 * Run with: node scripts/generate-nextauth-secret.js
 */

const crypto = require('crypto');

const secret = crypto.randomBytes(32).toString('base64');

console.log('Generated NextAuth Secret:');
console.log(secret);
console.log('\nAdd this to your Vercel environment variables as NEXTAUTH_SECRET');
console.log('Keep this secret secure and never commit it to your repository!');