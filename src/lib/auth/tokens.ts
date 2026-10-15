import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { FAMILY_MAX_SEC, REFRESH_IDLE_SEC, REUSE_GRACE_SEC } from "./config";

/**
 * Refresh-token families.
 *  - A login creates a family; every refresh rotates the token (old one marked rotatedAt, a successor is issued).
 *  - Presenting a token that was already rotated, after the grace window, means two parties hold the same token:
 *    one of them stole it. The whole family is revoked, so both the thief and the victim must log in again.
 *  - Only sha256(token) is stored: a database leak does not leak usable tokens.
 */

export interface SessionMeta {
  userAgent?: string | null;
  ip?: string | null;
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function newRawToken(): string {
  return randomBytes(32).toString("base64url"); // 256 bits
}

const clip = (v: string | null | undefined, n: number) => (v ? v.slice(0, n) : null);

export async function createSession(userId: string, meta: SessionMeta = {}) {
  const raw = newRawToken();
  const now = Date.now();
  const familyId = randomBytes(16).toString("hex");
  const familyExpiresAt = new Date(now + FAMILY_MAX_SEC * 1000);
  await prisma.refreshToken.create({
    data: {
      userId,
      familyId,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Math.min(now + REFRESH_IDLE_SEC * 1000, familyExpiresAt.getTime())),
      familyExpiresAt,
      userAgent: clip(meta.userAgent, 300),
      ip: clip(meta.ip, 64),
    },
  });
  return { refreshToken: raw, familyId, familyExpiresAt };
}

export type RotateResult =
  | {
      ok: true;
      userId: string;
      role: "USER" | "ADMIN";
      familyId: string;
      familyExpiresAt: Date;
      /** absent = concurrent refresh inside the grace window: issue a new access token only and keep the cookie set by the winner */
      refreshToken?: string;
    }
  | { ok: false; reason: "invalid" | "expired" | "revoked" | "reuse_detected" | "disabled" };

export async function revokeFamily(familyId: string, reason: string): Promise<number> {
  const r = await prisma.refreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: reason } });
  return r.count;
}

export async function revokeAllSessions(userId: string, reason: string): Promise<number> {
  const r = await prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: reason } });
  return r.count;
}

/** True while the family still has a live (not revoked, not expired) token: used to reject access JWTs of a logged-out session. */
export async function isSessionActive(familyId: string): Promise<boolean> {
  const live = await prisma.refreshToken.findFirst({
    where: { familyId, revokedAt: null, familyExpiresAt: { gt: new Date() } },
    select: { id: true },
  });
  return !!live;
}

export async function rotateRefreshToken(raw: string | undefined | null, meta: SessionMeta = {}): Promise<RotateResult> {
  if (!raw || raw.length > 200) return { ok: false, reason: "invalid" };
  const now = new Date();
  const token = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(raw) },
    include: { user: { select: { id: true, role: true, disabled: true } } },
  });
  if (!token) return { ok: false, reason: "invalid" };
  if (token.revokedAt) return { ok: false, reason: "revoked" };
  if (token.user.disabled) {
    await revokeFamily(token.familyId, "user_disabled");
    return { ok: false, reason: "disabled" };
  }
  if (token.familyExpiresAt <= now) return { ok: false, reason: "expired" };

  const base = { ok: true as const, userId: token.user.id, role: token.user.role, familyId: token.familyId, familyExpiresAt: token.familyExpiresAt };

  if (token.rotatedAt) {
    if (now.getTime() - token.rotatedAt.getTime() <= REUSE_GRACE_SEC * 1000) return base; // benign race: parallel requests
    const n = await revokeFamily(token.familyId, "reuse_detected");
    console.warn(`[auth] refresh token reuse detected: family ${token.familyId} of user ${token.userId} revoked (${n} tokens). ip=${meta.ip ?? "?"}`);
    return { ok: false, reason: "reuse_detected" };
  }
  if (token.expiresAt <= now) return { ok: false, reason: "expired" };

  // Atomic claim: only one request can rotate this token; a loser of the race falls into the grace path above next time
  const claimed = await prisma.refreshToken.updateMany({ where: { id: token.id, rotatedAt: null, revokedAt: null }, data: { rotatedAt: now } });
  if (claimed.count === 0) return base;

  const next = newRawToken();
  await prisma.refreshToken.create({
    data: {
      userId: token.userId,
      familyId: token.familyId,
      tokenHash: hashToken(next),
      expiresAt: new Date(Math.min(now.getTime() + REFRESH_IDLE_SEC * 1000, token.familyExpiresAt.getTime())),
      familyExpiresAt: token.familyExpiresAt,
      userAgent: clip(meta.userAgent, 300),
      ip: clip(meta.ip, 64),
    },
  });
  return { ...base, refreshToken: next };
}

/** Housekeeping: drop token rows of sessions that ended more than a day ago. */
export async function purgeDeadTokens(): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000);
  const r = await prisma.refreshToken.deleteMany({ where: { OR: [{ familyExpiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }] } });
  return r.count;
}
