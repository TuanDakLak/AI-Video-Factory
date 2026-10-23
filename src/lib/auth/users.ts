import { randomBytes } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { PASSWORD_MAX, PASSWORD_MIN, hashPassword, verifyPassword } from "./password";
import type { GoogleProfile } from "./google";

export const registerSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("Email không hợp lệ").max(254),
    name: z.string().trim().min(1, "Tên không được trống").max(80),
    password: z
      .string()
      .min(PASSWORD_MIN, `Mật khẩu tối thiểu ${PASSWORD_MIN} ký tự`)
      .max(PASSWORD_MAX, `Mật khẩu tối đa ${PASSWORD_MAX} ký tự`),
    /** optional so the CLI can omit it; the web form always sends it */
    confirmPassword: z.string().max(PASSWORD_MAX).optional(),
  })
  .refine((v) => v.confirmPassword === undefined || v.confirmPassword === v.password, {
    message: "Mật khẩu xác nhận không khớp",
    path: ["confirmPassword"],
  })
  .refine((v) => !v.password.toLowerCase().includes(v.email.split("@")[0]) || v.email.split("@")[0].length < 4, {
    message: "Mật khẩu không được chứa tên email",
    path: ["password"],
  });

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().max(254),
  password: z.string().min(1).max(PASSWORD_MAX),
});

export class SignupClosedError extends Error {}
export class EmailTakenError extends Error {}
/** Google email matches an existing password account: linking must be done explicitly while signed in (see below). */
export class LinkRequiredError extends Error {}
export class GoogleAlreadyLinkedError extends Error {}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: "USER" | "ADMIN";
}

/**
 * Creates a user. The first account ever created becomes ADMIN and takes ownership of everything created before
 * auth existed (projects, Google accounts, presets). Later accounts start EMPTY: they only ever see what they create.
 * Later sign-ups need ALLOW_SIGNUP=true (or `npm run user:create`). An advisory lock serialises concurrent first
 * sign-ups so only one of them can become the bootstrap admin.
 */
async function createUser(
  data: { email: string; name: string; passwordHash: string | null },
  opts: { force?: boolean; google?: { sub: string } } = {}
): Promise<PublicUser & { isFirst: boolean }> {
  const user = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(72110431)`;
    const isFirst = (await tx.user.count()) === 0;
    if (!isFirst && !opts.force && process.env.ALLOW_SIGNUP !== "true") throw new SignupClosedError("Đăng ký tài khoản mới đang tắt.");
    if (await tx.user.findUnique({ where: { email: data.email }, select: { id: true } })) throw new EmailTakenError("Email đã được sử dụng.");
    const created = await tx.user.create({
      data: {
        ...data,
        role: isFirst ? "ADMIN" : "USER",
        ...(opts.google ? { oauthAccounts: { create: { provider: "google", providerAccountId: opts.google.sub, email: data.email } } } : {}),
      },
      select: { id: true, email: true, name: true, role: true },
    });
    if (isFirst) {
      await tx.project.updateMany({ where: { ownerId: null }, data: { ownerId: created.id } });
      await tx.googleAccount.updateMany({ where: { ownerId: null }, data: { ownerId: created.id } });
    }
    return { ...created, isFirst };
  });
  return user;
}

export async function registerUser(input: z.infer<typeof registerSchema>, opts: { force?: boolean } = {}) {
  return createUser({ email: input.email, name: input.name, passwordHash: await hashPassword(input.password) }, opts);
}

/** Returns the user when email + password match an enabled account. Same work (one argon2 verify) whatever the outcome. */
export async function authenticate(email: string, password: string): Promise<PublicUser | null> {
  const user = await prisma.user.findUnique({ where: { email } });
  const ok = await verifyPassword(user?.passwordHash, password); // Google-only accounts have no hash: always false
  if (!user || !ok || user.disabled) return null;
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

/**
 * Google sign-in. Identity = Google's stable `sub`, not the email.
 *  1. a user already linked to this Google account -> that user;
 *  2. a user with the same email WITHOUT a password (created by Google sign-in) -> link;
 *  3. a user with the same email WITH a password -> refuse (LinkRequiredError). Sign-up does not prove ownership of the
 *     email, so auto-linking would let someone who registered the victim's address first keep a password into the
 *     victim's account ("pre-account takeover"). The owner signs in with the password and links Google in Settings;
 *  4. else a new user (same sign-up policy as the form).
 * Returns null when the user exists but is disabled.
 */
export async function signInWithGoogle(profile: GoogleProfile): Promise<(PublicUser & { created: boolean }) | null> {
  const linked = await prisma.oAuthAccount.findUnique({
    where: { provider_providerAccountId: { provider: "google", providerAccountId: profile.sub } },
    include: { user: true },
  });
  let user = linked?.user ?? null;
  let created = false;

  if (!user) {
    const byEmail = await prisma.user.findUnique({ where: { email: profile.email } });
    if (byEmail?.passwordHash) throw new LinkRequiredError("Email này đã có tài khoản mật khẩu.");
    if (byEmail) {
      await prisma.oAuthAccount.create({ data: { userId: byEmail.id, provider: "google", providerAccountId: profile.sub, email: profile.email } });
      user = byEmail;
    }
  }
  if (!user) {
    const fresh = await createUser({ email: profile.email, name: profile.name, passwordHash: null }, { google: { sub: profile.sub } });
    user = await prisma.user.findUniqueOrThrow({ where: { id: fresh.id } });
    created = true;
  }
  if (user.disabled) return null;

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await prisma.oAuthAccount.updateMany({ where: { provider: "google", providerAccountId: profile.sub }, data: { lastUsedAt: new Date(), email: profile.email } });
  await ensureFlowAccount(user.id, profile.email, profile.name);
  return { id: user.id, email: user.email, name: user.name, role: user.role, created };
}

/** Explicit linking by a signed-in user (Settings > "Liên kết Google"): proves control of both accounts. */
export async function linkGoogleToUser(userId: string, profile: GoogleProfile): Promise<void> {
  const existing = await prisma.oAuthAccount.findUnique({
    where: { provider_providerAccountId: { provider: "google", providerAccountId: profile.sub } },
    select: { userId: true },
  });
  if (existing && existing.userId !== userId) throw new GoogleAlreadyLinkedError("Tài khoản Google này đã liên kết với người dùng khác.");
  if (!existing) await prisma.oAuthAccount.create({ data: { userId, provider: "google", providerAccountId: profile.sub, email: profile.email } });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } });
  await ensureFlowAccount(userId, profile.email, user.name);
}

/**
 * The Google account the user signed in with is also the obvious account for Google Flow: make sure a Flow account
 * entry exists for it. It still has to be connected once ("Kết nối Google Flow"): Flow has no API and Google never
 * hands a website the browser session the automation needs, so the user signs in inside the automation browser,
 * where this email is pre-filled.
 */
export async function ensureFlowAccount(userId: string, email: string, name: string): Promise<void> {
  const exists = await prisma.googleAccount.findFirst({ where: { ownerId: userId, email }, select: { id: true } });
  if (exists) return;
  await prisma.googleAccount.create({
    data: {
      ownerId: userId,
      email,
      name: email,
      label: `${name} (tài khoản đăng nhập)`,
      profileDir: `u-${userId.slice(-8)}-${randomBytes(6).toString("hex")}`,
      status: "NOT_CONNECTED",
    },
  });
}
