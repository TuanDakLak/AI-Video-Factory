import { NextRequest, NextResponse } from "next/server";
import { EmailTakenError, SignupClosedError, registerSchema, registerUser } from "@/lib/auth/users";
import { createSession } from "@/lib/auth/tokens";
import { clientIp, sessionMeta, setSessionCookies } from "@/lib/auth/session";
import { hit } from "@/lib/auth/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const rl = await hit(`register:${clientIp(req)}`, 10, 3600);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Quá nhiều lần thử, vui lòng thử lại sau." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  }
  const parsed = registerSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });

  try {
    const user = await registerUser(parsed.data);
    const session = await createSession(user.id, sessionMeta(req));
    const res = NextResponse.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } }, { status: 201 });
    await setSessionCookies(res, { userId: user.id, role: user.role, ...session });
    return res;
  } catch (e) {
    if (e instanceof SignupClosedError) return NextResponse.json({ error: e.message }, { status: 403 });
    // generic message: does not confirm which emails are registered beyond what the 409 already implies
    if (e instanceof EmailTakenError) return NextResponse.json({ error: "Không thể tạo tài khoản với email này." }, { status: 409 });
    console.error("[auth] register failed:", e);
    return NextResponse.json({ error: "Không thể tạo tài khoản." }, { status: 500 });
  }
}
