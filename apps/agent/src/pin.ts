// Hash of the agent's PIN kept on the phone for offline sign-in (FR-02). PBKDF2-SHA256 from
// @noble/hashes (pure JS, no native code). Stored only inside the secure store.
import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';

export interface PinHash {
  salt: string;
  iterations: number;
  hash: string;
}

/** Enough to slow guessing, quick enough (well under a second) on low-cost Android phones. */
export const PIN_ITERATIONS = 30_000;

export function hashPin(pin: string, salt: Uint8Array, iterations = PIN_ITERATIONS): PinHash {
  const key = pbkdf2(sha256, utf8ToBytes(pin), salt, { c: iterations, dkLen: 32 });
  return { salt: bytesToHex(salt), iterations, hash: bytesToHex(key) };
}

export function verifyPin(pin: string, stored: PinHash): boolean {
  const key = pbkdf2(sha256, utf8ToBytes(pin), hexToBytes(stored.salt), {
    c: stored.iterations,
    dkLen: 32,
  });
  const expected = hexToBytes(stored.hash);
  if (key.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < key.length; i++) diff |= key[i]! ^ expected[i]!;
  return diff === 0;
}
