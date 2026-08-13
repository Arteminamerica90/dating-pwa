const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function b64encode(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function b64decode(str) {
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export async function deriveKeyFromPassphrase(passphrase, saltB64, iterations = 210_000) {
  const salt = saltB64 ? new Uint8Array(b64decode(saltB64)) : crypto.getRandomValues(new Uint8Array(16));
  const baseKey = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  return { key, saltB64: b64encode(salt), iterations };
}

export async function encryptJson(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = textEncoder.encode(JSON.stringify(obj));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return {
    v: 1,
    alg: 'AES-GCM',
    iv: b64encode(iv),
    ct: b64encode(ct)
  };
}

export async function decryptJson(key, payload) {
  if (!payload || payload.v !== 1 || payload.alg !== 'AES-GCM') throw new Error('Неподдерживаемый формат шифрования');
  const iv = new Uint8Array(b64decode(payload.iv));
  const ct = b64decode(payload.ct);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return JSON.parse(textDecoder.decode(new Uint8Array(pt)));
}
