/**
 * Per-file AES-256-GCM encryption for Foldr.
 *
 * Each file gets its own random 32-byte key (the "file key").
 * The file key is encrypted with the master FOLDR_ENCRYPTION_KEY and stored in the DB.
 *
 * Format for encrypted values (file key or file content chunks):
 *   base64(12-byte-IV | 16-byte-authTag | ciphertext)
 *   stored with "fenc:" prefix in the DB for the key field.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const MASTER_HEX = process.env.FOLDR_ENCRYPTION_KEY;
if (!MASTER_HEX || MASTER_HEX.length !== 64) {
  throw new Error(
    "[foldr-crypto] FOLDR_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)."
  );
}
const MASTER_KEY = Buffer.from(MASTER_HEX, "hex");
const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_PREFIX = "fenc:";

function _encrypt(key: Buffer, plainBuf: Buffer): Buffer {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plainBuf), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]);
}

function _decrypt(key: Buffer, packed: Buffer): Buffer {
  const iv  = packed.subarray(0, IV_LEN);
  const tag = packed.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct  = packed.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

/**
 * Encrypt a file buffer.
 * Returns: { encryptedBuf, encryptedKey }
 *   encryptedBuf  — encrypted bytes to upload to Lighthouse
 *   encryptedKey  — base64-encoded encrypted file key to store in DB
 */
export function encryptFile(plainBuf: Buffer): { encryptedBuf: Buffer; encryptedKey: string } {
  const fileKey = randomBytes(32);
  const encryptedBuf = _encrypt(fileKey, plainBuf);
  const encryptedKeyBuf = _encrypt(MASTER_KEY, fileKey);
  return {
    encryptedBuf,
    encryptedKey: KEY_PREFIX + encryptedKeyBuf.toString("base64"),
  };
}

/**
 * Decrypt a file buffer fetched from Lighthouse.
 * encryptedKey — the string stored in the DB (starts with "fenc:").
 */
export function decryptFile(encryptedBuf: Buffer, encryptedKey: string): Buffer {
  if (!encryptedKey.startsWith(KEY_PREFIX)) {
    throw new Error("[foldr-crypto] Invalid encrypted key format");
  }
  const encKeyBuf = Buffer.from(encryptedKey.slice(KEY_PREFIX.length), "base64");
  const fileKey = _decrypt(MASTER_KEY, encKeyBuf);
  return _decrypt(fileKey, encryptedBuf);
}
