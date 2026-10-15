import { z } from "zod";
import { prisma } from "@/lib/db";
import { claimUnownedPresets } from "@/lib/presets";
import { PASSWORD_MAX, PASSWORD_MIN, hashPassword, verifyPassword } from "./password";

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email không hợp lệ").max(254),
  name: z.string().trim().min(1, "Tên không được trống").max(80),
  password: z
    .string()
    .min(PASSWORD_MIN, `Mật khẩu tối thiểu ${PASSWORD_MIN} ký tự`)
    .max(PASSWORD_MAX, `Mật khẩu tối đa ${PASSWORD_MAX} ký tự`),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().max(254),
  password: z.string().min(1).max(PASSWORD_MAX),
});

export class SignupClosedError extends Error {}
export class EmailTakenError extends Error {}

/**
 * The first account ever created becomes ADMIN and takes ownership of everything created before auth existed
 * (projects, Google accounts, presets). Later sign-ups need ALLOW_SIGNUP=true (or `npm run user:create`).
 * An advisory lock serialises concurrent first sign-ups so only one of them can become the bootstrap admin.
 */
export async function registerUser(input: z.infer<typeof registerSchema>, opts: { force?: boolean } = {}) {
  const passwordHash = await hashPassword(input.password);
  const user = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(72110431)`;
    const isFirst = (await tx.user.count()) === 0;
    if (!isFirst && !opts.force && process.env.ALLOW_SIGNUP !== "true") throw new SignupClosedError("Đăng ký tài khoản mới đang tắt.");
    if (await tx.user.findUnique({ where: { email: input.email }, select: { id: true } })) throw new EmailTakenError("Email đã được sử dụng.");
    const created = await tx.user.create({
      data: { email: input.email, name: input.name, passwordHash, role: isFirst ? "ADMIN" : "USER" },
      select: { id: true, email: true, name: true, role: true },
    });
    if (isFirst) {
      await tx.project.updateMany({ where: { ownerId: null }, data: { ownerId: created.id } });
      await tx.googleAccount.updateMany({ where: { ownerId: null }, data: { ownerId: created.id } });
    }
    return { ...created, isFirst };
  });
  if (user.isFirst) claimUnownedPresets(user.id);
  return user;
}

/** Returns the user when email + password match an enabled account. Same work (one argon2 verify) whatever the outcome. */
export async function authenticate(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  const ok = await verifyPassword(user?.passwordHash, password);
  if (!user || !ok || user.disabled) return null;
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}
