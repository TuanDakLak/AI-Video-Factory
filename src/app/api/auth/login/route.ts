import { NextRequest, NextResponse } from "next/server";
import { authenticate, loginSchema } from "@/lib/auth/users";
import { createSession, purgeDeadTokens } from "@/lib/auth/tokens";
import { clientIp, sessionMeta, setSessionCookies } from "@/lib/auth/session";
import { hit, reset } from "@/lib/auth/rate-limit";

export const dynamic = "force-dynamic";

const FAIL = "Email hoặc mật khẩu không đúng.";

export async function POST(req: NextRequest) {
  const parsed = loginSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: FAIL }, { status: 400 });
  const { email, password } = parsed.data;

  // brute force: per account (works without a trusted proxy) and per client IP
  const [byEmail, byIp] = await Promise.all([hit(`login:email:${email}`, 8, 15 * 60), hit(`login:ip:${clientIp(req)}`, 50, 15 * 60)]);
  if (!byEmail.allowed || !byIp.allowed) {
    const retry = Math.max(byEmail.allowed ? 0 : byEmail.retryAfterSec, byIp.allowed ? 0 : byIp.retryAfterSec);
    return NextResponse.json({ error: "Quá nhiều lần đăng nhập sai. Vui lòng thử lại sau." }, { status: 429, headers: { "Retry-After": String(retry) } });
  }

  const user = await authenticate(email, password);
  if (!user) return NextResponse.json({ error: FAIL }, { status: 401 });

  await reset(`login:email:${email}`);
  const session = await createSession(user.id, sessionMeta(req));
  purgeDeadTokens().catch(() => {});
  const res = NextResponse.json({ user });
  await setSessionCookies(res, { userId: user.id, role: user.role, ...session });
  return res;
}
