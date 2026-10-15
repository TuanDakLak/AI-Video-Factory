"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Video } from "lucide-react";
import { safeNextPath } from "@/lib/auth/redirect";

/** Login and sign-up share one form; cookies are set by the API (httpOnly), nothing is stored in JS. */
export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isLogin = mode === "login";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(isLogin ? "/api/auth/login" : "/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isLogin ? { email, password } : { email, name, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Không thành công, vui lòng thử lại.");
        return;
      }
      // same rule as the server: only targets that resolve to our own origin
      router.replace(safeNextPath(next));
      router.refresh();
    } catch {
      setError("Không kết nối được máy chủ.");
    } finally {
      setBusy(false);
    }
  };

  const input = "w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500";

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6 bg-slate-50">
      <form onSubmit={submit} className="w-full max-w-sm bg-white border border-slate-200 rounded-3xl p-7 shadow-sm space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
            <Video className="w-4 h-4" />
          </div>
          <div>
            <h1 className="font-bold text-slate-900">{isLogin ? "Đăng nhập" : "Tạo tài khoản"}</h1>
            <p className="text-xs text-slate-500">AI Content Factory</p>
          </div>
        </div>

        {!isLogin && (
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-700">Tên hiển thị</span>
            <input className={input} value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoComplete="name" />
          </label>
        )}
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-700">Email</span>
          <input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={254} autoComplete="email" />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-700">Mật khẩu</span>
          <input
            className={input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={isLogin ? 1 : 10}
            maxLength={128}
            autoComplete={isLogin ? "current-password" : "new-password"}
          />
          {!isLogin && <span className="text-[11px] text-slate-400">Tối thiểu 10 ký tự.</span>}
        </label>

        {error && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">{error}</p>}

        <button type="submit" disabled={busy} className="w-full inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold py-2.5 rounded-xl disabled:opacity-60">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          {isLogin ? "Đăng nhập" : "Tạo tài khoản"}
        </button>

        <p className="text-xs text-center text-slate-500">
          {isLogin ? (
            <>Chưa có tài khoản? <Link href="/register" className="text-emerald-700 font-semibold hover:underline">Đăng ký</Link></>
          ) : (
            <>Đã có tài khoản? <Link href="/login" className="text-emerald-700 font-semibold hover:underline">Đăng nhập</Link></>
          )}
        </p>
      </form>
    </div>
  );
}
