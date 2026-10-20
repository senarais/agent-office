#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const [platform = 'x', file = 'cookies.json'] = process.argv.slice(2);
if (!['x', 'instagram'].includes(platform)) {
  console.error('Usage: node scripts/import-social-cookies.mjs <x|instagram> <cookies.json>');
  process.exit(1);
}

let raw;
try { raw = JSON.parse(readFileSync(file, 'utf8')); }
catch (error) { console.error(`Cannot read ${file}: ${error.message}`); process.exit(1); }

const cookies = Array.isArray(raw) ? raw : Array.isArray(raw?.cookies) ? raw.cookies : [];
if (!cookies.length) { console.error('No cookies found. Export the site cookies with Cookie-Editor as JSON.'); process.exit(1); }

const base = process.env.OFFICE_URL || 'http://127.0.0.1:3001';
const bootstrap = await fetch(`${base}/api/bootstrap`).then(response => {
  if (!response.ok) throw new Error(`Office server returned HTTP ${response.status}`);
  return response.json();
});

const response = await fetch(`${base}/api/social/browser/cookies`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Office-Token': bootstrap.token },
  body: JSON.stringify({ platform, cookies }),
});
const text = await response.text();
console.log(response.status, text);
if (!response.ok) process.exit(1);
console.log(`Imported ${cookies.length} cookies into the ${platform} profile. Open the office and press Check session.`);
console.log('Delete the cookie file now; it contains live session credentials.');
