"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Share2, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/ToastContext";

interface Social {
  id: string;
  platform: "TIKTOK" | "FACEBOOK_PAGE";
  displayName: string;
  status: string;
  lastError: string | null;
}

const NOTICES: Record<string, [kind: "success" | "error" | "info", text: string]> = {
  connected: ["success", "Đã kết nối tài khoản mạng xã hội."],
  cancelled: ["info", "Đã huỷ kết nối."],
  state: ["error", "Phiên kết nối đã hết hạn, vui lòng thử lại."],
  scope: ["error", "Bạn chưa cấp quyền đăng video (video.publish). Hãy kết nối lại và đồng ý quyền đăng."],
  no_pages: ["error", "Tài khoản Facebook này không quản lý Page nào có quyền đăng bài."],
  failed: ["error", "Không kết nối được, vui lòng thử lại."],
  disabled: ["error", "Nền tảng này chưa được cấu hình trên máy chủ (thiếu client key/secret)."],
};

export const PLATFORM_LABEL: Record<string, string> = { TIKTOK: "TikTok", FACEBOOK_PAGE: "Facebook Page" };

export function SocialAccounts() {
  const { success, error, info } = useToast();
  const params = useSearchParams();
  const router = useRouter();
  const [accounts, setAccounts] = useState<Social[]>([]);
  const [enabled, setEnabled] = useState({ tiktok: false, facebook: false });
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/social", { cache: "no-store" });
    if (!r.ok) return;
    const d = await r.json();
    setAccounts(d.accounts);
    setEnabled(d.enabled);
  }, []);

  useEffect(() => {
    load();
    const n = NOTICES[params.get("social") || ""];
    if (n) {
      ({ success, error, info })[n[0]](n[1]);
      router.replace("/settings");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const disconnect = async (a: Social) => {
    if (!window.confirm(`Ngắt kết nối ${PLATFORM_LABEL[a.platform]} "${a.displayName}"? Kênh sẽ không tự đăng lên tài khoản này nữa.`)) return;
    setBusy(a.id);
    const res = await fetch(`/api/social/accounts/${a.id}`, { method: "DELETE" });
    const d = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return error(d.error || "Không ngắt được.");
    await load();
  };

  return (
    <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-sm space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-violet-100 text-violet-700 flex items-center justify-center">
            <Share2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Mạng xã hội ({accounts.length})</h3>
            <p className="text-xs text-slate-400">Tài khoản để đăng video. Token được mã hoá khi lưu.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <a href={enabled.tiktok ? "/api/social/tiktok/start" : undefined} aria-disabled={!enabled.tiktok} title={enabled.tiktok ? "" : "Cần TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET trong .env"}
            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl ${enabled.tiktok ? "bg-slate-900 text-white hover:bg-slate-800" : "bg-slate-100 text-slate-400 cursor-not-allowed"}`}>
            + TikTok
          </a>
          <a href={enabled.facebook ? "/api/social/facebook/start" : undefined} aria-disabled={!enabled.facebook} title={enabled.facebook ? "" : "Cần FACEBOOK_APP_ID / FACEBOOK_APP_SECRET trong .env"}
            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl ${enabled.facebook ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-slate-100 text-slate-400 cursor-not-allowed"}`}>
            + Facebook Page
          </a>
        </div>
      </div>

      {!enabled.tiktok && !enabled.facebook && (
        <p className="text-xs text-slate-500">Chưa cấu hình ứng dụng TikTok / Facebook trên máy chủ (xem mục "Đăng bài" trong .env.example).</p>
      )}
      {enabled.tiktok && (
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
          TikTok: ứng dụng chưa được TikTok duyệt (audit) chỉ đăng được video ở chế độ riêng tư (chỉ mình tôi). Video luôn được gắn nhãn "Nội dung do AI tạo".
        </p>
      )}

      {accounts.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {accounts.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{a.displayName}</p>
                <p className="text-[11px] text-slate-500">
                  {PLATFORM_LABEL[a.platform]} •{" "}
                  <span className={a.status === "CONNECTED" ? "text-emerald-700" : "text-rose-600"}>{a.status === "CONNECTED" ? "đã kết nối" : "cần kết nối lại"}</span>
                  {a.lastError && a.status !== "CONNECTED" ? ` — ${a.lastError}` : ""}
                </p>
              </div>
              <button type="button" onClick={() => disconnect(a)} disabled={busy === a.id} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl" title="Ngắt kết nối">
                {busy === a.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
