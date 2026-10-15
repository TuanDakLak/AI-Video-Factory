import { hash, verify } from "@node-rs/argon2";

/** OWASP Password Storage Cheat Sheet baseline for Argon2id: m=19 MiB, t=2, p=1. */
const ARGON2ID = 2; // Algorithm.Argon2id (a const enum, not importable with isolatedModules)
const ARGON2_OPTIONS = { algorithm: ARGON2ID, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128; // bounded so a huge body can't be used to burn CPU/memory

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

// Verified against when the email does not exist, so "unknown email" and "wrong password" take the same time (no user enumeration).
let dummyHash: Promise<string> | null = null;

export async function verifyPassword(passwordHash: string | null | undefined, password: string): Promise<boolean> {
  if (!passwordHash) {
    dummyHash ??= hashPassword("timing-equalizer-not-a-real-password");
    await verify(await dummyHash, password).catch(() => false);
    return false;
  }
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}
