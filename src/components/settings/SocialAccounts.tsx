"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Copy, Loader2, Share2, Trash2 } from "lucide-react";
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
  origin: ["info", "Đã chuyển sang địa chỉ APP_URL: nền tảng chỉ trả kết quả về địa chỉ này. Đăng nhập (nếu cần) rồi bấm kết nối lại."],
};

interface Setup {
  appUrl: string;
  https: boolean;
  tiktok: { enabled: boolean; redirectUri: string };
  facebook: { enabled: boolean; redirectUri: string };
}

function CopyLine({ value }: { value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 max-w-full">
      <code className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 text-[11px] break-all">{value}</code>
      <button type="button" onClick={() => navigator.clipboard?.writeText(value)} className="p-1 text-slate-400 hover:text-slate-700 shrink-0" title="Sao chép">
        <Copy className="w-3 h-3" />
      </button>
    </span>
  );
}

/** Step-by-step setup for a platform that has no app credentials on the server yet. */
function SetupGuide({ setup }: { setup: Setup }) {
  const here = typeof window !== "undefined" ? window.location.origin : setup.appUrl;
  return (
    <div className="space-y-3 text-xs text-slate-600">
      {here !== setup.appUrl && (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
          Bạn đang mở web ở <b>{here}</b> nhưng APP_URL là <b>{setup.appUrl}</b>. Khi kết nối, hãy mở web qua APP_URL (nền tảng chỉ trả kết quả về địa chỉ đó).
        </p>
      )}
      {!setup.facebook.enabled && (
        <details className="rounded-2xl border border-slate-200 px-4 py-3" open={!setup.tiktok.enabled}>
          <summary className="font-semibold text-slate-800 cursor-pointer">Cài Facebook Page (làm được ngay trên localhost)</summary>
          <ol className="list-decimal pl-5 mt-2 space-y-1.5 leading-relaxed">
            <li>Vào <a className="text-blue-700 underline" href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer">developers.facebook.com/apps</a> → Create app → loại <b>Business</b> (hoặc use case &quot;Manage everything on your Page&quot;).</li>
            <li>Thêm sản phẩm <b>Facebook Login</b> → Settings → <i>Valid OAuth Redirect URIs</i>: <CopyLine value={setup.facebook.redirectUri} /></li>
            <li>App settings → Basic: lấy <b>App ID</b> và <b>App Secret</b>.</li>
            <li>Ở chế độ Development, chỉ tài khoản là admin/developer/tester của app mới kết nối được, và chỉ với Page bạn quản lý. Đủ để dùng cho Page của chính bạn, không cần App Review.</li>
            <li>Thêm vào <code>.env</code> rồi khởi động lại web và worker: <CopyLine value="FACEBOOK_APP_ID=" /> <CopyLine value="FACEBOOK_APP_SECRET=" /></li>
          </ol>
        </details>
      )}
      {!setup.tiktok.enabled && (
        <details className="rounded-2xl border border-slate-200 px-4 py-3">
          <summary className="font-semibold text-slate-800 cursor-pointer">Cài TikTok (cần địa chỉ HTTPS)</summary>
          <ol className="list-decimal pl-5 mt-2 space-y-1.5 leading-relaxed">
            {!setup.https && (
              <li>
                TikTok không nhận redirect <code>http://localhost</code>. Tạo một địa chỉ HTTPS cố định trỏ về máy bạn, ví dụ tên miền tĩnh miễn phí của ngrok (<code>ngrok http --url=&lt;tên&gt;.ngrok-free.app 3000</code>), rồi đặt <code>APP_URL=https://&lt;tên&gt;.ngrok-free.app</code> và mở web qua địa chỉ đó.
              </li>
            )}
            <li>Vào <a className="text-blue-700 underline" href="https://developers.tiktok.com/apps" target="_blank" rel="noopener noreferrer">developers.tiktok.com</a> → Manage apps → Connect an app (có thể dùng chế độ Sandbox để thử với tài khoản của bạn trước khi gửi duyệt).</li>
            <li>Thêm sản phẩm <b>Login Kit</b> và <b>Content Posting API</b> (bật <i>Direct Post</i>), scope <code>user.info.basic</code>, <code>video.publish</code>.</li>
            <li>Login Kit → Redirect URI (Web): <CopyLine value={setup.tiktok.redirectUri} />{!setup.https && <span className="text-rose-600"> (phải là https, đổi APP_URL trước)</span>}</li>
            <li>Lấy <b>Client key</b> và <b>Client secret</b>, thêm vào <code>.env</code> rồi khởi động lại web và worker: <CopyLine value="TIKTOK_CLIENT_KEY=" /> <CopyLine value="TIKTOK_CLIENT_SECRET=" /></li>
            <li>App chưa được TikTok audit chỉ đăng được video riêng tư (chỉ mình tôi); muốn đăng công khai cần gửi app đi duyệt.</li>
          </ol>
        </details>
      )}
    </div>
  );
}

export const PLATFORM_LABEL: Record<string, string> = { TIKTOK: "TikTok", FACEBOOK_PAGE: "Facebook Page" };

export function SocialAccounts() {
  const { success, error, info } = useToast();
  const params = useSearchParams();
  const router = useRouter();
  const [accounts, setAccounts] = useState<Social[]>([]);
  const [enabled, setEnabled] = useState({ tiktok: false, facebook: false });
  const [setup, setSetup] = useState<Setup | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/social", { cache: "no-store" });
    if (!r.ok) return;
    const d = await r.json();
    setAccounts(d.accounts);
    setEnabled(d.enabled);
    setSetup(d.setup ?? null);
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
          <a href={enabled.tiktok ? "/api/social/tiktok/start" : undefined} aria-disabled={!enabled.tiktok} title={enabled.tiktok ? "" : "Chưa cấu hình: xem hướng dẫn \"Cài TikTok\" bên dưới"}
            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl ${enabled.tiktok ? "bg-slate-900 text-white hover:bg-slate-800" : "bg-slate-100 text-slate-400 cursor-not-allowed"}`}>
            + TikTok
          </a>
          <a href={enabled.facebook ? "/api/social/facebook/start" : undefined} aria-disabled={!enabled.facebook} title={enabled.facebook ? "" : "Chưa cấu hình: xem hướng dẫn \"Cài Facebook Page\" bên dưới"}
            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl ${enabled.facebook ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-slate-100 text-slate-400 cursor-not-allowed"}`}>
            + Facebook Page
          </a>
        </div>
      </div>

      {setup && (!enabled.tiktok || !enabled.facebook) && <SetupGuide setup={setup} />}
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
