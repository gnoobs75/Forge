// Minimal ULID generator (Crockford base32, 26 chars).
//
// Format: TTTTTTTTTT RRRRRRRRRRRRRRRR
//   T = 48-bit timestamp (10 chars)
//   R = 80-bit randomness (16 chars)
//
// Lexicographically sortable by time; collision-resistant within and across
// processes. Faster than importing the `ulid` npm package and one fewer
// dep to audit.

import crypto from 'node:crypto';

const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32

function encodeTime(now) {
  let out = '';
  for (let i = 9; i >= 0; i--) {
    const mod = now % 32;
    out = ENCODING[mod] + out;
    now = (now - mod) / 32;
  }
  return out;
}

function encodeRandom() {
  const bytes = crypto.randomBytes(10); // 80 bits
  let out = '';
  // Pack 10 bytes (80 bits) into 16 base32 chars (16 * 5 = 80 bits)
  let buf = 0n;
  for (let i = 0; i < 10; i++) buf = (buf << 8n) | BigInt(bytes[i]);
  for (let i = 15; i >= 0; i--) {
    const mod = Number(buf & 31n);
    out = ENCODING[mod] + out;
    buf >>= 5n;
  }
  return out;
}

export function ulid(now = Date.now()) {
  return encodeTime(now) + encodeRandom();
}
