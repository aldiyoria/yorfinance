const crypto = require('crypto');
const logger = require('./logger');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

let _key = null;

function getKey() {
  if (_key) return _key;
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('ENCRYPTION_KEY wajib diisi di .env');
  }
  // Support hex (64 chars) or base64 (44 chars) or raw string
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    _key = Buffer.from(raw, 'hex');
  } else if (/^[A-Za-z0-9+/]{43}=$/.test(raw)) {
    _key = Buffer.from(raw, 'base64');
  } else {
    // Derive key from string using PBKDF2
    _key = crypto.pbkdf2Sync(raw, 'yorfinance-salt', 100000, KEY_LENGTH, 'sha512');
  }
  return _key;
}

/**
 * Encrypt plaintext string using AES-256-GCM.
 * @param {string} plaintext
 * @returns {string} base64 encoded (iv + authTag + ciphertext)
 */
function encrypt(plaintext) {
  if (plaintext == null || plaintext === '') return plaintext;
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(String(plaintext), 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Format: iv(12) + authTag(16) + ciphertext
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString('base64');
}

/**
 * Decrypt ciphertext string using AES-256-GCM.
 * @param {string} ciphertext - base64 encoded
 * @returns {string} decrypted plaintext
 */
function decrypt(ciphertext) {
  if (ciphertext == null || ciphertext === '') return ciphertext;
  try {
    const key = getKey();
    const buf = Buffer.from(ciphertext, 'base64');

    if (buf.length < IV_LENGTH + 16 + 1) {
      // Not a valid encrypted value — return as-is (backward compat)
      return ciphertext;
    }

    const iv = buf.subarray(0, IV_LENGTH);
    const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + 16);
    const encrypted = buf.subarray(IV_LENGTH + 16);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, undefined, 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    // If decryption fails, likely plaintext (backward compat) — return as-is
    logger.warn({ err: err.message }, 'Decrypt failed, returning raw value');
    return ciphertext;
  }
}

/**
 * Check if a string looks like an encrypted value (base64 with proper length).
 */
function isEncrypted(value) {
  if (!value || typeof value !== 'string') return false;
  try {
    const buf = Buffer.from(value, 'base64');
    return buf.length >= IV_LENGTH + 16 + 1 && buf.toString('base64') === value;
  } catch {
    return false;
  }
}

/**
 * Safe decrypt — only decrypt if it looks encrypted, otherwise return as-is.
 * This handles backward compatibility with existing plaintext data.
 */
function safeDecrypt(ciphertext) {
  if (!ciphertext || typeof ciphertext !== 'string') return ciphertext;
  if (isEncrypted(ciphertext)) return decrypt(ciphertext);
  return ciphertext;
}

module.exports = { encrypt, decrypt, safeDecrypt, isEncrypted };
