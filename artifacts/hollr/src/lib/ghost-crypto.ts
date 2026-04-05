const ALGO = "AES-GCM";

export async function ghostEncrypt(plaintext: string): Promise<{ ciphertext: string; keyBase64: string; iv: string }> {
  const key = await crypto.subtle.generateKey({ name: ALGO, length: 256 }, true, ["encrypt", "decrypt"]);
  const ivBytes = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const encrypted = await crypto.subtle.encrypt({ name: ALGO, iv: ivBytes }, key, encoded);
  const exportedKey = await crypto.subtle.exportKey("raw", key);

  return {
    ciphertext: btoa(String.fromCharCode(...Array.from(new Uint8Array(encrypted)))),
    keyBase64: btoa(String.fromCharCode(...Array.from(new Uint8Array(exportedKey)))),
    iv: btoa(String.fromCharCode(...Array.from(ivBytes))),
  };
}

export async function ghostDecrypt(ciphertext: string, iv: string, keyBase64: string): Promise<string> {
  const keyBytes = Uint8Array.from(atob(keyBase64), c => c.charCodeAt(0));
  const ivBytes = Uint8Array.from(atob(iv), c => c.charCodeAt(0));
  const cipherBytes = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));

  const key = await crypto.subtle.importKey("raw", keyBytes.buffer as ArrayBuffer, { name: ALGO }, false, ["decrypt"]);
  const decrypted = await crypto.subtle.decrypt({ name: ALGO, iv: ivBytes }, key, cipherBytes.buffer as ArrayBuffer);
  return new TextDecoder().decode(decrypted);
}
