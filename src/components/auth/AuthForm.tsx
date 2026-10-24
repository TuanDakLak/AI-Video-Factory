"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Check, Eye, EyeOff, Loader2, Video, X } from "lucide-react";
import { safeNextPath } from "@/lib/auth/redirect";

/** Messages for ?error=<code> set by the Google callback / refresh routes. */
const ERRORS: Record<string, string> = {
  google_disabled: "Đăng nhập bằng Google chưa được cấu hình trên máy chủ.",
  google_cancelled: "Bạn đã huỷ đăng nhập bằng Google.",
  google_failed: "Không xác thực được với Google. Vui lòng thử lại.",
  google_state: "Phiên đăng nhập Google đã hết hạn. Vui lòng thử lại.",
  link_required: "Email này đã có tài khoản dùng mật khẩu. Hãy đăng nhập bằng mật khẩu, sau đó vào Cài đặt → Liên kết Google.",
  signup_closed: "Đăng ký tài khoản mới đang tắt. Liên hệ quản trị viên để được cấp tài khoản.",
  account_disabled: "Tài khoản này đã bị khoá.",
  session_expired: "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.",
};

const PASSWORD_MIN = 10;

function passwordChecks(pw: string) {
  return [
    { ok: pw.length >= PASSWORD_MIN, label: `Tối thiểu ${PASSWORD_MIN} ký tự` },
    { ok: /[a-z]/.test(pw) && /[A-Z]/.test(pw), label: "Có chữ hoa và chữ thường" },
    { ok: /\d/.test(pw), label: "Có chữ số" },
    { ok: /[^A-Za-z0-9]/.test(pw), label: "Có ký tự đặc biệt" },
  ];
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="w-4 h-4" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function PasswordInput(props: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  invalid?: boolean;
  describedBy?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={props.id}
        type={show ? "text" : "password"}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        autoComplete={props.autoComplete}
        maxLength={128}
        required
        aria-invalid={props.invalid || undefined}
        aria-describedby={props.describedBy}
        className={`w-full border rounded-xl pl-3.5 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 ${
          props.invalid ? "border-rose-300 focus:ring-rose-500/30" : "border-slate-200 focus:ring-emerald-500/40 focus:border-emerald-500"
        }`}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
        className="absolute inset-y-0 right-0 px-3 text-slate-400 hover:text-slate-600"
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

/** Login and sign-up. Cookies are set by the API (httpOnly); nothing auth-related is stored in JS. */
export function AuthForm({ mode, googleEnabled }: { mode: "login" | "register"; googleEnabled: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
  const isLogin = mode === "login";

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touchedConfirm, setTouchedConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(ERRORS[params.get("error") || ""] ?? null);

  const checks = useMemo(() => passwordChecks(password), [password]);
  const score = checks.filter((c) => c.ok).length;
  const mismatch = !isLogin && touchedConfirm && confirm.length > 0 && confirm !== password;
  const canSubmit = isLogin
    ? email.length > 0 && password.length > 0
    : name.trim().length > 0 && email.length > 0 && password.length >= PASSWORD_MIN && confirm === password;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) {
      setTouchedConfirm(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(isLogin ? "/api/auth/login" : "/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isLogin ? { email, password } : { email, name, password, confirmPassword: confirm }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Không thành công, vui lòng thử lại.");
        return;
      }
      router.replace(safeNextPath(next));
      router.refresh();
    } catch {
      setError("Không kết nối được máy chủ.");
    } finally {
      setBusy(false);
    }
  };

  const googleHref = `/api/auth/google/start?next=${encodeURIComponent(safeNextPath(next))}`;
  const field = "w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500";
  const strength = ["Rất yếu", "Yếu", "Trung bình", "Khá", "Mạnh"][score];
  const strengthColor = ["bg-rose-500", "bg-rose-500", "bg-amber-500", "bg-lime-500", "bg-emerald-500"][score];

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6 bg-slate-50">
      <div className="w-full max-w-sm space-y-4">
        <div className="flex items-center gap-3 justify-center">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-sm">
            <Video className="w-5 h-5" />
          </div>
          <span className="font-bold text-slate-900">AI Video Factory</span>
        </div>

        <form onSubmit={submit} noValidate className="bg-white border border-slate-200 rounded-3xl p-7 shadow-sm space-y-5">
          <div>
            <h1 className="text-lg font-bold text-slate-900">{isLogin ? "Đăng nhập" : "Tạo tài khoản"}</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {isLogin ? "Chào mừng bạn quay lại." : "Mỗi tài khoản có dự án, tài khoản Google và video riêng."}
            </p>
          </div>

          {error && (
            <div role="alert" className="flex gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
              <span>{error}</span>
            </div>
          )}

          {googleEnabled && (
            <>
              <a
                href={googleHref}
                className="w-full inline-flex items-center justify-center gap-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold py-2.5 rounded-xl"
              >
                <GoogleIcon />
                Tiếp tục với Google
              </a>
              <div className="flex items-center gap-3 text-[11px] text-slate-400">
                <span className="h-px flex-1 bg-slate-200" />
                hoặc dùng email
                <span className="h-px flex-1 bg-slate-200" />
              </div>
            </>
          )}

          {!isLogin && (
            <div className="space-y-1">
              <label htmlFor="name" className="text-xs font-medium text-slate-700">Tên hiển thị</label>
              <input id="name" className={field} value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoComplete="name" />
            </div>
          )}

          <div className="space-y-1">
            <label htmlFor="email" className="text-xs font-medium text-slate-700">Email</label>
            <input id="email" className={field} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={254} autoComplete="email" />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="text-xs font-medium text-slate-700">Mật khẩu</label>
            <PasswordInput
              id="password"
              value={password}
              onChange={setPassword}
              autoComplete={isLogin ? "current-password" : "new-password"}
              describedBy={isLogin ? undefined : "password-rules"}
            />
            {!isLogin && password.length > 0 && (
              <div id="password-rules" className="space-y-1.5 pt-0.5">
                <div className="flex items-center gap-2">
                  <div className="flex-1 grid grid-cols-4 gap-1">
                    {[0, 1, 2, 3].map((i) => (
                      <span key={i} className={`h-1 rounded-full ${i < score ? strengthColor : "bg-slate-200"}`} />
                    ))}
                  </div>
                  <span className="text-[11px] text-slate-500 w-16 text-right">{strength}</span>
                </div>
                <ul className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                  {checks.map((c) => (
                    <li key={c.label} className={`flex items-center gap-1 text-[11px] ${c.ok ? "text-emerald-700" : "text-slate-400"}`}>
                      {c.ok ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                      {c.label}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {!isLogin && (
            <div className="space-y-1">
              <label htmlFor="confirm" className="text-xs font-medium text-slate-700">Xác nhận mật khẩu</label>
              <div onBlur={() => setTouchedConfirm(true)}>
                <PasswordInput id="confirm" value={confirm} onChange={setConfirm} autoComplete="new-password" invalid={mismatch} describedBy="confirm-msg" />
              </div>
              {mismatch && (
                <p id="confirm-msg" className="text-[11px] text-rose-600">Mật khẩu xác nhận không khớp.</p>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={busy || !canSubmit}
            className="w-full inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold py-2.5 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {isLogin ? "Đăng nhập" : "Tạo tài khoản"}
          </button>
        </form>

        <p className="text-xs text-center text-slate-500">
          {isLogin ? (
            <>Chưa có tài khoản? <Link href="/register" className="text-emerald-700 font-semibold hover:underline">Đăng ký</Link></>
          ) : (
            <>Đã có tài khoản? <Link href="/login" className="text-emerald-700 font-semibold hover:underline">Đăng nhập</Link></>
          )}
        </p>
      </div>
    </div>
  );
}
