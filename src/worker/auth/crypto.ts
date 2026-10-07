const encoder = new TextEncoder();

function encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function decode(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function encryptionKey(secret: string): Promise<CryptoKey> {
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = decode(secret);
  } catch {
    throw new Error('Invalid credential encryption key configuration');
  }
  if (bytes.length !== 32) {
    throw new Error('Invalid credential encryption key configuration');
  }
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

// The identity is authenticated with the ciphertext, preventing row substitution.
export function credentialContext(origin: string, userId: string): string {
  return JSON.stringify([origin, userId]);
}

export async function encryptPat(pat: string, secret: string, context: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(context) },
    await encryptionKey(secret),
    encoder.encode(pat),
  );
  return `v1.${encode(iv)}.${encode(new Uint8Array(ciphertext))}`;
}

export async function decryptPat(encrypted: string, secret: string, context: string): Promise<string> {
  const [version, iv, ciphertext, extra] = encrypted.split('.');
  if (version !== 'v1' || !iv || !ciphertext || extra !== undefined) {
    throw new Error('Invalid encrypted credential');
  }
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: decode(iv), additionalData: encoder.encode(context) },
    await encryptionKey(secret),
    decode(ciphertext),
  );
  return new TextDecoder().decode(plaintext);
}

export function newSessionToken(): string {
  return encode(crypto.getRandomValues(new Uint8Array(32)))
    .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export async function hashSessionToken(token: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(token));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
