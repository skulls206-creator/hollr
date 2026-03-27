/**
 * AES-256-GCM encryption for Ballpoint note data (title + content).
 *
 * Format of ciphertext stored in DB:
 *   base64(iv):base64(ciphertext):base64(authTag)
 *
 * A random 12-byte IV is generated per encryption call, so two encryptions
 * of the same plaintext produce different ciphertext — no pattern leaks.
 *
 * The encryption key is read from BALLPOINT_ENCRYPTION_KEY (64-char hex = 32 bytes).
 * If the env var is missing, the module throws at startup to fail fast.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const KEY_HEX = process.env.BALLPOINT_ENCRYPTION_KEY;
if (!KEY_HEX || KEY_HEX.length !== 64) {
  throw new Error(
    "[ballpoint-crypto] BALLPOINT_ENCRYPTION_KEY must be a 64-char hex string (32 bytes). " +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
  );
}

const KEY = Buffer.from(KEY_HEX, "hex");
const ALGO = "aes-256-gcm";
const IV_LEN = 12;  // GCM recommended IV length
const TAG_LEN = 16; // GCM auth tag length

const ENCRYPTED_PREFIX = "enc:";

/** Encrypt a plaintext string. Returns a compact base64-encoded token. */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, KEY, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Pack iv + authTag + ciphertext, then base64-encode the whole blob
  const packed = Buffer.concat([iv, tag, ct]);
  return ENCRYPTED_PREFIX + packed.toString("base64");
}

/** Decrypt a token produced by encrypt(). Returns the original plaintext. */
export function decrypt(token: string): string {
  if (!token.startsWith(ENCRYPTED_PREFIX)) {
    // Legacy plaintext row — return as-is so existing notes still load.
    return token;
  }
  const packed = Buffer.from(token.slice(ENCRYPTED_PREFIX.length), "base64");
  const iv  = packed.subarray(0, IV_LEN);
  const tag = packed.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct  = packed.subarray(IV_LEN + TAG_LEN);

  const decipher = createDecipheriv(ALGO, KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

/**
 * Encrypt the user-visible fields of a note before writing to the DB.
 * Non-sensitive metadata (isPinned, isArchived, isTrashed) stay plaintext.
 */
export function encryptNote(note: { title: string; content: string }) {
  return {
    title: encrypt(note.title),
    content: encrypt(note.content),
  };
}

/**
 * Decrypt a DB row's encrypted fields back into plaintext.
 * Safe to call on legacy plaintext rows (returns them unchanged).
 */
export function decryptNote<T extends { title: string; content: string }>(row: T): T {
  return {
    ...row,
    title: decrypt(row.title),
    content: decrypt(row.content),
  };
}
