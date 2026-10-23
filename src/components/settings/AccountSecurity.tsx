"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Link2, Loader2, LogOut, ShieldCheck } from "lucide-react";
import { useToast } from "@/components/ui/ToastContext";

const NOTICES: Record<string, { kind: "success" | "error" | "info"; text: string }> = {
  linked: { kind: "success", text: "Đã liên kết tài khoản Google. Từ giờ bạn có thể đăng nhập bằng Google." },
  welcome: { kind: "info", text: "Chào mừng! Tài khoản Google của bạn đã có sẵn trong danh sách Flow bên dưới: bấm \"Kết nối Google Flow\" một lần để dùng." },
  taken: { kind: "error", text: "Tài khoản Google này đã liên kết với một người dùng khác." },
  google_failed: { kind: "error", text: "Không xác thực được với Google, vui lòng thử lại." },
  google_cancelled: { kind: "info", text: "Đã huỷ liên kết Google." },
  google_disabled: { kind: "error", text: "Đăng nhập bằng Google chưa được cấu hình trên máy chủ." },
};

/** Sign-in methods and sessions of the current user. */
export function AccountSecurity(props: {
  email: string;
  hasPassword: boolean;
  googleEnabled: boolean;
  googleEmails: string[];
}) {
  const params = useSearchParams();
  const router = useRouter();
  const { success, error, info } = useToast();
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const n = NOTICES[params.get("google") || ""];
    if (!n) return;
    (n.kind === "success" ? success : n.kind === "error" ? error : info)(n.text);
    router.replace("/settings"); // drop the query so a reload doesn't repeat the notice
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logoutEverywhere = async () => {
    setLeaving(true);
    await fetch("/api/auth/logout-all", { method: "POST" }).catch(() => {});
    window.location.href = "/login";
  };

  return (
    <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-sm space-y-5">
      <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
        <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-base font-bold text-slate-900">Bảo mật tài khoản</h3>
          <p className="text-xs text-slate-400">{props.email}</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 text-xs">
        <div className="border border-slate-200 rounded-2xl p-4 space-y-2">
          <p className="font-semibold text-slate-800">Phương thức đăng nhập</p>
          <p className="flex items-center gap-1.5 text-slate-600">
            <CheckCircle2 className={`w-3.5 h-3.5 ${props.hasPassword ? "text-emerald-600" : "text-slate-300"}`} />
            Email và mật khẩu{props.hasPassword ? "" : " (chưa đặt)"}
          </p>
          <p className="flex items-center gap-1.5 text-slate-600">
            <CheckCircle2 className={`w-3.5 h-3.5 ${props.googleEmails.length ? "text-emerald-600" : "text-slate-300"}`} />
            Google{props.googleEmails.length ? `: ${props.googleEmails.join(", ")}` : " (chưa liên kết)"}
          </p>
          {props.googleEnabled && props.googleEmails.length === 0 && (
            <a href="/api/auth/google/start?mode=link"
              className="inline-flex items-center gap-1.5 mt-1 px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 font-semibold text-slate-700">
              <Link2 className="w-3.5 h-3.5" /> Liên kết Google
            </a>
          )}
        </div>

        <div className="border border-slate-200 rounded-2xl p-4 space-y-2">
          <p className="font-semibold text-slate-800">Phiên đăng nhập</p>
          <p className="text-slate-500">Nghi ngờ tài khoản bị lộ? Đăng xuất khỏi mọi trình duyệt và thiết bị đang đăng nhập.</p>
          <button type="button" onClick={logoutEverywhere} disabled={leaving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 font-semibold disabled:opacity-50">
            {leaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
            Đăng xuất mọi thiết bị
          </button>
        </div>
      </div>
    </div>
  );
}
