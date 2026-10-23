import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "crypto";

/**
 * Encryption at rest for social-network tokens (they can post on the user's behalf).
 * AES-256-GCM (authenticated: a tampered value fails to decrypt), random 96-bit IV per value, "v1:" version prefix so the
 * key/algorithm can be rotated later. Key: TOKEN_ENCRYPTION_KEY (32 bytes, base64) or, if unset, derived from AUTH_SECRET
 * with HKDF so the two secrets are still independent.
 */
const PREFIX = "v1:";

let cachedKey: Buffer | null = null;
function key(): Buffer {
  if (cachedKey) return cachedKey;
  const explicit = process.env.TOKEN_ENCRYPTION_KEY;
  if (explicit) {
    const k = Buffer.from(explicit, "base64");
    if (k.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32).");
    cachedKey = k;
  } else {
    const secret = process.env.AUTH_SECRET || "";
    if (secret.length < 32) throw new Error("Set TOKEN_ENCRYPTION_KEY (or AUTH_SECRET) before connecting social accounts.");
    cachedKey = Buffer.from(hkdfSync("sha256", secret, "ai-content-factory", "social-token-encryption-v1", 32));
  }
  return cachedKey;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

export function decryptSecret(sealed: string): string {
  if (!sealed.startsWith(PREFIX)) throw new Error("Unknown token encryption format.");
  const raw = Buffer.from(sealed.slice(PREFIX.length), "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}
