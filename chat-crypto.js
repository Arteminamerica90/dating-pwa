// Шифрование сообщений пары: AES-GCM 256 (Web Crypto, стандарт).
// Ключ выводится детерминированно из id обоих участников (PBKDF2),
// поэтому каждая сторона пары получает одинаковый ключ без обмена ключами.
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
  return bytes;
}

export async function derivePairKey(userIdA, userIdB) {
  const pair = [String(userIdA), String(userIdB)].sort().join('|');
  const salt = textEncoder.encode('walkdate-chat-v1');
  const baseKey = await crypto.subtle.importKey('raw', textEncoder.encode(`walkdate-pair:${pair}`), 'PBKDF2', false, [
    'deriveKey'
  ]);
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 120_000,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptChatText(key, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, textEncoder.encode(String(text)));
  return {
    v: 1,
    alg: 'AES-GCM',
    iv: b64encode(iv),
    ct: b64encode(ct)
  };
}

export async function decryptChatText(key, payload) {
  if (!payload || payload.v !== 1 || payload.alg !== 'AES-GCM') throw new Error('Неподдерживаемый формат сообщения');
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64decode(payload.iv) },
    key,
    b64decode(payload.ct)
  );
  return textDecoder.decode(new Uint8Array(pt));
}
