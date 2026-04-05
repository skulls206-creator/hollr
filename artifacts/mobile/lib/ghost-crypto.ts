// @ts-ignore -- @noble/ciphers types use .js suffix in package exports
import { gcm } from '@noble/ciphers/aes.js';
// @ts-ignore -- @noble/ciphers types use .js suffix in package exports
import { randomBytes } from '@noble/ciphers/webcrypto.js';

function toBase64(buf: Uint8Array): string {
  return btoa(String.fromCharCode(...Array.from(buf)));
}

function fromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

export async function ghostEncrypt(plaintext: string): Promise<{ ciphertext: string; keyBase64: string; iv: string }> {
  const key: Uint8Array = randomBytes(32);
  const iv: Uint8Array = randomBytes(12);
  const encoder = new TextEncoder();
  const cipher = gcm(key, iv);
  const encrypted: Uint8Array = cipher.encrypt(encoder.encode(plaintext));
  return {
    ciphertext: toBase64(encrypted),
    keyBase64: toBase64(key),
    iv: toBase64(iv),
  };
}

export async function ghostDecrypt(ciphertext: string, iv: string, keyBase64: string): Promise<string> {
  const key = fromBase64(keyBase64);
  const ivBytes = fromBase64(iv);
  const cipherBytes = fromBase64(ciphertext);
  const cipher = gcm(key, ivBytes);
  const decrypted: Uint8Array = cipher.decrypt(cipherBytes);
  return new TextDecoder().decode(decrypted);
}
